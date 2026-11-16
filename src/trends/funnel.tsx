import { formatPercent } from './constants';
import type { RevenueReport } from './types';
import { formatMoney, getRevenueSales, getRevenueProceeds, type RevenueRate } from './revenue';
import { useI18n } from '../i18n.ts';

type FunnelProps = {
  impressions: number | null;
  pageViews: number | null;
  firstDownloads: number | null;
  redownloads: number | null;
  priorImpressions: number | null;
  priorPageViews: number | null;
  priorFirstDownloads: number | null;
  days: number;
  completeEngagement?: boolean;
  completeDownloads?: boolean;
  revenue?: RevenueReport;
  revenueRate?: RevenueRate | null;
  dates?: string[];
  source?: string;
  territory?: string;
};

export function TrendConversionFunnel({
  impressions,
  pageViews,
  firstDownloads,
  redownloads,
  priorImpressions,
  priorPageViews,
  priorFirstDownloads,
  days,
  revenue,
  revenueRate = null,
  dates = [],
  source = 'all',
  territory = 'all',
}: FunnelProps) {
  const { lang, t } = useI18n();
  const hasData = impressions !== null || pageViews !== null || firstDownloads !== null;
  const ratio = (numerator: number | null | undefined, denominator: number | null | undefined) =>
    numerator !== null && numerator !== undefined && denominator !== null && denominator !== undefined && denominator > 0
      ? numerator / denominator
      : null;

  const ctr = ratio(pageViews, impressions);
  const installRate = ratio(firstDownloads, pageViews);
  const overallRate = ratio(firstDownloads, impressions);
  const priorCtr = ratio(priorPageViews, priorImpressions);
  const priorInstallRate = ratio(priorFirstDownloads, priorPageViews);
  const priorOverallRate = ratio(priorFirstDownloads, priorImpressions);

  const getDiff = (curr: number | null, prev: number | null) => {
    if (curr === null || prev === null) return null;
    const diff = curr - prev;
    return {
      text: `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(1)}%`,
      isUp: diff >= 0,
    };
  };

  const ctrDiff = getDiff(ctr, priorCtr);
  const installDiff = getDiff(installRate, priorInstallRate);
  const overallDiff = getDiff(overallRate, priorOverallRate);

  const sales = getRevenueSales(revenue, dates, source, territory);
  const proceeds = getRevenueProceeds(revenue, dates, source, territory);
  const arpd = sales !== null && firstDownloads && firstDownloads > 0 ? sales / firstDownloads : null;
  const netPerDownload = proceeds !== null && firstDownloads && firstDownloads > 0 ? proceeds / firstDownloads : null;

  const totalDownloads = (firstDownloads ?? 0) + (redownloads ?? 0);
  const redownloadRate = totalDownloads > 0 && redownloads !== null ? redownloads / totalDownloads : null;
  const rpm = sales !== null && impressions && impressions > 0 ? sales / (impressions / 1000) : null;

  return (
    <div className="funnel-container">
      <div className="funnel-header">
        <div>
          <h3>{t("获客指标对照", "Acquisition Funnel Comparison")}</h3>
          <p className="body-copy">
            {t("按同一范围展示各阶段独立的事件计数、比值与变现表现。", "Shows independent event counts, ratios, and monetization metrics in one unified scope.")}
          </p>
        </div>
      </div>

      {!hasData ? (
        <div className="empty">
          <h3>{t("所选期间数据不完整或暂无转化数据", "Incomplete or no conversion data for selected period")}</h3>
          <p>{t("请调整时间范围或等待 Apple 报告完成覆盖。", "Please adjust time range or wait for Apple reports coverage.")}</p>
        </div>
      ) : (
        <>
          <div className="funnel-visual">
            {/* Stage 1: Impressions */}
            <div className="funnel-stage stage-impressions">
              <div className="stage-card">
                <div className="stage-badge">{t("阶段 1 · 发现与展示", "Stage 1 · Discovery & Impressions")}</div>
                <div className="stage-title">{t("展示次数", "Impressions")}</div>
                <div className="stage-value">{impressions?.toLocaleString() ?? '—'}</div>
                <div className="stage-note">{t("用户在搜索结果、榜单或 Today 中看到图标", "Users saw app icon in search, charts, or Today tab")}</div>
              </div>
            </div>

            {/* Conversion 1 -> 2 */}
            <div className="funnel-connector">
              <div className="connector-pill">
                <span className="rate-name">{t("查看 / 展示次数", "Page Views / Impressions")}</span>
                <strong className="rate-val">{formatPercent(ctr)}</strong>
                {ctrDiff && (
                  <span className={`rate-diff ${ctrDiff.isUp ? 'up' : 'down'}`}>
                    {t("较前期", "vs prior")} {ctrDiff.text}
                  </span>
                )}
              </div>
              <div className="connector-arrow">→</div>
            </div>

            {/* Stage 2: Page Views */}
            <div className="funnel-stage stage-pageviews">
              <div className="stage-card">
                <div className="stage-badge">{t("阶段 2 · 意向与查看", "Stage 2 · Product Page Views")}</div>
                <div className="stage-title">{t("查看次数", "Page Views")}</div>
                <div className="stage-value">{pageViews?.toLocaleString() ?? '—'}</div>
                <div className="stage-note">{t("用户点击进入 App Store 详情页查看介绍与截图", "Users clicked into product page to view description & screenshots")}</div>
              </div>
            </div>

            {/* Conversion 2 -> 3 */}
            <div className="funnel-connector">
              <div className="connector-pill">
                <span className="rate-name">{t("首次下载 / 查看", "First Downloads / Page Views")}</span>
                <strong className="rate-val">{formatPercent(installRate)}</strong>
                {installDiff && (
                  <span className={`rate-diff ${installDiff.isUp ? 'up' : 'down'}`}>
                    {t("较前期", "vs prior")} {installDiff.text}
                  </span>
                )}
              </div>
              <div className="connector-arrow">→</div>
            </div>

            {/* Stage 3: First Downloads */}
            <div className="funnel-stage stage-downloads">
              <div className="stage-card">
                <div className="stage-badge">{t("阶段 3 · 首次获取", "Stage 3 · First Downloads")}</div>
                <div className="stage-title">{t("首次下载", "First-time Downloads")}</div>
                <div className="stage-value">{firstDownloads?.toLocaleString() ?? '—'}</div>
                <div className="stage-note">
                  {lang === 'en' ? `Redownloads: ${redownloads?.toLocaleString() ?? '—'}` : `重新下载 ${redownloads?.toLocaleString() ?? '—'} 次`}
                </div>
              </div>
            </div>

            {sales !== null && (
              <>
                {/* Conversion 3 -> 4 */}
                <div className="funnel-connector">
                  <div className="connector-pill">
                    <span className="rate-name">{t("每下载收入", "Revenue per Download")}</span>
                    <strong className="rate-val">{arpd !== null ? formatMoney(arpd, revenueRate) : '—'}</strong>
                  </div>
                  <div className="connector-arrow">→</div>
                </div>

                {/* Stage 4: Monetization */}
                <div className="funnel-stage stage-monetization">
                  <div className="stage-card">
                    <div className="stage-badge">{t("阶段 4 · 商业变现", "Stage 4 · Monetization")}</div>
                    <div className="stage-title">{t("销售额", "Sales")}</div>
                    <div className="stage-value">{formatMoney(sales, revenueRate)}</div>
                    <div className="stage-note">{t("Apple 估算，含退款调整", "Apple estimate, includes refunds")}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Distinct Funnel & Monetization KPIs (Non-redundant with step-by-step pipeline) */}
          <div className="funnel-kpis">
            <div className="funnel-kpi-card">
              <span className="kpi-label">{t("全链路转化率（展示 → 下载）", "End-to-End Conversion (Impressions → Downloads)")}</span>
              <strong className="kpi-num">{formatPercent(overallRate)}</strong>
              <small className="kpi-desc">
                {overallDiff ? (
                  <span className={overallDiff.isUp ? 'text-up' : 'text-down'}>
                    {t("较前 {days} 天", "vs prior {days}d", { days })} {overallDiff.text}
                  </span>
                ) : overallRate !== null ? (
                  lang === 'en' ? `~${(overallRate * 1000).toFixed(1)} downloads per 1,000 impressions` : `每 1,000 次展示带来约 ${(overallRate * 1000).toFixed(1)} 次下载`
                ) : (
                  t("展示至最终下载的端到端转化率", "End-to-end conversion from impression to download")
                )}
              </small>
            </div>

            <div className="funnel-kpi-card">
              <span className="kpi-label">{t("重新下载占比（老用户回流）", "Redownload Share (User Retention)")}</span>
              <strong className="kpi-num">{formatPercent(redownloadRate)}</strong>
              <small className="kpi-desc">
                {redownloads !== null && totalDownloads > 0
                  ? (lang === 'en' ? `${redownloads.toLocaleString()} redownloads · ${formatPercent(redownloadRate)} of total` : `重新下载 ${redownloads.toLocaleString()} 次 · 占总获取 ${formatPercent(redownloadRate)}`)
                  : t("老用户重新下载占总获取量比例", "Share of redownloads out of total downloads")}
              </small>
            </div>

            <div className="funnel-kpi-card">
              <span className="kpi-label">{sales !== null ? t("千次展示收益 (RPM)", "Revenue per Mille (RPM)") : t("产品页访问深度", "CTR (Views / Impressions)")}</span>
              <strong className="kpi-num">
                {sales !== null ? (rpm !== null ? formatMoney(rpm, revenueRate) : '—') : formatPercent(ctr)}
              </strong>
              <small className="kpi-desc">
                {sales !== null ? t("每 1,000 次展示带来的销售额", "Sales per 1,000 impressions") : t("查看次数 / 展示次数", "Page Views / Impressions")}
              </small>
            </div>

            <div className="funnel-kpi-card">
              <span className="kpi-label">{sales !== null ? t("预计每下载净收益", "Estimated Net Proceeds per Download") : t("日均首次下载", "Daily Avg Downloads")}</span>
              <strong className="kpi-num">
                {sales !== null
                  ? (netPerDownload !== null ? formatMoney(netPerDownload, revenueRate) : '—')
                  : (firstDownloads !== null ? (firstDownloads / Math.max(1, days)).toFixed(1) : '—')}
              </strong>
              <small className="kpi-desc">
                {sales !== null ? t("扣除适用税费及 Apple 佣金后所得（预计收入）", "After applicable taxes and Apple commission (Proceeds)") : (lang === 'en' ? `Daily average over ${days} days` : `所选 ${days} 天期间日均下载`)}
              </small>
            </div>
          </div>
        </>
      )}

      <div className="funnel-compliance-note">
        <strong>{t("数据口径说明：", "Methodology Note: ")}</strong>
        <p>
          {t("比值基于标准日报的事件计数。分母为零或任一报告未覆盖整个期间时显示破折号。不同入口可以直接进入产品页或下载，Apple 后台转化率使用独立设备展示等不同口径。", "Ratios are based on daily event counts. Apple Analytics may use unique devices for official App Store dashboard figures.")}
        </p>
      </div>
    </div>
  );
}
