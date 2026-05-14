// ========== 新教育智能平台适配器 ==========
// 实现 PlatformAdapter 接口，处理新教育平台特定的 DOM 交互
// 平台特征：Vue 3 + Ant Design，Canvas 渲染答题卡，API 拦截获取图片

// 拦截 API 响应获取图片 URL
const _xinjiaoyuOrigOpen = XMLHttpRequest.prototype.open;
const _xinjiaoyuOrigSend = XMLHttpRequest.prototype.send;
let _xinjiaoyuCurrentImageUrl = null;
let _xinjiaoyuNextImageUrl = null;
let _xinjiaoyuCurrentQuestionNumber = null;
let _xinjiaoyuCurrentTotalScore = null;

XMLHttpRequest.prototype.open = function(method, url, ...args) {
    this._xinjiaoyuUrl = url;
    return _xinjiaoyuOrigOpen.call(this, method, url, ...args);
};

XMLHttpRequest.prototype.send = function(...args) {
    this.addEventListener('load', function() {
        const url = this._xinjiaoyuUrl || '';
        if (url.includes('/review/task/teacher/student/unreviewed/next')) {
            try {
                const response = JSON.parse(this.responseText);
                if (response.code === 200 && response.data?.records) {
                    const records = response.data.records;
                    if (records.length > 0) {
                        const current = records[0];
                        _xinjiaoyuCurrentImageUrl = current.imageURL || current.answerQuestions?.[0]?.rawScan;
                        _xinjiaoyuCurrentQuestionNumber = current.answerQuestions?.[0]?.questionNumber;
                        _xinjiaoyuCurrentTotalScore = current.answerQuestions?.[0]?.totalScore || current.score;
                        console.log('🖼️ [诊断] 新教育 API 拦截 - 当前图片:', _xinjiaoyuCurrentImageUrl?.substring(0, 80));
                        console.log('📋 [诊断] 题号:', _xinjiaoyuCurrentQuestionNumber, '满分:', _xinjiaoyuCurrentTotalScore);
                    }
                    if (records.length > 1) {
                        const next = records[1];
                        _xinjiaoyuNextImageUrl = next.imageURL || next.answerQuestions?.[0]?.rawScan;
                        console.log('🖼️ [诊断] 新教育 API 拦截 - 预加载图片:', _xinjiaoyuNextImageUrl?.substring(0, 80));
                    }
                }
            } catch (e) {
                console.error('❌ [诊断] 新教育 API 解析失败:', e);
            }
        }
    });
    return _xinjiaoyuOrigSend.call(this, ...args);
};

const XinjiaoyuAdapter = {
    name: '新教育',
    id: 'xinjiaoyu',
    urlPatterns: ['*://www.xinjiaoyu.com/*'],
    iconUrl: 'https://www.xinjiaoyu.com/favicon.ico',

    shouldInitialize() {
        return window.location.hostname.includes('xinjiaoyu.com');
    },

    isMarkingPage() {
        return window.location.pathname.includes('/grading_center/') &&
               window.location.pathname.includes('/grading_new');
    },

    async detectMarkingPage() {
        if (!this.isMarkingPage()) {
            console.log('🔎 [诊断] 新教育 — 当前不在阅卷页面 (pathname:', window.location.pathname, ')');
            return false;
        }

        console.log('🔎 [诊断] 新教育 — 开始检测批改页面元素...');
        try {
            // 等待 Canvas 或分数输入框出现
            const hasCanvas = document.querySelector(XINJIAOYU_SELECTORS.PAGE_DETECT_CANVAS);
            const hasInput = document.querySelector(XINJIAOYU_SELECTORS.PAGE_DETECT_INPUT);

            if (hasCanvas || hasInput) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${hasCanvas ? 'Canvas' : ''} ${hasInput ? '输入框' : ''}`);
                return true;
            }

            // 兜底检测
            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasCanvasRetry = document.querySelector(XINJIAOYU_SELECTORS.PAGE_DETECT_CANVAS);
            const hasInputRetry = document.querySelector(XINJIAOYU_SELECTORS.PAGE_DETECT_INPUT);
            const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交分数'));

            const detected = !!(hasCanvasRetry || (hasInputRetry && hasButton));
            console.log(`🔎 [诊断] 兜底检测结果 — Canvas: ${!!hasCanvasRetry}, 输入框: ${!!hasInputRetry}, 提交按钮: ${hasButton}, 最终判断: ${detected}`);

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
        const baseUrl = window.location.pathname + window.location.search;
        const questionNumber = _xinjiaoyuCurrentQuestionNumber || '';
        return baseUrl + (questionNumber ? '___Q' + questionNumber : '');
    },

    async gatherAnswerImages() {
        // 优先使用 API 拦截的图片 URL
        if (_xinjiaoyuCurrentImageUrl) {
            console.log('🖼️ [诊断] 使用 API 拦截的图片:', _xinjiaoyuCurrentImageUrl.substring(0, 80));
            return [_xinjiaoyuCurrentImageUrl];
        }

        // 回退：尝试从 Canvas 导出
        const canvas = document.querySelector(XINJIAOYU_SELECTORS.ANSWER_CANVAS);
        if (canvas) {
            try {
                const dataUrl = canvas.toDataURL('image/png');
                if (dataUrl.length > 1000) {
                    console.log('🖼️ [诊断] 从 Canvas 导出图片成功');
                    return [dataUrl];
                }
            } catch (e) {
                console.warn('⚠️ [诊断] Canvas 导出失败:', e.message);
            }
        }

        console.warn('⚠️ [诊断] 未找到答题卡图片');
        return [];
    },

    async fetchImageAsBase64(url) {
        // 如果是 data URL，直接返回
        if (url.startsWith('data:')) {
            return url.split(',')[1];
        }

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
                for (const sq of subScores) {
                    const target = detected.find(d =>
                        d.label === sq.label || sq.label.includes(d.label) || d.label.includes(sq.label)
                    );
                    if (target && sq.score !== null) {
                        this._fillInputValue(target.element, sq.score);
                        console.log(`✅ [诊断] 小题 ${sq.label} 分数 ${sq.score} 已填入`);
                    }
                }
                return true;
            }
        }

        // 回退：填总分到第一个分数输入框
        const scoreInput = document.querySelector(XINJIAOYU_SELECTORS.SCORE_INPUT);
        if (scoreInput) {
            this._fillInputValue(scoreInput, total);
            console.log(`✅ [诊断] 分数 ${total} 已填入`);
            return true;
        }

        console.warn('⚠️ [诊断] 未找到分数输入框');
        return false;
    },

    _fillInputValue(input, value) {
        // 使用 nativeInputValueSetter 兼容 Vue/React
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
    },

    submitGrade() {
        const allBtns = Array.from(document.querySelectorAll('button'));
        console.log(`🔎 [诊断] submitGrade — 页面按钮总数: ${allBtns.length}`);
        const submitBtn = allBtns.find(btn => btn.textContent.includes(XINJIAOYU_SELECTORS.SUBMIT_BUTTON_TEXT));
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

                // 检测1：API 拦截的图片 URL 变化
                if (_xinjiaoyuCurrentImageUrl && _xinjiaoyuCurrentImageUrl !== oldImageUrl) {
                    clearInterval(checkNextTimer);
                    console.log('✅ 新试卷已加载完毕（API 图片变化）');
                    resolve(true);
                    return;
                }

                // 检测2：分数输入框被清空
                const scoreInput = document.querySelector(XINJIAOYU_SELECTORS.SCORE_INPUT);
                const inputCleared = scoreInput && (scoreInput.value === '' || scoreInput.value === '0');
                if (inputCleared && checkTimes > 3) {
                    clearInterval(checkNextTimer);
                    console.log('✅ 新试卷已加载完毕（输入框清空）');
                    resolve(true);
                    return;
                }

                // 检测3：Canvas 内容变化
                const canvas = document.querySelector(XINJIAOYU_SELECTORS.ANSWER_CANVAS);
                if (canvas) {
                    try {
                        const newDataUrl = canvas.toDataURL('image/png');
                        // 如果 Canvas 内容与旧的不同，说明已更新
                        if (checkTimes > 5 && newDataUrl.length > 1000) {
                            clearInterval(checkNextTimer);
                            console.log('✅ 新试卷已加载完毕（Canvas 更新）');
                            resolve(true);
                            return;
                        }
                    } catch (e) {}
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
        const subItems = document.querySelectorAll(XINJIAOYU_SELECTORS.SUB_QUESTION_ITEM);
        if (subItems.length > 0) {
            subItems.forEach((item, i) => {
                const input = item.querySelector('.ant-input-number-input');
                if (input) {
                    // 获取题号标签
                    const labelEl = item.querySelector('span');
                    const label = labelEl?.textContent?.trim() || `第${i + 1}题`;
                    inputs.push({ element: input, label, index: i });
                }
            });
            return inputs;
        }

        // 回退到单个输入框
        const scoreInput = document.querySelector(XINJIAOYU_SELECTORS.SCORE_INPUT);
        if (scoreInput) {
            inputs.push({ element: scoreInput, label: '总分', index: 0 });
        }
        return inputs;
    },

    detectSubQuestions() {
        const subs = [];
        const subItems = document.querySelectorAll(XINJIAOYU_SELECTORS.SUB_QUESTION_ITEM);

        subItems.forEach((item, i) => {
            const input = item.querySelector('.ant-input-number-input');
            if (!input) return;

            // 获取题号
            const labelEl = item.querySelector('span');
            const label = labelEl?.textContent?.trim() || `第${i + 1}题`;

            // 获取满分值
            const placeholder = input.placeholder || '';
            const maxScoreMatch = placeholder.match(/满分(\d+)分/);
            const maxScore = maxScoreMatch ? parseInt(maxScoreMatch[1]) : 0;

            subs.push({ label, element: input, index: i, maxScore });
        });

        // 只有一题时不启用分小题给分
        return subs.length > 1 ? subs : [];
    }
};

if (XinjiaoyuAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = XinjiaoyuAdapter;
}
