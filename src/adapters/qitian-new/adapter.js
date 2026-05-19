// ========== 七天网络新 UI 适配器 ==========
// yj5.7net.cc — Vue SPA + Element UI + Canvas 渲染答题卡

// 图片池：试题ID → 图片URL 的映射
// Review/ReviewData API 返回当前试卷的 id 和 image.url
// 通过页面上显示的"试题ID"精确匹配当前试卷的图片
let _qitianImagePool = {};

// 仅在七天网络新UI平台上执行 XHR 拦截，避免影响其他平台
if (location.hostname.includes('yj5.7net.cc')) {
(function installApiInterceptor() {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._interceptUrl = url;
        return origOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            try {
                const url = this._interceptUrl || '';
                if (!url.includes('Review/ReviewData')) return;

                const json = JSON.parse(this.responseText);
                const list = json?.data?.list;
                if (!list || list.length === 0) return;

                // 遍历列表中的所有试卷，提取试题ID和图片URL
                for (const paper of list) {
                    const id = paper?.id;
                    const imageUrl = paper?.image?.url;
                    if (id && imageUrl) {
                        _qitianImagePool[id] = imageUrl;
                    }
                }

                const poolSize = Object.keys(_qitianImagePool).length;
                console.log(`🎯 [API拦截] 更新图片池，共 ${poolSize} 份试卷`);
                Object.keys(_qitianImagePool).forEach((id, i) => {
                    console.log(`  📋 试题ID${i + 1}: ${id}`);
                });
            } catch (e) {
                // 忽略解析错误
            }
        });
        return origSend.call(this, ...args);
    };
})();
} // end if yj5.7net.cc

const QitianNewAdapter = {
    name: '七天网络(新UI)',
    id: 'qitian-new',
    urlPatterns: ['*://yj5.7net.cc/*'],
    iconUrl: '',

    shouldInitialize() {
        return location.hostname.includes('yj5.7net.cc');
    },

    async detectMarkingPage() {
        console.log('🔎 [诊断] 七天网络新UI — 开始检测批改页面...');
        try {
            const result = await Promise.race([
                waitForElement(QITIAN_NEW_SELECTORS.PAGE_DETECT_CANVAS).then(() => 'canvas'),
                waitForElement(QITIAN_NEW_SELECTORS.PAGE_DETECT_INPUT).then(() => 'score-input'),
                waitForElement(QITIAN_NEW_SELECTORS.PAGE_DETECT_SUBMIT).then(() => 'submit-btn'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasCanvas = document.querySelector(QITIAN_NEW_SELECTORS.ANSWER_CANVAS);
            const hasInput = document.querySelector(QITIAN_NEW_SELECTORS.SCORE_INPUT);
            const hasBtn = document.querySelector(QITIAN_NEW_SELECTORS.SUBMIT_BUTTON);
            const detected = !!(hasCanvas && hasInput && hasBtn);
            console.log(`🔎 [诊断] 兜底检测 — Canvas: ${!!hasCanvas}, 输入框: ${!!hasInput}, 提交: ${!!hasBtn}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        // Vue hash 路由: #/marking?km=物理&tz=四.15&...
        const hash = window.location.hash;
        const queryStr = hash.split('?')[1] || '';
        const params = new URLSearchParams(queryStr);
        const tz = params.get('tz') || '';
        const km = params.get('km') || '';
        return `qitian_new_${km}_${tz}`;
    },

    // 从 DOM 读取当前显示的试题ID（如 "558"）
    _getCurrentId() {
        const el = document.querySelector(QITIAN_NEW_SELECTORS.ID_CONTAINER);
        if (el) {
            const match = el.textContent.match(/试题ID[：:]\s*(\d+)/);
            if (match) return match[1];
        }
        return '';
    },

    // 从图片池中获取当前试题ID对应的图片
    _getImageUrlsFromPool() {
        const id = this._getCurrentId();
        if (!id) {
            console.log('🖼️ [诊断] 未找到当前试题ID');
            return [];
        }

        const url = _qitianImagePool[id];
        if (url) {
            console.log(`🖼️ [诊断] 从图片池找到试题ID ${id} 的图片`);
            console.log(`  📷 图片: ${url.substring(0, 80)}...`);
            return [url];
        }

        return [];
    },

    // 从 performance API 获取图片 URL（备用方案，取最新一张）
    _getImageUrlsFromPerformance() {
        const entries = performance.getEntriesByType('resource');
        const imageUrls = entries
            .filter(e => e.name.includes('yjimage.oss'))
            .map(e => e.name);

        const uniqueUrls = [...new Set(imageUrls)].filter(url =>
            url.includes('.jpg') || url.includes('.png') || url.includes('.jpeg')
        );

        if (uniqueUrls.length > 0) {
            const latestUrl = uniqueUrls[uniqueUrls.length - 1];
            console.log(`🖼️ [诊断] 从 performance 找到 ${uniqueUrls.length} 张图片，使用最新的 1 张`);
            console.log(`  📷 图片: ${latestUrl.substring(0, 80)}...`);
            return [latestUrl];
        }

        return [];
    },

    async gatherAnswerImages() {
        console.log('🖼️ [诊断] 七天网络新UI — 开始获取答题卡图片...');

        const startTime = Date.now();
        const maxWait = 8000;

        // 等待图片池中有当前试题ID的数据（最多 8 秒）
        while (Date.now() - startTime < maxWait) {
            const imageUrls = this._getImageUrlsFromPool();
            if (imageUrls.length > 0) {
                return imageUrls;
            }
            await new Promise(r => setTimeout(r, 300));
        }

        // 超时：尝试用 performance API 回退
        console.warn('⚠️ [诊断] 等待图片池超时，尝试回退方案');
        const perfUrls = this._getImageUrlsFromPerformance();
        if (perfUrls.length > 0) {
            console.log(`🖼️ [诊断] 从 performance 回退找到 ${perfUrls.length} 张图片`);
            return perfUrls;
        }

        console.warn('⚠️ [诊断] 未找到答题卡图片');
        return [];
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
                        console.log(`✅ [诊断] 小题 ${sq.label} 分数 ${sq.score} 已填入`);
                    }
                }

                // 完整性校验：遍历所有检测到的输入框，对值仍为空的填入 0
                // 防止平台"题号X未填写分数"验证错误
                let unfilledCount = 0;
                for (const d of detected) {
                    if (!d.element.value || d.element.value === '') {
                        setter.call(d.element, 0);
                        d.element.dispatchEvent(new Event('input', { bubbles: true }));
                        d.element.dispatchEvent(new Event('change', { bubbles: true }));
                        unfilledCount++;
                        console.warn(`⚠️ [诊断] 小题 ${d.label} 未匹配到AI分数，已填入0`);
                    }
                }
                if (unfilledCount > 0) {
                    console.warn(`⚠️ [诊断] 共 ${unfilledCount} 个小题未匹配，已填入0防止平台验证失败`);
                }

                return true;
            }
        }

        // 回退：填总分到第一个输入框
        const scoreInput = document.querySelector(QITIAN_NEW_SELECTORS.SCORE_INPUT);
        console.log(`🔎 [诊断] 七天网络新UI fillScore — 分数: ${total}, 输入框: ${!!scoreInput}`);

        if (scoreInput) {
            // Vue + Element UI 需要通过 nativeInputValueSetter 触发响应式更新
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(scoreInput, total);
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
        const submitBtn = document.querySelector(QITIAN_NEW_SELECTORS.SUBMIT_BUTTON);
        if (submitBtn) {
            console.log(`✅ [诊断] 七天网络新UI — 点击提交按钮`);
            submitBtn.click();
            return true;
        }
        console.warn('⚠️ [诊断] 未找到提交按钮 .saveScoreBtn');
        return false;
    },

    async waitForNextPaper() {
        console.log('⏳ [诊断] 七天网络新UI — 等待下一份试卷...');

        // 记录当前试题ID
        const oldId = this._getCurrentId();
        console.log(`⏳ [诊断] 当前试题ID: ${oldId || '(未找到)'}`);

        // 等待试题ID变化（最可靠的信号）
        const startTime = Date.now();
        const maxWait = 30000; // 最多等待 30 秒

        return new Promise((resolve) => {
            const timer = setInterval(() => {
                const currentId = this._getCurrentId();

                // 试题ID变化 = 新试卷已加载
                if (currentId && currentId !== oldId) {
                    clearInterval(timer);
                    console.log(`✅ 七天网络新UI — 新试卷已加载（试题ID: ${oldId} → ${currentId}）`);
                    resolve(true);
                    return;
                }

                // 超时检测
                if (Date.now() - startTime > maxWait) {
                    clearInterval(timer);
                    console.warn('⚠️ 七天网络新UI — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 500);
        });
    },

    isRegradeMode() {
        // 新 UI 暂未发现明确的回评模式标识
        return !!window.aiGradingState?.isRegrading;
    },

    getScoreInputs() {
        const inputs = [];
        document.querySelectorAll(QITIAN_NEW_SELECTORS.SCORE_INPUT).forEach((el, i) => {
            // 从 ID 提取题号: inputScoreRef_四.15 → "四.15"
            const label = el.id.replace('inputScoreRef_', '') || `分数${i + 1}`;
            inputs.push({ element: el, label, index: i });
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
        document.querySelectorAll('.scoreTitlesContainer .scoreContainer').forEach((el, i) => {
            const label = el.querySelector('.title-info')?.textContent?.trim();
            const input = el.querySelector('input[id^="inputScoreRef_"]');
            if (label && input) {
                subs.push({ label, element: input, index: i });
            }
        });
        return subs.length > 1 ? subs : [];
    }
};

if (QitianNewAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = QitianNewAdapter;
}
