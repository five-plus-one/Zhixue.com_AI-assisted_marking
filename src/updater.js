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
 * 显示更新提示对话框（非 alert，样式与项目风格一致）。
 */
function showUpdateDialog(remoteVersion) {
    const oldDialog = document.getElementById('ai-update-dialog');
    if (oldDialog) return; // 已经在显示了，不重复

    const dialog = document.createElement('div');
    dialog.id = 'ai-update-dialog';
    dialog.innerHTML = `
        <style>
            #ai-update-dialog {
                position: fixed; bottom: 30px; left: 30px; z-index: 1000000;
                background: white; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.25);
                padding: 20px 24px; width: 320px;
                font-family: sans-serif; border-left: 4px solid #67C23A;
                animation: slide-in-update 0.4s ease;
            }
            @keyframes slide-in-update {
                from { opacity: 0; transform: translateY(20px); }
                to   { opacity: 1; transform: translateY(0); }
            }
            #ai-update-dialog .upd-title { font-size: 15px; font-weight: bold; color: #303133; margin-bottom: 8px; }
            #ai-update-dialog .upd-body  { font-size: 13px; color: #606266; margin-bottom: 16px; line-height: 1.6; }
            #ai-update-dialog .upd-btns  { display: flex; gap: 8px; }
            #ai-update-dialog .upd-btn   { flex: 1; padding: 8px 0; border: none; border-radius: 6px; font-size: 13px; font-weight: bold; cursor: pointer; }
            #ai-update-dialog .upd-btn-primary { background: #67C23A; color: white; }
            #ai-update-dialog .upd-btn-secondary { background: #f0f2f5; color: #606266; }
            #ai-update-dialog .upd-btn-skip { background: none; color: #C0C4CC; font-size: 12px; border: none; cursor: pointer; margin-top: 8px; width: 100%; text-align: center; }
        </style>
        <div class="upd-title">🎉 发现新版本 v${remoteVersion}</div>
        <div class="upd-body">当前版本：v${SCRIPT_CONFIG.VERSION}<br>新版本：v${remoteVersion}<br><br>点击「立即更新」一键安装最新版本。</div>
        <div class="upd-btns">
            <button class="upd-btn upd-btn-primary" id="upd-btn-now">🚀 立即更新</button>
            <button class="upd-btn upd-btn-secondary" id="upd-btn-later">稍后提醒</button>
        </div>
        <button class="upd-btn-skip" id="upd-btn-skip">不再提醒此版本 (${remoteVersion})</button>
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
function checkForUpdate() {
    // 无人值守模式：不提醒
    if (window.aiGradingState && window.aiGradingState.unattendedMode) return;

    const now = Date.now();
    const lastCheck = GM_getValue('last-update-check', 0);
    if (now - lastCheck < SCRIPT_CONFIG.UPDATE_CHECK_INTERVAL_MS) {
        console.log(`[更新检查] 距上次检查不足 24 小时，跳过。`);
        return;
    }

    GM_setValue('last-update-check', now);
    console.log('[更新检查] 开始检查新版本...');

    GM_xmlhttpRequest({
        method: 'GET',
        url: SCRIPT_CONFIG.UPDATE_CHECK_URL + '?_t=' + now, // 加时间戳避免缓存
        timeout: 15000,
        onload: function(res) {
            if (res.status < 200 || res.status >= 300) {
                console.warn(`[更新检查] 请求失败，状态码: ${res.status}`);
                return;
            }
            const remoteVersion = extractRemoteVersion(res.responseText);
            if (!remoteVersion) {
                console.warn('[更新检查] 无法从远端文件解析版本号');
                return;
            }
            console.log(`[更新检查] 远端版本: ${remoteVersion}, 本地版本: ${SCRIPT_CONFIG.VERSION}`);

            const skippedVersion = GM_getValue('skip-update-version', '');
            if (skippedVersion === remoteVersion) {
                console.log(`[更新检查] 用户已选择跳过版本 ${remoteVersion}`);
                return;
            }

            if (compareVersions(remoteVersion, SCRIPT_CONFIG.VERSION) > 0) {
                console.log(`[更新检查] 发现新版本 ${remoteVersion}，弹出提示`);
                showUpdateDialog(remoteVersion);
            } else {
                console.log('[更新检查] 当前已是最新版本');
            }
        },
        onerror: function() {
            console.warn('[更新检查] 网络请求失败，可能是跨域限制或网络问题');
        },
        ontimeout: function() {
            console.warn('[更新检查] 请求超时');
        }
    });
}
