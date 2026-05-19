// ========== 工具页面 UI ==========
// 用于 /tools 页面，提供历史记录、关于、检查更新等功能入口

function createToolsPageUI() {
    // 注入样式（使用 VitePress CSS 变量适配深浅色主题）
    const style = document.createElement('style');
    style.textContent = `
        #ai-tools-page {
            font-family: var(--vp-font-family-base, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif);
            max-width: 600px;
            margin: 0 auto;
            padding: 40px 24px;
            text-align: center;
        }

        .ai-tools-title {
            margin: 0 0 8px;
            font-size: 24px;
            font-weight: 700;
            color: var(--vp-c-text-1, #1a1a1a);
        }

        .ai-tools-subtitle {
            margin: 0;
            color: var(--vp-c-text-2, #86868b);
            font-size: 14px;
        }

        .ai-tools-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            margin: 32px 0;
        }

        .ai-tools-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px 16px;
            background: var(--vp-c-bg-soft, rgba(0,0,0,0.02));
            border: 1px solid var(--vp-c-divider, rgba(0,0,0,0.08));
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .ai-tools-btn:hover {
            background: var(--vp-c-bg, white);
            border-color: var(--vp-c-border-active, rgba(0,0,0,0.2));
            box-shadow: 0 4px 12px rgba(0,0,0,0.08);
            transform: translateY(-2px);
        }

        .ai-tools-btn .icon {
            font-size: 32px;
            line-height: 1;
        }

        .ai-tools-btn .label,
        .ai-tools-btn-label {
            font-size: 14px;
            font-weight: 500;
            color: var(--vp-c-text-1, #1a1a1a);
        }

        .ai-tools-status {
            margin-top: 32px;
            padding: 16px;
            background: var(--vp-c-bg-soft, rgba(0,0,0,0.02));
            border-radius: 10px;
            border: 1px solid var(--vp-c-divider, rgba(0,0,0,0.06));
        }

        .ai-tools-status-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
        }

        .ai-tools-status-row:not(:last-child) {
            border-bottom: 1px solid var(--vp-c-divider, rgba(0,0,0,0.04));
        }

        .ai-tools-status .label,
        .ai-tools-status-label {
            font-size: 13px;
            color: var(--vp-c-text-2, #86868b);
        }

        .ai-tools-status .value,
        .ai-tools-status-value {
            font-size: 13px;
            font-weight: 600;
            color: var(--vp-c-text-1, #1a1a1a);
        }

        .ai-tools-status .value.success,
        .ai-tools-status-value.success {
            color: #34A853;
        }

        .ai-tools-links {
            margin-top: 24px;
            display: flex;
            justify-content: center;
            gap: 16px;
            flex-wrap: wrap;
        }

        .ai-tools-link {
            font-size: 12px;
            color: var(--vp-c-text-2, #86868b);
            text-decoration: none;
            transition: color 0.2s;
        }

        .ai-tools-link:hover {
            color: var(--vp-c-brand, #0052FF);
        }

        #ai-tools-page {
            max-width: 760px;
            padding: 48px 24px;
            text-align: left;
            color-scheme: light only;
        }
        .ai-tools-title {
            font-size: 30px;
            letter-spacing: 0;
            color: #172033;
        }
        .ai-tools-subtitle {
            color: #667085;
            font-weight: 600;
        }
        .ai-tools-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin: 28px 0;
        }
        .ai-tools-btn {
            align-items: flex-start;
            min-height: 128px;
            padding: 20px;
            background: #fff;
            border: 1px solid #e1e6ef;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(18,28,45,0.04);
        }
        .ai-tools-btn:hover {
            background: #f7f8fa;
            border-color: #cbd5e1;
            box-shadow: 0 10px 26px rgba(18,28,45,0.1);
        }
        .ai-tools-btn .icon,
        .ai-tools-btn-icon {
            width: 40px;
            height: 40px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: #eef7f1;
            border: 1px solid #cfe8d7;
            border-radius: 8px;
            font-size: 22px;
        }
        .ai-tools-btn .label,
        .ai-tools-btn-label {
            color: #172033;
            font-weight: 750;
        }
        .ai-tools-status {
            background: #fff;
            border: 1px solid #e1e6ef;
            border-radius: 8px;
        }
        .ai-tools-status .label,
        .ai-tools-status-label { color: #667085; font-weight: 600; }
        .ai-tools-status .value,
        .ai-tools-status-value { color: #172033; font-weight: 750; }
        .ai-tools-status .value.success,
        .ai-tools-status-value.success { color: #287047; }
        .ai-tools-links { justify-content: flex-start; }
        .ai-tools-link { color: #667085; font-weight: 700; }
        .ai-tools-link:hover { color: #2166ad; }
        @media (max-width: 720px) {
            .ai-tools-grid { grid-template-columns: 1fr; }
            #ai-tools-page { padding: 32px 16px; }
        }

        /* The tools page lives inside the docs site, so page text follows the docs theme.
           Cards stay light because they are script-owned controls. */
        #ai-tools-page {
            color-scheme: inherit;
            color: var(--vp-c-text-1, #172033) !important;
        }
        .ai-tools-title {
            color: var(--vp-c-text-1, #172033) !important;
        }
        .ai-tools-subtitle {
            color: var(--vp-c-text-2, #667085) !important;
        }
        .ai-tools-links {
            color: var(--vp-c-text-2, #667085) !important;
        }
        .ai-tools-link {
            color: var(--vp-c-brand-1, var(--vp-c-brand, #2166ad)) !important;
        }
        .ai-tools-link:hover {
            color: var(--vp-c-brand-2, #174f8a) !important;
        }
        #ai-tools-page .ai-tools-btn,
        #ai-tools-page .ai-tools-status {
            background: var(--vp-c-bg-soft, #f6f6f7) !important;
            border-color: var(--vp-c-divider, #e2e2e3) !important;
            color: var(--vp-c-text-1, #172033) !important;
            -webkit-text-fill-color: currentColor !important;
            opacity: 1 !important;
            filter: none !important;
            mix-blend-mode: normal !important;
        }
        #ai-tools-page .ai-tools-btn:hover {
            background: var(--vp-c-bg-alt, var(--vp-c-bg, #ffffff)) !important;
            border-color: var(--vp-c-border, #cbd5e1) !important;
        }
        #ai-tools-page .ai-tools-btn-label,
        #ai-tools-page .ai-tools-status-value {
            display: block !important;
            color: var(--vp-c-text-1, #172033) !important;
            -webkit-text-fill-color: var(--vp-c-text-1, #172033) !important;
            opacity: 1 !important;
            text-shadow: none !important;
        }
        #ai-tools-page .ai-tools-status-label {
            display: block !important;
            color: var(--vp-c-text-2, #667085) !important;
            -webkit-text-fill-color: var(--vp-c-text-2, #667085) !important;
            opacity: 1 !important;
            text-shadow: none !important;
        }
        #ai-tools-page .ai-tools-status-value.success {
            color: #2f9e44 !important;
            -webkit-text-fill-color: #2f9e44 !important;
        }
        #ai-tools-page .ai-tools-btn-icon {
            background: color-mix(in srgb, var(--vp-c-brand-1, #2166ad) 12%, transparent) !important;
            border-color: color-mix(in srgb, var(--vp-c-brand-1, #2166ad) 24%, transparent) !important;
            -webkit-text-fill-color: initial !important;
        }
    `;
    document.head.appendChild(style);

    // 创建容器
    const container = document.createElement('div');
    container.id = 'ai-tools-page';
    container.innerHTML = `
        <h1 class="ai-tools-title">AI 批改助手</h1>
        <p class="ai-tools-subtitle">工具与设置</p>

        <div class="ai-tools-grid">
            <div class="ai-tools-btn" id="btn-open-history">
                <span class="ai-tools-btn-icon" aria-hidden="true">📊</span>
                <span class="ai-tools-btn-label">评阅历史</span>
            </div>
            <div class="ai-tools-btn" id="btn-open-about">
                <span class="ai-tools-btn-icon" aria-hidden="true">ℹ️</span>
                <span class="ai-tools-btn-label">关于</span>
            </div>
            <div class="ai-tools-btn" id="btn-check-update">
                <span class="ai-tools-btn-icon" aria-hidden="true">🔄</span>
                <span class="ai-tools-btn-label">检查更新</span>
            </div>
        </div>

        <div class="ai-tools-status">
            <div class="ai-tools-status-row">
                <span class="ai-tools-status-label">脚本版本</span>
                <span class="ai-tools-status-value">v${SCRIPT_CONFIG.VERSION}</span>
            </div>
            <div class="ai-tools-status-row">
                <span class="ai-tools-status-label">脚本状态</span>
                <span class="ai-tools-status-value success">已安装</span>
            </div>
            <div class="ai-tools-status-row">
                <span class="ai-tools-status-label">支持平台</span>
                <span class="ai-tools-status-value">7 个</span>
            </div>
        </div>

        <div class="ai-tools-links">
            <a href="https://aimarking.five-plus-one.com/" target="_blank" class="ai-tools-link">帮助文档</a>
            <a href="https://github.com/five-plus-one/AI-Marker-Suite" target="_blank" class="ai-tools-link">GitHub</a>
            <a href="https://r-l.ink/contact" target="_blank" class="ai-tools-link">联系作者</a>
        </div>
    `;

    // 插入到页面
    const target = document.getElementById('ai-tools-root') ||
                   document.querySelector('.theme-doc-markdown') ||
                   document.body;
    target.innerHTML = '';
    target.appendChild(container);

    // 绑定事件
    document.getElementById('btn-open-history').onclick = () => {
        showHistoryPanel();
    };

    document.getElementById('btn-open-about').onclick = () => {
        showAboutPanel();
    };

    document.getElementById('btn-check-update').onclick = () => {
        checkForUpdate(true);
    };

    console.log('✅ [工具页面] UI 初始化完成');
}

// ========== 关于面板 ==========
function showAboutPanel() {
    // 确保弹窗样式已注入
    if (typeof G === 'function') {
        G(); // 调用 initModalStyles 的别名
    } else if (typeof initModalStyles === 'function') {
        initModalStyles();
    } else {
        // 手动注入弹窗样式
        if (!document.getElementById('ai-modal-styles')) {
            const modalStyle = document.createElement('style');
            modalStyle.id = 'ai-modal-styles';
            modalStyle.textContent = `
                .ai-modal-overlay {
                    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                    background: rgba(0,0,0,0.25); backdrop-filter: blur(6px);
                    z-index: 1000010;
                    display: flex; justify-content: center; align-items: center;
                    animation: ai-modal-fadein 0.25s ease-out;
                }
                @keyframes ai-modal-fadein { from { opacity: 0; } to { opacity: 1; } }
                .ai-modal-card {
                    background: rgba(255, 255, 255, 0.96);
                    backdrop-filter: blur(32px) saturate(180%);
                    border: 1px solid rgba(255, 255, 255, 0.6);
                    border-radius: 20px;
                    box-shadow: 0 40px 80px rgba(0,0,0,0.12);
                    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                    animation: ai-modal-scalein 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                }
                @keyframes ai-modal-scalein { from { transform: scale(0.96) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
            `;
            document.head.appendChild(modalStyle);
        }
    }

    // 创建弹窗
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.style.zIndex = '1000010';

    overlay.innerHTML = `
        <div class="ai-modal-card" style="max-width:500px;max-height:85vh;display:flex;flex-direction:column;">
            <div class="ai-modal-header" style="display:flex;justify-content:space-between;align-items:center;padding:20px 24px 16px;border-bottom:1px solid rgba(0,0,0,0.06);">
                <span style="font-size:16px;font-weight:600;color:#1d1d1f;">关于 AI 批改助手</span>
                <button style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:4px 8px;border-radius:6px;transition:all 0.2s;" id="about-close">×</button>
            </div>
            <div class="ai-modal-body" style="overflow-y:auto;flex:1;padding:20px 24px;">
                <div style="text-align:center;margin-bottom:24px;">
                    <div style="width:64px;height:64px;margin:0 auto 12px;background:linear-gradient(135deg,#1a1a1a 0%,#333 100%);border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:28px;color:white;">AI</div>
                    <h2 style="margin:0 0 4px;font-size:18px;font-weight:600;color:#1a1a1a;">AI 批改助手</h2>
                    <p style="margin:0;font-size:13px;color:#86868b;">版本 ${SCRIPT_CONFIG.VERSION} <span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:500;vertical-align:middle;background:rgba(${getBuildChannel() === 'stable' ? '52,199,89' : getBuildChannel() === 'preview' ? '255,159,10' : '88,86,214'},0.12);color:rgba(${getBuildChannel() === 'stable' ? '52,199,89' : getBuildChannel() === 'preview' ? '255,159,10' : '88,86,214'},0.9);">${getBuildChannelLabel()}</span></p>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">帮助与支持</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                        <a href="https://aimarking.five-plus-one.com/" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:8px;color:#1a1a1a;text-decoration:none;font-size:13px;transition:all 0.2s;">
                            <span style="font-size:16px;width:20px;text-align:center;">📖</span>
                            <div style="flex:1;">
                                <div>帮助文档</div>
                                <div style="font-size:11px;color:#86868b;margin-top:2px;">查看使用教程和常见问题</div>
                            </div>
                        </a>
                        <a href="https://github.com/five-plus-one/AI-Marker-Suite" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:8px;color:#1a1a1a;text-decoration:none;font-size:13px;transition:all 0.2s;">
                            <span style="font-size:16px;width:20px;text-align:center;">💻</span>
                            <div style="flex:1;">
                                <div>GitHub 仓库</div>
                                <div style="font-size:11px;color:#86868b;margin-top:2px;">查看源代码、提交反馈</div>
                            </div>
                        </a>
                        <a href="https://r-l.ink/contact" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(0,0,0,0.02);border:1px solid rgba(0,0,0,0.06);border-radius:8px;color:#1a1a1a;text-decoration:none;font-size:13px;transition:all 0.2s;">
                            <span style="font-size:16px;width:20px;text-align:center;">📧</span>
                            <div style="flex:1;">
                                <div>联系作者</div>
                                <div style="font-size:11px;color:#86868b;margin-top:2px;">反馈问题、请求适配更多平台</div>
                            </div>
                        </a>
                    </div>
                </div>

                <div style="margin-bottom:20px;">
                    <div style="font-size:12px;font-weight:600;color:#86868b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:10px;">支持平台</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">智学网</span>
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">七天网络</span>
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">好分数</span>
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">五岳阅卷</span>
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">华翰云</span>
                        <span style="padding:4px 10px;background:rgba(0,0,0,0.04);border-radius:6px;font-size:12px;color:#666;">光大阅卷</span>
                    </div>
                </div>

                <div style="background:linear-gradient(135deg,#fff9e6 0%,#fff3cc 100%);border:1px solid rgba(255,193,7,0.3);border-radius:12px;padding:16px;margin-bottom:20px;">
                    <div style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:8px;">☕ 支持作者</div>
                    <div style="font-size:12px;color:#666;margin-bottom:12px;line-height:1.5;">如果这个工具对您有帮助，欢迎请作者喝杯咖啡！</div>
                    <div style="display:flex;gap:16px;justify-content:center;">
                        <div style="text-align:center;">
                            <img src="https://r-l.ink/paywx1" alt="微信赞赏" style="width:120px;height:120px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);" onerror="this.style.display='none'">
                            <div style="font-size:11px;color:#666;margin-top:6px;">微信赞赏</div>
                        </div>
                        <div style="text-align:center;">
                            <img src="https://r-l.ink/payzfb1" alt="支付宝赞赏" style="width:120px;height:120px;border-radius:8px;border:1px solid rgba(0,0,0,0.1);" onerror="this.style.display='none'">
                            <div style="font-size:11px;color:#666;margin-top:6px;">支付宝赞赏</div>
                        </div>
                    </div>
                </div>

                <div style="text-align:center;font-size:11px;color:#aaa;margin-top:16px;">
                    <div>AI 批改助手 © ${new Date().getFullYear()} Five Plus One</div>
                    <div style="margin-top:4px;">Made with ❤️ for teachers</div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // 绑定关闭事件
    const closeBtn = document.getElementById('about-close');
    closeBtn.onclick = () => overlay.remove();
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };
}

// 将函数暴露到全局作用域，以便 onclick 可以调用
if (typeof window !== 'undefined') {
    window.showAboutPanel = showAboutPanel;
    window.showHistoryPanel = showHistoryPanel;
    window.checkForUpdate = checkForUpdate;
    window.resetBatchProgress = resetBatchProgress;
}
