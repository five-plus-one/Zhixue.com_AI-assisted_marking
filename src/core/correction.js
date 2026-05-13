// ========== 分数纠错模块 ==========

function showCorrectionPanel(context) {
    ensureModalStyles();
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.id = 'correction-panel';
    overlay.style.zIndex = '999998';

    const imagesHtml = (context.base64DataArray || []).map(b64 =>
        `<img src="data:image/png;base64,${b64}" style="width:100%;border-radius:10px;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">`
    ).join('');

    overlay.innerHTML = `
        <style>
            .cor-container {
                width: 880px; max-width: 94vw; max-height: 85vh;
                background: rgba(255,255,255,0.96);
                backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255,255,255,0.6); border-radius: 20px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                display: grid; grid-template-columns: 320px 1fr; overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                animation: ai-modal-scalein 0.3s cubic-bezier(0.16,1,0.3,1);
            }
            .cor-left {
                background: rgba(0,0,0,0.015); border-right: 1px solid rgba(0,0,0,0.06);
                overflow-y: auto; padding: 24px; max-height: 85vh;
            }
            .cor-left::-webkit-scrollbar { width: 4px; }
            .cor-left::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
            .cor-left-label {
                font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px;
                color: #86868b; font-weight: 600; margin-bottom: 14px;
            }
            .cor-right {
                display: flex; flex-direction: column; overflow: hidden; max-height: 85vh;
            }
            .cor-header {
                padding: 18px 24px 14px; border-bottom: 1px solid rgba(0,0,0,0.06);
                display: flex; justify-content: space-between; align-items: center;
            }
            .cor-header-title { font-size: 15px; font-weight: 600; color: #1d1d1f; }
            .cor-header-close {
                background: transparent; border: none; font-size: 18px; cursor: pointer;
                color: #666; padding: 4px 8px; border-radius: 6px; transition: all 0.2s;
            }
            .cor-header-close:hover { background: rgba(0,0,0,0.04); color: #1a1a1a; }

            /* 步骤进度指示器 */
            .cor-steps {
                display: flex; align-items: center; gap: 0; padding: 0 24px 14px;
                border-bottom: 1px solid rgba(0,0,0,0.04);
            }
            .cor-step-item {
                display: flex; align-items: center; gap: 6px; font-size: 12px; color: #aaa; font-weight: 500;
            }
            .cor-step-item.active { color: #0052FF; }
            .cor-step-item.done { color: #34A853; }
            .cor-step-num {
                width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                font-size: 11px; font-weight: 600; border: 1.5px solid rgba(0,0,0,0.1); background: transparent;
            }
            .cor-step-item.active .cor-step-num { border-color: #0052FF; background: #0052FF; color: #fff; }
            .cor-step-item.done .cor-step-num { border-color: #34A853; background: #34A853; color: #fff; }
            .cor-step-line { flex: 1; height: 1px; background: rgba(0,0,0,0.08); margin: 0 8px; }
            .cor-step-line.done { background: #34A853; }

            .cor-body {
                flex: 1; overflow-y: auto; padding: 20px 24px;
            }
            .cor-body::-webkit-scrollbar { width: 4px; }
            .cor-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }
            .cor-footer {
                padding: 14px 24px 18px; border-top: 1px solid rgba(0,0,0,0.06);
                display: flex; justify-content: flex-end; gap: 10px;
                background: rgba(255,255,255,0.3);
            }
            .cor-footer button {
                padding: 9px 20px; border: none; border-radius: 10px;
                font-size: 13px; font-weight: 500; cursor: pointer;
                transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .cor-footer-between { justify-content: space-between; }
            .cor-score-block { margin-bottom: 16px; }
            .cor-score-label {
                font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px;
                color: #86868b; font-weight: 600; margin-bottom: 4px;
            }
            .cor-score-value { font-size: 32px; font-weight: 700; color: #1d1d1f; letter-spacing: -1px; }
            .cor-answer-block {
                font-size: 13px; color: #4a4a4a; line-height: 1.6;
                font-family: 'SF Mono', monospace; background: rgba(0,0,0,0.02);
                padding: 12px; border-radius: 8px; max-height: 100px; overflow-y: auto;
                border: 1px solid rgba(0,0,0,0.04);
            }
            .cor-field-label {
                display: block; margin-bottom: 6px; color: #666; font-size: 12px; font-weight: 500;
            }
            .cor-input {
                width: 100%; padding: 9px 12px; background: rgba(0,0,0,0.02);
                border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; font-size: 13px;
                box-sizing: border-box; transition: all 0.2s; font-family: inherit;
            }
            .cor-input:focus {
                outline: none; border-color: #0052FF; background: #fff;
                box-shadow: 0 0 0 3px rgba(0,82,255,0.08);
            }
            .cor-textarea { min-height: 64px; resize: vertical; }
            .cor-stream-box {
                font-family: 'SF Mono', 'JetBrains Mono', Consolas, monospace;
                font-size: 12px; color: #4a4a4a; line-height: 1.65;
                max-height: 180px; overflow-y: auto; white-space: pre-wrap;
                background: rgba(0,0,0,0.02); padding: 12px; border-radius: 8px;
                border: 1px solid rgba(0,0,0,0.05);
            }
            @keyframes cor-slidein {
                from { opacity: 0; transform: translateX(10px); }
                to { opacity: 1; transform: translateX(0); }
            }
            .cor-step-enter { animation: cor-slidein 0.25s ease-out; }

            #correction-panel { color-scheme: light only; }
            #correction-panel,
            #correction-panel * { box-sizing: border-box; color: #172033; }
            #correction-panel .cor-container {
                background: #fff;
                border: 1px solid #e1e6ef;
                border-radius: 16px;
                box-shadow: 0 28px 80px rgba(18,28,45,0.22), 0 2px 8px rgba(18,28,45,0.08);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif;
                grid-template-columns: 340px minmax(0, 1fr);
            }
            #correction-panel .cor-left {
                background: #f7f8fa;
                border-right: 1px solid #e1e6ef;
                padding: 20px;
            }
            #correction-panel .cor-left-label,
            #correction-panel .cor-score-label,
            #correction-panel .cor-field-label {
                color: #667085;
                letter-spacing: 0.4px;
            }
            #correction-panel .cor-left img {
                border: 1px solid #e1e6ef;
                border-radius: 8px;
                box-shadow: 0 8px 22px rgba(18,28,45,0.08);
            }
            #correction-panel .cor-header,
            #correction-panel .cor-footer {
                background: #fff;
                border-color: #e1e6ef;
            }
            #correction-panel .cor-header-title {
                color: #172033;
                font-size: 18px;
                font-weight: 750;
            }
            #correction-panel .cor-header-close {
                width: 32px;
                height: 32px;
                padding: 0;
                border: 1px solid #d8dee8;
                background: #fff;
                color: #667085;
                border-radius: 7px;
            }
            #correction-panel .cor-header-close:hover {
                background: #f3f6fa;
                color: #172033;
            }
            #correction-panel .cor-steps {
                background: #fff;
                border-bottom: 1px solid #e1e6ef;
            }
            #correction-panel .cor-step-item { color: #667085; font-weight: 700; }
            #correction-panel .cor-step-item.active { color: #2166ad; }
            #correction-panel .cor-step-item.done { color: #287047; }
            #correction-panel .cor-step-num {
                border-color: #d8dee8;
                background: #fff;
            }
            #correction-panel .cor-step-item.active .cor-step-num {
                border-color: #2166ad;
                background: #2166ad;
                color: #fff;
            }
            #correction-panel .cor-step-item.done .cor-step-num {
                border-color: #287047;
                background: #287047;
                color: #fff;
            }
            #correction-panel .cor-step-line { background: #d8dee8; }
            #correction-panel .cor-step-line.done { background: #287047; }
            #correction-panel .cor-body { background: #fff; }
            #correction-panel .cor-score-value { color: #172033; }
            #correction-panel .cor-answer-block,
            #correction-panel .cor-stream-box {
                background: #f7f8fa;
                border: 1px solid #e1e6ef;
                border-radius: 8px;
                color: #344054;
            }
            #correction-panel .cor-input {
                background: #fff;
                border: 1px solid #d8dee8;
                border-radius: 7px;
                color: #172033;
            }
            #correction-panel .cor-input:focus {
                border-color: #2166ad;
                box-shadow: 0 0 0 3px rgba(33,102,173,0.12);
            }
            #correction-panel .cor-footer button,
            #correction-panel .ai-modal-btn-cancel,
            #correction-panel .ai-modal-btn-confirm {
                min-height: 36px;
                border-radius: 7px;
                font-weight: 700;
            }
            #correction-panel .ai-modal-btn-cancel {
                background: #fff;
                border: 1px solid #d8dee8;
                color: #344054;
            }
            #correction-panel .ai-modal-btn-cancel:hover { background: #f3f6fa; }
            #correction-panel .ai-modal-btn-confirm {
                background: #172033;
                color: #fff;
                border: 1px solid #172033;
                box-shadow: none;
            }
            #correction-panel .ai-modal-btn-confirm:hover {
                background: #0f1726;
                box-shadow: 0 8px 18px rgba(18,28,45,0.18);
            }
            @media (max-width: 760px) {
                #correction-panel .cor-container {
                    width: calc(100vw - 20px);
                    max-height: calc(100vh - 20px);
                    grid-template-columns: 1fr;
                }
                #correction-panel .cor-left {
                    max-height: 30vh;
                    border-right: none;
                    border-bottom: 1px solid #e1e6ef;
                }
                #correction-panel .cor-right { max-height: calc(70vh - 20px); }
            }
        </style>
        <div class="cor-container">
            <div class="cor-left">
                <div class="cor-left-label">学生答题卡</div>
                ${imagesHtml || '<div style="color:#aaa;font-size:13px;">无图片</div>'}
            </div>
            <div class="cor-right">
                <div class="cor-header">
                    <span class="cor-header-title" id="cor-step-title">分数纠错</span>
                    <button class="cor-header-close" id="cor-close-btn">&times;</button>
                </div>
                <div class="cor-steps" id="cor-steps-bar">
                    <div class="cor-step-item active" data-step="1"><span class="cor-step-num">1</span> 教师反馈</div>
                    <div class="cor-step-line"></div>
                    <div class="cor-step-item" data-step="2"><span class="cor-step-num">2</span> AI分析优化</div>
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

    function updateStepsBar() {
        const bar = document.getElementById('cor-steps-bar');
        if (!bar) return;
        bar.querySelectorAll('.cor-step-item').forEach(el => {
            const s = parseInt(el.dataset.step);
            el.classList.remove('active', 'done');
            if (s < currentStep) el.classList.add('done');
            else if (s === currentStep) el.classList.add('active');
        });
        bar.querySelectorAll('.cor-step-line').forEach((line, i) => {
            line.classList.toggle('done', i + 1 < currentStep);
        });
    }

    function render() {
        const body = document.getElementById('cor-step-body');
        const footer = document.getElementById('cor-step-footer');
        const title = document.getElementById('cor-step-title');
        if (!body || !footer) return;
        body.className = 'cor-body cor-step-enter';
        updateStepsBar();
        if (currentStep === 1) renderStep1(title, body, footer);
        else if (currentStep === 2) renderStep2(title, body, footer);
    }

    function renderStep1(title, body, footer) {
        title.textContent = '分数纠错';
        const hasSubScores = context.subScores && context.subScores.length > 0;

        let scoresHtml = '';
        if (hasSubScores) {
            scoresHtml = `
                <div class="cor-score-block">
                    <div class="cor-score-label">AI 总评分</div>
                    <div class="cor-score-value">${context.score}</div>
                </div>
                <div style="margin-bottom:16px;">
                    <div class="cor-score-label" style="margin-bottom:10px;">各小题 AI 得分</div>
                    ${context.subScores.map((sq, i) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);margin-bottom:6px;">
                        <span style="font-size:13px;color:#1d1d1f;font-weight:500;">${sq.label || '第(' + (i+1) + ')题'}</span>
                        <span style="font-size:14px;font-weight:600;color:#1d1d1f;">${sq.score !== null ? sq.score : '—'}<span style="font-size:11px;color:#86868b;font-weight:normal;">/${sq.maxScore || '—'}</span></span>
                    </div>
                    ${sq.comment ? `<div style="font-size:12px;color:#666;padding:0 12px 4px;margin-bottom:4px;">${sq.comment}</div>` : ''}
                    `).join('')}
                </div>
            `;
        } else {
            scoresHtml = `
                <div class="cor-score-block">
                    <div class="cor-score-label">AI 评分</div>
                    <div class="cor-score-value">${context.score}</div>
                </div>
            `;
        }

        let correctionHtml = '';
        if (hasSubScores) {
            correctionHtml = `
                <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:14px;">
                    <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">教师反馈（分小题校正）</div>
                    ${context.subScores.map((sq, i) => `
                    <div style="margin-bottom:10px;">
                        <label class="cor-field-label">${sq.label || '第(' + (i+1) + ')题'} <span style="color:#86868b;font-weight:normal;">(满分 ${sq.maxScore || '—'})</span></label>
                        <input class="cor-input cor-sub-score-input" data-index="${i}" type="number" min="0" max="${sq.maxScore || ''}" style="width:120px;" placeholder="${sq.score !== null ? sq.score : ''}" value="">
                    </div>
                    `).join('')}
                    <div style="margin-top:12px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.04);">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
                            <span style="font-size:12px;color:#86868b;">教师总分</span>
                            <span id="cor-sub-total" style="font-size:16px;font-weight:700;color:#1d1d1f;">—</span>
                            <span style="font-size:11px;color:#aaa;">（自动计算各小题之和，也可手动覆盖）</span>
                        </div>
                        <input id="cor-teacher-score" class="cor-input" type="number" style="width:120px;display:none;" placeholder="手动覆盖总分">
                    </div>
                    <div style="margin-top:10px;">
                        <label class="cor-field-label">评分理由（全局）</label>
                        <textarea id="cor-teacher-reason" class="cor-input cor-textarea" placeholder="解释为什么应该是这个分数..."></textarea>
                    </div>
                </div>
            `;
        } else {
            correctionHtml = `
                <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:14px;">
                    <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:12px;">教师反馈</div>
                    <div style="margin-bottom:12px;">
                        <label class="cor-field-label">正确得分</label>
                        <input id="cor-teacher-score" class="cor-input" type="number" style="width:120px;" placeholder="分数">
                    </div>
                    <div>
                        <label class="cor-field-label">评分理由</label>
                        <textarea id="cor-teacher-reason" class="cor-input cor-textarea" placeholder="解释为什么应该是这个分数..."></textarea>
                    </div>
                </div>
            `;
        }

        body.innerHTML = `
            ${scoresHtml}
            <div style="margin-bottom:16px;">
                <div class="cor-score-label">识别答案</div>
                <div class="cor-answer-block">${context.studentAnswer || '未能识别'}</div>
            </div>
            ${correctionHtml}
        `;
        footer.innerHTML = `
            <button class="ai-modal-btn-cancel" id="cor-cancel">取消</button>
            <button class="ai-modal-btn-confirm" id="cor-next">下一步分析</button>
        `;
        footer.className = 'cor-footer';

        // 分小题模式下自动计算总分
        if (hasSubScores) {
            const subInputs = body.querySelectorAll('.cor-sub-score-input');
            const totalEl = body.querySelector('#cor-sub-total');
            const updateTotal = () => {
                let sum = 0, allEmpty = true;
                subInputs.forEach(inp => {
                    if (inp.value !== '' && inp.value !== null) { sum += parseFloat(inp.value); allEmpty = false; }
                });
                if (totalEl) totalEl.textContent = allEmpty ? '—' : sum;
            };
            subInputs.forEach(inp => inp.addEventListener('input', updateTotal));
        }

        footer.querySelector('#cor-cancel').onclick = e => { e.stopPropagation(); cleanup(); if (context.onCancel) context.onCancel(); };
        footer.querySelector('#cor-next').onclick = e => {
            e.stopPropagation();
            const reasonVal = body.querySelector('#cor-teacher-reason').value.trim();

            if (hasSubScores) {
                const subInputs = body.querySelectorAll('.cor-sub-score-input');
                const subScoreCorrections = [];
                let hasAnyInput = false;
                subInputs.forEach((inp, i) => {
                    const sq = context.subScores[i];
                    const val = inp.value;
                    const teacherScore = val !== '' && val !== null ? parseFloat(val) : null;
                    if (teacherScore !== null) hasAnyInput = true;
                    subScoreCorrections.push({
                        id: sq.id, label: sq.label || '第(' + (i+1) + ')题',
                        aiScore: sq.score, teacherScore, maxScore: sq.maxScore
                    });
                });
                if (!hasAnyInput) { showAlertModal('请至少输入一个小题的正确得分'); return; }

                // 计算总分：优先用自动求和，手动覆盖为空时自动求和
                const autoTotal = subScoreCorrections.reduce((s, c) => s + (c.teacherScore || 0), 0);
                const manualTotalEl = body.querySelector('#cor-teacher-score');
                const manualTotal = manualTotalEl && manualTotalEl.value !== '' ? parseFloat(manualTotalEl.value) : null;
                const teacherScore = manualTotal !== null ? manualTotal : autoTotal;

                feedback = { teacherScore, teacherReason: reasonVal || '未说明理由', subScoreCorrections };
            } else {
                const scoreVal = body.querySelector('#cor-teacher-score').value;
                if (!scoreVal && scoreVal !== 0) { showAlertModal('请输入正确得分'); return; }
                feedback = { teacherScore: parseFloat(scoreVal), teacherReason: reasonVal || '未说明理由' };
            }
            currentStep = 2;
            render();
        };
    }

    function renderStep2(title, body, footer) {
        title.textContent = '提示词优化';
        body.innerHTML = `
            <div id="cor-analysis-stream" class="cor-stream-box" style="margin-bottom:14px;">AI分析中...</div>
            <div id="cor-reason" style="font-size:13px;color:#666;margin-bottom:14px;display:none;"></div>
            <div id="cor-edit-section" style="display:none;">
                <div style="font-size:13px;font-weight:600;color:#1a1a1a;margin-bottom:10px;">建议修改</div>
                <div style="margin-bottom:10px;">
                    <label class="cor-field-label">参考答案</label>
                    <textarea id="cor-new-answer" class="cor-input cor-textarea"></textarea>
                </div>
                <div style="margin-bottom:10px;">
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

                    // 构造校正后的 subScores
                    let correctedSubScores = context.subScores;
                    if (feedback.subScoreCorrections && context.subScores) {
                        correctedSubScores = context.subScores.map((sq, i) => ({
                            ...sq,
                            score: feedback.subScoreCorrections[i]?.teacherScore ?? sq.score
                        }));
                    }

                    const correctionInfo = {
                        isCorrected: true,
                        correctionReason: feedback.subScoreCorrections
                            ? `教师纠正：AI${context.score}分→正确${feedback.teacherScore}分。各小题：${feedback.subScoreCorrections.map(c => `${c.label} AI${c.aiScore}→${c.teacherScore}`).join('；')}。${feedback.teacherReason}`
                            : `教师纠正：AI${context.score}分→正确${feedback.teacherScore}分。${feedback.teacherReason}`,
                        newAnswer, newRubric,
                        correctedSubScores
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
    const hasSubScores = context.subScores && context.subScores.length > 0;
    const originalPrompt = hasSubScores ? buildSubQuestionPrompt(context.config) : buildPrompt(context.config);

    let scoreComparison = '';
    if (hasSubScores && feedback.subScoreCorrections) {
        scoreComparison = `
**AI给出的各小题评分：**
${feedback.subScoreCorrections.map(c => `${c.label}：AI ${c.aiScore}分 / 满分${c.maxScore}分`).join('\n')}
总分：${context.score}

**教师认为正确的各小题评分：**
${feedback.subScoreCorrections.map(c => `${c.label}：教师 ${c.teacherScore}分${c.teacherScore !== c.aiScore ? '（差异' + (c.teacherScore > c.aiScore ? '+' : '') + (c.teacherScore - c.aiScore) + '分）' : '（一致）'}`).join('\n')}
总分：${feedback.teacherScore}
评分理由：${feedback.teacherReason}`;
    } else {
        scoreComparison = `
**AI给出的评分：**
分数：${context.score}，评语：${context.comment}

**教师认为正确的评分：**
分数：${feedback.teacherScore}，理由：${feedback.teacherReason}`;
    }

    const analysisPrompt = `你是一位阅卷提示词优化专家。教师对AI的评分结果提出了异议，请分析并优化评分提示词。

**原始评分提示词：**
${originalPrompt}

**学生答题图片中的OCR答案：**
${context.studentAnswer}
${scoreComparison}

**重要规则：**
- 如果你分析出了差异原因（如OCR识别不准、评分标准不完善等），你**必须**将改进措施写入对应的字段（参考答案或评分标准），而不是写"不变"
- "不变"仅用于你确认该部分完全正确、无需任何修改的情况
- 如果问题出在评分标准不够细致，就把更细致的标准写入"新评分标准"
- 如果问题出在参考答案不够准确，就把修正后的答案写入"新参考答案"
- 不要在"不变"后面附加注释或建议，修改内容直接写入对应字段

请返回修改后的提示词各部分，严格按以下格式（字段名不要加粗、不要加 markdown 标记，每行一个字段，"不变"后面不能有其他内容）：
修改理由：[分析差异的原因和改进方向]
新题目内容：[修改后的题目内容，或写"不变"]
新参考答案：[修改后的参考答案，或写"不变"]
新评分标准：[修改后的评分标准，或写"不变"]`;

    // 使用 callConfig（含 endpoint/apiKey/model）调用 API，config 仅用于构建提示词
    const apiConfig = context.callConfig || context.config;
    return callAI(analysisPrompt, context.base64DataArray, apiConfig, onStreamUpdate);
}
