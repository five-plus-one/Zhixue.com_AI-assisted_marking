// ========== 光大阅卷适配器 ==========
// pj.yixx.cn — Vue 2 + Canvas 渲染

// 拦截 getDdb API 响应，获取当前试卷图片 URL
// 仅在光大平台 (pj.yixx.cn) 上执行 XHR 拦截，避免影响其他平台
let _guangdaCurrentPaperImages = [];
let _guangdaNextPaperImages = [];
let _guangdaImageVersion = 0; // 每次拦截到新图片时递增，用于检测图片更新

if (window.location.hostname.includes('pj.yixx.cn')) {
    const _guangdaOrigOpen = XMLHttpRequest.prototype.open;
    const _guangdaOrigSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._guangdaUrl = url;
        return _guangdaOrigOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            try {
                const url = this._guangdaUrl || '';
                if (url.includes('getDdb') || url.includes('getDdbByNext')) {
                    const response = JSON.parse(this.responseText);
                    const vKs = response?.result?.vKs;

                    if (vKs && vKs.length > 0) {
                        // 当前试卷（第一份）
                        const currentPaper = vKs[0];
                        if (currentPaper?.imageData?.vUrl) {
                            _guangdaCurrentPaperImages = currentPaper.imageData.vUrl.filter(url =>
                                url && (url.startsWith('http://') || url.startsWith('https://'))
                            );
                            _guangdaImageVersion++;
                            console.log(`🎯 [API拦截] 当前试卷图片: ${_guangdaCurrentPaperImages.length} 张 (v${_guangdaImageVersion})`);
                            _guangdaCurrentPaperImages.forEach((url, i) => {
                                console.log(`  📷 图片${i + 1}: ${url.substring(0, 80)}...`);
                            });
                        }

                        // 预加载的下一份试卷
                        if (vKs.length > 1 && vKs[1]?.imageData?.vUrl) {
                            _guangdaNextPaperImages = vKs[1].imageData.vUrl.filter(url =>
                                url && (url.startsWith('http://') || url.startsWith('https://'))
                            );
                            console.log(`📦 [API拦截] 预加载下一份试卷图片: ${_guangdaNextPaperImages.length} 张`);
                        }
                    }
                }
            } catch (e) {
                // 忽略解析错误
            }
        });
        return _guangdaOrigSend.call(this, ...args);
    };
}

const GuangdaAdapter = {
    name: '光大阅卷',
    id: 'guangda',
    urlPatterns: ['*://pj.yixx.cn/*'],
    iconUrl: 'https://pj.yixx.cn/njs_2006/images/yuejuan.ico',

    shouldInitialize() {
        return window.location.hostname.includes('pj.yixx.cn');
    },

    // 快速页面检查（不等待 DOM），用于 URL 变化监听器
    // 严格匹配：只在 /#/painter 路径下激活
    isMarkingPage() {
        const hash = window.location.hash;
        // 精确匹配 /painter 路径，排除其他如 /jdEntry、/list 等
        return hash === '#/painter' || hash.startsWith('#/painter?') || hash.startsWith('#/painter/');
    },

    async detectMarkingPage() {
        // 光大阅卷是 SPA，先检查 hash 路径是否为阅卷页面
        const hash = window.location.hash;
        // 精确匹配 /painter 路径
        const isPainterPage = hash === '#/painter' || hash.startsWith('#/painter?') || hash.startsWith('#/painter/');

        if (!isPainterPage) {
            console.log('🔎 [诊断] 光大阅卷 — 当前不在阅卷页面 (hash:', hash, ')');
            return false;
        }

        console.log('🔎 [诊断] 光大阅卷 — 开始检测批改页面...');
        try {
            // 等待关键元素出现（缩短超时时间）
            const result = await Promise.race([
                waitForElement(GUANGDA_SELECTORS.PAGE_DETECT_CANVAS, 5000).then(() => 'canvas'),
                waitForElement(GUANGDA_SELECTORS.PAGE_DETECT_SCORE, 5000).then(() => 'score-item'),
                waitForElement(GUANGDA_SELECTORS.PAGE_DETECT_SUBMIT, 5000).then(() => 'submit-btn'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            // 兜底检测（缩短等待时间）
            await new Promise(resolve => setTimeout(resolve, 1000));
            const hasCanvas = document.querySelector(GUANGDA_SELECTORS.ANSWER_CANVAS);
            const hasScore = document.querySelector(GUANGDA_SELECTORS.SCORE_ITEM);
            const hasBtn = document.querySelector(GUANGDA_SELECTORS.SUBMIT_BUTTON);
            const detected = !!(hasCanvas && hasScore && hasBtn);
            console.log(`🔎 [诊断] 兜底检测 — Canvas: ${!!hasCanvas}, 分数项: ${!!hasScore}, 提交: ${hasBtn}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        // 光大阅卷是 SPA，使用 hash 路径
        // URL 格式: https://pj.yixx.cn/njs_2006/#/painter
        const url = new URL(window.location.href);
        const hash = url.hash;
        // 尝试从 painter 组件获取当前题目索引
        const painterEl = document.querySelector('#painter');
        const painterVm = painterEl?.closest('[data-v-]')?.__vue__;
        let questionIndex = '';
        if (painterVm) {
            // 尝试获取当前题目标识
            const data = painterVm.$data || {};
            questionIndex = data.currentKs || data.clickIndex || '';
        }
        return `guangda_${hash}_${questionIndex}`;
    },

    async gatherAnswerImages() {
        console.log('🖼️ [诊断] 光大阅卷 — 开始获取答题卡图片...');

        // 记录当前版本号，等待新版本（表示新图片到达）
        const versionBefore = _guangdaImageVersion;
        const maxWait = 5000;
        const startTime = Date.now();

        // 等待版本号变化（新图片到达）或图片数组非空
        while (_guangdaImageVersion === versionBefore && _guangdaCurrentPaperImages.length === 0 && Date.now() - startTime < maxWait) {
            await new Promise(r => setTimeout(r, 200));
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > 300) {
            console.log(`🖼️ [诊断] 等待 API 拦截耗时: ${elapsed}ms (v${versionBefore}→v${_guangdaImageVersion})`);
        }

        // 第一优先：API 拦截（精确匹配当前试卷）
        const imageUrls = this._getImageUrlsFromNetwork();
        if (imageUrls.length > 0) {
            console.log(`🖼️ [诊断] 从 API 拦截找到 ${imageUrls.length} 张图片`);
            return imageUrls;
        }

        // 第二优先：performance API（回退方案，取最新一张避免预加载干扰）
        const perfUrls = this._getImageUrlsFromPerformance();
        if (perfUrls.length > 0) {
            console.log(`🖼️ [诊断] 从 performance 回退找到 ${perfUrls.length} 张图片`);
            return perfUrls;
        }

        // 第三优先：Vue 组件
        const vueUrls = this._getImageUrlsFromVue();
        if (vueUrls.length > 0) {
            console.log(`🖼️ [诊断] 从 Vue 组件找到 ${vueUrls.length} 张图片`);
            return vueUrls;
        }

        console.warn('⚠️ [诊断] 未找到答题卡图片');
        return [];
    },

    // 从网络请求中获取图片 URL（仅 API 拦截）
    _getImageUrlsFromNetwork() {
        if (_guangdaCurrentPaperImages.length > 0) {
            console.log(`🖼️ [诊断] 从 API 拦截获取当前试卷图片: ${_guangdaCurrentPaperImages.length} 张`);
            _guangdaCurrentPaperImages.forEach((url, i) => {
                console.log(`  📷 图片${i + 1}: ${url.substring(0, 80)}...`);
            });
            return [..._guangdaCurrentPaperImages];
        }

        console.log(`🖼️ [诊断] API 拦截暂未捕获图片`);
        return [];
    },

    // 从 performance API 获取图片 URL（备用方案，取最新一张）
    _getImageUrlsFromPerformance() {
        const entries = performance.getEntriesByType('resource');
        const imageUrls = entries
            .filter(e => e.initiatorType === 'img' || e.name.includes('.jpg') || e.name.includes('.png'))
            .filter(e => e.name.includes('rescenter') || e.name.includes('markpic'))
            .map(e => e.name);

        const uniqueUrls = [...new Set(imageUrls)].filter(url =>
            url.includes('.jpg') || url.includes('.png')
        );

        if (uniqueUrls.length > 0) {
            // 只返回最新的 1 张图片（避免预加载图片干扰）
            const latestUrl = uniqueUrls[uniqueUrls.length - 1];
            console.log(`🖼️ [诊断] 从 performance 找到 ${uniqueUrls.length} 张图片，使用最新的 1 张`);
            console.log(`  📷 图片: ${latestUrl.substring(0, 80)}...`);
            return [latestUrl];
        }

        return [];
    },

    // 从 Vue 组件获取图片 URL
    _getImageUrlsFromVue() {
        try {
            const painterEl = document.querySelector('#painter');
            const painterVm = painterEl?.closest('[data-v-]')?.__vue__;

            if (!painterVm) {
                console.log('🖼️ [诊断] 未找到 painter Vue 实例');
                return [];
            }

            const data = painterVm.$data || {};
            const urls = [];

            // 检查 imgUrl
            if (data.imgUrl && typeof data.imgUrl === 'string') {
                if (data.imgUrl.startsWith('http')) {
                    urls.push(data.imgUrl);
                }
            }

            // 检查 listAllUrlPath
            if (Array.isArray(data.listAllUrlPath)) {
                data.listAllUrlPath.forEach(item => {
                    if (typeof item === 'string' && item.startsWith('http')) {
                        urls.push(item);
                    } else if (typeof item === 'object' && item?.url) {
                        urls.push(item.url);
                    }
                });
            }

            // 检查 source
            if (Array.isArray(data.source)) {
                data.source.forEach(item => {
                    if (typeof item === 'string' && item.startsWith('http')) {
                        urls.push(item);
                    }
                });
            }

            console.log(`🖼️ [诊断] 从 Vue 组件找到 ${urls.length} 张图片`);
            return [...new Set(urls)];
        } catch (e) {
            console.error('❌ [诊断] 从 Vue 获取图片失败:', e);
            return [];
        }
    },

    async fetchImageAsBase64(url) {
        // 如果已经是 data URL，直接提取 base64
        if (url.startsWith('data:')) {
            return url.split(',')[1];
        }

        // 否则使用通用的下载方法
        return fetchImageAsBase64(url);
    },

    fillScore(request) {
        const { total, subScores } = request;
        console.log(`📝 [诊断] 光大阅卷 fillScore — 总分: ${total}, 小题分数:`, subScores);

        // 获取所有小题容器
        const scoreWraps = document.querySelectorAll('.score.big-score');
        console.log(`📝 [诊断] 找到 ${scoreWraps.length} 个小题容器`);

        if (scoreWraps.length === 0) {
            // 没有小题容器，尝试直接点击总分
            return this._fillSingleScore(total);
        }

        if (subScores && subScores.length > 0) {
            // 有小题分数，为每个小题填入对应分数
            return this._fillSubScores(subScores, scoreWraps);
        } else {
            // 没有小题分数，将总分填入第一个小题
            console.log('📝 [诊断] 没有小题分数，将总分填入第一个小题');
            return this._fillSingleScoreInContainer(total, scoreWraps[0]);
        }
    },

    // 填入单个分数（没有小题结构时）
    _fillSingleScore(score) {
        const scoreItems = document.querySelectorAll(GUANGDA_SELECTORS.SCORE_ITEM);
        console.log(`📝 [诊断] 找到 ${scoreItems.length} 个分数选项`);

        // 查找匹配的分数项
        let targetItem = null;
        for (const item of scoreItems) {
            const scoreText = item.textContent.trim();
            if (scoreText === String(score)) {
                targetItem = item;
                break;
            }
        }

        if (targetItem) {
            targetItem.click();
            console.log(`✅ [诊断] 已点击分数: ${score}`);
            return true;
        }

        console.log('📝 [诊断] 未找到匹配分数项，尝试调用组件方法...');
        return this._fillScoreViaComponent(score);
    },

    // 为多个小题填入分数
    _fillSubScores(subScores, scoreWraps) {
        let successCount = 0;

        for (let i = 0; i < Math.min(subScores.length, scoreWraps.length); i++) {
            const subScore = subScores[i];
            const container = scoreWraps[i];
            const score = typeof subScore === 'object' ? subScore.score : subScore;

            console.log(`📝 [诊断] 填入第 ${i + 1} 小题分数: ${score}`);

            // 获取该小题的题号
            const label = container.querySelector('.xtList label');
            const questionNum = label ? label.textContent.trim() : `${i + 1}`;
            console.log(`📝 [诊断] 题号: ${questionNum}`);

            if (this._fillSingleScoreInContainer(score, container)) {
                successCount++;
            }
        }

        console.log(`📝 [诊断] 成功填入 ${successCount}/${subScores.length} 个小题分数`);
        return successCount > 0;
    },

    // 在指定小题容器中填入分数
    _fillSingleScoreInContainer(score, container) {
        if (!container) {
            console.warn('⚠️ [诊断] 小题容器不存在');
            return false;
        }

        // 获取该容器中的分数选项
        const scoreItems = container.querySelectorAll('.scores li');
        console.log(`📝 [诊断] 该小题有 ${scoreItems.length} 个分数选项`);

        // 查找匹配的分数项
        let targetItem = null;
        for (const item of scoreItems) {
            const scoreText = item.textContent.trim();
            if (scoreText === String(score)) {
                targetItem = item;
                break;
            }
        }

        if (targetItem) {
            targetItem.click();
            console.log(`✅ [诊断] 已点击分数: ${score}`);
            return true;
        }

        console.warn(`⚠️ [诊断] 未找到分数 ${score} 对应的选项`);
        return false;
    },

    // 通过 Vue 组件方法填入分数
    _fillScoreViaComponent(score) {
        try {
            // 查找 painter 组件实例
            const painterEl = document.querySelector('#painter');
            const painterVm = painterEl?.closest('[data-v-]')?.__vue__;

            if (painterVm) {
                // 尝试调用 clickSingleScore 方法
                if (typeof painterVm.clickSingleScore === 'function') {
                    painterVm.clickSingleScore(score);
                    console.log(`✅ [诊断] 通过组件方法 clickSingleScore(${score}) 填入分数`);
                    return true;
                }

                // 尝试直接设置当前分数
                if ('currentScoreIndex' in painterVm.$data) {
                    painterVm.currentScoreIndex = score;
                    console.log(`✅ [诊断] 通过设置 currentScoreIndex = ${score} 填入分数`);
                    return true;
                }
            }
        } catch (e) {
            console.error('❌ [诊断] 组件方法填入分数失败:', e);
        }

        console.warn('⚠️ [诊断] 无法填入分数');
        return false;
    },

    submitGrade() {
        console.log('📤 [诊断] 光大阅卷 — 开始提交分数...');

        // 查找"提交分数"按钮
        const submitBtn = document.querySelector(GUANGDA_SELECTORS.SUBMIT_BUTTON);
        if (submitBtn) {
            console.log('✅ [诊断] 找到提交按钮，点击中...');
            submitBtn.click();

            // 等待并处理"给分详情"二次确认弹窗
            this._handleConfirmDialog();

            return true;
        }

        // 备选：查找包含"提交"文字的按钮
        const allButtons = document.querySelectorAll('button, span');
        for (const btn of allButtons) {
            if (btn.textContent.trim().includes('提交分数')) {
                console.log('✅ [诊断] 找到包含"提交分数"的按钮，点击中...');
                btn.click();
                this._handleConfirmDialog();
                return true;
            }
        }

        // 尝试调用组件方法
        try {
            const painterEl = document.querySelector('#painter');
            const painterVm = painterEl?.closest('[data-v-]')?.__vue__;
            if (painterVm && typeof painterVm.commitDxj === 'function') {
                console.log('✅ [诊断] 调用组件方法 commitDxj 提交分数');
                painterVm.commitDxj();
                this._handleConfirmDialog();
                return true;
            }
        } catch (e) {
            console.error('❌ [诊断] 组件方法提交失败:', e);
        }

        console.warn('⚠️ [诊断] 未找到提交按钮');
        return false;
    },

    // 处理"给分详情"二次确认弹窗
    _handleConfirmDialog() {
        console.log('⏳ [诊断] 等待给分详情弹窗...');

        // 立即检查一次
        const immediateBtn = document.querySelector('.dialog-btns .sure');
        if (immediateBtn) {
            console.log('✅ [诊断] 立即找到给分详情弹窗，自动点击确认');
            immediateBtn.click();
            return;
        }

        // 等待弹窗出现并自动点击确认
        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;

            // 查找"确认"按钮（在 dialog-btns 容器中）
            const confirmBtn = document.querySelector('.dialog-btns .sure');
            if (confirmBtn) {
                console.log('✅ [诊断] 找到给分详情弹窗，自动点击确认');
                confirmBtn.click();
                clearInterval(checkInterval);
                return;
            }

            // 超时（最多等2秒，更快超时）
            if (checkCount >= 10) {
                clearInterval(checkInterval);
                console.log('⚠️ [诊断] 未检测到给分详情弹窗（可能未启用）');
            }
        }, 200);
    },

    async waitForNextPaper(oldImageUrl) {
        console.log('⏳ [诊断] 光大阅卷 — 等待下一份试卷...');
        let checkTimes = 0;
        const maxChecks = 60; // 最多等待 30 秒
        const versionBefore = _guangdaImageVersion;

        // 先快速检查弹窗是否还在（不等待，只是检查）
        const hasDialog = document.querySelector('.dialog-btns .sure');
        if (hasDialog) {
            console.log('⏳ [诊断] 检测到弹窗还在，等待弹窗消失...');
            await new Promise(resolve => {
                let waitCount = 0;
                const waitInterval = setInterval(() => {
                    const dialog = document.querySelector('.dialog-btns .sure');
                    if (!dialog || waitCount >= 10) {
                        clearInterval(waitInterval);
                        resolve();
                    }
                    waitCount++;
                }, 100);
            });
        }

        console.log(`⏳ [诊断] 开始检测新试卷 (当前版本: v${versionBefore})...`);

        return new Promise((resolve) => {
            const timer = setInterval(() => {
                checkTimes++;

                // 方法1: 检测 API 拦截到的新图片（版本号变化）
                if (_guangdaImageVersion !== versionBefore && checkTimes > 2) {
                    clearInterval(timer);
                    // 清空旧图片，让 gatherAnswerImages 等待新图片
                    _guangdaCurrentPaperImages = [];
                    console.log(`✅ 光大阅卷 — 新试卷已加载（API拦截到新图片 v${versionBefore}→v${_guangdaImageVersion}）`);
                    resolve(true);
                    return;
                }

                // 方法2: 检测得分显示区域重置
                const scoreDisplay = document.querySelector(GUANGDA_SELECTORS.SCORE_DISPLAY);
                const currentScore = scoreDisplay?.textContent?.trim();

                // 得分区域消失或变为0，说明新试卷已加载
                if (checkTimes > 3 && (!scoreDisplay || currentScore === '' || currentScore === '0' || currentScore === '—')) {
                    clearInterval(timer);
                    // 清空旧图片，让 gatherAnswerImages 等待新图片
                    _guangdaCurrentPaperImages = [];
                    console.log('✅ 光大阅卷 — 新试卷已加载（得分重置）');
                    resolve(true);
                    return;
                }

                // 超时检测
                if (checkTimes >= maxChecks) {
                    clearInterval(timer);
                    console.warn('⚠️ 光大阅卷 — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 500);
        });
    },

    isRegradeMode() {
        // 检查是否是回评模式
        const buttons = document.querySelectorAll('button.mg-btn');
        for (const btn of buttons) {
            if (btn.textContent.includes('回评') || btn.textContent.includes('重评')) {
                return true;
            }
        }
        // 检查 painter 组件的 ishp 属性
        try {
            const painterEl = document.querySelector('#painter');
            const painterVm = painterEl?.closest('[data-v-]')?.__vue__;
            if (painterVm && 'ishp' in painterVm.$data) {
                return !!painterVm.ishp;
            }
        } catch (e) {
            // ignore
        }
        return false;
    },

    getScoreInputs() {
        const inputs = [];

        // 光大阅卷使用点击选择，不是输入框
        // 返回分数项信息
        const scoreItems = document.querySelectorAll(GUANGDA_SELECTORS.SCORE_ITEM);
        scoreItems.forEach((item, i) => {
            inputs.push({
                element: item,
                label: item.textContent.trim() + '分',
                index: i,
                type: 'click', // 标记为点击类型
            });
        });

        return inputs;
    },

    detectSubQuestions() {
        const subQuestions = [];

        // 获取所有小题容器
        const scoreWraps = document.querySelectorAll('.score.big-score');
        console.log(`📝 [诊断] 找到 ${scoreWraps.length} 个小题容器`);

        scoreWraps.forEach((container, i) => {
            // 获取题号
            const label = container.querySelector('.xtList label');
            if (label) {
                const questionNum = label.textContent.trim();

                // 获取该小题的分数选项
                const scoreItems = container.querySelectorAll('.scores li');
                const scores = Array.from(scoreItems).map(li => parseInt(li.textContent.trim())).filter(n => !isNaN(n));

                // 计算最大分数
                const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

                console.log(`📝 [诊断] 小题 ${i + 1}: 题号=${questionNum}, 可选分数=[${scores.join(',')}], 最高分=${maxScore}`);

                subQuestions.push({
                    index: i,
                    label: `第${questionNum}题`,
                    maxScore: maxScore,
                    scores: scores,
                });
            }
        });

        console.log(`📝 [诊断] 共识别 ${subQuestions.length} 个小题`);
        return subQuestions;
    },

    onPageLoad() {
        console.log('🚀 [诊断] 光大阅卷 — 页面加载完成，执行初始化...');

        // 尝试设置一些优化选项
        try {
            const painterEl = document.querySelector('#painter');
            const painterVm = painterEl?.closest('[data-v-]')?.__vue__;
            if (painterVm) {
                // 禁用自动提交（如果存在）
                if ('autoSubmit' in painterVm.$data) {
                    painterVm.autoSubmit = false;
                    console.log('📝 [诊断] 已禁用自动提交');
                }
            }
        } catch (e) {
            // ignore
        }
    },

    onGradingComplete() {
        console.log('✅ [诊断] 光大阅卷 — 本轮批改完成');
    },
};

// 注册适配器
if (GuangdaAdapter.shouldInitialize()) {
    window.__AI_MARKER_ADAPTER__ = GuangdaAdapter;
}
