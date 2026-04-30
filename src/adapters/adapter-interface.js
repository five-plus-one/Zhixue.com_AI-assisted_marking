// ========== 平台适配器接口定义 ==========
// 本文档定义了 AI-Marker-Suite 平台适配器的标准接口。
// 每个平台适配器必须实现以下属性和方法。
// 核心模块通过 window.__AI_MARKER_ADAPTER__ 访问当前适配器。

/**
 * @typedef {Object} ScoreFillRequest
 * @property {number} total - 总分
 * @property {Array<{id: string, label: string, score: number}>} [subScores] - 各小题分数（可选）
 * @property {string} [comment] - AI 评语（可选）
 */

/**
 * @typedef {Object} ScoreInputInfo
 * @property {HTMLInputElement} element - 分数输入框 DOM 元素
 * @property {string} label - 输入框标签（如 "第1题(a)"）
 * @property {number} index - 输入框序号
 */

/**
 * @typedef {Object} PlatformAdapter
 *
 * === 基本信息 ===
 * @property {string} name - 平台中文名，如 "智学网"
 * @property {string} id - 平台标识符，如 "zhixue"
 * @property {string[]} urlPatterns - URL 匹配模式（用于 @match）
 * @property {string} iconUrl - 平台图标 URL（用于 @icon）
 *
 * === 生命周期 ===
 * @property {() => boolean} shouldInitialize
 *   脚本启动时调用，判断当前页面是否属于该平台（轻量级 URL 检查）
 *
 * @property {() => Promise<boolean>} detectMarkingPage
 *   检测当前页面是否为批改页面（需包含答题卡图片和分数输入框）
 *
 * === 任务标识 ===
 * @property {() => string} getTaskIdentifier
 *   返回当前题目的唯一标识字符串，用于方案绑定和 URL 变化检测。
 *   同一题目应始终返回相同值，不同题目应返回不同值。
 *
 * === 图片获取 ===
 * @property {() => Promise<string[]>} gatherAnswerImages
 *   获取当前页面上所有答题卡图片的 URL 数组
 *
 * @property {(url: string) => Promise<string>} fetchImageAsBase64
 *   下载指定 URL 的图片并返回 base64 编码数据（不含 data: 前缀）。
 *   可包含平台特定的错误处理（如 403 自动刷新）。
 *
 * === 分数填入 ===
 * @property {(request: ScoreFillRequest) => boolean} fillScore
 *   将分数值填入页面上的分数输入框。
 *   返回 true 表示成功找到并填入了输入框。
 *
 * === 提交 ===
 * @property {() => boolean} submitGrade
 *   点击平台的"提交分数"按钮。返回 true 表示成功找到并点击。
 *
 * @property {(oldImageUrl?: string) => Promise<boolean>} waitForNextPaper
 *   提交后轮询等待下一份答卷加载完成。oldImageUrl 用于检测图片是否已变化。
 *   返回 true 表示下一份答卷已就绪，返回 false 表示超时。
 *
 * === 状态查询 ===
 * @property {() => boolean} isRegradeMode
 *   当前是否处于回评/复核模式（此时应隐藏 AI 批改按钮）
 *
 * @property {() => ScoreInputInfo[]} getScoreInputs
 *   返回当前页面上所有分数输入框的信息数组。
 *   单题模式返回一个元素，分小题模式返回多个。
 *
 * === 可选钩子 ===
 * @property {() => void} [onPageLoad] - init() 完成后的平台特定页面设置
 * @property {() => void} [onGradingComplete] - 每次批改循环完成后的回调
 */
