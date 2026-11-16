import { getCurrentLang, type Lang } from './i18n.ts';

export const customPagesAgentWorkflowGuide = {
  workflow: '先分析产品受众分群与投放渠道（如 Apple Search Ads 搜索词群、社媒博主、特定推广活动），规划针对性的自定义产品页面 (CPP)，并通过 Growmory MCP 创建与配置。',
  steps: [
    '【受众与渠道分群】：通过 get_custom_product_pages_context 读取已有的自定义产品页面列表及状态；通过 list_records/get_record 查验产品核心功能、已确认资料与营销定位。针对不同营销意图（例如：按功能痛点细分、按 ASA 关键词主题群如「效率工具/笔记记录/极简设计」、按 KOL 推荐场景、按促销/季节主题）明确每个自定义页面的目标受众。',
    '【差异化素材与文案策略】：每个自定义产品页面拥有独立的 App Store 分发链接（带 ppid 参数）、独特的推广文本（promotionalText，≤170 字符）以及专属截屏组/预览视频。明确本页面要强化的第 1~3 张截屏主题与文案，让点击广告或特定链接的用户一进页面就看到强相关的内容，提升转化率。',
    '【深层链接 (Deep Link) 闭环】：自定义页面支持配置 deepLink（通用链接 Universal Link 或自定义 URL Scheme）。为自定义页面配置直达应用内特定功能页或新手引导流程的路由，确保用户安装打开 App 后能无缝承接广告场景与预期，避免落地到通用首页导致流失。',
    '【MCP 执行与多语言本地化】：调用 manage_custom_product_page（action: "create"）创建自定义页面并设定页面名称；如需配置直达路由，调用 action: "create_version" 设定 deepLink；通过 action: "set_localization" 为不同国家地区配置精准的宣传文本（promotionalText ≤170 字符）。',
    '【输出策略与运营建议】：为每个自定义页面生成方案摘要，包括：页面名称、受众群体、匹配的推广渠道或 ASA 搜索词、推荐的截屏创意方向、多语言推广文案、深层链接建议，以及上线后的投放效果跟踪指标（展示、转化率、每次获客成本 CPA）。',
  ],
};

export const customPagesAgentWorkflowGuideEn = {
  workflow: 'Analyze audience segmentation and acquisition channels (e.g. Apple Search Ads keyword clusters, creator campaigns, seasonal promos), design targeted Custom Product Pages (CPP), and manage them via Growmory MCP.',
  steps: [
    'Audience & Channel Segmentation: Read existing CPP pages and statuses with get_custom_product_pages_context; verify product capabilities and confirmed docs with list_records/get_record. Define audience targets for each CPP (e.g., specific user pain points, ASA keyword themes, creator endorsements, or promotional events).',
    'Creative & Promotional Copy Strategy: Each custom page features an independent App Store URL (with ppid query param), unique promotional text (<= 170 chars), and dedicated screenshots/previews. Define the primary focus of the first 1-3 screenshots and headline copy to directly match user search intent or referral context, maximizing CVR.',
    'Deep Linking Continuity: Custom product pages support deepLink (Universal Link or custom URL Scheme). Route users directly to matching onboarding flows or featured screens upon first launch to avoid drop-off caused by generic landing pages.',
    'MCP Execution & Localization: Call manage_custom_product_page (action: "create") to set up the page; use action: "create_version" with deepLink for onboarding routing; use action: "set_localization" to provide localized promotionalText (<= 170 chars) across target locales.',
    'Strategy Summary & Attribution: Provide a structured strategy table for each custom page, including page name, target audience, acquisition channels/keywords, screenshot creative concepts, promotional copy, deep link routing, and post-launch conversion benchmarks.',
  ],
};

export function buildCustomPagesAgentPrompt(product: {
  id: string;
  name: string;
  appStore?: { appId?: string };
}, lang: Lang = getCurrentLang()) {
  if (lang === 'en') {
    return `Please analyze and plan targeted App Store Connect Custom Product Pages (CPP) for product "${product.name}" (productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) via Growmory MCP.

${customPagesAgentWorkflowGuideEn.workflow}

${customPagesAgentWorkflowGuideEn.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`;
  }

  return `请通过 Growmory MCP 为产品「${product.name}」(productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) 调研并设计 App Store Connect 自定义产品页面 (CPP) 方案与落地策略。

${customPagesAgentWorkflowGuide.workflow}

${customPagesAgentWorkflowGuide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`;
}
