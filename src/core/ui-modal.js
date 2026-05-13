// ========== 通用模态对话框 ==========

function ensureModalStyles() {
    if (document.getElementById('ai-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-modal-styles';
    style.textContent = `
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
            -webkit-backdrop-filter: blur(32px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.6);
            border-radius: 20px;
            box-shadow: 0 40px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.4);
            min-width: 340px; max-width: 460px; width: 90vw;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
            animation: ai-modal-scalein 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            overflow: hidden;
        }
        @keyframes ai-modal-scalein { from { transform: scale(0.96) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
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
            border: 1px solid rgba(0,0,0,0.1); border-radius: 10px;
            font-family: inherit; font-size: 14px; color: #1a1a1a;
            box-sizing: border-box; transition: all 0.2s;
        }
        .ai-modal-body .ai-modal-input:focus {
            outline: none; border-color: #0052FF; background: #fff;
            box-shadow: 0 0 0 3px rgba(0, 82, 255, 0.08);
        }
        .ai-modal-footer {
            padding: 0 28px 24px;
            display: flex; justify-content: flex-end; gap: 10px;
        }
        .ai-modal-footer button {
            padding: 10px 22px; border: none; border-radius: 10px;
            font-size: 13px; font-weight: 500; cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .ai-modal-btn-cancel {
            background: rgba(0,0,0,0.05); color: #1d1d1f;
        }
        .ai-modal-btn-cancel:hover { background: rgba(0,0,0,0.09); }
        .ai-modal-btn-confirm {
            background: #1d1d1f; color: white;
            box-shadow: 0 6px 16px rgba(0,0,0,0.12);
        }
        .ai-modal-btn-confirm:hover {
            background: #000; transform: translateY(-1px);
            box-shadow: 0 10px 24px rgba(0,0,0,0.18);
        }
        .ai-modal-btn-secondary {
            background: none; color: #999; font-size: 12px;
            border: none; cursor: pointer; padding: 6px 0;
            width: 100%; text-align: center;
            transition: color 0.2s;
        }
        .ai-modal-btn-secondary:hover { color: #1a1a1a; }
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
        overlay.querySelector('.ai-modal-btn-confirm').focus();
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
        overlay.querySelector('.ai-modal-btn-confirm').focus();
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
    });
}

/**
 * 批阅目标达到后的三选项对话框
 * @param {number} targetCount - 目标批阅份数
 * @returns {Promise<'continue'|'stop'|'reset'>}
 */
function showBatchTargetDialog(targetCount) {
    return new Promise(resolve => {
        ensureModalStyles();
        const overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.innerHTML = `
            <div class="ai-modal-card">
                <div class="ai-modal-header">已达到批阅目标</div>
                <div class="ai-modal-body">已达到您设置的批阅目标（${targetCount} 份），是否继续？</div>
                <div class="ai-modal-footer" style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;gap:10px;">
                        <button class="ai-modal-btn-confirm" data-action="continue" style="flex:1;">继续批阅</button>
                        <button class="ai-modal-btn-cancel" data-action="stop" style="flex:1;">不再批阅</button>
                    </div>
                    <button class="ai-modal-btn-secondary" data-action="reset">重置批阅进度（从 0 开始）</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        let closed = false;
        const close = result => { if (closed) return; closed = true; overlay.remove(); resolve(result); };
        overlay.querySelector('[data-action="continue"]').onclick = e => { e.stopPropagation(); close('continue'); };
        overlay.querySelector('[data-action="stop"]').onclick = e => { e.stopPropagation(); close('stop'); };
        overlay.querySelector('[data-action="reset"]').onclick = e => { e.stopPropagation(); close('reset'); };
        overlay.querySelector('[data-action="continue"]').focus();
    });
}
