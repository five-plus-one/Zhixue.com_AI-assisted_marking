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

                <div class="form-section">
                    <div class="section-header">
                        <h4>AI 模型与算力<span class="section-badge" id="api-key-badge" style="display:none;"></span></h4>
                        <svg class="section-arrow" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </div>
                    <div class="section-body">
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
                        <div class="form-group"><label>通信密钥 (Token) *</label><input type="password" id="api-key" placeholder="必填，否则无法使用 AI 批改"></div>
                        <div class="form-group"><label>调用模型 ID</label><input type="text" id="model-name"></div>
                    </div>
                </div>
                <div class="api-key-warning hidden" id="api-key-warning">
                    <span class="warn-icon">!</span>
                    <span>尚未填写通信密钥，AI 批改功能将无法使用。请在上方填入 API Key。</span>
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

    renderProviderDropdown();
    const providerMigration = { '5plus1': '5plus1官方', 'openai': 'OpenAI兼容' };
    const providerName = providerMigration[config.provider] || config.provider || '5plus1官方';
    if (ProviderManager.data.list[providerName]) {
        ProviderManager.data.active = providerName;
        ProviderManager.save();
        document.getElementById('ai-provider').value = providerName;
    }
    // 5plus1 官方：强制使用默认网关
    if (providerName === '5plus1官方') {
        document.getElementById('api-endpoint').value = SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    } else {
        document.getElementById('api-endpoint').value = config.endpoint || SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    }
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
    if (name === '5plus1官方') {
        document.getElementById('api-endpoint').value = SCRIPT_CONFIG.DEFAULT_ENDPOINT;
    } else {
        if (provider.endpoint) document.getElementById('api-endpoint').value = provider.endpoint;
    }
    if (provider.model) document.getElementById('model-name').value = provider.model;
    if (provider.apiKey !== undefined) document.getElementById('api-key').value = provider.apiKey;
    document.getElementById('api-key-link-container').style.display = name === '5plus1官方' ? 'block' : 'none';
    updateUIVisibility();
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

    // 保存后自动关闭侧边栏
    closeSettingsPanel();
}
