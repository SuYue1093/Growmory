import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
const dir = mkdtempSync(join(tmpdir(), 'growmory-aso-ui-'));
const appleFixture = join(dir, 'apple-fixture.mjs');
writeFileSync(join(dir, 'app-store-connect.json'), JSON.stringify({
  issuerId: '11111111-1111-1111-1111-111111111111', keyId: 'TESTKEY123',
  privateKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' } }).privateKey,
}));
writeFileSync(appleFixture, `
  const originalFetch = globalThis.fetch;
  let copyRequests = 0;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    if (url.hostname === 'dashscope.aliyuncs.com') {
      const request = JSON.parse(init.body);
      const { fields, targetLocale, targetLanguage } = JSON.parse(request.messages.at(-1).content);
      if (url.pathname !== '/compatible-mode/v1/chat/completions' || request.model !== 'deepseek-v4.1-flash' ||
          request.enable_thinking !== false || targetLocale !== 'ja' || targetLanguage !== 'Japanese' ||
          fields[0][1] !== '突出深度阅读' ||
          fields.map(([key]) => key).join(',') !== 'goal,direction,title,headline,capture,title,headline,layout,capture') {
        return Promise.resolve(Response.json({ error: 'Unexpected artwork translation request' }, { status: 400 }));
      }
      const translations = [
        '深く読む楽しさを伝える', '余白を生かし、読書画面を中心に配置。',
        '読書と抜粋', '読んだ言葉を手元に', '日本語の読書画面に、書名と抜粋を表示。',
        '読み返す', '心に残った言葉に再会', 'カードを大きく配置。', '日本語の読み返し画面に、過去の抜粋を表示。',
      ];
      if (++copyRequests === 1) translations.pop();
      return Promise.resolve(Response.json({ choices: [{ message: { content: JSON.stringify({ translations }) } }] }));
    }
    if (url.hostname !== 'api.appstoreconnect.apple.com') return originalFetch(input, init);
    const version = { id: 'demo-v', attributes: { versionString: '2.7.0', platform: 'IOS', appStoreState: 'PREPARE_FOR_SUBMISSION' }, relationships: { app: { data: { id: '123' } } } };
    const reply = {
      '/v1/apps/123': { data: { attributes: { primaryLocale: 'en-US' } } },
      '/v1/apps/123/appStoreVersions': { data: [version, { id: 'demo-mac', attributes: { versionString: '1.0', platform: 'MAC_OS' } }] },
      '/v1/appStoreVersions/demo-v': { data: version },
      '/v1/appStoreVersions/demo-v/appStoreVersionLocalizations': { data: [{ id: 'demo-locale', attributes: { locale: 'en-US' } }] },
      '/v1/appStoreVersionLocalizations/demo-locale/placements': { data: [
        { id: 'store-duo', attributes: { placementType: 'APP_SCREENSHOT', placementGroup: 'IPHONE_DUO_PROFILE' } },
        { id: 'store-ipad', attributes: { placementType: 'APP_SCREENSHOT', placementGroup: 'IPAD_13_PROFILE' } },
      ] },
    }[url.pathname];
    if (init?.method !== 'GET' || !reply) return Promise.resolve(Response.json({}, { status: 404 }));
    return Promise.resolve(Response.json(reply));
  };
`);
const server = spawn(process.execPath, ['--import', appleFixture, 'server/index.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PORT: '5198', DB_PATH: join(dir, 'db.sqlite'), ASC_CONFIG_PATH: join(dir, 'app-store-connect.json'), MCP_CONFIG_PATH: join(dir, 'mcp-access.json'),
    AI_CONFIG_PATH: join(dir, 'ai-config.json'), AI_USAGE_PATH: ':memory:', AI_API_KEY: 'fixture-key',
    AI_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', AI_MODEL: 'deepseek-v4.1-flash' },
  stdio: 'pipe',
});
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('启动超时')), 10000); server.stdout.on('data', b => { if (String(b).includes('Growmory')) { clearTimeout(timer); resolve(); } }); });
  const base = 'http://127.0.0.1:5198';
  const state = await fetch(base + '/api/state').then(r => r.json());
  state.data.products.push({ id: 'shiye', name: '拾页', summary: '', appId: '123', price: '', platform: 'IOS', website: '', color: 'blue', icon: '/icons/shiye.jpg' });
  state.data.products.find(p => p.id === 'shiye').appStore = { appId: '123', name: '拾页', bundleId: 'com.test', syncedAt: new Date().toISOString(), versions: [] };
  browser = await chromium.launch({ channel: 'chrome', headless: true }); const page = await browser.newPage();
  const libraryJpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = '#343a35';
    ctx.font = '30px system-ui';
    ctx.fillText('Rediscover a favorite idea', 24, 90);
    return canvas.toDataURL('image/jpeg');
  });
  state.data.assets.push({
    id: 'aso-library-shot', name: '回响示例截图', fileName: 'echo-library.jpg', fileType: 'image/jpeg',
    url: libraryJpeg, productId: 'shiye', width: 480, height: 640,
    fileSize: Buffer.from(libraryJpeg.split(',')[1], 'base64').length, languages: ['en-US'],
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });
  const bezelData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=';
  const bezelName = 'iPhone Duo - Star White - Outer Closed Portrait.png';
  const deviceDir = join(dir, 'aso-device-templates');
  mkdirSync(deviceDir);
  writeFileSync(join(deviceDir, bezelName), Buffer.from(bezelData, 'base64'));
  writeFileSync(join(deviceDir, 'iPhone Duo - Star White - Inner Open Landscape.png'),
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  assert.equal((await fetch(base + '/api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })).status, 200);
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
  const tabs = page.getByLabel('ASO 工作区', { exact: true });
  await tabs.getByRole('button', { name: 'ASO 图片实验室', exact: true }).waitFor();
  assert.deepEqual((await tabs.getByRole('button').allTextContents()).slice(-2), ['ASO 分析与优化', 'ASO 图片实验室']);
  await tabs.getByRole('button', { name: 'ASO 图片实验室', exact: true }).click();
  const lab = page.locator('.aso-artwork-lab');
  await lab.getByText(/还没有方案/).waitFor();
  await lab.getByRole('button', { name: '创建方案', exact: true }).click();
  assert.equal(await lab.getByLabel('目标版本', { exact: true }).count(), 0);
  await lab.getByLabel('本地化语言', { exact: true }).selectOption('en-US');
  await lab.getByLabel('设备组', { exact: true }).selectOption('IPHONE_DUO_PROFILE');
  const sizes = lab.getByLabel('成品尺寸', { exact: true });
  assert.deepEqual(await sizes.locator('option').allTextContents(), [
    '外屏 · 竖屏 · 1398 × 2034 px', '外屏 · 横屏 · 2034 × 1398 px',
    '内屏 · 竖屏 · 2007 × 2853 px', '内屏 · 横屏 · 2853 × 2007 px',
  ]);
  await lab.getByLabel('重点卖点或视觉方向（选填）').fill('突出深度阅读');
  await lab.getByRole('button', { name: '保存方案', exact: true }).click();
  await lab.getByRole('heading', { name: '方案详情' }).waitFor();
  const stageActions = lab.locator('.aso-artwork-editor .aso-artwork-stage-actions');
  assert.equal(await lab.getByRole('complementary', { name: '制作流程' }).getByRole('button').count(), 0);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const [created] = await fetch(base + '/api/aso/artwork/shiye').then(res => res.json());
  const setId = created.id;
  assert.ok(created.createdAt);
  await stageActions.getByRole('button', { name: '复制 Agent 方案任务' }).click();
  await page.getByText('已复制 Agent 方案任务', { exact: true }).waitFor();
  const task = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(task, /en-US \/ iPhone Duo/);
  assert.match(task, /save_aso_artwork_plan/);
  assert.match(task, /截图要看到什么/);
  assert.doesNotMatch(task, /capture_aso_artwork_screenshot/);
  assert.match(task, new RegExp(setId));

  const { token } = JSON.parse(readFileSync(join(dir, 'mcp-access.json'), 'utf8'));
  const mcp = await fetch(base + '/api/mcp/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'save_aso_artwork_plan', args: { productId: 'shiye', setId, revision: 0, plan: {
      direction: '清晰留白，以真实阅读界面为视觉重心。',
      shots: [
        { key: '01-reading', title: '阅读与摘录', headline: 'Keep what you read', capture: '英文阅读页面，可见书名与一条书摘。' },
        { key: '02-echo', title: '重读回响', headline: 'Rediscover a favorite idea', layout: '用大图展示回响卡片。', capture: '英文回响页面，可见一条旧摘录。' },
      ],
    } } }),
  });
  assert.equal(mcp.status, 200, await mcp.text());

  await lab.getByRole('button', { name: '刷新方案' }).click();
  const shotList = lab.getByRole('list', { name: '上架图顺序' });
  const reading = shotList.getByRole('listitem').filter({ has: page.getByRole('heading', { name: '阅读与摘录', exact: true }) });
  const echo = shotList.getByRole('listitem').filter({ has: page.getByRole('heading', { name: '重读回响', exact: true }) });
  await reading.waitFor();
  await echo.waitFor();
  assert.deepEqual(await shotList.getByRole('heading', { level: 4 }).allTextContents(),
    ['阅读与摘录', '原始截图', '最终成图', '重读回响', '原始截图', '最终成图']);
  assert.match(await reading.textContent(), /预期截图英文阅读页面/);
  assert.doesNotMatch(await echo.textContent(), /用大图展示回响卡片/);
  assert.equal(await stageActions.getByRole('button', { name: '下载交付包' }).count(), 0);
  assert.ok(await reading.getByLabel('上传原始截图', { exact: true }).isDisabled());
  assert.ok(await reading.getByRole('button', { name: '复制本项截图任务', exact: true }).isDisabled());
  assert.ok(await reading.getByRole('button', { name: '从素材库选择' }).isDisabled());
  assert.ok(await reading.getByLabel('上传成图', { exact: true }).isDisabled());
  assert.equal(await stageActions.getByRole('button', { name: '复制 Agent 截图任务' }).count(), 0);
  await stageActions.getByRole('button', { name: '重新生成方案', exact: true }).click();
  await page.getByText('已复制重新生成任务', { exact: true }).waitFor();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /保存回同一个 setId/);
  await stageActions.getByRole('button', { name: '确认方案', exact: true }).click();
  await stageActions.getByRole('button', { name: '复制 Agent 截图任务' }).click();
  await page.getByText('已复制 Agent 截图任务', { exact: true }).waitFor();
  const captureTask = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(captureTask, /本任务只允许离屏渲染目标 App 的实际视图/);
  assert.match(captureTask, /禁止启动或使用模拟器、真机、Device Hub、simctl、XCUITest 或 capture_aso_artwork_screenshot/);
  assert.match(captureTask, /只有用户明确要求改用其他取图方式后/);
  assert.match(captureTask, /独立临时存储/);
  assert.match(captureTask, /NSHostingView.*从视图图层导出/);
  assert.match(captureTask, /每张 iPhone 离屏截图都要渲染可见的状态栏/);
  assert.match(captureTask, /外屏横屏和竖屏、展开后的内屏横屏，均使用右侧纵向状态栏/);
  assert.match(captureTask, /展开后的内屏竖屏使用顶部横向状态栏/);
  assert.match(captureTask, /为栏位预留安全区/);
  assert.match(captureTask, /iOS 专用布局，复用实际的共用子视图/);
  assert.match(captureTask, /无法离屏取得原生状态栏或系统工具栏时，在预览中模拟/);
  assert.match(captureTask, /保留空位，报告对应的 shot\.key、尝试过的离屏方式和具体阻塞，继续完成其余图位/);
  assert.match(captureTask, /shot\.key.*上传原始截图/);
  assert.match(captureTask, /报告每张图的来源和模拟的系统元素/);
  assert.doesNotMatch(captureTask, /再用模拟器|save_aso_artwork_plan/);
  assert.equal(await shotList.getByRole('button', { name: '复制本项截图任务', exact: true }).count(), 2);
  await echo.getByRole('button', { name: '复制本项截图任务', exact: true }).click();
  await page.getByText('已复制本项截图任务', { exact: true }).waitFor();
  const singleCaptureTask = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(singleCaptureTask, /shot\.key = 02-echo/);
  assert.match(singleCaptureTask, /预期截图：英文回响页面，可见一条旧摘录/);
  assert.match(singleCaptureTask, /导出 02-echo\.png/);
  assert.match(singleCaptureTask, /该图位已有截图或无法回填时，交付新 PNG 路径/);
  assert.match(singleCaptureTask, /本任务只允许离屏渲染目标 App 的实际视图/);
  assert.match(singleCaptureTask, /每张 iPhone 离屏截图都要渲染可见的状态栏/);
  assert.match(singleCaptureTask, new RegExp(setId));
  assert.doesNotMatch(singleCaptureTask, /01-reading|继续完成其余图位/);
  const readingSample = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 520;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#faf7ee';
    ctx.fillRect(0, 0, 400, 520);
    ctx.fillStyle = '#333d38';
    ctx.font = 'bold 30px system-ui';
    ctx.fillText('Reading', 28, 76);
    ctx.fillStyle = '#e9ede2';
    ctx.fillRect(24, 110, 352, 170);
    ctx.fillStyle = '#333d38';
    ctx.font = '18px Georgia';
    ctx.fillText('A few lines worth keeping', 42, 152);
    return canvas.toDataURL();
  });
  const original = Buffer.from(readingSample.split(',')[1], 'base64');
  await reading.getByLabel('上传原始截图', { exact: true }).setInputFiles({ name: 'raw.png', mimeType: 'image/png', buffer: original });
  await lab.getByRole('img', { name: '阅读与摘录 · 原始截图', exact: true }).waitFor();
  assert.equal(await lab.getByRole('img', { name: '阅读与摘录 · 原始截图', exact: true }).evaluate(async img => {
    await img.decode();
    return img.naturalWidth;
  }), 400);
  await echo.getByRole('button', { name: '从素材库选择' }).click();
  const picker = page.getByRole('dialog', { name: '从素材库选择图片' });
  await picker.getByRole('searchbox').fill('echo-library.jpg');
  await picker.getByLabel('按语言筛选').selectOption('en-US');
  await picker.getByRole('button', { name: '预览图片 回响示例截图' }).click();
  const preview = picker.getByRole('dialog', { name: '回响示例截图' });
  await preview.getByRole('button', { name: '选中此图' }).click();
  await preview.getByRole('button', { name: '关闭图片放大预览' }).click();
  assert.ok(await picker.getByRole('radio', { name: '选择图片 回响示例截图' }).isChecked());
  assert.equal(await picker.getByRole('button', { name: '全选当前结果' }).count(), 0);
  await picker.getByRole('button', { name: '添加截图' }).click();
  await picker.waitFor({ state: 'hidden' });
  await echo.getByRole('img', { name: '重读回响 · 原始截图', exact: true }).waitFor();
  assert.equal(await echo.getByRole('img').evaluate(async img => {
    await img.decode();
    return img.naturalWidth;
  }), 480);
  assert.equal(await shotList.getByRole('img', { name: /原始截图/ }).count(), 2);
  await stageActions.getByRole('button', { name: '复制成图方案' }).click();
  await page.getByText('已复制成图方案', { exact: true }).waitFor();
  const handoff = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(handoff, /^# 拾页 App Store 上架图（使用图片生成，而不是agent模式）\n/);
  assert.match(handoff, /1398 × 2034 px.*en-US/);
  assert.match(handoff, /本轮只输出首张成图，使用附件 01-reading\.png/);
  assert.match(handoff, /等待我确认。收到修改意见时只迭代首张。首张确认后，按我指定的图项继续，每轮只输出一张/);
  assert.match(handoff, /## 本轮首张 · 阅读与摘录\n\n原始截图 — 01-reading\.png\n\n主标题 — Keep what you read/);
  assert.match(handoff, /从 App 界面和随附的品牌素材提取配色、字体风格和视觉细节/);
  assert.match(handoff, /让真实 App 的使用画面成为视觉主体/);
  assert.match(handoff, /App Store 搜索结果缩略图/);
  assert.match(handoff, /## 后续图项[\s\S]*02-echo\.png/);
  assert.match(handoff, /模拟的状态栏或工具栏，沿用附件中的布局与按钮/);
  assert.doesNotMatch(handoff, /官方设备模板|App Review 截图要求|App Store Connect 截图规格|## 产品 Logo|## 制作目标/);
  assert.doesNotMatch(handoff, /构图 —|用大图展示回响卡片|真实阅读界面为视觉重心|英文阅读页面|1-01-reading\.png/);
  await reading.getByRole('button', { name: '复制截图' }).click();
  await page.getByText('已复制截图', { exact: true }).waitFor();
  assert.ok(await page.evaluate(async () => (await navigator.clipboard.read())[0].types.includes('image/png')));
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    stageActions.getByRole('button', { name: '下载交付包' }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await file.path()));
  const logoPath = 'branding/product-logo.png';
  const bezelPath = 'device/device-template.png';
  assert.deepEqual(Object.keys(zip.files), ['brief.md', bezelPath, logoPath, '1-01-reading.png', '2-02-echo.png']);
  assert.deepEqual(await zip.file(bezelPath).async('nodebuffer'), Buffer.from(bezelData, 'base64'));
  const libraryAfterDownload = (await fetch(base + '/api/state').then(res => res.json())).data;
  assert.ok(!libraryAfterDownload.assets.some(asset => asset.fileName === bezelName));
  assert.ok(!libraryAfterDownload.assetFolders.some(folder => folder.name === 'ASO 设备模具'));
  const packagedBrief = await zip.file('brief.md').async('string');
  const bezelReference = `设备模具 — ${bezelPath}。将原始截图等比嵌入屏幕区域。`;
  assert.ok(packagedBrief.includes(bezelReference));
  assert.equal(packagedBrief.replace('\n\n' + bezelReference, ''),
    handoff.replaceAll('01-reading.png', '1-01-reading.png').replaceAll('02-echo.png', '2-02-echo.png'));
  const logoPng = await zip.file(logoPath).async('nodebuffer');
  assert.equal(logoPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  const [logoWidth, logoHeight] = await page.locator('img[src="/icons/shiye.jpg"]').first().evaluate(async img => {
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  });
  assert.deepEqual([logoPng.readUInt32BE(16), logoPng.readUInt32BE(20)], [logoWidth, logoHeight]);
  assert.deepEqual(await zip.file('1-01-reading.png').async('nodebuffer'), original);
  const echoPng = await zip.file('2-02-echo.png').async('nodebuffer');
  assert.equal(echoPng.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(echoPng.readUInt32BE(20), 640);
  await reading.getByLabel('上传成图', { exact: true }).setInputFiles({ name: 'smaller.png', mimeType: 'image/png', buffer: original });
  const resized = await reading.getByRole('img', { name: '阅读与摘录 · 最终成图', exact: true }).evaluate(async img => {
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return {
      size: [canvas.width, canvas.height],
      top: [...ctx.getImageData(0, 0, 1, 1).data],
      center: [...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data],
    };
  });
  assert.deepEqual(resized.size, [1398, 2034]);
  assert.deepEqual(resized.top, [255, 255, 255, 255]);
  assert.notDeepEqual(resized.center, resized.top);
  const finalJpeg = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1398;
    canvas.height = 2034;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ebe5d8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#413626';
    ctx.font = 'bold 118px Georgia';
    ctx.fillText('Keep what you read', 126, 270);
    return canvas.toDataURL('image/jpeg');
  });
  await echo.getByLabel('上传成图', { exact: true }).setInputFiles({
    name: 'echo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(finalJpeg.split(',')[1], 'base64'),
  });
  const echoFinal = echo.getByRole('img', { name: '重读回响 · 最终成图', exact: true });
  await echoFinal.scrollIntoViewIfNeeded();
  await echoFinal.evaluate(img => img.decode());
  assert.equal(await shotList.getByRole('img', { name: /最终成图/ }).count(), 2);
  await stageActions.getByRole('button', { name: '选择商店版本', exact: true }).click();
  const storeVersion = lab.getByLabel('商店版本', { exact: true });
  assert.equal(await storeVersion.locator('option[value="demo-mac"]').count(), 0);
  const submitDraft = stageActions.getByRole('button', { name: '提交到 ASO 图片草稿', exact: true });
  assert.equal(await submitDraft.isDisabled(), true);
  const saveMode = stageActions.getByLabel('处理方式');
  assert.deepEqual(await saveMode.getByRole('option').allTextContents(), ['请选择处理方式', '覆盖', '增加']);
  for (const width of [390, 320, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await storeVersion.selectOption('');
    await saveMode.selectOption('');
    const submitForm = stageActions.locator('.aso-artwork-submit-form');
    const controlPositions = () => submitForm.locator('select, button').evaluateAll(elements =>
      elements.map(el => ({ x: el.offsetLeft, y: el.offsetTop, bottom: el.offsetTop + el.offsetHeight })));
    const before = await controlPositions();
    await storeVersion.selectOption('demo-v');
    await saveMode.selectOption('replace');
    assert.deepEqual(await controlPositions(), before, `选择覆盖后按钮位置变化：${width}px`);
    await saveMode.selectOption('append');
    assert.deepEqual(await controlPositions(), before, `选择增加后按钮位置变化：${width}px`);
    const [version, mode, button] = before;
    assert.equal(version.bottom, mode.bottom);
    if (width === 1440) assert.equal(button.bottom, mode.bottom);
    else assert.ok(button.y > mode.bottom);
    assert.ok(await submitForm.evaluate(el => el.scrollWidth <= el.clientWidth), `提交表单溢出：${width}px`);
  }
  await submitDraft.click();
  await lab.getByText('已提交到版本 2.7.0（en-US）。', { exact: true }).waitFor();
  const saved = await fetch(base + '/api/aso/media/shiye/localized?versionId=demo-v&locale=en-US').then(res => res.json());
  assert.equal(saved.draftGroups[0].group, 'IPHONE_DUO_PROFILE');
  assert.deepEqual(saved.draftGroups[0].items.map(item => item.id || item.name), ['store-duo', '01-reading.png', '02-echo.png']);
  const final = Buffer.from(saved.draftGroups[0].items[1].data.split(',')[1], 'base64');
  assert.deepEqual([final.readUInt32BE(16), final.readUInt32BE(20), final[25]], [1398, 2034, 2]);
  const syncedAssets = async () => (await fetch(base + '/api/state').then(res => res.json())).data.assets
    .filter(asset => asset.productId === 'shiye' && asset.id.startsWith('aso-') && asset.id !== 'aso-library-shot');
  const synced = await syncedAssets();
  assert.deepEqual(synced.map(asset => asset.fileName), [
    '01-reading-original.png', '01-reading-final.png', '02-echo-original.png', '02-echo-final.png',
  ]);
  assert.ok(synced.every(asset => asset.languages.includes('en-US')));
  for (const [index, expected] of [original, final, echoPng].entries()) {
    const response = await fetch(base + synced[index].url);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
  await submitDraft.click();
  await lab.getByLabel('商店版本', { exact: true }).selectOption('demo-v');
  assert.equal(await submitDraft.isDisabled(), true);
  await saveMode.selectOption('append');
  const retrySubmit = page.waitForResponse(response => response.url().endsWith('/submit-draft'));
  await submitDraft.click();
  const retried = await retrySubmit;
  assert.equal(retried.status(), 200, await retried.text());
  await saveMode.waitFor({ state: 'detached' });
  assert.equal(await submitDraft.isEnabled(), true);
  assert.deepEqual(await syncedAssets(), synced);
  const afterRetry = await fetch(base + '/api/aso/media/shiye/localized?versionId=demo-v&locale=en-US').then(res => res.json());
  assert.deepEqual(afterRetry.draftGroups, saved.draftGroups);
  await lab.getByRole('button', { name: '刷新方案', exact: true }).click();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await lab.evaluate(el => el.scrollWidth <= el.clientWidth), `图片实验室溢出 ${width}`);
    const briefBounds = await reading.locator('.aso-artwork-shot-brief').boundingBox();
    const imagesBounds = await reading.locator('.aso-artwork-shot-images').boundingBox();
    if (width === 1440) assert.ok(briefBounds.x + briefBounds.width <= imagesBounds.x, '文案和图片左右对照');
    else assert.ok(briefBounds.y + briefBounds.height <= imagesBounds.y, '窄屏文案在上、图片在下');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  if (process.env.ASO_ARTWORK_TEST_IMAGE) await lab.screenshot({ path: process.env.ASO_ARTWORK_TEST_IMAGE });
  await lab.getByRole('button', { name: '方案列表', exact: true }).click();
  const row = lab.getByRole('button', { name: /突出深度阅读/ });
  await row.waitFor();
  const info = await row.textContent();
  assert.match(info, /创建时间/);
  assert.match(info, /图片数量2 张/);
  assert.match(info, /已提交草稿/);
  assert.ok(await row.locator('time').getAttribute('datetime'));
  if (process.env.ASO_ARTWORK_TEST_IMAGE) await lab.screenshot({ path: process.env.ASO_ARTWORK_TEST_IMAGE.replace(/\.png$/, '-list.png') });
  const copyBrief = row.locator('..').getByRole('button', { name: '复制方案', exact: true });
  const detailArrow = row.locator('.aso-artwork-row-arrow');
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const [copyBounds, detailBounds] = await Promise.all([copyBrief.boundingBox(), detailArrow.boundingBox()]);
    assert.ok(copyBounds.x + copyBounds.width < detailBounds.x);
    assert.ok(await lab.evaluate(el => el.scrollWidth <= el.clientWidth));
  }
  await copyBrief.click();
  const copyDialog = page.getByRole('dialog', { name: '复制方案' });
  assert.equal(await copyDialog.getByRole('button', { name: '复制方案', exact: true }).isDisabled(), true);
  await copyDialog.press('Escape');
  await copyDialog.waitFor({ state: 'detached' });
  await copyBrief.click();
  await copyDialog.getByLabel('目标语言').selectOption('ja');
  const copyButton = copyDialog.getByRole('button', { name: '复制方案', exact: true });
  const rejectedCopy = page.waitForResponse(response => response.url().endsWith(`/${setId}/copy`));
  await copyButton.click();
  const rejected = await rejectedCopy;
  assert.equal(rejected.status(), 502);
  assert.match((await rejected.json()).error, /未返回有效的方案文案/);
  await copyDialog.getByRole('alert').filter({ hasText: '未返回有效的方案文案' }).waitFor();
  const afterRejection = await fetch(base + '/api/aso/artwork/shiye').then(res => res.json());
  assert.deepEqual(afterRejection.map(brief => brief.id), [setId]);
  const copyResponse = page.waitForResponse(response => response.url().endsWith(`/${setId}/copy`));
  await copyButton.click();
  const createdCopy = await copyResponse;
  assert.equal(createdCopy.status(), 201, await createdCopy.text());
  const copied = await createdCopy.json();
  await stageActions.getByRole('button', { name: '确认方案', exact: true }).waitFor();
  const source = await fetch(base + '/api/aso/artwork/shiye/' + setId).then(res => res.json());
  assert.notEqual(copied.id, source.id);
  assert.deepEqual(copied.target, { ...source.target, locale: 'ja', goal: '深く読む楽しさを伝える' });
  assert.deepEqual(copied.plan.shots.map(shot => shot.key), source.plan.shots.map(shot => shot.key));
  assert.equal(copied.plan.shots[0].headline, '読んだ言葉を手元に');
  assert.equal(copied.plan.shots[1].capture, '日本語の読み返し画面に、過去の抜粋を表示。');
  assert.equal(copied.plan.shots[1].layout, 'カードを大きく配置。');
  assert.equal(source.plan.shots[0].headline, 'Keep what you read');
  assert.equal(source.status, 'submitted');
  assert.equal(copied.status, 'review');
  assert.deepEqual([copied.captureCount, copied.finalCount, copied.submission], [0, 0, null]);
  const deleteCopy = await fetch(base + '/api/aso/artwork/shiye/' + copied.id, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: copied.revision }),
  });
  assert.equal(deleteCopy.status, 200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await lab.getByRole('button', { name: '方案列表', exact: true }).click();
  await detailArrow.click();
  console.log('通过：图片实验室列表、双阶段 Agent、iPhone Duo、连续逐图布局与双图位、ZIP 及草稿闭环和响应式布局');
  const screenshots = ['A', 'B'].map(id => ({ id, name: id, url: portraitSample, type: 'APP_SCREENSHOT', group: 'IPHONE_FACE_ID_LARGE_PROFILE' }));
  const landscapeSample = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 268;
    canvas.height = 124;
    return canvas.toDataURL();
  });
  const mixedScreenshots = [
    { ...screenshots[0], id: 'duo-portrait', name: 'Duo 竖图', group: 'IPHONE_DUO_PROFILE' },
    { ...screenshots[1], id: 'duo-landscape', name: 'Duo 横图', group: 'IPHONE_DUO_PROFILE', url: landscapeSample, width: 268, height: 124 },
  ];
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
  let showFallbacks = false;
  await page.route('**/api/aso/media/shiye/localized?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const locale = params.get('locale');
    const mac = params.get('versionId') === 'mac-media';
    const availableLocales = mac ? ['zh-Hans'] : [...locales, 'en-US'];
    const assets = mac ? [{ ...screenshots[0], name: 'Mac 截图', group: 'MAC_PROFILE' }] : locale === 'zh-Hans' ? [header] : [...screenshots, ...mixedScreenshots];
    const fallbackAssets = showFallbacks ? [
      { ...header, name: '英国英语标题图', sourceLocale: 'en-GB' },
      { ...header, id: 'fallback-search', name: '英国英语搜索图', type: 'APP_STORE_SEARCH_RESULTS_ASSET', sourceLocale: 'en-GB' },
    ] : [];
    return route.fulfill({ json: locale ? { locales: availableLocales, locale, revision: 'r1', editable: !mac, assets, fallbackAssets, draftGroups: mac ? [] : drafts[locale], promotionalText: mac ? 'Mac 推广文本' : 'iOS 推广文本', description: (mac ? 'Mac 应用描述。' : '这段介绍用于验证详情页可滚动。').repeat(60) } : { locales: availableLocales } });
  });
  await page.route('**/api/aso/media/shiye/draft', route => {
    const { versionId, locale, type, group, items } = route.request().postDataJSON();
    assert.equal(versionId, 'v');
    const groups = drafts[locale] ||= [];
    drafts[locale] = [...groups.filter(entry => entry.type !== type || entry.group !== group), { type, group, items }];
    return route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/aso/media/shiye/reset-draft', route => {
    const { versionId, locale } = route.request().postDataJSON();
    assert.equal(versionId, 'v');
    drafts[locale] = [];
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
  await tabs.getByRole('button', { name: 'ASO图片', exact: true }).click();
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
  const uploadImage = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 300;
    canvas.height = 650;
    return canvas.toDataURL('image/png');
  });
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
  await workspace.getByRole('status').waitFor({ state: 'detached' });
  await replacement.waitFor();
  assert.equal(await workspace.getByRole('region', { name: '编辑前', exact: true }).getByRole('img', { name: '中文标题图' }).count(), 1);
  assert.equal(await workspace.getByRole('button', { name: '重置草稿' }).isDisabled(), false);
  await workspace.getByRole('button', { name: '重置草稿' }).click();
  await workspace.getByRole('status').waitFor({ state: 'detached' });
  await workspace.locator('figure img[alt="中文标题图"]').waitFor();
  assert.equal(await workspace.locator('figure img[alt="cover.jpg"]').count(), 0);
  assert.equal(await workspace.getByRole('button', { name: '重置草稿' }).isDisabled(), true);
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
  await workspace.getByLabel('设备规格').selectOption('IPHONE_DUO_PROFILE');
  const mixedGalleries = workspace.getByRole('region', { name: 'App 预览和截图', exact: true });
  await mixedGalleries.last().getByRole('img', { name: 'Duo 横图' }).waitFor();
  assert.equal(await mixedGalleries.count(), 2);
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const gallery of await mixedGalleries.all()) {
      const [portrait, landscape] = await gallery.getByRole('img').evaluateAll(async images => {
        await Promise.all(images.map(image => image.decode()));
        return images.map(image => {
          const { top, width, height } = image.getBoundingClientRect();
          return { top, width, height, ratio: image.naturalWidth / image.naturalHeight };
        });
      });
      assert.equal(portrait.top, landscape.top);
      assert.equal(portrait.height, landscape.height);
      assert.ok(landscape.width > portrait.width);
      for (const image of [portrait, landscape]) {
        assert.ok(Math.abs(image.width - image.height * image.ratio) < 1);
      }
      await gallery.press('ArrowRight');
      await expect.poll(() => gallery.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await workspace.getByLabel('设备规格').selectOption('IPAD_13_PROFILE');
  await workspace.getByRole('button', { name: '移除 agent.png', exact: true }).waitFor();
  await workspace.getByLabel('设备规格').selectOption('IPHONE_FACE_ID_LARGE_PROFILE');
  assert.deepEqual(await workspace.getByLabel('设备规格').locator('option').evaluateAll(options => options.map(option => option.value)), [
    'IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE', 'IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE', 'IPHONE_FACE_ID_LARGE_PROFILE',
    'IPAD_13_PROFILE', 'IPHONE_DUO_PROFILE',
  ]);
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
  showFallbacks = true;
  await workspace.getByLabel('本地化语言').selectOption('en-US');
  await readButton.click();
  const searchGallery = workspace.locator('.aso-media-gallery').filter({ has: page.getByRole('heading', { name: '搜索结果图片' }) });
  const fallbackImage = searchGallery.getByRole('img', { name: '英国英语搜索图' });
  await fallbackImage.waitFor();
  assert.match(await searchGallery.locator('.aso-media-fallback').textContent(), /可能使用.*英语 \(英国\)/);
  assert.equal(await searchGallery.getByText('当前语言已上传 0/1 张').count(), 1);
  assert.equal(await searchGallery.getByRole('button', { name: /移除/ }).count(), 0);
  assert.equal(await workspace.getByRole('region', { name: '搜索结果预览内容' }).getByRole('img', { name: '英国英语搜索图' }).count(), 2);
  await searchGallery.getByLabel('搜索结果图片 · 上传图片').setInputFiles({
    name: 'localized.png', mimeType: 'image/png', buffer: Buffer.from(uploadImage.split(',')[1], 'base64'),
  });
  await searchGallery.getByRole('img', { name: 'localized.jpg' }).waitFor();
  assert.equal(await searchGallery.locator('.aso-media-fallback').count(), 0);
  assert.deepEqual(drafts['en-US'].find(group => group.type === 'APP_STORE_SEARCH_RESULTS_ASSET').items.map(item => item.name), ['localized.jpg']);
  await workspace.getByRole('button', { name: '重置草稿' }).click();
  await fallbackImage.waitFor();
  console.log('通过：ASO 图片显示回退来源，当前语言上传覆盖回退，重置草稿恢复回退');
  await page.getByRole('button', { name: 'ASO 分析与优化', exact: true }).click();
  await page.getByRole('button', { name: '查看报告' }).click();
  await page.getByRole('heading', { name: '转化建议' }).waitFor();
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
  await page.setViewportSize({ width: 1440, height: 900 });
  await tabs.getByRole('button', { name: 'ASO 图片实验室', exact: true }).click();
  await row.click();
  const briefUrl = base + '/api/aso/artwork/shiye/' + setId;
  const submittedBrief = await fetch(briefUrl).then(res => res.json());
  page.once('dialog', dialog => dialog.accept());
  await stageActions.getByRole('button', { name: '返回方案阶段', exact: true }).click();
  await stageActions.getByRole('button', { name: '重新生成方案', exact: true }).waitFor();
  const reopened = await fetch(briefUrl).then(res => res.json());
  assert.equal(reopened.status, 'review');
  assert.equal(reopened.confirmedAt, null);
  assert.deepEqual(reopened.captures, submittedBrief.captures);
  assert.deepEqual(reopened.finals, submittedBrief.finals);
  const resave = plan => fetch(base + '/api/mcp/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'save_aso_artwork_plan', args: { productId: 'shiye', setId, revision: reopened.revision, plan } }),
  });
  const changed = await resave({ ...reopened.plan, shots: reopened.plan.shots.map((shot, index) =>
    index === 0 ? { ...shot, headline: 'Changed copy' } : shot) });
  assert.match((await changed.json()).error, /先在页面移除该成图/);
  const revised = await resave({ ...reopened.plan, direction: '强调从阅读到重读的顺序。' });
  assert.equal(revised.status, 200, await revised.text());
  await lab.getByRole('button', { name: '刷新方案', exact: true }).click();
  await lab.getByText('强调从阅读到重读的顺序。', { exact: true }).waitFor();
  await stageActions.getByRole('button', { name: '确认方案', exact: true }).click();
  await stageActions.getByRole('button', { name: '选择商店版本', exact: true }).waitFor();
  const staleDelete = await fetch(briefUrl, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0 }),
  });
  assert.equal(staleDelete.status, 409);
  const deleteButton = lab.getByRole('button', { name: '删除方案', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await deleteButton.click();
  assert.equal((await fetch(briefUrl)).status, 200);
  page.once('dialog', async dialog => {
    assert.match(dialog.message(), /原始截图和最终成图会一并删除/);
    await dialog.accept();
  });
  await deleteButton.click();
  await lab.getByRole('heading', { name: '还没有方案' }).waitFor();
  assert.equal((await fetch(briefUrl)).status, 404);
  assert.deepEqual(Buffer.from(await fetch(base + '/api/assets/file/aso-library-shot').then(res => res.arrayBuffer())),
    Buffer.from(libraryJpeg.split(',')[1], 'base64'));
  const draftAfterDelete = await fetch(base + '/api/aso/media/shiye/localized?versionId=demo-v&locale=en-US').then(res => res.json());
  assert.deepEqual(draftAfterDelete.draftGroups, saved.draftGroups);
  const db = new DatabaseSync(join(dir, 'db.sqlite'), { readOnly: true });
  try {
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM aso_artwork_captures WHERE set_id=?').get(setId).count, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM aso_artwork_final_images WHERE set_id=?').get(setId).count, 0);
  } finally { db.close(); }
  console.log('通过：取消删除、拒绝过期删除、清理方案和附件、保留已提交的图片草稿');

  await lab.getByRole('button', { name: '创建方案', exact: true }).click();
  await lab.getByLabel('设备组', { exact: true }).selectOption('IPHONE_DYNAMIC_ISLAND_LARGE_PROFILE');
  await lab.getByLabel('成品尺寸', { exact: true }).selectOption('2868x1320');
  await lab.getByRole('button', { name: '保存方案', exact: true }).click();
  await lab.getByRole('heading', { name: '方案详情' }).waitFor();
  const [ordinary] = await fetch(base + '/api/aso/artwork/shiye').then(res => res.json());
  const ordinaryPlan = await fetch(base + '/api/mcp/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'save_aso_artwork_plan', args: { productId: 'shiye', setId: ordinary.id, revision: 0, plan: reopened.plan } }),
  });
  assert.equal(ordinaryPlan.status, 200, await ordinaryPlan.text());
  await lab.getByRole('button', { name: '刷新方案', exact: true }).click();
  await stageActions.getByRole('button', { name: '确认方案', exact: true }).click();
  await stageActions.getByRole('button', { name: '复制 Agent 截图任务' }).click();
  await page.getByText('已复制 Agent 截图任务', { exact: true }).waitFor();
  const ordinaryTask = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(ordinaryTask, /本任务只允许离屏渲染目标 App 的实际视图/);
  assert.match(ordinaryTask, /每张 iPhone 离屏截图都要渲染可见的状态栏/);
  assert.match(ordinaryTask, /横屏原生状态栏默认隐藏时，在安全区内模拟一条可见状态栏/);
  assert.doesNotMatch(ordinaryTask, /iPhone Duo|右侧纵向状态栏/);
  console.log('通过：普通 iPhone 横屏截图提示词要求显示状态栏');

  await lab.getByRole('button', { name: '补充项', exact: true }).click();
  const supplementDialog = page.getByRole('dialog', { name: '补充图项' });
  const copySupplement = supplementDialog.getByRole('button', { name: '复制提示词' });
  assert.ok(await copySupplement.isDisabled());
  await supplementDialog.getByLabel('补充要求').fill('加一张展示搜索结果的截图');
  await copySupplement.click();
  await page.getByText('已复制补充项提示词', { exact: true }).waitFor();
  assert.equal(await supplementDialog.count(), 0);
  const supplementTask = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(supplementTask, /加一张展示搜索结果的截图/);
  assert.match(supplementTask, /append_aso_artwork_shots/);
  assert.ok(supplementTask.includes(ordinary.id));
  const ordinaryUrl = base + '/api/aso/artwork/shiye/' + ordinary.id;
  const approved = await fetch(ordinaryUrl).then(res => res.json());
  const searchShot = { key: '03-search', title: '搜索结果', headline: 'Find what you kept', capture: '搜索页显示一条结果。' };
  const append = await fetch(base + '/api/mcp/execute', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'append_aso_artwork_shots', args: {
      productId: 'shiye', setId: ordinary.id, revision: approved.revision, shots: [searchShot],
    } }),
  });
  assert.equal(append.status, 200, await append.text());
  await lab.getByRole('button', { name: '刷新方案', exact: true }).click();
  await stageActions.getByRole('button', { name: '确认方案', exact: true }).waitFor();
  assert.equal(await shotList.getByRole('listitem').count(), 3);
  const removeShot = shotList.getByRole('button', { name: '删除图项 搜索结果', exact: true });
  page.once('dialog', dialog => dialog.dismiss());
  await removeShot.click();
  assert.equal(await shotList.getByRole('listitem').count(), 3);
  page.once('dialog', dialog => dialog.accept());
  await removeShot.click();
  await removeShot.waitFor({ state: 'detached' });
  assert.equal(await shotList.getByRole('listitem').count(), 2);
  console.log('通过：逐图工作区复制补充提示词、MCP 追加和删除单项');
} finally { await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true }); }
