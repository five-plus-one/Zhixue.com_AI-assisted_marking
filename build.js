/**
 * build.js — 零依赖 Node.js 构建脚本
 * 将 src/core/ 和 src/adapters/ 下的模块合并，输出到 dist/
 *
 * 版本号唯一来源：src/core/config.js 中的 SCRIPT_CONFIG.VERSION
 * 修改版本时只需编辑 src/core/config.js，此处会自动提取。
 *
 * 用法: node build.js
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// ========== 配置 ==========
const SRC_DIR = path.join(__dirname, 'src');
const CORE_DIR = path.join(SRC_DIR, 'core');
const DIST_DIR = path.join(__dirname, 'dist');

// 核心模块加载顺序（顺序很重要：被依赖的模块先加载）
const CORE_MODULES = [
    'config.js',
    'state.js',
    'preset.js',
    'ui-toast.js',
    'ui-modal.js',
    'ui-stream.js',
    'ui-button.js',
    'ai-engine.js',      // ProviderManager + callAI (需在 ui-settings 之前)
    'prompt.js',          // buildPrompt + parse 函数 (需在 ui-settings 之前)
    'ui-settings.js',
    'ui-submit-dialog.js',
    'image.js',
    'correction.js',
    'history.js',
    'updater.js',
    'main.js',
];

// 构建配置
const BUILD_CONFIGS = [
    {
        name: 'all',
        outputFile: 'ai_marker.user.js',
        legacyOutputFiles: ['zhixue_ai_marking.user.js'],
        adapterModules: [
            'adapters/zhixue/selectors.js',
            'adapters/zhixue/adapter.js',
            'adapters/qitian/selectors.js',
            'adapters/qitian/adapter.js',
            'adapters/qitian-new/selectors.js',
            'adapters/qitian-new/adapter.js',
            'adapters/haofenshu/selectors.js',
            'adapters/haofenshu/adapter.js',
            'adapters/wuyue/selectors.js',
            'adapters/wuyue/adapter.js',
            'adapters/hanhan/selectors.js',
            'adapters/hanhan/adapter.js',
        ],
        header: {
            name: 'AI-Marker-Suite',
            namespace: 'http://tampermonkey.net/',
            description: 'AI自动批改助手，支持智学网、七天网络、好分数、五岳阅卷、华翰云等平台。自动识别答案、智能评分、自动提交！',
            author: '5plus1',
            match: [
                'https://www.zhixue.com/webmarking/*',
                'https://*.zhixue.com/webmarking/*',
                '*://*.7net.cc/*',
                '*://yj5.7net.cc/*',
                '*://*.qt7.net/*',
                '*://*.haofenshu.com/*',
                '*://*.wylkyj.com/*',
                '*://*.yunyuejuan.net/*',
            ],
            icon: 'https://www.zhixue.com/favicon.ico',
            grant: ['GM_xmlhttpRequest', 'GM_setValue', 'GM_getValue'],
            connect: [
                'api.ai.five-plus-one.com',
                'zhixue-sc.oss-cn-hangzhou.aliyuncs.com',
                'yjimage.oss-cn-hangzhou.aliyuncs.com',
                'static.7net.cc',
                'raw.githubusercontent.com',
                'yj-oss.yunxiao.com',
                'obs-yyj-sd.obs.cn-north-4.myhuaweicloud.com',
                '*',
            ],
            runAt: 'document-idle',
        },
    },
];

// ========== 从 src/core/config.js 提取版本号 ==========
function extractVersion() {
    const configPath = path.join(CORE_DIR, 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/VERSION\s*:\s*['"]([^'"]+)['"]/);
    if (!match) {
        throw new Error('无法从 src/core/config.js 解析 VERSION 字段，请检查格式。');
    }
    return match[1];
}

// ========== 从 src/core/config.js 提取 CHANGELOG ==========
function extractChangelog() {
    const configPath = path.join(CORE_DIR, 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/CHANGELOG\s*:\s*(\{[\s\S]*?\})\s*[,}]/);
    if (!match) return {};
    try {
        // 用 Function 安全求值
        const fn = new Function('return ' + match[1]);
        return fn() || {};
    } catch (e) {
        console.warn('  ⚠️ 解析 CHANGELOG 失败:', e.message);
        return {};
    }
}

// ========== 生成 manifest.json ==========
function generateManifest(version) {
    const changelog = extractChangelog();
    const manifest = {
        version: version,
        releaseDate: new Date().toISOString().slice(0, 10),
        downloadUrl: 'https://auto-update.aimarking.five-plus-one.com/ota/ai_marker.user.js',
        changelog: changelog
    };
    const manifestPath = path.join(DIST_DIR, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    const sizeKB = (fs.statSync(manifestPath).size / 1024).toFixed(1);
    console.log(`  ✅ 生成: dist/manifest.json (${sizeKB} KB)`);
}

// ========== 构建逻辑 ==========

function readModule(filePath, moduleName) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`模块文件不存在: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const divider = `\n// ========== [Module: ${moduleName}] ==========\n`;
    return divider + content + '\n';
}

function generateHeader(config, version) {
    const h = config.header;
    const lines = ['// ==UserScript=='];
    lines.push(`// @name         ${h.name}`);
    lines.push(`// @namespace    ${h.namespace || 'http://tampermonkey.net/'}`);
    lines.push(`// @version      ${version}`);
    lines.push(`// @description  ${h.description}`);
    lines.push(`// @author       ${h.author || '5plus1'}`);
    for (const m of h.match) lines.push(`// @match        ${m}`);
    if (h.icon) lines.push(`// @icon         ${h.icon}`);
    for (const g of h.grant) lines.push(`// @grant        ${g}`);
    for (const c of h.connect) lines.push(`// @connect      ${c}`);
    if (h.runAt) lines.push(`// @run-at       ${h.runAt}`);
    lines.push('// ==/UserScript==');
    return lines.join('\n') + '\n';
}

async function build() {
    const VERSION = extractVersion();

    console.log(`\n🔨 开始构建 AI-Marker-Suite v${VERSION}...\n`);

    // 确保 dist 目录存在
    if (!fs.existsSync(DIST_DIR)) {
        fs.mkdirSync(DIST_DIR, { recursive: true });
        console.log(`📁 创建目录: dist/`);
    }

    for (const buildConfig of BUILD_CONFIGS) {
        console.log(`\n📦 构建平台: ${buildConfig.name}`);

        // 读取适配器模块（需在核心模块之前加载，以便 window.__AI_MARKER_ADAPTER__ 可用）
        let modulesContent = '';
        if (buildConfig.adapterModules) {
            for (const mod of buildConfig.adapterModules) {
                const filePath = path.join(SRC_DIR, mod);
                if (fs.existsSync(filePath)) {
                    modulesContent += readModule(filePath, mod);
                    console.log(`  ✅ ${mod}`);
                } else {
                    console.log(`  ⏭️  ${mod} (跳过，文件不存在)`);
                }
            }
        }

        // 读取核心模块
        for (const mod of CORE_MODULES) {
            const filePath = path.join(CORE_DIR, mod);
            try {
                modulesContent += readModule(filePath, `core/${mod}`);
                console.log(`  ✅ core/${mod}`);
            } catch (e) {
                console.error(`  ❌ ${e.message}`);
                process.exit(1);
            }
        }

        // 用 IIFE 包裹所有模块代码
        const iife = `\n(function() {\n    'use strict';\n${modulesContent}\n})();\n`;

        // 压缩 IIFE 部分（保留 UserScript header 可读）
        console.log(`  ⏳ 压缩中...`);
        const minified = await minify(iife, {
            compress: { passes: 2, drop_console: false },
            mangle: { toplevel: false },
            format: { comments: false }
        });

        if (minified.error) {
            console.error(`  ❌ 压缩失败: ${minified.error}`);
            process.exit(1);
        }

        // 最终输出 = 头部 + 压缩后的 IIFE
        const header = generateHeader(buildConfig, VERSION);
        const output = header + minified.code;

        // 写入主输出文件
        const outputFile = path.join(DIST_DIR, buildConfig.outputFile);
        fs.writeFileSync(outputFile, output, 'utf8');
        const rawKB = (Buffer.byteLength(iife, 'utf8') / 1024).toFixed(1);
        const minKB = (Buffer.byteLength(minified.code, 'utf8') / 1024).toFixed(1);
        const totalKB = (fs.statSync(outputFile).size / 1024).toFixed(1);
        console.log(`  ✅ 输出: dist/${buildConfig.outputFile} (${totalKB} KB, 压缩前 ${rawKB} KB → 压缩后 ${minKB} KB)`);

        // 写入兼容文件副本（旧文件名保持可用）
        const legacyFiles = buildConfig.legacyOutputFiles || [];
        for (const legacyName of legacyFiles) {
            if (legacyName !== buildConfig.outputFile) {
                const legacyFile = path.join(DIST_DIR, legacyName);
                fs.writeFileSync(legacyFile, output, 'utf8');
                console.log(`  ✅ 兼容: dist/${legacyName}`);
            }
        }
    }

    // 生成 manifest.json（轻量级更新检查文件）
    generateManifest(VERSION);

    console.log(`\n✅ 全部构建完成！\n`);
}

build();
