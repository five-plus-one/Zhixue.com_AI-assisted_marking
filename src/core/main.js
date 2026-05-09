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
    const adapter = window.__AI_MARKER_ADAPTER__;
    if (adapter && adapter.detectMarkingPage) {
        return adapter.detectMarkingPage();
    }
    return false;
}

// ========== 主控流程 ==========
async function startAutoGrading() {
    window.aiGradingState.abortController = new AbortController();
    console.log('▶️ [诊断] startAutoGrading 开始执行');

    try {
        // 使用新的配置获取方式（优先工作流，回退直接配置）
        const config = PresetManager.getActiveCallConfig();
        if (!config.apiKey) {
            safeAlert('❌ 请先配置API密钥！请在设置中配置供应商和模型。');
            window.aiGradingState.isRunning = false;
            return;
        }

        // 获取工作流信息（用于双评判断）
        const presetConfig = PresetManager.getCurrentConfig();
        const workflowId = presetConfig.workflowId;
        const workflow = workflowId ? WorkflowManager.getWorkflow(workflowId) : null;
        const isDualEval = workflow && workflow.dualEval && workflow.dualEval.enabled;

        if (isDualEval) {
            console.log(`🔄 [诊断] 使用双评模式 — 工作流: ${workflow.name}`);
        } else if (workflow) {
            console.log(`🔍 [诊断] 使用工作流: ${workflow.name} — 模型: ${config.model}`);
        }

        const adapter = window.__AI_MARKER_ADAPTER__;

        // AI 失败重试时复用已下载的图片，避免重新抓取（拦截器缓冲可能已清空）
        const isRetry = window.aiGradingState.errorRetryCount > 0
            && window.aiGradingState.currentBase64DataArray.length > 0;

        let imageUrls, base64DataArray;

        if (isRetry) {
            imageUrls = window.aiGradingState.currentImageUrls;
            base64DataArray = window.aiGradingState.currentBase64DataArray;
            console.log(`♻️ [诊断] 复用已有图片数据进行重试 (${imageUrls.length} 张)`);
        } else {
            console.log(`🔍 使用方案【${PresetManager.data.active}】查找答卷...`);
            imageUrls = adapter ? await adapter.gatherAnswerImages() : [];
            console.log(`🖼️ [诊断] 找到答题卡图片数量: ${imageUrls.length}`);

            if (!imageUrls || imageUrls.length === 0) {
                if (window.aiGradingState.gradingMode === 'unattended') {
                    stopAutoGrading();
                    safeAlert('✅ 所有试卷已批改完成！');
                    return;
                }
                safeAlert('❌ 未找到答题卡图片！');
                window.aiGradingState.isRunning = false;
                return;
            }

            window.aiGradingState.currentImageUrls = imageUrls;

            const gradeBtn = document.querySelector('.ai-grade-btn');
            if (gradeBtn && window.aiGradingState.gradingMode !== 'unattended') {
                gradeBtn.textContent = imageUrls.length > 1 ? `📥 下载多图(${imageUrls.length})...` : '📥 下载图片...';
            }

            console.log(`📥 [诊断] 开始下载 ${imageUrls.length} 张图片...`);
            const fetchFn = adapter && adapter.fetchImageAsBase64 ? adapter.fetchImageAsBase64 : fetchImageAsBase64;
            base64DataArray = await Promise.all(imageUrls.map(url => fetchFn(url)));
            window.aiGradingState.currentBase64DataArray = base64DataArray;
            console.log(`✅ [诊断] 图片下载完成，各图片Base64大小: ${base64DataArray.map(b => Math.round(b.length / 1024) + 'KB').join(', ')}`);
        }

        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        const gradeBtnEl = document.querySelector('.ai-grade-btn');
        if (gradeBtnEl && window.aiGradingState.gradingMode !== 'unattended') {
            gradeBtnEl.textContent = '⏳ AI分析中...';
            showStreamPanel();
        }

        console.log('🤖 [诊断] 开始调用AI接口...');
        // 根据是否启用双评，选择调用方式
        const gradingConfig = { ...config, workflowId: workflowId };
        const result = isDualEval
            ? await callDualEvaluation(base64DataArray, gradingConfig, (streamedText) => {
                if (window.aiGradingState.gradingMode !== 'unattended') updateStreamPanel(streamedText);
            })
            : await callAIGrading(base64DataArray, config, (streamedText) => {
                if (window.aiGradingState.gradingMode !== 'unattended') updateStreamPanel(streamedText);
            });

        hideStreamPanel();
        if (window.aiGradingState.isPaused) throw new Error('用户暂停');

        console.log(`📊 [诊断] callAIGrading 返回 — score: ${result.score}, comment长度: ${(result.comment || '').length}字`);
        if (result.score !== undefined && result.score !== null) {
            // 应用取整规则
            const scoringConfig = presetConfig.scoring || { roundStep: 1, roundMethod: 'round' };
            const finalScore = applyScoringRules(result.score, scoringConfig);
            if (finalScore !== result.score) {
                console.log(`📐 [诊断] 取整: ${result.score} → ${finalScore} (步长: ${scoringConfig.roundStep}, 方式: ${scoringConfig.roundMethod})`);
            }

            window.aiGradingState.currentStudentAnswer = result.studentAnswer || '未能识别';
            window.aiGradingState.errorRetryCount = 0;
            console.log(`✏️ [诊断] 准备填入分数: ${finalScore}，调用 fillScore...`);
            const adapter = window.__AI_MARKER_ADAPTER__;
            if (adapter && adapter.fillScore) {
                adapter.fillScore({ total: finalScore, subScores: result.subScores });
            }
            // 传递结构化评分详情和双评信息到提交对话框
            showAutoSubmitDialog(finalScore, result.comment, result.subScores, {
                scoringDetails: result._sections || null,
                dualEval: result.dualEval || null,
                rawScore: result.rawScore || result.score
            });
        } else {
            // 分数解析失败（"未能识别"），自动重试
            window.aiGradingState.errorRetryCount++;
            if (window.aiGradingState.errorRetryCount <= window.aiGradingState.maxRetries) {
                console.warn(`⚠️ AI未能识别分数，第 ${window.aiGradingState.errorRetryCount} 次重试...`);
                safeAlert(`⚠️ AI未能识别分数，正在重试 (${window.aiGradingState.errorRetryCount}/${window.aiGradingState.maxRetries})...`);
                setTimeout(() => startAutoGrading(), 1500);
                return;
            }
            throw new Error('AI返回异常: ' + JSON.stringify(result));
        }

    } catch (error) {
        hideStreamPanel();
        if (error.message === '用户主动暂停' || error.message === '用户暂停') {
            console.log('⏸️ 请求已被暂停');
        } else {
            console.error('❌ 打分失败:', error);
            if (window.aiGradingState.gradingMode === 'unattended') {
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
        if (btn) { btn.textContent = window.aiGradingState.isPaused ? '继续批改' : 'AI 批改'; btn.classList.remove('running', 'unattended', 'trial'); }
    }
}

// ========== 初始化 ==========
async function init() {
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (!await detectMarkingPage()) return;

    createMainButton();
    createSettingsPanel();

    // 首次启动或重置后显示新手引导
    const showOnboarding = GM_getValue('ai-grading-show-onboarding', true);
    if (showOnboarding) {
        setTimeout(() => showOnboardingDialog(true, 'first-launch'), 500);
    }

    // 检查更新（延迟 5 秒，避免影响页面主要功能加载）
    setTimeout(() => checkForUpdate(), 5000);

    // 更新后刷新提示
    if (sessionStorage.getItem('ai-update-reloaded') === 'true') {
        sessionStorage.removeItem('ai-update-reloaded');
        showToast('脚本已更新至最新版本 v' + SCRIPT_CONFIG.VERSION);
    }

    if (sessionStorage.getItem('ai-grading-auto-resume') === 'true') {
        sessionStorage.removeItem('ai-grading-auto-resume');
        window.aiGradingState.errorRetryCount = parseInt(sessionStorage.getItem('ai-grading-retry-count') || '0');
        sessionStorage.removeItem('ai-grading-retry-count');
        setTimeout(() => toggleAutoGrading(), 3000);
    }

    // 检查是否有回评任务
    const regradeData = sessionStorage.getItem('ai-grading-regrade');
    if (regradeData) {
        try {
            const { id } = JSON.parse(regradeData);
            const record = HistoryManager.getById(id);
            if (record) {
                window.aiGradingState.isRegrading = true;
                showToast('正在加载回评数据...');
                setTimeout(async () => {
                    // 等待图片加载
                    const adapter = window.__AI_MARKER_ADAPTER__;
                    const imageUrls = adapter ? await adapter.gatherAnswerImages() : [];
                    if (imageUrls.length === 0) {
                        showAlertModal('未找到答题卡图片，无法回评。').then(() => {
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                        });
                        return;
                    }
                    const fetchFn = adapter && adapter.fetchImageAsBase64 ? adapter.fetchImageAsBase64 : fetchImageAsBase64;
                    const base64DataArray = await Promise.all(imageUrls.map(url => fetchFn(url)));
                    window.aiGradingState.currentBase64DataArray = base64DataArray;

                    showCorrectionPanel({
                        score: record.aiScore, comment: record.aiComment,
                        studentAnswer: record.studentAnswer, imageUrls,
                        base64DataArray, config: PresetManager.getCurrentConfig(),
                        subScores: record.subScores,
                        onAccept(finalScore, correctionInfo) {
                            const correctedSubScores = correctionInfo.correctedSubScores || record.subScores;
                            HistoryManager.update(id, {
                                finalScore, isCorrected: correctionInfo.isCorrected,
                                correctionReason: correctionInfo.correctionReason,
                                subScores: correctedSubScores, status: 'submitted'
                            });
                            fillScore(finalScore, record.aiComment, correctedSubScores);
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                            showToast('回评完成！分数已填入。');
                        },
                        onCancel() {
                            sessionStorage.removeItem('ai-grading-regrade');
                            window.aiGradingState.isRegrading = false;
                            showToast('已取消回评');
                        }
                    });
                }, 3000);
            }
        } catch (e) {
            console.error('回评数据解析失败:', e);
            sessionStorage.removeItem('ai-grading-regrade');
        }
    }
}

const adapter = window.__AI_MARKER_ADAPTER__;
console.log(`🚀 ${adapter ? adapter.name : 'AI-Marker-Suite'} 打分助手加载中...`);
console.log(`📌 [诊断] 脚本版本: ${SCRIPT_CONFIG.VERSION} | 平台: ${adapter ? adapter.name : '未知'} | 浏览器: ${navigator.userAgent.match(/(Chrome|Firefox|Edge)\/[\d.]+/)?.[0] || '未知'} | 时间: ${new Date().toLocaleString()}`);

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

        const adapter = window.__AI_MARKER_ADAPTER__;
        if (adapter && adapter.isRegradeMode ? adapter.isRegradeMode() : window.aiGradingState.isRegrading) return;

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

            // 检查 API KEY 是否配置
            const apiKey = ProviderManager.getProvider('5plus1官方')?.apiKey || '';
            if (!apiKey) {
                showOnboardingDialog(true, 'first-launch');
                return;
            }

            // 检查是否是新试题（未绑定配置）
            if (!boundPreset || !PresetManager.data.list[boundPreset]) {
                showOnboardingDialog(true, 'new-question');
                return;
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
