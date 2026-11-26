import { useState, useMemo, useEffect } from 'react';
import {
  Download,
  Eye,
  Layout,
  TrendingUp,
  CircleDollarSign,
  Wallet,
  Layers3,
  Rocket,
  BookOpen,
  FileText,
  CheckCheck,
  CheckSquare,
  ChevronRight,
  ArrowRight,
  CheckCircle2,
  BarChart3,
  Clock,
  Newspaper,
} from 'lucide-react';
import type { Data, Product, Release } from './types';
import type { Insights, Metric } from './trends/types';
import { findLatestDataDate, dateOffset, formatPercent } from './trends/constants';
import { formatMoney, type RevenueRate } from './trends/revenue';
import { useI18n } from './i18n';

export type ReminderItem = {
  id: string;
  productId?: string;
  label?: string;
  kind: string;
  title: string;
  reason: string;
  time?: string;
  action: () => void;
};

export function getReminderTagStyle(kind: string): string {
  switch (kind) {
    case '资料确认':
    case '产品资料':
    case '通用资料':
      return 'tag-blue';
    case '营销内容':
    case '营销规划':
    case '营销文章':
      return 'tag-emerald';
    case 'ASO优化':
    case 'ASO':
      return 'tag-indigo';
    case '版本发布':
      return 'tag-purple';
    case '报告待办':
    case '待办任务':
    case '待办事项':
      return 'tag-amber';
    case '同步异常':
      return 'tag-rose';
    default:
      return 'tag-gray';
  }
}

export function formatReminderTime(iso?: string, lang: 'zh' | 'en' = 'zh'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 1) return lang === 'en' ? 'Just now' : '刚刚';
  if (diffMin < 60) return lang === 'en' ? `${diffMin}m ago` : `${diffMin} 分钟前`;
  if (diffHours < 24 && now.getDate() === d.getDate()) {
    const timeStr = d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return lang === 'en' ? `Today ${timeStr}` : `今天 ${timeStr}`;
  }
  if (diffDays === 1 || (diffHours < 48 && now.getDate() - d.getDate() === 1)) {
    const timeStr = d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
    return lang === 'en' ? `Yesterday ${timeStr}` : `昨天 ${timeStr}`;
  }
  return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

type WorkbenchHomeProps = {
  data: Data;
  signals: Record<string, Insights | null>;
  allReminders: ReminderItem[];
  onSave: (updater: (data: Data) => void) => Promise<boolean | void>;
  onGo: (page: any) => void;
  onViewProduct: (productId: string) => void;
  shortName: (product?: Product) => string;
  platformText: (platform: string) => string;
  renderIcon: (product?: Product, size?: number) => React.ReactNode;
};

export function WorkbenchHome({
  data,
  signals,
  allReminders,
  onGo,
  onViewProduct,
  shortName,
  platformText,
  renderIcon,
}: WorkbenchHomeProps) {
  const { t, lang } = useI18n();
  const [days, setDays] = useState<number>(1);
  const [revenueRate, setRevenueRate] = useState<RevenueRate | null>(null);

  // Fetch exchange rate for revenue calculations
  useEffect(() => {
    let active = true;
    fetch('/api/exchange-rate/usd-cny')
      .then((res) => (res.ok ? res.json() : null))
      .then((rateData) => {
        if (active && rateData) setRevenueRate(rateData);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const isReleaseActive = (r?: Release) => !!r && r.status !== 'published' && r.status !== 'archived';

  // Latest date available across all product signals
  const latestDataDate = useMemo(() => {
    return findLatestDataDate(data.products.map((p) => signals[p.id]));
  }, [data.products, signals]);

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => dateOffset(latestDataDate, i - days + 1)),
    [days, latestDataDate]
  );

  const priorDates = useMemo(
    () => dates.map((d) => dateOffset(d, -days)),
    [dates, days]
  );

  // Latest sync time across products
  const latestSyncedAt = useMemo(() => {
    let latest = '';
    for (const p of data.products) {
      const val = signals[p.id];
      const s = val?.trends.syncedAt || val?.trends.checkedAt;
      if (s && s > latest) latest = s;
    }
    return latest;
  }, [data.products, signals]);

  const formatSyncTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const timeStr = d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (isToday) return `${t('今天')} ${timeStr}`;
      return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
    } catch {
      return '';
    }
  };

  function getSum(val: Insights | null | undefined, ds: string[], key: Metric): number | null {
    if (!val || !val.trends || val.trends.rows.length === 0) return null;
    const kind = key === 'impressions' || key === 'pageViews' ? 'engagement' : 'downloads';
    const cov = val.trends.coverage?.[kind] || [];
    if (cov.length === 0) return null;
    const coveredDates = ds.filter((d) => cov.includes(d));
    if (coveredDates.length === 0) return null;
    return val.trends.rows
      .filter((r) => r.kind === kind && coveredDates.includes(r.date))
      .reduce((sum, r) => sum + (r[key] || 0), 0);
  }

  // Portfolio KPI metrics
  const portfolioStats = useMemo(() => {
    let totalDl = 0;
    let prevDl = 0;
    let totalImp = 0;
    let totalPv = 0;
    let activeApps = 0;
    let engagementApps = 0;
    let matchedDownloads = 0;
    let matchedImpressions = 0;
    let matchedApps = 0;
    let matchedDays = 0;
    let comparable = true;

    for (const p of data.products) {
      const val = signals[p.id];
      if (!p.appStore) continue;
      const coverage = val?.trends?.coverage;
      const downloadsComplete = dates.every((date) => coverage?.downloads?.includes(date));
      const sharedDates = dates.filter(
        (date) => coverage?.downloads?.includes(date) && coverage?.engagement?.includes(date)
      );
      if (sharedDates.length > 0) {
        matchedDownloads += getSum(val, sharedDates, 'firstDownloads') ?? 0;
        matchedImpressions += getSum(val, sharedDates, 'impressions') ?? 0;
        matchedApps++;
        matchedDays += sharedDates.length;
      }
      comparable &&= downloadsComplete && priorDates.every((date) => coverage?.downloads?.includes(date));
      const dl = getSum(val, dates, 'firstDownloads');
      const pdl = getSum(val, priorDates, 'firstDownloads');
      const imp = getSum(val, dates, 'impressions');
      const pv = getSum(val, dates, 'pageViews');

      if (dl !== null) {
        totalDl += dl;
        activeApps++;
      }
      if (pdl !== null) prevDl += pdl;
      if (imp !== null) {
        totalImp += imp;
        engagementApps++;
      }
      if (pv !== null) totalPv += pv;
    }

    const dlDiff = comparable && prevDl > 0 ? ((totalDl - prevDl) / prevDl) * 100 : null;

    return {
      totalDl,
      dlDiff,
      totalImp,
      totalPv,
      activeApps,
      engagementApps,
      matchedApps,
      matchedDays,
      overallRate: matchedImpressions > 0 ? matchedDownloads / matchedImpressions : null,
    };
  }, [data.products, signals, dates, priorDates]);

  // Revenue metrics across portfolio
  const revenueStats = useMemo(() => {
    const selectedDates = new Set(dates);
    let sales = 0;
    let proceeds = 0;
    let coveredDays = 0;
    for (const p of data.products) {
      if (!p.appStore) continue;
      const report = signals[p.id]?.trends?.revenue;
      if (!report) continue;
      const covered = new Set(report.coverage?.filter((date) => selectedDates.has(date)) || []);
      if (!covered.size) continue;
      coveredDays += covered.size;
      for (const row of report.rows || []) {
        if (!covered.has(row.date)) continue;
        sales += row.salesUsd || 0;
        proceeds += row.proceedsUsd || 0;
      }
    }
    return { sales, proceeds, coveredDays };
  }, [data.products, signals, dates]);

  // Mini sparkline for a product
  const renderProductSparkline = (val: Insights | null | undefined) => {
    if (!val || val.trends.rows.length === 0) return null;
    const series = dates.map((d) => {
      if (!val.trends.coverage.downloads?.includes(d)) return 0;
      return val.trends.rows
        .filter((r) => r.date === d && r.kind === 'downloads')
        .reduce((sum, r) => sum + (r.firstDownloads || 0), 0);
    });
    const max = Math.max(1, ...series);
    const w = 64;
    const h = 18;
    let path = '';
    if (series.length === 1) {
      const y = h - (series[0] / max) * (h - 4) - 2;
      path = `M 0 ${y.toFixed(1)} L ${w} ${y.toFixed(1)}`;
    } else {
      const step = w / Math.max(1, series.length - 1);
      series.forEach((n, i) => {
        const x = i * step;
        const y = h - (n / max) * (h - 4) - 2;
        path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      });
    }

    return (
      <svg className="table-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <path d={path} fill="none" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  const todoCount = allReminders.length;

  // 今日资讯未读状态与更新情况
  const todayStr = useMemo(() => new Date().toLocaleDateString('sv-SE'), []);
  const todayBriefing = useMemo(() => {
    return (data.briefings || []).find((b) => b.date === todayStr);
  }, [data.briefings, todayStr]);

  const todayItems = useMemo(() => {
    if (!todayBriefing) return [];
    const itemIds = new Set(todayBriefing.itemIds || []);
    return (data.briefingItems || []).filter(
      (i) => itemIds.has(i.id) || i.briefingId === todayBriefing.id
    );
  }, [data.briefingItems, todayBriefing]);

  const todayUnreadCount = useMemo(() => {
    return todayItems.filter((i) => i.status === 'new' && !i.isRead).length;
  }, [todayItems]);

  const todayTotalCount = useMemo(() => {
    return todayItems.length;
  }, [todayItems]);

  return (
    <div className="workbench-home">
      {/* 资讯通知栏：今天有几条未读；未更新时指向资讯页 */}
      <section
        className={`workbench-briefing-alert-row ${todayBriefing ? 'is-updated' : 'is-pending'}`}
        onClick={() => onGo('briefings')}
        role="button"
        tabIndex={0}
      >
        <div className="briefing-alert-left">
          <div className="briefing-icon-wrap">
            <Newspaper size={18} />
          </div>
          <div className="briefing-alert-text">
            {todayBriefing ? (
              todayBriefing.status === 'empty' ? (
                <>
                  <span className="briefing-status-title">{t('今日资讯已同步', "Today's Briefing Synced")}</span>
                  <span className="briefing-status-desc">{t('今日外部公开网页无合格资讯，点击查看检索记录与平台限制', 'No qualified intelligence found today. Click to view platform summaries.')}</span>
                </>
              ) : todayUnreadCount > 0 ? (
                <>
                  <span className="briefing-status-title">
                    {t(`今日资讯有 ${todayUnreadCount} 条未读`, `${todayUnreadCount} unread briefings today`)}
                  </span>
                  <span className="briefing-status-desc">
                    {t(`共收录 ${todayTotalCount} 条，涵盖平台变化、竞品动态、用户原话与线索`, `Total ${todayTotalCount} items on platform policies, competitor moves, and user feedback.`)}
                  </span>
                </>
              ) : (
                <>
                  <span className="briefing-status-title">{t('今日资讯已全部阅读', 'All Briefings Read Today')}</span>
                  <span className="briefing-status-desc">{t(`今日 ${todayTotalCount} 条资讯已完成阅读与处置，点击回看`, `All ${todayTotalCount} items reviewed. Click to revisit.`)}</span>
                </>
              )
            ) : (
              <>
                <span className="briefing-status-title">{t('今日资讯尚未更新', "Today's Briefing Not Updated")}</span>
                <span className="briefing-status-desc">{t('外部 Agent 每日定时检索后回填。点击前往资讯页查看或复制交接提示词 →', 'External agent backfills daily. Click to view or copy handover prompt →')}</span>
              </>
            )}
          </div>
        </div>
        <div className="briefing-alert-right">
          <span className="briefing-enter-link">
            {t('进入资讯', 'Open Briefings')} <ArrowRight size={14} />
          </span>
        </div>
      </section>

      {/* 0. 顶部工作空间状态概览栏 (Top Workspace Stat Bar) */}
      <section className="workbench-top-bar workspace-overview">
        <button className="top-stat-card overview-number" onClick={() => onGo('products')}>
          <div className="stat-card-icon stat-icon-blue">
            <Layers3 size={20} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">{t('产品数量', 'Products')}</span>
            <div className="stat-card-value-row">
              <strong className="stat-card-num">{data.products.length}</strong>
              <span className="stat-card-hint">{t('款产品', 'apps')}</span>
            </div>
          </div>
        </button>

        <button className="top-stat-card overview-number" onClick={() => onGo('releases')}>
          <div className="stat-card-icon stat-icon-orange">
            <Rocket size={20} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">{t('待提交版本', 'Pending Releases')}</span>
            <div className="stat-card-value-row">
              <strong className="stat-card-num">{data.releases.filter(isReleaseActive).length}</strong>
              <span className="stat-card-badge">{t('进行中版本', 'In Progress')}</span>
            </div>
          </div>
        </button>

        <button className="top-stat-card overview-number" onClick={() => onGo('knowledge')}>
          <div className="stat-card-icon stat-icon-emerald">
            <BookOpen size={20} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">{t('待确认资料', 'Docs to Review')}</span>
            <div className="stat-card-value-row">
              <strong className="stat-card-num">
                {data.docs.filter((d) => d.status === 'pending').length}
              </strong>
              <span className="stat-card-hint">/ {data.docs.length} {t('篇总资料', 'total docs')}</span>
            </div>
          </div>
        </button>

        <button className="top-stat-card overview-number" onClick={() => onGo('contents')}>
          <div className="stat-card-icon stat-icon-purple">
            <FileText size={20} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">{t('营销待发布', 'Marketing to Publish')}</span>
            <div className="stat-card-value-row">
              <strong className="stat-card-num">
                {data.contents.filter((c) => c.status === 'ready').length}
              </strong>
              <span className="stat-card-hint">/ {data.contents.length} {t('篇营销', 'articles')}</span>
            </div>
          </div>
        </button>

        <button className="top-stat-card overview-number" onClick={() => onGo('tasks')}>
          <div className="stat-card-icon stat-icon-rose">
            <CheckCheck size={20} />
          </div>
          <div className="stat-card-body">
            <span className="stat-card-label">{t('待处理事项', 'Action Items')}</span>
            <div className="stat-card-value-row">
              <strong className="stat-card-num highlight">{todoCount}</strong>
              <span className="stat-card-hint">{t('项待办', 'todos')}</span>
            </div>
          </div>
        </button>
      </section>

      {/* 1. 数据总览 Section */}
      <section className="workbench-section workbench-analytics-overview">
        <div className="workbench-section-header">
          <div className="section-title-wrap">
            <div className="section-icon-badge">
              <BarChart3 size={18} />
            </div>
            <div>
              <div className="section-title-row">
                <h2>{t('数据总览', 'Data Overview')}</h2>
                <div className="period-pills" role="radiogroup" aria-label={t('时间周期', 'Time Period')}>
                  <button
                    type="button"
                    className={`pill-btn ${days === 1 ? 'active' : ''}`}
                    onClick={() => setDays(1)}
                  >
                    {t('最近 1 天', '1 Day')}
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${days === 7 ? 'active' : ''}`}
                    onClick={() => setDays(7)}
                  >
                    {t('近 7 天', '7 Days')}
                  </button>
                  <button
                    type="button"
                    className={`pill-btn ${days === 30 ? 'active' : ''}`}
                    onClick={() => setDays(30)}
                  >
                    {t('近 30 天', '30 Days')}
                  </button>
                </div>
              </div>
              <p className="section-subtitle">
                {latestSyncedAt ? (
                  <span>
                    {t('商店数据更新于', 'Synced at')} {formatSyncTime(latestSyncedAt)}
                  </span>
                ) : (
                  <span>{t('尚未关联商店或未同步，连接 App Store 获取最新数据', 'Connect App Store to sync live trends')}</span>
                )}
              </p>
            </div>
          </div>
          <div className="section-header-actions">
            <button className="text-button enter-analytics-btn" onClick={() => onGo('analytics')}>
              {t('前往 App 数据分析', 'View Full Analytics')} <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* 6 Core KPIs Grid */}
        <div className="portfolio-kpis-grid">
          {/* 1. 首次下载 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('组合总首次下载', 'Portfolio First Downloads')}</span>
              <div className="kpi-icon-badge kpi-badge-green">
                <Download size={18} />
              </div>
            </div>
            <strong className="kpi-value">
              {portfolioStats.activeApps ? portfolioStats.totalDl.toLocaleString() : '—'}
            </strong>
            <small className="kpi-sub">
              {portfolioStats.dlDiff !== null ? (
                <span className={portfolioStats.dlDiff >= 0 ? 'text-up' : 'text-down'}>
                  {t('较前', 'vs prior')} {days} {t('天', 'days')} {portfolioStats.dlDiff >= 0 ? '+' : ''}
                  {portfolioStats.dlDiff.toFixed(1)}%
                </span>
              ) : portfolioStats.activeApps > 0 ? (
                `${t('覆盖')} ${portfolioStats.activeApps} ${t('款产品')}`
              ) : (
                t('待关联 App Store 数据')
              )}
            </small>
          </div>

          {/* 2. 展示次数 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('组合总展示次数', 'Total Impressions')}</span>
              <div className="kpi-icon-badge kpi-badge-purple">
                <Eye size={18} />
              </div>
            </div>
            <strong className="kpi-value">
              {portfolioStats.engagementApps ? portfolioStats.totalImp.toLocaleString() : '—'}
            </strong>
            <small className="kpi-sub">{t('App Store 搜索与推荐曝光展示', 'Search and browse impressions')}</small>
          </div>

          {/* 3. 查看次数 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('组合总查看次数', 'Product Page Views')}</span>
              <div className="kpi-icon-badge kpi-badge-blue">
                <Layout size={18} />
              </div>
            </div>
            <strong className="kpi-value">
              {portfolioStats.engagementApps ? portfolioStats.totalPv.toLocaleString() : '—'}
            </strong>
            <small className="kpi-sub">{t('App Store 产品详情页访问量', 'Store page views')}</small>
          </div>

          {/* 4. 下载转化率 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('首次下载 / 展示次数', 'Download Conversion Rate')}</span>
              <div className="kpi-icon-badge kpi-badge-indigo">
                <TrendingUp size={18} />
              </div>
            </div>
            <strong className="kpi-value">{formatPercent(portfolioStats.overallRate)}</strong>
            <small className="kpi-sub">
              {portfolioStats.overallRate !== null
                ? `${t('共同覆盖')} ${portfolioStats.matchedApps} ${t('款 App')}`
                : t('展示与下载综合转化效率')}
            </small>
          </div>

          {/* 5. 销售额 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('销售额', 'Sales')}</span>
              <div className="kpi-icon-badge kpi-badge-rose">
                <CircleDollarSign size={18} />
              </div>
            </div>
            <strong className="kpi-value">
              {revenueStats.coveredDays ? formatMoney(revenueStats.sales, revenueRate) : '—'}
            </strong>
            <small className="kpi-sub">{t('Apple 估算，含退款调整', 'Estimated by Apple, incl refunds')}</small>
          </div>

          {/* 6. 预计收入 */}
          <div className="portfolio-kpi-card" onClick={() => onGo('analytics')} style={{ cursor: 'pointer' }}>
            <div className="kpi-card-header">
              <span className="kpi-label">{t('预计收入', 'Proceeds')}</span>
              <div className="kpi-icon-badge kpi-badge-cyan">
                <Wallet size={18} />
              </div>
            </div>
            <strong className="kpi-value">
              {revenueStats.coveredDays ? formatMoney(revenueStats.proceeds, revenueRate) : '—'}
            </strong>
            <small className="kpi-sub">{t('扣除适用税费及 Apple 佣金', 'After taxes & commission')}</small>
          </div>
        </div>
      </section>

      {/* 2. 待办项 (Action Items & Tasks) Section */}
      <section className="workbench-section workbench-todos-section panel work-queue">
        <div className="workbench-section-header">
          <div className="section-title-wrap">
            <div className="section-icon-badge">
              <CheckSquare size={18} />
            </div>
            <div>
              <div className="section-title-row">
                <h2>
                  {t('待办事项', 'To-do List')}
                  <span className="count-badge">{todoCount}</span>
                </h2>
              </div>
              <p className="section-subtitle">
                {t('集中管理各产品待确认资料、营销发布、ASO提交与版本更新', 'Action items needing review, publishing, ASO submission, and release updates')}
              </p>
            </div>
          </div>
          <div className="section-header-actions">
            <button className="text-button" onClick={() => onGo('tasks')}>
              {t('查看全部', 'View All')} <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* Todo List Items */}
        <div className="workbench-todo-list">
          {allReminders.map((reminder) => {
            const p = reminder.productId ? data.products.find((prod) => prod.id === reminder.productId) : undefined;
            const label = reminder.label || (p ? shortName(p) : '');
            return (
              <div key={reminder.id} className="workbench-reminder-card attention-row" onClick={reminder.action}>
                <div className="reminder-left">
                  <span className={`reminder-tag tag ${getReminderTagStyle(reminder.kind)}`}>
                    {t(reminder.kind)}
                  </span>
                  <div className="reminder-content">
                    <div className="reminder-title-line" title={`${label ? label + ' · ' : ''}${reminder.title}`}>
                      {label && <span className="reminder-product-name">{label} · </span>}
                      <b>{reminder.title}</b>
                    </div>
                    <small className="reminder-reason" title={reminder.reason}>{reminder.reason}</small>
                    {reminder.time && (
                      <div className="reminder-time-line">
                        <span className="reminder-time-badge" title={new Date(reminder.time).toLocaleString()}>
                          <Clock size={11} />
                          {formatReminderTime(reminder.time, lang)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="reminder-action-btn">
                  <span>{t('处理')}</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            );
          })}

          {/* Empty state */}
          {todoCount === 0 && (
            <div className="workbench-todo-empty">
              <div className="empty-icon-wrap">
                <CheckCircle2 size={32} />
              </div>
              <h3>{t('所有待办均已处理完毕', 'All Caught Up!')}</h3>
              <p>{t('目前没有需要确认或处理的事项，尽情享受专注创造的时光。', 'No pending reminders. Great job!')}</p>
            </div>
          )}
        </div>
      </section>

      {/* 3. 你的产品 (Your Products) Section */}
      <section className="workbench-section workbench-products-section">
        <div className="workbench-section-header">
          <div className="section-title-wrap">
            <div className="section-icon-badge">
              <Layers3 size={18} />
            </div>
            <div>
              <div className="section-title-row">
                <h2>{t('你的产品', 'Your Products')}</h2>
                <span className="count-badge">{data.products.length}</span>
              </div>
              <p className="section-subtitle">
                {t('各产品的近期下载走势、已确认资料与进行中版本', 'Product downloads trend, documentation, and active releases')}
              </p>
            </div>
          </div>
          <div className="section-header-actions">
            <button className="text-button" onClick={() => onGo('products')}>
              {t('管理产品', 'Manage Products')} <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {data.products.length === 0 ? (
          <div className="workbench-empty-products">
            <h3>{t('还没有产品', 'No products yet')}</h3>
            <p>{t('连接商店账号，导入你的第一款产品。', 'Connect App Store Connect to import your first product.')}</p>
            <button className="button primary" onClick={() => onGo('setup')}>
              {t('连接并导入产品', 'Connect & Import Products')}
            </button>
          </div>
        ) : (
          <div className="workbench-product-matrix">
            <div className="matrix-table-head">
              <span>{t('产品')}</span>
              <span className="text-center">{days === 1 ? t('最近 1 天首次下载', '1-Day First Downloads') : t(`近 ${days} 天首次下载`, `${days}-Day First Downloads`)}</span>
              <span className="text-center">{t('下载走势')}</span>
              <span className="text-center">{t('已确认资料')}</span>
              <span className="text-center">{t('进行中版本')}</span>
              <span className="text-right">{t('操作')}</span>
            </div>
            {data.products.map((prod) => {
              const val = signals[prod.id];
              const dlSum = getSum(val, dates, 'firstDownloads');
              const confirmedDocs = data.docs.filter((d) => d.productId === prod.id && d.status === 'confirmed').length;
              const activeRels = data.releases.filter((r) => r.productId === prod.id && isReleaseActive(r)).length;

              return (
                <div
                  key={prod.id}
                  className="matrix-table-row product-summary-row"
                  onClick={() => onViewProduct(prod.id)}
                >
                  <div className="product-identity-col">
                    {renderIcon(prod, 34)}
                    <div className="product-texts">
                      <b>{shortName(prod)}</b>
                      <small>{platformText(prod.platform) || t('平台待补充')}</small>
                    </div>
                  </div>
                  <div className="text-center product-dl-col">
                    <strong>{dlSum !== null ? dlSum.toLocaleString() : '—'}</strong>
                  </div>
                  <div className="text-center product-spark-col">
                    {renderProductSparkline(val) || <span className="spark-dash">—</span>}
                  </div>
                  <div className="text-center product-docs-col">
                    <span className="metric-pill">
                      {confirmedDocs} {t('篇已确认', 'confirmed')}
                    </span>
                  </div>
                  <div className="text-center product-rel-col">
                    <span className={`metric-pill ${activeRels > 0 ? 'active-rel' : ''}`}>
                      {activeRels} {t('个准备中', 'in progress')}
                    </span>
                  </div>
                  <div className="text-right product-action-col">
                    <span className="matrix-action-link">
                      {t('进入')} <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
