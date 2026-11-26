import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('从数据分析进入某个产品详情后，点击营销内容tab，不应携带产品参数，且可正常展示所有内容并支持筛选与取消', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growmory-nav-test-'));
  const reservation = http.createServer(); await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = String(reservation.address().port); await new Promise(r => reservation.close(r));
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'workspace.sqlite') },
    stdio: 'pipe',
  });
  child.stderr.on('data', b => console.error(String(b)));

  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('测试服务启动超时')), 10000);
      child.stdout.on('data', b => { if (String(b).includes('Growmory')) { clearTimeout(timer); resolve(); } });
      child.on('exit', code => { clearTimeout(timer); reject(Error('测试服务退出：' + code)); });
    });

    const base = `http://127.0.0.1:${port}`;
    const current = await fetch(base + '/api/state').then(r => r.json());

    // 准备数据：包含两个产品，以及分别属于这两个产品的营销内容
    const data = {
      ...current.data,
      products: [
        { id: 'prod-a', name: '产品A', summary: '产品A描述', appId: '', price: '', platform: 'iOS', website: '', color: 'blue' },
        { id: 'prod-b', name: '产品B', summary: '产品B描述', appId: '', price: '', platform: 'iOS', website: '', color: 'purple' },
      ],
      contents: [
        { id: 'content-a', productId: 'prod-a', title: '产品A营销文案', body: '产品A正文', channel: 'X', status: 'ready', date: '', url: '' },
        { id: 'content-b', productId: 'prod-b', title: '产品B营销文案', body: '产品B正文', channel: '微信公众号', status: 'ready', date: '', url: '' },
      ],
    };
    const putRes = await fetch(base + '/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: current.revision, data }),
    });
    assert.equal(putRes.status, 200);

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // 1. 模拟用户进入数据分析页面中某个产品的详情数据（#page=analytics&scope=prod-a）
    await page.goto(`${base}/#page=analytics&scope=prod-a`);
    await page.waitForLoadState('networkidle');

    // 确认当前在 analytics 且 scope 带有 prod-a
    assert.ok(page.url().includes('page=analytics'));
    assert.ok(page.url().includes('scope=prod-a'));

    // 2. 点击左侧导航栏的「营销内容」tab
    const marketingNavBtn = page.locator('.sidebar nav').getByRole('button', { name: /营销内容/ });
    await marketingNavBtn.waitFor();
    await marketingNavBtn.click();
    await page.waitForTimeout(300);

    // 3. 验证 URL：不应再携带数据分析页的产品 prod-a，scope 应该重置为 all，tab 重置为 articles
    const url = page.url();
    assert.ok(url.includes('page=contents'), `Expected page=contents, got ${url}`);
    assert.ok(!url.includes('scope=prod-a'), `URL should NOT contain scope=prod-a, got ${url}`);
    assert.ok(url.includes('scope=all'), `URL should have scope=all, got ${url}`);

    // 4. 验证营销内容页面展示了所有产品的内容（content-a 和 content-b 均可见）
    await page.getByText('产品A营销文案').waitFor();
    await page.getByText('产品B营销文案').waitFor();

    // 5. 验证营销内容页面工具栏中的产品筛选器存在
    const productSelect = page.getByLabel('产品筛选', { exact: true });
    await productSelect.waitFor();
    assert.equal(await productSelect.inputValue(), 'all');

    // 6. 在营销内容工具栏主动选择筛选「产品A」
    await productSelect.selectOption('prod-a');
    await page.waitForTimeout(200);

    // 此时 URL 包含 scope=prod-a
    assert.ok(page.url().includes('scope=prod-a'));
    // 列表中只有产品A文案，产品B文案被过滤
    assert.equal(await page.getByText('产品A营销文案').count(), 1);
    assert.equal(await page.getByText('产品B营销文案').count(), 0);

    // 7. 验证清除按钮（X）出现，点击清除按钮
    const clearBtn = page.getByRole('button', { name: '清除产品筛选' });
    await clearBtn.waitFor();
    await clearBtn.click();
    await page.waitForTimeout(200);

    // 8. 验证已成功取消筛选：URL 恢复为 scope=all，两个产品文案均再次可见
    assert.ok(page.url().includes('scope=all'));
    assert.equal(await page.getByText('产品A营销文案').count(), 1);
    assert.equal(await page.getByText('产品B营销文案').count(), 1);
  } finally {
    await browser?.close();
    child.kill();
    await new Promise(resolve => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
    rmSync(dir, { recursive: true, force: true });
  }
});
