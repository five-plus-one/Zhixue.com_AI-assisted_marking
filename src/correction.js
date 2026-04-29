// ========== 分数纠错模块 ==========

function showCorrectionPanel(context) {
    // context: { score, comment, studentAnswer, imageUrls, base64DataArray, config, onAccept(finalScore, correctionInfo), onCancel }
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.id = 'correction-panel';
    document.body.appendChild(overlay);

    let currentStep = 1;
    let feedback = null;
    let analysisResult = null;
    let newResult = null;

    function render() {
        if (currentStep === 1) renderStep1();
        else if (currentStep === 2) renderStep2();
        else if (currentStep === 3) renderStep3();
    }

    // ===== 步骤1：教师反馈 =====
    function renderStep1() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:600px;">
                <div class="ai-modal-header">分数纠错</div>
                <div class="ai-modal-body">
                    <div style="display:flex;gap:20px;margin-bottom:20px;">
                        <div style="flex:1;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#86868b;font-weight:600;margin-bottom:6px;">AI评分</div>
                            <div style="font-size:36px;font-weight:700;color:#1d1d1f;">${context.score}</div>
                        </div>
                        <div style="flex:2;">
                            <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.8px;color:#86868b;font-weight:600;margin-bottom:6px;">识别答案</div>
                            <div style="font-size:13px;color:#4a4a4a;line-height:1.5;max-height:80px;overflow-y:auto;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:10px;border-radius:8px;">${context.studentAnswer || '未能识别'}</div>
                        </div>
                    </div>
                    <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:16px;">
                        <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:14px;">教师反馈</div>
                        <div style="margin-bottom:14px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">正确得分</label>
                            <input id="cor-teacher-score" type="number" style="width:120px;padding:8px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:14px;" placeholder="分数">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">评分理由</label>
                            <textarea id="cor-teacher-reason" style="width:100%;min-height:80px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;" placeholder="解释为什么应该是这个分数..."></textarea>
                        </div>
                    </div>
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel" id="cor-cancel">取消</button>
                    <button class="ai-modal-btn-confirm" id="cor-next">下一步分析</button>
                </div>
            </div>
        `;
        overlay.querySelector('#cor-cancel').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        overlay.querySelector('#cor-next').onclick = e => {
            e.stopPropagation();
            const scoreVal = overlay.querySelector('#cor-teacher-score').value;
            const reasonVal = overlay.querySelector('#cor-teacher-reason').value.trim();
            if (!scoreVal && scoreVal !== 0) { showAlertModal('请输入正确得分'); return; }
            feedback = { teacherScore: parseFloat(scoreVal), teacherReason: reasonVal || '未说明理由' };
            currentStep = 2;
            render();
        };
        overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (context.onCancel) context.onCancel(); } };
    }

    // ===== 步骤2：AI分析 + 提示词建议 =====
    function renderStep2() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:640px;">
                <div class="ai-modal-header">提示词优化</div>
                <div class="ai-modal-body" style="max-height:60vh;overflow-y:auto;">
                    <div id="cor-analysis-stream" style="font-family:'SF Mono','JetBrains Mono',Consolas,monospace;font-size:12px;color:#4a4a4a;line-height:1.6;max-height:180px;overflow-y:auto;white-space:pre-wrap;background:rgba(0,0,0,0.02);padding:14px;border-radius:10px;border:1px solid rgba(0,0,0,0.06);margin-bottom:16px;">AI分析中...</div>
                    <div id="cor-reason" style="font-size:13px;color:#666;margin-bottom:16px;display:none;"></div>
                    <div id="cor-edit-section" style="display:none;">
                        <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">建议修改</div>
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">参考答案</label>
                            <textarea id="cor-new-answer" style="width:100%;min-height:70px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
                        </div>
                        <div style="margin-bottom:12px;">
                            <label style="display:block;margin-bottom:6px;color:#666;font-size:12px;font-weight:500;">评分标准</label>
                            <textarea id="cor-new-rubric" style="width:100%;min-height:70px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.1);border-radius:8px;font-size:13px;resize:vertical;box-sizing:border-box;"></textarea>
                        </div>
                    </div>
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel" id="cor-cancel2">取消</button>
                    <button class="ai-modal-btn-confirm" id="cor-regrade" style="display:none;">重新批改</button>
                </div>
            </div>
        `;
        overlay.querySelector('#cor-cancel2').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        overlay.onclick = e => { if (e.target === overlay) { cleanup(); if (context.onCancel) context.onCancel(); } };

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

            const regradeBtn = document.getElementById('cor-regrade');
            if (regradeBtn) {
                regradeBtn.style.display = '';
                regradeBtn.onclick = e => {
                    e.stopPropagation();
                    currentStep = 3;
                    render();
                    startRegrading();
                };
            }
        } catch (err) {
            if (streamEl) streamEl.textContent = '分析失败：' + err.message;
        }
    }

    // ===== 步骤3：重新批改结果 =====
    function renderStep3() {
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:560px;">
                <div class="ai-modal-header">纠错结果</div>
                <div class="ai-modal-body" style="text-align:center;">
                    <div id="cor-regrade-stream" style="font-family:'SF Mono',monospace;font-size:12px;color:#4a4a4a;line-height:1.6;max-height:120px;overflow-y:auto;white-space:pre-wrap;background:rgba(0,0,0,0.02);padding:14px;border-radius:10px;border:1px solid rgba(0,0,0,0.06);margin-bottom:20px;text-align:left;">重新批改中...</div>
                    <div id="cor-result-area" style="display:none;">
                        <div style="font-size:48px;font-weight:700;color:#1d1d1f;margin-bottom:16px;" id="cor-new-score"></div>
                        <div style="font-size:13px;color:#666;text-align:left;margin-bottom:8px;"><strong>识别答案：</strong><span id="cor-new-answer-text"></span></div>
                        <div style="font-size:13px;color:#666;text-align:left;"><strong>评语：</strong><span id="cor-new-comment"></span></div>
                    </div>
                </div>
                <div class="ai-modal-footer" style="justify-content:space-between;">
                    <button class="ai-modal-btn-cancel" id="cor-abandon" style="display:none;">放弃纠错</button>
                    <div style="display:flex;gap:12px;">
                        <button class="ai-modal-btn-cancel" id="cor-continue" style="display:none;">继续纠错</button>
                        <button class="ai-modal-btn-confirm" id="cor-accept" style="display:none;">确认提交</button>
                    </div>
                </div>
            </div>
        `;
    }

    async function startRegrading() {
        const streamEl = document.getElementById('cor-regrade-stream');
        try {
            const newAnswer = document.getElementById('cor-new-answer')?.value || context.config.answer;
            const newRubric = document.getElementById('cor-new-rubric')?.value || context.config.rubric;
            const modifiedConfig = { ...context.config, answer: newAnswer, rubric: newRubric };

            const result = await callAIGrading(context.base64DataArray, modifiedConfig, text => {
                if (streamEl) streamEl.textContent = text;
            });
            newResult = result;

            if (streamEl) streamEl.style.display = 'none';
            const resultArea = document.getElementById('cor-result-area');
            if (resultArea) resultArea.style.display = 'block';
            const scoreEl = document.getElementById('cor-new-score');
            if (scoreEl) scoreEl.textContent = result.score ?? '解析失败';
            const ansEl = document.getElementById('cor-new-answer-text');
            if (ansEl) ansEl.textContent = result.studentAnswer || '未能识别';
            const cmtEl = document.getElementById('cor-new-comment');
            if (cmtEl) cmtEl.textContent = result.comment || '';

            ['cor-abandon', 'cor-continue', 'cor-accept'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = '';
            });
            document.getElementById('cor-abandon').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
            document.getElementById('cor-continue').onclick = e => { e.stopPropagation(); currentStep = 1; render(); };
            document.getElementById('cor-accept').onclick = e => {
                e.stopPropagation();
                const correctionInfo = {
                    isCorrected: true,
                    correctionReason: `教师纠正：AI${context.score}分→正确${feedback.teacherScore}分。${feedback.teacherReason}`,
                    newAnswer: document.getElementById('cor-new-answer')?.value,
                    newRubric: document.getElementById('cor-new-rubric')?.value
                };
                cleanup();
                if (context.onAccept) context.onAccept(newResult.score, correctionInfo);
            };
        } catch (err) {
            if (streamEl) streamEl.textContent = '重新批改失败：' + err.message;
            const abandonBtn = document.getElementById('cor-abandon');
            if (abandonBtn) { abandonBtn.style.display = ''; abandonBtn.onclick = () => { cleanup(); if (context.onCancel) context.onCancel(); }; }
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
