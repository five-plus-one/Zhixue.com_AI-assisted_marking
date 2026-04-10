/**
 * build.js — 零依赖 Node.js 构建脚本
 * 将 src/ 下的各模块合并，输出到 dist/zhixue_ai_marking.user.js
 *
 * 版本号唯一来源：src/config.js 中的 SCRIPT_CONFIG.VERSION
 * 修改版本时只需编辑 src/config.js，此处会自动提取。
 *
 * 用法: node build.js
 */

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SRC_DIR = path.join(__dirname, 'src');
const DIST_DIR = path.join(__dirname, 'dist');
const OUTPUT_FILE = path.join(DIST_DIR, 'zhixue_ai_marking.user.js');

// 模块加载顺序（顺序很重要：被依赖的模块先加载）
// config.js 必须第一个，其他模块都依赖 SCRIPT_CONFIG
const MODULE_ORDER = [
    'config.js',
    'preset.js',
    'ui-button.js',
    'ui-panel.js',
    'image.js',
    'grading.js',
    'updater.js',
    'main.js',
];

// ========== 从 src/config.js 提取版本号 ==========
function extractVersion() {
    const configPath = path.join(SRC_DIR, 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/VERSION\s*:\s*['"]([^'"]+)['"]/);
    if (!match) {
        throw new Error('无法从 src/config.js 解析 VERSION 字段，请检查格式。');
    }
    return match[1];
}

// ========== 构建逻辑 ==========

function readModule(filename) {
    const filePath = path.join(SRC_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(`模块文件不存在: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const divider = `\n// ========== [Module: ${filename}] ==========\n`;
    return divider + content + '\n';
}

function build() {
    const VERSION = extractVersion();

    const USERSCRIPT_HEADER = `// ==UserScript==
// @name         智学网AI自动打分助手
// @namespace    http://tampermonkey.net/
// @version      ${VERSION}
// @description  智学网AI自动批改助手，支持多套试卷方案管理、自动绑定切换、自动检查更新、精准题号识别、未保存拦截、流式评分！
// @author       5plus1
// @match        https://www.zhixue.com/webmarking/*
// @match        https://*.zhixue.com/webmarking/*
// @icon         https://www.zhixue.com/favicon.ico
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.ai.five-plus-one.com
// @connect      zhixue-sc.oss-cn-hangzhou.aliyuncs.com
// @connect      raw.githubusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==
`;

    console.log(`\n🔨 开始构建 v${VERSION}...\n`);

    // 确保 dist 目录存在
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
        console.log(`📁 创建目录: dist/`);
    }

    // 读取并拼接各模块内容
    let modulesContent = '';
    for (const mod of MODULE_ORDER) {
        try {
            modulesContent += readModule(mod);
            console.log(`  ✅ ${mod}`);
        } catch (e) {
            console.error(`  ❌ ${e.message}`);
            process.exit(1);
        }
    }

    // 用 IIFE 包裹所有模块代码
    const iife = `\n(function() {\n    'use strict';\n${modulesContent}\n})();\n`;

    // 最终输出 = 头部 + IIFE
    const output = USERSCRIPT_HEADER + iife;

    fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

    const sizeKB = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
    console.log(`\n✅ 构建完成！输出: dist/zhixue_ai_marking.user.js (${sizeKB} KB)\n`);
}

build();
