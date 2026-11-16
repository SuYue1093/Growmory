# Growmory

<p align="center">
  <strong>面向独立开发者的本地优先（Local-First）App 产品管理、ASO 优化与运营工作台</strong>
</p>

<p align="center">
  <a href="#-核心特性">核心特性</a> •
  <a href="#-快速上手">快速上手</a> •
  <a href="#-系统架构">系统架构</a> •
  <a href="#-mcp-协议支持">MCP 联动</a> •
  <a href="#-开源协议与声明">开源协议</a>
</p>

---

## 💡 为什么选择 Growmory？

作为个人或小团队独立开发者，往往同时维护多个 App，并在多个平台（App Store、小红书、X、即刻、个人博客等）进行内容运营。传统方案碎片化严重：文档散落各处、商店文案与截图制作耗时费力、数据分析跨越多个后台。

**Growmory** 旨在提供一个安静、纯粹且强大的工作空间：
- **本地优先（Local-First）**：所有数据均存储在本地 SQLite 中，断网可用，隐私数据 100% 掌控在自己手中。
- **开箱即用的闭环流程**：从「产品知识库 → 版本准备 → ASO 商店资产 → 营销宣发 → 数据复盘」全流程覆盖。
- **深度 AI & MCP 原生驱动**：内建 Model Context Protocol (MCP) 服务端，可与 Claude Desktop、Cursor、Gemini 等外部 AI Agent 无缝协同。

---

## ✨ 核心特性

### 1. 📱 多产品矩阵与版本管理
- **集中管理产品资产**：管理多款应用的 App Store ID、分类、定价策略、图标与核心卖点。
- **版本发布时间轴**：记录各版本的更新说明、发布状态与线上发布历史，直观对比版本差异。
- **结构化资料库**：支持 Markdown 文档分级整理、全文搜索、版本修订与快速知识提取。

### 2. 🎨 ASO 优化工坊与截图生成
- **App Store 元数据深度优化**：多语言标题、副标题、关键词组分析与字符限制实时校验。
- **自动化截图与视频渲染**：基于 Remotion 与 3D 设备样机，一键批量生成各机型（6.9"、6.5"、5.5"、iPad）的高清商店宣传图。
- **CPP 与 PPO 实验管理**：支持 App Store 自定义产品页面（CPP）与产品页面优化（PPO）变体草稿管理。

### 3. 📊 数据分析与转化漏斗
- **App Store Connect 数据集成**：展示展现次数、产品页面查看次数、下载量、付费转化率及销售趋势。
- **多维度留存与地域分析**：覆盖全球主要地区分布、流量来源细分（App Store 搜索、浏览、引荐等）。
- **AI 智能周报/月报**：一键生成多维度业务诊断报告，支持在报告中“划词”快速提炼待办任务。

### 4. 📢 营销内容矩阵与独立作品站同步
- **跨平台宣发日历**：统一管理小红书、X (Twitter)、公众号、掘金、Reddit 等多渠道草稿与发布链接。
- **个人作品站一键构建**：支持将营销文章一键同步至个人静态博客/独立站，并自动优化图片格式（WebP/PNG）。
- **第三方运营统计**：支持通过 OpenAPI 对接独立站访问统计（如百度统计等）。

### 5. 🤖 开放 MCP (Model Context Protocol) 赋能
Growmory 内置标准 MCP 协议服务，外部 AI 编程助理或桌面 Agent 可直接安全调用 Growmory 能力：
- 读取产品上下文与版本需求
- 自动分析 ASO 关键词并保存文案草稿
- 生成多平台宣发文案并回填工作台
- 自动化生成周期性数据复盘报告

---

## 🚀 快速上手

### 环境要求
- **Node.js**：`>= 24.11.0`（本项目深度使用 Node.js 原生内置 SQLite 与标准 API）
- **操作系统**：macOS、Linux 或 Windows

### 1. 克隆项目与安装依赖
```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
```

### 2. 配置环境变量（可选）
复制配置模板：
```bash
cp .env.example .env
```
根据需要配置 AI 密钥（兼容 OpenAI 规范）或独立站域名（也可在运行后在网页设置中配置）。

### 3. 启动开发服务
```bash
npm run dev
```
启动后在浏览器中访问：**http://localhost:5173**

> **💡 macOS 快捷启动**：  
> 双击运行 `scripts/start-macos.command`，脚本将自动检查 Node 版本、排查端口占用并一键拉起服务。

### 4. 生产构建
```bash
npm run build
npm start
```

---

## 🛠 系统架构

Growmory 采用极简、高效、无冗余的本地全栈架构：

```
Growmory/
├── src/                # 前端单页应用（React 19 + TypeScript + Vite + TipTap）
├── server/             # 本地服务层（Node.js 原生 HTTP / 原生 SQLite / MCP 服务端）
├── scripts/            # 自动化脚本、ASO 离线渲染器、启动脚本
├── tests/              # 完整的 Node.js 原生测试集（200+ 单元测试）
└── docs/               # 技术设计文档、演进备忘录与协议说明
```

- **数据层**：基于 Node.js 24 原生内置 SQLite 引擎，文件轻量持久化，无需外部数据库守护进程。
- **安全保障**：所有外部 API Key（OpenAI、Apple 证书等）仅留存在用户本机后端，绝不外发。

---

## 🔌 MCP 协议支持

Growmory 支持通过标准 Stdio 方式连接至外部 AI 客户端（如 Claude Desktop）。

在 Claude Desktop 配置文件（`claude_desktop_config.json`）中添加：

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
配置完成后，Claude 等外部 Agent 即可通过 40+ 个专用工具直接协助你进行产品管理、ASO 优化与报告撰写。

---

## 📄 开源协议与声明

- 本项目代码基于 [MIT License](LICENSE) 开源。
- **Remotion 商业许可说明**：本项目在截图渲染模块使用了 Remotion。个人或符合其免商业许可条件的小团队可免费使用；企业商业用途需遵守 [Remotion Licensing](https://www.remotion.dev/license)。详情见 [NOTICE.md](NOTICE.md)。
- 更多历史设计与演进细节，请参阅 [docs/dev-notes.md](docs/dev-notes.md)。

---

<p align="center">Made with ❤️ for indie developers and makers.</p>
