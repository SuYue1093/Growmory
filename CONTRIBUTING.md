# Contributing to Growmory / 贡献指南

Thank you for your interest in Growmory! / 感谢你关注并愿意为 Growmory 贡献代码！

## Scope & Expectations / 维护边界

Growmory is a **personal-use-first**, local-first workbench built by an indie maker to operate 5 iOS/macOS apps.
- Bug fixes, documentation improvements, and focused PRs that fit the local-first, single-maker philosophy are very welcome.
- Please open an issue to discuss large features before spending time implementing them—not all requests (such as Google Play, cloud multi-tenancy, or auto-posting bots) fit the project's scope.

Growmory 按「自用优先」节奏维护，聚焦于独立开发者的本地优先 iOS/macOS 运营工作流。欢迎修复 Bug 与符合本地优先理念的小而美 PR；大型新功能建议先开 Issue 讨论确认方向。

## Local Development / 本地开发

### Prerequisites
- **Node.js**: `>= 24.11.0` (built-in native SQLite)
- macOS, Linux, or Windows (WSL2 recommended on Windows)

```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
npm run dev
```

### Verification / 提交前校验
```bash
# Type check & production build
npm run build

# Run unit & integration tests
npm test
```

## Privacy & Security Principles / 安全与隐私原则
- **Never hardcode personal API keys, certificates, real App Store credentials, or private URLs.**
- **Never upload user workspace data to third-party servers without explicit user action.**
- Keep user data portable and local-first (SQLite + JSON backup).
- Contributions are licensed under the project's **AGPL-3.0** license.
