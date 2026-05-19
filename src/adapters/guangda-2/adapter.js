// ========== 光大阅卷 V2 适配器 ==========
// IP:端口 部署版本（如 http://202.104.21.72:40002/#/）
// 与 guangda (pj.yixx.cn) 是同一平台的不同部署版本
// 差异：DOM 结构不同、分数选项用 LI.f-csp、提交按钮是 input[type="submit"]

// ========== XR 拦截器 ==========
// 拦截 getDdb API，获取 imageUrlPath_all 并构造完整图片 URL
// 图片 URL 格式: http://${hostname}:${mainPort - 1}/mark/res.do?rt=qtpj_kscqk&path=${imageUrlPath_all}
let _guangda2ImagePool = {};  // 包号 → 完整图片URL 的映射
let _guangda2LastResponse = null;  // 最近一次 getDdb 响应

{
    const _innerOpen = XMLHttpRequest.prototype.open;
    const _innerSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._guangda2Url = url;
        return _innerOpen.call(this, method, url, ...args);
    };

    XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('load', function() {
            try {
                const url = this._guangda2Url || '';

                // 拦截 getDdb / getDdbByNext（正常阅卷）
                if (url.includes('getDdb') || url.includes('getDdbByNext')) {
                    const response = JSON.parse(this.responseText);
                    _guangda2LastResponse = response;
                    const vKs = response?.result?.vKs;

                    if (vKs && vKs.length > 0) {
                        const hostname = window.location.hostname;
                        const mainPort = parseInt(window.location.port) || 80;
                        const imgPort = mainPort - 1;

                        vKs.forEach(paper => {
                            const bh = paper?.bh || paper?.ddh || '';
                            const imagePath = paper?.imageUrlPath_all || '';

                            if (bh && imagePath) {
                                // 构造完整图片 URL
                                const fullUrl = `http://${hostname}:${imgPort}/mark/res.do?rt=qtpj_kscqk&path=${imagePath}`;
                                _guangda2ImagePool[bh] = fullUrl;
                                console.log(`🖼️ [V2 API拦截] 包号 ${bh} → ${fullUrl.substring(0, 60)}...`);
                            }
                        });

                        const poolSize = Object.keys(_guangda2ImagePool).length;
                        console.log(`🎯 [V2 API拦截] 更新图片池，共 ${poolSize} 份试卷`);
                    }
                }

                // 拦截 getYpData（回评模式）
                if (url.includes('getYpData')) {
                    const response = JSON.parse(this.responseText);
                    if (Array.isArray(response) && response.length > 0) {
                        const hostname = window.location.hostname;
                        const mainPort = parseInt(window.location.port) || 80;
                        const imgPort = mainPort - 1;

                        response.forEach(record => {
                            const bh = record?.bh || '';
                            const imagePath = record?.imageUrlPath_all || '';
                            if (bh && imagePath) {
                                const fullUrl = `http://${hostname}:${imgPort}/mark/res.do?rt=qtpj_kscqk&path=${imagePath}`;
                                _guangda2ImagePool[bh] = fullUrl;
                            }
                        });
                        console.log(`🎯 [V2 API拦截] getYpData 更新图片池，共 ${response.length} 条记录`);
                    }
                }
            } catch (e) {
                // 忽略解析错误
            }
        });
        return _innerSend.call(this, ...args);
    };
}

// ========== 版本检测 ==========
// V2 版本的特征：有 LI.f-csp 分数选项
function _isGuangdaV2() {
    if (document.querySelector('LI.f-csp')) {
        return true;
    }
    return false;
}

// ========== 适配器主体 ==========
const Guangda2Adapter = {
    name: '光大阅卷',
    id: 'guangda-2',
    urlPatterns: ['*://*/*'],
    iconUrl: 'https://pj.yixx.cn/njs_2006/images/yuejuan.ico',

    shouldInitialize() {
        // 排除 guangda 适配器已处理的域名
        if (window.location.hostname.includes('pj.yixx.cn')) return false;

        // V2 特征检测：LI.f-csp 分数选项
        if (_isGuangdaV2()) {
            console.log('🎯 [光大V2] 通过 LI.f-csp 特征检测到光大阅卷 V2');
            return true;
        }

        return false;
    },

    // 快速页面检查（不等待 DOM），用于 URL 变化监听器
    isMarkingPage() {
        const hash = window.location.hash;
        return hash === '#/painter' || hash.startsWith('#/painter?') || hash.startsWith('#/painter/');
    },

    async detectMarkingPage() {
        const hash = window.location.hash;
        const isPainterPage = hash === '#/painter' || hash.startsWith('#/painter?') || hash.startsWith('#/painter/');

        if (!isPainterPage) {
            console.log('🔎 [诊断] 光大V2 — 当前不在阅卷页面 (hash:', hash, ')');
            return false;
        }

        console.log('🔎 [诊断] 光大V2 — 开始检测批改页面...');

        try {
            // 等待关键元素出现
            const result = await Promise.race([
                waitForElement(GUANGDA2_SELECTORS.SCORE_ITEM, 5000).then(() => 'score-item'),
                waitForElement(GUANGDA2_SELECTORS.SUBMIT_INPUT, 5000).then(() => 'submit-btn'),
                waitForElement(GUANGDA2_SELECTORS.ANSWER_CANVAS, 5000).then(() => 'canvas'),
            ]).catch(() => null);

            if (result) {
                console.log(`✅ [诊断] 光大V2 检测到批改页面元素: ${result}`);
                return true;
            }

            // 兜底检测
            await new Promise(resolve => setTimeout(resolve, 1000));
            const hasScore = document.querySelector(GUANGDA2_SELECTORS.SCORE_ITEM);
            const hasCanvas = document.querySelector(GUANGDA2_SELECTORS.ANSWER_CANVAS);
            const detected = !!(hasScore || hasCanvas);
            console.log(`🔎 [诊断] 光大V2 兜底检测 — 分数项: ${!!hasScore}, Canvas: ${!!hasCanvas}, 最终: ${detected}`);
            return detected;
        } catch (error) {
            console.error('❌ [诊断] 光大V2 detectMarkingPage 异常:', error);
            return false;
        }
    },

    getTaskIdentifier() {
        const hash = window.location.hash;
        const questionEl = document.querySelector(GUANGDA2_SELECTORS.QUESTION_NUM);
        const questionNum = questionEl ? questionEl.textContent.trim() : '';
        const pkg = this._getCurrentPackage();
        return `guangda2_${hash}_${questionNum}_${pkg}`;
    },

    // ========== 包号读取（替代密号） ==========
    _getCurrentPackage() {
        const labels = document.querySelectorAll(GUANGDA2_SELECTORS.PACKAGE_LABEL);
        for (const label of labels) {
            if (label.textContent.includes('包号')) {
                const span = label.nextElementSibling;
                if (span) {
                    const text = span.textContent.trim();
                    if (text && text !== '-' && text !== '：') {
                        return text;
                    }
                }
            }
        }
        return '';
    },

    // ========== 图片获取（仅 API 拦截） ==========
    async gatherAnswerImages() {
        console.log('🖼️ [诊断] 光大V2 — 开始获取答题卡图片...');

        // 等待 XHR 拦截器获取图片 URL（最多 8 秒）
        const startTime = Date.now();
        const maxWait = 8000;

        while (Date.now() - startTime < maxWait) {
            const imageUrls = this._getImageUrlsFromPool();
            if (imageUrls.length > 0) {
                return imageUrls;
            }
            await new Promise(r => setTimeout(r, 300));
        }

        console.warn('⚠️ [诊断] 光大V2 等待图片池超时，未找到答题卡图片');
        return [];
    },

    _getImageUrlsFromPool() {
        const urls = Object.values(_guangda2ImagePool).filter(u => u && u.length > 0);
        if (urls.length > 0) {
            console.log(`🖼️ [诊断] 光大V2 从图片池找到 ${urls.length} 张图片`);
            // 返回第一张（当前试卷）
            return [urls[0]];
        }
        return [];
    },

    async fetchImageAsBase64(url) {
        // V2 的图片 URL 是完整的 HTTP URL，直接下载
        return fetchImageAsBase64(url);
    },

    // ========== 分数填入 ==========
    fillScore(request) {
        const { total, subScores } = request;
        console.log(`📝 [诊断] 光大V2 fillScore — 总分: ${total}, 小题分数:`, subScores);

        if (subScores && subScores.length > 0) {
            return this._fillSubScores(subScores);
        }
        return this._fillSingleScore(total);
    },

    _fillSingleScore(score) {
        const scoreItems = document.querySelectorAll(GUANGDA2_SELECTORS.SCORE_ITEM);
        console.log(`📝 [诊断] 光大V2 找到 ${scoreItems.length} 个分数选项`);

        for (const item of scoreItems) {
            const scoreText = item.textContent.trim();
            // 匹配纯数字分数（如 "5"），排除 "0~10" 范围指示器
            if (scoreText === String(score) && !scoreText.includes('~')) {
                item.click();
                console.log(`✅ [诊断] 光大V2 已点击分数: ${score}`);
                return true;
            }
        }

        console.warn(`⚠️ [诊断] 光大V2 未找到分数 ${score} 的选项`);
        return false;
    },

    _fillSubScores(subScores) {
        const score = typeof subScores[0] === 'object' ? subScores[0].score : subScores[0];
        return this._fillSingleScore(score);
    },

    fillScores(scores) {
        if (!scores || scores.length === 0) return false;
        const inputs = this.getScoreInputs();
        if (inputs.length === 0) return false;

        const score = scores[0];
        if (score === null || score === undefined) return false;

        const container = inputs[0].element;
        const scoreItems = container.querySelectorAll(GUANGDA2_SELECTORS.SCORE_ITEM_CLICKABLE);
        for (const item of scoreItems) {
            if (item.textContent.trim() === String(score)) {
                item.click();
                console.log(`✅ [诊断] 光大V2 分数 ${score} 已点击`);
                return true;
            }
        }

        console.warn(`⚠️ [诊断] 光大V2 未找到分数 ${score} 的选项`);
        return false;
    },

    // ========== 提交 ==========
    // V2 版本的工作流：点击分数选项 → 系统自动调用 commitKsGrade 提交
    // 不需要单独点击"提交分数"按钮
    submitGrade() {
        console.log('📤 [诊断] 光大V2 — V2版本点击分数后自动提交，无需额外操作');
        // 只处理可能出现的确认弹窗
        this._handleConfirmDialog();
        return true;
    },

    _handleConfirmDialog() {
        console.log('⏳ [诊断] 光大V2 等待确认弹窗...');

        // 临时拦截 firstUpdateUserInfo 请求（该接口在自动批改时不需要，会因姓名为空而报错）
        const _origOpen = XMLHttpRequest.prototype.open;
        const _origSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...args) {
            this._diagUrl = url;
            return _origOpen.call(this, method, url, ...args);
        };

        XMLHttpRequest.prototype.send = function(...args) {
            if (this._diagUrl && this._diagUrl.includes('firstUpdateUserInfo')) {
                console.log('🚫 [诊断] 拦截 firstUpdateUserInfo 请求（自动批改不需要）');
                // 模拟成功响应，避免报错
                Object.defineProperty(this, 'status', { value: 200, writable: false, configurable: true });
                Object.defineProperty(this, 'readyState', { value: 4, writable: false, configurable: true });
                Object.defineProperty(this, 'responseText', { value: JSON.stringify({result: 'ok'}), writable: false, configurable: true });
                if (this.onload) {
                    setTimeout(() => this.onload(), 0);
                }
                return;
            }
            return _origSend.call(this, ...args);
        };

        // 恢复原始方法的函数
        const restoreXHR = () => {
            XMLHttpRequest.prototype.open = _origOpen;
            XMLHttpRequest.prototype.send = _origSend;
        };

        // 立即检查一次
        const immediateBtn = document.querySelector(GUANGDA2_SELECTORS.DIALOG_CONFIRM);
        if (immediateBtn) {
            console.log('✅ [诊断] 光大V2 立即找到确认弹窗，自动点击');
            immediateBtn.click();
            setTimeout(restoreXHR, 500);
            return;
        }

        // 等待弹窗出现
        let checkCount = 0;
        const checkInterval = setInterval(() => {
            checkCount++;

            const confirmBtn = document.querySelector(GUANGDA2_SELECTORS.DIALOG_CONFIRM);
            if (confirmBtn) {
                console.log('✅ [诊断] 光大V2 找到确认弹窗，自动点击');
                confirmBtn.click();
                clearInterval(checkInterval);
                setTimeout(restoreXHR, 500);
                return;
            }

            if (checkCount >= 10) {
                clearInterval(checkInterval);
                restoreXHR();
                console.log('⚠️ [诊断] 光大V2 未检测到确认弹窗（可能未启用）');
            }
        }, 200);
    },

    // ========== 等待下一份试卷 ==========
    async waitForNextPaper(oldImageUrl) {
        console.log('⏳ [诊断] 光大V2 — 等待下一份试卷...');

        const oldPkg = this._getCurrentPackage();
        console.log(`⏳ [诊断] 光大V2 当前包号: ${oldPkg || '(未找到)'}`);

        // 等待确认弹窗消失
        const hasDialog = document.querySelector(GUANGDA2_SELECTORS.DIALOG_CONFIRM);
        if (hasDialog) {
            console.log('⏳ [诊断] 光大V2 检测到弹窗还在，等待弹窗消失...');
            await new Promise(resolve => {
                let waitCount = 0;
                const waitInterval = setInterval(() => {
                    const dialog = document.querySelector(GUANGDA2_SELECTORS.DIALOG_CONFIRM);
                    if (!dialog || waitCount >= 10) {
                        clearInterval(waitInterval);
                        resolve();
                    }
                    waitCount++;
                }, 100);
            });
        }

        console.log('⏳ [诊断] 光大V2 开始检测新试卷...');

        const startTime = Date.now();
        const maxWait = 30000;

        return new Promise((resolve) => {
            const timer = setInterval(() => {
                // 监听包号变化
                const currentPkg = this._getCurrentPackage();
                if (currentPkg && currentPkg !== oldPkg && currentPkg !== '-') {
                    clearInterval(timer);
                    console.log(`✅ 光大V2 — 新试卷已加载（包号: ${oldPkg} → ${currentPkg}）`);
                    resolve(true);
                    return;
                }

                // 超时检测
                if (Date.now() - startTime > maxWait) {
                    clearInterval(timer);
                    console.warn('⚠️ 光大V2 — 等待下一份试卷超时');
                    resolve(false);
                }
            }, 500);
        });
    },

    // ========== 回评模式检测 ==========
    isRegradeMode() {
        const exitBtn = document.querySelector(GUANGDA2_SELECTORS.REGRADE_EXIT_BTN);
        if (exitBtn && exitBtn.style.display !== 'none') {
            return true;
        }
        const regradeList = document.querySelector(GUANGDA2_SELECTORS.REGRADE_LIST);
        if (regradeList) {
            return true;
        }
        return false;
    },

    // ========== 评分输入检测 ==========
    getScoreInputs() {
        const inputs = [];

        const scoreItems = document.querySelectorAll(GUANGDA2_SELECTORS.SCORE_ITEM);
        if (scoreItems.length === 0) return inputs;

        // 过滤掉范围指示器（如 "0~10"）
        const clickableItems = Array.from(scoreItems).filter(item => {
            const text = item.textContent.trim();
            return !text.includes('~') && !isNaN(parseInt(text));
        });

        if (clickableItems.length > 0) {
            const scores = clickableItems.map(li => parseInt(li.textContent.trim())).filter(n => !isNaN(n));
            const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

            const questionEl = document.querySelector(GUANGDA2_SELECTORS.QUESTION_NUM);
            const questionNum = questionEl ? questionEl.textContent.trim() : '总分';

            inputs.push({
                element: document.querySelector(GUANGDA2_SELECTORS.SCORE_ITEM)?.parentElement || document.body,
                label: questionNum,
                index: 0,
                maxScore,
                type: 'click',
                scores
            });
        }

        return inputs;
    },

    // ========== 小题检测 ==========
    detectSubQuestions() {
        const subQuestions = [];

        const scoreItems = document.querySelectorAll(GUANGDA2_SELECTORS.SCORE_ITEM);
        const clickableItems = Array.from(scoreItems).filter(item => {
            const text = item.textContent.trim();
            return !text.includes('~') && !isNaN(parseInt(text));
        });

        if (clickableItems.length > 0) {
            const scores = clickableItems.map(li => parseInt(li.textContent.trim())).filter(n => !isNaN(n));
            const maxScore = scores.length > 0 ? Math.max(...scores) : 0;

            const questionEl = document.querySelector(GUANGDA2_SELECTORS.QUESTION_NUM);
            const questionNum = questionEl ? questionEl.textContent.trim() : '总分';

            console.log(`📝 [诊断] 光大V2 小题: ${questionNum}, 可选分数=[${scores.join(',')}], 最高分=${maxScore}`);

            subQuestions.push({
                index: 0,
                label: questionNum,
                maxScore,
                scores,
            });
        }

        console.log(`📝 [诊断] 光大V2 共识别 ${subQuestions.length} 个小题`);
        return subQuestions;
    },

    // ========== 页面生命周期 ==========
    onPageLoad() {
        console.log('🚀 [诊断] 光大V2 — 页面加载完成，执行初始化...');
    },

    onGradingComplete() {
        console.log('✅ [诊断] 光大V2 — 本轮批改完成');
    },
};

// 注册适配器（等待DOM准备，SPA页面可能需要延迟检测）
(function registerGuangda2Adapter() {
    // 如果已经检测到，直接注册
    if (Guangda2Adapter.shouldInitialize()) {
        window.__AI_MARKER_ADAPTER__ = Guangda2Adapter;
        return;
    }

    // 使用 MutationObserver 等待特征元素出现
    const observer = new MutationObserver(() => {
        if (Guangda2Adapter.shouldInitialize()) {
            window.__AI_MARKER_ADAPTER__ = Guangda2Adapter;
            observer.disconnect();
            console.log('🎯 [光大V2] 延迟注册适配器成功');
        }
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // 超时保护：10秒后停止观察
    setTimeout(() => observer.disconnect(), 10000);
})();
