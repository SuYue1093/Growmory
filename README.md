# Growmory

<p align="center">
  <strong>Local-first App Growth OS, ASO Studio & Native MCP Workbench for Indie iOS/macOS Developers.</strong>
</p>

<p align="center">
  <strong>English</strong> •
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml"><img src="https://github.com/SuYue1093/Growmory/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-blue.svg" alt="AGPL-3.0 License" /></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-%3E%3D24.11-brightgreen.svg" alt="Node.js 24+" /></a>
</p>

<p align="center">
  <a href="#-why-growmory">Why Growmory?</a> •
  <a href="#-scope--maintenance">Scope</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-mcp-integration">MCP Setup</a> •
  <a href="#-key-features">Features</a> •
  <a href="#-license--notice">License</a>
</p>

---

> **How Growmory differs from traditional ASO tools (Helm / Astro / AppFigures):**  
> Instead of another cloud dashboard or isolated keyword table, Growmory is a **local-first App Growth OS with a native 50+ tool MCP server**. Connect Cursor, Claude Code, or Claude Desktop to Growmory so your AI agent reads your real product docs, release diffs, and App Store Connect metrics—then drafts ASO metadata, Reddit/X launch posts, and growth reviews directly back into your workbench for human approval.

<!-- Record a 45-60s walkthrough GIF showing Cursor/Claude Code + Growmory MCP and save it to docs/demo.gif -->
<!-- ![Growmory MCP Walkthrough](docs/demo.gif) -->

---

## 🎯 Scope & Maintenance Expectations

Please read this before opening feature requests:

- **Personal-use-first**: Growmory was built to operate my own portfolio of 5 indie iOS/macOS apps. I maintain and iterate on it at a personal-use-first pace.
- **What is in scope**: Local-first SQLite workspace, Apple App Store Connect workflows (releases, ASO, CPP/PPO, in-app events, analytics), multi-channel marketing drafts, daily intelligence briefings, and MCP collaboration with AI coding agents.
- **What is NOT planned**: Google Play Store integration, Feishu/enterprise SaaS integrations, cloud multi-tenant auth, or automated social media posting bots.
- **Contributions**: Bug fixes and focused PRs that align with the local-first, single-maker philosophy are welcome. Not all feature requests will be prioritized.

---

## 🚀 Quick Start (3 Commands)

### Prerequisites
- **Node.js**: `>= 24.11.0` (uses Node.js built-in native SQLite—zero external database setup)
- **OS**: macOS, Linux, or Windows

### 1. Clone, Install & Run
```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

> **✨ Want to try it immediately without connecting App Store Connect?**  
> Click **Try Demo** right above **Workspace Settings** in the bottom-left sidebar. It switches to an isolated in-memory sandbox pre-loaded with two fictional apps (*FocusPulse* & *FlowStep*), complete with docs, releases, ASO metadata, analytics, marketing drafts, and briefings. Click **Exit Demo** anytime—your real local database is never touched.

### Optional: Environment Variables & Desktop Shortcuts
- Copy `.env.example` to `.env` if you want to pre-configure `PORT`, `DB_PATH`, or OpenAI-compatible AI keys (you can also configure AI keys inside **Settings → AI**).
- **macOS one-click launch / restart**: double-click `scripts/start-macos.command` or `scripts/restart-macos.command` (or run `npm run restart`).
- **Windows one-click launch / restart**: double-click `start-windows.bat` or `restart-windows.bat` (or run `npm run restart:windows`).
- **Production build**: `npm run build && npm start`.

---

## 🔌 MCP Integration (One-Click Setup)

Growmory exposes **50+ specialized MCP tools** so AI agents can read your product facts, analyze ASO markets, draft localized release notes & marketing posts, and save pending drafts for your review.

Start Growmory (`npm run dev`), enable MCP in **Workspace Settings → MCP**, and run the built-in setup helper for your client:

```bash
# Cursor
node scripts/connect-mcp.mjs --client cursor

# Claude Code
node scripts/connect-mcp.mjs --client claude-code

# Claude Desktop
node scripts/connect-mcp.mjs --client claude-desktop

# Also supports: codex, windsurf, trae, chatgpt-desktop
```

Or configure manually via Stdio in `claude_desktop_config.json` / Cursor MCP settings:

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

---

## 💡 Why Growmory?

- **Local-First & Private**: Everything lives in `./data/growmory.sqlite` on your machine. API keys and App Store Connect credentials never leave your computer.
- **End-to-End Indie App Lifecycle**: Connects `Knowledge Base → Version Release Prep → ASO Studio → Multi-Channel Marketing → Analytics & Briefings`.
- **Human-in-the-Loop AI**: Agents can create and update drafts via MCP, but product knowledge docs stay `pending` until you review and confirm them in the UI.

---

## ✨ Key Features

1. **📱 Multi-App Portfolio & Release Pipeline**: Organize iOS/macOS apps, nested Markdown knowledge docs with revision diffs, and multi-language release notes.
2. **🎨 ASO Studio & Store Optimization**: Localized metadata editor, keyword research, Custom Product Pages (CPP), Product Page Optimization (PPO), In-App Events, and Artwork Lab.
3. **📊 App Analytics & Conversion Funnel**: App Store Connect impressions, page views, downloads, territory/source breakdown, and AI diagnostic reports with one-click task extraction.
4. **📢 Multi-Channel Marketing & Operations**: Plan and track posts across X, Reddit, Product Hunt, Xiaohongshu, and more, plus social performance imports.
5. **📰 Daily Intelligence Briefings**: Track competitor moves, platform changes, and user voices, then convert high-signal items into knowledge docs or tasks.

---

## 🛠 Architecture

```
Growmory/
├── src/                # React 19 + TypeScript + Vite + TipTap SPA (EN / ZH auto-detected)
├── server/             # Native Node.js HTTP server + Node 24 SQLite + MCP server
├── scripts/            # One-click MCP connector, startup scripts & sandbox helpers
├── tests/              # 240+ native Node.js unit & integration tests
└── docs/               # Technical architecture and design notes
```

---

## 📄 License & Notice

- Licensed under the **[GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)**.
- Free for personal and local self-hosted use. If you modify Growmory and offer it as a hosted SaaS / network service, you must open-source your changes under AGPL-3.0 or obtain a commercial license.
- Third-party notices and disclaimers: [NOTICE.md](NOTICE.md).

---

<p align="center">
  <strong>Built by <a href="https://hisuyue.com">SuYue</a> to operate my 5 indie iOS apps</strong><br/>
  <a href="https://hisuyue.com">Website</a> •
  <a href="https://x.com/suyue1093">X (@suyue1093)</a> •
  <a href="https://www.xiaohongshu.com/user/profile/61cecc990000000002019271">Xiaohongshu (小红书)</a> •
  <a href="https://github.com/SuYue1093">GitHub</a><br/>
  Indie Apps: <a href="https://apps.apple.com/app/id6779620781">StepBy (一步步)</a> &amp; <a href="https://apps.apple.com/app/id6790251925">Firefly Todo (萤火待办)</a>
</p>
