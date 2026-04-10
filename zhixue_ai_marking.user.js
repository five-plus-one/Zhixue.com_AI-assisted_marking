// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      1.6.4
// @description  智学网AI自动批改助手，支持多套试卷方案管理、自动绑定切换、精准题号识别、未保存拦截、流式评分！
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

// ========== 封装 GM_xmlhttpRequest 支持标准 Response 接口 ==========
function gmFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
        const gmOptions = {
            method: options.method || 'GET',
            url: url,
            headers: options.headers || {},
            data: options.body,
            responseType: options.stream ? 'stream' : 'arraybuffer', 
            onload: function(res) {
                try {
                    const headers = new Headers();
                    if (res.responseHeaders) {
                        res.responseHeaders.trim().split('\n').forEach(line => {
                            const index = line.indexOf(':');
                            if (index > 0) {
                                headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
                            }
                        });
                    }
                    const response = new Response(res.response, {
                        status: res.status,
                        statusText: res.statusText,
                        headers: headers
                    });
                    resolve(response);
                } catch (e) {
                    reject(new Error('封装 Response 接口失败: ' + e.message));
                }
            },
            onerror: () => reject(new Error('网络请求被拦截，请检查跨域权限')),
            ontimeout: () => reject(new Error('请求超时'))
        };
        const request = GM_xmlhttpRequest(gmOptions);
        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                request.abort();
                reject(new Error('用户主动暂停'));
            });
        }
    });
}

(function() {
    'use strict';

    console.log('🚀 智学网AI打分助手(多方案+状态拦截版)加载中...');
    console.log(`📌 [诊断] 脚本版本: 1.6.4 | 浏览器: ${navigator.userAgent.match(/(Chrome|Firefox|Edge)\/[\d.]+/)?.[0] || '未知'} | 时间: ${new Date().toLocaleString()}`);

    // ========== 全局配置方案管理器 ==========
    const PresetManager = {
        data: null,
        init() {
            let saved = GM_getValue('ai-grading-presets');
            if (saved) {
                this.data = JSON.parse(saved);
            } else {
                let oldConfigStr = GM_getValue('ai-grading-config');
                let defaultCfg = oldConfigStr ? JSON.parse(oldConfigStr) : {
                    provider: '5plus1', endpoint: 'https://api.ai.five-plus-one.com/v1/chat/completions', model: 'doubao-seed-1-8-251228'
                };
                this.data = {
                    list: { "默认配置": defaultCfg },
                    active: "默认配置",
                    bindings: {} 
                };
                this.save();
            }
        },
        save() {
            GM_setValue('ai-grading-presets', JSON.stringify(this.data));
        },
        getCurrentConfig() {
            return this.data.list[this.data.active] || {};
        },
        getTaskIdentifier() {
            const baseUrl = window.location.pathname + window.location.hash.split('&_t=')[0];
            let questionIdentifier = '';
            try {
                const exactElement = document.querySelector('#currentTopicIndex');
                if (exactElement && exactElement.textContent) {
                    questionIdentifier = exactElement.textContent.trim();
                } else {
                    const titleElement = document.querySelector('.topic-title');
                    if (titleElement) {
                        questionIdentifier = titleElement.getAttribute('title') || titleElement.textContent.trim();
                    }
                }
            } catch (e) {}
            return baseUrl + (questionIdentifier ? '___' + questionIdentifier : '');
        }
    };
    PresetManager.init();

    // ========== 页面元素等待与检测 ==========
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

    async function detectMarkingPage() {
        console.log('🔎 [诊断] 开始检测批改页面元素...');
        try {
            const result = await Promise.race([
                waitForElement('div[name="topicImg"]').then(() => 'topicImg'),
                waitForElement('input[type="number"]').then(() => 'score-input'),
                waitForElement('button:contains("提交分数")').then(() => 'submit-btn')
            ]).catch(() => null);
            if (result) {
                console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
                return true;
            }

            await new Promise(resolve => setTimeout(resolve, 3000));
            const hasInput = document.querySelector('input[type="number"]') || document.querySelector('input[type="text"]');
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
    }

    window.aiGradingState = {
        isRunning: false, isPaused: false, currentStudentAnswer: '', currentImageUrls: [], 
        abortController: null, countdownPaused: false, autoRefreshOn403: true,
        unattendedMode: false, errorRetryCount: 0, maxRetries: 3,
        hasUnsavedChanges: false // 【新增】未保存状态标记
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
            
            /* 【新增】未保存拦截状态的按钮样式 */
            .ai-grade-btn.needs-save { background: linear-gradient(135deg, #909399 0%, #606266 100%) !important; box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important; animation: none !important; border: 2px solid #F56C6C;}
            
            @keyframes pulse-pause { 0%, 100% { box-shadow: 0 10px 30px rgba(245, 108, 108, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); transform: scale(1.02); } }
            @keyframes pulse-running { 0%, 100% { box-shadow: 0 10px 30px rgba(103, 194, 58, 0.6); } 50% { box-shadow: 0 10px 40px rgba(103, 194, 58, 0.9); } }
            @keyframes pulse-unattended { 0%, 100% { box-shadow: 0 10px 30px rgba(230, 162, 60, 0.6); } 50% { box-shadow: 0 10px 40px rgba(245, 108, 108, 0.9); } }
            .toast-notification { position: fixed; top: 30px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.8); color: white; padding: 12px 24px; border-radius: 30px; z-index: 100000; font-size: 14px; transition: opacity 0.5s; pointer-events: none;}
        `;
        document.head.appendChild(style);
        document.body.appendChild(btn);
    }

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 3000);
    }

    // ========== 未保存状态管理 (新增核心逻辑) ==========
    function markUnsavedChanges() {
        if (!window.aiGradingState.hasUnsavedChanges) {
            window.aiGradingState.hasUnsavedChanges = true;
            
            const btn = document.querySelector('.ai-grade-btn');
            if (btn && !window.aiGradingState.isRunning) {
                btn.textContent = '⚠️ 请先保存配置';
                btn.classList.add('needs-save');
            }
            
            const saveBtn = document.getElementById('save-config-btn');
            if (saveBtn) {
                saveBtn.classList.add('highlight-save');
                saveBtn.innerHTML = '💾 保存修改 <span style="font-size:12px;opacity:0.8;">(未保存)</span>';
            }
        }
    }

    function clearUnsavedChanges() {
        window.aiGradingState.hasUnsavedChanges = false;
        
        const btn = document.querySelector('.ai-grade-btn');
        if (btn && !window.aiGradingState.isRunning) {
            btn.textContent = '✨ 开始AI打分';
            btn.classList.remove('needs-save');
        }
        
        const saveBtn = document.getElementById('save-config-btn');
        if (saveBtn) {
            saveBtn.classList.remove('highlight-save');
            saveBtn.innerHTML = '💾 保存当前方案并启用';
        }
    }

    function toggleAutoGrading() {
        const btn = document.querySelector('.ai-grade-btn');
        btn.disabled = true;
        setTimeout(() => btn.disabled = false, 800); 

        // 【新增】拦截未保存状态
        if (window.aiGradingState.hasUnsavedChanges) {
            safeAlert('⚠️ 检测到配置已被修改，请先点击配置面板上的【保存】按钮！');
            const panel = document.getElementById('ai-grading-settings');
            if (panel) {
                panel.style.display = 'block';
                panel.classList.remove('minimized');
                const minimizeBtn = panel.querySelector('.minimize-btn');
                if (minimizeBtn) minimizeBtn.textContent = '−';
                
                // 给保存按钮来个明显的缩放动画提示
                const saveBtn = document.getElementById('save-config-btn');
                if (saveBtn) {
                    saveBtn.style.transform = 'scale(1.05)';
                    setTimeout(() => saveBtn.style.transform = 'scale(1)', 200);
                }
            }
            return;
        }

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

            const config = PresetManager.getCurrentConfig();
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
                .settings-body { padding: 20px; max-height: calc(90vh - 60px); overflow-y: auto; position: relative;}
                .form-section { margin-bottom: 25px; }
                .form-section h4 { color: #303133; font-size: 15px; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #409EFF; }
                .form-group { margin-bottom: 15px; }
                .form-group label { display: block; margin-bottom: 6px; color: #606266; font-size: 14px; font-weight: 500; }
                .form-group input, .form-group select, .form-group textarea { width: 100%; padding: 10px; border: 1px solid #DCDFE6; border-radius: 6px; box-sizing: border-box; }
                .checkbox-group { display: flex; align-items: center; gap: 10px; padding: 12px; background: #f5f7fa; border-radius: 6px; }
                .preset-controls { display: flex; gap: 8px; margin-bottom: 10px; }
                .preset-btn { background: #f0f2f5; border: 1px solid #DCDFE6; border-radius: 4px; padding: 0 12px; cursor: pointer; font-size: 13px; color: #606266; transition: all 0.2s;}
                .preset-btn:hover { border-color: #409EFF; color: #409EFF; }
                .preset-btn.danger:hover { border-color: #F56C6C; color: #F56C6C; }
                .unattended-warning { background: #FEF0F0; border: 1px solid #F56C6C; border-radius: 6px; padding: 12px; margin-top: 10px; font-size: 13px; color: #F56C6C; line-height: 1.6; }
                .api-key-link { display: inline-block; margin-top: 8px; padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; text-decoration: none; border-radius: 6px; font-size: 13px; }
                
                /* 【UI 调整】吸顶的保存按钮容器样式 */
                .save-btn-container { position: sticky; top: -20px; background: rgba(255,255,255,0.95); backdrop-filter: blur(5px); margin: -20px -20px 15px -20px; padding: 20px 20px 15px 20px; z-index: 10; border-bottom: 1px solid #EBEEF5; box-shadow: 0 4px 6px -6px #333; }
                .save-btn { width: 100%; padding: 12px; background: #409EFF; color: white; border: none; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; transition: all 0.3s;}
                .save-btn.highlight-save { background: #F56C6C !important; animation: pulse-save 1.5s infinite; }
                @keyframes pulse-save { 0%, 100% { box-shadow: 0 0 0 0 rgba(245, 108, 108, 0.4); } 50% { box-shadow: 0 0 0 10px rgba(245, 108, 108, 0); } }
            </style>
            <div class="settings-header">
                <h3>⚙️ AI打分配置</h3>
                <div class="header-buttons">
                    <button class="header-btn minimize-btn" title="最小化">−</button>
                    <button class="header-btn close-btn" title="关闭">×</button>
                </div>
            </div>
            <div class="settings-body">
                <div class="save-btn-container">
                    <button class="save-btn" id="save-config-btn">💾 保存当前方案并启用</button>
                </div>

                <div class="form-section" style="background:#ecf5ff; padding:15px; border-radius:8px; border:1px solid #b3d8ff;">
                    <h4 style="border-bottom:none; margin-bottom:10px; color:#409EFF;">📁 试卷配置管理</h4>
                    <div class="preset-controls">
                        <select id="preset-select" style="flex:1; padding:8px; border-radius:4px; border:1px solid #DCDFE6;"></select>
                        <button class="preset-btn" id="btn-new-preset">➕ 新建</button>
                        <button class="preset-btn danger" id="btn-del-preset">🗑️ 删除</button>
                    </div>
                    <div class="checkbox-group" style="background: white; padding: 8px;">
                        <input type="checkbox" id="bind-url-checkbox">
                        <label for="bind-url-checkbox" style="font-size:13px; margin:0;">🔗 绑定当前试题 (下次打开自动切换)</label>
                    </div>
                </div>

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
            </div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.minimize-btn').onclick = function() {
            panel.classList.toggle('minimized');
            this.textContent = panel.classList.contains('minimized') ? '+' : '−';
        };
        panel.querySelector('.close-btn').onclick = () => panel.style.display = 'none';
        
        panel.querySelector('#btn-new-preset').onclick = handleNewPreset;
        panel.querySelector('#btn-del-preset').onclick = handleDeletePreset;
        panel.querySelector('#preset-select').onchange = handlePresetChange;
        panel.querySelector('#save-config-btn').onclick = saveAISettings;

        const unattendedCheckbox = panel.querySelector('#unattended-mode');
        const unattendedWarning = panel.querySelector('#unattended-warning');
        unattendedCheckbox.addEventListener('change', function() {
            unattendedWarning.style.display = this.checked ? 'block' : 'none';
        });

        // 【新增】监听所有输入框和勾选框的变动，触发“未保存”状态
        const inputs = panel.querySelectorAll('input:not(#preset-select), textarea, select:not(#preset-select)');
        inputs.forEach(input => {
            input.addEventListener('input', markUnsavedChanges);
            input.addEventListener('change', markUnsavedChanges);
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

    // ========== 加载与切换方案 ==========
    function loadSettings() {
        const currentUrlId = PresetManager.getTaskIdentifier();
        
        if (PresetManager.data.bindings[currentUrlId] && PresetManager.data.list[PresetManager.data.bindings[currentUrlId]]) {
            PresetManager.data.active = PresetManager.data.bindings[currentUrlId];
            PresetManager.save();
        } else if (PresetManager.data.active !== "默认配置" && PresetManager.data.list["默认配置"]) {
            PresetManager.data.active = "默认配置";
            PresetManager.save();
        }

        renderPresetDropdown();
        fillFormFromActivePreset();
    }

    function renderPresetDropdown() {
        const select = document.getElementById('preset-select');
        select.innerHTML = '';
        for (const name in PresetManager.data.list) {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        }
        select.value = PresetManager.data.active;
    }

    function fillFormFromActivePreset() {
        const config = PresetManager.getCurrentConfig();
        const currentUrlId = PresetManager.getTaskIdentifier();

        document.getElementById('question-content').value = config.question || '';
        document.getElementById('standard-answer').value = config.answer || '';
        document.getElementById('grading-rubric').value = config.rubric || '';
        document.getElementById('ai-provider').value = config.provider || '5plus1';
        document.getElementById('api-endpoint').value = config.endpoint || 'https://api.ai.five-plus-one.com/v1/chat/completions';
        document.getElementById('api-key').value = config.apiKey || '';
        document.getElementById('model-name').value = config.model || 'doubao-seed-1-8-251228';
        document.getElementById('unattended-mode').checked = config.unattendedMode || false;
        
        document.getElementById('bind-url-checkbox').checked = (PresetManager.data.bindings[currentUrlId] === PresetManager.data.active);

        const unattendedWarning = document.getElementById('unattended-warning');
        unattendedWarning.style.display = config.unattendedMode ? 'block' : 'none';

        updateUIVisibility();
        
        // 成功加载已有配置后，清除未保存红灯警告
        clearUnsavedChanges();
    }

    function updateUIVisibility() {
        const provider = document.getElementById('ai-provider').value;
        document.getElementById('api-key-link-container').style.display = provider === '5plus1' ? 'block' : 'none';
    }

    // ========== 方案操作功能 ==========
    function handlePresetChange() {
        PresetManager.data.active = document.getElementById('preset-select').value;
        PresetManager.save();
        fillFormFromActivePreset();
    }

    function handleNewPreset() {
        const name = prompt("请输入新的配置方案名称 (例如: 语文作文)：");
        if (!name || !name.trim()) return;
        if (PresetManager.data.list[name]) {
            alert("该方案名称已存在！");
            return;
        }
        PresetManager.data.list[name] = { ...PresetManager.getCurrentConfig() };
        PresetManager.data.active = name;
        PresetManager.save();
        renderPresetDropdown();
        fillFormFromActivePreset();
        showToast(`✅ 新建方案【${name}】成功！`);
    }

    function handleDeletePreset() {
        const name = PresetManager.data.active;
        if (Object.keys(PresetManager.data.list).length <= 1) {
            alert("必须至少保留一个配置方案！");
            return;
        }
        if (confirm(`确定要删除配置方案【${name}】吗？`)) {
            delete PresetManager.data.list[name];
            for (const url in PresetManager.data.bindings) {
                if (PresetManager.data.bindings[url] === name) delete PresetManager.data.bindings[url];
            }
            PresetManager.data.active = Object.keys(PresetManager.data.list)[0];
            PresetManager.save();
            renderPresetDropdown();
            fillFormFromActivePreset();
            showToast("🗑️ 方案已删除");
        }
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

        const activeName = PresetManager.data.active;
        PresetManager.data.list[activeName] = config;

        const currentUrlId = PresetManager.getTaskIdentifier();
        const bindChecked = document.getElementById('bind-url-checkbox').checked;
        if (bindChecked) {
            PresetManager.data.bindings[currentUrlId] = activeName;
        } else {
            if (PresetManager.data.bindings[currentUrlId] === activeName) {
                delete PresetManager.data.bindings[currentUrlId];
            }
        }

        PresetManager.save();
        
        // 【核心】保存成功，清除红灯未保存状态
        clearUnsavedChanges();
        safeAlert(config.unattendedMode ? `✅ 【${activeName}】方案已保存，并开启无人值守！` : `✅ 【${activeName}】配置已保存！`);
        
        const panel = document.getElementById('ai-grading-settings');
        if (panel) {
            panel.classList.add('minimized');
            const minimizeBtn = panel.querySelector('.minimize-btn');
            if (minimizeBtn) minimizeBtn.textContent = '+';
        }
    }

    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'ai-provider') {
            updateUIVisibility();
            const presets = {
                '5plus1': { endpoint: 'https://api.ai.five-plus-one.com/v1/chat/completions', model: 'doubao-seed-1-8-251228' },
                'openai': { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' }
            };
            const preset = presets[e.target.value];
            if (preset) {
                document.getElementById('api-endpoint').value = preset.endpoint;
                document.getElementById('model-name').value = preset.model;
                // 自动预设输入后，也标记为未保存
                markUnsavedChanges();
            }
        }
    });

    // ========== 图片下载处理 ==========
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

    // ========== AI 核心请求 (直接用 GM_xmlhttpRequest onprogress 处理 SSE，兼容所有 Tampermonkey 版本) ==========
    function callAIGrading(base64DataArray, config, onStreamUpdate) {
        return new Promise((resolve, reject) => {
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

            let fullText = '';
            let buffer = '';
            let settled = false;
            let progressCallCount = 0;

            function parseSSEBuffer(chunk) {
                buffer += chunk;
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (let line of lines) {
                    line = line.trim();
                    if (!line.startsWith('data:')) continue;
                    const dataStr = line.substring(5).trim();
                    if (dataStr === '[DONE]' || !dataStr) continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta?.content || '';
                        if (delta) {
                            fullText += delta;
                            if (onStreamUpdate) onStreamUpdate(fullText);
                        }
                    } catch (e) {}
                }
            }

            const request = GM_xmlhttpRequest({
                method: 'POST',
                url: config.endpoint,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                data: JSON.stringify(requestBody),
                responseType: 'stream',
                onprogress: function(res) {
                    // 兼容两种情况：
                    // 1. 支持 stream 的 Tampermonkey：responseText 会逐步追加
                    // 2. 不支持 stream 的环境：onprogress 可能不触发，最终走 onload
                    if (res.responseText) {
                        progressCallCount++;
                        if (progressCallCount === 1) {
                            console.log('✅ [诊断] onprogress 已触发，当前环境支持流式输出');
                        }
                        // onprogress 每次给的是全量 responseText，重置后重新解析以保证流式面板实时更新
                        fullText = '';
                        buffer = '';
                        parseSSEBuffer(res.responseText);
                    }
                },
                onload: function(res) {
                    if (settled) return;
                    settled = true;
                    console.log(`✅ [诊断] onload 触发 — HTTP状态: ${res.status}, onprogress累计触发次数: ${progressCallCount}, 响应长度: ${(res.responseText || '').length} 字节`);
                    if (res.status < 200 || res.status >= 300) {
                        let errorMsg = res.responseText || res.statusText;
                        try {
                            const errObj = JSON.parse(res.responseText);
                            if (errObj.error?.message) errorMsg = errObj.error.message;
                        } catch (e) {}
                        console.error(`❌ [诊断] API返回错误: ${res.status} — ${errorMsg}`);
                        return reject(new Error(`API报错 (${res.status}): ${errorMsg}`));
                    }
                    // onload 时用完整 responseText 做最终解析（确保不遗漏任何内容）
                    fullText = '';
                    buffer = '';
                    parseSSEBuffer(res.responseText || '');
                    const parsed = parseAIResponseText(fullText);
                    console.log(`🧠 [诊断] AI响应解析结果 — 分数: ${parsed.score}, 识别答案长度: ${(parsed.studentAnswer || '').length}字, 原始文本长度: ${fullText.length}字`);
                    if (parsed.score === null) {
                        console.warn('⚠️ [诊断] 分数解析为 null，原始AI返回文本如下：\n' + fullText);
                    }
                    resolve(parsed);
                },
                onerror: function() {
                    if (settled) return;
                    settled = true;
                    console.error('❌ [诊断] GM_xmlhttpRequest onerror 触发 — 请求被拦截或网络断开');
                    reject(new Error('网络请求被拦截，请检查跨域权限'));
                },
                ontimeout: function() {
                    if (settled) return;
                    settled = true;
                    console.error('❌ [诊断] GM_xmlhttpRequest ontimeout 触发 — 请求超时');
                    reject(new Error('请求超时'));
                }
            });

            if (window.aiGradingState.abortController) {
                window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                    if (!settled) {
                        settled = true;
                        request.abort();
                        reject(new Error('用户主动暂停'));
                    }
                });
            }
        });
    }

    // ========== 主控流程 ==========
    async function startAutoGrading() {
        window.aiGradingState.abortController = new AbortController();
        console.log('▶️ [诊断] startAutoGrading 开始执行');

        try {
            const config = PresetManager.getCurrentConfig();
            if (!config.apiKey) {
                safeAlert('❌ 请先配置API密钥！');
                window.aiGradingState.isRunning = false;
                return;
            }

            console.log(`🔍 使用方案【${PresetManager.data.active}】查找答卷...`);
            const imgElements = document.querySelectorAll('div[name="topicImg"] img');
            console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imgElements.length}`);

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

            console.log(`📥 [诊断] 开始下载 ${imageUrls.length} 张图片...`);
            const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
            console.log(`✅ [诊断] 图片下载完成，各图片Base64大小: ${base64DataArray.map(b => Math.round(b.length / 1024) + 'KB').join(', ')}`);

            if (window.aiGradingState.isPaused) throw new Error('用户暂停');

            if (gradeBtn && !window.aiGradingState.unattendedMode) {
                gradeBtn.textContent = '⏳ AI分析中...';
                showStreamPanel();
            }

            console.log('🤖 [诊断] 开始调用AI接口...');
            const result = await callAIGrading(base64DataArray, config, (streamedText) => {
                if (!window.aiGradingState.unattendedMode) updateStreamPanel(streamedText);
            });

            hideStreamPanel();
            if (window.aiGradingState.isPaused) throw new Error('用户暂停');

            console.log(`📊 [诊断] callAIGrading 返回 — score: ${result.score}, comment长度: ${(result.comment || '').length}字`);
            if (result.score !== undefined && result.score !== null) {
                window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
                window.aiGradingState.errorRetryCount = 0;
                console.log(`✏️ [诊断] 准备填入分数: ${result.score}，调用 fillScore...`);
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
        
        // 恢复按钮的未保存样式(如果刚才有未保存变动)
        if (window.aiGradingState.hasUnsavedChanges) markUnsavedChanges();
    }

    // ========== 填充分数及弹窗 ==========
    function fillScore(score, comment) {
        const allInputs = document.querySelectorAll('input');
        console.log(`🔎 [诊断] fillScore 调用 — 分数: ${score}, 页面上所有input数量: ${allInputs.length}`);
        console.log(`🔎 [诊断] 各input类型: ${Array.from(allInputs).map(i => `type=${i.type} placeholder=${i.placeholder} name=${i.name}`).join(' | ')}`);

        const scoreInput = document.querySelector('input[type="number"]') ||
                           document.querySelector('input[placeholder*="分"]') ||
                           Array.from(document.querySelectorAll('input[type="text"]')).find(i => i.placeholder?.includes('分') || i.name?.includes('score'));

        if (scoreInput) {
            console.log(`✅ [诊断] 找到分数输入框: type=${scoreInput.type} placeholder=${scoreInput.placeholder} name=${scoreInput.name}`);
            scoreInput.value = score;
            scoreInput.focus();
            scoreInput.dispatchEvent(new Event('input', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('change', { bubbles: true }));
            scoreInput.dispatchEvent(new Event('blur', { bubbles: true }));
            console.log(`✅ [诊断] 分数已填入，准备弹出确认窗口...`);
            showAutoSubmitDialog(score, comment);
        } else {
            console.warn('⚠️ [诊断] 未找到分数输入框，将直接弹出确认窗口');
            safeAlert(`AI打分结果：\n分数：${score}\n请手动输入分数！`);
            showAutoSubmitDialog(score, comment);
        }
    }

    function showAutoSubmitDialog(score, comment) {
        const oldDialog = document.getElementById('auto-submit-dialog');
        if (oldDialog) oldDialog.remove();
        console.log(`🪟 [诊断] showAutoSubmitDialog 调用 — 分数: ${score}, 无人值守: ${window.aiGradingState.unattendedMode}`);

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
        console.log(`✅ [诊断] 弹窗已插入DOM，z-index: 999999，倒计时: ${countdownSeconds}秒`);

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

            const allBtns = Array.from(document.querySelectorAll('button'));
            console.log(`🔎 [诊断] confirmSubmitFn 执行 — 页面按钮总数: ${allBtns.length}，文字列表: ${allBtns.map(b => b.textContent.trim()).filter(t => t).join(' | ')}`);
            const submitBtn = allBtns.find(btn => btn.textContent.includes('提交分数'));
            if (submitBtn) {
                console.log(`✅ [诊断] 找到"提交分数"按钮，准备点击`);
                submitBtn.click();
                
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
                        } else if (checkTimes > 50) { 
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
                console.warn(`⚠️ [诊断] 未找到"提交分数"按钮，无法自动提交`);
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

    // URL 及 题号变化监听器 (轻量级轮询)
    let lastUrlId = PresetManager.getTaskIdentifier();
    setInterval(() => {
        const currentUrlId = PresetManager.getTaskIdentifier();
        if (currentUrlId !== lastUrlId) {
            lastUrlId = currentUrlId;
            
            if (!window.aiGradingState.isRunning) {
                const boundPreset = PresetManager.data.bindings[currentUrlId];
                
                if (boundPreset && PresetManager.data.list[boundPreset]) {
                    PresetManager.data.active = boundPreset;
                    PresetManager.save();
                    showToast(`✨ 检测到新试题，已自动切换至【${PresetManager.data.active}】方案`);
                } else if (PresetManager.data.active !== "默认配置" && PresetManager.data.list["默认配置"]) {
                    PresetManager.data.active = "默认配置";
                    PresetManager.save();
                    showToast(`📝 未找到当前题目的专属方案，已恢复为【默认配置】`);
                }

                const select = document.getElementById('preset-select');
                if (select) {
                    select.value = PresetManager.data.active;
                    select.dispatchEvent(new Event('change'));
                }
            }
            setTimeout(init, 1000);
        }
    }, 1000);

})();