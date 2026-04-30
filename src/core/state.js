// ========== 全局状态 ==========
window.aiGradingState = {
    isRunning: false, isPaused: false, currentStudentAnswer: '', currentImageUrls: [],
    currentBase64DataArray: [],
    abortController: null, countdownPaused: false, autoRefreshOn403: true,
    gradingMode: 'normal', errorRetryCount: 0, maxRetries: 3,
    hasUnsavedChanges: false, isRegrading: false
};
