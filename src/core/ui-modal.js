// ========== 通用模态对话框 ==========

function ensureModalStyles() {
    if (document.getElementById('ai-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-modal-styles';
    style.textContent = `
        .ai-modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.3); backdrop-filter: blur(8px);
            z-index: 999998; animation: ai-modal-fadein 0.3s ease-out;
            display: flex; justify-content: center; align-items: center;
        }
        @keyframes ai-modal-fadein { from { opacity: 0; } to { opacity: 1; } }
        .ai-modal-card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(32px) saturate(180%);
            -webkit-backdrop-filter: blur(32px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
            min-width: 360px; max-width: 480px; width: 90vw;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            animation: ai-modal-scalein 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
        }
        @keyframes ai-modal-scalein { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .ai-modal-header {
            padding: 24px 28px 0;
            font-size: 16px; font-weight: 600; color: #1d1d1f;
        }
        .ai-modal-body {
            padding: 16px 28px 24px;
            font-size: 14px; color: #4a4a4a; line-height: 1.6;
        }
        .ai-modal-body .ai-modal-input {
            width: 100%; padding: 10px 12px; margin-top: 12px;
            background: rgba(0,0,0,0.02);
            border: 1px solid rgba(0,0,0,0.1); border-radius: 8px;
            font-family: inherit; font-size: 14px; color: #1a1a1a;
            box-sizing: border-box; transition: all 0.2s;
        }
        .ai-modal-body .ai-modal-input:focus {
            outline: none; border-color: #0052FF; background: #fff;
            box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.1);
        }
        .ai-modal-footer {
            padding: 0 28px 24px;
            display: flex; justify-content: flex-end; gap: 12px;
        }
        .ai-modal-footer button {
            padding: 10px 24px; border: none; border-radius: 10px;
            font-size: 14px; font-weight: 500; cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-modal-btn-cancel {
            background: rgba(0,0,0,0.05); color: #1d1d1f;
        }
        .ai-modal-btn-cancel:hover { background: rgba(0,0,0,0.09); }
        .ai-modal-btn-confirm {
            background: #1d1d1f; color: white;
            box-shadow: 0 8px 20px rgba(0,0,0,0.15);
        }
        .ai-modal-btn-confirm:hover {
            background: #000; transform: translateY(-1px);
            box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        }
    `;
    document.head.appendChild(style);
}

function showAlertModal(message) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">${message}</div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = () => { if (closed) return; closed = true; overlay.remove(); resolve(); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(); };
        overlay.onclick = e => { if (e.target === overlay) close(); };
    });
}

function showConfirmModal(message) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">${message}</div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel">取消</button>
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('.ai-modal-btn-cancel').onclick = e => { e.stopPropagation(); close(false); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(true); };
        overlay.onclick = e => { if (e.target === overlay) close(false); };
    });
}

function showPromptModal(message, defaultValue) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-body">
                    ${message}
                    <input class="ai-modal-input" type="text" value="${defaultValue || ''}">
                </div>
                <div class="ai-modal-footer">
                    <button class="ai-modal-btn-cancel">取消</button>
                    <button class="ai-modal-btn-confirm">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const input = overlay.querySelector('.ai-modal-input');
        input.focus();
        input.select();
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('.ai-modal-btn-cancel').onclick = e => { e.stopPropagation(); close(null); };
        overlay.querySelector('.ai-modal-btn-confirm').onclick = e => { e.stopPropagation(); close(input.value); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') close(input.value); if (e.key === 'Escape') close(null); });
        overlay.onclick = e => { if (e.target === overlay) close(null); };
    });
}
