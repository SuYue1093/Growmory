import { useMemo } from 'react';
import { Calendar, RotateCcw } from 'lucide-react';
import type { Period } from './types';
import { yesterday, getRecent7Days } from './constants';
import { useI18n } from '../i18n.ts';

interface RecentDaysBarProps {
  period: Period;
  onPeriodChange: (period: Period) => void;
  baseDate?: string;
  defaultRestoreDays?: number;
}

export function RecentDaysBar({
  period,
  onPeriodChange,
  baseDate,
  defaultRestoreDays = 30,
}: RecentDaysBarProps) {
  const { t } = useI18n();
  const yDate = yesterday();
  const effectiveBase = (baseDate && baseDate > yDate) ? baseDate : yDate;

  // 近 7 天日期数组（按时间由远到近排序，左旧右新）
  const recent7Days = useMemo(() => {
    return getRecent7Days(effectiveBase);
  }, [effectiveBase]);

  const { days, end } = period;

  return (
    <div className="trends-recent-days-bar" role="toolbar" aria-label={t("近7天单日快捷筛选", "Past 7 days single day quick filter")}>
      <div className="recent-days-pills-wrap">
        <div className="recent-days-label-group">
          <Calendar size={13} className="recent-days-icon" />
          <span className="recent-days-label">{t("近7天单日：", "Past 7 Days:")}</span>
        </div>
        <div className="recent-days-pills" role="radiogroup" aria-label={t("近7天单日选项", "Past 7 days single day options")}>
          {recent7Days.map(d => {
            const isSelected = days === 1 && end === d;
            const isYesterday = d === yDate;

            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`recent-day-pill-btn ${isSelected ? 'active' : ''}`}
                onClick={() => onPeriodChange({ days: 1, end: d })}
                title={t(`点击筛选 ${d} 当天数据`, `Click to filter data for ${d}`)}
              >
                <span className="recent-day-pill-date">{d}</span>
                {isYesterday && (
                  <span className="recent-day-pill-tag">{t("昨", "Yest")}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {days === 1 && (
        <button
          type="button"
          className="recent-day-pill-reset"
          onClick={() => onPeriodChange({ days: defaultRestoreDays, end: effectiveBase })}
          title={t(`恢复近 ${defaultRestoreDays} 天走势查看`, `Restore past ${defaultRestoreDays} days trend view`)}
        >
          <RotateCcw size={11} />
          <span>{t(`恢复近 ${defaultRestoreDays} 天`, `Restore ${defaultRestoreDays} Days`)}</span>
        </button>
      )}
    </div>
  );
}
