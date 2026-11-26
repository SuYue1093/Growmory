# Growmory App 数据分析模块重构实施记录

日期：2026-11-07。本次重构聚焦于 **「App 数据分析」**（原产品趋势分析）的信息架构、可视化交互与深度分析功能，提升独立开发者对 App Store 流量结构与获客转化的洞察能力。

---

## 1. 重构背景与设计目标

原有数据分析页面结构较为单一，存在以下痛点：
1. **单一维度折线图**：仅展示所选单个指标的单条折线，缺乏前期等长周期对比曲线，无法直观对比增长或下滑趋势；缺乏交互式悬浮浮层（Tooltip）。
2. **缺乏事件与里程碑关联**：开发者难以将下载量的异常峰值或下滑与「版本发布 (Releases)」或「ASO 文案更新 (ASO Events)」等业务动作建立因果关联。
3. **缺少获客结构与渠道细分**：Apple Analytics 原生提供 5 种来源渠道（搜索、浏览、App 引荐、网页引荐、其他）和数十个国家/地区数据，原版仅支持单选下拉过滤，无法展示全局渠道占比构成或主力国家排名。
4. **缺少转化漏斗**：缺乏从「图标曝光」到「产品页浏览」再到「首次下载」的完整链路转化率与诊断分析。
5. **表格与导出能力薄弱**：每日明细表缺乏排序、检索及一键导出 CSV / 复制表格能力。

---

## 2. 信息架构与分栏视图设计

重构后的模块采用 **「多维分栏视图 (Tabbed Architecture)」**，兼顾高信息密度与清晰的视觉层级：

```
App 数据分析
├── 全局产品总览 (当未选定单个 App 时)
│   ├── 组合总首次下载 / 组合总曝光 / 组合总商详浏览 / 整体安装转化率
│   ├── 各产品近 14 天趋势微图 (Sparkline) 与占比条
│   └── 报告健康度与同步状态徽章
│
└── 单产品深度分析 (选定单个 App 时)
    ├── 核心指标卡 (4 项)：图标曝光、商详浏览、首次下载、重新下载 (含前期环比、日均)
    ├── 时间与筛选栏：7 / 14 / 30 / 90 / 180 天预设 + 截止日期 + 渠道/地区快速过滤
    └── 五大分析分栏 (Tabs)：
        ├── 1. 综合趋势 (Overview & Chart)
        │   ├── 交互式 SVG 趋势图 (本期高亮曲线 + 前期虚线对比 + 面积渐变)
        │   ├── 悬浮浮层 (动态十字线、当日各指标快照、同环比变化、事件标注)
        │   ├── 里程碑标注 (🚀 版本发布节点、🏷️ ASO 文案更新标记)
        │   └── 核心洞察摘要栏 (最高单日、主力渠道、主要市场、全链路安装率)
        │
        ├── 2. 渠道来源 (Traffic Sources)
        │   ├── 首次下载渠道占比彩色堆叠进度条与图例
        │   ├── 渠道表现矩阵 (App Store 搜索、浏览、App 引荐、网页引荐、其他)
        │   └── 一键「仅看此渠道」过滤分析
        │
        ├── 3. 地区分布 (Territories & Markets)
        │   ├── 全球 TOP 5 核心市场卡片与国旗标识
        │   ├── 国家/地区份额进度条与展现转化率
        │   └── 支持搜索国家名称或 ISO 地区代码过滤
        │
        ├── 4. 转化漏斗 (Acquisition Funnel)
        │   ├── 三阶段获客漏斗：图标曝光 ➔ 产品页浏览 ➔ 首次下载
        │   ├── 展现点击率 (CTR) 与商详下载转化率及前期对比
        │   └── 转化效率诊断与优化建议 (针对 CTR 与下载率的行动指南)
        │
        └── 5. 每日明细 (Daily Records & Export)
            ├── 支持按日期搜索、全列正反向排序 (曝光/浏览/下载/转化率)
            ├── 一键导出 UTF-8 BOM CSV (兼容 Excel/Numbers/Sheets 无乱码)
            └── 一键复制表格至剪贴板
```

---

## 3. 指标口径与计算规则

| 指标 | 英文/Apple 来源 | 计算口径与说明 |
| :--- | :--- | :--- |
| **图标曝光事件** | Impressions (`Discovery and Engagement`) | 用户在搜索结果、推荐或榜单看到图标的次数（不含商详页面浏览） |
| **产品页浏览** | Page Views (`Product Page`) | 用户点击进入并访问 App Store 详情页的有效浏览次数 |
| **首次下载** | First-time Downloads (`App Store Downloads`) | Apple ID 首次获取该应用（新增用户口径，不含更新或恢复） |
| **重新下载** | Redownloads (`App Store Downloads`) | 曾下载过的 Apple ID 再次下载（老用户召回口径） |
| **展现点击率 (CTR)** | Page Views / Impressions | 反映图标、主标题与副标题对用户点击进入商详页的吸引力 |
| **商详下载转化率** | First Downloads / Page Views | 反映详情页截图、文案介绍与评价对实际安装转化的推动力 |
| **全链路安装率** | First Downloads / Impressions | 整体端到端流量转化效率 |

> [!NOTE]
> 以上转化率基于 Apple Analytics 每日标准报告中的事件发生总数（Counts）汇总计算。因 Apple 对分组去重人数有严格的隐私门槛且去重人数不可简单叠加，事件口径转化率反映整体趋势转化效率。

---

## 4. 核心代码模块结构

- `src/trends/types.ts`：数据模型、指标枚举、分栏 Tab、里程碑与渠道/地区汇总类型定义。
- `src/trends/constants.ts`：国家/地区字典与国旗映射、来源渠道说明与色盘、日期偏移工具函数。
- `src/trends/chart.tsx`：响应式交互 SVG 趋势图组件，支持双曲线对比、动态 Crosshair 悬浮浮层与里程碑 Pin 标注。
- `src/trends/funnel.tsx`：三阶段转化漏斗组件与诊断建议卡片。
- `src/trends/sources-view.tsx`：获客渠道构成与堆叠比例条、各渠道转化表。
- `src/trends/territories-view.tsx`：全球核心市场 TOP 榜单、地区搜索与份额表。
- `src/trends/daily-view.tsx`：每日数据明细表，支持列排序、分页展开、UTF-8 BOM CSV 导出与剪贴板复制。
- `src/trends/overview.tsx`：全局产品数据总览，提供跨 App 组合 KPI 与 14 天 Sparkline 微图。
- `src/trends.tsx`：统一对外主入口，向后完全兼容现有签名与选择器。
- `src/style.css`：完善的 Apple 现代设计系统样式与移动端响应式支持。

---

## 5. App Store Connect API 数据读取排查与修复

### 5.1 根因分析
在排查真实 Apple App Store Connect API 时发现，虽然 API 能够正常请求并返回 200，但前端始终显示「部分报告尚不可用：App Store Downloads」，首次下载和重新下载数均为 `--`（`null`）。
经抓包和对 Apple 原生报表响应进行深度诊断：
- Apple 官方在 Analytics 报表中对下载报告返回的实际名称为 **`"App Downloads Standard"`**（部分环境为 `"App Downloads"`）；
- 但服务端 `server/product-insights.mjs` 中的报表类型匹配字典原写为：
  ```javascript
  downloads: ['App Store Downloads Standard', 'App Store Downloads']
  ```
- 由于缺少 `"App Downloads Standard"` 匹配项，Apple 返回的下载报表从未被归类至 `downloads`，导致 `coverage.downloads` 始终为空数组，前端无法解析出任何下载记录。

### 5.2 修复与真实数据同步验证
在 `server/product-insights.mjs` 中更新匹配规则：
```javascript
downloads: ['App Downloads Standard', 'App Store Downloads Standard', 'App Downloads', 'App Store Downloads']
```
随后调用 App Store Connect 凭据对工作区内全部测试产品进行全量同步，各产品状态均正常变更为 `ready` 并成功解析多日下载与互动报表数据。

---

## 6. 页面精简与冗余信息层级移除

针对重构前上方层级过多、干扰首屏阅读的问题，进行了针对性的结构精简：
1. **精简合并顶栏**：将返回按钮、当前产品名称、平台徽章、数据同步时间、时间周期快捷切换（7/14/30/90/180天）、截止日期和「同步 ASO 与趋势」操作合并至单行 `.trends-unified-topbar`，消除垂直堆叠。
2. **移除冗余信息层**：
   - 移除了外部重复的产品上下文卡片；
   - 移除了无实质功能的静态说明段落与庞大的 4 列过滤占位栅格；
   - 移除了页面中央突兀的同步元信息横条（`.trends-sync-meta`）；
   - 移除了图表下方重复嵌套的 `<details><summary>每日数据明细</summary>` 折叠表（已有专属的「每日明细」分栏）；
   - 移除了图表下方的冗余洞察横条（`.trend-insights-bar`），还图表以极致纯净的可视化空间。
3. **筛选内联至 Tab 栏**：将「来源渠道」和「国家/地区」二级筛选器直接内嵌到 Tab 分栏导航右侧（`.trend-toolbar-row`），垂直高度节省超过 350px，核心指标卡与图表直达首屏。

---

## 7. 测试与端到端验收结果

1. **构建检查**：
   - `npm run build`：TypeScript 类型检查与 Vite 生产打包通过（耗时 1.57s）。
2. **单元与集成测试**：
   - `npm test`：全部 **118 项** 自动化测试通过（含新增的 `tests/analytics-refactored.test.mjs`），无任何失败或警告。
3. **浏览器真实 E2E 验收** (`tests/analytics-browser.mjs`)：
   - 单产品趋势卡片与 4 大指标切换正常；
   - 五大分栏（综合趋势、渠道来源、地区分布、转化漏斗、每日明细）点击切换与渲染全部通过；
   - 渠道构成表与一键过滤功能正常；
   - 地区分布 TOP 榜与搜索过滤正常；
   - 转化漏斗诊断建议展示正常；
   - 每日明细 CSV 导出与剪贴板复制正常；
   - 全局产品总览与组合 KPI 正确展示；
   - 1440px（桌面端）、768px（平板端）、390px（移动端）多尺寸无任何横向溢出。
4. **界面截图**（已存至 `.screenshots/analytics/`）：
   - `01-portfolio-overview.png`：全局产品数据总览
   - `02-trends-overview-chart.png`：单产品趋势大图与里程碑
   - `03-sources-breakdown.png`：渠道来源细分
   - `04-territories-ranking.png`：地区分布排行
   - `05-conversion-funnel.png`：转化漏斗与诊断
   - `06-daily-records.png`：每日明细与导出
   - `07-mobile-trends.png`：移动端响应式视图

---

## 8. 数据汇总与界面二次优化（2026-11-07 迭代）

1. **移除右上角产品筛选**：在 `src/main.tsx` 中将 `analytics` 加入排除列表，避免在数据分析页面右上角出现冗余的产品范围下拉菜单，彻底消除多头筛选混淆。
2. **移除「产品表现总览」与「报告可用数据一行」**：移除了 `analytics-workspace` 顶部多余的 `.analytics-context` 与 `.analytics-health` 模块，首屏直接聚焦产品数据总览看板。
3. **「管理数据连接」按钮平移**：将「管理数据连接」入口移至总览顶部的截止日期输入框右侧（`.overview-controls-bar`），布局紧凑且符合操作流。
4. **修复详情页与列表页数据为 `-` 和 `0` 的根本原因**：
   - 根因：Apple Analytics 官方报告存在 24-72 小时的出报延时（如今日为 11-07，Apple 最新报表为 11-05），此前代码采用严格的 `ds.every(d => cov.includes(d))`，因昨天的日期尚未生成报表，导致求和逻辑直接全量返回 `null`。
   - 修复：升级 `sum` 与 `getSum` 为覆盖日期容错求和算法，过滤并累加所选周期内已被报表覆盖的有效日期；同时在前端自动将默认截止日期初始化为已同步产品的实际最新报表日期。
   - 效果：列表页组合总下载、曝光、商详浏览与各产品下载数全部正常渲染出真实数千条数据，详情页四大指标卡告别破折号，完整展示数值、日均与环比变动。
5. **列表行全局可点击**：产品列表的每一行 `<tr>` 添加了 `.clickable-product-row` 样式与点击、键盘回车事件，用户点击任意单元格即可平滑进入该 App 的趋势详情分析。

