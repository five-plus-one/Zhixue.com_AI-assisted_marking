// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @description  智学网AI自动批改助手，支持OCR识别、AI评分、多图切片合并、自动提交、无人值守模式，让阅卷更轻松！
// @author       5plus1
// @match        https://www.zhixue.com/webmarking/*
// @match        https://*.zhixue.com/webmarking/*
// @icon         https://www.zhixue.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.ai.five-plus-one.com
// @connect      api.openai.com
// @connect      zhixue-sc.oss-cn-hangzhou.aliyuncs.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log('🚀 智学网AI打分助手加载中...');

    // 等待页面加载完成
    function waitForElement(selector, timeout = 15000) {
        return new Promise((resolve, reject) => {
            // 立即检查一次
            const immediateCheck = document.querySelector(selector);
            if (immediateCheck) {
                resolve(immediateCheck);
                return;
            }

            const startTime = Date.now();
            const timer = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(timer);
                    console.log('✅ 找到元素:', selector);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(timer);
                    reject(new Error('等待元素超时: ' + selector));
                }
            }, 200);
        });
    }

    // 检测是否在批改页面（多种检测方式）
    async function detectMarkingPage() {
        console.log('🔍 开始检测批改页面...');
        console.log('📍 当前URL:', window.location.href);

        try {
            if (!window.location.href.includes('marking')) {
                console.log('⚠️ URL不包含marking，可能不是批改页面');
            }

            // 等待任意一个批改页面特征元素出现
            const result = await Promise.race([
                waitForElement('div[name="topicImg"]').then(() => 'topicImg'),
                waitForElement('div[name="topicImg"] img').then(() => 'topicImg-img'),
                waitForElement('input[type="number"]').then(() => 'score-input'),
                waitForElement('input[placeholder*="分"]').then(() => 'score-placeholder'),
                waitForElement('button:contains("提交分数")').then(() => 'submit-btn'),
                waitForElement('.marking-container').then(() => 'marking-container'),
                waitForElement('.student-answer').then(() => 'student-answer')
            ]).catch(() => null);

            if (result) {
                console.log('✅ 检测到批改页面元素:', result);
                return true;
            }

            console.log('⚠️ 未检测到批改页面元素，尝试通用检测...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            const hasInput = document.querySelector('input[type="number"]') || 
                           document.querySelector('input[type="text"]');
            const hasButton = Array.from(document.querySelectorAll('button')).some(btn => 
                btn.textContent.includes('提交') || btn.textContent.includes('分数')
            );

            if (hasInput && hasButton) {
                console.log('✅ 通用检测通过：找到输入框和提交按钮');
                return true;
            }

            console.log('⚠️ 通用检测未通过');
            return false;

        } catch (error) {
            console.error('❌ 检测批改页面失败:', error);
            return false;
        }
    }

    // 全局状态
    window.aiGradingState = {
        isRunning: false,
        isPaused: false,
        currentStudentAnswer: '',
        currentImageUrls: [], // 修改为支持多图
        abortController: null,
        countdownPaused: false,
        autoRefreshOn403: true,
        unattendedMode: false,
        errorRetryCount: 0,
        maxRetries: 3
    };

    // ========== 安全的alert ==========
    function safeAlert(message) {
        if (window.aiGradingState.unattendedMode) {
            console.log('📢 [静默提示]', message);
        } else {
            alert(message);
        }
    }

    // ========== 创建主按钮 ==========
    function createMainButton() {
        if (document.querySelector('.ai-grade-btn')) {
            return;
        }

        const btn = document.createElement('button');
        btn.className = 'ai-grade-btn';
        btn.innerHTML = '✨ 开始AI打分';
        btn.onclick = toggleAutoGrading;

        const style = document.createElement('style');
        style.textContent = `
            .ai-grade-btn {
                position: fixed;
                bottom: 150px;
                right: 30px;
                z-index: 99999 !important;
                padding: 18px 35px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                border: none;
                border-radius: 30px;
                font-size: 20px;
                font-weight: bold;
                cursor: pointer;
                box-shadow: 0 10px 30px rgba(102, 126, 234, 0.6);
                transition: all 0.3s ease;
                min-width: 180px;
            }
            .ai-grade-btn:hover {
                transform: translateY(-3px) scale(1.05);
                box-shadow: 0 15px 35px rgba(102, 126, 234, 0.8);
            }
            .ai-grade-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            .ai-grade-btn.paused {
                background: linear-gradient(135deg, #F56C6C 0%, #E6A23C 100%);
                animation: pulse-pause 1.5s infinite;
            }
            .ai-grade-btn.running {
                background: linear-gradient(135deg, #67C23A 0%, #409EFF 100%);
                animation: pulse-running 2s infinite;
            }
            .ai-grade-btn.unattended {
                background: linear-gradient(135deg, #E6A23C 0%, #F56C6C 100%);
                animation: pulse-unattended 2s infinite;
            }
            
            @keyframes pulse-pause {
                0%, 100% { box-shadow: 0 10px 30px rgba(245, 108, 108, 0.6); }
                50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); transform: scale(1.02); }
            }
            @keyframes pulse-running {
                0%, 100% { box-shadow: 0 10px 30px rgba(103, 194, 58, 0.6); }
                50% { box-shadow: 0 10px 40px rgba(103, 194, 58, 0.9); }
            }
            @keyframes pulse-unattended {
                0%, 100% { box-shadow: 0 10px 30px rgba(230, 162, 60, 0.6); }
                50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); }
            }
        `;

        document.head.appendChild(style);
        document.body.appendChild(btn);
        console.log('✅ AI打分按钮已创建');
    }

    // ========== 切换打分状态 ==========
    function toggleAutoGrading() {
        const btn = document.querySelector('.ai-grade-btn');

        if (window.aiGradingState.isRunning) {
            window.aiGradingState.isPaused = true;
            window.aiGradingState.isRunning = false;

            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.abort();
            }

            btn.textContent = '▶️ 继续AI打分';
            btn.classList.remove('running', 'unattended');
            btn.classList.add('paused');

            const dialog = document.getElementById('auto-submit-dialog');
            if (dialog) dialog.remove();

        } else {
            window.aiGradingState.isRunning = true;
            window.aiGradingState.isPaused = false;
            window.aiGradingState.errorRetryCount = 0;

            const config = JSON.parse(GM_getValue('ai-grading-config') || '{}');
            window.aiGradingState.unattendedMode = config.unattendedMode || false;

            if (window.aiGradingState.unattendedMode) {
                btn.textContent = '🤖 无人值守中...';
                btn.classList.remove('paused');
                btn.classList.add('running', 'unattended');
            } else {
                btn.textContent = '⏸️ 暂停AI打分';
                btn.classList.remove('paused', 'unattended');
                btn.classList.add('running');
            }

            const panel = document.getElementById('ai-grading-settings');
            if (panel) {
                panel.classList.add('minimized');
                const minimizeBtn = panel.querySelector('.minimize-btn');
                if (minimizeBtn) minimizeBtn.textContent = '+';
            }

            startAutoGrading();
        }
    }

    // ========== 创建配置面板 ==========
    function createSettingsPanel() {
        if (document.getElementById('ai-grading-settings')) return;

        const panel = document.createElement('div');
        panel.id = 'ai-grading-settings';
        panel.innerHTML = `
            <style>
                /* 面板CSS省略大部分冗余，保留关键样式 */
                #ai-grading-settings { position: fixed; top: 20px; right: 20px; width: 450px; max-height: 90vh; overflow-y: auto; background: white; border: 2px solid #409EFF; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); z-index: 10000; font-family: sans-serif; }
                #ai-grading-settings.minimized .settings-body { display: none; }
                #ai-grading-settings.minimized { width: 200px; }
                .settings-header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 20px; border-radius: 10px 10px 0 0; display: flex; justify-content: space-between; align-items: center; cursor: move; }
                .settings-header h3 { margin: 0; font-size: 18px; }
                .header-buttons { display: flex; gap: 8px; }
                .header-btn { background: rgba(255,255,255,0.2); border: none; color: white; width: 28px; height: 28px; border-radius: 6px; cursor: pointer; }
                .settings-body { padding: 20px; max-height: calc(90vh - 60px); overflow-y: auto; }
                .form-section { margin-bottom: 25px; }
                .form-section h4 { color: #303133; font-size: 15px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #409EFF; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; margin-bottom: 6px; color: #606266; font-size: 14px; font-weight: 500; }
                .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #DCDFE6; border-radius: 6px; box-sizing: border-box; }
                .form-hint { font-size: 12px; color: #909399; margin-top: 4px; }
                .checkbox-group { display: flex; align-items: center; gap: 10px; padding: 12px; background: #f5f7fa; border-radius: 6px; }
                .unattended-warning { background: #FEF0F0; border: 1px solid #F56C6C; border-radius: 6px; padding: 12px; margin-top: 10px; font-size: 13px; color: #F56C6C; line-height: 1.6; }
                .api-key-link { display: inline-block; margin-top: 8px; padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; text-decoration: none; border-radius: 6px; font-size: 13px; }
                .save-btn { width: 100%; padding: 12px; background: #409EFF; color: white; border: none; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; }
            </style>
            <div class="settings-header">
                <h3>⚙️ AI打分配置</h3>
                <div class="header-buttons">
                    <button class="header-btn minimize-btn" title="最小化">−</button>
                    <button class="header-btn close-btn" title="关闭">×</button>
                </div>
            </div>
            <div class="settings-body">
                <div class="form-section">
                    <h4>🚀 运行模式</h4>
                    <div class="checkbox-group">
                        <input type="checkbox" id="unattended-mode">
                        <label for="unattended-mode"><strong>🤖 无人值守模式</strong></label>
                    </div>
                    <div class="unattended-warning" id="unattended-warning" style="display: none;">
                        ⚠️ <strong>无人值守模式说明：</strong><br>
                        • 遇到错误自动刷新重试<br>• 所有提示仅在控制台输出<br>• 1秒后自动提交并继续
                    </div>
                </div>
                <div class="form-section">
                    <h4>📝 题目信息（可选）</h4>
                    <div class="form-group"><label>题目内容</label><textarea id="question-content"></textarea></div>
                    <div class="form-group"><label>标准答案</label><textarea id="standard-answer"></textarea></div>
                    <div class="form-group"><label>评分标准</label><textarea id="grading-rubric"></textarea></div>
                </div>
                <div class="form-section">
                    <h4>🤖 AI配置（必填）</h4>
                    <div class="form-group">
                        <label>API服务商</label>
                        <select id="ai-provider">
                            <option value="5plus1">5+1 AI（推荐）</option>
                            <option value="openai">其他（OpenAI兼容格式）</option>
                        </select>
                        <div id="api-key-link-container" style="display: none;">
                            <a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">🔑 获取 API KEY</a>
                        </div>
                    </div>
                    <div class="form-group"><label>API端点</label><input type="text" id="api-endpoint"></div>
                    <div class="form-group"><label>API密钥 <span style="color: #F56C6C;">*</span></label><input type="password" id="api-key"></div>
                    <div class="form-group"><label>模型名称</label><input type="text" id="model-name"></div>
                </div>
                <button class="save-btn" id="save-config-btn">💾 保存配置并开始使用</button>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.minimize-btn').onclick = function() {
            panel.classList.toggle('minimized');
            this.textContent = panel.classList.contains('minimized') ? '+' : '−';
        };
        panel.querySelector('.close-btn').onclick = () => panel.style.display = 'none';
        panel.querySelector('#save-config-btn').onclick = saveAISettings;

        const unattendedCheckbox = panel.querySelector('#unattended-mode');
        const unattendedWarning = panel.querySelector('#unattended-warning');
        unattendedCheckbox.addEventListener('change', function() {
            unattendedWarning.style.display = this.checked ? 'block' : 'none';
        });

        makeDraggable(panel);
        loadSettings();
    }

    // ========== 拖拽功能 ==========
    function makeDraggable(element) {
        const header = element.querySelector('.settings-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        header.onmousedown = (e) => {
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
            document.onmousemove = (e) => {
                e.preventDefault();
                pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
                pos3 = e.clientX; pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
                element.style.right = 'auto';
            };
        };
    }

    // ========== 加载配置（修复版：不覆盖已有配置）==========
    function loadSettings() {
        const saved = GM_getValue('ai-grading-config');
        if (saved) {
            const config = JSON.parse(saved);
            document.getElementById('question-content').value = config.question || '';
            document.getElementById('standard-answer').value = config.answer || '';
            document.getElementById('grading-rubric').value = config.rubric || '';
            document.getElementById('ai-provider').value = config.provider || '5plus1';
            document.getElementById('api-endpoint').value = config.endpoint || 'https://api.ai.five-plus-one.com/v1/chat/completions';
            document.getElementById('api-key').value = config.apiKey || '';
            document.getElementById('model-name').value = config.model || 'doubao-seed-1-8-251228';
            document.getElementById('unattended-mode').checked = config.unattendedMode || false;
            
            const unattendedWarning = document.getElementById('unattended-warning');
            if (config.unattendedMode) unattendedWarning.style.display = 'block';
        } else {
            document.getElementById('ai-provider').value = '5plus1';
            document.getElementById('api-endpoint').value = 'https://api.ai.five-plus-one.com/v1/chat/completions';
            document.getElementById('model-name').value = 'doubao-seed-1-8-251228';
        }

        const providerSelect = document.getElementById('ai-provider');
        const apiKeyLinkContainer = document.getElementById('api-key-link-container');

        function updateUIVisibility() {
            apiKeyLinkContainer.style.display = providerSelect.value === '5plus1' ? 'block' : 'none';
        }

        function handleProviderChange() {
            updateUIVisibility();
            const presets = {
                '5plus1': { endpoint: 'https://api.ai.five-plus-one.com/v1/chat/completions', model: 'doubao-seed-1-8-251228' },
                'openai': { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' }
            };
            const preset = presets[providerSelect.value];
            if (preset) {
                document.getElementById('api-endpoint').value = preset.endpoint;
                document.getElementById('model-name').value = preset.model;
            }
        }

        providerSelect.addEventListener('change', handleProviderChange);
        updateUIVisibility(); 
    }

    // ========== 保存配置 ==========
    function saveAISettings() {
        const config = {
            question: document.getElementById('question-content').value,
            answer: document.getElementById('standard-answer').value,
            rubric: document.getElementById('grading-rubric').value,
            provider: document.getElementById('ai-provider').value,
            endpoint: document.getElementById('api-endpoint').value,
            apiKey: document.getElementById('api-key').value,
            model: document.getElementById('model-name').value,
            unattendedMode: document.getElementById('unattended-mode').checked
        };
        GM_setValue('ai-grading-config', JSON.stringify(config));
        
        safeAlert(config.unattendedMode ? '✅ 已开启无人值守模式并保存配置！' : '✅ 配置已保存！');
        
        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.classList.add('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) minimizeBtn.textContent = '+';
        }
    }

    // ========== 通过GM_xmlhttpRequest获取图片并转Base64（解决CORS跨域问题）==========
    // ========== 通过GM_xmlhttpRequest获取图片并转Base64（解决CORS跨域问题）==========
    async function fetchImageAsBase64(url) {
        return new Promise((resolve, reject) => {
            console.log(`📥 正在请求下载图片: ${url.substring(0, 60)}...`);
            if (window.aiGradingState.isPaused) return reject(new Error('用户暂停'));

            const request = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                // 【修复点1】改用 arraybuffer，兼容性比 blob 更好，不易卡死
                responseType: 'arraybuffer',
                // 【修复点2】强制增加30秒超时，防止无限挂起
                timeout: 30000, 
                onload: function(response) {
                    console.log(`📥 图片下载响应状态码: ${response.status}`);
                    
                    if (response.status === 403 && window.aiGradingState.autoRefreshOn403) {
                        console.warn('⚠️ 图片返回403，自动刷新页面...');
                        sessionStorage.setItem('ai-grading-auto-resume', 'true');
                        setTimeout(() => location.reload(), 1000);
                        return reject(new Error('403错误，页面刷新中'));
                    }
                    
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const arrayBuffer = response.response;
                            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                                throw new Error('下载的图片数据为空');
                            }
                            
                            // 将 ArrayBuffer 转换为 Base64
                            let binary = '';
                            const bytes = new Uint8Array(arrayBuffer);
                            const len = bytes.byteLength;
                            for (let i = 0; i < len; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            const base64 = window.btoa(binary);
                            
                            console.log(`✅ 图片转换成功 (${(len / 1024).toFixed(2)} KB)`);
                            resolve(base64);
                        } catch (e) {
                            console.error('❌ 图片转换Base64失败:', e);
                            reject(new Error('图片转换失败: ' + e.message));
                        }
                    } else {
                        reject(new Error(`图片下载失败，状态码: ${response.status}`));
                    }
                },
                onerror: function(err) {
                    console.error('❌ 图片下载网络错误(可能被拦截):', err);
                    reject(new Error('图片下载跨域请求被拒绝或网络断开'));
                },
                ontimeout: function() {
                    console.error('❌ 图片下载超时(已超过30秒)');
                    reject(new Error('图片下载超时，请检查网络或刷新重试'));
                }
            });

            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                    request.abort();
                    reject(new Error('用户主动暂停'));
                });
            }
        });
    }

    // ========== AI自动打分主函数 (支持多图切片) ==========
    async function startAutoGrading() {
        window.aiGradingState.abortController = new AbortController();

        try {
            const config = JSON.parse(GM_getValue('ai-grading-config') || '{}');
            if (!config.apiKey) {
                safeAlert('❌ 请先配置API密钥！');
                window.aiGradingState.isRunning = false;
                document.querySelector('.ai-grade-btn').textContent = '✨ 开始AI打分';
                return;
            }

            console.log('🔍 正在查找答题卡图片...');
            const imgElements = document.querySelectorAll('div[name="topicImg"] img');

            if (!imgElements || imgElements.length === 0) {
                if (window.aiGradingState.unattendedMode) {
                    stopAutoGrading();
                    safeAlert('✅ 所有试卷已批改完成！');
                    return;
                }
                safeAlert('❌ 未找到答题卡图片！');
                window.aiGradingState.isRunning = false;
                return;
            }

            const imageUrls = Array.from(imgElements).map(img => img.src);
            window.aiGradingState.currentImageUrls = imageUrls;
            console.log(`✅ 共找到 ${imageUrls.length} 张图片分片`);

            const gradeBtn = document.querySelector('.ai-grade-btn');
            if (gradeBtn && !window.aiGradingState.unattendedMode) {
                gradeBtn.textContent = imageUrls.length > 1 ? `📥 下载多图(${imageUrls.length})...` : '📥 下载图片...';
            }

            const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));

            if (window.aiGradingState.isPaused) throw new Error('用户暂停');
            
            if (gradeBtn && !window.aiGradingState.unattendedMode) {
                gradeBtn.textContent = '⏳ AI分析中...';
                // 弹出流式加载面板
                showStreamPanel();
            }

            // 调用 API 并传入流式更新的回调函数
            const result = await callAIGrading(base64DataArray, config, (streamedText) => {
                if (!window.aiGradingState.unattendedMode) {
                    updateStreamPanel(streamedText);
                }
            });

            // 获取完成后隐藏面板
            hideStreamPanel();

            if (window.aiGradingState.isPaused) throw new Error('用户暂停');

            if (result.score !== undefined && result.score !== null) {
                window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
                window.aiGradingState.errorRetryCount = 0;
                fillScore(result.score, result.comment);
            } else {
                throw new Error('AI返回异常: ' + JSON.stringify(result));
            }

        } catch (error) {
            hideStreamPanel();
            if (error.message === '用户暂停') {
                console.log('⏸️ 请求已被暂停');
            } else {
                console.error('❌ 打分失败:', error);
                if (window.aiGradingState.unattendedMode) {
                    window.aiGradingState.errorRetryCount++;
                    if (window.aiGradingState.errorRetryCount <= window.aiGradingState.maxRetries) {
                        sessionStorage.setItem('ai-grading-auto-resume', 'true');
                        sessionStorage.setItem('ai-grading-retry-count', window.aiGradingState.errorRetryCount.toString());
                        setTimeout(() => location.reload(), 2000);
                        return;
                    } else {
                        stopAutoGrading();
                        safeAlert('❌ 错误重试上限，自动停止。');
                        return;
                    }
                }
                safeAlert('❌ 打分失败: ' + error.message);
            }
            window.aiGradingState.isRunning = false;
            const btn = document.querySelector('.ai-grade-btn');
            if (btn) btn.textContent = window.aiGradingState.isPaused ? '▶️ 继续AI打分' : '✨ 开始AI打分';
        }
    }

    // ========== 流式输出 UI 面板 ==========
    function showStreamPanel() {
        let panel = document.getElementById('ai-stream-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'ai-stream-panel';
            panel.innerHTML = `
                <style>
                    #ai-stream-panel { position:fixed; bottom:220px; right:30px; width:360px; background:white; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.2); padding:20px; z-index:99998; font-family:-apple-system, sans-serif; border: 2px solid #409EFF; transition: opacity 0.3s;}
                    #ai-stream-panel h4 { margin:0 0 12px 0; color:#409EFF; font-size:16px; display:flex; align-items:center;}
                    #ai-stream-panel .loading-dots::after { content: ''; animation: dots 1.5s steps(4, end) infinite;}
                    @keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }
                    #ai-stream-content { font-size:14px; color:#606266; line-height:1.6; max-height:250px; overflow-y:auto; white-space:pre-wrap; background: #f5f7fa; padding: 12px; border-radius: 6px; border: 1px solid #EBEEF5;}
                </style>
                <h4>🤖 AI 正在实时阅卷<span class="loading-dots"></span></h4>
                <div id="ai-stream-content">连接已建立，等待 AI 思考...</div>
            `;
            document.body.appendChild(panel);
        }
        panel.style.display = 'block';
        panel.querySelector('#ai-stream-content').textContent = '连接已建立，等待 AI 思考...';
    }

    function updateStreamPanel(text) {
        const content = document.getElementById('ai-stream-content');
        if (content) {
            content.textContent = text;
            content.scrollTop = content.scrollHeight; // 自动滚动到底部
        }
    }

    function hideStreamPanel() {
        const panel = document.getElementById('ai-stream-panel');
        if (panel) panel.style.display = 'none';
    }

    // ========== 停止自动打分 ==========
    function stopAutoGrading() {
        window.aiGradingState.isRunning = false;
        window.aiGradingState.isPaused = false;
        window.aiGradingState.unattendedMode = false;
        window.aiGradingState.errorRetryCount = 0;
        if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();
        
        const btn = document.querySelector('.ai-grade-btn');
        if (btn) { btn.textContent = '✨ 开始AI打分'; btn.classList.remove('running', 'paused', 'unattended'); }
        const dialog = document.getElementById('auto-submit-dialog');
        if (dialog) dialog.remove();
        hideStreamPanel();
    }

    // ========== 调用AI API (支持 SSE 流式解析) ==========
    // ========== 调用AI API (支持 SSE 流式解析进阶版) ==========
    async function callAIGrading(base64DataArray, config, onStreamUpdate) {
        const prompt = buildPrompt(config);
        const messageContent = [{ type: "text", text: prompt }];
        base64DataArray.forEach(base64Data => {
            messageContent.push({ type: "image_url", image_url: { url: `data:image/png;base64,${base64Data}` } });
        });

        const requestBody = { 
            model: config.model, 
            messages: [{ role: "user", content: messageContent }], 
            max_tokens: 2048,
            stream: true  // 开启流式输出
        };

        console.log(`📤 [1/3] 图片处理完毕，准备向 AI 接口发送数据...`);
        console.log(`🔗 [2/3] 目标端点: ${config.endpoint}`);
        console.log(`📦 [3/3] 已开启 Stream 流式模式，等待接收数据...`);

        return new Promise((resolve, reject) => {
            let fullText = '';
            let processedLength = 0;
            let buffer = '';

            // 核心解析逻辑封装
            const processStreamChunk = (responseText) => {
                if (!responseText) return;
                const chunk = responseText.substring(processedLength);
                if (!chunk) return;
                processedLength = responseText.length;
                buffer += chunk;
                
                // 按行分割，保留最后一行不完整的留到下次处理
                const lines = buffer.split('\n');
                buffer = lines.pop(); 
                
                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith('data:')) {
                        // 兼容各种厂商带不带空格的格式
                        const dataStr = line.substring(5).trim();
                        if (dataStr === '[DONE]' || !dataStr) continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                fullText += delta;
                                // 触发回调更新悬浮窗
                                if (onStreamUpdate) onStreamUpdate(fullText);
                            }
                        } catch (e) {
                            // 忽略被截断的异常 JSON
                        }
                    }
                }
            };

            try {
                const request = GM_xmlhttpRequest({
                    method: 'POST',
                    url: config.endpoint,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                    data: JSON.stringify(requestBody),
                    timeout: 120000,
                    // 兜底1：标准状态改变事件
                    onreadystatechange: function(response) {
                        if ((response.readyState === 3 || response.readyState === 4) && response.status >= 200 && response.status < 300) {
                            processStreamChunk(response.responseText);
                        }
                    },
                    // 兜底2：进度事件（部分油猴扩展需要依赖此事件获取流）
                    onprogress: function(response) {
                        if (response.status >= 200 && response.status < 300) {
                            processStreamChunk(response.responseText);
                        }
                    },
                    onload: function(response) {
                        console.log(`📥 API请求结束，最终状态码: ${response.status}`);
                        if (response.status >= 200 && response.status < 300) {
                            processStreamChunk(response.responseText); // 处理最后残留的数据
                            
                            if (fullText) {
                                resolve(parseAIResponseText(fullText));
                            } else {
                                // 万一连流式都被拦截，降级处理普通响应
                                try {
                                    const data = JSON.parse(response.responseText);
                                    const fallbackText = data.choices?.[0]?.message?.content || '';
                                    resolve(parseAIResponseText(fallbackText));
                                } catch (e) { 
                                    reject(new Error('无法解析非流式响应')); 
                                }
                            }
                        } else {
                            let errorMsg = response.responseText;
                            try {
                                const errObj = JSON.parse(response.responseText);
                                if (errObj.error && errObj.error.message) errorMsg = errObj.error.message;
                            } catch (e) {}
                            console.error(`❌ API请求失败:`, errorMsg);
                            reject(new Error(`API报错 (${response.status}): ${errorMsg}`));
                        }
                    },
                    onerror: () => reject(new Error('网络请求被拦截，请允许跨域权限')),
                    ontimeout: () => reject(new Error('API请求超时'))
                });

                if (window.aiGradingState.abortController) {
                    window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                        request.abort();
                        reject(new Error('用户主动暂停'));
                    });
                }
            } catch (e) { reject(new Error('内部错误: ' + e.message)); }
        });
    }

    // ========== 构建提示词 ==========
    function buildPrompt(config) {
        let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
        if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
        if (config.answer) prompt += `**标准答案：**\n${config.answer}\n\n`;
        if (config.rubric) prompt += `**评分标准：**\n${config.rubric}\n\n`;
        prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：

学生答案：[OCR识别出的学生答案文字内容]
分数：[数字]
评语：[简短评语]

注意：
1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后
2. 只返回数字分数，不要带单位
3. 评语控制在100字以内
4. 严格按照评分标准打分`;
        return prompt;
    }

    // ========== 解析AI响应 ==========
    function parseAIResponse(data) {
        const text = data.choices?.[0]?.message?.content || '';
        const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n分数|$)/s);
        const scoreMatch = text.match(/分数[：:]\s*(\d+\.?\d*)/);
        const commentMatch = text.match(/评语[：:]\s*(.+)/s);
        return {
            studentAnswer: studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别',
            score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
            comment: commentMatch ? commentMatch[1].trim() : text
        };
    }

   // ========== 解析AI纯文本响应 ==========
    function parseAIResponseText(text) {
        const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n分数|$)/s);
        const scoreMatch = text.match(/分数[：:]\s*(\d+\.?\d*)/);
        const commentMatch = text.match(/评语[：:]\s*(.+)/s);
        return {
            studentAnswer: studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别',
            score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
            comment: commentMatch ? commentMatch[1].trim() : text
        };
    }
    // ========== 填入分数 ==========
    function fillScore(score, comment) {
        const scoreInput = document.querySelector('input[type="number"]') || 
                           document.querySelector('input[placeholder*="分"]') || 
                           Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('分') || i.name?.includes('score'));

        if (scoreInput) {
            scoreInput.value = score;
            scoreInput.focus();
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log('✅ 已自动填入分数:', score);
            showAutoSubmitDialog(score, comment);
        } else {
            console.warn('⚠️ 未找到分数输入框');
            safeAlert(`AI打分结果：\n分数：${score}\n评语：${comment}\n\n请手动输入分数！`);
            showAutoSubmitDialog(score, comment); // 找不到输入框也把弹窗展示出来，方便看结果
        }
    }
    // ========== 显示自动提交对话框 (支持多图渲染) ==========
    function showAutoSubmitDialog(score, comment) {
        const oldDialog = document.getElementById('auto-submit-dialog');
        if (oldDialog) oldDialog.remove();

        window.aiGradingState.countdownPaused = false;
        const studentAnswer = window.aiGradingState.currentStudentAnswer;
        const imageUrls = window.aiGradingState.currentImageUrls || [];
        const countdownSeconds = window.aiGradingState.unattendedMode ? 1 : 5;

        // 拼接所有图片
        const imagesHtml = imageUrls.map(url => `<img src="${url}" style="width: 100%; height: auto; display: block; border-bottom: 2px dashed #DCDFE6; margin-bottom: -2px;">`).join('');

        const dialog = document.createElement('div');
        dialog.id = 'auto-submit-dialog';
        dialog.innerHTML = `
            <style>
                #auto-submit-dialog { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 999999; background: white; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); padding: 30px; width: 800px; max-width: 90vw; max-height: 90vh; overflow-y: auto; }
                #auto-submit-dialog h2 { margin: 0 0 20px 0; text-align: center; }
                #auto-submit-dialog .content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                #auto-submit-dialog .student-image { border: 2px solid #DCDFE6; border-radius: 8px; overflow-y: auto; max-height: 500px; background: #f5f7fa; }
                #auto-submit-dialog .info-box { background: #f5f7fa; padding: 15px; border-radius: 8px; border-left: 4px solid #409EFF; margin-bottom: 15px; }
                #auto-submit-dialog .info-box h4 { margin: 0 0 10px 0; }
                #auto-submit-dialog .content { color: #606266; line-height: 1.6; max-height: 150px; overflow-y: auto; white-space: pre-wrap; }
                #auto-submit-dialog .score-display { font-size: 48px; font-weight: bold; color: #409EFF; text-align: center; }
                #auto-submit-dialog .countdown { font-size: 18px; color: #E6A23C; margin: 20px 0; font-weight: bold; text-align: center; }
                #auto-submit-dialog .buttons { display: flex; gap: 15px; margin-top: 25px; }
                #auto-submit-dialog button { flex: 1; padding: 12px 24px; border: none; border-radius: 6px; font-size: 16px; font-weight: bold; cursor: pointer; }
                #auto-submit-dialog .confirm-btn { background: #67C23A; color: white; }
                #auto-submit-dialog .cancel-btn { background: #E6A23C; color: white; }
                #auto-submit-dialog .overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: -1; }
            </style>
            <div class="overlay"></div>
            <h2>✅ AI评分完成 ${window.aiGradingState.unattendedMode ? '(无人值守模式)' : ''}</h2>
            <div class="content-grid">
                <div class="student-image">${imagesHtml}</div>
                <div class="result-section">
                    <div class="info-box"><h4>📝 识别答案</h4><div class="content">${studentAnswer}</div></div>
                    <div class="info-box"><h4>💬 AI评语</h4><div class="content">${comment}</div></div>
                    <div class="info-box" style="border-left-color: #67C23A;"><h4>🎯 得分</h4><div class="score-display">${score} 分</div></div>
                </div>
            </div>
            <div class="countdown" id="countdown-display">将在 <span id="countdown-number">${countdownSeconds}</span> 秒后自动提交</div>
            <div class="buttons">
                <button class="cancel-btn" id="pause-cancel-btn">⏸️ 暂停</button>
                <button class="confirm-btn" id="confirm-submit-btn">✓ 立即提交</button>
            </div>
        `;
        document.body.appendChild(dialog);

        dialog.querySelector('#pause-cancel-btn').addEventListener('click', () => {
            if (!window.aiGradingState.countdownPaused) {
                window.aiGradingState.countdownPaused = true;
                dialog.querySelector('#pause-cancel-btn').textContent = '✖ 取消并退出';
                dialog.querySelector('#countdown-display').innerHTML = '⏸️ 已暂停';
            } else {
                if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
                dialog.remove();
                stopAutoGrading();
            }
        });

        const confirmSubmitFn = () => {
            if (dialog.countdownTimer) clearInterval(dialog.countdownTimer);
            dialog.remove();
            const submitBtn = Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('提交分数'));
            if (submitBtn) {
                submitBtn.click();
                if (window.aiGradingState.isRunning && !window.aiGradingState.isPaused) {
                    setTimeout(startAutoGrading, 1500);
                } else {
                    window.aiGradingState.isRunning = false;
                }
            } else {
                safeAlert('✅ 分数已填，未找到提交按钮');
                if (window.aiGradingState.unattendedMode) stopAutoGrading();
            }
        };

        dialog.querySelector('#confirm-submit-btn').addEventListener('click', confirmSubmitFn);

        let countdown = countdownSeconds;
        dialog.countdownTimer = setInterval(() => {
            if (window.aiGradingState.countdownPaused) return;
            countdown--;
            const span = dialog.querySelector('#countdown-number');
            if (span) span.textContent = countdown;
            if (countdown <= 0) confirmSubmitFn();
        }, 1000);
    }

    // ========== 初始化 ==========
    async function init() {
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (!await detectMarkingPage()) return;
        
        createMainButton();
        createSettingsPanel();

        if (sessionStorage.getItem('ai-grading-auto-resume') === 'true') {
            sessionStorage.removeItem('ai-grading-auto-resume');
            window.aiGradingState.errorRetryCount = parseInt(sessionStorage.getItem('ai-grading-retry-count') || '0');
            sessionStorage.removeItem('ai-grading-retry-count');
            setTimeout(() => toggleAutoGrading(), 3000);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 1000);
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();