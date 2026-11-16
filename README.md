# Growmory

<p align="center">
  <strong>Local-first App Portfolio Management, ASO Studio & Growth Workspace for Indie Makers and Developers.</strong>
</p>

<p align="center">
  <strong>English</strong> •
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml"><img src="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D24.11-brightgreen.svg" alt="Node.js 24+" /></a>
</p>

<p align="center">
  <a href="#-why-growmory">Why Growmory?</a> •
  <a href="#-key-features">Key Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-mcp-integration">MCP Integration</a> •
  <a href="#-license--notice">License</a>
</p>

---

## 💡 Why Growmory?

Indie makers and solo developers often manage multiple mobile apps simultaneously while juggling marketing across diverse channels (App Store, X/Twitter, Reddit, Product Hunt, newsletters, blogs). Traditional workflows are fragmented: release notes live in random docs, screenshot localization takes hours in Figma, and performance metrics are scattered across disparate dashboards.

**Growmory** provides a quiet, dedicated, and self-contained workspace:
- **Local-First & Offline-Ready**: All data is stored in a local SQLite database. Your metrics, drafts, and customer insights stay 100% on your machine.
- **End-to-End Product Lifecycle**: Seamlessly connects `Knowledge Base → Version Release Prep → ASO Assets → Multi-Channel Marketing → Business Analytics`.
- **Deep AI & MCP Native**: Built-in Model Context Protocol (MCP) server enables seamless, secure collaboration with external AI assistants like Claude Desktop, Cursor, and Gemini CLI.

---

## ✨ Key Features

### 1. 📱 Multi-App Portfolio & Release Pipeline
- **App Portfolio Management**: Organize multiple iOS/macOS apps with App Store IDs, pricing models, custom brand accents, and core value propositions.
- **Version Timeline & History**: Manage multi-language release notes, readiness checks, and production release records with visual diffing.
- **Structured Knowledge Base**: Nested markdown documentation with full-text search, automatic revision tracking, and revision diff review.

### 2. 🎨 ASO Studio & Automated Screenshot Generation
- **Store Metadata Optimization**: Character counter, keyword density analysis, and localization manager for App Store titles, subtitles, and keywords.
- **Automated Screenshot & Mockup Studio**: Render pixel-perfect App Store promotional screenshots across multiple device form factors (6.9", 6.5", 5.5", iPad) using Remotion and 3D device models.
- **CPP & PPO Experimentation**: Draft and manage Custom Product Pages (CPP) and Product Page Optimization (PPO) variants with A/B testing insights.

### 3. 📊 Analytics & Conversion Funnel
- **App Store Connect Integration**: Track impressions, product page views, first-time downloads, redownloads, conversion rates, and sales trends.
- **Territory & Source Breakdown**: Analyze top geographic regions and acquisition channels (App Store Search, Browse, App Referrers, Web Referrers).
- **AI Diagnostics & Quick Tasks**: Generate weekly/monthly executive summaries with inline text-highlighting to instantly create actionable tasks.

### 4. 📢 Multi-Platform Marketing & Blog Sync
- **Unified Marketing Calendar**: Plan, write, and track promotional posts across X (Twitter), Reddit, Product Hunt, Xiaohongshu, WeChat, and more.
- **Static Site Publishing**: One-click sync from marketing posts to personal portfolio websites with automatic image optimization (WebP/PNG).
- **Social & Web Traffic Analytics**: Connect website analytics (e.g. Baidu Tongji OpenAPI) directly within your portfolio overview.

### 5. 🤖 Native MCP (Model Context Protocol) Server
Growmory includes a built-in standard MCP server exposing 40+ specialized tools to external AI Agents:
- Query product requirements, release diffs, and historical metrics.
- Generate and auto-fill ASO keywords and metadata drafts.
- Draft channel-tailored marketing posts and sync directly to the dashboard.
- Generate periodic business reviews and growth insights safely.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `>= 24.11.0` (Growmory utilizes Node.js built-in native SQLite and standard APIs)
- **OS**: macOS, Linux, or Windows

### 1. Clone & Install
```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
```

### 2. Environment Setup (Optional)
Copy the example environment file:
```bash
cp .env.example .env
```
Configure your AI provider keys (compatible with OpenAI Chat Completions API) or personal site domain as needed. (You can also configure AI keys anytime in the app Settings).

### 3. Start Development Server
```bash
npm run dev
```
Open **http://localhost:5173** in your browser.

> **💡 macOS One-Click Launch**:  
> Double-click `scripts/start-macos.command` to automatically verify Node version, clear port conflicts, and launch the server.

### 4. Production Build
```bash
npm run build
npm start
```

---

## 🛠 Architecture

Growmory is built with a lightweight, zero-bloat, local-first stack:

```
Growmory/
├── src/                # Modern Single-Page App (React 19 + TypeScript + Vite + TipTap)
├── server/             # Local backend (Node.js HTTP + Native SQLite + MCP Server)
├── scripts/            # Automation scripts, ASO rendering CLI, and startup helpers
├── tests/              # Comprehensive test suite (190+ unit & integration tests)
└── docs/               # Technical designs, changelog notes, and references
```

- **Database**: Native SQLite engine in Node.js 24 with WAL mode, revision lock protection, and zero background DB daemon required.
- **Privacy & Security**: All sensitive keys (App Store Connect API keys, AI keys) remain encrypted on your local disk and are never broadcast.

---

## 🔌 MCP Integration

Growmory communicates with external AI clients (like Claude Desktop) via standard Stdio transport.

Add this entry to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "growmory": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/Growmory/server/mcp-stdio.mjs"
      ]
    }
  }
}
```

Once connected, Claude or any MCP-compatible agent can directly read your portfolio context, optimize ASO drafts, and populate your workbench.

---

## 📄 License & Notice

- Source code is distributed under the [MIT License](LICENSE).
- **Remotion Commercial License Notice**: The screenshot generation feature uses [Remotion](https://www.remotion.dev/). It is free for individuals and small teams meeting their exemption criteria; commercial enterprises require a commercial license. See [NOTICE.md](NOTICE.md) for details.
- For deep historical implementation notes, refer to [docs/dev-notes.md](docs/dev-notes.md).

---

<p align="center">Made with ❤️ for indie developers and makers worldwide.</p>
