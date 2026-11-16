import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateData } from '../server/validate.mjs';
import { openPublication } from '../server/publication.mjs';

test('版本发布多平台数据结构与后端发布上下文验证', async () => {
  const mockProduct = {
    id: 'prod-1',
    name: '测试应用',
    summary: '应用简介',
    appId: '123456789',
    price: '免费',
    platform: 'iOS, macOS',
    website: 'https://example.com',
    color: '#0071e3',
    appStore: {
      appId: '123456789',
      name: '测试应用',
      bundleId: 'com.example.app',
      syncedAt: '2026-01-01T00:00:00.000Z',
      versions: [
        { id: 'v-ios-1', version: '2.1.0', platform: 'IOS', state: 'READY_FOR_SALE', notes: [] },
        { id: 'v-mac-1', version: '1.5.0', platform: 'MAC_OS', state: 'READY_FOR_SALE', notes: [] },
      ],
    },
  };

  const mockRelease = {
    id: 'rel-1',
    productId: 'prod-1',
    version: '2.1.0',
    changes: 'iOS 更新说明',
    platforms: ['IOS', 'MAC_OS'],
    platformDetails: {
      IOS: { version: '2.1.0', changes: 'iOS 更新说明' },
      MAC_OS: { version: '1.5.0', changes: 'macOS 菜单栏与窗口优化' },
    },
    languages: ['zh-Hans'],
    channels: ['App Store'],
    status: 'preparing',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: [{ language: 'zh-Hans', body: '中文更新说明', approved: true }],
    proposals: [],
  };

  const testData = {
    products: [mockProduct],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [mockRelease],
    contents: [],
    contentGroups: [],
    tasks: [],
  };

  // 1. 校验数据格式符合安全校验要求
  assert.equal(validateData(testData), true, '多平台 Release 数据结构应通过 validateData 校验');

  // 2. 校验 publication context 能根据不同 platform 读取对应的版本号与专属本地化语言
  const mockStore = {
    read: () => ({ data: testData, revision: 1 }),
    write: () => { },
    publicationEvents: () => [],
    publicationEvent: () => { },
  };
  const mockApple = {
    session: () => ({
      paginate: async (url) => {
        if (url.includes('filter[platform]=IOS')) {
          return { data: [{ id: 'v-ios-remote', attributes: { versionString: '2.1.0', platform: 'IOS' } }] };
        }
        if (url.includes('filter[platform]=MAC_OS')) {
          return { data: [{ id: 'v-mac-remote', attributes: { versionString: '1.5.0', platform: 'MAC_OS' } }] };
        }
        if (url.includes('/v-ios-remote/appStoreVersionLocalizations')) {
          return {
            data: [
              { attributes: { locale: 'zh-Hans', whatsNew: 'iOS 中文说明' } },
              { attributes: { locale: 'de-DE', whatsNew: 'iOS 德语说明' } },
              { attributes: { locale: 'en-US', whatsNew: 'iOS 英语说明' } },
            ],
          };
        }
        if (url.includes('/v-mac-remote/appStoreVersionLocalizations')) {
          return {
            data: [
              { attributes: { locale: 'zh-Hans', whatsNew: 'macOS 中文说明' } },
              { attributes: { locale: 'en-US', whatsNew: 'macOS 英语说明' } },
            ],
          };
        }
        return { data: [] };
      },
      request: async () => ({ data: null }),
    }),
  };

  const pub = openPublication(mockStore, mockApple);

  const iosStatus = await pub.status('rel-1', 'IOS');
  assert.equal(iosStatus.version, '2.1.0', 'IOS 平台应读取其专属版本号 2.1.0');
  assert.deepEqual(
    iosStatus.localizations.map(l => l.locale),
    ['zh-Hans', 'de-DE', 'en-US'],
    'IOS 平台应准确读取其自身的 3 个本地化语言'
  );

  const macStatus = await pub.status('rel-1', 'MAC_OS');
  assert.equal(macStatus.version, '1.5.0', 'MAC_OS 平台应读取其专属版本号 1.5.0');
  assert.deepEqual(
    macStatus.localizations.map(l => l.locale),
    ['zh-Hans', 'en-US'],
    'MAC_OS 平台应准确读取其自身的 2 个本地化语言，不应混入德语等其他平台语言'
  );
});

test('版本发布页面 UI：第一步多平台选择与各平台填写，第二步显示平台tab', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-platforms-ui-'));
  const port = '5224';
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

    // 写入一个支持 iOS、macOS 的产品与初始版本
    const initialData = {
      products: [
        {
          id: 'prod-multi',
          name: '多平台助手',
          summary: '跨端效率工具',
          appId: '888999111',
          price: '免费',
          platform: 'iOS, macOS',
          website: 'https://example.com',
          color: '#0071e3',
          appStore: {
            appId: '888999111',
            name: '多平台助手',
            bundleId: 'com.example.multi',
            syncedAt: '2026-01-01T00:00:00.000Z',
            versions: [
              {
                id: 'v-ios',
                version: '2.0.0',
                platform: 'IOS',
                state: 'READY_FOR_SALE',
                notes: [
                  { locale: 'zh-Hans', body: 'iOS 中文说明' },
                  { locale: 'de-DE', body: 'iOS 德文说明' },
                  { locale: 'en-US', body: 'iOS 英文说明' },
                  { locale: 'en-GB', body: 'iOS 英式说明' },
                ],
              },
              {
                id: 'v-mac',
                version: '1.2.0',
                platform: 'MAC_OS',
                state: 'READY_FOR_SALE',
                notes: [
                  { locale: 'zh-Hans', body: 'macOS 中文说明' },
                  { locale: 'en-US', body: 'macOS 英文说明' },
                ],
              },
            ],
          },
        },
      ],
      docs: [],
      docFolders: [],
      assets: [],
      assetFolders: [],
      releases: [
        {
          id: 'rel-multi',
          productId: 'prod-multi',
          version: '2.1.0',
          changes: '双端通用修复',
          platforms: ['IOS', 'MAC_OS'],
          platformDetails: {
            IOS: { version: '2.1.0', changes: '修复 iOS 灵动岛显示问题' },
            MAC_OS: { version: '1.3.0', changes: '适配 macOS 菜单栏快捷键' },
          },
          languages: ['zh-Hans'],
          channels: ['App Store'],
          status: 'preparing',
          createdAt: '2026-01-01T00:00:00.000Z',
          notes: [{ language: 'zh-Hans', body: '修复已知问题', approved: true }],
          proposals: [],
        },
      ],
      contents: [],
      contentGroups: [],
      tasks: [],
    };

    assert.equal(
      (await page.request.put(`${base}/api/state`, { data: { revision: state.revision, data: initialData } })).status(),
      200
    );

    // 直接导航至该版本的详情页第一步
    await page.goto(`${base}/#page=releases&release=rel-multi&product=prod-multi&stage=update`);
    await page.waitForSelector('.release-platform-select-container');

    // 1. 验证第一步读取产品已有平台（iOS 和 macOS）并显示在选择器中
    const platformChips = page.locator('.platform-toggle-chip');
    const chipTexts = await platformChips.allTextContents();
    assert(chipTexts.some(t => t.includes('iOS')), '第一步应读取并包含 iOS 平台');
    assert(chipTexts.some(t => t.includes('macOS')), '第一步应读取并包含 macOS 平台');

    // 2. 验证每个平台都有独立的版本号输入与更新内容输入框
    const detailCards = page.locator('.platform-detail-card');
    assert.equal(await detailCards.count(), 2, '应显示 2 个平台的详情填写卡片');

    const iosInput = page.locator('.platform-detail-card:has-text("iOS") input');
    const macInput = page.locator('.platform-detail-card:has-text("macOS") input');
    assert.equal(await iosInput.inputValue(), '2.1.0', 'iOS 版本号应为 2.1.0');
    assert.equal(await macInput.inputValue(), '1.3.0', 'macOS 版本号应为 1.3.0');

    // 3. 点击“进入下一步：平台发布 →”切换到第二步
    const nextBtn = page.locator('button:has-text("进入下一步：平台发布")');
    await nextBtn.click();
    await page.waitForSelector('.release-store-tabs-nav');

    // 4. 验证第二步根据第一步选择的平台，显示平台 tab
    const storeTabs = page.locator('.release-store-tab-btn');
    assert.equal(await storeTabs.count(), 2, '第二步应显示 2 个平台 tab');
    const tabTexts = await storeTabs.allTextContents();
    assert(tabTexts.some(t => t.includes('iOS') && t.includes('v2.1.0')), '应显示 iOS tab 且带对应版本号');
    assert(tabTexts.some(t => t.includes('macOS') && t.includes('v1.3.0')), '应显示 macOS tab 且带对应版本号');

    // 5. 点击 macOS tab 验证切换与本地化语言列表
    const macTab = page.locator('.release-store-tab-btn:has-text("macOS")');
    await macTab.click();
    await page.waitForTimeout(300);
    assert.equal(await macTab.getAttribute('aria-selected'), 'true', '点击后 macOS tab 应处于选中状态');

    // 验证 macOS 平台的本地化语言卡片仅显示 macOS 专属的 2 个语言（zh-Hans, en-US），不应包含 iOS 的 de-DE 和 en-GB
    await page.waitForSelector('.asc-locale-card');
    const macCards = page.locator('.asc-locale-card');
    assert.equal(await macCards.count(), 2, 'macOS 平台应仅显示 2 个本地化语言卡片');
    const macCodes = await page.locator('.asc-locale-card .code-tag').allTextContents();
    assert.deepEqual(macCodes, ['zh-Hans', 'en-US'], 'macOS 平台的语言代码应为 zh-Hans 和 en-US');

    // 6. 切换回 iOS tab 验证显示 iOS 专属的 4 个本地化语言
    const iosTab = page.locator('.release-store-tab-btn:has-text("iOS")');
    await iosTab.click();
    await page.waitForTimeout(300);
    const iosCards = page.locator('.asc-locale-card');
    assert.equal(await iosCards.count(), 4, 'iOS 平台应显示 4 个本地化语言卡片');
    const iosCodes = await page.locator('.asc-locale-card .code-tag').allTextContents();
    assert(iosCodes.includes('de-DE') && iosCodes.includes('en-GB'), 'iOS 平台应包含 de-DE 与 en-GB');

    // 7. 进入第四步“营销内容”，测试点击「准备营销创作」复用创建营销内容组弹窗
    const marketingStep = page.locator('.workflow-step:has-text("营销内容")');
    await marketingStep.click();
    await page.waitForTimeout(300);

    const prepareBtn = page.getByRole('button', { name: '准备营销创作', exact: true });
    await prepareBtn.click();

    // 验证弹出创建营销内容组弹窗
    const groupDialog = page.locator('.marketing-group-dialog');
    await groupDialog.waitFor();
    const groupTitle = await groupDialog.locator('#group-dialog-title').textContent();
    assert.equal(groupTitle?.trim(), '创建营销内容组');

    // 验证自动补充内容组标题和具体内容方向
    const titleInput = groupDialog.locator('input[aria-label="内容组标题"]');
    assert.equal(await titleInput.inputValue(), '多平台助手 v2.1.0 版本更新推广');

    const directionArea = groupDialog.locator('textarea[aria-label="具体内容方向"]');
    const directionVal = await directionArea.inputValue();
    assert(directionVal.includes('v2.1.0 版本更新重点'), '应自动补充具体内容方向');

    // 验证自动勾选了当前产品
    const productStatus = await groupDialog.locator('.product-select-toolbar').textContent();
    assert(productStatus?.includes('已选 1 个产品'), '应自动补充勾选当前产品');

    // 关闭弹窗
    await groupDialog.locator('button[aria-label="关闭"]').click();
    assert.equal(await page.locator('.marketing-group-dialog').count(), 0);

    // 8. 访问产品版本列表页，验证版本号右侧根据实际选择展示平台名称（如 2.1.0 · iOS / macOS）
    await page.goto(`${base}/#page=products&product=prod-multi&tab=history`);
    await page.waitForSelector('.release-row');
    const rowTitle = await page.locator('.release-row b').first().textContent();
    assert.equal(rowTitle, '2.1.0 · iOS / macOS', '版本列表应展示实际选择的多平台名称 iOS / macOS');

    assert.equal(errors.length, 0, `浏览器控制台不应报错: ${errors.join(', ')}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
});
