import { useState, useMemo } from 'react';
import { RefreshCw, Download, Eye, Layout, TrendingUp, ChevronRight, CircleDollarSign, Wallet } from 'lucide-react';
import type { Product } from '../types';
import type { Insights, Metric, Period } from './types';
import { formatMoney, getRevenueSales, type RevenueRate } from './revenue';
import { METRIC_LABELS, dateOffset, yesterday, findLatestDataDate, formatPercent } from './constants';
import { RecentDaysBar } from './recent-days-bar';
import { requestInsights } from '../trends';
import { useI18n } from '../i18n.ts';

type OverviewProps = {
  products: Product[];
  values: Record<string, Insights | null>;
  revenueRate: RevenueRate | null;
  open: (id: string) => void;
  period: Period;
  onPeriodChange: (period: Period) => void;
  connect?: () => void;
  onUpdate?: (id: string, value: Insights | null) => void;
};

export function TrendOverview({
  products,
  values,
  revenueRate,
  open,
  period,
  onPeriodChange,
  onUpdate,
}: OverviewProps) {
  const { t } = useI18n();
  const { days, end } = period;
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncErrors, setSyncErrors] = useState<string[]>([]);

  const setDays = (d: number) => onPeriodChange({ days: d, end });
  const setEnd = (eStr: string) => onPeriodChange({ days, end: eStr });

  // 查找所有产品中最近有数据的日期
  const latestDataDate = useMemo(() => {
    return findLatestDataDate(products.map(p => values[p.id]));
  }, [products, values]);

  const yDate = yesterday();
  const effectiveBaseDate = (latestDataDate && latestDataDate > yDate) ? latestDataDate : yDate;
  const recent7DaysDescending = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => dateOffset(effectiveBaseDate, -i));
  }, [effectiveBaseDate]);

  const selectValue = days === 1 ? `day:${end}` : String(days);
  const handleSelectRangeOrDay = (val: string) => {
    if (val.startsWith('day:')) {
      onPeriodChange({ days: 1, end: val.slice(4) });
    } else {
      const d = Number(val);
      if (d === 1) {
        onPeriodChange({ days: 1, end: latestDataDate });
      } else {
        setDays(d);
      }
    }
  };

  const dates = useMemo(
    () => Array.from({ length: days }, (_, i) => dateOffset(end, i - days + 1)),
    [days, end]
  );

  const priorDates = useMemo(
    () => dates.map(d => dateOffset(d, -days)),
    [dates, days]
  );

  const { latestCheckedAt, latestSyncedAt } = useMemo(() => {
    let latestCheckedAt = '';
    let latestSyncedAt = '';
    for (const p of products) {
      const trends = values[p.id]?.trends;
      for (const syncedAt of [trends?.syncedAt, trends?.revenue?.syncedAt]) {
        if (syncedAt && syncedAt > latestSyncedAt) latestSyncedAt = syncedAt;
      }
      const checkedAt = trends?.checkedAt || trends?.syncedAt;
      if (checkedAt && checkedAt > latestCheckedAt) latestCheckedAt = checkedAt;
    }
    return { latestCheckedAt, latestSyncedAt };
  }, [products, values]);

  const formatSyncTime = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const isToday =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();

      const timeStr = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
      if (isToday) {
        return `${t('今天', 'Today')} ${timeStr}`;
      }
      return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`;
    } catch {
      return '';
    }
  };

  const handleSyncAll = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncErrors([]);
    try {
      const linked = products.filter(p => p.appStore);
      for (const p of linked) {
        try {
          const res = await requestInsights(p.id, 'sync');
          onUpdate?.(p.id, res);
        } catch (error) {
          setSyncErrors(previous => [...previous, `${p.name} · ${(error as Error).message}`]);
        }
      }
    } finally {
      setSyncing(false);
    }
  };

  function getSum(val: Insights | null | undefined, ds: string[], key: Metric): number | null {
    if (!val || !val.trends || val.trends.rows.length === 0) return null;
    const kind = key === 'impressions' || key === 'pageViews' ? 'engagement' : 'downloads';
    const cov = val.trends.coverage?.[kind] || [];
    if (cov.length === 0) return null;
    const coveredDates = ds.filter(d => cov.includes(d));
    if (coveredDates.length === 0) return null;
    return val.trends.rows
      .filter(r => r.kind === kind && coveredDates.includes(r.date))
      .reduce((sum, r) => sum + (r[key] || 0), 0);
  }

  // Portfolio Totals
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

    for (const p of products) {
      const val = values[p.id];
      if (!p.appStore) continue;
      const coverage = val?.trends.coverage;
      const downloadsComplete = dates.every(date => coverage?.downloads?.includes(date));
      const sharedDates = dates.filter(date => coverage?.downloads?.includes(date) && coverage?.engagement?.includes(date));
      if (sharedDates.length > 0) {
        matchedDownloads += getSum(val, sharedDates, 'firstDownloads') ?? 0;
        matchedImpressions += getSum(val, sharedDates, 'impressions') ?? 0;
        matchedApps++;
        matchedDays += sharedDates.length;
      }
      comparable &&= downloadsComplete && priorDates.every(date => coverage?.downloads?.includes(date));
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

    const dlDiff =
      comparable && prevDl > 0 ? ((totalDl - prevDl) / prevDl) * 100 : null;

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
  }, [products, values, dates, priorDates]);

  // Revenue stats across portfolio
  const revenueStats = useMemo(() => {
    const selectedDates = new Set(dates);
    let sales = 0;
    let proceeds = 0;
    let coveredDays = 0;
    for (const p of products) {
      if (!p.appStore) continue;
      const report = values[p.id]?.trends?.revenue;
      if (!report) continue;
      const covered = new Set(report.coverage?.filter(date => selectedDates.has(date)) || []);
      if (!covered.size) continue;
      coveredDays += covered.size;
      for (const row of report.rows || []) {
        if (!covered.has(row.date)) continue;
        sales += row.salesUsd || 0;
        proceeds += row.proceedsUsd || 0;
      }
    }
    return { sales, proceeds, coveredDays };
  }, [products, values, dates]);

  const filteredProducts = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.trim().toLowerCase();
    return products.filter(
      p => p.name.toLowerCase().includes(q) || (p.appStore?.bundleId || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  // Generate mini sparkline SVG path for a product (dynamically matches selected period)
  const renderSparkline = (val: Insights | null | undefined) => {
    if (!val || val.trends.rows.length === 0) return null;
    const series = dates.map(d => {
      if (!val.trends.coverage.downloads?.includes(d)) return 0;
      return val.trends.rows
        .filter(r => r.date === d && r.kind === 'downloads')
        .reduce((sum, r) => sum + (r.firstDownloads || 0), 0);
    });
    const max = Math.max(1, ...series);
    const w = 70;
    const h = 20;
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
        <title>{`下载走势 · ${dates[0] === end ? end : `${dates[0]} 至 ${end}`}`}</title>
        <path d={path} fill="none" stroke="#0071e3" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  // Generate mini sparkline SVG path for revenue (dynamically matches selected period)
  const renderRevenueSparkline = (val: Insights | null | undefined) => {
    if (!val) return <span className="sparkline-empty">—</span>;
    const rev = val.trends?.revenue;
    const series = dates.map(d => {
      if (!rev || !rev.rows) return 0;
      return rev.rows
        .filter(r => r.date === d)
        .reduce((sum, r) => sum + (r.salesUsd || 0), 0);
    });
    const max = Math.max(1, ...series);
    const w = 70;
    const h = 20;
    let path = '';
    if (series.length === 1) {
      const y = h - (Math.max(0, series[0]) / max) * (h - 4) - 2;
      path = `M 0 ${y.toFixed(1)} L ${w} ${y.toFixed(1)}`;
    } else {
      const step = w / Math.max(1, series.length - 1);
      series.forEach((n, i) => {
        const x = i * step;
        const y = h - (Math.max(0, n) / max) * (h - 4) - 2;
        path += `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)} `;
      });
    }

    return (
      <svg className="table-sparkline revenue-sparkline" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        <title>{`销售额走势 · ${dates[0] === end ? end : `${dates[0]} 至 ${end}`}`}</title>
        <path d={path} fill="none" stroke="#e11d48" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <section className="panel padded overview-panel">
      <div className="overview-header">
        <div className="overview-header-title">
          <h2>{t("产品数据总览", "Product Data Overview")}</h2>
          <p className="body-copy">
            {t("汇总所选期间已有的报告记录。本地服务运行时自动同步趋势，也可在此手动同步。", "Summarizes report records for the selected period. Automatically syncs trends when local service runs, or sync manually here.")}
          </p>
        </div>
        <div className="overview-controls-bar">
          <label className="field inline-field">
            <span>{t("时间范围", "Date Range")}</span>
            <select
              aria-label={t("总览时间范围", "Overview Date Range")}
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
          <label className="field inline-field">
            <span>{t("截止日期", "End Date")}</span>
            <input
              type="date"
              aria-label={t("总览截止日期", "Overview End Date")}
              value={end}
              max={yesterday()}
              onChange={e => {
                if (e.target.value) setEnd(e.target.value);
              }}
            />
          </label>
          <div className="overview-sync-group">
            <button
              type="button"
              className="button secondary button-compact sync-overview-btn"
              onClick={handleSyncAll}
              disabled={syncing}
              title={t("手动同步所有产品的趋势与收入数据", "Manually sync trends and revenue for all products")}
            >
              <RefreshCw size={13} className={syncing ? 'spin' : ''} />
              <span>{syncing ? t('正在同步…', 'Syncing...') : t('同步数据', 'Sync Data')}</span>
            </button>
            <span className="overview-sync-time" role="status">
              {t('最近检查', 'Last checked')}{' '}
              {latestCheckedAt ? <time dateTime={latestCheckedAt}>{formatSyncTime(latestCheckedAt)}</time> : '—'}
            </span>
            <span className="overview-sync-time">
              {t('数据更新', 'Data updated')}{' '}
              {latestSyncedAt ? <time dateTime={latestSyncedAt}>{formatSyncTime(latestSyncedAt)}</time> : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* 近7天单日快捷筛选栏 */}
      <RecentDaysBar
        period={period}
        onPeriodChange={onPeriodChange}
        baseDate={latestDataDate}
      />

      {syncErrors.length > 0 && (
        <div className="trend-notice" role="status">
          <strong>{t('部分产品同步请求失败', 'Some sync requests failed')}</strong>
          {syncErrors.map(message => <p key={message}>{message}</p>)}
        </div>
      )}

      {/* Portfolio Top KPI Cards with large colored icons (6 core dimensions in single unified grid) */}
      <div className="portfolio-kpis-grid">
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("组合总首次下载", "Portfolio First Downloads")}</span>
            <div className="kpi-icon-badge kpi-badge-green">
              <Download size={20} />
            </div>
          </div>
          <strong className="kpi-value">{portfolioStats.activeApps ? portfolioStats.totalDl.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">
            {portfolioStats.dlDiff !== null ? (
              <span className={portfolioStats.dlDiff >= 0 ? 'text-up' : 'text-down'}>
                {t("较前", "vs prior")} {days} {t("天", "days")} {portfolioStats.dlDiff >= 0 ? '+' : ''}
                {portfolioStats.dlDiff.toFixed(1)}%
              </span>
            ) : (
              `${t("覆盖", "Covers")} ${portfolioStats.activeApps} ${t("款产品", "products")}`
            )}
          </small>
        </div>

        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("组合总展示次数", "Portfolio Impressions")}</span>
            <div className="kpi-icon-badge kpi-badge-purple">
              <Eye size={20} />
            </div>
          </div>
          <strong className="kpi-value">{portfolioStats.engagementApps ? portfolioStats.totalImp.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">{t("累计发现展示事件", "Search and browse impressions")}</small>
        </div>

        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("组合总查看次数", "Portfolio Page Views")}</span>
            <div className="kpi-icon-badge kpi-badge-blue">
              <Layout size={20} />
            </div>
          </div>
          <strong className="kpi-value">{portfolioStats.engagementApps ? portfolioStats.totalPv.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">{t("产品页访问量", "Product page views")}</small>
        </div>

        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("首次下载 / 展示次数", "Downloads / Impressions")}</span>
            <div className="kpi-icon-badge kpi-badge-indigo">
              <TrendingUp size={20} />
            </div>
          </div>
          <strong className="kpi-value">{formatPercent(portfolioStats.overallRate)}</strong>
          <small className="kpi-sub" title={t("只汇总同一 App、同一天同时有下载与展示报告的记录", "Only records with both downloads and engagement")}>
            {portfolioStats.overallRate !== null
              ? `${t("共同覆盖", "Shared coverage")} · ${portfolioStats.matchedApps} ${t("款 App", "apps")}, ${portfolioStats.matchedDays} ${t("天", "days")}`
              : portfolioStats.matchedDays > 0 ? t('共同覆盖期间展示次数为 0', '0 impressions during shared coverage') : t('暂无共同覆盖的下载与展示数据', 'No shared download and impression data')}
          </small>
        </div>

        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("销售额", "Sales")}</span>
            <div className="kpi-icon-badge kpi-badge-rose">
              <CircleDollarSign size={20} />
            </div>
          </div>
          <strong className="kpi-value">{revenueStats.coveredDays ? formatMoney(revenueStats.sales, revenueRate) : '—'}</strong>
          <small className="kpi-sub">{t("Apple 估算，含退款调整", "Estimated by Apple, incl refunds")}</small>
        </div>

        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t("预计收入", "Proceeds")}</span>
            <div className="kpi-icon-badge kpi-badge-cyan">
              <Wallet size={20} />
            </div>
          </div>
          <strong className="kpi-value">{revenueStats.coveredDays ? formatMoney(revenueStats.proceeds, revenueRate) : '—'}</strong>
          <small className="kpi-sub">{t("扣除适用税费及 Apple 佣金", "After taxes & commission")}</small>
        </div>
      </div>

      {/* Search Toolbar */}
      <div className="overview-filter-bar">
        <input
          type="search"
          className="overview-search-input"
          placeholder={t("搜索产品名称或 Bundle ID...", "Search product name or Bundle ID...")}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="overview-count-label">
          {t("共", "Total")} {filteredProducts.length} {t("款产品", "products")}
        </span>
      </div>

      {/* Products Table with Enhanced Typography & Key Metrics */}
      <div className="trend-table overview-table">
        <table>
          <thead>
            <tr>
              <th>{t("产品名称", "Product Name")}</th>
              <th>{t("下载趋势", "Download Trend")}</th>
              <th>{t(METRIC_LABELS.firstDownloads)}</th>
              <th>{t("下载份额", "Download Share")}</th>
              <th>{t(METRIC_LABELS.pageViews)}</th>
              <th>{t(METRIC_LABELS.impressions)}</th>
              <th>{t("首次下载 / 展示次数", "Downloads / Impressions")}</th>
              <th>{t("销售额", "Sales")}</th>
              <th>{t("销售额趋势", "Sales Trend")}</th>
              <th className="th-action">{t("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => {
              const val = values[p.id];
              const dl = getSum(val, dates, 'firstDownloads');
              const pv = getSum(val, dates, 'pageViews');
              const imp = getSum(val, dates, 'impressions');
              const share =
                portfolioStats.totalDl > 0 && dl !== null
                  ? dl / portfolioStats.totalDl
                  : 0;

              const convRate = imp !== null && imp > 0 && dl !== null ? dl / imp : null;
              const revenue = val?.trends.revenue;
              const sales = getRevenueSales(revenue, dates);
              const salesStatus = sales === null
                ? revenue?.status === 'error'
                  ? t('购买报表同步失败', 'Purchase report sync failed')
                  : t('所选日期暂无购买报表数据', 'No purchase report data for the selected dates')
                : '';
              const latestRevenueDate = revenue?.coverage?.at(-1);
              const salesDetail = [salesStatus, revenue?.status === 'error' ? revenue.message : '',
                latestRevenueDate ? `${t('最近有销售额数据的日期', 'Latest date with sales data')} ${latestRevenueDate}` : '']
                .filter(Boolean).join(' · ');

              return (
                <tr
                  key={p.id}
                  className="clickable-product-row"
                  onClick={() => open(p.id)}
                  title={`点击查看 ${p.name.split(/\s[-–—]\s/)[0]} 数据分析详情`}
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open(p.id);
                    }
                  }}
                >
                  <td>
                    <div className="product-cell-group">
                      {p.icon && (
                        <img
                          src={p.icon}
                          alt={p.name}
                          className="product-cell-icon"
                          loading="lazy"
                        />
                      )}
                      <div>
                        <button
                          type="button"
                          className="text-button product-name-btn"
                          onClick={e => {
                            e.stopPropagation();
                            open(p.id);
                          }}
                        >
                          <strong>{p.name.split(/\s[-–—]\s/)[0]}</strong>
                        </button>
                        {p.appStore?.bundleId && (
                          <small className="bundle-text">{p.appStore.bundleId}</small>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>{renderSparkline(val)}</td>
                  <td>
                    <strong className="cell-highlight">{dl !== null ? dl.toLocaleString() : '—'}</strong>
                  </td>
                  <td>
                    <div className="share-cell">
                      <span>{(share * 100).toFixed(1)}%</span>
                      <div className="mini-progress-track">
                        <div
                          className="mini-progress-fill"
                          style={{ width: `${Math.min(100, share * 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td>{pv !== null ? pv.toLocaleString() : '—'}</td>
                  <td>{imp !== null ? imp.toLocaleString() : '—'}</td>
                  <td>{formatPercent(convRate)}</td>
                  <td title={salesDetail || undefined}>
                    <strong className="cell-money" aria-label={salesStatus || undefined}>{sales !== null ? formatMoney(sales, revenueRate) : '—'}</strong>
                  </td>
                  <td title={salesDetail || undefined}>{renderRevenueSparkline(val)}</td>
                  <td className="td-action">
                    <button
                      type="button"
                      className="icon-detail-btn"
                      onClick={e => {
                        e.stopPropagation();
                        open(p.id);
                      }}
                      title={t("查看详情", "View Details")}
                      aria-label={`${t("查看", "View")} ${p.name.split(/\s[-–—]\s/)[0]} ${t("详情", "details")}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!products.length && (
        <div className="empty">
          <h3>{t("暂无产品", "No products")}</h3>
          <p>{t("请先在「工作区设置 → 连接与同步」中连接并导入产品。", "Please connect and import products in Settings.")}</p>
        </div>
      )}
    </section>
  );
}
