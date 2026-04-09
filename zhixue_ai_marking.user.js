// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      1.3.0
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
            const immediateCheck = document.querySelector(selector);
            if (immediateCheck) return resolve(immediateCheck);

            const startTime = Date.now();
            const timer = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                    clearInterval(timer);
                    resolve(element);
                } else if (Date.now() - startTime > timeout) {
                    clearInterval(timer);
                    reject(new Error('等待元素超时: ' + selector));
                }
            }, 200);
        });
    }

    // 检测是否在批改页面
    async function detectMarkingPage() {
        try {
            const result = await Promise.race([
                waitForElement('div[name="topicImg"]').then(() => 'topicImg'),
                waitForElement('input[type="number"]').then(() => 'score-input'),
                waitForElement('button:contains("提交分数")').then(() => 'submit-btn')
            ]).catch(() => null);

            if (result) return true;

            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasInput = document.querySelector('input[type="number"]') || document.querySelector('input[type="text"]');
            const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交') || btn.textContent.includes('分数'));
            
            return !!(hasInput && hasButton);
        } catch (error) {
            return false;
        }
    }

    // 全局状态
    window.aiGradingState = {
        isRunning: false,
        isPaused: false,
        currentStudentAnswer: '',
        currentImageUrls: [], 
        abortController: null,
        countdownPaused: false,
        autoRefreshOn403: true,
        unattendedMode: false,
        errorRetryCount: 0,
        maxRetries: 3
    };

    function safeAlert(message) {
        if (window.aiGradingState.unattendedMode) {
            console.log('📢 [静默提示]', message);
        } else {
            alert(message);
        }
    }

    // ========== 创建主按钮 ==========
    function createMainButton() {
        if (document.querySelector('.ai-grade-btn')) return;

        const btn = document.createElement('button');
        btn.className = 'ai-grade-btn';
        btn.innerHTML = '✨ 开始AI打分';
        btn.onclick = toggleAutoGrading;

        const style = document.createElement('style');
        style.textContent = `
            .ai-grade-btn { position: fixed; bottom: 150px; right: 30px; z-index: 99999 !important; padding: 18px 35px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 30px; font-size: 20px; font-weight: bold; cursor: pointer; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.6); transition: all 0.3s ease; min-width: 180px; }
            .ai-grade-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 15px 35px rgba(102, 126, 234, 0.8); }
            .ai-grade-btn:disabled { opacity: 0.6; cursor: not-allowed; }
            .ai-grade-btn.paused { background: linear-gradient(135deg, #F56C6C 0%, #E6A23C 100%); animation: pulse-pause 1.5s infinite; }
            .ai-grade-btn.running { background: linear-gradient(135deg, #67C23A 0%, #409EFF 100%); animation: pulse-running 2s infinite; }
            .ai-grade-btn.unattended { background: linear-gradient(135deg, #E6A23C 0%, #F56C6C 100%); animation: pulse-unattended 2s infinite; }
            @keyframes pulse-pause { 0%, 100% { box-shadow: 0 10px 30px rgba(245, 108, 108, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); transform: scale(1.02); } }
            @keyframes pulse-running { 0%, 100% { box-shadow: 0 10px 30px rgba(103, 194, 58, 0.6); } 50% { box-shadow: 0 10px 40px rgba(103, 194, 58, 0.9); } }
            @keyframes pulse-unattended { 0%, 100% { box-shadow: 0 10px 30px rgba(230, 162, 60, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); } }
        `;
        document.head.appendChild(style);
        document.body.appendChild(btn);
    }

    // ========== 切换打分状态 ==========
    function toggleAutoGrading() {
        const btn = document.querySelector('.ai-grade-btn');
        btn.disabled = true;
        setTimeout(() => btn.disabled = false, 800); // 防手抖

        if (window.aiGradingState.isRunning) {
            window.aiGradingState.isPaused = true;
            window.aiGradingState.isRunning = false;
            if (window.aiGradingState.abortController) window.aiGradingState.abortController.abort();

            btn.textContent = '▶️ 继续AI打分';
            btn.classList.remove('running', 'unattended');
            btn.classList.add('paused');

            const dialog = document.getElementById('auto-submit-dialog');
            if (dialog) dialog.remove();
            hideStreamPanel();
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
                        ⚠️ <strong>无人值守模式说明：</strong><br>• 遇到错误自动刷新重试<br>• 所有提示仅在控制台输出<br>• 1秒后自动提交并继续
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
                        <div id="api-key-link-container" style="display: none;"><a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">🔑 获取 API KEY</a></div>
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

    async function fetchImageAsBase64(url) {
        return new Promise((resolve, reject) => {
            console.log(`📥 正在请求下载图片: ${url.substring(0, 60)}...`);
            if (window.aiGradingState.isPaused) return reject(new Error('用户暂停'));

            const request = GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 30000, 
                onload: function(response) {
                    if (response.status === 403 && window.aiGradingState.autoRefreshOn403) {
                        console.warn('⚠️ 图片返回403，自动刷新页面...');
                        sessionStorage.setItem('ai-grading-auto-resume', 'true');
                        setTimeout(() => location.reload(), 1000);
                        return reject(new Error('403错误，页面刷新中'));
                    }
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const arrayBuffer = response.response;
                            if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('下载的图片数据为空');
                            
                            let binary = '';
                            const bytes = new Uint8Array(arrayBuffer);
                            const len = bytes.byteLength;
                            for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
                            
                            resolve(window.btoa(binary));
                        } catch (e) {
                            reject(new Error('图片转换失败: ' + e.message));
                        }
                    } else {
                        reject(new Error(`图片下载失败，状态码: ${response.status}`));
                    }
                },
                onerror: () => reject(new Error('图片下载跨域请求被拒绝或网络断开')),
                ontimeout: () => reject(new Error('图片下载超时'))
            });

            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                    request.abort();
                    reject(new Error('用户主动暂停'));
                });
            }
        });
    }

    // ========== AI 核心流式请求 (底层兼容终极版) ==========
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
            stream: true 
        };

        console.log(`📤 发送请求到: ${config.endpoint}`);

        return new Promise((resolve, reject) => {
            let fullText = '';
            let processedLength = 0;
            let buffer = '';

            const processChunk = (responseText) => {
                if (!responseText) return;
                const chunk = responseText.substring(processedLength);
                if (!chunk) return;
                processedLength = responseText.length;
                buffer += chunk;

                const lines = buffer.split('\n');
                buffer = lines.pop(); // 保留最后一行不完整的

                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith('data:')) {
                        const dataStr = line.substring(5).trim();
                        if (dataStr === '[DONE]' || !dataStr) continue;
                        try {
                            const parsed = JSON.parse(dataStr);
                            const delta = parsed.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                fullText += delta;
                                if (onStreamUpdate) onStreamUpdate(fullText);
                            }
                        } catch (e) {} // 忽略截断块
                    }
                }
            };

            const request = GM_xmlhttpRequest({
                method: 'POST',
                url: config.endpoint,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
                data: JSON.stringify(requestBody),
                timeout: 120000,
                onreadystatechange: function(response) {
                    // 标准油猴的完美流式读取时机
                    if (response.readyState === 3 || response.readyState === 4) {
                        if (response.status >= 200 && response.status < 300) processChunk(response.responseText);
                    }
                },
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        processChunk(response.responseText); // 处理最后残余
                        if (fullText) {
                            resolve(parseAIResponseText(fullText));
                        } else {
                            try {
                                const data = JSON.parse(response.responseText);
                                resolve(parseAIResponseText(data.choices?.[0]?.message?.content || ''));
                            } catch (e) {
                                reject(new Error('无法解析API返回数据'));
                            }
                        }
                    } else {
                        let errorMsg = response.responseText;
                        try {
                            const errObj = JSON.parse(response.responseText);
                            if (errObj.error?.message) errorMsg = errObj.error.message;
                        } catch (e) {}
                        reject(new Error(`API报错 (${response.status}): ${errorMsg}`));
                    }
                },
                onerror: () => reject(new Error('网络请求被拦截，请允许跨域')),
                ontimeout: () => reject(new Error('API请求超时'))
            });

            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                    request.abort();
                    reject(new Error('用户主动暂停'));
                });
            }
        });
    }

    // ========== 主控流程 ==========
    async function startAutoGrading() {
        window.aiGradingState.abortController = new AbortController();

        try {
            const config = JSON.parse(GM_getValue('ai-grading-config') || '{}');
            if (!config.apiKey) {
                safeAlert('❌ 请先配置API密钥！');
                window.aiGradingState.isRunning = false;
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

            const gradeBtn = document.querySelector('.ai-grade-btn');
            if (gradeBtn && !window.aiGradingState.unattendedMode) {
                gradeBtn.textContent = imageUrls.length > 1 ? `📥 下载多图(${imageUrls.length})...` : '📥 下载图片...';
            }

            const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));

            if (window.aiGradingState.isPaused) throw new Error('用户暂停');
            
            if (gradeBtn && !window.aiGradingState.unattendedMode) {
                gradeBtn.textContent = '⏳ AI分析中...';
                showStreamPanel();
            }

            const result = await callAIGrading(base64DataArray, config, (streamedText) => {
                if (!window.aiGradingState.unattendedMode) updateStreamPanel(streamedText);
            });

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
            if (error.message === '用户主动暂停' || error.message === '用户暂停') {
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

    // ========== 文本解析工具 ==========
    function buildPrompt(config) {
        let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：\n\n`;
        if (config.question) prompt += `**题目内容：**\n${config.question}\n\n`;
        if (config.answer) prompt += `**标准答案：**\n${config.answer}\n\n`;
        if (config.rubric) prompt += `**评分标准：**\n${config.rubric}\n\n`;
        prompt += `请仔细查看图片中的学生答案，并按照以下格式返回评分结果（必须严格按此格式）：\n\n学生答案：[OCR识别出的学生答案文字内容]\n分数：[数字]\n评语：[简短评语]\n\n注意：\n1. 先OCR识别图片中的文字，将识别结果写在"学生答案"后\n2. 只返回数字分数，不要带单位\n3. 评语控制在100字以内\n4. 严格按照评分标准打分`;
        return prompt;
    }

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

    // ========== 流式面板 UI ==========
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
                <div id="ai-stream-content">连接已建立，等待数据...</div>
            `;
            document.body.appendChild(panel);
        }
        panel.style.display = 'block';
        panel.querySelector('#ai-stream-content').textContent = '连接已建立，等待数据...';
    }

    function updateStreamPanel(text) {
        const content = document.getElementById('ai-stream-content');
        if (content) {
            content.textContent = text;
            content.scrollTop = content.scrollHeight; 
        }
    }

    function hideStreamPanel() {
        const panel = document.getElementById('ai-stream-panel');
        if (panel) panel.style.display = 'none';
    }

    // ========== 停止打分 ==========
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

    // ========== 填充分数及弹窗 ==========
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
            showAutoSubmitDialog(score, comment);
        } else {
            safeAlert(`AI打分结果：\n分数：${score}\n请手动输入分数！`);
            showAutoSubmitDialog(score, comment);
        }
    }

    function showAutoSubmitDialog(score, comment) {
        const oldDialog = document.getElementById('auto-submit-dialog');
        if (oldDialog) oldDialog.remove();

        window.aiGradingState.countdownPaused = false;
        const studentAnswer = window.aiGradingState.currentStudentAnswer;
        const imageUrls = window.aiGradingState.currentImageUrls || [];
        const countdownSeconds = window.aiGradingState.unattendedMode ? 1 : 5;

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
                
                // 【核心修复】防止因页面没刷新导致重复批改同一份试卷的死循环
                if (window.aiGradingState.isRunning && !window.aiGradingState.isPaused) {
                    console.log('⏳ 已点击提交，正在等待智学网加载下一份试卷...');
                    const oldImgUrl = window.aiGradingState.currentImageUrls[0];
                    let checkTimes = 0;
                    
                    const checkNextTimer = setInterval(() => {
                        checkTimes++;
                        const currentImg = document.querySelector('div[name="topicImg"] img');
                        
                        if (currentImg && currentImg.src !== oldImgUrl) {
                            clearInterval(checkNextTimer);
                            console.log('✅ 新试卷已加载完毕！继续批改...');
                            setTimeout(startAutoGrading, 500); 
                        } else if (checkTimes > 50) { // 等待超过10秒
                            clearInterval(checkNextTimer);
                            console.warn('⚠️ 等待下一份试卷超时');
                            stopAutoGrading();
                            safeAlert('⚠️ 加载下一份试卷超时，已自动停止，请手动检查网络。');
                        }
                    }, 200);

                } else {
                    window.aiGradingState.isRunning = false;
                }
            } else {
                safeAlert('✅ 分数已填，但未找到页面的"提交分数"按钮');
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

    // 【核心修复】废弃严重吃性能的 MutationObserver，改为轻量级轮询检测路由变化
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(init, 1000);
        }
    }, 1000);

})();