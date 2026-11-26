import { getCurrentLang, type Lang } from './i18n.ts';

export interface InAppEventPromptOptions {
  event?: {
    id: string;
    referenceName?: string;
    badge?: string;
    eventState?: string;
    deepLink?: string;
    purpose?: string;
    purchaseRequirement?: string;
    priority?: string;
    publishStart?: string;
    eventStart?: string;
    eventEnd?: string;
    localizations?: Array<{
      locale?: string;
      name?: string;
      shortDescription?: string;
      longDescription?: string;
    }>;
  };
  direction?: string;
}

export const inAppEventsAgentWorkflowGuide = {
  workflow: '分析产品运营节奏、版本特性与增长目标，规划 App Store 官方 App 内活动 (In-App Events)，并通过 Growmory MCP 工具自动创建、排期与配置多语言本地化文案。',
  steps: [
    '【活动定位与徽章选择】：调用 get_in_app_events_context 读取已有的活动列表与状态；根据当前版本更新亮点或运营目标（如赛季迭代、功能大改版、周末挑战、限时促销），挑选精准的 App Store Connect 官方活动徽章（CHALLENGE/挑战、COMPETITION/比赛、LIVE_EVENT/直播活动、MAJOR_UPDATE/重磅更新、NEW_SEASON/新一季、PREMIERE/首发、SPECIAL_EVENT/特别活动）。',
    '【受众目标与商业属性】：明确活动适用受众 (purpose: APPROPRIATE_FOR_ALL_USERS / ATTRACT_NEW_USERS / KEEP_ACTIVE_USERS_INFORMED / BRING_BACK_LAPSED_USERS) 与参与付费要求 (purchaseRequirement: NO_COST_ASSOCIATED / IN_APP_PURCHASE / SUBSCRIPTION)，确保与产品变现逻辑匹配。',
    '【排期时间轴规划】：合理配置活动展示与起止时间（publishStart 最多可提前14天在商店预热展示，活动持续时间 eventStart ~ eventEnd 最长支持 31 天），充分捕获 Today 标签页精选与搜索卡片流量。',
    '【深层链接 (Deep Link) 承接】：配置专属直达路由 deepLink（Universal Link 或 URL Scheme，如 growmory://events/spring-challenge），确保用户在 App Store 点击「打开」或参与通知后直达活动页，避免流失。',
    '【MCP 执行与多语言本地化】：调用 manage_in_app_event (action: "create" 或 "update") 回填活动属性；调用 action: "set_localization" 撰写符合 Apple 官方字符限制的高转化文案：活动名称 name (≤30字符，切勿重复徽章名称)、卡片简述 shortDescription (≤50字符，突出核心收益)、详情长描述 longDescription (≤120字符，清晰阐述参与规则)。',
    '【严重警告·严禁写入资料库】：App 内活动是独立的官方商业对象，绝不能调用 save_docs 将活动方案存入资料库！必须且只能通过 manage_in_app_event 直接回填入 App 内活动模块。',
  ],
};

export const inAppEventsAgentWorkflowGuideEn = {
  workflow: 'Analyze product roadmap, feature releases, and growth objectives to design App Store In-App Events, and manage creation, scheduling, and multi-language localizations via Growmory MCP.',
  steps: [
    'Event Strategy & Badge Selection: Call get_in_app_events_context to inspect existing events and schedules. Select the optimal App Store event badge (CHALLENGE, COMPETITION, LIVE_EVENT, MAJOR_UPDATE, NEW_SEASON, PREMIERE, SPECIAL_EVENT) matching your release or campaign theme.',
    'Audience & Monetization Alignment: Configure target audience (purpose: APPROPRIATE_FOR_ALL_USERS, ATTRACT_NEW_USERS, KEEP_ACTIVE_USERS_INFORMED, BRING_BACK_LAPSED_USERS) and access requirements (purchaseRequirement: NO_COST_ASSOCIATED, IN_APP_PURCHASE, SUBSCRIPTION).',
    'Scheduling & Visibility: Define publishStart (promoted up to 14 days in advance on the App Store) and event duration (eventStart to eventEnd, up to 31 days) to capture Today tab recommendations and search results.',
    'Deep Link Routing: Provide a dedicated deepLink (Universal Link or URL Scheme, e.g. growmory://events/spring-challenge) to escort users directly to the specific event interface or bonus flow upon opening.',
    'MCP Execution & Copywriting: Use manage_in_app_event (action: "create" or "update") to update event attributes, and action: "set_localization" to configure locale copy strictly adhering to Apple limits: public title name (<= 30 chars, never repeat badge name), card summary shortDescription (<= 50 chars), and detail description longDescription (<= 120 chars).',
    'CRITICAL RULE - DO NOT WRITE TO DOCS: In-App Events are distinct App Store Connect entities. NEVER call save_docs or save event drafts into knowledge base docs. You MUST use manage_in_app_event exclusively.',
  ],
};

export function buildInAppEventsAgentPrompt(
  product: {
    id: string;
    name: string;
    appStore?: { appId?: string };
  },
  lang: Lang = getCurrentLang(),
  options?: InAppEventPromptOptions
) {
  const isEn = lang === 'en';
  const event = options?.event;
  const direction = options?.direction?.trim();

  // 1. 如果指定了具体活动（详情页：完善此活动）
  if (event) {
    if (isEn) {
      return `Please refine and complete the App Store In-App Event for product "${product.name}" (productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) via Growmory MCP.

[Current Event Profile]:
- Event ID (eventId): ${event.id}
- Reference Name: ${event.referenceName || 'Untitled'}
- Current Badge: ${event.badge || 'Not set'}
- Target Purpose: ${event.purpose || 'Not set'}
- Current Schedule: ${event.eventStart || 'N/A'} ~ ${event.eventEnd || 'N/A'} (Publish preview: ${event.publishStart || 'N/A'})
- Deep Link: ${event.deepLink || 'N/A'}
- Existing Locales: ${event.localizations?.map(l => `${l.locale} ("${l.name || ''}")`).join(', ') || 'None'}
${direction ? `\n[User Specified Direction & Campaign Focus]:\n${direction}\n` : ''}
[Strict MCP Execution Guidelines]:
1. Inspect Context: Call \`get_in_app_events_context\` with productId: "${product.id}" and eventId: "${event.id}" to inspect the latest event details.
2. Update Event Attributes: Call \`manage_in_app_event\` (action: "update") with productId: "${product.id}", eventId: "${event.id}", and updated fields:
   - referenceName: internal identifier (<= 64 chars)
   - badge: CHALLENGE, COMPETITION, LIVE_EVENT, MAJOR_UPDATE, NEW_SEASON, PREMIERE, or SPECIAL_EVENT
   - purpose: APPROPRIATE_FOR_ALL_USERS, ATTRACT_NEW_USERS, KEEP_ACTIVE_USERS_INFORMED, or BRING_BACK_LAPSED_USERS
   - priority: NORMAL or HIGH
   - deepLink: app routing universal link or scheme
   - eventStart, eventEnd, publishStart (ISO 8601, duration <= 31 days, publish <= 14 days ahead)
3. Refine Localized Copy: Call \`manage_in_app_event\` (action: "set_localization") with productId: "${product.id}", eventId: "${event.id}", and locale to write high-converting copy:
   - name: Public event title (<= 30 characters, NEVER repeat badge name)
   - shortDescription: Card summary (<= 50 characters, highlighting immediate value proposition)
   - longDescription: Detail description (<= 120 characters, clearly detailing rules and mechanics)
4. CRITICAL RULE - DO NOT WRITE TO DOCS:
   - NEVER call \`save_docs\` or write the event copy/plan into knowledge base documents!
   - In-App Events have dedicated App Store Connect data pipelines. You MUST update the event directly via \`manage_in_app_event\`.`;
    }

    return `请通过 Growmory MCP 为产品「${product.name}」(productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) 完善 App 内活动 (In-App Events)。

【当前活动信息】：
- 活动 ID (eventId): ${event.id}
- 活动参考名称: ${event.referenceName || '未命名活动'}
- 当前徽章: ${event.badge || '未设置'}
- 当前受众目的: ${event.purpose || '未设置'}
- 当前排期: ${event.eventStart || '未设置'} 至 ${event.eventEnd || '未设置'}（预告展示：${event.publishStart || '未设置'}）
- 当前深层链接: ${event.deepLink || '未设置'}
- 已配置语言: ${event.localizations?.map(l => `${l.locale}（${l.name || '未命名'}）`).join('、') || '无'}
${direction ? `\n【用户指定的优化方向 / 运营重点】：\n${direction}\n` : ''}
【核心操作规范（必须严格遵守）】：
1. 【读取详情】：首先调用 \`get_in_app_events_context\`，传入 productId: "${product.id}" 与 eventId: "${event.id}"，核验该活动的当前状态与完整配置。
2. 【更新活动属性】：根据优化方向与产品特性，调用 \`manage_in_app_event\`（action: "update"），传入 productId: "${product.id}" 与 eventId: "${event.id}"，完善并更新：
   - referenceName: 活动内部参考名称（≤64字符）
   - badge: 官方徽章类型（CHALLENGE/挑战、COMPETITION/比赛、LIVE_EVENT/直播活动、MAJOR_UPDATE/重磅更新、NEW_SEASON/新一季、PREMIERE/首发、SPECIAL_EVENT/特别活动）
   - purpose: 目标受众（APPROPRIATE_FOR_ALL_USERS/适合所有用户、ATTRACT_NEW_USERS/吸引新用户、KEEP_ACTIVE_USERS_INFORMED/保持活跃用户、BRING_BACK_LAPSED_USERS/召回流失用户）
   - priority: 优先级（NORMAL/普通、HIGH/高）
   - deepLink: 用户点击后在 App 内直达落地页的 Universal Link 或 Scheme
   - 排期时间: publishStart、eventStart、eventEnd（活动最长持续 31 天，预告最多提前 14 天）
3. 【完善多语言文案】：调用 \`manage_in_app_event\`（action: "set_localization"），传入 productId: "${product.id}"、eventId: "${event.id}" 与 locale，撰写高转化率文案：
   - name: 活动对外公开名称（严格限制 ≤ 30 字符，切勿重复徽章名称）
   - shortDescription: 卡片简短描述（严格限制 ≤ 50 字符，突出核心利益与亮点）
   - longDescription: 详情长描述（严格限制 ≤ 120 字符，清晰阐明参与规则与福利）
4. 【严重警告·严禁写入资料库】：
   - 绝不能调用 \`save_docs\` 或将活动文案/方案保存到 Growmory 资料库（docs）！
   - App 内活动是 App Store Connect 独立的官方商业模块，所有更新必须且只能通过 \`manage_in_app_event\` 工具直接回填到该活动中！`;
  }

  // 2. 未指定活动（列表页：策划并创建新活动）
  if (isEn) {
    return `Please analyze and plan targeted App Store In-App Events for product "${product.name}" (productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) via Growmory MCP.

${inAppEventsAgentWorkflowGuideEn.workflow}

${inAppEventsAgentWorkflowGuideEn.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}

[CRITICAL RULE]: NEVER call \`save_docs\` to save event plans into the knowledge base docs! Create and manage events exclusively via \`manage_in_app_event\`.`;
  }

  return `请通过 Growmory MCP 为产品「${product.name}」(productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) 策划并创建 App Store 官方 App 内活动 (In-App Events)。

${inAppEventsAgentWorkflowGuide.workflow}

${inAppEventsAgentWorkflowGuide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}

【严重警告·严禁写入资料库】：绝不能调用 \`save_docs\` 将活动方案存入资料库！所有活动必须通过 \`manage_in_app_event\` 工具直接创建并在 App 内活动模块中保存！`;
}

export type InAppEventImageStyleKey = '3d_clay' | 'cyber_tech' | 'flat_vector' | 'cinematic' | 'festive';

export interface InAppEventImageStyleOption {
  key: InAppEventImageStyleKey;
  labelZh: string;
  labelEn: string;
  descZh: string;
  descEn: string;
}

export const IN_APP_EVENT_IMAGE_STYLES: InAppEventImageStyleOption[] = [
  {
    key: '3d_clay',
    labelZh: '3D 磨砂质感',
    labelEn: '3D Matte Glass',
    descZh: '现代极简 C4D / Octane 风格，柔和影棚光，磨砂玻璃与高档质感材质',
    descEn: 'Modern minimalist Octane 3D style, soft studio lighting and frosted glass',
  },
  {
    key: 'cyber_tech',
    labelZh: '赛博流光科技',
    labelEn: 'Cyber Tech Neon',
    descZh: '深色暗黑背景搭配电光蓝与荧光紫，未来感全息粒子与光束',
    descEn: 'Dark backdrop with electric neon gradients, futuristic holographic particles',
  },
  {
    key: 'flat_vector',
    labelZh: '扁平潮流插画',
    labelEn: 'Vibrant Vector Art',
    descZh: '明快鲜艳的几何色块，高质感现代插画，Apple 设计大奖视觉风',
    descEn: 'Clean geometric shapes and bold vibrant colors, Apple Design Award aesthetics',
  },
  {
    key: 'cinematic',
    labelZh: '电影级写实光影',
    labelEn: 'Cinematic Lighting',
    descZh: '虚幻引擎5真实渲染，强烈轮廓光、丁达尔光效与景深虚化',
    descEn: 'Unreal Engine 5 hyperrealism, dramatic rim light, and volumetric depth',
  },
  {
    key: 'festive',
    labelZh: '缤纷庆典活力',
    labelEn: 'Festive Celebration',
    descZh: '飘带礼花金色彩带，绚烂粒子与明亮氛围，极富吸引力与节日庆典感',
    descEn: 'Glittering confetti ribbons, celebratory sparkles, and vibrant joyful aura',
  },
];

export interface InAppEventImagePromptResult {
  mediaType: 'card' | 'detail';
  aspectRatio: '16:9' | '9:16';
  resolution: string;
  prompt: string; // 自然语言生图提示词 (Primary natural language prompt)
  hasReference?: boolean;
  styleKey?: InAppEventImageStyleKey;
  styleLabel?: string;
  subjectDescriptionZh: string;
  subjectDescriptionEn: string;
  midjourneyPrompt: string;
  stableDiffusion: {
    positive: string;
    negative: string;
  };
  dallePrompt: string;
  appleGuidelines: string[];
}

export function buildInAppEventImagePrompt(params: {
  productName: string;
  eventTitle?: string;
  referenceName?: string;
  badge?: string;
  mediaType: 'card' | 'detail';
  shortDescription?: string;
  longDescription?: string;
  styleKey?: InAppEventImageStyleKey;
  lang?: Lang;
  hasReference?: boolean;
  referenceImages?: string[];
}): InAppEventImagePromptResult {
  const isEn = params.lang === 'en';
  const styleKey = params.styleKey || '3d_clay';
  const mediaType = params.mediaType;
  const isCard = mediaType === 'card';
  const badge = params.badge || 'SPECIAL_EVENT';
  const title = params.eventTitle || params.referenceName || params.productName;

  const styleObj = IN_APP_EVENT_IMAGE_STYLES.find(s => s.key === styleKey) || IN_APP_EVENT_IMAGE_STYLES[0];

  const badgeMapZh: Record<string, string> = {
    CHALLENGE: '挑战 (Challenge)',
    COMPETITION: '比赛 (Competition)',
    LIVE_EVENT: '直播活动 (Live Event)',
    LIVE_STREAM: '直播活动 (Live Event)',
    MAJOR_UPDATE: '重磅更新 (Major Update)',
    NEW_SEASON: '新一季 (New Season)',
    PREMIERE: '首发 (Premiere)',
    SPECIAL_EVENT: '特别活动 (Special Event)',
  };

  const badgeMapEn: Record<string, string> = {
    CHALLENGE: 'Challenge',
    COMPETITION: 'Competition',
    LIVE_EVENT: 'Live Event',
    LIVE_STREAM: 'Live Event',
    MAJOR_UPDATE: 'Major Update',
    NEW_SEASON: 'New Season',
    PREMIERE: 'Premiere',
    SPECIAL_EVENT: 'Special Event',
  };

  const hasReference = Boolean(params.hasReference || params.referenceImages?.length);

  const promptZh = hasReference
    ? `【创作主题（仅用于理解场景氛围与配色，严禁在屏幕外额外添加任何营销文字）】
- 应用名称：${params.productName}
- 活动名称：${title}
- 活动类型：${badgeMapZh[badge] || badge}${params.shortDescription ? `\n- 活动简介：${params.shortDescription}` : ''}${params.longDescription ? `\n- 活动说明：${params.longDescription}` : ''}

【任务目标】
请基于用户上传的参考图（UI 界面截图与/或设备模具），创作一张符合 Apple App Store 首页编辑推荐水准的${isCard ? ' 16:9 活动卡片主视觉图' : ' 9:16 活动详情页全屏主视觉图'}。
将上传的真实 UI 界面准确、清晰地呈现在设备模具屏幕中（若仅上传 UI 未上传模具，则搭配极简现代的 Apple 设备或轻盈悬浮卡片展示），作为画面的核心视觉主体，并为其搭配干净、高级、与 UI 色调相呼应的现代背景环境与柔和光影。

【构图与规格要求】
1. 忠实还原参考图：严格保留参考图中的 UI 布局、色彩与核心元素，确保界面清晰、比例正确、不扭曲变形，严禁将 UI 抽象化、涂抹化或重绘成无关图案。
2. 比例与画布全出血：严格采用 ${isCard ? '16:9 横屏比例（1920×1080）' : '9:16 竖屏比例（1080×1920）'}。背景必须铺满整张画布（Full-bleed），画面最外缘严禁添加装饰边框、圆角裁切或伪造的 App Store 卡片外框。
3. 视觉安全区：${isCard
  ? '将设备与 UI 主体置于画面中上部（可采用微仰角/微透视或居中展示，确保横屏构图饱满）；底部 25%–30% 区域保持背景纯净、低对比度与平滑过渡，为 App Store 原生标题与渐变遮罩预留空间，避免遮挡核心 UI'
  : '将设备与 UI 主体置于画面中上部；顶部（尤其是右上角）保持干净留白以避让系统关闭按钮；底部 30% 区域保持简洁平滑过渡，为系统文案与按钮预留空间'}。
4. 屏幕外严禁额外文字：除 UI 截图本身包含的界面内容外，画面背景与四周绝对不能额外添加任何标题、口号、价格、折扣标签、App 图标或水印。`
    : `【创作主题（仅用于理解画面氛围与隐喻，严禁将任何文字画入图中）】
- 应用名称：${params.productName}
- 活动名称：${title}
- 活动类型：${badgeMapZh[badge] || badge}${params.shortDescription ? `\n- 活动简介：${params.shortDescription}` : ''}${params.longDescription ? `\n- 活动说明：${params.longDescription}` : ''}

【任务目标】
请将上述活动主题转化为纯粹的视觉意象，创作一张符合 Apple App Store 首页编辑推荐水准的${isCard ? ' 16:9 活动卡片背景图' : ' 9:16 活动详情页全屏背景图'}。画面应通过抽象视觉元素、光影或场景隐喻来传达活动核心体验，整体风格现代、克制、富有质感，不限具体艺术流派，以最契合活动主题为优先。

【构图与规格要求】
1. 比例与全出血：严格采用 ${isCard ? '16:9 横屏比例（1920×1080）' : '9:16 竖屏比例（1080×1920）'}。画面必须铺满整张画布（Full-bleed），严禁出现任何边框、圆角、投影或模拟手机/卡片外框。
2. 视觉安全区：${isCard
  ? '核心视觉主体居中偏上，四周留有呼吸感；底部 30% 区域保持画面简洁、低对比度与平滑过渡，为 App Store 原生标题与渐变遮罩预留空间（不要自行绘制硬边色块或人工暗角）'
  : '核心视觉主体位于画面中上部；顶部（尤其是右上角）保持干净留白以避让系统关闭按钮与徽章；底部 30% 区域保持简洁低对比度并自然过渡，为系统文案与按钮预留空间'}。
3. 严禁文字与符号：画面中绝对不能出现任何语言的文字、字母、数字、标点、价格标签或折扣标识。
4. 严禁界面与图标：画面中绝对不能出现 App 图标、软件界面 UI、按钮、弹窗、设备模具或水印。`;

  const promptEn = hasReference
    ? `[Theme Context — For backdrop mood & color harmony only; NEVER add extra marketing text outside the screen]
- App Name: ${params.productName}
- Event Title: ${title}
- Event Type: ${badgeMapEn[badge] || badge}${params.shortDescription ? `\n- Event Summary: ${params.shortDescription}` : ''}${params.longDescription ? `\n- Event Details: ${params.longDescription}` : ''}

[Objective]
Using the uploaded reference image(s) (UI screenshot and/or device mockup), create an Apple App Store Editorial-grade ${isCard ? '16:9 In-App Event card artwork' : '9:16 In-App Event full-screen detail artwork'}.
Accurately and crisply place the provided UI inside the device mockup screen as the hero subject (if only a UI screenshot is provided, present it in a sleek minimalist Apple device or clean floating card). Surround it with a refined, modern backdrop and soft studio lighting that harmonizes with the UI color palette.

[Composition & Technical Constraints]
1. Faithful UI Preservation: Strictly preserve the exact layout, colors, and details of the uploaded UI screenshot inside the screen. Keep it sharp and undistorted—NEVER abstract, blur, or repaint the UI into generic shapes.
2. Aspect Ratio & Full-Bleed Canvas: Strictly ${isCard ? '16:9 landscape (1920x1080)' : '9:16 portrait (1080x1920)'}. Edge-to-edge full-bleed background. NO outer borders, NO rounded canvas corners, and NO fake App Store card frames.
3. Safe Area: ${isCard
  ? 'Position the device and UI in the upper-middle area with a balanced, dynamic composition. Keep the bottom 25%–30% uncluttered, low-contrast, and visually smooth for native App Store titles and gradient scrims'
  : 'Position the device and UI in the upper-middle area. Keep the top area—especially the top-right corner—clean for the native close button. Keep the bottom 30% uncluttered and smooth for native titles and CTA buttons'}.
4. No Extra Text Outside the Screen: Apart from the original UI content inside the device screen, add ZERO extra headlines, slogans, prices, discount badges, floating app icons, or watermarks.`
    : `[Theme Context — For visual mood & metaphor only; NEVER render any of this text in the image]
- App Name: ${params.productName}
- Event Title: ${title}
- Event Type: ${badgeMapEn[badge] || badge}${params.shortDescription ? `\n- Event Summary: ${params.shortDescription}` : ''}${params.longDescription ? `\n- Event Details: ${params.longDescription}` : ''}

[Objective]
Translate the event theme above into pure visual storytelling to create an Apple App Store Editorial-grade ${isCard ? '16:9 In-App Event card artwork' : '9:16 In-App Event full-screen detail artwork'}. Convey the core experience through evocative visual metaphors, lighting, or symbolic objects. Keep the aesthetic clean, modern, and high-craft, with artistic style freely adapted to best fit the theme.

[Composition & Technical Constraints]
1. Aspect Ratio & Full-Bleed: Strictly ${isCard ? '16:9 landscape (1920x1080)' : '9:16 portrait (1080x1920)'}. Edge-to-edge full-bleed composition. NO borders, NO rounded corners, NO drop shadows, and NO fake card or device frames.
2. Safe Area: ${isCard
  ? 'Place the main focal subject in the upper-middle area with balanced breathing room. Keep the bottom 30% uncluttered, low-contrast, and visually smooth to accommodate native App Store text and system scrims (do NOT draw artificial dark bars or hard gradients)'
  : 'Place the main focal subject in the upper-middle area. Keep the top area—especially the top-right corner—clean for the native close button and badge. Keep the bottom 30% uncluttered and low-contrast for native titles and CTA buttons'}.
3. Strictly No Text: Zero text, letters, numbers, symbols, pricing, or promotional tags anywhere in the image.
4. Strictly No UI or Icons: Zero app icons, UI screenshots, buttons, device mockups, or watermarks.`;

  const naturalPrompt = isEn ? promptEn : promptZh;

  // Subject definition based on badge (for compatibility with legacy multi-engine fields)
  let subjectEn = 'an enchanting floating mystery gift box bursting with golden light particles, celebratory floating ribbons, magical radiant energy sparkles';
  let subjectZh = '一个悬浮的神秘礼盒向外迸发璀璨的金色光芒粒子，四周飞舞着庆典彩带与魔法发光微粒';

  if (badge === 'CHALLENGE') {
    subjectEn = 'a magnificent glowing golden achievement trophy with dynamic ascending energy rings and geometric milestone crests floating in mid-air';
    subjectZh = '一座悬浮在半空中的璀璨金色挑战成就奖杯，四周环绕着升腾的动态能量光环与几何里程碑勋章';
  } else if (badge === 'COMPETITION') {
    subjectEn = 'a high-energy futuristic tournament esports stadium arena, glowing crossed victory laser beams, floating championship rings, epic spotlights';
    subjectZh = '充满未来感的电竞竞技锦标赛场馆，交织的胜利激光束，悬浮的冠军光环与耀眼聚光灯';
  } else if (badge === 'LIVE_EVENT' || badge === 'LIVE_STREAM') {
    subjectEn = 'a vibrant holographic live streaming broadcast stage, floating luminous soundwave audio equalizers, glowing studio neon lights and spotlights';
    subjectZh = '充满活力的全息实况直播活动舞台，悬浮的发光音频声波可视化律动光条，演播厅霓虹光影';
  } else if (badge === 'MAJOR_UPDATE') {
    subjectEn = 'a revolutionary futuristic crystalline core illuminating and expanding, floating sleek modular holographic interface tiles assembling in mid-air, innovation breakthrough energy beams';
    subjectZh = '一个正在展开并绽放光芒的未来科技晶体核心，半空中组装浮动的模块化全息界面图块，极具创新突破感的光束';
  } else if (badge === 'NEW_SEASON') {
    subjectEn = 'a breathtaking new season horizon with an opening cosmic portal, floating seasonal emblem banners, revitalizing dawn lighting, fresh start adventure aura';
    subjectZh = '壮丽的新赛季曙光地平线与开启的时空传送门，悬浮的赛季徽章战旗，破晓晨光与新篇章冒险氛围';
  } else if (badge === 'PREMIERE') {
    subjectEn = 'a grand premiere celebration with golden cinema beam spotlights, floating golden VIP pass ticket, elegant velvet texture, dazzling starlight sparkles';
    subjectZh = '盛大的首映庆典，金色电影聚光灯光柱，悬浮的金色VIP入场券门票，丝绒质感与璀璨星光光斑';
  }

  // Safe zone instructions (compatibility)
  const compositionEn = isCard
    ? 'Landscape 16:9 composition. The main focal subject is centered in the upper-middle area. The bottom 30% area has a clean, smooth uncluttered background to allow for native App Store overlay without clashing.'
    : 'Portrait 9:16 vertical composition. The central visual subject flows vertically from the upper-middle area downward into a smooth atmospheric backdrop. The top-right corner is clean for the modal close button.';

  // Style attributes (compatibility)
  let styleMidjourney = 'minimalist 3D render, smooth matte clay and frosted glass textures, soft studio rim lighting, pastel and deep tech blue color palette, clean ambient occlusion, rendered in Octane Render, 8k, elegant clean aesthetic';
  let sdPositiveStyle = 'masterpiece, best quality, 3D claymation and frosted glass style, smooth geometry, soft studio lighting, pastel colors, clean backdrop, Octane render style, ultra detailed';
  let dalleStyleEn = 'clean and modern 3D illustration featuring smooth clay and frosted glass materials, soft studio lighting with elegant shadows on a clean gradient background';

  if (styleKey === 'cyber_tech') {
    styleMidjourney = 'cyberpunk neon aesthetic, glowing holographic particles, futuristic dark background, vibrant electric blue, purple and neon orange gradients, volumetric lighting, optical flares, high-tech digital art, Unreal Engine 5 render, 8k';
    sdPositiveStyle = 'cyberpunk high-tech style, glowing neon lights, holographic effects, dark sleek background, electric blue and purple, volumetric light rays, ray tracing, sharp focus';
    dalleStyleEn = 'futuristic high-tech digital illustration with glowing neon lights and holographic effects against a dark sleek backdrop, volumetric light beams and luminous gradients';
  } else if (styleKey === 'flat_vector') {
    styleMidjourney = 'modern flat vector illustration, bold clean outlines, vibrant solid color palette, geometric minimalism, Apple design award style, Behance trending, high contrast, clean vector art';
    sdPositiveStyle = 'vector graphic, flat illustration, clean sharp lines, bold vibrant colors, minimal geometry, modern tech company branding artwork, crisp edges';
    dalleStyleEn = 'sophisticated modern flat vector illustration with crisp geometric shapes and bold vibrant colors, clean minimalist aesthetic';
  } else if (styleKey === 'cinematic') {
    styleMidjourney = 'cinematic photorealistic lighting, dramatic rim light, depth of field, ray-traced reflections, volumetric atmosphere, hyper-detailed textures, shot on 35mm lens, 8k resolution, award-winning concept art';
    sdPositiveStyle = 'cinematic still, hyperrealistic, dramatic atmospheric lighting, shallow depth of field, 8k UHD, raytracing, intricate details, photorealistic rendering';
    dalleStyleEn = 'cinematic digital concept painting with dramatic lighting, rich depth of field, and deep volumetric atmospheric effects';
  } else if (styleKey === 'festive') {
    styleMidjourney = 'vibrant festive celebration, floating golden confetti ribbons, glowing magical particles, joyful celebration lighting, warm golden hour and bright celebratory accents, dynamic 3D composition, 8k';
    sdPositiveStyle = 'joyful celebratory style, floating golden confetti, glittering sparkles, warm vibrant colors, festive atmosphere, high quality 3D art';
    dalleStyleEn = 'vibrant celebratory digital artwork with floating golden confetti and sparkling light elements, warm dynamic holiday celebration atmosphere';
  }

  const arParam = isCard ? '--ar 16:9' : '--ar 9:16';
  const midjourneyPrompt = `${subjectEn}, representing "${title}", ${styleMidjourney}, ${compositionEn} ${arParam} --v 6.1 --style raw --no text, font, typography, letters, words, watermark, logo, app icon, ui buttons, borders`;

  const sdPositive = `${sdPositiveStyle}, ${subjectEn}, themed after ${title}, ${compositionEn}, high resolution, professional commercial artwork`;
  const sdNegative = 'text, font, typography, letters, watermark, username, signature, logo, app icon, pricing, button, frame, border, cropped, out of frame, low quality, worst quality, blurry, deformed';

  const dallePrompt = isEn
    ? `A professional App Store In-App Event artwork for "${title}". The image depicts ${subjectEn}. Visual style: ${dalleStyleEn}. ${compositionEn}. Strict Rule: Do NOT include any text, letters, numbers, app icons, badges, or logos anywhere in the artwork.`
    : `为 App「${params.productName}」的活动「${title}」绘制官方 App Store 活动素材。主体为：${subjectZh}。视觉风格：${styleObj.descZh}。构图说明：${isCard ? '16:9 横屏构图，视觉主体居中偏上，下方30%保持纯净渐变背景' : '9:16 竖屏构图，视觉主体位于中上部，右上角留白，底部自然向下过渡'}。严格合规要求：画面内绝对不能包含任何文字、字符、App图标、价格标签或按钮。`;

  const appleGuidelines = isEn
    ? [
        'Strictly NO text or numbers: Apple App Store overlays the badge, event title, and description natively. Text in the artwork will cause App Review rejection.',
        'NO App Icon or Pricing: Never embed app icons or price tags. Apple displays the app icon next to the GET button automatically.',
        'Safe Zone Reserve: For 16:9 cards, the lower 30% is covered by a dark gradient scrim overlay and title text. Keep the focal subject in the upper-middle area.',
        'Format & High Resolution: Export as PNG (or high-quality JPEG). Card: 1920x1080 / 3840x2160 (16:9). Details Page: 1080x1920 / 2160x3840 (9:16).',
      ]
    : [
        '严禁添加任何文字与数字：App Store 会在卡片上自动叠放原生徽章药丸、活动标题与描述。素材中含有文字将被苹果审核无情拒绝（Review Rejection）。',
        '严禁嵌入 App 图标或价格：苹果会在卡片与详情页上原生展示应用图标与获取按钮，画面中切勿重复放置自身或第三方 Logo。',
        '预留底部安全区 (Safe Zone)：16:9 活动卡片下方约 30% 区域将被系统暗色渐变遮罩覆盖，视觉核心主体务必居中偏上放置，避免被遮挡。',
        '标准分辨率规格：建议导出为无损 PNG 格式。活动卡片推荐 1920 x 1080 或 3840 x 2160 (16:9)；活动详情页推荐 1080 x 1920 或 2160 x 3840 (9:16)。',
      ];

  return {
    mediaType,
    aspectRatio: isCard ? '16:9' : '9:16',
    resolution: isCard ? '1920 x 1080 / 3840 x 2160 (16:9)' : '1080 x 1920 / 2160 x 3840 (9:16)',
    prompt: naturalPrompt,
    hasReference,
    styleKey,
    styleLabel: isEn ? styleObj.labelEn : styleObj.labelZh,
    subjectDescriptionZh: subjectZh,
    subjectDescriptionEn: subjectEn,
    midjourneyPrompt,
    stableDiffusion: {
      positive: sdPositive,
      negative: sdNegative,
    },
    dallePrompt,
    appleGuidelines,
  };
}
