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
    document.getElementById('api-endpoint').value = config.endpoint || SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    document.getElementById('api-key').value = config.apiKey || '';
    document.getElementById('model-name').value = config.model || SCRIPT_CONFIG.DEFAULT_MODEL;
    document.getElementById('unattended-mode').checked = config.unattendedMode || false;

    document.getElementById('bind-url-checkbox').checked = (PresetManager.data.bindings[currentUrlId] === PresetManager.data.active);

    const unattendedWarning = document.getElementById('unattended-warning');
    unattendedWarning.style.display = config.unattendedMode ? 'block' : 'none';

    updateUIVisibility();
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
    clearUnsavedChanges();
    safeAlert(config.unattendedMode ? `✅ 【${activeName}】方案已保存，并开启无人值守！` : `✅ 【${activeName}】配置已保存！`);

    const panel = document.getElementById('ai-grading-settings');
    if (panel) {
        panel.classList.add('minimized');
        const minimizeBtn = panel.querySelector('.minimize-btn');
        if (minimizeBtn) minimizeBtn.textContent = '+';
    }
}

// 监听 api-provider 下拉框变化，自动填充端点和模型
document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'ai-provider') {
        updateUIVisibility();
        const presets = {
            '5plus1': { endpoint: SCRIPT_CONFIG.DEFAULT_ENDPOINT, model: SCRIPT_CONFIG.DEFAULT_MODEL },
            'openai': { endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o' }
        };
        const preset = presets[e.target.value];
        if (preset) {
            document.getElementById('api-endpoint').value = preset.endpoint;
            document.getElementById('model-name').value = preset.model;
            markUnsavedChanges();
        }
    }
});
