// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  智学网AI自动批改助手，支持OCR识别、AI评分、自动提交，让阅卷更轻松！
// @author       5plus1
// @match        https://www.zhixue.com/webmarking/*
// @match        https://*.zhixue.com/webmarking/*
// @icon         https://www.zhixue.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.ai.five-plus-one.com
// @connect      api.openai.com
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
        console.log('📍 Hash:', window.location.hash);

        try {
            // 检查URL中是否包含marking关键字
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

            // 通用检测：等待3秒后检查页面内容
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
        currentImageUrl: '',
        abortController: null,
        countdownPaused: false,
        autoRefreshOn403: true
    };

    // ========== 创建主按钮 ==========
    function createMainButton() {
        // 避免重复创建
        if (document.querySelector('.ai-grade-btn')) {
            console.log('⚠️ 主按钮已存在，跳过创建');
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
            
            @keyframes pulse-pause {
                0%, 100% {
                    box-shadow: 0 10px 30px rgba(245, 108, 108, 0.6);
                }
                50% {
                    box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9);
                    transform: scale(1.02);
                }
            }
            
            @keyframes pulse-running {
                0%, 100% {
                    box-shadow: 0 10px 30px rgba(103, 194, 58, 0.6);
                }
                50% {
                    box-shadow: 0 10px 40px rgba(103, 194, 58, 0.9);
                }
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
            // 暂停：中断当前请求
            window.aiGradingState.isPaused = true;
            window.aiGradingState.isRunning = false;

            // 中断正在进行的AI请求
            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.abort();
                console.log('⏸️ 已中断AI请求');
            }

            btn.textContent = '▶️ 继续AI打分';
            btn.classList.remove('running');
            btn.classList.add('paused');
            console.log('⏸️ AI打分已暂停');

            // 关闭可能存在的确认对话框
            const dialog = document.getElementById('auto-submit-dialog');
            if (dialog) {
                dialog.remove();
            }

        } else {
            // 开始/继续
            window.aiGradingState.isRunning = true;
            window.aiGradingState.isPaused = false;
            btn.textContent = '⏸️ 暂停AI打分';
            btn.classList.remove('paused');
            btn.classList.add('running');

            // 最小化配置面板
            const panel = document.getElementById('ai-grading-settings');
            if (panel) {
                panel.classList.add('minimized');
                const minimizeBtn = panel.querySelector('.minimize-btn');
                if (minimizeBtn) {
                    minimizeBtn.textContent = '+';
                }
            }

            startAutoGrading();
        }
    }

    // ========== 创建配置面板 ==========
    function createSettingsPanel() {
        // 避免重复创建
        if (document.getElementById('ai-grading-settings')) {
            console.log('⚠️ 配置面板已存在，跳过创建');
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'ai-grading-settings';
        panel.innerHTML = `
            <style>
                #ai-grading-settings {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 450px;
                    max-height: 90vh;
                    overflow-y: auto;
                    background: white;
                    border: 2px solid #409EFF;
                    border-radius: 12px;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                #ai-grading-settings.minimized .settings-body {
                    display: none;
                }
                #ai-grading-settings.minimized {
                    width: 200px;
                }
                .settings-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 15px 20px;
                    border-radius: 10px 10px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: move;
                }
                .settings-header h3 {
                    margin: 0;
                    font-size: 18px;
                }
                .header-buttons {
                    display: flex;
                    gap: 8px;
                }
                .header-btn {
                    background: rgba(255,255,255,0.2);
                    border: none;
                    color: white;
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 16px;
                    transition: all 0.2s;
                }
                .header-btn:hover {
                    background: rgba(255,255,255,0.3);
                }
                .settings-body {
                    padding: 20px;
                    max-height: calc(90vh - 60px);
                    overflow-y: auto;
                }
                .welcome-section {
                    background: linear-gradient(135deg, #667eea22 0%, #764ba233 100%);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    border: 2px solid #667eea;
                }
                .welcome-section h3 {
                    margin: 0 0 10px 0;
                    color: #667eea;
                    font-size: 18px;
                }
                .welcome-section p {
                    margin: 8px 0;
                    color: #606266;
                    font-size: 14px;
                    line-height: 1.6;
                }
                .welcome-section ul {
                    margin: 10px 0;
                    padding-left: 20px;
                    color: #606266;
                    font-size: 14px;
                }
                .form-section {
                    margin-bottom: 25px;
                }
                .form-section h4 {
                    color: #303133;
                    font-size: 15px;
                    margin: 0 0 12px 0;
                    padding-bottom: 8px;
                    border-bottom: 2px solid #409EFF;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    color: #606266;
                    font-size: 14px;
                    font-weight: 500;
                }
                .form-group input,
                .form-group select,
                .form-group textarea {
                    width: 100%;
                    padding: 10px 12px;
                    border: 1px solid #DCDFE6;
                    border-radius: 6px;
                    font-size: 14px;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                }
                .form-group input:focus,
                .form-group select:focus,
                .form-group textarea:focus {
                    outline: none;
                    border-color: #409EFF;
                }
                .form-group textarea {
                    resize: vertical;
                    min-height: 80px;
                    font-family: inherit;
                }
                .form-hint {
                    font-size: 12px;
                    color: #909399;
                    margin-top: 4px;
                }
                .api-key-link {
                    display: inline-block;
                    margin-top: 8px;
                    padding: 8px 16px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white !important;
                    text-decoration: none;
                    border-radius: 6px;
                    font-size: 13px;
                    transition: all 0.3s;
                }
                .api-key-link:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
                }
                .save-btn {
                    width: 100%;
                    padding: 12px;
                    background: #409EFF;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-size: 15px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                .save-btn:hover {
                    background: #66b1ff;
                }
            </style>
            <div class="settings-header">
                <h3>⚙️ AI打分配置</h3>
                <div class="header-buttons">
                    <button class="header-btn minimize-btn" title="最小化">−</button>
                    <button class="header-btn close-btn" title="关闭">×</button>
                </div>
            </div>
            <div class="settings-body">
                <div class="welcome-section">
                    <h3>👋 欢迎使用AI打分助手！</h3>
                    <p><strong>快速开始：</strong></p>
                    <ul>
                        <li>✅ 选择API服务商（推荐 5+1 AI）</li>
                        <li>🔑 点击"获取API KEY"注册并复制密钥</li>
                        <li>📝 填写题目信息（可选）</li>
                        <li>💾 保存配置后点击"开始AI打分"</li>
                    </ul>
                </div>

                <div class="form-section">
                    <h4>📝 题目信息（可选）</h4>
                    <div class="form-group">
                        <label>题目内容</label>
                        <textarea id="question-content" placeholder="输入题目内容（可选）"></textarea>
                    </div>
                    <div class="form-group">
                        <label>标准答案</label>
                        <textarea id="standard-answer" placeholder="输入标准答案（可选）"></textarea>
                    </div>
                    <div class="form-group">
                        <label>评分标准</label>
                        <textarea id="grading-rubric" placeholder="输入评分标准（可选）"></textarea>
                        <div class="form-hint">例如：满分10分，答对主要观点得6分，逻辑清晰得2分，语言表达得2分</div>
                    </div>
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
                            <a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">
                                🔑 获取 API KEY（点击注册）
                            </a>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>API端点</label>
                        <input type="text" id="api-endpoint" placeholder="https://api.example.com/v1/chat/completions">
                    </div>
                    <div class="form-group">
                        <label>API密钥 <span style="color: #F56C6C;">*</span></label>
                        <input type="password" id="api-key" placeholder="输入你的API密钥">
                        <div class="form-hint">⚠️ 必须填写API密钥才能使用AI打分功能</div>
                    </div>
                    <div class="form-group">
                        <label>模型名称</label>
                        <input type="text" id="model-name" placeholder="例如: gpt-4o">
                    </div>
                </div>

                <button class="save-btn" id="save-config-btn">💾 保存配置并开始使用</button>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.minimize-btn').onclick = function() {
            panel.classList.toggle('minimized');
            this.textContent = panel.classList.contains('minimized') ? '+' : '−';
        };

        panel.querySelector('.close-btn').onclick = function() {
            panel.style.display = 'none';
        };

        panel.querySelector('#save-config-btn').onclick = saveAISettings;

        makeDraggable(panel);
        loadSettings();

        console.log('✅ 配置面板已创建');
    }

    // ========== 拖拽功能 ==========
    function makeDraggable(element) {
        const header = element.querySelector('.settings-header');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        header.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + "px";
            element.style.left = (element.offsetLeft - pos1) + "px";
            element.style.right = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
        }
    }

    // ========== 加载配置 ==========
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
        } else {
            document.getElementById('ai-provider').value = '5plus1';
            document.getElementById('api-endpoint').value = 'https://api.ai.five-plus-one.com/v1/chat/completions';
            document.getElementById('model-name').value = 'doubao-seed-1-8-251228';
        }

        // 监听API服务商变化
        const providerSelect = document.getElementById('ai-provider');
        const apiKeyLinkContainer = document.getElementById('api-key-link-container');

        function updateProviderUI() {
            const provider = providerSelect.value;

            // 显示/隐藏API KEY链接
            if (provider === '5plus1') {
                apiKeyLinkContainer.style.display = 'block';
            } else {
                apiKeyLinkContainer.style.display = 'none';
            }

            // 更新默认值
            const presets = {
                '5plus1': {
                    endpoint: 'https://api.ai.five-plus-one.com/v1/chat/completions',
                    model: 'doubao-seed-1-8-251228'
                },
                'openai': {
                    endpoint: 'https://api.openai.com/v1/chat/completions',
                    model: 'gpt-4o'
                }
            };

            const preset = presets[provider];
            if (preset) {
                document.getElementById('api-endpoint').value = preset.endpoint;
                document.getElementById('model-name').value = preset.model;
            }
        }

        providerSelect.addEventListener('change', updateProviderUI);
        updateProviderUI(); // 初始化
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
            model: document.getElementById('model-name').value
        };

        GM_setValue('ai-grading-config', JSON.stringify(config));
        alert('✅ 配置已保存！现在可以点击右下角"开始AI打分"按钮开始使用了！');

        // 最小化配置面板
        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.classList.add('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) {
                minimizeBtn.textContent = '+';
            }
        }
    }

    // ========== 通过Fetch获取图片并转Base64（支持403自动刷新）==========
    async function fetchImageAsBase64(url) {
        try {
            console.log('📥 正在下载图片...');

            // 检查是否被暂停
            if (window.aiGradingState.isPaused) {
                throw new Error('用户暂停');
            }

            const response = await fetch(url, {
                signal: window.aiGradingState.abortController?.signal
            });

            // 检测403错误
            if (response.status === 403 && window.aiGradingState.autoRefreshOn403) {
                console.warn('⚠️ 图片下载返回403，自动刷新页面...');
                alert('⚠️ 图片访问权限过期(403)，即将自动刷新页面并继续批改...');

                // 保存当前状态
                sessionStorage.setItem('ai-grading-auto-resume', 'true');

                // 刷新页面
                setTimeout(() => {
                    location.reload();
                }, 1000);

                throw new Error('403错误，页面刷新中');
            }

            if (!response.ok) {
                throw new Error(`图片下载失败: ${response.status}`);
            }

            const blob = await response.blob();
            console.log('✅ 图片下载完成，大小:', (blob.size / 1024).toFixed(2), 'KB');

            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    console.log('✅ 转换为Base64完成');
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('❌ 图片处理失败:', error);
            throw error;
        }
    }

    // ========== AI自动打分主函数 ==========
    async function startAutoGrading() {
        // 创建新的AbortController
        window.aiGradingState.abortController = new AbortController();

        try {
            const config = JSON.parse(GM_getValue('ai-grading-config') || '{}');

            if (!config.apiKey) {
                alert('❌ 请先配置API密钥！\n\n点击右上角配置面板，填写API信息后保存即可使用。');
                const panel = document.getElementById('ai-grading-settings');
                if (panel) {
                    panel.style.display = 'block';
                    panel.classList.remove('minimized');
                }
                window.aiGradingState.isRunning = false;
                const btn = document.querySelector('.ai-grade-btn');
                if (btn) {
                    btn.textContent = '✨ 开始AI打分';
                    btn.classList.remove('running');
                }
                return;
            }

            console.log('🔍 正在查找答题卡图片...');
            const imgElement = document.querySelector('div[name="topicImg"] img');

            if (!imgElement) {
                alert('❌ 未找到答题卡图片！请确保已打开学生答题卡。');
                window.aiGradingState.isRunning = false;
                const btn = document.querySelector('.ai-grade-btn');
                if (btn) {
                    btn.textContent = '✨ 开始AI打分';
                    btn.classList.remove('running');
                }
                return;
            }

            const imageUrl = imgElement.src;
            window.aiGradingState.currentImageUrl = imageUrl;
            console.log('✅ 找到图片URL:', imageUrl);

            const gradeBtn = document.querySelector('.ai-grade-btn');
            if (gradeBtn) {
                gradeBtn.textContent = '📥 下载图片...';
            }

            const base64Data = await fetchImageAsBase64(imageUrl);

            // 再次检查是否被暂停
            if (window.aiGradingState.isPaused) {
                throw new Error('用户暂停');
            }

            if (gradeBtn) {
                gradeBtn.textContent = '⏳ AI分析中...';
            }

            console.log('🤖 正在调用AI分析...');
            const result = await callAIGrading(base64Data, config);

            // 最后检查是否被暂停
            if (window.aiGradingState.isPaused) {
                throw new Error('用户暂停');
            }

            console.log('📊 AI分析结果:', result);

            if (result.score !== undefined && result.score !== null) {
                window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
                fillScore(result.score, result.comment);
            } else {
                alert('⚠️ AI返回格式异常:\n' + JSON.stringify(result));
            }

            if (gradeBtn && window.aiGradingState.isRunning) {
                gradeBtn.textContent = '⏸️ 暂停AI打分';
            }

        } catch (error) {
            if (error.name === 'AbortError' || error.message === '用户暂停') {
                console.log('⏸️ 请求已被用户暂停');
            } else if (error.message.includes('403')) {
                console.log('🔄 页面即将刷新...');
            } else {
                console.error('❌ 打分失败:', error);
                alert('❌ 打分失败: ' + error.message);
            }

            window.aiGradingState.isRunning = false;
            const gradeBtn = document.querySelector('.ai-grade-btn');
            if (gradeBtn) {
                if (window.aiGradingState.isPaused) {
                    gradeBtn.textContent = '▶️ 继续AI打分';
                    gradeBtn.classList.remove('running');
                    gradeBtn.classList.add('paused');
                } else {
                    gradeBtn.textContent = '✨ 开始AI打分';
                    gradeBtn.classList.remove('running', 'paused');
                }
            }
        }
    }

    // ========== 调用AI API（使用GM_xmlhttpRequest）==========
    async function callAIGrading(base64Data, config) {
        const prompt = buildPrompt(config);

        const requestBody = {
            model: config.model,
            messages: [{
                role: "user",
                content: [
                    {
                        type: "text",
                        text: prompt
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/png;base64,${base64Data}`
                        }
                    }
                ]
            }],
            max_tokens: 2048
        };

        console.log('📤 发送请求到:', config.endpoint);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: config.endpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                data: JSON.stringify(requestBody),
                timeout: 60000,
                onload: function(response) {
                    if (response.status >= 200 && response.status < 300) {
                        try {
                            const data = JSON.parse(response.responseText);
                            console.log('📥 API返回:', data);
                            resolve(parseAIResponse(data));
                        } catch (e) {
                            reject(new Error('解析API响应失败: ' + e.message));
                        }
                    } else {
                        reject(new Error(`API请求失败 (${response.status}): ${response.responseText}`));
                    }
                },
                onerror: function(error) {
                    reject(new Error('网络请求失败: ' + error));
                },
                ontimeout: function() {
                    reject(new Error('请求超时'));
                }
            });
        });
    }

    // ========== 构建提示词 ==========
    function buildPrompt(config) {
        let prompt = `你是一位严格的阅卷老师，请根据以下信息对学生答案进行评分：

`;

        if (config.question) {
            prompt += `**题目内容：**\n${config.question}\n\n`;
        }

        if (config.answer) {
            prompt += `**标准答案：**\n${config.answer}\n\n`;
        }

        if (config.rubric) {
            prompt += `**评分标准：**\n${config.rubric}\n\n`;
        }

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

        console.log('🔍 AI返回文本:', text);

        const studentAnswerMatch = text.match(/学生答案[：:]\s*(.+?)(?=\n分数|$)/s);
        const scoreMatch = text.match(/分数[：:]\s*(\d+\.?\d*)/);
        const commentMatch = text.match(/评语[：:]\s*(.+)/s);

        return {
            studentAnswer: studentAnswerMatch ? studentAnswerMatch[1].trim() : '未能识别',
            score: scoreMatch ? parseFloat(scoreMatch[1]) : null,
            comment: commentMatch ? commentMatch[1].trim() : text,
            rawText: text
        };
    }

    // ========== 填入分数 ==========
    function fillScore(score, comment) {
        const scoreInput =
            document.querySelector('input[type="number"]') ||
            document.querySelector('input.score-input') ||
            document.querySelector('input[placeholder*="分"]') ||
            document.querySelector('input[name*="score"]') ||
            Array.from(document.querySelectorAll('input[type="text"]')).find(input => {
                const placeholder = input.placeholder?.toLowerCase() || '';
                const name = input.name?.toLowerCase() || '';
                return placeholder.includes('分') || name.includes('score');
            });

        if (scoreInput) {
            scoreInput.value = '';
            scoreInput.value = score;

            scoreInput.focus();
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));

            console.log('✅ 已自动填入分数:', score);

            showAutoSubmitDialog(score, comment);
        } else {
            console.warn('⚠️ 未找到分数输入框');
            alert(`AI评分结果：\n分数：${score}\n评语：${comment}\n\n请手动输入分数！`);
        }
    }

    // ========== 显示自动提交对话框（带暂停功能）==========
    function showAutoSubmitDialog(score, comment) {
        const oldDialog = document.getElementById('auto-submit-dialog');
        if (oldDialog) oldDialog.remove();

        // 重置倒计时暂停状态
        window.aiGradingState.countdownPaused = false;

        const studentAnswer = window.aiGradingState.currentStudentAnswer;
        const imageUrl = window.aiGradingState.currentImageUrl;

        const dialog = document.createElement('div');
        dialog.id = 'auto-submit-dialog';
        dialog.innerHTML = `
            <style>
                #auto-submit-dialog {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 999999;
                    background: white;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    padding: 30px;
                    width: 800px;
                    max-width: 90vw;
                    max-height: 90vh;
                    overflow-y: auto;
                }
                #auto-submit-dialog h2 {
                    margin: 0 0 20px 0;
                    color: #303133;
                    font-size: 24px;
                    text-align: center;
                }
                #auto-submit-dialog .content-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 20px;
                    margin: 20px 0;
                }
                #auto-submit-dialog .student-image {
                    border: 2px solid #DCDFE6;
                    border-radius: 8px;
                    overflow: hidden;
                }
                #auto-submit-dialog .student-image img {
                    width: 100%;
                    height: auto;
                    display: block;
                }
                #auto-submit-dialog .result-section {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                #auto-submit-dialog .info-box {
                    background: #f5f7fa;
                    padding: 15px;
                    border-radius: 8px;
                    border-left: 4px solid #409EFF;
                }
                #auto-submit-dialog .info-box h4 {
                    margin: 0 0 10px 0;
                    color: #303133;
                    font-size: 14px;
                    font-weight: bold;
                }
                #auto-submit-dialog .info-box .content {
                    color: #606266;
                    line-height: 1.6;
                    max-height: 150px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                }
                #auto-submit-dialog .score-display {
                    font-size: 48px;
                    font-weight: bold;
                    color: #409EFF;
                    text-align: center;
                    margin: 10px 0;
                }
                #auto-submit-dialog .countdown {
                    font-size: 18px;
                    color: #E6A23C;
                    margin: 20px 0;
                    font-weight: bold;
                    text-align: center;
                }
                #auto-submit-dialog .countdown.paused {
                    color: #F56C6C;
                }
                #auto-submit-dialog .buttons {
                    display: flex;
                    gap: 15px;
                    margin-top: 25px;
                }
                #auto-submit-dialog button {
                    flex: 1;
                    padding: 12px 24px;
                    border: none;
                    border-radius: 6px;
                    font-size: 16px;
                    font-weight: bold;
                    cursor: pointer;
                    transition: all 0.3s;
                }
                #auto-submit-dialog .confirm-btn {
                    background: #67C23A;
                    color: white;
                }
                #auto-submit-dialog .confirm-btn:hover {
                    background: #85ce61;
                }
                #auto-submit-dialog .cancel-btn {
                    background: #E6A23C;
                    color: white;
                }
                #auto-submit-dialog .cancel-btn:hover {
                    background: #ebb563;
                }
                #auto-submit-dialog .cancel-btn.exit-mode {
                    background: #F56C6C;
                }
                #auto-submit-dialog .cancel-btn.exit-mode:hover {
                    background: #f78989;
                }
                #auto-submit-dialog .overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    z-index: -1;
                }
            </style>
            <div class="overlay"></div>
            <h2>✅ AI评分完成</h2>

            <div class="content-grid">
                <div class="student-image">
                    <img src="${imageUrl}" alt="学生答卷">
                </div>

                <div class="result-section">
                    <div class="info-box">
                        <h4>📝 识别的学生答案</h4>
                        <div class="content">${studentAnswer}</div>
                    </div>

                    <div class="info-box">
                        <h4>💬 AI评语</h4>
                        <div class="content">${comment}</div>
                    </div>

                    <div class="info-box" style="border-left-color: #67C23A;">
                        <h4>🎯 最终得分</h4>
                        <div class="score-display">${score} 分</div>
                    </div>
                </div>
            </div>

            <div class="countdown" id="countdown-display">将在 <span id="countdown-number">5</span> 秒后自动提交</div>
            <div class="buttons">
                <button class="cancel-btn" id="pause-cancel-btn" onclick="window.toggleCountdownPause()">⏸️ 暂停倒计时</button>
                <button class="confirm-btn" onclick="window.confirmSubmit()">✓ 立即提交</button>
            </div>
        `;

        document.body.appendChild(dialog);

        let countdown = 5;
        const countdownElement = document.getElementById('countdown-number');
        const countdownDisplay = document.getElementById('countdown-display');

        const timer = setInterval(() => {
            // 如果暂停了，不减少倒计时
            if (window.aiGradingState.countdownPaused) {
                return;
            }

            countdown--;
            if (countdownElement) {
                countdownElement.textContent = countdown;
            }

            if (countdown <= 0) {
                clearInterval(timer);
                window.confirmSubmit();
            }
        }, 1000);

        window.autoSubmitTimer = timer;
        window.countdownDisplay = countdownDisplay;
    }

    // ========== 切换倒计时暂停状态 ==========
    window.toggleCountdownPause = function() {
        const pauseBtn = document.getElementById('pause-cancel-btn');
        const countdownDisplay = window.countdownDisplay;

        if (!window.aiGradingState.countdownPaused) {
            // 第一次点击：暂停倒计时
            window.aiGradingState.countdownPaused = true;
            pauseBtn.textContent = '✖ 取消并退出';
            pauseBtn.classList.add('exit-mode');

            if (countdownDisplay) {
                countdownDisplay.classList.add('paused');
                countdownDisplay.innerHTML = '⏸️ 倒计时已暂停';
            }

            console.log('⏸️ 倒计时已暂停');
        } else {
            // 第二次点击：取消并退出
            window.cancelAutoSubmit();
        }
    };

    // ========== 取消自动提交 ==========
    window.cancelAutoSubmit = function() {
        if (window.autoSubmitTimer) {
            clearInterval(window.autoSubmitTimer);
        }
        const dialog = document.getElementById('auto-submit-dialog');
        if (dialog) {
            dialog.remove();
        }

        // 完全停止AI阅卷
        window.aiGradingState.isRunning = false;
        window.aiGradingState.isPaused = false;
        window.aiGradingState.countdownPaused = false;

        const btn = document.querySelector('.ai-grade-btn');
        if (btn) {
            btn.textContent = '✨ 开始AI打分';
            btn.classList.remove('running', 'paused');
        }

        console.log('❌ 已取消并退出AI阅卷');
    };

    // ========== 确认提交（精确查找"提交分数"按钮）==========
    window.confirmSubmit = function() {
        if (window.autoSubmitTimer) {
            clearInterval(window.autoSubmitTimer);
        }

        const dialog = document.getElementById('auto-submit-dialog');
        if (dialog) {
            dialog.remove();
        }

        // 精确查找"提交分数"按钮
        console.log('🔍 正在查找提交按钮...');
        const submitBtn = Array.from(document.querySelectorAll('button')).find(btn => {
            const text = btn.textContent.trim();
            return text === '提交分数' || text.includes('提交分数');
        });

        if (submitBtn) {
            console.log('🚀 找到提交分数按钮:', submitBtn.textContent);
            submitBtn.click();

            setTimeout(() => {
                console.log('✅ 已点击提交分数按钮');

                // 如果没有暂停，继续下一题
                if (window.aiGradingState.isRunning && !window.aiGradingState.isPaused) {
                    setTimeout(() => {
                        startAutoGrading();
                    }, 1500);
                } else {
                    window.aiGradingState.isRunning = false;
                }
            }, 500);
        } else {
            console.warn('⚠️ 未找到"提交分数"按钮');
            console.log('📋 页面所有按钮:', Array.from(document.querySelectorAll('button')).map(b => b.textContent));
            alert('✅ 分数已填入，但未找到"提交分数"按钮，请手动提交！');
        }
    };

    // ========== 初始化主函数 ==========
    async function init() {
        console.log('🔍 检测批改页面...');
        console.log('📍 当前完整URL:', window.location.href);

        // 等待一段时间让SPA页面完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));

        const isMarkingPage = await detectMarkingPage();

        if (!isMarkingPage) {
            console.log('⚠️ 未检测到批改页面，脚本待机中...');
            console.log('💡 提示：如果您确定在批改页面，请尝试刷新页面');
            return;
        }

        console.log('✅ 检测到批改页面，初始化AI助手...');

        // 创建UI
        createMainButton();
        createSettingsPanel();

        // 检查是否需要自动恢复
        const autoResume = sessionStorage.getItem('ai-grading-auto-resume');
        if (autoResume === 'true') {
            sessionStorage.removeItem('ai-grading-auto-resume');

            console.log('🔄 检测到自动恢复标记，等待页面稳定后继续批改...');

            setTimeout(async () => {
                // 等待页面完全加载
                await detectMarkingPage();

                const config = GM_getValue('ai-grading-config');
                if (config && JSON.parse(config).apiKey) {
                    alert('✅ 页面已刷新，即将继续AI批改...');
                    toggleAutoGrading(); // 自动开始
                }
            }, 3000);
        } else {
            // 首次加载，显示欢迎提示
            const config = GM_getValue('ai-grading-config');
            if (!config || !JSON.parse(config).apiKey) {
                setTimeout(() => {
                    alert('👋 欢迎使用智学网AI打分助手！\n\n请先点击右上角配置面板，填写API密钥后即可使用。\n\n推荐使用 5+1 AI 服务，点击"获取API KEY"即可免费注册。');
                }, 1000);
            }
        }

        console.log('✅ AI打分助手初始化完成！');
        console.log('📌 使用说明：');
        console.log('1. 点击右侧配置面板填写API信息');
        console.log('2. 点击"开始AI打分"按钮进行自动评分');
        console.log('3. AI评分完成后将显示确认界面，5秒后自动提交');
        console.log('4. 倒计时期间可点击"暂停倒计时"，再次点击"取消并退出"完全停止');
        console.log('5. 点击"暂停AI打分"可以随时暂停（会中断当前请求）');
        console.log('6. 遇到403错误会自动刷新页面并继续批改');
    }

    // 启动脚本 - 使用多种方式确保加载
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // 页面已加载，延迟一下等待SPA路由完成
        setTimeout(init, 1000);
    }

    // 监听URL变化（适配SPA）
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            console.log('🔄 检测到URL变化:', url);
            // URL变化后重新初始化
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();
