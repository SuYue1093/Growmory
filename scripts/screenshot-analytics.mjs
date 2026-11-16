import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = mkdtempSync(join(tmpdir(), 'growmory-analytics-shots-'));
const port = '5196';
const server = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'db.sqlite') },
  stdio: 'pipe',
});

let browser;

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('启动超时')), 10000);
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

  // Add 2 products for nice comparison
  state.data.products.push(
    {
      id: 'app-firefly',
      name: '萤火待办 - 极简清单与日历',
      summary: '拖拽式日历与待办任务管理',
      appId: '6790251925',
      price: '0',
      platform: 'MAC_OS、IOS',
      website: 'https://example.com',
      color: 'blue',
      appStore: {
        appId: '6790251925',
        name: '萤火待办',
        bundleId: 'com.suyue.firefly',
        syncedAt: new Date().toISOString(),
        versions: [],
      },
    },
    {
      id: 'app-stepby',
      name: '一步步 - 个人SOP流程管理',
      summary: '专注个人SOP与习惯养成',
      appId: '6779620781',
      price: '18',
      platform: 'IOS',
      website: 'https://example.com',
      color: 'green',
      appStore: {
        appId: '6779620781',
        name: '一步步',
        bundleId: 'com.suyue.stepby',
        syncedAt: new Date().toISOString(),
        versions: [],
      },
    }
  );

  // Add releases for milestone demo
  state.data.releases.push(
    {
      id: 'rel-1',
      productId: 'app-firefly',
      version: 'v2.1.0',
      status: 'published',
      changes: '新增月视图与多端同步',
      languages: ['zh-Hans'],
      channels: ['AppStore'],
      createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
      notes: [],
      proposals: [],
    },
    {
      id: 'rel-2',
      productId: 'app-firefly',
      version: 'v2.2.0',
      status: 'published',
      changes: '优化小组件与专注番茄钟',
      languages: ['zh-Hans'],
      channels: ['AppStore'],
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      notes: [],
      proposals: [],
    }
  );

  await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });

  const dates = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10)
  );

  const mockTrendsFirefly = {
    appId: '6790251925',
    checkedAt: new Date().toISOString(),
    aso: { status: 'ready', syncedAt: new Date().toISOString(), localizations: [{ locale: 'zh-Hans', versionId: 'v1', infoId: 'i1', platform: 'IOS', version: '2.1', fields: { name: '萤火待办', subtitle: '极简清单与日历', keywords: '待办,日历,清单', description: '', promotionalText: '' } }] },
    trends: {
      status: 'ready',
      syncedAt: new Date().toISOString(),
      coverage: { downloads: dates, engagement: dates },
      rows: dates.flatMap((date, idx) => {
        const factor = Math.sin(idx / 4) * 0.4 + 1.2;
        const spike = idx === 18 ? 2.5 : idx === 27 ? 2.1 : 1.0;
        return [
          {
            date,
            kind: 'engagement',
            source: 'App Store search',
            territory: 'CN',
            impressions: Math.round(240 * factor * spike),
            pageViews: Math.round(48 * factor * spike),
            firstDownloads: 0,
            redownloads: 0,
          },
          {
            date,
            kind: 'engagement',
            source: 'App Store browse',
            territory: 'US',
            impressions: Math.round(80 * factor),
            pageViews: Math.round(16 * factor),
            firstDownloads: 0,
            redownloads: 0,
          },
          {
            date,
            kind: 'engagement',
            source: 'Web referrer',
            territory: 'JP',
            impressions: Math.round(35 * factor),
            pageViews: Math.round(8 * factor),
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
            firstDownloads: Math.round(22 * factor * spike),
            redownloads: Math.round(4 * factor),
          },
          {
            date,
            kind: 'downloads',
            source: 'App Store browse',
            territory: 'US',
            impressions: 0,
            pageViews: 0,
            firstDownloads: Math.round(8 * factor),
            redownloads: Math.round(2 * factor),
          },
          {
            date,
            kind: 'downloads',
            source: 'Web referrer',
            territory: 'JP',
            impressions: 0,
            pageViews: 0,
            firstDownloads: Math.round(4 * factor),
            redownloads: Math.round(1 * factor),
          },
        ];
      }),
    },
  };

  const mockTrendsStepby = {
    appId: '6779620781',
    checkedAt: new Date().toISOString(),
    aso: { status: 'ready', syncedAt: new Date().toISOString(), localizations: [] },
    trends: {
      status: 'ready',
      syncedAt: new Date().toISOString(),
      coverage: { downloads: dates, engagement: dates },
      rows: dates.flatMap(date => [
        {
          date,
          kind: 'engagement',
          source: 'App Store search',
          territory: 'CN',
          impressions: 110,
          pageViews: 20,
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
          firstDownloads: 9,
          redownloads: 1,
        },
      ]),
    },
  };

  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

  await page.route('**/api/app-store-connect/insights/**', route => {
    const url = route.request().url();
    if (url.includes('app-firefly')) {
      route.fulfill({ json: mockTrendsFirefly });
    } else {
      route.fulfill({ json: mockTrendsStepby });
    }
  });

  mkdirSync('.screenshots/analytics', { recursive: true });

  // 1. Screenshot: Overview
  await page.goto(`${base}/#page=analytics`);
  await page.getByRole('heading', { name: '产品数据总览', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.screenshots/analytics/01-portfolio-overview.png', fullPage: true });

  // 2. Screenshot: Single Product - Overview & Chart
  await page.goto(`${base}/#page=analytics&scope=app-firefly`);
  await page.getByRole('heading', { name: '产品趋势', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: '.screenshots/analytics/02-trends-overview-chart.png', fullPage: true });

  // 3. Screenshot: Sources Tab
  await page.getByRole('tab', { name: '渠道来源' }).click();
  await page.getByRole('heading', { name: '获客渠道与来源构成', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.screenshots/analytics/03-sources-breakdown.png', fullPage: true });

  // 4. Screenshot: Territories Tab
  await page.getByRole('tab', { name: '地区分布' }).click();
  await page.getByRole('heading', { name: '国家与地区分布', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.screenshots/analytics/04-territories-ranking.png', fullPage: true });

  // 5. Screenshot: Funnel Tab
  await page.getByRole('tab', { name: '获客指标' }).click();
  await page.getByRole('heading', { name: '获客指标对照', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.screenshots/analytics/05-conversion-funnel.png', fullPage: true });

  // 6. Screenshot: Daily Tab
  await page.getByRole('tab', { name: '每日明细' }).click();
  await page.getByRole('heading', { name: '每日数据明细', exact: true }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.screenshots/analytics/06-daily-records.png', fullPage: true });

  // 7. Screenshot: Mobile View
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('tab', { name: '综合趋势' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: '.screenshots/analytics/07-mobile-trends.png', fullPage: true });

  console.log('✅ 7 张高清界面截图已保存至 .screenshots/analytics/');
} finally {
  await browser?.close();
  server.kill();
  await new Promise(resolve => (server.exitCode !== null ? resolve() : server.once('exit', resolve)));
  rmSync(dir, { recursive: true, force: true });
}

