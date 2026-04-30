// ========== 通知提示 ==========

function safeAlert(message) {
    if (window.aiGradingState.gradingMode === 'unattended') {
        console.log('📢 [静默提示]', message);
    } else {
        showToast(message);
    }
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 400); }, 3000);
}
