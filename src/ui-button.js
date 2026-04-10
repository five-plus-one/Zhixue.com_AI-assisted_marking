// ========== 全局状态 ==========
window.aiGradingState = {
    isRunning: false, isPaused: false, currentStudentAnswer: '', currentImageUrls: [],
    abortController: null, countdownPaused: false, autoRefreshOn403: true,
    unattendedMode: false, errorRetryCount: 0, maxRetries: 3,
    hasUnsavedChanges: false
};

function safeAlert(message) {
    if (window.aiGradingState.unattendedMode) {
        console.log('📢 [静默提示]', message);
    } else {
        alert(message);
    }
}

// ========== 创建主按钮 ==========
function createMainButton() {
    if (document.querySelector('.ai-grade-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'ai-grade-btn';
    btn.innerHTML = '✨ 开始AI打分';
    btn.onclick = toggleAutoGrading;

    const style = document.createElement('style');
    style.textContent = `
        .ai-grade-btn { position: fixed; bottom: 150px; right: 30px; z-index: 99999 !important; padding: 18px 35px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 30px; font-size: 20px; font-weight: bold; cursor: pointer; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.6); transition: all 0.3s ease; min-width: 180px; }
        .ai-grade-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 15px 35px rgba(102, 126, 234, 0.8); }
        .ai-grade-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ai-grade-btn.paused { background: linear-gradient(135deg, #F56C6C 0%, #E6A23C 100%); animation: pulse-pause 1.5s infinite; }
        .ai-grade-btn.running { background: linear-gradient(135deg, #67C23A 0%, #409EFF 100%); animation: pulse-running 2s infinite; }
        .ai-grade-btn.unattended { background: linear-gradient(135deg, #E6A23C 0%, #F56C6C 100%); animation: pulse-unattended 2s infinite; }
        .ai-grade-btn.needs-save { background: linear-gradient(135deg, #909399 0%, #606266 100%) !important; box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important; animation: none !important; border: 2px solid #F56C6C;}
        @keyframes pulse-pause { 0%, 100% { box-shadow: 0 10px 30px rgba(245, 108, 108, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); transform: scale(1.02); } }
        @keyframes pulse-running { 0%, 100% { box-shadow: 0 10px 30px rgba(103, 194, 58, 0.6); } 50% { box-shadow: 0 10px 40px rgba(103, 194, 58, 0.9); } }
        @keyframes pulse-unattended { 0%, 100% { box-shadow: 0 10px 30px rgba(230, 162, 60, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); } }
        .toast-notification { position: fixed; top: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 12px 24px; border-radius: 30px; z-index: 100000; font-size: 14px; transition: opacity 0.5s; pointer-events: none;}
    `;
    document.head.appendChild(style);
    document.body.appendChild(btn);
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
}

// ========== 未保存状态管理 ==========
function markUnsavedChanges() {
    if (!window.aiGradingState.hasUnsavedChanges) {
        window.aiGradingState.hasUnsavedChanges = true;

        const btn = document.querySelector('.ai-grade-btn');
        if (btn && !window.aiGradingState.isRunning) {
            btn.textContent = '⚠️ 请先保存配置';
            btn.classList.add('needs-save');
        }

        const saveBtn = document.getElementById('save-config-btn');
        if (saveBtn) {
            saveBtn.classList.add('highlight-save');
            saveBtn.innerHTML = '💾 保存修改 <span style="font-size:12px;opacity:0.8;">(未保存)</span>';
        }
    }
}

function clearUnsavedChanges() {
    window.aiGradingState.hasUnsavedChanges = false;

    const btn = document.querySelector('.ai-grade-btn');
    if (btn && !window.aiGradingState.isRunning) {
        btn.textContent = '✨ 开始AI打分';
        btn.classList.remove('needs-save');
    }

    const saveBtn = document.getElementById('save-config-btn');
    if (saveBtn) {
        saveBtn.classList.remove('highlight-save');
        saveBtn.innerHTML = '💾 保存当前方案并启用';
    }
}

// ========== 主按钮点击逻辑 ==========
function toggleAutoGrading() {
    const btn = document.querySelector('.ai-grade-btn');
    btn.disabled = true;
    setTimeout(() => btn.disabled = false, 800);

    if (window.aiGradingState.hasUnsavedChanges) {
        safeAlert('⚠️ 检测到配置已被修改，请先点击配置面板上的【保存】按钮！');
        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.style.display = 'block';
            panel.classList.remove('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) minimizeBtn.textContent = '−';
            const saveBtn = document.getElementById('save-config-btn');
            if (saveBtn) {
                saveBtn.style.transform = 'scale(1.05)';
                setTimeout(() => saveBtn.style.transform = 'scale(1)', 200);
            }
        }
        return;
    }

    if (window.aiGradingState.isRunning) {
        window.aiGradingState.isPaused = true;
        window.aiGradingState.isRunning = false;
        if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();

        btn.textContent = '▶️ 继续AI打分';
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
        window.aiGradingState.unattendedMode = config.unattendedMode || false;

        if (window.aiGradingState.unattendedMode) {
            btn.textContent = '🤖 无人值守中...';
            btn.classList.remove('paused');
            btn.classList.add('running', 'unattended');
        } else {
            btn.textContent = '⏸️ 暂停AI打分';
            btn.classList.remove('paused', 'unattended');
            btn.classList.add('running');
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
                #ai-stream-panel { position:fixed; bottom:220px; right:30px; width:360px; background:white; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2); padding:20px; z-index:99998; font-family:-apple-system, sans-serif; border: 2px solid #409EFF; transition: opacity 0.3s;}
                #ai-stream-panel h4 { margin:0 0 12px 0; color:#409EFF; font-size:16px; display:flex; align-items:center;}
                #ai-stream-panel .loading-dots::after { content: ''; animation: dots 1.5s steps(4, end) infinite;}
                @keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }
                #ai-stream-content { font-size:14px; color:#606266; line-height:1.6; max-height:250px; overflow-y:auto; white-space:pre-wrap; background: #f5f7fa; padding: 12px; border-radius: 6px; border: 1px solid #EBEEF5;}
            </style>
            <h4>🤖 AI 正在实时阅卷<span class="loading-dots"></span></h4>
            <div id="ai-stream-content">连接已建立，等待数据...</div>
        `;
        document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    panel.querySelector('#ai-stream-content').textContent = '连接已建立，等待数据...';
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
    if (panel) panel.style.display = 'none';
}

// ========== 停止打分 ==========
function stopAutoGrading() {
    window.aiGradingState.isRunning = false;
    window.aiGradingState.isPaused = false;
    window.aiGradingState.unattendedMode = false;
    window.aiGradingState.errorRetryCount = 0;
    if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();

    const btn = document.querySelector('.ai-grade-btn');
    if (btn) { btn.textContent = '✨ 开始AI打分'; btn.classList.remove('running', 'paused', 'unattended'); }
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
    console.log(`🪟 [诊断] showAutoSubmitDialog 调用 — 分数: ${score}, 无人值守: ${window.aiGradingState.unattendedMode}`);

    window.aiGradingState.countdownPaused = false;
    const studentAnswer = window.aiGradingState.currentStudentAnswer;
    const imageUrls = window.aiGradingState.currentImageUrls || [];
    const countdownSeconds = window.aiGradingState.unattendedMode ? 1 : 5;

    const imagesHtml = imageUrls.map(url => `<img src="${url}" style="width: 100%; height: auto; display: block; border-bottom: 2px dashed #DCDFE6; margin-bottom: -2px;">`).join('');

    const dialog = document.createElement('div');
    dialog.id = 'auto-submit-dialog';
    dialog.innerHTML = `
        <style>
            #auto-submit-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999; background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); padding: 30px; width: 800px; max-width: 90vw; max-height: 90vh; overflow-y: auto; }
            #auto-submit-dialog h2 { margin: 0 0 20px 0; text-align: center; }
            #auto-submit-dialog .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            #auto-submit-dialog .student-image { border: 2px solid #DCDFE6; border-radius: 8px; overflow-y: auto; max-height: 500px; background: #f5f7fa; }
            #auto-submit-dialog .info-box { background: #f5f7fa; padding: 15px; border-radius: 8px; border-left: 4px solid #409EFF; margin-bottom: 15px; }
            #auto-submit-dialog .info-box h4 { margin: 0 0 10px 0; }
            #auto-submit-dialog .content { color: #606266; line-height: 1.6; max-height: 150px; overflow-y: auto; white-space: pre-wrap; }
            #auto-submit-dialog .score-display { font-size: 48px; font-weight: bold; color: #409EFF; text-align: center; }
            #auto-submit-dialog .countdown { font-size: 18px; color: #E6A23C; margin: 20px 0; font-weight: bold; text-align: center; }
            #auto-submit-dialog .buttons { display: flex; gap: 15px; margin-top: 25px; }
            #auto-submit-dialog button { flex: 1; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
            #auto-submit-dialog .confirm-btn { background: #67C23A; color: white; }
            #auto-submit-dialog .cancel-btn { background: #E6A23C; color: white; }
            #auto-submit-dialog .overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: -1; }
        </style>
        <div class="overlay"></div>
        <h2>✅ AI评分完成 ${window.aiGradingState.unattendedMode ? '(无人值守模式)' : ''}</h2>
        <div class="content-grid">
            <div class="student-image">${imagesHtml}</div>
            <div class="result-section">
                <div class="info-box"><h4>📝 识别答案</h4><div class="content">${studentAnswer}</div></div>
                <div class="info-box"><h4>💬 AI评语</h4><div class="content">${comment}</div></div>
                <div class="info-box" style="border-left-color: #67C23A;"><h4>🎯 得分</h4><div class="score-display">${score} 分</div></div>
            </div>
        </div>
        <div class="countdown" id="countdown-display">将在 <span id="countdown-number">${countdownSeconds}</span> 秒后自动提交</div>
        <div class="buttons">
            <button class="cancel-btn" id="pause-cancel-btn">⏸️ 暂停</button>
            <button class="confirm-btn" id="confirm-submit-btn">✓ 立即提交</button>
        </div>
    `;
    document.body.appendChild(dialog);
    console.log(`✅ [诊断] 弹窗已插入DOM，z-index: 999999，倒计时: ${countdownSeconds}秒`);

    dialog.querySelector('#pause-cancel-btn').addEventListener('click', () => {
        if (!window.aiGradingState.countdownPaused) {
            window.aiGradingState.countdownPaused = true;
            dialog.querySelector('#pause-cancel-btn').textContent = '✖ 取消并退出';
            dialog.querySelector('#countdown-display').innerHTML = '⏸️ 已暂停';
        } else {
            if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
            dialog.remove();
            stopAutoGrading();
        }
    });

    const confirmSubmitFn = () => {
        if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
        dialog.remove();

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
            if (window.aiGradingState.unattendedMode) stopAutoGrading();
        }
    };

    dialog.querySelector('#confirm-submit-btn').addEventListener('click', confirmSubmitFn);

    let countdown = countdownSeconds;
    dialog.countdownTimer = setInterval(() => {
        if (window.aiGradingState.countdownPaused) return;
        countdown--;
        const span = dialog.querySelector('#countdown-number');
        if (span) span.textContent = countdown;
        if (countdown <= 0) confirmSubmitFn();
    }, 1000);
}
