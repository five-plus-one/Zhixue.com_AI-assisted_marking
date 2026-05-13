// ========== 创建主按钮 ==========
function createMainButton() {
    if (document.querySelector('.ai-grade-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'ai-grade-btn';
    btn.innerHTML = 'AI 批改';
    btn.onclick = toggleAutoGrading;

    const style = document.createElement('style');
    style.textContent = `
        /* 样式隔离：重置可能被平台影响的属性 */
        .ai-grade-btn, .ai-history-btn, .ai-settings-btn {
            all: initial;
            position: fixed !important;
            z-index: 99999 !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif !important;
            box-sizing: border-box !important;
            pointer-events: auto !important;
            visibility: visible !important;
            display: flex !important;
            opacity: 1 !important;
        }

        .ai-grade-btn {
            bottom: 40px !important; right: 40px !important;
            padding: 14px 32px !important;
            background: rgba(20, 20, 20, 0.88) !important;
            backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
            color: #fff !important;
            border: 1.5px solid rgba(255,255,255,0.08) !important;
            border-radius: 40px !important;
            font-size: 14px !important; font-weight: 600 !important; letter-spacing: 0.3px !important;
            cursor: pointer !important;
            box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06) !important;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
            min-width: 140px !important; text-align: center !important;
            align-items: center !important; justify-content: center !important;
            line-height: 1 !important;
        }
        .ai-grade-btn:hover {
            transform: translateY(-2px) scale(1.02) !important;
            box-shadow: 0 16px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1) !important;
            background: rgba(0, 0, 0, 0.95) !important;
        }
        .ai-grade-btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; transform: none !important; box-shadow: none !important; }
        .ai-grade-btn.paused { border-color: rgba(230, 162, 60, 0.5) !important; background: rgba(30,30,30,0.92) !important; animation: btn-pulse-amber 2s infinite !important; }
        .ai-grade-btn.running { border-color: rgba(64, 158, 255, 0.5) !important; animation: btn-pulse-blue 2s infinite !important; }
        .ai-grade-btn.unattended { border-color: rgba(245, 108, 108, 0.5) !important; animation: btn-pulse-red 2s infinite !important; }
        .ai-grade-btn.trial { border-color: rgba(124, 58, 237, 0.5) !important; animation: btn-pulse-purple 2s infinite !important; }
        .ai-grade-btn.needs-save { background: rgba(245, 108, 108, 0.06) !important; color: #D93025 !important; border-color: rgba(217, 48, 37, 0.25) !important; box-shadow: none !important; animation: none !important; }

        @keyframes btn-pulse-blue { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(64,158,255,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(64,158,255,0); } }
        @keyframes btn-pulse-amber { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(230,162,60,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(230,162,60,0); } }
        @keyframes btn-pulse-red { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(245,108,108,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(245,108,108,0); } }
        @keyframes btn-pulse-purple { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(124,58,237,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(124,58,237,0); } }

        .ai-history-btn, .ai-settings-btn {
            right: 40px !important;
            width: 44px !important; height: 44px !important; border-radius: 50% !important;
            background: rgba(255,255,255,0.92) !important; backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(0,0,0,0.08) !important;
            box-shadow: 0 4px 16px rgba(0,0,0,0.08) !important;
            cursor: pointer !important;
            align-items: center !important; justify-content: center !important;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .ai-history-btn { bottom: 95px !important; }
        .ai-settings-btn { bottom: 150px !important; }
        .ai-history-btn:hover, .ai-settings-btn:hover {
            transform: translateY(-2px) scale(1.05) !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.12) !important;
            background: rgba(255,255,255,1) !important;
        }
        .ai-history-btn svg, .ai-settings-btn svg { width: 20px !important; height: 20px !important; color: #444 !important; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(btn);

    const histBtn = document.createElement('button');
    histBtn.className = 'ai-history-btn';
    histBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/><path d="M3 12h1"/><path d="M20 12h1"/><path d="M12 3v1"/><path d="M12 20v1"/></svg>';
    histBtn.title = '评阅历史';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'ai-settings-btn';
    settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
    settingsBtn.title = '批改配置';
    histBtn.onclick = () => showHistoryPanel();
    document.body.appendChild(histBtn);

    settingsBtn.onclick = () => {
        const panel = document.getElementById('ai-grading-settings');
        if (panel && panel.classList.contains('open')) {
            closeSettingsPanel();
        } else {
            openSettingsPanel();
        }
    };
    document.body.appendChild(settingsBtn);
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

// ========== 批阅份数进度显示 ==========
function renderBatchProgress() {
    const batch = window.aiGradingState.batchProgress;
    if (!batch.enabled) {
        // 如果未启用，移除进度条
        const existing = document.getElementById('ai-batch-progress');
        if (existing) existing.remove();
        return;
    }

    let container = document.getElementById('ai-batch-progress');
    if (!container) {
        // 创建进度条容器
        container = document.createElement('div');
        container.id = 'ai-batch-progress';
        document.body.appendChild(container);

        // 注入样式
        const style = document.createElement('style');
        style.id = 'ai-batch-progress-style';
        style.textContent = `
            #ai-batch-progress {
                position: fixed !important;
                top: 0 !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                z-index: 99998 !important;
                background: rgba(255, 255, 255, 0.95) !important;
                backdrop-filter: blur(12px) !important;
                border-bottom: 1px solid rgba(0,0,0,0.08) !important;
                box-shadow: 0 2px 12px rgba(0,0,0,0.06) !important;
                padding: 8px 20px !important;
                display: flex !important;
                align-items: center !important;
                gap: 12px !important;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif !important;
                border-radius: 0 0 12px 12px !important;
                min-width: 300px !important;
            }
            #ai-batch-progress .progress-text {
                font-size: 13px !important;
                font-weight: 500 !important;
                color: #1a1a1a !important;
                white-space: nowrap !important;
            }
            #ai-batch-progress .progress-bar {
                flex: 1 !important;
                height: 8px !important;
                background: rgba(0,0,0,0.08) !important;
                border-radius: 4px !important;
                overflow: hidden !important;
            }
            #ai-batch-progress .progress-fill {
                height: 100% !important;
                background: #0052FF !important;
                border-radius: 4px !important;
                transition: width 0.3s ease !important;
            }
            #ai-batch-progress .progress-fill.complete {
                background: #34A853 !important;
            }
            #ai-batch-progress .progress-btn {
                padding: 4px 10px !important;
                font-size: 11px !important;
                font-weight: 500 !important;
                border: 1px solid rgba(0,0,0,0.12) !important;
                border-radius: 6px !important;
                background: transparent !important;
                color: #666 !important;
                cursor: pointer !important;
                transition: all 0.2s !important;
            }
            #ai-batch-progress .progress-btn:hover {
                background: rgba(0,0,0,0.04) !important;
                color: #1a1a1a !important;
            }
        `;
        document.head.appendChild(style);
    }

    const current = batch.currentCount;
    const target = batch.targetCount;
    const percent = target > 0 ? Math.min((current / target) * 100, 100) : 0;
    const isComplete = target > 0 && current >= target;

    container.innerHTML = `
        <span class="progress-text">📊 批阅进度: ${current}/${target} (${Math.round(percent)}%)</span>
        <div class="progress-bar">
            <div class="progress-fill${isComplete ? ' complete' : ''}" style="width: ${percent}%"></div>
        </div>
        <button class="progress-btn" onclick="resetBatchProgress()">重置</button>
    `;
}

// ========== 主按钮点击逻辑 ==========
function toggleAutoGrading() {
    const btn = document.querySelector('.ai-grade-btn');
    btn.disabled = true;
    setTimeout(() => btn.disabled = false, 800);

    if (window.aiGradingState.hasUnsavedChanges) {
        safeAlert('配置已修改，请先点击配置面板上的【保存】按钮。');
        openSettingsPanel();
        const saveBtn = document.getElementById('save-config-btn');
        if (saveBtn) {
            saveBtn.style.transform = 'scale(1.02)';
            setTimeout(() => saveBtn.style.transform = 'scale(1)', 200);
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

        closeSettingsPanel();
        startAutoGrading();
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
