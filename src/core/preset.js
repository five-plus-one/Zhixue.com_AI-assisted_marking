// ========== 全局配置方案管理器 ==========
const PresetManager = {
    data: null,
    init() {
        try {
            let saved = GM_getValue('ai-grading-presets');
            if (saved) {
                this.data = JSON.parse(saved);
                this._migrateGradingMode();
                this._migrateProvider();
                this._migrateWorkflow();
            } else {
                let oldConfigStr = GM_getValue('ai-grading-config');
                let defaultCfg = oldConfigStr ? JSON.parse(oldConfigStr) : {
                    provider: '5plus1', endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT, model: SCRIPT_CONFIG.DEFAULT_MODEL
                };
                this.data = {
                    list: { "默认配置": defaultCfg },
                    active: "默认配置",
                    bindings: {}
                };
                this.save();
            }
        } catch (e) {
            console.error('❌ PresetManager init failed, using defaults:', e);
            this.data = { list: { "默认配置": {} }, active: "默认配置", bindings: {} };
        }
    },
    _migrateGradingMode() {
        let changed = false;
        for (const name in this.data.list) {
            const cfg = this.data.list[name];
            if (cfg.unattendedMode !== undefined && cfg.gradingMode === undefined) {
                cfg.gradingMode = cfg.unattendedMode ? 'unattended' : 'normal';
                delete cfg.unattendedMode;
                changed = true;
            } else if (cfg.gradingMode === undefined) {
                cfg.gradingMode = 'normal';
                changed = true;
            }
        }
        if (changed) this.save();
    },
    _migrateProvider() {
        const migration = { '5plus1': '5plus1官方', 'openai': 'OpenAI兼容' };
        let changed = false;
        for (const name in this.data.list) {
            const cfg = this.data.list[name];
            if (cfg.provider && migration[cfg.provider]) {
                cfg.provider = migration[cfg.provider];
                changed = true;
            }
        }
        if (changed) this.save();
    },
    _migrateWorkflow() {
        let changed = false;
        for (const name in this.data.list) {
            try {
                const cfg = this.data.list[name];
                if (!cfg.workflowId) {
                    cfg.workflowId = 'fast';
                    changed = true;
                }
                if (!cfg.scoring) {
                    cfg.scoring = { roundStep: 1, roundMethod: 'round' };
                    changed = true;
                }
                if (cfg.scoring && !cfg.scoring.diligence) {
                    cfg.scoring.diligence = { enabled: false, maxBonus: 3, decayPower: 2, criteria: '' };
                    changed = true;
                }
                // 迁移：将旧的顶层 subQuestions 转换为 scoring.units
                if (cfg.subQuestions && cfg.subQuestions.length > 0 && (!cfg.scoring.units || cfg.scoring.units.length === 0)) {
                    cfg.scoring.units = cfg.subQuestions.map((sq, i) => ({
                        label: sq.label || `第${i + 1}题`,
                        maxScore: sq.maxScore || 0,
                        index: i,
                        roundStep: 1
                    }));
                    changed = true;
                }
                // 迁移：添加 units[] 和 maxScore（默认 0 表示未设置）
                if (cfg.scoring && cfg.scoring.units === undefined) {
                    cfg.scoring.units = [];
                    changed = true;
                }
                if (cfg.scoring && cfg.scoring.maxScore === undefined) {
                    cfg.scoring.maxScore = 0;  // 0 = 未设置，运行时需要用户配置
                    changed = true;
                }
            } catch (e) {
                console.warn(`⚠️ Migration failed for preset "${name}":`, e);
            }
        }
        if (changed) this.save();
    },
    /**
     * 获取当前配置的评分单元列表
     * 优先使用用户手动配置的 units[]，回退到 adapter 自动检测
     * @returns {Array<{label, maxScore, index}>}
     */
    getScoringUnits() {
        const config = this.getCurrentConfig();
        const units = config.scoring?.units || [];

        // 如果用户已手动配置，直接返回
        if (units.length > 0) return units;

        // 回退：从 adapter 检测
        const adapter = window.__AI_MARKER_ADAPTER__;
        if (adapter && adapter.getScoreInputs) {
            const inputs = adapter.getScoreInputs();
            if (inputs.length > 1) {
                // 多个输入框 → 每个都是一个评分单元
                return inputs.map((inp, i) => ({
                    label: inp.label || `第${i + 1}题`,
                    maxScore: inp.maxScore || 0,
                    index: inp.index !== undefined ? inp.index : i
                }));
            }
        }

        // 单输入框或无 adapter → 返回空（使用 maxScore 作为单题模式）
        return [];
    },
    /**
     * 获取总满分
     * 优先从 units 计算，回退到 scoring.maxScore
     * @returns {number}
     */
    getMaxScore() {
        const units = this.getScoringUnits();
        if (units.length > 0) {
            return units.reduce((sum, u) => sum + (u.maxScore || 0), 0);
        }
        const config = this.getCurrentConfig();
        return config.scoring?.maxScore || 0;  // 0 = 未设置（validateScoringUnits 会拦截）
    },
    /**
     * 检查评分单元是否都已配置满分
     * @returns {{ valid: boolean, missingMaxScore: Array<{index, label}> }}
     */
    validateScoringUnits() {
        const units = this.getScoringUnits();
        const missingMaxScore = [];
        for (let i = 0; i < units.length; i++) {
            if (!units[i].maxScore || units[i].maxScore <= 0) {
                missingMaxScore.push({ index: i, label: units[i].label || `第${i + 1}题` });
            }
        }
        // 单题模式也需要检查 maxScore
        if (units.length === 0) {
            const config = this.getCurrentConfig();
            if (!config.scoring?.maxScore || config.scoring.maxScore <= 0) {
                missingMaxScore.push({ index: 0, label: '总分' });
            }
        }
        return { valid: missingMaxScore.length === 0, missingMaxScore };
    },
    save() {
        GM_setValue('ai-grading-presets', JSON.stringify(this.data));
    },
    getCurrentConfig() {
        return this.data.list[this.data.active] || {};
    },
    getTaskIdentifier() {
        const adapter = window.__AI_MARKER_ADAPTER__;
        if (adapter && adapter.getTaskIdentifier) {
            return adapter.getTaskIdentifier();
        }
        return window.location.pathname + window.location.hash;
    },
    // 获取当前生效的 AI 调用配置（优先使用工作流，回退到直接配置）
    getActiveCallConfig() {
        const config = this.getCurrentConfig();

        // 优先使用工作流
        if (config.workflowId) {
            const wfConfig = WorkflowManager.getWorkflowModelConfig(config.workflowId);
            if (wfConfig) {
                return {
                    ...config,
                    ...wfConfig
                };
            }
        }

        // 回退到直接配置（兼容旧版）
        const provider = ProviderManager.getProvider(config.provider);
        if (provider) {
            return {
                ...config,
                endpoint: provider.endpoint,
                apiKey: provider.apiKey || config.apiKey,
                model: config.model || Object.keys(provider.models)[0]
            };
        }

        // 最后回退到当前活跃的供应商/模型
        return {
            ...config,
            endpoint: ProviderManager.getCurrentEndpoint(),
            apiKey: ProviderManager.getCurrentApiKey(),
            model: ProviderManager.getCurrentModelId()
        };
    }
};
PresetManager.init();
