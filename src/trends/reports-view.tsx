import { captureReportTaskAnchors, reportTaskHighlights } from './report-task-anchors';
import { useState, useMemo, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Copy,
  Check,
  Trash2,
  Download,
  Calendar,
  Layers,
  ArrowRight,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  ArrowLeft,
  List,
  TrendingUp,
  AlertCircle,
  CheckSquare,
  Quote,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { ReportTaskAnchor, Product, AnalyticsReport, Task } from '../types';
import { uid, today } from '../types';
import { useI18n } from '../i18n.ts';
import { TaskDetailModal } from '../task-detail-modal';

type ReportsViewProps = {
  products: Product[];
  scope: string;
  setScope?: (scope: string) => void;
  reports: AnalyticsReport[];
  onSaveReport: (report: AnalyticsReport) => Promise<void> | void;
  onDeleteReport: (id: string) => Promise<void> | void;
  tasks?: Task[];
  onSaveTask?: (task: Task) => Promise<void> | void;
  onDeleteTask?: (id: string) => Promise<void> | void;
  onNavigateTasks?: () => void;
  targetReportId?: string | null;
  targetQuote?: string | null;
  onClearTargetReport?: () => void;
};

export type SummaryBlocks = {
  overview: string;
  conclusions: string;
  recommendations: string;
};

export function formatReportPeriod(period: string, lang: 'zh' | 'en' = 'zh'): string {
  if (!period) return '';
  if (lang === 'en') {
    return period
      .replace(/近\s*(\d+)\s*天/g, 'Past $1 Days')
      .replace(/最近\s*(\d+)\s*天/g, 'Past $1 Days');
  }
  return period;
}

export function formatReportTitle(title: string, lang: 'zh' | 'en' = 'zh'): string {
  if (!title) return '';
  if (lang === 'en') {
    return title
      .replace(/近\s*(\d+)\s*天数据分析与增长诊断报告/g, 'Data Analysis & Growth Diagnostic Report (Past $1 Days)')
      .replace(/数据分析与增长诊断报告/g, 'Data Analysis & Growth Diagnostic Report');
  }
  return title;
}

// 智能结构化解析摘要：将概述、核心结论、落地建议拆分为独立区块并强化 Markdown 格式
function parseSummaryBlocks(summary?: string): SummaryBlocks | null {
  if (!summary) return null;
  const s = summary.trim();
  if (!s) return null;

  let overview = '';
  let conclusions = '';
  let recommendations = '';

  const conclusionRegex = /(?:^|\n)[ \t]*(?:#{1,4}\s*|\*{1,2})?(?:核心(?:诊断)?结论|核心断点(?:与流失归因)?|核心发现|主要结论|诊断结论|Key Findings|Key Conclusions|Conclusions)[^\n]*/i;
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
    // 将 1、2、3、 或 1. 2. 转换为独立的 Markdown 列表项，保护版本号如 2.1.0
    t = t.replace(/(^|[。；;\n])\s*([0-9]{1,2}[、])\s*/g, '$1\n- **$2** ');
    t = t.replace(/(^|[。；;\n])\s*([0-9]{1,2}\.(?!\d))\s*/g, '$1\n- **$2** ');
    // 将 P0 / P1 / P2 建议按列表拆分
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

// 产品图标辅助渲染：严格保证宽高、弹性居中对齐
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

// 提取 React 节点纯文本
function getHeadingText(children: any): string {
  if (children == null) return '';
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(getHeadingText).join('');
  if (children.props && children.props.children) return getHeadingText(children.props.children);
  return '';
}

// 标题稳定 Slug 生成（确保 TOC 与 Markdown DOM 100% 对应）
function slugifyHeading(text: string): string {
  const clean = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `sec-${clean || 'heading'}`;
}

// 提取 Markdown 中的分章节标题
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

// 智能生成待办引用文本的各种候选变体（自动处理序号/优先级前缀、冒号全半角、首尾标点、Markdown标记与跨格式拆分）
function getTaskQuoteVariants(quote: string): string[] {
  const q = quote.trim();
  if (!q) return [];
  const set = new Set<string>();

  const addVariant = (str: string) => {
    const s = str.trim();
    if (!s || s.length < 2) return;
    set.add(s);
    // 冒号全半角适配
    if (s.includes(':')) set.add(s.replace(/:\s*/g, '：'));
    if (s.includes('：')) set.add(s.replace(/：\s*/g, ': '));
    // 冒号两边空格清除
    set.add(s.replace(/\s*([：:])\s*/g, '$1'));
    // 英文括号与中文括号适配
    if (s.includes('(')) set.add(s.replace(/\(/g, '（').replace(/\)/g, '）'));
    if (s.includes('（')) set.add(s.replace(/（/g, '(').replace(/）/g, ')'));
    // 空格与换行规范化
    const singleSpaced = s.replace(/[\s\u00A0\r\n]+/g, ' ');
    if (singleSpaced !== s) set.add(singleSpaced);
    const noBreak = s.replace(/[\r\n]+/g, '');
    if (noBreak !== s) set.add(noBreak);
    // 去除外层括号/方括号
    const strippedBrackets = s.replace(/^[\[\(（【]|[\]\)）】]$/g, '').trim();
    if (strippedBrackets && strippedBrackets.length >= 2) set.add(strippedBrackets);
  };

  // 1. 原始文本与空白规整
  addVariant(q);

  // 2. 去除 Markdown 格式标记（如 **bold**, *italic*, `code`, #, ~~del~~ 等）
  const strippedMarkdown = q.replace(/[*`_#~]/g, '').trim();
  if (strippedMarkdown && strippedMarkdown !== q) {
    addVariant(strippedMarkdown);
  }

  // 3. 递归解析基础候选池（包含原始文本与去格式文本）
  const basePool = Array.from(set);
  for (const item of basePool) {
    // (a) 去除常见行首序号/前缀（如 P0: / P1： / 1. / 1、 / (1) / [1] / - / • / * 等）
    const strippedPrefix = item.replace(/^(?:(?:[#*_\s]*)(?:P[0-2]|\d{1,2}|[一二三四五六七八九十]|[(（]?\d{1,2}[)）]|[①②③④⑤⑥⑦⑧⑨⑩])[：:、.)）\]\s]+|[-*•]\s*)/i, '').trim();
    if (strippedPrefix && strippedPrefix.length >= 2) {
      addVariant(strippedPrefix);
    }

    // (b) 去除首尾标点符号（如句末的分号、句号、逗号、顿号、叹号等）
    const strippedPunctuation = item.replace(/^[，。；;、,.\s!?！？|]+|[，。；;、,.\s!?！？|]+$/g, '').trim();
    if (strippedPunctuation && strippedPunctuation.length >= 2) {
      addVariant(strippedPunctuation);
    }

    // (c) 冒号关联切分（保留冒号前后，包含冒号本身与纯文字，彻底解决「**标题**：具体内容」因加粗节点分离导致的断裂）
    const colonIdx = item.search(/[：:]/);
    if (colonIdx > 0) {
      const beforeColon = item.slice(0, colonIdx).trim();
      const afterColonWith = item.slice(colonIdx).trim();
      const afterColonPure = item.slice(colonIdx + 1).trim();
      if (beforeColon.length >= 2) addVariant(beforeColon);
      if (afterColonWith.length >= 2) addVariant(afterColonWith);
      if (afterColonPure.length >= 2) addVariant(afterColonPure);
    }

    // (d) 表格行与单元格拆分（制表符 \t、竖线 |）
    const tableCells = item.split(/[\t|]+/).map(s => s.trim()).filter(s => s.length >= 2);
    if (tableCells.length > 1) {
      for (const cell of tableCells) {
        addVariant(cell);
        const cleanCell = cell.replace(/^[，。；;、,.\s|*`_]+|[，。；;、,.\s|*`_]+$/g, '').trim();
        if (cleanCell.length >= 2) addVariant(cleanCell);
      }
    }
  }

  // 过滤掉太短的无意义字符，并按长度降序排序（优先长词匹配，避免短词吞噬）
  return Array.from(set).filter(s => s.length >= 2).sort((a, b) => b.length - a.length);
}

export function TrendReportsView({
  products,
  scope,
  reports,
  onSaveReport,
  onDeleteReport,
  tasks = [],
  onSaveTask,
  onDeleteTask,
  onNavigateTasks,
  targetReportId,
  targetQuote,
  onClearTargetReport,
}: ReportsViewProps) {
  const { lang, t } = useI18n();
  // 生成报告弹窗状态
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<string>(scope === 'all' ? '' : scope);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  // 页面查看报告状态（详情页）
  const [viewingReport, setViewingReport] = useState<AnalyticsReport | null>(null);
  const [activeTocId, setActiveTocId] = useState<string>('');

  const unreadCount = useMemo(() => reports.filter(r => !r.isRead).length, [reports]);

  // 打开报告并自动标记为已读
  const openReport = async (report: AnalyticsReport) => {
    setViewingReport(report);
    if (!report.isRead) {
      const updated: AnalyticsReport = {
        ...report,
        isRead: true,
        readAt: new Date().toISOString(),
      };
      setViewingReport(updated);
      try {
        await onSaveReport?.(updated);
      } catch (err) {
        console.error('Failed to mark report as read:', err);
      }
    }
  };

  // 手动切换已读/未读状态
  const toggleReportRead = async (report: AnalyticsReport) => {
    const nextRead = !report.isRead;
    const updated: AnalyticsReport = {
      ...report,
      isRead: nextRead,
      readAt: nextRead ? new Date().toISOString() : undefined,
    };
    if (viewingReport && viewingReport.id === report.id) {
      setViewingReport(updated);
    }
    try {
      await onSaveReport?.(updated);
    } catch (err) {
      console.error('Failed to toggle report read status:', err);
    }
  };

  // 鼠标框选悬浮工具条状态
  const [selectionToolbar, setSelectionToolbar] = useState<{
    text: string;
    anchors: ReportTaskAnchor[];
    top: number;
    left: number;
  } | null>(null);

  // 创建待办弹窗状态
  const [createTaskModal, setCreateTaskModal] = useState<{
    quote: string;
    anchors: ReportTaskAnchor[];
    title: string;
    note: string;
    productId: string;
    date: string;
  } | null>(null);

  // AI 智能生成待办标题状态
  const [isGeneratingAiTask, setIsGeneratingAiTask] = useState(false);

  // 触发内置 AI 提炼 20 字以内待办标题
  const triggerAiTaskGeneration = async (
    quoteText: string,
    prodId?: string,
    repTitle?: string
  ) => {
    const raw = (quoteText || '').trim();
    if (!raw) return;
    setIsGeneratingAiTask(true);
    try {
      const prod = products.find(p => p.id === prodId);
      const res = await fetch('/api/ai/generate-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote: raw,
          productName: prod?.name || '',
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

  // 查看待办详情弹窗状态
  const [viewingTask, setViewingTask] = useState<Task | null>(null);

  // 报告主文档 DOM 引用，用于限定框选触发范围
  const readerContentRef = useRef<HTMLDivElement>(null);

  const validProducts = useMemo(() => products.filter(p => !!p.name), [products]);
  const targetProduct = products.find(p => p.id === selectedProduct);

  // 平滑滚动定位至引用原文所在位置并高亮闪烁
  const scrollToQuote = (targetQuoteText?: string) => {
    if (!targetQuoteText) return;
    const variants = getTaskQuoteVariants(targetQuoteText);

    // 1. 优先尝试通过 data-quote 或 .report-task-underline 找到目标下划线元素
    const targetSpans = readerContentRef.current?.querySelectorAll('.report-task-underline') ?? [];
    let targetEl: HTMLElement | null = null;
    for (const el of targetSpans) {
      const txt = el.textContent?.trim() || '';
      const dq = el.getAttribute('data-quote') || '';
      if (
        variants.some(v => txt.includes(v) || v.includes(txt) || (dq && (dq.includes(v) || v.includes(dq))))
      ) {
        targetEl = el as HTMLElement;
        break;
      }
    }

    // 2. 如果未找到下划线元素，则在主文档内容中遍历文本节点查找
    if (!targetEl && readerContentRef.current) {
      const walker = document.createTreeWalker(
        readerContentRef.current,
        NodeFilter.SHOW_TEXT
      );
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim() || '';
        if (text && variants.some(v => text.includes(v) || v.includes(text))) {
          targetEl = node.parentElement;
          break;
        }
      }
    }

    if (targetEl) {
      const topOffset = -120;
      const y = targetEl.getBoundingClientRect().top + window.pageYOffset + topOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      targetEl.classList.add('anchor-highlight-flash');
      window.setTimeout(() => {
        targetEl?.classList.remove('anchor-highlight-flash');
      }, 3000);
    }
  };

  // 监听外部跳转报告指令
  useEffect(() => {
    if (targetReportId) {
      const found = reports.find(r => r.id === targetReportId);
      if (found) {
        setViewingReport(found);
        setSelectedProduct(found.productId || '');
        if (!found.isRead) {
          const updated = { ...found, isRead: true, readAt: new Date().toISOString() };
          setViewingReport(updated);
          void onSaveReport?.(updated);
        }
      }
    }
  }, [targetReportId, reports, onSaveReport]);

  // 当报告在后台或外部更新时，同步更新详情页当前报告状态
  useEffect(() => {
    if (viewingReport) {
      const latest = reports.find(r => r.id === viewingReport.id);
      if (latest && (latest.isRead !== viewingReport.isRead || latest.updatedAt !== viewingReport.updatedAt)) {
        setViewingReport(latest);
      }
    }
  }, [reports, viewingReport]);

  // 监听进入报告后的锚点滚动定位
  useEffect(() => {
    if (!viewingReport || !targetQuote) return;
    const timer = setTimeout(() => {
      scrollToQuote(targetQuote);
      onClearTargetReport?.();
    }, 250);
    return () => clearTimeout(timer);
  }, [viewingReport, targetQuote]);

  // 提取当前正在查看报告的章节目录
  const tocList = useMemo(() => {
    if (!viewingReport?.content) return [];
    return extractTocFromMarkdown(viewingReport.content);
  }, [viewingReport]);

  // 动态生成严格规范排版的外部 Agent 提示词
  const prompt = useMemo(() => {
    const isAll = !targetProduct;
    const productName = targetProduct ? targetProduct.name.split(/\s[-–—]\s/)[0] : (lang === 'en' ? 'All Products' : '全产品大盘');
    const param = targetProduct
      ? `{"productId": "${targetProduct.id}", "days": ${periodDays}}`
      : `{"days": ${periodDays}}`;

    if (isAll) {
      const periodLabel = `Past ${periodDays} Days`;
      if (lang === 'en') {
        return `You are a senior mobile app growth and ASO specialist. Please connect to Growmory local MCP service and execute a batch generation task for "All Products Portfolio & Individual Product Growth Diagnostic Reports (${periodLabel})".

[Core Mission]
You must synchronously generate and save a total of ${validProducts.length + 1} professional diagnostic reports to Growmory:
1. 1 "All Products Portfolio Overview Report" (with productId: "");
2. ${validProducts.length} "Individual Product Diagnostic Reports" (generate an in-depth independent report for each product: ${validProducts.map(p => `"${p.name.split(/\s[-–—]\s/)[0]}"`).join(', ')}, passing their respective productId).
Call save_analytics_report once for each report generated, for a total of ${validProducts.length + 1} calls! Do not skip any product.

[Execution Steps]
1. Call MCP tool get_analytics_context with {"days": ${periodDays}} to fetch comprehensive data for all products (Impressions, Product Page Views, First-time Downloads, Redownloads, Revenue & Proceeds, Funnel Conversions, Acquisition Channels, Core Territories, and Version Release Milestones).
2. [Task 1: Generate & Save Portfolio Overview Report]
   - Call save_analytics_report with:
     - productId: ""
     - title: "All Products Portfolio Growth & Diagnostic Report (${periodLabel})"
     - summary: 200-300 words core summary highlighting overall matrix trajectory, key findings, and cross-product synergy opportunities.
     - content: Complete Markdown portfolio body with matrix comparison tables, overall funnel, total revenue, channel distribution, and resource allocation advice.
     - period: "${periodLabel}"
     - tags: ["Portfolio Analysis", "Matrix Growth", "All Products"]
3. [Task 2: Generate & Save Individual Product Reports (${validProducts.length} reports in total)]
   Iterate through each product in productsData:
${validProducts.map((p, idx) => `   (${idx + 1}) Product "${p.name.split(/\s[-–—]\s/)[0]}" (productId: "${p.id}"): Analyze its specific impressions, page views, downloads, conversion drop-offs, revenue, channels, top territories, and release milestone causal impact. Provide actionable ASO & product optimization recommendations and call save_analytics_report.`).join('\n')}
   Parameters for each individual report:
   - productId: the product's ID
   - title: "\${ProductName} Data Analysis & Growth Diagnostic Report (${periodLabel})"
   - summary: 200-300 words product-specific executive summary
   - content: Complete Markdown report body with funnel tables, commercialization, channel & territory breakdown, release impact, and actionable recommendations table.
   - period: "${periodLabel}"
   - tags: ["Growth Diagnostic", "Funnel Conversion", "\${ProductShortName}"]

[Standard Terminology Requirements]
- Use official Apple Analytics terms: Impressions (展示次数), Product Page Views (查看次数), First-time Downloads (首次下载), and Redownloads (重新下载).
- Do not use unofficial jargon like "曝光" or "商详".`;
      }

      return `你是资深移动应用数据增长与 ASO 专家。请连接 Growmory 本地 MCP 服务，针对当前产品矩阵执行【近${periodDays}天全产品大盘与各产品独立专属报告的批量生成任务】。

【核心任务目标】
本次需要为 Growmory 知识库同步生成并保存共 ${validProducts.length + 1} 份专业深度报告：
1. 1 份「全产品大盘综合报告」（productId 设为空字符串 ""）；
2. ${validProducts.length} 份「各产品独立专属报告」（依次为 ${validProducts.map(p => `「${p.name.split(/\s[-–—]\s/)[0]}」`).join('、')} 分别生成各自的深度诊断报告，并传入对应产品的 productId）。
每生成一份报告，均调用一次 save_analytics_report 保存入库，共需调用 save_analytics_report ${validProducts.length + 1} 次！切勿只生成大盘报告而遗漏任何一款产品！

【执行步骤】
1. 调用 MCP 工具 get_analytics_context，参数为 {"days": ${periodDays}}，获取全部产品的聚合大盘与各产品的独立数据（展示次数、查看次数、首次下载、重新下载、收入概况、转化漏斗、各渠道来源、核心国家地区及近期版本发布里程碑）。
2. 【任务一：撰写并保存全产品大盘综合报告】
   - 调用 save_analytics_report，参数设置：
     - productId: ""
     - title: "全产品矩阵 近${periodDays}天综合数据分析与增长大盘报告"
     - summary: 200~300 字大盘核心摘要。必须使用 Markdown 换行分段并用粗体标出关键数字。包含：总览、核心结论列表、跨产品矩阵协同建议。
     - content: 完整的 Markdown 大盘报告（包含各产品关键指标对比表、全盘漏斗表、商业化总收入表现、渠道宏观格局与跨产品资源分配建议）。
     - period: "近 ${periodDays} 天"
     - tags: ["大盘分析", "矩阵复盘", "全产品"]
3. 【任务二：依次为每款产品撰写并保存其独立专属报告（共 ${validProducts.length} 份）】
   针对 productsData 中的每款产品：
${validProducts.map((p, idx) => `   (${idx + 1}) 产品「${p.name.split(/\s[-–—]\s/)[0]}」(productId: "${p.id}")：深入分析该产品的独立展示次数、查看次数、首次下载、漏斗流失瓶颈、收入概况、获客渠道、国家地区分布以及关联版本上线事件因果归因，给出具体可落地的 ASO 与产品优化建议，并调用 save_analytics_report 保存。`).join('\n')}
   每款独立报告的参数要求：
   - productId: 该产品的对应 ID
   - title: "\${产品名} 近${periodDays}天数据分析与增长诊断报告"
   - summary: 200~300 字该产品专属核心摘要
   - content: 针对该产品的完整 Markdown 诊断报告（结构包含：核心发现、转化漏斗剖析表、商业化表现、渠道与地域、版本里程碑因果归因、现存瓶颈、落地行动建议表）
   - period: "近 ${periodDays} 天"
   - tags: ["数据诊断", "漏斗转化", "\${产品简名}"]

【术语严格规范（严禁违背）】
- Impressions 必须称为「展示次数」或「展示量」，**严禁使用「曝光」或「图标曝光」**；
- Page Views 必须称为「查看次数」或「产品页查看」，**严禁使用「商详」或「商详页」**；
- First-time Downloads 称为「首次下载」，Redownloads 称为「重新下载」；
- 转化漏斗链条为：展示次数 (Impressions) ➔ 查看次数 (Page Views) ➔ 首次下载 (Downloads)。

【报告正文 Markdown 排版规范（表格前后必须留空行）】
每份报告（无论是大盘报告还是各产品独立报告）均需保持专业严谨排版，包含标题分级、引用高亮（> **核心判断**：...）和清晰的 Markdown 标准表格。`;
    }

    if (lang === 'en') {
      const periodLabel = `Past ${periodDays} Days`;
      return `You are a senior mobile app growth and ASO specialist. Please connect to Growmory local MCP service and write a professional, well-formatted "Data Analysis & Growth Diagnostic Report for the Past ${periodDays} Days" for product "${productName}".

[Execution Steps]
1. Call MCP tool get_analytics_context with ${param} to fetch key metrics (Impressions, Product Page Views, First-time Downloads, Redownloads, Revenue & Proceeds, Funnel Conversion Rates, Acquisition Channels, Core Territories, and Version Release Records).
2. Analyze real data and strictly follow the [Markdown Layout & Format Requirements] below to write the comprehensive analysis report.
3. After completing the analysis, call MCP tool save_analytics_report to save the report to Growmory.

[Standard Terminology Requirements]
- Use official Apple Analytics terms: Impressions (展示次数), Product Page Views (查看次数), First-time Downloads (首次下载), and Redownloads (重新下载).
- Do not use unofficial jargon like "曝光" or "商详".

[Parameters Description]
- productId: "${targetProduct ? targetProduct.id : ''}"
- title: "${productName} Data Analysis & Growth Diagnostic Report (${periodLabel})"
- summary: 200-300 words core executive summary. **Must use Markdown line breaks and highlight key numbers in bold**, avoid unformatted long walls of text. Format:
  Start with 1-2 sentences summarizing overall metrics;
  Line break followed by **Key Findings**: presented as a numbered list 1. **[Headline]** ... 2. **[Headline]** ...;
  Line break followed by **Action Items**: presented as prioritized bullet points (P0: ... P1: ...).
- content: Complete Markdown body (must include standard tables, quote callouts, and clear chapter hierarchy)
- period: "${periodLabel}"
- tags: ["Growth Diagnostic", "Funnel Conversion", "${targetProduct ? targetProduct.name.split(' ')[0] : 'All Products'}"]

[Markdown Output Format Specification (Leave an empty line before and after tables)]

# ${productName} Data Analysis & Growth Diagnostic Report (${periodLabel})

## 1. Executive Summary
> **Key Takeaway**: [2-3 sentences distilling the most important growth highlights, trend drivers, or bottlenecks]

- **Key Metric Highlights**: [Summary bullet points]
- **Risks & Concerns**: [Summary bullet points]

## 2. Core Metrics & Funnel Conversion Analysis
Please provide the complete conversion funnel comparison table below (with blank lines before and after):

| Funnel Stage | Metric Value | Stage Conversion Rate | Benchmark & Evaluation |
| :--- | :--- | :--- | :--- |
| Impressions | [Value] | - | [Benchmark & Notes] |
| Product Page Views | [Value] | [Impression -> Page View Rate]% | [Evaluation] |
| First-time Downloads | [Value] | [Page View -> Download Rate]% | [Evaluation] |
| Overall Conversion | [Value] | [Impression -> Download Overall]% | [Evaluation] |

- **Conversion Drop-off & Funnel Attribution**: [Analyze stage with highest drop-off and potential causes]

## 3. Commercialization & Revenue Performance
- **Total Sales**: [Value] USD (based on revenueSummary.sales)
- **Developer Proceeds**: [Value] USD (based on revenueSummary.proceeds)
- **Top Revenue Markets**: [Top countries/territories by sales]

## 4. Acquisition Channels & Territory Breakdown
- **Main Acquisition Channels**:
  - **App Store Search**: [X]% downloads, performance notes...
  - **App Store Browse / Featuring**: [X]% downloads, performance notes...
  - **Web & External Referrers**: [X]% downloads, performance notes...
- **Core Territories / Countries**:
  - Top Contributing Markets: [Top 3 countries and download penetration]
  - Potential Expansion Markets: [Countries with high growth potential and opportunities]

## 5. Recent Version Release & Milestone Impact
- **Associated Version & Date**: v[Version] ([Release Date])
- **Business Impact**: [Evaluate real impact of new features/optimizations on conversion and downloads]

## 6. Key Bottlenecks & Diagnostic Issues
1. **[Issue 1]**: [Specific phenomenon and supporting data]
2. **[Issue 2]**: [Specific phenomenon and supporting data]

## 7. Actionable Recommendations
Please present specific action items in a structured table (blank lines before and after):

| Focus Area | Recommendation | Priority | Expected Impact |
| :--- | :--- | :--- | :--- |
| ASO Keyword Optimization | [Specific action, e.g. update subtitle / high-intent terms] | High | Increase search impressions and clicks |
| Storefront Creative Conversion | [Specific action, e.g. optimize 1st screenshot copy and icon] | High | Increase product page conversion rate |
| Product Experience & Retention | [Specific suggestion] | Medium | Boost retention and word-of-mouth |`;
    }

    return `你是资深移动应用数据增长与 ASO 专家。请连接 Growmory 本地 MCP 服务，为产品「${productName}」撰写一份专业严谨、排版清晰易读的《近${periodDays}天数据分析与增长诊断报告》。

【执行步骤】
1. 调用 MCP 工具 get_analytics_context，参数为 ${param}，获取关键指标（展示次数、查看次数、首次下载、重新下载、收入概况、漏斗转化率、各渠道来源、核心国家地区及版本发布记录）。
2. 分析真实数据，严格按照下方【Markdown 排版与格式要求】撰写完整分析报告。
3. 分析完成后，调用 MCP 工具 save_analytics_report 将报告保存入 Growmory。

【术语严格规范（严禁违背）】
- Impressions 必须称为「展示次数」或「展示量」，**严禁使用「曝光」或「图标曝光」**；
- Page Views 必须称为「查看次数」或「产品页查看」，**严禁使用「商详」或「商详页」**；
- First-time Downloads 称为「首次下载」，Redownloads 称为「重新下载」；
- 转化漏斗链条为：展示次数 (Impressions) ➔ 查看次数 (Page Views) ➔ 首次下载 (Downloads)。

【回填参数说明】
- productId: "${targetProduct ? targetProduct.id : ''}"
- title: "${productName} 近${periodDays}天数据分析与增长诊断报告"
- summary: 200~300 字核心摘要。**必须使用 Markdown 换行分段并用粗体标出关键数字**，禁止无换行的长段文字。格式参考：
  先用 1~2 句话概述指标总览；
  换行输出 **核心结论**：以列表形式呈现 1. **[标题]** ... 2. **[标题]** ...；
  换行输出 **优化建议**：以列表形式分点呈现（P0: ... P1: ...）。
- content: 完整的 Markdown 正文（必须包含标准表格、引用高亮与章节分级）
- period: "近 ${periodDays} 天"
- tags: ["数据诊断", "漏斗转化", "${targetProduct ? targetProduct.name.split(' ')[0] : '全产品'}"]

【必须严格遵循的 Markdown 输出格式规范（特别注意表格前后必须留空行）】

# ${productName} 近${periodDays}天数据分析与增长诊断报告

## 1. 核心发现与执行摘要 (Executive Summary)
> **核心判断**：[用 2~3 句话提炼本期最重要的增长亮点、异动原因或面临的瓶颈]

- **指标核心亮点**：[要点概述]
- **最需关注的风险**：[要点概述]

## 2. 核心指标与漏斗转化深度剖析
请务必提供下述全链路转化漏斗对比表格（表格前后必须各留一行空行）：

| 转化链路阶段 | 指标数值 | 阶段转化率 | 表现评估 |
| :--- | :--- | :--- | :--- |
| 展示次数 (Impressions) | [数值] | - | [基准与评价] |
| 查看次数 (Page Views) | [数值] | [展示➔查看转化率]% | [评估] |
| 首次下载 (Downloads) | [数值] | [查看➔下载转化率]% | [评估] |
| 全链转化率 | [数值] | [展示➔下载总转化率]% | [评估] |

- **转化断点与流失归因**：[剖析流失最大的环节及潜在原因]

## 3. 商业化与收入表现 (Revenue & Proceeds)
- **总销售额 (Sales)**：[数值] USD（根据 revenueSummary.sales 分析，若为 0 USD 则明确说明）
- **开发者分成收益 (Proceeds)**：[数值] USD
- **主要付费贡献市场**：[Top 收入国家/地区与占比]

## 4. 渠道获客贡献与地域表现
- **主要获客渠道分析**：
  - **App Store 搜索**：下载占比 [X]%，表现说明...
  - **App Store 浏览/推荐**：下载占比 [X]%，表现说明...
  - **网页与外部引荐**：下载占比 [X]%，表现说明...
- **核心国家/地区分布**：
  - 主要贡献市场：[Top 3 国家及下载渗透]
  - 潜在拓展市场：[具有增长潜力的国家与机会]

## 5. 近期版本更新与事件因果归因
- **关联版本与发布时间**：v[版本号] ([发布日期])
- **业务因果影响**：[结合版本发布及营销动态，对曲线异动进行因果归因]

## 6. 现存瓶颈与关键问题诊断
1. **[问题 1]**：[具体现象与数据佐证]
2. **[问题 2]**：[具体现象与数据佐证]

## 7. 落地行动项与增长建议 (Actionable Recommendations)
请以结构化建议表格呈现具体行动计划（表格前后必须各留一行空行）：

| 优化维度 | 具体改进建议 | 优先级 | 预期效果 |
| :--- | :--- | :--- | :--- |
| ASO 关键词优化 | [具体操作，如更新副标题/高相关热词] | 高 | 提升搜索展示与点击 |
| 产品详情页素材转化 | [具体操作，如优化第1张截图文案与图标] | 高 | 提升详情页查看与下载转化率 |
| 产品体验与迭代 | [具体建议] | 中 | 促进留存与口碑传播 |`;
  }, [targetProduct, periodDays, lang, validProducts]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      alert('复制失败，请手动展开查看并复制。');
    }
  };

  const downloadMarkdown = (report: AnalyticsReport) => {
    const blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.replace(/[^\w\u4e00-\u9fa5-_]/g, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [reports]);

  const isManualScrollRef = useRef(false);
  const manualScrollTimerRef = useRef<number | null>(null);

  // 平滑滚动定位到指定章节（带顶部偏移与防抖防闪烁）
  const scrollToHeading = (id: string) => {
    setActiveTocId(id);
    isManualScrollRef.current = true;
    if (manualScrollTimerRef.current) window.clearTimeout(manualScrollTimerRef.current);
    manualScrollTimerRef.current = window.setTimeout(() => {
      isManualScrollRef.current = false;
    }, 1000);

    const el = document.getElementById(id);
    if (el) {
      const topOffset = -85;
      const y = el.getBoundingClientRect().top + window.pageYOffset + topOffset;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
  };

  // 进入详情时自动滚动到顶部
  useEffect(() => {
    if (viewingReport) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      if (tocList.length > 0) {
        setActiveTocId(tocList[0].id);
      }
    }
  }, [viewingReport, tocList]);

  // 监听滚动自动同步当前阅读章节高亮 (Scroll-Spy)
  useEffect(() => {
    if (!viewingReport || tocList.length === 0) return;

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

        // 视口顶部偏下 140px 处作为阅读焦点判定线
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
  }, [viewingReport, tocList]);

  // 提取与当前查看报告关联的待办
  const reportTasks = useMemo(() => {
    if (!viewingReport) return [];
    const strippedContent = viewingReport.content?.replace(/[*`_#~]/g, '') || '';
    const strippedSummary = viewingReport.summary?.replace(/[*`_#~]/g, '') || '';
    return (tasks || []).filter(t => {
      if (!t.quote || !t.quote.trim()) return false;
      if (t.reportId) return t.reportId === viewingReport.id;
      const variants = getTaskQuoteVariants(t.quote);
      return variants.some(v => (
        viewingReport.content?.includes(v) ||
        viewingReport.summary?.includes(v) ||
        strippedContent.includes(v) ||
        strippedSummary.includes(v)
      ));
    });
  }, [tasks, viewingReport]);

  const highlightPlugins = useMemo(() => ({
    overview: reportTaskHighlights('overview', reportTasks),
    conclusions: reportTaskHighlights('conclusions', reportTasks),
    recommendations: reportTaskHighlights('recommendations', reportTasks),
    body: reportTaskHighlights('body', reportTasks),
  }), [reportTasks]);

  // 鼠标框选检测：计算选区位置并在上方展示悬浮操作条
  const handleContentMouseUp = () => {
    setTimeout(() => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setSelectionToolbar(null);
        return;
      }
      const rawText = sel.toString();
      const text = rawText.trim();
      if (!text) {
        setSelectionToolbar(null);
        return;
      }
      if (!readerContentRef.current) return;
      const anchorNode = sel.anchorNode;
      const focusNode = sel.focusNode;
      if (
        !readerContentRef.current.contains(anchorNode) ||
        !readerContentRef.current.contains(focusNode)
      ) {
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

  // 全局点击与滚动监听：在外部点击或滚动时自动隐藏选区悬浮工具条
  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.report-selection-toolbar') || target?.closest('.report-modal-content')) {
        return;
      }
      setSelectionToolbar(null);
    };

    const handleGlobalScroll = () => {
      if (selectionToolbar) {
        setSelectionToolbar(null);
      }
    };

    window.addEventListener('mousedown', handleGlobalMouseDown);
    window.addEventListener('scroll', handleGlobalScroll, { passive: true });
    return () => {
      window.removeEventListener('mousedown', handleGlobalMouseDown);
      window.removeEventListener('scroll', handleGlobalScroll);
    };
  }, [selectionToolbar]);

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
      h5: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h5 id={id} className="reader-h5" {...props}>{children}</h5>;
      },
      h6: ({ children, node, ...props }: any) => {
        const text = getHeadingText(children);
        const id = slugifyHeading(text);
        return <h6 id={id} className="reader-h6" {...props}>{children}</h6>;
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

  /* =========================================================================
     场景 A：整页查看报告详情（带左侧跟随滚动导航 + 表格支持 + 分区块摘要与结论）
     ========================================================================= */
  if (viewingReport) {
    const product = products.find(p => p.id === viewingReport.productId);
    const summaryBlocks = parseSummaryBlocks(viewingReport.summary);

    return (
      <div className="report-reader-view">
        {/* 顶部面包屑与操作栏 */}
        <div className="reader-top-bar">
          <div className="reader-bar-left">
            <button
              type="button"
              className="button secondary button-compact reader-back-btn"
              onClick={() => setViewingReport(null)}
            >
              <ArrowLeft size={15} />
              <span>{t("返回报告列表", "Back to Reports")}</span>
            </button>

            <span className="reader-bar-divider">/</span>

            <div className="reader-meta-group">
              <span className="reader-product-tag">
                <ProductIcon product={product} size={18} />
                <span>{product ? product.name.split(/\s[-–—]\s/)[0] : t("全产品综合", "All Products")}</span>
              </span>

              <span className={`reader-read-badge ${viewingReport.isRead ? 'read' : 'unread'}`}>
                {viewingReport.isRead ? (
                  <>
                    <Check size={11} />
                    <span>{t("已读", "Read")}</span>
                  </>
                ) : (
                  <>
                    <span className="unread-dot" />
                    <span>{t("未读", "Unread")}</span>
                  </>
                )}
              </span>

              {viewingReport.period && (
                <span className="reader-period-tag">
                  <Calendar size={12} />
                  <span>{formatReportPeriod(viewingReport.period, lang)}</span>
                </span>
              )}

              <span className="reader-date-tag">
                <Clock size={12} />
                <span>{viewingReport.createdAt ? new Date(viewingReport.createdAt).toLocaleDateString() : ''}</span>
              </span>

              {reportTasks.length > 0 && (
                <span className="reader-tasks-tag">
                  <CheckSquare size={12} />
                  <span>{reportTasks.length} {t("项待办", "tasks")}</span>
                </span>
              )}
            </div>
          </div>

          <div className="reader-bar-right">
            <button
              type="button"
              className="button secondary button-compact"
              onClick={() => void toggleReportRead(viewingReport)}
              title={viewingReport.isRead ? t("标为未读", "Mark as Unread") : t("标为已读", "Mark as Read")}
            >
              {viewingReport.isRead ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{viewingReport.isRead ? t("标为未读", "Mark as Unread") : t("标为已读", "Mark as Read")}</span>
            </button>

            <button
              type="button"
              className="button secondary button-compact"
              onClick={async () => {
                await navigator.clipboard.writeText(viewingReport.content);
                alert(t('报告 Markdown 全文已复制', 'Report markdown copied'));
              }}
            >
              <Copy size={14} />
              <span>{t("复制全文", "Copy Full Text")}</span>
            </button>

            <button
              type="button"
              className="button secondary button-compact"
              onClick={() => downloadMarkdown(viewingReport)}
            >
              <Download size={14} />
              <span>{t("导出 .md", "Export .md")}</span>
            </button>

            <button
              type="button"
              className="icon-button danger"
              title={t("删除报告", "Delete Report")}
              aria-label={t("删除报告", "Delete Report")}
              onClick={() => {
                if (confirm(t(`确定要删除分析报告「${viewingReport.title}」吗？`, `Delete report "${viewingReport.title}"?`))) {
                  void onDeleteReport(viewingReport.id);
                  setViewingReport(null);
                }
              }}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* 主体两栏布局：左侧章节导航 + 右侧正文 */}
        <div className="reader-body-layout">
          {/* 左侧分章节导航 (TOC) - 粘性固定并跟随滚动高亮 */}
          <aside className="reader-sidebar-toc">
            <div className="toc-header">
              <List size={16} className="toc-icon" />
              <span>{t("章节导航", "Table of Contents")}</span>
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
              <div className="toc-empty">{t("正文暂未检测到 Markdown 章节标题", "No section headings detected in body")}</div>
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
            <h1 className="reader-document-title">{formatReportTitle(viewingReport.title, lang)}</h1>

            {/* 核心摘要与结论分区块展示（阶段概览、核心诊断结论、增长与落地建议） */}
            {summaryBlocks && (
              <section className="reader-summary-container" aria-label={t("核心摘要与结论区块", "Summary & Conclusions")}>
                {/* 1. 阶段数据概览 */}
                {summaryBlocks.overview && (
                  <div className="summary-block summary-block-overview">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge overview-badge">
                          <TrendingUp size={16} />
                        </span>
                        <span className="block-title">{t("阶段数据表现概览", "Phase Data Overview")}</span>
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

                {/* 2. 核心诊断结论（带警告/发现图标与独立区块） */}
                {summaryBlocks.conclusions && (
                  <div className="summary-block summary-block-conclusions">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge conclusions-badge">
                          <AlertCircle size={16} />
                        </span>
                        <span className="block-title">{t("核心诊断结论与断点", "Core Diagnostic Conclusions")}</span>
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

                {/* 3. 增长与落地建议（带行动/建议图标与独立区块） */}
                {summaryBlocks.recommendations && (
                  <div className="summary-block summary-block-recommendations">
                    <div className="summary-block-header">
                      <div className="header-left">
                        <span className="block-icon-badge recommendations-badge">
                          <Sparkles size={16} />
                        </span>
                        <span className="block-title">{t("增长与落地优化建议", "Growth & Action Recommendations")}</span>
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
            )}

            {/* Markdown 正文（包含 remarkGfm 表格扩展 + 高易读性排版） */}
            <article className="reader-markdown-article" data-report-section="body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[highlightPlugins.body]} components={markdownComponents}>
                {viewingReport.content}
              </ReactMarkdown>
            </article>
          </main>
        </div>

        {/* 鼠标框选文本后的悬浮操作条 */}
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
            onMouseDown={(e) => {
              // 关键：阻止默认事件防止选区过早被取消
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const rawQuote = selectionToolbar.text.trim();
              const initialTitle = [...rawQuote].slice(0, 20).join('');
              setCreateTaskModal({
                quote: rawQuote,
                anchors: selectionToolbar.anchors,
                title: initialTitle,
                note: '',
                productId: viewingReport.productId ?? '',
                date: today(),
              });
              setSelectionToolbar(null);
              triggerAiTaskGeneration(rawQuote, viewingReport.productId, viewingReport.title);
            }}
          >
            <CheckSquare size={14} className="toolbar-icon" />
            <span>{t("创建为待办", "Create Task")}</span>
          </button>
        )}

        {/* 创建待办弹窗 */}
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
              aria-labelledby="create-task-title"
            >
              <div className="modal-top-bar">
                <h3 id="create-task-title" className="modal-title">
                  <CheckSquare size={18} className="modal-title-icon" />
                  <span>{t("创建为待办事项", "Create Task")}</span>
                </h3>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("关闭", "Close")}
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
                  <span>{t("引用报告内容", "Referenced Report Quote")}</span>
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
                    <span>{t("待办标题（要做什么）", "Task Title")}</span>
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
                      {[...createTaskModal.title].length}/20 {t("字", "chars")}
                    </span>
                    <button
                      type="button"
                      className="button small ghost ai-regen-btn"
                      disabled={isGeneratingAiTask}
                      onClick={() =>
                        triggerAiTaskGeneration(
                          createTaskModal.quote,
                          createTaskModal.productId,
                          viewingReport?.title
                        )
                      }
                      title={t("调用内置AI生成20字内待办标题", "Generate task title via AI within 20 chars")}
                    >
                      <Sparkles size={13} className={isGeneratingAiTask ? 'animate-spin' : ''} />
                      <span>{isGeneratingAiTask ? t("AI 提炼中...", "AI Generating...") : t("AI 提炼标题", "AI Title")}</span>
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
                      ? t("AI 正在提炼 20 字以内待办标题...", "AI is generating task title within 20 chars...")
                      : t("例如：优化副标题搜索热词、调整第1张截图文案", "e.g., Optimize subtitle keywords, redesign screenshot 1")
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
                  <span>{t("备注与行动计划", "Notes & Action Plan")}</span>
                  <span className="optional-tag">{t("选填", "Optional")}</span>
                </label>
                <textarea
                  id="task-note-input"
                  className="input full-width"
                  rows={3}
                  value={createTaskModal.note}
                  placeholder={t("记录执行要点、跟进人、预期效果或排期计划...", "Add notes, follow-up details, or action items...")}
                  onChange={e => setCreateTaskModal({ ...createTaskModal, note: e.target.value })}
                />
              </div>

              {/* 4. 关联产品与计划日期 */}
              <div className="modal-grid-row">
                <div className="modal-section flex-1">
                  <label className="section-label">{t("关联产品", "Product")}</label>
                  <select
                    className="select full-width"
                    value={createTaskModal.productId}
                    onChange={e => setCreateTaskModal({ ...createTaskModal, productId: e.target.value })}
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name.split(/\s[-–—]\s/)[0]}
                      </option>
                    ))}
                    <option value="">{t("全产品通用 / 不限", "All Products / None")}</option>
                  </select>
                </div>

                <div className="modal-section flex-1">
                  <label className="section-label">{t("计划完成日期", "Due Date")}</label>
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
                  {t("取消", "Cancel")}
                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={async () => {
                    if (!createTaskModal.title.trim()) {
                      alert(t("请输入待办标题", "Please enter task title"));
                      return;
                    }
                    const newTask: Task = {
                      id: uid(),
                      productId: createTaskModal.productId,
                      title: [...createTaskModal.title.trim()].slice(0, 20).join(''),
                      date: createTaskModal.date || today(),
                      done: false,
                      reportId: viewingReport.id,
                      quote: createTaskModal.quote.trim(),
                      reportAnchors: createTaskModal.anchors,
                      note: createTaskModal.note.trim(),
                    };
                    await onSaveTask?.(newTask);
                    setCreateTaskModal(null);
                    setIsGeneratingAiTask(false);
                    window.getSelection()?.removeAllRanges();
                  }}
                >
                  <CheckSquare size={14} />
                  <span>{t("确认创建待办", "Confirm Create Task")}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 查看待办详情弹窗 */}
        {viewingTask && (
          <TaskDetailModal
            task={viewingTask}
            products={products}
            onClose={() => setViewingTask(null)}
            onSaveTask={async (updated) => {
              setViewingTask(updated);
              await onSaveTask?.(updated);
            }}
            onDeleteTask={async (id) => {
              await onDeleteTask?.(id);
              setViewingTask(null);
            }}
            onNavigateTasks={onNavigateTasks}
            onNavigateReport={(repId, q) => {
              setViewingTask(null);
              if (viewingReport.id === repId) {
                scrollToQuote(q);
              } else {
                const target = reports.find(r => r.id === repId);
                if (target) {
                  setViewingReport(target);
                  setTimeout(() => scrollToQuote(q), 200);
                }
              }
            }}
          />
        )}
      </div>
    );
  }

  /* =========================================================================
     场景 B：报告列表页（罗列报告，点击进入整页查看）
     ========================================================================= */
  return (
    <div className="reports-clean-view">
      {/* 顶部标题与唯一的「生成报告」按钮 */}
      <section className="panel reports-top-header">
        <div className="reports-header-left">
          <h3>
            <FileText size={18} className="header-icon" />
            <span>{t("分析报告", "Analytics Reports")}</span>
            <span className="reports-total-badge">{reports.length}</span>
            {unreadCount > 0 && (
              <span className="reports-unread-total-badge">
                <span className="unread-dot" />
                <span>{unreadCount} {t("未读", "unread")}</span>
              </span>
            )}
          </h3>
          <p>{t("由外部 AI Agent 通过 Growmory MCP 自动生成的数据分析与增长诊断报告。", "Data analysis and growth diagnostic reports generated automatically by external AI Agents via Growmory MCP.")}</p>
        </div>

        <button
          type="button"
          className="button primary generate-report-btn"
          onClick={() => {
            setShowGenerateModal(true);
            setCopied(false);
          }}
        >
          <Sparkles size={16} />
          <span>{t("生成报告", "Generate Report")}</span>
        </button>
      </section>

      {/* 罗列报告列表 */}
      <section className="panel reports-table-panel">
        {sortedReports.length > 0 ? (
          <div className="reports-list-container">
            {sortedReports.map(report => {
              const product = products.find(p => p.id === report.productId);
              return (
                <div
                  key={report.id}
                  className={`report-item-row ${!report.isRead ? 'is-unread' : ''}`}
                  onClick={() => void openReport(report)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter') void openReport(report);
                  }}
                >
                  <div className="item-icon-box">
                    <ProductIcon product={product} size={42} />
                  </div>

                  <div className="item-content-box">
                    <div className="item-meta-line">
                      <span className="item-product-name">
                        {product ? product.name.split(/\s[-–—]\s/)[0] : t("全产品综合", "All Products")}
                      </span>

                      {report.isRead ? (
                        <span className="report-badge-read">
                          <Check size={11} />
                          <span>{t("已读", "Read")}</span>
                        </span>
                      ) : (
                        <span className="report-badge-unread">
                          <span className="unread-dot" />
                          <span>{t("未读", "Unread")}</span>
                        </span>
                      )}

                      <span className="item-date">
                        <Calendar size={12} />
                        {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''}
                      </span>
                      {report.period && <span className="item-period">{formatReportPeriod(report.period, lang)}</span>}
                    </div>

                    <h4 className="item-title">{formatReportTitle(report.title, lang)}</h4>

                    {report.summary && (
                      <p className="item-summary">{report.summary}</p>
                    )}
                  </div>

                  <div className="item-action-box" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="button secondary button-compact"
                      onClick={() => void openReport(report)}
                    >
                      <span>{t("查看报告", "View Report")}</span>
                      <ArrowRight size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      title={t("删除报告", "Delete Report")}
                      aria-label={t("删除报告", "Delete Report")}
                      onClick={() => {
                        if (confirm(t(`确定要删除分析报告「${report.title}」吗？`, `Delete report "${report.title}"?`))) {
                          void onDeleteReport(report.id);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="reports-empty-box">
            <FileText size={42} className="empty-icon" />
            <h4>{t("暂无分析报告", "No analytics reports yet")}</h4>
            <p>{t("点击上方「生成报告」选择产品与时间范围，复制提示词给 Agent 即可自动生成首份报告。", "Click \"Generate Report\" above, select product and time range, and send prompt to Agent to generate.")}</p>
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setShowGenerateModal(true);
                setCopied(false);
              }}
            >
              <Sparkles size={15} />
              <span>{t("生成报告", "Generate Report")}</span>
            </button>
          </div>
        )}
      </section>

      {/* 点击「生成报告」后的模态弹窗：居中浮层 */}
      {showGenerateModal && (
        <div
          className="report-modal-backdrop"
          onClick={() => setShowGenerateModal(false)}
        >
          <div
            className="report-modal-content generate-modal"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gen-modal-title"
          >
            <div className="modal-top-bar">
              <h3 id="gen-modal-title" className="modal-title">
                <Sparkles size={18} />
                <span>{t("生成数据分析报告", "Generate Growth Diagnostic Report")}</span>
              </h3>
              <button
                type="button"
                className="icon-button"
                aria-label={t("关闭", "Close")}
                onClick={() => setShowGenerateModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* 1、选择产品 */}
            <div className="modal-section">
              <label className="section-label">{t("1. 选择分析产品", "1. Select Product")}</label>
              <div className="product-picker-grid">
                <button
                  type="button"
                  className={`product-picker-card ${selectedProduct === '' ? 'selected' : ''}`}
                  onClick={() => setSelectedProduct('')}
                >
                  <div className="card-icon-wrap">
                    <ProductIcon size={36} />
                  </div>
                  <div className="card-info">
                    <span className="card-name">{t("全部产品", "All Products")}</span>
                    <span className="card-sub">{t("全矩阵综合分析", "Portfolio Matrix Analysis")}</span>
                  </div>
                  {selectedProduct === '' && <span className="selected-dot" />}
                </button>

                {products.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    className={`product-picker-card ${selectedProduct === p.id ? 'selected' : ''}`}
                    onClick={() => setSelectedProduct(p.id)}
                  >
                    <div className="card-icon-wrap">
                      <ProductIcon product={p} size={36} />
                    </div>
                    <div className="card-info">
                      <span className="card-name">{p.name.split(/\s[-–—]\s/)[0]}</span>
                      <span className="card-sub">{p.platform || 'App'}</span>
                    </div>
                    {selectedProduct === p.id && <span className="selected-dot" />}
                  </button>
                ))}
              </div>
            </div>

            {/* 2、选择时间范围 */}
            <div className="modal-section">
              <label className="section-label">
                <Clock size={14} className="label-icon" />
                <span>{t("2. 选择分析时间范围", "2. Select Time Range")}</span>
              </label>
              <div className="period-pills-row">
                {[
                  { days: 7, label: t('近 7 天', 'Past 7 Days'), desc: t('周度敏捷复盘', 'Weekly agile retrospective') },
                  { days: 14, label: t('近 14 天', 'Past 14 Days'), desc: t('双周版本监控', 'Bi-weekly release monitoring') },
                  { days: 30, label: t('近 30 天', 'Past 30 Days'), desc: t('月度深度诊断', 'Monthly deep diagnosis') },
                  { days: 90, label: t('近 90 天', 'Past 90 Days'), desc: t('季度增长趋势', 'Quarterly growth trend') },
                ].map(opt => (
                  <button
                    key={opt.days}
                    type="button"
                    className={`period-pill-btn ${periodDays === opt.days ? 'active' : ''}`}
                    onClick={() => setPeriodDays(opt.days)}
                  >
                    <span className="pill-title">{opt.label}</span>
                    <span className="pill-desc">{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3、复制提示词 */}
            <div className="modal-section prompt-section">
              <div className="prompt-action-header">
                <label className="section-label">{t("3. 复制提示词，发送给 Agent", "3. Copy Prompt and Send to Agent")}</label>
                <button
                  type="button"
                  className="text-button toggle-prompt-btn"
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                >
                  {showPromptPreview ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  <span>{showPromptPreview ? t('收起预览', 'Collapse Preview') : t('查看完整提示词', 'View Full Prompt')}</span>
                </button>
              </div>

              {selectedProduct === '' && (
                <div className="batch-mode-notice-pill">
                  <Sparkles size={14} className="notice-icon" />
                  <span>
                    {t(
                      `自动批处理：将同步生成 1 份全产品大盘报告 + 全部 ${validProducts.length} 款产品的独立专属报告（共 ${validProducts.length + 1} 份）。`,
                      `Batch Mode: Will synchronously generate 1 portfolio report + ${validProducts.length} individual product reports (total ${validProducts.length + 1} reports).`
                    )}
                  </span>
                </div>
              )}

              <div className="copy-action-box">
                <button
                  type="button"
                  className={`button primary copy-btn-large ${copied ? 'copied' : ''}`}
                  onClick={copyPrompt}
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                  <span>
                    {copied
                      ? t('提示词已成功复制到剪贴板！', 'Prompt copied to clipboard!')
                      : selectedProduct === ''
                        ? (lang === 'en'
                            ? `Copy batch prompt for "All Products (incl. ${validProducts.length} individual reports) · Past ${periodDays} Days"`
                            : `复制「全部产品（含各产品独立报告）· 近${periodDays}天」分析提示词`)
                        : (lang === 'en'
                            ? `Copy diagnostic prompt for "${targetProduct ? targetProduct.name.split(' ')[0] : 'Product'} · Past ${periodDays} Days"`
                            : `复制「${targetProduct ? targetProduct.name.split(' ')[0] : '产品'} · 近${periodDays}天」分析提示词`)}
                  </span>
                </button>

                <p className="copy-help-hint">
                  {selectedProduct === ''
                    ? t(
                        "提示词复制后发送给 AI Agent。Agent 将依次生成 1 份全盘报告及各产品独立专属报告，并自动回填入库。",
                        "After copying prompt, send to AI Agent. The Agent will synchronously generate 1 portfolio report plus individual reports for all products and save them back automatically."
                      )
                    : t(
                        "提示词复制后，直接发送给已连接 Growmory MCP 的 AI Agent（如 Cursor、Claude 等），Agent 分析完成后将自动回填入库。",
                        "After copying prompt, send to your MCP-connected AI Agent (e.g. Cursor, Claude). It will save results back to Growmory automatically."
                      )}
                </p>
              </div>

              {showPromptPreview && (
                <div className="modal-prompt-preview">
                  <textarea
                    readOnly
                    rows={7}
                    value={prompt}
                    onFocus={e => e.target.select()}
                  />
                </div>
              )}
            </div>

            <div className="modal-bottom-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setShowGenerateModal(false)}
              >
                {t("完成", "Done")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
