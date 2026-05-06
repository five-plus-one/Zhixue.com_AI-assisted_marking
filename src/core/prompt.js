// ========== 提示词组装与解析 ==========

function buildPrompt(config) {
    let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
    if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
    if (config.answer) prompt += `**标准答案：**\n${config.answer}\n\n`;
    if (config.rubric) prompt += `**评分标准：**\n${config.rubric}\n\n`;
    prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：\n\n学生答案：[OCR识别出的学生答案文字内容]\n分数：[数字]\n评语：[简短评语]\n\n注意：\n1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后\n2. 只返回数字分数，不要带单位\n3. 评语控制在100字以内\n4. 严格按照评分标准打分`;
    return prompt;
}

function parseAIResponseText(text) {
    const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n分数|$)/s);
    const scoreMatch = text.match(/分数[：:]\s*(\d+\.?\d*)/);
    const commentMatch = text.match(/评语[：:]\s*(.+)/s);
    return {
        studentAnswer: studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别',
        score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
        comment: commentMatch ? commentMatch[1].trim() : text
    };
}

function parsePromptModification(text) {
    // 去除 markdown 加粗标记，防止 AI 输出 **新参考答案：** 导致匹配失败
    const clean = text.replace(/\*\*/g, '');

    // 提取各字段：匹配 "字段名：" 后的内容，直到下一个已知字段名或文本结尾
    function extract(fieldNames) {
        for (const name of fieldNames) {
            // 匹配 "字段名：内容" 直到下一个字段标签或结尾
            const pattern = new RegExp(name + '[：:]\\s*([\\s\\S]+?)(?=\\n[^\\S\\n]*(?:修改理由|新题目内容|新参考答案|新评分标准)[：:]|$)', 'i');
            const m = clean.match(pattern);
            if (m && m[1].trim()) {
                let val = m[1].trim();
                // "不变" 后面如果跟了括号注释或额外内容，只保留"不变"
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

    // 诊断日志
    if (answer === '不变' && rubric === '不变') {
        console.warn('[纠错] ⚠️ AI 响应中参考答案和评分标准均为"不变"，原文如下：\n' + text.slice(0, 500));
    }
    console.log(`[纠错] 解析结果 — 理由: ${reason.slice(0, 60)}... | 答案: ${answer === '不变' ? '不变' : answer.slice(0, 60) + '...'} | 标准: ${rubric === '不变' ? '不变' : rubric.slice(0, 60) + '...'}`);

    return { reason, question, answer, rubric };
}

// ========== 分小题提示词组装 ==========
function buildSubQuestionPrompt(config) {
    let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
    if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
    prompt += `**各小题评分要求：**\n\n`;
    for (const sq of config.subQuestions) {
        prompt += `### ${sq.label}（满分${sq.maxScore}分）\n`;
        if (sq.answer) prompt += `参考答案：${sq.answer}\n`;
        if (sq.rubric) prompt += `评分标准：${sq.rubric}\n`;
        prompt += '\n';
    }
    prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：\n\n`;
    prompt += `学生答案：[OCR识别出的学生答案文字内容]\n`;
    for (const sq of config.subQuestions) {
        prompt += `${sq.label}分数：[数字]\n`;
        prompt += `${sq.label}评语：[简短评语]\n`;
    }
    prompt += `总分：[数字]\n\n`;
    prompt += `注意：\n1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后\n2. 只返回数字分数，不要带单位\n3. 评语控制在100字以内\n4. 各小题分数之和应等于总分`;
    return prompt;
}

// ========== 分小题结果解析 ==========
function parseSubQuestionResponse(text, config) {
    const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n.*?分数|$)/s);
    const studentAnswer = studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别';

    const subScores = [];
    let calculatedTotal = 0;
    for (const sq of config.subQuestions) {
        const escapedLabel = sq.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const scoreMatch = text.match(new RegExp(escapedLabel + '分数[：:]\\s*(\\d+\\.?\\d*)'));
        const commentMatch = text.match(new RegExp(escapedLabel + '评语[：:]\\s*(.+?)(?=\\n|$)'));
        const score = scoreMatch ? parseFloat(scoreMatch[1]) : null;
        if (score !== null) calculatedTotal += score;
        subScores.push({
            id: sq.id,
            label: sq.label,
            score: score,
            maxScore: sq.maxScore,
            comment: commentMatch ? commentMatch[1].trim() : ''
        });
    }

    const totalMatch = text.match(/总分[：:]\s*(\d+\.?\d*)/);
    const totalScore = totalMatch ? parseFloat(totalMatch[1]) : calculatedTotal;

    console.log(`🧠 [诊断] 分小题解析结果 — 总分: ${totalScore}, 各小题: ${subScores.map(s => s.label + '=' + s.score).join(', ')}`);
    return { studentAnswer, score: totalScore, comment: '', subScores };
}

// ========== 打分专用函数 ==========
function callAIGrading(base64DataArray, config, onStreamUpdate) {
    const hasSub = config.subQuestions && config.subQuestions.length > 0;
    const prompt = hasSub ? buildSubQuestionPrompt(config) : buildPrompt(config);

    return callAI(prompt, base64DataArray, config, onStreamUpdate)
        .then(fullText => {
            const parsed = hasSub
                ? parseSubQuestionResponse(fullText, config)
                : parseAIResponseText(fullText);
            console.log(`🧠 [诊断] AI响应解析结果 — 分数: ${parsed.score}, 识别答案长度: ${(parsed.studentAnswer || '').length}字, 原始文本长度: ${fullText.length}字`);
            if (parsed.score === null) {
                console.warn('⚠️ [诊断] 分数解析为 null，原始AI返回文本如下：\n' + fullText);
            }
            return parsed;
        });
}
