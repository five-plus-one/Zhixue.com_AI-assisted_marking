// ========== 七天网络新 UI 适配器 ==========
// yj5.7net.cc — Vue SPA + Element UI + Canvas 渲染答题卡

// 拦截 XMLHttpRequest 响应，从 Review/ReviewData API 提取图片 URL
// Vue 页面加载时会发两次请求：start=0（当前学生）和 start=1（预取下一个）
// 提交后可能只发 start=0，也可能复用预取数据不发新请求
let _qitianApiImageUrl = null;       // 最新拦截到的 start=0 图片 URL
let _qitianPrefetchImageUrl = null;  // 最新拦截到的 start=1 图片 URL
let _qitianNextStudentUrl = null;    // waitForNextPaper 保存的下一张图片 URL
const _qitianUsedImageUrls = new Set(); // 已发送给 AI 的图片 URL

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

                const params = new URL(url, location.origin).searchParams;
                const start = params.get('start');

                const json = JSON.parse(this.responseText);
                const imageUrl = json?.data?.list?.[0]?.image?.url;
                if (!imageUrl) return;

                if (start === '0') {
                    _qitianApiImageUrl = imageUrl;
                    console.log(`🎯 [API拦截] 当前学生图片: ${imageUrl.slice(0, 80)}...`);
                } else if (start === '1') {
                    _qitianPrefetchImageUrl = imageUrl;
                    console.log(`📦 [API拦截] 预取学生图片: ${imageUrl.slice(0, 80)}...`);
                }
            } catch (e) {}
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

    async gatherAnswerImages() {
        // 等待 Vue 更新 Canvas（可能触发新的 API 请求或图片加载）
        await new Promise(r => setTimeout(r, 1500));

        // 优先使用 waitForNextPaper 保存的下一张学生图片 URL
        if (_qitianNextStudentUrl && !_qitianUsedImageUrls.has(_qitianNextStudentUrl)) {
            const url = _qitianNextStudentUrl;
            _qitianNextStudentUrl = null;
            _qitianApiImageUrl = url;
            console.log(`🖼️ [诊断] 使用预取保存的下一张图片 URL`);
            _qitianUsedImageUrls.add(url);
            return [url];
        }

        // 次选：API 拦截到的、且未使用过的图片 URL（首名学生场景）
        if (_qitianApiImageUrl && !_qitianUsedImageUrls.has(_qitianApiImageUrl)) {
            console.log(`🖼️ [诊断] 使用 API 拦截的图片 URL (新)`);
            _qitianUsedImageUrls.add(_qitianApiImageUrl);
            return [_qitianApiImageUrl];
        }

        // 兜底：performance API 中找未使用过的图片
        const allImgUrls = performance.getEntriesByType('resource')
            .filter(r => r.name.includes('yjimage.oss'))
            .map(r => r.name);
        const newUrls = [...new Set(allImgUrls)].filter(u => !_qitianUsedImageUrls.has(u));
        console.log(`🖼️ [诊断] performance 回退: ${newUrls.length} 张新图片 (共 ${allImgUrls.length} 条记录, 已用 ${_qitianUsedImageUrls.size})`);
        newUrls.forEach((url, i) => {
            console.log(`  📷 新图片${i + 1}: ${url.slice(0, 100)}...`);
            _qitianUsedImageUrls.add(url);
        });
        return newUrls;
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
        // 等待输入框被清空（Vue 表单重置信号）
        // 在输入清空前保存预取 URL，避免被新的 start=1 响应覆盖
        const savedPrefetchUrl = _qitianPrefetchImageUrl;
        let checkTimes = 0;
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                checkTimes++;
                const input = document.querySelector(QITIAN_NEW_SELECTORS.SCORE_INPUT);
                const inputCleared = input && (input.value === '' || input.value === '0');

                if (inputCleared && checkTimes > 3) {
                    clearInterval(timer);
                    // 保存下一张学生的图片 URL（来自预取响应）
                    if (savedPrefetchUrl && !_qitianUsedImageUrls.has(savedPrefetchUrl)) {
                        _qitianNextStudentUrl = savedPrefetchUrl;
                    }
                    console.log(`✅ 七天网络新UI — 新试卷已加载 (nextUrl=${!!_qitianNextStudentUrl}, usedCount=${_qitianUsedImageUrls.size})`);
                    resolve(true);
                } else if (checkTimes > 50) {
                    clearInterval(timer);
                    console.warn('⚠️ 七天网络新UI — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 200);
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

    detectSubQuestions() {
        const subs = [];
        document.querySelectorAll('.scoreTitlesContainer .scoreContainer').forEach((el, i) => {
            const label = el.querySelector('.title-info')?.textContent?.trim();
            const input = el.querySelector('input[id^="inputScoreRef_"]');
            if (label && input) {
                subs.push({ label, element: input, index: i });
            }
        });
        return subs;
    }
};

if (QitianNewAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = QitianNewAdapter;
}
