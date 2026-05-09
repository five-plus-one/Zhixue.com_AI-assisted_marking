// ========== 华翰云 DOM 选择器常量 ==========

const HANHAN_SELECTORS = {
    // 答题卡图片
    ANSWER_IMAGE: '.el-image.photo_bg img.el-image__inner',
    ANSWER_IMAGE_ALL: '.el-image img.el-image__inner',

    // 分数输入框（主输入框，placeholder="请给分"）
    SCORE_INPUT: 'input.el-input__inner[placeholder="请给分"]',
    SCORE_INPUT_NUMBER: 'input[type="number"].el-input__inner',

    // 提交按钮
    SUBMIT_BUTTON: '.el-button--primary',
    SUBMIT_BUTTON_TEXT: '给分',

    // 快捷分数按钮
    QUICK_SCORE_BUTTONS: 'button.scoreitem',
    FULL_SCORE_BUTTON: '.el-button--success',
    ZERO_SCORE_BUTTON: '.el-button--danger',

    // 清空按钮
    CLEAR_BUTTON: '.el-button--small',

    // 页面检测
    PAGE_DETECT_IMAGE: '.el-image.photo_bg img.el-image__inner',
    PAGE_DETECT_INPUT: 'input.el-input__inner[placeholder="请给分"]',
    PAGE_DETECT_SUBMIT: '.el-button--primary',

    // 题目信息
    QUESTION_TITLE: '.questiontitle',
};
