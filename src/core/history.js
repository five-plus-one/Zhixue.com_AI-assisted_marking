// ========== IndexedDB 图片存储 ==========
const ImageStore = {
    DB_NAME: 'ai-marker-images',
    STORE_NAME: 'images',
    DB_VERSION: 1,
    _db: null,

    async getDB() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
            req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async save(recordId, base64Array) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(base64Array, recordId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    },

    async get(recordId) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const req = tx.objectStore(this.STORE_NAME).get(recordId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async delete(recordId) {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete(recordId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    },

    async clear() {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
    }
};

// ========== 评阅历史模块 ==========
const HistoryManager = {
    records: [],
    returnUrl: null,

    init() {
        const saved = GM_getValue('ai-grading-history');
        this.records = saved ? JSON.parse(saved) : [];

        // 迁移旧记录：将 GM_setValue 中的 imageBase64s 迁移到 IndexedDB
        const toMigrate = this.records.filter(r => r.imageBase64s && r.imageBase64s.length > 0);
        if (toMigrate.length > 0) {
            console.log(`[历史] 迁移 ${toMigrate.length} 条旧记录的图片到 IndexedDB...`);
            toMigrate.forEach(r => {
                ImageStore.save(r.id, r.imageBase64s).catch(() => {});
                delete r.imageBase64s;
            });
            this.save(); // 写回不含 base64 的元数据
        }
    },

    save() {
        if (this.records.length > 500) this.records = this.records.slice(0, 500);
        GM_setValue('ai-grading-history', JSON.stringify(this.records));
    },

    add(record) {
        record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        record.timestamp = Date.now();
        record.status = record.status || 'submitted';
        record.isCorrected = record.isCorrected || false;
        record.pageUrl = window.location.pathname + window.location.hash;
        record.taskIdentifier = PresetManager.getTaskIdentifier();

        // 图片存 IndexedDB，不存入 GM_setValue
        const imageBase64s = record.imageBase64s;
        delete record.imageBase64s;

        this.records.unshift(record);
        this.save();

        // 异步存图片，不阻塞主流程
        if (imageBase64s && imageBase64s.length > 0) {
            ImageStore.save(record.id, imageBase64s).catch(e =>
                console.warn('[历史] 图片存入 IndexedDB 失败:', e)
            );
        }

        console.log(`📝 [历史] 已记录评阅: ${record.studentAnswer?.slice(0, 20)}... → ${record.finalScore}分`);
    },

    update(id, updates) {
        const idx = this.records.findIndex(r => r.id === id);
        if (idx >= 0) { Object.assign(this.records[idx], updates); this.save(); }
    },

    getById(id) {
        return this.records.find(r => r.id === id);
    },

    markIncorrect(id) {
        this.update(id, { status: 'marked' });
    },

    delete(id) {
        this.records = this.records.filter(r => r.id !== id);
        this.save();
        ImageStore.delete(id).catch(() => {});
    },

    exportCSV(records) {
        records = records || this.records;
        const header = '时间,配置方案,模式,AI分数,最终分数,是否纠错,纠错理由,识别答案,AI评语\n';
        const rows = records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const esc = s => '"' + String(s || '').replace(/"/g, '""') + '"';
            return [time, r.presetName, r.gradingMode, r.aiScore, r.finalScore,
                r.isCorrected ? '是' : '否', esc(r.correctionReason), esc(r.studentAnswer), esc(r.aiComment)].join(',');
        }).join('\n');
        this._download(header + rows, '评阅历史_' + this._fileTimestamp() + '.csv', 'text/csv;charset=utf-8');
    },

    exportJSON(records) {
        records = records || this.records;
        this._download(JSON.stringify(records, null, 2), '评阅历史_' + this._fileTimestamp() + '.json', 'application/json');
    },

    async exportHTML(records) {
        records = records || this.records;
        const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' };

        // 预加载缺少 imageBase64s 的记录的图片
        const imageMap = {};
        await Promise.all(records.map(async r => {
            try {
                const base64s = await ImageStore.get(r.id);
                if (base64s) imageMap[r.id] = base64s;
            } catch (e) { console.warn('IndexedDB 图片加载失败:', r.id); }
        }));

        const rows = records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const mode = modeLabel[r.gradingMode] || r.gradingMode;
            const scoreText = r.isCorrected ? `${r.aiScore} → ${r.finalScore} ✓` : `${r.finalScore}`;
            const correctedRow = r.isCorrected ? `<div style="color:#0052FF;font-size:12px;margin-top:4px;">纠错理由：${r.correctionReason || '无'}</div>` : '';
            const markedRow = r.status === 'marked' ? `<span style="color:#D93025;font-size:11px;margin-left:8px;">⚠ 待回评</span>` : '';
            const base64s = imageMap[r.id] || [];
            const images = (r.imageUrls || []).map((url, j) => {
                const b64 = base64s[j];
                return b64 ? `<img src="data:image/png;base64,${b64}" style="max-width:100%;border-radius:6px;margin-top:8px;">` : '';
            }).join('');
            return `
                <div style="border:1px solid #e5e5e5;border-radius:10px;padding:16px;margin-bottom:12px;page-break-inside:avoid;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="color:#86868b;font-size:12px;">${time} · ${r.presetName} · ${mode}模式</span>
                        <span style="font-size:16px;font-weight:600;">${scoreText}分${markedRow}</span>
                    </div>
                    ${correctedRow}
                    <div style="font-size:13px;color:#4a4a4a;margin:8px 0;line-height:1.6;">
                        <div><strong>识别答案：</strong>${(r.studentAnswer || '未能识别').replace(/\n/g, '<br>')}</div>
                        <div style="margin-top:4px;"><strong>AI评语：</strong>${(r.aiComment || '无').replace(/\n/g, '<br>')}</div>
                    </div>
                    ${images ? `<div style="margin-top:8px;">${images}</div>` : ''}
                </div>
            `;
        }).join('\n');

        const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>评阅历史</title>
<style>
    body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #1d1d1f; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .meta { color: #86868b; font-size: 13px; margin-bottom: 24px; }
</style></head>
<body>
    <h1>评阅历史</h1>
    <div class="meta">导出时间：${new Date().toLocaleString('zh-CN')} · 共 ${records.length} 条记录</div>
    ${rows || '<div style="color:#aaa;text-align:center;padding:40px;">暂无记录</div>'}
</body></html>`;
        this._download(html, '评阅历史_' + this._fileTimestamp() + '.html', 'text/html;charset=utf-8');
        showToast('HTML导出完成');
    },

    _fileTimestamp() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '_' +
            String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0') + String(d.getSeconds()).padStart(2, '0');
    },

    _download(content, filename, type) {
        const BOM = type.includes('csv') ? '﻿' : '';
        const blob = new Blob([BOM + content], { type });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    },

    startRegrade(id) {
        const record = this.getById(id);
        if (!record) return;
        this.returnUrl = window.location.pathname + window.location.hash;
        window.aiGradingState.isRegrading = true;
        sessionStorage.setItem('ai-grading-regrade', JSON.stringify({ id, returnUrl: this.returnUrl }));
        window.location.href = record.pageUrl;
    },

    async finishRegrade(id, finalScore, correctionInfo) {
        this.update(id, {
            finalScore,
            isCorrected: correctionInfo.isCorrected,
            correctionReason: correctionInfo.correctionReason,
            status: 'submitted'
        });
        const returnUrl = this.returnUrl;
        window.aiGradingState.isRegrading = false;
        sessionStorage.removeItem('ai-grading-regrade');
        if (returnUrl) {
            showToast('回评完成，返回原页面...');
            setTimeout(() => { window.location.href = returnUrl; }, 1000);
        }
    }
};
HistoryManager.init();

// ========== 历史面板 UI ==========
function showHistoryPanel() {
    const old = document.getElementById('ai-history-panel');
    if (old) { old.previousElementSibling?.id === 'ai-history-overlay' && old.previousElementSibling.remove(); old.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'ai-history-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.3);backdrop-filter:blur(8px);z-index:1000000;';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'ai-history-panel';
    panel.innerHTML = `
        <style>
            #ai-history-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                z-index: 1000001; width: 680px; max-width: 94vw; max-height: 85vh;
                background: rgba(255,255,255,0.95); backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255,255,255,0.6); border-radius: 20px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                display: flex; flex-direction: column; overflow: hidden;
                animation: ai-modal-scalein 0.3s cubic-bezier(0.16,1,0.3,1);
            }
            .hist-header { padding:20px 28px 16px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; justify-content:space-between; align-items:center; }
            .hist-header h3 { margin:0; font-size:16px; font-weight:600; color:#1d1d1f; }
            .hist-header .close-btn { background:transparent;border:none;font-size:20px;cursor:pointer;color:#666;padding:4px 8px;border-radius:6px; }
            .hist-header .close-btn:hover { background:rgba(0,0,0,0.04);color:#1a1a1a; }
            .hist-toolbar { padding:12px 28px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:8px; align-items:center; }
            .hist-toolbar button { padding:6px 14px; border:1px solid rgba(0,0,0,0.1); background:transparent; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; }
            .hist-toolbar button:hover { background:rgba(0,0,0,0.03); }
            .hist-toolbar .count { margin-left:auto; font-size:12px; color:#86868b; }
            .hist-filter { padding:10px 28px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
            .hist-filter input[type="date"] { padding:5px 8px; border:1px solid rgba(0,0,0,0.12); border-radius:6px; font-size:12px; font-family:inherit; }
            .hist-filter select { padding:5px 8px; border:1px solid rgba(0,0,0,0.12); border-radius:6px; font-size:12px; font-family:inherit; background:#fff; }
            .hist-filter button { padding:5px 14px; border:1px solid rgba(0,0,0,0.1); background:transparent; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; }
            .hist-filter button:hover { background:rgba(0,0,0,0.03); }
            .hist-filter button.primary { color:#0052FF; border-color:rgba(0,82,255,0.3); }
            .hist-filter .filter-hint { font-size:11px; color:#86868b; }
            #ai-history-panel-inner { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
            .hist-list { flex:1; min-height:0; overflow-y:auto; padding:12px 28px; }
            .hist-item { padding:16px; border:1px solid rgba(0,0,0,0.06); border-radius:12px; margin-bottom:10px; transition:all 0.2s; }
            .hist-item:hover { border-color:rgba(0,0,0,0.12); box-shadow:0 2px 8px rgba(0,0,0,0.04); }
            .hist-item.marked { border-left:3px solid #D93025; }
            .hist-item-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; }
            .hist-item-time { font-size:12px; color:#86868b; }
            .hist-item-meta { font-size:11px; color:#aaa; }
            .hist-item-score { font-size:14px; font-weight:600; color:#1d1d1f; }
            .hist-item-score .arrow { color:#86868b; margin:0 4px; }
            .hist-item-score .corrected { color:#0052FF; }
            .hist-item-score .marked-tag { color:#D93025; font-size:11px; margin-left:8px; font-weight:500; }
            .hist-item-text { font-size:12px; color:#666; line-height:1.5; margin-bottom:10px; }
            .hist-item-actions { display:flex; gap:8px; }
            .hist-item-actions button { padding:5px 12px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:11px; cursor:pointer; transition:all 0.2s; }
            .hist-item-actions button:hover { background:rgba(0,0,0,0.03); }
            .hist-item-actions button.danger { color:#D93025; border-color:rgba(217,48,37,0.2); }
            .hist-item-actions button.danger:hover { background:rgba(217,48,37,0.04); }
            .hist-item-actions button.primary { color:#0052FF; border-color:rgba(0,82,255,0.2); }
            .hist-item-actions button.primary:hover { background:rgba(0,82,255,0.04); }
            .hist-empty { text-align:center; padding:60px 20px; color:#aaa; font-size:14px; }
        </style>
        <div id="ai-history-panel-inner">
            <div class="hist-header">
                <h3>评阅历史</h3>
                <button class="close-btn" id="hist-close">×</button>
            </div>
            <div class="hist-toolbar">
                <button id="hist-export-csv">导出CSV</button>
                <button id="hist-export-json">导出JSON</button>
                <button id="hist-export-html">导出HTML</button>
                <button id="hist-clear" style="color:#D93025;border-color:rgba(217,48,37,0.2);">清空</button>
                <span class="count" id="hist-count">共 ${HistoryManager.records.length} 条</span>
            </div>
            <div class="hist-filter" id="hist-filter">
                <input type="date" id="hist-filter-start" title="开始日期">
                <span style="color:#aaa;font-size:12px;">~</span>
                <input type="date" id="hist-filter-end" title="结束日期">
                <select id="hist-filter-preset"><option value="">全部方案</option></select>
                <button class="primary" id="hist-filter-apply">筛选</button>
                <button id="hist-filter-reset">重置</button>
            </div>
            <div class="hist-list" id="hist-list"></div>
        </div>
    `;
    document.body.appendChild(panel);

    // 筛选状态
    let filterState = { startDate: '', endDate: '', presetName: '' };

    // 填充方案下拉
    const presetSelect = document.getElementById('hist-filter-preset');
    const presetNames = [...new Set(HistoryManager.records.map(r => r.presetName).filter(Boolean))];
    presetNames.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name; opt.textContent = name;
        presetSelect.appendChild(opt);
    });

    function getFilteredRecords() {
        return HistoryManager.records.filter(r => {
            if (filterState.presetName && r.presetName !== filterState.presetName) return false;
            if (filterState.startDate) {
                if (r.timestamp < new Date(filterState.startDate).getTime()) return false;
            }
            if (filterState.endDate) {
                if (r.timestamp > new Date(filterState.endDate).getTime() + 86400000) return false;
            }
            return true;
        });
    }

    function updateCount(filtered) {
        const el = document.getElementById('hist-count');
        if (!el) return;
        const total = HistoryManager.records.length;
        el.textContent = filtered.length === total ? `共 ${total} 条` : `筛选结果 ${filtered.length} / 共 ${total} 条`;
    }

    const close = () => { overlay.remove(); panel.remove(); };
    overlay.onclick = close;
    document.getElementById('hist-close').onclick = close;

    // 筛选按钮
    document.getElementById('hist-filter-apply').onclick = () => {
        filterState.startDate = document.getElementById('hist-filter-start').value;
        filterState.endDate = document.getElementById('hist-filter-end').value;
        filterState.presetName = presetSelect.value;
        const filtered = getFilteredRecords();
        updateCount(filtered);
        renderList(filtered);
    };
    document.getElementById('hist-filter-reset').onclick = () => {
        filterState = { startDate: '', endDate: '', presetName: '' };
        document.getElementById('hist-filter-start').value = '';
        document.getElementById('hist-filter-end').value = '';
        presetSelect.value = '';
        updateCount(HistoryManager.records);
        renderList(HistoryManager.records);
    };

    // 导出按钮
    document.getElementById('hist-export-csv').onclick = () => HistoryManager.exportCSV(getFilteredRecords());
    document.getElementById('hist-export-json').onclick = () => HistoryManager.exportJSON(getFilteredRecords());
    document.getElementById('hist-export-html').onclick = () => HistoryManager.exportHTML(getFilteredRecords());
    document.getElementById('hist-clear').onclick = async () => {
        if (await showConfirmModal('确定要清空所有评阅历史吗？此操作不可撤销。')) {
            HistoryManager.records = [];
            HistoryManager.save();
            await ImageStore.clear().catch(() => {});
            renderList([]);
        }
    };

    function renderList(records) {
        const listEl = document.getElementById('hist-list');
        if (!listEl) return;
        if (!records || records.length === 0) {
            listEl.innerHTML = '<div class="hist-empty">暂无评阅记录</div>';
            return;
        }
        listEl.innerHTML = records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[r.gradingMode] || r.gradingMode;
            const scoreHtml = r.isCorrected
                ? `<span>${r.aiScore}</span><span class="arrow">→</span><span class="corrected">${r.finalScore}</span>`
                : `<span>${r.finalScore}</span>`;
            const markedTag = r.status === 'marked' ? '<span class="marked-tag">⚠ 待回评</span>' : '';
            const correctedTag = r.isCorrected ? '<span style="color:#0052FF;font-size:11px;margin-left:8px;">✓已纠错</span>' : '';
            return `
                <div class="hist-item ${r.status === 'marked' ? 'marked' : ''}" data-id="${r.id}">
                    <div class="hist-item-header">
                        <div>
                            <span class="hist-item-time">${time}</span>
                            <span class="hist-item-meta" style="margin-left:8px;">${r.presetName} · ${modeLabel}模式</span>
                        </div>
                        <div class="hist-item-score">${scoreHtml}分${markedTag}${correctedTag}</div>
                    </div>
                    <div class="hist-item-text">
                        答案：${(r.studentAnswer || '').slice(0, 60)}${(r.studentAnswer || '').length > 60 ? '...' : ''}<br>
                        评语：${(r.aiComment || '').slice(0, 60)}${(r.aiComment || '').length > 60 ? '...' : ''}
                    </div>
                    <div class="hist-item-actions">
                        <button class="hist-detail-btn" data-id="${r.id}">查看详情</button>
                        ${r.status !== 'marked' ? `<button class="hist-mark-btn danger" data-id="${r.id}">标记不正确</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.hist-detail-btn').forEach(btn => {
            btn.onclick = () => showHistoryDetail(HistoryManager.getById(btn.dataset.id));
        });
        listEl.querySelectorAll('.hist-mark-btn').forEach(btn => {
            btn.onclick = () => { HistoryManager.markIncorrect(btn.dataset.id); renderList(getFilteredRecords()); showToast('已标记为不正确'); };
        });
    }

    renderList(HistoryManager.records);
}

// ========== 历史详情模态框 ==========
function showHistoryDetail(record) {
    if (!record) return;
    ensureModalStyles();
    const old = document.getElementById('ai-history-detail');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ai-history-detail';
    overlay.className = 'ai-modal-overlay';
    overlay.style.zIndex = '1000002';

    const time = new Date(record.timestamp).toLocaleString('zh-CN');
    const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[record.gradingMode] || record.gradingMode;

    overlay.innerHTML = `
        <div class="ai-modal-card" style="max-width:700px;max-height:85vh;overflow:hidden;">
            <div class="ai-modal-header" style="display:flex;justify-content:space-between;align-items:center;">
                <span>评阅详情</span>
                <button style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:4px 8px;" id="detail-close">×</button>
            </div>
            <div class="ai-modal-body" style="max-height:calc(85vh - 60px);overflow-y:auto;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">时间</div><div style="font-size:13px;">${time}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">方案 / 模式</div><div style="font-size:13px;">${record.presetName} · ${modeLabel}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">AI评分</div><div style="font-size:28px;font-weight:700;">${record.aiScore}</div></div>
                    <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:4px;">最终分数</div><div style="font-size:28px;font-weight:700;color:${record.isCorrected ? '#0052FF' : '#1d1d1f'};">${record.finalScore}${record.isCorrected ? ' ✓' : ''}</div></div>
                </div>
                ${record.subScores && record.subScores.length > 0 ? `
                <div style="margin-bottom:16px;">
                    <div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:8px;">各小题得分</div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                        ${record.subScores.map(sq => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                            <span style="font-size:13px;color:#1d1d1f;font-weight:500;">${sq.label}</span>
                            <span style="font-size:14px;font-weight:600;">${sq.score !== null ? sq.score : '—'}<span style="font-size:11px;color:#86868b;font-weight:normal;">/${sq.maxScore}</span></span>
                        </div>
                        ${sq.comment ? `<div style="font-size:12px;color:#666;padding:0 12px 2px;">${sq.comment}</div>` : ''}
                        `).join('')}
                    </div>
                </div>` : ''}
                ${record.isCorrected ? `<div style="background:rgba(0,82,255,0.04);border-left:3px solid #0052FF;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;color:#0052FF;margin-bottom:16px;">${record.correctionReason || '已纠错'}</div>` : ''}
                <div style="margin-bottom:16px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">识别答案</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;">${record.studentAnswer || '未能识别'}</div></div>
                <div style="margin-bottom:16px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">AI评语</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;">${record.aiComment || '无'}</div></div>
                <div id="detail-images-container"><div style="color:#aaa;font-size:12px;">加载图片中...</div></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    const closeDetail = () => overlay.remove();
    overlay.querySelector('#detail-close').onclick = closeDetail;
    overlay.onclick = e => { if (e.target === overlay) closeDetail(); };

    // 从 IndexedDB 异步加载图片
    const imgContainer = overlay.querySelector('#detail-images-container');
    ImageStore.get(record.id).then(base64s => {
        if (base64s && base64s.length > 0) {
            imgContainer.innerHTML = `<div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;margin-bottom:6px;">答题卡图片</div>` +
                base64s.map(b64 => `<img src="data:image/png;base64,${b64}" style="max-width:100%;border-radius:8px;margin-bottom:8px;">`).join('');
        } else {
            imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">无图片数据</div>';
        }
    }).catch(() => {
        imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">图片加载失败</div>';
    });
}
