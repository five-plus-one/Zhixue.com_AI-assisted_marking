// ========== 全局配置 ==========
// 所有常量从这里读取，构建脚本 (build.js) 也会从这里提取版本号

const SCRIPT_CONFIG = {
    /** 当前脚本版本号，修改此处即可同步更新所有引用 */
    VERSION: '1.8.3',

    /** 远端原始脚本地址（用于检查更新） */
    UPDATE_CHECK_URL: 'https://auto-update.aimarking.five-plus-one.com/zhixue/zhixue_ai_marking.user.js',

    /** 更新检查间隔（毫秒），默认 24 小时 */
    UPDATE_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000,

    /** 默认 AI 端点 */
    DEFAULT_ENDPOINT: 'https://api.ai.five-plus-one.com/v1/chat/completions',

    /** 默认模型 */
    DEFAULT_MODEL: 'mimo-v2.5',

    /** 版本更新日志（用于更新提示弹窗），键为版本号，值为更新内容数组 */
    CHANGELOG: {
        '1.8.3': [
            '纠错流程精简为两步，确认后直接使用教师分数，不再重新批改',
            '新增独立浮动历史按钮，快速查看评阅记录',
            '新增多服务商管理系统（支持新建/删除/切换自定义服务商）',
            '设置面板新增手动检查更新按钮',
            '修复 HTML 导出图片缺失问题，评阅时存储 base64 数据',
        ],
        '1.8.0': [
            '纠错面板重新设计，支持查看 AI 分析和手动修改提示词',
            '回评模式下隐藏 AI 打分按钮，避免误操作',
            '新增评分模式切换（普通/无人值守）',
        ],
        '1.7.0': [
            '新增自动检查更新功能，每 24 小时检查一次',
            '重构代码结构：拆分为 src/ 模块，通过 build.js 构建',
        ],
    },
};
