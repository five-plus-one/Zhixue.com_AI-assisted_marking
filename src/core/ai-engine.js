// ========== 供应商管理器 ==========
const ProviderManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-providers-v2');
        if (saved) {
            this.data = JSON.parse(saved);
            // 迁移：更新内置供应商的模型配置
            this._migrateProviders();
        } else {
            // 尝试迁移旧格式
            const oldSaved = GM_getValue('ai-grading-providers');
            if (oldSaved) {
                this.data = this._migrateFromV1(JSON.parse(oldSaved));
            } else {
                this.data = this._getDefault();
            }
            this.save();
        }
    },
    _migrateProviders() {
        let changed = false;
        const defaults = this._getDefault();

        // 确保内置供应商存在且模型正确
        for (const [name, defaultProvider] of Object.entries(defaults.providers)) {
            if (!defaultProvider.isBuiltin) continue;

            let provider = this.data.providers[name];
            if (!provider) {
                // 内置供应商不存在，添加它
                this.data.providers[name] = { ...defaultProvider };
                changed = true;
                console.log(`[ProviderManager] 添加内置供应商 "${name}"`);
                continue;
            }

            // 确保内置模型存在
            for (const [modelId, modelInfo] of Object.entries(defaultProvider.models)) {
                if (!provider.models[modelId]) {
                    provider.models[modelId] = { ...modelInfo };
                    changed = true;
                    console.log(`[ProviderManager] 添加内置模型 "${modelId}" 到供应商 "${name}"`);
                } else {
                    // 确保内置模型的 isBuiltin 标记正确
                    if (modelInfo.isBuiltin && !provider.models[modelId].isBuiltin) {
                        provider.models[modelId].isBuiltin = true;
                        changed = true;
                    }
                }
            }

            // 确保供应商的 isBuiltin 标记正确
            if (defaultProvider.isBuiltin && !provider.isBuiltin) {
                provider.isBuiltin = true;
                changed = true;
            }
        }

        if (changed) {
            this.save();
        }
    },
    _getDefault() {
        return {
            providers: {
                "5plus1官方": {
                    endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT,
                    apiKey: "",
                    models: {
                        "aimarker-fast": { label: "快速批改", tags: ["轻量", "推荐"], isBuiltin: true },
                        "aimarker-pro": { label: "高精度批改", tags: ["专业", "推荐"], isBuiltin: true }
                    },
                    isBuiltin: true
                },
                "火山引擎": {
                    endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
                    apiKey: "",
                    models: {
                        "doubao-seed-2-0-lite-260428": { label: "豆包 Seed Lite", tags: ["轻量"] },
                        "doubao-seed-2-0-pro-260215": { label: "豆包 Seed Pro", tags: ["专业"] }
                    }
                },
                "OpenAI兼容": {
                    endpoint: "https://api.openai.com/v1/chat/completions",
                    apiKey: "",
                    models: {
                        "gpt-4o": { label: "GPT-4o", tags: ["专业"] },
                        "gpt-4o-mini": { label: "GPT-4o Mini", tags: ["轻量"] }
                    }
                }
            },
            activeProvider: "5plus1官方",
            activeModel: "aimarker-fast"
        };
    },
    _migrateFromV1(oldData) {
        const newData = this._getDefault();
        if (oldData.list) {
            for (const [name, config] of Object.entries(oldData.list)) {
                if (!newData.providers[name]) {
                    newData.providers[name] = {
                        endpoint: config.endpoint || '',
                        apiKey: config.apiKey || '',
                        models: {}
                    };
                }
                if (config.model) {
                    newData.providers[name].models[config.model] = { label: config.model, tags: [] };
                }
            }
        }
        if (oldData.active && newData.providers[oldData.active]) {
            newData.activeProvider = oldData.active;
            const provider = newData.providers[oldData.active];
            const modelKeys = Object.keys(provider.models);
            if (modelKeys.length > 0) {
                newData.activeModel = modelKeys[0];
            }
        }
        console.log('[ProviderManager] 已从 v1 格式迁移');
        return newData;
    },
    save() {
        GM_setValue('ai-grading-providers-v2', JSON.stringify(this.data));
    },
    getProvider(name) {
        return this.data.providers[name] || null;
    },
    getCurrentProvider() {
        return this.data.providers[this.data.activeProvider] || {};
    },
    getCurrentModel() {
        const provider = this.getCurrentProvider();
        return provider.models?.[this.data.activeModel] || {};
    },
    getCurrentEndpoint() {
        return this.getCurrentProvider().endpoint || SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    },
    getCurrentApiKey() {
        return this.getCurrentProvider().apiKey || '';
    },
    getCurrentModelId() {
        return this.data.activeModel || '';
    },
    // 获取完整调用配置
    getCallConfig(providerName, modelId) {
        const provider = this.data.providers[providerName];
        if (!provider) return null;
        return {
            endpoint: provider.endpoint,
            apiKey: provider.apiKey,
            model: modelId
        };
    },
    // 添加供应商
    addProvider(name, config) {
        this.data.providers[name] = {
            endpoint: config.endpoint || '',
            apiKey: config.apiKey || '',
            models: config.models || {}
        };
        this.save();
    },
    // 删除供应商
    deleteProvider(name) {
        const provider = this.data.providers[name];
        if (!provider) return false;
        if (provider.isBuiltin) {
            console.warn('⚠️ 不能删除内置供应商');
            return false;
        }
        if (Object.keys(this.data.providers).length <= 1) return false;
        delete this.data.providers[name];
        if (this.data.activeProvider === name) {
            this.data.activeProvider = Object.keys(this.data.providers)[0];
            const provider = this.getCurrentProvider();
            const modelKeys = Object.keys(provider.models || {});
            this.data.activeModel = modelKeys[0] || '';
        }
        this.save();
        return true;
    },
    // 添加模型
    addModel(providerName, modelId, label, tags) {
        const provider = this.data.providers[providerName];
        if (!provider) return false;
        provider.models[modelId] = { label: label || modelId, tags: tags || [] };
        this.save();
        return true;
    },
    // 删除模型
    deleteModel(providerName, modelId) {
        const provider = this.data.providers[providerName];
        if (!provider || !provider.models[modelId]) return false;
        // 内置模型不允许删除
        if (provider.models[modelId].isBuiltin) {
            console.warn('⚠️ 不能删除内置模型');
            return false;
        }
        if (Object.keys(provider.models).length <= 1) return false;
        delete provider.models[modelId];
        if (this.data.activeProvider === providerName && this.data.activeModel === modelId) {
            this.data.activeModel = Object.keys(provider.models)[0] || '';
        }
        this.save();
        return true;
    },
    // 设置当前活跃
    setActive(providerName, modelId) {
        if (this.data.providers[providerName]) {
            this.data.activeProvider = providerName;
            if (modelId && this.data.providers[providerName].models[modelId]) {
                this.data.activeModel = modelId;
            }
            this.save();
        }
    }
};
ProviderManager.init();

// ========== 工作流管理器 ==========
const WorkflowManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-workflows');
        if (saved) {
            this.data = JSON.parse(saved);
            // 迁移：更新内置工作流的模型配置
            this._migrateWorkflows();
        } else {
            this.data = this._getDefault();
            this.save();
        }
    },
    _migrateWorkflows() {
        let changed = false;
        const defaults = this._getDefault();
        // 更新内置工作流的模型配置
        for (const [name, wf] of Object.entries(this.data.workflows)) {
            if (wf.isBuiltin && defaults.workflows[name]) {
                const defaultWf = defaults.workflows[name];
                if (wf.model.provider !== defaultWf.model.provider || wf.model.model !== defaultWf.model.model) {
                    wf.model = defaultWf.model;
                    changed = true;
                }
                // 迁移 reasoningEffort 字段
                if (wf.model && defaultWf.model && wf.model.reasoningEffort === undefined) {
                    wf.model.reasoningEffort = defaultWf.model.reasoningEffort || '';
                    changed = true;
                }
                if (defaultWf.dualEval && JSON.stringify(wf.dualEval) !== JSON.stringify(defaultWf.dualEval)) {
                    wf.dualEval = defaultWf.dualEval;
                    changed = true;
                }
            }
        }
        if (changed) {
            console.log('[WorkflowManager] 已迁移内置工作流配置');
            this.save();
        }
    },
    _getDefault() {
        return {
            workflows: {
                "快速批改(推荐)": {
                    id: "fast",
                    description: "快速、高性价比，适合逻辑题、画图题等",
                    model: { provider: "5plus1官方", model: "aimarker-fast", reasoningEffort: "minimal" },
                    dualEval: null,
                    isBuiltin: true
                },
                "普通批改": {
                    id: "normal",
                    description: "普通模式，适合大多数题型",
                    model: { provider: "5plus1官方", model: "aimarker-pro", reasoningEffort: "" },
                    dualEval: null,
                    isBuiltin: true
                },
                "双评模式(高精度)": {
                    id: "dual",
                    description: "高精准度，两次评分超阈值自动仲裁",
                    model: { provider: "5plus1官方", model: "aimarker-pro", reasoningEffort: "" },
                    dualEval: {
                        enabled: true,
                        secondary: { provider: "5plus1官方", model: "aimarker-pro", reasoningEffort: "" },
                        arbitration: { provider: "5plus1官方", model: "aimarker-pro", reasoningEffort: "" },
                        threshold: 2
                    },
                    isBuiltin: true
                }
            },
            activeWorkflow: "fast"
        };
    },
    save() {
        GM_setValue('ai-grading-workflows', JSON.stringify(this.data));
    },
    getWorkflow(id) {
        // 按 id 查找
        for (const [name, wf] of Object.entries(this.data.workflows)) {
            if (wf.id === id) return { ...wf, name };
        }
        // 按名称查找（兼容）
        if (this.data.workflows[id]) {
            return { ...this.data.workflows[id], name: id };
        }
        return null;
    },
    getActiveWorkflow() {
        return this.getWorkflow(this.data.activeWorkflow) || this.getWorkflow('fast');
    },
    getWorkflowModelConfig(workflowId) {
        const wf = this.getWorkflow(workflowId);
        if (!wf || !wf.model) return null;
        const callConfig = ProviderManager.getCallConfig(wf.model.provider, wf.model.model);
        if (callConfig && wf.model.reasoningEffort) {
            callConfig.reasoningEffort = wf.model.reasoningEffort;
        }
        return callConfig;
    },
    setActive(id) {
        this.data.activeWorkflow = id;
        this.save();
    },
    addWorkflow(name, config) {
        this.data.workflows[name] = {
            id: config.id || name.toLowerCase().replace(/\s+/g, '-'),
            description: config.description || '',
            model: config.model || { provider: "", model: "", reasoningEffort: "" },
            dualEval: config.dualEval || null,
            isBuiltin: false
        };
        this.save();
    },
    updateWorkflow(name, config) {
        if (!this.data.workflows[name]) return false;
        Object.assign(this.data.workflows[name], config);
        this.save();
        return true;
    },
    deleteWorkflow(name) {
        const wf = this.data.workflows[name];
        if (!wf || wf.isBuiltin) return false;
        delete this.data.workflows[name];
        if (this.data.activeWorkflow === (wf.id || name)) {
            this.data.activeWorkflow = 'fast';
        }
        this.save();
        return true;
    },
    // 获取所有工作流列表
    getAll() {
        return Object.entries(this.data.workflows).map(([name, wf]) => ({
            ...wf, name
        }));
    }
};
WorkflowManager.init();

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

        // 如果配置了思考链深度，添加 reasoning_effort 参数
        if (config.reasoningEffort) {
            requestBody.reasoning_effort = config.reasoningEffort;
        }

        console.log(`📤 发送请求到: ${config.endpoint} (模型: ${config.model}${config.reasoningEffort ? ', 思考深度: ' + config.reasoningEffort : ''})`);

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

                    // 检测余额不足
                    const isInsufficient = /insufficient|balance|quota|余额|额度|欠费/i.test(errorMsg);
                    if (isInsufficient) {
                        const isOfficial = config.endpoint?.includes('five-plus-one.com');
                        if (isOfficial) {
                            showInsufficientBalanceDialog(true);
                        } else {
                            showInsufficientBalanceDialog(false);
                        }
                    }

                    return reject(new Error(`API报错 (${res.status}): ${errorMsg}`));
                }

                fullText = '';
                buffer = '';
                parseSSEBuffer(responseText);

                if (!fullText && responseText) {
                    console.log('📝 [诊断] SSE解析无结果，尝试解析为普通JSON响应...');
                    try {
                        const jsonObj = JSON.parse(responseText);
                        if (jsonObj.choices && jsonObj.choices[0]) {
                            if (jsonObj.choices[0].message && jsonObj.choices[0].message.content) {
                                fullText = jsonObj.choices[0].message.content;
                            } else if (jsonObj.choices[0].delta && jsonObj.choices[0].delta.content) {
                                fullText = jsonObj.choices[0].delta.content;
                            }
                        }
                        if (!fullText && jsonObj.content) {
                            fullText = jsonObj.content;
                        }
                    } catch (e) {}
                }

                if (progressCallCount === 0 && fullText && onStreamUpdate) {
                    onStreamUpdate(fullText);
                }

                resolve(fullText);
            },
            onerror: function() {
                if (settled) return;
                settled = true;
                reject(new Error('网络请求被拦截，请检查跨域权限'));
            },
            ontimeout: function() {
                if (settled) return;
                settled = true;
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

// ========== 双评引擎 ==========
async function callDualEvaluation(base64DataArray, config, onStreamUpdate) {
    const workflow = WorkflowManager.getWorkflow(config.workflowId);
    if (!workflow || !workflow.dualEval || !workflow.dualEval.enabled) {
        // 非双评模式，走普通流程
        return callAIGrading(base64DataArray, config, onStreamUpdate);
    }

    const dualConfig = workflow.dualEval;
    const threshold = dualConfig.threshold || 2;

    // 获取主模型和副模型配置
    const primaryConfig = ProviderManager.getCallConfig(
        workflow.model.provider, workflow.model.model
    );
    if (workflow.model.reasoningEffort) {
        primaryConfig.reasoningEffort = workflow.model.reasoningEffort;
    }
    const secondaryConfig = ProviderManager.getCallConfig(
        dualConfig.secondary.provider, dualConfig.secondary.model
    );
    if (dualConfig.secondary.reasoningEffort) {
        secondaryConfig.reasoningEffort = dualConfig.secondary.reasoningEffort;
    }

    if (!primaryConfig || !secondaryConfig) {
        console.warn('⚠️ [双评] 模型配置不完整，回退到单模型模式');
        return callAIGrading(base64DataArray, config, onStreamUpdate);
    }

    console.log(`🔄 [双评] 启动双评模式 — 主模型: ${primaryConfig.model}, 副模型: ${secondaryConfig.model}, 阈值: ${threshold}分`);
    if (onStreamUpdate) onStreamUpdate('🔄 双评模式：正在并发调用两个模型...');

    // 并发调用
    const [resultA, resultB] = await Promise.allSettled([
        callAIGrading(base64DataArray, { ...config, ...primaryConfig }, null),
        callAIGrading(base64DataArray, { ...config, ...secondaryConfig }, null)
    ]);

    const scoreA = resultA.status === 'fulfilled' ? resultA.value.score : null;
    const scoreB = resultB.status === 'fulfilled' ? resultB.value.score : null;
    const detailA = resultA.status === 'fulfilled' ? resultA.value : null;
    const detailB = resultB.status === 'fulfilled' ? resultB.value : null;

    // 两个都失败
    if (scoreA === null && scoreB === null) {
        throw new Error('双评均失败，请检查网络和模型配置');
    }

    // 一个失败，使用另一个
    if (scoreA === null) {
        console.warn('⚠️ [双评] 主模型失败，使用副模型结果');
        return { ...detailB, dualEval: { scoreA: null, scoreB, diff: null, result: 'fallback-b', detailA: null, detailB: detailB?._sections || null } };
    }
    if (scoreB === null) {
        console.warn('⚠️ [双评] 副模型失败，使用主模型结果');
        return { ...detailA, dualEval: { scoreA, scoreB: null, diff: null, result: 'fallback-a', detailA: detailA?._sections || null, detailB: null } };
    }

    const diff = Math.abs(scoreA - scoreB);
    console.log(`🔄 [双评] 结果 — 主模型: ${scoreA}, 副模型: ${scoreB}, 分差: ${diff}`);

    // 分差在阈值内
    if (diff <= threshold) {
        const finalScore = Math.round((scoreA + scoreB) / 2);
        console.log(`✅ [双评] 分差在阈值内，取平均分: ${finalScore}`);
        return {
            ...detailA,
            score: finalScore,
            dualEval: {
                scoreA, scoreB, diff, result: 'consensus',
                detailA: detailA?._sections || null,
                detailB: detailB?._sections || null
            }
        };
    }

    // 分差超阈值，触发三评仲裁
    console.log(`⚠️ [双评] 分差超阈值(${diff} > ${threshold})，启动三评仲裁...`);
    if (onStreamUpdate) onStreamUpdate(`⚠️ 分差 ${diff} 分超阈值，正在进行三评仲裁...`);

    const arbConfig = ProviderManager.getCallConfig(
        dualConfig.arbitration.provider, dualConfig.arbitration.model
    );
    if (dualConfig.arbitration.reasoningEffort) {
        arbConfig.reasoningEffort = dualConfig.arbitration.reasoningEffort;
    }
    if (!arbConfig) {
        console.warn('⚠️ [三评] 仲裁模型配置不完整，取平均分');
        const finalScore = Math.round((scoreA + scoreB) / 2);
        return { ...detailA, score: finalScore, dualEval: { scoreA, scoreB, diff, result: 'average-fallback', detailA: detailA?._sections || null, detailB: detailB?._sections || null } };
    }

    const arbPrompt = buildArbitrationPrompt(config, detailA, detailB, threshold);
    const arbResult = await callAI(arbPrompt, base64DataArray, { ...config, ...arbConfig }, onStreamUpdate);
    const arbParsed = parseStructuredResponse(arbResult);

    console.log(`✅ [三评] 仲裁结果: ${arbParsed.score}`);
    return {
        ...arbParsed,
        studentAnswer: detailA?.studentAnswer || detailB?.studentAnswer || arbParsed.studentAnswer || '未能识别',
        dualEval: {
            scoreA, scoreB, diff,
            result: 'arbitration',
            arbScore: arbParsed.score,
            arbAnalysis: arbParsed._sections?.['仲裁分析'] || '',
            detailA: detailA?._sections || null,
            detailB: detailB?._sections || null
        }
    };
}
