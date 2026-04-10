// ========== 全局配置 ==========
// 所有常量从这里读取，构建脚本 (build.js) 也会从这里提取版本号

const SCRIPT_CONFIG = {
    /** 当前脚本版本号，修改此处即可同步更新所有引用 */
    VERSION: '1.7.0',

    /** 远端原始脚本地址（用于检查更新） */
    UPDATE_CHECK_URL: 'https://raw.githubusercontent.com/five-plus-one/Zhixue.com_AI-assisted_marking/main/dist/zhixue_ai_marking.user.js',

    /** 更新检查间隔（毫秒），默认 24 小时 */
    UPDATE_CHECK_INTERVAL_MS: 24 * 60 * 60 * 1000,

    /** 默认 AI 端点 */
    DEFAULT_ENDPOINT: 'https://api.ai.five-plus-one.com/v1/chat/completions',

    /** 默认模型 */
    DEFAULT_MODEL: 'doubao-seed-1-8-251228',
};
