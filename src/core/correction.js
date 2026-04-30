// ========== 分数纠错模块 ==========

function showCorrectionPanel(context) {
    // context: { score, comment, studentAnswer, imageUrls, base64DataArray, config, onAccept(finalScore, correctionInfo), onCancel }
    ensureModalStyles();
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.id = 'correction-panel';
    overlay.style.zIndex = '999998';

    const imagesHtml = (context.base64DataArray || []).map(b64 =>
        `<img src="data:image/png;base64,${b64}" style="width:100%;border-radius:10px;margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">`
    ).join('');

    overlay.innerHTML = `
        <style>
            .cor-container {
                width: 900px; max-width: 94vw; max-height: 85vh;
                background: rgba(255,255,255,0.95);
                backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255,255,255,0.6); border-radius: 20px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                display: grid; grid-template-columns: 340px 1fr; overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                animation: ai-modal-scalein 0.3s cubic-bezier(0.16,1,0.3,1);
            }
            .cor-left {
                background: rgba(0,0,0,0.02); border-right: 1px solid rgba(0,0,0,0.06);
                overflow-y: auto; padding: 28px; max-height: 85vh;
            }
            .cor-left::-webkit-scrollbar { width: 4px; }
            .cor-left::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
            .cor-left-label {
                font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
                color: #86868b; font-weight: 600; margin-bottom: 16px;
            }
            .cor-right {
                display: flex; flex-direction: column; overflow: hidden; max-height: 85vh;
            }
            .cor-header {
                padding: 20px 28px 16px; border-bottom: 1px solid rgba(0,0,0,0.06);
                display: flex; justify-content: space-between; align-items: center;
                font-size: 16px; font-weight: 600; color: #1d1d1f;
            }
            .cor-header-close {
                background: transparent; border: none; font-size: 20px; cursor: pointer;
                color: #666; padding: 4px 8px; border-radius: 6px; transition: all 0.2s;
            }
            .cor-header-close:hover { background: rgba(0,0,0,0.04); color: #1a1a1a; }
            .cor-body {
                flex: 1; overflow-y: auto; padding: 24px 28px;
            }
            .cor-body::-webkit-scrollbar { width: 4px; }
            .cor-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.15); border-radius: 4px; }
            .cor-footer {
                padding: 16px 28px 20px; border-top: 1px solid rgba(0,0,0,0.06);
                display: flex; justify-content: flex-end; gap: 12px;
                background: rgba(255,255,255,0.3);
            }
            .cor-footer button {
                padding: 10px 24px; border: none; border-radius: 10px;
                font-size: 14px; font-weight: 500; cursor: pointer;
                transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .cor-footer-between { justify-content: space-between; }
            .cor-score-block { margin-bottom: 20px; }
            .cor-score-label {
                font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px;
                color: #86868b; font-weight: 600; margin-bottom: 4px;
            }
            .cor-score-value { font-size: 36px; font-weight: 700; color: #1d1d1f; }
            .cor-answer-block {
                font-size: 13px; color: #4a4a4a; line-height: 1.6;
                font-family: 'SF Mono', monospace; background: rgba(0,0,0,0.02);
                padding: 12px; border-radius: 10px; max-height: 100px; overflow-y: auto;
                border: 1px solid rgba(0,0,0,0.04);
            }
            .cor-field-label {
                display: block; margin-bottom: 6px; color: #666; font-size: 12px; font-weight: 500;
            }
            .cor-input {
                width: 100%; padding: 10px 12px; background: rgba(0,0,0,0.02);
                border: 1px solid rgba(0,0,0,0.1); border-radius: 8px; font-size: 13px;
                box-sizing: border-box; transition: all 0.2s; font-family: inherit;
            }
            .cor-input:focus {
                outline: none; border-color: #0052FF; background: #fff;
                box-shadow: 0 0 0 3px rgba(0,82,255,0.1);
            }
            .cor-textarea { min-height: 70px; resize: vertical; }
            .cor-stream-box {
                font-family: 'SF Mono', 'JetBrains Mono', Consolas, monospace;
                font-size: 12px; color: #4a4a4a; line-height: 1.7;
                max-height: 200px; overflow-y: auto; white-space: pre-wrap;
                background: rgba(0,0,0,0.02); padding: 14px; border-radius: 10px;
                border: 1px solid rgba(0,0,0,0.06);
            }
            @keyframes cor-slidein {
                from { opacity: 0; transform: translateX(12px); }
                to { opacity: 1; transform: translateX(0); }
            }
            .cor-step-enter { animation: cor-slidein 0.25s ease-out; }
        </style>
        <div class="cor-container">
            <div class="cor-left">
                <div class="cor-left-label">学生答题卡</div>
                ${imagesHtml || '<div style="color:#aaa;font-size:13px;">无图片</div>'}
            </div>
            <div class="cor-right">
                <div class="cor-header">
                    <span id="cor-step-title">分数纠错</span>
                    <button class="cor-header-close" id="cor-close-btn">&times;</button>
                </div>
                <div class="cor-body" id="cor-step-body"></div>
                <div class="cor-footer" id="cor-step-footer"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#cor-close-btn').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
    overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (context.onCancel) context.onCancel(); } };

    let currentStep = 1;
    let feedback = null;
    let analysisResult = null;

    function render() {
        const body = document.getElementById('cor-step-body');
        const footer = document.getElementById('cor-step-footer');
        const title = document.getElementById('cor-step-title');
        if (!body || !footer) return;
        body.className = 'cor-body cor-step-enter';
        if (currentStep === 1) renderStep1(title, body, footer);
        else if (currentStep === 2) renderStep2(title, body, footer);
    }

    // ===== 步骤1：教师反馈 =====
    function renderStep1(title, body, footer) {
        title.textContent = '分数纠错';
        body.innerHTML = `
            <div class="cor-score-block">
                <div class="cor-score-label">AI 评分</div>
                <div class="cor-score-value">${context.score}</div>
            </div>
            <div style="margin-bottom:20px;">
                <div class="cor-score-label">识别答案</div>
                <div class="cor-answer-block">${context.studentAnswer || '未能识别'}</div>
            </div>
            <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:16px;">
                <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:14px;">教师反馈</div>
                <div style="margin-bottom:14px;">
                    <label class="cor-field-label">正确得分</label>
                    <input id="cor-teacher-score" class="cor-input" type="number" style="width:120px;" placeholder="分数">
                </div>
                <div>
                    <label class="cor-field-label">评分理由</label>
                    <textarea id="cor-teacher-reason" class="cor-input cor-textarea" placeholder="解释为什么应该是这个分数..."></textarea>
                </div>
            </div>
        `;
        footer.innerHTML = `
            <button class="ai-modal-btn-cancel" id="cor-cancel">取消</button>
            <button class="ai-modal-btn-confirm" id="cor-next">下一步分析</button>
        `;
        footer.className = 'cor-footer';

        footer.querySelector('#cor-cancel').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        footer.querySelector('#cor-next').onclick = e => {
            e.stopPropagation();
            const scoreVal = body.querySelector('#cor-teacher-score').value;
            const reasonVal = body.querySelector('#cor-teacher-reason').value.trim();
            if (!scoreVal && scoreVal !== 0) { showAlertModal('请输入正确得分'); return; }
            feedback = { teacherScore: parseFloat(scoreVal), teacherReason: reasonVal || '未说明理由' };
            currentStep = 2;
            render();
        };
    }

    // ===== 步骤2：AI分析 + 提示词建议 =====
    function renderStep2(title, body, footer) {
        title.textContent = '提示词优化';
        body.innerHTML = `
            <div id="cor-analysis-stream" class="cor-stream-box" style="margin-bottom:16px;">AI分析中...</div>
            <div id="cor-reason" style="font-size:13px;color:#666;margin-bottom:16px;display:none;"></div>
            <div id="cor-edit-section" style="display:none;">
                <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">建议修改</div>
                <div style="margin-bottom:12px;">
                    <label class="cor-field-label">参考答案</label>
                    <textarea id="cor-new-answer" class="cor-input cor-textarea"></textarea>
                </div>
                <div style="margin-bottom:12px;">
                    <label class="cor-field-label">评分标准</label>
                    <textarea id="cor-new-rubric" class="cor-input cor-textarea"></textarea>
                </div>
            </div>
        `;
        footer.innerHTML = `
            <button class="ai-modal-btn-cancel" id="cor-cancel2">取消</button>
            <button class="ai-modal-btn-confirm" id="cor-confirm-score" style="display:none;">应用修改并确认得分</button>
        `;
        footer.className = 'cor-footer';

        footer.querySelector('#cor-cancel2').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };

        startAnalysis();
    }

    async function startAnalysis() {
        const streamEl = document.getElementById('cor-analysis-stream');
        try {
            const rawText = await analyzePromptModification(context, feedback, streamed => {
                if (streamEl) streamEl.textContent = streamed;
            });
            analysisResult = parsePromptModification(rawText);

            if (streamEl) streamEl.style.display = 'none';
            const reasonEl = document.getElementById('cor-reason');
            if (reasonEl) { reasonEl.style.display = 'block'; reasonEl.textContent = '修改理由：' + (analysisResult.reason || '无'); }

            const editSection = document.getElementById('cor-edit-section');
            if (editSection) editSection.style.display = 'block';

            const answerEl = document.getElementById('cor-new-answer');
            if (answerEl) answerEl.value = analysisResult.answer !== '不变' ? analysisResult.answer : (context.config.answer || '');
            const rubricEl = document.getElementById('cor-new-rubric');
            if (rubricEl) rubricEl.value = analysisResult.rubric !== '不变' ? analysisResult.rubric : (context.config.rubric || '');

            const confirmBtn = document.getElementById('cor-confirm-score');
            if (confirmBtn) {
                confirmBtn.style.display = '';
                confirmBtn.onclick = e => {
                    e.stopPropagation();
                    const newAnswer = document.getElementById('cor-new-answer')?.value;
                    const newRubric = document.getElementById('cor-new-rubric')?.value;
                    console.log(`📝 [纠错] 确认提交 — 教师分数: ${feedback.teacherScore}, 新答案长度: ${(newAnswer||'').length}, 新标准长度: ${(newRubric||'').length}`);
                    const correctionInfo = {
                        isCorrected: true,
                        correctionReason: `教师纠正：AI${context.score}分→正确${feedback.teacherScore}分。${feedback.teacherReason}`,
                        newAnswer, newRubric
                    };
                    cleanup();
                    if (context.onAccept) context.onAccept(feedback.teacherScore, correctionInfo);
                };
            }
        } catch (err) {
            if (streamEl) streamEl.textContent = '分析失败：' + err.message;
        }
    }

    function cleanup() {
        overlay.remove();
    }

    render();
}

// ========== AI 提示词修改分析 ==========
function analyzePromptModification(context, feedback, onStreamUpdate) {
    const originalPrompt = buildPrompt(context.config);
    const analysisPrompt = `你是一位阅卷提示词优化专家。教师对AI的评分结果提出了异议，请分析并建议修改评分提示词。

**原始评分提示词：**
${originalPrompt}

**学生答题图片中的OCR答案：**
${context.studentAnswer}

**AI给出的评分：**
分数：${context.score}，评语：${context.comment}

**教师认为正确的评分：**
分数：${feedback.teacherScore}，理由：${feedback.teacherReason}

请分析差异原因，并返回修改后的提示词各部分：
1. 如果需要修改参考答案，请给出新的参考答案
2. 如果需要修改评分标准，请给出新的评分标准
3. 如果需要修改题目内容，请给出新的题目内容
4. 简要说明修改理由

按以下格式返回（必须严格按此格式）：
修改理由：[分析差异的原因]
新题目内容：[如需修改则填写，否则写"不变"]
新参考答案：[如需修改则填写，否则写"不变"]
新评分标准：[如需修改则填写，否则写"不变"]`;

    return callAI(analysisPrompt, context.base64DataArray, context.config, onStreamUpdate);
}
