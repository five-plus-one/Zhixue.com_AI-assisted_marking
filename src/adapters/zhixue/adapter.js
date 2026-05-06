// ========== 智学网适配器 ==========
// 实现 PlatformAdapter 接口，处理智学网平台特定的 DOM 交互

const ZhixueAdapter = {
    name: '智学网',
    id: 'zhixue',
    urlPatterns: ['https://www.zhixue.com/webmarking/*', 'https://*.zhixue.com/webmarking/*'],
    iconUrl: 'https://www.zhixue.com/favicon.ico',

    shouldInitialize() {
        return window.location.pathname.includes('/webmarking/');
    },

    async detectMarkingPage() {
        console.log('🔎 [诊断] 开始检测批改页面元素...');
        try {
            const result = await Promise.race([
                waitForElement(ZHIXUE_SELECTORS.PAGE_DETECT_IMAGE).then(() => 'topicImg'),
                waitForElement(ZHIXUE_SELECTORS.PAGE_DETECT_INPUT).then(() => 'score-input'),
                waitForElement('button:contains("提交分数")').then(() => 'submit-btn')
            ]).catch(() => null);
            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasInput = document.querySelector(ZHIXUE_SELECTORS.SCORE_INPUT) || document.querySelector('input[type="text"]');
            const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交') || btn.textContent.includes('分数'));
            const detected = !!(hasInput && hasButton);
            console.log(`🔎 [诊断] 兜底检测结果 — 输入框: ${!!hasInput}, 提交按钮: ${hasButton}, 最终判断: ${detected}`);
            if (!detected) {
                console.warn('⚠️ [诊断] 未检测到批改页面，脚本将不会初始化。当前所有按钮文字:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t).join(' | '));
            }
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 抛出异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        const baseUrl = window.location.pathname + window.location.hash.split('&_t=')[0];
        let questionIdentifier = '';
        try {
            const exactElement = document.querySelector(ZHIXUE_SELECTORS.TOPIC_INDEX);
            if (exactElement && exactElement.textContent) {
                questionIdentifier = exactElement.textContent.trim();
            } else {
                const titleElement = document.querySelector(ZHIXUE_SELECTORS.TOPIC_TITLE);
                if (titleElement) {
                    questionIdentifier = titleElement.getAttribute('title') || titleElement.textContent.trim();
                }
            }
        } catch (e) {}
        return baseUrl + (questionIdentifier ? '___' + questionIdentifier : '');
    },

    async gatherAnswerImages() {
        const imgElements = document.querySelectorAll(ZHIXUE_SELECTORS.ANSWER_IMAGE);
        console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imgElements.length}`);
        return Array.from(imgElements).map(img => img.src);
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
        const allInputs = document.querySelectorAll('input');
        console.log(`🔎 [诊断] fillScore 调用 — 分数: ${total}, 页面上所有input数量: ${allInputs.length}`);

        const scoreInput = document.querySelector(ZHIXUE_SELECTORS.SCORE_INPUT) ||
                           document.querySelector(ZHIXUE_SELECTORS.SCORE_INPUT_PLACEHOLDER) ||
                           Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('分') || i.name?.includes('score'));

        if (scoreInput) {
            console.log(`✅ [诊断] 找到分数输入框: type=${scoreInput.type} placeholder=${scoreInput.placeholder} name=${scoreInput.name}`);
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(scoreInput, total);
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log(`✅ [诊断] 分数已填入`);
            return true;
        } else {
            console.warn('⚠️ [诊断] 未找到分数输入框');
            return false;
        }
    },

    submitGrade() {
        const allBtns = Array.from(document.querySelectorAll('button'));
        console.log(`🔎 [诊断] submitGrade — 页面按钮总数: ${allBtns.length}，文字列表: ${allBtns.map(b => b.textContent.trim()).filter(t => t).join(' | ')}`);
        const submitBtn = allBtns.find(btn => btn.textContent.includes(ZHIXUE_SELECTORS.SUBMIT_BUTTON_TEXT));
        if (submitBtn) {
            console.log(`✅ [诊断] 找到"提交分数"按钮，准备点击`);
            submitBtn.click();
            return true;
        }
        console.warn(`⚠️ [诊断] 未找到"提交分数"按钮`);
        return false;
    },

    async waitForNextPaper(oldImageUrl) {
        let checkTimes = 0;
        return new Promise((resolve) => {
            const checkNextTimer = setInterval(() => {
                checkTimes++;
                const currentImg = document.querySelector(ZHIXUE_SELECTORS.ANSWER_IMAGE);
                if (currentImg && currentImg.src !== oldImageUrl) {
                    clearInterval(checkNextTimer);
                    console.log('✅ 新试卷已加载完毕！');
                    resolve(true);
                } else if (checkTimes > 50) {
                    clearInterval(checkNextTimer);
                    console.warn('⚠️ 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
        });
    },

    isRegradeMode() {
        return !!sessionStorage.getItem('ai-grading-regrade') || !!window.aiGradingState.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];
        // 优先返回分小题输入框
        const subInputs = document.querySelectorAll('#containter_topicTxt input[name="topicTxt"]');
        if (subInputs.length > 0) {
            subInputs.forEach((el, i) => {
                const labelEl = el.closest('li')?.querySelector('.label');
                const label = labelEl?.textContent?.trim() || `第${i + 1}题`;
                inputs.push({ element: el, label, index: i });
            });
            return inputs;
        }
        // 回退到总分输入框
        const scoreInput = document.querySelector(ZHIXUE_SELECTORS.SCORE_INPUT) ||
                           document.querySelector(ZHIXUE_SELECTORS.SCORE_INPUT_PLACEHOLDER);
        if (scoreInput) {
            inputs.push({ element: scoreInput, label: '总分', index: 0 });
        }
        return inputs;
    },

    detectSubQuestions() {
        const subs = [];
        document.querySelectorAll('#containter_topicTxt li').forEach((li, i) => {
            const input = li.querySelector('input[name="topicTxt"]');
            if (!input) return;
            const labelEl = li.querySelector('.label');
            const label = labelEl?.textContent?.trim() || `第${i + 1}题`;
            const maxScore = parseInt(input.getAttribute('score')) || parseInt(input.placeholder?.match(/\d+/)?.[0]) || 0;
            subs.push({ label, element: input, index: i, maxScore });
        });
        // 只有一题时不启用分小题给分
        return subs.length > 1 ? subs : [];
    }
};

if (ZhixueAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = ZhixueAdapter;
}
