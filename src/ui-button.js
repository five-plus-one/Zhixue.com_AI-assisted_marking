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
                    // 将纠错后的提示词写回配置
                    if (correctionInfo.newAnswer || correctionInfo.newRubric) {
                        const cfg = PresetManager.getCurrentConfig();
                        if (correctionInfo.newAnswer) cfg.answer = correctionInfo.newAnswer;
                        if (correctionInfo.newRubric) cfg.rubric = correctionInfo.newRubric;
                        PresetManager.save();
                        showToast('提示词已更新');
                    }
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
