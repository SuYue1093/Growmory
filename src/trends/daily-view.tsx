import { useState, useMemo } from 'react';
import { Download, Copy, Check, ArrowUpDown } from 'lucide-react';
import type { Metric, RevenueReport } from './types';
import { METRIC_LABELS, formatPercent } from './constants';
import { formatMoney, type RevenueRate } from './revenue';
import { useI18n } from '../i18n.ts';

type DailyViewProps = {
  dates: string[];
  count: (date: string, key: Metric) => number | null;
  productName: string;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  source?: string;
  territory?: string;
};

type SortKey = 'date' | 'impressions' | 'pageViews' | 'firstDownloads' | 'redownloads' | 'rate' | 'sales';

export function TrendDailyView({
  dates,
  count,
  productName,
  revenue,
  revenueRate = null,
  source = 'all',
  territory = 'all',
}: DailyViewProps) {
  const { lang, t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortAsc, setSortAsc] = useState(false);
  const [limit, setLimit] = useState<number>(30);

  const dailyRows = useMemo(() => {
    return dates.map(date => {
      const impressions = count(date, 'impressions');
      const pageViews = count(date, 'pageViews');
      const firstDownloads = count(date, 'firstDownloads');
      const redownloads = count(date, 'redownloads');
      const rate =
        impressions && impressions > 0 && firstDownloads !== null
          ? firstDownloads / impressions
          : null;

      let sales: number | null = null;
      if (revenue?.coverage && revenue.rows) {
        if (revenue.coverage.includes(date)) {
          let daySales = 0;
          for (const r of revenue.rows) {
            if (r.date === date) {
              if (source !== 'all' && r.source !== source) continue;
              if (territory !== 'all' && r.territory !== territory) continue;
              daySales += r.salesUsd;
            }
          }
          sales = daySales;
        }
      }

      return {
        date,
        impressions,
        pageViews,
        firstDownloads,
        redownloads,
        rate,
        sales,
      };
    });
  }, [dates, count, revenue, source, territory]);

  const filteredAndSorted = useMemo(() => {
    let rows = dailyRows;
    if (search.trim()) {
      const q = search.trim();
      rows = rows.filter(r => r.date.includes(q));
    }

    return [...rows].sort((a, b) => {
      if (sortKey === 'date') {
        return sortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
      }
      const numA = (a[sortKey] as number) ?? -1;
      const numB = (b[sortKey] as number) ?? -1;
      return sortAsc ? numA - numB : numB - numA;
    });
  }, [dailyRows, search, sortKey, sortAsc]);

  const displayedRows = limit > 0 ? filteredAndSorted.slice(0, limit) : filteredAndSorted;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  // Export CSV with UTF-8 BOM
  const handleExportCsv = () => {
    const headers = ['日期', '展示次数', '查看次数', '首次下载', '重新下载', '首次下载 / 展示次数', '销售额'];
    const rows = dailyRows.map(r => [
      r.date,
      r.impressions ?? '',
      r.pageViews ?? '',
      r.firstDownloads ?? '',
      r.redownloads ?? '',
      r.rate !== null ? (r.rate * 100).toFixed(2) + '%' : '',
      r.sales !== null ? formatMoney(r.sales, revenueRate) : '',
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${productName}-app-analytics-${dates[0]}-至-${dates[dates.length - 1]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy table to clipboard
  const handleCopyTable = async () => {
    const headers = ['日期', '展示次数', '查看次数', '首次下载', '重新下载', '首次下载 / 展示次数', '销售额'];
    const rows = dailyRows.map(r => [
      r.date,
      r.impressions ?? '—',
      r.pageViews ?? '—',
      r.firstDownloads ?? '—',
      r.redownloads ?? '—',
      r.rate !== null ? (r.rate * 100).toFixed(2) + '%' : '—',
      r.sales !== null ? formatMoney(r.sales, revenueRate) : '—',
    ]);
    const text = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="daily-view-container">
      <div className="daily-header">
        <div>
          <h3>{t("每日数据明细", "Daily Data Breakdown")}</h3>
          <p className="body-copy">
            {lang === 'en' ? `${dates.length} days recorded. Dashes denote insufficient coverage. Supports sorting, filtering, and export.` : `共 ${dates.length} 天记录。覆盖不足的日期显示破折号，支持排序、筛选与表格导出。`}
          </p>
        </div>
        <div className="daily-toolbar">
          <input
            type="search"
            className="daily-search-input"
            placeholder={t("搜索日期 (YYYY-MM-DD)...", "Search date (YYYY-MM-DD)...")}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="button secondary icon-btn" onClick={handleExportCsv} title={t("导出 CSV 文件", "Export CSV file")}>
            <Download size={14} />
            <span>{t("导出 CSV", "Export CSV")}</span>
          </button>
          <button className="button secondary icon-btn" onClick={handleCopyTable} title={t("复制数据到剪贴板", "Copy data to clipboard")}>
            {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
            <span>{copied ? t("已复制", "Copied") : t("复制表格", "Copy Table")}</span>
          </button>
        </div>
      </div>

      <div className="trend-table daily-table">
        <table>
          <thead>
            <tr>
              <th onClick={() => handleSort('date')} className="sortable-th">
                <div className="th-content">
                  <span>{t("日期", "Date")}</span>
                  <ArrowUpDown size={12} className={sortKey === 'date' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('impressions')} className="sortable-th">
                <div className="th-content">
                  <span>{METRIC_LABELS.impressions}</span>
                  <ArrowUpDown size={12} className={sortKey === 'impressions' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('pageViews')} className="sortable-th">
                <div className="th-content">
                  <span>{METRIC_LABELS.pageViews}</span>
                  <ArrowUpDown size={12} className={sortKey === 'pageViews' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('firstDownloads')} className="sortable-th">
                <div className="th-content">
                  <span>{METRIC_LABELS.firstDownloads}</span>
                  <ArrowUpDown size={12} className={sortKey === 'firstDownloads' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('rate')} className="sortable-th">
                <div className="th-content">
                  <span>{t("首次下载 / 展示次数", "Downloads / Impressions")}</span>
                  <ArrowUpDown size={12} className={sortKey === 'rate' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('sales')} className="sortable-th">
                <div className="th-content">
                  <span>{t("销售额", "Sales")}</span>
                  <ArrowUpDown size={12} className={sortKey === 'sales' ? 'active-sort' : ''} />
                </div>
              </th>
              <th onClick={() => handleSort('redownloads')} className="sortable-th">
                <div className="th-content">
                  <span>{METRIC_LABELS.redownloads}</span>
                  <ArrowUpDown size={12} className={sortKey === 'redownloads' ? 'active-sort' : ''} />
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(r => (
              <tr key={r.date}>
                <td>
                  <strong>{r.date}</strong>
                </td>
                <td>{r.impressions !== null ? r.impressions.toLocaleString() : '—'}</td>
                <td>{r.pageViews !== null ? r.pageViews.toLocaleString() : '—'}</td>
                <td>
                  <strong className="cell-highlight">{r.firstDownloads !== null ? r.firstDownloads.toLocaleString() : '—'}</strong>
                </td>
                <td>{r.rate !== null ? formatPercent(r.rate) : '—'}</td>
                <td>
                  <strong className="cell-money">{r.sales !== null ? formatMoney(r.sales, revenueRate) : '—'}</strong>
                </td>
                <td>{r.redownloads !== null ? r.redownloads.toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredAndSorted.length > 30 && (
        <div className="daily-pagination-bar">
          <span>
            {lang === 'en' ? `Showing ${displayedRows.length} / ${filteredAndSorted.length} records` : `显示 ${displayedRows.length} / ${filteredAndSorted.length} 条记录`}
          </span>
          <div className="limit-buttons">
            <button
              className={`text-button ${limit === 30 ? 'active' : ''}`}
              onClick={() => setLimit(30)}
            >
              {t("前 30 条", "Top 30")}
            </button>
            <button
              className={`text-button ${limit === 60 ? 'active' : ''}`}
              onClick={() => setLimit(60)}
            >
              {t("前 60 条", "Top 60")}
            </button>
            <button
              className={`text-button ${limit === 0 ? 'active' : ''}`}
              onClick={() => setLimit(0)}
            >
              {t("全部展开", "Show All")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
