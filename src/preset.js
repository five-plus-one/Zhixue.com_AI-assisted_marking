// ========== 全局配置方案管理器 ==========
const PresetManager = {
    data: null,
    init() {
        let saved = GM_getValue('ai-grading-presets');
        if (saved) {
            this.data = JSON.parse(saved);
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
    save() {
        GM_setValue('ai-grading-presets', JSON.stringify(this.data));
    },
    getCurrentConfig() {
        return this.data.list[this.data.active] || {};
    },
    getTaskIdentifier() {
        const baseUrl = window.location.pathname + window.location.hash.split('&_t=')[0];
        let questionIdentifier = '';
        try {
            const exactElement = document.querySelector('#currentTopicIndex');
            if (exactElement && exactElement.textContent) {
                questionIdentifier = exactElement.textContent.trim();
            } else {
                const titleElement = document.querySelector('.topic-title');
                if (titleElement) {
                    questionIdentifier = titleElement.getAttribute('title') || titleElement.textContent.trim();
                }
            }
        } catch (e) {}
        return baseUrl + (questionIdentifier ? '___' + questionIdentifier : '');
    }
};
PresetManager.init();
