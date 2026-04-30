// ========== 自动检查更新模块 ==========

/**
 * 比较两个版本号字符串，返回：
 *   1  表示 a > b
 *   -1 表示 a < b
 *   0  表示相等
 */
function compareVersions(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const na = pa[i] || 0;
        const nb = pb[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}

/**
 * 从脚本文件文本中提取 @version 字段值。
 */
function extractRemoteVersion(scriptText) {
    const m = scriptText.match(/\/\/\s*@version\s+([\d.]+)/);
    return m ? m[1].trim() : null;
}

/**
 * 收集从当前版本到远端版本之间的更新日志条目。
 * 返回 HTML 字符串，若无日志则返回空字符串。
 */
function collectChangelogHTML(remoteVersion) {
    const changelog = SCRIPT_CONFIG.CHANGELOG;
    if (!changelog) return '';
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
 * 显示更新提示对话框（非 alert，样式与项目风格一致）。
 */
function showUpdateDialog(remoteVersion) {
    const oldDialog = document.getElementById('ai-update-dialog');
    if (oldDialog) return; // 已经在显示了，不重复

    const changelogHTML = collectChangelogHTML(remoteVersion);

    const dialog = document.createElement('div');
    dialog.id = 'ai-update-dialog';
    dialog.innerHTML = `
        <style>
            #ai-update-dialog {
                position: fixed; bottom: 30px; left: 30px; z-index: 1000000;
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
            #ai-update-dialog .upd-changelog { margin-bottom: 16px; max-height: 200px; overflow-y: auto; }
            #ai-update-dialog .upd-btns  { display: flex; gap: 8px; margin-bottom: 12px; }
            #ai-update-dialog .upd-btn   { flex: 1; padding: 10px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
            #ai-update-dialog .upd-btn-primary { background: #1a1a1a; color: white; }
            #ai-update-dialog .upd-btn-primary:hover { background: #333; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary { background: transparent; color: #1a1a1a; border: 1px solid rgba(0,0,0,0.1); }
            #ai-update-dialog .upd-btn-secondary:hover { background: rgba(0,0,0,0.03); }
            #ai-update-dialog .upd-btn-skip { background: none; color: #999; font-size: 12px; border: none; cursor: pointer; width: 100%; text-align: center; padding: 4px; transition: color 0.2s; }
            #ai-update-dialog .upd-btn-skip:hover { color: #1a1a1a; }
        </style>
        <div class="upd-title">发现新版本</div>
        <div class="upd-body">
            当前版本: <span class="version-tag">v${SCRIPT_CONFIG.VERSION}</span>
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
        window.open(SCRIPT_CONFIG.UPDATE_CHECK_URL, '_blank');
        dialog.remove();
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
 * 主更新检查函数。
 * - 每 24 小时至多检查一次（通过 GM_getValue 持久化上次检查时间）
 * - 无人值守模式下完全跳过，不打扰批改流程
 * - 如果远端版本 > 当前版本且用户未选择跳过该版本，则弹出提示卡片
 */
function checkForUpdate(force = false) {
    // 无人值守模式：不提醒
    if (window.aiGradingState && window.aiGradingState.gradingMode === 'unattended') return;

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
    console.log('[更新检查] 开始检查新版本...');

    GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_CONFIG.UPDATE_CHECK_URL + '?_t=' + now, // 加时间戳避免缓存
        timeout: 15000,
        onload: function(res) {
            if (res.status < 200 || res.status >= 300) {
                console.warn(`[更新检查] 请求失败，状态码: ${res.status}`);
                if (force) showToast('检查更新失败，服务器返回错误');
                return;
            }
            const remoteVersion = extractRemoteVersion(res.responseText);
            if (!remoteVersion) {
                console.warn('[更新检查] 无法从远端文件解析版本号');
                if (force) showToast('检查更新失败，无法解析版本信息');
                return;
            }
            console.log(`[更新检查] 远端版本: ${remoteVersion}, 本地版本: ${SCRIPT_CONFIG.VERSION}`);

            const skippedVersion = GM_getValue('skip-update-version', '');
            if (skippedVersion === remoteVersion && !force) {
                console.log(`[更新检查] 用户已选择跳过版本 ${remoteVersion}`);
                return;
            }

            if (compareVersions(remoteVersion, SCRIPT_CONFIG.VERSION) > 0) {
                console.log(`[更新检查] 发现新版本 ${remoteVersion}，弹出提示`);
                showUpdateDialog(remoteVersion);
            } else {
                console.log('[更新检查] 当前已是最新版本');
                if (force) showToast('当前已是最新版本');
            }
        },
        onerror: function() {
            console.warn('[更新检查] 网络请求失败，可能是跨域限制或网络问题');
            if (force) showToast('检查更新失败，请检查网络');
        },
        ontimeout: function() {
            console.warn('[更新检查] 请求超时');
            if (force) showToast('检查更新超时，请检查网络');
        }
    });
}
