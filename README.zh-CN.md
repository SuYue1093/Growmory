# Growmory

<p align="center">
  <strong>专为独立开发者打造的本地优先 App 增长操作系统、ASO 工作室与原生 MCP 工作台。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> •
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml"><img src="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml/badge.svg" alt="CI 构建状态" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="AGPL-3.0 协议" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D24.11-brightgreen.svg" alt="Node.js 24+" /></a>
</p>

<p align="center">
  <a href="#-为什么做-growmory">为什么做 Growmory？</a> •
  <a href="#-项目边界与维护说明">维护边界</a> •
  <a href="#-快速上手3-条命令跑起来">快速上手</a> •
  <a href="#-mcp-一键接入">MCP 接入</a> •
  <a href="#-核心功能">核心功能</a> •
  <a href="#-开源协议与声明">开源协议</a>
</p>

---

> **Growmory 和传统 ASO 工具（Helm / Astro / AppFigures）有什么区别？**  
> 它不是又一个云端报表网站，而是一套 **本地优先的 App Growth OS + 内置 50+ 工具的原生 MCP 服务**。把 Cursor、Claude Code 或 Claude Desktop 连上 Growmory 后，AI 可以直接基于你的真实产品资料、版本差异和 App Store Connect 数据，生成 ASO 草稿、Reddit / X / 小红书宣发帖和周报复盘，并回填到工作台等待你人工审阅确认。

<!-- 录制 45-60 秒 Cursor/Claude Code + Growmory MCP 演示 GIF 后放到 docs/demo.gif -->
<!-- ![Growmory MCP 演示](docs/demo.gif) -->

---

## 🎯 项目边界与维护说明

在提 Feature Request 前请先了解：

- **自用优先**：Growmory 是作者为管理自己 5 款 iOS / macOS 独立 App 打造的个人工具，按“自用优先”的节奏持续迭代，不承诺响应所有功能请求。
- **聚焦范围**：本地优先 SQLite 工作区、Apple App Store Connect 全流程（版本发布、ASO、CPP/PPO、App 内活动、数据分析）、多渠道宣发管理、每日情报简报，以及与 AI Agent 的 MCP 协作。
- **暂不计划支持**：Google Play 商店接入、飞书/企业级多租户权限系统、社交平台自动发布机器人等重维护需求。
- **欢迎贡献**：欢迎提交 Bug 修复或符合“本地优先、极简独立开发”理念的 PR。

---

## 🚀 快速上手（3 条命令跑起来）

### 环境要求
- **Node.js**：`>= 24.11.0`（直接使用 Node.js 原生内置 SQLite，无需安装任何外部数据库）
- **操作系统**：macOS、Linux 或 Windows

### 1. 克隆、安装并启动
```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
npm run dev
```

启动后在浏览器访问：**http://localhost:5173**

> **✨ 想先看效果，暂时不想连 App Store Connect？**  
> 点击左侧栏「工作区设置」上方的 **Demo 体验** 按钮，即可一键切入内置的独立内存沙箱，体验包含 2 款虚构 App（*FocusPulse* 与 *FlowStep*）的完整产品资料、版本、ASO、数据、营销草稿与情报简报。随时点击 **退出 Demo** 即可恢复本地工作区，**绝不触碰你的真实数据**。

### 可选配置与快捷脚本
- 如需自定义端口、数据文件路径（`DB_PATH`）或默认 AI 密钥，可复制模板：`cp .env.example .env`（AI 密钥也可直接在网页「工作区设置 → AI 模型」中配置）。
- **macOS 快捷启动 / 重启**：双击 `scripts/start-macos.command` 或 `scripts/restart-macos.command`（亦可在终端运行 `npm run restart`）。
- **Windows 快捷启动 / 重启**：双击根目录 `start-windows.bat` 或 `restart-windows.bat`（亦可在终端运行 `npm run restart:windows`）。
- **生产构建**：`npm run build && npm start`。

---

## 🔌 MCP 一键接入

Growmory 内置 **50+ 个专用 MCP 工具**，让外部 AI Agent 直接读写你的产品上下文、做 ASO 市场调研、撰写发版日志与多渠道宣发草稿。

先启动 Growmory（`npm run dev`），在「工作区设置 → MCP」中开启连接，然后运行内置一键配置脚本：

```bash
# Cursor
node scripts/connect-mcp.mjs --client cursor

# Claude Code
node scripts/connect-mcp.mjs --client claude-code

# Claude Desktop
node scripts/connect-mcp.mjs --client claude-desktop

# 同时支持：codex、windsurf、trae、chatgpt-desktop
```

也可以手动在 `claude_desktop_config.json` 或 Cursor MCP 配置中添加 Stdio 入口：

```json
{
  "mcpServers": {
    "growmory": {
      "command": "node",
      "args": [
        "/绝对路径/Growmory/server/mcp-stdio.mjs"
      ]
    }
  }
}
```

---

## 💡 为什么做 Growmory？

- **100% 本地优先与隐私安全**：全部业务数据保存在本机 `./data/growmory.sqlite`，所有 API Key 与 App Store 密钥仅留存本机。
- **全链路串联**：打通 `产品资料库 → 版本发布准备 → ASO 优化 → 多平台宣发 → 数据分析与情报简报`。
- **人机协作闭环**：AI 通过 MCP 生成或修改的资料默认保持「待确认（pending）」状态，必须由你在界面人工核对后确认，杜绝幻觉污染事实库。

---

## ✨ 核心功能

1. **📱 多产品资产与版本发布流**：管理多款 iOS/macOS App、支持嵌套目录与历史 Diff 的 Markdown 资料库，以及多语言更新日志。
2. **🎨 ASO 工作室与商店页优化**：多语言元数据与关键词密度分析、关键词市场调研、自定义产品页（CPP）、产品页优化（PPO）、App 内活动与截图实验室。
3. **📊 App 数据分析与转化漏斗**：同步 App Store Connect 曝光、页面浏览、下载与地区/来源分布，支持 AI 诊断报告与划词转待办。
4. **📢 多平台宣发与运营复盘**：统一管理小红书、X、Reddit、Product Hunt、公众号等渠道草稿、发布状态与数据导入复盘。
5. **📰 每日情报简报**：按产品主题追踪竞品动态、平台变化与用户痛点，一键将高价值情报转为产品资料或待办任务。

---

## 🛠 系统架构

```
Growmory/
├── src/                # React 19 + TypeScript + Vite + TipTap 前端（按浏览器语言自动切换中/英文）
├── server/             # Node.js 原生 HTTP + Node 24 原生 SQLite + MCP 服务端
├── scripts/            # MCP 一键配置脚本、跨平台启动脚本与沙箱测试脚本
├── tests/              # 240+ 个 Node.js 原生单元与集成测试
└── docs/               # 技术设计文档与演进记录
```

---

## 📄 开源协议与声明

- 本项目基于 **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)** 开源。
- 个人开发者与团队在本地自用完全免费；若修改本项目并对外提供托管 SaaS / 网络服务，须遵守 AGPL-3.0 开源对应改动，或联系作者获取商业授权。
- 第三方组件许可与免责声明请参阅 [NOTICE.md](NOTICE.md)。

---

<p align="center">
  <strong>Built by <a href="https://hisuyue.com">SuYue</a> to operate my 5 indie iOS apps</strong><br/>
  <a href="https://hisuyue.com">个人主页</a> •
  <a href="https://x.com/suyue1093">X (@suyue1093)</a> •
  <a href="https://www.xiaohongshu.com/user/profile/61cecc990000000002019271">小红书 (SuYue | AI独立开发)</a> •
  <a href="https://github.com/SuYue1093">GitHub</a><br/>
  独立作品：<a href="https://apps.apple.com/app/id6779620781">一步步（StepBy）</a> &amp; <a href="https://apps.apple.com/app/id6790251925">萤火待办</a>
</p>
