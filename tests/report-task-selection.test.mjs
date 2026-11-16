import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('数据分析报告详情：划词悬浮创建待办，已创建内容显示下划线且可点击查看', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'report-task-ui-'));
  const port = '5236';
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

    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    const base = `http://127.0.0.1:${port}`;
    const state = await page.request.get(`${base}/api/state`).then(r => r.json());
    const data = JSON.parse(readFileSync('tests/helpers/workspace.json'));
    const pid = data.products[0].id;

    // 注入一份测试报告
    const testReportId = 'rep-selection-test';
    const portfolioReportId = 'rep-selection-portfolio';
    const portfolioQuote = '汇总各产品的留存趋势';
    const targetQuote = '建议重点优化副标题与搜索词';
    const boldQuote = '因此这不是产品需求问题，而是三款待修产品的素材/关键词匹配问题。';
    const tableQuote = '清理泛词、聚焦高意图关键词';
    data.analyticsReports = [
      {
        id: testReportId,
        productId: pid,
        title: '拾页近30天数据分析与增长诊断报告',
        summary: '整体表现稳定。核心结论：展示转化良好。主要建议：关注次月留存。',
        content: `# 拾页近30天数据分析与增长诊断报告

## 1. 核心发现
目前整体获客平稳，但在搜索环节仍有增长空间。${targetQuote}，以提升自然搜索展示量。再次强调：${targetQuote}。
矩阵最大流失发生在展示环节。因此这不是产品需求问题，而是三款待修产品的**素材/关键词匹配问题**。

## 2. 详细指标分析
转化漏斗保持健康，建议按计划执行迭代。

## 3. 落地建议
| 优化维度 | 具体改进建议 | 优先级 |
| :--- | :--- | :--- |
| ASO 关键词优化 | ${tableQuote} | 高 |`,
        period: '近30天',
        createdAt: new Date().toISOString(),
      },
      {
        id: portfolioReportId,
        productId: '',
        title: '全产品综合报告',
        summary: '',
        content: portfolioQuote,
        createdAt: '2026-10-01T00:00:00.000Z',
      },
    ];

    assert.equal(
      (await page.request.put(`${base}/api/state`, { data: { revision: state.revision, data } })).status(),
      200
    );

    // 打开页面并导航到 App 数据分析 -> 分析报告
    await page.goto(base);
    await page.waitForLoadState('networkidle');

    const navAnalyticsBtn = page.locator('nav button', { hasText: /App 数据分析|App Analytics/ });
    await navAnalyticsBtn.waitFor({ timeout: 10000 });
    await navAnalyticsBtn.click();

    // 确保切换到“分析报告”Tab
    const reportsTabBtn = page.locator('.analytics-main-tabs button', { hasText: /分析报告|Reports/ });
    await reportsTabBtn.waitFor({ timeout: 10000 });
    await reportsTabBtn.click();
    await page.waitForTimeout(300);

    // 1. 检查报告列表存在并点击进入详情
    const reportItem = page.locator('.report-item-row').first();
    await reportItem.waitFor({ timeout: 10000 });
    assert.ok(await reportItem.locator('.report-badge-unread').count() > 0, '报告初始应显示未读标记');
    assert.equal(await reportItem.getByRole('button', { name: /标为已读|标为未读|Mark as (Unread|Read)/ }).count(), 0);
    await reportItem.click();

    // 验证进入报告详情页，状态自动变为已读
    await page.locator('.report-reader-view').waitFor();
    assert.ok(await page.locator('.reader-document-title').innerText().then(t => t.includes('拾页')));
    await page.locator('.reader-read-badge', { hasText: '已读' }).waitFor();

    // 2. 模拟鼠标框选内容
    // 在浏览器上下文中通过 window.getSelection() 选中文本 targetQuote
    await page.evaluate((quote) => {
      const walker = document.createTreeWalker(
        document.querySelector('.reader-content-main'),
        NodeFilter.SHOW_TEXT
      );
      let node;
      while ((node = walker.nextNode())) {
        const idx = node.textContent.lastIndexOf(quote);
        if (idx !== -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + quote.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          // 触发 mouseup
          document.querySelector('.reader-content-main').dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true })
          );
          break;
        }
      }
    }, targetQuote);

    // 3. 验证悬浮工具条弹出并包含“创建为待办”
    const toolbar = page.locator('.report-selection-toolbar');
    await toolbar.waitFor({ timeout: 5000 });
    assert.ok(await toolbar.innerText().then(t => t.includes('创建为待办')));

    // 4. 点击悬浮按钮，验证弹出创建待办弹窗，验证标题 20 字内限制与 AI 重新生成入口
    await toolbar.click();
    const createModal = page.locator('.create-task-modal');
    await createModal.waitFor();
    const createProduct = createModal.locator('select');
    assert.equal(await createProduct.inputValue(), pid, '单产品报告默认关联本报告产品');
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(dir, 'modal-screenshot.png') });
    assert.ok(await createModal.locator('.quote-text').innerText().then(t => t.includes(targetQuote)));

    // 验证待办标题输入框严格限制 20 字以内并有字数统计与 AI 重新生成按钮
    const titleInput = createModal.locator('#task-title-input');
    assert.equal(await titleInput.getAttribute('maxlength'), '20', '待办标题必须设置 maxLength=20');
    const charCount = createModal.locator('.task-title-char-count');
    assert.ok(await charCount.innerText().then(t => t.includes('/20')), '必须显示 20 字内字符计数');
    assert.ok(await createModal.locator('.ai-regen-btn').count() > 0, '必须提供 AI 重新生成按钮');

    // 填写备注
    const noteInput = createModal.locator('#task-note-input');
    await noteInput.fill('这是关于副标题优化的执行行动计划');

    // 点击确认创建待办
    const submitBtn = createModal.getByRole('button', { name: '确认创建待办' });
    await submitBtn.click();
    await createModal.waitFor({ state: 'hidden' });

    // 5. 验证已创建的内容显示原生无缝连续下划线（非断裂方块或边框圆角）
    const underlineSpan = page.locator('.report-task-underline', { hasText: targetQuote });
    await underlineSpan.waitFor({ timeout: 5000 });
    assert.equal(await underlineSpan.count(), 1, '只为实际选中的重复文字加下划线');
    assert.equal(await underlineSpan.evaluate(el => el.previousSibling.textContent.endsWith('再次强调：')), true);
    const decorationStyle = await underlineSpan.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        textDecoration: style.textDecorationLine || style.textDecoration,
        borderRadius: style.borderRadius,
      };
    });
    assert.ok(decorationStyle.textDecoration.includes('underline'), '应使用原生连续 underline 渲染');
    assert.equal(decorationStyle.borderRadius, '0px', '无缝下划线不应存在圆角边框导致切块断裂');

    // 6. 点击下划线内容，弹出待办详情弹窗
    await underlineSpan.click();
    const viewModal = page.locator('.view-task-modal');
    await viewModal.waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(dir, 'view-modal-screenshot.png') });

    // 验证查看弹窗中的引用内容与备注
    assert.ok(await viewModal.locator('.quote-text').innerText().then(t => t.includes(targetQuote)));
    assert.ok(await viewModal.locator('.notes-content-box').innerText().then(t => t.includes('这是关于副标题优化的执行行动计划')));

    // 7. 测试切换状态为“已完成”，然后再切回未完成以便在待办列表中验证展示
    const statusBtn = viewModal.locator('.task-status-toggle-btn');
    await statusBtn.click();
    assert.ok(await statusBtn.locator('.status-label').innerText().then(t => t.includes('已完成')));
    // 再次点击切换为未完成
    await statusBtn.click();
    assert.ok(await statusBtn.locator('.status-label').innerText().then(t => t.includes('待处理')));

    // 验证弹窗下方已移除前往待办列表和关闭按钮，编辑与删除按钮已移至页面下方
    assert.equal(await viewModal.locator('.modal-bottom-actions button', { hasText: '前往待办列表' }).count(), 0);
    assert.equal(await viewModal.locator('.modal-bottom-actions button', { hasText: '关闭' }).count(), 0);
    assert.ok(await viewModal.locator('.modal-bottom-actions button', { hasText: '编辑待办' }).count() > 0, '下方应包含编辑待办按钮');
    assert.ok(await viewModal.locator('.modal-bottom-actions button', { hasText: '删除待办' }).count() > 0, '下方应包含删除待办按钮');

    // 关闭弹窗（通过右上角关闭按钮）
    await viewModal.locator('.modal-top-actions button[aria-label="关闭"]').click();
    await viewModal.waitFor({ state: 'hidden' });

    // 7.1 测试表格内框选内容创建待办、下划线展示与点击
    await page.locator('.reader-markdown-article table').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.evaluate((quote) => {
      const walker = document.createTreeWalker(
        document.querySelector('.reader-markdown-article table'),
        NodeFilter.SHOW_TEXT
      );
      let node;
      while ((node = walker.nextNode())) {
        const idx = node.textContent.indexOf(quote);
        if (idx !== -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + quote.length);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.querySelector('.reader-content-main').dispatchEvent(
            new MouseEvent('mouseup', { bubbles: true, cancelable: true })
          );
          break;
        }
      }
    }, tableQuote);

    await toolbar.waitFor({ timeout: 5000 });
    await toolbar.click();
    await createModal.waitFor();
    assert.ok(await createModal.locator('.quote-text').innerText().then(t => t.includes(tableQuote)));
    await createProduct.selectOption('');
    await createModal.getByRole('button', { name: '确认创建待办' }).click();
    await createModal.waitFor({ state: 'hidden' });

    // 验证表格内单元格已渲染下划线并可点击
    const tableUnderline = page.locator('.reader-markdown-article table .report-task-underline', { hasText: tableQuote });
    await tableUnderline.waitFor({ timeout: 5000 });
    assert.ok(await tableUnderline.count() > 0, '表格单元格内应具有待办下划线');

    // 点击表格内的下划线，弹出待办详情弹窗并验证“查看报告”按钮存在
    await tableUnderline.click();
    await viewModal.waitFor();
    assert.ok(await viewModal.locator('.quote-text').innerText().then(t => t.includes(tableQuote)));
    const viewReportBtn = viewModal.locator('.quote-navigate-btn');
    assert.ok(await viewReportBtn.count() > 0, '引用报告原文区域应包含查看报告按钮');
    // 关闭弹窗（通过右上角关闭按钮）
    await viewModal.locator('.modal-top-actions button[aria-label="关闭"]').click();
    await viewModal.waitFor({ state: 'hidden' });

    // 8. 验证首页（工作台主页）显示该待办
    await page.locator('a.brand').click();
    await page.getByRole('heading', { name: '工作台' }).waitFor();
    const workQueue = page.locator('.panel.work-queue');
    await workQueue.waitFor();
    const homeWorkText = await workQueue.innerText();
    assert.ok(homeWorkText.includes('建议重点优化副标题与搜索词'), '首页待办列表中应展示该报告待办事项');

    // 9. 验证待办事项列表专用页面展示该待办
    await workQueue.getByRole('button', { name: '查看全部' }).click();
    await page.getByRole('heading', { name: '待办事项', exact: true }).waitFor();
    const tasksPageText = await page.locator('main').innerText();
    assert.ok(tasksPageText.includes('建议重点优化副标题与搜索词'), '待办事项列表中应展示该报告待办事项');

    // 10. 待办列表页：点击处理，验证复用点击划线打开的详情弹窗（不跳转数据报告页），并能编辑标题、备注、计划时间
    const taskRow = page.locator('.system-reminders .attention-row', { hasText: '建议重点优化副标题与搜索词' }).first();
    await taskRow.locator('.reminder-action-btn').click();

    // 验证打开复用的待办详情弹窗 (.view-task-modal)
    const taskModal = page.locator('.view-task-modal');
    await taskModal.waitFor();
    assert.ok(!page.url().includes('analytics'), '点击处理不应跳转至数据报告页');
    assert.ok(await taskModal.locator('#view-task-title').innerText().then(t => t.includes('建议重点优化副标题与搜索词')));
    assert.ok(await taskModal.locator('.quote-text').innerText().then(t => t.includes('建议重点优化副标题与搜索词')));
    assert.ok(await taskModal.locator('.notes-content-box').innerText().then(t => t.includes('这是关于副标题优化的执行行动计划')));

    // 验证底部包含编辑和删除按钮，点击底部编辑待办按钮进入编辑模式
    assert.ok(await taskModal.locator('.modal-bottom-actions button', { hasText: '编辑待办' }).count() > 0);
    assert.ok(await taskModal.locator('.modal-bottom-actions button', { hasText: '删除待办' }).count() > 0);
    await taskModal.locator('.modal-bottom-actions button', { hasText: '编辑待办' }).click();
    await taskModal.locator('#edit-task-title-input').waitFor();

    // 验证标题、备注、计划时间输入项均存在且有初始值
    const titleField = taskModal.locator('#edit-task-title-input');
    const noteField = taskModal.locator('#edit-task-note-input');
    const dateField = taskModal.locator('#edit-task-date-input');

    assert.ok(await titleField.inputValue().then(v => v.includes('建议重点优化副标题与搜索词')));
    assert.ok(await noteField.inputValue().then(v => v.includes('这是关于副标题优化的执行行动计划')));

    // 修改标题、备注、计划时间
    await titleField.fill('修改后的报告待办事项标题');
    await noteField.fill('修改后的执行计划备注说明');
    await dateField.fill('2026-11-28');
    await taskModal.locator('#edit-task-product-select').selectOption('');

    // 保存编辑
    await taskModal.getByRole('button', { name: '保存修改' }).click();
    await page.waitForTimeout(300);

    // 验证弹窗内展示已更新为新标题与新备注
    assert.ok(await taskModal.locator('#view-task-title').innerText().then(t => t.includes('修改后的报告待办事项标题')));
    assert.ok(await taskModal.locator('.notes-content-box').innerText().then(t => t.includes('修改后的执行计划备注说明')));

    // 关闭弹窗
    await taskModal.locator('button.icon-button[aria-label="关闭"]').click();
    await taskModal.waitFor({ state: 'hidden' });

    // 验证待办列表页面已更新为新标题
    assert.ok(await page.locator('main').innerText().then(t => t.includes('修改后的报告待办事项标题')));

    // 11. 主页工作台：点击处理，同样验证复用待办详情弹窗（不跳转数据报告页）
    await page.locator('a.brand').click();
    await page.getByRole('heading', { name: '工作台' }).waitFor();
    const homeTaskCard = page.locator('.workbench-reminder-card', { hasText: '修改后的报告待办事项标题' }).first();
    await homeTaskCard.locator('.reminder-action-btn').click();

    // 验证复用的待办详情弹窗打开
    await taskModal.waitFor();
    assert.ok(await taskModal.locator('#view-task-title').innerText().then(t => t.includes('修改后的报告待办事项标题')));
    assert.ok(await taskModal.locator('.notes-content-box').innerText().then(t => t.includes('修改后的执行计划备注说明')));
    assert.ok(await taskModal.locator('.task-meta-tag.date-tag').innerText().then(t => t.includes('2026-11-28')));

    // 关闭弹窗
    await taskModal.locator('button.icon-button[aria-label="关闭"]').click();
    await taskModal.waitFor({ state: 'hidden' });

    // 12. 验证“查看报告”按钮：点击后跳转至数据分析报告并锚点定位至对应位置
    const tableTaskCard = page.locator('.workbench-reminder-card', { hasText: tableQuote }).first();
    await tableTaskCard.locator('.reminder-action-btn').click();
    await taskModal.waitFor();

    const navBtn = taskModal.locator('.quote-navigate-btn');
    await navBtn.waitFor();
    await navBtn.click();
    await taskModal.waitFor({ state: 'hidden' });

    // 验证自动跳转至数据分析报告详情页
    await page.locator('.report-reader-view').waitFor({ timeout: 10000 });
    assert.ok(await page.locator('.reader-document-title').isVisible(), '应跳转至数据分析报告详情页');

    // 验证对应下划线元素存在并已执行定位
    const anchoredUnderline = page.locator('.report-task-underline', { hasText: tableQuote });
    await anchoredUnderline.waitFor({ timeout: 5000 });
    assert.ok(await anchoredUnderline.count() > 0, '报告详情页中对应引用的下划线锚点应存在');

    await page.locator('.anchor-highlight-flash').waitFor({ state: 'visible', timeout: 5000 });
    await page.locator('.anchor-highlight-flash').waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('.reader-markdown-article strong').evaluate(el => {
      el.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
    await page.evaluate((quote) => {
      const bold = document.querySelector('.reader-markdown-article strong');
      const before = bold.previousSibling;
      const after = bold.nextSibling;
      const range = document.createRange();
      range.setStart(before, before.textContent.indexOf(quote.slice(0, 10)));
      range.setEnd(after, 1);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      bold.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }, boldQuote);
    await toolbar.click();
    await createModal.getByRole('button', { name: '确认创建待办' }).click();
    await createModal.waitFor({ state: 'hidden' });
    const boldMark = page.locator('.report-task-underline', { hasText: boldQuote });
    assert.equal(await boldMark.count(), 1, '跨加粗的连续选区应使用同一个标记');
    assert.equal(await boldMark.textContent(), boldQuote);
    assert.equal(await boldMark.locator('strong').textContent(), '素材/关键词匹配问题');

    await page.locator('.reader-back-btn').click();
    await page.locator('.report-item-row', { hasText: '全产品综合报告' }).click();
    await page.locator('.reader-markdown-article p').evaluate(el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await toolbar.click();
    assert.equal(await createProduct.inputValue(), '', '综合报告默认选择通用');
    await createModal.getByRole('button', { name: '确认创建待办' }).click();
    await createModal.waitFor({ state: 'hidden' });

    const { data: savedData } = await page.request.get(`${base}/api/state`).then(r => r.json());
    assert.equal(savedData.tasks.find(task => task.quote === targetQuote).productId, '', '编辑时保存通用');
    assert.equal(savedData.tasks.find(task => task.quote === tableQuote).productId, '', '创建时手动选择通用');
    assert.equal(savedData.tasks.find(task => task.quote === portfolioQuote).productId, '', '综合报告创建时保存通用');

    assert.equal(errors.length, 0, `页面运行不应有错误: ${errors.join(', ')}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});
