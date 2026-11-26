import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto('http://127.0.0.1:5195');
  await page.locator('nav').getByRole('button', { name: '产品', exact: true }).click();
  await page.getByRole('button', { name: /拾页.*篇文档/ }).click();
  assert.equal(await page.getByRole('button', { name: '功能清单', exact: true }).count(), 0);
  await page.getByRole('button', { name: '产品知识库', exact: true }).click();
  for (const name of ['资料', 'FAQ', '详细说明']) {
    await page.getByRole('button', { name: '新建文件夹', exact: true }).click();
    await page.getByLabel('文件夹名称').fill(name);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.locator('.folder-row').getByRole('button', { name, exact: true }).click();
  }
  await page.getByRole('button', { name: '新建文档', exact: true }).first().click();
  await page.getByLabel(/^标题/).fill('嵌套文档');
  await page.getByLabel('文档正文').fill('文件夹中的产品知识');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('heading', { name: '嵌套文档', exact: true }).waitFor();
  await page.reload();
  const state = await page.request.get('http://127.0.0.1:5195/api/state').then(r => r.json());
  const leaf = state.data.docFolders.find(f => f.name === '详细说明');
  assert.equal(state.data.docs.find(d => d.title === '嵌套文档').folderId, leaf.id);
  assert.equal(state.data.docFolders.length, 3);
  assert.equal('features' in state.data, false);
  assert.deepEqual(errors, []);
  console.log('浏览器验证通过：三级文件夹、新建文档归类、刷新持久化、功能入口移除，无页面异常');
} finally { await browser.close(); }
