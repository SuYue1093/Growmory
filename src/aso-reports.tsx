import { useEffect, useState, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Sparkles,
  Copy,
  Download,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Clock,
  Layers,
  Check,
  X,
  Eye,
  EyeOff,
  RotateCw,
  List,
  TrendingUp,
  AlertCircle,
  CheckSquare,
  Quote,
  CheckCircle2,
  Smartphone,
  Monitor,
  Image as ImageIcon,
  Palette,
  Layout,
  FlaskConical,
} from 'lucide-react';
import { useI18n } from './i18n';
import { buildAsoMediaPrompt } from './aso-media-prompt';
import type { Product, Task, ReportTaskAnchor } from './types';
import { uid, today } from './types';
import type { AsoFields, AsoMediaPlan } from './aso-types';
import screenshotProfiles from '../server/aso-screenshot-profiles.json';
import { TaskDetailModal } from './task-detail-modal';
import { captureReportTaskAnchors, reportTaskHighlights } from './trends/report-task-anchors';

export type AsoReportPlan = {
  platform?: string;
  title: string;
  objective?: string;
  market?: string;
  analysis?: string;
  target: { versionId: string; infoId: string; locale: string; platform?: string };
  before?: Partial<AsoFields>;
  fields: AsoFields;
};

export type AsoReport = {
  id: string;
  productId?: string;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
  isRead?: boolean;
  readAt?: string;
  plans: AsoReportPlan[];
  mediaPlans?: AsoMediaPlan[];
};

export type SummaryBlocks = {
  overview: string;
  conclusions: string;
  recommendations: string;
};

const ASO_FIELD_LIMITS: Record<keyof AsoFields, number> = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  description: 4000,
  promotionalText: 170,
};

const LOCALE_NAMES: Record<string, { zh: string; en: string }> = {
  'zh-Hans': { zh: '简体中文', en: 'Simplified Chinese' },
  'zh-Hant': { zh: '繁体中文', en: 'Traditional Chinese' },
  'en-US': { zh: '英语（美国）', en: 'English (US)' },
  'en-GB': { zh: '英语（英国）', en: 'English (UK)' },
  'en-AU': { zh: '英语（澳大利亚）', en: 'English (AU)' },
  'en-CA': { zh: '英语（加拿大）', en: 'English (CA)' },
  ja: { zh: '日语', en: 'Japanese' },
  ko: { zh: '韩语', en: 'Korean' },
  'fr-FR': { zh: '法语', en: 'French (FR)' },
  'de-DE': { zh: '德语', en: 'German (DE)' },
  'es-ES': { zh: '西班牙语', en: 'Spanish (ES)' },
  'es-MX': { zh: '西班牙语（墨西哥）', en: 'Spanish (MX)' },
  it: { zh: '意大利语', en: 'Italian' },
  'pt-BR': { zh: '葡萄牙语（巴西）', en: 'Portuguese (BR)' },
  ru: { zh: '俄语', en: 'Russian' },
};

function getLocaleLabel(locale: string, lang: 'zh' | 'en' = 'zh'): string {
  const item = LOCALE_NAMES[locale];
  if (item) {
    return `${lang === 'en' ? item.en : item.zh} (${locale})`;
  }
  return locale;
}

function getPlanPlatform(plan: AsoReportPlan, product?: Product): string {
  if (plan.platform) return plan.platform.toUpperCase();
  if (plan.target?.platform) return plan.target.platform.toUpperCase();
  if (product?.appStore?.versions) {
    const v = product.appStore.versions.find(ver => ver.id === plan.target?.versionId);
    if (v?.platform) return v.platform.toUpperCase();
  }
  return (product?.platform || 'IOS').toUpperCase();
}

function getPlatformLabel(platform: string, t: (zh: string, en: string) => string): string {
  const p = platform.toUpperCase();
  if (p === 'IOS') return t('iOS / iPadOS', 'iOS / iPadOS');
  if (p === 'MAC_OS') return t('macOS', 'macOS');
  if (p === 'VISION_OS') return t('visionOS', 'visionOS');
  if (p === 'TV_OS') return t('tvOS', 'tvOS');
  return p;
}

function getPlatformIcon(platform: string) {
  const p = platform.toUpperCase();
  if (p === 'MAC_OS') return <Monitor size={15} />;
  return <Smartphone size={15} />;
}

function getHeadingText(children: any): string {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getHeadingText).join('');
  if (children.props && children.props.children) return getHeadingText(children.props.children);
  return '';
}

function slugifyHeading(text: string): string {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `sec-${clean || 'heading'}`;
}

type TocItem = {
  id: string;
  text: string;
  level: number;
};

function extractTocFromMarkdown(markdown: string): TocItem[] {
  const lines = markdown.split('\n');
  const items: TocItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const rawText = match[2].trim();
      const cleanText = rawText.replace(/[*`_#]/g, '').trim();
      if (cleanText) {
        items.push({
          id: slugifyHeading(cleanText),
          text: cleanText,
          level,
        });
      }
    }
  }
  return items;
}

function parseSummaryBlocks(summary?: string): SummaryBlocks | null {
  if (!summary) return null;
  const s = summary.trim();
  if (!s) return null;

  let overview = '';
  let conclusions = '';
  let recommendations = '';

  // 1. 匹配“核心诊断结论 / 核心断点 / 核心结论 / Key Findings”整行标题（整行消费，防止截断遗留前半截标题如“核心”）
  const conclusionRegex = /(?:^|\n)[ \t]*(?:#{1,4}\s*|\*{1,2})?(?:核心(?:诊断)?结论|核心断点(?:与流失归因)?|核心发现|主要结论|诊断结论|Key Findings|Key Conclusions|Conclusions)[^\n]*/i;
  // 2. 匹配“ASO 增长与落地优化建议 / ASO 落地建议 / 优化建议 / 行动建议”整行标题（整行消费，防止截断遗留前半截标题如“ASO”）
  const recRegex = /(?:^|\n)[ \t]*(?:#{1,4}\s*|\*{1,2})?(?:ASO\s*(?:增长与)?(?:落地)?优化建议|ASO\s*落地建议|ASO\s*建议|增长建议|行动建议|主要建议|落地建议|优化建议|建议|Action Items|Recommendations|Actionable Recommendations)[^\n]*/i;

  const conclusionMatch = s.match(conclusionRegex);
  const recMatch = s.match(recRegex);

  const conclusionIdx = conclusionMatch && typeof conclusionMatch.index === 'number' ? conclusionMatch.index : -1;
  const recIdx = recMatch && typeof recMatch.index === 'number' ? recMatch.index : -1;

  if (conclusionIdx !== -1 && recIdx !== -1 && recIdx > conclusionIdx && conclusionMatch && recMatch) {
    overview = s.slice(0, conclusionIdx).trim();
    conclusions = s.slice(conclusionIdx + conclusionMatch[0].length, recIdx).trim();
    recommendations = s.slice(recIdx + recMatch[0].length).trim();
  } else if (conclusionIdx !== -1 && conclusionMatch) {
    overview = s.slice(0, conclusionIdx).trim();
    conclusions = s.slice(conclusionIdx + conclusionMatch[0].length).trim();
  } else if (recIdx !== -1 && recMatch) {
    overview = s.slice(0, recIdx).trim();
    recommendations = s.slice(recIdx + recMatch[0].length).trim();
  } else {
    overview = s;
  }

  // 清除 overview 开头冗余的“阶段表现总览 / 执行摘要”等大标题行
  overview = overview.replace(/^(?:[ \t]*(?:#{1,4}\s*|\*{1,2})?(?:阶段表现(?:与诊断)?总览|阶段表现总览|执行摘要|Overview|Summary)[^\n]*\n*)/i, '').trim();

  const formatList = (text: string) => {
    if (!text) return '';
    let t = text;
    t = t.replace(/(^|[。；;\n])\s*([0-9]{1,2}[、])\s*/g, '$1\n- **$2** ');
    t = t.replace(/(^|[。；;\n])\s*([0-9]{1,2}\.(?!\d))\s*/g, '$1\n- **$2** ');
    t = t.replace(/(^|[。；;\n])\s*(P[0-2])[｜|:：\s]\s*/gi, '$1\n- **$2：** ');
    return t
      .split('\n')
      .map(line => line.replace(/^[。；;]\s*/, '').trim())
      .filter(Boolean)
      .join('\n\n');
  };

  const parsedOverview = formatList(overview);
  const parsedConclusions = formatList(conclusions);
  const parsedRecommendations = formatList(recommendations);

  if (!parsedOverview && !parsedConclusions && !parsedRecommendations) return null;

  return {
    overview: parsedOverview,
    conclusions: parsedConclusions,
    recommendations: parsedRecommendations,
  };
}

function getTaskQuoteVariants(quote: string): string[] {
  const q = quote.trim();
  if (!q) return [];
  const set = new Set<string>();

  const addVariant = (str: string) => {
    const s = str.trim();
    if (!s || s.length < 2) return;
    set.add(s);
    if (s.includes(':')) set.add(s.replace(/:\s*/g, '：'));
    if (s.includes('：')) set.add(s.replace(/：\s*/g, ': '));
    set.add(s.replace(/\s*([：:])\s*/g, '$1'));
    if (s.includes('(')) set.add(s.replace(/\(/g, '（').replace(/\)/g, '）'));
    if (s.includes('（')) set.add(s.replace(/（/g, '(').replace(/）/g, ')'));
    const singleSpaced = s.replace(/[\s\u00A0\r\n]+/g, ' ');
    if (singleSpaced !== s) set.add(singleSpaced);
    const noBreak = s.replace(/[\r\n]+/g, '');
    if (noBreak !== s) set.add(noBreak);
    const strippedBrackets = s.replace(/^[\[\(（【]|[\]\)）】]$/g, '').trim();
    if (strippedBrackets && strippedBrackets.length >= 2) set.add(strippedBrackets);
  };

  addVariant(q);
  const strippedMarkdown = q.replace(/[*`_#~]/g, '').trim();
  if (strippedMarkdown && strippedMarkdown !== q) addVariant(strippedMarkdown);

  const basePool = Array.from(set);
  for (const item of basePool) {
    const strippedPrefix = item.replace(/^(?:(?:[#*_\s]*)(?:P[0-2]|\d{1,2}|[一二三四五六七八九十]|[(（]?\d{1,2}[)）]|[①②③④⑤⑥⑦⑧⑨⑩])[：:、.)）\]\s]+|[-*•]\s*)/i, '').trim();
    if (strippedPrefix && strippedPrefix.length >= 2) addVariant(strippedPrefix);

    const strippedPunctuation = item.replace(/^[，。；;、,.\s!?！？|]+|[，。；;、,.\s!?！？|]+$/g, '').trim();
    if (strippedPunctuation && strippedPunctuation.length >= 2) addVariant(strippedPunctuation);

    const colonIdx = item.search(/[：:]/);
    if (colonIdx > 0) {
      const beforeColon = item.slice(0, colonIdx).trim();
      const afterColonWith = item.slice(colonIdx).trim();
      const afterColonPure = item.slice(colonIdx + 1).trim();
      if (beforeColon.length >= 2) addVariant(beforeColon);
      if (afterColonWith.length >= 2) addVariant(afterColonWith);
      if (afterColonPure.length >= 2) addVariant(afterColonPure);
    }
  }

  return Array.from(set).filter(s => s.length >= 2).sort((a, b) => b.length - a.length);
}

function ProductIcon({ product, size = 36 }: { product?: Product; size?: number }) {
  if (!product) {
    return (
      <span
        className="app-icon-badge all-products"
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      >
        <Layers size={Math.round(size * 0.52)} />
      </span>
    );
  }

  if (product.icon) {
    return (
      <img
        className="app-icon-img"
        src={product.icon}
        alt=""
        style={{ width: size, height: size, minWidth: size, minHeight: size }}
      />
    );
  }

  return (
    <span
      className={`app-icon-badge ${product.color || 'blue'}`}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
    >
      {product.name?.slice(0, 1) || 'A'}
    </span>
  );
}

export function AsoReports({
  product,
  products = [],
  notify,
  tasks = [],
  onSaveTask,
  onDeleteTask,
  onNavigateTasks,
  onSelectTab,
}: {
  product: Product;
  products?: Product[];
  notify?: (message: string) => void;
  tasks?: Task[];
  onSaveTask?: (task: Task) => Promise<void> | void;
  onDeleteTask?: (id: string) => Promise<void> | void;
  onNavigateTasks?: () => void;
  onSelectTab?: (tab: 'copy' | 'media' | 'analysis') => void;
}) {
  const { lang, t } = useI18n();
  const [reports, setReports] = useState<AsoReport[]>([]);
  const [selected, setSelected] = useState<AsoReport | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [applied, setApplied] = useState<string[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [mediaDevices, setMediaDevices] = useState<string[] | null>(null);
  const [mediaDirection, setMediaDirection] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeTocId, setActiveTocId] = useState<string>('');

  // 文案优化方案 Tab 状态
  const [selectedCopyPlatform, setSelectedCopyPlatform] = useState<string>('');
  const [selectedCopyLocale, setSelectedCopyLocale] = useState<string>('');

  // 图片优化方案 Tab 状态
  const [selectedMediaPlatform, setSelectedMediaPlatform] = useState<string>('');
  const [selectedMediaLocale, setSelectedMediaLocale] = useState<string>('');

  // 划选创建待办状态
  const [selectionToolbar, setSelectionToolbar] = useState<{
    text: string;
    anchors: ReportTaskAnchor[];
    top: number;
    left: number;
  } | null>(null);

  const [createTaskModal, setCreateTaskModal] = useState<{
    quote: string;
    anchors: ReportTaskAnchor[];
    title: string;
    note: string;
    productId: string;
    date: string;
  } | null>(null);

  const [isGeneratingAiTask, setIsGeneratingAiTask] = useState(false);
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  const readerContentRef = useRef<HTMLDivElement>(null);
  const isManualScrollRef = useRef(false);
  const manualScrollTimerRef = useRef<number | null>(null);

  const base = `/api/app-store-connect/aso/${encodeURIComponent(product.id)}`;
  const productArgs = JSON.stringify({ productId: product.id, days: 30 });
  const contextArgs = JSON.stringify({ productId: product.id, workflow: 'report' });
  const mediaArgs = JSON.stringify({ productId: product.id, includeImages: true });

  const prompt = useMemo(() => {
    if (lang === 'en') {
      return `You are a senior mobile app growth and App Store ASO specialist. Please connect to Growmory local MCP service, conduct a comprehensive, multi-dimensional diagnostic of acquisition, funnel conversion, and copy/creatives for product "${product.name}" (productId: "${product.id}"), and call save_aso_report to save a professional diagnostic report with actionable copy recommendations and visual creative plans.

[Multi-Dimensional Context & Data Analysis Workflow]
1. [Verified Product Facts & Scope Verification]
   - Call get_aso_context with ${contextArgs} to check verified product facts (docs), confirmed capabilities, versions, active locales, existing store copy, and storefront distribution (marketCoverage).
   - Anchor keyword and value propositions strictly to proven product capabilities without inventing unreleased features.
2. [Conversion Funnel & Analytics Diagnosis]
   - Call get_analytics_context with ${productArgs} to review the past 30 days metrics:
     - Impressions & Product Page Views
     - First-time Downloads & Redownloads
     - Stage conversion rates: Impression -> View, View -> Download, and Overall Conversion
     - Acquisition channels breakdown: App Store Search, App Store Browse/Featuring, and Referrers
     - Core territories distribution & commercialization revenue (Sales & Proceeds)
     - Growth bottleneck diagnosis: clearly determine whether the primary leak is Low Impressions (Visibility), Drop from Impression to Page View (First fold appeal), or Drop from Page View to Download (Conversion persuasion).
3. [Visual Creatives & Presentation Diagnosis]
   - Call get_aso_media with ${mediaArgs} to inspect App Icon, Header Banner, screenshots (1st/2nd/3rd), and App Preview video posters for target versions and locales.
   - Evaluate visual hierarchy: does screenshot #1 communicate the #1 core value within 3 seconds? Is callout typography legible on mobile devices?
4. [Market Evidence & Competitor Strategy]
   - For created locales, select representative storefronts (e.g. US for en-US, CN for zh-Hans, JP for ja, etc.) and call research_aso_markets to verify search results, candidate keywords, and auto-complete hints.
   - Compare 3-5 direct competitors on title/subtitle differentiation and rating sentiment.
5. [Marketing & Social Voice-of-Customer Alignment]
   - Integrate authentic user search habits, pain points, and praise points from marketing and social channels into ASO copy and screenshot headlines.

[Deliverable & Report Backfill]
Call save_aso_report with:
- productId: "${product.id}"
- title: "${product.name} App Store Acquisition & ASO Diagnostic Report"
- summary: 200-300 words structured executive summary using standard headers:
  ### Overview
  ### Key Conclusions (Identified Bottlenecks)
  ### Action Recommendations (Prioritized P0/P1/P2)
- content: Complete Markdown report body with:
  ## 1. Executive Summary & Funnel Drop-off Analysis (with Markdown conversion table)
  ## 2. Acquisition Channels & Regional Breakdown
  ## 3. Store Creatives & Visual Presentation Diagnosis
  ## 4. Keyword Metadata Strategy & Redundancy Audit
  ## 5. Voice of Customer & Cross-Channel Synergy
  ## 6. Actionable Roadmap & A/B Validation Plan
- plans: Array of actionable copy recommendations for created locales (one plan per target version & locale):
  - title: e.g. "Primary Search Keywords & High-Converting Subtitle · ${product.name}"
  - platform: "IOS" or "MAC_OS"
  - objective: specific optimization goal
  - market: two-letter uppercase storefront code (e.g. "US", "CN")
  - analysis: in-depth rationale, user intent, competitor differentiation, and budget utilization
  - target: { versionId, infoId, locale, platform }
  - before: original 5 copy fields from snapshot
  - fields: recommended 5 fields adhering strictly to Apple App Store Connect character limits:
    * CRITICAL CHINESE/CJK CHARACTER COUNT RULE: App Store Connect character counts strictly follow Unicode characters (str.length), NOT UTF-8 bytes and NOT tokens! 1 Chinese/CJK character = 1 character (NOT 2 or 3 bytes). 1 half-width comma (",") = 1 character. 100 characters means up to 100 full Chinese characters! Never miscalculate 100 characters as bytes (~33 Chinese characters) or stop prematurely at 20-30 Chinese characters. Maximize the keyword budget to 90-100 characters!
    * name: <= 30 chars (up to 30 full Chinese characters). Category positioning with brand
    * subtitle: <= 30 chars (up to 30 full Chinese characters). Differentiated value hook, zero duplicate terms with name
    * keywords: <= 100 chars (up to 100 full Chinese characters and half-width commas). Separated by half-width commas without spaces; exclude words already in name/subtitle; maximize keyword budget to 90-100 characters
    * description: <= 4000 chars (up to 4000 full Chinese characters, first 3 lines delivering primary value hook)
    * promotionalText: <= 170 chars (up to 170 full Chinese characters)
- mediaPlans: Array of structured screenshot and creative recommendations:
  - title: e.g. "iPhone Core Hook & Screenshot Sequence Blueprint"
  - platform: "IOS" or "MAC_OS"
  - locale: locale code (e.g. "en-US", "zh-Hans")
  - overview: overall visual art direction, typography scale, and background hierarchy
  - testingHypothesis: PPO (Product Page Optimization) A/B test hypothesis
  - items: array of asset breakdown objects:
    * order: 1, 2, 3...
    * type: "APP_SCREENSHOT", "APP_ICON", or "PRODUCT_PAGE_HEADER_ASSET"
    * title: placement name (e.g. "Screenshot #1 - Hook & Value Proposition")
    * caption: primary headline text on the image
    * subcaption: secondary selling point description
    * visualConcept: composition, UI mockup highlight, framing and color contrast
    * rationale: conversion psychology and why this retains drop-off users`;
    }

    return `你是资深移动应用增长与 App Store ASO 专家。请连接 Growmory 本地 MCP 服务，为产品「${product.name}」（productId: "${product.id}"）执行一次全方位、多维度数据综合复盘与专业 ASO 诊断优化，并调用 save_aso_report 保存诊断报告、落地文案优化方案及图片优化方案。

【综合数据源获取与分析链路（多维度交叉核验）】
1. 【产品事实与知识库核验】
   - 调用 get_aso_context (参数: ${contextArgs})，获取已确认产品事实、核心能力边界、已上线与在研版本、已创建语言列表（localizations）及 Apple 商店分发覆盖范围（marketCoverage）。
   - 提取产品真实解决的用户问题与差异化卖点。严禁脱离事实编造未上线功能或虚假承诺。
2. 【全链路转化漏斗与宏观指标诊断】
   - 调用 get_analytics_context (参数: ${productArgs})，深入分析近 30 天核心获客与商业化数据：
     - 展示次数 (Impressions) 与 查看次数 (Product Page Views)
     - 首次下载 (First-time Downloads) 与 重新下载 (Redownloads)
     - 展示➔查看转化率、查看➔下载转化率与全链总转化率
     - 获客渠道构成：App Store 搜索 (Search)、App Store 浏览/推荐 (Browse/Featuring)、外部引荐 (Referrers) 的占比与量级
     - 核心国家/地区 (Territories) 的下载与渗透分布
     - 商业化收入 (Sales & Proceeds)
     - 关键诊断断点：判断当前最大的增长阻碍是「展现不足（搜索可见度低）」、「首屏吸引力不足（展示➔查看流失）」还是「落地页说服力不足（查看➔下载流失）」。
3. 【视觉素材与首屏转化评估】
   - 调用 get_aso_media (参数: ${mediaArgs})，查看目标版本各语言的实际商店素材：应用图标 (Icon)、标题图 (Header Banner)、前 3 张关键竖屏/横屏截图 (Screenshots) 及 App 预览视频封面。
   - 评估首屏第 1 张截图是否在 3 秒内传递了 #1 核心用户价值；文案大字是否在手机小屏幕上清晰易读；视觉风格与目标受众是否匹配。
4. 【公开市场证据与竞品搜索攻防】
   - 针对已创建的本地化语言选取代表性 storefront（如 zh-Hans 对应 CN，en-US 对应 US，ja 对应 JP 等），调用 research_aso_markets 查询核心品类词、任务词、场景词的真实搜索结果与下拉联想词。
   - 结合公开竞品表现，对比 3~5 款头部直接竞品的标题定位、副标题差异化与评价口碑分布。
5. 【自媒体声量与用户真实痛点心智结合】
   - 查阅小红书、Reddit 或运营发布内容中真实用户的搜索词习惯、高频痛点与好评点，将用户的真实表达（Voice of Customer）反哺进 ASO 文案与截图主副标。

【产出与回填要求】
调用 MCP 工具 save_aso_report 保存报告：
- productId: "${product.id}"
- title: "${product.name} App Store 获客转化与 ASO 深度诊断报告"
- summary: 200~300 字结构化核心执行摘要。使用清晰 Markdown 换行并用粗体标出关键数字。格式必须包含：
  - ### 阶段表现总览
  - ### 核心诊断结论（明确流失断点）
  - ### ASO 落地建议（P0/P1/P2 行动优先级）
- content: 完整的 Markdown 专业正文排版，结构包含：
  ## 1. 执行摘要与转化链路断点诊断 (Funnel Drop-off Analysis)
  包含标准 Markdown 漏斗对比表格（展示次数 ➔ 查看次数 ➔ 首次下载 ➔ 转化率评估），明确指出流失最大环节。
  ## 2. 获客渠道格局与地域渗透分析 (Acquisition Channels & Territories)
  剖析搜索占比、浏览占比、主打国家表现与潜在拓展市场。
  ## 3. 视觉素材表现与首屏流失归因 (Visual Creatives & Screenshot Diagnosis)
  针对图标、搜索结果图、第 1~3 张截图与视频封面，提出具象化优化建议。
  ## 4. 关键词元数据攻防与搜索覆盖 (Keywords & Metadata Strategy)
  分析现有名称、副标题、关键词的覆盖面、去重漏洞、竞品词攻防策略与长尾机会。
  ## 5. 跨维度用户心智与营销协同 (VOC & Marketing Alignment)
  结合自媒体与用户口碑，提炼高转化营销买点。
  ## 6. A/B 测试验证计划与后续跟进建议 (Testing & Validation Roadmap)
- plans: 针对目标版本各平台与已创建语言提供可直接落地的优化建议方案。每个目标版本及语言 1 条：
  - title: 方案标题（如 "主推搜索词与高转化副标题优化 · zh-Hans"）
  - platform: "IOS" 或 "MAC_OS"
  - objective: 具体优化目标（如 "提升核心任务词搜索排名，增强查看➔下载转化率"）
  - market: 两位大写代表市场代码（如 "CN"）
  - analysis: 方案深度依据与选词逻辑说明（详述选词意图、竞品差异、去重取舍与字符预算使用）
  - target: { versionId, infoId, locale, platform }
  - before: 目标版本的原始 5 项文案（name, subtitle, keywords, description, promotionalText）
  - fields: 优化后的 5 项完整建议稿（必须严格遵守 Apple App Store Connect 字符上限与中文字符计算标准）：
    【⚠️ 极重要：中文字符数判定铁律与配额充分利用规则，严禁误判】：
    很多 AI 助手对中文字符数有严重误解（常错误地按 UTF-8 字节数或 Token 计算），在此特别严正强调：
    1. 【1 个汉字 = 1 个字符】：App Store Connect 的字符计数规则与 JavaScript 的 str.length 完全一致。1 个汉字计 1 个字符，1 个英文半角逗号「,」计 1 个字符。绝不是 1 个汉字占 2 或 3 个字符/字节！
    2. 【100 个字符 = 实打实的 100 个中文字符】：包含作为分隔符的英文半角逗号「,」在内，keywords 字段总共可以且应当填满接近 100 个中文字符！
    3. 【严禁误以为汉字多占配额而只写二三十字】：以往常有 AI 误以为 100 字符只能写 30 个汉字，导致输出极其简短，白白浪费 70% 的流量入口。作为资深 ASO 增长专家，你必须极其充分地利用这 100 个字符的配额预算！
    4. 【配额预算目标】：生成的 keywords 总长度必须达到 90~100 个字符区间（通常可容纳 30~45 个以英文半角逗号分隔的高价值中文核心词、长尾词与场景词），严禁只填几十个字浪费预算！
    5. 各字段具体上限要求：
       * name: ≤ 30 字符（可写满 30 个汉字，1 汉字 = 1 字符）。格式通常为「品牌名 - 核心品类定位词」
       * subtitle: ≤ 30 字符（可写满 30 个汉字，1 汉字 = 1 字符）。提炼核心差异化价值，与名称中已有的字词绝对不重复
       * keywords: ≤ 100 字符（可写满 100 个汉字与半角逗号！1 汉字 = 1 字符，半角逗号「,」= 1 字符）。英文半角逗号分隔且逗号两旁绝无空格；必须剔除名称和副标题中已覆盖的字词（避免权重重复浪费）；必须将总字数写到 90~100 字符满额区间！
       * description: ≤ 4000 字符（可写满 4000 个汉字）。前三行黄金视区直击用户痛点与核心利益，正文排版清晰、场景明确
       * promotionalText: ≤ 170 字符（可写满 170 个汉字）。聚焦近期主推亮点或更新动态
- mediaPlans: 针对目标版本各平台与语言的结构化图片/截图优化方案：
  - title: 方案标题（如 "iPhone 核心卖点首屏图与高转化截图序列"）
  - platform: "IOS" 或 "MAC_OS"
  - locale: 语言代码（如 "zh-Hans"）
  - overview: 视觉风格规范、版式大字比例与背景层级规划
  - testingHypothesis: PPO (Product Page Optimization) A/B 测试核心假设
  - items: 各张素材具体设计方案：
    * order: 序号 (1, 2, 3...)
    * type: "APP_SCREENSHOT" / "APP_ICON" / "PRODUCT_PAGE_HEADER_ASSET"
    * title: 素材位名称（如 "第1张首屏Hook图"）
    * caption: 画面主标题大字文案（字数精炼、直击痛点）
    * subcaption: 画面辅助说明与卖点文案
    * visualConcept: 视觉构图呈现建议（界面特写、高光呼应、高对比度）
    * rationale: 转化设计理由与流失归因解释`;
  }, [lang, product.id, product.name, productArgs, contextArgs, mediaArgs]);

  async function request<T>(action: string, body = {}, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`${base}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result;
  }

  async function run(label: string, action: () => Promise<void>) {
    setError('');
    if (label) setBusy(label);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (label) setBusy('');
    }
  }

  const loadReports = async (signal?: AbortSignal) => {
    if (!product.appStore?.appId) return;
    setBusy(t('正在读取 ASO 报告…', 'Loading ASO reports…'));
    try {
      const data = await request<AsoReport[]>('reports', {}, signal);
      setReports(data || []);
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      if (!signal?.aborted) setBusy('');
    }
  };

  useEffect(() => {
    if (!product.appStore?.appId) return;
    const controller = new AbortController();
    void loadReports(controller.signal);
    return () => controller.abort();
  }, [base, product.appStore?.appId]);

  const unreadCount = useMemo(() => reports.filter(r => !r.isRead).length, [reports]);

  // 打开报告并自动标记已读
  const openReport = async (report: AsoReport) => {
    setSelected(report);
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (!report.isRead) {
      const updated: AsoReport = {
        ...report,
        isRead: true,
        readAt: new Date().toISOString(),
      };
      setSelected(updated);
      setReports(prev => prev.map(r => (r.id === report.id ? updated : r)));
      try {
        await request('toggle-read', { reportId: report.id, isRead: true });
      } catch (err) {
        console.warn('Failed to mark ASO report as read on server:', err);
      }
    }
  };

  // 手动切换已读未读
  const toggleReportRead = async (report: AsoReport) => {
    const nextRead = !report.isRead;
    const updated: AsoReport = {
      ...report,
      isRead: nextRead,
      readAt: nextRead ? new Date().toISOString() : undefined,
    };
    if (selected && selected.id === report.id) {
      setSelected(updated);
    }
    setReports(prev => prev.map(r => (r.id === report.id ? updated : r)));
    try {
      await request('toggle-read', { reportId: report.id, isRead: nextRead });
      notify?.(nextRead ? t('已标为已读', 'Marked as read') : t('已标为未读', 'Marked as unread'));
    } catch (err) {
      console.warn('Failed to toggle read status:', err);
    }
  };

  // 删除报告
  const deleteReport = async (reportId: string, title: string) => {
    if (!confirm(t(`确定要删除 ASO 分析报告「${title}」吗？`, `Delete ASO report "${title}"?`))) {
      return;
    }
    await run(t('正在删除报告…', 'Deleting report…'), async () => {
      await request('delete-report', { reportId });
      setReports(prev => prev.filter(r => r.id !== reportId));
      if (selected?.id === reportId) {
        setSelected(null);
      }
      notify?.(t('ASO 分析报告已删除', 'ASO report deleted'));
    });
  };

  // 提取 Markdown 目录导航
  const tocList = useMemo(() => {
    if (!selected?.content) return [];
    const list = extractTocFromMarkdown(selected.content);
    if (selected.plans && selected.plans.length > 0) {
      list.push({
        id: 'sec-aso-copy-plans',
        text: t('文案优化方案', 'Copy Recommendations'),
        level: 2,
      });
    }
    list.push({
      id: 'sec-aso-media-plans',
      text: t('图片优化方案', 'Media Recommendations'),
      level: 2,
    });
    return list;
  }, [selected, t]);

  // 平滑滚动定位到指定章节
  const scrollToHeading = (headingId: string) => {
    const el = document.getElementById(headingId);
    if (!el) return;
    isManualScrollRef.current = true;
    setActiveTocId(headingId);
    const topOffset = -80;
    const y = el.getBoundingClientRect().top + window.pageYOffset + topOffset;
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    if (manualScrollTimerRef.current) window.clearTimeout(manualScrollTimerRef.current);
    manualScrollTimerRef.current = window.setTimeout(() => {
      isManualScrollRef.current = false;
    }, 600);
  };

  // 进入详情时自动定位顶部及目录首项
  useEffect(() => {
    if (selected) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (tocList.length > 0) {
        setActiveTocId(tocList[0].id);
      }
    }
  }, [selected]);

  // 滚动监听高亮当前阅读章节 (Scroll-Spy)
  useEffect(() => {
    if (!selected || tocList.length === 0) return;

    let ticking = false;
    const handleScroll = () => {
      if (isManualScrollRef.current) return;
      if (ticking) return;
      ticking = true;

      window.requestAnimationFrame(() => {
        ticking = false;
        if (isManualScrollRef.current) return;

        const headingElements = tocList
          .map(item => ({ id: item.id, el: document.getElementById(item.id) }))
          .filter((item): item is { id: string; el: HTMLElement } => item.el !== null);

        if (headingElements.length === 0) return;

        const scrollThreshold = 140;
        let currentId = headingElements[0].id;

        for (const item of headingElements) {
          const rect = item.el.getBoundingClientRect();
          if (rect.top <= scrollThreshold) {
            currentId = item.id;
          } else {
            break;
          }
        }

        setActiveTocId(prev => {
          if (prev !== currentId) {
            const tocBtn = document.querySelector(`[data-toc-id="${currentId}"]`);
            if (tocBtn) {
              tocBtn.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
            return currentId;
          }
          return prev;
        });
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (manualScrollTimerRef.current) window.clearTimeout(manualScrollTimerRef.current);
    };
  }, [selected, tocList]);

  // 与当前报告关联的待办
  const reportTasks = useMemo(() => {
    if (!selected) return [];
    const strippedContent = selected.content?.replace(/[*`_#~]/g, '') || '';
    const strippedSummary = selected.summary?.replace(/[*`_#~]/g, '') || '';
    return (tasks || []).filter(task => {
      if (!task.quote || !task.quote.trim()) return false;
      if (task.reportId) return task.reportId === selected.id;
      const variants = getTaskQuoteVariants(task.quote);
      return variants.some(v => (
        selected.content?.includes(v) ||
        selected.summary?.includes(v) ||
        strippedContent.includes(v) ||
        strippedSummary.includes(v)
      ));
    });
  }, [tasks, selected]);

  const highlightPlugins = useMemo(() => ({
    overview: reportTaskHighlights('overview', reportTasks),
    conclusions: reportTaskHighlights('conclusions', reportTasks),
    recommendations: reportTaskHighlights('recommendations', reportTasks),
    body: reportTaskHighlights('body', reportTasks),
  }), [reportTasks]);

  // 划选文本生成待办
  const handleContentMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionToolbar(null);
        return;
      }
      const rawText = sel.toString();
      const text = rawText.trim();
      if (!text || !readerContentRef.current) {
        setSelectionToolbar(null);
        return;
      }
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      if (!readerContentRef.current.contains(anchorNode) || !readerContentRef.current.contains(focusNode)) {
        setSelectionToolbar(null);
        return;
      }
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          setSelectionToolbar(null);
          return;
        }
        const anchors = captureReportTaskAnchors(readerContentRef.current, range);
        if (!anchors.length) {
          setSelectionToolbar(null);
          return;
        }
        setSelectionToolbar({
          text,
          anchors,
          top: Math.max(12, Math.min(window.innerHeight - 50, rect.top - 8)),
          left: Math.max(80, Math.min(window.innerWidth - 80, rect.left + rect.width / 2)),
        });
      } catch {
        setSelectionToolbar(null);
      }
    }, 20);
  };

  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.report-selection-toolbar') || target?.closest('.report-modal-content')) {
        return;
      }
      setSelectionToolbar(null);
    };

    const handleGlobalScroll = () => {
      if (selectionToolbar) setSelectionToolbar(null);
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('scroll', handleGlobalScroll, { passive: true });
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('scroll', handleGlobalScroll);
    };
  }, [selectionToolbar]);

  // 触发 AI 提炼 20 字以内待办标题
  const triggerAiTaskGeneration = async (quoteText: string, prodId?: string, repTitle?: string) => {
    const raw = (quoteText || '').trim();
    if (!raw) return;
    setIsGeneratingAiTask(true);
    try {
      const targetProd = products.find(p => p.id === prodId) || product;
      const res = await fetch('/api/ai/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: raw,
          productName: targetProd?.name || '',
          reportTitle: repTitle || '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.configured && data.title) {
          const refinedTitle = [...data.title.trim()].slice(0, 20).join('');
          setCreateTaskModal(prev => {
            if (!prev) return null;
            return {
              ...prev,
              title: refinedTitle,
            };
          });
        }
      }
    } catch (err) {
      console.warn('AI generate task error:', err);
    } finally {
      setIsGeneratingAiTask(false);
    }
  };

  const markdownComponents = useMemo(() => {
    const tasksById = new Map(reportTasks.map(task => [task.id, task]));
    return {
      h1: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h1 id={id} className="reader-h1" {...props}>{children}</h1>;
      },
      h2: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h2 id={id} className="reader-h2" {...props}>{children}</h2>;
      },
      h3: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h3 id={id} className="reader-h3" {...props}>{children}</h3>;
      },
      h4: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h4 id={id} className="reader-h4" {...props}>{children}</h4>;
      },
      table: ({ children, node, ...props }: any) => {
        return <table className="reader-table" {...props}>{children}</table>;
      },
      span: ({ children, node, ...props }: any) => {
        const task = tasksById.get(props['data-report-task']);
        if (!task) return <span {...props}>{children}</span>;
        const title = task.done
          ? t(`[已完成待办] ${task.title}（点击查看详情）`, `[Completed Task] ${task.title} (Click to view)`)
          : t(`[待办事项] ${task.title}（点击查看详情）`, `[Task] ${task.title} (Click to view)`);
        return (
          <span
            {...props}
            data-quote={task.quote}
            className={`report-task-underline${task.done ? ' is-done' : ''}`}
            title={title}
            onClick={event => {
              event.stopPropagation();
              event.preventDefault();
              setViewingTask(task);
            }}
          >
            {children}
          </span>
        );
      },
    };
  }, [reportTasks, t]);

  // 文案方案多平台与多语言分组计算
  const copyPlatforms = useMemo(() => {
    if (!selected?.plans || selected.plans.length === 0) return [];
    return Array.from(new Set(selected.plans.map(p => getPlanPlatform(p, product))));
  }, [selected, product]);

  const activeCopyPlatform = selectedCopyPlatform || copyPlatforms[0] || 'IOS';

  const copyPlansForPlatform = useMemo(() => {
    if (!selected?.plans) return [];
    return selected.plans.filter(p => getPlanPlatform(p, product) === activeCopyPlatform);
  }, [selected, product, activeCopyPlatform]);

  const copyLocales = useMemo(() => {
    return Array.from(new Set(copyPlansForPlatform.map(p => p.target?.locale || 'zh-Hans')));
  }, [copyPlansForPlatform]);

  const activeCopyLocale = selectedCopyLocale && copyLocales.includes(selectedCopyLocale)
    ? selectedCopyLocale
    : copyLocales[0] || 'zh-Hans';

  const activeCopyPlan = useMemo(() => {
    return (
      copyPlansForPlatform.find(p => (p.target?.locale || 'zh-Hans') === activeCopyLocale) ||
      copyPlansForPlatform[0] ||
      null
    );
  }, [copyPlansForPlatform, activeCopyLocale]);

  // 图片方案多平台与多语言分组计算
  const mediaPlans = selected?.mediaPlans || [];

  const mediaPlatforms = useMemo(() => {
    if (mediaPlans.length === 0) return ['IOS'];
    return Array.from(new Set(mediaPlans.map(mp => (mp.platform || 'IOS').toUpperCase())));
  }, [mediaPlans]);

  const activeMediaPlatform = selectedMediaPlatform || mediaPlatforms[0] || 'IOS';

  const mediaPlansForPlatform = useMemo(() => {
    return mediaPlans.filter(mp => (mp.platform || 'IOS').toUpperCase() === activeMediaPlatform);
  }, [mediaPlans, activeMediaPlatform]);

  const mediaLocales = useMemo(() => {
    if (mediaPlansForPlatform.length === 0) return ['zh-Hans'];
    return Array.from(new Set(mediaPlansForPlatform.map(mp => mp.locale || 'zh-Hans')));
  }, [mediaPlansForPlatform]);

  const activeMediaLocale = selectedMediaLocale && mediaLocales.includes(selectedMediaLocale)
    ? selectedMediaLocale
    : mediaLocales[0] || 'zh-Hans';

  const activeMediaPlan = useMemo(() => {
    return (
      mediaPlansForPlatform.find(mp => (mp.locale || 'zh-Hans') === activeMediaLocale) ||
      mediaPlansForPlatform[0] ||
      null
    );
  }, [mediaPlansForPlatform, activeMediaLocale]);

  if (!product.appStore?.appId) {
    return (
      <div className="reports-clean-view">
        <section className="panel reports-empty-box">
          <FileText size={42} className="empty-icon" />
          <h4>{t('请先关联 App Store 产品', 'Connect an App Store product first')}</h4>
          <p>{t('在产品设置中配置 App Store App ID，即可使用 ASO 智能诊断与方案生成功能。', 'Set App Store App ID in product settings to unlock ASO diagnostics and recommendations.')}</p>
        </section>
      </div>
    );
  }

  // 拼接导出 Markdown（包含文案优化方案与图片优化方案）
  const markdownText = selected && [
    `# ${selected.title}`,
    selected.summary,
    selected.content,
    ...(selected.plans || []).map(plan => [
      `## 文案方案：${plan.title} · ${getPlanPlatform(plan, product)} · ${plan.target.locale}`,
      plan.objective ? `> **优化目标**：${plan.objective}` : '',
      plan.analysis ? `> **诊断依据**：${plan.analysis}` : '',
      `${t('目标版本 ID', 'Target version ID')}：${plan.target.versionId}`,
      ...Object.entries(plan.fields).map(([field, value]) => `### ${field}\n\n${value}`),
    ].filter(Boolean).join('\n\n')),
    ...(selected.mediaPlans || []).map(mp => [
      `## 图片优化方案：${mp.title || '视觉素材规划'} · ${mp.platform || 'IOS'} · ${mp.locale || 'zh-Hans'}`,
      mp.overview ? `> **设计总览**：${mp.overview}` : '',
      mp.testingHypothesis ? `> **A/B 测试假设**：${mp.testingHypothesis}` : '',
      ...(mp.items || []).map(item => [
        `### #${item.order} ${item.title} (${item.type || 'APP_SCREENSHOT'})`,
        item.caption ? `**主标大字文案**：${item.caption}` : '',
        item.subcaption ? `**副标卖点说明**：${item.subcaption}` : '',
        item.visualConcept ? `**视觉构图建议**：${item.visualConcept}` : '',
        item.rationale ? `**转化设计理由**：${item.rationale}` : '',
      ].filter(Boolean).join('\n\n')),
    ].filter(Boolean).join('\n\n')),
  ].join('\n\n');

  /* =========================================================================
     详情页：整页 ASO 报告阅读器（参考数据分析报告模块）
     ========================================================================= */
  if (selected) {
    const summaryBlocks = parseSummaryBlocks(selected.summary);

    const productPlatforms = new Set([...product.platform.split(/[、,]/), ...(product.appStore?.versions || []).map(version => version.platform)]
      .map(platform => platform.trim().toUpperCase()));
    const availableDevices = ([
      { name: 'iPhone', platform: 'IOS', group: 'IPHONE_FACE_ID_LARGE_PROFILE', studio: 'device: "iphone", deviceModel: "iphone-6-5"' },
      { name: 'iPad', platform: 'IOS', group: 'IPAD_13_PROFILE', studio: 'device: "ipad", deviceModel: "ipad-pro-13"' },
      { name: 'Mac', platform: 'MAC_OS', group: 'MAC_PROFILE', studio: undefined },
    ] as const).filter(device => productPlatforms.has(device.platform) ||
      (device.name === 'Mac' && (productPlatforms.has('MACOS') || productPlatforms.has('MAC'))) ||
      (device.name === 'iPad' && (productPlatforms.has('IPAD') || productPlatforms.has('IPADOS'))) ||
      (device.name === 'iPhone' && productPlatforms.has('IPHONE')))
      .map(device => ({ ...device, size: screenshotProfiles[device.group][0].join(' × ') }));
    const chosenDevices = availableDevices.filter(device => mediaDevices?.includes(device.name));
    const targets = [...new Set(chosenDevices.map(device => device.platform))].map(platform => {
      const versionIds = [...new Set(selected.plans.filter(plan =>
        getPlanPlatform(plan, product) === platform).map(plan => plan.target.versionId))];
      return { platform, versionId: versionIds.length === 1 ? versionIds[0] : undefined };
    });
    const target = JSON.stringify({
      productId: product.id, reportId: selected.id, targets,
      devices: chosenDevices.map(device => device.name), preferredSampleLocale: activeMediaLocale,
      artDirection: mediaDirection.trim() || undefined
    });
    const sizes = chosenDevices.map(device =>
      [device.name, device.size, device.group, device.studio].filter(Boolean).join(' · ')
    ).join('\n');
    const mediaPrompt = chosenDevices.length
      ? buildAsoMediaPrompt({
          target,
          sizes,
          hasStudio: chosenDevices.some(device => Boolean(device.studio)),
          lang,
        })
      : '';

    return (
      <div className="report-reader-view">
        {/* 顶部面包屑与操作栏 */}
        <div className="reader-top-bar">
          <div className="reader-bar-left">
            <button
              type="button"
              className="button secondary button-compact reader-back-btn"
              onClick={() => setSelected(null)}
            >
              <ArrowLeft size={15} />
              <span>{t('返回报告列表', 'Back to reports')}</span>
            </button>

            <span className="reader-bar-divider">/</span>

            <div className="reader-meta-group">
              <span className="reader-product-tag">
                <ProductIcon product={product} size={18} />
                <span>{product.name.split(/\s[-–—]\s/)[0]}</span>
              </span>

              <span className={`reader-read-badge ${selected.isRead ? 'read' : 'unread'}`}>
                {selected.isRead ? (
                  <>
                    <Check size={11} />
                    <span>{t('已读', 'Read')}</span>
                  </>
                ) : (
                  <>
                    <span className="unread-dot" />
                    <span>{t('未读', 'Unread')}</span>
                  </>
                )}
              </span>

              <span className="reader-date-tag">
                <Clock size={12} />
                <span>{selected.createdAt ? new Date(selected.createdAt).toLocaleDateString() : ''}</span>
              </span>

              {selected.plans && selected.plans.length > 0 && (
                <span className="reader-period-tag">
                  <Layers size={12} />
                  <span>{selected.plans.length} {t('份文案方案', 'copy plans')}</span>
                </span>
              )}

              {selected.mediaPlans && selected.mediaPlans.length > 0 && (
                <span className="reader-period-tag">
                  <ImageIcon size={12} />
                  <span>{selected.mediaPlans.length} {t('份图片方案', 'media plans')}</span>
                </span>
              )}

              {reportTasks.length > 0 && (
                <span className="reader-tasks-tag">
                  <CheckSquare size={12} />
                  <span>{reportTasks.length} {t('项待办', 'tasks')}</span>
                </span>
              )}
            </div>
          </div>

          <div className="reader-bar-right">
            <button
              type="button"
              className="button secondary button-compact"
              onClick={() => void toggleReportRead(selected)}
              title={selected.isRead ? t('标为未读', 'Mark as Unread') : t('标为已读', 'Mark as Read')}
            >
              {selected.isRead ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{selected.isRead ? t('标为未读', 'Mark as Unread') : t('标为已读', 'Mark as Read')}</span>
            </button>

            <button
              type="button"
              className="button secondary button-compact"
              onClick={async () => {
                await navigator.clipboard.writeText(markdownText || '');
                notify?.(t('已复制报告全文', 'Report copied'));
              }}
            >
              <Copy size={14} />
              <span>{t('复制全文', 'Copy Full Text')}</span>
            </button>

            <button
              type="button"
              className="button secondary button-compact"
              onClick={() => {
                const url = URL.createObjectURL(new Blob([markdownText || ''], { type: 'text/markdown;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = `${selected.title}.md`;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={14} />
              <span>{t('导出 .md', 'Export .md')}</span>
            </button>

            <button
              type="button"
              className="icon-button danger"
              title={t('删除报告', 'Delete Report')}
              aria-label={t('删除报告', 'Delete Report')}
              onClick={() => void deleteReport(selected.id, selected.title)}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* 主体两栏布局：左侧分章节导航 + 右侧文档正文 */}
        <div className="reader-body-layout">
          {/* 左侧分章节导航 (TOC) */}
          <aside className="reader-sidebar-toc">
            <div className="toc-header">
              <List size={16} className="toc-icon" />
              <span>{t('章节导航', 'Table of Contents')}</span>
            </div>

            {tocList.length > 0 ? (
              <nav className="toc-nav-list">
                {tocList.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    data-toc-id={item.id}
                    className={`toc-item level-${item.level} ${activeTocId === item.id ? 'active' : ''}`}
                    onClick={() => scrollToHeading(item.id)}
                  >
                    <span className="toc-dot" />
                    <span className="toc-text">{item.text}</span>
                  </button>
                ))}
              </nav>
            ) : (
              <div className="toc-empty">{t('正文暂未检测到 Markdown 章节标题', 'No section headings detected in body')}</div>
            )}
          </aside>

          {/* 右侧主文档排版区 */}
          <main
            ref={readerContentRef}
            className="reader-content-main"
            onMouseUp={handleContentMouseUp}
            onKeyUp={handleContentMouseUp}
          >
            {/* 报告主标题 */}
            <h1 className="reader-document-title">{selected.title}</h1>

            {/* 核心摘要与结构化区块 */}
            {summaryBlocks ? (
              <section className="reader-summary-container" aria-label={t('核心摘要与结论区块', 'Summary & Conclusions')}>
                {summaryBlocks.overview && (
                  <div className="summary-block summary-block-overview">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge overview-badge">
                          <TrendingUp size={16} />
                        </span>
                        <span className="block-title">{t('阶段表现与诊断总览', 'ASO Diagnostic Overview')}</span>
                      </div>
                      <span className="block-tag">Overview</span>
                    </div>
                    <div className="summary-block-content" data-report-section="overview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugins.overview]} components={markdownComponents}>
                        {summaryBlocks.overview}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {summaryBlocks.conclusions && (
                  <div className="summary-block summary-block-conclusions">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge conclusions-badge">
                          <AlertCircle size={16} />
                        </span>
                        <span className="block-title">{t('核心断点与流失归因', 'Core Findings & Bottlenecks')}</span>
                      </div>
                      <span className="block-tag">Key Conclusions</span>
                    </div>
                    <div className="summary-block-content" data-report-section="conclusions">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugins.conclusions]} components={markdownComponents}>
                        {summaryBlocks.conclusions}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}

                {summaryBlocks.recommendations && (
                  <div className="summary-block summary-block-recommendations">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge recommendations-badge">
                          <Sparkles size={16} />
                        </span>
                        <span className="block-title">{t('ASO 增长与落地优化建议', 'ASO Action Recommendations')}</span>
                      </div>
                      <span className="block-tag">Recommendations</span>
                    </div>
                    <div className="summary-block-content" data-report-section="recommendations">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugins.recommendations]} components={markdownComponents}>
                        {summaryBlocks.recommendations}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </section>
            ) : selected.summary ? (
              <section className="reader-summary-container">
                <div className="summary-block summary-block-overview">
                  <div className="summary-block-header">
                    <div className="header-left">
                      <span className="block-icon-badge overview-badge">
                        <TrendingUp size={16} />
                      </span>
                      <span className="block-title">{t('执行摘要', 'Executive Summary')}</span>
                    </div>
                    <span className="block-tag">Summary</span>
                  </div>
                  <div className="summary-block-content">
                    <p>{selected.summary}</p>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Markdown 正文 */}
            <article className="reader-markdown-article" data-report-section="body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugins.body]} components={markdownComponents}>
                {selected.content}
              </ReactMarkdown>
            </article>

            {/* =========================================================================
               1. ASO 文案优化方案专项展示区（按平台与语言区分 Tab）
               ========================================================================= */}
            {selected.plans && selected.plans.length > 0 && (
              <section id="sec-aso-copy-plans" className="aso-plans-container">
                <div className="aso-plans-section-header">
                  <div className="aso-plans-section-title">
                    <Layers size={18} className="header-icon" />
                    <span>{t('ASO 文案优化方案', 'ASO Copy Recommendations')}</span>
                    <span className="aso-plans-count-badge">
                      {selected.plans.length} {t('份方案', 'plans')}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="button primary small"
                    disabled={!!busy || applied.includes(selected.id)}
                    onClick={() =>
                      void run(t('正在写入文案草稿…', 'Saving copy drafts…'), async () => {
                        const result = await request<{ count: number }>('apply-report', { reportId: selected.id });
                        setApplied(items => [...items, selected.id]);
                        notify?.(
                          result.count
                            ? t(
                              `已写入 ${result.count} 份文案草稿，请在「ASO文案」页读取对应版本后核对。`,
                              `Saved ${result.count} drafts. Open ASO Copy and read the target version to review.`
                            )
                            : t('此报告的方案已使用。', 'These plans have already been used.')
                        );
                      })
                    }
                  >
                    <CheckCircle2 size={14} />
                    <span>
                      {applied.includes(selected.id)
                        ? t('方案已应用', 'Plans applied')
                        : t('应用ASO文案方案', 'Apply ASO Copy Plans')}
                    </span>
                  </button>
                </div>

                {/* 平台与语言双层 Tab 切换 */}
                <div className="aso-tabs-wrapper">
                  {/* 第一层：平台切换 Tab */}
                  {copyPlatforms.length > 1 && (
                    <div className="aso-platform-tabs" role="tablist" aria-label={t('平台切换', 'Platforms')}>
                      {copyPlatforms.map(platform => {
                        const count = selected.plans.filter(p => getPlanPlatform(p, product) === platform).length;
                        const active = platform === activeCopyPlatform;
                        return (
                          <button
                            key={platform}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={`aso-platform-tab-btn ${active ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedCopyPlatform(platform);
                              const targetPlans = selected.plans.filter(p => getPlanPlatform(p, product) === platform);
                              if (targetPlans.length > 0) {
                                setSelectedCopyLocale(targetPlans[0].target?.locale || 'zh-Hans');
                              }
                            }}
                          >
                            {getPlatformIcon(platform)}
                            <span>{getPlatformLabel(platform, t)}</span>
                            <span style={{ opacity: 0.85, fontSize: 11 }}>({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* 第二层：语言 Pill 切换 */}
                  {copyLocales.length > 0 && (
                    <div className="aso-locale-pills" role="tablist" aria-label={t('本地化语言', 'Locales')}>
                      {copyLocales.map(locale => {
                        const active = locale === activeCopyLocale;
                        return (
                          <button
                            key={locale}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            className={`aso-locale-pill-btn ${active ? 'active' : ''}`}
                            onClick={() => setSelectedCopyLocale(locale)}
                          >
                            {active && <span className="aso-locale-pill-dot" />}
                            <span>{getLocaleLabel(locale, lang)}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 当前激活的文案优化方案卡片 */}
                {activeCopyPlan && (
                  <article className="aso-plan-card">
                    <div className="aso-plan-card-header">
                      <div className="aso-plan-card-left">
                        <h3 className="aso-plan-title">{activeCopyPlan.title || t('文案建议稿', 'Copy Plan')}</h3>
                        <span className="aso-plan-locale-badge">{activeCopyPlan.target?.locale}</span>
                        {activeCopyPlan.market && <span className="aso-plan-market-badge">{activeCopyPlan.market}</span>}
                        {activeCopyPlan.target?.versionId && (
                          <span className="aso-plan-version-badge">Version {activeCopyPlan.target.versionId}</span>
                        )}
                        <span className="aso-plan-market-badge">{getPlatformLabel(getPlanPlatform(activeCopyPlan, product), t)}</span>
                      </div>
                    </div>

                    {(activeCopyPlan.objective || activeCopyPlan.analysis) && (
                      <div className="aso-plan-meta-notes">
                        {activeCopyPlan.objective && (
                          <div className="aso-plan-meta-item">
                            <strong>{t('优化目标', 'Objective')}：</strong>
                            <span>{activeCopyPlan.objective}</span>
                          </div>
                        )}
                        {activeCopyPlan.analysis && (
                          <div className="aso-plan-meta-item">
                            <strong>{t('诊断依据', 'Analysis')}：</strong>
                            <span>{activeCopyPlan.analysis}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="aso-fields-grid">
                      {(['name', 'subtitle', 'keywords', 'description', 'promotionalText'] as (keyof AsoFields)[]).map(field => {
                        const fieldLabels: Record<keyof AsoFields, string> = {
                          name: t('名称', 'App Name'),
                          subtitle: t('副标题', 'Subtitle'),
                          keywords: t('关键词', 'Keywords'),
                          description: t('描述', 'Description'),
                          promotionalText: t('推广文本', 'Promotional Text'),
                        };
                        const label = fieldLabels[field];
                        const maxLimit = ASO_FIELD_LIMITS[field];
                        const afterVal = activeCopyPlan.fields?.[field] || '';
                        const beforeVal = activeCopyPlan.before?.[field] || '';
                        const afterLen = [...afterVal].length;
                        const limitStatus =
                          afterLen > maxLimit
                            ? 'danger'
                            : field === 'keywords' && afterLen >= 80 && afterLen <= 100
                              ? 'optimal'
                              : afterLen >= maxLimit * 0.95
                                ? 'warning'
                                : 'normal';

                        return (
                          <div key={field} className="aso-field-card">
                            <div className="aso-field-card-header">
                              <div className="aso-field-header-left">
                                <span className="aso-field-label">{label}</span>
                                <span className={`aso-field-limit ${limitStatus}`}>
                                  {afterLen}/{maxLimit} {t('字符', 'chars')}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="button small ghost"
                                title={t('复制建议文案', 'Copy recommendation')}
                                onClick={async () => {
                                  await navigator.clipboard.writeText(afterVal);
                                  notify?.(t(`已复制 ${label}`, `Copied ${label}`));
                                }}
                              >
                                <Copy size={12} />
                                <span>{t('复制', 'Copy')}</span>
                              </button>
                            </div>

                            {beforeVal && beforeVal !== afterVal ? (
                              <div className="aso-field-diff-layout">
                                <div className="aso-diff-col">
                                  <span className="aso-diff-tag before">{t('优化前原文', 'Original Copy')}</span>
                                  <div className="aso-diff-text before">{beforeVal}</div>
                                </div>
                                <div className="aso-diff-col">
                                  <span className="aso-diff-tag after">{t('优化后建议稿', 'Recommended Copy')}</span>
                                  <div className="aso-diff-text after">{afterVal}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="aso-field-content-box">
                                {afterVal || <span className="muted">({t('空', 'Empty')})</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                )}
              </section>
            )}

            {/* =========================================================================
               2. ASO 图片优化方案模块（分平台与语言展示截屏、图标与标题图构图建议）
               ========================================================================= */}
            <section id="sec-aso-media-plans" className="aso-media-plans-section">
              <div className="aso-plans-section-header">
                <div className="aso-plans-section-title">
                  <ImageIcon size={18} className="header-icon" />
                  <span>{t('ASO 图片与素材优化方案', 'ASO Media & Creative Recommendations')}</span>
                  {mediaPlans.length > 0 && (
                    <span className="aso-plans-count-badge">
                      {mediaPlans.length} {t('份视觉方案', 'media plans')}
                    </span>
                  )}
                </div>

                <button type="button" className="button primary small" disabled={!availableDevices.length}
                  onClick={() => { setMediaDirection(''); setMediaDevices(availableDevices.map(device => device.name)); }}>
                  <Sparkles size={14} />
                  <span>{t('Agent生成图片', 'Generate Images with Agent')}</span>
                </button>
              </div>

              {mediaDevices && (
                <div className="report-modal-backdrop" onClick={() => setMediaDevices(null)}>
                  <div className="report-modal-content generate-modal" onClick={event => event.stopPropagation()}
                    onKeyDown={event => { if (event.key === 'Escape') setMediaDevices(null); }}
                    role="dialog" aria-modal="true" aria-labelledby="aso-media-prompt-title">
                    <div className="modal-top-bar">
                      <h3 id="aso-media-prompt-title" className="modal-title">{t('Agent生成图片', 'Generate Images with Agent')}</h3>
                      <button type="button" className="icon-button" aria-label={t('关闭', 'Close')} onClick={() => setMediaDevices(null)}><X size={18} /></button>
                    </div>
                    <p>{t('复制提示词给已连接 Growmory MCP 的本机 Agent。Agent 会结合 3D 真机模型、编辑级排版与氛围背景（或生图底图）合成高设计感首图，确认后制作各语言套图并回填草稿。',
                      'Send the prompt to a local agent with Growmory MCP. The agent combines 3D device renders, editorial typography, and atmospheric studio backdrops to craft high-design App Store screenshots, then saves localized sets after approval.')}</p>
                    <fieldset className="aso-media-prompt-devices">
                      <legend>{t('生成平台（可多选）', 'Platforms (select one or more)')}</legend>
                      {availableDevices.map(device => (
                        <label key={device.name}>
                          <input type="checkbox" checked={mediaDevices.includes(device.name)} onChange={event => {
                            setMediaDevices(event.target.checked ? [...mediaDevices, device.name] : mediaDevices.filter(name => name !== device.name));
                          }} />
                          <span><strong>{device.name}</strong><small>{device.size}</small></span>
                        </label>
                      ))}
                    </fieldset>
                    <label className="aso-media-art-direction">
                      <span>{t('画面方向（可选）', 'Art direction (optional)')}</span>
                      <input value={mediaDirection} onChange={event => setMediaDirection(event.target.value)}
                        placeholder={t('例如：暖调纸书与晨光', 'e.g. Warm paper and morning light')} />
                    </label>
                    <div className="modal-prompt-preview">
                      <textarea readOnly rows={8} value={mediaPrompt} placeholder={t('请至少选择一个平台', 'Select at least one platform')} aria-label={t('图片生成提示词', 'Image generation prompt')} />
                    </div>
                    <div className="modal-bottom-actions">
                      {onSelectTab && <button type="button" className="button secondary" onClick={() => { setMediaDevices(null); onSelectTab('media'); }}>{t('查看图片草稿', 'View Image Draft')}</button>}
                      <button type="button" className="button primary" disabled={!mediaPrompt} onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(mediaPrompt);
                          notify?.(t('已复制图片生成提示词', 'Image generation prompt copied'));
                        } catch {
                          notify?.(t('复制失败，请手动复制提示词', 'Copy failed. Select and copy the prompt manually.'));
                        }
                      }}><Copy size={16} />{t('复制提示词', 'Copy Prompt')}</button>
                    </div>
                  </div>
                </div>
              )}

              {/* 存在结构化图片方案时的渲染 */}
              {mediaPlans.length > 0 ? (
                <>
                  {/* 图片方案双层 Tab 切换 */}
                  <div className="aso-tabs-wrapper">
                    {/* 平台切换 */}
                    {mediaPlatforms.length > 1 && (
                      <div className="aso-platform-tabs" role="tablist" aria-label={t('平台切换', 'Platforms')}>
                        {mediaPlatforms.map(platform => {
                          const active = platform === activeMediaPlatform;
                          return (
                            <button
                              key={platform}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              className={`aso-platform-tab-btn ${active ? 'active' : ''}`}
                              onClick={() => {
                                setSelectedMediaPlatform(platform);
                                const targetPlans = mediaPlans.filter(
                                  mp => (mp.platform || 'IOS').toUpperCase() === platform
                                );
                                if (targetPlans.length > 0) {
                                  setSelectedMediaLocale(targetPlans[0].locale || 'zh-Hans');
                                }
                              }}
                            >
                              {getPlatformIcon(platform)}
                              <span>{getPlatformLabel(platform, t)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* 语言切换 */}
                    {mediaLocales.length > 0 && (
                      <div className="aso-locale-pills" role="tablist" aria-label={t('本地化语言', 'Locales')}>
                        {mediaLocales.map(locale => {
                          const active = locale === activeMediaLocale;
                          return (
                            <button
                              key={locale}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              className={`aso-locale-pill-btn ${active ? 'active' : ''}`}
                              onClick={() => setSelectedMediaLocale(locale)}
                            >
                              {active && <span className="aso-locale-pill-dot" />}
                              <span>{getLocaleLabel(locale, lang)}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 激活的图片优化方案主体 */}
                  {activeMediaPlan && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* 视觉策略与 A/B 测试总览卡片 */}
                      {(activeMediaPlan.overview || activeMediaPlan.testingHypothesis) && (
                        <div className="aso-media-strategy-card">
                          <div className="aso-media-strategy-header">
                            <Palette size={16} />
                            <span>{activeMediaPlan.title || t('视觉呈现与设计定位', 'Visual Concept & Strategy')}</span>
                          </div>
                          {activeMediaPlan.overview && (
                            <p className="aso-media-strategy-content">{activeMediaPlan.overview}</p>
                          )}
                          {activeMediaPlan.testingHypothesis && (
                            <div className="aso-media-hypothesis-box">
                              <FlaskConical size={15} style={{ flexShrink: 0 }} />
                              <span>
                                <strong>{t('PPO 测试假设', 'A/B Test Hypothesis')}：</strong>
                                {activeMediaPlan.testingHypothesis}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 截屏序列与素材卡片网格 */}
                      {activeMediaPlan.items && activeMediaPlan.items.length > 0 && (
                        <div className="aso-media-cards-grid">
                          {activeMediaPlan.items.map(item => (
                            <div key={item.order} className="aso-media-item-card">
                              <div className="aso-media-card-topbar">
                                <span className="aso-media-order-badge">
                                  #{item.order} {item.title || t('素材位', 'Placement')}
                                </span>
                                <span className="aso-media-type-badge">
                                  {item.type === 'PRODUCT_PAGE_HEADER_ASSET'
                                    ? t('宣传标题图', 'Header Banner')
                                    : item.type === 'APP_ICON'
                                      ? t('应用图标', 'App Icon')
                                      : t('截屏展示位', 'Screenshot')}
                                </span>
                              </div>

                              {(item.caption || item.subcaption) && (
                                <div className="aso-media-caption-box">
                                  {item.caption && <div className="aso-media-headline">{item.caption}</div>}
                                  {item.subcaption && <div className="aso-media-subcaption">{item.subcaption}</div>}
                                  <button
                                    type="button"
                                    className="button small ghost"
                                    style={{ alignSelf: 'flex-start', marginTop: 4 }}
                                    onClick={async () => {
                                      const text = [item.caption, item.subcaption].filter(Boolean).join(' - ');
                                      await navigator.clipboard.writeText(text);
                                      notify?.(t('已复制素材文案', 'Asset copy copied'));
                                    }}
                                  >
                                    <Copy size={12} />
                                    <span>{t('复制配文', 'Copy text')}</span>
                                  </button>
                                </div>
                              )}

                              <div className="aso-media-detail-section">
                                {item.visualConcept && (
                                  <div className="aso-media-detail-row">
                                    <span className="aso-media-detail-label">
                                      <Layout size={12} />
                                      {t('视觉构图与呈现', 'Visual Composition')}
                                    </span>
                                    <div className="aso-media-detail-val">{item.visualConcept}</div>
                                  </div>
                                )}

                                {item.rationale && (
                                  <div className="aso-media-detail-row">
                                    <span className="aso-media-detail-label">
                                      <TrendingUp size={12} />
                                      {t('转化理由与流失归因', 'Conversion Rationale')}
                                    </span>
                                    <div className="aso-media-detail-val">{item.rationale}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                /* 当报告正文中包含素材建议但尚未生成结构化 mediaPlans 时的智能蓝图卡片 */
                <div className="aso-media-blueprint-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Palette size={20} className="header-icon" />
                      <div>
                        <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                          {t('App Store 视觉素材转化蓝图与排版规范', 'App Store Visual Conversion Blueprint')}
                        </h4>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#64748b' }}>
                          {t(
                            '高转化素材决定展示➔查看与查看➔下载的成败，建议结合下方规范与正文诊断在「ASO图片」工作区落地。',
                            'Store creatives determine click-through and download conversion. Follow this blueprint to update assets in ASO Media.'
                          )}
                        </p>
                      </div>
                    </div>

                    {onSelectTab && (
                      <button
                        type="button"
                        className="button primary small"
                        onClick={() => onSelectTab('media')}
                      >
                        <ImageIcon size={14} />
                        <span>{t('前往 ASO 图片工作区配置', 'Configure in ASO Media')}</span>
                      </button>
                    )}
                  </div>

                  <div className="aso-media-blueprint-grid">
                    <div className="aso-blueprint-item">
                      <div className="aso-blueprint-item-title">
                        <Smartphone size={15} style={{ color: '#0284c7' }} />
                        <span>{t('#1 Hook 首屏图（黄金3秒原则）', '#1 Hook Screenshot (3-Sec Rule)')}</span>
                      </div>
                      <p className="aso-blueprint-item-desc">
                        {t(
                          '在搜索结果与产品页第一眼传达 #1 核心痛点与价值。主标题大字控制在1行半内，避免手机小屏下难以识别。',
                          'Directly convey the #1 value proposition on mobile devices. Headline text within 1.5 lines for maximum readability.'
                        )}
                      </p>
                    </div>

                    <div className="aso-blueprint-item">
                      <div className="aso-blueprint-item-title">
                        <Layout size={15} style={{ color: '#16a34a' }} />
                        <span>{t('#2~#3 功能场景与易用性特写', '#2~#3 Feature & Immersion Shots')}</span>
                      </div>
                      <p className="aso-blueprint-item-desc">
                        {t(
                          '特写展示核心使用场景与便捷操作，突出与竞品的交互差异化，通过真实界面沉浸感减少用户决策阻力。',
                          'Feature close-ups of core task workflows and intuitive interactions to minimize friction in download decisions.'
                        )}
                      </p>
                    </div>

                    <div className="aso-blueprint-item">
                      <div className="aso-blueprint-item-title">
                        <Palette size={15} style={{ color: '#ca8a04' }} />
                        <span>{t('应用图标与高对比背景层级', 'App Icon & High-Contrast Design')}</span>
                      </div>
                      <p className="aso-blueprint-item-desc">
                        {t(
                          '保持图标纯净图形提炼，剔除无意义文字水印。截屏背景采用高对比浅色或品牌主题色，凸显界面内容主体。',
                          'Keep app icon refined with clean brand symbols. Use high-contrast backgrounds to highlight the real app interface.'
                        )}
                      </p>
                    </div>

                    <div className="aso-blueprint-item">
                      <div className="aso-blueprint-item-title">
                        <FlaskConical size={15} style={{ color: '#7c3aed' }} />
                        <span>{t('PPO 产品页原生 A/B 测试', 'Product Page Optimization (PPO)')}</span>
                      </div>
                      <p className="aso-blueprint-item-desc">
                        {t(
                          '在 App Store Connect 发起对照组与测试组实验，测试不同首图主标与色调，监测产品页查看➔下载转化率异动。',
                          'Set up A/B testing on App Store Connect to validate primary screenshot headlines and track view-to-download lift.'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </section>
          </main>
        </div>

        {/* 鼠标划选文本后的悬浮操作条 */}
        {selectionToolbar && (
          <button
            type="button"
            className="report-selection-toolbar"
            style={{
              position: 'fixed',
              top: selectionToolbar.top,
              left: selectionToolbar.left,
              color: '#ffffff',
            }}
            onMouseDown={e => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              const rawQuote = selectionToolbar.text.trim();
              const initialTitle = [...rawQuote].slice(0, 20).join('');
              setCreateTaskModal({
                quote: rawQuote,
                anchors: selectionToolbar.anchors,
                title: initialTitle,
                note: '',
                productId: product.id,
                date: today(),
              });
              setSelectionToolbar(null);
              triggerAiTaskGeneration(rawQuote, product.id, selected.title);
            }}
          >
            <CheckSquare size={14} className="toolbar-icon" />
            <span>{t('创建为待办', 'Create Task')}</span>
          </button>
        )}

        {/* 创建待办模态弹窗 */}
        {createTaskModal && (
          <div
            className="report-modal-backdrop"
            onClick={() => {
              setCreateTaskModal(null);
              setIsGeneratingAiTask(false);
            }}
          >
            <div
              className="report-modal-content create-task-modal"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-aso-task-title"
            >
              <div className="modal-top-bar">
                <h3 id="create-aso-task-title" className="modal-title">
                  <CheckSquare size={18} className="modal-title-icon" />
                  <span>{t('创建为待办事项', 'Create Task')}</span>
                </h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t('关闭', 'Close')}
                  onClick={() => {
                    setCreateTaskModal(null);
                    setIsGeneratingAiTask(false);
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* 1. 引用报告内容 */}
              <div className="modal-section">
                <label className="section-label">
                  <Quote size={13} className="label-icon" />
                  <span>{t('引用 ASO 报告内容', 'Referenced Quote')}</span>
                </label>
                <div className="report-quote-preview-card">
                  <p className="quote-text">{createTaskModal.quote}</p>
                </div>
              </div>

              {/* 2. 待办标题 */}
              <div className="modal-section">
                <div className="section-label-row">
                  <label className="section-label" htmlFor="task-title-input">
                    <CheckSquare size={13} className="label-icon" />
                    <span>{t('待办标题（要做什么）', 'Task Title')}</span>
                    <span className="required-star">*</span>
                  </label>
                  <div className="label-right-tools">
                    <span
                      className="task-title-char-count"
                      style={{
                        color: [...createTaskModal.title].length >= 20 ? '#ea580c' : '#6b7280',
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {[...createTaskModal.title].length}/20 {t('字', 'chars')}
                    </span>
                    <button
                      type="button"
                      className="button small ghost ai-regen-btn"
                      disabled={isGeneratingAiTask}
                      onClick={() =>
                        triggerAiTaskGeneration(createTaskModal.quote, createTaskModal.productId, selected?.title)
                      }
                      title={t('调用内置AI生成20字内待办标题', 'Generate task title via AI within 20 chars')}
                    >
                      <Sparkles size={13} className={isGeneratingAiTask ? 'animate-spin' : ''} />
                      <span>{isGeneratingAiTask ? t('AI 提炼中...', 'AI Generating...') : t('AI 提炼标题', 'AI Title')}</span>
                    </button>
                  </div>
                </div>
                <input
                  id="task-title-input"
                  type="text"
                  maxLength={20}
                  className="input full-width"
                  value={createTaskModal.title}
                  placeholder={
                    isGeneratingAiTask
                      ? t('AI 正在提炼 20 字以内待办标题...', 'AI is generating task title within 20 chars...')
                      : t('例如：优化副标题搜索热词、调整第1张截图文案', 'e.g., Optimize subtitle keywords, redesign screenshot 1')
                  }
                  onChange={e =>
                    setCreateTaskModal({
                      ...createTaskModal,
                      title: [...e.target.value].slice(0, 20).join(''),
                    })
                  }
                  autoFocus
                />
              </div>

              {/* 3. 备注与行动计划 */}
              <div className="modal-section">
                <label className="section-label" htmlFor="task-note-input">
                  <FileText size={13} className="label-icon" />
                  <span>{t('备注与行动计划', 'Notes & Action Plan')}</span>
                  <span className="optional-tag">{t('选填', 'Optional')}</span>
                </label>
                <textarea
                  id="task-note-input"
                  className="input full-width"
                  rows={3}
                  value={createTaskModal.note}
                  placeholder={t('记录执行要点、跟进人、预期效果或排期计划...', 'Add notes, follow-up details, or action items...')}
                  onChange={e => setCreateTaskModal({ ...createTaskModal, note: e.target.value })}
                />
              </div>

              {/* 4. 关联产品与计划日期 */}
              <div className="modal-grid-row">
                <div className="modal-section flex-1">
                  <label className="section-label">{t('关联产品', 'Product')}</label>
                  <select
                    className="select full-width"
                    value={createTaskModal.productId}
                    onChange={e => setCreateTaskModal({ ...createTaskModal, productId: e.target.value })}
                  >
                    {products.length > 0 ? (
                      products.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.name.split(/\s[-–—]\s/)[0]}
                        </option>
                      ))
                    ) : (
                      <option value={product.id}>{product.name.split(/\s[-–—]\s/)[0]}</option>
                    )}
                  </select>
                </div>

                <div className="modal-section flex-1">
                  <label className="section-label">{t('计划完成日期', 'Due Date')}</label>
                  <input
                    type="date"
                    className="input full-width"
                    value={createTaskModal.date}
                    onChange={e => setCreateTaskModal({ ...createTaskModal, date: e.target.value })}
                  />
                </div>
              </div>

              {/* 底部操作按钮 */}
              <div className="modal-bottom-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setCreateTaskModal(null);
                    setIsGeneratingAiTask(false);
                  }}
                >
                  {t('取消', 'Cancel')}
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    if (!createTaskModal.title.trim()) {
                      alert(t('请输入待办标题', 'Please enter task title'));
                      return;
                    }
                    const newTask: Task = {
                      id: uid(),
                      productId: createTaskModal.productId,
                      title: [...createTaskModal.title.trim()].slice(0, 20).join(''),
                      date: createTaskModal.date || today(),
                      done: false,
                      reportId: selected.id,
                      quote: createTaskModal.quote.trim(),
                      reportAnchors: createTaskModal.anchors,
                      note: createTaskModal.note.trim(),
                    };
                    await onSaveTask?.(newTask);
                    setCreateTaskModal(null);
                    setIsGeneratingAiTask(false);
                    window.getSelection()?.removeAllRanges();
                    notify?.(t('待办事项已创建', 'Task created'));
                  }}
                >
                  <CheckSquare size={14} />
                  <span>{t('确认创建待办', 'Confirm Create Task')}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 查看待办详情弹窗 */}
        {viewingTask && (
          <TaskDetailModal
            task={viewingTask}
            products={products.length ? products : [product]}
            onClose={() => setViewingTask(null)}
            onSaveTask={async updated => {
              setViewingTask(updated);
              await onSaveTask?.(updated);
            }}
            onDeleteTask={async id => {
              await onDeleteTask?.(id);
              setViewingTask(null);
            }}
            onNavigateTasks={onNavigateTasks}
          />
        )}
      </div>
    );
  }

  /* =========================================================================
     列表页：ASO 报告列表与顶部操作（参考数据分析报告模块）
     ========================================================================= */
  return (
    <div className="reports-clean-view">
      {/* 顶部标题与「生成报告」按钮 */}
      <section className="panel reports-top-header">
        <div className="reports-header-left">
          <h3>
            <FileText size={18} className="header-icon" />
            <span>{t('ASO 分析与优化', 'ASO Analysis and Optimization')}</span>
            <span className="reports-total-badge">{reports.length}</span>
            {unreadCount > 0 && (
              <span className="reports-unread-total-badge">
                <span className="unread-dot" />
                <span>{unreadCount} {t('未读', 'unread')}</span>
              </span>
            )}
          </h3>
          <p>
            {t(
              '由外部 AI Agent 作为资深增长专家，综合产品事实、转化漏斗、商店素材与竞品调研深度诊断，并生成文案与图片落地优化方案。',
              'Holistic ASO diagnostic reports, copy recommendations, and creative asset blueprints generated by external AI Agents via Growmory MCP.'
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className="button secondary button-compact"
            disabled={!!busy}
            onClick={() => void loadReports()}
            title={t('刷新报告列表', 'Refresh reports')}
          >
            <RotateCw size={14} className={busy ? 'animate-spin' : ''} />
            <span>{t('刷新', 'Refresh')}</span>
          </button>

          <button
            type="button"
            className="button primary generate-report-btn"
            onClick={() => {
              setShowGenerateModal(true);
              setCopiedPrompt(false);
            }}
          >
            <Sparkles size={16} />
            <span>{t('生成报告', 'Generate Report')}</span>
          </button>
        </div>
      </section>

      {error && <div className="alert error">{error}</div>}

      {/* 罗列报告列表 */}
      <section className="panel reports-table-panel">
        {reports.length > 0 ? (
          <div className="reports-list-container">
            {reports.map(report => (
              <div
                key={report.id}
                className={`report-item-row ${!report.isRead ? 'is-unread' : ''}`}
                onClick={() => void openReport(report)}
              >
                <div className="item-icon-box">
                  <ProductIcon product={product} size={42} />
                </div>

                <div className="item-content-box">
                  <div className="item-meta-line">
                    <span className="item-product-name">{product.name.split(/\s[-–—]\s/)[0]}</span>

                    {report.isRead ? (
                      <span className="report-badge-read">
                        <Check size={11} />
                        <span>{t('已读', 'Read')}</span>
                      </span>
                    ) : (
                      <span className="report-badge-unread">
                        <span className="unread-dot" />
                        <span>{t('未读', 'Unread')}</span>
                      </span>
                    )}

                    <span className="item-date">
                      <Calendar size={12} />
                      {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''}
                    </span>

                    {report.plans && report.plans.length > 0 && (
                      <span className="item-period">
                        <Layers size={12} />
                        <span>{report.plans.length} {t('份文案方案', 'copy plans')}</span>
                      </span>
                    )}

                    {report.mediaPlans && report.mediaPlans.length > 0 && (
                      <span className="item-period">
                        <ImageIcon size={12} />
                        <span>{report.mediaPlans.length} {t('份图片方案', 'media plans')}</span>
                      </span>
                    )}
                  </div>

                  <h4 className="item-title">{report.title}</h4>

                  {report.summary && <p className="item-summary">{report.summary}</p>}
                </div>

                <div className="item-action-box" onClick={e => e.stopPropagation()}>
                  <button
                    type="button"
                    className="button secondary button-compact"
                    onClick={() => void openReport(report)}
                  >
                    <span>{t('查看报告', 'View Report')}</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    title={t('删除报告', 'Delete Report')}
                    aria-label={t('删除报告', 'Delete Report')}
                    onClick={() => void deleteReport(report.id, report.title)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="reports-empty-box">
            <FileText size={42} className="empty-icon" />
            <h4>{t('暂无 ASO 分析报告', 'No ASO reports yet')}</h4>
            <p>
              {t(
                '点击上方「生成报告」，复制由 ASO 专家设计的完整提示词并发送给 AI Agent，即可通过 Growmory MCP 自动生成首份深度诊断、多平台文案与图片优化方案。',
                'Click "Generate Report" above, copy the expert prompt for your AI Agent, and automatically generate your first ASO report via Growmory MCP.'
              )}
            </p>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setShowGenerateModal(true);
                setCopiedPrompt(false);
              }}
            >
              <Sparkles size={15} />
              <span>{t('生成报告', 'Generate Report')}</span>
            </button>
          </div>
        )}
      </section>

      {/* 点击「生成报告」后的模态弹窗 */}
      {showGenerateModal && (
        <div className="report-modal-backdrop" onClick={() => setShowGenerateModal(false)}>
          <div
            className="report-modal-content generate-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aso-gen-modal-title"
          >
            <div className="modal-top-bar">
              <h3 id="aso-gen-modal-title" className="modal-title">
                <Sparkles size={18} />
                <span>{t('生成 ASO 深度分析与优化报告', 'Generate In-Depth ASO Diagnostic & Optimization Report')}</span>
              </h3>
              <button
                type="button"
                className="icon-button"
                aria-label={t('关闭', 'Close')}
                onClick={() => setShowGenerateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* 分析目标产品 */}
            <div className="modal-section">
              <label className="section-label">{t('分析目标产品', 'Target Product')}</label>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid #bae6fd',
                  background: '#f0f9ff',
                }}
              >
                <ProductIcon product={product} size={38} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong style={{ fontSize: 14, color: '#0f172a' }}>{product.name}</strong>
                  <span style={{ fontSize: 12, color: '#0369a1' }}>
                    App ID: {product.appStore?.appId} · Bundle: {product.appStore?.bundleId || 'com.app'}
                  </span>
                </div>
              </div>
            </div>

            {/* 一键复制提示词 */}
            <div className="modal-section">
              <label className="section-label">{t('ASO 专家分析提示词（通过 MCP 执行）', 'ASO Expert Analysis Prompt (via MCP)')}</label>
              <div className="copy-action-box">
                <button
                  type="button"
                  className={`button primary copy-btn-large ${copiedPrompt ? 'copied' : ''}`}
                  onClick={async () => {
                    await navigator.clipboard.writeText(prompt);
                    setCopiedPrompt(true);
                    notify?.(t('已复制 ASO 专家分析提示词', 'ASO expert prompt copied'));
                    setTimeout(() => setCopiedPrompt(false), 3000);
                  }}
                >
                  {copiedPrompt ? <Check size={18} /> : <Copy size={18} />}
                  <span>{copiedPrompt ? t('已复制提示词！可直接发送给 Agent', 'Prompt Copied! Send to Agent') : t('一键复制 ASO 专家分析提示词', 'Copy ASO Expert Prompt')}</span>
                </button>
                <p className="copy-help-hint">
                  {t(
                    '提示词已整合产品事实、30天转化漏斗（展示/查看/下载/收入）、商店视觉素材诊断与代表性地区竞品攻防，支持 Agent 同步回填多平台文案方案与图片截屏方案。',
                    'The prompt integrates product facts, 30-day funnel analytics, store creative diagnosis, and competitor intelligence. Supports multi-platform copy and media backfills.'
                  )}
                </p>
              </div>

              {/* 提示词预览折叠 */}
              <div className="modal-prompt-preview">
                <textarea
                  readOnly
                  rows={9}
                  value={prompt}
                  aria-label={t('Agent 提示词预览', 'Prompt preview')}
                />
              </div>
            </div>

            {/* 底部操作 */}
            <div className="modal-bottom-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowGenerateModal(false)}
              >
                {t('关闭', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
