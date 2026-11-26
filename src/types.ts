export type StoreVersion = { id: string; version: string; platform: string; state: string; notes: { locale: string; body: string }[] };
export type StoreLink = { appId: string; name: string; bundleId: string; syncedAt: string; versions: StoreVersion[] };
export type Product = {
  promotionSchedule?: { time: string; timezone: string; minutes: number };
  appStore?: StoreLink;
  id: string;
  name: string;
  englishName?: string;
  summary: string;
  appId: string;
  price: string;
  platform: string;
  website: string;
  icon?: string;
  color: string;
};
export type DocHistoryItem = {
  version?: string;
  title?: string;
  summary?: string;
  body: string;
  at: string;
  releaseId?: string;
  source?: string;
};

// Empty productId identifies shared workspace documents and folders.
export type Doc = {
  reviewBase?: { title: string; body: string };
  reviewChanges?: { field: "body" | "title"; before: string; after: string; source: string; at: string }[];
  folderId?: string;
  id: string;
  productId: string;
  title: string;
  body: string;
  status: "pending" | "confirmed";
  version?: string;
  summary?: string;
  history: DocHistoryItem[];
  updatedAt: string;
  source?: string;
};
export type DocFolder = { id: string; productId: string; name: string; parentId: string };
export type PlatformDetail = {
  version: string;
  changes: string;
  notes?: { language: string; body: string; approved?: boolean }[];
};

export type ReleaseProposal = {
  docId: string;
  version?: string;
  title?: string;
  summary?: string;
  body: string;
  before: string;
  reason: string;
  applied: boolean;
};

export type Release = {
  storeSource?: { appId: string; versionId: string; platform: string; version?: string };
  storeSources?: Record<string, { appId: string; versionId: string; platform: string; version?: string }>;
  id: string;
  productId: string;
  version: string;
  changes: string;
  platforms?: string[];
  platformDetails?: Record<string, PlatformDetail>;
  tags?: string[];
  publishedAt?: string;
  languages: string[];
  channels: string[];
  status: string;
  createdAt: string;
  notes: { language: string; body: string; approved: boolean }[];
  proposals: ReleaseProposal[];
};

export type ReleaseTagCategory = {
  id: "pricing" | "product";
  name: string;
  description: string;
};

export const RELEASE_TAG_CATEGORIES: ReleaseTagCategory[] = [
  { id: "pricing", name: "商业化与变现", description: "售价变动或付费墙改版，影响付费转化" },
  { id: "product", name: "产品特性与生态", description: "重磅功能、修复或 iOS 生态适配，影响留存与推荐" },
];

export type ReleaseTag = {
  id: string;
  label: string;
  category: "pricing" | "product";
  hint: string;
  iconName: string;
};

// 兼容历史版本手动记录的 ASO 标签文案
export const HISTORICAL_RELEASE_TAGS: Record<string, string> = {
  keywords: "更新关键词组",
  title_subtitle: "修改主/副标题",
  search_creatives: "修改搜索结果图",
  screenshots: "更换上架截图",
  app_icon: "更换 App 图标",
  preview_video: "更新预览视频",
};

export const RELEASE_TAG_OPTIONS: ReleaseTag[] = [
  // 商业化与定价（直接影响收入与付费转化率）
  { id: "pricing_change", label: "价格/内购调整", category: "pricing", hint: "单价变动、特惠促销或定价梯度调整，直接影响营收", iconName: "BadgeDollarSign" },
  { id: "paywall_revamp", label: "改版付费墙", category: "pricing", hint: "重新设计购买引导页与权益展示，影响内购转化率", iconName: "CreditCard" },

  // 产品功能与架构（影响留存、老用户唤醒与稳定性）
  { id: "major_feature", label: "重大核心功能", category: "product", hint: "发布重磅新功能，拉动老用户回流与自发传播", iconName: "Rocket" },
  { id: "hotfix", label: "紧急热修复 (Hotfix)", category: "product", hint: "修复严重 Bug 或闪退，用于解释前序指标下滑后的回弹", iconName: "Bug" },
  { id: "apple_features", label: "适配 iOS 新特性", category: "product", hint: "适配灵动岛、小组件、控制中心等，易获苹果推荐", iconName: "Layers" },
];

export type MarketingTag = {
  id: "free" | "discount";
  label: string;
  hint: string;
  color: string;
};

export const MARKETING_TAG_OPTIONS: MarketingTag[] = [
  { id: "free", label: "限免", hint: "限时免费活动，对短期下载量和新用户有强爆发性拉动", color: "#e11d48" },
  { id: "discount", label: "优惠", hint: "打折特惠、半价或促销活动，直接影响付费转化与收入", color: "#ea580c" },
];

export function inferMarketingTags(content: {
  title?: string;
  body?: string;
  tags?: string[];
}): string[] {
  const existing = new Set(content.tags || []);
  const text = `${content.title || ""} ${content.body || ""}`.toLowerCase();

  // 若已有明确标签，保留有效标签
  if (existing.has("free") || existing.has("discount")) {
    return Array.from(existing).filter((t) => t === "free" || t === "discount");
  }

  // 智能推断限免与优惠
  if (/限免|限时免费|免费领|免费下载/i.test(text)) {
    existing.add("free");
  }
  if (/优惠|特惠|折扣|打折|促销|降价|半价|立减|福利价|优惠码|大促/i.test(text) || existing.has("special_offer")) {
    existing.add("discount");
  }

  return Array.from(existing).filter((t) => t === "free" || t === "discount");
}
export type SocialAccount = {
  id: string;
  platform: string;
  name: string;
  url: string;
  productId: string;
  followers?: number | null;
  isPremium?: boolean;
  contentDirection?: string;
  writingStyle?: string;
};

export type ContentTarget = {
  channel: string;
  accountId?: string;
};

export type ContentGroup = {
  id: string;
  title: string;
  direction: string;
  productIds: string[];
  channels: string[];
  targets?: ContentTarget[];
  createdAt: string;
  updatedAt?: string;
};

export function getContentGroupTargets(group: Pick<ContentGroup, "channels" | "targets">): ContentTarget[] {
  if (Array.isArray(group.targets) && group.targets.length > 0) {
    return group.targets;
  }
  return (group.channels || []).map((channel) => ({ channel }));
}

export type Content = {
  sourceSocialIdentity?: string;
  accountId?: string;
  assetIds?: string[];
  assetNames?: string[];
  coverAssetId?: string;
  sourcePromotionId?: string;
  publishedAt?: string;
  id: string;
  productId: string;
  productIds?: string[];
  releaseId?: string;
  groupId?: string;
  explanation?: string;
  redditCommunities?: {
    name: string;
    reason: string;
    rules: string;
    notes: string;
    sourceUrl?: string;
    checkedAt?: string;
  }[];
  title: string;
  body: string;
  channel: string;
  status: string;
  date: string;
  url: string;
  tags?: string[];
  createdAt?: string;
  isAi?: boolean;
};

export function isAiContent(c: Content): boolean {
  if (c.isAi !== undefined) return Boolean(c.isAi);
  if (c.groupId) return true;
  if (c.explanation && c.explanation.trim().length > 0) return true;
  return false;
}

export function formatCreatedTime(val?: string): string {
  if (!val) return "—";
  try {
    let d: Date;
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, day] = trimmed.split("-").map(Number);
      d = new Date(y, m - 1, day, 0, 0, 0);
    } else {
      d = new Date(trimmed);
    }
    if (isNaN(d.getTime())) return val;
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${ymd} ${hm}`;
  } catch {
    return val;
  }
}
export type ReportTaskAnchor = { section: string; start: number; text: string };

export type Task = {
  id: string;
  productId: string;
  releaseId?: string;
  title: string;
  done: boolean;
  date: string;
  reportId?: string;
  quote?: string;
  reportAnchors?: ReportTaskAnchor[];
  note?: string;
};
export type AssetFolder = {
  id: string;
  productId: string; // Empty productId identifies shared/non-app workspace folders.
  name: string;
  parentId: string; // Empty string identifies root folders.
};
export type Asset = {
  id: string;
  name: string;
  url: string; // Base64 data URL or asset URL
  productId: string; // Empty productId identifies shared/non-app workspace assets.
  releaseId?: string;
  languages?: string[]; // 适用的语言/本地化代码列表，如 ["zh-Hans", "en-US"]
  fileSize: number;
  fileName: string;
  fileType: string;
  folderId?: string;
  width?: number;
  height?: number;
  createdAt: string;
  updatedAt: string;
};

export const COMMON_ASSET_LANGUAGES: { code: string; name: string; label: string }[] = [
  { code: "zh-Hans", name: "简体中文", label: "简体中文 (zh-Hans)" },
  { code: "zh-Hant", name: "繁体中文", label: "繁体中文 (zh-Hant)" },
  { code: "en-US", name: "英语", label: "英语 (en-US)" },
  { code: "ja", name: "日语", label: "日语 (ja)" },
  { code: "ko", name: "韩语", label: "韩语 (ko)" },
  { code: "es-ES", name: "西班牙语", label: "西班牙语 (es-ES)" },
  { code: "fr-FR", name: "法语", label: "法语 (fr-FR)" },
  { code: "de-DE", name: "德语", label: "德语 (de-DE)" },
  { code: "it", name: "意大利语", label: "意大利语 (it)" },
  { code: "pt-BR", name: "葡萄牙语", label: "葡萄牙语 (pt-BR)" },
  { code: "ru", name: "俄语", label: "俄语 (ru)" },
  { code: "ar-SA", name: "阿拉伯语", label: "阿拉伯语 (ar-SA)" },
  { code: "vi", name: "越南语", label: "越南语 (vi)" },
  { code: "th", name: "泰语", label: "泰语 (th)" },
  { code: "id", name: "印尼语", label: "印尼语 (id)" },
  { code: "nl-NL", name: "荷兰语", label: "荷兰语 (nl-NL)" },
];

export function getAssetLanguageLabel(code: string): string {
  const found = COMMON_ASSET_LANGUAGES.find((l) => l.code === code);
  if (found) return found.name;
  return code;
}
export type Promotion = {
  participationAdvice?: string;
  verification?: "full" | "snippet";
  evidence?: string;
  subtasks?: { id: string; title: string; done: boolean }[];
  article?: { title: string; body: string; channel: string; assetNames: string[] };
  id: string; productId: string; kind: "brief" | "opportunity" | "action" | "review";
  title: string; body: string; reason: string; channel: string; url: string;
  sourceTitle: string; checkedAt: string; expiresAt: string; date: string;
  minutes: number; status: "suggested" | "saved" | "planned" | "done" | "dismissed";
  feedback: string; updatedAt: string;
};
export type AnalyticsReportMetrics = {
  impressions?: number;
  pageViews?: number;
  downloads?: number;
  redownloads?: number;
  conversionRate?: string;
  revenue?: number;
  currency?: string;
};

export type AnalyticsReport = {
  id: string;
  productId?: string; // 所属产品ID，为空字符串或未定义时表示全产品综合报告
  title: string;
  summary: string;
  content: string; // Markdown 格式
  period?: string; // 分析时间范围，如 "近30天 (2026-10-08 ~ 2026-11-06)"
  metricsSummary?: AnalyticsReportMetrics;
  tags?: string[];
  isRead?: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt?: string;
};

export type JournalEntry = {
  id: string;
  date: string;
  createdAt: string;
} & (
  | { kind: "note"; text: string }
  | { kind: "draft"; title: string; platform: string; body: string; updatedAt: string }
);

export type BriefingFramework = {
  productId?: string;
  focusQuestions: string[];
  competitors: string[];
  platforms: string[];
  keywords: string[];
  insufficientFacts?: string;
};

export type BriefingPlatformSummary = {
  platform: string;
  query: string;
  openedCount: number;
  restrictions?: string;
};

export type Briefing = {
  id: string;
  date: string; // YYYY-MM-DD
  timezone: string; // Asia/Shanghai
  runAt: string; // ISO
  budget: string; // e.g. "15分钟"
  frameworks: BriefingFramework[];
  platformSummaries: BriefingPlatformSummary[];
  itemIds: string[];
  status: "completed" | "empty";
  note?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BriefingItemCategory =
  | "platform_change"
  | "competitor_move"
  | "user_voice"
  | "followup_lead"
  | "industry_trend"
  | "growth_inspiration";
export type BriefingItemVerification = "full" | "snippet" | "unreachable";
export type BriefingItemStatus = "new" | "saved" | "dismissed";

export type BriefingRelatedSource = {
  title: string;
  url: string;
  platform: string;
};

export type BriefingItem = {
  id: string;
  briefingId: string;
  productId?: string;
  category: BriefingItemCategory;
  title: string;
  summary: string;
  relevance: string;
  platform: string;
  url: string;
  publishedAt: string;
  checkedAt: string;
  verification: BriefingItemVerification;
  status: BriefingItemStatus;
  savedReason?: string;
  savedAt?: string;
  isRead?: boolean;
  readAt?: string;
  // Phase 3: Cross-platform event clustering
  clusterId?: string;
  relatedSources?: BriefingRelatedSource[];
  // Phase 4: Actionability bridge tracking
  linkedDocId?: string;
  linkedTaskId?: string;
  linkedContentId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type BriefingSearchConfig = {
  id: string;
  name: string;
  productId?: string;
  weight: number; // 权重（1~5，默认 3）
  category?: BriefingItemCategory | "all";
  focusQuestions?: string[];
  keywords?: string[];
  platforms?: string[];
  competitors?: string[];
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Data = {
  developmentJournal?: JournalEntry[];
  promotions?: Promotion[];
  products: Product[];
  docs: Doc[];
  docFolders: DocFolder[];
  assets: Asset[];
  assetFolders: AssetFolder[];
  releases: Release[];
  contents: Content[];
  contentGroups?: ContentGroup[];
  analyticsReports?: AnalyticsReport[];
  tasks: Task[];
  briefings?: Briefing[];
  briefingItems?: BriefingItem[];
  briefingSearchConfigs?: BriefingSearchConfig[];
  socialAnalytics?: {
    accounts: SocialAccount[];
  };
};
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const today = () => new Date().toLocaleDateString("sv-SE");
