import { useMemo } from 'react';
import type { TrendRow, SourceSummary, RevenueReport } from './types';
import { getSourceLabel, getSourceColor, formatPercent, SOURCE_INFO } from './constants';
import { formatMoney, type RevenueRate } from './revenue';
import { useI18n } from '../i18n.ts';

type SourcesViewProps = {
  rows: TrendRow[];
  dates: string[];
  coverage: Partial<Record<TrendRow["kind"], string[]>>;
  currentSource: string;
  onSelectSource: (source: string) => void;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  territory?: string;
};

export function TrendSourcesView({
  rows,
  dates,
  coverage,
  currentSource,
  onSelectSource,
  revenue,
  revenueRate = null,
  territory = 'all',
}: SourcesViewProps) {
  const { t } = useI18n();
  const downloadDays = dates.filter(date => coverage.downloads?.includes(date)).length;
  const engagementDays = dates.filter(date => coverage.engagement?.includes(date)).length;
  const complete = downloadDays === dates.length && engagementDays === dates.length;
  const summaries = useMemo(() => {
    const map = new Map<string, SourceSummary & { sales: number | null }>();
    let totalDl = 0;
    let totalImp = 0;

    for (const r of rows) {
      if (!dates.includes(r.date)) continue;
      const s = r.source || 'Unavailable';
      if (!map.has(s)) {
        map.set(s, {
          source: s,
          label: getSourceLabel(s),
          impressions: 0,
          pageViews: 0,
          firstDownloads: 0,
          redownloads: 0,
          totalDownloads: 0,
          conversionRate: 0,
          installRate: 0,
          share: 0,
          sales: null,
        });
      }
      const item = map.get(s)!;
      item.impressions += r.impressions;
      item.pageViews += r.pageViews;
      item.firstDownloads += r.firstDownloads;
      item.redownloads += r.redownloads;
      item.totalDownloads += r.firstDownloads + r.redownloads;
      totalDl += r.firstDownloads;
      totalImp += r.impressions;
    }

    // Aggregate revenue by source
    if (revenue?.coverage && revenue.rows) {
      const covered = new Set(revenue.coverage.filter(d => dates.includes(d)));
      if (covered.size > 0) {
        for (const [sKey, item] of map.entries()) {
          let sourceSales = 0;
          for (const r of revenue.rows) {
            if (covered.has(r.date) && r.source === sKey) {
              if (territory !== 'all' && r.territory !== territory) continue;
              sourceSales += r.salesUsd;
            }
          }
          item.sales = sourceSales;
        }
      }
    }

    const list = Array.from(map.values());
    for (const item of list) {
      item.share = totalDl > 0 ? item.firstDownloads / totalDl : 0;
      item.conversionRate = item.impressions > 0 ? item.firstDownloads / item.impressions : 0;
      item.installRate = item.pageViews > 0 ? item.firstDownloads / item.pageViews : 0;
    }

    return list.sort((a, b) => b.firstDownloads - a.firstDownloads || b.impressions - a.impressions);
  }, [rows, dates, revenue, territory]);

  return (
    <div className="sources-view-container">
      <div className="sources-header">
        <div>
          <h3>{t("获客渠道与来源构成", "Acquisition Channels & Source Composition")}</h3>
          <p className="body-copy">
            {t("分析用户通过哪些 App Store 入口发现并下载了应用，识别主力获客来源。", "Analyze which App Store entry points drive user discovery and downloads.")}
          </p>
        </div>
        {currentSource !== 'all' && (
          <button
            className="button secondary reset-filter-btn"
            onClick={() => onSelectSource('all')}
          >
            {t("清除渠道筛选", "Clear Channel Filter")} ({t("当前", "Current")}: {getSourceLabel(currentSource)})
          </button>
        )}
      </div>

      {summaries.length === 0 ? (
        <div className="empty">
          <h3>{t("所选期间无可用渠道数据", "No channel data for selected period")}</h3>
          <p>{t("请调整时间范围或等待报告更新。", "Please adjust time range or wait for report updates.")}</p>
        </div>
      ) : (
        <>
          {/* Visual Source Distribution Bars */}
          <div className="sources-distribution-card">
            <h4>{t("首次下载渠道构成", "First-time Download Channel Composition")}</h4>
            <div className="stacked-progress-bar">
              {summaries.map(s => {
                if (s.share <= 0.001) return null;
                const color = getSourceColor(s.source);
                return (
                  <div
                    key={s.source}
                    className="progress-slice"
                    style={{
                      width: `${(s.share * 100).toFixed(1)}%`,
                      backgroundColor: color,
                    }}
                    title={`${s.label}: ${downloadDays ? s.firstDownloads.toLocaleString() : '—'} (${(s.share * 100).toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="progress-legend">
              {summaries.map(s => (
                <div key={s.source} className="legend-chip">
                  <span
                    className="chip-dot"
                    style={{ backgroundColor: getSourceColor(s.source) }}
                  />
                  <span className="chip-label">{s.label}</span>
                  <span className="chip-pct">{(s.share * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Channels Table */}
          <div className="trend-table sources-table">
            <table>
              <thead>
                <tr>
                  <th>{t("来源渠道", "Source Channel")}</th>
                  <th>{t("首次下载", "First-time Downloads")}</th>
                  <th>{t("下载占比", "Download Share")}</th>
                  <th>{t("查看次数", "Page Views")}</th>
                  <th>{t("展示次数", "Impressions")}</th>
                  <th>{t("首次下载 / 展示次数", "Downloads / Impressions")}</th>
                  <th>{t("销售额", "Sales")}</th>
                  <th>{t("重新下载", "Redownloads")}</th>
                  <th>{t("操作", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map(s => {
                  const isSelected = currentSource === s.source;
                  const info = SOURCE_INFO[s.source];
                  return (
                    <tr key={s.source} className={isSelected ? 'selected-row' : ''}>
                      <td>
                        <div className="source-name-cell">
                          <span
                            className="source-indicator"
                            style={{ backgroundColor: getSourceColor(s.source) }}
                          />
                          <div>
                            <strong>{s.label}</strong>
                            {info?.desc && <small>{t(info.desc)}</small>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong className="cell-highlight">{downloadDays ? s.firstDownloads.toLocaleString() : '—'}</strong>
                      </td>
                      <td>
                        <div className="share-cell">
                          <span>{(s.share * 100).toFixed(1)}%</span>
                          <div className="mini-progress-track">
                            <div
                              className="mini-progress-fill"
                              style={{
                                width: `${Math.min(100, s.share * 100)}%`,
                                backgroundColor: getSourceColor(s.source),
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>{engagementDays ? s.pageViews.toLocaleString() : '—'}</td>
                      <td>{engagementDays ? s.impressions.toLocaleString() : '—'}</td>
                      <td>{formatPercent(complete && s.impressions > 0 ? s.conversionRate : null)}</td>
                      <td>
                        <strong className="cell-money">{s.sales !== null ? formatMoney(s.sales, revenueRate) : '—'}</strong>
                      </td>
                      <td>{downloadDays ? s.redownloads.toLocaleString() : '—'}</td>
                      <td>
                        <button
                          className={`text-button ${isSelected ? 'active-filter' : ''}`}
                          onClick={() => onSelectSource(isSelected ? 'all' : s.source)}
                        >
                          {isSelected ? t("取消筛选", "Clear Filter") : t("仅看此渠道", "Filter by Channel")}
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
