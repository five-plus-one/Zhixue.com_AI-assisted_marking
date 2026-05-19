// ========== 华翰云适配器 ==========
// yunyuejuan.net — Vue3 + Element Plus

const HanhanAdapter = {
    name: '华翰云',
    id: 'hanhan',
    urlPatterns: ['*://*.yunyuejuan.net/*'],
    iconUrl: 'https://yunyuejuan.net/favicon.ico',

    shouldInitialize() {
        return window.location.hostname.includes('yunyuejuan.net');
    },

    // 快速页面检查（不等待 DOM），用于 URL 变化监听器
    isMarkingPage() {
        return /\/marking\/grading(\?|$)/.test(window.location.hash);
    },

    async detectMarkingPage() {
        // 华翰云是 SPA，先检查 hash 路径是否为阅卷页面
        // 精确匹配 /marking/grading 后跟 ? 或结尾，排除 /marking/gradingList 等
        const hash = window.location.hash;
        if (!/\/marking\/grading(\?|$)/.test(hash)) {
            console.log('🔎 [诊断] 华翰云 — 当前不在阅卷页面 (hash:', hash, ')');
            return false;
        }

        console.log('🔎 [诊断] 华翰云 — 开始检测批改页面...');
        try {
            const result = await Promise.race([
                waitForElement(HANHAN_SELECTORS.PAGE_DETECT_IMAGE).then(() => 'answer-image'),
                waitForElement(HANHAN_SELECTORS.PAGE_DETECT_INPUT).then(() => 'score-input'),
                waitForElement(HANHAN_SELECTORS.PAGE_DETECT_SUBMIT).then(() => 'submit-btn'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            // 兜底检测
            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasImage = document.querySelector(HANHAN_SELECTORS.ANSWER_IMAGE);
            const hasInput = document.querySelector(HANHAN_SELECTORS.SCORE_INPUT);
            const hasBtn = document.querySelector(HANHAN_SELECTORS.SUBMIT_BUTTON);
            const detected = !!(hasImage && hasInput && hasBtn);
            console.log(`🔎 [诊断] 兜底检测 — 图片: ${!!hasImage}, 输入框: ${!!hasInput}, 提交: ${!!hasBtn}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        // 华翰云是 SPA，使用 hash 路径 + questionId
        const url = new URL(window.location.href);
        const hash = url.hash;
        const questionId = new URLSearchParams(hash.split('?')[1] || '').get('questionId') || '';
        return `hanhan_${questionId}_${hash.split('?')[0]}`;
    },

    async gatherAnswerImages() {
        // 等待图片加载
        await new Promise(r => setTimeout(r, 1000));

        // 获取答题卡图片（排除 data: 开头的 base64 图片，这些通常是图标）
        const images = document.querySelectorAll(HANHAN_SELECTORS.ANSWER_IMAGE);
        const urls = [];

        images.forEach(img => {
            const src = img.src;
            // 只收集 http/https 开头的真实图片，排除 base64 图标
            if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
                urls.push(src);
            }
        });

        console.log(`🖼️ [诊断] 华翰云 — 找到答题卡图片: ${urls.length} 张`);
        if (urls.length > 0) {
            console.log(`🖼️ [诊断] 第一张图片: ${urls[0].substring(0, 80)}...`);
        }
        return urls;
    },

    async fetchImageAsBase64(url) {
        return fetchImageAsBase64(url);
    },

    fillScore(request) {
        const { total, subScores } = request;

        // 华翰云主要是单题模式，使用主输入框
        const scoreInput = document.querySelector(HANHAN_SELECTORS.SCORE_INPUT);
        console.log(`🔎 [诊断] 华翰云 fillScore — 分数: ${total}, 输入框: ${!!scoreInput}`);

        if (scoreInput) {
            // Vue3 兼容：使用 nativeInputValueSetter
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(scoreInput, total);
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log(`✅ [诊断] 分数已填入`);
            return true;
        }
        console.warn('⚠️ [诊断] 未找到分数输入框');
        return false;
    },

    submitGrade() {
        // 查找"给分"按钮
        const buttons = document.querySelectorAll(HANHAN_SELECTORS.SUBMIT_BUTTON);
        for (const btn of buttons) {
            if (btn.textContent.trim() === HANHAN_SELECTORS.SUBMIT_BUTTON_TEXT) {
                console.log(`✅ [诊断] 华翰云 — 点击"给分"按钮`);
                btn.click();
                return true;
            }
        }

        // 备选：查找包含"给分"文字的按钮
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            if (btn.textContent.trim().includes('给分')) {
                console.log(`✅ [诊断] 华翰云 — 点击包含"给分"的按钮`);
                btn.click();
                return true;
            }
        }

        console.warn('⚠️ [诊断] 未找到"给分"按钮');
        return false;
    },

    async waitForNextPaper(oldImageUrl) {
        let checkTimes = 0;
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                checkTimes++;

                // 获取当前图片 URL
                const currentImg = document.querySelector(HANHAN_SELECTORS.ANSWER_IMAGE);
                const currentUrl = currentImg ? currentImg.src : null;

                // 检测图片变化或输入框被清空
                const input = document.querySelector(HANHAN_SELECTORS.SCORE_INPUT);
                const inputCleared = input && (input.value === '' || input.value === '0');

                if (oldImageUrl && currentUrl && currentUrl !== oldImageUrl) {
                    clearInterval(timer);
                    console.log('✅ 华翰云 — 新试卷已加载（图片变化）');
                    resolve(true);
                } else if (inputCleared && checkTimes > 3) {
                    clearInterval(timer);
                    console.log('✅ 华翰云 — 新试卷已加载（输入框清空）');
                    resolve(true);
                } else if (checkTimes > 50) {
                    clearInterval(timer);
                    console.warn('⚠️ 华翰云 — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
        });
    },

    isRegradeMode() {
        // 华翰云暂未发现明确的回评模式标识
        return !!window.aiGradingState?.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];

        // 主分数输入框
        const mainInput = document.querySelector(HANHAN_SELECTORS.SCORE_INPUT);
        if (mainInput) {
            inputs.push({ element: mainInput, label: '总分', index: 0 });
        }

        // 如果有 number 类型的输入框（可能是小题分数）
        const numberInputs = document.querySelectorAll(HANHAN_SELECTORS.SCORE_INPUT_NUMBER);
        numberInputs.forEach((input, i) => {
            if (input !== mainInput) {
                inputs.push({ element: input, label: `第${i + 1}题`, index: i + 1 });
            }
        });

        return inputs;
    },

    fillScores(scores) {
        const inputs = this.getScoreInputs();
        if (inputs.length === 0) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        let successCount = 0;
        for (let i = 0; i < Math.min(scores.length, inputs.length); i++) {
            if (scores[i] === null || scores[i] === undefined) continue;
            setter.call(inputs[i].element, scores[i]);
            inputs[i].element.dispatchEvent(new Event('input', { bubbles: true }));
            inputs[i].element.dispatchEvent(new Event('change', { bubbles: true }));
            inputs[i].element.dispatchEvent(new Event('blur', { bubbles: true }));
            successCount++;
            console.log(`✅ [诊断] ${inputs[i].label} 分数 ${scores[i]} 已填入`);
        }
        return successCount > 0;
    },

    detectSubQuestions() {
        // 华翰云暂未发现分小题结构
        return [];
    },
};

if (HanhanAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = HanhanAdapter;
}
