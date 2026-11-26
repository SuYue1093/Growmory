import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'growmory-trends-ui-'));
const server = spawn(process.execPath, ['server/index.mjs'], { env: { ...process.env, NODE_ENV: 'production', PORT: '5197', DB_PATH: join(dir, 'db.sqlite') }, stdio: 'pipe' });
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('启动超时')), 10000); server.stdout.on('data', s => { if (String(s).includes('Growmory')) { clearTimeout(timer); resolve(); } }); server.once('error', reject); });
  const base = 'http://127.0.0.1:5197';
  const state = await fetch(base + '/api/state').then(r => r.json());
  state.data.products.push({ id: 'p', name: '趋势测试产品', summary: '', appId: '123', price: '', platform: 'IOS', website: '', color: 'blue', appStore: { appId: '123', name: '趋势测试产品', bundleId: 'com.test', syncedAt: '', versions: [] } });
  assert.equal((await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })).status, 200);
  assert.equal((await fetch(base + '/api/app-store-connect/sales/p/read', { method: 'POST', body: '{}' })).status, 405);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  const dates = Array.from({ length: 180 }, (_, i) => new Date(Date.now() - (180 - i) * 86400000).toISOString().slice(0, 10));
  let mode = 'ready';
  const value = { appId: '123', checkedAt: new Date().toISOString(), aso: { status: 'ready', syncedAt: new Date().toISOString(), localizations: [{ locale: 'zh-Hans', versionId: 'v', infoId: 'i', platform: 'IOS', version: '1.0', fields: { name: '名称', subtitle: '副标题', keywords: '笔记,灵感', description: '真实功能介绍', promotionalText: '推广文本' } }] }, trends: { status: 'ready', rows: dates.flatMap(date => [{ date, kind: 'downloads', source: 'App Store search', territory: 'CHN', impressions: 0, pageViews: 0, firstDownloads: 10, redownloads: 2 }, { date, kind: 'engagement', source: 'App Store search', territory: 'CHN', impressions: 100, pageViews: 20, firstDownloads: 0, redownloads: 0 }]), coverage: { downloads: dates, engagement: dates }, syncedAt: new Date().toISOString() } };
  const calls = [];
  page.on('request', r => { if (r.url().includes('/api/')) calls.push(r.url()); });
  await page.route('**/api/app-store-connect/insights/**', route => route.fulfill({ json: { ...value, trends: { ...value.trends, status: mode, message: mode === 'forbidden' ? '此 API Key 没有操作权限' : '' } } }));
  await page.goto(base + '/#page=analytics&scope=p');
  await page.locator('.sidebar').getByRole('button', { name: /App 数据分析|数据分析/ }).click();
  await page.getByRole('heading', { name: '产品趋势', exact: true }).waitFor();
  await page.getByRole('button', { name: /首次下载.*300/ }).waitFor();
  await page.getByLabel('时间范围', { exact: true }).selectOption('7');
  await page.getByRole('button', { name: /首次下载.*70/ }).waitFor();
  await page.getByLabel('来源', { exact: true }).selectOption('App Store search');
  await page.getByLabel('国家 / 地区', { exact: true }).selectOption('CHN');
  await page.getByRole('button', { name: /图标曝光事件.*700/ }).click();
  const dailyBtn = (await page.getByRole('tab', { name: '每日明细' }).count()) > 0
    ? page.getByRole('tab', { name: '每日明细' })
    : page.getByText('每日数据明细', { exact: true });
  await dailyBtn.click();
  assert.ok(await page.getByRole('cell', { name: '100', exact: true }).count());
  mode = 'forbidden';
  await page.getByRole('button', { name: '同步 ASO 与趋势', exact: true }).click();
  await page.getByText('趋势报告权限不足', { exact: true }).waitFor();
  await page.getByRole('button', { name: /首次下载.*70/ }).waitFor();
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: /App 数据分析|数据分析/ }).click();
  await page.getByText('趋势报告权限不足', { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + '/#page=products&product=p&tab=aso');
  await page.getByRole('heading', { name: 'ASO优化', level: 1 }).waitFor();
  assert.ok(calls.every(url => !url.includes('/sales/')));
  console.log('通过：趋势筛选、期间对比、每日明细、权限提示与旧数据保留、刷新、已同步 ASO 展示、1440/390/320px，无销售请求。');
} finally { await browser?.close(); server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)); rmSync(dir, { recursive: true, force: true }); }
