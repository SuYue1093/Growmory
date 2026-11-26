export const briefingAgentGuide = {
  zh: `独立开发者早上打开 Growmory，看和自己产品及独立开发出海有关、今天真正值得看的外部变化：平台政策规则、竞品动作、用户真实反馈、行业与AI工具新动向、Product Hunt 等爆款打法与可跟进选题。每条都要带原始链接并真实核实。

【核心驱动：检索配置 (searchConfigs) 与历史精选 (savedItems)】
工作区已维护个性化的「检索配置」（searchConfigs），包含主题、关联产品（或无/通用）、权重（1~5 星）、目标平台、关键词与关注点。
1. Agent 必须读取 get_briefing_context 返回的 searchConfigs，优先保障高权重项（5 星极高、4 星高）充分深挖，兼顾常规项广度补充。
2. 深度学习用户精选留下条目（savedItems）：
   - 不仅要看「为什么留下」（savedReason），更要深挖「留下了什么具体内容」（包含完整标题 title、深度摘要 summary 与价值关联 relevance）。
   - 分析用户认可的信息颗粒度、论证深度、竞品切入角度与关注话题类型，主动顺着用户认可的价值维度发掘相似一手高价值情报。
3. 关联产品项回填对应产品 ID；关联为「无」（通用生态）回填 'general'。
4. 资讯分为六类：
   - platform_change (平台与政策)：审核、字数/外链规则、商店与支付政策变动。
   - competitor_move (竞品动态)：上新、定价变动、用户差评焦点。
   - user_voice (用户原话)：目标用户正在公开询问的痛点、原帖讨论。
   - followup_lead (可跟进线索)：可直接转化为营销选题或开发待办的材料。
   - industry_trend (行业与AI动态)：新 AI 工具/模型、开发工具链或技术栈突破。
   - growth_inspiration (出海与增长灵感)：Product Hunt/X/Reddit 上的热门产品出海增长玩法。

【检索平台范围】
必须覆盖多渠道公开网页，包括但不限于：
- X (Twitter)：科技公告、独立开发者（Indie Hackers）动态、产品发布与复盘。
- Reddit：r/SideProject、r/SaaS、r/webdev、r/IndieBiz、品类垂直板块。
- Product Hunt：每日 Top 榜单、同类热门产品打法、Maker 讨论。
- App Store / Google Play：公开商店竞品版本、评分结构、相似应用。
- Hacker News、V2EX、即刻、小红书、头条等公开社区。

【运行原则与步骤】
1. 外部独立检索与核实：所有公开检索由 Agent 联网完成，严禁编造链接与数据。打不开时记录限制，能读原文则标记为 full。
2. 调度与任务：遵循「有则更新、无则新建」原则维护名为「Growmory 每日资讯」的定时任务（时区 Asia/Shanghai，建议 08:30 运行，预算 15 分钟）。
3. 步骤：
   - 调用 get_briefing_context 读取 searchConfigs、产品事实、14天历史与已忽略链接。
   - 依据 searchConfigs 进行多平台联网检索，遇到登录墙/验证码记录限制并换平台。
   - 调用 save_briefing 回填。按规范化 URL 去重，14天内已忽略链接绝不送回，按质量精选收录，绝不设 8 条等固定上限（建议收录 10~25 条高质量资讯）。无合格条目状态填 empty。`,
  en: `Every morning, indie makers open Growmory to check noteworthy external changes related to their products and the broader indie dev ecosystem: platform policies, competitor moves, direct user quotes, AI & tool trends, Product Hunt launches, and actionable marketing leads.

[Core Driver: Search Configurations (searchConfigs)]
The workspace maintains structured searchConfigs with topic name, target product (or none/general), weight (1-5 stars), platforms, keywords, and focus points.
1. The agent reads searchConfigs from get_briefing_context, prioritizing high-weight items (5 stars highest, 4 stars high).
2. Product-specific items set productId accordingly; general ecosystem items set productId to 'general'.
3. Six Categories: platform_change, competitor_move, user_voice, followup_lead, industry_trend, growth_inspiration.

[Retrieval Platforms]
Broaden coverage across public web channels:
- X (Twitter): Tech announcements, indie hacker discussions, launches.
- Reddit: r/SideProject, r/SaaS, r/webdev, niche subreddits.
- Product Hunt: Daily top products, category competitors, launch playbooks.
- App Store / Google Play: Versions, ratings, similar apps.
- Hacker News, V2EX, Xiaohongshu, etc.

[Execution Steps]
1. Read Context: Call get_briefing_context to get searchConfigs, facts, 14-day history, and expectedRevision.
2. Execute Retrieval: Follow searchConfigs across public channels; verify by reading full pages (full); record restrictions when blocked.
3. Save Briefing: Call save_briefing with expectedRevision. Deduplicate URLs, preserve user decisions, and exclude 14-day dismissed links. Curate high-quality items without a rigid 8-item cap (recommend 10-25 items).`,
};

export function getBriefingHandoverPrompt(options?: {
  timezone?: string;
  budget?: string;
}): string {
  const tz = options?.timezone || "Asia/Shanghai";
  const budget = options?.budget || "15 分钟";

  return `请连接 Growmory 的 MCP 工具，为工作区执行每日资讯检索与简报回填任务。

【核心任务】
获取今天与工作区产品以及独立开发出海生态紧密相关、真正值得看的外部变化与一手动态（包括平台政策规则、竞品动向、用户痛点原话、AI 工具与开发技术突破、Product Hunt 热门打法与营销选题），完成深度核查并回填简报。

【核心驱动：严格依据检索配置 (searchConfigs) 执行】
工作区已维护结构化的「检索配置」（searchConfigs），你必须严格围绕已启用的配置项展开全网检索：
1. 权重机制（Weight 1~5 星）：
   - 权重 5（极高）、权重 4（高）：用户的最核心关切，必须分配主要搜索预算与深度阅读，确保充分挖掘、优先回填。
   - 权重 3~1：作为行业泛向与背景信息补充。
2. 配置要素：
   - 严格依据各项的「关注点 (focusQuestions)」、「核心关键词 (keywords)」和「目标平台 (platforms)」进行定向检索。
   - 关联产品：若某项关联了具体产品，回填条目的 productId 填写该产品 ID；若关联为「无」（通用生态），回填条目的 productId 填写 'general'。

【必查信息源（广泛覆盖，严禁单一渠道）】
必须深入覆盖多渠道公开网页，严禁编造虚假链接、时间或互动数据：
- X (Twitter)：技术公告、独立开发者 (Indie Hackers) 实战复盘、新产品发布与讨论
- Reddit：r/SideProject、r/SaaS、r/webdev、r/IndieBiz 及垂直品类社区
- Product Hunt：今日 Top 榜单、同类热门产品打法、Maker 讨论与反馈
- 移动应用商店：App Store / Google Play 公开版本变化、差评焦点与同类推荐
- 行业公开网络：官方更新日志与博客、Hacker News、V2EX、即刻、小红书等

【收录标准与质量要求】
1. 【数量要求】：绝不要人为限制在 8 条以内！在确保每条都真实核验的前提下，请充分覆盖全部产品专项以及独立开发出海生态（建议收录 10~25 条高质量一手资讯，充分展现各平台、各分类与各产品的最新动态）。
2. 【真实核验】：所有检索由你联网完成，绝不编造虚假内容。能打开原文务必阅读全文，核查程度标记为 full（已读原文）；若遇登录墙/验证码记录限制并标为 snippet。
3. 【历史继承与去重】：
   - 严格排除 get_briefing_context 返回的 dismissedUrls（14 天内被用户忽略的链接绝不要重新推回）。
   - 【核心：不仅关注留下的原因，更要深挖留下的内容】：
     在 get_briefing_context 返回的 savedItems 中，系统为你提供了用户精选留下的完整条目（含标题 title、深度摘要 summary、关联阐述 relevance 以及留下原因 savedReason）。
     你必须深度分析这些已留下条目的「具体内容」与「留下原因」：仔细比对用户究竟对什么样的竞品情报、技术突破、数据复盘、用户原话情有独钟，理解用户的审美偏好与信息深度要求，在全网检索时主动沿着这些已被用户验证的高价值脉络发掘同等含金量的一手资讯。
4. 【内容六大类别】：
   - platform_change (平台与政策)
   - competitor_move (竞品动态)
   - user_voice (用户原话)
   - followup_lead (可跟进线索)
   - industry_trend (行业与AI动态)
   - growth_inspiration (出海与增长灵感)

【MCP 执行四步法】
第一步：读取上下文与检索配置
- 调用「get_briefing_context」（时区：${tz}），读取全部产品已确认事实、用户定制的 searchConfigs（含权重 1~5）、14天历史处置（留下的原因与已忽略链接）及 expectedRevision。

第二步：按 searchConfigs 执行多平台检索与深度核验
- 优先深挖权重 5 与 4 的项，结合关注点与关键词，在目标平台检索并阅读原文。单次预算：${budget}。
- 分平台记录执行情况（platformSummaries：平台名称、检索 query、打开条数、访问限制说明）。

第三步：整理检索框架
- 将本次依据的 searchConfigs 整理为 frameworks 结构（写入简报头部供用户查阅）。

第四步：回填简报
- 调用「save_briefing」，传入 expectedRevision、frameworks、platformSummaries、status（"completed" 或 "empty"）及 items 条目列表。
- 回填成功后，简要汇报：本次关注点、收录条目数及覆盖平台。`;
}

export function getBriefingResearchPrompt(options?: {
  timezone?: string;
  budget?: string;
}): string {
  const tz = options?.timezone || "Asia/Shanghai";
  const budget = options?.budget || "15 分钟";

  return `请连接 Growmory 的 MCP 工具，立即为工作区重新执行一次今日资讯检索并更新当天简报（再次搜索）。

【再次搜索的目标与原则】
用户希望立即刷新今天值得看的外部变化（可能刚刚调整了检索配置的权重/关键词/关注点、更新了产品事实，或需要捕捉 X、Reddit、Product Hunt 等平台的最新增量线索）。

1. 幂等更新，严格保留用户已有处置：
   - 传入今天日期调用 save_briefing，系统将覆盖更新当天的简报内容。
   - Growmory 会按规范化 URL 自动去重，并严格保留用户此前已标记的「留下（含原因）」、「忽略」和「已读原文」状态，绝不冲掉用户已做的任何决定。
2. 紧跟最新调整的检索配置 (searchConfigs)：
   - 用户刚才可能调整了某些检索项的星级权重（如将某个痛点升为 5 星极高）、修改了关注问题或补充了关键词。
   - 调用 get_briefing_context 获取最新的 searchConfigs，重点对高权重项（尤其是权重 5、4）做深入的二次穿透检索，寻找前次未发现的新动态与深层线索。
3. 严格排除与偏好吸收（内容 + 原因双重对齐）：
   - 严格排除 get_briefing_context 返回的 dismissedUrls（14天内已忽略链接绝不重复推回）。
   - 深度学习 get_briefing_context 返回的 savedItems：比对用户留下的具体内容（标题、详细摘要 summary、关联阐述 relevance）以及留下原因 savedReason，针对性挖掘更深度的同类线索。
4. 广泛多渠道公开检索与数量要求：
   - 深入检索 X (Twitter)、Reddit、Product Hunt、App Store 等公开平台，能打开原文务必阅读原文（full）。
   - 【数量要求】：绝不要限制在 8 条以内！请充分覆盖各款产品和生态（建议收录 10~25 条高质量条目），充分带回多角度一手资讯。

【执行步骤】
第一步：读取最新上下文与检索配置
- 调用 MCP 工具「get_briefing_context」（时区：${tz}），读取最新产品事实、已留下的原因偏好、最新调整的 searchConfigs（按权重 1~5 排序）、dismissedUrls 列表及当前最新 expectedRevision。

第二步：结合最新配置进行二次深入检索
- 重点针对高权重项、最新关注点与用户偏好，在 X、Reddit、Product Hunt、App Store 等平台执行二次深入检索与原文阅读。单次预算：${budget}。

第三步：回填更新今天简报
- 调用 MCP 工具「save_briefing」，传入最新的 expectedRevision、frameworks、platformSummaries、status 与 items。
- 完成后向我明确汇报：本次再次搜索发现了哪些新增动态、与前次相比有哪些增量线索。`;
}
