// ========== 提示词组装与解析 ==========

// ---------- 勤勉度 Prompt 片段 ----------
function buildDiligencePromptSection(config) {
    const diligence = config.scoring?.diligence;
    if (!diligence || !diligence.enabled) return '';

    const criteria = diligence.criteria || '字数较多(>15字)且书写较为工整';

    return `

【勤勉度】
等级：（1-5的整数，1=无勤勉/态度敷衍/未作答，2=一般，3=中等，4=较好，5=非常认真）
依据：（简述理由，参考标准：${criteria}）
注意：学生答案字数不超过15字或未作答时，必须给等级1`;
}

// ---------- 结构化评分 Prompt（新） ----------
function buildStructuredPrompt(config) {
    let prompt = `你是一位严格的阅卷老师。请查看图片中的学生答案并评分。

===== 输入信息 =====`;
    if (config.question) prompt += `\n【题目】\n${config.question}`;
    if (config.answer) prompt += `\n【标准答案】\n${config.answer}`;
    if (config.rubric) prompt += `\n【评分标准】\n${config.rubric}`;

    prompt += `

===== 输出要求 =====
你必须严格按照以下格式输出，不得添加任何额外内容：

【答案复述】
（逐条列出学生答案要点，每条一行，用序号标注）

【评分依据】
（逐项评分，每条格式：序号.评分项名(满分X分): 得分理由）

【分数计算】
（写出计算公式，如：1+2+0+2=5）

【总分】
（一个数字，可以是小数）

【最终得分】
（一个整数）${buildDiligencePromptSection(config)}

===== 重要约束 =====
1. 必须使用【】作为段落标记，不要省略任何段落
2. 【总分】和【最终得分】必须各只有一行，只包含数字
3. 【总分】可以是小数（如4.5），【最终得分】必须是整数
4. 不要在输出中使用 ** 加粗标记或其他 markdown 格式
5. 如果无法识别学生答案，在【答案复述】写"未能识别"
6. 严格按照评分标准打分，不要随意给分`;
    return prompt;
}

// ---------- 旧格式兼容 Prompt ----------
function buildPrompt(config) {
    let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
    if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
    if (config.answer) prompt += `**标准答案：**\n${config.answer}\n\n`;
    if (config.rubric) prompt += `**评分标准：**\n${config.rubric}\n\n`;
    prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：\n\n学生答案：[OCR识别出的学生答案文字内容]\n分数：[数字]\n评语：[简短评语]\n\n注意：\n1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后\n2. 只返回数字分数，不要带单位\n3. 评语控制在100字以内\n4. 严格按照评分标准打分`;
    return prompt;
}

// ---------- 结构化解析器（新） ----------
function parseStructuredResponse(text) {
    const clean = text.replace(/\*\*/g, '').replace(/\*/g, '');

    // Level 1: 按【】标记分段
    const sections = {};
    const regex = /【([^】]+)】\s*([\s\S]*?)(?=【|$)/g;
    let match;
    while ((match = regex.exec(clean)) !== null) {
        const key = match[1].trim();
        const value = match[2].trim();
        sections[key] = value;
    }

    // 检查是否成功解析到结构化内容
    const hasStructuredContent = sections['最终得分'] || sections['总分'] || sections['答案复述'];

    if (!hasStructuredContent) {
        // 结构化解析失败，回退到旧格式
        console.log('📝 [解析] 结构化解析失败，尝试旧格式解析...');
        return parseLegacyResponse(clean);
    }

    // Level 2: 提取分数
    let rawScore = extractScore(sections['总分']);
    let finalScore = extractScore(sections['最终得分']);

    // Level 3: 校验和修正
    if (finalScore === null && rawScore !== null) {
        finalScore = Math.round(rawScore);
    }

    // Level 4: 分数范围校验
    if (finalScore !== null && (finalScore < 0 || finalScore > 100)) {
        console.warn(`⚠️ [解析] 分数超出范围(0-100): ${finalScore}`);
        finalScore = null;
    }

    // Level 5: 识别答案校验
    let studentAnswer = sections['答案复述'] || '未能识别';
    const invalidAnswers = ['非选择题', '选择题', '略', '无', '无法识别'];
    if (invalidAnswers.includes(studentAnswer.trim())) {
        console.warn(`⚠️ [解析] 识别答案可能是错误的: ${studentAnswer}`);
        studentAnswer = '未能识别';
    }

    // Level 6: 勤勉度提取
    let diligenceLevel = 0;
    let diligenceReason = '';
    if (sections['勤勉度']) {
        const levelMatch = sections['勤勉度'].match(/等级[：:]\s*(\d)/);
        if (levelMatch) diligenceLevel = Math.min(5, Math.max(1, parseInt(levelMatch[1])));
        const reasonMatch = sections['勤勉度'].match(/依据[：:]\s*(.+?)(?=\n|$)/);
        if (reasonMatch) diligenceReason = reasonMatch[1].trim();
    }

    return {
        studentAnswer: studentAnswer,
        score: finalScore,
        rawScore: rawScore,
        scoringBasis: sections['评分依据'] || '',
        calculation: sections['分数计算'] || '',
        comment: (sections['评分依据'] || '').substring(0, 200),
        diligenceLevel: diligenceLevel,
        diligenceReason: diligenceReason,
        _sections: sections
    };
}

function extractScore(text) {
    if (!text) return null;
    const match = text.match(/(\d+\.?\d*)/);
    if (match) {
        const num = parseFloat(match[1]);
        if (num >= 0 && num <= 100) return num;
    }
    return null;
}

// ---------- 旧格式解析器（兼容） ----------
function parseLegacyResponse(text) {
    const clean = text.replace(/\*\*/g, '');

    // 提取学生答案
    const studentAnswerMatch = clean.match(/学生答案[：:]\s*(.+?)(?=\n.*?分数|$)/s);
    let studentAnswer = studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别';

    // 识别答案校验
    const invalidAnswers = ['非选择题', '选择题', '略', '无', '无法识别'];
    if (invalidAnswers.includes(studentAnswer.trim())) {
        studentAnswer = '未能识别';
    }

    // 提取分数 - 多种格式兼容
    let score = null;

    // 格式1: "分数：8" 或 "分数:8"
    let scoreMatch = clean.match(/分数[：:]\s*(\d+\.?\d*)/);
    if (scoreMatch) score = parseFloat(scoreMatch[1]);

    // 格式2: "得分：8" 或 "得分:8"
    if (score === null) {
        scoreMatch = clean.match(/得分[：:]\s*(\d+\.?\d*)/);
        if (scoreMatch) score = parseFloat(scoreMatch[1]);
    }

    // 格式3: "8分" 或 "8 分"
    if (score === null) {
        scoreMatch = clean.match(/(\d+\.?\d*)\s*分/);
        if (scoreMatch) score = parseFloat(scoreMatch[1]);
    }

    // 格式4: 末尾纯数字
    if (score === null) {
        const lines = clean.trim().split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            const numMatch = line.match(/^(\d+\.?\d*)$/);
            if (numMatch) {
                const num = parseFloat(numMatch[1]);
                if (num >= 0 && num <= 100) { score = num; break; }
            }
        }
    }

    // 提取评语
    const commentMatch = clean.match(/评语[：:]\s*(.+)/s);
    const comment = commentMatch ? commentMatch[1].trim() : '';

    return {
        studentAnswer: studentAnswer,
        score: score,
        rawScore: score,
        scoringBasis: '',
        calculation: '',
        comment: comment || text,
        diligenceLevel: 0,
        diligenceReason: '',
        _sections: {}
    };
}

// ---------- 仲裁 Prompt ----------
function buildArbitrationPrompt(config, resultA, resultB, threshold) {
    return `你是阅卷仲裁专家。两位老师对同一份试卷评分有分歧，请查看图片后裁定。

===== 评分分歧 =====
老师A评分：${resultA.score}分
老师A评语：${resultA.comment || '无'}

老师B评分：${resultB.score}分
老师B评语：${resultB.comment || '无'}

分差：${Math.abs(resultA.score - resultB.score)}分（阈值：${threshold}分）

===== 参考信息 =====
【题目】${config.question || '未提供'}
【标准答案】${config.answer || '未提供'}
【评分标准】${config.rubric || '未提供'}

===== 输出要求 =====
你必须严格按照以下格式输出：

【仲裁分析】
（分析两位老师评分差异的原因，逐条说明）

【最终得分】
（一个整数，你的裁定分数）

===== 重要约束 =====
1. 必须使用【】作为段落标记
2. 【最终得分】必须只有一行，只包含一个整数
3. 你必须在两个分数之间选择，或给出折中分数
4. 不要使用 ** 加粗标记`;
}

// ---------- 旧格式 Prompt 解析（保留兼容） ----------
function parseAIResponseText(text) {
    return parseLegacyResponse(text);
}

function parsePromptModification(text) {
    const clean = text.replace(/\*\*/g, '');

    function extract(fieldNames) {
        for (const name of fieldNames) {
            const pattern = new RegExp(name + '[：:]\\s*([\\s\\S]+?)(?=\\n[^\\S\\n]*(?:修改理由|新题目内容|新参考答案|新评分标准)[：:]|$)', 'i');
            const m = clean.match(pattern);
            if (m && m[1].trim()) {
                let val = m[1].trim();
                if (/^不变/.test(val)) return '不变';
                return val;
            }
        }
        return null;
    }

    const reason = extract(['修改理由']) || '';
    const question = extract(['新题目内容']) || '不变';
    const answer = extract(['新参考答案', '新答案']) || '不变';
    const rubric = extract(['新评分标准', '评分标准']) || '不变';

    if (answer === '不变' && rubric === '不变') {
        console.warn('[纠错] ⚠️ AI 响应中参考答案和评分标准均为"不变"，原文如下：\n' + text.slice(0, 500));
    }
    console.log(`[纠错] 解析结果 — 理由: ${reason.slice(0, 60)}... | 答案: ${answer === '不变' ? '不变' : answer.slice(0, 60) + '...'} | 标准: ${rubric === '不变' ? '不变' : rubric.slice(0, 60) + '...'}`);

    return { reason, question, answer, rubric };
}

// ========== 分小题提示词组装 ==========
function buildSubQuestionPrompt(config) {
    let prompt = `你是一位严格的阅卷老师。请查看图片中的学生答案并评分。

===== 输入信息 =====`;
    if (config.question) prompt += `\n【题目】\n${config.question}`;

    prompt += `\n【各小题评分要求】\n`;
    for (const sq of config.subQuestions) {
        const maxScoreText = (sq.maxScore && sq.maxScore > 0) ? `满分${sq.maxScore}分` : '满分未指定，请根据常规满分评判';
        prompt += `\n### ${sq.label}（${maxScoreText}）`;
        if (sq.answer) prompt += `\n参考答案：${sq.answer}`;
        if (sq.rubric) prompt += `\n评分标准：${sq.rubric}`;
        prompt += '\n';
    }

    prompt += `
===== 输出要求 =====
你必须严格按照以下格式输出：

【答案复述】
（逐条列出学生答案要点，每条一行，用序号标注）

【评分依据】
（逐项评分，每条格式：序号.评分项名(满分X分): 得分理由）

【分数计算】
（写出各小题计算公式）`;

    for (const sq of config.subQuestions) {
        prompt += `\n\n${sq.label}分数：（一个整数）`;
        prompt += `\n${sq.label}评语：（简短评语）`;
    }

    prompt += `\n\n【总分】
（一个数字）

【最终得分】
（一个整数）${buildDiligencePromptSection(config)}

===== 重要约束 =====
1. 必须使用【】作为段落标记
2. 各小题分数和总分必须各只有一行，只包含数字
3. 不要使用 ** 加粗标记
4. 各小题分数之和应等于总分`;
    return prompt;
}

// ========== 分小题结果解析 ==========
function parseSubQuestionResponse(text, config) {
    // 先尝试结构化解析
    const structured = parseStructuredResponse(text);

    // 如果结构化解析成功提取到分数
    if (structured.score !== null) {
        // 尝试提取各小题分数
        const clean = text.replace(/\*\*/g, '').replace(/\*/g, '');
        const subScores = [];
        let calculatedTotal = 0;

        for (const sq of config.subQuestions) {
            const escapedLabel = sq.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            let score = null;

            // 格式1: "第1题分数：8"
            let scoreMatch = clean.match(new RegExp(escapedLabel + '分数[：:]\\s*(\\d+\\.?\\d*)'));
            if (scoreMatch) score = parseFloat(scoreMatch[1]);

            // 格式2: "第1题：8分" 或 "第1题: 8"
            if (score === null) {
                scoreMatch = clean.match(new RegExp(escapedLabel + '[：:]\\s*(\\d+\\.?\\d*)'));
                if (scoreMatch) score = parseFloat(scoreMatch[1]);
            }

            // 格式3: "第1题 8分"
            if (score === null) {
                scoreMatch = clean.match(new RegExp(escapedLabel + '\\s+(\\d+\\.?\\d*)\\s*分'));
                if (scoreMatch) score = parseFloat(scoreMatch[1]);
            }

            const commentMatch = clean.match(new RegExp(escapedLabel + '评语[：:]\\s*(.+?)(?=\\n|$)'));
            if (score !== null) calculatedTotal += score;
            subScores.push({
                id: sq.id,
                label: sq.label,
                score: score,
                maxScore: sq.maxScore,
                comment: commentMatch ? commentMatch[1].trim() : ''
            });
        }

        console.log(`🧠 [诊断] 分小题解析结果 — 总分: ${structured.score}, 各小题: ${subScores.map(s => s.label + '=' + s.score).join(', ')}`);
        return { ...structured, subScores };
    }

    // 回退到旧格式解析
    return parseLegacySubQuestionResponse(text, config);
}

function parseLegacySubQuestionResponse(text, config) {
    const clean = text.replace(/\*\*/g, '');

    const studentAnswerMatch = clean.match(/学生答案[：:]\s*(.+?)(?=\n.*?分数|$)/s);
    const studentAnswer = studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别';

    const subScores = [];
    let calculatedTotal = 0;
    for (const sq of config.subQuestions) {
        const escapedLabel = sq.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        let score = null;
        let scoreMatch = clean.match(new RegExp(escapedLabel + '分数[：:]\\s*(\\d+\\.?\\d*)'));
        if (scoreMatch) score = parseFloat(scoreMatch[1]);

        if (score === null) {
            scoreMatch = clean.match(new RegExp(escapedLabel + '[：:]\\s*(\\d+\\.?\\d*)'));
            if (scoreMatch) score = parseFloat(scoreMatch[1]);
        }

        if (score === null) {
            scoreMatch = clean.match(new RegExp(escapedLabel + '\\s+(\\d+\\.?\\d*)\\s*分'));
            if (scoreMatch) score = parseFloat(scoreMatch[1]);
        }

        const commentMatch = clean.match(new RegExp(escapedLabel + '评语[：:]\\s*(.+?)(?=\\n|$)'));
        if (score !== null) calculatedTotal += score;
        subScores.push({
            id: sq.id,
            label: sq.label,
            score: score,
            maxScore: sq.maxScore,
            comment: commentMatch ? commentMatch[1].trim() : ''
        });
    }

    let totalScore = null;
    let totalMatch = clean.match(/总分[：:]\s*(\d+\.?\d*)/);
    if (totalMatch) totalScore = parseFloat(totalMatch[1]);
    if (totalScore === null) {
        totalMatch = clean.match(/总分\s*(\d+\.?\d*)\s*分/);
        if (totalMatch) totalScore = parseFloat(totalMatch[1]);
    }
    if (totalScore === null) totalScore = calculatedTotal;

    console.log(`🧠 [诊断] 分小题解析结果 — 总分: ${totalScore}, 各小题: ${subScores.map(s => s.label + '=' + s.score).join(', ')}`);
    return { studentAnswer, score: totalScore, rawScore: totalScore, comment: '', subScores, diligenceLevel: 0, diligenceReason: '', _sections: {} };
}

// ========== 打分专用函数 ==========
function callAIGrading(base64DataArray, config, onStreamUpdate) {
    const hasSub = config.subQuestions && config.subQuestions.length > 0;
    // 优先使用结构化 Prompt
    const prompt = hasSub ? buildSubQuestionPrompt(config) : buildStructuredPrompt(config);

    if (hasSub) {
        console.log(`📋 [诊断] 分小题配置 — 共 ${config.subQuestions.length} 题: ${config.subQuestions.map(sq => `${sq.label}(满分${sq.maxScore ?? '未设置'})`).join(', ')}`);
    }

    return callAIWithRetry(prompt, base64DataArray, config, onStreamUpdate)
        .then(fullText => {
            console.log('📝 [诊断] AI原始返回内容：\n' + fullText);

            const parsed = hasSub
                ? parseSubQuestionResponse(fullText, config)
                : parseStructuredResponse(fullText);
            console.log(`🧠 [诊断] AI响应解析结果 — 分数: ${parsed.score}, 识别答案长度: ${(parsed.studentAnswer || '').length}字, 原始文本长度: ${fullText.length}字`);
            if (parsed.score === null) {
                console.warn('⚠️ [诊断] 分数解析为 null');
            }
            return parsed;
        });
}

// ========== 应用取整规则 ==========
function applyScoringRules(score, scoringConfig) {
    if (score === null || score === undefined || !scoringConfig) return score;

    const step = scoringConfig.roundStep || 1;
    const method = scoringConfig.roundMethod || 'round';

    if (step === 1) {
        return Math[method](score);
    }

    // 按步长取整
    const rounded = Math[method](score / step) * step;
    return Math.round(rounded * 100) / 100; // 避免浮点精度问题
}

// ========== 勤勉加分计算 ==========
function applyDiligenceBonus(accuracyScore, diligenceLevel, maxScore, diligenceConfig) {
    if (!diligenceConfig || !diligenceConfig.enabled || !diligenceLevel || diligenceLevel <= 0 || maxScore <= 0) {
        return { bonus: 0, decayFactor: 0, finalScore: accuracyScore };
    }

    const maxBonus = diligenceConfig.maxBonus || 3;
    const decayPower = diligenceConfig.decayPower || 2;
    const perLevel = 1; // 每级1分

    const ratio = Math.min(accuracyScore / maxScore, 1);
    const decayFactor = Math.pow(1 - ratio, decayPower);
    // 等级1=无勤勉(0分)，等级2起才加分
    const rawBonus = Math.min(Math.max(0, diligenceLevel - 1) * perLevel, maxBonus);
    const bonus = Math.round(rawBonus * decayFactor * 100) / 100;
    const finalScore = Math.min(accuracyScore + bonus, maxScore);

    return { bonus, decayFactor, rawBonus, finalScore };
}

// ========== 勤勉加分分配到小题（供 adapter 使用）==========
function distributeDiligenceBonus(subScores, bonus, roundFn) {
    if (!bonus || bonus <= 0 || !subScores || subScores.length === 0) return subScores;

    const totalMax = subScores.reduce((s, sq) => s + (sq.maxScore || 1), 0);
    if (totalMax <= 0) return subScores;

    const round = roundFn || (v => Math.round(v * 100) / 100);
    let remaining = bonus;
    return subScores.map((sq, i) => {
        if (i === subScores.length - 1) {
            // 最后一题吸收剩余
            const added = Math.min(remaining, (sq.maxScore || Infinity) - (sq.score || 0));
            return { ...sq, score: round(sq.score + added) };
        }
        const share = Math.round(bonus * (sq.maxScore || 1) / totalMax * 10) / 10;
        const maxAdd = (sq.maxScore || 0) - (sq.score || 0);
        const added = Math.min(share, maxAdd, remaining);
        remaining -= added;
        return { ...sq, score: round(sq.score + added) };
    });
}
