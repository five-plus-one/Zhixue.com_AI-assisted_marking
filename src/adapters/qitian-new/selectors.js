// ========== 七天网络新 UI DOM 选择器常量 ==========
// 新 UI: yj5.7net.cc — Vue SPA + Element UI + Canvas 渲染

const QITIAN_NEW_SELECTORS = {
    // 答题卡 Canvas
    ANSWER_CANVAS: '#canvas',

    // 分数输入框（ID 动态生成，前缀匹配）
    SCORE_INPUT: 'input[id^="inputScoreRef_"]',

    // 提交按钮
    SUBMIT_BUTTON: 'button.saveScoreBtn',

    // 题号标识
    TOPIC_LABEL: 'div.TZ',

    // 试题ID容器（显示如"试题ID: 558"）
    ID_CONTAINER: '.id-container',

    // 页面检测
    PAGE_DETECT_CANVAS: '#canvas',
    PAGE_DETECT_INPUT: 'input[id^="inputScoreRef_"]',
    PAGE_DETECT_SUBMIT: 'button.saveScoreBtn',
};
