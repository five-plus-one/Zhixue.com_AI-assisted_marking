// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      1.8.0
// @description  智学网AI自动批改助手，支持多套试卷方案管理、自动绑定切换、自动检查更新、精准题号识别、未保存拦截、流式评分！
// @author       5plus1
// @match        https://www.zhixue.com/webmarking/*
// @match        https://*.zhixue.com/webmarking/*
// @icon         https://www.zhixue.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.ai.five-plus-one.com
// @connect      zhixue-sc.oss-cn-hangzhou.aliyuncs.com
// @connect      raw.githubusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

// ========== [Module: config.js] ==========
// ========== 全局配置 ==========
// 所有常量从这里读取，构建脚本 (build.js) 也会从这里提取版本号

const SCRIPT_CONFIG = {
    /** 当前脚本版本号，修改此处即可同步更新所有引用 */
    VERSION: '1.8.0',

    /** 远端原始脚本地址（用于检查更新） */
    UPDATE_CHECK_URL: 'https://raw.githubusercontent.com/five-plus-one/Zhixue.com_AI-assisted_marking/main/dist/zhixue_ai_marking.user.js',

    /** 更新检查间隔（毫秒），默认 24 小时 */
    UPDATE_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000,

    /** 默认 AI 端点 */
    DEFAULT_ENDPOINT: 'https://api.ai.five-plus-one.com/v1/chat/completions',

    /** 默认模型 */
    DEFAULT_MODEL: 'doubao-seed-1-8-251228',
};


// ========== [Module: preset.js] ==========
// ========== 全局配置方案管理器 ==========
const PresetManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-presets');
        if (saved) {
            this.data = JSON.parse(saved);
            this._migrateGradingMode();
        } else {
            let oldConfigStr = GM_getValue('ai-grading-config');
            let defaultCfg = oldConfigStr ? JSON.parse(oldConfigStr) : {
                provider: '5plus1', endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT, model: SCRIPT_CONFIG.DEFAULT_MODEL
            };
            this.data = {
                list: { "默认配置": defaultCfg },
                active: "默认配置",
                bindings: {}
            };
            this.save();
        }
    },
    _migrateGradingMode() {
        let changed = false;
        for (const name in this.data.list) {
            const cfg = this.data.list[name];
            if (cfg.unattendedMode !== undefined && cfg.gradingMode === undefined) {
                cfg.gradingMode = cfg.unattendedMode ? 'unattended' : 'normal';
                delete cfg.unattendedMode;
                changed = true;
            } else if (cfg.gradingMode === undefined) {
                cfg.gradingMode = 'normal';
                changed = true;
            }
        }
        if (changed) this.save();
    },
    save() {
        GM_setValue('ai-grading-presets', JSON.stringify(this.data));
    },
    getCurrentConfig() {
        return this.data.list[this.data.active] || {};
    },
    getTaskIdentifier() {
        const baseUrl = window.location.pathname + window.location.hash.split('&_t=')[0];
        let questionIdentifier = '';
        try {
            const exactElement = document.querySelector('#currentTopicIndex');
            if (exactElement && exactElement.textContent) {
                questionIdentifier = exactElement.textContent.trim();
            } else {
                const titleElement = document.querySelector('.topic-title');
                if (titleElement) {
                    questionIdentifier = titleElement.getAttribute('title') || titleElement.textContent.trim();
                }
            }
        } catch (e) {}
        return baseUrl + (questionIdentifier ? '___' + questionIdentifier : '');
    }
};
PresetManager.init();


// ========== [Module: ui-button.js] ==========
// ========== 全局状态 ==========
window.aiGradingState = {
    isRunning: false, isPaused: false, currentStudentAnswer: '', currentImageUrls: [],
    currentBase64DataArray: [],
    abortController: null, countdownPaused: false, autoRefreshOn403: true,
    gradingMode: 'normal', errorRetryCount: 0, maxRetries: 3,
    hasUnsavedChanges: false, isRegrading: false
};

function safeAlert(message) {
    if (window.aiGradingState.gradingMode === 'unattended') {
        console.log('📢 [静默提示]', message);
    } else {
        showToast(message);
    }
}

// ========== 创建主按钮 ==========
function createMainButton() {
    if (document.querySelector('.ai-grade-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'ai-grade-btn';
    btn.innerHTML = 'AI 批改';
    btn.onclick = toggleAutoGrading;

    const style = document.createElement('style');
    style.textContent = `
        .ai-grade-btn { 
            position: fixed; bottom: 40px; right: 40px; z-index: 99999 !important; 
            padding: 14px 32px; 
            background: rgba(20, 20, 20, 0.85); 
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            color: #fff; 
            border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 40px; 
            font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif; 
            font-size: 15px; font-weight: 500; letter-spacing: 0.5px;
            cursor: pointer; 
            box-shadow: 0 12px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.05); 
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); 
            min-width: 140px;
        }
        .ai-grade-btn:hover { 
            transform: translateY(-2px) scale(1.02); 
            box-shadow: 0 16px 40px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1); 
            background: rgba(0, 0, 0, 0.95);
        }
        .ai-grade-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .ai-grade-btn.paused { border-color: rgba(230, 162, 60, 0.5); background: rgba(30,30,30,0.9); }
        .ai-grade-btn.running { border-color: rgba(64, 158, 255, 0.5); }
        .ai-grade-btn.unattended { border-color: rgba(245, 108, 108, 0.5); }
        .ai-grade-btn.trial { border-color: rgba(124, 58, 237, 0.5); }
        .ai-grade-btn.needs-save { background: rgba(245, 108, 108, 0.05) !important; color: #D93025; border-color: rgba(217, 48, 37, 0.2); box-shadow: none !important; }
        
        .toast-notification { 
            position: fixed; top: 32px; left: 50%; transform: translate(-50%, -10px); 
            background: rgba(255,255,255,0.95); 
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            color: #1a1a1a; 
            padding: 12px 24px; 
            border-radius: 12px; 
            border: 1px solid rgba(0,0,0,0.06);
            box-shadow: 0 8px 24px rgba(0,0,0,0.08);
            z-index: 100000; 
            font-family: -apple-system, BlinkMacSystemFont, "Inter", "SF Pro Display", sans-serif;
            font-size: 13px; font-weight: 500;
            transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); 
            pointer-events: none; opacity: 0;
        }
        .toast-notification.show { opacity: 1; transform: translate(-50%, 0); }
    `;
    document.head.appendChild(style);
    document.body.appendChild(btn);
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg; 
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
}

// ========== 通用模态对话框 ==========
function ensureModalStyles() {
    if (document.getElementById('ai-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-modal-styles';
    style.textContent = `
        .ai-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.3); backdrop-filter: blur(8px);
            z-index: 999998; animation: ai-modal-fadein 0.3s ease-out;
            display: flex; justify-content: center; align-items: center;
        }
        @keyframes ai-modal-fadein { from { opacity: 0; } to { opacity: 1; } }
        .ai-modal-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(32px) saturate(180%);
            -webkit-backdrop-filter: blur(32px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
            min-width: 360px; max-width: 480px; width: 90vw;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            animation: ai-modal-scalein 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
        }
        @keyframes ai-modal-scalein { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .ai-modal-header {
            padding: 24px 28px 0;
            font-size: 16px; font-weight: 600; color: #1d1d1f;
        }
        .ai-modal-body {
            padding: 16px 28px 24px;
            font-size: 14px; color: #4a4a4a; line-height: 1.6;
        }
        .ai-modal-body .ai-modal-input {
            width: 100%; padding: 10px 12px; margin-top: 12px;
            background: rgba(0,0,0,0.02);
            border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
            font-family: inherit; font-size: 14px; color: #1a1a1a;
            box-sizing: border-box; transition: all 0.2s;
        }
        .ai-modal-body .ai-modal-input:focus {
            outline: none; border-color: #0052FF; background: #fff;
            box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.1);
        }
        .ai-modal-footer {
            padding: 0 28px 24px;
            display: flex; justify-content: flex-end; gap: 12px;
        }
        .ai-modal-footer button {
            padding: 10px 24px; border: none; border-radius: 10px;
            font-size: 14px; font-weight: 500; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-modal-btn-cancel {
            background: rgba(0,0,0,0.05); color: #1d1d1f;
        }
        .ai-modal-btn-cancel:hover { background: rgba(0,0,0,0.09); }
        .ai-modal-btn-confirm {
            background: #1d1d1f; color: white;
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .ai-modal-btn-confirm:hover {
            background: #000; transform: translateY(-1px);
            box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        }
    `;
    document.head.appendChild(style);
}

function showAlertModal(message) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">${message}</div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = () => { if (closed) return; closed = true; overlay.remove(); resolve(); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(); };
        overlay.onclick = e => { if (e.target === overlay) close(); };
    });
}

function showConfirmModal(message) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">${message}</div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel">取消</button>
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('.ai-modal-btn-cancel').onclick = e => { e.stopPropagation(); close(false); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(true); };
        overlay.onclick = e => { if (e.target === overlay) close(false); };
    });
}

function showPromptModal(message, defaultValue) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">
                    ${message}
                    <input class="ai-modal-input" type="text" value="${defaultValue || ''}">
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel">取消</button>
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.ai-modal-input');
        input.focus();
        input.select();
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('.ai-modal-btn-cancel').onclick = e => { e.stopPropagation(); close(null); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(input.value); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') close(input.value); if (e.key === 'Escape') close(null); });
        overlay.onclick = e => { if (e.target === overlay) close(null); };
    });
}

// ========== 未保存状态管理 ==========
function markUnsavedChanges() {
    if (!window.aiGradingState.hasUnsavedChanges) {
        window.aiGradingState.hasUnsavedChanges = true;

        const btn = document.querySelector('.ai-grade-btn');
        if (btn && !window.aiGradingState.isRunning) {
            btn.textContent = '先保存配置';
            btn.classList.add('needs-save');
        }

        const saveBtn = document.getElementById('save-config-btn');
        if (saveBtn) {
            saveBtn.classList.add('highlight-save');
            saveBtn.innerHTML = '保存修改 <span style="font-size:11px;opacity:0.6;font-weight:normal;margin-left:6px;">未保存</span>';
        }
    }
}

function clearUnsavedChanges() {
    window.aiGradingState.hasUnsavedChanges = false;

    const btn = document.querySelector('.ai-grade-btn');
    if (btn && !window.aiGradingState.isRunning) {
        btn.textContent = 'AI 批改';
        btn.classList.remove('needs-save');
    }

    const saveBtn = document.getElementById('save-config-btn');
    if (saveBtn) {
        saveBtn.classList.remove('highlight-save');
        saveBtn.innerHTML = '保存并启用';
    }
}

// ========== 主按钮点击逻辑 ==========
function toggleAutoGrading() {
    const btn = document.querySelector('.ai-grade-btn');
    btn.disabled = true;
    setTimeout(() => btn.disabled = false, 800);

    if (window.aiGradingState.hasUnsavedChanges) {
        safeAlert('配置已修改，请先点击配置面板上的【保存】按钮。');
        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.style.display = 'block';
            panel.classList.remove('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) minimizeBtn.textContent = '−';
            const saveBtn = document.getElementById('save-config-btn');
            if (saveBtn) {
                saveBtn.style.transform = 'scale(1.02)';
                setTimeout(() => saveBtn.style.transform = 'scale(1)', 200);
            }
        }
        return;
    }

    if (window.aiGradingState.isRunning) {
        window.aiGradingState.isPaused = true;
        window.aiGradingState.isRunning = false;
        if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();

        btn.textContent = '继续批改';
        btn.classList.remove('running', 'unattended');
        btn.classList.add('paused');

        const dialog = document.getElementById('auto-submit-dialog');
        if (dialog) dialog.remove();
        hideStreamPanel();
    } else {
        window.aiGradingState.isRunning = true;
        window.aiGradingState.isPaused = false;
        window.aiGradingState.errorRetryCount = 0;

        const config = PresetManager.getCurrentConfig();
        window.aiGradingState.gradingMode = config.gradingMode || 'normal';

        btn.classList.remove('paused', 'unattended', 'trial');
        btn.classList.add('running');
        if (window.aiGradingState.gradingMode === 'unattended') {
            btn.textContent = '自动批改中…';
            btn.classList.add('unattended');
        } else if (window.aiGradingState.gradingMode === 'trial') {
            btn.textContent = '试改中…';
            btn.classList.add('trial');
        } else {
            btn.textContent = '暂停';
        }

        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.classList.add('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) minimizeBtn.textContent = '+';
        }
        startAutoGrading();
    }
}

// ========== 流式面板 UI ==========
function showStreamPanel() {
    let panel = document.getElementById('ai-stream-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ai-stream-panel';
        panel.innerHTML = `
            <style>
                #ai-stream-panel { 
                    position: fixed; bottom: 100px; right: 40px; width: 340px; 
                    background: rgba(255, 255, 255, 0.85); 
                    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                    border-radius: 12px; 
                    box-shadow: 0 16px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.03); 
                    padding: 18px; z-index: 99998; 
                    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif; 
                    border: 1px solid rgba(0,0,0,0.06);
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    transform: translateY(10px); opacity: 0;
                }
                #ai-stream-panel.show { transform: translateY(0); opacity: 1; }
                #ai-stream-panel h4 { 
                    margin: 0 0 12px 0; color: #1a1a1a; font-size: 11px; font-weight: 600; 
                    display: flex; align-items: center; letter-spacing: 0.5px; text-transform: uppercase;
                }
                #ai-stream-panel .pulse-dot {
                    width: 6px; height: 6px; border-radius: 50%; background: #000; margin-right: 8px;
                    box-shadow: 0 0 0 rgba(0,0,0,0.2); animation: pulse-dot-minimal 2s infinite;
                }
                @keyframes pulse-dot-minimal { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); } 70% { box-shadow: 0 0 0 5px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
                #ai-stream-content { 
                    font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
                    font-size: 12px; color: #4a4a4a; line-height: 1.6; 
                    max-height: 220px; overflow-y: auto; white-space: pre-wrap; 
                    scrollbar-width: thin;
                }
            </style>
            <h4><span class="pulse-dot"></span> AI 分析流输出</h4>
            <div id="ai-stream-content">正在感知和组装上下文...</div>
        `;
        document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    requestAnimationFrame(() => panel.classList.add('show'));
    panel.querySelector('#ai-stream-content').textContent = '正在感知和组装上下文...';
}

function updateStreamPanel(text) {
    const content = document.getElementById('ai-stream-content');
    if (content) {
        content.textContent = text;
        content.scrollTop = content.scrollHeight;
    }
}

function hideStreamPanel() {
    const panel = document.getElementById('ai-stream-panel');
    if (panel) {
        panel.classList.remove('show');
        setTimeout(() => panel.style.display = 'none', 300);
    }
}

// ========== 停止打分 ==========
function stopAutoGrading() {
    window.aiGradingState.isRunning = false;
    window.aiGradingState.isPaused = false;
    window.aiGradingState.gradingMode = 'normal';
    window.aiGradingState.errorRetryCount = 0;
    if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();

    const btn = document.querySelector('.ai-grade-btn');
    if (btn) { btn.textContent = 'AI 批改'; btn.classList.remove('running', 'paused', 'unattended', 'trial'); }
    const dialog = document.getElementById('auto-submit-dialog');
    if (dialog) dialog.remove();
    hideStreamPanel();

    if (window.aiGradingState.hasUnsavedChanges) markUnsavedChanges();
}

// ========== 填充分数及弹窗 ==========
function fillScore(score, comment) {
    const allInputs = document.querySelectorAll('input');
    console.log(`🔎 [诊断] fillScore 调用 — 分数: ${score}, 页面上所有input数量: ${allInputs.length}`);
    console.log(`🔎 [诊断] 各input类型: ${Array.from(allInputs).map(i => `type=${i.type} placeholder=${i.placeholder} name=${i.name}`).join(' | ')}`);

    const scoreInput = document.querySelector('input[type="number"]') ||
                       document.querySelector('input[placeholder*="分"]') ||
                       Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('分') || i.name?.includes('score'));

    if (scoreInput) {
        console.log(`✅ [诊断] 找到分数输入框: type=${scoreInput.type} placeholder=${scoreInput.placeholder} name=${scoreInput.name}`);
        scoreInput.value = score;
        scoreInput.focus();
        scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
        scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
        scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
        console.log(`✅ [诊断] 分数已填入，准备弹出确认窗口...`);
        showAutoSubmitDialog(score, comment);
    } else {
        console.warn('⚠️ [诊断] 未找到分数输入框，将直接弹出确认窗口');
        safeAlert(`AI打分结果：\n分数：${score}\n请手动输入分数！`);
        showAutoSubmitDialog(score, comment);
    }
}

function showAutoSubmitDialog(score, comment) {
    const oldDialog = document.getElementById('auto-submit-dialog');
    if (oldDialog) oldDialog.remove();

    const mode = window.aiGradingState.gradingMode;
    console.log(`🪟 [诊断] showAutoSubmitDialog 调用 — 分数: ${score}, 模式: ${mode}`);

    window.aiGradingState.countdownPaused = false;
    const studentAnswer = window.aiGradingState.currentStudentAnswer;
    const imageUrls = window.aiGradingState.currentImageUrls || [];
    const isUnattended = mode === 'unattended';
    const isTrial = mode === 'trial';
    const countdownSeconds = isUnattended ? 1 : 5;
    const showCountdown = !isTrial;
    const showCorrectionBtn = !isUnattended; // 普通模式和试改模式显示"分数有误"

    const headerLabel = isTrial ? '试改确认' : '批改完成';
    const modeTag = isUnattended ? '<span style="color:#888;font-weight:normal;font-size:13px;margin-left:8px;">[自动模式]</span>'
                   : isTrial ? '<span style="color:#7c3aed;font-weight:normal;font-size:13px;margin-left:8px;">[试改模式]</span>' : '';

    const imagesHtml = imageUrls.map(url => `<img src="${url}" style="width: 100%; height: auto; display: block; border-bottom: 2px dashed #DCDFE6; margin-bottom: -2px;">`).join('');

    const correctionBtnHtml = showCorrectionBtn
        ? `<button class="cancel-btn" id="correction-btn" style="color:#D93025;border:1px solid rgba(217,48,37,0.2);background:rgba(217,48,37,0.04);">分数有误</button>` : '';
    const pauseBtnHtml = isTrial ? '' : `<button class="cancel-btn" id="pause-cancel-btn">暂停</button>`;
    const confirmLabel = isTrial ? '确认提交' : '立即提交';
    const countdownHtml = showCountdown
        ? `<div class="countdown-text" id="countdown-display">自动跳转提交 <span id="countdown-number">${countdownSeconds}</span>秒</div>`
        : `<div class="countdown-text" id="countdown-display" style="color:#7c3aed;">等待教师确认</div>`;

    const dialog = document.createElement('div');
    dialog.id = 'auto-submit-dialog';
    dialog.innerHTML = `
        <style>
            #auto-submit-dialog {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999;
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(32px) saturate(180%);
                -webkit-backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.6);
                border-radius: 24px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                width: 900px; max-width: 94vw; max-height: 90vh; overflow: hidden;
                display: flex; flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            }
            .dialog-header { margin: 0; padding: 24px 36px; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 16px; font-weight: 600; color: #1d1d1f; display: flex; justify-content: space-between; align-items: center; background: transparent; }
            .content-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; overflow: hidden; flex: 1; background: transparent; }
            .student-image { border-right: 1px solid rgba(0,0,0,0.06); overflow-y: auto; background: rgba(255,255,255,0.4); padding: 36px; max-height: 550px; }
            .student-image img { border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.04); }
            .result-section { padding: 36px; overflow-y: auto; display: flex; flex-direction: column; gap: 28px; max-height: 550px; background: transparent; }
            .info-block { display: flex; flex-direction: column; gap: 10px; }
            .info-block-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: #86868b; font-weight: 600; }
            .info-block-content { font-size: 14px; color: #1d1d1f; line-height: 1.6; white-space: pre-wrap; font-family: "SF Mono", "JetBrains Mono", Consolas, monospace; background: rgba(255,255,255,0.6); padding: 18px; border-radius: 14px; border: 1px solid rgba(0,0,0,0.04); box-shadow: inset 0 1px 3px rgba(0,0,0,0.01); }
            .score-display { font-size: 76px; font-weight: 700; color: #1d1d1f; font-family: "SF Pro Display", -apple-system, sans-serif; line-height: 1; text-shadow: 0 4px 16px rgba(0,0,0,0.06); letter-spacing: -2px; }
            .dialog-footer { padding: 24px 36px; border-top: 1px solid rgba(0,0,0,0.06); background: rgba(255,255,255,0.3); display: flex; justify-content: space-between; align-items: center; }
            .countdown-text { font-size: 13px; color: #86868b; font-weight: 500; font-family: "SF Mono", monospace; background: rgba(0,0,0,0.05); padding: 8px 16px; border-radius: 20px; }
            .buttons { display: flex; gap: 16px; }
            .buttons button { padding: 12px 32px; border: none; border-radius: 12px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
            .cancel-btn { background: rgba(0,0,0,0.05); color: #1d1d1f; backdrop-filter: blur(10px); }
            .cancel-btn:hover { background: rgba(0,0,0,0.09); }
            .confirm-btn { background: #1d1d1f; color: white; box-shadow: 0 8px 20px rgba(0,0,0,0.15); }
            .confirm-btn:hover { background: #000; transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,0.22); }
            .overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); backdrop-filter: blur(8px); z-index: -1; animation: fadein 0.4s ease-out; }
            @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }
        </style>
        <div class="overlay"></div>
        <div class="dialog-header">
            <span>${headerLabel} ${modeTag}</span>
        </div>
        <div class="content-grid">
            <div class="student-image">${imagesHtml}</div>
            <div class="result-section">
                <div class="info-block"><div class="info-block-label">最终得分</div><div class="score-display">${score}</div></div>
                <div class="info-block"><div class="info-block-label">识别答案</div><div class="info-block-content">${studentAnswer}</div></div>
                <div class="info-block"><div class="info-block-label">重塑批语</div><div class="info-block-content">${comment}</div></div>
            </div>
        </div>
        <div class="dialog-footer">
            ${countdownHtml}
            <div class="buttons">
                ${correctionBtnHtml}
                ${pauseBtnHtml}
                <button class="confirm-btn" id="confirm-submit-btn">${confirmLabel}</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // "分数有误" 按钮 — 打开纠错流程
    if (showCorrectionBtn) {
        dialog.querySelector('#correction-btn').addEventListener('click', () => {
            if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
            dialog.remove();
            showCorrectionPanel({
                score, comment, studentAnswer, imageUrls,
                base64DataArray: window.aiGradingState.currentBase64DataArray || [],
                config: PresetManager.getCurrentConfig(),
                onAccept(finalScore, correctionInfo) {
                    HistoryManager.add({
                        presetName: PresetManager.data.active,
                        gradingMode: mode,
                        imageUrls, studentAnswer,
                        aiScore: score, aiComment: comment,
                        finalScore, isCorrected: correctionInfo.isCorrected,
                        correctionReason: correctionInfo.correctionReason
                    });
                    fillScore(finalScore, comment);
                },
                onCancel() {
                    // 纠错取消，重新弹出原对话框
                    showAutoSubmitDialog(score, comment);
                }
            });
        });
    }

    // "暂停" 按钮（试改模式不显示）
    if (!isTrial) {
        dialog.querySelector('#pause-cancel-btn').addEventListener('click', () => {
            if (!window.aiGradingState.countdownPaused) {
                window.aiGradingState.countdownPaused = true;
                dialog.querySelector('#pause-cancel-btn').textContent = '撤销并退出';
                dialog.querySelector('#countdown-display').innerHTML = '已暂停';
            } else {
                if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
                dialog.remove();
                stopAutoGrading();
            }
        });
    }

    const confirmSubmitFn = () => {
        if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
        dialog.remove();

        // 记录评阅历史
        HistoryManager.add({
            presetName: PresetManager.data.active,
            gradingMode: mode,
            imageUrls, studentAnswer,
            aiScore: score, aiComment: comment,
            finalScore: score, isCorrected: false, correctionReason: ''
        });

        const allBtns = Array.from(document.querySelectorAll('button'));
        console.log(`🔎 [诊断] confirmSubmitFn 执行 — 页面按钮总数: ${allBtns.length}，文字列表: ${allBtns.map(b => b.textContent.trim()).filter(t => t).join(' | ')}`);
        const submitBtn = allBtns.find(btn => btn.textContent.includes('提交分数'));
        if (submitBtn) {
            console.log(`✅ [诊断] 找到"提交分数"按钮，准备点击`);
            submitBtn.click();

            if (window.aiGradingState.isRunning && !window.aiGradingState.isPaused) {
                console.log('⏳ 已点击提交，正在等待智学网加载下一份试卷...');
                const oldImgUrl = window.aiGradingState.currentImageUrls[0];
                let checkTimes = 0;

                const checkNextTimer = setInterval(() => {
                    checkTimes++;
                    const currentImg = document.querySelector('div[name="topicImg"] img');

                    if (currentImg && currentImg.src !== oldImgUrl) {
                        clearInterval(checkNextTimer);
                        console.log('✅ 新试卷已加载完毕！继续批改...');
                        setTimeout(startAutoGrading, 500);
                    } else if (checkTimes > 50) {
                        clearInterval(checkNextTimer);
                        console.warn('⚠️ 等待下一份试卷超时');
                        stopAutoGrading();
                        safeAlert('⚠️ 加载下一份试卷超时，已自动停止，请手动检查网络。');
                    }
                }, 200);
            } else {
                window.aiGradingState.isRunning = false;
            }
        } else {
            console.warn(`⚠️ [诊断] 未找到"提交分数"按钮，无法自动提交`);
            safeAlert('✅ 分数已填，但未找到页面的"提交分数"按钮');
            if (mode === 'unattended') stopAutoGrading();
        }
    };

    dialog.querySelector('#confirm-submit-btn').addEventListener('click', confirmSubmitFn);

    // 试改模式不启动倒计时
    if (showCountdown) {
        let countdown = countdownSeconds;
        dialog.countdownTimer = setInterval(() => {
            if (window.aiGradingState.countdownPaused) return;
            countdown--;
            const span = dialog.querySelector('#countdown-number');
            if (span) span.textContent = countdown;
            if (countdown <= 0) confirmSubmitFn();
        }, 1000);
    }
}


// ========== [Module: ui-panel.js] ==========
// ========== 创建配置面板 ==========
function createSettingsPanel() {
    if (document.getElementById('ai-grading-settings')) return;
    const panel = document.createElement('div');
    panel.id = 'ai-grading-settings';
    panel.innerHTML = `
        <style>
            #ai-grading-settings { 
                position: fixed; top: 20px; right: 20px; width: 420px; max-height: 90vh; overflow-y: auto; 
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 16px; 
                box-shadow: 0 16px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04); 
                z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s;
            }
            #ai-grading-settings.minimized .settings-body { display: none; }
            #ai-grading-settings.minimized { width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
            .settings-header { 
                background: transparent; color: #1a1a1a; padding: 20px 24px 16px; 
                display: flex; justify-content: space-between; align-items: center; cursor: move;
                border-bottom: 1px solid rgba(0,0,0,0.06);
            }
            .settings-header h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
            .header-buttons { display: flex; gap: 8px; }
            .header-btn { 
                background: transparent; border: 1px solid rgba(0,0,0,0.1); color: #666; 
                width: 26px; height: 26px; border-radius: 6px; cursor: pointer; transition: all 0.2s;
                display: flex; justify-content: center; align-items: center; font-size: 14px;
            }
            .header-btn:hover { background: rgba(0,0,0,0.04); color: #1a1a1a; }
            .settings-body { padding: 0; position: relative; }
            .form-section { padding: 20px 24px; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .form-section:last-child { border-bottom: none; }
            .form-section.highlight { background: rgba(0, 82, 255, 0.02); }
            .form-section h4 { 
                color: #1a1a1a; font-size: 13px; font-weight: 600; margin: 0 0 16px 0; 
                text-transform: uppercase; letter-spacing: 0.5px; 
            }
            .form-group { margin-bottom: 16px; }
            .form-group:last-child { margin-bottom: 0; }
            .form-group label { display: block; margin-bottom: 8px; color: #666; font-size: 12px; font-weight: 500; }
            .form-group input, .form-group select, .form-group textarea { 
                width: 100%; padding: 10px 12px; 
                background: rgba(0,0,0,0.02);
                border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; 
                font-family: inherit; font-size: 13px; color: #1a1a1a; transition: all 0.2s;
            }
            .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
                outline: none; border-color: #0052FF; background: #fff; box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.1);
            }
            .form-group textarea { min-height: 80px; resize: vertical; }
            .checkbox-group { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .checkbox-group input[type="checkbox"] { accent-color: #0052FF; width: 16px; height: 16px; }
            .checkbox-group label { margin: 0; font-size: 13px; color: #1a1a1a; font-weight: 500; }
            .preset-controls { display: flex; gap: 8px; margin-bottom: 16px; }
            .preset-controls select { 
                flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1); 
                background: #fdfdfd; font-size: 13px;
            }
            .preset-btn { 
                background: transparent; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; 
                padding: 0 12px; cursor: pointer; font-size: 12px; font-weight: 500; color: #444; transition: all 0.2s;
            }
            .preset-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }
            .preset-btn.danger:hover { color: #D93025; border-color: rgba(217,48,37,0.3); background: rgba(217,48,37,0.04); }
            .unattended-warning {
                background: rgba(245, 108, 108, 0.05); border-left: 3px solid #F56C6C; border-radius: 0 6px 6px 0;
                padding: 10px 14px; font-size: 12px; color: #D93025; line-height: 1.5; margin-top: 8px;
            }
            .mode-segmented {
                display: flex; gap: 0; background: rgba(0,0,0,0.04); border-radius: 10px; padding: 3px; position: relative;
            }
            .mode-segmented input[type="radio"] { display: none; }
            .mode-segmented label {
                flex: 1; text-align: center; padding: 10px 0; font-size: 13px; font-weight: 500;
                color: #666; cursor: pointer; border-radius: 8px; transition: all 0.25s; position: relative; z-index: 1;
            }
            .mode-segmented input[type="radio"]:checked + label {
                background: #1d1d1f; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            }
            .mode-segmented input[value="trial"]:checked + label { background: #7c3aed; }
            .mode-segmented input[value="unattended"]:checked + label { background: #D93025; }
            .mode-desc {
                font-size: 12px; color: #86868b; line-height: 1.5; margin-top: 10px; min-height: 36px;
            }
            .mode-desc.trial-desc { color: #7c3aed; }
            .mode-desc.unattended-desc { color: #D93025; }
            .history-btn {
                width: 100%; padding: 10px; background: transparent; color: #666;
                border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
                font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;
                display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .history-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }
            .api-key-link { display: inline-block; margin-top: 8px; font-size: 12px; color: #0052FF; text-decoration: none; font-weight: 500; }
            .api-key-link:hover { text-decoration: underline; }
            .save-btn-container { 
                position: sticky; top: 0; z-index: 10;
                background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); 
                padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.06); 
                box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            }
            .save-btn { 
                width: 100%; padding: 12px; background: #1a1a1a; color: white; border: none; 
                border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
            }
            .save-btn:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .save-btn.highlight-save { background: #D93025; color: white; }
            .save-btn.highlight-save:hover { background: #B3261E; }
        </style>
        <div class="settings-header">
            <h3>批改配置</h3>
            <div class="header-buttons">
                <button class="header-btn minimize-btn" title="Toggle">−</button>
                <button class="header-btn close-btn" title="Close">×</button>
            </div>
        </div>
        <div class="settings-body">
            <div class="save-btn-container">
                <button class="save-btn" id="save-config-btn">保存并启用</button>
            </div>

            <div class="form-section highlight">
                <h4>场景方案</h4>
                <div class="preset-controls">
                    <select id="preset-select"></select>
                    <button class="preset-btn" id="btn-new-preset">新建</button>
                    <button class="preset-btn danger" id="btn-del-preset">删除</button>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="bind-url-checkbox">
                    <label for="bind-url-checkbox">绑定至当前试题</label>
                </div>
            </div>

            <div class="form-section">
                <h4>运行模式</h4>
                <div class="mode-segmented">
                    <input type="radio" name="grading-mode" value="normal" id="mode-normal">
                    <label for="mode-normal">普通模式</label>
                    <input type="radio" name="grading-mode" value="trial" id="mode-trial">
                    <label for="mode-trial">试改模式</label>
                    <input type="radio" name="grading-mode" value="unattended" id="mode-unattended">
                    <label for="mode-unattended">无人模式</label>
                </div>
                <div class="mode-desc" id="mode-desc">每批改一份，等待教师确认后提交。</div>
            </div>
            <div class="form-section">
                <h4>批改上下文</h4>
                <div class="form-group"><label>题目内容</label><textarea id="question-content"></textarea></div>
                <div class="form-group"><label>参考答案</label><textarea id="standard-answer"></textarea></div>
                <div class="form-group"><label>采分标准</label><textarea id="grading-rubric"></textarea></div>
            </div>
            <div class="form-section">
                <h4>AI 模型与算力</h4>
                <div class="form-group">
                    <label>服务提供商</label>
                    <select id="ai-provider">
                        <option value="5plus1">5+1 官方节点 (推荐)</option>
                        <option value="openai">自定义代理</option>
                    </select>
                    <div id="api-key-link-container" style="display:none;"><a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">获取访问凭证</a></div>
                </div>
                <div class="form-group"><label>服务网关 URL</label><input type="text" id="api-endpoint"></div>
                <div class="form-group"><label>通信密钥 (Token) *</label><input type="password" id="api-key"></div>
                <div class="form-group"><label>调用模型 ID</label><input type="text" id="model-name"></div>
            </div>
            <div class="form-section" style="padding-bottom:20px;">
                <button class="history-btn" id="btn-history">评阅历史</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('.minimize-btn').onclick = function() {
        panel.classList.toggle('minimized');
        this.textContent = panel.classList.contains('minimized') ? '+' : '−';
    };
    panel.querySelector('.close-btn').onclick = () => panel.style.display = 'none';

    panel.querySelector('#btn-new-preset').onclick = handleNewPreset;
    panel.querySelector('#btn-del-preset').onclick = handleDeletePreset;
    panel.querySelector('#preset-select').onchange = handlePresetChange;
    panel.querySelector('#save-config-btn').onclick = saveAISettings;
    panel.querySelector('#btn-history').onclick = () => showHistoryPanel();

    const modeDescs = {
        normal: '每批改一份，5秒自动提交或手动确认。支持分数纠错。',
        trial: '试改模式：每次批改后暂停，教师确认分数后才提交。支持分数纠错和提示词优化。',
        unattended: '无人值守：错误时自动重试，静默运行，分析完成后1秒自动跳转提交。'
    };
    const modeDescClasses = { normal: '', trial: 'trial-desc', unattended: 'unattended-desc' };
    panel.querySelectorAll('input[name="grading-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const desc = panel.querySelector('#mode-desc');
            desc.textContent = modeDescs[this.value];
            desc.className = 'mode-desc ' + (modeDescClasses[this.value] || '');
            markUnsavedChanges();
        });
    });

    const inputs = panel.querySelectorAll('input:not([name="grading-mode"]), textarea, select:not(#preset-select)');
    inputs.forEach(input => {
        input.addEventListener('input', markUnsavedChanges);
        input.addEventListener('change', markUnsavedChanges);
    });

    makeDraggable(panel);
    loadSettings();
}

function makeDraggable(element) {
    const header = element.querySelector('.settings-header');
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    header.onmousedown = (e) => {
        e.preventDefault();
        pos3 = e.clientX; pos4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
        };
    };
}

// ========== 加载与切换方案 ==========
function loadSettings() {
    const currentUrlId = PresetManager.getTaskIdentifier();

    if (PresetManager.data.bindings[currentUrlId] && PresetManager.data.list[PresetManager.data.bindings[currentUrlId]]) {
        PresetManager.data.active = PresetManager.data.bindings[currentUrlId];
        PresetManager.save();
    } else if (PresetManager.data.active !== "默认配置" && PresetManager.data.list["默认配置"]) {
        PresetManager.data.active = "默认配置";
        PresetManager.save();
    }

    renderPresetDropdown();
    fillFormFromActivePreset();
}

function renderPresetDropdown() {
    const select = document.getElementById('preset-select');
    select.innerHTML = '';
    for (const name in PresetManager.data.list) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    select.value = PresetManager.data.active;
}

function fillFormFromActivePreset() {
    const config = PresetManager.getCurrentConfig();
    const currentUrlId = PresetManager.getTaskIdentifier();

    document.getElementById('question-content').value = config.question || '';
    document.getElementById('standard-answer').value = config.answer || '';
    document.getElementById('grading-rubric').value = config.rubric || '';
    document.getElementById('ai-provider').value = config.provider || '5plus1';
    document.getElementById('api-endpoint').value = config.endpoint || SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    document.getElementById('api-key').value = config.apiKey || '';
    document.getElementById('model-name').value = config.model || SCRIPT_CONFIG.DEFAULT_MODEL;

    const gradingMode = config.gradingMode || 'normal';
    const modeRadio = document.querySelector(`input[name="grading-mode"][value="${gradingMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    const modeDescs = {
        normal: '每批改一份，5秒自动提交或手动确认。支持分数纠错。',
        trial: '试改模式：每次批改后暂停，教师确认分数后才提交。支持分数纠错和提示词优化。',
        unattended: '无人值守：错误时自动重试，静默运行，分析完成后1秒自动跳转提交。'
    };
    const modeDescClasses = { normal: '', trial: 'trial-desc', unattended: 'unattended-desc' };
    const desc = document.getElementById('mode-desc');
    if (desc) { desc.textContent = modeDescs[gradingMode]; desc.className = 'mode-desc ' + (modeDescClasses[gradingMode] || ''); }

    document.getElementById('bind-url-checkbox').checked = (PresetManager.data.bindings[currentUrlId] === PresetManager.data.active);

    updateUIVisibility();
    clearUnsavedChanges();
}

function updateUIVisibility() {
    const provider = document.getElementById('ai-provider').value;
    document.getElementById('api-key-link-container').style.display = provider === '5plus1' ? 'block' : 'none';
}

// ========== 方案操作功能 ==========
function handlePresetChange() {
    PresetManager.data.active = document.getElementById('preset-select').value;
    PresetManager.save();
    fillFormFromActivePreset();
}

async function handleNewPreset() {
    const name = await showPromptModal("请输入新的配置方案名称 (例如: 语文作文)：");
    if (!name || !name.trim()) return;
    if (PresetManager.data.list[name]) {
        showAlertModal("该方案名称已存在！");
        return;
    }
    PresetManager.data.list[name] = { ...PresetManager.getCurrentConfig() };
    PresetManager.data.active = name;
    PresetManager.save();
    renderPresetDropdown();
    fillFormFromActivePreset();
    showToast(`新方案「${name}」创建成功`);
}

async function handleDeletePreset() {
    const name = PresetManager.data.active;
    if (Object.keys(PresetManager.data.list).length <= 1) {
        showAlertModal("必须至少保留一个配置方案！");
        return;
    }
    if (await showConfirmModal(`确定要删除配置方案【${name}】吗？`)) {
        delete PresetManager.data.list[name];
        for (const url in PresetManager.data.bindings) {
            if (PresetManager.data.bindings[url] === name) delete PresetManager.data.bindings[url];
        }
        PresetManager.data.active = Object.keys(PresetManager.data.list)[0];
        PresetManager.save();
        renderPresetDropdown();
        fillFormFromActivePreset();
        showToast(`方案「${name}」已删除`);
    }
}

function saveAISettings() {
    const checkedMode = document.querySelector('input[name="grading-mode"]:checked');
    const gradingMode = checkedMode ? checkedMode.value : 'normal';

    const config = {
        question: document.getElementById('question-content').value,
        answer: document.getElementById('standard-answer').value,
        rubric: document.getElementById('grading-rubric').value,
        provider: document.getElementById('ai-provider').value,
        endpoint: document.getElementById('api-endpoint').value,
        apiKey: document.getElementById('api-key').value,
        model: document.getElementById('model-name').value,
        gradingMode
    };

    const activeName = PresetManager.data.active;
    PresetManager.data.list[activeName] = config;

    const currentUrlId = PresetManager.getTaskIdentifier();
    const bindChecked = document.getElementById('bind-url-checkbox').checked;
    if (bindChecked) {
        PresetManager.data.bindings[currentUrlId] = activeName;
    } else {
        if (PresetManager.data.bindings[currentUrlId] === activeName) {
            delete PresetManager.data.bindings[currentUrlId];
        }
    }

    PresetManager.save();
    clearUnsavedChanges();
    const modeLabel = { normal: '普通模式', trial: '试改模式', unattended: '无人模式' }[gradingMode];
    safeAlert(`「${activeName}」已保存 — ${modeLabel}`);

    const panel = document.getElementById('ai-grading-settings');
    if (panel) {
        panel.classList.add('minimized');
        const minimizeBtn = panel.querySelector('.minimize-btn');
        if (minimizeBtn) minimizeBtn.textContent = '+';
    }
}

// 监听 api-provider 下拉框变化，自动填充端点和模型
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'ai-provider') {
        updateUIVisibility();
        const presets = {
            '5plus1': { endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT, model: SCRIPT_CONFIG.DEFAULT_MODEL },
            'openai': { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' }
        };
        const preset = presets[e.target.value];
        if (preset) {
            document.getElementById('api-endpoint').value = preset.endpoint;
            document.getElementById('model-name').value = preset.model;
            markUnsavedChanges();
        }
    }
});


// ========== [Module: image.js] ==========
// ========== 图片下载处理 ==========
async function fetchImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        console.log(`📥 正在请求下载图片: ${url.substring(0, 60)}...`);
        if (window.aiGradingState.isPaused) return reject(new Error('用户暂停'));

        const request = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 30000,
            onload: function(response) {
                if (response.status === 403 && window.aiGradingState.autoRefreshOn403) {
                    console.warn('⚠️ 图片返回403，自动刷新页面...');
                    sessionStorage.setItem('ai-grading-auto-resume', 'true');
                    setTimeout(() => location.reload(), 1000);
                    return reject(new Error('403错误，页面刷新中'));
                }
                if (response.status >= 200 && response.status < 300) {
                    try {
                        const arrayBuffer = response.response;
                        if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('下载的图片数据为空');

                        let binary = '';
                        const bytes = new Uint8Array(arrayBuffer);
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);

                        resolve(window.btoa(binary));
                    } catch (e) {
                        reject(new Error('图片转换失败: ' + e.message));
                    }
                } else {
                    reject(new Error(`图片下载失败，状态码: ${response.status}`));
                }
            },
            onerror: () => reject(new Error('图片下载跨域请求被拒绝或网络断开')),
            ontimeout: () => reject(new Error('图片下载超时'))
        });

        if (window.aiGradingState.abortController) {
            window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                request.abort();
                reject(new Error('用户主动暂停'));
            });
        }
    });
}


// ========== [Module: grading.js] ==========
// ========== 文本解析工具 ==========
function buildPrompt(config) {
    let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
    if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
    if (config.answer) prompt += `**标准答案：**\n${config.answer}\n\n`;
    if (config.rubric) prompt += `**评分标准：**\n${config.rubric}\n\n`;
    prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：\n\n学生答案：[OCR识别出的学生答案文字内容]\n分数：[数字]\n评语：[简短评语]\n\n注意：\n1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后\n2. 只返回数字分数，不要带单位\n3. 评语控制在100字以内\n4. 严格按照评分标准打分`;
    return prompt;
}

function parseAIResponseText(text) {
    const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n分数|$)/s);
    const scoreMatch = text.match(/分数[：:]\s*(\d+\.?\d*)/);
    const commentMatch = text.match(/评语[：:]\s*(.+)/s);
    return {
        studentAnswer: studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别',
        score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
        comment: commentMatch ? commentMatch[1].trim() : text
    };
}

function parsePromptModification(text) {
    const reasonMatch = text.match(/修改理由[：:]\s*(.+?)(?=\n新|$)/s);
    const questionMatch = text.match(/新题目内容[：:]\s*(.+?)(?=\n新|$)/s);
    const answerMatch = text.match(/新参考答案[：:]\s*(.+?)(?=\n新|$)/s);
    const rubricMatch = text.match(/新评分标准[：:]\s*(.+)/s);
    return {
        reason: reasonMatch ? reasonMatch[1].trim() : '',
        question: questionMatch ? questionMatch[1].trim() : '不变',
        answer: answerMatch ? answerMatch[1].trim() : '不变',
        rubric: rubricMatch ? rubricMatch[1].trim() : '不变'
    };
}

// ========== 通用 AI 请求函数 ==========
function callAI(prompt, base64DataArray, config, onStreamUpdate) {
    return new Promise((resolve, reject) => {
        const messageContent = [{ type: "text", text: prompt }];
        base64DataArray.forEach(base64Data => {
            messageContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}` } });
        });

        const requestBody = {
            model: config.model,
            messages: [{ role: "user", content: messageContent }],
            max_tokens: 2048,
            stream: true
        };

        console.log(`📤 发送请求到: ${config.endpoint}`);

        let fullText = '';
        let buffer = '';
        let settled = false;
        let progressCallCount = 0;

        function parseSSEBuffer(chunk) {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
                line = line.trim();
                if (!line.startsWith('data:')) continue;
                const dataStr = line.substring(5).trim();
                if (dataStr === '[DONE]' || !dataStr) continue;
                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        fullText += delta;
                        if (onStreamUpdate) onStreamUpdate(fullText);
                    }
                } catch (e) {}
            }
        }

        const request = GM_xmlhttpRequest({
            method: 'POST',
            url: config.endpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            data: JSON.stringify(requestBody),
            onprogress: function(res) {
                if (res.responseText) {
                    progressCallCount++;
                    if (progressCallCount === 1) {
                        console.log('✅ [诊断] onprogress 已触发，当前环境支持流式输出');
                    }
                    fullText = '';
                    buffer = '';
                    parseSSEBuffer(res.responseText);
                }
            },
            onload: function(res) {
                if (settled) return;
                settled = true;
                console.log(`✅ [诊断] onload 触发 — HTTP状态: ${res.status}, onprogress累计触发次数: ${progressCallCount}, 响应长度: ${(res.responseText || '').length} 字节`);
                if (res.status < 200 || res.status >= 300) {
                    let errorMsg = res.responseText || res.statusText;
                    try {
                        const errObj = JSON.parse(res.responseText);
                        if (errObj.error?.message) errorMsg = errObj.error.message;
                    } catch (e) {}
                    console.error(`❌ [诊断] API返回错误: ${res.status} — ${errorMsg}`);
                    return reject(new Error(`API报错 (${res.status}): ${errorMsg}`));
                }
                fullText = '';
                buffer = '';
                parseSSEBuffer(res.responseText || '');
                resolve(fullText);
            },
            onerror: function() {
                if (settled) return;
                settled = true;
                console.error('❌ [诊断] GM_xmlhttpRequest onerror 触发 — 请求被拦截或网络断开');
                reject(new Error('网络请求被拦截，请检查跨域权限'));
            },
            ontimeout: function() {
                if (settled) return;
                settled = true;
                console.error('❌ [诊断] GM_xmlhttpRequest ontimeout 触发 — 请求超时');
                reject(new Error('请求超时'));
            }
        });

        if (window.aiGradingState.abortController) {
            window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                if (!settled) {
                    settled = true;
                    request.abort();
                    reject(new Error('用户主动暂停'));
                }
            });
        }
    });
}

// ========== 打分专用函数 ==========
function callAIGrading(base64DataArray, config, onStreamUpdate) {
    return callAI(buildPrompt(config), base64DataArray, config, onStreamUpdate)
        .then(fullText => {
            const parsed = parseAIResponseText(fullText);
            console.log(`🧠 [诊断] AI响应解析结果 — 分数: ${parsed.score}, 识别答案长度: ${(parsed.studentAnswer || '').length}字, 原始文本长度: ${fullText.length}字`);
            if (parsed.score === null) {
                console.warn('⚠️ [诊断] 分数解析为 null，原始AI返回文本如下：\n' + fullText);
            }
            return parsed;
        });
}


// ========== [Module: correction.js] ==========
// ========== 分数纠错模块 ==========

function showCorrectionPanel(context) {
    // context: { score, comment, studentAnswer, imageUrls, base64DataArray, config, onAccept(finalScore, correctionInfo), onCancel }
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.id = 'correction-panel';
    document.body.appendChild(overlay);

    let currentStep = 1;
    let feedback = null;
    let analysisResult = null;
    let newResult = null;

    function render() {
        if (currentStep === 1) renderStep1();
        else if (currentStep === 2) renderStep2();
        else if (currentStep === 3) renderStep3();
    }

    // ===== 步骤1：教师反馈 =====
    function renderStep1() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:600px;">
                <div class="ai-modal-header">分数纠错</div>
                <div class="ai-modal-body">
                    <div style="display:flex;gap:20px;margin-bottom:20px;">
                        <div style="flex:1;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#86868b;font-weight:600;margin-bottom:6px;">AI评分</div>
                            <div style="font-size:36px;font-weight:700;color:#1d1d1f;">${context.score}</div>
                        </div>
                        <div style="flex:2;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#86868b;font-weight:600;margin-bottom:6px;">识别答案</div>
                            <div style="font-size:13px;color:#4a4a4a;line-height:1.5;max-height:80px;overflow-y:auto;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:10px;border-radius:8px;">${context.studentAnswer || '未能识别'}</div>
                        </div>
                    </div>
                    <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:16px;">
                        <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:14px;">教师反馈</div>
                        <div style="margin-bottom:14px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">正确得分</label>
                            <input id="cor-teacher-score" type="number" style="width:120px;padding:8px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:14px;" placeholder="分数">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">评分理由</label>
                            <textarea id="cor-teacher-reason" style="width:100%;min-height:80px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;" placeholder="解释为什么应该是这个分数..."></textarea>
                        </div>
                    </div>
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel" id="cor-cancel">取消</button>
                    <button class="ai-modal-btn-confirm" id="cor-next">下一步分析</button>
                </div>
            </div>
        `;
        overlay.querySelector('#cor-cancel').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        overlay.querySelector('#cor-next').onclick = e => {
            e.stopPropagation();
            const scoreVal = overlay.querySelector('#cor-teacher-score').value;
            const reasonVal = overlay.querySelector('#cor-teacher-reason').value.trim();
            if (!scoreVal && scoreVal !== 0) { showAlertModal('请输入正确得分'); return; }
            feedback = { teacherScore: parseFloat(scoreVal), teacherReason: reasonVal || '未说明理由' };
            currentStep = 2;
            render();
        };
        overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (context.onCancel) context.onCancel(); } };
    }

    // ===== 步骤2：AI分析 + 提示词建议 =====
    function renderStep2() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:640px;">
                <div class="ai-modal-header">提示词优化</div>
                <div class="ai-modal-body" style="max-height:60vh;overflow-y:auto;">
                    <div id="cor-analysis-stream" style="font-family:'SF Mono','JetBrains Mono',Consolas,monospace;font-size:12px;color:#4a4a4a;line-height:1.6;max-height:180px;overflow-y:auto;white-space:pre-wrap;background:rgba(0,0,0,0.02);padding:14px;border-radius:10px;border:1px solid rgba(0,0,0,0.06);margin-bottom:16px;">AI分析中...</div>
                    <div id="cor-reason" style="font-size:13px;color:#666;margin-bottom:16px;display:none;"></div>
                    <div id="cor-edit-section" style="display:none;">
                        <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">建议修改</div>
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">参考答案</label>
                            <textarea id="cor-new-answer" style="width:100%;min-height:70px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">评分标准</label>
                            <textarea id="cor-new-rubric" style="width:100%;min-height:70px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
                        </div>
                    </div>
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel" id="cor-cancel2">取消</button>
                    <button class="ai-modal-btn-confirm" id="cor-regrade" style="display:none;">重新批改</button>
                </div>
            </div>
        `;
        overlay.querySelector('#cor-cancel2').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (context.onCancel) context.onCancel(); } };

        startAnalysis();
    }

    async function startAnalysis() {
        const streamEl = document.getElementById('cor-analysis-stream');
        try {
            const rawText = await analyzePromptModification(context, feedback, streamed => {
                if (streamEl) streamEl.textContent = streamed;
            });
            analysisResult = parsePromptModification(rawText);

            if (streamEl) streamEl.style.display = 'none';
            const reasonEl = document.getElementById('cor-reason');
            if (reasonEl) { reasonEl.style.display = 'block'; reasonEl.textContent = '修改理由：' + (analysisResult.reason || '无'); }

            const editSection = document.getElementById('cor-edit-section');
            if (editSection) editSection.style.display = 'block';

            const answerEl = document.getElementById('cor-new-answer');
            if (answerEl) answerEl.value = analysisResult.answer !== '不变' ? analysisResult.answer : (context.config.answer || '');
            const rubricEl = document.getElementById('cor-new-rubric');
            if (rubricEl) rubricEl.value = analysisResult.rubric !== '不变' ? analysisResult.rubric : (context.config.rubric || '');

            const regradeBtn = document.getElementById('cor-regrade');
            if (regradeBtn) {
                regradeBtn.style.display = '';
                regradeBtn.onclick = e => {
                    e.stopPropagation();
                    currentStep = 3;
                    render();
                    startRegrading();
                };
            }
        } catch (err) {
            if (streamEl) streamEl.textContent = '分析失败：' + err.message;
        }
    }

    // ===== 步骤3：重新批改结果 =====
    function renderStep3() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:560px;">
                <div class="ai-modal-header">纠错结果</div>
                <div class="ai-modal-body" style="text-align:center;">
                    <div id="cor-regrade-stream" style="font-family:'SF Mono',monospace;font-size:12px;color:#4a4a4a;line-height:1.6;max-height:120px;overflow-y:auto;white-space:pre-wrap;background:rgba(0,0,0,0.02);padding:14px;border-radius:10px;border:1px solid rgba(0,0,0,0.06);margin-bottom:20px;text-align:left;">重新批改中...</div>
                    <div id="cor-result-area" style="display:none;">
                        <div style="font-size:48px;font-weight:700;color:#1d1d1f;margin-bottom:16px;" id="cor-new-score"></div>
                        <div style="font-size:13px;color:#666;text-align:left;margin-bottom:8px;"><strong>识别答案：</strong><span id="cor-new-answer-text"></span></div>
                        <div style="font-size:13px;color:#666;text-align:left;"><strong>评语：</strong><span id="cor-new-comment"></span></div>
                    </div>
                </div>
                <div class="ai-modal-footer" style="justify-content:space-between;">
                    <button class="ai-modal-btn-cancel" id="cor-abandon" style="display:none;">放弃纠错</button>
                    <div style="display:flex;gap:12px;">
                        <button class="ai-modal-btn-cancel" id="cor-continue" style="display:none;">继续纠错</button>
                        <button class="ai-modal-btn-confirm" id="cor-accept" style="display:none;">确认提交</button>
                    </div>
                </div>
            </div>
        `;
    }

    async function startRegrading() {
        const streamEl = document.getElementById('cor-regrade-stream');
        try {
            const newAnswer = document.getElementById('cor-new-answer')?.value || context.config.answer;
            const newRubric = document.getElementById('cor-new-rubric')?.value || context.config.rubric;
            const modifiedConfig = { ...context.config, answer: newAnswer, rubric: newRubric };

            const result = await callAIGrading(context.base64DataArray, modifiedConfig, text => {
                if (streamEl) streamEl.textContent = text;
            });
            newResult = result;

            if (streamEl) streamEl.style.display = 'none';
            const resultArea = document.getElementById('cor-result-area');
            if (resultArea) resultArea.style.display = 'block';
            const scoreEl = document.getElementById('cor-new-score');
            if (scoreEl) scoreEl.textContent = result.score ?? '解析失败';
            const ansEl = document.getElementById('cor-new-answer-text');
            if (ansEl) ansEl.textContent = result.studentAnswer || '未能识别';
            const cmtEl = document.getElementById('cor-new-comment');
            if (cmtEl) cmtEl.textContent = result.comment || '';

            ['cor-abandon', 'cor-continue', 'cor-accept'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = '';
            });
            document.getElementById('cor-abandon').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
            document.getElementById('cor-continue').onclick = e => { e.stopPropagation(); currentStep = 1; render(); };
            document.getElementById('cor-accept').onclick = e => {
                e.stopPropagation();
                const correctionInfo = {
                    isCorrected: true,
                    correctionReason: `教师纠正：AI${context.score}分→正确${feedback.teacherScore}分。${feedback.teacherReason}`,
                    newAnswer: document.getElementById('cor-new-answer')?.value,
                    newRubric: document.getElementById('cor-new-rubric')?.value
                };
                cleanup();
                if (context.onAccept) context.onAccept(newResult.score, correctionInfo);
            };
        } catch (err) {
            if (streamEl) streamEl.textContent = '重新批改失败：' + err.message;
            const abandonBtn = document.getElementById('cor-abandon');
            if (abandonBtn) { abandonBtn.style.display = ''; abandonBtn.onclick = () => { cleanup(); if (context.onCancel) context.onCancel(); }; }
        }
    }

    function cleanup() {
        overlay.remove();
    }

    render();
}

// ========== AI 提示词修改分析 ==========
function analyzePromptModification(context, feedback, onStreamUpdate) {
    const originalPrompt = buildPrompt(context.config);
    const analysisPrompt = `你是一位阅卷提示词优化专家。教师对AI的评分结果提出了异议，请分析并建议修改评分提示词。

**原始评分提示词：**
${originalPrompt}

**学生答题图片中的OCR答案：**
${context.studentAnswer}

**AI给出的评分：**
分数：${context.score}，评语：${context.comment}

**教师认为正确的评分：**
分数：${feedback.teacherScore}，理由：${feedback.teacherReason}

请分析差异原因，并返回修改后的提示词各部分：
1. 如果需要修改参考答案，请给出新的参考答案
2. 如果需要修改评分标准，请给出新的评分标准
3. 如果需要修改题目内容，请给出新的题目内容
4. 简要说明修改理由

按以下格式返回（必须严格按此格式）：
修改理由：[分析差异的原因]
新题目内容：[如需修改则填写，否则写"不变"]
新参考答案：[如需修改则填写，否则写"不变"]
新评分标准：[如需修改则填写，否则写"不变"]`;

    return callAI(analysisPrompt, context.base64DataArray, context.config, onStreamUpdate);
}


// ========== [Module: history.js] ==========
// ========== 评阅历史模块 ==========
const HistoryManager = {
    records: [],
    returnUrl: null,

    init() {
        const saved = GM_getValue('ai-grading-history');
        this.records = saved ? JSON.parse(saved) : [];
    },

    save() {
        if (this.records.length > 500) this.records = this.records.slice(0, 500);
        GM_setValue('ai-grading-history', JSON.stringify(this.records));
    },

    add(record) {
        record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        record.timestamp = Date.now();
        record.status = record.status || 'submitted';
        record.isCorrected = record.isCorrected || false;
        record.pageUrl = window.location.pathname + window.location.hash;
        record.taskIdentifier = PresetManager.getTaskIdentifier();
        this.records.unshift(record);
        this.save();
        console.log(`📝 [历史] 已记录评阅: ${record.studentAnswer?.slice(0, 20)}... → ${record.finalScore}分`);
    },

    update(id, updates) {
        const idx = this.records.findIndex(r => r.id === id);
        if (idx >= 0) { Object.assign(this.records[idx], updates); this.save(); }
    },

    getById(id) {
        return this.records.find(r => r.id === id);
    },

    markIncorrect(id) {
        this.update(id, { status: 'marked' });
    },

    exportCSV() {
        const header = '时间,配置方案,模式,AI分数,最终分数,是否纠错,纠错理由,识别答案,AI评语\n';
        const rows = this.records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const esc = s => '"' + String(s || '').replace(/"/g, '""') + '"';
            return [time, r.presetName, r.gradingMode, r.aiScore, r.finalScore,
                r.isCorrected ? '是' : '否', esc(r.correctionReason), esc(r.studentAnswer), esc(r.aiComment)].join(',');
        }).join('\n');
        this._download(header + rows, '评阅历史_' + this._fileTimestamp() + '.csv', 'text/csv;charset=utf-8');
    },

    exportJSON() {
        this._download(JSON.stringify(this.records, null, 2), '评阅历史_' + this._fileTimestamp() + '.json', 'application/json');
    },

    _fileTimestamp() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' +
            String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    },

    _download(content, filename, type) {
        const BOM = type.includes('csv') ? '﻿' : '';
        const blob = new Blob([BOM + content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    },

    startRegrade(id) {
        const record = this.getById(id);
        if (!record) return;
        this.returnUrl = window.location.pathname + window.location.hash;
        window.aiGradingState.isRegrading = true;
        sessionStorage.setItem('ai-grading-regrade', JSON.stringify({ id, returnUrl: this.returnUrl }));
        window.location.href = record.pageUrl;
    },

    async finishRegrade(id, finalScore, correctionInfo) {
        this.update(id, {
            finalScore,
            isCorrected: correctionInfo.isCorrected,
            correctionReason: correctionInfo.correctionReason,
            status: 'submitted'
        });
        const returnUrl = this.returnUrl;
        window.aiGradingState.isRegrading = false;
        sessionStorage.removeItem('ai-grading-regrade');
        if (returnUrl) {
            showToast('回评完成，返回原页面...');
            setTimeout(() => { window.location.href = returnUrl; }, 1000);
        }
    }
};
HistoryManager.init();

// ========== 历史面板 UI ==========
function showHistoryPanel() {
    const old = document.getElementById('ai-history-panel');
    if (old) { old.remove(); return; }

    const panel = document.createElement('div');
    panel.id = 'ai-history-panel';
    panel.innerHTML = `
        <style>
            #ai-history-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                z-index: 1000001; width: 680px; max-width: 94vw; max-height: 85vh;
                background: rgba(255,255,255,0.95); backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255,255,255,0.6); border-radius: 20px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                display: flex; flex-direction: column; overflow: hidden;
                animation: ai-modal-scalein 0.3s cubic-bezier(0.16,1,0.3,1);
            }
            #ai-history-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);z-index:1000000; }
            .hist-header { padding:20px 28px 16px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; justify-content:space-between; align-items:center; }
            .hist-header h3 { margin:0; font-size:16px; font-weight:600; color:#1d1d1f; }
            .hist-header .close-btn { background:transparent;border:none;font-size:20px;cursor:pointer;color:#666;padding:4px 8px;border-radius:6px; }
            .hist-header .close-btn:hover { background:rgba(0,0,0,0.04);color:#1a1a1a; }
            .hist-toolbar { padding:12px 28px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:8px; align-items:center; }
            .hist-toolbar button { padding:6px 14px; border:1px solid rgba(0,0,0,0.1); background:transparent; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; }
            .hist-toolbar button:hover { background:rgba(0,0,0,0.03); }
            .hist-toolbar .count { margin-left:auto; font-size:12px; color:#86868b; }
            .hist-list { flex:1; overflow-y:auto; padding:12px 28px; }
            .hist-item { padding:16px; border:1px solid rgba(0,0,0,0.06); border-radius:12px; margin-bottom:10px; transition:all 0.2s; }
            .hist-item:hover { border-color:rgba(0,0,0,0.12); box-shadow:0 2px 8px rgba(0,0,0,0.04); }
            .hist-item.marked { border-left:3px solid #D93025; }
            .hist-item-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
            .hist-item-time { font-size:12px; color:#86868b; }
            .hist-item-meta { font-size:11px; color:#aaa; }
            .hist-item-score { font-size:14px; font-weight:600; color:#1d1d1f; }
            .hist-item-score .arrow { color:#86868b; margin:0 4px; }
            .hist-item-score .corrected { color:#0052FF; }
            .hist-item-score .marked-tag { color:#D93025; font-size:11px; margin-left:8px; font-weight:500; }
            .hist-item-text { font-size:12px; color:#666; line-height:1.5; margin-bottom:10px; }
            .hist-item-actions { display:flex; gap:8px; }
            .hist-item-actions button { padding:5px 12px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:11px; cursor:pointer; transition:all 0.2s; }
            .hist-item-actions button:hover { background:rgba(0,0,0,0.03); }
            .hist-item-actions button.danger { color:#D93025; border-color:rgba(217,48,37,0.2); }
            .hist-item-actions button.danger:hover { background:rgba(217,48,37,0.04); }
            .hist-item-actions button.primary { color:#0052FF; border-color:rgba(0,82,255,0.2); }
            .hist-item-actions button.primary:hover { background:rgba(0,82,255,0.04); }
            .hist-empty { text-align:center; padding:60px 20px; color:#aaa; font-size:14px; }
        </style>
        <div id="ai-history-overlay"></div>
        <div id="ai-history-panel-inner">
            <div class="hist-header">
                <h3>评阅历史</h3>
                <button class="close-btn" id="hist-close">×</button>
            </div>
            <div class="hist-toolbar">
                <button id="hist-export-csv">导出CSV</button>
                <button id="hist-export-json">导出JSON</button>
                <button id="hist-clear" style="color:#D93025;border-color:rgba(217,48,37,0.2);">清空</button>
                <span class="count">共 ${HistoryManager.records.length} 条</span>
            </div>
            <div class="hist-list" id="hist-list"></div>
        </div>
    `;
    document.body.appendChild(panel);

    const close = () => panel.remove();
    document.getElementById('ai-history-overlay').onclick = close;
    document.getElementById('hist-close').onclick = close;
    document.getElementById('hist-export-csv').onclick = () => HistoryManager.exportCSV();
    document.getElementById('hist-export-json').onclick = () => HistoryManager.exportJSON();
    document.getElementById('hist-clear').onclick = async () => {
        if (await showConfirmModal('确定要清空所有评阅历史吗？此操作不可撤销。')) {
            HistoryManager.records = [];
            HistoryManager.save();
            renderList();
        }
    };

    function renderList() {
        const listEl = document.getElementById('hist-list');
        if (!listEl) return;
        if (HistoryManager.records.length === 0) {
            listEl.innerHTML = '<div class="hist-empty">暂无评阅记录</div>';
            return;
        }
        listEl.innerHTML = HistoryManager.records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[r.gradingMode] || r.gradingMode;
            const scoreHtml = r.isCorrected
                ? `<span>${r.aiScore}</span><span class="arrow">→</span><span class="corrected">${r.finalScore}</span>`
                : `<span>${r.finalScore}</span>`;
            const markedTag = r.status === 'marked' ? '<span class="marked-tag">⚠ 待回评</span>' : '';
            const correctedTag = r.isCorrected ? '<span style="color:#0052FF;font-size:11px;margin-left:8px;">✓已纠错</span>' : '';
            return `
                <div class="hist-item ${r.status === 'marked' ? 'marked' : ''}" data-id="${r.id}">
                    <div class="hist-item-header">
                        <div>
                            <span class="hist-item-time">${time}</span>
                            <span class="hist-item-meta" style="margin-left:8px;">${r.presetName} · ${modeLabel}模式</span>
                        </div>
                        <div class="hist-item-score">${scoreHtml}分${markedTag}${correctedTag}</div>
                    </div>
                    <div class="hist-item-text">
                        答案：${(r.studentAnswer || '').slice(0, 60)}${(r.studentAnswer || '').length > 60 ? '...' : ''}<br>
                        评语：${(r.aiComment || '').slice(0, 60)}${(r.aiComment || '').length > 60 ? '...' : ''}
                    </div>
                    <div class="hist-item-actions">
                        <button class="hist-detail-btn" data-id="${r.id}">查看详情</button>
                        ${r.status !== 'marked' ? `<button class="hist-mark-btn danger" data-id="${r.id}">标记不正确</button>` : ''}
                        <button class="hist-regrade-btn primary" data-id="${r.id}">回评</button>
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.hist-detail-btn').forEach(btn => {
            btn.onclick = () => showHistoryDetail(HistoryManager.getById(btn.dataset.id));
        });
        listEl.querySelectorAll('.hist-mark-btn').forEach(btn => {
            btn.onclick = () => { HistoryManager.markIncorrect(btn.dataset.id); renderList(); showToast('已标记为不正确'); };
        });
        listEl.querySelectorAll('.hist-regrade-btn').forEach(btn => {
            btn.onclick = async () => {
                if (await showConfirmModal('确定要回评此记录吗？将导航到对应试题页面。')) {
                    panel.remove();
                    HistoryManager.startRegrade(btn.dataset.id);
                }
            };
        });
    }

    renderList();
}

// ========== 历史详情模态框 ==========
function showHistoryDetail(record) {
    if (!record) return;
    const old = document.getElementById('ai-history-detail');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ai-history-detail';
    overlay.className = 'ai-modal-overlay';
    overlay.style.zIndex = '1000002';

    const time = new Date(record.timestamp).toLocaleString('zh-CN');
    const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[record.gradingMode] || record.gradingMode;
    const imagesHtml = (record.imageUrls || []).map(url => `<img src="${url}" style="max-width:100%;border-radius:8px;margin-bottom:8px;">`).join('');

    overlay.innerHTML = `
        <div class="ai-modal-card" style="max-width:700px;max-height:85vh;overflow-y:auto;">
            <div class="ai-modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                <span>评阅详情</span>
                <button style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:4px 8px;" id="detail-close">×</button>
            </div>
            <div class="ai-modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">时间</div><div style="font-size:13px;">${time}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">方案 / 模式</div><div style="font-size:13px;">${record.presetName} · ${modeLabel}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">AI评分</div><div style="font-size:28px;font-weight:700;">${record.aiScore}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">最终分数</div><div style="font-size:28px;font-weight:700;color:${record.isCorrected ? '#0052FF' : '#1d1d1f'};">${record.finalScore}${record.isCorrected ? ' ✓' : ''}</div></div>
                </div>
                ${record.isCorrected ? `<div style="background:rgba(0,82,255,0.04);border-left:3px solid #0052FF;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;color:#0052FF;margin-bottom:16px;">${record.correctionReason || '已纠错'}</div>` : ''}
                <div style="margin-bottom:16px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">识别答案</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;">${record.studentAnswer || '未能识别'}</div></div>
                <div style="margin-bottom:16px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">AI评语</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;">${record.aiComment || '无'}</div></div>
                ${imagesHtml ? `<div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">答题卡图片</div>${imagesHtml}</div>` : ''}
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const closeDetail = () => overlay.remove();
    overlay.querySelector('#detail-close').onclick = closeDetail;
    overlay.onclick = e => { if (e.target === overlay) closeDetail(); };
}


// ========== [Module: updater.js] ==========
// ========== 自动检查更新模块 ==========

/**
 * 比较两个版本号字符串，返回：
 *   1  表示 a > b
 *   -1 表示 a < b
 *   0  表示相等
 */
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

/**
 * 从脚本文件文本中提取 @version 字段值。
 */
function extractRemoteVersion(scriptText) {
    const m = scriptText.match(/\/\/\s*@version\s+([\d.]+)/);
    return m ? m[1].trim() : null;
}

/**
 * 显示更新提示对话框（非 alert，样式与项目风格一致）。
 */
function showUpdateDialog(remoteVersion) {
    const oldDialog = document.getElementById('ai-update-dialog');
    if (oldDialog) return; // 已经在显示了，不重复

    const dialog = document.createElement('div');
    dialog.id = 'ai-update-dialog';
    dialog.innerHTML = `
        <style>
            #ai-update-dialog {
                position: fixed; bottom: 30px; left: 30px; z-index: 1000000;
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(0,0,0,0.06); border-radius: 12px;
                box-shadow: 0 16px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04);
                padding: 24px; width: 320px;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                animation: slide-in-update 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slide-in-update {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            #ai-update-dialog .upd-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; letter-spacing: 0.3px; }
            #ai-update-dialog .upd-body  { font-size: 13px; color: #666; margin-bottom: 24px; line-height: 1.6; }
            .version-tag { display: inline-block; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", monospace; font-size: 12px; }
            #ai-update-dialog .upd-btns  { display: flex; gap: 8px; margin-bottom: 12px; }
            #ai-update-dialog .upd-btn   { flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
            #ai-update-dialog .upd-btn-primary { background: #1a1a1a; color: white; }
            #ai-update-dialog .upd-btn-primary:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary { background: transparent; color: #1a1a1a; border: 1px solid rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary:hover { background: rgba(0,0,0,0.03); }
            #ai-update-dialog .upd-btn-skip { background: none; color: #999; font-size: 12px; border: none; cursor: pointer; width: 100%; text-align: center; padding: 4px; transition: color 0.2s; }
            #ai-update-dialog .upd-btn-skip:hover { color: #1a1a1a; }
        </style>
        <div class="upd-title">发现新版本</div>
        <div class="upd-body">
            核心组件有性能更新可用。<br><br>
            当前版本: <span class="version-tag">v${SCRIPT_CONFIG.VERSION}</span><br>
            最新可用: <span class="version-tag">v${remoteVersion}</span>
        </div>
        <div class="upd-btns">
            <button class="upd-btn upd-btn-primary" id="upd-btn-now">立即更新</button>
            <button class="upd-btn upd-btn-secondary" id="upd-btn-later">稍后</button>
        </div>
        <button class="upd-btn-skip" id="upd-btn-skip">跳过此版本</button>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#upd-btn-now').addEventListener('click', () => {
        window.open(SCRIPT_CONFIG.UPDATE_CHECK_URL, '_blank');
        dialog.remove();
    });

    dialog.querySelector('#upd-btn-later').addEventListener('click', () => {
        dialog.remove();
    });

    dialog.querySelector('#upd-btn-skip').addEventListener('click', () => {
        GM_setValue('skip-update-version', remoteVersion);
        dialog.remove();
        console.log(`[更新检查] 已跳过版本 ${remoteVersion}`);
    });
}

/**
 * 主更新检查函数。
 * - 每 24 小时至多检查一次（通过 GM_getValue 持久化上次检查时间）
 * - 无人值守模式下完全跳过，不打扰批改流程
 * - 如果远端版本 > 当前版本且用户未选择跳过该版本，则弹出提示卡片
 */
function checkForUpdate() {
    // 无人值守模式：不提醒
    if (window.aiGradingState && window.aiGradingState.gradingMode === 'unattended') return;

    const now = Date.now();
    const lastCheck = GM_getValue('last-update-check', 0);
    if (now - lastCheck < SCRIPT_CONFIG.UPDATE_CHECK_INTERVAL_MS) {
        console.log(`[更新检查] 距上次检查不足 24 小时，跳过。`);
        return;
    }

    GM_setValue('last-update-check', now);
    console.log('[更新检查] 开始检查新版本...');

    GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_CONFIG.UPDATE_CHECK_URL + '?_t=' + now, // 加时间戳避免缓存
        timeout: 15000,
        onload: function(res) {
            if (res.status < 200 || res.status >= 300) {
                console.warn(`[更新检查] 请求失败，状态码: ${res.status}`);
                return;
            }
            const remoteVersion = extractRemoteVersion(res.responseText);
            if (!remoteVersion) {
                console.warn('[更新检查] 无法从远端文件解析版本号');
                return;
            }
            console.log(`[更新检查] 远端版本: ${remoteVersion}, 本地版本: ${SCRIPT_CONFIG.VERSION}`);

            const skippedVersion = GM_getValue('skip-update-version', '');
            if (skippedVersion === remoteVersion) {
                console.log(`[更新检查] 用户已选择跳过版本 ${remoteVersion}`);
                return;
            }

            if (compareVersions(remoteVersion, SCRIPT_CONFIG.VERSION) > 0) {
                console.log(`[更新检查] 发现新版本 ${remoteVersion}，弹出提示`);
                showUpdateDialog(remoteVersion);
            } else {
                console.log('[更新检查] 当前已是最新版本');
            }
        },
        onerror: function() {
            console.warn('[更新检查] 网络请求失败，可能是跨域限制或网络问题');
        },
        ontimeout: function() {
            console.warn('[更新检查] 请求超时');
        }
    });
}


// ========== [Module: main.js] ==========
// ========== 页面元素等待与检测 ==========
function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const immediateCheck = document.querySelector(selector);
        if (immediateCheck) return resolve(immediateCheck);
        const startTime = Date.now();
        const timer = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(timer);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(timer);
                reject(new Error('等待元素超时: ' + selector));
            }
        }, 200);
    });
}

async function detectMarkingPage() {
    console.log('🔎 [诊断] 开始检测批改页面元素...');
    try {
        const result = await Promise.race([
            waitForElement('div[name="topicImg"]').then(() => 'topicImg'),
            waitForElement('input[type="number"]').then(() => 'score-input'),
            waitForElement('button:contains("提交分数")').then(() => 'submit-btn')
        ]).catch(() => null);
        if (result) {
            console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        const hasInput = document.querySelector('input[type="number"]') || document.querySelector('input[type="text"]');
        const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交') || btn.textContent.includes('分数'));
        const detected = !!(hasInput && hasButton);
        console.log(`🔎 [诊断] 兜底检测结果 — 输入框: ${!!hasInput}, 提交按钮: ${hasButton}, 最终判断: ${detected}`);
        if (!detected) {
            console.warn('⚠️ [诊断] 未检测到批改页面，脚本将不会初始化。当前所有按钮文字:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t).join(' | '));
        }
        return detected;
    } catch (error) {
        console.error('❌ [诊断] detectMarkingPage 抛出异常:', error);
        return false;
    }
}

// ========== 主控流程 ==========
async function startAutoGrading() {
    window.aiGradingState.abortController = new AbortController();
    console.log('▶️ [诊断] startAutoGrading 开始执行');

    try {
        const config = PresetManager.getCurrentConfig();
        if (!config.apiKey) {
            safeAlert('❌ 请先配置API密钥！');
            window.aiGradingState.isRunning = false;
            return;
        }

        console.log(`🔍 使用方案【${PresetManager.data.active}】查找答卷...`);
        const imgElements = document.querySelectorAll('div[name="topicImg"] img');
        console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imgElements.length}`);

        if (!imgElements || imgElements.length === 0) {
            if (window.aiGradingState.gradingMode === 'unattended') {
                stopAutoGrading();
                safeAlert('✅ 所有试卷已批改完成！');
                return;
            }
            safeAlert('❌ 未找到答题卡图片！');
            window.aiGradingState.isRunning = false;
            return;
        }

        const imageUrls = Array.from(imgElements).map(img => img.src);
        window.aiGradingState.currentImageUrls = imageUrls;

        const gradeBtn = document.querySelector('.ai-grade-btn');
        if (gradeBtn && !window.aiGradingState.gradingMode === 'unattended') {
            gradeBtn.textContent = imageUrls.length > 1 ? `📥 下载多图(${imageUrls.length})...` : '📥 下载图片...';
        }

        console.log(`📥 [诊断] 开始下载 ${imageUrls.length} 张图片...`);
        const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
        window.aiGradingState.currentBase64DataArray = base64DataArray;
        console.log(`✅ [诊断] 图片下载完成，各图片Base64大小: ${base64DataArray.map(b => Math.round(b.length / 1024) + 'KB').join(', ')}`);

        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        if (gradeBtn && !window.aiGradingState.gradingMode === 'unattended') {
            gradeBtn.textContent = '⏳ AI分析中...';
            showStreamPanel();
        }

        console.log('🤖 [诊断] 开始调用AI接口...');
        const result = await callAIGrading(base64DataArray, config, (streamedText) => {
            if (!window.aiGradingState.gradingMode === 'unattended') updateStreamPanel(streamedText);
        });

        hideStreamPanel();
        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        console.log(`📊 [诊断] callAIGrading 返回 — score: ${result.score}, comment长度: ${(result.comment || '').length}字`);
        if (result.score !== undefined && result.score !== null) {
            window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
            window.aiGradingState.errorRetryCount = 0;
            console.log(`✏️ [诊断] 准备填入分数: ${result.score}，调用 fillScore...`);
            fillScore(result.score, result.comment);
        } else {
            throw new Error('AI返回异常: ' + JSON.stringify(result));
        }

    } catch (error) {
        hideStreamPanel();
        if (error.message === '用户主动暂停' || error.message === '用户暂停') {
            console.log('⏸️ 请求已被暂停');
        } else {
            console.error('❌ 打分失败:', error);
            if (window.aiGradingState.gradingMode === 'unattended') {
                window.aiGradingState.errorRetryCount++;
                if (window.aiGradingState.errorRetryCount <= window.aiGradingState.maxRetries) {
                    sessionStorage.setItem('ai-grading-auto-resume', 'true');
                    sessionStorage.setItem('ai-grading-retry-count', window.aiGradingState.errorRetryCount.toString());
                    setTimeout(() => location.reload(), 2000);
                    return;
                } else {
                    stopAutoGrading();
                    safeAlert('❌ 错误重试上限，自动停止。');
                    return;
                }
            }
            safeAlert('❌ 打分失败: ' + error.message);
        }
        window.aiGradingState.isRunning = false;
        const btn = document.querySelector('.ai-grade-btn');
        if (btn) btn.textContent = window.aiGradingState.isPaused ? '▶️ 继续AI打分' : '✨ 开始AI打分';
    }
}

// ========== 初始化 ==========
async function init() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await detectMarkingPage()) return;

    createMainButton();
    createSettingsPanel();

    // 检查更新（延迟 5 秒，避免影响页面主要功能加载）
    setTimeout(() => checkForUpdate(), 5000);

    if (sessionStorage.getItem('ai-grading-auto-resume') === 'true') {
        sessionStorage.removeItem('ai-grading-auto-resume');
        window.aiGradingState.errorRetryCount = parseInt(sessionStorage.getItem('ai-grading-retry-count') || '0');
        sessionStorage.removeItem('ai-grading-retry-count');
        setTimeout(() => toggleAutoGrading(), 3000);
    }

    // 检查是否有回评任务
    const regradeData = sessionStorage.getItem('ai-grading-regrade');
    if (regradeData) {
        try {
            const { id } = JSON.parse(regradeData);
            const record = HistoryManager.getById(id);
            if (record) {
                window.aiGradingState.isRegrading = true;
                showToast('正在加载回评数据...');
                setTimeout(async () => {
                    // 等待图片加载
                    const imgElements = document.querySelectorAll('div[name="topicImg"] img');
                    if (imgElements.length === 0) {
                        showAlertModal('未找到答题卡图片，无法回评。').then(() => {
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                        });
                        return;
                    }
                    const imageUrls = Array.from(imgElements).map(img => img.src);
                    const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
                    window.aiGradingState.currentBase64DataArray = base64DataArray;

                    showCorrectionPanel({
                        score: record.aiScore, comment: record.aiComment,
                        studentAnswer: record.studentAnswer, imageUrls,
                        base64DataArray, config: PresetManager.getCurrentConfig(),
                        onAccept(finalScore, correctionInfo) {
                            HistoryManager.update(id, {
                                finalScore, isCorrected: correctionInfo.isCorrected,
                                correctionReason: correctionInfo.correctionReason, status: 'submitted'
                            });
                            fillScore(finalScore, record.aiComment);
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                            showToast('回评完成！分数已填入。');
                        },
                        onCancel() {
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                            showToast('已取消回评');
                        }
                    });
                }, 3000);
            }
        } catch (e) {
            console.error('回评数据解析失败:', e);
            sessionStorage.removeItem('ai-grading-regrade');
        }
    }
}

console.log('🚀 智学网AI打分助手加载中...');
console.log(`📌 [诊断] 脚本版本: ${SCRIPT_CONFIG.VERSION} | 浏览器: ${navigator.userAgent.match(/(Chrome|Firefox|Edge)\/[\d.]+/)?.[0] || '未知'} | 时间: ${new Date().toLocaleString()}`);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 1000);
}

// URL 及 题号变化监听器 (轻量级轮询)
let lastUrlId = PresetManager.getTaskIdentifier();
setInterval(() => {
    const currentUrlId = PresetManager.getTaskIdentifier();
    if (currentUrlId !== lastUrlId) {
        lastUrlId = currentUrlId;

        if (window.aiGradingState.isRegrading) return;

        if (!window.aiGradingState.isRunning) {
            const boundPreset = PresetManager.data.bindings[currentUrlId];

            if (boundPreset && PresetManager.data.list[boundPreset]) {
                PresetManager.data.active = boundPreset;
                PresetManager.save();
                showToast(`✨ 检测到新试题，已自动切换至【${PresetManager.data.active}】方案`);
            } else if (PresetManager.data.active !== "默认配置" && PresetManager.data.list["默认配置"]) {
                PresetManager.data.active = "默认配置";
                PresetManager.save();
                showToast(`📝 未找到当前题目的专属方案，已恢复为【默认配置】`);
            }

            const select = document.getElementById('preset-select');
            if (select) {
                select.value = PresetManager.data.active;
                select.dispatchEvent(new Event('change'));
            }
        }
        setTimeout(init, 1000);
    }
}, 1000);


})();
