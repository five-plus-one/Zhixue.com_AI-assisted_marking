// ========== 云阅卷适配器 ==========
// 实现 PlatformAdapter 接口，处理云阅卷平台特定的 DOM 交互
// 平台特征：jQuery 1.11.3，传统页面，分小题输入框

const YunyuejuanAdapter = {
    name: '云阅卷',
    id: 'yunyuejuan',
    urlPatterns: ['*://*/Marking/*'],
    iconUrl: '',

    shouldInitialize() {
        // 检测是否是云阅卷平台（通过特征元素判断）
        return window.location.pathname.includes('/Marking/');
    },

    isMarkingPage() {
        return window.location.pathname.includes('/Marking/NormalReadPaper');
    },

    async detectMarkingPage() {
        if (!this.isMarkingPage()) {
            console.log('🔎 [诊断] 云阅卷 — 当前不在阅卷页面 (pathname:', window.location.pathname, ')');
            return false;
        }

        console.log('🔎 [诊断] 云阅卷 — 开始检测批改页面元素...');
        try {
            const hasImage = document.querySelector(YUNYUEJUAN_SELECTORS.PAGE_DETECT_IMAGE);
            const hasInput = document.querySelector(YUNYUEJUAN_SELECTORS.PAGE_DETECT_INPUT);
            const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交分数'));

            const detected = !!(hasImage && hasInput && hasButton);
            console.log(`🔎 [诊断] 检测结果 — 图片: ${!!hasImage}, 输入框: ${!!hasInput}, 提交按钮: ${hasButton}, 最终判断: ${detected}`);

            if (!detected) {
                console.warn('⚠️ [诊断] 未检测到批改页面，脚本将不会初始化');
            }
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 抛出异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        const baseUrl = window.location.pathname;
        // 尝试从页面获取题目标识
        const img = document.querySelector(YUNYUEJUAN_SELECTORS.ANSWER_IMAGE);
        const imgId = img ? img.id : '';
        return baseUrl + (imgId ? '___' + imgId : '');
    },

    async gatherAnswerImages() {
        const imgElements = document.querySelectorAll(YUNYUEJUAN_SELECTORS.ANSWER_IMAGE);
        console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imgElements.length}`);
        return Array.from(imgElements).map(img => img.src);
    },

    async fetchImageAsBase64(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: (res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64 = reader.result.split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(res.response);
                },
                onerror: reject
            });
        });
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

        // 回退：填总分到第一个分数输入框
        const scoreInput = document.querySelector(YUNYUEJUAN_SELECTORS.SCORE_INPUT);
        if (scoreInput) {
            console.log(`✅ [诊断] 找到分数输入框: id=${scoreInput.id}`);
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(scoreInput, total);
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            // 触发平台特定的 onkeyup 事件
            if (typeof clearNoNum === 'function') {
                clearNoNum(scoreInput);
            }
            console.log(`✅ [诊断] 分数已填入`);
            return true;
        } else {
            console.warn('⚠️ [诊断] 未找到分数输入框');
            return false;
        }
    },

    submitGrade() {
        const allBtns = Array.from(document.querySelectorAll('button'));
        console.log(`🔎 [诊断] submitGrade — 页面按钮总数: ${allBtns.length}`);
        const submitBtn = allBtns.find(btn => btn.textContent.includes(YUNYUEJUAN_SELECTORS.SUBMIT_BUTTON_TEXT));
        if (submitBtn) {
            console.log(`✅ [诊断] 找到"提交分数"按钮，准备点击`);
            // 调用平台的 inputkey 函数或直接点击按钮
            if (typeof inputkey === 'function') {
                inputkey(']');
            } else {
                submitBtn.click();
            }
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

                // 检测1：图片 src 变化
                const currentImg = document.querySelector(YUNYUEJUAN_SELECTORS.ANSWER_IMAGE);
                if (currentImg && currentImg.src !== oldImageUrl) {
                    clearInterval(checkNextTimer);
                    console.log('✅ 新试卷已加载完毕（图片变化）');
                    resolve(true);
                    return;
                }

                // 检测2：分数输入框被清空（新试卷加载时平台会重置输入框）
                const scoreInput = document.querySelector(YUNYUEJUAN_SELECTORS.SCORE_INPUT);
                const inputCleared = scoreInput && (scoreInput.value === '' || scoreInput.value === '0');
                if (inputCleared && checkTimes > 3) {
                    clearInterval(checkNextTimer);
                    console.log('✅ 新试卷已加载完毕（输入框清空）');
                    resolve(true);
                    return;
                }

                if (checkTimes > 50) {
                    clearInterval(checkNextTimer);
                    console.warn('⚠️ 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
        });
    },

    isRegradeMode() {
        return !!window.aiGradingState?.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];
        // 优先返回分小题输入框
        const subInputs = document.querySelectorAll(YUNYUEJUAN_SELECTORS.SUB_QUESTION_ROW);
        if (subInputs.length > 0) {
            subInputs.forEach((tr, i) => {
                const input = tr.querySelector('input.fenshu');
                if (input) {
                    const labelTd = tr.querySelector('td:first-child');
                    const label = labelTd?.textContent?.trim() || `第${i + 1}题`;
                    inputs.push({ element: input, label, index: i });
                }
            });
            return inputs;
        }
        // 回退到单个输入框
        const scoreInput = document.querySelector(YUNYUEJUAN_SELECTORS.SCORE_INPUT);
        if (scoreInput) {
            inputs.push({ element: scoreInput, label: '总分', index: 0 });
        }
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
        document.querySelectorAll(YUNYUEJUAN_SELECTORS.SUB_QUESTION_ROW).forEach((tr, i) => {
            const input = tr.querySelector('input.fenshu');
            if (!input) return;
            const labelTd = tr.querySelector('td:first-child');
            const label = labelTd?.textContent?.trim() || `第${i + 1}题`;
            const maxScore = parseInt(input.getAttribute('data-score')) || 0;
            subs.push({ label, element: input, index: i, maxScore });
        });
        // 只有一题时不启用分小题给分
        return subs.length > 1 ? subs : [];
    }
};

if (YunyuejuanAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = YunyuejuanAdapter;
}
