import { useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  TrendingUp,
  Layers,
  Globe2,
  Filter,
  Table,
  ArrowLeft,
  Download,
  Eye,
  Layout,
  RotateCcw,
  Maximize2,
  Minimize2,
  BarChart2,
  FileText,
  CircleDollarSign,
  Wallet,
  RefreshCw,
} from 'lucide-react';
import { RELEASE_TAG_OPTIONS, HISTORICAL_RELEASE_TAGS, type Product, type Release, type AnalyticsReport, type Content, type Task } from './types';
import { isPersonalSiteChannel } from './platforms';
import type { TrendRow, Insights, Period, Metric, AnalyticsTab, Milestone } from './trends/types';
import {
  METRIC_LABELS,
  dateOffset,
  yesterday,
  findLatestDataDate,
  formatPercent,
  getSourceLabel,
  getTerritoryInfo,
} from './trends/constants';
import { TrendInteractiveChart } from './trends/chart';
import { TrendConversionFunnel } from './trends/funnel';
import { TrendSourcesView } from './trends/sources-view';
import { TrendTerritoriesView } from './trends/territories-view';
import { TrendDailyView } from './trends/daily-view';
import { formatMoney, getRevenueSales, getRevenueProceeds, type RevenueRate } from './trends/revenue';
import { TrendOverview } from './trends/overview';
import { TrendReportsView } from './trends/reports-view';
import { RecentDaysBar } from './trends/recent-days-bar';
import { useI18n } from './i18n.ts';

export type { TrendRow, Insights };
export { TrendOverview, TrendReportsView };

export async function requestInsights(
  id: string,
  action = 'latest',
  input?: object,
  cached?: Insights | null
): Promise<Insights | null> {
  const response = await fetch(
    `/api/app-store-connect/insights/${encodeURIComponent(id)}/${action}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cached ? { 'X-Growmory-Insights-Checked-At': cached.checkedAt } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
    }
  );
  if (response.status === 204) return cached ?? null;
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    throw Error(value?.error || `趋势同步请求失败（HTTP ${response.status}）。`);
  }
  return response.json();
}

const METRIC_BADGE_CLASSES: Record<Metric, string> = {
  firstDownloads: 'kpi-badge-green',
  pageViews: 'kpi-badge-blue',
  impressions: 'kpi-badge-purple',
  redownloads: 'kpi-badge-amber',
};

const METRIC_ICONS: Record<Metric, ReactNode> = {
  firstDownloads: <Download size={20} />,
  pageViews: <Layout size={20} />,
  impressions: <Eye size={20} />,
  redownloads: <RotateCcw size={20} />,
};

const CHART_ORDER_METRICS: Metric[] = ['impressions', 'pageViews', 'firstDownloads', 'redownloads'];

export function Trends({
  product,
  cached,
  revenueRate,
  eventDate,
  period,
  onPeriodChange,
  releases = [],
  contents = [],
  onBack,
}: {
  product: Product;
  cached: Insights | null | undefined;
  revenueRate: RevenueRate | null;
  eventDate?: string;
  period?: Period;
  onPeriodChange?: (period: Period) => void;
  onUpdate?: (id: string, value: Insights | null) => void;
  releases?: Release[];
  contents?: Content[];
  onBack?: () => void;
}) {
  const { t } = useI18n();
  const value = cached?.appId === product.appStore?.appId ? cached : null;
  const [localPeriod, setLocalPeriod] = useState<Period>({ days: 30, end: yesterday() });
  const [source, setSource] = useState('all');
  const [territory, setTerritory] = useState('all');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');
  const [showPrior, setShowPrior] = useState(true);
  const [showMilestones, setShowMilestones] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<Metric | 'sales' | 'proceeds' | null>(null);
  const [asoHistory, setAsoHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!product.appStore?.appId) {
      setAsoHistory([]);
      return;
    }
    let active = true;
    fetch(`/api/app-store-connect/aso/${encodeURIComponent(product.id)}/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (active && Array.isArray(data)) setAsoHistory(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [product.id, product.appStore?.appId]);

  const { days, end } = period || localPeriod;
  const changePeriod = onPeriodChange || setLocalPeriod;
  const setDays = (d: number) => changePeriod({ days: d, end });
  const setEnd = (eStr: string) => changePeriod({ days, end: eStr });

  // 查找当前产品中最近有数据的日期
  const latestDataDate = useMemo(() => {
    return findLatestDataDate([value]);
  }, [value]);

  const yDate = yesterday();
  const effectiveBaseDate = (latestDataDate && latestDataDate > yDate) ? latestDataDate : yDate;
  const recent7DaysDescending = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => dateOffset(effectiveBaseDate, -i));
  }, [effectiveBaseDate]);

  const selectValue = days === 1 ? `day:${end}` : String(days);
  const handleSelectRangeOrDay = (val: string) => {
    if (val.startsWith('day:')) {
      changePeriod({ days: 1, end: val.slice(4) });
    } else {
      const d = Number(val);
      if (d === 1) {
        changePeriod({ days: 1, end: latestDataDate });
      } else {
        setDays(d);
      }
    }
  };

  const rows = value?.trends.rows || [];
  const coverage = value?.trends.coverage || {};

  // Build daily metrics map filtered by source and territory
  const daily = useMemo(() => {
    const result = new Map<string, Record<Metric, number>>();
    for (const row of rows) {
      if ((source !== 'all' && row.source !== source) || (territory !== 'all' && row.territory !== territory)) {
        continue;
      }
      const valuesMap = result.get(row.date) || {
        impressions: 0,
        pageViews: 0,
        firstDownloads: 0,
        redownloads: 0,
      };
      const keys: Metric[] =
        row.kind === 'engagement' ? ['impressions', 'pageViews'] : ['firstDownloads', 'redownloads'];
      for (const k of keys) valuesMap[k] += row[k];
      result.set(row.date, valuesMap);
    }
    return result;
  }, [rows, source, territory]);

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => dateOffset(end, i - days + 1)),
    [days, end]
  );
  const prior = useMemo(() => dates.map(d => dateOffset(d, -days)), [dates, days]);

  function count(date: string, key: Metric): number | null {
    const kind = key === 'impressions' || key === 'pageViews' ? 'engagement' : 'downloads';
    if (!coverage[kind]?.includes(date)) return null;
    return daily.get(date)?.[key] || 0;
  }

  function coveredDays(ds: string[], key: Metric) {
    const kind = key === 'impressions' || key === 'pageViews' ? 'engagement' : 'downloads';
    return ds.filter(d => coverage[kind]?.includes(d)).length;
  }

  function sum(ds: string[], key: Metric): number | null {
    const kind = key === 'impressions' || key === 'pageViews' ? 'engagement' : 'downloads';
    const cov = coverage[kind] || [];
    if (cov.length === 0) return null;
    const coveredDates = ds.filter(d => cov.includes(d));
    if (coveredDates.length === 0) return null;

    let total = 0;
    for (const d of coveredDates) {
      total += daily.get(d)?.[key] || 0;
    }
    return total;
  }

  const fullPriorEngagement = coveredDays(prior, 'impressions') === days;
  const fullPriorDownloads = coveredDays(prior, 'firstDownloads') === days;

  // Build combined milestones
  const milestones: Milestone[] = useMemo(() => {
    const list: Milestone[] = [];
    const successfulAsoEvents = asoHistory.filter(e => e.outcome === 'success');

    // 1. 版本正式发布：必须为已发布/已确认状态，优先按上线日期 publishedAt 对齐，并自动整合 ASO 优化
    const productReleases = releases.filter(
      r => r.productId === product.id && ['published', 'confirmed', 'archived'].includes(r.status)
    );
    for (const r of productReleases) {
      const date = (r.publishedAt || r.createdAt || '').slice(0, 10);
      if (date && dates.includes(date)) {
        // 根据 ASO 优化模块真实提交记录判定是否含 ASO 文案或图片优化
        const matchesRelease = (e: any) => {
          if (r.storeSource?.versionId && e.versionId && r.storeSource.versionId === e.versionId) return true;
          if (e.version && r.version && (e.version === r.version || e.version === r.version.replace(/^v/i, ''))) return true;
          const rDate = (r.publishedAt || r.createdAt || '').slice(0, 10);
          const eDate = (e.at || '').slice(0, 10);
          if (rDate && eDate && eDate <= rDate) {
            const diffDays = (new Date(rDate).getTime() - new Date(eDate).getTime()) / 86400000;
            if (diffDays >= 0 && diffDays <= 30) {
              if (!r.storeSource?.versionId && !e.versionId) return true;
            }
          }
          return false;
        };

        const matchingAsoEvents = successfulAsoEvents.filter(matchesRelease);
        const hasAsoCopy = matchingAsoEvents.some(e =>
          e.kind === 'copy' || (!e.kind && !e.changes?.some((c: any) => c.type && ['APP_SCREENSHOT', 'APP_ICON', 'PRODUCT_PAGE_HEADER_ASSET', 'order'].includes(c.type)))
        );

        const hasAsoMedia = matchingAsoEvents.some(e =>
          e.kind === 'media' || e.changes?.some((c: any) => c.type && ['APP_SCREENSHOT', 'APP_ICON', 'PRODUCT_PAGE_HEADER_ASSET', 'order'].includes(c.type))
        );

        const hasAso = hasAsoCopy || hasAsoMedia;

        let asoSuffix = '';
        if (hasAsoCopy && hasAsoMedia) {
          asoSuffix = ' [含ASO优化: 文案+图片]';
        } else if (hasAsoCopy) {
          asoSuffix = ' [含ASO优化: 文案]';
        } else if (hasAsoMedia) {
          asoSuffix = ' [含ASO优化: 图片]';
        }

        const tagLabels = (r.tags || [])
          .filter(t => !['keywords', 'title_subtitle', 'search_creatives', 'screenshots', 'app_icon', 'preview_video'].includes(t))
          .map(t => RELEASE_TAG_OPTIONS.find(opt => opt.id === t)?.label || HISTORICAL_RELEASE_TAGS[t])
          .filter(Boolean);

        list.push({
          date,
          type: 'release',
          label: `${r.version ? `v${r.version}` : '新版本'} 正式发布${asoSuffix}${tagLabels.length ? ` · ${tagLabels.join('、')}` : ''}`,
          detail: r.changes || undefined,
          version: r.version,
          tags: r.tags || [],
          hasAso,
          hasAsoCopy,
          hasAsoMedia,
        });
      }
    }

    // 2. 营销内容：已发布状态，读取发布日期对应产品添加标记点（个人主页文章除外）
    const productContents = (contents || []).filter(
      c => c.productId === product.id && ['published', 'archived'].includes(c.status) && !isPersonalSiteChannel(c.channel)
    );
    for (const c of productContents) {
      const date = (c.publishedAt || c.date || '').slice(0, 10);
      if (date && dates.includes(date)) {
        list.push({
          date,
          type: 'content',
          label: `${c.channel ? `[${c.channel}] ` : ''}${c.title || '营销内容发布'}`,
          detail: c.explanation || c.url || (c.body ? c.body.slice(0, 80) : undefined),
          channel: c.channel,
          url: c.url,
          tags: c.tags || [],
        });
      }
    }

    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [releases, product.id, dates, contents, asoHistory]);

  // 详情页 6 个顶部 KPI 维度计算（与数据统计页维度与顺序完全一致）
  const dl = sum(dates, 'firstDownloads');
  const dlPrev = (coveredDays(dates, 'firstDownloads') === days && coveredDays(prior, 'firstDownloads') === days) ? sum(prior, 'firstDownloads') : null;
  const dlDiff = (dl !== null && dlPrev !== null && dlPrev > 0) ? ((dl - dlPrev) / dlPrev) * 100 : null;

  const imp = sum(dates, 'impressions');
  const impPrev = (coveredDays(dates, 'impressions') === days && coveredDays(prior, 'impressions') === days) ? sum(prior, 'impressions') : null;
  const impDiff = (imp !== null && impPrev !== null && impPrev > 0) ? ((imp - impPrev) / impPrev) * 100 : null;

  const pv = sum(dates, 'pageViews');
  const pvPrev = (coveredDays(dates, 'pageViews') === days && coveredDays(prior, 'pageViews') === days) ? sum(prior, 'pageViews') : null;
  const pvDiff = (pv !== null && pvPrev !== null && pvPrev > 0) ? ((pv - pvPrev) / pvPrev) * 100 : null;

  const installRate = (imp !== null && dl !== null && imp > 0) ? dl / imp : null;
  const priorInstallRate = (impPrev !== null && dlPrev !== null && impPrev > 0) ? dlPrev / impPrev : null;
  const installRateDiff = (installRate !== null && priorInstallRate !== null) ? (installRate - priorInstallRate) * 100 : null;

  // Revenue time series & aggregations for Overview tab
  const rev = value?.trends.revenue;
  const getDailySales = (d: string) => {
    if (!rev || !rev.rows) return 0;
    return rev.rows
      .filter(r => r.date === d && (source === 'all' || r.source === source) && (territory === 'all' || r.territory === territory))
      .reduce((sum, r) => sum + (r.salesUsd || 0), 0);
  };
  const getDailyProceeds = (d: string) => {
    if (!rev || !rev.rows) return 0;
    return rev.rows
      .filter(r => r.date === d && (source === 'all' || r.source === source) && (territory === 'all' || r.territory === territory))
      .reduce((sum, r) => sum + (r.proceedsUsd || 0), 0);
  };

  const salesSeries = dates.map(d => getDailySales(d));
  const proceedsSeries = dates.map(d => getDailyProceeds(d));
  const priorSalesSeries = prior.map(d => getDailySales(d));
  const priorProceedsSeries = prior.map(d => getDailyProceeds(d));

  const totalSales = getRevenueSales(rev, dates, source, territory);
  const totalProceeds = getRevenueProceeds(rev, dates, source, territory);
  const priorSales = getRevenueSales(rev, prior, source, territory);
  const priorProceeds = getRevenueProceeds(rev, prior, source, territory);

  const salesDiff =
    totalSales !== null && priorSales !== null && priorSales > 0
      ? ((totalSales - priorSales) / priorSales) * 100
      : null;
  const proceedsDiff =
    totalProceeds !== null && priorProceeds !== null && priorProceeds > 0
      ? ((totalProceeds - priorProceeds) / priorProceeds) * 100
      : null;
  const sales = totalSales;
  const proceeds = totalProceeds;
  const dailyAvgSales = totalSales !== null && dates.length > 0 ? totalSales / dates.length : null;
  const dailyAvgProceeds = totalProceeds !== null && dates.length > 0 ? totalProceeds / dates.length : null;
  const salesMax = Math.max(0.1, ...salesSeries, ...(showPrior ? priorSalesSeries : []));
  const proceedsMax = Math.max(0.1, ...proceedsSeries, ...(showPrior ? priorProceedsSeries : []));

  const uniqueSources = [...new Set(rows.map(r => r.source))].sort();
  const uniqueTerritories = [...new Set(rows.map(r => r.territory))].sort();

  return (
    <section className="trends-panel-streamlined">
      {/* 1. Compact Header Bar: Product Title, Time Controls, and Sync Action */}
      <div className="trends-unified-topbar">
        <div className="topbar-identity">
          {onBack && (
            <button
              type="button"
              className="topbar-back-btn"
              onClick={onBack}
              title={t("返回全部产品总览", "Back to All Products")}
              aria-label={t("返回全部产品总览", "Back to All Products")}
            >
              <ArrowLeft size={16} />
              <span>{t("全部产品", "All Products")}</span>
            </button>
          )}
          <h2 className="topbar-title">{t("产品趋势", "Product Trends")}</h2>
          <span className="topbar-divider">/</span>
          <span className="topbar-product-name">{product.name.split(/\s[-–—]\s/)[0]}</span>
          {product.platform && (
            <span className="topbar-platform-badge">{product.platform.replace('_', '')}</span>
          )}
          {value?.trends.syncedAt && (
            <span className="topbar-sync-tag">
              {t("上次同步", "Synced")} {new Date(value.trends.syncedAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="topbar-controls">
          <label className="field-compact">
            <select
              aria-label={t("时间范围", "Date Range")}
              value={selectValue}
              onChange={e => handleSelectRangeOrDay(e.target.value)}
            >
              <optgroup label={t("近 7 天（单日筛选）", "Past 7 Days (Single Day)")}>
                {recent7DaysDescending.map(d => (
                  <option key={d} value={`day:${d}`}>
                    {d} {d === yDate ? t("(昨天)", "(Yesterday)") : ''}
                  </option>
                ))}
                {days === 1 && !recent7DaysDescending.includes(end) && (
                  <option value={`day:${end}`}>{end}</option>
                )}
              </optgroup>
              <optgroup label={t("时间周期", "Time Ranges")}>
                <option value="7">{t("最近 7 天", "Past 7 Days")}</option>
                <option value="14">{t("最近 14 天", "Past 14 Days")}</option>
                <option value="30">{t("最近 30 天", "Past 30 Days")}</option>
                <option value="90">{t("最近 90 天", "Past 90 Days")}</option>
                <option value="180">{t("最近 180 天", "Past 180 Days")}</option>
              </optgroup>
            </select>
          </label>
          <label className="field-compact">
            <input
              aria-label={t("截止日期", "End Date")}
              type="date"
              value={end}
              max={yesterday()}
              onChange={e => {
                if (e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
        </div>
      </div>

      {/* 近7天单日快捷筛选栏 */}
      <RecentDaysBar
        period={{ days, end }}
        onPeriodChange={changePeriod}
        baseDate={latestDataDate}
      />

      {/* Permission or Critical Status Banner */}
      {value && value.trends.status === 'forbidden' && (
        <div className="trend-notice" role="status">
          <strong>{t("趋势报告权限不足", "Insufficient Trends Permissions")}</strong>
          <p>
            {t("请在 Apple 用户与访问中核对该密钥的 App 访问范围及分析报告权限。产品、版本和 ASO 读取权限不代表趋势报告权限。", "Please verify App access scope and analytics reports permission for this key in Users and Access.")}
          </p>
        </div>
      )}

      {value && value.trends.status === 'error' && (
        <div className="trend-notice" role="status">
          <strong>{t("趋势同步失败", "Trend Sync Failed")}</strong>
          <p>{value.trends.message}</p>
        </div>
      )}

      {value?.trends.status === 'partial' && value.trends.reportSyncFailed && (
        <div className="trend-notice" role="status">
          <strong>{t("部分趋势报表同步失败", "Some trend reports failed to sync")}</strong>
          <p>{value.trends.message}</p>
        </div>
      )}

      {cached === undefined && <p role="status">{t("正在读取趋势缓存…", "Reading trend cache...")}</p>}
      {cached !== undefined && !value && (
        <div className="empty">
          <h3>{t("尚未读取趋势报告", "No Trend Report Available")}</h3>
          <p>{t("连接 App Store Connect 后同步产品，即可读取可用趋势报告。", "Connect App Store Connect and sync product to view trend reports.")}</p>
        </div>
      )}

      {value && (rows.length > 0 || sales !== null) && (
        <>
          {/* Top KPI Cards with large colored icons (6 core dimensions in single unified grid matching overview page) */}
          <div className="portfolio-kpis-grid detail-kpis-grid">
            {/* 1. 首次下载 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("首次下载", "First-time Downloads")}</span>
                <div className="kpi-icon-badge kpi-badge-green">
                  <Download size={20} />
                </div>
              </div>
              <strong className="kpi-value metric-count">{dl !== null ? dl.toLocaleString() : '—'}</strong>
              <small className="kpi-sub">
                {coveredDays(dates, 'firstDownloads') < days ? (
                  `${t("已覆盖", "Covered")} ${coveredDays(dates, 'firstDownloads')}/${days} ${t("天，暂不比较", "days, skipping comparison")}`
                ) : dlDiff !== null ? (
                  <span className={dlDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {dlDiff >= 0 ? '+' : ''}{dlDiff.toFixed(1)}%
                  </span>
                ) : dl !== null && days > 1 ? (
                  `${t("日均", "Daily avg")} ${Math.round(dl / days).toLocaleString()}`
                ) : (
                  t('新增用户安装', 'New installs')
                )}
              </small>
            </div>

            {/* 2. 展示次数 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("展示次数", "Impressions")}</span>
                <div className="kpi-icon-badge kpi-badge-purple">
                  <Eye size={20} />
                </div>
              </div>
              <strong className="kpi-value">{imp !== null ? imp.toLocaleString() : '—'}</strong>
              <small className="kpi-sub">
                {coveredDays(dates, 'impressions') < days ? (
                  `${t("已覆盖", "Covered")} ${coveredDays(dates, 'impressions')}/${days} ${t("天，暂不比较", "days, skipping comparison")}`
                ) : impDiff !== null ? (
                  <span className={impDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {impDiff >= 0 ? '+' : ''}{impDiff.toFixed(1)}%
                  </span>
                ) : (
                  t('累计发现展示事件', 'Cumulative impressions')
                )}
              </small>
            </div>

            {/* 3. 查看次数 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("查看次数", "Page Views")}</span>
                <div className="kpi-icon-badge kpi-badge-blue">
                  <Layout size={20} />
                </div>
              </div>
              <strong className="kpi-value">{pv !== null ? pv.toLocaleString() : '—'}</strong>
              <small className="kpi-sub">
                {coveredDays(dates, 'pageViews') < days ? (
                  `${t("已覆盖", "Covered")} ${coveredDays(dates, 'pageViews')}/${days} ${t("天，暂不比较", "days, skipping comparison")}`
                ) : pvDiff !== null ? (
                  <span className={pvDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {pvDiff >= 0 ? '+' : ''}{pvDiff.toFixed(1)}%
                  </span>
                ) : (
                  t('产品页访问量', 'Product page views')
                )}
              </small>
            </div>

            {/* 4. 首次下载 / 展示次数 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("首次下载 / 展示次数", "Downloads / Impressions")}</span>
                <div className="kpi-icon-badge kpi-badge-indigo">
                  <TrendingUp size={20} />
                </div>
              </div>
              <strong className="kpi-value">{formatPercent(installRate)}</strong>
              <small className="kpi-sub">
                {installRateDiff !== null ? (
                  <span className={installRateDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {installRateDiff >= 0 ? '+' : ''}{installRateDiff.toFixed(1)}%
                  </span>
                ) : (
                  t('全链路转化率', 'Overall conversion rate')
                )}
              </small>
            </div>

            {/* 5. 销售额 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("销售额", "Sales")}</span>
                <div className="kpi-icon-badge kpi-badge-rose">
                  <CircleDollarSign size={20} />
                </div>
              </div>
              <strong className="kpi-value">{sales !== null ? formatMoney(sales, revenueRate) : '—'}</strong>
              <small className="kpi-sub">
                {salesDiff !== null ? (
                  <span className={salesDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {salesDiff >= 0 ? '+' : ''}{salesDiff.toFixed(1)}%
                  </span>
                ) : (
                  t('Apple 估算，含退款调整', 'Estimated by Apple, incl refunds')
                )}
              </small>
            </div>

            {/* 6. 预计收入 */}
            <div className="portfolio-kpi-card trend-metric static-kpi-card">
              <div className="kpi-card-header">
                <span className="kpi-label">{t("预计收入", "Proceeds")}</span>
                <div className="kpi-icon-badge kpi-badge-cyan">
                  <Wallet size={20} />
                </div>
              </div>
              <strong className="kpi-value">{proceeds !== null ? formatMoney(proceeds, revenueRate) : '—'}</strong>
              <small className="kpi-sub">
                {proceedsDiff !== null ? (
                  <span className={proceedsDiff >= 0 ? 'text-up' : 'text-down'}>
                    {t("较前", "vs prior")} {days} {t("天", "days")} {proceedsDiff >= 0 ? '+' : ''}{proceedsDiff.toFixed(1)}%
                  </span>
                ) : (
                  t('扣除适用税费及 Apple 佣金', 'After taxes & commission')
                )}
              </small>
            </div>
          </div>

          {/* 3. Combined Tabs & Inline Filter Bar */}
          <div className="trend-toolbar-row">
            <div className="trend-tabs-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'overview'}
                className={`trend-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => setActiveTab('overview')}
              >
                <TrendingUp size={14} />
                <span>{t("综合趋势", "Overview")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'sources'}
                className={`trend-tab-btn ${activeTab === 'sources' ? 'active' : ''}`}
                onClick={() => setActiveTab('sources')}
              >
                <Layers size={14} />
                <span>{t("渠道来源", "Sources")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'territories'}
                className={`trend-tab-btn ${activeTab === 'territories' ? 'active' : ''}`}
                onClick={() => setActiveTab('territories')}
              >
                <Globe2 size={14} />
                <span>{t("地区分布", "Territories")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'funnel'}
                className={`trend-tab-btn ${activeTab === 'funnel' ? 'active' : ''}`}
                onClick={() => setActiveTab('funnel')}
              >
                <Filter size={14} />
                <span>{t("获客指标", "Funnel")}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'daily'}
                className={`trend-tab-btn ${activeTab === 'daily' ? 'active' : ''}`}
                onClick={() => setActiveTab('daily')}
              >
                <Table size={14} />
                <span>{t("每日明细", "Daily Breakdown")}</span>
              </button>
            </div>

            <div className="trend-secondary-filters">
              <select
                aria-label={t("来源", "Source")}
                className="select-compact"
                value={source}
                onChange={e => setSource(e.target.value)}
              >
                <option value="all">{t("全部来源", "All Sources")}</option>
                {uniqueSources.map(s => (
                  <option key={s} value={s}>
                    {getSourceLabel(s)}
                  </option>
                ))}
              </select>
              <select
                aria-label={t("国家 / 地区", "Territory")}
                className="select-compact"
                value={territory}
                onChange={e => setTerritory(e.target.value)}
              >
                <option value="all">{t("全部地区", "All Territories")}</option>
                {uniqueTerritories.map(t => (
                  <option key={t} value={t}>
                    {getTerritoryInfo(t).flag} {getTerritoryInfo(t).name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. Tab Views */}
          {activeTab === 'overview' && (
            <div className="trend-tab-content">
              <div className="chart-view-toolbar">
                <div className="chart-title-group">
                  <h3>
                    {t("指标趋势", "Metric Trends")} · {dates[0] === end ? end : `${dates[0]} ${t("至", "to")} ${end}`}
                  </h3>
                </div>

                <div className="chart-toggles">
                  <label className="chart-toggle-label">
                    <input
                      type="checkbox"
                      checked={showPrior}
                      onChange={e => setShowPrior(e.target.checked)}
                    />
                    <span>{t("对比前", "vs prior")} {days} {t("天曲线", "days curve")}</span>
                  </label>
                  <label className="chart-toggle-label">
                    <input
                      type="checkbox"
                      checked={showMilestones}
                      onChange={e => setShowMilestones(e.target.checked)}
                    />
                    <span>{t("标注版本与 ASO", "Mark Releases & ASO")}</span>
                  </label>
                </div>
              </div>

              {/* Four Metric Charts Listed Directly in Order: 曝光、浏览、下载、重新下载 (支持点击全宽展开) */}
              <div className="trend-charts-quad-grid">
                {CHART_ORDER_METRICS.map(m => {
                  const mSeries = dates.map(d => count(d, m));
                  const mPriorSeries = prior.map(d => count(d, m));
                  const mMax = Math.max(1, ...mSeries.map(n => n ?? 0), ...(showPrior ? mPriorSeries.map(n => n ?? 0) : []));
                  const mCurrent = sum(dates, m);
                  const mCovered = coveredDays(dates, m);
                  const mPrevious = mCovered === days && coveredDays(prior, m) === days ? sum(prior, m) : null;
                  const mDiff =
                    mCurrent !== null && mPrevious !== null && mPrevious > 0
                      ? ((mCurrent - mPrevious) / mPrevious) * 100
                      : null;
                  const mDailyAvg = mCurrent !== null && mCovered > 0 ? Math.round(mCurrent / mCovered) : null;
                  const isExpanded = expandedMetric === m;

                  return (
                    <div
                      key={m}
                      className={`metric-chart-card ${isExpanded ? 'is-expanded' : ''}`}
                    >
                      <div className="metric-chart-header">
                        <div className="metric-header-left">
                          <div className={`kpi-icon-badge ${METRIC_BADGE_CLASSES[m]}`}>
                            {METRIC_ICONS[m]}
                          </div>
                          <div>
                            <h4>{METRIC_LABELS[m]}</h4>
                            <span className="metric-chart-dates">{dates[0] === end ? end : `${dates[0]} ${t("至", "to")} ${end}`}</span>
                          </div>
                        </div>
                        <div className="metric-header-actions">
                          <div className="metric-header-stats">
                            <strong className="metric-header-value">
                              {mCurrent === null ? '—' : mCurrent.toLocaleString()}
                            </strong>
                            <small className="metric-header-sub">
                              {mDiff !== null ? (
                                <span className={mDiff >= 0 ? 'text-up' : 'text-down'}>
                                  {t("较前", "vs prior")} {days} {t("天", "days")} {mDiff >= 0 ? '+' : ''}{mDiff.toFixed(1)}%
                                </span>
                              ) : mDailyAvg !== null ? (
                                `${t("日均", "Daily avg")} ${mDailyAvg.toLocaleString()}`
                              ) : (
                                `${t("已覆盖", "Covered")} ${mCovered}/${days} ${t("天", "days")}`
                              )}
                            </small>
                          </div>
                          <button
                            type="button"
                            className={`chart-expand-btn ${isExpanded ? 'expanded' : ''}`}
                            onClick={() => setExpandedMetric(isExpanded ? null : m)}
                            title={isExpanded ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                            aria-label={isExpanded ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                          >
                            {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                            <span>{isExpanded ? t('收起', 'Collapse') : t('全宽', 'Expand')}</span>
                          </button>
                        </div>
                      </div>

                      <TrendInteractiveChart
                        dates={dates}
                        priorDates={prior}
                        series={mSeries}
                        priorSeries={mPriorSeries}
                        metric={m}
                        maximum={mMax}
                        milestones={milestones}
                        showPrior={showPrior}
                        showMilestones={showMilestones}
                        count={count}
                        eventDate={eventDate}
                      />
                    </div>
                  );
                })}

                {/* 5. Sales Chart (销售额) */}
                <div className={`metric-chart-card ${expandedMetric === 'sales' ? 'is-expanded' : ''}`}>
                  <div className="metric-chart-header">
                    <div className="metric-header-left">
                      <div className="kpi-icon-badge kpi-badge-rose">
                        <CircleDollarSign size={20} />
                      </div>
                      <div>
                        <h4>{t("销售额", "Sales")}</h4>
                        <span className="metric-chart-dates">{dates[0] === end ? end : `${dates[0]} ${t("至", "to")} ${end}`}</span>
                      </div>
                    </div>
                    <div className="metric-header-actions">
                      <div className="metric-header-stats">
                        <strong className="metric-header-value">
                          {totalSales !== null ? formatMoney(totalSales, revenueRate) : '—'}
                        </strong>
                        <small className="metric-header-sub">
                          {salesDiff !== null ? (
                            <span className={salesDiff >= 0 ? 'text-up' : 'text-down'}>
                              {t("较前", "vs prior")} {days} {t("天", "days")} {salesDiff >= 0 ? '+' : ''}{salesDiff.toFixed(1)}%
                            </span>
                          ) : dailyAvgSales !== null ? (
                            `${t("日均", "Daily avg")} ${formatMoney(dailyAvgSales, revenueRate)}`
                          ) : (
                            t('Apple 估算，含退款调整', 'Estimated by Apple, incl refunds')
                          )}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={`chart-expand-btn ${expandedMetric === 'sales' ? 'expanded' : ''}`}
                        onClick={() => setExpandedMetric(expandedMetric === 'sales' ? null : 'sales')}
                        title={expandedMetric === 'sales' ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                        aria-label={expandedMetric === 'sales' ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                      >
                        {expandedMetric === 'sales' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        <span>{expandedMetric === 'sales' ? t('收起', 'Collapse') : t('全宽', 'Expand')}</span>
                      </button>
                    </div>
                  </div>

                  <TrendInteractiveChart
                    dates={dates}
                    priorDates={prior}
                    series={salesSeries}
                    priorSeries={priorSalesSeries}
                    label={t("销售额", "Sales")}
                    color={{ primary: '#e11d48', light: '#fff1f2', border: '#fecdd3' }}
                    valueFormatter={v => (v === null ? '—' : formatMoney(v, revenueRate))}
                    maximum={salesMax}
                    milestones={milestones}
                    showPrior={showPrior}
                    showMilestones={showMilestones}
                    count={count}
                    eventDate={eventDate}
                  />
                </div>

                {/* 6. Proceeds Chart (预计收入) */}
                <div className={`metric-chart-card ${expandedMetric === 'proceeds' ? 'is-expanded' : ''}`}>
                  <div className="metric-chart-header">
                    <div className="metric-header-left">
                      <div className="kpi-icon-badge kpi-badge-cyan">
                        <Wallet size={20} />
                      </div>
                      <div>
                        <h4>{t("预计收入", "Proceeds")}</h4>
                        <span className="metric-chart-dates">{dates[0] === end ? end : `${dates[0]} ${t("至", "to")} ${end}`}</span>
                      </div>
                    </div>
                    <div className="metric-header-actions">
                      <div className="metric-header-stats">
                        <strong className="metric-header-value">
                          {totalProceeds !== null ? formatMoney(totalProceeds, revenueRate) : '—'}
                        </strong>
                        <small className="metric-header-sub">
                          {proceedsDiff !== null ? (
                            <span className={proceedsDiff >= 0 ? 'text-up' : 'text-down'}>
                              {t("较前", "vs prior")} {days} {t("天", "days")} {proceedsDiff >= 0 ? '+' : ''}{proceedsDiff.toFixed(1)}%
                            </span>
                          ) : dailyAvgProceeds !== null ? (
                            `${t("日均", "Daily avg")} ${formatMoney(dailyAvgProceeds, revenueRate)}`
                          ) : (
                            t('扣除适用税费及 Apple 佣金', 'After taxes & commission')
                          )}
                        </small>
                      </div>
                      <button
                        type="button"
                        className={`chart-expand-btn ${expandedMetric === 'proceeds' ? 'expanded' : ''}`}
                        onClick={() => setExpandedMetric(expandedMetric === 'proceeds' ? null : 'proceeds')}
                        title={expandedMetric === 'proceeds' ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                        aria-label={expandedMetric === 'proceeds' ? t('还原为半宽网格', 'Restore half width') : t('展开为全宽模式', 'Expand full width')}
                      >
                        {expandedMetric === 'proceeds' ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        <span>{expandedMetric === 'proceeds' ? t('收起', 'Collapse') : t('全宽', 'Expand')}</span>
                      </button>
                    </div>
                  </div>

                  <TrendInteractiveChart
                    dates={dates}
                    priorDates={prior}
                    series={proceedsSeries}
                    priorSeries={priorProceedsSeries}
                    label={t("预计收入", "Proceeds")}
                    color={{ primary: '#0891b2', light: '#ecfeff', border: '#a5f3fc' }}
                    valueFormatter={v => (v === null ? '—' : formatMoney(v, revenueRate))}
                    maximum={proceedsMax}
                    milestones={milestones}
                    showPrior={showPrior}
                    showMilestones={showMilestones}
                    count={count}
                    eventDate={eventDate}
                  />
                </div>
              </div>

              {/* Analysis body from AI / server */}
              {value.analysis &&
                value.analysis.scope.days === days &&
                value.analysis.scope.end === end &&
                value.analysis.scope.source === source &&
                value.analysis.scope.territory === territory && (
                  <div className="markdown trend-analysis-block">
                    <ReactMarkdown>{value.analysis.body}</ReactMarkdown>
                  </div>
                )}
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="trend-tab-content">
              <TrendSourcesView
                rows={territory === 'all' ? rows : rows.filter(row => row.territory === territory)}
                dates={dates}
                coverage={coverage}
                currentSource={source}
                onSelectSource={s => setSource(s)}
                revenue={value.trends.revenue}
                revenueRate={revenueRate}
                territory={territory}
              />
            </div>
          )}

          {activeTab === 'territories' && (
            <div className="trend-tab-content">
              <TrendTerritoriesView
                rows={source === 'all' ? rows : rows.filter(row => row.source === source)}
                dates={dates}
                prior={prior}
                coverage={coverage}
                currentTerritory={territory}
                onSelectTerritory={t => setTerritory(t)}
                revenue={value.trends.revenue}
                revenueRate={revenueRate}
                source={source}
                milestones={milestones}
                eventDate={eventDate}
              />
            </div>
          )}

          {activeTab === 'funnel' && (
            <div className="trend-tab-content">
              <TrendConversionFunnel
                impressions={sum(dates, 'impressions')}
                pageViews={sum(dates, 'pageViews')}
                firstDownloads={sum(dates, 'firstDownloads')}
                redownloads={sum(dates, 'redownloads')}
                priorImpressions={fullPriorEngagement ? sum(prior, 'impressions') : null}
                priorPageViews={fullPriorEngagement ? sum(prior, 'pageViews') : null}
                priorFirstDownloads={fullPriorDownloads ? sum(prior, 'firstDownloads') : null}
                days={days}
                revenue={value.trends.revenue}
                revenueRate={revenueRate}
                dates={dates}
                source={source}
                territory={territory}
              />
            </div>
          )}

          {activeTab === 'daily' && (
            <div className="trend-tab-content">
              <TrendDailyView
                dates={[...dates].reverse()}
                count={count}
                productName={product.name.split(/\s[-–—]\s/)[0]}
                revenue={value.trends.revenue}
                revenueRate={revenueRate}
                source={source}
                territory={territory}
              />
            </div>
          )}

          {/* Compliance & Methodology Collapsible Footer */}
          <details className="trend-methodology-details">
            <summary>{t("数据口径与指标说明", "Data Methodology & Metric Details")}</summary>
            <div className="methodology-body">
              <p className="fine-print">
                {t("数据来自 Apple Analytics 每日报告，按事件发生日期汇总。首次下载和重新下载独立于更新、恢复；基于事件次数汇总计算转化率。", "Data sourced from Apple Analytics daily reports, aggregated by event date. First-time downloads and redownloads are independent of updates and restores.")}
              </p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function Analytics({
  products,
  values,
  releases = [],
  contents = [],
  connect,
  scope,
  setScope,
  onUpdate,
  reports = [],
  onSaveReport = () => { },
  onDeleteReport = () => { },
  tasks = [],
  onSaveTask,
  onDeleteTask,
  onNavigateTasks,
  analyticsTab,
  onAnalyticsTabChange,
  targetReportId,
  targetQuote,
  onClearTargetReport,
}: {
  products: Product[];
  values: Record<string, Insights | null>;
  releases?: Release[];
  contents?: Content[];
  connect?: () => void;
  scope: string;
  setScope: (scope: string) => void;
  onUpdate?: (id: string, value: Insights | null) => void;
  reports?: AnalyticsReport[];
  onSaveReport?: (report: AnalyticsReport) => Promise<void> | void;
  onDeleteReport?: (id: string) => Promise<void> | void;
  tasks?: Task[];
  onSaveTask?: (task: Task) => Promise<void> | void;
  onDeleteTask?: (id: string) => Promise<void> | void;
  onNavigateTasks?: () => void;
  analyticsTab?: 'stats' | 'reports';
  onAnalyticsTabChange?: (tab: 'stats' | 'reports') => void;
  targetReportId?: string | null;
  targetQuote?: string | null;
  onClearTargetReport?: () => void;
}) {
  const { t } = useI18n();
  const [revenueRate, setRevenueRate] = useState<RevenueRate | null>(null);
  const [localTab, setLocalTab] = useState<'stats' | 'reports'>('stats');
  const [syncingIds, setSyncingIds] = useState<Record<string, boolean>>({});

  const currentTab = analyticsTab ?? localTab;
  const handleTabChange = (nextTab: 'stats' | 'reports') => {
    setLocalTab(nextTab);
    onAnalyticsTabChange?.(nextTab);
  };

  const handleSyncProduct = async (productId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (syncingIds[productId]) return;
    setSyncingIds(prev => ({ ...prev, [productId]: true }));
    try {
      const res = await requestInsights(productId, 'sync');
      onUpdate?.(productId, res);
    } catch {
      // 保持原有状态
    } finally {
      setSyncingIds(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleSyncAllIssues = async (issuesList: Product[], e?: React.MouseEvent) => {
    e?.stopPropagation();
    for (const p of issuesList) {
      await handleSyncProduct(p.id);
    }
  };

  useEffect(() => {
    let active = true;
    const refreshRate = () => {
      fetch('/api/exchange-rate/usd-cny')
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (active && data) setRevenueRate(data);
        })
        .catch(() => { });
    };

    refreshRate();
    window.addEventListener('focus', refreshRate);
    const timer = window.setInterval(refreshRate, 60 * 60 * 1000);

    return () => {
      active = false;
      window.removeEventListener('focus', refreshRate);
      window.clearInterval(timer);
    };
  }, []);

  // Find latest available coverage date across values
  const latestAvailableDate = useMemo(() => {
    let latest = '';
    for (const val of Object.values(values)) {
      if (!val) continue;
      const latestDates = [
        val.trends.coverage.downloads?.at(-1),
        val.trends.coverage.engagement?.at(-1),
        val.trends.revenue?.coverage.at(-1),
      ];
      for (const date of latestDates) if (date && date > latest) latest = date;
    }
    return latest || yesterday();
  }, [values]);

  const [range, setRange] = useState({ days: 30, end: '' });
  const period = { days: range.days, end: range.end || latestAvailableDate };
  const setPeriod = (next: Period) => setRange({
    days: next.days,
    end: next.end === period.end ? range.end : next.end,
  });

  const selected = products.find(product => product.id === scope);
  const linked = products.filter(product => product.appStore);
  const issues = linked.filter(product => {
    const trends = values[product.id]?.trends;
    return trends?.status === 'error' || trends?.status === 'forbidden' || trends?.reportSyncFailed || trends?.revenue?.status === 'error';
  });

  return (
    <div className="analytics-workspace">
      {/* 顶部主 Tab 切换：数据统计 / 分析报告 */}
      <div className="analytics-main-nav-bar">
        <div className="segmented analytics-main-tabs">
          <button
            type="button"
            className={currentTab === 'stats' ? 'active' : ''}
            onClick={() => handleTabChange('stats')}
          >
            <BarChart2 size={15} />
            <span>{t("数据统计", "Statistics")}</span>
          </button>
          <button
            type="button"
            className={currentTab === 'reports' ? 'active' : ''}
            onClick={() => handleTabChange('reports')}
          >
            <FileText size={15} />
            <span>{t("分析报告", "Reports")}</span>
            {reports.length > 0 && (
              <small className="tab-count-badge">
                {reports.length}
                {reports.some(r => !r.isRead) && (
                  <span className="unread-dot" style={{ width: 6, height: 6, marginLeft: 4, display: 'inline-block' }} />
                )}
              </small>
            )}
          </button>
        </div>
      </div>

      {currentTab === 'reports' ? (
        <TrendReportsView
          products={products}
          scope={scope}
          setScope={setScope}
          reports={reports}
          onSaveReport={onSaveReport}
          onDeleteReport={onDeleteReport}
          tasks={tasks}
          onSaveTask={onSaveTask}
          onDeleteTask={onDeleteTask}
          onNavigateTasks={onNavigateTasks}
          targetReportId={targetReportId}
          targetQuote={targetQuote}
          onClearTargetReport={onClearTargetReport}
        />
      ) : (
        <>
          {!selected && issues.length > 0 && (
            <div className="trend-notice" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 18px', margin: '16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <strong style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>
                  {t(`有 ${issues.length} 个产品需要检查数据连接`, `${issues.length} products require connection check`)}
                </strong>
                {issues.length > 1 && (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={Object.values(syncingIds).some(Boolean)}
                    onClick={(e) => void handleSyncAllIssues(issues, e)}
                    style={{ fontSize: 12, padding: '4px 10px', height: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    <RefreshCw size={12} className={Object.values(syncingIds).some(Boolean) ? 'spin' : ''} />
                    <span>{t("重试全部", "Retry All")}</span>
                  </button>
                )}
              </div>

              <div className="analytics-issues" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {issues.map(product => {
                  const isSyncing = !!syncingIds[product.id];
                  const trends = values[product.id]?.trends;
                  const status = trends?.status;
                  const revenueFailed = trends?.revenue?.status === 'error';
                  const message = status === 'error' || status === 'forbidden' || trends?.reportSyncFailed
                    ? trends?.message
                    : revenueFailed ? t(`购买报表同步失败 · ${trends?.revenue?.message || ''}`, `Purchase report sync failed · ${trends?.revenue?.message || ''}`) : '';
                  const isForbidden = status === 'forbidden';

                  return (
                    <div
                      key={product.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: '#fff',
                        border: '1px solid #f1f5f9',
                        borderRadius: 6,
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => setScope(product.id)}
                          style={{ fontWeight: 600, color: '#1e293b', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {product.name}
                        </button>
                        <span
                          className="badge"
                          style={{
                            fontSize: 11,
                            padding: '1px 6px',
                            background: isForbidden ? '#fef3c7' : '#fee2e2',
                            color: isForbidden ? '#92400e' : '#b91c1c',
                            border: `1px solid ${isForbidden ? '#fde68a' : '#fecaca'}`,
                            flexShrink: 0,
                          }}
                        >
                          {isForbidden ? t('权限不足', 'Forbidden') : t('同步失败', 'Sync Failed')}
                        </span>
                        {message && (
                          <span
                            className="fine-print"
                            style={{
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 340,
                            }}
                            title={message}
                          >
                            {message}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="button secondary small"
                        disabled={isSyncing}
                        onClick={(e) => void handleSyncProduct(product.id, e)}
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          height: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          flexShrink: 0,
                        }}
                      >
                        <RefreshCw size={12} className={isSyncing ? 'spin' : ''} />
                        <span>{isSyncing ? t('同步中…', 'Syncing…') : t('重新同步', 'Retry Sync')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {scope !== 'all' && !selected && (
            <p role="status">{t("该产品已不存在，请选择其他产品或全部产品。", "This product does not exist, please select another product.")}</p>
          )}

          {selected ? (
            selected.appStore ? (
              <Trends
                key={selected.id}
                product={selected}
                cached={values[selected.id]}
                revenueRate={revenueRate}
                period={period}
                onPeriodChange={setPeriod}
                onUpdate={onUpdate}
                releases={releases}
                contents={contents}
                onBack={() => setScope('all')}
              />
            ) : (
              <section className="panel padded empty">
                <h3>{t("关联商店后查看产品数据", "Link App Store to view analytics")}</h3>
                <p>{t("在工作区设置中连接 App Store Connect，并导入对应产品。", "Connect App Store Connect in Workspace Settings to import your app.")}</p>
                <button className="button primary" onClick={connect}>
                  {t("连接商店", "Connect Store")}
                </button>
              </section>
            )
          ) : (
            <TrendOverview
              products={products}
              values={values}
              revenueRate={revenueRate}
              open={setScope}
              period={period}
              onPeriodChange={setPeriod}
              connect={connect}
              onUpdate={onUpdate}
            />
          )}
        </>
      )}
    </div>
  );
}
