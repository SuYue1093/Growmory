import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('版本发布状态为已发布、已归档时，从待办和继续准备等位置移除', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-status-ui-'));
  const port = '5219';
  const server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'db.sqlite') },
    stdio: 'pipe',
  });

  let browser;
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error('启动超时')), 10000);
      server.stdout.on('data', s => {
        if (String(s).includes('Growmory')) {
          clearTimeout(t);
          resolve();
        }
      });
      server.once('error', reject);
    });

    const isMac = process.platform === 'darwin';
    browser = await chromium.launch({
      ...(isMac ? { channel: 'chrome' } : {}),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const base = `http://127.0.0.1:${port}`;
    const state = await page.request.get(`${base}/api/state`).then(r => r.json());
    const data = JSON.parse(readFileSync('tests/helpers/workspace.json'));
    const pid = data.products[0].id;

    // 构造测试数据：
    // r-active: preparing 状态（应该在“继续准备”和“待办”中）
    // r-published: published 状态（应该被移除）
    // r-archived: archived 状态（应该被移除）
    // task-active: 关联 r-active，未完成（应该在待办中）
    // task-archived: 关联 r-archived，未完成（应该从待办中移除）
    // task-published: 关联 r-published，未完成（应该从待办中移除）
    data.releases = [
      {
        id: 'r-active',
        productId: pid,
        version: '1.1.0-dev',
        changes: '活跃版本内容',
        languages: ['中文'],
        channels: ['App Store'],
        status: 'preparing',
        createdAt: new Date().toISOString(),
        notes: [],
        proposals: [],
      },
      {
        id: 'r-published',
        productId: pid,
        version: '1.0.0-pub',
        changes: '已发布版本内容',
        languages: ['中文'],
        channels: ['App Store'],
        status: 'published',
        createdAt: new Date().toISOString(),
        notes: [],
        proposals: [],
      },
      {
        id: 'r-archived',
        productId: pid,
        version: '0.9.0-arc',
        changes: '已归档版本内容',
        languages: ['中文'],
        channels: ['App Store'],
        status: 'archived',
        createdAt: new Date().toISOString(),
        notes: [],
        proposals: [],
      },
    ];

    data.tasks = [
      {
        id: 't-active',
        productId: pid,
        releaseId: 'r-active',
        title: '活跃版本待办任务',
        done: false,
        date: '',
      },
      {
        id: 't-archived',
        productId: pid,
        releaseId: 'r-archived',
        title: '已归档版本待办任务',
        done: false,
        date: '',
      },
      {
        id: 't-published',
        productId: pid,
        releaseId: 'r-published',
        title: '已发布版本待办任务',
        done: false,
        date: '',
      },
    ];

    assert.equal(
      (await page.request.put(`${base}/api/state`, { data: { revision: state.revision, data } })).status(),
      200
    );

    await page.goto(base);
    await page.getByRole('heading', { name: '工作台' }).waitFor();

    // 1. 验证导航栏已移除待办 tab
    assert.equal(await page.locator('nav').getByRole('button', { name: '待办' }).count(), 0);

    // 2. 验证工作台已移除“继续准备”模块
    assert.equal(await page.locator('.release-resume').count(), 0);

    // 3. 验证“进行中版本”卡片数量：只计算 preparing/ready，应该为 1（r-active）
    const activeReleasesCard = page.locator('.workspace-overview button', { hasText: '进行中版本' });
    const countText = await activeReleasesCard.locator('strong').innerText();
    assert.equal(countText.trim(), '1');

    // 4. 验证“你的产品”列表：“1 个准备中”
    const productRow = page.locator('.product-summary-row').first();
    assert.ok(await productRow.innerText().then(t => t.includes('1 个准备中')));

    // 5. 验证首页“待处理”和工作台待办计数：
    const workQueue = page.locator('.panel.work-queue');
    const workQueueText = await workQueue.innerText();
    assert.ok(workQueueText.includes('1.1.0-dev'), '待处理应包含活跃版本的版本发布提醒');
    assert.ok(!workQueueText.includes('1.0.0-pub'), '待处理不应包含已发布版本');
    assert.ok(!workQueueText.includes('0.9.0-arc'), '待处理不应包含已归档版本');
    assert.ok(!workQueueText.includes('活跃版本待办任务'), '工作台主页已移除手动任务展示');
    assert.ok(!workQueueText.includes('已归档版本待办任务'), '工作台主页不应包含已归档版本的手动任务');
    assert.ok(!workQueueText.includes('已发布版本待办任务'), '工作台主页不应包含已发布版本的手动任务');

    // 验证待办专用页面保留活跃版本的版本发布待办，并移除手动任务
    await workQueue.getByRole('button', { name: '查看全部' }).click();
    await page.getByRole('heading', { name: '待办事项', exact: true }).waitFor();
    const tasksPageBefore = await page.locator('main').innerText();
    assert.ok(tasksPageBefore.includes('1.1.0-dev'), '待办页面应包含活跃版本的待办事项');
    assert.ok(!tasksPageBefore.includes('1.0.0-pub'), '待办页面不应包含已发布版本');
    assert.ok(!tasksPageBefore.includes('0.9.0-arc'), '待办页面不应包含已归档版本');
    assert.ok(!tasksPageBefore.includes('活跃版本待办任务'), '待办页面已移除手动任务模块');
    assert.ok(!tasksPageBefore.includes('已归档版本待办任务'), '待办页面不应包含已归档版本的手动任务');
    assert.ok(!tasksPageBefore.includes('已发布版本待办任务'), '待办页面不应包含已发布版本的手动任务');

    // 返回工作台
    await page.locator('a.brand').click();
    await page.getByRole('heading', { name: '工作台' }).waitFor();

    // 6. 点击进入活跃版本，将状态变更为“已发布”
    await page.locator('.panel.work-queue').locator('.attention-row', { hasText: '1.1.0-dev' }).click();
    await page.getByLabel('变更版本状态').selectOption('published');
    await page.getByText('版本状态已变更为「已发布」').waitFor();

    // 返回工作台
    await page.locator('a.brand').click();
    await page.getByRole('heading', { name: '工作台' }).waitFor();

    // 验证“进行中版本”变为 0
    assert.equal((await activeReleasesCard.locator('strong').innerText()).trim(), '0');

    // 验证工作台“待处理”面板中不再有 1.1.0-dev 的提醒或关联任务
    const workQueueAfter = page.locator('.panel.work-queue');
    const workQueueAfterText = await workQueueAfter.innerText();
    assert.ok(!workQueueAfterText.includes('1.1.0-dev'));
    assert.ok(!workQueueAfterText.includes('活跃版本待办任务'));

    // 7. 通过“待处理”板块的“查看全部”进入“待办”页面
    await workQueueAfter.getByRole('button', { name: '查看全部' }).click();
    await page.getByRole('heading', { name: '待办事项', exact: true }).waitFor();
    const tasksPageText = await page.locator('main').innerText();
    assert.ok(!tasksPageText.includes('1.1.0-dev'));
    assert.ok(!tasksPageText.includes('1.0.0-pub'));
    assert.ok(!tasksPageText.includes('0.9.0-arc'));
    assert.ok(!tasksPageText.includes('活跃版本待办任务'));
    assert.ok(!tasksPageText.includes('已归档版本待办任务'));
    assert.ok(!tasksPageText.includes('已发布版本待办任务'));

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
    await new Promise(r => server.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
});
