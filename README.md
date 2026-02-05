# 智学网AI自动打分助手

> 让AI帮你批改试卷，解放双手，提高效率！

[![版本](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/yourusername/zhixue-ai-marking)
[![许可证](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 📖 项目简介

智学网AI自动打分助手是一款基于油猴（Tampermonkey）的浏览器脚本，专为智学网阅卷系统设计。通过集成AI视觉识别和自然语言处理技术，实现自动识别学生答案、智能评分、自动提交等功能，大幅提升教师阅卷效率。

**核心优势：**
- 🤖 **AI驱动**：利用先进的OCR和AI模型，准确识别手写答案并智能评分
- ⚡ **无人值守**：支持夜间挂机批改，自动处理错误、自动重试、自动提交
- 🎯 **精准评分**：可自定义题目、标准答案和评分标准，确保评分准确性
- 🚀 **高效便捷**：一键启动，自动完成识别→评分→提交全流程

![](https://img.assets.five-plus-one.com/2026/02/a457a722e32879a416b7e8c88bf178eb.png)

---

## ✨ 主要功能

### 1. 智能OCR识别
- 自动识别答题卡图片中的学生手写答案
- 支持多种字迹和书写风格
- 高精度文字提取

### 2. AI自动评分
- 根据标准答案和评分标准智能打分
- 生成详细评语和得分理由
- 支持主观题和客观题

### 3. 自动提交
- 自动填入AI评定的分数
- 5秒倒计时自动提交（可暂停/取消）
- 智能查找并点击"提交分数"按钮

### 4. 无人值守模式
- 🌙 **夜间挂机**：适合批改大量试卷
- 🔄 **自动重试**：遇到错误自动刷新重试（最多3次）
- 🤫 **静默运行**：所有提示仅在控制台输出，不弹窗打扰
- ⚡ **快速提交**：1秒自动提交，无需等待
- 🛑 **自动停止**：完成所有批改后自动停止

### 5. 灵活配置
- 支持多种AI服务商
- 可自定义题目内容、标准答案、评分标准
- 支持配置面板拖拽和最小化
- 配置持久化保存

### 6. 智能容错
- 403错误自动刷新页面
- 网络异常自动重试
- 支持手动暂停/继续
- 完善的错误提示

---

## 🚀 安装使用

### 第一步：安装浏览器扩展

1. **安装 Tampermonkey（油猴）扩展**
   - Chrome浏览器：访问 [Chrome网上应用店](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - Edge浏览器：访问 [Edge外接程序商店](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
   - Firefox浏览器：访问 [Firefox附加组件](https://addons.mozilla.org/zh-CN/firefox/addon/tampermonkey/)

### 第二步：安装用户脚本

#### 方式一：一键安装（推荐）

先确保您已安装 Tampermonkey 扩展，然后点击下面的链接，Tampermonkey 会自动提示安装：

**👉 [一键安装脚本](https://raw.githubusercontent.com/five-plus-one/Zhixue.com_AI-assisted_marking/main/zhixue_ai_marking-user-script.js)**

#### 方式二：手动安装

1. 点击下载 [zhixue_ai_marking-user-script.js](zhixue_ai_marking-user-script.js)
2. 在Tampermonkey扩展中点击"创建新脚本"
3. 将脚本内容复制粘贴到编辑器中
4. 按 `Ctrl+S` 保存脚本

### 第三步：配置API密钥

1. 打开智学网阅卷页面：`https://www.zhixue.com/webmarking/*`
2. 页面右上角会出现 **⚙️ AI打分配置** 面板
3. 选择API服务商：
   - **推荐使用：5+1 AI**（点击"获取API KEY"即可免费注册）
   - 或使用其他OpenAI兼容接口
4. 填写API密钥（必填）
5. （可选）填写题目信息：
   - 题目内容
   - 标准答案
   - 评分标准
6. （可选）开启 **🤖 无人值守模式**
7. 点击 **💾 保存配置并开始使用**

### 第四步：开始使用

1. 打开学生答题卡页面
2. 点击右下角 **✨ 开始AI打分** 按钮
3. 等待AI自动识别和评分
4. 查看评分结果，确认无误后自动提交
5. 自动跳转到下一份答卷

---

## 📋 使用说明

### 普通模式
- 适合日常批改，需要人工确认每份答卷
- 5秒倒计时自动提交，可随时暂停或取消
- 显示详细的识别结果和评语

### 无人值守模式
- 适合夜间挂机批改大量试卷
- 1秒快速提交，无需人工干预
- 遇到错误自动重试，无需手动处理
- 完成后自动停止

### 操作说明
- **开始/暂停**：点击右下角按钮控制批改进程
- **配置管理**：点击右上角面板进行设置
- **查看日志**：按 `F12` 打开控制台查看详细日志

---

## 🔧 API服务商配置

### 方案一：5+1 AI（推荐）
- **优势**：操作简单、速度快、稳定性高
- **获取密钥**：[https://api.ai.five-plus-one.com/console/token](https://api.ai.five-plus-one.com/console/token)
- **默认配置**：
  - API端点：`https://api.ai.five-plus-one.com/v1/chat/completions`
  - 模型：`doubao-seed-1-8-251228`

### 方案二：其他OpenAI兼容接口
- 支持任何符合OpenAI API格式的服务
- 自行配置API端点、密钥和模型名称

---

## 💡 常见问题

### Q1: 为什么识别不准确？
**A:** 建议在配置中填写题目内容、标准答案和评分标准，可大幅提高准确率。

### Q2: 遇到403错误怎么办？
**A:** 脚本会自动检测403错误并刷新页面，无需手动处理。

### Q3: 无人值守模式安全吗？
**A:** 建议先在普通模式下测试几份答卷，确认AI评分准确后再开启无人值守模式。

### Q4: 如何停止批改？
**A:** 点击右下角按钮暂停，然后在弹窗中点击"取消并退出"即可完全停止。

### Q5: 支持哪些题型？
**A:** 支持所有有手写答案的主观题，客观题建议使用智学网自带的功能。

---

## 🛠️ 技术特性

- **跨域请求**：使用 `GM_xmlhttpRequest` 突破浏览器跨域限制
- **图片处理**：自动下载答题卡图片并转换为Base64格式
- **智能重试**：网络异常或403错误自动刷新重试
- **配置持久化**：使用 `GM_setValue` 本地存储配置
- **SPA适配**：监听URL变化，自动适配单页应用
- **UI优化**：可拖拽、可最小化的配置面板

---

## 🌟 推荐服务

### API支持
本项目由 [5plus1 API](https://api.ai.five-plus-one.com/) 提供API支持，提供稳定、高效、经济的AI服务。

### 挂机服务器
欢迎使用 [雨云服务器](http://r-l.ink/rain) 挂机改卷，稳定可靠，价格实惠。

---

## 👨‍💻 关于作者

- **作者**：5plus1
- **个人网站**：[https://five-plus-one.com/](https://five-plus-one.com/)
- **联系邮箱**：[5plus1@five-plus-one.com](mailto:5plus1@five-plus-one.com)

### 支持我的工作

如果这个项目对您有帮助，欢迎请我喝杯咖啡 ☕

👉 [给我买一杯咖啡](http://r-l.ink/support)

---

## 📄 许可证

本项目采用 MIT 许可证，详见 [LICENSE](LICENSE) 文件。

---

## ⚠️ 免责声明

1. 本工具仅供学习交流使用，请合理使用AI辅助批改功能
2. AI评分结果仅供参考，教师应当审核确认后再提交
3. 使用本工具产生的任何后果由使用者自行承担
4. 请遵守智学网平台的使用条款和相关法律法规

---

## 📝 更新日志

### v1.1.0 (2026-02-05)
- ✨ 新增无人值守模式
- 🔄 优化错误自动重试机制
- ⚡ 调整倒计时逻辑（无人值守1秒，普通5秒）
- 🎨 优化UI界面和交互体验

### v1.0.0
- 🎉 首次发布
- ✅ 支持OCR识别和AI评分
- ✅ 支持自动提交
- ✅ 支持配置管理

---

<div align="center">

**⭐ 如果觉得有用，欢迎 Star 支持！⭐**

Made with ❤️ by [5plus1](https://five-plus-one.com/)

</div>
