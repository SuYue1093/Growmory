import { useState, useRef, useId, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Metric, Milestone } from './types';
import { METRIC_LABELS, METRIC_COLORS, dateOffset } from './constants';
import { useI18n, t as globalT } from '../i18n.ts';

const getMarkerMeta = (m: Milestone | Milestone['type'], t = globalT) => {
  const type = typeof m === 'string' ? m : m?.type;
  const hasAsoCopy = typeof m === 'object' && m ? (m.hasAsoCopy || (/文案优化/i.test(m.label) && !/仅图片/i.test(m.label))) : false;
  const hasAsoMedia = typeof m === 'object' && m ? (m.hasAsoMedia || (/图片优化|视觉/i.test(m.label))) : false;

  if (type === 'release') {
    if (hasAsoCopy && hasAsoMedia) {
      return {
        color: '#d97706',
        icon: '🚀✨',
        text: t('版本发布+ASO文案优化+ASO图片优化', 'Release + ASO Copy & Visuals'),
      };
    }
    if (hasAsoCopy) {
      return {
        color: '#4f46e5',
        icon: '🚀📝',
        text: t('版本发布+ASO文案优化', 'Release + ASO Copy'),
      };
    }
    if (hasAsoMedia) {
      return {
        color: '#0284c7',
        icon: '🚀🖼️',
        text: t('版本发布+ASO图片优化', 'Release + ASO Visuals'),
      };
    }
    return {
      color: '#7c3aed',
      icon: '🚀',
      text: t('版本发布', 'Release'),
    };
  }

  switch (type) {
    case 'aso':
      if (hasAsoMedia) {
        return { color: '#0284c7', icon: '🖼️', text: t('ASO图片优化', 'ASO Visuals Update') };
      }
      return { color: '#4f46e5', icon: '📝', text: t('ASO文案优化', 'ASO Copy Update') };
    case 'content':
      return { color: '#059669', icon: '📢', text: t('营销内容', 'Marketing Content') };
    case 'manual':
      return { color: '#e11d48', icon: '📌', text: t('关键记事', 'Note') };
    default:
      return { color: '#2563eb', icon: '•', text: t('事件', 'Event') };
  }
};

type ChartProps = {
  dates: string[];
  priorDates: string[];
  series: (number | null)[];
  priorSeries: (number | null)[];
  metric?: Metric;
  label?: string;
  color?: { primary: string; light: string; border: string };
  valueFormatter?: (val: number | null) => string;
  maximum: number;
  milestones: Milestone[];
  showPrior: boolean;
  showMilestones: boolean;
  count?: (date: string, metric: Metric) => number | null;
  eventDate?: string;
};

export function TrendInteractiveChart({
  dates,
  priorDates,
  series,
  priorSeries,
  metric,
  label,
  color,
  valueFormatter,
  maximum,
  milestones,
  showPrior,
  showMilestones,
  count,
  eventDate,
}: ChartProps) {
  const { t } = useI18n();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const isHovering = hoverIdx !== null;
  useEffect(() => {
    if (!isHovering) return;
    const dismissTooltip = () => setHoverIdx(null);
    window.addEventListener('scroll', dismissTooltip, true);
    window.addEventListener('resize', dismissTooltip);
    return () => {
      window.removeEventListener('scroll', dismissTooltip, true);
      window.removeEventListener('resize', dismissTooltip);
    };
  }, [isHovering]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useId();

  const milestonesByDate = useMemo(() => {
    const map: Record<string, Milestone[]> = {};
    for (const m of milestones) {
      if (!map[m.date]) map[m.date] = [];
      map[m.date].push(m);
    }
    return map;
  }, [milestones]);

  const width = 800;
  const height = 230;
  const padLeft = 56;
  const padRight = 30;
  const padTop = 32;
  const padBottom = 44;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const validSeries = series.filter(n => n !== null);
  if (validSeries.length === 0) {
    return (
      <div className="trend-empty-chart">
        <div className="empty">
          <h3>{t('所选期间暂无可展示趋势', 'No trend data to display for the selected period')}</h3>
          <p>{t('报告未返回时不会生成示例曲线，也不会把缺失数据当成零。', 'Sample curves will not be generated when reports are unavailable, and missing data is not treated as zero.')}</p>
        </div>
      </div>
    );
  }

  const step = dates.length > 1 ? plotW / (dates.length - 1) : plotW;
  const getY = (val: number | null) => {
    if (val === null) return null;
    const ratio = Math.max(0, Math.min(1, val / Math.max(1, maximum)));
    return padTop + plotH - ratio * plotH;
  };

  // Build current path
  let currentPath = '';
  let areaPath = '';
  let lastX = 0;
  let currentConnected = false;

  series.forEach((n, i) => {
    if (n === null) {
      currentConnected = false;
      return;
    }
    const x = padLeft + i * step;
    const y = getY(n)!;
    if (!currentConnected) {
      currentPath += `M ${x} ${y} `;
      areaPath += `M ${x} ${padTop + plotH} L ${x} ${y} `;
      currentConnected = true;
    } else {
      currentPath += `L ${x} ${y} `;
      areaPath += `L ${x} ${y} `;
    }
    lastX = x;
  });

  if (areaPath && currentConnected) {
    areaPath += `L ${lastX} ${padTop + plotH} Z`;
  }

  // Build prior path
  let priorPath = '';
  let priorConnected = false;
  if (showPrior) {
    priorSeries.forEach((n, i) => {
      if (n === null) {
        priorConnected = false;
        return;
      }
      const x = padLeft + i * step;
      const y = getY(n)!;
      priorPath += `${priorConnected ? 'L' : 'M'} ${x} ${y} `;
      priorConnected = true;
    });
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || dates.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const scale = width / rect.width;
    const svgX = mouseX * scale;
    const relativeX = svgX - padLeft;
    const index = Math.round(relativeX / step);
    if (index >= 0 && index < dates.length) {
      setHoverIdx(index);
    } else {
      setHoverIdx(null);
    }
  };

  const activeDate = hoverIdx !== null ? dates[hoverIdx] : null;
  const activePriorDate = hoverIdx !== null ? priorDates[hoverIdx] : null;
  const activeValue = hoverIdx !== null ? series[hoverIdx] : null;
  const activePriorValue = hoverIdx !== null ? priorSeries[hoverIdx] : null;

  // 上一天（前一日）数据与日环比 (Day-over-Day, DoD)
  const prevValue = hoverIdx !== null
    ? (hoverIdx > 0
        ? series[hoverIdx - 1]
        : (count && metric ? count(dateOffset(dates[0], -1), metric) : null))
    : null;
  const hasPrev = prevValue !== null && activeValue !== null;
  const dodDiff = hasPrev ? (activeValue! - prevValue!) : null;
  let dodPercent: number | null = null;
  if (hasPrev) {
    if (prevValue! === 0) {
      if (activeValue! === 0) dodPercent = 0;
      else dodPercent = 100;
    } else {
      dodPercent = (dodDiff! / prevValue!) * 100;
    }
  }

  // 异常波动判定：大幅增加（>= +50% 且绝对增量 >= 5）或大幅减少（<= -40% 且绝对减量 <= -5）
  const isSpikeUp = dodPercent !== null && dodPercent >= 50 && (dodDiff !== null && dodDiff >= 5);
  const isSpikeDown = dodPercent !== null && dodPercent <= -40 && (dodDiff !== null && dodDiff <= -5);

  const activeMilestones = activeDate ? (milestonesByDate[activeDate] || []) : [];
  const chartColor = color || (metric ? METRIC_COLORS[metric] : { primary: '#2563eb', light: '#eff6ff', border: '#bfdbfe' });
  const chartLabel = label || (metric ? METRIC_LABELS[metric] : '');
  const formatVal = valueFormatter || ((v: number | null) => (v === null ? '—' : v.toLocaleString()));

  // Axis ticks
  const midVal = Math.round(maximum / 2);
  const midY = padTop + plotH / 2;

  // Selected x-axis date indices
  const xIndices = [0];
  if (dates.length >= 7) {
    xIndices.push(Math.floor(dates.length / 4));
    xIndices.push(Math.floor(dates.length / 2));
    xIndices.push(Math.floor((dates.length * 3) / 4));
  }
  if (!xIndices.includes(dates.length - 1)) {
    xIndices.push(dates.length - 1);
  }

  return (
    <div className={`trend-chart-card ${hoverIdx !== null ? 'is-hovering' : ''}`}>
      <div className="trend-chart-header">
        <div className="trend-chart-legend">
          <span className="legend-item current">
            <span className="legend-line" style={{ background: chartColor.primary }} />
            <span>{t('本期：', 'Current: ')}{chartLabel}</span>
          </span>
          {showPrior && (
            <span className="legend-item prior">
              <span className="legend-line dashed" />
              <span>{t(`前 ${dates.length} 天对应周期`, `Prior ${dates.length} days period`)}</span>
            </span>
          )}
          {showMilestones && milestones.length > 0 && (
            <span className="legend-item milestone">
              <span className="legend-dot" />
              <span>{t(`关键节点标记 (${milestones.length})`, `Milestones (${milestones.length})`)}</span>
            </span>
          )}
        </div>
      </div>

      <div className="trend-chart-container">
        <svg
          ref={svgRef}
          className="trend-chart-svg"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t(`${chartLabel}每日变化趋势图`, `${chartLabel} Daily Trend Chart`)}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor.primary} stopOpacity="0.22" />
              <stop offset="100%" stopColor={chartColor.primary} stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
          <text x={padLeft - 10} y={padTop + 4} textAnchor="end" className="chart-grid-label">
            {formatVal(maximum)}
          </text>

          <line x1={padLeft} y1={midY} x2={width - padRight} y2={midY} stroke="#e2e8f0" strokeDasharray="3 3" strokeWidth="1" />
          <text x={padLeft - 10} y={midY + 4} textAnchor="end" className="chart-grid-label">
            {formatVal(midVal)}
          </text>

          <line x1={padLeft} y1={padTop + plotH} x2={width - padRight} y2={padTop + plotH} stroke="#cbd5e1" strokeWidth="1" />
          <text x={padLeft - 10} y={padTop + plotH + 4} textAnchor="end" className="chart-grid-label">
            {formatVal(0)}
          </text>

          {/* Area under curve */}
          {areaPath && <path d={areaPath} fill={`url(#${gradientId})`} />}

          {/* Prior curve (dashed) */}
          {showPrior && priorPath && (
            <path
              d={priorPath}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="2"
              strokeDasharray="4 4"
              strokeOpacity="0.85"
            />
          )}

          {/* Current curve */}
          {currentPath && (
            <path
              d={currentPath}
              fill="none"
              stroke={chartColor.primary}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data points */}
          {series.map((val, i) => {
            if (val === null) return null;
            const x = padLeft + i * step;
            const y = getY(val)!;
            const isHovered = hoverIdx === i;
            const haloColor = isHovered
              ? (isSpikeUp ? '#16a34a' : isSpikeDown ? '#dc2626' : chartColor.primary)
              : chartColor.primary;
            const haloRadius = isHovered && (isSpikeUp || isSpikeDown) ? 12 : 9;
            const haloOpacity = isHovered && (isSpikeUp || isSpikeDown) ? 0.28 : 0.2;

            return (
              <g key={dates[i]}>
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r={haloRadius}
                    fill={haloColor}
                    fillOpacity={haloOpacity}
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 5 : 2.5}
                  fill={isHovered ? '#fff' : chartColor.primary}
                  stroke={isHovered ? haloColor : chartColor.primary}
                  strokeWidth={isHovered ? 2.5 : 1}
                >
                  <title>{`${dates[i]}：${formatVal(val)}`}</title>
                </circle>
              </g>
            );
          })}

          {/* ASO legacy eventDate */}
          {eventDate && dates.includes(eventDate.slice(0, 10)) && (
            <g className="chart-event-line">
              <line
                x1={padLeft + dates.indexOf(eventDate.slice(0, 10)) * step}
                x2={padLeft + dates.indexOf(eventDate.slice(0, 10)) * step}
                y1={padTop - 6}
                y2={padTop + plotH}
                stroke="#c77f36"
                strokeWidth="1.8"
                strokeDasharray="4 3"
              />
              <circle
                cx={padLeft + dates.indexOf(eventDate.slice(0, 10)) * step}
                cy={padTop - 6}
                r="4"
                fill="#c77f36"
              >
                <title>{t('ASO 修改生效', 'ASO changes applied')}</title>
              </circle>
            </g>
          )}

          {/* Milestones on chart */}
          {showMilestones &&
            Object.entries(milestonesByDate).map(([mDate, items]) => {
              const i = dates.indexOf(mDate);
              if (i === -1 || !items.length) return null;
              const x = padLeft + i * step;
              const primaryItem = items.find(m => m.type === 'release') ||
                items.find(m => m.type === 'aso') ||
                items.find(m => m.type === 'content') ||
                items[0];
              const meta = getMarkerMeta(primaryItem, t);
              const isMultiCharIcon = [...meta.icon].length > 1;
              const baseBadgeWidth = isMultiCharIcon ? 36 : 24;
              const badgeText = items.length > 1 ? `${meta.icon}·${items.length}` : meta.icon;
              const badgeWidth = items.length > 1 ? baseBadgeWidth + 12 : baseBadgeWidth;
              const titleText = `${mDate}（${items.length} ${t('个事件', 'events')}）：\n` + items.map(m => `• [${getMarkerMeta(m, t).text}] ${m.label}${m.detail ? ` (${m.detail})` : ''}`).join('\n');

              return (
                <g key={mDate} className="chart-milestone">
                  <line
                    x1={x}
                    x2={x}
                    y1={padTop}
                    y2={padTop + plotH}
                    stroke={meta.color}
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <rect
                    x={x - badgeWidth / 2}
                    y={padTop - 22}
                    width={badgeWidth}
                    height="18"
                    rx="4"
                    fill={meta.color}
                  />
                  <text
                    x={x}
                    y={padTop - 9}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={badgeText.length > 2 ? '9' : '10'}
                    fontWeight="600"
                  >
                    {badgeText}
                  </text>
                  <title>{titleText}</title>
                </g>
              );
            })}

          {/* X-axis labels */}
          {xIndices.map(i => {
            const x = padLeft + i * step;
            return (
              <text
                key={dates[i]}
                x={x}
                y={padTop + plotH + 20}
                textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
                className="chart-axis-label"
              >
                {dates[i]}
              </text>
            );
          })}

          {/* Hover cursor line */}
          {hoverIdx !== null && activeValue !== null && (
            <g className="chart-cursor-group">
              <line
                x1={padLeft + hoverIdx * step}
                x2={padLeft + hoverIdx * step}
                y1={padTop}
                y2={padTop + plotH}
                stroke="#64748b"
                strokeWidth="1.2"
                strokeDasharray="2 2"
              />
            </g>
          )}
        </svg>

        {/* Floating tooltip popover */}
        {hoverIdx !== null && activeDate && (() => {
          const hoverX = padLeft + hoverIdx * step;
          const targetY = getY(activeValue) ?? padTop + plotH / 2;
          const yRatio = (targetY - padTop) / plotH;

          return createPortal(
            <div
              className="trend-tooltip-card"
              ref={tooltip => {
                const svg = svgRef.current;
                if (!tooltip || !svg) return;

                const chart = svg.getBoundingClientRect();
                const x = chart.left + (hoverX / width) * chart.width;
                const y = chart.top + (targetY / height) * chart.height;
                const { offsetWidth, offsetHeight } = tooltip;
                const viewport = document.documentElement;
                const edge = 16;
                const gap = 14;
                const left = x + gap + offsetWidth <= viewport.clientWidth - edge
                  ? x + gap
                  : x - gap - offsetWidth;

                tooltip.style.left = `${Math.max(edge, Math.min(left, viewport.clientWidth - offsetWidth - edge))}px`;
                tooltip.style.top = `${Math.max(edge, Math.min(y - yRatio * offsetHeight, viewport.clientHeight - offsetHeight - edge))}px`;
              }}
            >
              {/* 1. Header: Date + Prior Date + Anomaly Badge */}
              <div className="tooltip-header">
                <div className="tooltip-header-date-col">
                  <span className="tooltip-date">{activeDate}</span>
                  {activePriorDate && showPrior && (
                    <span className="tooltip-prior-date">{t('对比前期: ', 'Prior period: ')}{activePriorDate}</span>
                  )}
                </div>
                {(isSpikeUp || isSpikeDown) && (
                  <div className="tooltip-header-badge-col">
                    {isSpikeUp && (
                      <span className="tooltip-anomaly-badge surge">
                        ⚡ {t('大幅增加', 'Surge')} {dodPercent! > 0 ? `+${dodPercent!.toFixed(0)}%` : ''}
                      </span>
                    )}
                    {isSpikeDown && (
                      <span className="tooltip-anomaly-badge plunge">
                        ⚠️ {t('大幅减少', 'Plunge')} {dodPercent!.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Hero Metric Block: Current metric, big value, and clean inline DoD/PoP tags */}
              <div className="tooltip-hero-metric">
                <div className="tooltip-hero-top">
                  <span className="tooltip-hero-label">
                    <span className="tooltip-metric-dot" style={{ background: chartColor.primary }} />
                    {chartLabel}
                  </span>
                </div>
                <div className="tooltip-hero-body">
                  <strong className="tooltip-hero-val">{formatVal(activeValue)}</strong>
                  <div className="tooltip-hero-comparisons">
                    {hasPrev ? (
                      <span className={`tooltip-compare-pill ${dodDiff! > 0 ? 'up' : dodDiff! < 0 ? 'down' : 'flat'}`}>
                        <span className="pill-prefix">{t('较前日', 'vs Prev')}:</span>
                        <span className="pill-diff">
                          {dodDiff! > 0 ? `↑ +${formatVal(dodDiff)}` : dodDiff! < 0 ? `↓ -${formatVal(Math.abs(dodDiff!))}` : '0'}
                        </span>
                        <span className="pill-percent">
                          ({dodPercent! > 0 ? `+${dodPercent!.toFixed(1)}%` : `${dodPercent!.toFixed(1)}%`})
                        </span>
                      </span>
                    ) : (
                      <span className="tooltip-compare-pill flat">
                        <span className="pill-prefix">{t('区间首日', 'First day')}</span>
                      </span>
                    )}

                    {showPrior && activePriorValue !== null && activeValue !== null && (
                      <span className={`tooltip-compare-pill ${activeValue >= activePriorValue ? 'up' : 'down'}`}>
                        <span className="pill-prefix">{t('上周期', 'Cycle')}:</span>
                        <span className="pill-diff">
                          {activeValue >= activePriorValue ? '↑' : '↓'}
                          {activePriorValue === 0
                            ? ` ${t('前期为0', 'Prior was 0')}`
                            : ` ${Math.abs(((activeValue - activePriorValue) / activePriorValue) * 100).toFixed(1)}%`}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. 4-Metrics Snapshot Grid */}
              {activeDate && count && (
                <div className="tooltip-metrics-grid">
                  <div className={`metric-cell ${metric === 'impressions' ? 'is-active' : ''}`}>
                    <span>{t('展示', 'Imp.')}</span>
                    <b>{count(activeDate, 'impressions')?.toLocaleString() ?? '—'}</b>
                  </div>
                  <div className={`metric-cell ${metric === 'pageViews' ? 'is-active' : ''}`}>
                    <span>{t('查看', 'Views')}</span>
                    <b>{count(activeDate, 'pageViews')?.toLocaleString() ?? '—'}</b>
                  </div>
                  <div className={`metric-cell ${metric === 'firstDownloads' ? 'is-active' : ''}`}>
                    <span>{t('首下', '1st DL')}</span>
                    <b>{count(activeDate, 'firstDownloads')?.toLocaleString() ?? '—'}</b>
                  </div>
                  <div className={`metric-cell ${metric === 'redownloads' ? 'is-active' : ''}`}>
                    <span>{t('重下', 'Re-DL')}</span>
                    <b>{count(activeDate, 'redownloads')?.toLocaleString() ?? '—'}</b>
                  </div>
                </div>
              )}

              {/* 4. Milestones / Activities */}
              {activeMilestones.length > 0 && (
                <div className="tooltip-milestones-section">
                  <div className="milestones-divider">
                    <span>{t('关联事件与动态', 'Events & Notes')}</span>
                  </div>
                  <div className="tooltip-milestones-list">
                    {activeMilestones.map((m, mIdx) => {
                      const mMeta = getMarkerMeta(m, t);
                      const isContent = m.type === 'content';
                      const isRelease = m.type === 'release';
                      const contentTags = new Set(m.tags || []);
                      if (isContent) {
                        if (/限免|限时免费/i.test(m.label)) contentTags.add('free');
                        if (/优惠|特惠|折扣|打折/i.test(m.label)) contentTags.add('discount');
                      }
                      const cleanLabel = isContent
                        ? m.label.replace(/\s*[·•]\s*(限免|优惠|特惠|限免\/优惠|限免、优惠)/g, '').trim()
                        : isRelease
                          ? m.label.replace(/\s*\[含ASO.*?\]|\s*[·•]\s*含?ASO.*?优化/g, '').trim()
                          : m.label;

                      return (
                        <div key={mIdx} className="tooltip-milestone-item">
                          <span
                            className="milestone-badge"
                            style={{
                              background: mMeta.color + '18',
                              color: mMeta.color,
                              border: `1px solid ${mMeta.color}35`,
                            }}
                          >
                            {mMeta.icon} {mMeta.text}
                          </span>

                          {/* 营销内容后展示专属标签：限免 / 优惠 */}
                          {isContent && contentTags.has('free') && (
                            <span
                              className="milestone-activity-badge"
                              style={{
                                background: '#e11d4818',
                                color: '#e11d48',
                                border: '1px solid #e11d4838',
                              }}
                            >
                              {t('限免', 'Free')}
                            </span>
                          )}

                          {isContent && contentTags.has('discount') && (
                            <span
                              className="milestone-activity-badge"
                              style={{
                                background: '#ea580c18',
                                color: '#ea580c',
                                border: '1px solid #ea580c38',
                              }}
                            >
                              {t('优惠', 'Discount')}
                            </span>
                          )}

                          <span
                            className="milestone-label"
                            title={m.detail ? `${cleanLabel} (${m.detail})` : cleanLabel}
                          >
                            {cleanLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>,
            document.body,
          );
        })()}
      </div>
    </div>
  );
}
