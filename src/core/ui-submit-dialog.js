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

function showAutoSubmitDialog(score, comment, subScores, extraInfo) {
    const oldDialog = document.getElementById('auto-submit-dialog');
    if (oldDialog) oldDialog.remove();

    const mode = window.aiGradingState.gradingMode;
    const scoringDetails = extraInfo?.scoringDetails || null;
    const dualEval = extraInfo?.dualEval || null;
    const rawScore = extraInfo?.rawScore || score;

    console.log(`🪟 [诊断] showAutoSubmitDialog 调用 — 分数: ${score}, 模式: ${mode}, 双评: ${!!dualEval}`);

    window.aiGradingState.countdownPaused = false;
    const studentAnswer = window.aiGradingState.currentStudentAnswer;
    const imageUrls = window.aiGradingState.currentImageUrls || [];
    const isUnattended = mode === 'unattended';
    const isTrial = mode === 'trial';
    const countdownSeconds = isUnattended ? 1 : 5;
    const showCountdown = !isTrial;
    const showCorrectionBtn = !isUnattended;

    const headerLabel = isTrial ? '试改确认' : '批改完成';
    const modeTag = isUnattended ? '<span style="color:#888;font-weight:normal;font-size:12px;margin-left:8px;">[自动模式]</span>'
                   : isTrial ? '<span style="color:#7c3aed;font-weight:normal;font-size:12px;margin-left:8px;">[试改模式]</span>' : '';

    const imagesHtml = imageUrls.map(url => `<img src="${url}" style="width: 100%; height: auto; display: block; border-bottom: 2px dashed rgba(0,0,0,0.06); margin-bottom: -2px;">`).join('');

    const correctionBtnHtml = showCorrectionBtn
        ? `<button class="asd-cancel-btn" id="correction-btn" style="color:#D93025;border-color:rgba(217,48,37,0.2);">分数有误</button>` : '';
    const pauseBtnHtml = isTrial ? '' : `<button class="asd-cancel-btn" id="pause-cancel-btn">暂停</button>`;
    const confirmLabel = isTrial ? '确认提交' : '立即提交';

    // 环形分数显示 — 根据分数计算百分比和颜色
    const maxScore = subScores && subScores.length > 0
        ? subScores.reduce((sum, sq) => sum + (sq.maxScore || 100), 0)
        : 100;
    const pct = Math.min(score / maxScore, 1);
    const circumference = 2 * Math.PI * 44;
    const dashoffset = circumference * (1 - pct);
    const scoreColor = pct >= 0.6 ? '#1d1d1f' : '#D93025';

    const countdownHtml = showCountdown
        ? `<div class="asd-countdown" id="countdown-display">
                <svg class="asd-countdown-ring" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="2.5"/>
                    <circle id="countdown-ring-fill" cx="18" cy="18" r="16" fill="none" stroke="#1d1d1f" stroke-width="2.5"
                        stroke-dasharray="100.53" stroke-dashoffset="0" stroke-linecap="round"
                        transform="rotate(-90 18 18)" style="transition: stroke-dashoffset 0.9s linear;"/>
                </svg>
                <span class="asd-countdown-num" id="countdown-number">${countdownSeconds}</span>
            </div>`
        : `<div class="asd-countdown" style="color:#7c3aed;font-size:12px;font-weight:500;">等待教师确认</div>`;

    const dialog = document.createElement('div');
    dialog.id = 'auto-submit-dialog';
    dialog.innerHTML = `
        <style>
            #auto-submit-dialog {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999;
                background: rgba(255, 255, 255, 0.92);
                backdrop-filter: blur(32px) saturate(180%);
                -webkit-backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.6);
                border-radius: 24px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                width: 880px; max-width: 94vw; max-height: 90vh; overflow: hidden;
                display: flex; flex-direction: column;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                animation: asd-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes asd-enter { from { transform: translate(-50%, -50%) scale(0.96); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
            .asd-header { padding: 20px 32px; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 15px; font-weight: 600; color: #1d1d1f; display: flex; align-items: center; background: transparent; }
            .asd-grid { display: grid; grid-template-columns: 1.1fr 0.9fr; overflow: hidden; flex: 1; }
            .asd-images { border-right: 1px solid rgba(0,0,0,0.06); overflow-y: auto; background: rgba(0,0,0,0.01); padding: 28px; max-height: 520px; }
            .asd-images img { border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,0.06); }
            .asd-result { padding: 28px 32px; overflow-y: auto; display: flex; flex-direction: column; gap: 20px; max-height: 520px; }

            .asd-score-wrap { display: flex; align-items: center; gap: 20px; }
            .asd-score-ring { width: 100px; height: 100px; position: relative; flex-shrink: 0; }
            .asd-score-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
            .asd-score-ring .ring-bg { fill: none; stroke: rgba(0,0,0,0.05); stroke-width: 5; }
            .asd-score-ring .ring-fill { fill: none; stroke: ${scoreColor}; stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1); }
            .asd-score-num { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 32px; font-weight: 700; color: ${scoreColor}; letter-spacing: -1px; }
            .asd-score-meta { display: flex; flex-direction: column; gap: 4px; }
            .asd-score-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #86868b; font-weight: 600; }

            .asd-info-block { display: flex; flex-direction: column; gap: 6px; }
            .asd-info-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: #86868b; font-weight: 600; }
            .asd-info-content { font-size: 13px; color: #4a4a4a; line-height: 1.6; white-space: pre-wrap; font-family: "SF Mono", "JetBrains Mono", Consolas, monospace; background: rgba(0,0,0,0.02); padding: 14px; border-radius: 10px; border: 1px solid rgba(0,0,0,0.04); }

            .asd-footer { padding: 16px 32px 20px; border-top: 1px solid rgba(0,0,0,0.06); background: rgba(255,255,255,0.4); display: flex; justify-content: space-between; align-items: center; }
            .asd-countdown { position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
            .asd-countdown-ring { width: 36px; height: 36px; position: absolute; top: 0; left: 0; }
            .asd-countdown-num { font-size: 12px; font-weight: 600; color: #1d1d1f; font-family: "SF Mono", monospace; }
            .asd-buttons { display: flex; gap: 10px; }
            .asd-buttons button { padding: 10px 24px; border: none; border-radius: 10px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
            .asd-cancel-btn { background: rgba(0,0,0,0.05); color: #1d1d1f; }
            .asd-cancel-btn:hover { background: rgba(0,0,0,0.09); }
            .asd-confirm-btn { background: #1d1d1f; color: white; box-shadow: 0 6px 16px rgba(0,0,0,0.12); }
            .asd-confirm-btn:hover { background: #000; transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0,0,0,0.18); }
            .asd-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.25); backdrop-filter: blur(6px); z-index: -1; animation: asd-overlay-in 0.3s ease-out; }
            @keyframes asd-overlay-in { from { opacity: 0; } to { opacity: 1; } }
        </style>
        <div class="asd-overlay"></div>
        <div class="asd-header">
            <span>${headerLabel} ${modeTag}</span>
        </div>
        <div class="asd-grid">
            <div class="asd-images">${imagesHtml}</div>
            <div class="asd-result">
                <div class="asd-score-wrap">
                    <div class="asd-score-ring">
                        <svg viewBox="0 0 100 100">
                            <circle class="ring-bg" cx="50" cy="50" r="44"/>
                            <circle class="ring-fill" cx="50" cy="50" r="44"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${circumference}"
                                style="transition: stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s;"/>
                        </svg>
                        <span class="asd-score-num">${score}</span>
                    </div>
                    <div class="asd-score-meta">
                        <div class="asd-score-label">最终得分</div>
                        ${subScores && subScores.length > 0 ? `<div style="font-size:12px;color:#86868b;">满分 ${maxScore}</div>` : ''}
                    </div>
                </div>
                ${subScores && subScores.length > 0 ? `
                <div class="asd-info-block">
                    <div class="asd-info-label">各小题得分</div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${subScores.map(sq => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                            <span style="font-size:13px;color:#1d1d1f;font-weight:500;">${sq.label}</span>
                            <span style="font-size:14px;font-weight:600;color:${sq.score >= sq.maxScore * 0.6 ? '#1d1d1f' : '#D93025'};">${sq.score !== null ? sq.score : '—'}<span style="font-size:11px;color:#86868b;font-weight:normal;">/${sq.maxScore}</span></span>
                        </div>
                        ${sq.comment ? `<div style="font-size:12px;color:#666;padding:0 12px 2px;">${sq.comment}</div>` : ''}
                        `).join('')}
                    </div>
                </div>` : ''}
                ${scoringDetails && scoringDetails['评分依据'] ? `
                <div class="asd-info-block">
                    <div class="asd-info-label">评分依据</div>
                    <div class="asd-info-content" style="max-height:120px;overflow-y:auto;">${scoringDetails['评分依据']}</div>
                </div>` : ''}
                ${scoringDetails && scoringDetails['分数计算'] ? `
                <div class="asd-info-block">
                    <div class="asd-info-label">分数计算</div>
                    <div class="asd-info-content" style="font-weight:600;">${scoringDetails['分数计算']}</div>
                </div>` : ''}
                ${dualEval ? `
                <div class="asd-info-block">
                    <div class="asd-info-label">双评结果</div>
                    <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                            <span style="font-size:12px;color:#666;">分差</span>
                            <span style="font-size:13px;font-weight:600;color:${(dualEval.diff || 0) > 2 ? '#D93025' : '#1d1d1f'};">${dualEval.diff !== null ? dualEval.diff + '分' : '—'}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="font-size:12px;color:#666;">判定结果</span>
                            <span style="font-size:12px;font-weight:500;color:${dualEval.result === 'consensus' ? '#34A853' : dualEval.result === 'arbitration' ? '#7c3aed' : '#86868b'};">${
                                dualEval.result === 'consensus' ? '✓ 共识' :
                                dualEval.result === 'arbitration' ? '⚠ 三评仲裁' :
                                dualEval.result === 'fallback-a' ? '使用老师A' :
                                dualEval.result === 'fallback-b' ? '使用老师B' : dualEval.result
                            }</span>
                        </div>
                    </div>
                </div>
                <div class="asd-info-block">
                    <div class="asd-info-label">老师A 评分</div>
                    <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                            <span style="font-size:12px;color:#666;">得分</span>
                            <span style="font-size:14px;font-weight:600;">${dualEval.scoreA !== null ? dualEval.scoreA + '分' : '失败'}</span>
                        </div>
                        ${dualEval.detailA ? `
                        <div style="margin-bottom:6px;">
                            <div style="font-size:11px;color:#86868b;margin-bottom:4px;">评分依据</div>
                            <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${dualEval.detailA['评分依据'] || '—'}</div>
                        </div>` : ''}
                        ${dualEval.detailA && dualEval.detailA['分数计算'] ? `
                        <div>
                            <div style="font-size:11px;color:#86868b;margin-bottom:4px;">分数计算</div>
                            <div style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;border:1px solid rgba(0,0,0,0.04);">${dualEval.detailA['分数计算']}</div>
                        </div>` : ''}
                    </div>
                </div>
                <div class="asd-info-block">
                    <div class="asd-info-label">老师B 评分</div>
                    <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                            <span style="font-size:12px;color:#666;">得分</span>
                            <span style="font-size:14px;font-weight:600;">${dualEval.scoreB !== null ? dualEval.scoreB + '分' : '失败'}</span>
                        </div>
                        ${dualEval.detailB ? `
                        <div style="margin-bottom:6px;">
                            <div style="font-size:11px;color:#86868b;margin-bottom:4px;">评分依据</div>
                            <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${dualEval.detailB['评分依据'] || '—'}</div>
                        </div>` : ''}
                        ${dualEval.detailB && dualEval.detailB['分数计算'] ? `
                        <div>
                            <div style="font-size:11px;color:#86868b;margin-bottom:4px;">分数计算</div>
                            <div style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;border:1px solid rgba(0,0,0,0.04);">${dualEval.detailB['分数计算']}</div>
                        </div>` : ''}
                    </div>
                </div>
                ${dualEval.result === 'arbitration' ? `
                <div class="asd-info-block">
                    <div class="asd-info-label">仲裁结果</div>
                    <div style="padding:10px 14px;background:rgba(124,58,237,0.04);border-radius:8px;border:1px solid rgba(124,58,237,0.12);">
                        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                            <span style="font-size:12px;color:#7c3aed;">仲裁得分</span>
                            <span style="font-size:14px;font-weight:600;color:#7c3aed;">${dualEval.arbScore !== undefined ? dualEval.arbScore + '分' : '—'}</span>
                        </div>
                        ${dualEval.arbAnalysis ? `
                        <div>
                            <div style="font-size:11px;color:#86868b;margin-bottom:4px;">仲裁分析</div>
                            <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${dualEval.arbAnalysis}</div>
                        </div>` : ''}
                    </div>
                </div>` : ''}
                ` : ''}
                <div class="asd-info-block"><div class="asd-info-label">识别答案</div><div class="asd-info-content">${studentAnswer}</div></div>
                ${comment ? `<div class="asd-info-block"><div class="asd-info-label">评语</div><div class="asd-info-content">${comment}</div></div>` : ''}
            </div>
        </div>
        <div class="asd-footer">
            ${countdownHtml}
            <div class="asd-buttons">
                ${correctionBtnHtml}
                ${pauseBtnHtml}
                <button class="asd-confirm-btn" id="confirm-submit-btn">${confirmLabel}</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);

    // 环形分数动画
    requestAnimationFrame(() => {
        const ringFill = dialog.querySelector('.ring-fill');
        if (ringFill) ringFill.style.strokeDashoffset = dashoffset;
    });

    // "分数有误" 按钮
    if (showCorrectionBtn) {
        dialog.querySelector('#correction-btn').addEventListener('click', () => {
            if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
            dialog.remove();
            showCorrectionPanel({
                score, comment, studentAnswer, imageUrls,
                base64DataArray: window.aiGradingState.currentBase64DataArray || [],
                config: PresetManager.getCurrentConfig(),
                callConfig: PresetManager.getActiveCallConfig(),
                subScores,
                onAccept(finalScore, correctionInfo) {
                    const correctedSubScores = correctionInfo.correctedSubScores || subScores;
                    HistoryManager.add({
                        presetName: PresetManager.data.active,
                        gradingMode: mode,
                        imageUrls, studentAnswer,
                        aiScore: score, aiComment: comment,
                        finalScore, isCorrected: correctionInfo.isCorrected,
                        correctionReason: correctionInfo.correctionReason,
                        imageBase64s: window.aiGradingState.currentBase64DataArray || [],
                        subScores: correctedSubScores,
                        dualEval: dualEval || null
                    });
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
                    fillScore(finalScore, comment, correctedSubScores);
                },
                onCancel() {
                    showAutoSubmitDialog(score, comment, subScores);
                }
            });
        });
    }

    // "暂停" 按钮
    if (!isTrial) {
        dialog.querySelector('#pause-cancel-btn').addEventListener('click', () => {
            if (!window.aiGradingState.countdownPaused) {
                window.aiGradingState.countdownPaused = true;
                dialog.querySelector('#pause-cancel-btn').textContent = '撤销并退出';
                const cdDisplay = dialog.querySelector('#countdown-display');
                if (cdDisplay) cdDisplay.innerHTML = '<span style="font-size:12px;color:#86868b;">已暂停</span>';
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

        HistoryManager.add({
            presetName: PresetManager.data.active,
            gradingMode: mode,
            imageUrls, studentAnswer,
            aiScore: score, aiComment: comment,
            finalScore: score, isCorrected: false, correctionReason: '',
            imageBase64s: window.aiGradingState.currentBase64DataArray || [],
            subScores: subScores,
            dualEval: dualEval || null
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

    // 倒计时（环形进度）
    if (showCountdown) {
        let countdown = countdownSeconds;
        const ringFill = dialog.querySelector('#countdown-ring-fill');
        const totalDash = 100.53; // 2 * PI * 16
        dialog.countdownTimer = setInterval(() => {
            if (window.aiGradingState.countdownPaused) return;
            countdown--;
            const span = dialog.querySelector('#countdown-number');
            if (span) span.textContent = countdown;
            if (ringFill) ringFill.style.strokeDashoffset = totalDash * (1 - countdown / countdownSeconds);
            if (countdown <= 0) confirmSubmitFn();
        }, 1000);
    }
}
