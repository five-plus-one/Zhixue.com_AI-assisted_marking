// ========== 好分数适配器 ==========
// yue.haofenshu.com — Vue + Element UI + SVG 渲染答题卡

const HaofenshuAdapter = {
    name: '好分数',
    id: 'haofenshu',
    urlPatterns: ['https://yue.haofenshu.com/minions/*'],
    iconUrl: 'https://yue.haofenshu.com/favicon.ico',

    shouldInitialize() {
        return window.location.hostname.includes('haofenshu.com') &&
               window.location.pathname.includes('/minions/');
    },

    async detectMarkingPage() {
        console.log('🔎 [诊断] 好分数 — 开始检测批改页面...');
        try {
            const result = await Promise.race([
                waitForElement(HAO_FENSHU_SELECTORS.PAGE_DETECT_IMAGE).then(() => 'svg-image'),
                waitForElement(HAO_FENSHU_SELECTORS.PAGE_DETECT_INPUT).then(() => 'score-input'),
                waitForElement(HAO_FENSHU_SELECTORS.PAGE_DETECT_SUBMIT).then(() => 'submit-btn'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            // 兜底检测
            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasImage = document.querySelector(HAO_FENSHU_SELECTORS.ANSWER_IMAGE);
            const hasInput = document.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT);
            const hasBtn = document.querySelector(HAO_FENSHU_SELECTORS.SUBMIT_BUTTON);
            const detected = !!(hasImage && hasInput && hasBtn);
            console.log(`🔎 [诊断] 兜底检测 — 图片: ${!!hasImage}, 输入框: ${!!hasInput}, 提交: ${!!hasBtn}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        // URL: /minions/subject/{subjectId}/mark/{taskId}/normal/{index}
        const path = window.location.pathname;
        return path;
    },

    async gatherAnswerImages() {
        // 等待 SVG 图片加载
        await new Promise(r => setTimeout(r, 1000));

        const imageElements = document.querySelectorAll(HAO_FENSHU_SELECTORS.ANSWER_IMAGE);
        console.log(`🖼️ [诊断] 找到 SVG image 元素数量: ${imageElements.length}`);

        const urls = [];
        imageElements.forEach(img => {
            // SVG image 元素的 URL 在 xlink:href 或 href 属性中
            const url = img.getAttribute('xlink:href') || img.getAttribute('href') || img.href?.baseVal;
            if (url && url.startsWith('http')) {
                urls.push(url);
            }
        });

        console.log(`🖼️ [诊断] 有效图片 URL 数量: ${urls.length}`);
        return urls;
    },

    async fetchImageAsBase64(url) {
        return fetchImageAsBase64(url);
    },

    fillScore(request) {
        const { total, subScores } = request;

        // 分小题填入
        if (subScores && subScores.length > 0) {
            const detected = this.detectSubQuestions();
            if (detected.length > 0) {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                for (const sq of subScores) {
                    const target = detected.find(d =>
                        d.label === sq.label || sq.label.includes(d.label) || d.label.includes(sq.label)
                    );
                    if (target && sq.score !== null) {
                        setter.call(target.element, sq.score);
                        target.element.dispatchEvent(new Event('input', { bubbles: true }));
                        target.element.dispatchEvent(new Event('change', { bubbles: true }));
                        target.element.dispatchEvent(new Event('blur', { bubbles: true }));
                        console.log(`✅ [诊断] 小题 ${sq.label} 分数 ${sq.score} 已填入`);
                    }
                }
                return true;
            }
        }

        // 回退：填总分到第一个输入框
        const scoreInput = document.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT_ACTIVE) ||
                           document.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT);
        console.log(`🔎 [诊断] 好分数 fillScore — 分数: ${total}, 输入框: ${!!scoreInput}`);

        if (scoreInput) {
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
        const submitBtn = document.querySelector(HAO_FENSHU_SELECTORS.SUBMIT_BUTTON);
        if (submitBtn) {
            console.log(`✅ [诊断] 好分数 — 点击提交按钮`);
            submitBtn.click();
            return true;
        }
        console.warn('⚠️ [诊断] 未找到提交按钮');
        return false;
    },

    async waitForNextPaper(oldImageUrl) {
        let checkTimes = 0;
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                checkTimes++;
                // 获取当前图片 URL
                const currentImg = document.querySelector(HAO_FENSHU_SELECTORS.ANSWER_IMAGE);
                const currentUrl = currentImg ? (currentImg.getAttribute('xlink:href') || currentImg.getAttribute('href') || currentImg.href?.baseVal) : null;

                // 检测图片变化或输入框被清空
                const input = document.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT);
                const inputCleared = input && (input.value === '' || input.value === '0');

                if (oldImageUrl && currentUrl && currentUrl !== oldImageUrl) {
                    clearInterval(timer);
                    console.log('✅ 好分数 — 新试卷已加载（图片变化）');
                    resolve(true);
                } else if (inputCleared && checkTimes > 3) {
                    clearInterval(timer);
                    console.log('✅ 好分数 — 新试卷已加载（输入框清空）');
                    resolve(true);
                } else if (checkTimes > 50) {
                    clearInterval(timer);
                    console.warn('⚠️ 好分数 — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
        });
    },

    isRegradeMode() {
        // 好分数暂未发现明确的回评模式标识
        return !!window.aiGradingState?.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];
        document.querySelectorAll(HAO_FENSHU_SELECTORS.SCORE_LIST).forEach((listEl, i) => {
            const titleEl = listEl.querySelector(HAO_FENSHU_SELECTORS.SCORE_LIST_TITLE);
            const inputEl = listEl.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT);
            if (inputEl) {
                const label = titleEl?.textContent?.trim() || `第${i + 1}题`;
                inputs.push({ element: inputEl, label, index: i });
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
        const subs = [];
        document.querySelectorAll(HAO_FENSHU_SELECTORS.SCORE_LIST).forEach((listEl, i) => {
            const titleEl = listEl.querySelector(HAO_FENSHU_SELECTORS.SCORE_LIST_TITLE);
            const inputEl = listEl.querySelector(HAO_FENSHU_SELECTORS.SCORE_INPUT);
            if (inputEl && titleEl) {
                const label = titleEl.textContent.trim();
                // 从 placeholder 提取满分值，如 "满分4分"
                const placeholder = inputEl.placeholder || '';
                const maxScoreMatch = placeholder.match(/满分(\d+)分/);
                const maxScore = maxScoreMatch ? parseInt(maxScoreMatch[1]) : 0;
                subs.push({ label, element: inputEl, index: i, maxScore });
            }
        });
        // 只有一题时不启用分小题给分
        return subs.length > 1 ? subs : [];
    }
};

if (HaofenshuAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = HaofenshuAdapter;
}
