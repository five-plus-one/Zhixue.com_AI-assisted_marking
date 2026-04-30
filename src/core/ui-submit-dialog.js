// ========== 填充分数及弹窗 ==========
function fillScore(score, comment, subScores) {
    const adapter = window.__AI_MARKER_ADAPTER__;
    let filled = false;
    if (adapter && adapter.fillScore) {
        filled = adapter.fillScore({ total: score, subScores: subScores });
    }
    if (!filled) {
        console.warn('未找到分数输入框，将直接弹出确认窗口');
        safeAlert(`AI打分结果：\n分数：${score}\n请手动输入分数！`);
    }
    showAutoSubmitDialog(score, comment, subScores);
}

function showAutoSubmitDialog(score, comment, subScores) {
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
                ${subScores && subScores.length > 0 ? `
                <div class="info-block">
                    <div class="info-block-label">各小题得分</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        ${subScores.map(sq => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:10px;border:1px solid rgba(0,0,0,0.04);">
                            <span style="font-size:13px;color:#1d1d1f;font-weight:500;">${sq.label}</span>
                            <span style="font-size:15px;font-weight:600;color:${sq.score >= sq.maxScore * 0.6 ? '#1d1d1f' : '#D93025'};">${sq.score !== null ? sq.score : '—'}<span style="font-size:11px;color:#86868b;font-weight:normal;">/${sq.maxScore}</span></span>
                        </div>
                        ${sq.comment ? `<div style="font-size:12px;color:#666;padding:0 14px 4px;">${sq.comment}</div>` : ''}
                        `).join('')}
                    </div>
                </div>` : ''}
                <div class="info-block"><div class="info-block-label">识别答案</div><div class="info-block-content">${studentAnswer}</div></div>
                ${comment ? `<div class="info-block"><div class="info-block-label">评语</div><div class="info-block-content">${comment}</div></div>` : ''}
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
                        correctionReason: correctionInfo.correctionReason,
                        imageBase64s: window.aiGradingState.currentBase64DataArray || [],
                        subScores: subScores
                    });
                    // 将纠错后的提示词写回配置
                    if (correctionInfo.newAnswer || correctionInfo.newRubric) {
                        const activeName = PresetManager.data.active;
                        const cfg = PresetManager.data.list[activeName];
                        if (cfg) {
                            if (correctionInfo.newAnswer) cfg.answer = correctionInfo.newAnswer;
                            if (correctionInfo.newRubric) cfg.rubric = correctionInfo.newRubric;
                            PresetManager.save();
                            showToast('提示词已更新');
                            const answerEl = document.getElementById('standard-answer');
                            const rubricEl = document.getElementById('grading-rubric');
                            if (answerEl) answerEl.value = cfg.answer;
                            if (rubricEl) rubricEl.value = cfg.rubric;
                        }
                    }
                    fillScore(finalScore, comment, subScores);
                },
                onCancel() {
                    showAutoSubmitDialog(score, comment, subScores);
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
            finalScore: score, isCorrected: false, correctionReason: '',
            imageBase64s: window.aiGradingState.currentBase64DataArray || [],
            subScores: subScores
        });

        const adapter = window.__AI_MARKER_ADAPTER__;
        const submitted = adapter && adapter.submitGrade ? adapter.submitGrade() : false;

        if (submitted) {
            if (window.aiGradingState.isRunning && !window.aiGradingState.isPaused) {
                console.log('已点击提交，正在等待下一份试卷...');
                const oldImgUrl = window.aiGradingState.currentImageUrls[0];

                if (adapter && adapter.waitForNextPaper) {
                    adapter.waitForNextPaper(oldImgUrl).then(hasNext => {
                        if (hasNext) {
                            console.log('继续批改...');
                            setTimeout(startAutoGrading, 500);
                        } else {
                            stopAutoGrading();
                            safeAlert('加载下一份试卷超时，已自动停止，请手动检查网络。');
                        }
                    });
                } else {
                    setTimeout(startAutoGrading, 500);
                }
            } else {
                window.aiGradingState.isRunning = false;
            }
        } else {
            console.warn('未找到提交按钮，无法自动提交');
            safeAlert('分数已填，但未找到页面的提交按钮');
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
