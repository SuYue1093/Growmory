import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const dir = mkdtempSync(join(tmpdir(), 'growmory-aso-ui-'));
const server = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: '5198', DB_PATH: join(dir, 'db.sqlite'), ASO_LAB_DIR: join(dir, 'aso-lab') },
  stdio: 'pipe',
});
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('启动超时')), 10000); server.stdout.on('data', b => { if (String(b).includes('Growmory')) { clearTimeout(timer); resolve(); } }); });
  const base = 'http://127.0.0.1:5198';
  const state = await fetch(base + '/api/state').then(r => r.json());
  state.data.products.push({ id: 'shiye', name: '拾页', summary: '', appId: '123', price: '', platform: 'IOS', website: '', color: 'blue' });
  state.data.products.find(p => p.id === 'shiye').appStore = { appId: '123', name: '拾页', bundleId: 'com.test', syncedAt: new Date().toISOString(), versions: [] };
  assert.equal((await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })).status, 200);
  browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
  const fields = { name: '拾页', subtitle: '阅读记录', keywords: '阅读,摘录', description: '记录阅读与摘录。', promotionalText: '' };
  await page.route('**/api/app-store-connect/insights/**', route => route.fulfill({
    json: {
      appId: '123', checkedAt: new Date().toISOString(),
      trends: { status: 'ready', rows: [], coverage: {} }, aso: {
        status: 'ready', syncedAt: new Date().toISOString(), localizations: [
          { platform: 'IOS', versionId: 'v', version: '2.0', locale: 'zh-Hans', fields },
          { platform: 'IOS', versionId: 'v', version: '2.0', locale: 'en-US', fields: { ...fields, name: 'Shiye', subtitle: '', keywords: 'read,read' } },
          { platform: 'MAC_OS', versionId: 'mac', version: '1.0', locale: 'zh-Hans', fields },
        ]
      }
    }
  }));
  let executions = 0, liveReads = 0, failCurrent = false;
  let liveVersion = false;
  let pendingPlans = [], lastPreviewPlan;
  let remoteFields = fields;
  await page.route('**/api/app-store-connect/aso/**', async route => {
    const action = route.request().url().split('/').at(-1);
    if (action === 'current') {
      liveReads++;
      if (failCurrent) { await route.fulfill({ status: 502, json: { error: '模拟 Apple 读取失败' } }); return; }
      const { platform, versionId } = route.request().postDataJSON();
      const locales = platform === 'IOS' ? ['zh-Hans', 'en-US'] : ['zh-Hans'];
      await route.fulfill({ json: { status: 'ready', syncedAt: new Date().toISOString(), localizations: locales.map(locale => ({ platform, versionId, version: '2.0', infoId: 'i', locale, fields: { ...fields, ...(locale === 'en-US' ? { name: 'Shiye', subtitle: '', keywords: 'read,read' } : {}), promotionalText: `实时文案 ${liveReads}` } })) } });
      return;
    }
    if (action === 'reports') {
      return route.fulfill({ json: [{ id: 'r1', title: 'ASO 测试报告', summary: '分析摘要', content: '## 转化建议', createdAt: '2026-11-09T00:00:00Z',
        plans: [{ title: '文案建议', target: { versionId: 'v', infoId: 'i', locale: 'zh-Hans' }, fields }] }] });
    }
    if (action === 'apply-report') {
      assert.deepEqual(route.request().postDataJSON(), { reportId: 'r1' });
      return route.fulfill({ json: { count: 1 } });
    }
    const results = {
      research: { appId: '123', revision: 0, keywords: [], competitors: [], plans: pendingPlans },
      'save-plan': { workspace: { revision: 1, plans: [] }, planId: 'mock-plan' },
      targets: { versions: [{ id: 'v', versionString: '2.0', platform: 'IOS', appStoreState: 'PREPARE_FOR_SUBMISSION' }, { id: 'mac', versionString: '1.0', platform: 'MAC_OS' }], infos: [{ id: 'i', state: 'PREPARE_FOR_SUBMISSION' }] },
      read: { fields: remoteFields, token: 'read', versionState: liveVersion ? 'READY_FOR_SALE' : 'PREPARE_FOR_SUBMISSION', infoState: 'PREPARE_FOR_SUBMISSION', ...(liveVersion ? { editableFields: ['promotionalText'] } : {}) },
      analyze: { analysis: '突出阅读价值，减少重复词。', fields: { ...fields, subtitle: '留住阅读收获' } },
      preview: { token: 'preview', changes: [{ field: 'subtitle', before: fields.subtitle, after: '留住阅读收获' }] }, history: [], execute: { success: true },
    };
    if (action === 'read') await new Promise(resolve => setTimeout(resolve, 150));
    if (action === 'preview') lastPreviewPlan = route.request().postDataJSON().planId;
    if (action === 'execute') { executions++; if (lastPreviewPlan) pendingPlans = pendingPlans.map(p => p.id === lastPreviewPlan ? { ...p, status: 'applied' } : p); }
    await route.fulfill({ json: results[action] });
  });
  await page.goto(base + '/#page=products&product=shiye&tab=aso');
  const sample = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
  const locales = ['zh-Hans', 'en-GB'];
  const portraitSample = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 124;
    canvas.height = 268;
    return canvas.toDataURL();
  });
  const screenshots = ['A', 'B'].map(id => ({ id, name: id, url: portraitSample, type: 'APP_SCREENSHOT', group: 'IPHONE_FACE_ID_LARGE_PROFILE' }));
  const header = { id: 'header', name: '中文标题图', url: sample, type: 'PRODUCT_PAGE_HEADER_ASSET', group: 'DEFAULT_PROFILE', width: 3840, height: 1646 };
  let releaseVersions;
  const versionsReady = new Promise(resolve => { releaseVersions = resolve; });
  await page.route('**/api/aso/media/shiye/versions', async route => {
    await versionsReady;
    return route.fulfill({
      json: { versions: [{ id: 'v', platform: 'IOS', version: '2.0', state: 'PREPARE_FOR_SUBMISSION' }, { id: 'mac-media', platform: 'MAC_OS', version: '3.1', state: 'READY_FOR_DISTRIBUTION' }], primaryLocale: 'zh-Hans' },
    });
  });
  const drafts = { 'en-GB': [{ type: 'APP_SCREENSHOT', group: 'IPAD_13_PROFILE', items: [{ name: 'agent.png', data: sample }] }] };
  await page.route('**/api/aso/media/shiye/localized?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const locale = params.get('locale');
    const mac = params.get('versionId') === 'mac-media';
    const availableLocales = mac ? ['zh-Hans'] : locales;
    const assets = mac ? [{ ...screenshots[0], name: 'Mac 截图', group: 'MAC_PROFILE' }] : locale === 'zh-Hans' ? [header] : screenshots;
    return route.fulfill({ json: locale ? { locales: availableLocales, locale, revision: 'r1', editable: !mac, assets, draftGroups: mac ? [] : drafts[locale], promotionalText: mac ? 'Mac 推广文本' : 'iOS 推广文本', description: (mac ? 'Mac 应用描述。' : '这段介绍用于验证详情页可滚动。').repeat(60) } : { locales: availableLocales } });
  });
  await page.route('**/api/aso/media/shiye/draft', route => {
    const { versionId, locale, type, group, items } = route.request().postDataJSON();
    assert.equal(versionId, 'v');
    const groups = drafts[locale] ||= [];
    drafts[locale] = [...groups.filter(entry => entry.type !== type || entry.group !== group), { type, group, items }];
    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/aso/media/shiye/submit-media', route => {
    const input = route.request().postDataJSON();
    assert.deepEqual({ ...input, changes: undefined }, { versionId: 'v', locale: 'en-GB', revision: 'r1', changes: undefined });
    assert.equal(input.changes[0].group, 'IPHONE_FACE_ID_LARGE_PROFILE');
    assert.deepEqual(input.changes[0].items.map(item => item.id || item.name), ['B', 'new.jpg']);
    assert.equal(input.changes[1].group, 'IPAD_13_PROFILE');
    assert.equal(input.changes[1].items[0].name, 'agent.png');
    return route.fulfill({ json: { locales, locale: 'en-GB', revision: 'r2', editable: true, assets: [screenshots[1], { ...screenshots[0], id: 'new', name: 'new.jpg' }] } });
  });
  await page.getByRole('button', { name: 'ASO图片', exact: true }).click();
  const workspace = page.locator('.aso-store-media');
  const readButton = workspace.getByRole('button', { name: '读取', exact: true });
  const filterGeometry = () => workspace.locator('.aso-media-targets select').evaluateAll(items => items.map(item => {
    const { x, y, width, height } = item.getBoundingClientRect();
    return { x, y, width, height };
  }));
  await workspace.getByRole('status').waitFor();
  const whileLoading = await filterGeometry();
  assert.equal(whileLoading.length, 3);
  releaseVersions();
  await workspace.getByRole('option', { name: /准备提交/ }).waitFor({ state: 'attached' });
  await workspace.getByLabel('本地化语言').getByRole('option', { name: /en-GB/ }).waitFor({ state: 'attached' });
  assert.equal(await workspace.locator('.aso-preview-phone').count(), 0);
  const beforeRead = await filterGeometry();
  assert.deepEqual(beforeRead, whileLoading);
  await readButton.click();
  await workspace.locator('figure').getByRole('img', { name: '中文标题图' }).waitFor();
  assert.equal(await workspace.locator('.aso-preview-phone').count(), 4);
  assert.deepEqual(await filterGeometry(), beforeRead);
  assert.equal(await workspace.getByRole('link', { name: '打开高清素材' }).getAttribute('href'), sample);
  assert.deepEqual(await workspace.locator('figcaption').allTextContents(), ['3840 × 1646']);
  assert.ok(await workspace.locator('.aso-phone-hero-artwork').first().evaluate(img => img.offsetHeight < img.parentElement.offsetHeight));
  const detail = workspace.getByRole('region', { name: '详情页预览内容' }).first();
  assert.deepEqual((await detail.locator('.aso-preview-copy p').allTextContents()).map(text => text.slice(0, 10)), ['iOS 推广文本', '这段介绍用于验证详情']);
  assert.equal(await workspace.locator('.aso-media-gallery').getByText('iOS 推广文本', { exact: true }).count(), 0);
  const more = detail.getByRole('button', { name: '更多', exact: true });
  await more.click();
  assert.equal(await detail.getByRole('button', { name: '收起', exact: true }).getAttribute('aria-expanded'), 'true');
  await detail.getByRole('button', { name: '收起', exact: true }).click();
  await detail.press('End');
  await page.waitForFunction(() => document.querySelector('.aso-preview-detail .aso-phone-scroll').scrollTop > 0);
  assert.equal(await workspace.locator('.aso-preview-detail .aso-phone-navbar').count(), 2);
  const uploadImage = await page.evaluate(() => document.createElement('canvas').toDataURL('image/png'));
  await workspace.getByLabel('标题图片 · 上传图片').setInputFiles({
    name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(uploadImage.split(',')[1], 'base64'),
  });
  const replacement = workspace.locator('figure img[alt="cover.jpg"]');
  await replacement.waitFor();
  assert.equal(await workspace.locator('figure img[alt="中文标题图"]').count(), 0);
  assert.deepEqual(await replacement.evaluate(async img => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }), [3840, 1646]);
  await readButton.click();
  await replacement.waitFor();
  assert.equal(await workspace.getByRole('region', { name: '编辑前', exact: true }).getByRole('img', { name: '中文标题图' }).count(), 1);
  await workspace.getByLabel('平台', { exact: true }).selectOption('MAC_OS');
  assert.equal(await workspace.locator('.aso-preview-phone').count(), 0);
  assert.equal(await workspace.getByLabel('版本', { exact: true }).inputValue(), 'mac-media');
  assert.deepEqual(await workspace.getByLabel('版本', { exact: true }).locator('option').allTextContents(), ['3.1 · 已上架']);
  await readButton.click();
  await workspace.locator('figure').getByRole('img', { name: 'Mac 截图' }).waitFor();
  assert.equal(await workspace.locator('.aso-preview-desktop').count(), 2);
  assert.equal(await workspace.getByRole('heading', { name: '搜索结果预览' }).count(), 0);
  assert.equal(await workspace.getByRole('heading', { name: '标题图片' }).count(), 0);
  const macPreview = await workspace.locator('.aso-preview-desktop').first().boundingBox();
  const macRow = await workspace.locator('.aso-media-preview-row-mac').boundingBox();
  assert.ok(macPreview.width < macRow.width / 2);
  assert.equal(await workspace.locator('.aso-preview-copy p').first().textContent(), 'Mac 推广文本');
  assert.equal(await workspace.locator('.aso-phone-island').count(), 0);
  await workspace.getByLabel('平台', { exact: true }).selectOption('IOS');
  await workspace.getByLabel('本地化语言').selectOption('en-GB');
  assert.equal(await workspace.locator('.aso-preview-phone').count(), 0);
  await readButton.click();
  await workspace.getByLabel('设备规格').waitFor();
  await workspace.getByLabel('设备规格').selectOption('IPAD_13_PROFILE');
  await workspace.getByRole('button', { name: '移除 agent.png', exact: true }).waitFor();
  await workspace.getByLabel('设备规格').selectOption('IPHONE_FACE_ID_LARGE_PROFILE');
  assert.deepEqual(await workspace.getByLabel('设备规格').locator('option').allTextContents(), ['iPhone', 'iPad']);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sourceImage = workspace.locator('figure[data-aso-asset="A"] img');
  const targetImage = workspace.locator('figure[data-aso-asset="B"] img');
  await sourceImage.scrollIntoViewIfNeeded();
  const from = await sourceImage.boundingBox();
  const to = await targetImage.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width * 0.75, to.y + to.height / 2, { steps: 12 });
  await workspace.locator('.aso-drag-preview').waitFor();
  await workspace.locator('figure[data-aso-asset="B"]:first-child').waitFor();
  assert.equal(drafts['en-GB'].length, 1, '拖动中尚未写入草稿');
  const savingDrag = page.waitForResponse(response => response.url().endsWith('/draft') && response.request().method() === 'POST');
  await page.mouse.up();
  assert.ok((await savingDrag).ok());
  await workspace.locator('.aso-drag-preview').waitFor({ state: 'detached' });
  assert.deepEqual(drafts['en-GB'].find(group => group.group === 'IPHONE_FACE_ID_LARGE_PROFILE').items, [{ id: 'B' }, { id: 'A' }]);
  await workspace.getByRole('button', { name: '移除 A' }).click();
  await workspace.locator('figure[data-aso-asset="A"]').waitFor({ state: 'detached' });
  await workspace.getByLabel('App 截图 · 上传图片').setInputFiles({
    name: 'new.png', mimeType: 'image/png', buffer: Buffer.from(uploadImage.split(',')[1], 'base64'),
  });
  await workspace.getByRole('button', { name: '移除 new.jpg', exact: true }).waitFor();
  assert.deepEqual(await workspace.locator('figure img[alt="new.jpg"]').evaluate(async img => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }), [1242, 2688]);
  await workspace.getByRole('button', { name: '提交至商店' }).click();
  await workspace.getByRole('button', { name: '提交至商店' }).waitFor();
  await workspace.locator('figure img[alt="new.jpg"]').waitFor();
  assert.deepEqual(await workspace.locator('figure img').evaluateAll(items => items.map(item => item.alt)), ['B', 'new.jpg']);
  assert.equal(await workspace.getByRole('button', { name: '载入 Agent 草稿' }).count(), 0);
  assert.equal(await page.getByText('本地图片草稿与 Agent 分析', { exact: true }).count(), 0);
  assert.equal(await workspace.getByRole('button', { name: '复制 Agent 分析指令' }).count(), 0);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `ASO 图片布局溢出 ${width}`);
    const comparison = workspace.locator('.aso-media-comparison').last();
    const [before, after] = await comparison.locator(':scope > section').evaluateAll(items =>
      items.map(item => ({ x: item.offsetLeft, y: item.offsetTop })));
    if (width === 1440) assert.ok(after.x > before.x && after.y === before.y);
    else assert.ok(after.y > before.y && after.x === before.x);

  }
  console.log('通过：ASO 图片预览及保存和 1440/390/320px 布局（模拟商店数据）');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'ASO 分析与优化', exact: true }).click();
  await page.getByRole('button', { name: '查看报告' }).click();
  await page.getByRole('heading', { name: '转化建议' }).waitFor();
  await page.getByRole('button', { name: 'Agent生成图片', exact: true }).click();
  const mediaDialog = page.getByRole('dialog', { name: 'Agent生成图片' });
  const mediaPromptField = mediaDialog.getByLabel('图片生成提示词');
  assert.doesNotMatch(await mediaPromptField.inputValue(), /"artDirection":/);
  await mediaDialog.getByLabel('画面方向（可选）').fill('暖调纸书与晨光');
  const mediaPrompt = await mediaPromptField.inputValue();
  assert.match(mediaPrompt, /"artDirection":"暖调纸书与晨光"/);
  assert.match(mediaPrompt, /save_aso_media_draft/);
  assert.match(mediaPrompt, /"versionId":"v"/);
  assert.match(mediaPrompt, /"reportId":"r1"/);
  assert.match(mediaPrompt, /get_aso_context/);
  assert.match(mediaPrompt, /高转化率的 App Store 上架图（APP_SCREENSHOT）/);
  assert.match(mediaPrompt, /两种不同构图思路的首屏方案/);
  assert.match(mediaPrompt, /纯氛围背景底图/);
  assert.match(mediaPrompt, /摆脱模板束缚/);
  assert.match(mediaPrompt, /list_aso_design_resources/);
  assert.match(mediaPrompt, /renderer\.deviceModelCommand.*--trim/);
  assert.match(mediaPrompt, /renderer\.htmlCommand/);
  assert.match(mediaPrompt, /renderer\.studio/);
  assert.match(mediaPrompt, /160px 缩略图/);
  assert.match(mediaPrompt, /首轮方案经用户确认后/);
  assert.match(mediaPrompt, /type: "APP_SCREENSHOT"/);
  assert.doesNotMatch(mediaPrompt, /分析摘要/);
  assert.doesNotMatch(mediaPrompt, /搜索结果图|标题图|3840 × 2560|3840 × 1646/);
  assert.match(mediaPrompt, /1242 × 2688.*IPHONE_FACE_ID_LARGE_PROFILE.*iphone-6-5/);
  assert.match(mediaPrompt, /2064 × 2752.*IPAD_13_PROFILE.*ipad-pro-13/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await mediaDialog.getByRole('button', { name: '复制提示词' }).click();
  await page.getByText('已复制图片生成提示词', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), mediaPrompt);
  assert.equal(await mediaDialog.getByRole('checkbox', { name: /^Mac/ }).count(), 0);
  await mediaDialog.getByRole('checkbox', { name: /^iPhone/ }).uncheck();
  const ipadPrompt = await mediaPromptField.inputValue();
  assert.match(ipadPrompt, /"devices":\["iPad"\]/);
  assert.match(ipadPrompt, /2064 × 2752/);
  assert.doesNotMatch(ipadPrompt, /1242 × 2688|IPHONE_FACE_ID_LARGE_PROFILE|iphone-6-5/);
  await mediaDialog.getByRole('checkbox', { name: /^iPad/ }).uncheck();
  assert.equal(await mediaDialog.getByRole('button', { name: '复制提示词' }).isDisabled(), true);

  await mediaDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: 'Switch to English', exact: true }).click();
  await page.getByRole('button', { name: 'Generate Images with Agent', exact: true }).click();
  const englishDialog = page.getByRole('dialog', { name: 'Generate Images with Agent' });
  const englishPrompt = await englishDialog.getByLabel('Image generation prompt').inputValue();
  assert.match(englishPrompt, /product-page screenshots \(APP_SCREENSHOT\)/);
  assert.match(englishPrompt, /Compare two distinct hero directions for the lead visual/i);
  assert.match(englishPrompt, /160px thumbnail/);
  assert.match(englishPrompt, /pure atmospheric background plates/);
  assert.match(englishPrompt, /without fixed layout or material templates/i);
  assert.match(englishPrompt, /target storefront locale/);
  assert.match(englishPrompt, /renderer\.htmlCommand/);
  assert.doesNotMatch(englishPrompt, /search-results image|product-page header|3840/);
  await englishDialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: '切换为中文', exact: true }).click();

  await page.getByRole('button', { name: /应用ASO文案方案|应用方案为草稿/ }).click();
  await page.getByRole('button', { name: '方案已应用' }).waitFor();
  await page.getByRole('button', { name: 'ASO文案', exact: true }).click();
  await page.getByRole('heading', { name: 'ASO文案', exact: true }).waitFor();
  for (const name of ['关键词分析', '竞品分析', '优化方案与复盘', '复制分析提示词', '刷新结果']) {
    assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
  }

  await page.getByLabel('现状平台', { exact: true }).waitFor();
  assert.equal(await page.locator('.aso-status-table').count(), 0);
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.locator('.aso-status-table').waitFor();
  assert.equal(await page.locator('.aso-status-table thead th').count(), 3);
  assert.equal(await page.locator('.aso-status-table tbody tr').count(), 6);
  assert.equal(liveReads, 1);
  await page.getByText('实时文案 1', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.getByText('实时文案 2', { exact: true }).first().waitFor();
  assert.equal(liveReads, 2);
  failCurrent = true;
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '模拟 Apple 读取失败' }).first().waitFor();
  assert.equal(await page.locator('.aso-status-table').count(), 0);
  failCurrent = false;
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.locator('.aso-status-table').waitFor();

  assert.ok(await page.locator('.aso-status-table').textContent().then(t => t.includes('关键词字段有重复词') && t.includes('副标题为空')));
  assert.equal(await page.locator('.aso-check-highlight').count(), 2);
  for (const selector of ['.aso-status-table thead th', '.aso-cell-copy']) {
    assert.equal(await page.locator(selector).first().evaluate(el => getComputedStyle(el).color), 'rgb(23, 37, 84)');
  }
  assert.equal(await page.locator('.aso-check-highlight').first().evaluate(el => getComputedStyle(el).color), 'rgb(130, 54, 0)');

  // 读取后默认已进入编辑模式
  await page.getByLabel('zh-Hans 名称', { exact: true }).waitFor();
  assert.equal(await page.locator('.aso-cell-input').count(), 10);
  assert.equal(await page.locator('.aso-draft-before').count(), 10);
  assert.equal(await page.locator('.aso-draft-before .aso-cell-copy').first().textContent(), fields.name);
  assert.equal(await page.getByRole('button', { name: '提交至商店', exact: true }).isDisabled(), true);
  // 无本地草稿时，重置并移除草稿按钮应禁用
  assert.equal(await page.getByRole('button', { name: '重置并移除草稿', exact: true }).isDisabled(), true);
  await page.getByLabel('zh-Hans 名称', { exact: true }).fill('临时修改');
  // 有修改后，重置并移除草稿按钮应可用
  assert.equal(await page.getByRole('button', { name: '重置并移除草稿', exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('.aso-cell-input').count(), 0);
  assert.equal(executions, 0);
  // 取消后处于非编辑模式，重置并移除草稿按钮不显示
  assert.equal(await page.getByRole('button', { name: '重置并移除草稿', exact: true }).count(), 0);
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('zh-Hans 名称', { exact: true }).fill('a'.repeat(31));
  assert.equal(await page.getByRole('button', { name: '提交至商店', exact: true }).isDisabled(), true);
  await page.getByLabel('zh-Hans 名称', { exact: true }).fill('拾页新版');
  await page.getByLabel('en-US 名称', { exact: true }).fill('Shiye Updated');
  await page.getByRole('button', { name: '提交至商店', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(executions, 2);
  assert.ok(await page.locator('.aso-status-table').textContent().then(t => t.includes('拾页新版') && t.includes('Shiye Updated')));
  await page.getByLabel('现状平台', { exact: true }).selectOption('MAC_OS');
  assert.equal(await page.locator('.aso-status-table').count(), 0);
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.locator('.aso-status-table').waitFor();
  assert.equal(await page.locator('.aso-status-table thead th').count(), 2);
  assert.equal(await page.getByRole('button', { name: '读取商店版本与 App 信息' }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '读取 / 重新读取商店原文' }).count(), 0);
  liveVersion = true;
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('zh-Hans 名称', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('zh-Hans 名称', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('zh-Hans 关键词', { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('zh-Hans 推广文本', { exact: true }).isEnabled(), true);
  await page.getByRole('button', { name: '取消', exact: true }).click();

  liveVersion = false;
  pendingPlans = [{ id: 'mcp-plan', origin: 'mcp', status: 'draft', title: '外部 AI 回填', createdAt: new Date().toISOString(), analysis: '突出真实场景', target: { versionId: 'mac', infoId: 'i', locale: 'zh-Hans' }, before: fields, fields: { ...fields, subtitle: '回填副标题' } }];
  assert.equal(await page.locator('.aso-mcp-drafts').count(), 0);
  assert.equal(await page.getByRole('button', { name: '刷新 MCP 回填', exact: true }).count(), 0);
  const writesBeforeLoad = executions;
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('zh-Hans 副标题', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('zh-Hans 副标题', { exact: true }).inputValue(), '回填副标题');
  assert.equal(executions, writesBeforeLoad);
  assert.equal(await page.locator('.aso-draft-changed').count(), 1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(executions, writesBeforeLoad);
  remoteFields = { ...fields, subtitle: '原文已变化' };
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.locator('.aso-draft-conflict-notice, [role="status"]').filter({ hasText: '商店原文已变化' }).first().waitFor();
  await page.getByLabel('zh-Hans 副标题', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('zh-Hans 副标题', { exact: true }).inputValue(), '原文已变化');
  await page.getByRole('button', { name: '取消', exact: true }).click();
  remoteFields = fields;
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('zh-Hans 副标题', { exact: true }).waitFor();
  await page.getByRole('button', { name: '提交至商店', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(executions, writesBeforeLoad + 1);
  assert.equal(lastPreviewPlan, 'mcp-plan');
  assert.equal(pendingPlans[0].status, 'applied');
  await page.getByLabel('现状平台', { exact: true }).selectOption('IOS');
  await page.getByRole('button', { name: '读取', exact: true }).click();
  await page.locator('.aso-status-table').waitFor();
  pendingPlans = ['zh-Hans', 'en-US'].map((locale, i) => ({ id: `multi-${i}`, origin: 'mcp', status: 'draft', title: '多语言回填', target: { versionId: 'v', infoId: 'i', locale }, before: fields, fields: { ...fields, subtitle: `多语言回填 ${locale}` } }));
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('zh-Hans 副标题', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('zh-Hans 副标题', { exact: true }).inputValue(), '多语言回填 zh-Hans');
  assert.equal(await page.getByLabel('en-US 副标题', { exact: true }).inputValue(), '多语言回填 en-US');
  assert.equal(executions, writesBeforeLoad + 1);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  for (const width of [1440, 390, 320]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `溢出 ${width}`); }
  console.log('通过：ASO 多语言表格、平台切换、旧读取模块移除和 1440/390/320px 布局（模拟商店数据）');
} finally { await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true }); }
