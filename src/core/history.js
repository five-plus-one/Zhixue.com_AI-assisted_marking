// ========== IndexedDB 图片存储 ==========
const ImageStore = {
    DB_NAME: 'ai-marker-images',
    STORE_NAME: 'images',
    DB_VERSION: 1,
    META_KEY: 'ai-img-meta',
    _db: null,
    _metaCache: null,

    _getMeta() {
        if (!this._metaCache) this._metaCache = GM_getValue(this.META_KEY, {});
        return this._metaCache;
    },
    _invalidateMetaCache() {
        this._metaCache = null;
    },

    async getDB() {
        if (this._db) {
            try { this._db.objectStoreNames; return this._db; }
            catch (e) { this._db = null; }
        }
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.DB_NAME, this.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME);
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                this._db.onclose = () => { this._db = null; };
                this._db.onversionchange = () => { this._db.close(); this._db = null; };
                resolve(this._db);
            };
            req.onerror = (e) => reject(e.target.error);
        });
    },

    async save(recordId, base64Array) {
        const db = await this.getDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).put(base64Array, recordId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
        // 同步元数据到 GM_setValue（跨域名可读）
        const bytes = base64Array.reduce((sum, s) => sum + (typeof s === 'string' ? s.length : 0), 0);
        const meta = this._getMeta();
        meta[recordId] = { origin: location.origin, size: bytes };
        GM_setValue(this.META_KEY, meta);
        this._metaCache = meta; // 直接更新缓存
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
        await new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).delete(recordId);
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
        const meta = this._getMeta();
        delete meta[recordId];
        GM_setValue(this.META_KEY, meta);
        this._invalidateMetaCache();
    },

    async getSize() {
        // 优先从元数据读取（跨域名，O(1)）
        const meta = this._getMeta();
        if (Object.keys(meta).length > 0) {
            const totalBytes = Object.values(meta).reduce((sum, v) => sum + (v.size || 0), 0);
            return { totalBytes, count: Object.keys(meta).length };
        }
        // Fallback: 当前 origin 的 Storage Manager API
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                return { totalBytes: est.usage || 0, quota: est.quota || 0, count: -1 };
            }
        } catch (e) { /* ignore */ }
        return { totalBytes: 0, count: 0 };
    },

    async clear() {
        const db = await this.getDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(this.STORE_NAME, 'readwrite');
            tx.objectStore(this.STORE_NAME).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(e.target.error);
        });
        GM_deleteValue(this.META_KEY);
        this._invalidateMetaCache();
    },

    /** 获取图片三态：local(可导出) / remote(图片在其他平台，无法在此导出) / none(无图) */
    getImageStatus(recordId) {
        const meta = this._getMeta();
        const entry = meta[recordId];
        if (!entry) return { status: 'none' };
        if (entry.origin === location.origin) return { status: 'local', size: entry.size };
        return { status: 'remote', origin: entry.origin, size: entry.size };
    },

    /** 扫描当前 origin 的 IndexedDB 构建元数据（首次运行时调用） */
    async buildMetaFromIndexedDB() {
        try {
            const db = await this.getDB();
            const tx = db.transaction(this.STORE_NAME, 'readonly');
            const store = tx.objectStore(this.STORE_NAME);
            const req = store.openCursor();
            const meta = this._getMeta();
            let added = 0;
            await new Promise((resolve) => {
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        if (!meta[cursor.key]) {
                            const bytes = Array.isArray(cursor.value)
                                ? cursor.value.reduce((sum, s) => sum + (typeof s === 'string' ? s.length : 0), 0)
                                : 0;
                            meta[cursor.key] = { origin: location.origin, size: bytes };
                            added++;
                        }
                        cursor.continue();
                    } else { resolve(); }
                };
                req.onerror = () => resolve();
            });
            if (added > 0) {
                GM_setValue(this.META_KEY, meta);
                this._invalidateMetaCache();
                console.log(`[ImageStore] 元数据已构建: 新增 ${added} 条，共 ${Object.keys(meta).length} 条`);
            }
        } catch (e) {
            console.warn('[ImageStore] 构建元数据失败:', e);
        }
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

        // 在阅卷平台：扫描 IndexedDB 构建图片元数据（首次运行时）
        if (window.__AI_MARKER_ADAPTER__) {
            const existingMeta = GM_getValue(ImageStore.META_KEY, null);
            if (!existingMeta || Object.keys(existingMeta).length === 0) {
                await ImageStore.buildMetaFromIndexedDB();
            }
        }
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

    async exportHTML(records, options = {}) {
        const { includeImages = true } = options;
        records = records || this.records;
        const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' };

        // 加载可导出的图片（仅当前 origin 的 IndexedDB）
        const imageMap = {};
        let remoteCount = 0;
        if (includeImages) {
            for (const r of records) {
                const imgStatus = ImageStore.getImageStatus(r.id);
                if (imgStatus.status === 'local') {
                    const base64s = await ImageStore.get(r.id);
                    if (base64s) imageMap[r.id] = base64s;
                } else if (imgStatus.status === 'remote') {
                    remoteCount++;
                }
            }
        }

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
    ${remoteCount > 0 ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-bottom:16px;font-size:13px;color:#856404;">⚠ ${remoteCount} 条记录的图片存储在其他阅卷平台，如需包含图片请在对应平台导出。</div>` : ''}
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
            #ai-history-panel {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                z-index: 1000001; width: 920px; max-width: calc(100vw - 32px); height: min(760px, calc(100vh - 48px));
                background: #f7f8fa !important;
                border: 1px solid rgba(18,28,45,0.12); border-radius: 16px;
                box-shadow: 0 28px 80px rgba(18,28,45,0.24), 0 2px 8px rgba(18,28,45,0.08);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif;
                display: flex; flex-direction: column; overflow: hidden;
                animation: hist-panel-in 0.3s cubic-bezier(0.16,1,0.3,1);
                color-scheme: light only; color: #172033 !important;
            }
            @keyframes hist-panel-in { from { transform: translate(-50%, -50%) scale(0.96); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }

            #ai-history-panel, #ai-history-panel * {
                box-sizing: border-box; color: #172033 !important;
            }
            #ai-history-panel .hist-export-btn,
            #ai-history-panel .hist-export-btn *,
            #ai-history-panel .hist-export-fmt.active,
            #ai-history-panel .hist-export-fmt.active *,
            #ai-history-panel .hist-html-img.active,
            #ai-history-panel .hist-html-img.active *,
            #ai-history-panel .hist-pagination button.active,
            #ai-history-panel .hist-pagination button.active * {
                color: #fff !important;
            }
            #ai-history-panel button,
            #ai-history-panel input,
            #ai-history-panel select { font-family: inherit; }
            #ai-history-panel button { height: 32px; border-radius: 6px; cursor: pointer; transition: background 0.18s, border-color 0.18s, color 0.18s, box-shadow 0.18s; }
            #ai-history-panel button:focus-visible,
            #ai-history-panel input:focus-visible,
            #ai-history-panel select:focus-visible { outline: 2px solid rgba(25,118,210,0.28); outline-offset: 1px; }

            #ai-history-panel-inner { display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; }
            .hist-header {
                padding: 18px 22px 16px; background: #ffffff;
                border-bottom: 1px solid #e5e8ef; display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
            }
            .hist-title-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
            .hist-header h3 { margin:0; font-size:20px; line-height:1.2; font-weight:700; color:#172033 !important; letter-spacing:0; }
            .hist-summary { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
            .hist-storage-item {
                display:flex; align-items:baseline; gap:6px; min-height:28px; padding:5px 9px;
                background:#f3f6fa; border:1px solid #e3e8f0; border-radius:6px; font-size:12px;
            }
            .hist-storage-item .label { color:#667085 !important; }
            .hist-storage-item .value { color:#172033 !important; font-weight:700; }
            .hist-storage-item.warn { border-color:#f0b8b3; background:#fff4f3; }
            .hist-storage-item.warn .value { color:#c2352b !important; }
            .hist-header-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
            .hist-close-btn {
                width:32px; padding:0; border:1px solid #d8dee8; background:#fff; color:#667085 !important;
                font-size:18px; line-height:1;
            }
            .hist-close-btn:hover { background:#f3f6fa; color:#172033 !important; }

            .hist-toolbar {
                padding:12px 22px; background:#fbfcfe; border-bottom:1px solid #e5e8ef;
                display:flex; gap:10px; align-items:center; flex-wrap:wrap;
            }
            .hist-tools-left, .hist-tools-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
            .hist-tools-right { margin-left:auto; justify-content:flex-end; }
            .hist-ghost-btn {
                padding:0 12px; border:1px solid #d8dee8; background:#fff; color:#344054 !important;
                font-size:12px; font-weight:600;
            }
            .hist-ghost-btn:hover { background:#f3f6fa; border-color:#c9d2df; }
            .hist-ghost-btn.danger { color:#c2352b !important; border-color:#efc5c1; }
            .hist-ghost-btn.danger:hover { background:#fff4f3; border-color:#eaa9a2; }
            .hist-export-btn {
                padding:0 14px; background:#172033; color:#fff !important; border:1px solid #172033;
                font-size:12px; font-weight:700;
            }
            .hist-export-btn:hover { background:#0f1726; border-color:#0f1726; }
            .hist-export-group, .hist-html-opts { display:flex; gap:0; align-items:center; }
            .hist-export-fmt, .hist-html-img {
                padding:0 12px; border:1px solid #d8dee8; background:#fff; font-size:12px; font-weight:600; border-radius:0;
                color:#475467 !important;
            }
            .hist-export-fmt:first-child, .hist-html-img:first-child { border-radius:6px 0 0 6px; }
            .hist-export-fmt:last-child, .hist-html-img:last-child { border-radius:0 6px 6px 0; }
            .hist-export-fmt:not(:first-child), .hist-html-img:not(:first-child) { border-left:none; }
            .hist-export-fmt.active, .hist-html-img.active { background:#26354d; color:#fff !important; border-color:#26354d; }
            .hist-img-help-btn {
                display:inline-flex; align-items:center; height:32px; padding:0 10px; border:1px solid #bed4f2; border-radius:6px;
                background:#f1f7ff; color:#2166ad !important; font-size:12px; font-weight:600; cursor:pointer; white-space:nowrap;
            }
            .hist-img-help-btn:hover { background:#e7f1ff; }
            .hist-help-content { padding:0 22px 12px; background:#fbfcfe; border-bottom:1px solid #e5e8ef; }
            .hist-help-box { padding:12px 14px; background:#fff; border:1px solid #dce4ef; border-radius:8px; font-size:13px; line-height:1.7; color:#475467 !important; }
            .hist-help-note { background:#eef7f1; border:1px solid #cfe8d7; border-radius:6px; padding:8px 10px; font-size:12px; color:#287047 !important; }

            .hist-filter-toggle { padding:0 22px; background:#fbfcfe; border-bottom:1px solid #e5e8ef; }
            .hist-filter-toggle button {
                background:transparent; border:none; padding:0; height:38px; color:#667085 !important; font-size:12px;
                font-weight:700; display:flex; align-items:center; gap:6px;
            }
            .hist-filter-toggle button:hover { color:#172033 !important; }
            .hist-filter {
                padding:12px 22px; background:#fff; border-bottom:1px solid #e5e8ef; display:none;
                grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) minmax(160px, 1.2fr) auto auto auto;
                gap:10px; align-items:center;
            }
            .hist-filter.open { display:grid; }
            .hist-filter input[type="date"], .hist-filter select, .hist-pagination select, .hist-pagination input {
                height:32px; padding:0 10px; border:1px solid #d8dee8; border-radius:6px; font-size:12px;
                background:#fff; color:#172033 !important; min-width:0;
            }
            .hist-filter button { padding:0 12px; border:1px solid #d8dee8; background:#fff; color:#344054 !important; font-size:12px; font-weight:700; }
            .hist-filter button.primary { background:#eef7f1; color:#287047 !important; border-color:#cfe8d7; }

            .hist-batch-bar {
                padding:10px 22px; border-bottom:1px solid #d6e4f5; display:none; align-items:center; gap:8px;
                background:#f1f7ff;
            }
            .hist-batch-bar.open { display:flex; }
            .hist-batch-bar .batch-info { font-size:12px; color:#2166ad !important; font-weight:700; margin-right:auto; }
            .hist-item-check { display:none; margin-right:10px; flex-shrink:0; }
            .hist-batch-mode .hist-item-check { display:block; }
            .hist-item-check input { width:16px; height:16px; cursor:pointer; accent-color:#2166ad; }

            .hist-list { flex:1; min-height:0; overflow-y:auto; padding:16px 22px 18px; scrollbar-width:thin; background:#f7f8fa; }
            .hist-list::-webkit-scrollbar { width:8px; }
            .hist-list::-webkit-scrollbar-thumb { background:#c8d0dc; border-radius:8px; border:2px solid #f7f8fa; }
            .hist-item {
                display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:16px; align-items:center;
                padding:14px 16px; background:#fff; border:1px solid #e1e6ef; border-radius:8px; margin-bottom:10px;
                transition:border-color 0.18s, box-shadow 0.18s, transform 0.18s;
            }
            .hist-item:hover { border-color:#cbd5e1; box-shadow:0 8px 22px rgba(18,28,45,0.08); transform:translateY(-1px); }
            .hist-item.marked { border-color:#f0b8b3; background:#fffafa; }
            .hist-item-main { min-width:0; }
            .hist-item-top { display:flex; align-items:center; gap:8px; min-width:0; margin-bottom:8px; }
            .hist-item-time { color:#667085 !important; font-size:12px; font-weight:700; white-space:nowrap; }
            .hist-item-meta { color:#667085 !important; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .hist-item-tags { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:8px; }
            .hist-tag { display:inline-flex; align-items:center; height:20px; padding:0 7px; border-radius:5px; font-size:11px; font-weight:700; }
            .hist-tag.dual { background:#eef7f1; color:#287047 !important; }
            .hist-tag.arbitration { background:#f2edff; color:#6b4bc2 !important; }
            .hist-tag.image-local { background:#eef7f1; color:#287047 !important; }
            .hist-tag.image-remote { background:#fff7e6; color:#9a6700 !important; }
            .hist-tag.marked-tag { background:#fff0ef; color:#c2352b !important; }
            .hist-tag.corrected { background:#eaf2ff; color:#2166ad !important; }
            .hist-item-text {
                color:#344054 !important; font-size:13px; line-height:1.55; margin:0;
                display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
            }
            .hist-item-side { display:flex; align-items:center; gap:14px; }
            .hist-item-score { min-width:92px; text-align:right; color:#172033 !important; }
            .hist-score-label { display:block; color:#667085 !important; font-size:11px; font-weight:700; margin-bottom:2px; }
            .hist-score-value { display:flex; align-items:baseline; justify-content:flex-end; gap:4px; font-size:23px; line-height:1; font-weight:800; color:#172033 !important; }
            .hist-score-unit { font-size:12px; font-weight:700; color:#667085 !important; }
            .hist-score-value .arrow { color:#98a2b3 !important; font-size:14px; align-self:center; }
            .hist-score-value .corrected { color:#2166ad !important; }
            .hist-item-actions { display:flex; flex-direction:column; gap:6px; width:92px; }
            .hist-item-actions button { width:100%; padding:0 10px; border:1px solid #d8dee8; background:#fff; font-size:12px; font-weight:700; color:#344054 !important; }
            .hist-item-actions button.primary { background:#eef7f1; color:#287047 !important; border-color:#cfe8d7; }
            .hist-item-actions button.danger { color:#c2352b !important; border-color:#efc5c1; }
            .hist-item-actions button:hover { background:#f3f6fa; }
            .hist-empty {
                min-height:300px; display:flex; flex-direction:column; justify-content:center; align-items:center;
                text-align:center; color:#667085 !important; font-size:14px;
            }
            .hist-empty strong { color:#172033 !important; font-size:17px; margin-bottom:6px; }

            .hist-pagination {
                margin-top:12px; padding:12px; background:#fff; border:1px solid #e1e6ef; border-radius:8px;
                display:flex; align-items:center; gap:8px; flex-wrap:wrap;
            }
            .hist-pagination button { padding:0 10px; border:1px solid #d8dee8; background:#fff; font-size:12px; min-width:32px; color:#344054 !important; }
            .hist-pagination button:hover:not(:disabled) { background:#f3f6fa; }
            .hist-pagination button:disabled { opacity:0.4; cursor:not-allowed; }
            .hist-pagination button.active { background:#26354d; color:#fff !important; border-color:#26354d; }
            .hist-pagination .page-info { font-size:12px; color:#667085 !important; }
            .hist-pagination .page-jump { display:flex; align-items:center; gap:4px; margin-left:auto; }
            .hist-pagination .page-jump input { width:52px; text-align:center; }

            @media (max-width: 760px) {
                #ai-history-panel { width:calc(100vw - 16px); max-width:calc(100vw - 16px); height:calc(100vh - 16px); }
                .hist-header { flex-direction:column; align-items:stretch; padding:16px; }
                .hist-header-actions, .hist-tools-right { justify-content:flex-start; margin-left:0; }
                .hist-toolbar, .hist-filter-toggle, .hist-batch-bar, .hist-list { padding-left:16px; padding-right:16px; }
                .hist-filter { grid-template-columns:1fr; padding-left:16px; padding-right:16px; }
                .hist-item { grid-template-columns:1fr; gap:12px; }
                .hist-item-side { justify-content:space-between; align-items:flex-end; }
                .hist-item-actions { flex-direction:row; width:auto; }
                .hist-item-actions button { width:auto; }
                .hist-pagination .page-jump { margin-left:0; }
            }
        </style>
        <div id="ai-history-panel-inner">
            <div class="hist-header">
                <div>
                    <div class="hist-title-row">
                        <h3>评阅历史</h3>
                    </div>
                    <div class="hist-summary" id="hist-storage">
                        <div class="hist-storage-item"><span class="label">记录</span><span class="value" id="hist-storage-count">--</span></div>
                        <div class="hist-storage-item"><span class="label">数据库</span><span class="value" id="hist-storage-db">--</span></div>
                        <div class="hist-storage-item"><span class="label">图片缓存</span><span class="value" id="hist-storage-img">--</span></div>
                        <div class="hist-storage-item"><span class="label">当前视图</span><span class="value" id="hist-count">共 ${HistoryManager.records.length} 条</span></div>
                    </div>
                </div>
                <div class="hist-header-actions">
                    <button class="hist-ghost-btn" id="hist-clear-images">清理图片</button>
                    <button class="hist-ghost-btn danger" id="hist-clear-old">清理30天前</button>
                    <button class="hist-ghost-btn danger" id="hist-clear-all">清空全部</button>
                    <button class="hist-close-btn" id="hist-close" title="关闭">&times;</button>
                </div>
            </div>
            <div class="hist-toolbar">
                <div class="hist-tools-left">
                    <button class="hist-ghost-btn" id="hist-batch-toggle">批量管理</button>
                    <div class="hist-export-group">
                        <button class="hist-export-fmt active" data-fmt="json">JSON</button>
                        <button class="hist-export-fmt" data-fmt="csv">CSV</button>
                        <button class="hist-export-fmt" data-fmt="html">HTML</button>
                    </div>
                </div>
                <div class="hist-tools-right">
                    <div class="hist-html-opts" id="hist-html-opts" style="display:none;">
                        <button class="hist-html-img active" data-img="with">有图</button>
                        <button class="hist-html-img" data-img="without">无图</button>
                        <span id="hist-img-help" class="hist-img-help-btn">图片说明</span>
                    </div>
                    <button class="hist-export-btn" id="hist-export-btn">导出当前视图</button>
                </div>
            </div>
            <div id="hist-img-help-content" class="hist-help-content" style="display:none;">
                <div class="hist-help-box">
                    <div style="margin-bottom:8px;">图片存储在浏览器中，按网站域名隔离。在智学网保存的图片，只能在智学网页面导出。</div>
                    <div style="margin-bottom:6px;"><span style="color:#34A853;font-weight:500;">● 有图可导出</span> — 图片在当前网站，可直接导出</div>
                    <div style="margin-bottom:6px;"><span style="color:#856404;font-weight:500;">● 有图·无法导出</span> — 图片在其他网站，需切换到对应网站导出</div>
                    <div style="margin-bottom:8px;"><span style="color:#86868b;font-weight:500;">● 无图</span> — 未保存图片</div>
                    <div class="hist-help-note">此选项只影响 HTML 导出中的图片展示，不影响文本内容。CSV 和 JSON 导出不受影响。</div>
                </div>
            </div>
            <div class="hist-batch-bar" id="hist-batch-bar">
                <span class="batch-info" id="hist-batch-info">已选 0 条</span>
                <button class="hist-ghost-btn" id="hist-batch-select-all">全选本页</button>
                <button class="hist-ghost-btn" id="hist-batch-deselect">取消选择</button>
                <button class="hist-ghost-btn danger" id="hist-batch-delete">删除选中</button>
            </div>
            <div class="hist-filter-toggle">
                <button id="hist-filter-toggle-btn"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M4 8h8M6 12h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> 筛选条件</button>
            </div>
            <div class="hist-filter" id="hist-filter">
                <input type="date" id="hist-filter-start" title="开始日期">
                <span style="color:#aaa;font-size:12px;">~</span>
                <input type="date" id="hist-filter-end" title="结束日期">
                <select id="hist-filter-preset"><option value="">全部方案</option></select>
                <div id="hist-filter-images-wrap" style="display:none;"><select id="hist-filter-images"><option value="">全部图片</option><option value="local">有图可导出</option><option value="remote">有图·无法导出</option><option value="none">无图</option></select></div>
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
            if (filterState.imageStatus) {
                const status = ImageStore.getImageStatus(r.id).status;
                if (status !== filterState.imageStatus) return false;
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
        filterState.imageStatus = document.getElementById('hist-filter-images').value;
        currentFilteredRecords = getFilteredRecords();
        paginationState.page = 1;
        updateCount(currentFilteredRecords);
        renderList(currentFilteredRecords);
    };
    document.getElementById('hist-filter-reset').onclick = () => {
        filterState = { startDate: '', endDate: '', presetName: '', imageStatus: '' };
        document.getElementById('hist-filter-start').value = '';
        document.getElementById('hist-filter-end').value = '';
        presetSelect.value = '';
        document.getElementById('hist-filter-images').value = '';
        currentFilteredRecords = HistoryManager.records;
        paginationState.page = 1;
        updateCount(currentFilteredRecords);
        renderList(currentFilteredRecords);
    };

    // 导出功能：格式选择器 + HTML 图片选项
    let exportFormat = 'json';
    let htmlImageOption = 'with';

    function updateImageFilterVisibility() {
        const show = (exportFormat === 'html' && htmlImageOption === 'with');
        const wrap = document.getElementById('hist-filter-images-wrap');
        if (wrap) wrap.style.display = show ? 'block' : 'none';
        if (!show) {
            filterState.imageStatus = '';
            document.getElementById('hist-filter-images').value = '';
        }
    }

    document.querySelectorAll('.hist-export-fmt').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.hist-export-fmt').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            exportFormat = btn.dataset.fmt;
            document.getElementById('hist-html-opts').style.display = exportFormat === 'html' ? 'flex' : 'none';
            if (exportFormat !== 'html') document.getElementById('hist-img-help-content').style.display = 'none';
            updateImageFilterVisibility();
            currentFilteredRecords = getFilteredRecords();
            updateCount(currentFilteredRecords);
            renderList(currentFilteredRecords);
        };
    });

    document.querySelectorAll('.hist-html-img').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.hist-html-img').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            htmlImageOption = btn.dataset.img;
            if (htmlImageOption === 'without') document.getElementById('hist-img-help-content').style.display = 'none';
            updateImageFilterVisibility();
            currentFilteredRecords = getFilteredRecords();
            updateCount(currentFilteredRecords);
            renderList(currentFilteredRecords);
        };
    });

    document.getElementById('hist-img-help')?.addEventListener('click', () => {
        const el = document.getElementById('hist-img-help-content');
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('hist-export-btn').onclick = () => {
        const records = getFilteredRecords();
        if (exportFormat === 'json') HistoryManager.exportJSON(records);
        else if (exportFormat === 'csv') HistoryManager.exportCSV(records);
        else if (exportFormat === 'html') HistoryManager.exportHTML(records, { includeImages: htmlImageOption === 'with' });
    };

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
            if (imgEl) {
                const imgBytes = imgInfo.totalBytes || 0;
                const imgMB = (imgBytes / 1024 / 1024).toFixed(1);
                const imgGB = (imgBytes / 1024 / 1024 / 1024).toFixed(2);
                if (imgBytes > 1024 * 1024 * 1024) {
                    imgEl.textContent = `${imgGB} GB`;
                } else {
                    imgEl.textContent = `${imgMB} MB`;
                }
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
            listEl.innerHTML = '<div class="hist-empty"><strong>暂无评阅记录</strong><span>完成一次批改后，这里会显示可筛选、可导出的历史记录。</span></div>';
            return;
        }

        // 分页切片
        const { page, pageSize } = paginationState;
        const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        paginationState.page = safePage;
        const startIdx = (safePage - 1) * pageSize;
        const pageRecords = records.slice(startIdx, startIdx + pageSize);

        const escapeHtml = (text) => String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        // 渲染当前页记录
        listEl.innerHTML = pageRecords.map(r => {
            const time = new Date(r.timestamp).toLocaleString('zh-CN');
            const modeLabel = { normal: '普通', unattended: '无人', trial: '试改' }[r.gradingMode] || r.gradingMode;
            const scoreHtml = r.isCorrected
                ? `<span>${escapeHtml(r.aiScore)}</span><span class="arrow">&rarr;</span><span class="corrected">${escapeHtml(r.finalScore)}</span>`
                : `<span>${escapeHtml(r.finalScore)}</span>`;
            const markedTag = r.status === 'marked' ? '<span class="hist-tag marked-tag">待回评</span>' : '';
            const correctedTag = r.isCorrected ? '<span class="hist-tag corrected">已纠错</span>' : '';
            const dualTag = r.dualEval ? `<span class="hist-tag ${r.dualEval.result === 'arbitration' ? 'arbitration' : 'dual'}">双评</span>` : '';
            const showImageTag = (exportFormat === 'html' && htmlImageOption === 'with');
            const imgStatus = showImageTag ? ImageStore.getImageStatus(r.id) : null;
            const imageTag = showImageTag
                ? (imgStatus.status === 'local'
                    ? '<span class="hist-tag image-local">有图可导出</span>'
                    : imgStatus.status === 'remote'
                    ? '<span class="hist-tag image-remote">有图·无法导出</span>'
                    : '')
                : '';
            const answerText = r.studentAnswer || '未能识别答案';
            const answerPreview = answerText.length > 110 ? `${answerText.slice(0, 110)}...` : answerText;
            const presetName = r.presetName || '未命名方案';
            return `
                <div class="hist-item ${r.status === 'marked' ? 'marked' : ''}" data-id="${r.id}">
                    <div class="hist-item-main">
                        <div class="hist-item-top">
                            <label class="hist-item-check"><input type="checkbox" data-id="${r.id}" ${selectedIds.has(r.id) ? 'checked' : ''}></label>
                            <span class="hist-item-time">${time}</span>
                            <span class="hist-item-meta">${escapeHtml(presetName)} · ${escapeHtml(modeLabel)}模式</span>
                        </div>
                        <p class="hist-item-text">答案：${escapeHtml(answerPreview)}</p>
                        <div class="hist-item-tags">${dualTag}${imageTag}${markedTag}${correctedTag}</div>
                    </div>
                    <div class="hist-item-side">
                        <div class="hist-item-score">
                            <span class="hist-score-label">${r.isCorrected ? '分数修正' : '最终分数'}</span>
                            <span class="hist-score-value">${scoreHtml}<span class="hist-score-unit">分</span></span>
                        </div>
                        <div class="hist-item-actions">
                            <button class="hist-detail-btn primary" data-id="${r.id}">详情</button>
                            ${r.status !== 'marked' ? `<button class="hist-mark-btn danger" data-id="${r.id}">标记</button>` : ''}
                        </div>
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

    // 从 IndexedDB 加载图片（三态判断）
    const imgContainer = drawer.querySelector('#detail-images-container');
    const imgStatus = ImageStore.getImageStatus(record.id);
    if (imgStatus.status === 'local') {
        // 有图·可导出：从当前 origin 的 IndexedDB 加载
        ImageStore.get(record.id).then(base64s => {
            if (base64s && base64s.length > 0) {
                imgContainer.innerHTML = `<div style="font-size:11px;color:#86868b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;margin-bottom:6px;">答题卡图片</div>` +
                    base64s.map(b64 => `<img src="data:image/png;base64,${b64}" style="max-width:100%;border-radius:8px;margin-bottom:8px;">`).join('');
            } else {
                imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">图片数据异常</div>';
            }
        }).catch(() => {
            imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">图片加载失败</div>';
        });
    } else if (imgStatus.status === 'remote') {
        // 有图·无法导出（图片在其他阅卷平台的 IndexedDB 中）
        const originNames = { 'https://www.zhixue.com': '智学网', 'https://zhixue.com': '智学网',
            'https://pj.yixx.cn': '光大阅卷', 'https://yunyuejuan.net': '华翰云',
            'https://www.haofenshu.com': '好分数', 'https://wylkyj.com': '五岳阅卷',
            'https://yj5.7net.cc': '七天网络' };
        const originName = originNames[imgStatus.origin] || imgStatus.origin;
        const sizeMB = (imgStatus.size / 1024 / 1024).toFixed(1);
        imgContainer.innerHTML = `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px;color:#856404;">
            图片存储在 ${originName}（${sizeMB} MB），请在该平台的阅卷页面查看和导出
        </div>`;
    } else {
        // 无图
        imgContainer.innerHTML = '<div style="color:#aaa;font-size:12px;">无图片数据（保存图片选项可能未开启）</div>';
    }
}
