import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

test('营销内容组创建、提示词复制、MCP多平台回填与国外平台中文解释编辑', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'marketing-group-test-'));
  const port = '5228';
  const server = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: port, DB_PATH: join(dir, 'db.sqlite') },
    stdio: 'pipe',
  });

  let browser;
  try {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(Error('启动超时')), 10000);
      server.stdout.on('data', (s) => {
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
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    const base = `http://127.0.0.1:${port}`;
    const state = await page.request.get(`${base}/api/state`).then((r) => r.json());
    const data = JSON.parse(readFileSync('tests/helpers/workspace.json'));
    // 确保有两个产品可供多选
    if (data.products.length < 2) {
      data.products.push({
        id: 'product-two',
        name: '星光闪念',
        summary: '轻量灵感速记与知识整理工具',
        appId: '',
        price: '',
        platform: 'iOS / macOS',
        website: '',
        color: 'purple',
      });
    }
    data.contentGroups = [];
    data.contents = [];
    data.assets = [
      {
        id: 'asset-workflow',
        name: '工作流全景图.png',
        url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%232563eb" width="100" height="100"/><text fill="white" y="50" x="10">Flow</text></svg>',
        productId: data.products[0].id,
        fileSize: 1024,
        fileName: '工作流全景图.png',
        fileType: 'image/svg+xml',
        createdAt: '2026-11-06',
        updatedAt: '2026-11-06',
      },
    ];

    assert.equal(
      (await page.request.put(`${base}/api/state`, { data: { revision: state.revision, data } })).status(),
      200
    );

    // 1. 打开页面，前往营销内容模块
    await page.goto(base);
    await page.locator('nav').getByRole('button', { name: '营销内容' }).click();
    await page.getByRole('heading', { name: '营销内容组' }).waitFor();

    // 2. 点击创建营销内容组
    await page.getByRole('button', { name: '新建营销内容组' }).first().click();
    await page.getByRole('heading', { name: '创建营销内容组' }).waitFor();

    // （1）多选产品：勾选至少两个产品
    const productCheckboxes = page.locator('.product-select-card input[type="checkbox"]');
    const pCount = await productCheckboxes.count();
    assert.ok(pCount >= 2);
    // 确保前两个都勾选上
    if (!(await productCheckboxes.nth(0).isChecked())) await productCheckboxes.nth(0).check();
    if (!(await productCheckboxes.nth(1).isChecked())) await productCheckboxes.nth(1).check();

    // （2）填写内容方向
    await page.getByPlaceholder('例如：2.0 新版本核心特性推广、黑五限时折扣').fill('高效工作流与自动化实践');
    await page.getByPlaceholder(/详细描述文案重点/).fill('聚焦独立开发者日常痛点，强调两款产品无缝协作与开箱即用的工作流提升。');

    // （3）选择推广平台：选择国内平台「小红书」与国外平台「Reddit」
    const redditCheckbox = page.locator('.channel-checkbox-pill', { hasText: 'Reddit' }).locator('input');
    const redCheckbox = page.locator('.channel-checkbox-pill', { hasText: '小红书' }).locator('input');
    if (!(await redditCheckbox.isChecked())) await redditCheckbox.check();
    if (!(await redCheckbox.isChecked())) await redCheckbox.check();

    // （4）查看并复制提示词
    await page.locator('.prompt-preview-details summary').click();
    const promptText = await page.locator('.prompt-preview-textarea').inputValue();
    assert.ok(promptText.includes('高效工作流与自动化实践'));
    assert.ok(promptText.includes('groupId'));
    assert.ok(promptText.includes('Reddit'));
    assert.ok(promptText.includes('小红书'));
    assert.ok(promptText.includes('中文解释'));
    assert.ok(promptText.includes('explanation'));
    assert.ok(promptText.includes('仅国外平台需要有中文解释'));
    assert.ok(promptText.includes('翻译整个文章'));
    assert.ok(promptText.includes('配图推荐'));
    assert.ok(promptText.includes('只读取图片名称，不用查看图片'));
    assert.ok(promptText.includes('0~8') || promptText.includes('0-8'));
    assert.ok(promptText.includes('工作流全景图.png'));

    // 保存内容组并复制提示词
    await page.getByRole('button', { name: '保存内容组并复制提示词' }).click();
    await page.getByRole('heading', { name: '创建营销内容组' }).waitFor({ state: 'hidden' });

    // 检查剪贴板
    const copiedPrompt = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copiedPrompt.includes('高效工作流与自动化实践'));

    // 验证营销内容组卡片已展示
    const groupCard = page.locator('.content-group-card').first();
    await groupCard.waitFor();
    const cardText = await groupCard.innerText();
    assert.ok(cardText.includes('高效工作流与自动化实践'));
    assert.ok(cardText.includes('Reddit'));
    assert.ok(cardText.includes('小红书'));
    assert.ok(cardText.includes('已生成 0 /'));

    // 3. 模拟外部 Agent 通过 MCP 回填各平台营销内容
    const updatedState = await page.request.get(`${base}/api/state`).then((r) => r.json());
    const createdGroup = updatedState.data.contentGroups[0];
    assert.ok(createdGroup && createdGroup.id);

    const mcpConfig = await fetch(`${base}/api/mcp/config`, { method: "POST" }).then((r) => r.json());
    const mcpHeader = mcpConfig.http.mcpServers.growmory.headers;

    const mcpClient = new Client({ name: 'test-agent', version: '1.0.0' }, { capabilities: {} });
    await mcpClient.connect(
      new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
        requestInit: { headers: mcpHeader },
      })
    );

    // 回填 1：国内平台（小红书）
    const r1 = await mcpClient.callTool({
      name: 'save_contents',
      arguments: {
        expectedRevision: updatedState.revision,
        fields: {
          groupId: createdGroup.id,
          productId: data.products[0].id,
          channel: '小红书',
          title: '一个人开发3个产品，我的全自动化工作流大公开！',
          body: '今天想和大家聊聊独立开发的日常效率神器。\n\n## 为什么需要工作流？\n减少重复动作，专注核心产品逻辑。',
          status: 'draft',
        },
      },
    });
    assert.ok(!r1.isError, JSON.stringify(r1));
    const res1 = JSON.parse(r1.content[0].text);

    // 回填 2：国外平台（Reddit），带英文正文与翻译整个文章的中文解释（explanation），以及配图推荐（assetNames）
    const r2 = await mcpClient.callTool({
      name: 'save_contents',
      arguments: {
        expectedRevision: res1.revision,
        fields: {
          groupId: createdGroup.id,
          productId: data.products[0].id,
          channel: 'Reddit',
          title: 'Automate your indie hacking workflow in 3 simple steps',
          body: "Stop doing repetitive chores manually.\n\nHere is how I stream my local releases and promotion using Growmory:\n\n1. Confirm local docs\n2. Hook up MCP\n3. Ship faster 🚀",
          explanation: '【标题翻译】只需简单3步，实现独立开发工作流自动化\n\n【正文翻译】告别繁琐重复的手工杂务。以下是我使用 Growmory 顺畅管理本地版本发布与多平台推广的秘诀：\n1. 确认本地文档\n2. 接入 MCP\n3. 高速上线 🚀',
          assetNames: ['工作流全景图.png'],
          redditCommunities: [{
            name: 'r/SideProject',
            reason: '适合独立开发工作流',
            rules: '先核对自推广与链接规则',
            notes: '披露开发者身份',
            sourceUrl: 'https://www.reddit.com/r/SideProject/about/rules/',
            checkedAt: '2026-11-08',
          }, { name: 'r/macapps', reason: '面向 Mac 应用用户', rules: '规则待核验', notes: '' }],
          status: 'draft',
        },
      },
    });
    assert.ok(!r2.isError, JSON.stringify(r2));

    // 4. 刷新页面，验证内容组状态与单篇内容列表
    await page.reload();
    await page.locator('nav').getByRole('button', { name: '营销内容' }).click();

    // 验证内容组进度变为已生成 2 篇，且两个平台徽章显示已生成（有 check 图标）
    await page.locator('.content-group-card').waitFor();
    const updatedCardText = await page.locator('.content-group-card').first().innerText();
    assert.ok(updatedCardText.includes('已生成 2 /'));

    // 验证单篇列表中存在国外平台内容，且显示「含中文解释」标签
    const foreignTitleButton = page.locator('.marketing-title', { hasText: 'Automate your indie hacking workflow' });
    await foreignTitleButton.waitFor();
    assert.ok(await foreignTitleButton.innerText().then((t) => t.includes('含中文解释')));
    assert.ok(await foreignTitleButton.innerText().then((t) => t.includes('【中文解释】') || t.includes('【标题翻译】')));

    // 5. 点击进入海外文案编辑页，验证编辑页优化：
    await foreignTitleButton.click();
    await page.locator('#marketing-editor-title').waitFor();

    // （1）验证国外平台专属中文解释卡片展示与编辑（全文翻译）
    const communities = page.locator('.reddit-communities[open]');
    await communities.getByRole('heading', { name: 'r/SideProject' }).waitFor();
    for (const value of ['适合独立开发工作流', '先核对自推广与链接规则', '披露开发者身份', '2026-11-08']) {
      assert.ok((await communities.innerText()).includes(value));
    }
    assert.equal(await communities.getByRole('link', { name: '查看规则来源' }).getAttribute('href'),
      'https://www.reddit.com/r/SideProject/about/rules/');
    const secondTab = communities.getByRole('tab', { name: 'r/macapps' });
    await secondTab.click();
    assert.equal(await secondTab.getAttribute('aria-selected'), 'true');
    assert.equal(await communities.getByRole('tabpanel').locator('.reddit-community-field').count(), 3);
    assert.ok((await communities.getByRole('tabpanel').innerText()).includes('面向 Mac 应用用户'));
    assert.equal(await communities.getByRole('heading', { name: 'r/SideProject' }).count(), 0);
    await secondTab.press('ArrowLeft');
    assert.equal(await communities.getByRole('tab', { name: 'r/SideProject' }).getAttribute('aria-selected'), 'true');
    const explanationTextarea = page.locator('textarea[aria-label="国外平台中文解释"]');
    await explanationTextarea.waitFor();
    assert.ok((await explanationTextarea.inputValue()).includes('【标题翻译】只需简单3步'));
    assert.ok((await explanationTextarea.inputValue()).includes('【正文翻译】告别繁琐重复的手工杂务'));
    // 用户可修改中文翻译并保存
    await explanationTextarea.fill('【标题翻译】修改后的标题翻译\n\n【正文翻译】修改后的正文完整翻译。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByRole('button', { name: '保存', exact: true }).waitFor();

    // （2）验证配图参考模块已彻底移除（顶部主编辑区与右侧栏均不展示）
    assert.equal(await page.locator('.marketing-recommended-assets').count(), 0, '顶部配图参考模块已移除');
    assert.equal(await page.locator('.sidebar-added-asset-item').count(), 0, '右侧栏配图参考模块已移除');

    // 验证字数统计
    const titleCounter = page.locator('.marketing-title-counter');
    assert.equal(await titleCounter.count(), 1, '标题输入框右上角应有字数统计');
    const charCounts = page.locator('.marketing-char-counts');
    assert.equal(await charCounts.count(), 1, '写作工具栏应有标题与正文字数统计');

    // 验证制作封面图按钮
    const coverBtn = page.locator('button:has-text("制作封面图")');
    assert.ok(await coverBtn.count() >= 1, '应有制作封面图按钮');

    // （3）验证右边栏优化：
    const propertiesAside = page.locator('aside.marketing-properties.simplified');
    await propertiesAside.waitFor();
    // 基础属性展示所属产品与发布渠道，计划日期已移除
    assert.ok(await propertiesAside.innerText().then((t) => t.includes('所属产品')));
    assert.ok(await propertiesAside.innerText().then((t) => t.includes('发布渠道')));
    assert.ok(await propertiesAside.innerText().then((t) => !t.includes('计划日期')), '计划日期已移除');

    // 验证文章状态可以直接点击切换
    const statusSwitch = propertiesAside.locator('.marketing-status-switch');
    await statusSwitch.waitFor();
    await statusSwitch.getByRole('button', { name: '待发布' }).click();
    assert.ok(await statusSwitch.getByRole('button', { name: '待发布' }).evaluate((el) => el.classList.contains('active')));

    // 验证关联版本与参考资料默认展开（不再是收起折叠的 details）
    assert.ok(await propertiesAside.innerText().then((t) => t.includes('关联版本与参考资料')));

    // 关闭编辑页
    await page.getByLabel('关闭营销编辑').click();
    await page.locator('#marketing-editor-title').waitFor({ state: 'hidden' });

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.kill();
    await new Promise((r) => server.once('exit', r));
    rmSync(dir, { recursive: true, force: true });
  }
});
