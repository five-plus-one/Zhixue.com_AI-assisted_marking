// ========== 创建配置面板 ==========
function createSettingsPanel() {
    if (document.getElementById('ai-grading-settings')) return;
    const panel = document.createElement('div');
    panel.id = 'ai-grading-settings';
    panel.innerHTML = `
        <style>
            #ai-grading-settings { 
                position: fixed; top: 20px; right: 20px; width: 420px; max-height: 90vh; overflow-y: auto; 
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 0, 0, 0.08); border-radius: 16px; 
                box-shadow: 0 16px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04); 
                z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                transition: height 0.3s cubic-bezier(0.16, 1, 0.3, 1), transform 0.3s;
            }
            #ai-grading-settings.minimized .settings-body { display: none; }
            #ai-grading-settings.minimized { width: 420px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
            .settings-header { 
                background: transparent; color: #1a1a1a; padding: 20px 24px 16px; 
                display: flex; justify-content: space-between; align-items: center; cursor: move;
                border-bottom: 1px solid rgba(0,0,0,0.06);
            }
            .settings-header h3 { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: 0.5px; }
            .header-buttons { display: flex; gap: 8px; }
            .header-btn { 
                background: transparent; border: 1px solid rgba(0,0,0,0.1); color: #666; 
                width: 26px; height: 26px; border-radius: 6px; cursor: pointer; transition: all 0.2s;
                display: flex; justify-content: center; align-items: center; font-size: 14px;
            }
            .header-btn:hover { background: rgba(0,0,0,0.04); color: #1a1a1a; }
            .settings-body { padding: 0; position: relative; }
            .form-section { padding: 20px 24px; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .form-section:last-child { border-bottom: none; }
            .form-section.highlight { background: rgba(0, 82, 255, 0.02); }
            .form-section h4 { 
                color: #1a1a1a; font-size: 13px; font-weight: 600; margin: 0 0 16px 0; 
                text-transform: uppercase; letter-spacing: 0.5px; 
            }
            .form-group { margin-bottom: 16px; }
            .form-group:last-child { margin-bottom: 0; }
            .form-group label { display: block; margin-bottom: 8px; color: #666; font-size: 12px; font-weight: 500; }
            .form-group input, .form-group select, .form-group textarea { 
                width: 100%; padding: 10px 12px; 
                background: rgba(0,0,0,0.02);
                border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box; 
                font-family: inherit; font-size: 13px; color: #1a1a1a; transition: all 0.2s;
            }
            .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
                outline: none; border-color: #0052FF; background: #fff; box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.1);
            }
            .form-group textarea { min-height: 80px; resize: vertical; }
            .checkbox-group { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .checkbox-group input[type="checkbox"] { accent-color: #0052FF; width: 16px; height: 16px; }
            .checkbox-group label { margin: 0; font-size: 13px; color: #1a1a1a; font-weight: 500; }
            .preset-controls { display: flex; gap: 8px; margin-bottom: 16px; }
            .preset-controls select { 
                flex: 1; padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1); 
                background: #fdfdfd; font-size: 13px;
            }
            .preset-btn { 
                background: transparent; border: 1px solid rgba(0,0,0,0.1); border-radius: 6px; 
                padding: 0 12px; cursor: pointer; font-size: 12px; font-weight: 500; color: #444; transition: all 0.2s;
            }
            .preset-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }
            .preset-btn.danger:hover { color: #D93025; border-color: rgba(217,48,37,0.3); background: rgba(217,48,37,0.04); }
            .unattended-warning {
                background: rgba(245, 108, 108, 0.05); border-left: 3px solid #F56C6C; border-radius: 0 6px 6px 0;
                padding: 10px 14px; font-size: 12px; color: #D93025; line-height: 1.5; margin-top: 8px;
            }
            .mode-segmented {
                display: flex; gap: 0; background: rgba(0,0,0,0.04); border-radius: 10px; padding: 3px; position: relative;
            }
            .mode-segmented input[type="radio"] { display: none; }
            .mode-segmented label {
                flex: 1; text-align: center; padding: 10px 0; font-size: 13px; font-weight: 500;
                color: #666; cursor: pointer; border-radius: 8px; transition: all 0.25s; position: relative; z-index: 1;
            }
            .mode-segmented input[type="radio"]:checked + label {
                background: #1d1d1f; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            }
            .mode-segmented input[value="trial"]:checked + label { background: #7c3aed; }
            .mode-segmented input[value="unattended"]:checked + label { background: #D93025; }
            .mode-desc {
                font-size: 12px; color: #86868b; line-height: 1.5; margin-top: 10px; min-height: 36px;
            }
            .mode-desc.trial-desc { color: #7c3aed; }
            .mode-desc.unattended-desc { color: #D93025; }
            .history-btn {
                width: 100%; padding: 10px; background: transparent; color: #666;
                border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
                font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s;
                display: flex; align-items: center; justify-content: center; gap: 6px;
            }
            .history-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }
            .api-key-link { display: inline-block; margin-top: 8px; font-size: 12px; color: #0052FF; text-decoration: none; font-weight: 500; }
            .api-key-link:hover { text-decoration: underline; }
            .save-btn-container { 
                position: sticky; top: 0; z-index: 10;
                background: rgba(255,255,255,0.95); backdrop-filter: blur(10px); 
                padding: 16px 24px; border-bottom: 1px solid rgba(0,0,0,0.06); 
                box-shadow: 0 4px 12px rgba(0,0,0,0.02);
            }
            .save-btn { 
                width: 100%; padding: 12px; background: #1a1a1a; color: white; border: none; 
                border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s;
            }
            .save-btn:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            .save-btn.highlight-save { background: #D93025; color: white; }
            .save-btn.highlight-save:hover { background: #B3261E; }
        </style>
        <div class="settings-header">
            <h3>批改配置</h3>
            <div class="header-buttons">
                <button class="header-btn minimize-btn" title="Toggle">−</button>
                <button class="header-btn close-btn" title="Close">×</button>
            </div>
        </div>
        <div class="settings-body">
            <div class="save-btn-container">
                <button class="save-btn" id="save-config-btn">保存并启用</button>
            </div>

            <div class="form-section highlight">
                <h4>场景方案</h4>
                <div class="preset-controls">
                    <select id="preset-select"></select>
                    <button class="preset-btn" id="btn-new-preset">新建</button>
                    <button class="preset-btn danger" id="btn-del-preset">删除</button>
                </div>
                <div class="checkbox-group">
                    <input type="checkbox" id="bind-url-checkbox">
                    <label for="bind-url-checkbox">绑定至当前试题</label>
                </div>
            </div>

            <div class="form-section">
                <h4>运行模式</h4>
                <div class="mode-segmented">
                    <input type="radio" name="grading-mode" value="normal" id="mode-normal">
                    <label for="mode-normal">普通模式</label>
                    <input type="radio" name="grading-mode" value="trial" id="mode-trial">
                    <label for="mode-trial">试改模式</label>
                    <input type="radio" name="grading-mode" value="unattended" id="mode-unattended">
                    <label for="mode-unattended">无人模式</label>
                </div>
                <div class="mode-desc" id="mode-desc">每批改一份，等待教师确认后提交。</div>
            </div>
            <div class="form-section">
                <h4>批改上下文</h4>
                <div class="form-group"><label>题目内容</label><textarea id="question-content"></textarea></div>
                <div class="form-group"><label>参考答案</label><textarea id="standard-answer"></textarea></div>
                <div class="form-group"><label>采分标准</label><textarea id="grading-rubric"></textarea></div>
            </div>
            <div class="form-section">
                <h4>分小题评分</h4>
                <div class="checkbox-group">
                    <input type="checkbox" id="enable-sub-questions">
                    <label for="enable-sub-questions">启用分小题评分</label>
                </div>
                <div id="sub-questions-container" style="display:none;">
                    <div id="sub-questions-list"></div>
                    <button class="preset-btn" id="btn-add-sub-question" style="width:100%;margin-top:8px;padding:8px;">+ 添加小题</button>
                </div>
            </div>
            <div class="form-section">
                <h4>AI 模型与算力</h4>
                <div class="form-group">
                    <label>服务提供商</label>
                    <div class="preset-controls">
                        <select id="ai-provider"></select>
                        <button class="preset-btn" id="btn-new-provider">新建</button>
                        <button class="preset-btn danger" id="btn-del-provider">删除</button>
                    </div>
                    <div id="api-key-link-container" style="display:none;"><a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">获取访问凭证</a></div>
                </div>
                <div class="form-group"><label>服务网关 URL</label><input type="text" id="api-endpoint"></div>
                <div class="form-group"><label>通信密钥 (Token) *</label><input type="password" id="api-key"></div>
                <div class="form-group"><label>调用模型 ID</label><input type="text" id="model-name"></div>
            </div>
            <div class="form-section">
                <h4>配置管理</h4>
                <div style="display:flex;gap:8px;">
                    <button class="history-btn" id="btn-export-config" style="flex:1;">导出配置</button>
                    <button class="history-btn" id="btn-import-config" style="flex:1;">导入配置</button>
                </div>
                <input type="file" id="import-config-file" accept=".json" style="display:none;">
            </div>
            <div class="form-section" style="padding-bottom:20px;">
                <div style="display:flex;gap:8px;">
                    <button class="history-btn" id="btn-history" style="flex:1;">评阅历史</button>
                    <button class="history-btn" id="btn-check-update" style="flex:1;">检查更新</button>
                </div>
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
    panel.querySelector('#btn-history').onclick = () => showHistoryPanel();
    panel.querySelector('#btn-check-update').onclick = function() { checkForUpdate(true, this); };
    panel.querySelector('#btn-new-provider').onclick = handleNewProvider;
    panel.querySelector('#btn-del-provider').onclick = handleDeleteProvider;
    panel.querySelector('#ai-provider').onchange = handleProviderChange;

    // 配置导出
    panel.querySelector('#btn-export-config').onclick = () => {
        const exportData = {
            version: SCRIPT_CONFIG.VERSION,
            timestamp: new Date().toISOString(),
            presets: PresetManager.data,
            providers: ProviderManager.data,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().slice(0, 10);
        a.download = `ai-marker-config_${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出');
    };
    // 配置导入
    const fileInput = panel.querySelector('#import-config-file');
    panel.querySelector('#btn-import-config').onclick = () => fileInput.click();
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.presets || !data.presets.list) throw new Error('无效的配置文件');
            await showConfirmModal(`确定要导入配置吗？\n文件：${file.name}\n将覆盖当前所有方案和服务商设置。`);
            PresetManager.data = data.presets;
            PresetManager.save();
            if (data.providers) {
                ProviderManager.data = data.providers;
                ProviderManager.save();
            }
            renderPresetDropdown();
            fillFormFromActivePreset();
            showToast('配置导入成功');
        } catch (err) {
            if (err) showToast('导入失败：' + (err.message || '文件格式错误'));
        }
        fileInput.value = '';
    };

    const modeDescs = {
        normal: '每批改一份，5秒自动提交或手动确认。支持分数纠错。',
        trial: '试改模式：每次批改后暂停，教师确认分数后才提交。支持分数纠错和提示词优化。',
        unattended: '无人值守：错误时自动重试，静默运行，分析完成后1秒自动跳转提交。'
    };
    const modeDescClasses = { normal: '', trial: 'trial-desc', unattended: 'unattended-desc' };
    panel.querySelectorAll('input[name="grading-mode"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const desc = panel.querySelector('#mode-desc');
            desc.textContent = modeDescs[this.value];
            desc.className = 'mode-desc ' + (modeDescClasses[this.value] || '');
            markUnsavedChanges();
        });
    });

    const inputs = panel.querySelectorAll('input:not([name="grading-mode"]), textarea, select:not(#preset-select)');
    inputs.forEach(input => {
        input.addEventListener('input', markUnsavedChanges);
        input.addEventListener('change', markUnsavedChanges);
    });

    // 分小题评分交互
    const subToggle = panel.querySelector('#enable-sub-questions');
    const subContainer = panel.querySelector('#sub-questions-container');
    const subList = panel.querySelector('#sub-questions-list');
    subToggle.addEventListener('change', () => {
        if (subToggle.checked) {
            const adapter = window.__AI_MARKER_ADAPTER__;
            if (adapter && typeof adapter.detectSubQuestions === 'function') {
                const detected = adapter.detectSubQuestions();
                if (detected.length > 0) {
                    subContainer.style.display = 'block';
                    subList.innerHTML = '';
                    detected.forEach(sq => {
                        addSubQuestionItem({ label: sq.label, maxScore: '', answer: '', rubric: '' });
                    });
                    showToast(`已自动识别 ${detected.length} 个小题`);
                    markUnsavedChanges();
                    return;
                }
            }
            // 不支持的平台：提示并取消勾选
            subToggle.checked = false;
            showToast('当前平台暂不支持分小题给分');
            return;
        }
        subContainer.style.display = 'none';
        markUnsavedChanges();
    });
    panel.querySelector('#btn-add-sub-question').onclick = () => addSubQuestionItem();

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

    // 同步服务商下拉（兼容旧格式）
    renderProviderDropdown();
    const providerMigration = { '5plus1': '5plus1官方', 'openai': 'OpenAI兼容' };
    const providerName = providerMigration[config.provider] || config.provider || '5plus1官方';
    if (ProviderManager.data.list[providerName]) {
        ProviderManager.data.active = providerName;
        ProviderManager.save();
        document.getElementById('ai-provider').value = providerName;
    }
    document.getElementById('api-endpoint').value = config.endpoint || SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    document.getElementById('api-key').value = config.apiKey || '';
    document.getElementById('model-name').value = config.model || SCRIPT_CONFIG.DEFAULT_MODEL;

    const gradingMode = config.gradingMode || 'normal';
    const modeRadio = document.querySelector(`input[name="grading-mode"][value="${gradingMode}"]`);
    if (modeRadio) modeRadio.checked = true;
    const modeDescs = {
        normal: '每批改一份，5秒自动提交或手动确认。支持分数纠错。',
        trial: '试改模式：每次批改后暂停，教师确认分数后才提交。支持分数纠错和提示词优化。',
        unattended: '无人值守：错误时自动重试，静默运行，分析完成后1秒自动跳转提交。'
    };
    const modeDescClasses = { normal: '', trial: 'trial-desc', unattended: 'unattended-desc' };
    const desc = document.getElementById('mode-desc');
    if (desc) { desc.textContent = modeDescs[gradingMode]; desc.className = 'mode-desc ' + (modeDescClasses[gradingMode] || ''); }

    document.getElementById('bind-url-checkbox').checked = (PresetManager.data.bindings[currentUrlId] === PresetManager.data.active);

    // 加载分小题配置
    const subToggle = document.getElementById('enable-sub-questions');
    const subContainer = document.getElementById('sub-questions-container');
    const subList = document.getElementById('sub-questions-list');
    subList.innerHTML = '';
    const subQuestions = config.subQuestions || [];
    if (subQuestions.length > 0) {
        // 已有保存的小题配置，直接恢复
        subToggle.checked = true;
        subContainer.style.display = 'block';
        subQuestions.forEach(sq => addSubQuestionItem(sq));
    } else {
        // 无保存配置，尝试从 DOM 自动检测
        const adapter = window.__AI_MARKER_ADAPTER__;
        if (adapter && typeof adapter.detectSubQuestions === 'function') {
            const detected = adapter.detectSubQuestions();
            if (detected.length > 0) {
                subToggle.checked = true;
                subContainer.style.display = 'block';
                detected.forEach(sq => addSubQuestionItem({ label: sq.label, maxScore: '', answer: '', rubric: '' }));
            } else {
                subToggle.checked = false;
                subContainer.style.display = 'none';
            }
        } else {
            subToggle.checked = false;
            subContainer.style.display = 'none';
        }
    }

    updateUIVisibility();
    clearUnsavedChanges();
}

function addSubQuestionItem(data) {
    const list = document.getElementById('sub-questions-list');
    const index = list.children.length;
    const item = document.createElement('div');
    item.className = 'sub-question-item';
    item.style.cssText = 'padding:12px;margin-bottom:8px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:8px;';
    item.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <input type="text" class="sq-label" placeholder="标签 (如: 第1题(a))" value="${data?.label || ''}" style="flex:1;padding:6px 8px;border:1px solid rgba(0,0,0,0.08);border-radius:6px;font-size:12px;">
            <button class="preset-btn danger sq-del-btn" style="margin-left:8px;padding:4px 8px;font-size:11px;">删除</button>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
            <div style="flex:1;"><label style="font-size:11px;color:#86868b;display:block;margin-bottom:4px;">满分</label><input type="number" class="sq-max-score" placeholder="分" value="${data?.maxScore || ''}" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.08);border-radius:6px;font-size:12px;box-sizing:border-box;"></div>
        </div>
        <div style="margin-bottom:8px;"><label style="font-size:11px;color:#86868b;display:block;margin-bottom:4px;">参考答案</label><textarea class="sq-answer" placeholder="该小题的参考答案" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.08);border-radius:6px;font-size:12px;min-height:50px;resize:vertical;box-sizing:border-box;font-family:inherit;">${data?.answer || ''}</textarea></div>
        <div><label style="font-size:11px;color:#86868b;display:block;margin-bottom:4px;">评分标准</label><textarea class="sq-rubric" placeholder="该小题的评分标准" style="width:100%;padding:6px 8px;border:1px solid rgba(0,0,0,0.08);border-radius:6px;font-size:12px;min-height:50px;resize:vertical;box-sizing:border-box;font-family:inherit;">${data?.rubric || ''}</textarea></div>
    `;
    item.querySelector('.sq-del-btn').onclick = () => { item.remove(); markUnsavedChanges(); };
    item.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('input', markUnsavedChanges);
        el.addEventListener('change', markUnsavedChanges);
    });
    list.appendChild(item);
}

function getSubQuestionsFromForm() {
    const enabled = document.getElementById('enable-sub-questions')?.checked;
    if (!enabled) return [];
    const items = document.querySelectorAll('#sub-questions-list .sub-question-item');
    const subQuestions = [];
    items.forEach((item, i) => {
        const label = item.querySelector('.sq-label')?.value?.trim();
        const maxScore = parseFloat(item.querySelector('.sq-max-score')?.value);
        const answer = item.querySelector('.sq-answer')?.value?.trim();
        const rubric = item.querySelector('.sq-rubric')?.value?.trim();
        if (label) {
            subQuestions.push({
                id: String.fromCharCode(97 + i),
                label,
                answer: answer || '',
                rubric: rubric || '',
                maxScore: isNaN(maxScore) ? 0 : maxScore
            });
        }
    });
    return subQuestions;
}

function updateUIVisibility() {
    const provider = document.getElementById('ai-provider').value;
    document.getElementById('api-key-link-container').style.display = provider === '5plus1官方' ? 'block' : 'none';
}

// ========== 方案操作功能 ==========
function handlePresetChange() {
    PresetManager.data.active = document.getElementById('preset-select').value;
    PresetManager.save();
    fillFormFromActivePreset();
}

async function handleNewPreset() {
    const name = await showPromptModal("请输入新的配置方案名称 (例如: 语文作文)：");
    if (!name || !name.trim()) return;
    if (PresetManager.data.list[name]) {
        showAlertModal("该方案名称已存在！");
        return;
    }
    PresetManager.data.list[name] = { ...PresetManager.getCurrentConfig() };
    PresetManager.data.active = name;
    PresetManager.save();
    renderPresetDropdown();
    fillFormFromActivePreset();
    showToast(`新方案「${name}」创建成功`);
}

async function handleDeletePreset() {
    const name = PresetManager.data.active;
    if (Object.keys(PresetManager.data.list).length <= 1) {
        showAlertModal("必须至少保留一个配置方案！");
        return;
    }
    if (await showConfirmModal(`确定要删除配置方案【${name}】吗？`)) {
        delete PresetManager.data.list[name];
        for (const url in PresetManager.data.bindings) {
            if (PresetManager.data.bindings[url] === name) delete PresetManager.data.bindings[url];
        }
        PresetManager.data.active = Object.keys(PresetManager.data.list)[0];
        PresetManager.save();
        renderPresetDropdown();
        fillFormFromActivePreset();
        showToast(`方案「${name}」已删除`);
    }
}

function renderProviderDropdown() {
    const select = document.getElementById('ai-provider');
    if (!select) return;
    select.innerHTML = '';
    for (const name in ProviderManager.data.list) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    select.value = ProviderManager.data.active;
}

function handleProviderChange() {
    const name = document.getElementById('ai-provider').value;
    ProviderManager.data.active = name;
    ProviderManager.save();
    const provider = ProviderManager.getCurrent();
    if (provider.endpoint) document.getElementById('api-endpoint').value = provider.endpoint;
    if (provider.model) document.getElementById('model-name').value = provider.model;
    if (provider.apiKey !== undefined) document.getElementById('api-key').value = provider.apiKey;
    document.getElementById('api-key-link-container').style.display = name === '5plus1官方' ? 'block' : 'none';
    markUnsavedChanges();
}

async function handleNewProvider() {
    const name = await showPromptModal("请输入新的服务商名称 (例如: 我的代理)：");
    if (!name || !name.trim()) return;
    if (ProviderManager.data.list[name]) {
        showAlertModal("该服务商名称已存在！");
        return;
    }
    ProviderManager.data.list[name] = {
        endpoint: document.getElementById('api-endpoint').value,
        model: document.getElementById('model-name').value,
        apiKey: document.getElementById('api-key').value
    };
    ProviderManager.data.active = name;
    ProviderManager.save();
    renderProviderDropdown();
    document.getElementById('api-key-link-container').style.display = 'none';
    showToast(`服务商「${name}」创建成功`);
}

async function handleDeleteProvider() {
    const name = ProviderManager.data.active;
    if (Object.keys(ProviderManager.data.list).length <= 1) {
        showAlertModal("必须至少保留一个服务商！");
        return;
    }
    if (await showConfirmModal(`确定要删除服务商【${name}】吗？`)) {
        delete ProviderManager.data.list[name];
        ProviderManager.data.active = Object.keys(ProviderManager.data.list)[0];
        ProviderManager.save();
        renderProviderDropdown();
        handleProviderChange();
        showToast(`服务商「${name}」已删除`);
    }
}

function saveAISettings() {
    const checkedMode = document.querySelector('input[name="grading-mode"]:checked');
    const gradingMode = checkedMode ? checkedMode.value : 'normal';

    const providerName = document.getElementById('ai-provider').value;
    const subQuestions = getSubQuestionsFromForm();
    const config = {
        question: document.getElementById('question-content').value,
        answer: document.getElementById('standard-answer').value,
        rubric: document.getElementById('grading-rubric').value,
        provider: providerName,
        endpoint: document.getElementById('api-endpoint').value,
        apiKey: document.getElementById('api-key').value,
        model: document.getElementById('model-name').value,
        gradingMode,
        subQuestions: subQuestions.length > 0 ? subQuestions : undefined
    };

    // 同步更新服务商配置
    if (ProviderManager.data.list[providerName]) {
        ProviderManager.data.list[providerName].endpoint = config.endpoint;
        ProviderManager.data.list[providerName].model = config.model;
        ProviderManager.data.list[providerName].apiKey = config.apiKey;
        ProviderManager.data.active = providerName;
        ProviderManager.save();
    }

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
    const modeLabel = { normal: '普通模式', trial: '试改模式', unattended: '无人模式' }[gradingMode];
    safeAlert(`「${activeName}」已保存 — ${modeLabel}`);

    const panel = document.getElementById('ai-grading-settings');
    if (panel) {
        panel.classList.add('minimized');
        const minimizeBtn = panel.querySelector('.minimize-btn');
        if (minimizeBtn) minimizeBtn.textContent = '+';
    }
}
