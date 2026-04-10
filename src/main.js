// ========== 页面元素等待与检测 ==========
function waitForElement(selector, timeout = 15000) {
    return new Promise((resolve, reject) => {
        const immediateCheck = document.querySelector(selector);
        if (immediateCheck) return resolve(immediateCheck);
        const startTime = Date.now();
        const timer = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
                clearInterval(timer);
                resolve(element);
            } else if (Date.now() - startTime > timeout) {
                clearInterval(timer);
                reject(new Error('等待元素超时: ' + selector));
            }
        }, 200);
    });
}

async function detectMarkingPage() {
    console.log('🔎 [诊断] 开始检测批改页面元素...');
    try {
        const result = await Promise.race([
            waitForElement('div[name="topicImg"]').then(() => 'topicImg'),
            waitForElement('input[type="number"]').then(() => 'score-input'),
            waitForElement('button:contains("提交分数")').then(() => 'submit-btn')
        ]).catch(() => null);
        if (result) {
            console.log(`✅ [诊断] 检测到批改页面元素: ${result}`);
            return true;
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        const hasInput = document.querySelector('input[type="number"]') || document.querySelector('input[type="text"]');
        const hasButton = Array.from(document.querySelectorAll('button')).some(btn => btn.textContent.includes('提交') || btn.textContent.includes('分数'));
        const detected = !!(hasInput && hasButton);
        console.log(`🔎 [诊断] 兜底检测结果 — 输入框: ${!!hasInput}, 提交按钮: ${hasButton}, 最终判断: ${detected}`);
        if (!detected) {
            console.warn('⚠️ [诊断] 未检测到批改页面，脚本将不会初始化。当前所有按钮文字:', Array.from(document.querySelectorAll('button')).map(b => b.textContent.trim()).filter(t => t).join(' | '));
        }
        return detected;
    } catch (error) {
        console.error('❌ [诊断] detectMarkingPage 抛出异常:', error);
        return false;
    }
}

// ========== 主控流程 ==========
async function startAutoGrading() {
    window.aiGradingState.abortController = new AbortController();
    console.log('▶️ [诊断] startAutoGrading 开始执行');

    try {
        const config = PresetManager.getCurrentConfig();
        if (!config.apiKey) {
            safeAlert('❌ 请先配置API密钥！');
            window.aiGradingState.isRunning = false;
            return;
        }

        console.log(`🔍 使用方案【${PresetManager.data.active}】查找答卷...`);
        const imgElements = document.querySelectorAll('div[name="topicImg"] img');
        console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imgElements.length}`);

        if (!imgElements || imgElements.length === 0) {
            if (window.aiGradingState.unattendedMode) {
                stopAutoGrading();
                safeAlert('✅ 所有试卷已批改完成！');
                return;
            }
            safeAlert('❌ 未找到答题卡图片！');
            window.aiGradingState.isRunning = false;
            return;
        }

        const imageUrls = Array.from(imgElements).map(img => img.src);
        window.aiGradingState.currentImageUrls = imageUrls;

        const gradeBtn = document.querySelector('.ai-grade-btn');
        if (gradeBtn && !window.aiGradingState.unattendedMode) {
            gradeBtn.textContent = imageUrls.length > 1 ? `📥 下载多图(${imageUrls.length})...` : '📥 下载图片...';
        }

        console.log(`📥 [诊断] 开始下载 ${imageUrls.length} 张图片...`);
        const base64DataArray = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
        console.log(`✅ [诊断] 图片下载完成，各图片Base64大小: ${base64DataArray.map(b => Math.round(b.length / 1024) + 'KB').join(', ')}`);

        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        if (gradeBtn && !window.aiGradingState.unattendedMode) {
            gradeBtn.textContent = '⏳ AI分析中...';
            showStreamPanel();
        }

        console.log('🤖 [诊断] 开始调用AI接口...');
        const result = await callAIGrading(base64DataArray, config, (streamedText) => {
            if (!window.aiGradingState.unattendedMode) updateStreamPanel(streamedText);
        });

        hideStreamPanel();
        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        console.log(`📊 [诊断] callAIGrading 返回 — score: ${result.score}, comment长度: ${(result.comment || '').length}字`);
        if (result.score !== undefined && result.score !== null) {
            window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
            window.aiGradingState.errorRetryCount = 0;
            console.log(`✏️ [诊断] 准备填入分数: ${result.score}，调用 fillScore...`);
            fillScore(result.score, result.comment);
        } else {
            throw new Error('AI返回异常: ' + JSON.stringify(result));
        }

    } catch (error) {
        hideStreamPanel();
        if (error.message === '用户主动暂停' || error.message === '用户暂停') {
            console.log('⏸️ 请求已被暂停');
        } else {
            console.error('❌ 打分失败:', error);
            if (window.aiGradingState.unattendedMode) {
                window.aiGradingState.errorRetryCount++;
                if (window.aiGradingState.errorRetryCount <= window.aiGradingState.maxRetries) {
                    sessionStorage.setItem('ai-grading-auto-resume', 'true');
                    sessionStorage.setItem('ai-grading-retry-count', window.aiGradingState.errorRetryCount.toString());
                    setTimeout(() => location.reload(), 2000);
                    return;
                } else {
                    stopAutoGrading();
                    safeAlert('❌ 错误重试上限，自动停止。');
                    return;
                }
            }
            safeAlert('❌ 打分失败: ' + error.message);
        }
        window.aiGradingState.isRunning = false;
        const btn = document.querySelector('.ai-grade-btn');
        if (btn) btn.textContent = window.aiGradingState.isPaused ? '▶️ 继续AI打分' : '✨ 开始AI打分';
    }
}

// ========== 初始化 ==========
async function init() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await detectMarkingPage()) return;

    createMainButton();
    createSettingsPanel();

    // 检查更新（延迟 5 秒，避免影响页面主要功能加载）
    setTimeout(() => checkForUpdate(), 5000);

    if (sessionStorage.getItem('ai-grading-auto-resume') === 'true') {
        sessionStorage.removeItem('ai-grading-auto-resume');
        window.aiGradingState.errorRetryCount = parseInt(sessionStorage.getItem('ai-grading-retry-count') || '0');
        sessionStorage.removeItem('ai-grading-retry-count');
        setTimeout(() => toggleAutoGrading(), 3000);
    }
}

console.log('🚀 智学网AI打分助手加载中...');
console.log(`📌 [诊断] 脚本版本: ${SCRIPT_CONFIG.VERSION} | 浏览器: ${navigator.userAgent.match(/(Chrome|Firefox|Edge)\/[\d.]+/)?.[0] || '未知'} | 时间: ${new Date().toLocaleString()}`);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    setTimeout(init, 1000);
}

// URL 及 题号变化监听器 (轻量级轮询)
let lastUrlId = PresetManager.getTaskIdentifier();
setInterval(() => {
    const currentUrlId = PresetManager.getTaskIdentifier();
    if (currentUrlId !== lastUrlId) {
        lastUrlId = currentUrlId;

        if (!window.aiGradingState.isRunning) {
            const boundPreset = PresetManager.data.bindings[currentUrlId];

            if (boundPreset && PresetManager.data.list[boundPreset]) {
                PresetManager.data.active = boundPreset;
                PresetManager.save();
                showToast(`✨ 检测到新试题，已自动切换至【${PresetManager.data.active}】方案`);
            } else if (PresetManager.data.active !== "默认配置" && PresetManager.data.list["默认配置"]) {
                PresetManager.data.active = "默认配置";
                PresetManager.save();
                showToast(`📝 未找到当前题目的专属方案，已恢复为【默认配置】`);
            }

            const select = document.getElementById('preset-select');
            if (select) {
                select.value = PresetManager.data.active;
                select.dispatchEvent(new Event('change'));
            }
        }
        setTimeout(init, 1000);
    }
}, 1000);
