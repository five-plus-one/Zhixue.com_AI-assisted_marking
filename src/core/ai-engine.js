// ========== 服务商管理器 ==========
const ProviderManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-providers');
        if (saved) {
            this.data = JSON.parse(saved);
        } else {
            this.data = {
                list: {
                    "5plus1官方": { endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT, model: SCRIPT_CONFIG.DEFAULT_MODEL, apiKey: '' },
                    "OpenAI兼容": { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o', apiKey: '' }
                },
                active: "5plus1官方"
            };
            this.save();
        }
    },
    save() { GM_setValue('ai-grading-providers', JSON.stringify(this.data)); },
    getCurrent() { return this.data.list[this.data.active] || {}; }
};
ProviderManager.init();

// ========== 通用 AI 请求函数 ==========
function callAI(prompt, base64DataArray, config, onStreamUpdate) {
    return new Promise((resolve, reject) => {
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
            onprogress: function(res) {
                if (res.responseText) {
                    progressCallCount++;
                    if (progressCallCount === 1) {
                        console.log('✅ [诊断] onprogress 已触发，当前环境支持流式输出');
                    }
                    fullText = '';
                    buffer = '';
                    parseSSEBuffer(res.responseText);
                }
            },
            onload: function(res) {
                if (settled) return;
                settled = true;
                const responseText = res.responseText || '';
                console.log(`✅ [诊断] onload 触发 — HTTP状态: ${res.status}, onprogress累计触发次数: ${progressCallCount}, 响应长度: ${responseText.length} 字节`);
                if (res.status < 200 || res.status >= 300) {
                    let errorMsg = responseText || res.statusText;
                    try {
                        const errObj = JSON.parse(responseText);
                        if (errObj.error?.message) errorMsg = errObj.error.message;
                    } catch (e) {}
                    console.error(`❌ [诊断] API返回错误: ${res.status} — ${errorMsg}`);
                    return reject(new Error(`API报错 (${res.status}): ${errorMsg}`));
                }

                // 尝试解析 SSE 流式响应
                fullText = '';
                buffer = '';
                parseSSEBuffer(responseText);

                // 如果 SSE 解析失败，尝试解析为普通 JSON 响应
                if (!fullText && responseText) {
                    console.log('📝 [诊断] SSE解析无结果，尝试解析为普通JSON响应...');
                    try {
                        const jsonObj = JSON.parse(responseText);
                        // OpenAI 格式: choices[0].message.content
                        if (jsonObj.choices && jsonObj.choices[0]) {
                            if (jsonObj.choices[0].message && jsonObj.choices[0].message.content) {
                                fullText = jsonObj.choices[0].message.content;
                                console.log('✅ [诊断] 成功解析为普通JSON响应 (choices[0].message.content)');
                            } else if (jsonObj.choices[0].delta && jsonObj.choices[0].delta.content) {
                                fullText = jsonObj.choices[0].delta.content;
                                console.log('✅ [诊断] 成功解析为普通JSON响应 (choices[0].delta.content)');
                            }
                        }
                        // 其他格式: 直接是 content 字段
                        if (!fullText && jsonObj.content) {
                            fullText = jsonObj.content;
                            console.log('✅ [诊断] 成功解析为普通JSON响应 (content)');
                        }
                        if (!fullText) {
                            console.warn('⚠️ [诊断] JSON解析成功但未找到内容字段，结构:', Object.keys(jsonObj).join(', '));
                        }
                    } catch (e) {
                        console.warn('⚠️ [诊断] JSON解析也失败:', e.message);
                        // 输出前200字符帮助调试
                        console.log('📝 [诊断] 响应前200字符:', responseText.substring(0, 200));
                    }
                }

                // 如果 onprogress 没有触发过（非流式响应），调用 onStreamUpdate 显示最终结果
                if (progressCallCount === 0 && fullText && onStreamUpdate) {
                    console.log('📝 [诊断] 非流式响应，调用 onStreamUpdate 显示最终结果');
                    onStreamUpdate(fullText);
                }

                resolve(fullText);
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
