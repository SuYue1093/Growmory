import React, { useState, useMemo, useEffect } from 'react';
import {
  Compass,
  Bookmark,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Layers3,
  FileText,
  CheckSquare,
  Sparkles,
  ShieldAlert,
  RotateCcw,
  SlidersHorizontal,
  BookOpen,
  Share2,
  X,
} from 'lucide-react';
import type { Data, Product, BriefingItem, BriefingItemCategory, Doc, Content } from './types';
import { today, uid } from './types';
import { useI18n } from './i18n';
import { getBriefingHandoverPrompt, getBriefingResearchPrompt } from './briefing-agent-prompt';
import { ListPagination, listPageSize } from './list-pagination';
import { BriefingSearchConfigModal } from './briefing-search-config-modal';

export type BriefingsViewProps = {
  data: Data;
  save: (updater: (data: Data) => void) => Promise<boolean | void>;
  copy: (text: string) => void;
  onGo?: (page: any) => void;
  shortName: (product?: Product) => string;
  renderIcon?: (product?: Product, size?: number) => React.ReactNode;
};

const CATEGORY_MAP: Record<BriefingItemCategory, { label: string; desc: string; colorClass: string }> = {
  platform_change: {
    label: '平台与政策',
    desc: '审核规则、商店与支付政策变动',
    colorClass: 'tag-indigo',
  },
  competitor_move: {
    label: '竞品动态',
    desc: '上新、定价变动、差评聚集点',
    colorClass: 'tag-rose',
  },
  user_voice: {
    label: '用户原话',
    desc: '目标用户正在公开询问的痛点',
    colorClass: 'tag-emerald',
  },
  followup_lead: {
    label: '可跟进线索',
    desc: '可转化为营销选题或开发待办',
    colorClass: 'tag-amber',
  },
  industry_trend: {
    label: '行业与AI动态',
    desc: 'AI 工具与模型升级、技术栈突破',
    colorClass: 'tag-purple',
  },
  growth_inspiration: {
    label: '出海与增长灵感',
    desc: 'Product Hunt/X/Reddit 热门产品打法',
    colorClass: 'tag-sky',
  },
};

function extractDomain(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return urlStr;
  }
}

export function BriefingsView({
  data,
  save,
  copy,
  onGo,
  shortName,
  renderIcon,
}: BriefingsViewProps) {
  const { t } = useI18n();
  const [currentTab, setCurrentTab] = useState<'today' | 'saved'>('today');

  // Today view filters
  const [todayScopeFilter, setTodayScopeFilter] = useState<'all' | 'product' | 'ecosystem'>('all');
  const [todayCategoryFilter, setTodayCategoryFilter] = useState<string>('all');
  const [todayPage, setTodayPage] = useState<number>(1);

  // Search config modal state
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // Filter state for "saved" view
  const [savedProductFilter, setSavedProductFilter] = useState<string>('all');
  const [savedCategoryFilter, setSavedCategoryFilter] = useState<string>('all');
  const [savedPage, setSavedPage] = useState<number>(1);

  // Active prompt copy state
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedResearchPrompt, setCopiedResearchPrompt] = useState(false);

  // Today date
  const todayStr = useMemo(() => today(), []);

  // Today's briefing
  const todayBriefing = useMemo(() => {
    return (data.briefings || []).find((b) => b.date === todayStr);
  }, [data.briefings, todayStr]);

  // Selected briefing for date switching (defaults to today's if exists, or latest)
  const [selectedBriefingDate, setSelectedBriefingDate] = useState<string>(todayStr);

  const activeBriefing = useMemo(() => {
    if (selectedBriefingDate === todayStr) {
      return todayBriefing || null;
    }
    return (data.briefings || []).find((b) => b.date === selectedBriefingDate) || null;
  }, [data.briefings, selectedBriefingDate, todayBriefing, todayStr]);

  // Available briefing dates (always guaranteed to have todayStr first)
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    dates.add(todayStr);
    for (const b of data.briefings || []) {
      if (b.date) dates.add(b.date);
    }
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [data.briefings, todayStr]);

  // Today's briefing items
  const activeItems = useMemo(() => {
    if (!activeBriefing) return [];
    const itemIds = new Set(activeBriefing.itemIds || []);
    return (data.briefingItems || []).filter(
      (i) => itemIds.has(i.id) || i.briefingId === activeBriefing.id
    );
  }, [data.briefingItems, activeBriefing]);

  // Scope count calculations for quick filter pills
  const productItemCount = useMemo(() => {
    return activeItems.filter((i) => i.productId && i.productId !== 'general').length;
  }, [activeItems]);

  const ecosystemItemCount = useMemo(() => {
    return activeItems.filter((i) => !i.productId || i.productId === 'general').length;
  }, [activeItems]);

  // Filtered active items for today
  const displayedActiveItems = useMemo(() => {
    return activeItems.filter((item) => {
      const isEcosystem = !item.productId || item.productId === 'general';
      if (todayScopeFilter === 'product' && isEcosystem) return false;
      if (todayScopeFilter === 'ecosystem' && !isEcosystem) return false;
      if (todayCategoryFilter !== 'all' && item.category !== todayCategoryFilter) return false;
      return true;
    });
  }, [activeItems, todayScopeFilter, todayCategoryFilter]);

  // Full verification items (core cards)
  const fullActiveItems = useMemo(() => {
    return displayedActiveItems.filter((i) => i.verification === 'full');
  }, [displayedActiveItems]);

  // Paged full items for today (20 items per page)
  const pagedFullItems = useMemo(() => {
    const start = (todayPage - 1) * listPageSize;
    return fullActiveItems.slice(start, start + listPageSize);
  }, [fullActiveItems, todayPage]);

  // Keep todayPage within valid range
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(fullActiveItems.length / listPageSize));
    if (todayPage > maxPage) setTodayPage(maxPage);
  }, [fullActiveItems.length, todayPage]);

  // Collapsed state for snippet items (default expanded)
  const [expandSnippets, setExpandSnippets] = useState<boolean>(true);

  // Reason modal / inline input state
  const [savingReasonItemId, setSavingReasonItemId] = useState<string | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Saved items for "saved" tab
  const allSavedItems = useMemo(() => {
    let list = (data.briefingItems || []).filter((i) => i.status === 'saved');
    if (savedProductFilter !== 'all') {
      if (savedProductFilter === 'general') {
        list = list.filter((i) => !i.productId || i.productId === 'general');
      } else {
        list = list.filter((i) => i.productId === savedProductFilter);
      }
    }
    if (savedCategoryFilter !== 'all') {
      list = list.filter((i) => i.category === savedCategoryFilter);
    }
    return list;
  }, [data.briefingItems, savedProductFilter, savedCategoryFilter]);

  // Paged saved items (20 items per page)
  const pagedSavedItems = useMemo(() => {
    const start = (savedPage - 1) * listPageSize;
    return allSavedItems.slice(start, start + listPageSize);
  }, [allSavedItems, savedPage]);

  // Keep savedPage within valid range
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(allSavedItems.length / listPageSize));
    if (savedPage > maxPage) setSavedPage(maxPage);
  }, [allSavedItems.length, savedPage]);

  // Handover prompt text
  const handoverPrompt = useMemo(() => {
    return getBriefingHandoverPrompt({ timezone: 'Asia/Shanghai', budget: '15 分钟' });
  }, []);

  const handleCopyPrompt = () => {
    copy(handoverPrompt);
    setCopiedPrompt(true);
    showToast(t('已复制交接提示词！可发送给外部 Agent', 'Prompt copied! Send to external agent'));
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  // Re-search prompt text
  const researchPrompt = useMemo(() => {
    return getBriefingResearchPrompt({ timezone: 'Asia/Shanghai', budget: '15 分钟' });
  }, []);

  const handleCopyResearchPrompt = () => {
    copy(researchPrompt);
    setCopiedResearchPrompt(true);
    showToast(t('已复制再次搜索提示词！可发送给外部 Agent 立即重搜', 'Re-search prompt copied! Send to external agent'));
    setTimeout(() => setCopiedResearchPrompt(false), 2500);
  };

  // Actions on item: Keep (留下)
  const handleOpenReasonDialog = (item: BriefingItem) => {
    setSavingReasonItemId(item.id);
    setReasonInput(item.savedReason || '');
  };

  const handleConfirmSaveItem = async (item: BriefingItem) => {
    await save((d) => {
      d.briefingItems = d.briefingItems || [];
      const target = d.briefingItems.find((i) => i.id === item.id);
      if (target) {
        target.status = 'saved';
        target.savedReason = reasonInput.trim();
        target.savedAt = new Date().toISOString();
        target.isRead = true;
        if (!target.readAt) target.readAt = new Date().toISOString();
        target.updatedAt = new Date().toISOString();
      }
    });
    setSavingReasonItemId(null);
    setReasonInput('');
    showToast(t('已留下该条资讯（将作为下一次检索偏好）', 'Item kept! Preference will feed next run'));
  };

  // User opened original URL: mark as read
  const handleOpenOriginalUrl = async (item: BriefingItem) => {
    if (!item.isRead) {
      await save((d) => {
        d.briefingItems = d.briefingItems || [];
        const target = d.briefingItems.find((i) => i.id === item.id);
        if (target) {
          target.isRead = true;
          target.readAt = new Date().toISOString();
          target.updatedAt = new Date().toISOString();
        }
      });
    }
  };

  // Action on item: Dismiss (忽略)
  const handleDismissItem = async (item: BriefingItem) => {
    await save((d) => {
      d.briefingItems = d.briefingItems || [];
      const target = d.briefingItems.find((i) => i.id === item.id);
      if (target) {
        target.status = 'dismissed';
        target.updatedAt = new Date().toISOString();
      }
    });
    showToast(t('已忽略该条资讯（14 天内不再推送相同链接）', 'Item dismissed! URL won’t return for 14 days'));
  };

  // Action on item: Restore (恢复)
  const handleRestoreItem = async (item: BriefingItem) => {
    await save((d) => {
      d.briefingItems = d.briefingItems || [];
      const target = d.briefingItems.find((i) => i.id === item.id);
      if (target) {
        target.status = 'new';
        target.updatedAt = new Date().toISOString();
      }
    });
  };

  // Action on item: Delete (彻底删除资讯条目)
  const handleDeleteItem = async (e: React.MouseEvent, item: BriefingItem) => {
    e.stopPropagation();
    e.preventDefault();
    if (item.status === 'saved') {
      if (!window.confirm(t('该条资讯处于「已留下」状态，确定要删除吗？', 'This briefing item is saved. Are you sure you want to delete it?'))) {
        return;
      }
    }
    await save((d) => {
      d.briefingItems = (d.briefingItems || []).filter((i) => i.id !== item.id);
      if (d.briefings) {
        d.briefings.forEach((b) => {
          if (b.itemIds) {
            b.itemIds = b.itemIds.filter((id) => id !== item.id);
          }
        });
      }
    });
    showToast(t('已删除该条资讯', 'Briefing item deleted'));
  };

  // Phase 4: Actionability Bridge - Convert to Knowledge Doc (转为知识文档 / 竞品应对备忘录)
  const handleConvertToDoc = async (item: BriefingItem) => {
    const targetPid = (item.productId && item.productId !== 'general')
      ? item.productId
      : (data.products[0]?.id || '');
    const nowIso = new Date().toISOString();
    const docTitle = `[外部情报] ${item.title}`;
    const docBody = `# 外部情报分析：${item.title}

- **来源平台**：[${item.platform}](${item.url})
- **发布时间**：${item.publishedAt || item.checkedAt || todayStr}
- **留下原因**：${item.savedReason || t('高价值外部参考', 'High value reference')}

## 核心摘要
${item.summary}

## 关注原因与对本产品的启发
${item.relevance}

## 应对策略与跟进建议
- [ ] 针对上述变化评估我方产品的功能定位与差异化
- [ ] 观察竞品后续版本走势与社群用户真实反馈
`;

    await save((d) => {
      d.docs = d.docs || [];
      const newDoc: Doc = {
        id: uid(),
        productId: targetPid,
        title: docTitle,
        body: docBody,
        status: 'confirmed',
        updatedAt: nowIso,
        history: [],
        source: t('资讯简报转入', 'Imported from Briefings'),
      };
      d.docs.unshift(newDoc);

      const target = (d.briefingItems || []).find((i) => i.id === item.id);
      if (target) {
        target.linkedDocId = newDoc.id;
        target.updatedAt = nowIso;
      }
    });
    showToast(t('已成功转为产品知识库文档！可在文档中心查看', 'Converted to Product Doc! Available in Knowledge'));
  };

  // Convert to Task (转为待办)
  const handleConvertToTask = async (item: BriefingItem) => {
    const targetPid = (item.productId && item.productId !== 'general')
      ? item.productId
      : (data.products[0]?.id || '');
    const nowIso = new Date().toISOString();

    await save((d) => {
      d.tasks = d.tasks || [];
      const newTask = {
        id: uid(),
        productId: targetPid,
        title: `[资讯线索] ${item.title.slice(0, 30)}`,
        done: false,
        date: todayStr,
        note: `${t('相关性说明：', 'Relevance: ')}${item.relevance}\n${t('原文链接：', 'URL: ')}${item.url}`,
      };
      d.tasks.unshift(newTask);

      const target = (d.briefingItems || []).find((i) => i.id === item.id);
      if (target) {
        target.linkedTaskId = newTask.id;
        target.updatedAt = nowIso;
      }
    });
    showToast(t('已成功转化为待办任务！可在工作台查看', 'Converted to Task! Check on Workbench'));
  };

  // Convert to Marketing Content (转为营销选题)
  const handleConvertToMarketing = async (item: BriefingItem) => {
    const targetPid = (item.productId && item.productId !== 'general')
      ? item.productId
      : (data.products[0]?.id || '');
    const nowIso = new Date().toISOString();

    await save((d) => {
      d.contents = d.contents || [];
      const newContent: Content = {
        id: uid(),
        productId: targetPid,
        productIds: targetPid ? [targetPid] : [],
        title: item.title,
        body: '',
        explanation: item.relevance,
        channel: item.platform,
        url: item.url,
        status: 'draft',
        date: todayStr,
        tags: [],
        createdAt: nowIso,
      };
      d.contents.unshift(newContent);

      const target = (d.briefingItems || []).find((i) => i.id === item.id);
      if (target) {
        target.linkedContentId = newContent.id;
        target.updatedAt = nowIso;
      }
    });
    showToast(t('已转化为营销选题草稿！可在营销内容页编辑', 'Created Marketing Lead draft! View in Marketing'));
  };

  // Format run time
  const formatRunTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  };

  // User read & verification badge helper: "已读原文" only shows after user has opened/read it
  const renderReadBadge = (item: BriefingItem) => {
    if (item.isRead) {
      return (
        <span
          className="briefing-badge badge-green"
          title={
            item.readAt
              ? `${t('已于', 'Read at')} ${formatRunTime(item.readAt)} ${t('打开阅读原文', 'opened')}`
              : t('已打开阅读原文', 'Original text read')
          }
        >
          <CheckCircle2 size={11} /> {t('已读原文', 'Read Original')}
        </span>
      );
    }
    if (item.verification === 'snippet') {
      return (
        <span className="briefing-badge badge-amber" title={t('页面打不开或受限，仅获取公开搜索摘要', 'Only search summary available')}>
          <AlertCircle size={11} /> {t('仅搜索摘要', 'Snippet')}
        </span>
      );
    }
    if (item.verification === 'unreachable') {
      return (
        <span className="briefing-badge badge-gray" title={t('受登录墙或验证码限制，页面无法打开', 'Blocked or unreachable')}>
          <ShieldAlert size={11} /> {t('打不开', 'Unreachable')}
        </span>
      );
    }
    return null;
  };

  // Platform pill badge helper
  const renderPlatformTag = (platform: string) => {
    const p = (platform || '').toLowerCase();
    let tagClass = 'platform-tag-default';
    let label = platform || 'Web';

    if (p.includes('product hunt') || p.includes('producthunt')) {
      tagClass = 'platform-tag-ph';
      label = 'Product Hunt';
    } else if (p === 'x' || p.includes('twitter')) {
      tagClass = 'platform-tag-x';
      label = 'X';
    } else if (p.includes('reddit')) {
      tagClass = 'platform-tag-reddit';
      label = 'Reddit';
    } else if (p.includes('app store') || p.includes('apple') || p.includes('ios')) {
      tagClass = 'platform-tag-apple';
      label = 'App Store';
    } else if (p.includes('hacker news') || p.includes('hackernews') || p === 'hn') {
      tagClass = 'platform-tag-hn';
      label = 'Hacker News';
    } else if (p.includes('小红书') || p.includes('redbook')) {
      tagClass = 'platform-tag-xhs';
      label = '小红书';
    } else if (p.includes('头条') || p.includes('toutiao')) {
      tagClass = 'platform-tag-toutiao';
      label = '今日头条';
    }

    return <span className={`platform-pill ${tagClass}`}>{label}</span>;
  };

  // Render a briefing item card (shared between full and snippet / restricted items)
  const renderBriefingItemCard = (item: BriefingItem, isSnippet = false) => {
    const isEcosystem = !item.productId || item.productId === 'general';
    const prod = !isEcosystem ? data.products.find((p) => p.id === item.productId) : null;
    const catMeta = CATEGORY_MAP[item.category] || {
      label: item.category,
      colorClass: 'tag-gray',
    };

    return (
      <div key={item.id} className={`briefing-item-card status-${item.status} ${isSnippet ? 'snippet-card' : ''}`}>
        {/* 卡片头部行 */}
        <div className="item-card-header">
          <div className="header-left">
            {renderPlatformTag(item.platform)}

            {isEcosystem ? (
              <span className="scope-pill scope-ecosystem" title={t('独立开发、出海与行业通用生态', 'Indie dev & ecosystem')}>
                <Sparkles size={11} />
                <span>{t('独立开发生态', 'Ecosystem')}</span>
              </span>
            ) : (
              <span className="scope-pill scope-product" title={prod ? prod.name : item.productId}>
                {renderIcon ? renderIcon(prod || undefined, 12) : <Layers3 size={12} />}
                <span>{prod ? shortName(prod) : item.productId}</span>
              </span>
            )}

            <span className={`category-pill ${catMeta.colorClass}`}>
              {catMeta.label}
            </span>
          </div>

          <div className="header-right">
            {item.publishedAt && (
              <span className="time-caption" title={item.publishedAt}>
                <Clock size={11} /> {item.publishedAt}
              </span>
            )}
            {renderReadBadge(item)}
            {item.linkedDocId && (
              <span className="item-action-link-pill pill-doc" title={t('已沉淀至产品文档', 'Saved to Product Doc')}>
                <BookOpen size={10} /> {t('已转文档', 'Doc')}
              </span>
            )}
            {item.linkedTaskId && (
              <span className="item-action-link-pill pill-task" title={t('已转为待办任务', 'Converted to Todo')}>
                <CheckSquare size={10} /> {t('已转待办', 'Todo')}
              </span>
            )}
            {item.linkedContentId && (
              <span className="item-action-link-pill pill-content" title={t('已转为营销选题草稿', 'Converted to Marketing Lead')}>
                <FileText size={10} /> {t('已转选题', 'Lead')}
              </span>
            )}
            {item.status === 'saved' && (
              <span className="item-status-pill status-saved">
                <Bookmark size={11} /> {t('已留下', 'Saved')}
              </span>
            )}
            {item.status === 'dismissed' && (
              <span className="item-status-pill status-dismissed">
                {t('已忽略', 'Dismissed')}
              </span>
            )}
            <button
              type="button"
              className="item-delete-btn"
              onClick={(e) => void handleDeleteItem(e, item)}
              title={t('删除资讯', 'Delete briefing')}
              aria-label={t('删除资讯', 'Delete briefing')}
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* 标题 */}
        <h3 className="item-title">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void handleOpenOriginalUrl(item)}
          >
            <span>{item.title}</span>
            <ExternalLink size={13} className="external-icon" />
          </a>
        </h3>

        {/* 摘要正文 */}
        <p className="item-summary">{item.summary}</p>

        {/* 为什么关注 / 相关性说明 */}
        {item.relevance && (
          <div className="item-relevance-callout">
            <span className="callout-label">💡 {t('为什么关注：', 'Why It Matters: ')}</span>
            <span className="callout-text">{item.relevance}</span>
          </div>
        )}

        {/* 跨平台多方视角 / 事件聚类 */}
        {item.relatedSources && item.relatedSources.length > 0 && (
          <div className="item-related-sources-panel">
            <span className="related-sources-header">
              <Share2 size={11} />
              <span>{t('跨平台多方视角 / 关联报道：', 'Cross-Platform Perspectives:')}</span>
            </span>
            <div className="related-sources-chips">
              {item.relatedSources.map((rs, idx) => (
                <a
                  key={idx}
                  href={rs.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="related-source-chip"
                  title={rs.title}
                >
                  <span className="chip-platform">{rs.platform}</span>
                  <span className="chip-title">{rs.title}</span>
                  <ExternalLink size={10} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* 留下原因标签 */}
        {item.status === 'saved' && item.savedReason && (
          <div className="item-saved-reason-banner">
            <span className="saved-reason-label">📌 {t('留下原因：', 'Saved Reason: ')}</span>
            <span className="saved-reason-text">{item.savedReason}</span>
          </div>
        )}

        {/* 内联输入原因 */}
        {savingReasonItemId === item.id && (
          <div className="reason-input-inline-box">
            <label>
              {t('留下原因（可选，作为下次运行偏好）：', 'Saved reason (optional, feeds next run):')}
            </label>
            <div className="reason-input-row">
              <input
                type="text"
                placeholder={t('例如：准备发一篇相关教程 / 这个竞品定价值得持续关注', 'e.g., Good tutorial topic / Watch their pricing')}
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleConfirmSaveItem(item);
                  if (e.key === 'Escape') setSavingReasonItemId(null);
                }}
              />
              <button
                type="button"
                className="button primary-btn"
                onClick={() => void handleConfirmSaveItem(item)}
              >
                {t('确认留下', 'Save')}
              </button>
              <button
                type="button"
                className="button secondary-btn"
                onClick={() => setSavingReasonItemId(null)}
              >
                {t('取消', 'Cancel')}
              </button>
            </div>
          </div>
        )}

        {/* 底部操作工具栏 */}
        <div className="item-card-footer">
          <div className="footer-meta">
            <span className="url-domain" title={item.url}>
              {extractDomain(item.url)}
            </span>
          </div>

          <div className="footer-actions">
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="button action-btn view-origin-btn"
              onClick={() => void handleOpenOriginalUrl(item)}
            >
              <ExternalLink size={13} />
              <span>{t('打开原文', 'Open')}</span>
            </a>

            {item.status === 'new' && (
              <>
                <button
                  type="button"
                  className="button action-btn save-btn"
                  onClick={() => handleOpenReasonDialog(item)}
                >
                  <Bookmark size={13} />
                  <span>{t('留下', 'Keep')}</span>
                </button>
                <button
                  type="button"
                  className="button action-btn dismiss-btn"
                  onClick={() => handleDismissItem(item)}
                >
                  <span>{t('忽略', 'Dismiss')}</span>
                </button>
              </>
            )}

            {item.status === 'saved' && (
              <div className="saved-item-actions">
                <button
                  type="button"
                  className="button action-btn convert-btn"
                  onClick={() => handleConvertToDoc(item)}
                  title={t('沉淀为产品知识库文档', 'Save to Knowledge Doc')}
                >
                  <BookOpen size={13} />
                  <span>{t('转为文档', 'To Doc')}</span>
                </button>
                <button
                  type="button"
                  className="button action-btn convert-btn"
                  onClick={() => handleConvertToTask(item)}
                  title={t('转为待办任务', 'Convert to Todo')}
                >
                  <CheckSquare size={13} />
                  <span>{t('转为待办', 'To Todo')}</span>
                </button>
                <button
                  type="button"
                  className="button action-btn convert-btn"
                  onClick={() => handleConvertToMarketing(item)}
                  title={t('转为营销选题草稿', 'Convert to Marketing Lead')}
                >
                  <FileText size={13} />
                  <span>{t('转为选题', 'To Marketing')}</span>
                </button>
                <button
                  type="button"
                  className="button action-btn edit-reason-btn"
                  onClick={() => handleOpenReasonDialog(item)}
                >
                  <span>{item.savedReason ? t('改原因', 'Edit Reason') : t('附原因', 'Add Reason')}</span>
                </button>
                <button
                  type="button"
                  className="button action-btn text-dismiss-btn"
                  onClick={() => handleDismissItem(item)}
                >
                  <span>{t('改为忽略', 'Dismiss')}</span>
                </button>
              </div>
            )}

            {item.status === 'dismissed' && (
              <button
                type="button"
                className="button action-btn restore-btn"
                onClick={() => handleRestoreItem(item)}
              >
                <span>{t('撤销忽略', 'Restore')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="briefings-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="briefing-toast-banner" role="status">
          <CheckCircle2 size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 顶部主 Nav Bar（对标 App 数据分析模块）：左侧切换 Tab，右侧「复制提示词」按钮 */}
      <div className="briefings-main-nav-bar">
        <div className="segmented briefings-main-tabs" role="group" aria-label={t('资讯分类切换', 'Briefing Tabs')}>
          <button
            type="button"
            className={currentTab === 'today' ? 'active' : ''}
            onClick={() => setCurrentTab('today')}
          >
            <Compass size={15} />
            <span>{t('今日简报', "Today's Briefing")}</span>
          </button>
          <button
            type="button"
            className={currentTab === 'saved' ? 'active' : ''}
            onClick={() => setCurrentTab('saved')}
          >
            <Bookmark size={15} />
            <span>{t('留下的资讯', 'Saved Items')}</span>
            {allSavedItems.length > 0 && <small className="tab-count-badge">{allSavedItems.length}</small>}
          </button>
        </div>

        <div className="briefings-header-actions">
          <button
            type="button"
            className="button primary copy-prompt-btn"
            onClick={handleCopyPrompt}
            title={t('复制交接提示词给外部 Agent', 'Copy Handover Prompt to External Agent')}
          >
            {copiedPrompt ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedPrompt ? t('已复制提示词', 'Copied') : t('复制提示词', 'Copy Prompt')}</span>
          </button>
          <button
            type="button"
            className="button secondary copy-prompt-btn research-btn"
            onClick={handleCopyResearchPrompt}
            title={t('复制再次搜索提示词给外部 Agent', 'Copy Re-search Prompt to External Agent')}
          >
            {copiedResearchPrompt ? <Check size={14} /> : <RotateCcw size={14} />}
            <span>{copiedResearchPrompt ? t('已复制再次搜索', 'Copied') : t('再次搜索', 'Re-search')}</span>
          </button>
          <button
            type="button"
            className="button secondary copy-prompt-btn config-btn"
            onClick={() => setShowConfigModal(true)}
            title={t('管理资讯检索关注项与权重配置', 'Manage search configs and priorities')}
          >
            <SlidersHorizontal size={14} />
            <span>{t('检索配置', 'Search Config')}</span>
            {(data.briefingSearchConfigs || []).length > 0 && (
              <span className="config-count-badge">
                {(data.briefingSearchConfigs || []).filter((c) => c.enabled !== false).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: 今日简报 */}
      {currentTab === 'today' && (
        <div className="briefing-tab-content">
          {/* 始终显示顶部日期切换模块 (Requirement 1: Top module always displays) */}
          <div className="briefing-date-bar">
            <span className="date-bar-label">{t('选择简报日期：', 'Date: ')}</span>
            <div className="briefing-date-pills">
              {availableDates.map((date) => (
                <button
                  key={date}
                  type="button"
                  className={`date-pill ${date === selectedBriefingDate ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedBriefingDate(date);
                    setTodayPage(1);
                  }}
                >
                  <Calendar size={13} />
                  {date === todayStr ? `${date} (${t('今天', 'Today')})` : date}
                </button>
              ))}
            </div>
          </div>

          {/* CASE A: 今日无简报 (未更新) */}
          {!activeBriefing ? (
            <div className="briefing-empty-state-card">
              <div className="empty-icon-wrap">
                <Clock size={36} />
              </div>
              <h2>{t('今日尚未更新', 'Not Updated Today')}</h2>
              <p className="empty-desc">
                {t(
                  '外部 Agent 今日尚未回填简报。Growmory 本机不维护常驻定时器，由外部定时联网 Agent 读取后写入。',
                  'External Agent has not backfilled today’s briefing yet. Growmory runs local-first without background timers.'
                )}
              </p>
              <div className="empty-hint-box">
                <small>
                  💡{' '}
                  {t(
                    '提示：点击上方「复制提示词」交给已连接 Growmory MCP 的外部 Agent（支持 X、Reddit、Product Hunt 等全网检索与定时），每天早上自动检索并生成简报；也可点击「检索配置」调整你的专属关注项与优先级。',
                    'Tip: Click "Copy Prompt" above to give to an external MCP-connected Agent with web search & scheduling capabilities; or customize topics in "Search Config".'
                  )}
                </small>
              </div>
            </div>
          ) : (
            /* CASE B: 有简报展示 */
            <div className="briefing-content-wrap">
              {/* 当天无合格结果提示 */}
              {activeBriefing.status === 'empty' && (
                <div className="briefing-empty-result-banner">
                  <AlertCircle size={20} />
                  <div className="empty-result-content">
                    <strong>{t('今天没有合格资讯', 'No qualified intelligence today')}</strong>
                    <p>
                      {activeBriefing.note ||
                        t(
                          '今日已按检索配置查验各平台公开网页，未发现能对近期决定产生实质影响的合格条目。',
                          'Checked public web across platforms per search config; no qualifying items met the criteria today.'
                        )}
                    </p>
                  </div>
                </div>
              )}

              {/* 资讯条目列表区域 */}
              {activeItems.length > 0 && (
                <div className="briefing-items-section">
                  {/* 快速筛选工具栏 (Quick Filter Chips Bar) */}
                  <div className="briefing-filter-toolbar">
                    <div className="filter-chips-group">
                      <button
                        type="button"
                        className={`filter-chip ${todayScopeFilter === 'all' ? 'active' : ''}`}
                        onClick={() => {
                          setTodayScopeFilter('all');
                          setTodayPage(1);
                        }}
                      >
                        <span>{t('全部', 'All')}</span>
                        <small className="chip-count">{activeItems.length}</small>
                      </button>
                      <button
                        type="button"
                        className={`filter-chip ${todayScopeFilter === 'product' ? 'active' : ''}`}
                        onClick={() => {
                          setTodayScopeFilter('product');
                          setTodayPage(1);
                        }}
                      >
                        <Layers3 size={13} />
                        <span>{t('产品专项', 'Product Focus')}</span>
                        <small className="chip-count">{productItemCount}</small>
                      </button>
                      <button
                        type="button"
                        className={`filter-chip ${todayScopeFilter === 'ecosystem' ? 'active' : ''}`}
                        onClick={() => {
                          setTodayScopeFilter('ecosystem');
                          setTodayPage(1);
                        }}
                      >
                        <Sparkles size={13} />
                        <span>{t('独立开发生态', 'Indie Dev Ecosystem')}</span>
                        <small className="chip-count">{ecosystemItemCount}</small>
                      </button>
                    </div>

                    <div className="filter-category-select-wrap">
                      <select
                        value={todayCategoryFilter}
                        onChange={(e) => {
                          setTodayCategoryFilter(e.target.value);
                          setTodayPage(1);
                        }}
                        className="category-filter-select"
                        aria-label={t('按分类筛选', 'Filter by category')}
                      >
                        <option value="all">{t('全部类别', 'All Categories')}</option>
                        {Object.entries(CATEGORY_MAP).map(([catKey, cat]) => (
                          <option key={catKey} value={catKey}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 核心卡片列表: verification === 'full'（分页 20 条一页） */}
                  <div className="items-cards-grid">
                    {pagedFullItems.map((item) => renderBriefingItemCard(item))}
                  </div>

                  {/* 分页栏（20 条一页） */}
                  {fullActiveItems.length > 0 && (
                    <div className="briefing-list-pagination">
                      <ListPagination
                        page={todayPage}
                        total={fullActiveItems.length}
                        pageSize={listPageSize}
                        onPage={setTodayPage}
                      />
                    </div>
                  )}

                  {/* 2. 仅搜索摘要与访问受限条目（默认展开，支持打开原文、留下、忽略） */}
                  {displayedActiveItems.filter((i) => i.verification !== 'full').length > 0 && (
                    <div className="snippets-collapsed-section">
                      <button
                        type="button"
                        className="snippets-toggle-btn"
                        onClick={() => setExpandSnippets((prev) => !prev)}
                      >
                        {expandSnippets ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span>
                          {t('仅搜索摘要 / 访问受限条目', 'Search Snippets / Restricted Items')} (
                          {displayedActiveItems.filter((i) => i.verification !== 'full').length}{' '}
                          {expandSnippets
                            ? t('条，点击收起', 'items, click to collapse')
                            : t('条，已折叠', 'items, collapsed')}
                          )
                        </span>
                      </button>

                      {expandSnippets && (
                        <div className="items-cards-grid collapsed-grid">
                          {displayedActiveItems
                            .filter((i) => i.verification !== 'full')
                            .map((item) => renderBriefingItemCard(item, true))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: 留下的资讯 */}
      {currentTab === 'saved' && (
        <div className="briefing-tab-content">
          {/* 筛选栏 */}
          <div className="saved-filter-bar">
            <div className="filter-group">
              <label>{t('按产品筛选：', 'Product: ')}</label>
              <select
                value={savedProductFilter}
                onChange={(e) => {
                  setSavedProductFilter(e.target.value);
                  setSavedPage(1);
                }}
              >
                <option value="all">{t('全部来源', 'All Sources')}</option>
                <option value="general">{t('独立开发生态', 'Indie Dev Ecosystem')}</option>
                {data.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {shortName(p)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>{t('按类别筛选：', 'Category: ')}</label>
              <select
                value={savedCategoryFilter}
                onChange={(e) => {
                  setSavedCategoryFilter(e.target.value);
                  setSavedPage(1);
                }}
              >
                <option value="all">{t('全部类别', 'All Categories')}</option>
                {Object.entries(CATEGORY_MAP).map(([catKey, cat]) => (
                  <option key={catKey} value={catKey}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {onGo && (
              <div className="saved-top-links" style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="button text-button"
                  onClick={() => onGo('contents')}
                >
                  <FileText size={13} /> {t('前往营销内容页', 'Go to Marketing')}
                </button>
                <button
                  type="button"
                  className="button text-button"
                  onClick={() => onGo('tasks')}
                >
                  <CheckSquare size={13} /> {t('前往待办事项', 'Go to Tasks')}
                </button>
              </div>
            )}
          </div>

          {/* 留下的资讯列表 */}
          {allSavedItems.length > 0 ? (
            <>
              <div className="items-cards-grid">
                {pagedSavedItems.map((item) => {
                const isEcosystem = !item.productId || item.productId === 'general';
                const prod = !isEcosystem ? data.products.find((p) => p.id === item.productId) : null;
                const catMeta = CATEGORY_MAP[item.category] || {
                  label: item.category,
                  colorClass: 'tag-gray',
                };

                return (
                  <div key={item.id} className="briefing-item-card status-saved">
                    <div className="item-card-header">
                      <div className="header-left">
                        {renderPlatformTag(item.platform)}

                        {isEcosystem ? (
                          <span className="scope-pill scope-ecosystem">
                            <Sparkles size={11} />
                            <span>{t('独立开发生态', 'Ecosystem')}</span>
                          </span>
                        ) : (
                          <span className="scope-pill scope-product">
                            {renderIcon ? renderIcon(prod || undefined, 12) : <Layers3 size={12} />}
                            <span>{prod ? shortName(prod) : item.productId}</span>
                          </span>
                        )}

                        <span className={`category-pill ${catMeta.colorClass}`}>
                          {catMeta.label}
                        </span>
                      </div>
                      <div className="header-right">
                        {renderReadBadge(item)}
                        {item.linkedDocId && (
                          <span className="item-action-link-pill pill-doc" title={t('已沉淀至产品文档', 'Saved to Product Doc')}>
                            <BookOpen size={10} /> {t('已转文档', 'Doc')}
                          </span>
                        )}
                        {item.linkedTaskId && (
                          <span className="item-action-link-pill pill-task" title={t('已转为待办任务', 'Converted to Todo')}>
                            <CheckSquare size={10} /> {t('已转待办', 'Todo')}
                          </span>
                        )}
                        {item.linkedContentId && (
                          <span className="item-action-link-pill pill-content" title={t('已转为营销选题草稿', 'Converted to Marketing Lead')}>
                            <FileText size={10} /> {t('已转选题', 'Lead')}
                          </span>
                        )}
                        <button
                          type="button"
                          className="item-delete-btn"
                          onClick={(e) => void handleDeleteItem(e, item)}
                          title={t('删除资讯', 'Delete briefing')}
                          aria-label={t('删除资讯', 'Delete briefing')}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>

                    <h3 className="item-title">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void handleOpenOriginalUrl(item)}
                      >
                        <span>{item.title}</span>
                        <ExternalLink size={13} className="external-icon" />
                      </a>
                    </h3>

                    <p className="item-summary">{item.summary}</p>

                    <div className="item-relevance-callout">
                      <span className="callout-label">{t('为什么关注：', 'Why Relevant: ')}</span>
                      <span className="callout-text">{item.relevance}</span>
                    </div>

                    {/* 跨平台多方视角 / 事件聚类 */}
                    {item.relatedSources && item.relatedSources.length > 0 && (
                      <div className="item-related-sources-panel">
                        <span className="related-sources-header">
                          <Share2 size={11} />
                          <span>{t('跨平台多方视角 / 关联报道：', 'Cross-Platform Perspectives:')}</span>
                        </span>
                        <div className="related-sources-chips">
                          {item.relatedSources.map((rs, idx) => (
                            <a
                              key={idx}
                              href={rs.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="related-source-chip"
                              title={rs.title}
                            >
                              <span className="chip-platform">{rs.platform}</span>
                              <span className="chip-title">{rs.title}</span>
                              <ExternalLink size={10} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.savedReason && (
                      <div className="item-saved-reason-banner">
                        <span className="saved-reason-label">📌 {t('留下原因：', 'Saved Reason: ')}</span>
                        <span className="saved-reason-text">{item.savedReason}</span>
                      </div>
                    )}

                    <div className="item-card-footer">
                      <div className="footer-meta">
                        <span className="url-domain" title={item.url}>
                          {extractDomain(item.url)}
                        </span>
                        {item.publishedAt && (
                          <span className="time-caption">{item.publishedAt}</span>
                        )}
                      </div>

                      <div className="footer-actions">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="button action-btn view-origin-btn"
                          onClick={() => void handleOpenOriginalUrl(item)}
                        >
                          <ExternalLink size={13} />
                          <span>{t('打开原文', 'Open')}</span>
                        </a>

                        <button
                          type="button"
                          className="button action-btn convert-btn"
                          onClick={() => handleConvertToDoc(item)}
                          title={t('沉淀为产品知识库文档', 'Save to Knowledge Doc')}
                        >
                          <BookOpen size={13} />
                          <span>{t('转为文档', 'To Doc')}</span>
                        </button>

                        <button
                          type="button"
                          className="button action-btn convert-btn"
                          onClick={() => handleConvertToTask(item)}
                        >
                          <CheckSquare size={13} />
                          <span>{t('转为待办', 'To Todo')}</span>
                        </button>
                        <button
                          type="button"
                          className="button action-btn convert-btn"
                          onClick={() => handleConvertToMarketing(item)}
                        >
                          <FileText size={13} />
                          <span>{t('转为选题', 'To Marketing')}</span>
                        </button>
                        <button
                          type="button"
                          className="button action-btn text-dismiss-btn"
                          onClick={() => handleDismissItem(item)}
                        >
                          <span>{t('改为忽略', 'Dismiss')}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>

              <div className="briefing-list-pagination">
                <ListPagination
                  page={savedPage}
                  total={allSavedItems.length}
                  pageSize={listPageSize}
                  onPage={setSavedPage}
                />
              </div>
            </>
          ) : (
            <div className="briefing-empty-state-card">
              <div className="empty-icon-wrap">
                <Bookmark size={36} />
              </div>
              <h2>{t('暂无留下的资讯', 'No Saved Items')}</h2>
              <p className="empty-desc">
                {t(
                  '在今日简报中点击「留下」，即可在此按产品和分类持续沉淀有价值的参考材料。',
                  'Click "Keep" on today’s briefing to collect valuable materials here by product and category.'
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 检索配置弹窗 (Search Config Modal) */}
      <BriefingSearchConfigModal
        isOpen={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        data={data}
        save={save}
        shortName={shortName}
        renderIcon={renderIcon}
        showToast={showToast}
      />
    </div>
  );
}
