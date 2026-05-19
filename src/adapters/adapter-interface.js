// ========== 平台适配器接口定义 ==========
// 本文档定义了 AI-Marker-Suite 平台适配器的标准接口。
// 每个平台适配器必须实现以下属性和方法。
// 核心模块通过 window.__AI_MARKER_ADAPTER__ 访问当前适配器。

/**
 * @typedef {Object} ScoreInputInfo
 * @property {HTMLInputElement} element - 分数输入框 DOM 元素
 * @property {string} label - 输入框标签（如 "第1题(a)"）
 * @property {number} index - 输入框序号
 * @property {number} [maxScore] - 从 DOM 检测到的满分（可能为 0 或 undefined，核心层会强制用户填写）
 */

/**
 * @typedef {Object} ScoreFillRequest
 * @property {number} total - 总分（已含勤勉加分和取整）
 * @property {Array<{id: string, label: string, score: number}>} [subScores] - 各小题分数（已含勤勉加分分配和取整）
 * @property {string} [comment] - AI 评语（可选）
 */

/**
 * @typedef {Object} SubQuestionInfo
 * @property {string} label - 小题标签（如 "3(1)"、"a"）
 * @property {HTMLInputElement} element - 该小题对应的分数输入框 DOM 元素
 * @property {number} index - 小题序号
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
 * === 分数输入（核心层据此构建评分单元配置）===
 * @property {() => ScoreInputInfo[]} getScoreInputs
 *   返回当前页面上所有分数输入框的信息数组。
 *   - 返回 1 个元素 → 单题模式
 *   - 返回 N 个元素 → N 个评分单元
 *   - maxScore 如果无法从 DOM 检测，返回 0 或 undefined，核心层会强制用户填写。
 *
 * === 分数填入 ===
 * @property {(scores: number[]) => boolean} fillScores
 *   按顺序将分数填入页面上的输入框。scores 数组长度与 getScoreInputs() 返回的输入框数量一致。
 *   返回 true 表示成功。
 *   【推荐实现】新 adapter 应优先实现此方法。
 *
 * @property {(request: ScoreFillRequest) => boolean} fillScore [deprecated]
 *   旧接口，保留向后兼容。核心层会自动将 fillScores 包装为 fillScore 调用。
 *   新 adapter 无需实现此方法。
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
 * @property {() => SubQuestionInfo[]} detectSubQuestions [deprecated]
 *   旧接口，保留向后兼容。新 adapter 应使用 getScoreInputs() 替代。
 *
 * === 可选钩子 ===
 * @property {() => void} [onPageLoad] - init() 完成后的平台特定页面设置
 * @property {() => void} [onGradingComplete] - 每次批改循环完成后的回调
 */
