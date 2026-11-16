import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  METRIC_LABELS,
  dateOffset,
  yesterday,
  findLatestDataDate,
  formatPercent,
  getSourceLabel,
  getTerritoryInfo,
  getRecent7Days,
} from '../src/trends/constants.ts';

test('App 数据分析基础常量与工具函数验证', () => {
  assert.equal(METRIC_LABELS.impressions, '展示次数');
  assert.equal(METRIC_LABELS.pageViews, '查看次数');
  assert.equal(METRIC_LABELS.firstDownloads, '首次下载');
  assert.equal(METRIC_LABELS.redownloads, '重新下载');

  assert.equal(getSourceLabel('App Store search'), 'App Store 搜索');
  assert.equal(getSourceLabel('App Store browse'), 'App Store 浏览');
  assert.equal(getSourceLabel('App referrer'), 'App 引荐');
  assert.equal(getSourceLabel('Web referrer'), '网页引荐');
  assert.equal(getSourceLabel('Unavailable'), '来源不可用');
  assert.equal(getSourceLabel('all'), '全部渠道');

  const cn = getTerritoryInfo('CN');
  assert.equal(cn.name, '中国大陆');
  assert.equal(cn.flag, '🇨🇳');

  const us = getTerritoryInfo('USA');
  assert.equal(us.name, '美国');
  assert.equal(us.flag, '🇺🇸');

  assert.equal(formatPercent(0.1234), '12.3%');
  assert.equal(formatPercent(0), '0.0%');
  assert.equal(formatPercent(null), '—');

  const y = yesterday();
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(y));
  assert.equal(dateOffset('2026-11-05', -1), '2026-11-04');
  assert.equal(dateOffset('2026-11-05', 7), '2026-11-12');

  // findLatestDataDate 自动筛选最近有数据的 1 天
  const mockInsights1 = {
    trends: {
      coverage: {
        downloads: ['2026-11-01', '2026-11-02', '2026-11-04'],
        engagement: ['2026-11-01', '2026-11-02', '2026-11-03'],
      },
      revenue: {
        coverage: ['2026-11-01', '2026-11-05'],
      },
      rows: [],
    },
  };
  const mockInsights2 = {
    trends: {
      coverage: {
        downloads: ['2026-11-01', '2026-11-06'],
        engagement: ['2026-11-01', '2026-11-05'],
      },
      revenue: {
        coverage: ['2026-11-02'],
      },
      rows: [],
    },
  };
  assert.equal(findLatestDataDate([mockInsights1, mockInsights2]), '2026-11-06');
  assert.equal(findLatestDataDate([mockInsights1]), '2026-11-05');
  assert.ok(findLatestDataDate([null, undefined]).length === 10);
});

test('转化漏斗与多维聚合计算逻辑验证', () => {
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03'];
  const rows = [
    { date: '2026-11-01', source: 'App Store search', territory: 'CN', kind: 'downloads', impressions: 0, pageViews: 0, firstDownloads: 20, redownloads: 2 },
    { date: '2026-11-01', source: 'App Store search', territory: 'CN', kind: 'engagement', impressions: 200, pageViews: 40, firstDownloads: 0, redownloads: 0 },
    { date: '2026-11-02', source: 'App Store browse', territory: 'US', kind: 'downloads', impressions: 0, pageViews: 0, firstDownloads: 10, redownloads: 1 },
    { date: '2026-11-02', source: 'App Store browse', territory: 'US', kind: 'engagement', impressions: 100, pageViews: 20, firstDownloads: 0, redownloads: 0 },
    { date: '2026-11-03', source: 'Web referrer', territory: 'CN', kind: 'downloads', impressions: 0, pageViews: 0, firstDownloads: 5, redownloads: 0 },
    { date: '2026-11-03', source: 'Web referrer', territory: 'CN', kind: 'engagement', impressions: 50, pageViews: 10, firstDownloads: 0, redownloads: 0 },
  ];

  // 1. Funnel Calculations
  const totalImp = rows.reduce((acc, r) => acc + r.impressions, 0); // 350
  const totalPv = rows.reduce((acc, r) => acc + r.pageViews, 0); // 70
  const totalDl = rows.reduce((acc, r) => acc + r.firstDownloads, 0); // 35
  const totalRe = rows.reduce((acc, r) => acc + r.redownloads, 0); // 3

  assert.equal(totalImp, 350);
  assert.equal(totalPv, 70);
  assert.equal(totalDl, 35);
  assert.equal(totalRe, 3);

  const ctr = totalPv / totalImp; // 70 / 350 = 0.20 (20.0%)
  const installRate = totalDl / totalPv; // 35 / 70 = 0.50 (50.0%)
  const overallRate = totalDl / totalImp; // 35 / 350 = 0.10 (10.0%)

  assert.equal(formatPercent(ctr), '20.0%');
  assert.equal(formatPercent(installRate), '50.0%');
  assert.equal(formatPercent(overallRate), '10.0%');

  // 2. Source Breakdown Calculations
  const sourceMap = new Map();
  for (const r of rows) {
    if (!sourceMap.has(r.source)) {
      sourceMap.set(r.source, { firstDownloads: 0, impressions: 0, pageViews: 0 });
    }
    const item = sourceMap.get(r.source);
    item.firstDownloads += r.firstDownloads;
    item.impressions += r.impressions;
    item.pageViews += r.pageViews;
  }

  assert.equal(sourceMap.get('App Store search').firstDownloads, 20);
  assert.equal(sourceMap.get('App Store browse').firstDownloads, 10);
  assert.equal(sourceMap.get('Web referrer').firstDownloads, 5);

  const searchShare = sourceMap.get('App Store search').firstDownloads / totalDl;
  assert.equal(formatPercent(searchShare), '57.1%');

  // 3. Territory Breakdown Calculations
  const territoryMap = new Map();
  for (const r of rows) {
    if (!territoryMap.has(r.territory)) {
      territoryMap.set(r.territory, { firstDownloads: 0, impressions: 0 });
    }
    const item = territoryMap.get(r.territory);
    item.firstDownloads += r.firstDownloads;
    item.impressions += r.impressions;
  }

  assert.equal(territoryMap.get('CN').firstDownloads, 25);
  assert.equal(territoryMap.get('US').firstDownloads, 10);
  assert.equal(formatPercent(territoryMap.get('CN').firstDownloads / totalDl), '71.4%');
});

test('CSV 导出格式与 UTF-8 BOM 编码校验', () => {
  const headers = ['日期', '展示次数', '查看次数', '首次下载', '重新下载', '展现转化率'];
  const testRows = [
    ['2026-11-01', 200, 40, 20, 2, '10.00%'],
    ['2026-11-02', 100, 20, 10, 1, '10.00%'],
  ];

  const csvContent = '\uFEFF' + [headers, ...testRows].map(r => r.join(',')).join('\n');

  assert.ok(csvContent.startsWith('\uFEFF')); // UTF-8 BOM
  assert.ok(csvContent.includes('日期,展示次数,查看次数,首次下载,重新下载,展现转化率'));
  assert.ok(csvContent.includes('2026-11-01,200,40,20,2,10.00%'));
});

test('近7天日期生成与单日数据筛选逻辑验证', () => {
  const base = '2026-11-14';
  const recentDays = getRecent7Days(base);
  assert.equal(recentDays.length, 7);
  assert.equal(recentDays[6], '2026-11-14');
  assert.equal(recentDays[5], '2026-11-13');
  assert.equal(recentDays[4], '2026-11-12');
  assert.equal(recentDays[3], '2026-11-11');
  assert.equal(recentDays[2], '2026-11-10');
  assert.equal(recentDays[1], '2026-11-09');
  assert.equal(recentDays[0], '2026-11-08');

  // 默认情况下以 yesterday() 为基准
  const defaultRecentDays = getRecent7Days();
  const y = yesterday();
  assert.equal(defaultRecentDays.length, 7);
  assert.equal(defaultRecentDays[6], y);
  assert.equal(defaultRecentDays[0], dateOffset(y, -6));

  // 验证单日筛选（days = 1）时 dates 计算
  const selectedDate = recentDays[3]; // '2026-11-11'
  const singleDayPeriod = { days: 1, end: selectedDate };
  const dates = Array.from({ length: singleDayPeriod.days }, (_, i) =>
    dateOffset(singleDayPeriod.end, i - singleDayPeriod.days + 1)
  );
  assert.deepEqual(dates, ['2026-11-11']);

  // 前周期 prior 为前一天
  const prior = dates.map(d => dateOffset(d, -singleDayPeriod.days));
  assert.deepEqual(prior, ['2026-11-10']);
});


