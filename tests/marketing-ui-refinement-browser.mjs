import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const reservation = http.createServer();
await new Promise((r) => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), 'growmory-ui-refinement-'));
const child = spawn(process.execPath, ['server/index.mjs'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DB_PATH: join(dir, 'workspace.sqlite'),
  },
  stdio: 'pipe',
});

let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('测试服务启动超时')), 10000);
    child.stdout.on('data', (b) => {
      if (String(b).includes('Growmory')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(Error('测试服务退出：' + code));
    });
  });

  const isMac = process.platform === 'darwin';
  browser = await chromium.launch({
    ...(isMac ? { channel: 'chrome' } : {}),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());

  const current = await page.request.get(base + '/api/state').then((r) => r.json());
  const initialData = JSON.parse(readFileSync('tests/helpers/workspace.json', 'utf8'));
  const pid = initialData.products[0].id;
  initialData.assets = [
    {
      id: 'asset-test-1',
      productId: pid,
      name: '配图A.png',
      fileName: '配图A.png',
      url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="%232563eb" width="100" height="100"/></svg>',
      fileType: 'image/png',
      fileSize: 1024,
      createdAt: '2026-11-06T00:00:00Z',
      updatedAt: '2026-11-06T00:00:00Z',
    },
  ];
  initialData.contentGroups = [
    {
      id: 'cg1',
      title: '双十一预热',
      direction: '主打全能体验',
      productIds: [pid],
      channels: ['小红书', 'X'],
      createdAt: '2026-11-06T00:00:00Z',
    },
  ];
  initialData.contents = [
    {
      id: 'c1',
      groupId: 'cg1',
      productId: pid,
      title: '文章一号',
      body: '这是第一篇营销文案的正文内容。',
      channel: '小红书',
      status: 'draft',
      date: '2026-11-10',
      url: '',
      assetNames: ['配图A.png'],
    },
    {
      id: 'c2',
      groupId: 'cg1',
      productId: pid,
      title: '文章二号',
      body: 'This is the second marketing copy in English.',
      explanation: '这是英文营销内容的中文全文翻译。',
      channel: 'X',
      status: 'ready',
      date: '2026-11-11',
      url: '',
      assetNames: [],
    },
    {
      id: 'c3',
      productId: pid,
      title: '文章三号',
      body: '这是第三篇独立营销文案。',
      channel: '微信公众号',
      status: 'draft',
      date: '',
      url: '',
      assetNames: [],
    },
  ];

  const putRes = await page.request.put(base + '/api/state', { data: { revision: current.revision, data: initialData } });
  if (!putRes.ok()) {
    console.error('PUT /api/state failed:', putRes.status(), await putRes.text());
  }
  assert.equal(putRes.ok(), true);

  // 1. 进入营销内容页
  await page.goto(base + '/#page=contents');
  await page.getByRole('heading', { name: '营销内容', exact: true }).waitFor();

  // 验证需求 2：列表页
  // - 移除右上角：产品筛选（.scope-select）、手动创建按钮、准备营销创作按钮
  const topScopeSelect = await page.locator('.heading-actions .scope-select').count();
  assert.equal(topScopeSelect, 0, '营销内容页右上角不应出现产品筛选下拉框');

  const topManualBtn = await page.locator('.heading-actions button:has-text("手动创建")').count();
  assert.equal(topManualBtn, 0, '营销内容页右上角不应出现手动创建按钮');

  const topAiBtn = await page.locator('.heading-actions button:has-text("准备营销创作")').count();
  assert.equal(topAiBtn, 0, '营销内容页右上角不应出现准备营销创作按钮');

  // - 营销内容组模块，移除手动创建单篇按钮
  const groupManualBtn = await page.locator('.marketing-groups-panel button:has-text("手动创建单篇")').count();
  assert.equal(groupManualBtn, 0, '营销内容组面板中不应出现手动创建单篇按钮');

  // - 文章列表，在搜索框右侧添加 + 按钮，点击直接进入手动创建，移除单篇AI创建
  const plusBtn = page.getByRole('button', { name: '新建内容', exact: true });
  assert.equal(await plusBtn.count(), 1, '搜索框右侧应有新建内容 + 按钮');

  // 点击 + 按钮，直接进入手动创建
  await plusBtn.click();
  await page.getByRole('heading', { name: '手动创建营销内容' }).waitFor();
  assert.equal(await page.locator('.marketing-create-popover').count(), 0);

  // 验证手动创建时，产品与平台默认不选中
  const selectedProductPills = page.locator('.marketing-product-pill[aria-pressed="true"]');
  assert.equal(await selectedProductPills.count(), 0, '手动创建时所属产品应默认不选中');

  const channelSelect = page.getByRole('combobox', { name: '发布渠道', exact: true });
  assert.equal(await channelSelect.inputValue(), '', '手动创建时发布渠道应默认不选中');

  await page.getByRole('button', { name: '关闭营销编辑' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);

  // - 列表添加选择、全选、删除
  // 检查列表表头的全选 checkbox
  const selectAllCheckbox = page.getByRole('checkbox', { name: '全选' });
  assert.equal(await selectAllCheckbox.count(), 1);

  // 检查每行都有单独 checkbox
  const rowCheckboxes = page.locator('.marketing-table tbody input[type="checkbox"]');
  assert.equal(await rowCheckboxes.count(), 3);

  // 勾选单篇文章
  await rowCheckboxes.first().check();
  const batchBar = page.locator('.marketing-batch-bar');
  await batchBar.waitFor();
  assert.ok((await batchBar.textContent()).includes('已选择 1 篇文案'));

  // 全选
  await selectAllCheckbox.check();
  assert.ok((await batchBar.textContent()).includes('已选择 3 篇文案'));

  // 取消全选
  await batchBar.getByRole('button', { name: '取消选择' }).click();
  assert.equal(await batchBar.count(), 0);

  // 单篇删除测试：删除文章三号
  await page.locator('tr:has-text("文章三号") button[aria-label="删除文章三号"]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('tr:has-text("文章三号")').count(), 0);

  // 批量删除测试：勾选「文章二号」进行批量删除
  await page.locator('tr:has-text("文章二号") input[type="checkbox"]').check();
  await batchBar.waitFor();
  assert.ok((await batchBar.textContent()).includes('已选择 1 篇文案'));
  await batchBar.getByRole('button', { name: '批量删除' }).click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.marketing-table tbody tr').count(), 1);

  // 验证需求 1：详情页
  // 点击剩余的「文章一号」打开详情页
  await page.locator('.marketing-title:has-text("文章一号")').click();
  const editorDialog = page.locator('dialog.marketing-editor');
  await editorDialog.waitFor();

  // - 右上角：移除 草稿标识，X改为关闭
  const headerBadge = await editorDialog.locator('header .marketing-editor-actions .badge').count();
  assert.equal(headerBadge, 0, '详情页右上角不应有状态/草稿标识 badge');

  const closeButton = editorDialog.locator('header .marketing-editor-actions button:has-text("关闭")');
  assert.equal(await closeButton.count(), 1, '详情页右上角应有关闭按钮');
  assert.ok((await closeButton.getAttribute('class')).includes('secondary'));

  // AI 重写使用独立弹窗，复制的是针对当前记录的 MCP 更新提示词。
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value) => { window.rewriteClipboard = value; } },
    });
  });
  await editorDialog.getByRole('button', { name: 'AI 重写', exact: true }).click();
  const rewrite = page.getByRole('dialog', { name: 'AI 重写', exact: true });
  const rewriteContext = rewrite.getByRole('region', { name: '重写对象' });
  for (const label of ['文章一号', '小红书', '双十一预热', '主打全能体验']) {
    assert.equal(await rewriteContext.getByText(label, { exact: true }).isVisible(), true);
  }
  const copyRewrite = rewrite.getByRole('button', { name: '复制提示词' });
  assert.equal(await copyRewrite.isDisabled(), true);
  await rewrite.getByLabel('重写要求').fill('缩短开头，保留原有产品信息。');
  await page.setViewportSize({ width: 390, height: 844 });
  await rewrite.getByText('查看提示词', { exact: true }).click();
  const preview = rewrite.getByLabel('重写提示词');
  const previewPrompt = await preview.inputValue();
  assert.equal(await rewrite.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await copyRewrite.click();
  await rewrite.getByRole('status').getByText(/已复制/).waitFor();
  const copiedPrompt = await page.evaluate(() => window.rewriteClipboard);
  assert.equal(copiedPrompt, previewPrompt);
  assert.match(copiedPrompt, /"channel":"小红书","groupId":"cg1","group":\{"title":"双十一预热","direction":"主打全能体验"\}/);
  assert.match(copiedPrompt, /小红书：场景具体、首屏明确价值/);
  assert.doesNotMatch(copiedPrompt, /xAccounts|redditCommunities/);
  assert.match(copiedPrompt, /get_record.*collection: "contents".*id: "c1"/);
  assert.match(copiedPrompt, /save_contents.*expectedRevision/);
  assert.match(copiedPrompt, /缩短开头，保留原有产品信息。/);
  await page.keyboard.press('Escape');
  await rewrite.waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1440, height: 1100 });
  assert.equal(await editorDialog.isVisible(), true);

  // - 配图参考模块（顶部主编辑区与右侧栏）已彻底移除
  const topAssets = await editorDialog.locator('.marketing-recommended-assets').count();
  assert.equal(topAssets, 0, '顶部编辑区配图参考模块应已移除');

  const sidebarAssets = await editorDialog.locator('.sidebar-added-asset-item').count();
  assert.equal(sidebarAssets, 0, '右侧栏配图参考模块应已移除');

  const assetHeadings = await editorDialog.locator('h3:has-text("配图参考")').count();
  assert.equal(assetHeadings, 0, '不应再出现配图参考标题');

  // - 验证字数统计（标题与正文）
  const titleCounter = editorDialog.locator('.marketing-title-counter');
  assert.equal(await titleCounter.count(), 1, '标题输入框右上角应有标题字数统计');
  assert.ok((await titleCounter.textContent()).includes('4'), '标题「文章一号」为4字');

  const charCounts = editorDialog.locator('.marketing-char-counts');
  assert.equal(await charCounts.count(), 1, '写作工具栏应有字数统计区域');
  const charCountsText = await charCounts.textContent();
  assert.ok(charCountsText.includes('标题: 4'), '工具栏字数统计应显示标题字数');
  assert.ok(charCountsText.includes('正文: 15'), '工具栏字数统计应显示正文字数');

  // - 验证复制按钮：复制标题、复制正文
  const copyTitleBtn = editorDialog.locator('.marketing-copy-btn-group button:has-text("复制标题")');
  assert.equal(await copyTitleBtn.count(), 1);
  const copyBodyBtn = editorDialog.locator('.marketing-copy-btn-group button:has-text("复制正文")');
  assert.equal(await copyBodyBtn.count(), 1);

  // 验证标题下方、关联素材上方的封面图模块（包含封面显示、上传封面与制作封面）
  const coverModule = editorDialog.locator('.marketing-cover-module');
  assert.equal(await coverModule.count(), 1, '标题下方应有封面图模块');

  // 验证未设置封面时的徽章与展位图优化（避免全局 .empty 撑大徽章）
  const unsetBadge = coverModule.locator('.cover-module-badge.unset');
  assert.equal(await unsetBadge.count(), 1, '未设置封面时应显示 unset 徽章');
  assert.equal(await coverModule.locator('.cover-module-badge.empty').count(), 0, '不应使用全局 .empty 类名');

  const coverPlaceholder = coverModule.locator('.marketing-cover-placeholder');
  assert.equal(await coverPlaceholder.count(), 1, '未设置封面时应呈现优化的封面展位图');
  assert.ok((await coverPlaceholder.locator('.cover-placeholder-frame').textContent()).includes('3:4'), '展位图预览框应展示当前渠道推荐比例');
  assert.equal(await coverPlaceholder.locator('.cover-action-upload').count(), 1, '展位图应提供快速上传按钮');
  assert.equal(await coverPlaceholder.locator('.cover-action-ai').count(), 1, '展位图应提供快速AI制作按钮');

  const uploadCoverBtn = coverModule.locator('.cover-upload-btn');
  assert.equal(await uploadCoverBtn.count(), 1, '封面图模块顶部工具栏应有上传封面图按钮');

  // 验证关联素材批量操作栏与批量复制按钮
  const linkedBatchBar = editorDialog.locator('.marketing-linked-batchbar');
  assert.equal(await linkedBatchBar.count(), 1);
  const batchCopyBtn = editorDialog.locator('.batch-copy-btn');
  assert.equal(await batchCopyBtn.count(), 1, '关联素材批量操作栏应有批量复制按钮');

  // 验证从素材库添加：已添加的图片默认显示为已勾选，取消勾选保存后移出文章
  await editorDialog.getByRole('button', { name: '从素材库添加' }).click();
  const assetPicker = page.locator('.asset-picker-modal');
  await assetPicker.waitFor();

  // 验证已关联的配图A处于已勾选状态
  const linkedItemCheckbox = assetPicker.locator('.asset-picker-item:has-text("配图A.png") input[type="checkbox"]');
  assert.equal(await linkedItemCheckbox.isChecked(), true, '已经添加至文章的配图A在素材库弹窗中应显示为已勾选状态');

  // 取消勾选
  await linkedItemCheckbox.uncheck();
  assert.equal(await linkedItemCheckbox.isChecked(), false, '取消勾选后应处于未勾选状态');

  // 点击保存选择
  const saveSelectionBtn = assetPicker.getByRole('button', { name: '保存选择' });
  await saveSelectionBtn.click();
  await assetPicker.waitFor({ state: 'detached' });

  // 验证配图A已从当前文章移出
  assert.equal(await editorDialog.locator('.linked-asset-card:has-text("配图A.png")').count(), 0, '取消勾选保存后，该照片应被移出文章');

  // - 验证封面图模块中的制作封面图按钮与弹窗（含背景遮罩与可选尺寸）
  const createCoverBtn = coverModule.locator('.cover-btn');
  assert.equal(await createCoverBtn.count(), 1, '封面图模块应有制作封面图按钮');
  await createCoverBtn.click();

  // 验证弹窗遮罩背景
  const coverBackdrop = page.locator('.marketing-cover-backdrop');
  await coverBackdrop.waitFor();
  assert.equal(await coverBackdrop.count(), 1, '弹窗应有背景遮罩层');

  const coverModal = page.locator('.marketing-cover-modal');
  assert.ok((await coverModal.textContent()).includes('制作封面图'));
  assert.ok((await coverModal.textContent()).includes('小红书'));

  // 验证尺寸选择器（多尺寸可选）
  const sizeButtons = coverModal.locator('.cover-size-btn');
  assert.ok((await sizeButtons.count()) >= 4, '应提供多种可选尺寸（如横图、竖图、公众号首图等）');

  // 默认小红书预选 3:4 竖图
  assert.ok((await coverModal.locator('.cover-size-btn.selected').textContent()).includes('3:4'));

  // 切换为横图 16:9
  const landscapeBtn = coverModal.locator('.cover-size-btn:has-text("横图 16:9")');
  await landscapeBtn.click();
  assert.ok((await landscapeBtn.getAttribute('class')).includes('selected'), '点击后应切换为所选横图规格');

  // 输入设计备注
  const notesTextarea = coverModal.locator('#cover-notes-input');
  await notesTextarea.fill('突出限免优惠与暗黑风格');

  // 验证提示词预览包含备注与MCP指令，但不写死logo图片数据
  const previewBox = coverModal.locator('.cover-prompt-preview-box pre');
  const previewText = await previewBox.textContent();
  assert.ok(previewText.includes('突出限免优惠与暗黑风格'));
  assert.ok(previewText.includes('16:9'), '提示词应动态更新为所选 16:9 比例');
  assert.ok(previewText.includes('upload_asset'));
  assert.ok(previewText.includes('list_records'));
  assert.ok(previewText.includes('get_record'));
  assert.equal(previewText.includes('data:image'), false, '提示词中不应硬编码logo/图片原始数据');

  // 复制提示词
  const copyPromptBtn = coverModal.locator('.cover-copy-btn');
  await copyPromptBtn.click();
  await page.waitForTimeout(200);
  assert.ok((await copyPromptBtn.textContent()).includes('已复制'));

  // 关闭封面图弹窗
  await coverModal.locator('button:has-text("关闭")').click();
  await coverBackdrop.waitFor({ state: 'detached' });

  // 点击关闭按钮关闭详情页
  await closeButton.click();
  assert.equal(await editorDialog.count(), 0);

  // 验证需求：营销内容组支持编辑
  const editGroupBtn = page.locator('.content-group-header-actions button[title="编辑内容组"]');
  assert.equal(await editGroupBtn.count(), 1, '内容组卡片头部应有编辑按钮');
  await editGroupBtn.click();

  const groupEditDialog = page.locator('dialog.marketing-group-dialog');
  await groupEditDialog.waitFor();
  assert.equal(await groupEditDialog.locator('#group-dialog-title').textContent(), '编辑营销内容组');
  assert.equal(await groupEditDialog.getByLabel('内容组标题').inputValue(), '双十一预热');
  assert.equal(await groupEditDialog.getByLabel('具体内容方向').inputValue(), '主打全能体验');

  // 修改标题与方向
  await groupEditDialog.getByLabel('内容组标题').fill('双十一大促升级版');
  await groupEditDialog.getByLabel('具体内容方向').fill('主打极致性价比与全面功能体验');
  await groupEditDialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await groupEditDialog.waitFor({ state: 'detached' });

  // 验证卡片标题更新
  assert.equal(await page.locator('.content-group-title').textContent(), '双十一大促升级版');
  assert.ok((await page.locator('.content-group-direction').textContent()).includes('主打极致性价比'));

  // 验证从提示词弹窗也可进入编辑
  await page.locator('.group-action-buttons button:has-text("提示词")').click();
  const promptDialog = page.locator('dialog.marketing-group-dialog');
  await promptDialog.waitFor();
  assert.ok((await promptDialog.textContent()).includes('双十一大促升级版'));
  const promptEditBtn = promptDialog.getByRole('button', { name: '编辑内容组' });
  assert.equal(await promptEditBtn.count(), 1);
  await promptEditBtn.click();
  await groupEditDialog.waitFor();
  assert.equal(await groupEditDialog.locator('#group-dialog-title').textContent(), '编辑营销内容组');
  await groupEditDialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await groupEditDialog.count(), 0);

  assert.deepEqual(errors, []);
  console.log('PASS: marketing UI refinement (batch delete, + button dropdown, removed scope/actions, editor header & asset selector removal, content group edit)');
} finally {
  if (browser) await browser.close();
  child.kill();
  await new Promise((r) => {
    if (child.exitCode !== null) r();
    else child.once('exit', r);
  });
  rmSync(dir, { recursive: true, force: true });
}
