// ========== 图片下载处理 ==========
async function fetchImageAsBase64(url) {
    return new Promise((resolve, reject) => {
        console.log(`📥 正在请求下载图片: ${url.substring(0, 60)}...`);
        if (window.aiGradingState.isPaused) return reject(new Error('用户暂停'));

        const request = GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'arraybuffer',
            timeout: 30000,
            onload: function(response) {
                if (response.status === 403 && window.aiGradingState.autoRefreshOn403) {
                    console.warn('⚠️ 图片返回403，自动刷新页面...');
                    sessionStorage.setItem('ai-grading-auto-resume', 'true');
                    setTimeout(() => location.reload(), 1000);
                    return reject(new Error('403错误，页面刷新中'));
                }
                if (response.status >= 200 && response.status < 300) {
                    try {
                        const arrayBuffer = response.response;
                        if (!arrayBuffer || arrayBuffer.byteLength === 0) throw new Error('下载的图片数据为空');

                        let binary = '';
                        const bytes = new Uint8Array(arrayBuffer);
                        const len = bytes.byteLength;
                        for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);

                        resolve(window.btoa(binary));
                    } catch (e) {
                        reject(new Error('图片转换失败: ' + e.message));
                    }
                } else {
                    reject(new Error(`图片下载失败，状态码: ${response.status}`));
                }
            },
            onerror: () => reject(new Error('图片下载跨域请求被拒绝或网络断开')),
            ontimeout: () => reject(new Error('图片下载超时'))
        });

        if (window.aiGradingState.abortController) {
            window.aiGradingState.abortController.signal.addEventListener('abort', () => {
                request.abort();
                reject(new Error('用户主动暂停'));
            });
        }
    });
}
