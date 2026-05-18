// ========== 自动检查更新模块 ==========

/**
 * 获取当前渠道的更新 URL。
 * 读取用户选择的渠道（GM_setValue），返回对应的 manifestUrl 和 scriptUrl。
 */
function getChannelUrls() {
    const channel = GM_getValue('ai-grading-channel', 'stable');
    const channels = SCRIPT_CONFIG.CHANNELS || {};
    return channels[channel] || channels.stable || {
        manifestUrl: SCRIPT_CONFIG.MANIFEST_URL,
        scriptUrl: SCRIPT_CONFIG.UPDATE_CHECK_URL,
    };
}

/**
 * 获取当前渠道名称标识。
 */
function getChannelName() {
    return GM_getValue('ai-grading-channel', 'stable');
}

/**
 * 获取当前渠道的中文标签。
 */
function getChannelLabel() {
    const channel = getChannelName();
    const channels = SCRIPT_CONFIG.CHANNELS || {};
    return (channels[channel] || channels.stable || {}).label || '稳定版';
}

/**
 * 获取当前脚本的构建渠道（build-time，由 build.js 注入）。
 * 用于显示渠道标签 badge，与用户选择的更新渠道无关。
 */
function getBuildChannel() {
    return (SCRIPT_CONFIG.CHANNEL || 'stable').split('-')[0];
}

/**
 * 获取当前脚本构建渠道的中文标签。
 */
function getBuildChannelLabel() {
    const channel = getBuildChannel();
    const channels = SCRIPT_CONFIG.CHANNELS || {};
    return (channels[channel] || channels.stable || {}).label || '稳定版';
}

/**
 * 比较两个版本号字符串，返回：
 *   1  表示 a > b
 *   -1 表示 a < b
 *   0  表示相等
 *
 * 支持带后缀的版本号（如 1.21.5.115-preview.3），
 * 比较时忽略 -preview / -dev 等后缀，仅比较数字部分。
 */
function compareVersions(a, b) {
    // 按 '-' 分割取数字部分，忽略渠道后缀
    const numsA = a.split('-')[0].split('.').map(Number);
    const numsB = b.split('-')[0].split('.').map(Number);
    const len = Math.max(numsA.length, numsB.length);
    for (let i = 0; i < len; i++) {
        const na = numsA[i] || 0;
        const nb = numsB[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

/**
 * 从脚本文件文本中提取 @version 字段值。
 * 支持带后缀的版本号（如 1.21.5.115-preview.3）。
 */
function extractRemoteVersion(scriptText) {
    const m = scriptText.match(/\/\/\s*@version\s+([\w.\-]+)/);
    return m ? m[1].trim() : null;
}

/**
 * 从远端脚本文本中提取 CHANGELOG 对象。
 * 通过正则匹配 CHANGELOG: { ... } 块，然后用 Function 构造器安全解析。
 */
function extractRemoteChangelog(scriptText) {
    try {
        // 匹配 CHANGELOG: { ... } 内容（支持多行，到下一个 }; 或 } 结尾）
        const match = scriptText.match(/CHANGELOG\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
        if (!match) return null;
        // 用 Function 安全求值，避免 eval
        const fn = new Function('return ' + match[1]);
        const obj = fn();
        return (obj && typeof obj === 'object') ? obj : null;
    } catch {
        return null;
    }
}

/**
 * 收集从当前版本到远端版本之间的更新日志条目。
 * 返回 HTML 字符串，若无日志则返回空字符串。
 * @param {string} remoteVersion - 远端版本号
 * @param {Object|null} remoteChangelog - 远端 changelog 对象（优先使用），为空时返回空字符串
 */
function collectChangelogHTML(remoteVersion, remoteChangelog) {
    const changelog = remoteChangelog;
    if (!changelog || typeof changelog !== 'object') return '';
    const versions = Object.keys(changelog)
        .filter(v => compareVersions(v, SCRIPT_CONFIG.VERSION) > 0 && compareVersions(v, remoteVersion) <= 0)
        .sort((a, b) => compareVersions(b, a)); // 降序
    if (!versions.length) return '';
    return versions.map(v => {
        const items = changelog[v].map(item => `<li>${item}</li>`).join('');
        return `<div style="margin-bottom:8px;"><span class="version-tag">v${v}</span><ul style="margin:4px 0 0 16px;padding:0;font-size:12px;color:#666;line-height:1.8;">${items}</ul></div>`;
    }).join('');
}

/**
 * 显示渠道切换引导弹窗（dev 渠道强提示）。
 * 基于 showBatchTargetDialog 的三选项模式。
 * @returns {Promise<'stable'|'preview'|'stay'>}
 */
function showChannelSwitchDialog() {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.style.zIndex = '1000020';
        overlay.innerHTML = `
            <div class="ai-modal-card" style="max-width:420px;">
                <div class="ai-modal-header" style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:20px;">⚠️</span>
                    <span>开发版渠道提醒</span>
                </div>
                <div class="ai-modal-body">
                    <p style="margin:0 0 12px;">开发版包含未经充分测试的功能，可能存在<strong style="color:#e74c3c;">极强的不稳定性</strong>，强烈建议切换到稳定版或预览版。</p>
                    <p style="margin:0;font-size:12px;color:#999;">稳定版经过充分测试，适合日常使用；预览版适合提前体验新功能。</p>
                </div>
                <div class="ai-modal-footer" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;gap:10px;">
                        <button class="ai-modal-btn-confirm" data-action="stable" style="flex:1;background:#1a1a1a;">切换到稳定版</button>
                        <button class="ai-modal-btn-cancel" data-action="preview" style="flex:1;">切换到预览版</button>
                    </div>
                    <button class="ai-modal-btn-secondary" data-action="stay" style="margin-top:4px;">继续使用开发版（不推荐）</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('[data-action="stable"]').onclick = e => { e.stopPropagation(); close('stable'); };
        overlay.querySelector('[data-action="preview"]').onclick = e => { e.stopPropagation(); close('preview'); };
        overlay.querySelector('[data-action="stay"]').onclick = e => { e.stopPropagation(); close('stay'); };
        overlay.querySelector('[data-action="stable"]').focus();
    });
}

/**
 * 执行渠道切换：设置渠道值 → 刷新页面。
 */
function switchChannel(channel) {
    GM_setValue('ai-grading-channel', channel);
    const label = (SCRIPT_CONFIG.CHANNELS[channel] || {}).label || channel;
    showToast(`已切换到${label}，正在刷新…`);
    setTimeout(() => location.reload(), 600);
}

/**
 * 显示更新提示对话框（非 alert，样式与项目风格一致）。
 */
function showUpdateDialog(remoteVersion, remoteChangelog) {
    const oldDialog = document.getElementById('ai-update-dialog');
    if (oldDialog) return; // 已经在显示了，不重复

    const changelogHTML = collectChangelogHTML(remoteVersion, remoteChangelog);
    const channelLabel = getChannelLabel();
    const channelUrls = getChannelUrls();

    const dialog = document.createElement('div');
    dialog.id = 'ai-update-dialog';
    dialog.innerHTML = `
        <style>
            #ai-update-dialog {
                position: fixed; bottom: 30px; left: 30px; z-index: 1000020;
                background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(0,0,0,0.06); border-radius: 12px;
                box-shadow: 0 16px 40px rgba(0,0,0,0.1), 0 4px 12px rgba(0,0,0,0.04);
                padding: 24px; width: 320px; max-height: 70vh; overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                animation: slide-in-update 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes slide-in-update {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            #ai-update-dialog .upd-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; letter-spacing: 0.3px; }
            #ai-update-dialog .upd-body  { font-size: 13px; color: #666; margin-bottom: 16px; line-height: 1.6; }
            .version-tag { display: inline-block; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px; font-family: "SF Mono", monospace; font-size: 12px; }
            .channel-tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 500; }
            .channel-tag-stable { background: rgba(52,199,89,0.12); color: rgba(52,199,89,0.9); }
            .channel-tag-preview { background: rgba(255,159,10,0.12); color: rgba(255,159,10,0.9); }
            .channel-tag-dev { background: rgba(88,86,214,0.12); color: rgba(88,86,214,0.9); }
            #ai-update-dialog .upd-changelog { margin-bottom: 16px; max-height: 200px; overflow-y: auto; }
            #ai-update-dialog .upd-btns  { display: flex; gap: 8px; margin-bottom: 12px; }
            #ai-update-dialog .upd-btn   { flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
            #ai-update-dialog .upd-btn-primary { background: #1a1a1a; color: white; }
            #ai-update-dialog .upd-btn-primary:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary { background: transparent; color: #1a1a1a; border: 1px solid rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary:hover { background: rgba(0,0,0,0.03); }
            #ai-update-dialog .upd-btn-skip { background: none; color: #999; font-size: 12px; border: none; cursor: pointer; width: 100%; text-align: center; padding: 4px; transition: color 0.2s; }
            #ai-update-dialog .upd-btn-skip:hover { color: #1a1a1a; }
            #ai-update-dialog .upd-channel-section { margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0,0,0,0.06); }
            #ai-update-dialog .upd-channel-hint { font-size: 12px; color: #666; text-align: center; }
            #ai-update-dialog .upd-channel-hint .upd-btn-link { background: none; border: none; color: #0066cc; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }
            #ai-update-dialog .upd-channel-hint .upd-btn-link:hover { color: #004499; }
            #ai-update-dialog .upd-channel-warning { background: rgba(255,59,48,0.06); border: 1px solid rgba(255,59,48,0.15); border-radius: 8px; padding: 12px; margin-top: 12px; }
            #ai-update-dialog .upd-channel-warning-text { font-size: 12px; color: #c0392b; margin-bottom: 10px; line-height: 1.5; }
            #ai-update-dialog .upd-channel-warning-btns { display: flex; gap: 8px; }
            #ai-update-dialog .upd-btn-warn { flex: 1; padding: 8px 0; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; background: #c0392b; color: white; }
            #ai-update-dialog .upd-btn-warn:hover { background: #a93226; }
            #ai-update-dialog .upd-btn-warn-secondary { flex: 1; padding: 8px 0; border: 1px solid rgba(0,0,0,0.12); border-radius: 6px; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.2s; background: transparent; color: #1a1a1a; }
            #ai-update-dialog .upd-btn-warn-secondary:hover { background: rgba(0,0,0,0.03); }
        </style>
        <div class="upd-title">发现${channelLabel}新版本</div>
        <div class="upd-body">
            当前版本: <span class="version-tag">v${SCRIPT_CONFIG.VERSION}</span>
            <span class="channel-tag channel-tag-${getChannelName()}">${channelLabel}</span>
            &nbsp;→&nbsp;
            最新版本: <span class="version-tag">v${remoteVersion}</span>
        </div>
        ${changelogHTML ? `<div class="upd-changelog">${changelogHTML}</div>` : ''}
        <div class="upd-btns">
            <button class="upd-btn upd-btn-primary" id="upd-btn-now">立即更新</button>
            <button class="upd-btn upd-btn-secondary" id="upd-btn-later">稍后</button>
        </div>
        <button class="upd-btn-skip" id="upd-btn-skip">跳过此版本</button>
    `;
    document.body.appendChild(dialog);

    dialog.querySelector('#upd-btn-now').addEventListener('click', () => {
        window.open(channelUrls.scriptUrl, '_blank');
        let cancelled = false, elapsed = 0;
        const bodyEl = dialog.querySelector('.upd-body');
        bodyEl.innerHTML = `<span style="color:#1a1a1a;font-weight:500;">请在新标签页中确认安装更新</span><br><span style="font-size:12px;color:#999;margin-top:4px;display:inline-block;">安装完成后页面将自动刷新</span><div style="margin-top:10px;display:flex;align-items:center;gap:8px;"><span class="upd-spinner" style="width:14px;height:14px;border-width:2px;"></span><span id="upd-poll-status" style="font-size:12px;color:#666;">等待安装中</span></div>`;
        dialog.querySelector('.upd-changelog') && (dialog.querySelector('.upd-changelog').style.display = 'none');
        dialog.querySelector('.upd-btns').innerHTML = '<button class="upd-btn upd-btn-secondary" id="upd-btn-refresh" style="flex:1;">立即刷新</button><button class="upd-btn upd-btn-secondary" id="upd-btn-cancel" style="flex:1;">取消</button>';
        dialog.querySelector('#upd-btn-skip').style.display = 'none';
        const statusEl = dialog.querySelector('#upd-poll-status');

        // 立即刷新按钮
        dialog.querySelector('#upd-btn-refresh').addEventListener('click', () => {
            cancelled = true;
            sessionStorage.setItem('ai-update-reloaded', 'true');
            location.reload();
        });

        // 定时器：显示已等待时间，60 秒后自动刷新（兜底）
        const maxWait = 60;
        const waitTimer = setInterval(() => {
            if (cancelled) { clearInterval(waitTimer); return; }
            elapsed += 1;
            if (statusEl) statusEl.textContent = `请在新标签页完成安装 (${elapsed}/${maxWait}s)`;
            if (elapsed >= maxWait) {
                clearInterval(waitTimer);
                if (statusEl) statusEl.textContent = '正在刷新页面…';
                sessionStorage.setItem('ai-update-reloaded', 'true');
                setTimeout(() => location.reload(), 500);
            }
        }, 1000);

        dialog.querySelector('#upd-btn-cancel').addEventListener('click', () => {
            cancelled = true;
            clearInterval(waitTimer);
            dialog.remove();
        });
    });

    dialog.querySelector('#upd-btn-later').addEventListener('click', () => {
        dialog.remove();
    });

    dialog.querySelector('#upd-btn-skip').addEventListener('click', () => {
        GM_setValue('skip-update-version', remoteVersion);
        dialog.remove();
        console.log(`[更新检查] 已跳过版本 ${remoteVersion}`);
    });
}

/**
 * 处理更新检查结果（统一处理版本比较和弹窗逻辑）
 */
function handleUpdateResult(remoteVersion, remoteChangelog, force, restoreBtn) {
    if (restoreBtn) restoreBtn();

    if (!remoteVersion) {
        console.warn('[更新检查] 无法解析版本号');
        if (force) showToast('检查更新失败，无法解析版本信息');
        return;
    }

    console.log(`[更新检查] 远端版本: ${remoteVersion}, 本地版本: ${SCRIPT_CONFIG.VERSION}, 渠道: ${getChannelName()}`);

    const skippedVersion = GM_getValue('skip-update-version', '');
    if (skippedVersion === remoteVersion && !force) {
        console.log(`[更新检查] 用户已选择跳过版本 ${remoteVersion}`);
        return;
    }

    if (compareVersions(remoteVersion, SCRIPT_CONFIG.VERSION) > 0) {
        console.log(`[更新检查] 发现新版本 ${remoteVersion}，弹出提示`);
        showUpdateDialog(remoteVersion, remoteChangelog);
    } else {
        console.log('[更新检查] 当前已是最新版本');
        if (force) showToast('当前已是最新版本');
    }
}

/**
 * 降级检查：下载完整脚本文件（~180KB）
 */
function fallbackCheckFullScript(force, btn, restoreBtn, now) {
    console.log('[更新检查] manifest.json 检查失败，降级检查完整脚本...');

    const channelUrls = getChannelUrls();

    GM_xmlhttpRequest({
        method: 'GET',
        url: channelUrls.scriptUrl + '?_t=' + now,
        timeout: 15000,
        onload: function(res) {
            if (res.status < 200 || res.status >= 300) {
                console.warn(`[更新检查] 请求失败，状态码: ${res.status}`);
                if (restoreBtn) restoreBtn();
                if (force) showToast('检查更新失败，服务器返回错误');
                return;
            }
            const remoteVersion = extractRemoteVersion(res.responseText);
            const remoteChangelog = extractRemoteChangelog(res.responseText);
            handleUpdateResult(remoteVersion, remoteChangelog, force, restoreBtn);
        },
        onerror: function() {
            if (restoreBtn) restoreBtn();
            console.warn('[更新检查] 网络请求失败，可能是跨域限制或网络问题');
            if (force) showToast('检查更新失败，请检查网络');
        },
        ontimeout: function() {
            if (restoreBtn) restoreBtn();
            console.warn('[更新检查] 请求超时');
            if (force) showToast('检查更新超时，请检查网络');
        }
    });
}

/**
 * 主更新检查函数。
 * - 优先检查轻量级 manifest.json（~1KB）
 * - 失败时降级检查完整脚本文件（~180KB）
 * - 每 24 小时至多检查一次
 * - 无人值守模式下完全跳过
 */
function checkForUpdate(force = false, btn) {
    // 无人值守模式：自动检查跳过，手动检查（force）仍然执行
    if (!force && window.aiGradingState && window.aiGradingState.gradingMode === 'unattended') return;

    if (!force) {
        const now = Date.now();
        const lastCheck = GM_getValue('last-update-check', 0);
        if (now - lastCheck < SCRIPT_CONFIG.UPDATE_CHECK_INTERVAL_MS) {
            console.log(`[更新检查] 距上次检查不足 24 小时，跳过。`);
            return;
        }
        GM_setValue('last-update-check', now);
    }

    const now = Date.now();
    const channelUrls = getChannelUrls();
    console.log(`[更新检查] 开始检查新版本... [渠道: ${getChannelName()}]`);

    if (btn) {
        btn._origText = btn.textContent;
        btn.disabled = true;
        btn.innerHTML = '<span class="upd-spinner"></span> 检查中…';
        if (!document.getElementById('upd-spinner-style')) {
            const s = document.createElement('style');
            s.id = 'upd-spinner-style';
            s.textContent = '.upd-spinner{display:inline-block;width:12px;height:12px;border:2px solid rgba(0,0,0,0.15);border-top-color:#1a1a1a;border-radius:50%;animation:upd-spin .6s linear infinite;vertical-align:middle;margin-right:4px}@keyframes upd-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(s);
        }
    }
    const restoreBtn = () => { if (btn) { btn.disabled = false; btn.textContent = btn._origText || '检查更新'; } };

    // 第一级：尝试检查轻量级 manifest.json（~1KB，超时更短）
    GM_xmlhttpRequest({
        method: 'GET',
        url: channelUrls.manifestUrl + '?_t=' + now,
        timeout: 5000,
        onload: function(res) {
            if (res.status >= 200 && res.status < 300) {
                try {
                    const manifest = JSON.parse(res.responseText);
                    if (manifest.version) {
                        console.log('[更新检查] 成功从 manifest.json 获取版本信息');
                        handleUpdateResult(manifest.version, manifest.changelog, force, restoreBtn);
                        return;
                    }
                } catch (e) {
                    console.warn('[更新检查] manifest.json 解析失败:', e.message);
                }
            }
            // 降级：检查完整脚本
            fallbackCheckFullScript(force, btn, restoreBtn, now);
        },
        onerror: function() {
            console.warn('[更新检查] manifest.json 请求失败，降级检查完整脚本');
            fallbackCheckFullScript(force, btn, restoreBtn, now);
        },
        ontimeout: function() {
            console.warn('[更新检查] manifest.json 请求超时，降级检查完整脚本');
            fallbackCheckFullScript(force, btn, restoreBtn, now);
        }
    });
}
