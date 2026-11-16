import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const base = process.env.TEST_URL || 'http://127.0.0.1:5193';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const state = await (await page.request.get(base + '/api/state')).json();
  const before = '# 产品介绍\n\n第一段原文。\n\n第二段原文。';
  const body = '# 产品介绍\n\n第一段新文。\n\n第二段更新。\n\n| 功能 | 状态 |\n| --- | --- |\n| 编辑 | 完成 |';
  const data = { products: [], docs: [{ id: 'rich-test', productId: '', title: '新版标题', body, source: 'Cursor · 产品需求', status: 'pending', updatedAt: '2026-11-05T04:00:00Z', history: [{ title: '旧版标题', body: before, at: '2026-11-04T04:00:00Z', source: '原始需求' }] }], docFolders: [], releases: [], contents: [], tasks: [] };
  await page.request.put(base + '/api/state', { data: { revision: state.revision, data } });
  await page.goto(base + '/#page=knowledge&doc=rich-test');
  const open = async () => { await page.getByRole('button', { name: '编辑资料', exact: true }).click(); await page.locator('.tiptap').waitFor(); };
  await open();
  assert.equal(await page.locator('textarea').count(), 0);
  await page.locator('.tiptap table').waitFor();
  const count = await page.locator('.doc-studio-revision').count();
  assert.ok(count >= 3);
  await page.locator('.tiptap .doc-inline-added').first().waitFor();
  await page.locator('.tiptap .doc-inline-deleted').first().waitFor();
  assert.equal(await page.locator('.tiptap .doc-inline-deleted').first().getAttribute('contenteditable'), 'false');
  await page.locator('.tiptap .doc-inline-added').first().click();
  await page.locator('.doc-studio-revision.active').waitFor();
  await page.screenshot({ path: "/tmp/growmory-rich-review.png", fullPage: true });
  await page.getByRole('button', { name: '接受修订 1', exact: true }).click();
  assert.equal(await page.locator('.doc-studio-revision').count(), count - 1);
  await page.getByRole('button', { name: '拒绝修订 1', exact: true }).click();
  assert.equal(await page.locator('.doc-studio-revision').count(), count - 2);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await page.locator('.library-reader').waitFor(); await page.reload(); await open();
  assert.equal(await page.locator('.doc-studio-revision').count(), count - 2);
  await page.getByRole('button', { name: '全部拒绝', exact: true }).click();
  assert.equal(await page.locator('.doc-studio-revision').count(), 0);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await page.locator('.library-reader').waitFor();
  const saved = await (await page.request.get(base + '/api/state')).json();
  assert.equal(saved.data.docs[0].status, 'confirmed');
  assert.equal(saved.data.docs[0].title, '新版标题');
  assert.equal(saved.data.docs[0].body, before);
  await open();
  const editable = page.getByRole('textbox', { name: '文档正文', exact: true });
  await editable.click(); await page.keyboard.press('ControlOrMeta+End'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: '加粗', exact: true }).click(); await page.keyboard.type('Rich text');
  await page.locator('.tiptap strong').filter({ hasText: 'Rich text' }).waitFor();
  assert.equal(await page.locator('.doc-studio-revision').count(), 0);
  assert.equal(await page.locator('.tiptap .doc-inline-added').count(), 0);
  await page.screenshot({ path: '/tmp/growmory-rich-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 800, height: 1000 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '/tmp/growmory-rich-narrow.png', fullPage: true });
  await page.getByRole('button', { name: '保存资料', exact: true }).click(); await page.locator('.library-reader').waitFor();
  const final = await (await page.request.get(base + '/api/state')).json();
  assert.match(final.data.docs[0].body, /\*\*Rich text\*\*/);
  assert.equal(final.data.docs[0].status, 'confirmed');
  final.data.docs[0] = { id: 'rich-test', productId: '', title: '合并修订验证', body: '现在支持安卓系统以及新版功能。', source: 'MCP · 同一需求', status: 'pending', updatedAt: '2026-11-05T04:00:00Z', history: [{ title: '合并修订验证', body: '原来支持苹果系统以及旧版功能。', at: '2026-11-04T04:00:00Z' }] };
  await page.request.put(base + '/api/state', { data: { revision: final.revision, data: final.data } });
  await page.reload(); await open();
  assert.equal(await page.locator('.doc-studio-revision').count(), 1);
  await page.locator('.tiptap .doc-inline-added').waitFor();
  await page.locator('.tiptap .doc-inline-deleted').waitFor();
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.screenshot({ path: '/tmp/growmory-inline-merged.png', fullPage: true });
  await page.getByRole('button', { name: '拒绝修订 1', exact: true }).click();
  assert.equal(await page.locator('.tiptap .doc-inline-deleted').count(), 0);
  assert.equal(await page.getByRole('textbox', { name: '文档正文' }).innerText(), '原来支持苹果系统以及旧版功能。');
  const snapshot = await (await page.request.get(base + '/api/state')).json();
  snapshot.data.docs[0] = { id: 'rich-test', productId: '', title: 'Markdown 阅读预览', body: '# 格式预览\n\n**核心功能**\n\n- 列表', status: 'pending', source: 'MCP · 格式调整', updatedAt: '2026-11-05T04:00:00Z', history: [{ body: '格式预览\n\n核心功能\n\n列表', at: '2026-11-04T04:00:00Z' }] };
  await page.request.put(base + '/api/state', { data: { revision: snapshot.revision, data: snapshot.data } });
  await page.reload();
  await page.getByLabel('资料预览').getByRole('heading', { name: '格式预览', exact: true }).waitFor();
  assert.equal(await page.getByLabel('资料预览').locator('strong').innerText(), '核心功能');
  assert.equal(await page.getByLabel('资料预览').locator('li').innerText(), '列表');
  assert.equal(await page.getByLabel('修订批注').count(), 0);
  await page.screenshot({ path: '/tmp/growmory-markdown-reader.png', fullPage: true });
  await open();
  assert.equal(await page.locator('.doc-studio-revision').count(), 0);
  await page.getByLabel('文档正文').fill('手动输入直接接受');
  assert.equal(await page.locator('.doc-studio-revision').count(), 0);
  assert.equal(await page.locator('.doc-inline-added, .doc-inline-deleted').count(), 0);
  await page.getByRole('button', { name: '保存资料', exact: true }).click();
  await page.locator('.library-reader').waitFor(); await page.reload(); await open();
  assert.equal(await page.locator('.doc-studio-revision').count(), 0);
  const batchState = await (await page.request.get(base + '/api/state')).json();
  for (const [id, title, status] of [
    ['batch-pending', '批量操作测试一', 'pending'],
    ['batch-confirmed', '批量操作测试二', 'confirmed'],
  ]) {
    batchState.data.docs.push({ ...batchState.data.docs[0], id, title, status, history: [] });
  }
  assert.ok((await page.request.put(base + '/api/state', { data: batchState })).ok());
  await page.goto(base + '/#page=knowledge');
  await page.reload();
  await page.getByRole('textbox', { name: '搜索资料' }).fill('批量操作测试');
  await page.getByRole('checkbox', { name: '选择 批量操作测试一' }).check();
  const selectionBar = page.locator('.asset-selection-bar');
  await expect(selectionBar).toContainText('1 / 2');
  await selectionBar.getByRole('button', { name: '全选当前所有' }).click();
  await expect(selectionBar).toContainText('2 / 2');

  await page.setViewportSize({ width: 390, height: 800 });
  await expect.poll(() => selectionBar.evaluate(bar => {
    const rect = bar.getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 1 &&
      Math.abs(innerHeight - rect.bottom - 24) < 1 && rect.left >= 0 && rect.right <= innerWidth;
  })).toBe(true);

  const batchDelete = selectionBar.getByRole('button', { name: '批量删除' });
  const dialog = page.getByRole('alertdialog', { name: '删除选中的 2 篇资料？' });
  await batchDelete.click();
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(selectionBar).toContainText('2 / 2');
  await batchDelete.click();
  await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await expect(selectionBar).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '没有匹配的资料' })).toBeVisible();
  const afterBatchDelete = await (await page.request.get(base + '/api/state')).json();
  assert.deepEqual(afterBatchDelete.data.docs.map(doc => doc.id), ['rich-test']);

  assert.deepEqual(errors, []);
  console.log('通过：所见即所得编辑、格式工具、表格、逐条接受拒绝、全部接受拒绝、刷新保留处理结果、Markdown 保存和窄窗口。');
} finally { await browser.close(); }
