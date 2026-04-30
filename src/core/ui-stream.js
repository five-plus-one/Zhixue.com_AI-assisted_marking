// ========== 流式面板 UI ==========

function showStreamPanel() {
    let panel = document.getElementById('ai-stream-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ai-stream-panel';
        panel.innerHTML = `
            <style>
                #ai-stream-panel {
                    position: fixed; bottom: 100px; right: 40px; width: 340px;
                    background: rgba(255, 255, 255, 0.85);
                    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
                    border-radius: 12px;
                    box-shadow: 0 16px 40px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.03);
                    padding: 18px; z-index: 99998;
                    font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
                    border: 1px solid rgba(0,0,0,0.06);
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    transform: translateY(10px); opacity: 0;
                }
                #ai-stream-panel.show { transform: translateY(0); opacity: 1; }
                #ai-stream-panel h4 {
                    margin: 0 0 12px 0; color: #1a1a1a; font-size: 11px; font-weight: 600;
                    display: flex; align-items: center; letter-spacing: 0.5px; text-transform: uppercase;
                }
                #ai-stream-panel .pulse-dot {
                    width: 6px; height: 6px; border-radius: 50%; background: #000; margin-right: 8px;
                    box-shadow: 0 0 0 rgba(0,0,0,0.2); animation: pulse-dot-minimal 2s infinite;
                }
                @keyframes pulse-dot-minimal { 0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.2); } 70% { box-shadow: 0 0 0 5px rgba(0,0,0,0); } 100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); } }
                #ai-stream-content {
                    font-family: "SF Mono", "JetBrains Mono", Consolas, monospace;
                    font-size: 12px; color: #4a4a4a; line-height: 1.6;
                    max-height: 220px; overflow-y: auto; white-space: pre-wrap;
                    scrollbar-width: thin;
                }
            </style>
            <h4><span class="pulse-dot"></span> AI 分析流输出</h4>
            <div id="ai-stream-content">正在感知和组装上下文...</div>
        `;
        document.body.appendChild(panel);
    }
    panel.style.display = 'block';
    requestAnimationFrame(() => panel.classList.add('show'));
    panel.querySelector('#ai-stream-content').textContent = '正在感知和组装上下文...';
}

function updateStreamPanel(text) {
    const content = document.getElementById('ai-stream-content');
    if (content) {
        content.textContent = text;
        content.scrollTop = content.scrollHeight;
    }
}

function hideStreamPanel() {
    const panel = document.getElementById('ai-stream-panel');
    if (panel) {
        panel.classList.remove('show');
        setTimeout(() => panel.style.display = 'none', 300);
    }
}
