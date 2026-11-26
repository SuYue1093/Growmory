import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPublication } from '../server/publication.mjs';
import { openAso } from '../server/aso.mjs';

test('版本发布第二步：多平台切换时，各平台读取与显示数据准确独立隔离', async () => {
  const mockProduct = {
    id: 'prod-test',
    name: '测试应用',
    summary: '简介',
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
        { id: 'v-ios-1', version: '2.0.0', platform: 'IOS', state: 'READY_FOR_SALE', notes: [{ locale: 'zh-Hans', body: 'iOS 2.0 中文' }, { locale: 'en-US', body: 'iOS 2.0 English' }] },
        { id: 'v-mac-1', version: '1.0.0', platform: 'MAC_OS', state: 'READY_FOR_SALE', notes: [{ locale: 'zh-Hans', body: 'macOS 1.0 中文' }] },
      ],
    },
  };

  const mockRelease = {
    id: 'rel-test-1',
    productId: 'prod-test',
    version: '2.1.0',
    changes: 'iOS 主说明',
    platforms: ['IOS', 'MAC_OS'],
    platformDetails: {
      IOS: { version: '2.1.0', changes: 'iOS 2.1 专属说明', notes: [{ language: 'zh-Hans', body: 'iOS 2.1 本地化' }] },
      MAC_OS: { version: '1.1.0', changes: 'macOS 1.1 专属说明', notes: [{ language: 'zh-Hans', body: 'macOS 1.1 专属本地化' }] },
    },
    languages: ['zh-Hans'],
    channels: ['App Store'],
    status: 'preparing',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: [{ language: 'zh-Hans', body: 'iOS 2.1 本地化', approved: true }],
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

  const mockStore = {
    read: () => ({ data: testData, revision: 1 }),
    write: (data) => { testData.releases = data.releases; },
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
          return { data: [{ id: 'v-mac-remote', attributes: { versionString: '1.1.0', platform: 'MAC_OS' } }] };
        }
        if (url.includes('/v-ios-remote/appStoreVersionLocalizations')) {
          return {
            data: [
              { attributes: { locale: 'zh-Hans', whatsNew: '来自 Apple 远端的 iOS 更新说明' } },
              { attributes: { locale: 'en-US', whatsNew: 'Remote iOS English' } },
            ],
          };
        }
        if (url.includes('/v-mac-remote/appStoreVersionLocalizations')) {
          return {
            data: [
              { attributes: { locale: 'zh-Hans', whatsNew: '来自 Apple 远端的 macOS 更新说明' } },
            ],
          };
        }
        return { data: [] };
      },
      request: async () => ({ data: null }),
    }),
  };

  const pub = openPublication(mockStore, mockApple);

  // 1. 读取 iOS 状态，校验返回 iOS 远端数据
  const iosStatus = await pub.status('rel-test-1', 'IOS');
  assert.equal(iosStatus.version, '2.1.0');
  assert.equal(iosStatus.localizations[0].locale, 'zh-Hans');
  assert.equal(iosStatus.localizations[0].whatsNew, '来自 Apple 远端的 iOS 更新说明');

  // 2. 切换读取 macOS 状态，校验返回 macOS 远端数据，不被 iOS 数据污染
  const macStatus = await pub.status('rel-test-1', 'MAC_OS');
  assert.equal(macStatus.version, '1.1.0');
  assert.equal(macStatus.localizations[0].locale, 'zh-Hans');
  assert.equal(macStatus.localizations[0].whatsNew, '来自 Apple 远端的 macOS 更新说明');
  assert.equal(macStatus.localizations.length, 1);
});

test('ASO文案与本地化：未添加的本地化语言草稿不应误入显示表格，且添加本地化可正常选择并载入草稿', async () => {
  const mockProduct = {
    id: 'prod-aso',
    name: 'ASO测试应用',
    summary: '简介',
    appId: '987654321',
    price: '免费',
    platform: 'iOS',
    website: 'https://example.com',
    color: '#0071e3',
    appStore: {
      appId: '987654321',
      name: 'ASO测试应用',
      bundleId: 'com.example.aso',
      syncedAt: '2026-01-01T00:00:00.000Z',
      versions: [
        { id: 'v-aso-1', version: '1.0.0', platform: 'IOS', state: 'PREPARE_FOR_SUBMISSION', notes: [{ locale: 'zh-Hans', body: '初始说明' }] }
      ],
    },
  };

  const plans = [
    {
      id: 'plan-ja',
      origin: 'mcp',
      status: 'draft',
      target: { versionId: 'v-aso-1', infoId: 'info-1', locale: 'ja' },
      fields: {
        name: 'Growmory 日文版',
        subtitle: 'メモとリフレクション',
        keywords: 'メモ,手帳,習慣,ノート',
        description: '日文描述详情',
        promotionalText: '日文推广',
      },
      before: { name: '', subtitle: '', keywords: '', description: '', promotionalText: '' },
    },
  ];

  const store = {
    read: () => ({
      data: {
        products: [mockProduct],
        releases: [],
        docs: [],
        contents: [],
      },
      revision: 1,
    }),
    write: () => {},
    asoWorkspace: () => ({ plans }),
    productInsights: () => ({
      aso: {
        localizations: [
          { locale: 'zh-Hans', versionId: 'v-aso-1', infoId: 'info-1', version: '1.0.0', platform: 'IOS', fields: { name: 'Growmory', subtitle: '记录', keywords: '笔记', description: '中文描述', promotionalText: '' } }
        ]
      }
    }),
  };

  const aso = openAso(store, { status: () => ({ configured: false }) });

  // 1. prepare-localization 支持为全新未添加语言 ja 生成快照
  const prepJa = aso['prepare-localization']('prod-aso', {
    versionId: 'v-aso-1',
    infoId: 'info-1',
    locale: 'ja',
    version: '1.0.0',
  });
  assert.equal(prepJa.locale, 'ja');
  assert.equal(prepJa.isNew, true);
  assert.ok(prepJa.token);

  // 2. 校验通过 preview 写入新语言文案，能关联上 draft planId
  const previewResult = await aso.preview('prod-aso', {
    token: prepJa.token,
    fields: plans[0].fields,
    planId: 'plan-ja',
  });
  assert.ok(previewResult.token);
  assert.ok(previewResult.changes.some(c => c.field === 'name' && c.after === 'Growmory 日文版'));
});

