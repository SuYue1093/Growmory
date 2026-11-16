import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const port = '5192';
const outDir = process.env.SCREENSHOT_OUT_DIR || join(process.cwd(), '.screenshots');
mkdirSync(outDir, { recursive: true });

const server = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: 'data/growmory.sqlite' },
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
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 1000 });

  // 1. Overview Page
  await page.goto(`${base}/#page=analytics`);
  await page.getByRole('heading', { name: '产品数据总览', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, 'real-db-overview.png'), fullPage: true });

  // 2. Detail Page - Click Firefly
  await page.locator('tr.clickable-product-row').first().click();
  await page.getByRole('heading', { name: '产品趋势', exact: true }).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(outDir, 'real-db-detail.png'), fullPage: true });

  // 3. Daily Tab with Revenue
  await page.getByRole('tab', { name: '每日明细' }).click();
  await page.getByRole('heading', { name: '每日数据明细', exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, 'real-db-daily.png'), fullPage: true });

  // 4. Sources Tab with Revenue
  await page.getByRole('tab', { name: '渠道来源' }).click();
  await page.getByRole('heading', { name: '获客渠道与来源构成', exact: true }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, 'real-db-sources.png'), fullPage: true });

  console.log('✅ Real DB screenshots captured successfully!');
} finally {
  await browser?.close();
  server.kill();
}
