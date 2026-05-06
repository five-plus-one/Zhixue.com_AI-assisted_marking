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
            background: rgba(20, 20, 20, 0.88);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            color: #fff;
            border: 1.5px solid rgba(255,255,255,0.08);
            border-radius: 40px;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            font-size: 14px; font-weight: 600; letter-spacing: 0.3px;
            cursor: pointer;
            box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06);
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            min-width: 140px; text-align: center;
        }
        .ai-grade-btn:hover {
            transform: translateY(-2px) scale(1.02);
            box-shadow: 0 16px 40px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.1);
            background: rgba(0, 0, 0, 0.95);
        }
        .ai-grade-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .ai-grade-btn.paused { border-color: rgba(230, 162, 60, 0.5); background: rgba(30,30,30,0.92); animation: btn-pulse-amber 2s infinite; }
        .ai-grade-btn.running { border-color: rgba(64, 158, 255, 0.5); animation: btn-pulse-blue 2s infinite; }
        .ai-grade-btn.unattended { border-color: rgba(245, 108, 108, 0.5); animation: btn-pulse-red 2s infinite; }
        .ai-grade-btn.trial { border-color: rgba(124, 58, 237, 0.5); animation: btn-pulse-purple 2s infinite; }
        .ai-grade-btn.needs-save { background: rgba(245, 108, 108, 0.06) !important; color: #D93025; border-color: rgba(217, 48, 37, 0.25); box-shadow: none !important; animation: none; }

        @keyframes btn-pulse-blue { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(64,158,255,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(64,158,255,0); } }
        @keyframes btn-pulse-amber { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(230,162,60,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(230,162,60,0); } }
        @keyframes btn-pulse-red { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(245,108,108,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(245,108,108,0); } }
        @keyframes btn-pulse-purple { 0%,100% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 0 rgba(124,58,237,0.3); } 50% { box-shadow: 0 12px 32px rgba(0,0,0,0.18), 0 0 0 6px rgba(124,58,237,0); } }

        .toast-notification {
            position: fixed; top: 24px; left: 50%; transform: translate(-50%, -20px);
            background: rgba(255,255,255,0.96);
            backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            color: #1a1a1a;
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(0,0,0,0.06);
            box-shadow: 0 8px 28px rgba(0,0,0,0.1);
            z-index: 1000020;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            font-size: 13px; font-weight: 500;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: none; opacity: 0;
            display: flex; align-items: center; gap: 8px; max-width: 400px;
        }
        .toast-notification.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
        .toast-notification .toast-close {
            background: none; border: none; color: #999; cursor: pointer; font-size: 16px;
            padding: 0 0 0 8px; line-height: 1; pointer-events: auto;
        }
        .toast-notification .toast-close:hover { color: #1a1a1a; }
        .toast-notification.success { border-left: 3px solid #34A853; }
        .toast-notification.error { border-left: 3px solid #D93025; }
        .toast-notification.info { border-left: 3px solid #0052FF; }

        .ai-history-btn, .ai-settings-btn {
            position: fixed; right: 40px; z-index: 99999;
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(255,255,255,0.92); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-history-btn { bottom: 95px; }
        .ai-settings-btn { bottom: 150px; }
        .ai-history-btn:hover, .ai-settings-btn:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            background: rgba(255,255,255,1);
        }
        .ai-history-btn svg, .ai-settings-btn svg { width: 20px; height: 20px; color: #444; }
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
