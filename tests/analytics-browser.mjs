import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(tmpdir(), 'growmory-analytics-qa-'));
const port = '5199';
const server = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'db.sqlite') },
  stdio: 'pipe',
});

let browser;

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('服务启动超时')), 10000);
    server.stdout.on('data', s => {
      if (String(s).includes('Growmory')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.once('error', reject);
  });

  const base = `http://127.0.0.1:${port}`;
  const state = await fetch(base + '/api/state').then(r => r.json());

  // Add test product with store connection
  const testProduct = {
    id: 'test-app',
    name: '重构测试应用 - 极简待办',
    summary: '测试数据分析模块重构效果',
    appId: '888888',
    price: '0',
    platform: 'IOS',
    website: 'https://example.com',
    color: 'blue',
    appStore: {
      appId: '888888',
      name: '重构测试应用',
      bundleId: 'com.test.analytics',
      syncedAt: new Date().toISOString(),
      versions: [],
    },
  };
  state.data.products.push(testProduct);
  await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.clock.install();

  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10)
  );

  const mockTrends = {
    appId: '888888',
    checkedAt: new Date().toISOString(),
    aso: { status: 'ready', syncedAt: new Date().toISOString(), localizations: [] },
    trends: {
      status: 'ready',
      checkedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      coverage: { downloads: dates.slice(1), engagement: dates },
      revenue: {
        status: 'ready',
        coverage: [dates.at(-4), dates.at(-2), dates.at(-1)],
        rows: [
          { date: dates.at(-4), source: 'App Store search', territory: 'CN', salesUsd: 0, proceedsUsd: 0 },
          { date: dates.at(-2), source: 'App Store search', territory: 'CN', salesUsd: 0, proceedsUsd: 0 },
          { date: dates.at(-1), source: 'App Store search', territory: 'CN', salesUsd: 10, proceedsUsd: 7 },
          { date: dates.at(-1), source: 'App Store search', territory: 'CN', salesUsd: -2, proceedsUsd: -1 },
          { date: dates.at(-1), source: 'App Store browse', territory: 'US', salesUsd: 5, proceedsUsd: 3 },
        ],
      },
      rows: dates.flatMap(date => [
        {
          date,
          kind: 'engagement',
          source: 'App Store search',
          territory: 'CN',
          impressions: 120,
          pageViews: 24,
          firstDownloads: 0,
          redownloads: 0,
        },
        {
          date,
          kind: 'engagement',
          source: 'App Store browse',
          territory: 'US',
          impressions: 60,
          pageViews: 12,
          firstDownloads: 0,
          redownloads: 0,
        },
        {
          date,
          kind: 'downloads',
          source: 'App Store search',
          territory: 'CN',
          impressions: 0,
          pageViews: 0,
          firstDownloads: 12,
          redownloads: 2,
        },
        {
          date,
          kind: 'downloads',
          source: 'App Store browse',
          territory: 'US',
          impressions: 0,
          pageViews: 0,
          firstDownloads: 6,
          redownloads: 1,
        },
      ]).filter(row => row.kind !== 'downloads' || row.date !== dates[0]),
    },
  };

  const exchangeRate = { date: dates.at(-1), cnyPerUsd: 7, stale: false };
  await page.route('**/api/exchange-rate/usd-cny', route => route.fulfill({ json: exchangeRate }));

  let syncRevenueAt;
  await page.route('**/api/app-store-connect/insights/**', route => {
    if (route.request().url().endsWith('/sync')) {
      mockTrends.checkedAt = new Date(Date.parse(mockTrends.checkedAt) + 60_000).toISOString();
      mockTrends.trends.checkedAt = mockTrends.checkedAt;
      if (syncRevenueAt) mockTrends.trends.revenue.syncedAt = syncRevenueAt;
    }
    return route.fulfill({ json: mockTrends });
  });

  // 1. Visit Single Product Trends Page
  await page.goto(`${base}/#page=analytics&scope=test-app`);
  await page.getByRole('heading', { name: '产品趋势', exact: true }).waitFor();

  // 2. Check 6 Core Metric Cards in detail page (aligned with overview dimensions)
  await page.locator('.trend-metric .kpi-label').filter({ hasText: '首次下载' }).first().waitFor();
  await page.locator('.trend-metric .kpi-label').filter({ hasText: /^展示次数$/ }).waitFor();
  await page.locator('.trend-metric .kpi-label').filter({ hasText: '查看次数' }).waitFor();
  await page.locator('.trend-metric .kpi-label').filter({ hasText: '首次下载 / 展示次数' }).waitFor();
  await page.locator('.trend-metric .kpi-label').filter({ hasText: '销售额' }).waitFor();
  await page.locator('.trend-metric .kpi-label').filter({ hasText: '预计收入' }).waitFor();

  assert.match(await page.locator('.trend-metric').filter({ has: page.locator('.kpi-label', { hasText: /^首次下载$/ }) }).innerText(), /已覆盖 29\/30 天，暂不比较/);

  const endDate = page.getByLabel('截止日期', { exact: true });
  const originalEnd = await endDate.inputValue();
  const downloadsChart = page.locator('.metric-chart-card').filter({
    has: page.getByRole('heading', { name: '首次下载', exact: true }),
  });
  const chart = downloadsChart.locator('.trend-chart-svg');
  await expect(chart).toBeVisible();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await endDate.fill(new Date(Date.parse(dates[0]) - 86400000).toISOString().slice(0, 10));
  assert.deepEqual(pageErrors, []);
  await expect(downloadsChart.getByRole('heading', { name: '所选期间暂无可展示趋势' })).toBeVisible();
  await endDate.fill(originalEnd);
  await expect(chart).toBeVisible();
  assert.deepEqual(pageErrors, []);

  // 2.1 Verify sync button is NOT present in detail page topbar
  assert.equal(
    await page.locator('.trends-unified-topbar .sync-trends-btn').count(),
    0,
    'Sync button should not exist on detail page'
  );

  // 2.2 Verify chart cards (4 conversion + 2 revenue = 6 charts in 综合趋势) have expand fullwidth buttons
  assert.equal(
    await page.locator('.metric-chart-card').count(),
    6,
    'Overview should display 6 charts: 4 core metrics + 销售额 + 预计收入'
  );
  assert.ok(
    await page.locator('.metric-chart-card').filter({ hasText: '销售额' }).isVisible(),
    '综合趋势 should include 销售额 chart'
  );
  assert.ok(
    await page.locator('.metric-chart-card').filter({ hasText: '预计收入' }).isVisible(),
    '综合趋势 should include 预计收入 chart'
  );
  assert.equal(
    await page.locator('.chart-expand-btn').count(),
    6,
    'All 6 charts should have full-width expand button'
  );

  const salesChart = page.getByRole('img', { name: '销售额每日变化趋势图' });
  await salesChart.scrollIntoViewIfNeeded();
  const salesBounds = await salesChart.boundingBox();
  assert.ok(salesBounds);
  await salesChart.hover({
    position: { x: salesBounds.width * 770 / 800, y: salesBounds.height * 32 / 230 },
  });
  const salesTooltip = page.locator('.trend-tooltip-card');
  await expect(salesTooltip.locator('.tooltip-hero-label')).toHaveText('销售额');
  assert.equal(await salesTooltip.evaluate(element => {
    const rect = element.getBoundingClientRect();
    element.style.pointerEvents = 'auto';
    try {
      return element.contains(document.elementFromPoint(rect.left + 12, rect.bottom - 12));
    } finally {
      element.style.removeProperty('pointer-events');
    }
  }), true, 'The bottom of the sales tooltip should be visible and free of ancestor clipping');
  await page.mouse.move(0, 0);
  await expect(salesTooltip).toHaveCount(0);

  // 3. Check Sub-view Navigation Tabs
  await page.getByRole('tab', { name: '综合趋势' }).waitFor();
  await page.getByRole('tab', { name: '渠道来源' }).waitFor();
  await page.getByRole('tab', { name: '地区分布' }).waitFor();
  await page.getByRole('tab', { name: '获客指标' }).waitFor();
  await page.getByRole('tab', { name: '每日明细' }).waitFor();

  // 4. Test Tab: 渠道来源 (Traffic Sources)
  await page.getByRole('tab', { name: '渠道来源' }).click();
  await page.getByRole('heading', { name: '获客渠道与来源构成', exact: true }).waitFor();
  assert.ok(await page.getByText('App Store 搜索').count() > 0);
  assert.ok(await page.getByText('App Store 浏览').count() > 0);

  const salesKpi = page.locator('.trend-metric').filter({ has: page.locator('.kpi-label', { hasText: /^销售额$/ }) });
  const proceedsKpi = page.locator('.trend-metric').filter({ has: page.locator('.kpi-label', { hasText: /^预计收入$/ }) });
  await salesKpi.getByText('¥91.00', { exact: true }).waitFor();
  assert.match(await proceedsKpi.innerText(), /¥\s*63\.00/);
  await page.getByLabel('国家 / 地区').selectOption('CN');
  assert.match(await salesKpi.innerText(), /¥\s*56\.00/);
  assert.match(await proceedsKpi.innerText(), /¥\s*42\.00/);
  assert.equal(await page.locator('.trend-tab-content tbody tr').count(), 1);
  assert.match(await page.locator('.trend-tab-content tbody tr').innerText(), /App Store 搜索/);
  await page.getByLabel('国家 / 地区').selectOption('all');

  // 5. Test Tab: 地区分布 (Territories)
  await page.getByRole('tab', { name: '地区分布' }).click();
  await page.getByRole('heading', { name: '国家与地区分布', exact: true }).waitFor();
  assert.ok(await page.getByText('中国大陆').count() > 0);
  assert.ok(await page.getByText('美国').count() > 0);

  // 6. Test Tab: 转化漏斗 (Funnel)
  await page.getByRole('tab', { name: '获客指标' }).click();
  await page.getByRole('heading', { name: '获客指标对照', exact: true }).waitFor();
  assert.ok(await page.getByText('全链路转化率（展示 → 下载）').count() > 0);
  assert.ok(await page.getByText('查看 / 展示次数', { exact: true }).count() > 0);
  assert.ok(await page.getByText('比值基于标准日报', { exact: false }).count() > 0);

  // Check calculated percentages in connectors and KPI cards
  const connectorCtr = page.locator('.connector-pill').first().locator('.rate-val');
  assert.equal(await connectorCtr.innerText(), '20.0%');
  assert.equal(await page.locator('.funnel-kpi-card').first().locator('.kpi-num').innerText(), '9.7%');

  // 7. Test Tab: 每日明细 (Daily View)
  await page.getByRole('tab', { name: '每日明细' }).click();
  await page.getByRole('heading', { name: '每日数据明细', exact: true }).waitFor();
  assert.ok(await page.getByText('导出 CSV').count() > 0);
  assert.ok(await page.getByText('复制表格').count() > 0);

  // 8. Test Scope Switch to All Products (Overview)
  await page.getByRole('button', { name: '返回全部产品总览' }).click();
  await page.getByRole('heading', { name: '产品数据总览', exact: true }).waitFor();
  assert.ok(await page.getByText('组合总首次下载').count() > 0);
  assert.ok(await page.getByText('组合总展示次数').count() > 0);
  const overviewSales = page.locator('.portfolio-kpi-card').filter({ hasText: '销售额' });
  assert.match(await overviewSales.innerText(), /¥\s*91\.00/);
  const portfolioRatio = page.locator('.portfolio-kpi-card').filter({ hasText: '首次下载 / 展示次数' });
  assert.equal(await portfolioRatio.locator('.kpi-value').innerText(), '10.0%');
  assert.match(await portfolioRatio.innerText(), /共同覆盖 · 1 款 App.*29 天/);

  const overviewRow = page.locator('tr.clickable-product-row').filter({ hasText: '重构测试应用' });
  await expect(overviewRow.locator('.revenue-sparkline path')).toHaveCount(1);
  await expect(overviewRow.locator('.revenue-sparkline path[stroke-dasharray]')).toHaveCount(0);
  const overviewRange = page.getByLabel('总览时间范围');
  const overviewEnd = page.getByLabel('总览截止日期');
  await overviewRange.selectOption('1');
  await overviewEnd.fill(dates.at(-3));
  await expect(overviewRow.locator('.cell-money')).toHaveText('—');
  await expect(overviewRow.locator('.revenue-sparkline')).toBeVisible();
  await expect(overviewRow.locator('td:has(.cell-money)'))
    .toHaveAttribute('title', /所选日期暂无购买报表数据/);
  await overviewEnd.fill(dates.at(-2));
  await expect(overviewRow.locator('.cell-money')).toHaveText(/¥\s*0\.00/);
  await expect(overviewRow.locator('.revenue-sparkline')).toBeVisible();
  await overviewEnd.fill(dates.at(-1));
  await overviewRange.selectOption('30');

  // 8.1 Verify top-right scope select is removed on Analytics page
  assert.equal(
    await page.locator('.heading-actions .scope-select').count(),
    0,
    'Top right scope-select should not exist on Analytics page'
  );

  // 8.2 Verify "同步数据" button is in overview controls bar
  assert.ok(
    await page.locator('.overview-controls-bar .sync-overview-btn').isVisible(),
    'Sync button should be in overview controls bar'
  );
  const checkedTime = page.locator('.overview-sync-time').filter({ hasText: '最近检查' }).locator('time');
  const updatedTime = page.locator('.overview-sync-time').filter({ hasText: '数据更新' }).locator('time');
  await expect(checkedTime).toHaveAttribute('datetime', mockTrends.trends.checkedAt);
  const checkedBeforeSync = await checkedTime.innerText();
  const previousDataTime = mockTrends.trends.syncedAt;
  const syncButton = page.getByRole('button', { name: '同步数据', exact: true });
  await syncButton.click();
  await expect(syncButton).toBeEnabled();
  await expect(checkedTime).not.toHaveText(checkedBeforeSync);
  await expect(checkedTime).toHaveText(/\s\d{2}:\d{2}$/);
  await expect(checkedTime).toHaveAttribute('datetime', mockTrends.trends.checkedAt);
  await expect(updatedTime).toHaveAttribute('datetime', previousDataTime);

  syncRevenueAt = mockTrends.trends.checkedAt;
  await syncButton.click();
  await expect(syncButton).toBeEnabled();
  await expect(updatedTime).toHaveAttribute('datetime', syncRevenueAt);

  // 8.3 Verify row is fully clickable and navigates to detail
  await page.locator('tr.clickable-product-row').first().click();
  await page.getByRole('heading', { name: '产品趋势', exact: true }).waitFor();
  const dlMetric = await page.locator('.trend-metric .metric-count').first().textContent();
  assert.notEqual(dlMetric?.trim(), '—', 'Detail metric should show real number, not dash');

  // Return to overview for responsive checks
  await page.getByRole('button', { name: '返回全部产品总览' }).click();
  await page.getByRole('heading', { name: '产品数据总览', exact: true }).waitFor();

  // 8.4 Verify table header has 下载趋势 and 销售额趋势 instead of 重新下载
  assert.ok(
    await page.getByRole('columnheader', { name: '下载趋势' }).isVisible(),
    'Table header should include 下载趋势'
  );
  assert.ok(
    await page.getByRole('columnheader', { name: '销售额趋势' }).isVisible(),
    'Table header should include 销售额趋势'
  );
  assert.equal(
    await page.locator('th').filter({ hasText: '重新下载' }).count(),
    0,
    'Table header should not include 重新下载'
  );

  // 9. Responsive Layout Checks
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    assert.equal(hasOverflow, false, `Viewport ${width}px has horizontal overflow`);
  }

  // Simulate the server publishing a newer cache while the detail stays open.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('tr.clickable-product-row').first().click();
  const cutoff = page.getByLabel('截止日期');
  await cutoff.fill(dates.at(-2));
  const dlCard = page.locator('.trend-metric').filter({ has: page.locator('.kpi-label', { hasText: /^首次下载$/ }) });
  const oldCount = await dlCard.locator('.metric-count').innerText();
  mockTrends.checkedAt = new Date(Date.parse(mockTrends.checkedAt) + 60_000).toISOString();
  const changedRow = mockTrends.trends.rows.find(row => row.date === dates.at(-2) && row.kind === 'downloads');
  changedRow.firstDownloads += 100;
  exchangeRate.cnyPerUsd = 6.8;
  await page.clock.fastForward(60_000);
  await page.waitForFunction(
    previous => {
      const cards = Array.from(document.querySelectorAll('.trend-metric'));
      const card = cards.find(c => c.querySelector('.kpi-label')?.textContent === '首次下载');
      return card?.querySelector('.metric-count')?.textContent !== previous;
    },
    oldCount
  );
  assert.equal(await cutoff.inputValue(), dates.at(-2));

  console.log('✅ App 数据分析全量浏览器端到端验收通过（五大Tab、多产品总览、响应式 1440/768/390px 无溢出）');
} finally {
  await browser?.close();
  server.kill();
  await new Promise(resolve => (server.exitCode !== null ? resolve() : server.once('exit', resolve)));
  rmSync(dir, { recursive: true, force: true });
}

