# 贡献指南 (Contributing to Growmory)

感谢你关注并愿意为 Growmory 贡献代码或提出想法！Growmory 致力于为独立开发者打造最好的本地优先产品与运营工作台。

## 开发规范与流程

### 1. 环境准备
- **Node.js**: 需要 `>= 24.11.0`（内置 SQLite 支持）。
- 建议使用 macOS / Linux，Windows 建议在 WSL2 下体验更佳。

### 2. 本地开发
```bash
git clone https://github.com/SuYue1093/Growmory.git
cd Growmory
npm install
npm run dev
```

### 3. 代码质量与测试
提交代码前，请确保本地通过以下校验：
```bash
# 验证 TypeScript 类型与前端打包
npm run build

# 运行单元测试
npm test
```

### 4. 提交规范
- 提交 PR 请尽量保持改动专注，一个 PR 解决一个明确的问题。
- PR 标题推荐采用简洁明了的语义化前缀：`feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...` 等。

## 安全与隐私原则
Growmory 是一个本地优先（Local-First）且极度注重隐私的产品：
- **禁止硬编码任何私人 API Key、证书或个人专属 URL**。
- 绝不在未经用户明确操作的情况下向任何第三方服务器上传工作区私有数据。
- 保持数据可导出、可迁移（支持 JSON 备份与 SQLite 本地持久化）。
