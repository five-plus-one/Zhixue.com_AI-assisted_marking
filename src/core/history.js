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

    async getSize() {
        const db = await this.getDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.openCursor();
            let totalBytes = 0, count = 0;
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    totalBytes += JSON.stringify(cursor.value).length;
                    count++;
                    cursor.continue();
                } else {
                    resolve({ totalBytes, count });
                }
            };
            req.onerror = (e) => reject(e.target.error);
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

    /** 将 imageUrls 中的 data:URL 替换为占位符，避免 base64 泄漏到 GM_setValue */
    _stripDataUrls(record) {
        if (Array.isArray(record.imageUrls)) {
            record.imageUrls = record.imageUrls.map(url =>
                typeof url === 'string' && url.startsWith('data:') ? '[图片已存储]' : url
            );
        }
    },

    async init() {
        let saved;
        try {
            saved = GM_getValue('ai-grading-history');
        } catch (e) {
            console.warn('[历史] GM_getValue 读取失败，重置存储:', e);
            try { GM_setValue('ai-grading-history', '[]'); } catch (_) {}
            saved = '[]';
        }
        this.records = saved ? JSON.parse(saved) : [];

        // 迁移旧记录的 base64 到 IndexedDB + 清理 imageUrls 中的 data:URL
        const toMigrate = this.records.filter(r => r.imageBase64s && r.imageBase64s.length > 0);
        const hasDataUrls = this.records.some(r => Array.isArray(r.imageUrls) && r.imageUrls.some(u => typeof u === 'string' && u.startsWith('data:')));
        if (toMigrate.length > 0) {
            console.log(`[历史] 迁移 ${toMigrate.length} 条旧记录的图片到 IndexedDB...`);
            const results = await Promise.allSettled(
                toMigrate.map(r => ImageStore.save(r.id, r.imageBase64s))
            );
            let ok = 0, fail = 0;
            toMigrate.forEach((r, i) => {
                if (results[i].status === 'fulfilled') { delete r.imageBase64s; ok++; }
                else { delete r.imageBase64s; fail++; }
            });
            this.save();
            console.log(`[历史] 迁移完成: ${ok} 成功, ${fail} 失败`);
        } else if (hasDataUrls) {
            // 仅需清理 imageUrls 中的 data:URL
            this.save();
            console.log('[历史] 已清理 imageUrls 中的 base64 数据');
        }

        // 诊断日志
        const json = JSON.stringify(this.records);
        console.log(`[历史] 记录数: ${this.records.length}, 存储大小: ${(json.length / 1024).toFixed(1)}KB`);
    },

    save() {
        // 防御性剥离：确保 base64 数据不会泄漏到 GM_setValue
        this.records.forEach(r => { delete r.imageBase64s; this._stripDataUrls(r); });
        let json = JSON.stringify(this.records);
        const sizeKB = (json.length / 1024).toFixed(1);
        const sizeMB = (json.length / 1024 / 1024).toFixed(2);

        // 主动防御：接近 64MiB 上限时清理最旧的记录
        const SAFE_LIMIT = 50 * 1024 * 1024; // 50MB 安全线
        if (json.length > SAFE_LIMIT) {
            console.warn(`[历史] ⚠️ 存储大小 ${sizeMB}MB 接近上限，开始防御性清理...`);
            const before = this.records.length;
            while (json.length > SAFE_LIMIT && this.records.length > 10) {
                const cutCount = Math.max(Math.floor(this.records.length * 0.2), 1);
                this.records = this.records.slice(0, this.records.length - cutCount);
                json = JSON.stringify(this.records);
            }
            console.warn(`[历史] 防御性清理完成: ${before} → ${this.records.length} 条，当前 ${(json.length / 1024 / 1024).toFixed(2)}MB`);
        }

        try {
            GM_setValue('ai-grading-history', json);
            console.log(`[历史] 💾 保存成功: ${this.records.length} 条, ${sizeKB}KB`);
        } catch (e) {
            console.warn(`[历史] ❌ 保存失败 (${sizeMB}MB)，尝试截断旧记录...`, e);
            while (this.records.length > 10) {
                this.records = this.records.slice(0, Math.floor(this.records.length / 2));
                json = JSON.stringify(this.records);
                try {
                    GM_setValue('ai-grading-history', json);
                    console.warn(`[历史] ⚠️ 已截断至 ${this.records.length} 条 (${(json.length / 1024).toFixed(1)}KB) 后保存成功`);
                    return;
                } catch (_) { /* 继续截断 */ }
            }
            console.error('[历史] ❌ 无法保存，记录已截断至最少 (${this.records.length} 条)');
        }
    },

    add(record) {
        record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        record.timestamp = Date.now();
        record.status = record.status || 'submitted';
        record.isCorrected = record.isCorrected || false;
        record.pageUrl = window.location.pathname + window.location.hash;
        record.taskIdentifier = PresetManager.getTaskIdentifier();

        const imageBase64s = record.imageBase64s;
        delete record.imageBase64s;
        this._stripDataUrls(record);

        this.records.unshift(record);
        this.save();

        // 根据配置决定是否保存图片
        if (imageBase64s && imageBase64s.length > 0 && window.aiGradingState.saveImages) {
            ImageStore.save(record.id, imageBase64s).catch(e =>
                console.warn('[历史] 图片存入 IndexedDB 失败:', e)
            );
        } else if (imageBase64s && imageBase64s.length > 0) {
            console.log('[历史] 已跳过图片保存（用户设置为不保存图片）');
        }

        const totalSize = (JSON.stringify(this.records).length / 1024).toFixed(1);
        console.log(`📝 [历史] 已记录评阅: ${record.studentAnswer?.slice(0, 20)}... → ${record.finalScore}分 | 累计 ${this.records.length} 条, 存储 ${totalSize}KB`);
    },

    update(id, updates) {
        delete updates.imageBase64s; // 防御性剥离
        this._stripDataUrls(updates);
        const idx = this.records.findIndex(r => r.id === id);
        if (idx >= 0) {
            Object.assign(this.records[idx], updates);
            this.save();
            const totalSize = (JSON.stringify(this.records).length / 1024).toFixed(1);
            console.log(`📝 [历史] 已更新评阅记录 ${id} | 累计 ${this.records.length} 条, 存储 ${totalSize}KB`);
        }
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
        const header = '时间,配置方案,模式,AI分数,最终分数,是否纠错,纠错理由,识别答案,AI评语,双评模式,老师A得分,老师A评分依据,老师A分数计算,老师B得分,老师B评分依据,老师B分数计算,分差,双评结果,仲裁得分,仲裁分析\n';
        const rows = records.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const esc = s => '"' + String(s || '').replace(/"/g, '""') + '"';
            const d = r.dualEval;
            return [time, r.presetName, r.gradingMode, r.aiScore, r.finalScore,
                r.isCorrected ? '是' : '否', esc(r.correctionReason), esc(r.studentAnswer), esc(r.aiComment),
                d ? '是' : '否',
                d?.scoreA ?? '', esc(d?.detailA?.['评分依据'] ?? ''), esc(d?.detailA?.['分数计算'] ?? ''),
                d?.scoreB ?? '', esc(d?.detailB?.['评分依据'] ?? ''), esc(d?.detailB?.['分数计算'] ?? ''),
                d?.diff ?? '',
                d?.result === 'consensus' ? '共识' : d?.result === 'arbitration' ? '仲裁' : d?.result === 'fallback-a' ? '使用A' : d?.result === 'fallback-b' ? '使用B' : '',
                d?.arbScore ?? '', esc(d?.arbAnalysis ?? '')
            ].join(',');
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
            const d = r.dualEval;
            const dualHtml = d ? `
                <div style="margin:8px 0;padding:10px 14px;background:#f8f8f8;border-radius:8px;border:1px solid #e5e5e5;">
                    <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:8px;">双评结果</div>
                    <div style="display:flex;gap:20px;font-size:12px;margin-bottom:6px;">
                        <span>分差: <strong style="color:${(d.diff || 0) > 2 ? '#D93025' : '#1d1d1f'};">${d.diff !== null ? d.diff + '分' : '—'}</strong></span>
                        <span>判定: <strong style="color:${d.result === 'consensus' ? '#34A853' : d.result === 'arbitration' ? '#7c3aed' : '#86868b'};">${
                            d.result === 'consensus' ? '✓ 共识' : d.result === 'arbitration' ? '⚠ 仲裁' : d.result === 'fallback-a' ? '使用老师A' : d.result === 'fallback-b' ? '使用老师B' : d.result
                        }</strong></span>
                    </div>
                    <div style="margin-top:8px;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #eee;margin-bottom:6px;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:4px;">老师A 评分：<strong>${d.scoreA !== null ? d.scoreA + '分' : '失败'}</strong></div>
                        ${d.detailA ? `<div style="font-size:11px;color:#666;margin-bottom:4px;">评分依据：${(d.detailA['评分依据'] || '—').replace(/\n/g, '<br>')}</div>` : ''}
                        ${d.detailA && d.detailA['分数计算'] ? `<div style="font-size:11px;font-weight:600;">分数计算：${d.detailA['分数计算']}</div>` : ''}
                    </div>
                    <div style="margin-top:6px;padding:8px 12px;background:#fff;border-radius:6px;border:1px solid #eee;margin-bottom:6px;">
                        <div style="font-size:12px;font-weight:600;margin-bottom:4px;">老师B 评分：<strong>${d.scoreB !== null ? d.scoreB + '分' : '失败'}</strong></div>
                        ${d.detailB ? `<div style="font-size:11px;color:#666;margin-bottom:4px;">评分依据：${(d.detailB['评分依据'] || '—').replace(/\n/g, '<br>')}</div>` : ''}
                        ${d.detailB && d.detailB['分数计算'] ? `<div style="font-size:11px;font-weight:600;">分数计算：${d.detailB['分数计算']}</div>` : ''}
                    </div>
                    ${d.result === 'arbitration' ? `
                    <div style="margin-top:6px;padding:8px 12px;background:rgba(124,58,237,0.04);border-radius:6px;border:1px solid rgba(124,58,237,0.15);">
                        <div style="font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:4px;">仲裁结果：<strong>${d.arbScore !== undefined ? d.arbScore + '分' : '—'}</strong></div>
                        ${d.arbAnalysis ? `<div style="font-size:11px;color:#666;line-height:1.5;">仲裁分析：${d.arbAnalysis.replace(/\n/g, '<br>')}</div>` : ''}
                    </div>` : ''}
                </div>
            ` : '';
            return `
                <div style="border:1px solid #e5e5e5;border-radius:10px;padding:16px;margin-bottom:12px;page-break-inside:avoid;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                        <span style="color:#86868b;font-size:12px;">${time} · ${r.presetName} · ${mode}模式</span>
                        <span style="font-size:16px;font-weight:600;">${scoreText}分${markedRow}</span>
                    </div>
                    ${correctedRow}
                    ${dualHtml}
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
HistoryManager.init().catch(e => console.error('[历史] 初始化失败:', e));

// ========== 存储诊断（控制台调用） ==========
(typeof unsafeWindow !== 'undefined' ? unsafeWindow : window).__aiDiag = function() {
    const data = GM_getValue('ai-grading-history');
    const raw = JSON.stringify(data);
    console.log('--- AI批改存储诊断 ---');
    console.log('脚本版本:', SCRIPT_CONFIG.VERSION);
    console.log('原始数据大小:', (raw.length / 1024 / 1024).toFixed(2), 'MB');
    const records = typeof data === 'string' ? JSON.parse(data) : (data || []);
    console.log('记录数:', records.length);
    const withBase64 = records.filter(r => r.imageBase64s && r.imageBase64s.length > 0);
    console.log('含imageBase64s的记录:', withBase64.length, '条');
    if (withBase64.length > 0) {
        const b64Size = withBase64.reduce((s, r) => s + JSON.stringify(r.imageBase64s).length, 0);
        console.log('base64数据总量:', (b64Size / 1024 / 1024).toFixed(2), 'MB');
    }
    if (records.length > 0) {
        const sizes = records.map(r => JSON.stringify(r).length);
        console.log('单条记录最大:', Math.max(...sizes), 'bytes');
        console.log('单条记录字段:', Object.keys(records[0]));
    }
    // 导出到剪贴板（不含图片数据）
    const exportData = records.map(r => {
        const { imageBase64s, ...rest } = r;
        return { ...rest, hasImages: !!(imageBase64s && imageBase64s.length > 0), imageSize: imageBase64s ? imageBase64s.length : 0 };
    });
    copy(JSON.stringify(exportData, null, 2));
    console.log('✅ 已复制到剪贴板（不含图片数据，请直接粘贴发送）');
    console.log('---');
};

// ========== 历史面板 UI ==========
function showHistoryPanel() {
    const old = document.getElementById('ai-history-panel');
    if (old) { old.previousElementSibling?.id === 'ai-history-overlay' && old.previousElementSibling.remove(); old.remove(); return; }

    const overlay = document.createElement('div');
    overlay.id = 'ai-history-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.25);backdrop-filter:blur(6px);z-index:1000000;';
    document.body.appendChild(overlay);

    const panel = document.createElement('div');
    panel.id = 'ai-history-panel';
    panel.innerHTML = `
        <style>
            /* 强制浅色主题，防止深色模式字体颜色问题 */
            #ai-history-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                z-index: 1000001; width: 680px; max-width: 94vw; max-height: 85vh;
                background: rgba(255,255,255,0.96) !important; backdrop-filter: blur(32px) saturate(180%);
                border: 1px solid rgba(255,255,255,0.6); border-radius: 20px;
                box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
                font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
                display: flex; flex-direction: column; overflow: hidden;
                animation: hist-panel-in 0.3s cubic-bezier(0.16,1,0.3,1);
                color-scheme: light only;
                color: #1d1d1f !important;
            }
            @keyframes hist-panel-in { from { transform: translate(-50%, -50%) scale(0.96); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }

            /* 强制所有文字使用深色 */
            #ai-history-panel, #ai-history-panel * {
                color: #1d1d1f !important;
            }
            #ai-history-panel .corrected { color: #0052FF !important; }
            #ai-history-panel .marked-tag { color: #D93025 !important; }
            #ai-history-panel button.primary { color: #0052FF !important; }
            #ai-history-panel button.danger { color: #D93025 !important; }
            #ai-history-panel .hist-toolbar .count { color: #86868b !important; }
            #ai-history-panel .hist-item-time { color: #86868b !important; }
            #ai-history-panel .hist-item-meta { color: #aaa !important; }
            #ai-history-panel .hist-item-text { color: #666 !important; }
            #ai-history-panel .hist-empty { color: #aaa !important; }
            #ai-history-panel .hist-storage-item .label { color: #86868b !important; }

            .hist-header { padding:18px 24px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; justify-content:space-between; align-items:center; }
            .hist-header h3 { margin:0; font-size:15px; font-weight:600; color:#1d1d1f !important; }
            .hist-header .close-btn { background:transparent;border:none;font-size:18px;cursor:pointer;color:#666 !important;padding:4px 8px;border-radius:6px;transition:all 0.2s; }
            .hist-header .close-btn:hover { background:rgba(0,0,0,0.04);color:#1a1a1a !important; }

            .hist-toolbar { padding:10px 24px; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; gap:6px; align-items:center; }
            .hist-toolbar button { padding:6px 12px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:8px; font-size:12px; cursor:pointer; transition:all 0.2s;font-weight:500; }
            .hist-toolbar button:hover { background:rgba(0,0,0,0.03); }
            .hist-toolbar .count { margin-left:auto; font-size:12px; color:#86868b; }

            .hist-filter-toggle { padding:0 24px; border-bottom:1px solid rgba(0,0,0,0.04); }
            .hist-filter-toggle button { background:none;border:none;padding:8px 0;font-size:12px;color:#86868b;cursor:pointer;display:flex;align-items:center;gap:4px;transition:color 0.2s; }
            .hist-filter-toggle button:hover { color:#1a1a1a; }
            .hist-filter { padding:10px 24px 12px; border-bottom:1px solid rgba(0,0,0,0.05); display:none; gap:8px; align-items:center; flex-wrap:wrap; }
            .hist-filter.open { display:flex; }
            .hist-filter input[type="date"] { padding:5px 8px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; font-size:12px; font-family:inherit; }
            .hist-filter select { padding:5px 8px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; font-size:12px; font-family:inherit; background:rgba(0,0,0,0.02); }
            .hist-filter button { padding:5px 12px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; }
            .hist-filter button:hover { background:rgba(0,0,0,0.03); }
            .hist-filter button.primary { color:#0052FF; border-color:rgba(0,82,255,0.2); }

            #ai-history-panel-inner { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
            .hist-list { flex:1; min-height:0; overflow-y:auto; padding:10px 24px; scrollbar-width:thin; }
            .hist-list::-webkit-scrollbar { width:5px; }
            .hist-list::-webkit-scrollbar-thumb { background:rgba(0,0,0,0.1);border-radius:4px; }

            .hist-item { padding:14px 16px; border:1px solid rgba(0,0,0,0.05); border-radius:10px; margin-bottom:8px; transition:all 0.2s; }
            .hist-item:hover { border-color:rgba(0,0,0,0.1); box-shadow:0 2px 8px rgba(0,0,0,0.04); }
            .hist-item.marked { border-left:3px solid #D93025; }
            .hist-item-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
            .hist-item-time { font-size:12px; color:#86868b; }
            .hist-item-meta { font-size:11px; color:#aaa; }
            .hist-item-score { font-size:14px; font-weight:600; color:#1d1d1f; }
            .hist-item-score .arrow { color:#86868b; margin:0 4px; }
            .hist-item-score .corrected { color:#0052FF; }
            .hist-item-score .marked-tag { color:#D93025; font-size:11px; margin-left:8px; font-weight:500; }
            .hist-item-text { font-size:12px; color:#666; line-height:1.5; margin-bottom:8px; }
            .hist-item-actions { display:flex; gap:6px; }
            .hist-item-actions button { padding:4px 10px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:11px; cursor:pointer; transition:all 0.2s;font-weight:500; }
            .hist-item-actions button:hover { background:rgba(0,0,0,0.03); }
            .hist-item-actions button.danger { color:#D93025; border-color:rgba(217,48,37,0.15); }
            .hist-item-actions button.danger:hover { background:rgba(217,48,37,0.04); }
            .hist-item-actions button.primary { color:#0052FF; border-color:rgba(0,82,255,0.15); }
            .hist-item-actions button.primary:hover { background:rgba(0,82,255,0.04); }
            .hist-empty { text-align:center; padding:60px 20px; color:#aaa; font-size:14px; }
            .hist-storage { padding:10px 24px; border-bottom:1px solid rgba(0,0,0,0.05); display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
            .hist-storage-item { display:flex; align-items:center; gap:5px; font-size:12px; color:#666; background:rgba(0,0,0,0.02); padding:4px 10px; border-radius:6px; border:1px solid rgba(0,0,0,0.04); }
            .hist-storage-item .label { color:#86868b; }
            .hist-storage-item .value { font-weight:600; color:#1d1d1f; }
            .hist-storage-item.warn .value { color:#D93025; }
            .hist-storage-actions { margin-left:auto; display:flex; gap:6px; }
            .hist-storage-actions button { padding:4px 10px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:11px; cursor:pointer; transition:all 0.2s; font-weight:500; }
            .hist-storage-actions button:hover { background:rgba(0,0,0,0.03); }
            .hist-storage-actions button.danger { color:#D93025; border-color:rgba(217,48,37,0.15); }
            .hist-storage-actions button.danger:hover { background:rgba(217,48,37,0.04); }
            .hist-batch-bar { padding:8px 24px; border-bottom:1px solid rgba(0,0,0,0.05); display:none; align-items:center; gap:8px; background:rgba(0,82,255,0.03); }
            .hist-batch-bar.open { display:flex; }
            .hist-batch-bar .batch-info { font-size:12px; color:#0052FF; font-weight:500; }
            .hist-batch-bar button { padding:5px 12px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:11px; cursor:pointer; transition:all 0.2s; font-weight:500; }
            .hist-batch-bar button:hover { background:rgba(0,0,0,0.03); }
            .hist-batch-bar button.danger { color:#D93025; border-color:rgba(217,48,37,0.15); }
            .hist-batch-bar button.danger:hover { background:rgba(217,48,37,0.04); }
            .hist-item-check { display:none; margin-right:8px; flex-shrink:0; }
            .hist-batch-mode .hist-item-check { display:block; }
            .hist-item-check input { width:15px; height:15px; cursor:pointer; accent-color:#0052FF; }

            .hist-pagination { padding:10px 24px 14px; border-top:1px solid rgba(0,0,0,0.05); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
            .hist-pagination button { padding:5px 10px; border:1px solid rgba(0,0,0,0.08); background:transparent; border-radius:6px; font-size:12px; cursor:pointer; transition:all 0.2s; min-width:32px; text-align:center; }
            .hist-pagination button:hover:not(:disabled) { background:rgba(0,0,0,0.03); }
            .hist-pagination button:disabled { opacity:0.35; cursor:not-allowed; }
            .hist-pagination button.active { background:#1d1d1f; color:#fff !important; border-color:#1d1d1f; }
            .hist-pagination .page-info { font-size:12px; color:#86868b; }
            .hist-pagination select { padding:4px 6px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; font-size:12px; font-family:inherit; background:rgba(0,0,0,0.02); }
            .hist-pagination .page-jump { display:flex; align-items:center; gap:4px; margin-left:auto; }
            .hist-pagination .page-jump input { width:40px; padding:4px 6px; border:1px solid rgba(0,0,0,0.1); border-radius:6px; font-size:12px; text-align:center; font-family:inherit; }
        </style>
        <div id="ai-history-panel-inner">
            <div class="hist-header">
                <h3>评阅历史</h3>
                <button class="close-btn" id="hist-close">&times;</button>
            </div>
            <div class="hist-storage" id="hist-storage">
                <div class="hist-storage-item"><span class="label">记录</span><span class="value" id="hist-storage-count">--</span></div>
                <div class="hist-storage-item"><span class="label">数据库</span><span class="value" id="hist-storage-db">--</span></div>
                <div class="hist-storage-item"><span class="label">图片缓存</span><span class="value" id="hist-storage-img">--</span></div>
                <div class="hist-storage-actions">
                    <button id="hist-clear-images">清理图片缓存</button>
                    <button id="hist-clear-old" class="danger">清理30天前</button>
                    <button id="hist-clear-all" class="danger">清空全部</button>
                </div>
            </div>
            <div class="hist-toolbar">
                <button id="hist-batch-toggle">批量管理</button>
                <button id="hist-export-csv">导出CSV</button>
                <button id="hist-export-json">导出JSON</button>
                <button id="hist-export-html">导出HTML</button>
                <span class="count" id="hist-count">共 ${HistoryManager.records.length} 条</span>
            </div>
            <div class="hist-batch-bar" id="hist-batch-bar">
                <button id="hist-batch-select-all">全选</button>
                <button id="hist-batch-deselect">取消选择</button>
                <span class="batch-info" id="hist-batch-info">已选 0 条</span>
                <button id="hist-batch-delete" class="danger">删除选中</button>
            </div>
            <div class="hist-filter-toggle">
                <button id="hist-filter-toggle-btn"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 筛选条件</button>
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

    let filterState = { startDate: '', endDate: '', presetName: '' };
    let paginationState = { page: 1, pageSize: 20 };
    let currentFilteredRecords = HistoryManager.records; // 当前筛选结果缓存，供分页和导出共用

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
        const filteredCount = filtered.length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / paginationState.pageSize));
        const prefix = filteredCount === total ? `共 ${total} 条` : `筛选结果 ${filteredCount} / 共 ${total} 条`;
        el.textContent = filteredCount <= paginationState.pageSize
            ? prefix
            : `${prefix} · 第 ${paginationState.page}/${totalPages} 页`;
    }

    const close = () => { overlay.remove(); panel.remove(); };
    overlay.onclick = close;
    document.getElementById('hist-close').onclick = close;

    // 筛选折叠
    document.getElementById('hist-filter-toggle-btn').onclick = () => {
        document.getElementById('hist-filter').classList.toggle('open');
    };

    document.getElementById('hist-filter-apply').onclick = () => {
        filterState.startDate = document.getElementById('hist-filter-start').value;
        filterState.endDate = document.getElementById('hist-filter-end').value;
        filterState.presetName = presetSelect.value;
        currentFilteredRecords = getFilteredRecords();
        paginationState.page = 1;
        updateCount(currentFilteredRecords);
        renderList(currentFilteredRecords);
    };
    document.getElementById('hist-filter-reset').onclick = () => {
        filterState = { startDate: '', endDate: '', presetName: '' };
        document.getElementById('hist-filter-start').value = '';
        document.getElementById('hist-filter-end').value = '';
        presetSelect.value = '';
        currentFilteredRecords = HistoryManager.records;
        paginationState.page = 1;
        updateCount(currentFilteredRecords);
        renderList(currentFilteredRecords);
    };

    document.getElementById('hist-export-csv').onclick = () => HistoryManager.exportCSV(getFilteredRecords());
    document.getElementById('hist-export-json').onclick = () => HistoryManager.exportJSON(getFilteredRecords());
    document.getElementById('hist-export-html').onclick = () => HistoryManager.exportHTML(getFilteredRecords());

    // 批量管理
    const selectedIds = new Set();
    const batchBar = document.getElementById('hist-batch-bar');
    const listContainer = document.getElementById('ai-history-panel-inner');

    function updateBatchInfo() {
        const info = document.getElementById('hist-batch-info');
        if (info) info.textContent = `已选 ${selectedIds.size} 条`;
    }

    document.getElementById('hist-batch-toggle').onclick = () => {
        const isOpen = batchBar.classList.toggle('open');
        listContainer.classList.toggle('hist-batch-mode', isOpen);
        if (!isOpen) { selectedIds.clear(); updateBatchInfo(); }
    };

    document.getElementById('hist-batch-select-all').onclick = () => {
        // 全选当前页
        listContainer.querySelectorAll('.hist-item-check input').forEach(cb => {
            cb.checked = true;
            selectedIds.add(cb.dataset.id);
        });
        updateBatchInfo();
    };

    document.getElementById('hist-batch-deselect').onclick = () => {
        listContainer.querySelectorAll('.hist-item-check input').forEach(cb => {
            cb.checked = false;
        });
        selectedIds.clear();
        updateBatchInfo();
    };

    document.getElementById('hist-batch-delete').onclick = async () => {
        if (selectedIds.size === 0) { showToast('请先选择要删除的记录'); return; }
        if (await showConfirmModal(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) {
            for (const id of selectedIds) {
                await ImageStore.delete(id).catch(() => {});
            }
            HistoryManager.records = HistoryManager.records.filter(r => !selectedIds.has(r.id));
            HistoryManager.save();
            selectedIds.clear();
            updateBatchInfo();
            currentFilteredRecords = getFilteredRecords();
            // 如果当前页已空且不在第一页，回退一页
            const totalPagesAfter = Math.max(1, Math.ceil(currentFilteredRecords.length / paginationState.pageSize));
            if (paginationState.page > totalPagesAfter) paginationState.page = totalPagesAfter;
            updateCount(currentFilteredRecords);
            renderList(currentFilteredRecords);
            loadStorageInfo();
            showToast('已删除选中记录');
        }
    };

    // 存储信息加载
    async function loadStorageInfo() {
        const dbSize = (JSON.stringify(GM_getValue('ai-grading-history') || '').length / 1024).toFixed(1);
        const countEl = document.getElementById('hist-storage-count');
        const dbEl = document.getElementById('hist-storage-db');
        const imgEl = document.getElementById('hist-storage-img');
        if (countEl) countEl.textContent = `${HistoryManager.records.length} 条`;
        if (dbEl) {
            const dbKB = parseFloat(dbSize);
            dbEl.textContent = dbKB > 1024 ? `${(dbKB / 1024).toFixed(1)} MB` : `${dbKB} KB`;
            dbEl.closest('.hist-storage-item')?.classList.toggle('warn', dbKB > 40 * 1024);
        }
        try {
            const imgInfo = await ImageStore.getSize();
            const imgKB = (imgInfo.totalBytes / 1024).toFixed(1);
            if (imgEl) {
                imgEl.textContent = imgKB > 1024 ? `${(imgKB / 1024).toFixed(1)} MB` : `${imgKB} KB`;
                imgEl.closest('.hist-storage-item')?.classList.toggle('warn', parseFloat(imgKB) > 40 * 1024);
            }
        } catch (e) {
            if (imgEl) imgEl.textContent = '未知';
        }
    }
    loadStorageInfo();

    // 清理图片缓存
    document.getElementById('hist-clear-images').onclick = async () => {
        if (await showConfirmModal('确定要清理所有图片缓存吗？历史记录保留，但导出HTML时将无法嵌入图片。')) {
            await ImageStore.clear().catch(() => {});
            loadStorageInfo();
            showToast('图片缓存已清理');
        }
    };

    // 清理30天前记录
    document.getElementById('hist-clear-old').onclick = async () => {
        const cutoff = Date.now() - 30 * 86400000;
        const oldRecords = HistoryManager.records.filter(r => r.timestamp < cutoff);
        if (oldRecords.length === 0) {
            showToast('没有30天前的记录');
            return;
        }
        if (await showConfirmModal(`确定要删除 ${oldRecords.length} 条30天前的记录吗？`)) {
            for (const r of oldRecords) {
                await ImageStore.delete(r.id).catch(() => {});
            }
            HistoryManager.records = HistoryManager.records.filter(r => r.timestamp >= cutoff);
            HistoryManager.save();
            currentFilteredRecords = getFilteredRecords();
            const totalPagesAfter = Math.max(1, Math.ceil(currentFilteredRecords.length / paginationState.pageSize));
            if (paginationState.page > totalPagesAfter) paginationState.page = totalPagesAfter;
            updateCount(currentFilteredRecords);
            renderList(currentFilteredRecords);
            loadStorageInfo();
            showToast(`已清理 ${oldRecords.length} 条旧记录`);
        }
    };

    // 清空全部
    document.getElementById('hist-clear-all').onclick = async () => {
        if (await showConfirmModal('确定要清空所有评阅历史和图片缓存吗？此操作不可撤销。')) {
            HistoryManager.records = [];
            HistoryManager.save();
            await ImageStore.clear().catch(() => {});
            currentFilteredRecords = [];
            paginationState.page = 1;
            updateCount([]);
            renderList([]);
            loadStorageInfo();
        }
    };

    function renderList(records) {
        const listEl = document.getElementById('hist-list');
        if (!listEl) return;
        if (!records || records.length === 0) {
            listEl.innerHTML = '<div class="hist-empty">暂无评阅记录</div>';
            return;
        }

        // 分页切片
        const { page, pageSize } = paginationState;
        const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        paginationState.page = safePage;
        const startIdx = (safePage - 1) * pageSize;
        const pageRecords = records.slice(startIdx, startIdx + pageSize);

        // 渲染当前页记录
        listEl.innerHTML = pageRecords.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[r.gradingMode] || r.gradingMode;
            const scoreHtml = r.isCorrected
                ? `<span>${r.aiScore}</span><span class="arrow">&rarr;</span><span class="corrected">${r.finalScore}</span>`
                : `<span>${r.finalScore}</span>`;
            const markedTag = r.status === 'marked' ? '<span class="marked-tag">&middot; 待回评</span>' : '';
            const correctedTag = r.isCorrected ? '<span style="color:#0052FF;font-size:11px;margin-left:8px;">&#10003;已纠错</span>' : '';
            const dualTag = r.dualEval ? `<span style="font-size:10px;padding:1px 5px;border-radius:3px;margin-left:6px;background:${r.dualEval.result === 'consensus' ? 'rgba(52,168,83,0.1)' : r.dualEval.result === 'arbitration' ? 'rgba(124,58,237,0.1)' : 'rgba(0,0,0,0.05)'};color:${r.dualEval.result === 'consensus' ? '#34A853' : r.dualEval.result === 'arbitration' ? '#7c3aed' : '#86868b'};">双评</span>` : '';
            return `
                <div class="hist-item ${r.status === 'marked' ? 'marked' : ''}" data-id="${r.id}">
                    <div class="hist-item-header">
                        <div style="display:flex;align-items:center;">
                            <label class="hist-item-check"><input type="checkbox" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}></label>
                            <span class="hist-item-time">${time}</span>
                            <span class="hist-item-meta" style="margin-left:8px;">${r.presetName} &middot; ${modeLabel}模式</span>
                        </div>
                        <div class="hist-item-score">${scoreHtml}分${dualTag}${markedTag}${correctedTag}</div>
                    </div>
                    <div class="hist-item-text">
                        答案：${(r.studentAnswer || '').slice(0, 50)}${(r.studentAnswer || '').length > 50 ? '...' : ''}
                    </div>
                    <div class="hist-item-actions">
                        <button class="hist-detail-btn primary" data-id="${r.id}">查看详情</button>
                        ${r.status !== 'marked' ? `<button class="hist-mark-btn danger" data-id="${r.id}">标记不正确</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        // 渲染分页控件
        if (records.length > pageSize) {
            const rangeStart = startIdx + 1;
            const rangeEnd = Math.min(startIdx + pageSize, records.length);
            // 页码按钮：最多显示 5 个页码
            let pageButtons = '';
            let pStart = Math.max(1, safePage - 2);
            let pEnd = Math.min(totalPages, pStart + 4);
            if (pEnd - pStart < 4) pStart = Math.max(1, pEnd - 4);
            for (let p = pStart; p <= pEnd; p++) {
                pageButtons += `<button class="hist-page-btn${p === safePage ? ' active' : ''}" data-page="${p}">${p}</button>`;
            }
            listEl.innerHTML += `
                <div class="hist-pagination">
                    <button class="hist-page-btn" data-page="1" ${safePage <= 1 ? 'disabled' : ''} title="首页">&laquo;</button>
                    <button class="hist-page-btn" data-page="${safePage - 1}" ${safePage <= 1 ? 'disabled' : ''} title="上一页">&lsaquo;</button>
                    ${pageButtons}
                    <button class="hist-page-btn" data-page="${safePage + 1}" ${safePage >= totalPages ? 'disabled' : ''} title="下一页">&rsaquo;</button>
                    <button class="hist-page-btn" data-page="${totalPages}" ${safePage >= totalPages ? 'disabled' : ''} title="末页">&raquo;</button>
                    <span class="page-info">${rangeStart}-${rangeEnd} / ${records.length}</span>
                    <select class="hist-page-size" title="每页条数">
                        <option value="10"${pageSize === 10 ? ' selected' : ''}>10条/页</option>
                        <option value="20"${pageSize === 20 ? ' selected' : ''}>20条/页</option>
                        <option value="50"${pageSize === 50 ? ' selected' : ''}>50条/页</option>
                        <option value="100"${pageSize === 100 ? ' selected' : ''}>100条/页</option>
                    </select>
                    <div class="page-jump">
                        <span class="page-info">跳至</span>
                        <input type="number" class="hist-page-jump" min="1" max="${totalPages}" value="${safePage}">
                    </div>
                </div>
            `;
        }

        // 事件绑定：记录详情/标记
        listEl.querySelectorAll('.hist-detail-btn').forEach(btn => {
            btn.onclick = () => showHistoryDetail(HistoryManager.getById(btn.dataset.id));
        });
        listEl.querySelectorAll('.hist-mark-btn').forEach(btn => {
            btn.onclick = () => { HistoryManager.markIncorrect(btn.dataset.id); renderList(currentFilteredRecords); showToast('已标记为不正确'); };
        });
        // 事件绑定：checkbox
        listEl.querySelectorAll('.hist-item-check input').forEach(cb => {
            cb.onchange = () => {
                if (cb.checked) selectedIds.add(cb.dataset.id);
                else selectedIds.delete(cb.dataset.id);
                updateBatchInfo();
            };
        });
        // 事件绑定：分页按钮
        listEl.querySelectorAll('.hist-page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (!isNaN(p) && p >= 1 && p <= totalPages) {
                    paginationState.page = p;
                    renderList(records);
                    updateCount(records);
                    listEl.scrollTop = 0;
                }
            });
        });
        // 事件绑定：每页条数
        const pageSizeSelect = listEl.querySelector('.hist-page-size');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', () => {
                paginationState.pageSize = parseInt(pageSizeSelect.value) || 20;
                paginationState.page = 1;
                renderList(currentFilteredRecords);
                updateCount(currentFilteredRecords);
            });
        }
        // 事件绑定：页码跳转
        const jumpInput = listEl.querySelector('.hist-page-jump');
        if (jumpInput) {
            jumpInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    const p = parseInt(jumpInput.value);
                    if (!isNaN(p) && p >= 1 && p <= totalPages) {
                        paginationState.page = p;
                        renderList(records);
                        updateCount(records);
                        listEl.scrollTop = 0;
                    }
                }
            });
        }
    }

    currentFilteredRecords = HistoryManager.records;
    renderList(currentFilteredRecords);
}

// ========== 历史详情（右侧抽屉） ==========
function showHistoryDetail(record) {
    if (!record) return;
    const old = document.getElementById('ai-history-detail');
    if (old) old.remove();

    const drawerOverlay = document.createElement('div');
    drawerOverlay.id = 'ai-history-detail';
    drawerOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.2);z-index:1000002;opacity:0;transition:opacity 0.25s;';

    const drawer = document.createElement('div');
    drawer.style.cssText = `
        position:fixed;top:0;right:0;width:480px;max-width:94vw;height:100vh;
        background:rgba(255,255,255,0.96);backdrop-filter:blur(32px) saturate(180%);
        border-left:1px solid rgba(0,0,0,0.06);
        box-shadow:-8px 0 40px rgba(0,0,0,0.08);
        z-index:1000003;display:flex;flex-direction:column;
        font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter",sans-serif;
        transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);
        overflow:hidden;
    `;

    const time = new Date(record.timestamp).toLocaleString('zh-CN');
    const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[record.gradingMode] || record.gradingMode;

    drawer.innerHTML = `
        <div style="padding:18px 24px 14px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
            <span style="font-size:15px;font-weight:600;color:#1d1d1f;">评阅详情</span>
            <button style="background:none;border:none;font-size:18px;cursor:pointer;color:#666;padding:4px 8px;border-radius:6px;transition:all 0.2s;" id="detail-close">&times;</button>
        </div>
        <div style="flex:1;overflow-y:auto;padding:20px 24px;scrollbar-width:thin;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px;">
                <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:4px;">时间</div><div style="font-size:13px;">${time}</div></div>
                <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:4px;">方案 / 模式</div><div style="font-size:13px;">${record.presetName} &middot; ${modeLabel}</div></div>
                <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:4px;">AI评分</div><div style="font-size:28px;font-weight:700;letter-spacing:-1px;">${record.aiScore}</div></div>
                <div><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:4px;">最终分数</div><div style="font-size:28px;font-weight:700;letter-spacing:-1px;color:${record.isCorrected ? '#0052FF' : '#1d1d1f'};">${record.finalScore}${record.isCorrected ? ' &#10003;' : ''}</div></div>
            </div>
            ${record.subScores && record.subScores.length > 0 ? `
            <div style="margin-bottom:16px;">
                <div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:8px;">各小题得分</div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                    ${record.subScores.map(sq => `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);">
                        <span style="font-size:13px;color:#1d1d1f;font-weight:500;">${sq.label}</span>
                        <span style="font-size:14px;font-weight:600;">${sq.score !== null ? sq.score : '—'}<span style="font-size:11px;color:#86868b;font-weight:normal;">/${sq.maxScore}</span></span>
                    </div>
                    ${sq.comment ? `<div style="font-size:12px;color:#666;padding:0 12px 2px;">${sq.comment}</div>` : ''}
                    `).join('')}
                </div>
            </div>` : ''}
            ${record.isCorrected ? `<div style="background:rgba(0,82,255,0.04);border-left:3px solid #0052FF;padding:10px 14px;border-radius:0 8px 8px 0;font-size:12px;color:#0052FF;margin-bottom:16px;line-height:1.5;">${record.correctionReason || '已纠错'}</div>` : ''}
            ${record.dualEval ? `
            <div style="margin-bottom:16px;">
                <div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:8px;">双评结果</div>
                <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                        <span style="font-size:12px;color:#666;">分差</span>
                        <span style="font-size:13px;font-weight:600;color:${(record.dualEval.diff || 0) > 2 ? '#D93025' : '#1d1d1f'};">${record.dualEval.diff !== null ? record.dualEval.diff + '分' : '—'}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-size:12px;color:#666;">判定结果</span>
                        <span style="font-size:12px;font-weight:500;color:${record.dualEval.result === 'consensus' ? '#34A853' : record.dualEval.result === 'arbitration' ? '#7c3aed' : '#86868b'};">${
                            record.dualEval.result === 'consensus' ? '✓ 共识' :
                            record.dualEval.result === 'arbitration' ? '⚠ 三评仲裁' :
                            record.dualEval.result === 'fallback-a' ? '使用老师A' :
                            record.dualEval.result === 'fallback-b' ? '使用老师B' : record.dualEval.result
                        }</span>
                    </div>
                </div>
                <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);margin-bottom:10px;">
                    <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:8px;">老师A 评分</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="font-size:12px;color:#666;">得分</span>
                        <span style="font-size:14px;font-weight:600;">${record.dualEval.scoreA !== null ? record.dualEval.scoreA + '分' : '失败'}</span>
                    </div>
                    ${record.dualEval.detailA ? `
                    <div style="margin-bottom:6px;">
                        <div style="font-size:11px;color:#86868b;margin-bottom:4px;">评分依据</div>
                        <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${record.dualEval.detailA['评分依据'] || '—'}</div>
                    </div>` : ''}
                    ${record.dualEval.detailA && record.dualEval.detailA['分数计算'] ? `
                    <div>
                        <div style="font-size:11px;color:#86868b;margin-bottom:4px;">分数计算</div>
                        <div style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;border:1px solid rgba(0,0,0,0.04);">${record.dualEval.detailA['分数计算']}</div>
                    </div>` : ''}
                </div>
                <div style="padding:10px 14px;background:rgba(0,0,0,0.02);border-radius:8px;border:1px solid rgba(0,0,0,0.04);margin-bottom:10px;">
                    <div style="font-size:12px;font-weight:600;color:#1d1d1f;margin-bottom:8px;">老师B 评分</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="font-size:12px;color:#666;">得分</span>
                        <span style="font-size:14px;font-weight:600;">${record.dualEval.scoreB !== null ? record.dualEval.scoreB + '分' : '失败'}</span>
                    </div>
                    ${record.dualEval.detailB ? `
                    <div style="margin-bottom:6px;">
                        <div style="font-size:11px;color:#86868b;margin-bottom:4px;">评分依据</div>
                        <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${record.dualEval.detailB['评分依据'] || '—'}</div>
                    </div>` : ''}
                    ${record.dualEval.detailB && record.dualEval.detailB['分数计算'] ? `
                    <div>
                        <div style="font-size:11px;color:#86868b;margin-bottom:4px;">分数计算</div>
                        <div style="font-size:12px;font-weight:600;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;border:1px solid rgba(0,0,0,0.04);">${record.dualEval.detailB['分数计算']}</div>
                    </div>` : ''}
                </div>
                ${record.dualEval.result === 'arbitration' ? `
                <div style="padding:10px 14px;background:rgba(124,58,237,0.04);border-radius:8px;border:1px solid rgba(124,58,237,0.12);">
                    <div style="font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:8px;">仲裁结果</div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <span style="font-size:12px;color:#7c3aed;">仲裁得分</span>
                        <span style="font-size:14px;font-weight:600;color:#7c3aed;">${record.dualEval.arbScore !== undefined ? record.dualEval.arbScore + '分' : '—'}</span>
                    </div>
                    ${record.dualEval.arbAnalysis ? `
                    <div>
                        <div style="font-size:11px;color:#86868b;margin-bottom:4px;">仲裁分析</div>
                        <div style="font-size:12px;line-height:1.5;font-family:'SF Mono',monospace;background:rgba(255,255,255,0.6);padding:8px;border-radius:6px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);max-height:100px;overflow-y:auto;">${record.dualEval.arbAnalysis}</div>
                    </div>` : ''}
                </div>` : ''}
            </div>` : ''}
            <div style="margin-bottom:14px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:6px;">识别答案</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);">${record.studentAnswer || '未能识别'}</div></div>
            <div style="margin-bottom:14px;"><div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:6px;">AI评语</div><div style="font-size:13px;line-height:1.6;font-family:'SF Mono',monospace;background:rgba(0,0,0,0.02);padding:12px;border-radius:8px;white-space:pre-wrap;border:1px solid rgba(0,0,0,0.04);">${record.aiComment || '无'}</div></div>
            <div id="detail-images-container"><div style="color:#aaa;font-size:12px;">加载图片中...</div></div>
        </div>
    `;

    document.body.appendChild(drawerOverlay);
    document.body.appendChild(drawer);

    // 动画入场
    requestAnimationFrame(() => {
        drawerOverlay.style.opacity = '1';
        drawer.style.transform = 'translateX(0)';
    });

    const closeDetail = () => {
        drawerOverlay.style.opacity = '0';
        drawer.style.transform = 'translateX(100%)';
        setTimeout(() => { drawerOverlay.remove(); drawer.remove(); }, 300);
    };
    drawer.querySelector('#detail-close').onclick = closeDetail;
    drawerOverlay.onclick = closeDetail;

    // 从 IndexedDB 异步加载图片
    const imgContainer = drawer.querySelector('#detail-images-container');
    ImageStore.get(record.id).then(base64s => {
        if (base64s && base64s.length > 0) {
            imgContainer.innerHTML = `<div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:6px;">答题卡图片</div>` +
                base64s.map(b64 => `<img src="data:image/png;base64,${b64}" style="max-width:100%;border-radius:8px;margin-bottom:8px;">`).join('');
        } else {
            imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">无图片数据</div>';
        }
    }).catch(() => {
        imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">图片加载失败</div>';
    });
}
