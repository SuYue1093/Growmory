# Growmory

用 React 搭建的轻量 App 产品与运营工作台。单人、本地优先，围绕「产品知识 → 版本准备 → 营销内容 → 任务」组织 P0。

## 启动

需要 Node.js 24.11 或以上版本（使用内置 SQLite）。

macOS 可直接双击根目录的 `启动本地环境.command`，也可在终端运行 `./启动本地环境.command`。脚本会检查 Node.js 版本，首次运行时自动安装依赖，并启动开发环境；按 Control+C 停止服务。

```sh
npm install
npm run dev
```

开发模式下页面代码会自动更新；修改 `server/` 中的后端代码后，需要重启开发服务（双击根目录 `重启服务.command` 或终端运行 `npm run restart` / `./restart.sh`），使新增接口生效。若新页面提示“不支持的连接操作”，请先重启服务再刷新页面。

打开 http://localhost:5173 。服务仅监听本机回环地址，无需登录。数据保存在 `data/growmory.sqlite`，重启保留。不要将此单人服务直接暴露至公网。

生产构建和启动：

```sh
npm run build
npm start
```

## 已实现

- 支持录入多个 App 产品的图标、基础介绍与元数据；介绍默认为待确认，价格不预填以避免猜测。
- 产品新增、编辑及全局范围切换，必要字段保留 App Store ID、价格、平台和官网。
- Markdown 文档编辑、预览、确认、历史记录、恢复和全文搜索；支持嵌套文件夹整理文档。
- 版本更新自由文本、语言和渠道选择，沿用上一版本配置。
- AI 准备文档修改建议、多语言更新说明和跨渠道营销草稿；人工确认说明与文档差异，保存修改历史。
- 可编辑 AI 草稿；未配置 AI 时，手工编写说明、内容并完成发布准备。
- 内容草稿、待审核、已发布、归档，计划日期、实际发布链接与复制。
- 关联产品和版本的任务，完成与撤销，保存后刷新不丢失。
- 工作区 JSON 导出、导入恢复；SQLite revision 检查避免旧窗口覆盖新数据。
- 响应式布局、键盘可用的弹窗、轻微悬浮动效及减少动态效果支持。

## 2026-11-05 体验改版

日常导航已调整为「工作台、产品、内容、待办」。产品资料、版本、商店优化和数据表现归入产品空间；初始化在「工作区设置 → 连接与同步」中打开。工作台与待办共用实时提醒，版本详情按四个阶段展开。页面地址可用于刷新恢复和直达，主要编辑表单支持当前浏览器会话内的未保存草稿恢复。

完整变更、验收结果和限制见 [整体体验优化实施记录](docs/experience-redesign-20261105.md)。`tests/browser.mjs` 已适配新导航与阶段流程，并改用独立测试夹具；本轮界面验收通过浏览器控制工具在隔离测试库执行，更新后的脚本仅完成语法检查，尚未整套运行。

## AI 配置

站内 AI 服务现已支持**直接在网站中配置**：前往「工作区设置 → AI 与 Agent」，直接填写服务地址、API 密钥与模型即可保存并测试连接，无需手动修改 `.env` 或重启服务。

同时也兼容使用 `.env` 环境变量作为默认回退配置：

```dotenv
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=你的密钥
AI_MODEL=你的模型名称
```

支持 OpenAI、DeepSeek、Moonshot (Kimi)、智谱 GLM、硅基流动、Ollama 等任意兼容 `/v1/chat/completions` 协议的模型服务。密钥仅保存在本机数据文件（权限 0600），由本机服务端调用，不上传至任何第三方，也不通过状态接口泄露明文。

生成时发送产品资料、已确认文档与本次更新到配置的模型提供方。模型返回的内容先作为草稿，不自动覆盖文档；文档确认时检查原文是否发生变化。

生成需要可用的模型密钥和网络。未配置时明确提示，不展示模拟生成结果。

## 范围与数据

已支持 App Store Connect 连接、产品关联、版本同步，以及在版本页面预览并确认的更新说明写入、构建选择、审核提交和手动上架。暂不连接社交账号或上传二进制构建。「记录为已发布」仍是本机人工记录；读取 Apple 状态确认已上架后也会自动标记本机已发布。首页数字为本机工作区记录数量，不是经营数据。

文档正文与功能说明使用自由文本；状态、产品归属、语言、渠道与版本保留必要结构。没有额外的团队权限、工作流搭建器或复杂配置系统。

正式使用前建议核对各产品的功能现状，补齐平台、价格等基础资料。

## 验证

```sh
npm run build
npm test
```

`npm test` 验证 SQLite 保存、历史保留、旧 revision 拒绝、备份数据校验，以及使用本地模拟提供方的 AI 请求上下文、提案校验与不直接覆盖正式资料。

浏览器端到端测试单独使用测试数据库启动服务，避免污染正式工作区：

```sh
PORT=5174 DB_PATH=/tmp/growmory-qa.sqlite npm run dev
# 另一个终端（需要本机 Google Chrome）：
node tests/browser.mjs
```

浏览器测试会重置 **5174 测试服务** 的工作区，覆盖文档确认与历史恢复、版本准备、说明审核、内容编辑、任务完成与撤销、刷新持久化、搜索，以及 1440 / 1024 / 768 / 390 / 320px 的主要页面布局。AI 的真实模型质量与真实账号调用需要配置后另行验收。

## 代码结构

- `src/main.tsx`：页面、表单与业务操作。
- `src/style.css`：克制的白灰、蓝色与蓝紫渐变视觉系统。
- `src/types.ts`：业务数据类型。
- `server/index.mjs`：本机 HTTP API、AI 代理、开发及生产入口。
- `server/store.mjs` / `server/validate.mjs`：SQLite 数据保存与校验。
- `server/seed.json`：官网初始资料。
- `tests/`：持久化、AI 接口与浏览器验证。

## MCP 连接（本机 AI 管理）

在「工作区设置 → AI · MCP 连接」中复制 stdio 或 HTTP 配置，添加到支持对应传输方式的本机 AI 客户端。使用期间保持 Growmory 服务运行。

- **stdio**：配置自动包含本机 Node 路径与入口文件绝对路径。客户端通过本机服务读写资料；不另开数据库，不绕过权限。密钥从本机受保护文件读取，轮换后无需更改 stdio 配置。
- **HTTP**：使用 Streamable HTTP，端点为 `http://127.0.0.1:5173/mcp`。复制配置会包含 Bearer 密钥。重置密钥后需重新复制 HTTP 配置。
- 默认开启「读取与编辑」，可随时切为只读或关闭。服务只监听本机地址，云端 AI 服务无法直接访问这台电脑的 localhost。
- 外部 AI 使用客户端自身的模型，不依赖 Growmory `.env` 中的模型密钥；工作区内的「生成发布草稿」按钮仍使用 `.env` 配置。

提供 9 个工具：

| 工具 | 作用 |
| --- | --- |
| `list_records` | 按类型、产品、关键词查询记录，支持分页 |
| `get_record` | 读取完整记录及当前 revision |
| `save_products` | 新增或编辑产品资料 |
| `save_docs` | 新增或编辑文档，正文变化自动保留历史 |
| `save_docFolders` | 管理知识库文件夹及嵌套层级 |
| `save_releases` | 管理版本和更新说明 |
| `save_contents` | 管理营销内容、日期、状态及链接 |
| `save_tasks` | 管理任务，完成或撤销 |
| `delete_record` | 删除记录；产品仍有关联资料时拒绝删除 |
| `get_ai_status` | 查询站内 AI 服务状态与当前模型（密钥脱敏返回） |
| `configure_ai_service` | 配置或修改站内 AI 服务（支持连通性校验与即时生效） |

创建时省略 id，编辑时仅传变更字段；写入需要最新 `expectedRevision`。严禁 Agent 直接将资料库文档标记为已确认（confirmed），所有由 Agent 写入或编辑的资料均保持待确认（pending）状态，必须由用户在 Growmory 界面人工核对并确认。页面会自动同步外部修改；正在编辑的内容不会被后台刷新替换，发生写入冲突时要求核对后再保存。

连接密钥和权限设置保存在 `data/mcp-access.json`，文件权限为 0600；此文件不包含在资料导出中。不要分享包含 Bearer 密钥的 HTTP 配置。MCP 操作只管理本机记录，不执行商店提交或社交公开发布。

实现使用 [MCP 官方 TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)。协议测试通过真实 SDK 客户端覆盖 HTTP、stdio、资料编辑、只读限制、关闭连接、密钥轮换和旧 revision 拒绝。

## ASO 图片实验室

从产品详情的「ASO 优化 → ASO 图片实验室」查看方案列表。创建方案时选择本地化语言、设备组和成品像素尺寸。iPhone Duo 可选择外屏或内屏的横竖尺寸。[Apple 截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)

1. 复制「Agent 方案任务」给有 Growmory MCP 编辑权限的 Agent。Agent 核对真实功能并用 `save_aso_artwork_plan` 回填逐图文案和预期截图。用一句话描述画面里必须可见的内容，构图和实现细节分别交给成图和截图环节。
2. 确认方案后复制「Agent 截图任务」。本任务仅使用离屏渲染。复用目标 App 的视图与样本，在独立临时存储中按场景和语言加载，按逐图标识导出 PNG，再上传到对应的原图位置。每张 iPhone 离屏截图都带可见状态栏。iPhone Duo 外屏横竖屏与内屏横屏使用右侧纵向状态栏，内屏竖屏使用顶部横向状态栏。其他 iPhone 按机型和方向适配并预留安全区。离屏渲染失败时保留该图位为空，报告尝试与阻塞，继续其他图位。用户明确要求改用模拟器时，才使用模拟器截图工具。[Apple 的 iPhone Duo 布局指南](https://developer.apple.com/design/human-interface-guidelines/designing-for-iphone-duo)
3. 核对原始截图，复制成图方案或下载交付包。提示词要求 Chat AI 先用首张原图和文案制作一张成图，按产品界面和随附品牌素材确定风格。首张确认后，再按指定图项逐张制作。
4. 在详情的「最终成图」位置上传 PNG 或 JPEG，成图须符合方案指定的像素尺寸。齐全后选择 App Store 版本，提交到「ASO 图片」的本地草稿。

方案、原图和最终成图保存在当前工作区 SQLite 文件中。需要迁移时请备份 SQLite 数据库。

## 界面与 Logo

正文和表单使用约 15–16px 字号，辅助信息使用约 12–14px。首页移除宣传横幅与重复装饰文字。关闭编辑、恢复文档历史、生成草稿、记录发布无需额外确认；删除资料及覆盖备份仍需确认。

编辑或新建产品时可上传 PNG、JPG、WebP Logo，源文件最大 5 MB。图片在浏览器转换为 256×256 透明 PNG，保持原图比例并居中，随产品资料保存在 SQLite 中，也随 JSON 备份导出。上传失败时保留原 Logo。

新增界面验证（先完成基础浏览器测试以生成测试版本）：

```sh
node tests/ui-refinements.mjs
```

覆盖 Logo 上传与刷新持久化、格式校验、无额外确认的操作、真实 MCP 修改后页面自动同步、权限切换与 MCP 设置页响应式布局。

## 复制提示词，交给 AI 自动连接

「工作区设置 → AI · MCP 连接」提供 **复制连接提示词** 与 **下载连接脚本**。用户将提示词粘贴给可执行本机命令的 AI 后，AI 识别当前客户端，运行脚本完成配置与检查。原有配置保留在「手动配置与密钥」中。

脚本位于 `scripts/connect-mcp.mjs`，下载版不依赖项目的 npm 包，可以直接用 Node.js 运行：

```sh
# 仅验证，不修改任何客户端配置
node scripts/connect-mcp.mjs --check

# 为指定客户端配置（只执行你正在使用的那一个）
node scripts/connect-mcp.mjs --client codex
node scripts/connect-mcp.mjs --client claude-code
node scripts/connect-mcp.mjs --client cursor
node scripts/connect-mcp.mjs --client claude-desktop

# 服务使用其他端口时
node scripts/connect-mcp.mjs --url http://127.0.0.1:5174 --check
```

脚本先通过 MCP 初始化、发现工具并调用 `list_records` 读取产品；随后备份并合并目标客户端的 `growmory` 配置，保留其他配置。Codex 使用官方 CLI 注册；其他客户端按各自 JSON 配置格式合并。重复执行不会重复添加条目，配置损坏时拒绝覆盖。备份与新配置文件权限为 0600，提示词、下载脚本与输出均不包含连接密钥。脚本不变更 MCP 开关、访问权限或产品资料。

脚本检查成功表示独立协议访问可用；当前 AI 聊天仍需加载新配置后才能调用工具。提示词要求 AI 最后从当前聊天实际调用 `growmory.list_records`，否则明确报告需重新加载、重开聊天或重启客户端。脚本不会自动退出客户端。纯网页或远程 AI 没有本机执行能力时无法自动配置 localhost。

验证使用隔离目录：覆盖配置备份、保留其他服务、幂等性、损坏配置拒绝、真实 MCP 查询、下载脚本独立运行；本机存在 Codex CLI 时，使用临时 `CODEX_HOME` 验证真实注册，不修改用户当前配置。

配置格式参考：[OpenAI MCP 文档](https://learn.chatgpt.com/docs/extend/mcp)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Cursor MCP](https://prod.cursor.com/help/customization/mcp)、[本地 MCP 连接](https://modelcontextprotocol.io/docs/develop/connect-local-servers)。

### ChatGPT 桌面客户端

连接页现在默认选择「ChatGPT 桌面端」，复制的是专用提示词。它先检查当前聊天是否已有 Growmory 工具，再区分是否能执行本机命令；普通聊天无本机终端权限时，不会声称已运行脚本或连接成功。

按 [OpenAI 当前官方说明](https://learn.chatgpt.com/docs/extend/mcp)，支持本机 MCP 的 ChatGPT 桌面端可在「设置 → MCP servers → Add server」选择 STDIO，填写页面提供的命令、参数与环境变量，保存并重新加载。同一 Codex 主机上的 ChatGPT 桌面端、CLI 与 IDE 共享 MCP 配置；脚本因此支持 `--client chatgpt-desktop`，在能够执行本机命令的环境中使用官方 CLI 写入共享配置。

不能将任意版本、账号或聊天模式都视为已拥有本机 MCP 或终端能力。若客户端没有本机 MCP 入口、只允许添加远程服务，本机 localhost 和 stdio 配置无法直接作为远程连接使用；需要另行设置远程 MCP 或 [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)，并满足相应账号与工作区权限。复制提示词不会授予这些能力。

页面及协议测试不代表已验证用户具体 ChatGPT 客户端。最终验收仍是从目标 ChatGPT 聊天中成功调用 `growmory.list_records`。

### 普通 Chat 与本机 Work 的验证边界

用户实际验证发现：MCP 在桌面设置中存在，本机协议握手与工具查询通过，但普通 Chat 的当前工具列表中没有 Growmory。此时不能把已注册或独立协议调用成功等同于普通 Chat 接入成功，也不应要求重复修改 STDIO 路径。

连接页因此区分「ChatGPT · 普通 Chat」「ChatGPT · 本机 Work / MCP」及其他本机 AI。普通 Chat 入口明确显示当前没有配置远程连接，不提供本机注册脚本作为其修复方法。要使用普通 Chat，应通过目标账号可启用的插件／远程 MCP 连接；可另行设置经过鉴权的远程服务或 OpenAI Secure MCP Tunnel。是否支持及可用入口取决于目标客户端、账号、工作区和实际聊天环境，不能仅凭 MCP 设置页的存在判断。

当前实现仍为本机服务，未建立远程连接、未创建隧道，不能宣称普通 Chat 已修复。最终验收是目标 Chat 会话中的真实工具调用。


## App Store Connect API 连接

打开「工作区设置 → App Store Connect」，填写团队 API Key 的 Issuer ID、10 位 Key ID，并上传 Apple 下载的 `.p8` 私钥，点击「保存并测试连接」。凭据保存成功后会请求 Apple App 列表；测试失败时保留已保存凭据，页面显示失败原因，可修改后重试。个人 API Key 暂不支持。

- 在 [App Store Connect 用户与访问 → 集成](https://appstoreconnect.apple.com/access/integrations/api) 获取团队 API Key，需具备读取目标 App 的权限。
- 私钥仅保存在本机 `data/app-store-connect.json`（0600 权限），不返回浏览器，不加入工作区导出，也不发送给 AI。此文件为本机明文凭据，请妥善保管。
- 使用 `ASC_CONFIG_PATH` 可指定凭据文件；设置 `DB_PATH` 时默认与数据库同目录，便于隔离测试。
- 服务端按 Apple 官方协议生成 ES256 JWT，有效期两分钟，通过固定 Apple HTTPS 地址读取全部分页。认证失败、权限不足、限流与网络失败有独立提示。
- 「重新读取 App」更新列表；「移除连接」删除本机凭据，不撤销 Apple 后台的 API Key。服务重启后需要重新验证连接。
- 连接成功后按 Apple App ID 导入产品，并同步 ASO 文案及可用趋势报告。商店资料写入与审核提交位于版本详情的「发布到 App Store」。趋势报告见下文；暂未实现二进制构建上传。

验证：`npm test` 覆盖签名验证、凭据脱敏与文件权限、分页及错误处理；`node tests/app-store-connect-browser.mjs` 使用隔离数据库，验证 HTTP 接口与浏览器操作（Apple 响应使用模拟数据）。真实 Apple 账号权限和网络连接需配置有效凭据后验证。

认证参考：[Apple Generating Tokens for API Requests](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests)。

## 产品关联与商店版本同步

进入「产品 → 具体产品 → App Store」，读取可关联 App 并选择。点击「预览所选 App」读取各平台全部商店版本及每个版本的多语言更新说明；确认保存后，关联和商店快照随工作区持久化与导出。关联单独保存 App Store ID、名称与 Bundle ID；可选择采用商店名称或 App Store ID，不自动覆盖产品介绍、价格等资料。

- 「刷新并预览差异」展示版本、审核状态、语言说明变化和远端不再返回的版本；确认后更新快照，取消则不保存。失败保留上次成功的数据与同步时间。
- 同步时间表示最近成功读取并被采用的快照时间。页面按平台区分版本，Apple 状态独立于本机版本准备状态。
- 已保存的商店版本可「创建本机准备记录」：复制版本号与各语言说明，使用 Apple 原始语言代码，状态为准备中，说明未审核，更新内容留待补充。同一产品、Apple App 和商店版本 ID 只创建一条记录；同号不同平台可分别创建。
- 准备记录显示来源平台和最新已保存的商店状态。后续同步不覆盖准备记录；解除或更换关联也不删除本机记录。
- 更换关联沿用预览后确认流程；解除关联只清除该产品的关联和快照，不清除账号凭据。
- 使用工作区 revision 防止旧窗口覆盖资料；采用预览前再次核对关联和快照。产品页同步仅执行读取；商店写入在版本详情单独预览和确认。

新增验证：`node tests/store-sync-browser.mjs`（隔离工作区和模拟 Apple 响应）覆盖关联、预览、刷新持久化、平台区分、创建防重复、同步不覆盖草稿、失败保留快照、解除关联及 1440/390/320px 布局。`npm test` 增加版本语言分页及快照保存校验。

## 版本发布到 App Store Connect

进入「版本发布 → 具体版本 → 发布到 App Store」，先在产品详情关联 Apple App。API Key 需要目标操作的 Apple 角色权限；读取权限不代表具备发布权限。

1. 确认所需语言的更新说明已审核，并核对 Apple 语言代码。中文默认建议 `zh-Hans`，英文建议 `en-US`，可以修改；不同说明不能映射到同一语言。
2. 选择平台，点击「读取商店状态与构建」。仅展示对应 App、版本号、平台且已处理完成、未过期的构建。二进制仍通过 Xcode 或 Transporter 上传。
3. 选择构建，点击「预览商店资料写入」，核对原文与新文、版本号、平台，确认后创建或复用商店版本、设为手动发布、写入更新说明并绑定所选构建。暂不选择构建也可先写入说明。成功后本机记录绑定商店来源平台。
4. 商店说明与已审核草稿一致、构建可用后，预览并确认提交审核，使用 Apple 的 `reviewSubmissions` 和 `reviewSubmissionItems` 接口。截图、隐私、年龄分级、审核联系人及出口合规等仍在 Apple 后台管理，Apple 拒绝时显示具体原因。
5. 审核通过且进入「等待开发者发布」后，预览并确认正式上架。此请求无法撤销。请求被接受不代表立即可下载；刷新状态确认已上架后才自动标记本机已发布。

预览不写入 Apple，五分钟内有效，确认令牌只能使用一次。本机说明、产品关联或商店内容变化后需要重新预览。服务端复核说明审核、语言映射、构建归属及审核批次，不一并提交含其他项目的批次。同一 App 平台的操作串行执行；相同商店状态下已成功接受的审核或上架请求会阻止重复提交。

Apple 操作无法跨接口原子回滚：部分成功后失败会显示失败步骤，重新读取和预览后复用已创建版本、语言和审核批次继续。网络中断时先核对远端状态。最近操作记录保存在 SQLite 独立的 `publication_events` 表，不包含私钥或说明正文，不纳入工作区 JSON 备份。现有 MCP 工具仍只管理本机记录，不执行商店发布。

验证：`npm test` 覆盖发布请求结构、复核、并发限制及恢复；`node tests/publication-browser.mjs` 使用真实 SQLite 和发布服务逻辑、模拟 Apple 响应，覆盖浏览器完整流程及窄屏布局。真实账号只读验证了版本、构建、审核批次及项目列表，未实际创建版本、提交审核或上架。

协议参考：[创建商店版本](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appstoreversions)、[审核批次](https://developer.apple.com/documentation/appstoreconnectapi/review-submissions)、[手动上架](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appstoreversionreleaserequests)。

## ASO 商店优化

入口：产品 → 选择产品 → **ASO 优化**。先在 App Store 页签关联 Apple App，并在工作区设置中配置团队 API Key。

1. 读取商店版本与 App 信息，明确选择版本、App 信息状态和语言代码（例如 `zh-Hans`、`en-US`）。该语言须已在 Apple 后台配置。
2. 读取名称、副标题、关键词、描述和推广文本。点击 AI 分析生成优化稿，或直接手工编辑。AI 使用商店原文、产品资料与已确认文档，不包含真实搜索量、排名或竞品指标。
3. 对照原文检查优化稿。名称/副标题最多 30 字符、关键词 100、描述 4000、推广文本 170；Apple 仍会执行最终校验。草稿自动保存在当前浏览器，重新读取后可点击“恢复本机草稿”。
4. 预览差异，再明确确认回写。服务端会重新读取状态与原文，拒绝陈旧覆盖；确认预览有效期 30 分钟，仅能执行一次。名称及副标题写入 App 信息，其他字段写入版本本地化资源。已上架版本仅开放推广文本回写。
5. 回写后回读验证，并将成功或未确认结果保存在 SQLite 的 `aso_events` 中，页面展示最近 20 条记录。Apple 不支持跨资源事务；部分成功或网络中断时，重新读取 Apple 文案后再决定下一步。

ASO 回写不会提交审核或发布版本。App 信息的名称和副标题可能跨平台共享。浏览器草稿及独立的 ASO 回写记录不包含在工作区 JSON 导出中；完整备份需保存 SQLite 数据库。服务重启会使读取/预览凭证失效，已保存的浏览器草稿仍可恢复。

API 使用 Apple 官方的 [App Info Localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-info-localizations) 和 [App Store Version Localizations](https://developer.apple.com/documentation/appstoreconnectapi/app-store-version-localizations)。

ASO 专项浏览器检查（模拟 Apple 和 AI，不写真实账号）：

```sh
npm run build
node tests/aso-browser.mjs
```


## 新版产品工作流整合（2026-11-05）

完整目标方案与实施边界见 [产品与功能整合方案](docs/product-plan.md)。主导航新增初始化、产品知识库、ASO 优化和数据分析，内容库更名为营销与推广；产品详情仍可访问原有功能。

初始化页提供 MCP、Apple 连接与每个产品的准备清单。独立 ASO 和数据分析入口提供同步的商店文案与 Analytics 趋势报告，并遵循全局产品范围。素材管理、热词服务、社交平台连接及推广归因仍待实现，具体设计见方案文档。

已连接 Apple 账号的只读验证可运行 `node scripts/verify-apple-readonly.mjs`。脚本在请求层拒绝所有非 GET 的 Apple 请求，读取账号可见 App、版本说明与 App 信息本地化，将不含凭据的结果保存到 `docs/apple-readonly-result.json`。不调用商店写入、审核或上架接口。

### 产品从商店导入（2026-11-05）

新工作区为空，不再预置产品。连接 Apple 后自动读取全部可访问 App、版本和商店介绍，按 App ID 建立产品与待确认知识文档。已有连接点击“读取并同步产品”即可执行。用户随后完善资料；再次同步只刷新商店快照，保留用户补充内容。手动创建产品入口已移除；App Store ID 由导入确定。读取失败不保存半成品，工作区被并发编辑时要求重新同步。

## ASO 与产品趋势同步

连接并导入产品或点击“读取并同步产品”，会同时读取当前公开/可编辑版本的多语言 ASO 文案和 Apple Analytics 每日报告。ASO 保存名称、副标题、关键词、描述、推广文本与对应平台/版本/语言；ASO 页面自动展示已同步文案，编辑与回写前仍重新核对原文。

数据分析使用 Apple Analytics 报告，无需 Vendor Number。收入通过 App Store Purchases Standard 读取，分别展示 USD 销售额和预计开发者所得，计入退款调整。手动和后台同步均会读取购买报告，报告缺失留空，金额用于运营观察。提供 7/30/90 天曝光事件、产品页浏览、首次下载、重新下载曲线与明细，可按来源和地区筛选，完整期间才比较前期。图标曝光事件不包含页面浏览，不能与后台去重曝光混用；缺失数据不补零。

趋势读取链路为 Analytics Report Requests → Reports → Daily Instances → Segments → gzip TSV，校验下载大小和 MD5，较新的 processingDate 按事件日期替换旧分区，避免修订报告重复统计。最近 180 天按产品缓存到 SQLite 的 product_insights 表，重启保留；此表不包含在工作区 JSON 导出中。

本轮只读取既有报告请求，不创建报告请求。权限不足、未启用报告、等待生成、同步失败分别显示；失败保留上次成功数据，产品与 ASO 可以独立成功。Apple 报告首次生成通常需要 1–2 天，最新几日可能补齐。参考：https://developer.apple.com/documentation/AppStoreConnectAPI/downloading-analytics-reports 。

## ASO 现状与优化

ASO 只保留“现状与优化”，展示商店多语言文案、检查缺失与重复，并支持编辑、提交和回读验证。关键词分析、竞品分析、优化方案与复盘已删除，不再展示报告或分析提示词；服务启动时清理旧研究数据，保留文案草稿和执行记录。

所有 ASO MCP 均服务于此模块：`get_aso_context` 读取产品事实、商店文案、趋势与草稿 revision；`save_aso_draft` 保存待确认文案草稿。`save_aso_analysis` 已移除，请重新连接或刷新 MCP 工具列表。MCP 不执行 Apple 写入，用户在页面核对后提交。

### 启用 Analytics 报告

管理员明确授权后，可运行 `node scripts/enable-analytics-reports.mjs --enable`，为工作区已关联产品补齐 ONGOING 和 ONE_TIME_SNAPSHOT 请求。脚本先读取现有请求，复用已有有效请求；写入范围仅限这两类 Analytics 请求。写入结果不明确时先回读，不直接重试 POST。操作记录保存在 `docs/analytics-report-activation.json`。

2026-11-05 已为当前 7 款产品启用两类请求并回读确认，共 14 个。等待 Apple 生成后，在数据分析中同步。趋势读取同时合并持续报告与历史快照，按事件日期选择较新处理批次，不重复累计重叠数据。页面的日常同步继续只读。

### ASO MCP 文案回填与页面确认

外部 AI 可先调用 `get_aso_context` 获取最新 `workspace.revision` 和商店原文，再用 `save_aso_draft` 保存一个版本、语言的待确认文案。参数为 `productId`、`expectedRevision`、`title`、`objective`、两位大写 `market`、`analysis`、`target`（`versionId` / `infoId` / `locale`）、`before` 和 `fields`。后两者均为完整的 `name` / `subtitle` / `keywords` / `description` / `promotionalText` 文案对象。`before` 必须保留实际读取的原文；`fields` 是满足字符限制的修改稿。每种语言单独保存，下一次写入使用最新 revision。

MCP 只保存本地草稿，不执行 Apple 写入。用户在“现状与优化”读取目标版本后点击“编辑”，页面即时读取已保存的 MCP 草稿，自动填入对应语言输入框；同一目标语言有多份待确认草稿时采用最新一份。各输入框上方常显商店原文、框内填入回填文案；页面重新读取 Apple，原文已变化或修改字段不允许编辑时阻止载入；高亮差异，只有点击“提交至商店”才执行回写与回读验证。取消保留本地回填草稿，供后续核对。原样提交的草稿会关联应用记录；在页面另行改写的内容按普通表格编辑提交，原草稿仍保留待确认。

`get_aso_context` 现在默认实时读取 Apple 全部版本的本地化文案，返回 `freshness: live`，并在 `insights.aso.appInfoLocalizations` 列出 App 信息已配置的语言。App 信息存在但版本尚无文案的语言只列入该清单，不伪造完整文案。传 `refresh: false` 可显式读取本地快照，返回 `freshness: cached`；实时读取成功会持久保存 ASO 缓存；Apple 连接失败时返回同 App 最近成功缓存，并标记 `freshness: cached`、`cachedAt` 和 `refreshError`，无有效缓存则报错。页面按版本读取时只替换该版本缓存，保留其他版本与趋势，各语言附带实际读取时间 `syncedAt`。趋势仍取最近同步结果，不触发额外趋势报告请求。

## 运营工作台

运营数据通过平台导出文件更新。小红书支持创作中心 Excel，Reddit 支持原始数据导出 ZIP。在「导入数据」窗口选择或拖入文件，确认账号后上传。关联规则及操作详见[运营数据导入](docs/social-analytics.md)。

## App 数据分析重构（2026-11-07）

全面重构了「App 数据分析」模块设计与功能，采用现代化多维分栏架构：

- **分栏多维视图**：支持「综合趋势」「渠道来源」「地区分布」「转化漏斗」「每日明细」五大独立 Tab 切换。
- **交互式趋势大图**：
  - 本期渐变面积曲线 + 前期等长周期虚线对比；
  - 动态十字线 Hover Tooltip，精确查看各日指标、同环比变化与当日事件快照；
  - 自动标注本地「版本发布节点 (🚀)」与「ASO 文案更新 (🏷️)」里程碑。
- **获客渠道构成**：呈现首次下载彩色堆叠比例条、各渠道（搜索/浏览/App引荐/网页引荐/其他）表现表与一键过滤。
- **全球地区分布**：TOP 5 核心市场卡片与国旗标识、各地区下载份额与展现转化率，支持按地区名称与代码搜索。
- **获客转化漏斗**：曝光 ➔ 商详 ➔ 首次下载三阶段漏斗、CTR 与安装转化率及前期对比，提供诊断优化建议。
- **每日明细与导出**：全字段正反向排序、按日期快速搜索、一键导出 UTF-8 BOM CSV 文件（兼容各类表格软件不乱码）及一键复制表格。
- **全局产品总览**：未选择特定产品时，呈现全产品组合总首次下载、总曝光、总商详浏览、转化率看板与 14 天 Sparkline 微图。

