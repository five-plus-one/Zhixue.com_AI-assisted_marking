// ========== 通知提示 ==========

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
