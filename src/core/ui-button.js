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
        .ai-history-btn {
            position: fixed; bottom: 95px; right: 40px; z-index: 99999;
            width: 44px; height: 44px; border-radius: 50%;
            background: rgba(255,255,255,0.9); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(0,0,0,0.08);
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
            cursor: pointer; font-size: 18px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-history-btn:hover {
            transform: translateY(-2px) scale(1.05);
            box-shadow: 0 8px 24px rgba(0,0,0,0.12);
            background: rgba(255,255,255,1);
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(btn);

    const histBtn = document.createElement('button');
    histBtn.className = 'ai-history-btn';
    histBtn.innerHTML = '📋';
    histBtn.title = '评阅历史';
    histBtn.onclick = () => showHistoryPanel();
    document.body.appendChild(histBtn);
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
