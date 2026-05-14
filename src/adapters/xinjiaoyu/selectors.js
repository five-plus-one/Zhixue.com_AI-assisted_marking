// ========== 新教育智能平台 DOM 选择器常量 ==========

const XINJIAOYU_SELECTORS = {
    // 答题卡图片 - 通过 Canvas 渲染
    ANSWER_CANVAS: 'canvas#canvas',

    // 分数输入框 - Ant Design InputNumber
    SCORE_INPUT: '.ant-input-number-input',
    SCORE_INPUT_PLACEHOLDER: 'input[placeholder*="满分"]',

    // 分小题容器
    SUB_QUESTION_CONTAINER: '.score-bord',
    SUB_QUESTION_ITEM: '.score-bord > div',

    // 分数按钮（点击式评分）
    SCORE_BUTTON: '.stepButton button.scoreWidth',

    // 满分/零分快捷按钮
    FULL_SCORE_BUTTON: 'button:has(span:contains("满分"))',
    ZERO_SCORE_BUTTON: 'button._danger:has(span:contains("零分"))',

    // 提交按钮
    SUBMIT_BUTTON_TEXT: '提交分数',
    SUBMIT_BUTTON: '.ant-btn-primary:has(span:contains("提交分数"))',

    // 页面检测
    PAGE_DETECT_URL: '/teacher/grading_center/',
    PAGE_DETECT_CANVAS: 'canvas#canvas',
    PAGE_DETECT_INPUT: '.ant-input-number-input',
};
