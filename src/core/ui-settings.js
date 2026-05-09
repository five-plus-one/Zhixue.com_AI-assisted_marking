// ========== 创建配置面板（侧边栏） ==========
function createSettingsPanel() {
    if (document.getElementById('ai-grading-settings')) return;
    if (document.getElementById('ai-settings-overlay')) return;

    // 遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'ai-settings-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.25); backdrop-filter: blur(4px);
        z-index: 9999; opacity: 0; pointer-events: none;
        transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'ai-grading-settings';
    panel.innerHTML = `
        <style>
            #ai-grading-settings {
                position: fixed; top: 0; right: 0; height: 100vh; width: 440px;
                background: rgba(255, 255, 255, 0.96);
                backdrop-filter: blur(24px) saturate(180%); -webkit-backdrop-filter: blur(24px) saturate(180%);
                border-left: 1px solid rgba(0,0,0,0.08);
                box-shadow: -8px 0 40px rgba(0,0,0,0.08);
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                display: flex; flex-direction: column;
                transform: translateX(100%);
                transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            }
            #ai-grading-settings.open { transform: translateX(0); }
            #ai-grading-settings.minimized .settings-body { display: none; }
            #ai-grading-settings.minimized .sidebar-footer { display: none; }

            .sidebar-header {
                padding: 20px 24px 16px;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid rgba(0,0,0,0.06);
                flex-shrink: 0;
            }
            .sidebar-header h3 { margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a; letter-spacing: 0.3px; }
            .header-buttons { display: flex; gap: 6px; }
            .header-btn {
                background: transparent; border: 1px solid rgba(0,0,0,0.08); color: #666;
                width: 28px; height: 28px; border-radius: 8px; cursor: pointer; transition: all 0.2s;
                display: flex; justify-content: center; align-items: center; font-size: 15px;
            }
            .header-btn:hover { background: rgba(0,0,0,0.04); color: #1a1a1a; border-color: rgba(0,0,0,0.15); }

            .settings-body {
                flex: 1; overflow-y: auto; overflow-x: hidden;
                scrollbar-width: thin; scrollbar-color: rgba(0,0,0,0.12) transparent;
            }
            .settings-body::-webkit-scrollbar { width: 5px; }
            .settings-body::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 4px; }

            .save-btn-container {
                position: sticky; top: 0; z-index: 10;
                background: rgba(255,255,255,0.92); backdrop-filter: blur(12px);
                padding: 12px 24px; border-bottom: 1px solid rgba(0,0,0,0.05);
            }
            .save-btn {
                width: 100%; padding: 11px 16px; background: #1a1a1a; color: white; border: none;
                border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
                letter-spacing: 0.3px;
            }
            .save-btn:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
            .save-btn.highlight-save { background: #D93025; }
            .save-btn.highlight-save:hover { background: #B3261E; }

            /* 标签页 */
            .settings-tabs {
                display: flex; border-bottom: 1px solid rgba(0,0,0,0.06);
                background: rgba(0,0,0,0.01);
            }
            .settings-tab {
                flex: 1; padding: 12px 0; text-align: center; font-size: 13px; font-weight: 500;
                color: #86868b; cursor: pointer; transition: all 0.2s; border-bottom: 2px solid transparent;
                position: relative;
            }
            .settings-tab:hover { color: #1a1a1a; background: rgba(0,0,0,0.02); }
            .settings-tab.active { color: #1a1a1a; border-bottom-color: #1a1a1a; }
            .tab-content { display: none; }
            .tab-content.active { display: block; }

            /* 分组标题 */
            .group-title {
                padding: 18px 24px 6px; font-size: 11px; font-weight: 700; color: #aaa;
                text-transform: uppercase; letter-spacing: 1.2px;
                display: flex; align-items: center; gap: 8px;
            }
            .group-title::after {
                content: ''; flex: 1; height: 1px; background: rgba(0,0,0,0.06);
            }
            .group-title .config-warn {
                display: inline-flex; align-items: center; gap: 3px;
                font-size: 10px; font-weight: 600; color: #D93025; letter-spacing: 0;
                text-transform: none; background: rgba(217,48,37,0.08); padding: 2px 7px; border-radius: 4px;
            }

            /* 手风琴分组 */
            .form-section {
                border-bottom: 1px solid rgba(0,0,0,0.04);
            }
            .form-section.highlight .section-header { background: rgba(0, 82, 255, 0.02); }
            .section-header {
                padding: 14px 24px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;
                transition: background 0.15s; user-select: none;
            }
            .section-header:hover { background: rgba(0,0,0,0.02); }
            .section-header h4 {
                margin: 0; font-size: 12px; font-weight: 600; color: #86868b;
                text-transform: uppercase; letter-spacing: 0.8px;
                display: flex; align-items: center; gap: 6px;
            }
            .section-header h4 .section-badge {
                display: inline-block; width: 6px; height: 6px; border-radius: 50%;
                background: #D93025; flex-shrink: 0;
            }
            .section-arrow {
                width: 16px; height: 16px; color: #aaa; transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
                flex-shrink: 0;
            }
            .form-section.collapsed .section-arrow { transform: rotate(-90deg); }
            .form-section.collapsed .section-body { display: none; }
            .section-body { padding: 0 24px 16px; }

            /* API 密钥警告横幅 */
            .api-key-warning {
                margin: 0 24px 12px; padding: 10px 14px;
                background: linear-gradient(135deg, #fff5f5 0%, #ffe8e8 100%);
                border: 1px solid rgba(217,48,37,0.2); border-radius: 8px;
                font-size: 12px; color: #D93025; font-weight: 500;
                display: flex; align-items: center; gap: 8px;
                line-height: 1.4;
            }
            .api-key-warning.hidden { display: none; }
            .api-key-warning .warn-icon { font-size: 14px; flex-shrink: 0; }

            .form-group { margin-bottom: 14px; }
            .form-group:last-child { margin-bottom: 0; }
            .form-group label { display: block; margin-bottom: 6px; color: #666; font-size: 12px; font-weight: 500; }
            .form-group input, .form-group select, .form-group textarea {
                width: 100%; padding: 9px 12px;
                background: rgba(0,0,0,0.02);
                border: 1px solid rgba(0,0,0,0.08); border-radius: 8px; box-sizing: border-box;
                font-family: inherit; font-size: 13px; color: #1a1a1a; transition: all 0.2s;
            }
            .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
                outline: none; border-color: #0052FF; background: #fff; box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.08);
            }
            .form-group input.readonly-field {
                background: rgba(0,0,0,0.04); color: #86868b; cursor: not-allowed;
                border-color: rgba(0,0,0,0.05);
            }
            .form-group textarea { min-height: 72px; resize: vertical; line-height: 1.5; }

            .checkbox-group { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .checkbox-group input[type="checkbox"] { accent-color: #0052FF; width: 15px; height: 15px; }
            .checkbox-group label { margin: 0; font-size: 13px; color: #1a1a1a; font-weight: 500; }

            .preset-controls { display: flex; gap: 6px; margin-bottom: 12px; }
            .preset-controls select {
                flex: 1; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1);
                background: rgba(0,0,0,0.02); font-size: 13px;
            }
            .preset-btn {
                background: transparent; border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
                padding: 0 12px; cursor: pointer; font-size: 12px; font-weight: 500; color: #444; transition: all 0.2s;
                height: 34px; display: flex; align-items: center;
            }
            .preset-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }
            .preset-btn.danger:hover { color: #D93025; border-color: rgba(217,48,37,0.3); background: rgba(217,48,37,0.04); }

            .mode-segmented {
                display: flex; gap: 0; background: rgba(0,0,0,0.04); border-radius: 10px; padding: 3px;
            }
            .mode-segmented input[type="radio"] { display: none; }
            .mode-segmented label {
                flex: 1; text-align: center; padding: 9px 0; font-size: 13px; font-weight: 500;
                color: #666; cursor: pointer; border-radius: 8px; transition: all 0.25s;
            }
            .mode-segmented input[type="radio"]:checked + label {
                background: #1d1d1f; color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
            }
            .mode-segmented input[value="trial"]:checked + label { background: #7c3aed; }
            .mode-segmented input[value="unattended"]:checked + label { background: #D93025; }
            .mode-desc { font-size: 12px; color: #86868b; line-height: 1.5; margin-top: 8px; min-height: 32px; }
            .mode-desc.trial-desc { color: #7c3aed; }
            .mode-desc.unattended-desc { color: #D93025; }

            .sidebar-footer {
                padding: 12px 24px 16px; border-top: 1px solid rgba(0,0,0,0.06);
                display: flex; gap: 8px; flex-shrink: 0;
                background: rgba(255,255,255,0.92);
            }
            .footer-btn {
                flex: 1; padding: 9px 12px; background: transparent; color: #666;
                border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
                font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s;
                display: flex; align-items: center; justify-content: center; gap: 5px;
            }
            .footer-btn:hover { background: rgba(0,0,0,0.03); color: #1a1a1a; border-color: rgba(0,0,0,0.2); }

            .api-key-link { display: inline-block; margin-top: 6px; font-size: 12px; color: #0052FF; text-decoration: none; font-weight: 500; }
            .api-key-link:hover { text-decoration: underline; }

            /* 关于页面样式 */
            .about-page { padding: 24px; }
            .about-header {
                text-align: center; margin-bottom: 24px; padding-bottom: 20px;
                border-bottom: 1px solid rgba(0,0,0,0.06);
            }
            .about-logo {
                width: 64px; height: 64px; margin: 0 auto 12px;
                background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
                border-radius: 16px; display: flex; align-items: center; justify-content: center;
                font-size: 28px; color: white;
            }
            .about-title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin: 0 0 4px; }
            .about-version { font-size: 13px; color: #86868b; margin: 0; }
            .about-section { margin-bottom: 20px; }
            .about-section-title {
                font-size: 12px; font-weight: 600; color: #86868b; text-transform: uppercase;
                letter-spacing: 0.8px; margin-bottom: 10px;
            }
            .about-links { display: flex; flex-direction: column; gap: 8px; }
            .about-link {
                display: flex; align-items: center; gap: 10px; padding: 10px 12px;
                background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.06);
                border-radius: 8px; color: #1a1a1a; text-decoration: none; font-size: 13px;
                transition: all 0.2s;
            }
            .about-link:hover { background: rgba(0,0,0,0.04); border-color: rgba(0,0,0,0.1); }
            .about-link-icon { font-size: 16px; width: 20px; text-align: center; }
            .about-link-text { flex: 1; }
            .about-link-desc { font-size: 11px; color: #86868b; margin-top: 2px; }
            .about-support {
                background: linear-gradient(135deg, #fff9e6 0%, #fff3cc 100%);
                border: 1px solid rgba(255,193,7,0.3); border-radius: 12px; padding: 20px;
                margin-top: 16px;
            }
            .about-support-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin: 0 0 10px; }
            .about-support-desc { font-size: 13px; color: #666; margin: 0 0 16px; line-height: 1.5; }
            .about-qrcodes { display: flex; gap: 20px; justify-content: center; }
            .about-qrcode { text-align: center; }
            .about-qrcode img {
                width: 140px; height: 140px; border-radius: 10px;
                border: 1px solid rgba(0,0,0,0.1); object-fit: cover;
                box-shadow: 0 2px 12px rgba(0,0,0,0.06);
            }
            .about-qrcode-label { font-size: 12px; color: #666; margin-top: 8px; font-weight: 500; }
            .about-copyright { text-align: center; font-size: 11px; color: #aaa; margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.04); }

            /* CHANGELOG 样式 */
            .changelog-section { margin-top: 20px; }
            .changelog-list { display: flex; flex-direction: column; gap: 0; }
            .changelog-version { padding: 12px 0; border-bottom: 1px solid rgba(0,0,0,0.04); }
            .changelog-version:last-child { border-bottom: none; }
            .changelog-version-header {
                display: flex; align-items: center; gap: 8px; cursor: pointer;
                user-select: none; padding: 2px 0;
            }
            .changelog-version-header:hover .changelog-ver { color: #0052FF; }
            .changelog-ver { font-size: 14px; font-weight: 600; color: #1a1a1a; transition: color 0.15s; }
            .changelog-date { font-size: 11px; color: #aaa; }
            .changelog-items {
                margin: 8px 0 0 0; padding: 0 0 0 14px; list-style: disc;
                font-size: 12px; color: #555; line-height: 1.7;
            }
            .changelog-items li { margin-bottom: 2px; }
            .changelog-items li::marker { color: #ccc; }
            .changelog-toggle {
                width: 14px; height: 14px; color: #bbb; transition: transform 0.2s;
                flex-shrink: 0;
            }
            .changelog-version.collapsed .changelog-toggle { transform: rotate(-90deg); }
            .changelog-version.collapsed .changelog-items { display: none; }
        </style>

        <div class="sidebar-header">
            <h3>AI 批改助手</h3>
            <div class="header-buttons">
                <button class="header-btn close-btn" title="关闭">×</button>
            </div>
        </div>

        <div class="settings-tabs">
            <div class="settings-tab active" data-tab="config">配置</div>
            <div class="settings-tab" data-tab="about">关于</div>
        </div>

        <div class="settings-body">
            <!-- 配置标签页 -->
            <div class="tab-content active" id="tab-config">
                <div class="save-btn-container">
                    <button class="save-btn" id="save-config-btn">保存并启用</button>
                </div>

                <!-- ===== 基本 ===== -->
                <div class="group-title" id="group-basic">基本</div>

                <div class="form-section highlight">
                    <div class="section-header"><h4>场景方案</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
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
                </div>

                <div class="form-section">
                    <div class="section-header"><h4>运行模式</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
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
                </div>

                <!-- ===== 批改 ===== -->
                <div class="group-title" id="group-grading">批改</div>

                <div class="form-section">
                    <div class="section-header"><h4>批改上下文</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div class="form-group"><label>题目内容</label><textarea id="question-content"></textarea></div>
                        <div class="form-group"><label>参考答案</label><textarea id="standard-answer"></textarea></div>
                        <div class="form-group"><label>采分标准</label><textarea id="grading-rubric"></textarea></div>
                    </div>
                </div>

                <div class="form-section collapsed">
                    <div class="section-header"><h4>分小题评分</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div class="checkbox-group">
                            <input type="checkbox" id="enable-sub-questions">
                            <label for="enable-sub-questions">启用分小题评分</label>
                        </div>
                        <div id="sub-questions-container" style="display:none;">
                            <div id="sub-questions-list"></div>
                            <button class="preset-btn" id="btn-add-sub-question" style="width:100%;margin-top:8px;padding:8px;">+ 添加小题</button>
                        </div>
                    </div>
                </div>

                <!-- ===== AI 配置 ===== -->
                <div class="group-title" id="group-ai">AI 配置</div>

                <!-- 工作流选择 -->
                <div class="form-section highlight">
                    <div class="section-header"><h4>批改工作流</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div class="form-group">
                            <label>当前工作流</label>
                            <div class="preset-controls">
                                <select id="workflow-select"></select>
                                <button class="preset-btn" id="btn-edit-workflow">编辑</button>
                                <button class="preset-btn" id="btn-new-workflow">新建</button>
                            </div>
                            <div id="workflow-desc" style="font-size:12px;color:#86868b;margin-top:4px;"></div>
                        </div>
                        <div id="workflow-model-info" style="font-size:12px;color:#666;background:rgba(0,0,0,0.02);padding:8px 12px;border-radius:6px;margin-top:8px;"></div>
                    </div>
                </div>

                <!-- 供应商模型管理 -->
                <div class="form-section">
                    <div class="section-header">
                        <h4>供应商与模型<span class="section-badge" id="api-key-badge" style="display:none;"></span></h4>
                        <svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <div class="section-body">
                        <div class="form-group">
                            <label>供应商</label>
                            <div class="preset-controls">
                                <select id="ai-provider"></select>
                                <button class="preset-btn" id="btn-new-provider">新建</button>
                                <button class="preset-btn danger" id="btn-del-provider">删除</button>
                            </div>
                            <div id="api-key-link-container" style="display:none;"><a href="https://api.ai.five-plus-one.com/console/token" target="_blank" class="api-key-link">获取访问凭证</a></div>
                        </div>
                        <div class="form-group"><label>服务网关 URL</label><input type="text" id="api-endpoint"></div>
                        <div class="form-group"><label>通信密钥 (Token) *</label><input type="password" id="api-key" placeholder="必填，否则无法使用 AI 批改"></div>
                        <div class="form-group">
                            <label>模型列表</label>
                            <div id="model-list" style="margin-bottom:8px;"></div>
                            <div style="display:flex;gap:8px;">
                                <input type="text" id="new-model-id" placeholder="模型ID (如 doubao-seed-2-0-mini)" style="flex:1;">
                                <button class="preset-btn" id="btn-add-model">添加</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="api-key-warning hidden" id="api-key-warning">
                    <span class="warn-icon">!</span>
                    <span>尚未填写通信密钥，AI 批改功能将无法使用。请在上方填入 API Key。</span>
                </div>

                <!-- 取整配置 -->
                <div class="form-section collapsed">
                    <div class="section-header"><h4>取整规则</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div class="form-group">
                            <label>取整步长</label>
                            <select id="scoring-round-step">
                                <option value="1">整数 (1分)</option>
                                <option value="0.5">0.5分</option>
                                <option value="0.1">0.1分 (不取整)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>取整方式</label>
                            <select id="scoring-round-method">
                                <option value="round">四舍五入</option>
                                <option value="floor">向下取整</option>
                                <option value="ceil">向上取整</option>
                            </select>
                        </div>
                    </div>
                </div>

                <!-- ===== 其他 ===== -->
                <div class="group-title" id="group-other">其他</div>

                <div class="form-section collapsed">
                    <div class="section-header"><h4>历史记录</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div class="checkbox-group">
                            <input type="checkbox" id="save-images-checkbox">
                            <label for="save-images-checkbox">保存答题卡图片</label>
                        </div>
                        <div style="font-size:12px;color:#86868b;margin-top:4px;">关闭后不再保存图片到本地，可节省存储空间</div>
                    </div>
                </div>

                <div class="form-section collapsed">
                    <div class="section-header"><h4>配置管理</h4><svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
                    <div class="section-body">
                        <div style="display:flex;gap:8px;">
                            <button class="footer-btn" id="btn-export-config" style="flex:1;">导出配置</button>
                            <button class="footer-btn" id="btn-import-config" style="flex:1;">导入配置</button>
                        </div>
                        <input type="file" id="import-config-file" accept=".json" style="display:none;">
                        <div style="margin-top:10px;">
                            <button class="footer-btn danger" id="btn-reset-config" style="width:100%;">恢复默认设置</button>
                        </div>
                        <div style="font-size:11px;color:#86868b;margin-top:4px;">将重置所有方案、供应商、工作流为默认值</div>
                    </div>
                </div>
            </div>

            <!-- 关于标签页 -->
            <div class="tab-content" id="tab-about">
                <div class="about-page">
                    <div class="about-header">
                        <div class="about-logo">AI</div>
                        <h2 class="about-title">AI 批改助手</h2>
                        <p class="about-version">版本 ${SCRIPT_CONFIG.VERSION}</p>
                    </div>

                    <div class="about-section">
                        <div class="about-section-title">帮助与支持</div>
                        <div class="about-links">
                            <a href="https://aimarking.five-plus-one.com/" target="_blank" class="about-link">
                                <span class="about-link-icon">📖</span>
                                <div class="about-link-text">
                                    <div>帮助文档</div>
                                    <div class="about-link-desc">查看使用教程和常见问题</div>
                                </div>
                            </a>
                            <a href="https://github.com/five-plus-one/AI-Marker-Suite" target="_blank" class="about-link">
                                <span class="about-link-icon">💻</span>
                                <div class="about-link-text">
                                    <div>GitHub 仓库</div>
                                    <div class="about-link-desc">查看源代码、提交反馈</div>
                                </div>
                            </a>
                            <a href="https://r-l.ink/contact" target="_blank" class="about-link">
                                <span class="about-link-icon">📧</span>
                                <div class="about-link-text">
                                    <div>联系作者</div>
                                    <div class="about-link-desc">反馈问题、请求适配更多平台</div>
                                </div>
                            </a>
                        </div>
                    </div>

                    <div class="about-support">
                        <div class="about-support-title">☕ 支持作者</div>
                        <div class="about-support-desc">如果这个工具对您有帮助，欢迎请作者喝杯咖啡！您的支持是持续更新的动力。</div>
                        <div class="about-qrcodes">
                            <div class="about-qrcode">
                                <img src="https://r-l.ink/paywx1" alt="微信赞赏" onerror="this.style.display='none'">
                                <div class="about-qrcode-label">微信赞赏</div>
                            </div>
                            <div class="about-qrcode">
                                <img src="https://r-l.ink/payzfb1" alt="支付宝赞赏" onerror="this.style.display='none'">
                                <div class="about-qrcode-label">支付宝赞赏</div>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:16px;">
                        <div class="about-section-title">关注公众号</div>
                        <div style="text-align:center;">
                            <img src="https://r-l.ink/wxmp1" alt="微信公众号" style="width:120px;height:120px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);" onerror="this.style.display='none'">
                            <div style="font-size:11px;color:#86868b;margin-top:4px;">扫码关注公众号获取最新动态</div>
                        </div>
                    </div>

                    <div class="about-section" style="margin-top:20px;">
                        <div class="about-section-title">社区与交流</div>
                        <div class="about-links">
                            <a href="https://five-plus-one.com" target="_blank" class="about-link">
                                <span class="about-link-icon">🌐</span>
                                <div class="about-link-text">
                                    <div>作者主页</div>
                                    <div class="about-link-desc">五加一的星空</div>
                                </div>
                            </a>
                            <a href="https://r-l.ink/s/L9Akf" target="_blank" class="about-link">
                                <span class="about-link-icon">💬</span>
                                <div class="about-link-text">
                                    <div>微信交流群</div>
                                    <div class="about-link-desc">加入微信群交流讨论</div>
                                </div>
                            </a>
                            <a href="https://r-l.ink/s/WbMrR" target="_blank" class="about-link">
                                <span class="about-link-icon">👥</span>
                                <div class="about-link-text">
                                    <div>QQ 交流群</div>
                                    <div class="about-link-desc">加入QQ群交流讨论</div>
                                </div>
                            </a>
                        </div>
                    </div>

                    <div class="about-section changelog-section">
                        <div class="about-section-title">更新日志</div>
                        <div class="changelog-list" id="changelog-list"></div>
                    </div>

                    <div class="about-copyright">
                        <div>AI 批改助手 © ${new Date().getFullYear()} Five Plus One</div>
                        <div style="margin-top:4px;">Made with ❤️ for teachers</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="sidebar-footer">
            <button class="footer-btn" id="btn-history">评阅历史</button>
            <button class="footer-btn" id="btn-check-update">检查更新</button>
        </div>
    `;
    document.body.appendChild(panel);

    // 遮罩层点击关闭
    overlay.onclick = () => closeSettingsPanel();
    panel.querySelector('.close-btn').onclick = () => closeSettingsPanel();

    // 标签页切换
    panel.querySelectorAll('.settings-tab').forEach(tab => {
        tab.onclick = () => {
            panel.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            panel.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active');
        };
    });

    // 手风琴折叠
    panel.querySelectorAll('.section-header').forEach(header => {
        header.onclick = () => header.parentElement.classList.toggle('collapsed');
    });

    panel.querySelector('#btn-new-preset').onclick = handleNewPreset;
    panel.querySelector('#btn-del-preset').onclick = handleDeletePreset;
    panel.querySelector('#preset-select').onchange = handlePresetChange;
    panel.querySelector('#save-config-btn').onclick = saveAISettings;
    panel.querySelector('#btn-history').onclick = () => showHistoryPanel();
    panel.querySelector('#btn-check-update').onclick = function() { checkForUpdate(true, this); };
    panel.querySelector('#btn-new-provider').onclick = handleNewProvider;
    panel.querySelector('#btn-del-provider').onclick = handleDeleteProvider;
    panel.querySelector('#ai-provider').onchange = handleProviderChange;
    panel.querySelector('#btn-add-model').onclick = handleAddModel;
    panel.querySelector('#new-model-id').onkeydown = (e) => { if (e.key === 'Enter') handleAddModel(); };
    panel.querySelector('#workflow-select').onchange = handleWorkflowChange;
    panel.querySelector('#btn-edit-workflow').onclick = handleEditWorkflow;
    panel.querySelector('#btn-new-workflow').onclick = handleNewWorkflow;

    // 配置导出
    panel.querySelector('#btn-export-config').onclick = () => {
        const exportData = {
            version: SCRIPT_CONFIG.VERSION,
            timestamp: new Date().toISOString(),
            presets: PresetManager.data,
            providers: ProviderManager.data,
            workflows: WorkflowManager.data,
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
            if (data.workflows) {
                WorkflowManager.data = data.workflows;
                WorkflowManager.save();
            }
            renderPresetDropdown();
            fillFormFromActivePreset();
            showToast('配置导入成功');
        } catch (err) {
            if (err) showToast('导入失败：' + (err.message || '文件格式错误'));
        }
        fileInput.value = '';
    };

    // 恢复默认设置
    panel.querySelector('#btn-reset-config').onclick = async () => {
        if (await showConfirmModal('确定要恢复默认设置吗？\n\n将重置：\n• 所有配置方案\n• 供应商与模型\n• 工作流配置\n\n此操作不可撤销！')) {
            PresetManager.data = {
                list: { "默认配置": { question: '', answer: '', rubric: '', workflowId: 'fast', gradingMode: 'normal', scoring: { roundStep: 1, roundMethod: 'round' } } },
                active: "默认配置",
                bindings: {}
            };
            PresetManager.save();
            ProviderManager.data = ProviderManager._getDefault();
            ProviderManager.save();
            WorkflowManager.data = WorkflowManager._getDefault();
            WorkflowManager.save();
            renderPresetDropdown();
            fillFormFromActivePreset();
            showToast('已恢复默认设置');
        }
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

    // API 密钥实时监听：输入变化时更新警告状态
    const apiKeyInput = panel.querySelector('#api-key');
    if (apiKeyInput) {
        apiKeyInput.addEventListener('input', () => {
            const hasKey = apiKeyInput.value.trim().length > 0;
            const warning = document.getElementById('api-key-warning');
            const badge = document.getElementById('api-key-badge');
            if (warning) warning.classList.toggle('hidden', hasKey);
            if (badge) badge.style.display = hasKey ? 'none' : 'inline-block';
            updateGroupHints();
        });
    }

    // 批改上下文实时监听
    const questionInput = panel.querySelector('#question-content');
    if (questionInput) {
        questionInput.addEventListener('input', () => updateGroupHints());
    }

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
            subToggle.checked = false;
            showToast('当前平台暂不支持分小题给分');
            return;
        }
        subContainer.style.display = 'none';
        markUnsavedChanges();
    });
    panel.querySelector('#btn-add-sub-question').onclick = () => addSubQuestionItem();

    loadSettings();
    renderChangelog();

    // 初始化后打开侧边栏
    requestAnimationFrame(() => openSettingsPanel());
}

// ========== 渲染 CHANGELOG ==========
function renderChangelogContent(container, changelog) {
    const versions = Object.keys(changelog);
    if (versions.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:#aaa;">暂无更新日志</div>';
        return;
    }

    const arrowSVG = '<svg class="changelog-toggle" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    let html = '';
    versions.forEach((ver, idx) => {
        const items = changelog[ver];
        const collapsedClass = idx === 0 ? '' : ' collapsed'; // 最新版本展开，其余折叠

        html += `<div class="changelog-version${collapsedClass}">`;
        html += `<div class="changelog-version-header">`;
        html += arrowSVG;
        html += `<span class="changelog-ver">v${ver}</span>`;
        html += `</div>`;
        html += `<ul class="changelog-items">`;
        items.forEach(item => {
            html += `<li>${item}</li>`;
        });
        html += `</ul></div>`;
    });

    container.innerHTML = html;

    // 点击折叠/展开
    container.querySelectorAll('.changelog-version-header').forEach(header => {
        header.onclick = () => header.parentElement.classList.toggle('collapsed');
    });
}

async function renderChangelog() {
    const container = document.getElementById('changelog-list');
    if (!container) return;

    // 先显示加载状态
    container.innerHTML = '<div style="font-size:12px;color:#aaa;">加载中...</div>';

    // 尝试从远端 manifest.json 加载 changelog
    try {
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: SCRIPT_CONFIG.MANIFEST_URL + '?_t=' + Date.now(),
                timeout: 5000,
                onload: resolve,
                onerror: reject,
                ontimeout: reject
            });
        });

        if (response.status >= 200 && response.status < 300) {
            const manifest = JSON.parse(response.responseText);
            if (manifest.changelog && typeof manifest.changelog === 'object') {
                console.log('[Changelog] 成功从远端加载');
                renderChangelogContent(container, manifest.changelog);
                return;
            }
        }
    } catch (e) {
        console.warn('[Changelog] 远端加载失败:', e.message);
    }

    // 降级：使用本地 CHANGELOG
    console.log('[Changelog] 使用本地 CHANGELOG');
    renderChangelogContent(container, SCRIPT_CONFIG.CHANGELOG || {});
}

// ========== 侧边栏开关 ==========
function openSettingsPanel() {
    const panel = document.getElementById('ai-grading-settings');
    const overlay = document.getElementById('ai-settings-overlay');
    if (panel) {
        panel.style.display = 'flex';
        requestAnimationFrame(() => panel.classList.add('open'));
    }
    if (overlay) {
        overlay.style.pointerEvents = 'auto';
        overlay.style.opacity = '1';
    }
}

function closeSettingsPanel() {
    const panel = document.getElementById('ai-grading-settings');
    const overlay = document.getElementById('ai-settings-overlay');
    if (panel) panel.classList.remove('open');
    if (overlay) { overlay.style.opacity = '0'; overlay.style.pointerEvents = 'none'; }
    // 等动画结束后隐藏
    setTimeout(() => { if (panel && !panel.classList.contains('open')) panel.style.display = 'none'; }, 350);
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

    // 供应商下拉（仅用于管理供应商配置，默认选中 5plus1官方）
    renderProviderDropdown();
    const currentProviderSelect = document.getElementById('ai-provider');
    const defaultProvider = ProviderManager.data.providers['5plus1官方'] ? '5plus1官方' : Object.keys(ProviderManager.data.providers)[0];
    if (defaultProvider && currentProviderSelect) {
        currentProviderSelect.value = defaultProvider;
    }
    // 5plus1 官方：强制使用默认网关
    const providerName = currentProviderSelect?.value || defaultProvider;
    const provider = ProviderManager.getProvider(providerName);
    if (providerName === '5plus1官方') {
        document.getElementById('api-endpoint').value = SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    } else {
        document.getElementById('api-endpoint').value = provider?.endpoint || '';
    }
    document.getElementById('api-key').value = provider?.apiKey || '';

    // 模型列表
    renderModelList();

    // 工作流下拉
    renderWorkflowDropdown();
    if (config.workflowId) {
        document.getElementById('workflow-select').value = config.workflowId;
        renderWorkflowInfo();
    }

    // 取整配置
    const scoring = config.scoring || { roundStep: 1, roundMethod: 'round' };
    const stepSelect = document.getElementById('scoring-round-step');
    const methodSelect = document.getElementById('scoring-round-method');
    if (stepSelect) stepSelect.value = scoring.roundStep;
    if (methodSelect) methodSelect.value = scoring.roundMethod;

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

    const subToggle = document.getElementById('enable-sub-questions');
    const subContainer = document.getElementById('sub-questions-container');
    const subList = document.getElementById('sub-questions-list');
    subList.innerHTML = '';
    const subQuestions = config.subQuestions || [];
    if (subQuestions.length > 0) {
        subToggle.checked = true;
        subContainer.style.display = 'block';
        subQuestions.forEach(sq => addSubQuestionItem(sq));
    } else {
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

    // 初始化保存图片选项
    const saveImagesCheckbox = document.getElementById('save-images-checkbox');
    if (saveImagesCheckbox) {
        saveImagesCheckbox.checked = window.aiGradingState.saveImages;
        saveImagesCheckbox.addEventListener('change', () => {
            window.aiGradingState.saveImages = saveImagesCheckbox.checked;
            GM_setValue('ai-grading-save-images', saveImagesCheckbox.checked);
            showToast(saveImagesCheckbox.checked ? '已开启答题卡图片保存' : '已关闭答题卡图片保存');
        });
    }

    updateUIVisibility();
    clearUnsavedChanges();
}

function addSubQuestionItem(data) {
    const list = document.getElementById('sub-questions-list');
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
    const apiKeyLink = document.getElementById('api-key-link-container');
    const endpointInput = document.getElementById('api-endpoint');
    const apiKeyInput = document.getElementById('api-key');
    const apiKeyWarning = document.getElementById('api-key-warning');
    const apiKeyBadge = document.getElementById('api-key-badge');

    // 5plus1 官方：网关 URL 固定为只读
    if (provider === '5plus1官方') {
        apiKeyLink.style.display = 'block';
        endpointInput.value = SCRIPT_CONFIG.DEFAULT_ENDPOINT;
        endpointInput.readOnly = true;
        endpointInput.classList.add('readonly-field');
    } else {
        apiKeyLink.style.display = 'none';
        endpointInput.readOnly = false;
        endpointInput.classList.remove('readonly-field');
    }

    // API 密钥未填写时显示警告
    const hasKey = apiKeyInput.value.trim().length > 0;
    if (apiKeyWarning) {
        apiKeyWarning.classList.toggle('hidden', hasKey);
    }
    if (apiKeyBadge) {
        apiKeyBadge.style.display = hasKey ? 'none' : 'inline-block';
    }

    // 分组标题提示
    updateGroupHints();
}

function updateGroupHints() {
    const apiKeyInput = document.getElementById('api-key');
    const hasKey = apiKeyInput && apiKeyInput.value.trim().length > 0;
    const questionEl = document.getElementById('question-content');
    const hasContext = questionEl && questionEl.value.trim().length > 0;

    const groupAI = document.getElementById('group-ai');
    const groupGrading = document.getElementById('group-grading');

    // AI 配置组：密钥未填写时显示红色提示
    if (groupAI) {
        const existingWarn = groupAI.querySelector('.config-warn');
        if (!hasKey) {
            if (!existingWarn) {
                const warn = document.createElement('span');
                warn.className = 'config-warn';
                warn.textContent = '请填写密钥';
                groupAI.appendChild(warn);
            }
        } else if (existingWarn) {
            existingWarn.remove();
        }
    }

    // 批改组：未配置上下文时显示提示
    if (groupGrading) {
        const existingWarn = groupGrading.querySelector('.config-warn');
        if (!hasContext) {
            if (!existingWarn) {
                const warn = document.createElement('span');
                warn.className = 'config-warn';
                warn.textContent = '建议填写';
                groupGrading.appendChild(warn);
            }
        } else if (existingWarn) {
            existingWarn.remove();
        }
    }
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
    const currentValue = select.value;
    select.innerHTML = '';
    for (const name in ProviderManager.data.providers) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    // 保持当前选中的供应商，如果没有则选中第一个
    if (currentValue && ProviderManager.data.providers[currentValue]) {
        select.value = currentValue;
    }
}

function renderModelList() {
    const container = document.getElementById('model-list');
    if (!container) return;
    const currentProviderName = document.getElementById('ai-provider')?.value;
    const provider = ProviderManager.getProvider(currentProviderName);
    const models = provider?.models || {};

    let html = '';
    for (const [id, info] of Object.entries(models)) {
        const tags = (info.tags || []).map(t => `<span style="display:inline-block;padding:1px 6px;margin-left:4px;font-size:10px;border-radius:3px;background:${t === '推荐' ? 'rgba(0,82,255,0.1)' : 'rgba(0,0,0,0.05)'};color:${t === '推荐' ? '#0052FF' : '#666'};">${t}</span>`).join('');
        const isBuiltin = info.isBuiltin;
        html += `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;margin-bottom:4px;border-radius:6px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);">`;
        html += `<div><span style="font-size:12px;font-weight:500;">${info.label || id}</span>${tags}${isBuiltin ? '<span style="display:inline-block;padding:1px 6px;margin-left:4px;font-size:10px;border-radius:3px;background:rgba(217,48,37,0.08);color:#D93025;">内置</span>' : ''}</div>`;
        html += `<div style="display:flex;align-items:center;gap:6px;">`;
        if (!isBuiltin) {
            html += `<button class="preset-btn danger" style="padding:2px 6px;font-size:10px;" onclick="event.stopPropagation();deleteModel('${id}')">删除</button>`;
        }
        html += `</div></div>`;
    }
    if (Object.keys(models).length === 0) {
        html = '<div style="font-size:12px;color:#999;padding:8px;">暂无模型，请在下方添加</div>';
    }
    container.innerHTML = html;
}

// 暴露到全局作用域（供内联 onclick 使用）
window.deleteModel = async function(modelId) {
    if (typeof ProviderManager === 'undefined') return;
    const currentProviderName = document.getElementById('ai-provider')?.value;
    const provider = ProviderManager.getProvider(currentProviderName);
    if (!provider || !provider.models || !provider.models[modelId]) return;
    if (provider.models[modelId].isBuiltin) {
        if (typeof showAlertModal === 'function') showAlertModal("内置模型不允许删除！");
        return;
    }
    const confirmFn = typeof showConfirmModal === 'function' ? showConfirmModal : confirm;
    if (await confirmFn(`确定要删除模型【${modelId}】吗？`)) {
        ProviderManager.deleteModel(currentProviderName, modelId);
        if (typeof renderModelList === 'function') renderModelList();
        if (typeof showToast === 'function') showToast(`模型「${modelId}」已删除`);
    }
};

async function deleteModel(modelId) {
    await window.deleteModel(modelId);
}

function handleProviderChange() {
    const name = document.getElementById('ai-provider').value;

    const provider = ProviderManager.getProvider(name);
    if (provider) {
        document.getElementById('api-endpoint').value = provider.endpoint || '';
        document.getElementById('api-key').value = provider.apiKey || '';
    }
    document.getElementById('api-key-link-container').style.display = name === '5plus1官方' ? 'block' : 'none';
    renderModelList();
    renderWorkflowInfo();
    updateUIVisibility();
    markUnsavedChanges();
}

async function handleNewProvider() {
    const name = await showPromptModal("请输入新的供应商名称 (例如: 火山引擎)：");
    if (!name || !name.trim()) return;
    if (ProviderManager.data.providers[name]) {
        showAlertModal("该供应商名称已存在！");
        return;
    }
    ProviderManager.addProvider(name, {
        endpoint: document.getElementById('api-endpoint').value,
        apiKey: document.getElementById('api-key').value,
        models: {}
    });
    renderProviderDropdown();
    document.getElementById('ai-provider').value = name;
    handleProviderChange();
    renderModelList();
    document.getElementById('api-key-link-container').style.display = 'none';
    showToast(`供应商「${name}」创建成功`);
}

async function handleDeleteProvider() {
    const name = document.getElementById('ai-provider').value;
    if (Object.keys(ProviderManager.data.providers).length <= 1) {
        showAlertModal("必须至少保留一个供应商！");
        return;
    }
    if (await showConfirmModal(`确定要删除供应商【${name}】吗？`)) {
        ProviderManager.deleteProvider(name);
        renderProviderDropdown();
        handleProviderChange();
        showToast(`供应商「${name}」已删除`);
    }
}

async function handleAddModel() {
    const modelId = document.getElementById('new-model-id').value.trim();
    if (!modelId) {
        showAlertModal("请输入模型 ID！");
        return;
    }
    const currentProviderName = document.getElementById('ai-provider')?.value;
    const provider = ProviderManager.getProvider(currentProviderName);
    if (!provider) return;
    if (provider.models && provider.models[modelId]) {
        showAlertModal("该模型已存在！");
        return;
    }
    ProviderManager.addModel(currentProviderName, modelId, modelId, []);
    document.getElementById('new-model-id').value = '';
    renderModelList();
    renderWorkflowInfo();
    showToast(`模型「${modelId}」已添加`);
}

// ========== 工作流管理 ==========
function renderWorkflowDropdown() {
    const select = document.getElementById('workflow-select');
    if (!select) return;
    select.innerHTML = '';
    const workflows = WorkflowManager.getAll();
    for (const wf of workflows) {
        const option = document.createElement('option');
        option.value = wf.id;
        option.textContent = wf.name;
        select.appendChild(option);
    }
    select.value = WorkflowManager.data.activeWorkflow;
    renderWorkflowInfo();
}

function renderWorkflowInfo() {
    const wf = WorkflowManager.getActiveWorkflow();
    const descEl = document.getElementById('workflow-desc');
    const infoEl = document.getElementById('workflow-model-info');

    if (descEl) {
        descEl.textContent = wf ? wf.description : '';
    }

    if (infoEl && wf) {
        const modelInfo = wf.model;
        const reasoningLabel = { minimal: '不思考', low: '轻度', medium: '中度', high: '深度' };
        let html = `<div style="margin-bottom:4px;"><strong>主模型：</strong>${modelInfo.provider} / ${modelInfo.model}${modelInfo.reasoningEffort ? ' <span style="font-size:11px;color:#86868b;">(' + (reasoningLabel[modelInfo.reasoningEffort] || modelInfo.reasoningEffort) + ')</span>' : ''}</div>`;
        if (wf.dualEval && wf.dualEval.enabled) {
            const sec = wf.dualEval.secondary;
            const arb = wf.dualEval.arbitration;
            html += `<div style="margin-bottom:4px;"><strong>副模型：</strong>${sec.provider} / ${sec.model}${sec.reasoningEffort ? ' <span style="font-size:11px;color:#86868b;">(' + (reasoningLabel[sec.reasoningEffort] || sec.reasoningEffort) + ')</span>' : ''}</div>`;
            html += `<div style="margin-bottom:4px;"><strong>仲裁模型：</strong>${arb.provider} / ${arb.model}${arb.reasoningEffort ? ' <span style="font-size:11px;color:#86868b;">(' + (reasoningLabel[arb.reasoningEffort] || arb.reasoningEffort) + ')</span>' : ''}</div>`;
            html += `<div><strong>分差阈值：</strong>${wf.dualEval.threshold}分</div>`;
        }
        infoEl.innerHTML = html;
    }
}

function handleWorkflowChange() {
    const id = document.getElementById('workflow-select').value;
    WorkflowManager.setActive(id);
    renderWorkflowInfo();
    markUnsavedChanges();
}

async function handleNewWorkflow() {
    const name = await showPromptModal("请输入工作流名称 (例如: 作文批改)：");
    if (!name || !name.trim()) return;
    if (WorkflowManager.data.workflows[name]) {
        showAlertModal("该工作流名称已存在！");
        return;
    }
    const firstProvider = Object.keys(ProviderManager.data.providers)[0];
    const firstModel = firstProvider ? Object.keys(ProviderManager.data.providers[firstProvider]?.models || {})[0] || '' : '';
    WorkflowManager.addWorkflow(name, {
        id: name.toLowerCase().replace(/\s+/g, '-'),
        description: '',
        model: { provider: firstProvider || '', model: firstModel, reasoningEffort: '' },
        dualEval: null
    });
    WorkflowManager.data.activeWorkflow = WorkflowManager.data.workflows[name].id;
    WorkflowManager.save();
    renderWorkflowDropdown();
    showToast(`工作流「${name}」创建成功`);
}

async function handleEditWorkflow() {
    const wf = WorkflowManager.getActiveWorkflow();
    if (!wf) return;
    showWorkflowEditModal(wf);
}

function showWorkflowEditModal(wf) {
    // 确保模态框样式已加载
    ensureModalStyles();

    const providers = Object.keys(ProviderManager.data.providers);
    const providerOptions = providers.map(p => `<option value="${p}">${p}</option>`).join('');

    function getModelOptions(providerName) {
        const provider = ProviderManager.data.providers[providerName];
        if (!provider) return '';
        return Object.entries(provider.models || {}).map(([id, info]) =>
            `<option value="${id}">${info.label || id}</option>`
        ).join('');
    }

    const isDual = wf.dualEval && wf.dualEval.enabled;

    const reasoningEffortOptions = `
        <option value="">不设置</option>
        <option value="minimal">minimal (不思考)</option>
        <option value="low">low (轻度)</option>
        <option value="medium">medium (中度)</option>
        <option value="high">high (深度)</option>
    `;

    const modal = document.createElement('div');
    modal.className = 'ai-modal-overlay';
    modal.innerHTML = `
        <div class="ai-modal-card" style="max-width:500px;max-height:85vh;display:flex;flex-direction:column;">
            <div class="ai-modal-header">编辑工作流</div>
            <div class="ai-modal-body" style="overflow-y:auto;flex:1;min-height:0;">
                <div class="form-group"><label>名称</label><input type="text" id="wf-edit-name" value="${wf.name}" ${wf.isBuiltin ? 'readonly' : ''}></div>
                <div class="form-group"><label>描述</label><input type="text" id="wf-edit-desc" value="${wf.description || ''}"></div>
                <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:12px;margin-top:8px;">
                    <div style="font-size:13px;font-weight:600;margin-bottom:10px;">主模型</div>
                    <div class="form-group"><label>供应商</label><select id="wf-edit-provider">${providerOptions}</select></div>
                    <div class="form-group"><label>模型</label><select id="wf-edit-model"></select></div>
                    <div class="form-group"><label>思考链深度 <span style="font-size:11px;color:#86868b;">(部分模型不支持)</span></label><select id="wf-edit-reasoning">${reasoningEffortOptions}</select></div>
                </div>
                <div style="border-top:1px solid rgba(0,0,0,0.06);padding-top:12px;margin-top:8px;">
                    <div class="checkbox-group">
                        <input type="checkbox" id="wf-edit-dual" ${isDual ? 'checked' : ''}>
                        <label for="wf-edit-dual">启用双评模式</label>
                    </div>
                    <div id="wf-dual-config" style="display:${isDual ? 'block' : 'none'};">
                        <div style="font-size:13px;font-weight:600;margin:10px 0;">副模型</div>
                        <div class="form-group"><label>供应商</label><select id="wf-edit-sec-provider">${providerOptions}</select></div>
                        <div class="form-group"><label>模型</label><select id="wf-edit-sec-model"></select></div>
                        <div class="form-group"><label>思考链深度</label><select id="wf-edit-sec-reasoning">${reasoningEffortOptions}</select></div>
                        <div style="font-size:13px;font-weight:600;margin:10px 0;">仲裁模型</div>
                        <div class="form-group"><label>供应商</label><select id="wf-edit-arb-provider">${providerOptions}</select></div>
                        <div class="form-group"><label>模型</label><select id="wf-edit-arb-model"></select></div>
                        <div class="form-group"><label>思考链深度</label><select id="wf-edit-arb-reasoning">${reasoningEffortOptions}</select></div>
                        <div class="form-group"><label>分差阈值 (分)</label><input type="number" id="wf-edit-threshold" value="${wf.dualEval?.threshold || 2}" min="1" max="10"></div>
                    </div>
                </div>
            </div>
            <div class="ai-modal-footer">
                ${!wf.isBuiltin ? '<button class="ai-modal-btn-cancel" id="wf-edit-delete" style="margin-right:auto;color:#D93025;">删除</button>' : ''}
                <button class="ai-modal-btn-cancel" id="wf-edit-cancel">取消</button>
                <button class="ai-modal-btn-confirm" id="wf-edit-save">保存</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // 初始化下拉框
    const mainProvider = document.getElementById('wf-edit-provider');
    const mainModel = document.getElementById('wf-edit-model');
    const mainReasoning = document.getElementById('wf-edit-reasoning');
    const secProvider = document.getElementById('wf-edit-sec-provider');
    const secModel = document.getElementById('wf-edit-sec-model');
    const secReasoning = document.getElementById('wf-edit-sec-reasoning');
    const arbProvider = document.getElementById('wf-edit-arb-provider');
    const arbModel = document.getElementById('wf-edit-arb-model');
    const arbReasoning = document.getElementById('wf-edit-arb-reasoning');

    mainProvider.value = wf.model.provider;
    mainModel.innerHTML = getModelOptions(wf.model.provider);
    mainModel.value = wf.model.model;
    mainReasoning.value = wf.model.reasoningEffort || '';

    if (isDual) {
        secProvider.value = wf.dualEval.secondary.provider;
        secModel.innerHTML = getModelOptions(wf.dualEval.secondary.provider);
        secModel.value = wf.dualEval.secondary.model;
        secReasoning.value = wf.dualEval.secondary.reasoningEffort || '';
        arbProvider.value = wf.dualEval.arbitration.provider;
        arbModel.innerHTML = getModelOptions(wf.dualEval.arbitration.provider);
        arbModel.value = wf.dualEval.arbitration.model;
        arbReasoning.value = wf.dualEval.arbitration.reasoningEffort || '';
    }

    // 供应商变化时更新模型列表
    mainProvider.onchange = () => { mainModel.innerHTML = getModelOptions(mainProvider.value); };
    secProvider.onchange = () => { secModel.innerHTML = getModelOptions(secProvider.value); };
    arbProvider.onchange = () => { arbModel.innerHTML = getModelOptions(arbProvider.value); };

    // 双评开关
    document.getElementById('wf-edit-dual').onchange = (e) => {
        document.getElementById('wf-dual-config').style.display = e.target.checked ? 'block' : 'none';
    };

    // 关闭
    const close = () => modal.remove();
    modal.querySelector('#wf-edit-cancel').onclick = close;
    modal.onclick = (e) => { if (e.target === modal) close(); };

    // 删除
    const deleteBtn = modal.querySelector('#wf-edit-delete');
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            if (await showConfirmModal(`确定要删除工作流【${wf.name}】吗？`)) {
                WorkflowManager.deleteWorkflow(wf.name);
                renderWorkflowDropdown();
                close();
                showToast(`工作流「${wf.name}」已删除`);
            }
        };
    }

    // 保存
    modal.querySelector('#wf-edit-save').onclick = () => {
        const dualEnabled = document.getElementById('wf-edit-dual').checked;
        const config = {
            description: document.getElementById('wf-edit-desc').value,
            model: {
                provider: mainProvider.value,
                model: mainModel.value,
                reasoningEffort: mainReasoning.value
            },
            dualEval: dualEnabled ? {
                enabled: true,
                secondary: { provider: secProvider.value, model: secModel.value, reasoningEffort: secReasoning.value },
                arbitration: { provider: arbProvider.value, model: arbModel.value, reasoningEffort: arbReasoning.value },
                threshold: parseInt(document.getElementById('wf-edit-threshold').value) || 2
            } : null
        };

        if (wf.isBuiltin) {
            WorkflowManager.updateWorkflow(wf.name, config);
        } else {
            const newName = document.getElementById('wf-edit-name').value.trim();
            if (newName && newName !== wf.name) {
                // 重命名
                delete WorkflowManager.data.workflows[wf.name];
                WorkflowManager.data.workflows[newName] = { ...wf, ...config, name: undefined };
                if (WorkflowManager.data.activeWorkflow === wf.id) {
                    WorkflowManager.data.activeWorkflow = WorkflowManager.data.workflows[newName].id;
                }
                WorkflowManager.save();
            } else {
                WorkflowManager.updateWorkflow(wf.name, config);
            }
        }

        renderWorkflowDropdown();
        close();
        showToast('工作流已保存');
    };
}

function saveAISettings() {
    const checkedMode = document.querySelector('input[name="grading-mode"]:checked');
    const gradingMode = checkedMode ? checkedMode.value : 'normal';

    const providerName = document.getElementById('ai-provider').value;
    const subQuestions = getSubQuestionsFromForm();

    // 保存供应商配置（仅保存当前编辑的供应商，不设置"活跃"供应商）
    const provider = ProviderManager.getProvider(providerName);
    if (provider) {
        provider.endpoint = document.getElementById('api-endpoint').value;
        provider.apiKey = document.getElementById('api-key').value;
        ProviderManager.save();
    }

    // 保存工作流选择
    const workflowId = document.getElementById('workflow-select')?.value;
    if (workflowId) {
        WorkflowManager.setActive(workflowId);
    }

    // 保存取整配置
    const roundStep = parseFloat(document.getElementById('scoring-round-step')?.value) || 1;
    const roundMethod = document.getElementById('scoring-round-method')?.value || 'round';

    const config = {
        question: document.getElementById('question-content').value,
        answer: document.getElementById('standard-answer').value,
        rubric: document.getElementById('grading-rubric').value,
        workflowId: workflowId || 'fast',
        gradingMode,
        subQuestions: subQuestions.length > 0 ? subQuestions : undefined,
        scoring: { roundStep, roundMethod }
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
    const modeLabel = { normal: '普通模式', trial: '试改模式', unattended: '无人模式' }[gradingMode];
    safeAlert(`「${activeName}」已保存 — ${modeLabel}`);

    // 保存后自动关闭侧边栏
    closeSettingsPanel();
}
