// ========== 文本解析工具 ==========
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

// ========== AI 核心请求 (直接用 GM_xmlhttpRequest onprogress 处理 SSE，兼容所有 Tampermonkey 版本) ==========
function callAIGrading(base64DataArray, config, onStreamUpdate) {
    return new Promise((resolve, reject) => {
        const prompt = buildPrompt(config);
        const messageContent = [{ type: "text", text: prompt }];
        base64DataArray.forEach(base64Data => {
            messageContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}` } });
        });

        const requestBody = {
            model: config.model,
            messages: [{ role: "user", content: messageContent }],
            max_tokens: 2048,
            stream: true
        };

        console.log(`📤 发送请求到: ${config.endpoint}`);

        let fullText = '';
        let buffer = '';
        let settled = false;
        let progressCallCount = 0;

        function parseSSEBuffer(chunk) {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (let line of lines) {
                line = line.trim();
                if (!line.startsWith('data:')) continue;
                const dataStr = line.substring(5).trim();
                if (dataStr === '[DONE]' || !dataStr) continue;
                try {
                    const parsed = JSON.parse(dataStr);
                    const delta = parsed.choices?.[0]?.delta?.content || '';
                    if (delta) {
                        fullText += delta;
                        if (onStreamUpdate) onStreamUpdate(fullText);
                    }
                } catch (e) {}
            }
        }

        const request = GM_xmlhttpRequest({
            method: 'POST',
            url: config.endpoint,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            data: JSON.stringify(requestBody),
            // 不指定 responseType，让 Tampermonkey 自动选择最兼容的模式
            // 避免 responseType:'stream' 导致 onload 中 responseText 为空的问题
            onprogress: function(res) {
                // 支持 stream 的 Tampermonkey 版本：responseText 会逐步追加
                if (res.responseText) {
                    progressCallCount++;
                    if (progressCallCount === 1) {
                        console.log('✅ [诊断] onprogress 已触发，当前环境支持流式输出');
                    }
                    // onprogress 每次给的是全量 responseText，重置后重新解析以保证流式面板实时更新
                    fullText = '';
                    buffer = '';
                    parseSSEBuffer(res.responseText);
                }
            },
            onload: function(res) {
                if (settled) return;
                settled = true;
                console.log(`✅ [诊断] onload 触发 — HTTP状态: ${res.status}, onprogress累计触发次数: ${progressCallCount}, 响应长度: ${(res.responseText || '').length} 字节`);
                if (res.status < 200 || res.status >= 300) {
                    let errorMsg = res.responseText || res.statusText;
                    try {
                        const errObj = JSON.parse(res.responseText);
                        if (errObj.error?.message) errorMsg = errObj.error.message;
                    } catch (e) {}
                    console.error(`❌ [诊断] API返回错误: ${res.status} — ${errorMsg}`);
                    return reject(new Error(`API报错 (${res.status}): ${errorMsg}`));
                }
                // onload 时用完整 responseText 做最终解析（确保不遗漏任何内容）
                fullText = '';
                buffer = '';
                parseSSEBuffer(res.responseText || '');
                const parsed = parseAIResponseText(fullText);
                console.log(`🧠 [诊断] AI响应解析结果 — 分数: ${parsed.score}, 识别答案长度: ${(parsed.studentAnswer || '').length}字, 原始文本长度: ${fullText.length}字`);
                if (parsed.score === null) {
                    console.warn('⚠️ [诊断] 分数解析为 null，原始AI返回文本如下：\n' + fullText);
                }
                resolve(parsed);
            },
            onerror: function() {
                if (settled) return;
                settled = true;
                console.error('❌ [诊断] GM_xmlhttpRequest onerror 触发 — 请求被拦截或网络断开');
                reject(new Error('网络请求被拦截，请检查跨域权限'));
            },
            ontimeout: function() {
                if (settled) return;
                settled = true;
                console.error('❌ [诊断] GM_xmlhttpRequest ontimeout 触发 — 请求超时');
                reject(new Error('请求超时'));
            }
        });

        if (window.aiGradingState.abortController) {
            window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                if (!settled) {
                    settled = true;
                    request.abort();
                    reject(new Error('用户主动暂停'));
                }
            });
        }
    });
}
