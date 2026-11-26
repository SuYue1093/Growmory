import { chromium } from '@playwright/test';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:5198';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  const state = await page.request.get(base + '/api/state').then(r => r.json());
  assert.ok((await page.request.put(base + '/api/state', { data: { revision: state.revision, data: { products: [], docs: [], contents: [], releases: [], tasks: [] } } })).ok());
  const context = await page.request.get(base + '/api/social-analytics').then(r => r.json());
  assert.ok((await page.request.post(base + '/api/social-analytics', { data: { expectedRevision: context.revision, accounts: [{ platform: 'xiaohongshu', name: '小红书测试账号', url: 'https://www.xiaohongshu.com/user/profile/test' }] } })).ok());
  let buffer, count;
  if (process.env.XHS_TEST_FILE) { buffer = readFileSync(process.env.XHS_TEST_FILE); count = 52; }
  else {
    const workbook = new ExcelJS.Workbook(); workbook.created = new Date('2026-11-06T07:49:20Z');
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(['最多导出排序后前1000条笔记']);
    sheet.addRow(['笔记标题', '首次发布时间', '体裁', '曝光', '观看量', '封面点击率', '点赞', '评论', '收藏', '涨粉', '分享', '人均观看时长', '弹幕']);
    sheet.addRow(['导入测试笔记', '2026年11月06日13时50分23秒', '图文', 1989, 388, 0.208, 12, 3, 4, 5, 3, 27, 0]);
    sheet.addRow(['', '2026年11月05日13时50分23秒', '视频', 0, 70, 0, 1, 0, 0, 0, 1, 0, 0]);
    buffer = Buffer.from(await workbook.xlsx.writeBuffer()); count = 2;
  }
  const upload = { name: '笔记列表明细表.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer };
  await page.goto(base + '/#page=operations&scope=all');
  async function previewFile() {
    await page.getByRole('button', { name: '采集数据', exact: true }).click();
    await page.getByRole('button', { name: '导入数据', exact: true }).click();
    await page.getByLabel('小红书 Excel 文件').setInputFiles(upload);
    await page.getByText(`已识别 ${count} 条笔记`, { exact: true }).waitFor();
    assert.equal(await page.getByLabel('数据截止时间', { exact: true }).inputValue(), '2026-11-06T15:49:20');
  }
  await previewFile();
  assert.equal((await page.request.get(base + '/api/social-analytics').then(r => r.json())).snapshots.length, 0);
  mkdirSync('.screenshots', { recursive: true });
  await page.screenshot({ path: '.screenshots/xiaohongshu-import-preview.png', animations: 'disabled' });
  await page.getByRole('button', { name: `确认导入 ${count} 条笔记`, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: `新增 ${count} 条` }).waitFor();
  assert.equal(await page.locator('.social-content-title').count(), count);
  const saved = await page.request.get(base + '/api/social-analytics').then(r => r.json());
  assert.equal(saved.snapshots.length, count);
  assert.ok(saved.snapshots.every(s => !s.url && s.source === 'report'));
  assert.ok(saved.snapshots.some(s => s.title === '无标题笔记'));
  assert.equal(saved.snapshots[0].metrics.coverClickRate, process.env.XHS_TEST_FILE ? 0 : 0.208);
  await previewFile();
  await page.getByRole('button', { name: `确认导入 ${count} 条笔记`, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('status').filter({ hasText: `新增 0 条，更新 ${count} 条` }).waitFor();
  assert.equal((await page.request.get(base + '/api/social-analytics').then(r => r.json())).snapshots.length, count);
  await page.getByRole('button', { name: '采集数据', exact: true }).click();
  await page.getByRole('button', { name: '导入数据', exact: true }).click();
  await page.getByLabel('小红书 Excel 文件').setInputFiles({ ...upload, buffer: Buffer.from('invalid') });
  await page.getByRole('alert').filter({ hasText: '无法读取 Excel' }).waitFor();
  assert.equal((await page.request.get(base + '/api/social-analytics').then(r => r.json())).snapshots.length, count);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('小红书 Excel 文件').setInputFiles(upload);
  await page.getByText(`已识别 ${count} 条笔记`, { exact: true }).waitFor();
  assert.equal(await page.locator('.social-dialog').evaluate(el => el.scrollWidth > el.clientWidth), false);
  assert.deepEqual(errors, []);
  console.log(`PASS: Excel upload, ${count} rows, preview without writes, timestamps, metrics, untitled note, duplicate import, corrupt file, mobile dialog`);
} finally { await browser.close(); }
