# 智学网AI自动打分助手

> 让AI帮你批改试卷，解放双手，提高效率！

[![版本](https://img.shields.io/badge/version-1.6.4-blue.svg)](https://github.com/five-plus-one/Zhixue.com_AI-assisted_marking)
[![许可证](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## ⚠️ 反馈

> **脚本目前仍在持续优化中，部分环境下可能存在问题。**
>
> 如果你遇到问题，欢迎通过以下方式反馈：
>
> - 📮 **提交 Issue**：[GitHub Issues](https://github.com/five-plus-one/Zhixue.com_AI-assisted_marking/issues)
> - 📧 **联系作者**：[各种联系方式](https://r-l.ink/contact)
>
> **特别希望获得智学网教师账号用于复现和测试问题。** 如果你愿意提供测试账号（可临时使用），请通过邮件联系作者，非常感谢！

---

## 📖 项目简介

智学网AI自动打分助手是一款基于油猴（Tampermonkey）的浏览器脚本，专为智学网阅卷系统设计。通过集成AI视觉识别和自然语言处理技术，实现自动识别学生答案、智能评分、自动提交等功能，大幅提升教师阅卷效率。

**核心优势：**
- 🤖 **AI驱动**：利用先进的OCR和AI模型，准确识别手写答案并智能评分
- ⚡ **无人值守**：支持夜间挂机批改，自动处理错误、自动重试、自动提交
- 🎯 **精准评分**：可自定义题目、标准答案和评分标准，确保评分准确性
- 🚀 **高效便捷**：一键启动，自动完成识别→评分→提交全流程
- 📋 **多方案管理**：支持多套试卷配置，可绑定题目自动切换

![](https://img.assets.five-plus-one.com/2026/02/a457a722e32879a416b7e8c88bf178eb.png)

---

## ✨ 主要功能

### 1. 智能OCR识别
- 自动识别答题卡图片中的学生手写答案
- 支持多图拼接（多张图片合并识别）
- 支持多种字迹和书写风格

### 2. AI自动评分
- 根据标准答案和评分标准智能打分
- 生成详细评语和得分理由
- 支持流式输出，实时显示AI思考过程

### 3. 自动提交
- 自动填入AI评定的分数
- 5秒倒计时自动提交（可暂停/取消）
- 智能查找并点击"提交分数"按钮

### 4. 多方案管理
- 支持创建多套试卷配置（如语文作文、数学大题等）
- 可绑定题目URL，下次打开自动切换对应方案
- 未保存检测：修改配置后未保存时会阻止意外启动

### 5. 无人值守模式
- 🌙 **夜间挂机**：适合批改大量试卷
- 🔄 **自动重试**：遇到错误自动刷新重试（最多3次）
- 🤫 **静默运行**：所有提示仅在控制台输出，不弹窗打扰
- ⚡ **快速提交**：1秒自动提交，无需等待
- 🛑 **自动停止**：完成所有批改后自动停止

### 6. 智能容错
- 403错误自动刷新页面
- 网络异常自动重试
- 支持手动暂停/继续
- 兼容不同版本 Tampermonkey 及浏览器的流式输出差异

---

## 🚀 安装使用

### 第一步：安装浏览器扩展

安装 Tampermonkey（油猴）扩展：
- Chrome：[Chrome网上应用店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- Edge：[Edge外接程序商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- Firefox：[Firefox附加组件](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)

### 第二步：安装用户脚本

#### 方式一：一键安装（推荐）

确保已安装 Tampermonkey，点击以下链接，Tampermonkey 会自动提示安装：

**👉 [一键安装脚本](https://raw.githubusercontent.com/five-plus-one/Zhixue.com_AI-assisted_marking/main/zhixue_ai_marking.user.js)**

#### 方式二：手动安装

1. 下载 [zhixue_ai_marking.user.js](zhixue_ai_marking.user.js)
2. 在 Tampermonkey 扩展中点击"创建新脚本"
3. 将脚本内容复制粘贴到编辑器中
4. 按 `Ctrl+S` 保存脚本

### 第三步：配置API密钥

1. 打开智学网阅卷页面：`https://www.zhixue.com/webmarking/`
2. 页面右上角会出现 **⚙️ AI打分配置** 面板
3. 选择API服务商：
   - **推荐：5+1 AI**（点击"获取API KEY"可免费注册）
   - 或填写其他 OpenAI 兼容接口的信息
4. 填写 API 密钥（必填）
5. 可选填写题目信息（题目内容、标准答案、评分标准）
6. 点击 **💾 保存当前方案并启用**

### 第四步：开始使用

1. 打开学生答题卡页面
2. 点击右下角 **✨ 开始AI打分** 按钮
3. 等待AI自动识别和评分
4. 查看评分结果，确认后自动提交并跳转下一份

---

## 📋 使用说明

### 普通模式
- 适合日常批改，5秒倒计时自动提交，可随时暂停或取消
- 显示实时流式输出面板和详细评语

### 无人值守模式
- 适合夜间挂机批改大量试卷
- 1秒快速提交，遇到错误自动重试，完成后自动停止

### 操作说明

| 操作 | 说明 |
|------|------|
| 点击右下角按钮 | 开始 / 暂停 / 继续 AI 打分 |
| 弹窗内"暂停"按钮 | 暂停倒计时 |
| 弹窗内"取消并退出" | 完全停止，不提交 |
| 弹窗内"立即提交" | 跳过倒计时直接提交 |
| 按 `F12` | 打开控制台查看详细诊断日志 |

---

## 🔧 API服务商配置

### 方案一：5+1 AI（推荐）
- **获取密钥**：[https://api.ai.five-plus-one.com/console/token](https://api.ai.five-plus-one.com/console/token)
- **API端点**：`https://api.ai.five-plus-one.com/v1/chat/completions`
- **默认模型**：`doubao-seed-1-8-251228`

### 方案二：其他 OpenAI 兼容接口
- 支持任何符合 OpenAI API 格式的服务（如火山引擎、DeepSeek、硅基流动等）
- 自行填写 API 端点、密钥和模型名称

---

## 💡 常见问题

### Q1: 为什么识别不准确？
建议在配置中填写题目内容、标准答案和评分标准，可大幅提高准确率。

### Q2: 弹窗没有出现怎么办？
按 `F12` 打开控制台，查看带 `[诊断]` 标记的日志，确认 AI 是否正常返回了分数。若分数解析为 null，说明 AI 返回格式不符合预期，可将日志截图反馈给作者。

### Q3: 遇到403错误怎么办？
脚本会自动检测 403 错误并刷新页面，无需手动处理。

### Q4: 无人值守模式安全吗？
建议先在普通模式下测试几份答卷，确认 AI 评分准确后再开启无人值守模式。

### Q5: 如何停止批改？
点击右下角按钮暂停，然后在弹窗中点击"取消并退出"即可完全停止。

### Q6: 支持哪些题型？
支持所有有手写答案的主观题。客观题建议使用智学网自带功能。

---

## 🛠️ 技术特性

- **跨域请求**：使用 `GM_xmlhttpRequest` 突破浏览器跨域限制
- **流式兼容**：同时支持 `onprogress` 流式和 `onload` 一次性两种响应模式
- **图片处理**：自动下载答题卡图片并转换为 Base64，支持多图拼接
- **智能重试**：网络异常或 403 错误自动刷新重试
- **配置持久化**：使用 `GM_setValue` 本地存储多套方案配置
- **SPA适配**：监听 URL 及题号变化，自动切换绑定方案
- **诊断日志**：关键步骤均有 `[诊断]` 标记日志，方便定位问题

---

## 🌟 推荐服务

### API 支持
本项目由 [5+1 AI](https://api.ai.five-plus-one.com/) 提供 API 支持，提供稳定、高效、经济的 AI 服务。

### 挂机服务器
欢迎使用 [雨云服务器](http://r-l.ink/rain) 挂机改卷，稳定可靠，价格实惠。

---

## 👨‍💻 关于作者

- **作者**：5plus1
- **个人网站**：[https://five-plus-one.com/](https://five-plus-one.com/)
- **联系邮箱**：[5plus1@five-plus-one.com](mailto:5plus1@five-plus-one.com)
- **问题反馈**：[GitHub Issues](https://github.com/five-plus-one/Zhixue.com_AI-assisted_marking/issues)

### 支持我的工作

如果这个项目对您有帮助，欢迎请我喝杯咖啡 ☕

👉 [给我买一杯咖啡](http://r-l.ink/support)

---

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

---

## ⚠️ 免责声明

1. 本工具仅供学习交流使用，请合理使用 AI 辅助批改功能
2. AI 评分结果仅供参考，教师应当审核确认后再提交
3. 使用本工具产生的任何后果由使用者自行承担
4. 请遵守智学网平台的使用条款和相关法律法规

---

## 📝 更新日志

### v1.6.4 (2026-04-10)
- 🐛 修复 `responseType:'stream'` 导致部分 Tampermonkey 版本 `onload.responseText` 为空、弹窗不出现的问题
- 🔧 移除 `responseType` 强制指定，改为自动兼容模式

### v1.6.3 (2026-04-10)
- 🔍 新增详细诊断日志（`[诊断]` 标记），覆盖页面检测、图片下载、AI请求、解析、弹窗全链路

### v1.6.2 (2026-04-10)
- 🐛 修复客户端流式输出后不弹窗的根本问题：改用 `GM_xmlhttpRequest` + `onprogress` 直接处理 SSE，不再依赖 `Response` 包装

### v1.6.1 (2026-04-10)
- 🐛 修复封装 `gmFetch` 的 `Response` 接口在新版 Tampermonkey 下导致 `response.body` 异常的问题

### v1.6.0
- ✨ 新增多套试卷方案管理
- ✨ 新增 URL 绑定自动切换方案
- ✨ 新增未保存状态检测与拦截
- ✨ 新增吸顶保存按钮

### v1.2.0
- ✨ 新增流式输出支持（AI分析实时显示）
- ✨ 新增 Response 接口支持
- ✨ 适配智学网多图拼接答案

### v1.1.0
- ✨ 新增无人值守模式
- 🔄 优化错误自动重试机制
- ⚡ 调整倒计时逻辑（无人值守1秒，普通5秒）
- 🎨 优化UI界面和交互体验

### v1.0.0
- 🎉 首次发布
- ✅ 支持 OCR 识别和 AI 评分
- ✅ 支持自动提交
- ✅ 支持配置管理

---

<div align="center">

**⭐ 如果觉得有用，欢迎 Star 支持！⭐**

Made with ❤️ by [5plus1](https://five-plus-one.com/)

</div>
