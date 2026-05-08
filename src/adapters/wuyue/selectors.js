// ========== 五岳阅卷 DOM 选择器常量 ==========

const WUYUE_SELECTORS = {
    // 答题卡图片容器
    IMAGE_BOX: '.imageBox',
    OUT_BOX: '.outBox',
    OUT_BOX_ACTIVE: '.outBox:not(.hideBox)',

    // 答题卡图片（筛选 AnswerSheet 类型）
    ANSWER_IMAGE: '.outBox:not(.hideBox) img[src*="AnswerSheet"]',
    ANSWER_IMAGE_ALL: '.imgSection img[src*="AnswerSheet"]',

    // 原卷图片（PaperScan，通常需要忽略）
    PAPER_IMAGE: 'img[src*="PaperScan"]',

    // 分数输入框（单小题模式）
    SCORE_INPUT_SINGLE: '#inputOne',

    // 分小题区域
    SCORE_LIST: '.computeList',
    SCORE_ITEM: '.computeItem',
    SCORE_ITEM_NUM: '.computeItem .num',
    SCORE_ITEM_INPUT: '.computeItem .el-input__inner',

    // 提交按钮
    SUBMIT_BUTTON: '.btnSubmit',
    SUBMIT_BUTTON_TEXT: '提交得分',

    // 回评按钮
    BACK_UP_BUTTON: '.btnBackUp',

    // 满分/零分按钮
    FULL_SCORE_BUTTON: '.computeItem .full',
    ZERO_SCORE_BUTTON: '.computeItem .zero',

    // 页面检测
    PAGE_DETECT_IMAGE: '.outBox img[src*="AnswerSheet"]',
    PAGE_DETECT_INPUT: '#inputOne',
    PAGE_DETECT_SUBMIT: '.btnSubmit',
};

