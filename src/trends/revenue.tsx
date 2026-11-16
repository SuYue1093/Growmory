import { CircleDollarSign, Wallet } from 'lucide-react';
import type { RevenueReport } from './types';
import { useI18n } from '../i18n.ts';
import { formatMoney, type RevenueRate } from '../currency';
export { formatMoney, type RevenueRate };

export function getRevenueSales(report: RevenueReport | undefined, dates: string[], source = 'all', territory = 'all'): number | null {
  if (!report || !report.coverage || !report.rows) return null;
  const selectedDates = new Set(dates);
  const covered = new Set(report.coverage.filter(date => selectedDates.has(date)));
  if (covered.size === 0) return null;
  let sales = 0;
  for (const row of report.rows) {
    if (!covered.has(row.date)) continue;
    if (source !== 'all' && row.source !== source) continue;
    if (territory !== 'all' && row.territory !== territory) continue;
    sales += row.salesUsd;
  }
  return sales;
}

export function getRevenueProceeds(report: RevenueReport | undefined, dates: string[], source = 'all', territory = 'all'): number | null {
  if (!report || !report.coverage || !report.rows) return null;
  const selectedDates = new Set(dates);
  const covered = new Set(report.coverage.filter(date => selectedDates.has(date)));
  if (covered.size === 0) return null;
  let proceeds = 0;
  for (const row of report.rows) {
    if (!covered.has(row.date)) continue;
    if (source !== 'all' && row.source !== source) continue;
    if (territory !== 'all' && row.territory !== territory) continue;
    proceeds += row.proceedsUsd;
  }
  return proceeds;
}

export function RevenueSummary({
  reports,
  dates,
  rate,
  source = 'all',
  territory = 'all',
}: {
  reports: (RevenueReport | undefined)[];
  dates: string[];
  rate: RevenueRate | null;
  source?: string;
  territory?: string;
}) {
  const { t } = useI18n();
  const selectedDates = new Set(dates);
  let sales = 0;
  let proceeds = 0;
  let coveredDays = 0;

  for (const report of reports) {
    if (!report) continue;
    const covered = new Set(report.coverage.filter(date => selectedDates.has(date)));
    if (!covered.size) continue;
    coveredDays += covered.size;
    for (const row of report.rows) {
      if (!covered.has(row.date) || (source !== 'all' && row.source !== source) || (territory !== 'all' && row.territory !== territory)) continue;
      sales += row.salesUsd;
      proceeds += row.proceedsUsd;
    }
  }

  return (
    <section aria-label={t('App Store 收入', 'App Store Revenue')}>
      <div className="portfolio-kpis-grid revenue-kpis-grid">
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('销售额', 'Sales')}</span>
            <div className="kpi-icon-badge kpi-badge-rose">
              <CircleDollarSign size={20} />
            </div>
          </div>
          <strong className="kpi-value">{coveredDays ? formatMoney(sales, rate) : '—'}</strong>
          <small className="kpi-sub">{t('Apple 估算，含退款调整', 'Estimated by Apple, incl. returns')}</small>
        </div>
        <div className="portfolio-kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">{t('预计收入', 'Proceeds')}</span>
            <div className="kpi-icon-badge kpi-badge-cyan">
              <Wallet size={20} />
            </div>
          </div>
          <strong className="kpi-value">{coveredDays ? formatMoney(proceeds, rate) : '—'}</strong>
          <small className="kpi-sub">{t('扣除适用税费及 Apple 佣金', 'Net of applicable taxes and Apple commission')}</small>
        </div>
      </div>
    </section>
  );
}
