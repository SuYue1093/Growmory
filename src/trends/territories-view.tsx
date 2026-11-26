import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Eye,
  Download,
  Layout,
  RefreshCw,
  CircleDollarSign,
  Wallet,
  TrendingUp,
  Maximize2,
  Minimize2,
  Layers,
  Table,
} from 'lucide-react';
import type { TrendRow, TerritorySummary, RevenueReport, Milestone } from './types';
import { getTerritoryInfo, formatPercent, dateOffset, getSourceLabel, getSourceColor } from './constants';
import { formatMoney, type RevenueRate } from './revenue';
import { TrendInteractiveChart } from './chart';
import { useI18n } from '../i18n.ts';

type TerritoriesViewProps = {
  rows: TrendRow[];
  dates: string[];
  prior?: string[];
  coverage: Partial<Record<TrendRow["kind"], string[]>>;
  currentTerritory: string;
  onSelectTerritory: (territory: string) => void;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  source?: string;
  milestones?: Milestone[];
  eventDate?: string;
};

export function TrendTerritoriesView({
  rows,
  dates,
  prior,
  coverage,
  currentTerritory,
  onSelectTerritory,
  revenue,
  revenueRate = null,
  source = 'all',
  milestones = [],
  eventDate,
}: TerritoriesViewProps) {
  const { lang, t } = useI18n();
  const [search, setSearch] = useState('');
  const [topMetric, setTopMetric] = useState<'impressions' | 'downloads' | 'sales'>('downloads');
  // 下钻选中的地区代码（为 null 时展示地区列表，非 null 时展示该地区下钻详情）
  const [drilledTerritory, setDrilledTerritory] = useState<string | null>(null);

  const days = dates.length;
  const calculatedPrior = useMemo(
    () => prior && prior.length === days ? prior : dates.map(d => dateOffset(d, -days)),
    [prior, dates, days]
  );

  const downloadDays = dates.filter(date => coverage.downloads?.includes(date)).length;
  const engagementDays = dates.filter(date => coverage.engagement?.includes(date)).length;
  const complete = downloadDays === dates.length && engagementDays === dates.length;

  const summaries = useMemo(() => {
    const map = new Map<string, TerritorySummary & { sales: number | null }>();
    let totalDl = 0;

    for (const r of rows) {
      if (!dates.includes(r.date)) continue;
      const code = r.territory || 'UNKNOWN';
      if (!map.has(code)) {
        const info = getTerritoryInfo(code);
        map.set(code, {
          code,
          name: info.name,
          flag: info.flag,
          impressions: 0,
          pageViews: 0,
          firstDownloads: 0,
          redownloads: 0,
          totalDownloads: 0,
          conversionRate: 0,
          share: 0,
          sales: null,
        });
      }
      const item = map.get(code)!;
      item.impressions += r.impressions;
      item.pageViews += r.pageViews;
      item.firstDownloads += r.firstDownloads;
      item.redownloads += r.redownloads;
      item.totalDownloads += r.firstDownloads + r.redownloads;
      totalDl += r.firstDownloads;
    }

    // Aggregate revenue by territory
    if (revenue?.coverage && revenue.rows) {
      const covered = new Set(revenue.coverage.filter(d => dates.includes(d)));
      if (covered.size > 0) {
        for (const [codeKey, item] of map.entries()) {
          let territorySales = 0;
          for (const r of revenue.rows) {
            if (covered.has(r.date) && r.territory === codeKey) {
              if (source !== 'all' && r.source !== source) continue;
              territorySales += r.salesUsd;
            }
          }
          item.sales = territorySales;
        }
      }
    }

    const list = Array.from(map.values());
    for (const item of list) {
      item.share = totalDl > 0 ? item.firstDownloads / totalDl : 0;
      item.conversionRate = item.impressions > 0 ? item.firstDownloads / item.impressions : 0;
    }

    return list.sort((a, b) => b.firstDownloads - a.firstDownloads || b.impressions - a.impressions);
  }, [rows, dates, revenue, source, lang]);

  const totalDl = useMemo(() => summaries.reduce((acc, s) => acc + s.firstDownloads, 0), [summaries]);
  const totalImp = useMemo(() => summaries.reduce((acc, s) => acc + s.impressions, 0), [summaries]);
  const totalSales = useMemo(() => summaries.reduce((acc, s) => acc + (s.sales || 0), 0), [summaries]);

  const topMarkets = useMemo(() => {
    const list = [...summaries];
    if (topMetric === 'impressions') {
      list.sort((a, b) => b.impressions - a.impressions || b.firstDownloads - a.firstDownloads);
    } else if (topMetric === 'sales') {
      list.sort((a, b) => (b.sales || 0) - (a.sales || 0) || b.firstDownloads - a.firstDownloads);
    } else {
      list.sort((a, b) => b.firstDownloads - a.firstDownloads || b.impressions - a.impressions);
    }
    return list.slice(0, 5);
  }, [summaries, topMetric]);

  const filtered = useMemo(() => {
    let list = [...summaries];
    if (topMetric === 'impressions') {
      list.sort((a, b) => b.impressions - a.impressions || b.firstDownloads - a.firstDownloads);
    } else if (topMetric === 'sales') {
      list.sort((a, b) => (b.sales || 0) - (a.sales || 0) || b.firstDownloads - a.firstDownloads);
    } else {
      list.sort((a, b) => b.firstDownloads - a.firstDownloads || b.impressions - a.impressions);
    }
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter(
      s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [summaries, search, topMetric]);

  // 若处于下钻模式，渲染下钻详情视图
  if (drilledTerritory) {
    return (
      <TerritoryDetailView
        territoryCode={drilledTerritory}
        summaries={summaries}
        rows={rows}
        dates={dates}
        prior={calculatedPrior}
        coverage={coverage}
        revenue={revenue}
        revenueRate={revenueRate}
        source={source}
        milestones={milestones}
        eventDate={eventDate}
        onBack={() => setDrilledTerritory(null)}
        onSwitchTerritory={code => setDrilledTerritory(code)}
      />
    );
  }

  return (
    <div className="territories-view-container">
      <div className="territories-header">
        <div>
          <h3>{t('国家与地区分布', 'Territories & Markets')}</h3>
          <p className="body-copy">
            {t('按全球市场与地区查看获客情况，定位高价值与增长潜力市场。支持点击「查看详情」下钻查看折线走势。', 'View acquisition across global markets to identify high-value opportunities. Click "View Details" to drill down into trends.')}
          </p>
        </div>
        <div className="territories-actions">
          <input
            type="search"
            className="territory-search-input"
            placeholder={t('搜索国家或地区代码...', 'Search country or region code...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {currentTerritory !== 'all' && (
            <button
              className="button secondary reset-filter-btn"
              onClick={() => onSelectTerritory('all')}
            >
              {t(`清除地区筛选 (当前: ${getTerritoryInfo(currentTerritory).name})`, `Clear Filter (Current: ${getTerritoryInfo(currentTerritory).name})`)}
            </button>
          )}
        </div>
      </div>

      {summaries.length === 0 ? (
        <div className="empty">
          <h3>{t('所选期间无可用地区数据', 'No territory data available for selected period')}</h3>
          <p>{t('请调整时间范围或等待报告更新。', 'Please adjust the date range or wait for reports to update.')}</p>
        </div>
      ) : (
        <>
          {/* Top Markets Header with 3-Type Segmented Switch: 展示 / 下载 / 销售额 */}
          <div className="top-markets-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h4 style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>
                {t('TOP 5 核心市场', 'Top 5 Core Markets')}
              </h4>
              <span style={{ fontSize: 11.5, color: '#64748b' }}>
                ({topMetric === 'impressions' ? t('按展示量排行', 'By Impressions') : topMetric === 'sales' ? t('按销售额排行', 'By Sales') : t('按首次下载量排行', 'By Downloads')})
              </span>
            </div>

            <div className="segmented-control" role="tablist" style={{ display: 'inline-flex', background: '#f1f5f9', padding: '2px', borderRadius: '6px' }}>
              <button
                type="button"
                className={`segmented-btn ${topMetric === 'impressions' ? 'active' : ''}`}
                onClick={() => setTopMetric('impressions')}
                style={{
                  padding: '4px 12px',
                  fontSize: '11.5px',
                  fontWeight: topMetric === 'impressions' ? 650 : 500,
                  borderRadius: '5px',
                  border: 'none',
                  background: topMetric === 'impressions' ? '#ffffff' : 'transparent',
                  color: topMetric === 'impressions' ? '#0f172a' : '#64748b',
                  boxShadow: topMetric === 'impressions' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {t('展示', 'Impressions')}
              </button>
              <button
                type="button"
                className={`segmented-btn ${topMetric === 'downloads' ? 'active' : ''}`}
                onClick={() => setTopMetric('downloads')}
                style={{
                  padding: '4px 12px',
                  fontSize: '11.5px',
                  fontWeight: topMetric === 'downloads' ? 650 : 500,
                  borderRadius: '5px',
                  border: 'none',
                  background: topMetric === 'downloads' ? '#ffffff' : 'transparent',
                  color: topMetric === 'downloads' ? '#0f172a' : '#64748b',
                  boxShadow: topMetric === 'downloads' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {t('下载', 'Downloads')}
              </button>
              <button
                type="button"
                className={`segmented-btn ${topMetric === 'sales' ? 'active' : ''}`}
                onClick={() => setTopMetric('sales')}
                style={{
                  padding: '4px 12px',
                  fontSize: '11.5px',
                  fontWeight: topMetric === 'sales' ? 650 : 500,
                  borderRadius: '5px',
                  border: 'none',
                  background: topMetric === 'sales' ? '#ffffff' : 'transparent',
                  color: topMetric === 'sales' ? '#0f172a' : '#64748b',
                  boxShadow: topMetric === 'sales' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  cursor: 'pointer',
                }}
              >
                {t('销售额', 'Sales')}
              </button>
            </div>
          </div>

          {/* Top Markets Cards */}
          <div className="top-markets-grid">
            {topMarkets.map((m, idx) => {
              let statDisplay = '';
              let shareDisplay = '';
              let trackPercent = 0;
              let trackColor = '#059669';

              if (topMetric === 'impressions') {
                statDisplay = m.impressions.toLocaleString();
                const share = totalImp > 0 ? (m.impressions / totalImp) * 100 : 0;
                shareDisplay = `${share.toFixed(1)}%`;
                trackPercent = share;
                trackColor = '#2563eb';
              } else if (topMetric === 'sales') {
                statDisplay = m.sales !== null && m.sales !== undefined ? formatMoney(m.sales, revenueRate) : '—';
                const share = totalSales > 0 && m.sales ? (m.sales / totalSales) * 100 : 0;
                shareDisplay = `${share.toFixed(1)}%`;
                trackPercent = share;
                trackColor = '#e11d48';
              } else {
                statDisplay = m.firstDownloads.toLocaleString();
                const share = totalDl > 0 ? (m.firstDownloads / totalDl) * 100 : 0;
                shareDisplay = `${share.toFixed(1)}%`;
                trackPercent = share;
                trackColor = '#059669';
              }

              return (
                <div
                  key={m.code}
                  className={`top-market-card clickable ${currentTerritory === m.code ? 'selected' : ''}`}
                  onClick={() => setDrilledTerritory(m.code)}
                  style={{ cursor: 'pointer' }}
                  title={t(`点击下钻查看 ${m.name} 详情`, `Click to drill down into ${m.name}`)}
                >
                  <div className="market-card-top">
                    <span className="market-rank">TOP {idx + 1}</span>
                    <span className="market-flag">{m.flag}</span>
                  </div>
                  <div className="market-name">{m.name}</div>
                  <div className="market-stat">
                    <strong>{statDisplay}</strong>
                    <span className="market-share">{shareDisplay}</span>
                  </div>
                  <div className="market-track">
                    <div
                      className="market-fill"
                      style={{
                        width: `${Math.min(100, Math.max(0, trackPercent))}%`,
                        background: trackColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Full Territories Table */}
          <div className="trend-table territories-table">
            <table>
              <thead>
                <tr>
                  <th>{t('排名', 'Rank')}</th>
                  <th>{t('国家 / 地区', 'Territory')}</th>
                  <th>{t('首次下载', 'First-time Downloads')}</th>
                  <th>{t('下载份额', 'Share')}</th>
                  <th>{t('查看次数', 'Product Page Views')}</th>
                  <th>{t('展示次数', 'Impressions')}</th>
                  <th>{t('首次下载 / 展示次数', 'Downloads / Impressions')}</th>
                  <th>{t('销售额', 'Sales')}</th>
                  <th>{t('重新下载', 'Redownloads')}</th>
                  <th>{t('操作', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tRow, idx) => {
                  const isSelected = currentTerritory === tRow.code;
                  return (
                    <tr
                      key={tRow.code}
                      className={isSelected ? 'selected-row' : ''}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setDrilledTerritory(tRow.code)}
                    >
                      <td>{idx + 1}</td>
                      <td>
                        <div className="territory-name-cell">
                          <span className="territory-flag">{tRow.flag}</span>
                          <div>
                            <strong>{tRow.name}</strong>
                            <small>{tRow.code}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong className="cell-highlight">{downloadDays ? tRow.firstDownloads.toLocaleString() : '—'}</strong>
                      </td>
                      <td>
                        <div className="share-cell">
                          <span>{(tRow.share * 100).toFixed(1)}%</span>
                          <div className="mini-progress-track">
                            <div
                              className="mini-progress-fill"
                              style={{ width: `${Math.min(100, tRow.share * 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{engagementDays ? tRow.pageViews.toLocaleString() : '—'}</td>
                      <td>{engagementDays ? tRow.impressions.toLocaleString() : '—'}</td>
                      <td>{formatPercent(complete && tRow.impressions > 0 ? tRow.conversionRate : null)}</td>
                      <td>
                        <strong className="cell-money">{tRow.sales !== null ? formatMoney(tRow.sales, revenueRate) : '—'}</strong>
                      </td>
                      <td>{downloadDays ? tRow.redownloads.toLocaleString() : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="button secondary small territory-detail-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 500,
                            borderRadius: 6,
                            cursor: 'pointer',
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDrilledTerritory(tRow.code);
                          }}
                        >
                          <Eye size={13} />
                          <span>{t('查看详情', 'View Details')}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ==========================================
// 地区下钻详情视图 (TerritoryDetailView)
// ==========================================

function TerritoryDetailView({
  territoryCode,
  summaries,
  rows,
  dates,
  prior,
  coverage,
  revenue,
  revenueRate = null,
  source = 'all',
  milestones = [],
  eventDate,
  onBack,
  onSwitchTerritory,
}: {
  territoryCode: string;
  summaries: (TerritorySummary & { sales: number | null })[];
  rows: TrendRow[];
  dates: string[];
  prior: string[];
  coverage: Partial<Record<TrendRow['kind'], string[]>>;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  source?: string;
  milestones?: Milestone[];
  eventDate?: string;
  onBack: () => void;
  onSwitchTerritory: (code: string) => void;
}) {
  const { t } = useI18n();
  const [showPrior, setShowPrior] = useState(false);
  const [showMilestones, setShowMilestones] = useState(true);
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const territoryInfo = getTerritoryInfo(territoryCode);
  const totalGlobalDownloads = useMemo(() => summaries.reduce((acc, s) => acc + s.firstDownloads, 0), [summaries]);
  const territoryRank = useMemo(() => {
    const sorted = [...summaries].sort((a, b) => b.firstDownloads - a.firstDownloads);
    const idx = sorted.findIndex(s => s.code === territoryCode);
    return idx >= 0 ? idx + 1 : null;
  }, [summaries, territoryCode]);

  const days = dates.length;
  const dlDays = dates.filter(d => coverage.downloads?.includes(d)).length;
  const engDays = dates.filter(d => coverage.engagement?.includes(d)).length;

  // 1. 过滤属于该地区的 rows
  const territoryRows = useMemo(() => {
    return rows.filter(r => r.territory === territoryCode);
  }, [rows, territoryCode]);

  // 2. 本期与前期每日指标 Map
  const { currentDaily, priorDaily } = useMemo(() => {
    const cur = new Map<string, { firstDownloads: number; pageViews: number; impressions: number; redownloads: number }>();
    const pre = new Map<string, { firstDownloads: number; pageViews: number; impressions: number; redownloads: number }>();

    for (const d of dates) {
      cur.set(d, { firstDownloads: 0, pageViews: 0, impressions: 0, redownloads: 0 });
    }
    for (const d of prior) {
      pre.set(d, { firstDownloads: 0, pageViews: 0, impressions: 0, redownloads: 0 });
    }

    for (const r of territoryRows) {
      if (cur.has(r.date)) {
        const item = cur.get(r.date)!;
        item.firstDownloads += r.firstDownloads;
        item.pageViews += r.pageViews;
        item.impressions += r.impressions;
        item.redownloads += r.redownloads;
      } else if (pre.has(r.date)) {
        const item = pre.get(r.date)!;
        item.firstDownloads += r.firstDownloads;
        item.pageViews += r.pageViews;
        item.impressions += r.impressions;
        item.redownloads += r.redownloads;
      }
    }

    return { currentDaily: cur, priorDaily: pre };
  }, [territoryRows, dates, prior]);

  // 3. 营收数据聚合
  const { currentRevenueMap, priorRevenueMap, totalSales, totalProceeds, priorTotalSales, priorTotalProceeds } = useMemo(() => {
    const curRev = new Map<string, { sales: number; proceeds: number }>();
    const preRev = new Map<string, { sales: number; proceeds: number }>();

    let tSales = 0;
    let tProceeds = 0;
    let pSales = 0;
    let pProceeds = 0;

    if (revenue?.rows && revenue.coverage) {
      const datesSet = new Set(dates);
      const priorSet = new Set(prior);
      const coveredSet = new Set(revenue.coverage);

      for (const r of revenue.rows) {
        if (r.territory !== territoryCode) continue;
        if (source !== 'all' && r.source !== source) continue;
        if (!coveredSet.has(r.date)) continue;

        if (datesSet.has(r.date)) {
          const item = curRev.get(r.date) || { sales: 0, proceeds: 0 };
          item.sales += r.salesUsd;
          item.proceeds += r.proceedsUsd;
          curRev.set(r.date, item);
          tSales += r.salesUsd;
          tProceeds += r.proceedsUsd;
        } else if (priorSet.has(r.date)) {
          const item = preRev.get(r.date) || { sales: 0, proceeds: 0 };
          item.sales += r.salesUsd;
          item.proceeds += r.proceedsUsd;
          preRev.set(r.date, item);
          pSales += r.salesUsd;
          pProceeds += r.proceedsUsd;
        }
      }
    }

    return {
      currentRevenueMap: curRev,
      priorRevenueMap: preRev,
      totalSales: revenue?.rows ? tSales : null,
      totalProceeds: revenue?.rows ? tProceeds : null,
      priorTotalSales: revenue?.rows ? pSales : null,
      priorTotalProceeds: revenue?.rows ? pProceeds : null,
    };
  }, [revenue, dates, prior, territoryCode, source]);

  // 4. 总计与环比差异
  const curDl = Array.from(currentDaily.values()).reduce((sum, v) => sum + v.firstDownloads, 0);
  const curPv = Array.from(currentDaily.values()).reduce((sum, v) => sum + v.pageViews, 0);
  const curImp = Array.from(currentDaily.values()).reduce((sum, v) => sum + v.impressions, 0);
  const curRedl = Array.from(currentDaily.values()).reduce((sum, v) => sum + v.redownloads, 0);
  const curCvr = curImp > 0 ? (curDl / curImp) : 0;

  const priorDlDays = prior.filter(d => coverage.downloads?.includes(d)).length;
  const priorEngDays = prior.filter(d => coverage.engagement?.includes(d)).length;

  const prevDl = priorDlDays === days ? Array.from(priorDaily.values()).reduce((sum, v) => sum + v.firstDownloads, 0) : null;
  const prevPv = priorEngDays === days ? Array.from(priorDaily.values()).reduce((sum, v) => sum + v.pageViews, 0) : null;
  const prevImp = priorEngDays === days ? Array.from(priorDaily.values()).reduce((sum, v) => sum + v.impressions, 0) : null;
  const prevRedl = priorDlDays === days ? Array.from(priorDaily.values()).reduce((sum, v) => sum + v.redownloads, 0) : null;

  const dlDiff = (prevDl !== null && prevDl > 0) ? ((curDl - prevDl) / prevDl) * 100 : null;
  const pvDiff = (prevPv !== null && prevPv > 0) ? ((curPv - prevPv) / prevPv) * 100 : null;
  const impDiff = (prevImp !== null && prevImp > 0) ? ((curImp - prevImp) / prevImp) * 100 : null;
  const redlDiff = (prevRedl !== null && prevRedl > 0) ? ((curRedl - prevRedl) / prevRedl) * 100 : null;
  const salesDiff = (priorTotalSales !== null && priorTotalSales > 0 && totalSales !== null) ? ((totalSales - priorTotalSales) / priorTotalSales) * 100 : null;
  const proceedsDiff = (priorTotalProceeds !== null && priorTotalProceeds > 0 && totalProceeds !== null) ? ((totalProceeds - priorTotalProceeds) / priorTotalProceeds) * 100 : null;

  // 5. 各指标折线图 Series
  const dlSeries = dates.map(d => coverage.downloads?.includes(d) ? (currentDaily.get(d)?.firstDownloads ?? 0) : null);
  const priorDlSeries = prior.map(d => coverage.downloads?.includes(d) ? (priorDaily.get(d)?.firstDownloads ?? 0) : null);
  const dlMax = Math.max(1, ...dlSeries.map(n => n ?? 0), ...(showPrior ? priorDlSeries.map(n => n ?? 0) : []));

  const pvSeries = dates.map(d => coverage.engagement?.includes(d) ? (currentDaily.get(d)?.pageViews ?? 0) : null);
  const priorPvSeries = prior.map(d => coverage.engagement?.includes(d) ? (priorDaily.get(d)?.pageViews ?? 0) : null);
  const pvMax = Math.max(1, ...pvSeries.map(n => n ?? 0), ...(showPrior ? priorPvSeries.map(n => n ?? 0) : []));

  const impSeries = dates.map(d => coverage.engagement?.includes(d) ? (currentDaily.get(d)?.impressions ?? 0) : null);
  const priorImpSeries = prior.map(d => coverage.engagement?.includes(d) ? (priorDaily.get(d)?.impressions ?? 0) : null);
  const impMax = Math.max(1, ...impSeries.map(n => n ?? 0), ...(showPrior ? priorImpSeries.map(n => n ?? 0) : []));

  const redlSeries = dates.map(d => coverage.downloads?.includes(d) ? (currentDaily.get(d)?.redownloads ?? 0) : null);
  const priorRedlSeries = prior.map(d => coverage.downloads?.includes(d) ? (priorDaily.get(d)?.redownloads ?? 0) : null);
  const redlMax = Math.max(1, ...redlSeries.map(n => n ?? 0), ...(showPrior ? priorRedlSeries.map(n => n ?? 0) : []));

  const salesSeries = dates.map(d => revenue?.coverage?.includes(d) ? (currentRevenueMap.get(d)?.sales ?? 0) : null);
  const priorSalesSeries = prior.map(d => revenue?.coverage?.includes(d) ? (priorRevenueMap.get(d)?.sales ?? 0) : null);
  const salesMax = Math.max(1, ...salesSeries.map(n => n ?? 0), ...(showPrior ? priorSalesSeries.map(n => n ?? 0) : []));

  const proceedsSeries = dates.map(d => revenue?.coverage?.includes(d) ? (currentRevenueMap.get(d)?.proceeds ?? 0) : null);
  const priorProceedsSeries = prior.map(d => revenue?.coverage?.includes(d) ? (priorRevenueMap.get(d)?.proceeds ?? 0) : null);
  const proceedsMax = Math.max(1, ...proceedsSeries.map(n => n ?? 0), ...(showPrior ? priorProceedsSeries.map(n => n ?? 0) : []));

  // 6. 渠道来源构成
  const sourceStats = useMemo(() => {
    const map = new Map<string, { source: string; firstDownloads: number; impressions: number }>();
    let totalDls = 0;
    for (const r of territoryRows) {
      if (!dates.includes(r.date)) continue;
      const src = r.source || 'Unavailable';
      if (!map.has(src)) {
        map.set(src, { source: src, firstDownloads: 0, impressions: 0 });
      }
      const item = map.get(src)!;
      item.firstDownloads += r.firstDownloads;
      item.impressions += r.impressions;
      totalDls += r.firstDownloads;
    }
    return Array.from(map.values())
      .map(s => ({
        ...s,
        share: totalDls > 0 ? (s.firstDownloads / totalDls) * 100 : 0,
        cvr: s.impressions > 0 ? (s.firstDownloads / s.impressions) * 100 : 0,
      }))
      .sort((a, b) => b.firstDownloads - a.firstDownloads);
  }, [territoryRows, dates]);

  // 7. 每日明细行
  const dailyRows = useMemo(() => {
    return [...dates].reverse().map(date => {
      const dlCovered = coverage.downloads?.includes(date);
      const engCovered = coverage.engagement?.includes(date);
      const dData = currentDaily.get(date) || { firstDownloads: 0, pageViews: 0, impressions: 0, redownloads: 0 };
      const revData = currentRevenueMap.get(date);
      const cvr = engCovered && dData.impressions > 0 ? (dData.firstDownloads / dData.impressions) * 100 : null;
      return {
        date,
        dlCovered,
        engCovered,
        firstDownloads: dData.firstDownloads,
        pageViews: dData.pageViews,
        impressions: dData.impressions,
        redownloads: dData.redownloads,
        cvr,
        sales: revData ? revData.sales : null,
      };
    });
  }, [dates, coverage, currentDaily, currentRevenueMap]);

  const renderChartCard = (
    key: string,
    label: string,
    currentValue: number | null,
    diff: number | null,
    series: (number | null)[],
    priorSeries: (number | null)[],
    maximum: number,
    primaryColor: string,
    lightColor: string,
    borderColor: string,
    icon: React.ReactNode,
    badgeClass: string,
    formatter?: (val: number | null) => string
  ) => {
    const isExpanded = expandedMetric === key;
    return (
      <div key={key} className={`metric-chart-card ${isExpanded ? 'is-expanded' : ''}`}>
        <div className="metric-chart-header">
          <div className="metric-header-left">
            <div className={`kpi-icon-badge ${badgeClass}`}>
              {icon}
            </div>
            <div>
              <h4>{label}</h4>
              <span className="metric-chart-dates">{dates[0]} {t('至', 'to')} {dates[dates.length - 1]}</span>
            </div>
          </div>
          <div className="metric-header-actions">
            <div className="metric-header-stats">
              <strong className="metric-header-value">
                {currentValue === null ? '—' : formatter ? formatter(currentValue) : currentValue.toLocaleString()}
              </strong>
              <small className="metric-header-sub">
                {diff !== null ? (
                  <span className={diff >= 0 ? 'text-up' : 'text-down'}>
                    {t('较前', 'vs prior')} {days} {t('天', 'days')} {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%
                  </span>
                ) : (
                  `${t('已覆盖', 'Covered')} ${series.filter(s => s !== null).length}/${days} ${t('天', 'days')}`
                )}
              </small>
            </div>
            <button
              type="button"
              className={`chart-expand-btn ${isExpanded ? 'expanded' : ''}`}
              onClick={() => setExpandedMetric(isExpanded ? null : key)}
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
          series={series}
          priorSeries={priorSeries}
          label={label}
          color={{ primary: primaryColor, light: lightColor, border: borderColor }}
          valueFormatter={formatter || (v => v === null ? '—' : v.toLocaleString())}
          maximum={maximum}
          milestones={milestones}
          showPrior={showPrior}
          showMilestones={showMilestones}
          eventDate={eventDate}
        />
      </div>
    );
  };

  return (
    <div className="territory-detail-view" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. 顶部返回导航与地区切换 */}
      <div
        className="territory-drill-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '12px 16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="button secondary small territory-drill-back-btn"
            onClick={onBack}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              fontWeight: 600,
            }}
          >
            <ArrowLeft size={15} />
            <span>{t('返回地区分布', 'Back to Territories')}</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{territoryInfo.flag}</span>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                  {territoryInfo.name}
                </h3>
                <span className="badge" style={{ fontSize: 11.5, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                  {territoryCode}
                </span>
                {territoryRank && (
                  <span className="badge" style={{ fontSize: 11.5, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>
                    TOP {territoryRank}
                  </span>
                )}
              </div>
              <p className="body-copy" style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                {t('该地区指标走势折线图、转化漏斗、流量来源与每日明细', 'Metric trends charts, conversion funnel, sources & daily breakdown in this market')}
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>
            {t('切换地区：', 'Switch Market: ')}
          </label>
          <select
            aria-label={t('切换地区', 'Switch Market')}
            className="select-compact"
            value={territoryCode}
            onChange={e => onSwitchTerritory(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {summaries.map(s => (
              <option key={s.code} value={s.code}>
                {s.flag} {s.name} ({s.code}) - {s.firstDownloads.toLocaleString()} {t('次', '')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 2. 核心 KPI 汇总卡片网格：展示、查看、首次下载、重新下载、销售额、预计收入 */}
      <div className="portfolio-kpis-grid">
        {/* 1. 展示次数 */}
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('展示次数', 'Impressions')}</span>
            <div className="kpi-icon-badge kpi-badge-purple">
              <Eye size={18} />
            </div>
          </div>
          <strong className="kpi-value">{engDays ? curImp.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">
            {impDiff !== null ? (
              <span className={impDiff >= 0 ? 'text-up' : 'text-down'}>
                {t('较前', 'vs prior')} {days} {t('天', 'days')} {impDiff >= 0 ? '+' : ''}{impDiff.toFixed(1)}%
              </span>
            ) : engDays > 0 ? (
              `${t('日均', 'Daily avg')} ${Math.round(curImp / engDays).toLocaleString()}`
            ) : (
              `${t('已覆盖', 'Covered')} ${engDays}/${days} ${t('天', 'days')}`
            )}
          </small>
        </div>

        {/* 2. 查看次数 */}
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('查看次数', 'Product Page Views')}</span>
            <div className="kpi-icon-badge kpi-badge-blue">
              <Layout size={18} />
            </div>
          </div>
          <strong className="kpi-value">{engDays ? curPv.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">
            {pvDiff !== null ? (
              <span className={pvDiff >= 0 ? 'text-up' : 'text-down'}>
                {t('较前', 'vs prior')} {days} {t('天', 'days')} {pvDiff >= 0 ? '+' : ''}{pvDiff.toFixed(1)}%
              </span>
            ) : engDays > 0 ? (
              `${t('日均', 'Daily avg')} ${Math.round(curPv / engDays).toLocaleString()}`
            ) : (
              `${t('已覆盖', 'Covered')} ${engDays}/${days} ${t('天', 'days')}`
            )}
          </small>
        </div>

        {/* 3. 首次下载 */}
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('首次下载', 'First Downloads')}</span>
            <div className="kpi-icon-badge kpi-badge-green">
              <Download size={18} />
            </div>
          </div>
          <strong className="kpi-value">{dlDays ? curDl.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">
            {dlDiff !== null ? (
              <span className={dlDiff >= 0 ? 'text-up' : 'text-down'}>
                {t('较前', 'vs prior')} {days} {t('天', 'days')} {dlDiff >= 0 ? '+' : ''}{dlDiff.toFixed(1)}%
              </span>
            ) : totalGlobalDownloads > 0 ? (
              `${t('占全球下载份额', 'Global share')} ${((curDl / totalGlobalDownloads) * 100).toFixed(1)}%`
            ) : (
              `${t('已覆盖', 'Covered')} ${dlDays}/${days} ${t('天', 'days')}`
            )}
          </small>
        </div>

        {/* 4. 重新下载 */}
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('重新下载', 'Redownloads')}</span>
            <div className="kpi-icon-badge kpi-badge-purple">
              <RefreshCw size={18} />
            </div>
          </div>
          <strong className="kpi-value">{dlDays ? curRedl.toLocaleString() : '—'}</strong>
          <small className="kpi-sub">
            {redlDiff !== null ? (
              <span className={redlDiff >= 0 ? 'text-up' : 'text-down'}>
                {t('较前', 'vs prior')} {days} {t('天', 'days')} {redlDiff >= 0 ? '+' : ''}{redlDiff.toFixed(1)}%
              </span>
            ) : (
              t('老用户召回下载次数', 'Returning users redownloading')
            )}
          </small>
        </div>

        {/* 5. 销售额（如果有营收数据） */}
        {totalSales !== null && (
          <div className="portfolio-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">{t('销售额', 'Sales')}</span>
              <div className="kpi-icon-badge kpi-badge-rose">
                <CircleDollarSign size={18} />
              </div>
            </div>
            <strong className="kpi-value">{formatMoney(totalSales, revenueRate)}</strong>
            <small className="kpi-sub">
              {salesDiff !== null ? (
                <span className={salesDiff >= 0 ? 'text-up' : 'text-down'}>
                  {t('较前', 'vs prior')} {days} {t('天', 'days')} {salesDiff >= 0 ? '+' : ''}{salesDiff.toFixed(1)}%
                </span>
              ) : (
                t('Apple 估算，含退款调整', 'Estimated by Apple, incl refunds')
              )}
            </small>
          </div>
        )}

        {/* 6. 预计收入（如果有营收数据） */}
        {totalProceeds !== null && (
          <div className="portfolio-kpi-card">
            <div className="kpi-card-header">
              <span className="kpi-label">{t('预计收入', 'Proceeds')}</span>
              <div className="kpi-icon-badge kpi-badge-cyan">
                <Wallet size={18} />
              </div>
            </div>
            <strong className="kpi-value">{formatMoney(totalProceeds, revenueRate)}</strong>
            <small className="kpi-sub">
              {proceedsDiff !== null ? (
                <span className={proceedsDiff >= 0 ? 'text-up' : 'text-down'}>
                  {t('较前', 'vs prior')} {days} {t('天', 'days')} {proceedsDiff >= 0 ? '+' : ''}{proceedsDiff.toFixed(1)}%
                </span>
              ) : (
                t('扣除适用税费及 Apple 佣金', 'After taxes & commission')
              )}
            </small>
          </div>
        )}

        {/* 7. 下载转化率 */}
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('首次下载 / 展示次数', 'Conversion Rate')}</span>
            <div className="kpi-icon-badge kpi-badge-indigo">
              <TrendingUp size={18} />
            </div>
          </div>
          <strong className="kpi-value">{engDays && curImp > 0 ? formatPercent(curCvr) : '—'}</strong>
          <small className="kpi-sub">
            {curImp > 0 ? t('展示转化为首次下载综合效率', 'Impression to install conversion') : t('暂无展示曝光数据', 'No impressions')}
          </small>
        </div>
      </div>

      {/* 3. 各数据折线图 (Metric Trends Charts) */}
      <div className="chart-view-toolbar" style={{ marginTop: 8 }}>
        <div className="chart-title-group">
          <h3>
            {territoryInfo.flag} {territoryInfo.name} · {t('数据指标走势折线图', 'Metric Trends Charts')}
            <span style={{ fontSize: 13, fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
              ({dates[0]} {t('至', 'to')} {dates[dates.length - 1]})
            </span>
          </h3>
        </div>

        <div className="chart-toggles">
          <label className="chart-toggle-label">
            <input
              type="checkbox"
              checked={showPrior}
              onChange={e => setShowPrior(e.target.checked)}
            />
            <span>{t('对比前', 'vs prior')} {days} {t('天曲线', 'days curve')}</span>
          </label>
          <label className="chart-toggle-label">
            <input
              type="checkbox"
              checked={showMilestones}
              onChange={e => setShowMilestones(e.target.checked)}
            />
            <span>{t('标注版本与 ASO', 'Mark Releases & ASO')}</span>
          </label>
        </div>
      </div>

      {/* 折线图网格：排序依次为 展示、查看、首次下载、重新下载、销售额、预计收入 */}
      <div className="trend-charts-quad-grid">
        {/* 1. 展示次数 */}
        {renderChartCard('impressions', t('展示次数', 'Impressions'), curImp, impDiff, impSeries, priorImpSeries, impMax, '#6366f1', '#eef2ff', '#c7d2fe', <Eye size={18} />, 'kpi-badge-purple')}
        {/* 2. 查看次数 */}
        {renderChartCard('pageViews', t('查看次数', 'Product Page Views'), curPv, pvDiff, pvSeries, priorPvSeries, pvMax, '#0ea5e9', '#f0f9ff', '#bae6fd', <Layout size={18} />, 'kpi-badge-blue')}
        {/* 3. 首次下载 */}
        {renderChartCard('firstDownloads', t('首次下载', 'First-time Downloads'), curDl, dlDiff, dlSeries, priorDlSeries, dlMax, '#2563eb', '#eff6ff', '#bfdbfe', <Download size={18} />, 'kpi-badge-green')}
        {/* 4. 重新下载 */}
        {renderChartCard('redownloads', t('重新下载', 'Redownloads'), curRedl, redlDiff, redlSeries, priorRedlSeries, redlMax, '#8b5cf6', '#f5f3ff', '#ddd6fe', <RefreshCw size={18} />, 'kpi-badge-indigo')}

        {/* 5. 销售额（如果有销售额数据） */}
        {totalSales !== null && (
          renderChartCard('sales', t('销售额', 'Sales'), totalSales, salesDiff, salesSeries, priorSalesSeries, salesMax, '#e11d48', '#fff1f2', '#fecdd3', <CircleDollarSign size={18} />, 'kpi-badge-rose', v => v === null ? '—' : formatMoney(v, revenueRate))
        )}

        {/* 6. 预计收入（如果有收入数据） */}
        {totalProceeds !== null && (
          renderChartCard('proceeds', t('预计收入', 'Proceeds'), totalProceeds, proceedsDiff, proceedsSeries, priorProceedsSeries, proceedsMax, '#0891b2', '#ecfeff', '#a5f3fc', <Wallet size={18} />, 'kpi-badge-cyan', v => v === null ? '—' : formatMoney(v, revenueRate))
        )}
      </div>

      {/* 4. 该地区来源渠道分布与每日明细 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
        {sourceStats.length > 0 && (
          <div className="trend-table" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Layers size={17} color="#3b82f6" />
              <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#1e293b' }}>
                {t('该地区获客来源构成', 'Traffic Sources in This Territory')}
              </h4>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t('来源渠道', 'Source Channel')}</th>
                  <th>{t('首次下载', 'First-time Downloads')}</th>
                  <th>{t('下载占比', 'Download Share')}</th>
                  <th>{t('展示次数', 'Impressions')}</th>
                  <th>{t('下载转化率', 'CVR')}</th>
                </tr>
              </thead>
              <tbody>
                {sourceStats.map(s => (
                  <tr key={s.source}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: getSourceColor(s.source) }} />
                        <strong>{getSourceLabel(s.source)}</strong>
                      </div>
                    </td>
                    <td>
                      <strong className="cell-highlight">{s.firstDownloads.toLocaleString()}</strong>
                    </td>
                    <td>
                      <div className="share-cell">
                        <span>{s.share.toFixed(1)}%</span>
                        <div className="mini-progress-track">
                          <div className="mini-progress-fill" style={{ width: `${Math.min(100, s.share)}%`, background: getSourceColor(s.source) }} />
                        </div>
                      </div>
                    </td>
                    <td>{s.impressions.toLocaleString()}</td>
                    <td>{formatPercent(s.cvr / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 每日数据明细 */}
        <div className="trend-table" style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Table size={17} color="#6366f1" />
            <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: '#1e293b' }}>
              {t('该地区每日数据明细', 'Daily Breakdown in This Territory')}
            </h4>
          </div>
          <table>
            <thead>
              <tr>
                <th>{t('日期', 'Date')}</th>
                <th>{t('首次下载', 'First Downloads')}</th>
                <th>{t('查看次数', 'Product Page Views')}</th>
                <th>{t('展示次数', 'Impressions')}</th>
                <th>{t('转化率 (下载/展示)', 'CVR')}</th>
                <th>{t('重新下载', 'Redownloads')}</th>
                {totalSales !== null && <th>{t('销售额', 'Sales')}</th>}
              </tr>
            </thead>
            <tbody>
              {dailyRows.map(row => (
                <tr key={row.date}>
                  <td style={{ fontWeight: 600 }}>{row.date}</td>
                  <td>
                    <strong className="cell-highlight">{row.dlCovered ? row.firstDownloads.toLocaleString() : '—'}</strong>
                  </td>
                  <td>{row.engCovered ? row.pageViews.toLocaleString() : '—'}</td>
                  <td>{row.engCovered ? row.impressions.toLocaleString() : '—'}</td>
                  <td>{formatPercent(row.cvr !== null ? row.cvr / 100 : null)}</td>
                  <td>{row.dlCovered ? row.redownloads.toLocaleString() : '—'}</td>
                  {totalSales !== null && (
                    <td>
                      <strong className="cell-money">{row.sales !== null ? formatMoney(row.sales, revenueRate) : '—'}</strong>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
