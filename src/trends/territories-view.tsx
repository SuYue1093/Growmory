import { useState, useMemo } from 'react';
import type { TrendRow, TerritorySummary, RevenueReport } from './types';
import { getTerritoryInfo, formatPercent } from './constants';
import { formatMoney, type RevenueRate } from './revenue';
import { useI18n } from '../i18n.ts';

type TerritoriesViewProps = {
  rows: TrendRow[];
  dates: string[];
  coverage: Partial<Record<TrendRow["kind"], string[]>>;
  currentTerritory: string;
  onSelectTerritory: (territory: string) => void;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  source?: string;
};

export function TrendTerritoriesView({
  rows,
  dates,
  coverage,
  currentTerritory,
  onSelectTerritory,
  revenue,
  revenueRate = null,
  source = 'all',
}: TerritoriesViewProps) {
  const { lang, t } = useI18n();
  const [search, setSearch] = useState('');
  const [topMetric, setTopMetric] = useState<'impressions' | 'downloads' | 'sales'>('downloads');

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

  return (
    <div className="territories-view-container">
      <div className="territories-header">
        <div>
          <h3>{t('国家与地区分布', 'Territories & Markets')}</h3>
          <p className="body-copy">
            {t('按全球市场与地区查看获客情况，定位高价值与增长潜力市场。', 'View acquisition across global markets to identify high-value and high-growth opportunities.')}
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
                  className={`top-market-card ${currentTerritory === m.code ? 'selected' : ''}`}
                  onClick={() => onSelectTerritory(currentTerritory === m.code ? 'all' : m.code)}
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
                    <tr key={tRow.code} className={isSelected ? 'selected-row' : ''}>
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
                          className={`text-button ${isSelected ? 'active-filter' : ''}`}
                          onClick={() => onSelectTerritory(isSelected ? 'all' : tRow.code)}
                        >
                          {isSelected ? t('取消筛选', 'Clear Filter') : t('仅看此地区', 'Filter to This Territory')}
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
