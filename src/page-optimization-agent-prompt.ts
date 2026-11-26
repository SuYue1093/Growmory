import { getCurrentLang, type Lang } from './i18n.ts';

export const pageOptimizationAgentWorkflowGuide = {
  workflow: '分析产品当前下载转化漏斗与用户流失环节，制定科学的产品页面优化 (Product Page Optimization / PPO / A/B 测试) 实验方案，设计对照组与测试变体并通过 Growmory MCP 进行管理与配置。',
  steps: [
    '【数据诊断与转化瓶颈】：调用 get_page_optimization_context 检查当前已配置的实验与变体，并调用 get_analytics_context 评估产品过去 30~90 天在各国家/地区的展示量 (Impressions)、产品详情页访问量 (Product Page Views)、下载转化率 (Conversion Rate) 与重新下载率。识别是否存在「高曝光但低详情页访问」（可能需测试应用图标 App Icon）或「高详情页访问但低下载转化」（需测试前三张截屏与应用预览视频）。',
    '【单变量假设制定 (Single-Variable Principle)】：严格遵循 A/B 测试科学原则，每次实验只对比单一核心变量，严禁混杂多变量导致无法归因。明确提出假设，例如：「将首图从功能界面截图变更为带场景化大标题的真实使用痛点对比，预计能让详情页下载转化率提升 12%~18%」。',
    '【测试变体 (Treatments) 设计】：App Store Connect 支持设置最多 3 个测试变体（Treatment A、B、C）与 1 个原始对照组（Original Control）。明确设计变体的具体方案：\n  - 图标测试：设计差异化底色、主体符号或风格（扁平 vs 质感立体）；\n  - 截屏测试：对比文案痛点诉求（如「省时高效」vs「专业安全」）、视觉排版（单设备居中 vs 跨屏连续故事画卷）、配色对比度等；\n  - 本地化差异测试：针对不同语言市场匹配当地文化审美的变体。',
    '【流量比例与置信周期】：评估产品自然流量量级，设定合适的流量比例 (trafficProportion，默认推荐 50% 均分给测试变体)。设定预计实验周期（建议至少完整运行 7~14 天，充分覆盖工作日与周末的用户行为周期，确保统计显著性 p < 0.05）。',
    '【MCP 实验配置与管理】：调用 manage_page_optimization_experiment（action: "create"）创建实验并设定实验名称、流量分配与平台；添加测试变体（action: "add_treatment"）；并在实验审核通过后，调用 action: "start" 启动实验。',
    '【结果评估与胜出决策】：实验运行期间及结束后，对比各变体的转化率与胜出概率（App Store Connect 提供的置信区间）。若测试变体置信显著胜出，建议在下次正式版本中将胜出素材应用为主页面。',
  ],
};

export const pageOptimizationAgentWorkflowGuideEn = {
  workflow: 'Diagnose conversion funnel drop-offs, formulate a scientific Product Page Optimization (PPO / A/B Testing) experiment, design control vs test treatments, and manage them via Growmory MCP.',
  steps: [
    'Funnel Diagnosis & Bottlenecks: Call get_analytics_context to evaluate impressions, product page views, and download conversion rates across key territories over the past 30-90 days. Distinguish whether low CVR stems from icon appeal (search impression to click) or screenshot/video relevance (page view to install).',
    'Single-Variable Hypothesis: Adhere strictly to the single-variable testing rule. Isolate one factor per test (App Icon alone, or Screenshot order/style, or App Preview video alone) to ensure clear attribution. State an explicit hypothesis with expected conversion lift.',
    'Treatment Variation Design: App Store Connect allows up to 3 test treatments against the original control. Specify actionable variations:\n  - App Icon: test background contrast, primary metaphor, or visual finish;\n  - Screenshots: test value proposition angles (e.g. speed vs privacy), typography hierarchy, or lifestyle context;\n  - Localization adaptation: tailor imagery for cultural nuances across target locales.',
    'Traffic Allocation & Test Duration: Set trafficProportion (50% split is recommended for statistical power when traffic allows). Run for a minimum of 7-14 consecutive days to span weekday/weekend behavioral differences.',
    'MCP Experiment Creation & Control: Call manage_page_optimization_experiment (action: "create") with experiment name, traffic proportion, and platform; add treatments (action: "add_treatment"); start the test (action: "start") once approved by Apple.',
    'Evaluation & Rollout Decision: Evaluate Bayesian improvement metrics and confidence intervals reported by App Store Connect. If a treatment achieves statistical significance with high probability of being the best, roll out the winning creative to the primary product page.',
  ],
};

export function buildPageOptimizationAgentPrompt(product: {
  id: string;
  name: string;
  appStore?: { appId?: string };
}, lang: Lang = getCurrentLang()) {
  if (lang === 'en') {
    return `Please analyze the conversion funnel and design a scientific App Store Connect Product Page Optimization (PPO / A/B Testing) experiment for product "${product.name}" (productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) via Growmory MCP.

${pageOptimizationAgentWorkflowGuideEn.workflow}

${pageOptimizationAgentWorkflowGuideEn.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`;
  }

  return `请通过 Growmory MCP 为产品「${product.name}」(productId: ${product.id}${product.appStore?.appId ? ` · Apple App ID: ${product.appStore.appId}` : ''}) 调研并设计 App Store Connect 产品页面优化 (PPO / A/B 测试) 实验方案。

${pageOptimizationAgentWorkflowGuide.workflow}

${pageOptimizationAgentWorkflowGuide.steps.map((step, index) => `${index + 1}. ${step}`).join('\n\n')}`;
}
