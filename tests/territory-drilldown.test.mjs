import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('数据分析-产品详情-地区分布 支持点击查看详情下钻查看折线图及明细，并支持返回', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growmory-territory-drill-'));
  const reservation = http.createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = String(reservation.address().port); await new Promise(r => reservation.close(r));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'workspace.sqlite') },
    stdio: 'pipe',
  });

  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('测试服务启动超时')), 10000);
      child.stdout.on('data', b => { if (String(b).includes('Growmory')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); reject(Error('测试服务退出：' + code)); });
    });

    const base = `http://127.0.0.1:${port}`;
    const current = await fetch(base + '/api/state').then(r => r.json());

    // 准备数据：包含测试产品
    const data = {
      ...current.data,
      products: [
        {
          id: 'test-app',
          name: '测试应用',
          summary: '测试应用描述',
          appId: '123456',
          price: '',
          platform: 'IOS',
          website: '',
          color: 'blue',
          appStore: { appId: '123456', name: '测试应用', bundleId: 'com.test.app', syncedAt: '', versions: [] },
        },
      ],
    };
    const putRes = await fetch(base + '/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: current.revision, data }),
    });
    assert.equal(putRes.status, 200);

    // 模拟 insights 数据
    const dates = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (30 - i) * 86400000).toISOString().slice(0, 10));
    const mockInsights = {
      appId: '123456',
      checkedAt: new Date().toISOString(),
      trends: {
        status: 'ready',
        rows: dates.flatMap(date => [
          { date, kind: 'downloads', source: 'App Store search', territory: 'CHN', impressions: 0, pageViews: 0, firstDownloads: 20, redownloads: 5 },
          { date, kind: 'engagement', source: 'App Store search', territory: 'CHN', impressions: 300, pageViews: 60, firstDownloads: 0, redownloads: 0 },
          { date, kind: 'downloads', source: 'App Store browse', territory: 'USA', impressions: 0, pageViews: 0, firstDownloads: 10, redownloads: 2 },
          { date, kind: 'engagement', source: 'App Store browse', territory: 'USA', impressions: 150, pageViews: 30, firstDownloads: 0, redownloads: 0 },
        ]),
        coverage: { downloads: dates, engagement: dates },
        syncedAt: new Date().toISOString(),
      },
    };

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });

    // Mock insights API
    await page.route('**/api/app-store-connect/insights/**', route => route.fulfill({ json: mockInsights }));

    // 1. 进入测试产品的分析详情页
    await page.goto(`${base}/#page=analytics&scope=test-app`);
    await page.waitForLoadState('networkidle');

    // 2. 点击「地区分布」tab
    const territoryTabBtn = page.getByRole('tab', { name: /地区分布|国家.*地区/ });
    await territoryTabBtn.waitFor();
    await territoryTabBtn.click();
    await page.waitForTimeout(300);

    // 3. 验证列表中的按钮为「查看详情」，不再是「仅看此地区」
    assert.equal(await page.getByText('仅看此地区').count(), 0, '旧文案「仅看此地区」不应存在');
    const viewDetailBtns = page.getByRole('button', { name: '查看详情' });
    await viewDetailBtns.first().waitFor();
    const count = await viewDetailBtns.count();
    assert.ok(count >= 2, `应该至少有2个地区的「查看详情」按钮，实际为 ${count}`);

    // 4. 点击第一个地区的「查看详情」进入下钻页面（中国大陆 CHN）
    await viewDetailBtns.first().click();
    await page.waitForTimeout(300);

    // 5. 验证进入下钻详情页
    // - 应该出现「返回地区分布」按钮
    const backBtn = page.getByRole('button', { name: '返回地区分布' });
    await backBtn.waitFor();

    // - 应该显示当前下钻地区标题和代码 CHN
    await page.locator('.territory-drill-header h3', { hasText: '中国大陆' }).waitFor();
    assert.ok(await page.getByText('CHN').count() > 0);

    // - 应该显示折线图区域
    await page.getByText('数据指标走势折线图').waitFor();

    // - 应该包含各指标折线图卡片，且排序严格为：展示、查看、首次下载、重新下载
    assert.ok(await page.locator('.metric-chart-card').count() >= 4);
    const chartHeaders = await page.locator('.metric-chart-card h4').allInnerTexts();
    assert.deepEqual(chartHeaders.slice(0, 4), ['展示次数', '查看次数', '首次下载', '重新下载']);

    // - 应该包含每日明细表格
    await page.getByText('该地区每日数据明细').waitFor();
    // 应该包含来源渠道构成
    await page.getByText('该地区获客来源构成').waitFor();

    // 6. 测试在下钻页面直接切换地区至 USA
    const switchSelect = page.getByLabel('切换地区');
    await switchSelect.waitFor();
    await switchSelect.selectOption('USA');
    await page.waitForTimeout(300);

    // 验证切换到了美国 (USA)
    await page.locator('.territory-drill-header h3', { hasText: '美国' }).waitFor();
    assert.ok(await page.getByText('USA').count() > 0);

    // 7. 测试点击「返回地区分布」退回列表
    await backBtn.click();
    await page.waitForTimeout(300);

    // 验证返回成功，列表与「查看详情」按钮重新展现
    assert.ok(await page.getByRole('button', { name: '查看详情' }).count() >= 2);
    assert.equal(await page.getByRole('button', { name: '返回地区分布' }).count(), 0);
  } finally {
    await browser?.close();
    child.kill();
    await new Promise(resolve => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    rmSync(dir, { recursive: true, force: true });
  }
});
