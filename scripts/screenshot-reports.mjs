import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('.screenshots/reports', { recursive: true });

async function run() {
  const browser = await chromium.launch({ channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to reports tab...');
  await page.goto('http://localhost:5173/#page=analytics&scope=all&tab=reports');
  await page.waitForTimeout(1500);

  await page.screenshot({ path: '.screenshots/reports/01-reports-list.png', fullPage: true });
  console.log('Saved 01-reports-list.png');

  // Click on the report row to view report reader view
  const reportRow = page.locator('.report-item-row').first();
  if (await reportRow.count() > 0) {
    await reportRow.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '.screenshots/reports/02-report-reader.png', fullPage: true });
    console.log('Saved 02-report-reader.png');
  }

  // Go back and click "生成报告" button to verify modal
  const backBtn = page.locator('.reader-back-btn');
  if (await backBtn.count() > 0) {
    await backBtn.click();
    await page.waitForTimeout(500);
  }

  const genBtn = page.locator('.generate-report-btn');
  if (await genBtn.count() > 0) {
    await genBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '.screenshots/reports/03-generate-modal.png' });
    console.log('Saved 03-generate-modal.png');
  }

  await browser.close();
}

run().catch(console.error);
