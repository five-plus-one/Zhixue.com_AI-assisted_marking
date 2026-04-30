// ========== 七天网络适配器 ==========
// 实现 PlatformAdapter 接口，处理七天网络平台特定的 DOM 交互

const QitianAdapter = {
    name: '七天网络',
    id: 'qitian',
    urlPatterns: ['*://*.7net.cc/*', '*://*.qt7.net/*'],
    iconUrl: '',

    shouldInitialize() {
        const h = window.location.hostname;
        // yj5.7net.cc 是新 UI，由 qitian-new 适配器处理
        if (h.includes('yj5.')) return false;
        return h.includes('7net.cc') || h.includes('qt7.net');
    },

    async detectMarkingPage() {
        console.log('🔎 [诊断] 七天网络 — 开始检测批改页面元素...');
        try {
            const result = await Promise.race([
                waitForElement(QITIAN_SELECTORS.PAGE_DETECT_IMAGE).then(() => 'paperImage'),
                waitForElement(QITIAN_SELECTORS.PAGE_DETECT_INPUT).then(() => 'score-input'),
                waitForElement(QITIAN_SELECTORS.PAGE_DETECT_SUBMIT).then(() => 'submit-btn'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            // 兜底检测
            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasImg = document.querySelector(QITIAN_SELECTORS.ANSWER_IMAGE);
            const hasInput = document.querySelector(QITIAN_SELECTORS.SCORE_INPUT);
            const hasBtn = document.querySelector(QITIAN_SELECTORS.SUBMIT_BUTTON);
            const detected = !!(hasImg && hasInput && hasBtn);
            console.log(`🔎 [诊断] 兜底检测 — 图片: ${!!hasImg}, 输入框: ${!!hasInput}, 提交按钮: ${!!hasBtn}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        const params = new URLSearchParams(window.location.search);
        const th = params.get('th') || '';
        const km = params.get('km') || '';
        return `qitian_${km}_${th}`;
    },

    async gatherAnswerImages() {
        const imgElements = document.querySelectorAll(QITIAN_SELECTORS.ANSWER_IMAGE);
        console.log(`🖼️ [诊断] 七天网络 — 找到答题卡图片数量: ${imgElements.length}`);
        return Array.from(imgElements).map(img => img.src);
    },

    async fetchImageAsBase64(url) {
        return fetchImageAsBase64(url);
    },

    fillScore(request) {
        const score = request.total;
        const scoreInput = document.querySelector(QITIAN_SELECTORS.SCORE_INPUT);
        console.log(`🔎 [诊断] 七天网络 fillScore — 分数: ${score}, 输入框: ${!!scoreInput}`);

        if (scoreInput) {
            scoreInput.value = score;
            scoreInput.focus();
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log(`✅ [诊断] 分数已填入 #tbs1`);
            return true;
        }
        console.warn('⚠️ [诊断] 未找到分数输入框 #tbs1');
        return false;
    },

    submitGrade() {
        const submitBtn = document.querySelector(QITIAN_SELECTORS.SUBMIT_BUTTON);
        if (submitBtn) {
            console.log(`✅ [诊断] 七天网络 — 点击提交按钮`);
            submitBtn.click();
            return true;
        }
        // 兜底：直接调用平台函数
        if (typeof yjsubmit === 'function') {
            console.log(`✅ [诊断] 七天网络 — 调用 yjsubmit()`);
            yjsubmit();
            return true;
        }
        console.warn('⚠️ [诊断] 未找到提交按钮 #subfen');
        return false;
    },

    async waitForNextPaper(oldImageUrl) {
        let checkTimes = 0;
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                checkTimes++;
                const currentImg = document.querySelector(QITIAN_SELECTORS.ANSWER_IMAGE);
                if (currentImg && currentImg.src !== oldImageUrl) {
                    clearInterval(timer);
                    console.log('✅ 七天网络 — 新试卷已加载');
                    resolve(true);
                } else if (checkTimes > 50) {
                    clearInterval(timer);
                    console.warn('⚠️ 七天网络 — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
        });
    },

    isRegradeMode() {
        const params = new URLSearchParams(window.location.search);
        const reviewMode = params.get('reviewMode');
        // reviewMode=1 为回评模式
        return reviewMode === '1' || !!window.aiGradingState?.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];
        const scoreInput = document.querySelector(QITIAN_SELECTORS.SCORE_INPUT);
        if (scoreInput) {
            inputs.push({ element: scoreInput, label: '总分', index: 0 });
        }
        return inputs;
    }
};

if (QitianAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = QitianAdapter;
}
