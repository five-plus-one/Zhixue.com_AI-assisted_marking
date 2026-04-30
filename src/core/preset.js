// ========== 全局配置方案管理器 ==========
const PresetManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-presets');
        if (saved) {
            this.data = JSON.parse(saved);
            this._migrateGradingMode();
            this._migrateProvider();
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
    }
};
PresetManager.init();
