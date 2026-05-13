// ========== 通知提示 ==========

/**
 * 确保 Toast 样式已注入（懒注入，避免依赖 createMainButton）
 */
function ensureToastStyles() {
    if (document.getElementById('ai-toast-styles')) return;
    const s = document.createElement('style');
    s.id = 'ai-toast-styles';
    s.textContent = `
        .toast-notification {
            all: initial;
            position: fixed !important;
            top: 24px !important; left: 50% !important;
            transform: translate(-50%, -20px) !important;
            background: rgba(255,255,255,0.96) !important;
            backdrop-filter: blur(16px) !important; -webkit-backdrop-filter: blur(16px) !important;
            color: #1a1a1a !important;
            padding: 12px 20px !important;
            border-radius: 12px !important;
            border: 1px solid rgba(0,0,0,0.06) !important;
            box-shadow: 0 8px 28px rgba(0,0,0,0.1) !important;
            z-index: 1000020 !important;
            font-size: 13px !important; font-weight: 500 !important;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif !important;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
            pointer-events: none !important; opacity: 0 !important;
            display: flex !important;
            align-items: center !important; gap: 8px !important; max-width: 400px !important;
            line-height: 1.4 !important;
        }
        .toast-notification.show {
            opacity: 1 !important;
            transform: translate(-50%, 0) !important;
            pointer-events: auto !important;
        }
        .toast-notification .toast-close {
            background: none !important; border: none !important; color: #999 !important;
            cursor: pointer !important; font-size: 16px !important;
            padding: 0 0 0 8px !important; line-height: 1 !important; pointer-events: auto !important;
        }
        .toast-notification .toast-close:hover { color: #1a1a1a !important; }
        .toast-notification.success { border-left: 3px solid #34A853 !important; }
        .toast-notification.error   { border-left: 3px solid #D93025 !important; }
        .toast-notification.info    { border-left: 3px solid #0052FF !important; }

        .toast-notification {
            background: #fff !important;
            color: #172033 !important;
            border: 1px solid #e1e6ef !important;
            border-radius: 10px !important;
            box-shadow: 0 16px 42px rgba(18,28,45,0.18), 0 2px 8px rgba(18,28,45,0.08) !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif !important;
            font-weight: 700 !important;
        }
        .toast-notification span { color: #172033 !important; }
        .toast-notification .toast-close { color: #667085 !important; }
        .toast-notification .toast-close:hover { color: #172033 !important; }
        .toast-notification.success { border-left: 4px solid #287047 !important; }
        .toast-notification.error { border-left: 4px solid #c2352b !important; }
        .toast-notification.info { border-left: 4px solid #2166ad !important; }
    `;
    document.head.appendChild(s);
}

function safeAlert(message) {
    if (window.aiGradingState.gradingMode === 'unattended') {
        console.log('📢 [静默提示]', message);
    } else {
        showToast(message);
    }
}

/**
 * 显示 Toast 通知
 * @param {string} msg - 消息内容
 * @param {'info'|'success'|'error'} type - 类型，默认 'info'
 */
function showToast(msg, type = 'info') {
    ensureToastStyles();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.innerHTML = `<span style="flex:1;">${msg}</span><button class="toast-close">&times;</button>`;
    document.body.appendChild(toast);

    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.onclick = () => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    };

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
