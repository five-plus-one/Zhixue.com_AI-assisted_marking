// ========== 智学网 DOM 选择器常量 ==========
// 将在 Phase 4 中从各模块提取智学网特定的选择器到此处

const ZHIXUE_SELECTORS = {
    // 答题卡图片
    ANSWER_IMAGE_CONTAINER: 'div[name="topicImg"]',
    ANSWER_IMAGE: 'div[name="topicImg"] img',

    // 分数输入框
    SCORE_INPUT: 'input[type="number"]',
    SCORE_INPUT_PLACEHOLDER: 'input[placeholder*="分"]',

    // 提交按钮
    SUBMIT_BUTTON_TEXT: '提交分数',

    // 题号标识
    TOPIC_INDEX: '#currentTopicIndex',
    TOPIC_TITLE: '.topic-title',

    // 页面检测
    PAGE_DETECT_IMAGE: 'div[name="topicImg"]',
    PAGE_DETECT_INPUT: 'input[type="number"]',
};
