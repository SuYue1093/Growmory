import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173';
  await page.goto(base);
  await page.getByRole('button', { name: '复制连接提示词', exact: true }).click();
  const instructions = await page.request.get(base + '/api/mcp/setup').then(r => r.json());
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), instructions.prompt);
  await page.getByRole('button', { name: '复制测试提示词', exact: true }).click();
  assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes('list_records'));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px 布局溢出`);
  }
  await page.getByLabel('使用模式').selectOption('chat');
  assert.equal(await page.getByRole('button', { name: '复制连接提示词', exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: '2. App Store Connect 连接', exact: true }).count(), 1);
  assert.deepEqual(errors, []);
  console.log('通过：Agent 提示词复制、测试提示词、Chat 隐藏 MCP 和窄屏布局');
} finally { await browser.close(); }
