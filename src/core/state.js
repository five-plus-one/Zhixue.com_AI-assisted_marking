// ========== 全局状态 ==========
window.aiGradingState = {
    isRunning: false, isPaused: false, currentStudentAnswer: '', currentImageUrls: [],
    currentBase64DataArray: [],
    abortController: null, countdownPaused: false, autoRefreshOn403: true,
    gradingMode: 'normal', errorRetryCount: 0, maxRetries: 3,
    hasUnsavedChanges: false, isRegrading: false,
    saveImages: GM_getValue('ai-grading-save-images', true), // 是否保存答题卡图片到历史记录
    // 批阅份数功能
    batchProgress: {
        enabled: false,        // 是否启用批阅份数限制
        targetCount: 0,        // 目标批阅份数
        currentCount: 0,       // 当前已批阅份数
    }
};
