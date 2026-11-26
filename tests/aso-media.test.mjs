import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { getOrInitAsoMedia, diagnoseAsoMedia, getDefaultAsoMedia, readStoreCreativePlacements, readLocalizedMedia, submitLocalizedMediaOrder, submitLocalizedMedia, saveMediaDraftGroup } from '../server/aso-media.mjs';
import { runTool } from '../server/mcp-tools.mjs';

test('同一版本和语言允许保存超过旧 40 MB 上限的草稿', () => {
  const image = Buffer.alloc(16 * 1024 * 1024);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(image);
  const data = 'data:image/png;base64,' + image.toString('base64');
  const group = 'IPHONE_DUO_PROFILE';
  const items = [{ name: 'first.png', data }, { name: 'second.png', data }];
  assert.ok(items[0].data.length + items[1].data.length > 40 * 1024 * 1024);
  let saved;
  const store = { asoMediaDraft: (...args) => args.length === 5 ? (saved = args[4]) : [] };
  saveMediaDraftGroup(store, 'p', '123', { versionId: 'v', locale: 'zh-Hans', type: 'APP_SCREENSHOT', group, items });
  assert.deepEqual(saved, [{ type: 'APP_SCREENSHOT', group, items }]);
});

test('getDefaultAsoMedia 生成符合规格的默认 ASO 图片数据', () => {
  const product = { id: 'test-p', name: 'Growmory', summary: 'AI 营销工具', icon: 'data:image/png;base64,iVBORw0KGgo=' };
  const media = getDefaultAsoMedia(product);
  assert.equal(media.productId, 'test-p');
  assert.equal(media.searchResult.title, 'Growmory');
  assert.ok(Array.isArray(media.platformScreenshots.iphone));
  assert.deepEqual(media.platformScreenshots.iphone, []);
  assert.equal(media.searchResult.iconUrl, product.icon);
  assert.equal(media.headerBanner.url, '');
  assert.equal(media.searchResult.rating, undefined);
});

test('getOrInitAsoMedia 在未持久化时自动初始化，并能读写 SQLite', async () => {
  const f = fixture();
  try {
    const media = f.store.asoMedia('p');
    assert.equal(media, null);

    const m = await getOrInitAsoMedia(f.store, 'p');
    assert.equal(m.productId, 'p');
    assert.ok(m.searchResult);
    assert.ok(m.headerBanner);
    assert.ok(m.platformScreenshots.iphone);

    // 再次读取验证持久化成功
    const saved = f.store.asoMedia('p');
    assert.ok(saved);
    assert.equal(saved.productId, 'p');
  } finally {
    f.store.close();
  }
});

test('diagnoseAsoMedia 规则引擎返回完整的维度评分与优化行动项', async () => {
  const f = fixture();
  try {
    const diag = await diagnoseAsoMedia(f.store, 'p', null);
    assert.ok(typeof diag.overallScore === 'number');
    assert.ok(diag.overallScore > 0 && diag.overallScore <= 100);
    assert.ok(diag.summary);
    assert.ok(diag.dimensions.cvr);
    assert.ok(diag.dimensions.visuals);
    assert.ok(diag.dimensions.typography);
    assert.ok(diag.dimensions.contentAlignment);
    assert.ok(Array.isArray(diag.actionItems));
    assert.ok(diag.actionItems.length > 0);
  } finally {
    f.store.close();
  }
});

test('MCP 服务：get_aso_media、analyze_aso_media 和 save_aso_media 协同验证', async () => {
  const f = fixture();
  try {
    // 1. get_aso_media
    const mediaContext = await runTool(f.store, 'get_aso_media', { productId: 'p' }, { enabled: true, allowWrites: true });
    assert.ok(mediaContext.product);
    assert.equal(mediaContext.product.id, 'p');
    assert.ok(mediaContext.media);
    assert.ok(mediaContext.media.searchResult);

    // 2. analyze_aso_media
    const diagResult = await runTool(f.store, 'analyze_aso_media', { productId: 'p' }, { enabled: true, allowWrites: true });
    assert.ok(diagResult.diagnosis);
    assert.ok(diagResult.diagnosis.overallScore > 0);

    // 3. save_aso_media (带修改)
    const saveResult = await runTool(f.store, 'save_aso_media', {
      productId: 'p',
      headerBanner: {
        url: 'https://example.com/banner.png',
        title: '全新版本震撼发布',
        description: '更强大的 ASO 自动化',
      },
      platformScreenshots: {
        iphone: [
          {
            id: 'iphone-1',
            url: 'https://example.com/shot1.png',
            caption: '首图优化大标题',
            subcaption: '秒级转化提升',
            order: 1,
            deviceType: 'iphone_6_9',
          }
        ]
      }
    }, { enabled: true, allowWrites: true });

    assert.equal(saveResult.success, true);
    assert.equal(saveResult.media.headerBanner.title, '全新版本震撼发布');
    assert.equal(saveResult.media.platformScreenshots.iphone[0].caption, '首图优化大标题');

    // 验证 store 中的数据已同步
    const updatedMedia = f.store.asoMedia('p');
    assert.equal(updatedMedia.headerBanner.title, '全新版本震撼发布');
  } finally {
    f.store.close();
  }
});

test('prepare-localization 支持为不存在的语言生成带有 token 的全新可编辑快照', async () => {
  const f = fixture();
  try {
    const prepared = f.aso['prepare-localization']('p', {
      versionId: 'v1',
      infoId: 'info1',
      locale: 'ja',
      version: '1.0.0',
    });

    assert.equal(prepared.locale, 'ja');
    assert.equal(prepared.isNew, true);
    assert.ok(prepared.token);
    assert.deepEqual(prepared.editableFields, ['name', 'subtitle', 'keywords', 'description', 'promotionalText']);
    assert.equal(prepared.fields.name, '');

    // 预览该新增本地化
    const p = await f.aso.preview('p', {
      token: prepared.token,
      fields: {
        name: 'アプリ名',
        subtitle: 'サブタイトル',
        keywords: 'キーワード',
        description: '詳細な説明文です。',
        promotionalText: 'プロモーションテキスト',
      }
    });

    assert.ok(p.token);
    assert.ok(Array.isArray(p.changes));
    assert.equal(p.changes.length, 5);

    // 执行提交该新增本地化
    const res = await f.aso.execute('p', { token: p.token });
    assert.equal(res.success, true);
    assert.ok(res.completed.includes('name'));
    const events = f.store.asoEvents('p');
    assert.ok(events.length > 0);
    assert.equal(events[0].locale, 'ja');
  } finally {
    f.store.close();
  }
});

test('版本下拉框排序：优先按创建时间逆序，无时间时按语义版本号逆序', () => {
  function compareVersionsDesc(a, b) {
    if (a.createdDate && b.createdDate) {
      const timeA = new Date(a.createdDate).getTime();
      const timeB = new Date(b.createdDate).getTime();
      if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
        return timeB - timeA;
      }
    }
    const segsA = (a.version || '').split(/[-_+.]/).map(s => parseInt(s, 10));
    const segsB = (b.version || '').split(/[-_+.]/).map(s => parseInt(s, 10));
    const maxLen = Math.max(segsA.length, segsB.length);
    for (let i = 0; i < maxLen; i++) {
      const numA = isNaN(segsA[i]) ? 0 : segsA[i];
      const numB = isNaN(segsB[i]) ? 0 : segsB[i];
      if (numB !== numA) return numB - numA;
    }
    return (b.version || '').localeCompare(a.version || '');
  }

  const list = [
    { version: '1.0.0', createdDate: '2023-01-01T00:00:00Z' },
    { version: '2.0.0', createdDate: '2024-05-01T00:00:00Z' },
    { version: '1.5.0', createdDate: '2023-06-01T00:00:00Z' },
  ];
  list.sort(compareVersionsDesc);
  assert.equal(list[0].version, '2.0.0');
  assert.equal(list[1].version, '1.5.0');
  assert.equal(list[2].version, '1.0.0');

  const semverList = [
    { version: '1.2.0' },
    { version: '2.0.1' },
    { version: '1.10.0' },
    { version: '1.2.5' },
  ];
  semverList.sort(compareVersionsDesc);
  assert.equal(semverList[0].version, '2.0.1');
  assert.equal(semverList[1].version, '1.10.0');
  assert.equal(semverList[2].version, '1.2.5');
  assert.equal(semverList[3].version, '1.2.0');
});

test('读取已发布 iOS 版本主语言的获批创意展示位', async () => {
  const preview = { width: 1920, height: 1280, templateUrl: 'https://is1.mzstatic.com/image/{w}x{h}.{f}' };
  const group = 'IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE';
  const placement = (placementType, media, id, state = 'PARENT_APPROVED') => ({
    attributes: { placementType, placementGroup: group, state },
    relationships: { [media]: { data: { id, type: media === 'image' ? 'appAssetLibraryImages' : 'appAssetLibraryVideos' } } },
  });
  const client = {
    async request(path) {
      assert.match(path, /primaryLocale/);
      return { data: { attributes: { primaryLocale: 'zh-Hans' } } };
    },
    async paginate(path) {
      if (path.includes('filter[appVersionState]')) return { data: [{ id: 'v', attributes: { versionString: '2.0' } }] };
      if (path === '/v1/appStoreVersions/v/appStoreVersionLocalizations') return {
        data: [{ id: 'en', attributes: { locale: 'en-US' } }, { id: 'zh', attributes: { locale: 'zh-Hans' } }],
      };
      assert.equal(path, '/v1/appStoreVersionLocalizations/zh/placements?include=image,video');
      return {
        data: [
          placement('APP_STORE_SEARCH_RESULTS_ASSET', 'image', 'img', 'ACTIVE'),
          placement('PRODUCT_PAGE_HEADER_ASSET', 'video', 'video'),
          placement('PRODUCT_PAGE_HEADER_ASSET', 'image', 'img', 'PARENT_IN_REVIEW'),
          placement('SEARCH_RESULTS_ADS_ASSET', 'image', 'img'),
        ],
        included: [
          { id: 'img', type: 'appAssetLibraryImages', attributes: { imageAsset: preview } },
          { id: 'video', type: 'appAssetLibraryVideos', attributes: { previewFrameImage: { image: preview }, videoAsset: 'https://apptrailers.itunes.apple.com/preview.m3u8' } },
        ],
      };
    },
  };
  const result = await readStoreCreativePlacements(client, '123');
  assert.equal(result.locale, 'zh-Hans');
  assert.equal(result.version, '2.0');
  assert.deepEqual(result.search, [{ group, width: 1920, height: 1280, url: 'https://is1.mzstatic.com/image/1920x1280.png', video: false }]);
  assert.equal(result.header.length, 1);
  assert.equal(result.header[0].video, true);
  assert.equal(result.header[0].url, 'https://is1.mzstatic.com/image/1920x1280.png');
  assert.equal(result.header[0].videoUrl, 'https://apptrailers.itunes.apple.com/preview.m3u8');
});


test('按本地化读取高清素材，提交时校验版本、截图顺序并回读', async () => {
  const group = 'IPHONE_DYNAMIC_ISLAND_MEDIUM_PROFILE';
  let ids = ['video', 'a', 'b'];
  let writes = 0;
  const client = {
    async request(path, method, payload) {
      if (path.startsWith('/v1/appStoreVersions/v?')) return { data: {
        attributes: { appVersionState: 'PREPARE_FOR_SUBMISSION' },
        relationships: { app: { data: { id: '123' } } },
      } };
      assert.equal(path, '/v1/appAssetLibraryPlacementOrderingRequests');
      assert.equal(method, 'POST');
      const relationships = payload.data.relationships;
      assert.equal(relationships.appStoreVersionLocalization.data.id, 'en');
      ids = relationships.orderedPlacements.data.map(item => item.id);
      writes++;
      return {};
    },
    async paginate(path) {
      if (path.endsWith('/appStoreVersionLocalizations')) return { data: [
        { id: 'zh', attributes: { locale: 'zh-Hans' } }, { id: 'en', attributes: { locale: 'en-GB' } },
      ] };
      assert.match(path, /sort=placementGroupPosition/);
      if (path.includes('/zh/')) return { data: [], included: [] };
      return { data: ids.map(id => ({
        id, attributes: { placementType: id === 'video' ? 'APP_PREVIEW' : 'APP_SCREENSHOT', placementGroup: group, state: 'ACTIVE' },
        relationships: id === 'video' ? {} : { image: { data: { type: 'appAssetLibraryImages', id: 'img' } } },
      })), included: [{
        id: 'img', type: 'appAssetLibraryImages',
        attributes: { imageAsset: { width: 1179, height: 2556, templateUrl: 'https://is1-ssl.mzstatic.com/image/{w}x{h}bb.{f}' } },
      }] };
    },
  };
  const target = { versionId: 'v', locale: 'en-GB', group };
  const current = await readLocalizedMedia(client, '123', 'v', target.locale);
  assert.deepEqual(current.locales, ['zh-Hans', 'en-GB']);
  assert.equal(current.assets[1].url, 'https://is1-ssl.mzstatic.com/image/1179x2556bb.png');
  assert.deepEqual((await readLocalizedMedia(client, '123', 'v', 'zh-Hans')).assets, []);
  await assert.rejects(readLocalizedMedia(client, 'another', 'v', 'en-GB'), /不属于/);
  await assert.rejects(submitLocalizedMediaOrder(client, '123', { ...target, revision: current.revision, order: ['a', 'foreign'] }), /设备组/);
  const change = { ...target, revision: current.revision, order: ['b', 'a'] };
  assert.deepEqual((await submitLocalizedMediaOrder(client, '123', change)).assets.map(asset => asset.id), ['video', 'b', 'a']);
  await assert.rejects(submitLocalizedMediaOrder(client, '123', change), /已变化/);
  assert.equal(writes, 1);
});


test('美国英语缺少创意素材时优先展示英国英语，且不影响截图回退与提交版本号', async () => {
  const search = 'APP_STORE_SEARCH_RESULTS_ASSET';
  const header = 'PRODUCT_PAGE_HEADER_ASSET';
  const screenshot = 'APP_SCREENSHOT';
  const image = { type: 'appAssetLibraryImages', id: 'image',
    attributes: { imageAsset: { width: 1920, height: 1280, templateUrl: 'https://is1.mzstatic.com/image/{w}x{h}.{f}' } } };
  const placement = (id, placementType, placementGroup = 'DEFAULT_PROFILE', state = 'PARENT_PREPARE_FOR_SUBMISSION') => ({
    id, attributes: { placementType, placementGroup, state }, relationships: { image: { data: { type: image.type, id: image.id } } },
  });
  const placements = {
    'en-US': [],
    'zh-Hans': [placement('zh-search', search), placement('zh-header', header), placement('zh-screen', screenshot)],
    'en-GB': [placement('gb-search', search), placement('gb-header', header), placement('gb-screen', screenshot),
      placement('failed', header, 'IPAD_13_PROFILE', 'ASSET_PROCESSING')],
    'en-CA': [],
  };
  const primaryLocale = 'zh-Hans';
  const client = {
    async request() {
      return { data: { attributes: { appVersionState: 'PREPARE_FOR_SUBMISSION' }, relationships: { app: { data: { id: 'app' } } } },
        included: [{ type: 'apps', id: 'app', attributes: { primaryLocale } }] };
    },
    async paginate(path) {
      if (path.endsWith('/appStoreVersionLocalizations')) {
        return { data: Object.keys(placements).map(locale => ({ id: locale, attributes: { locale } })) };
      }
      const locale = path.split('/')[3];
      return { data: placements[locale], included: [image] };
    },
  };
  const read = options => readLocalizedMedia(client, 'app', 'version', 'en-US', options);
  const current = await read();
  const withFallbacks = await read({ includeFallbacks: true });
  assert.deepEqual(withFallbacks.assets, []);
  assert.equal(withFallbacks.revision, current.revision);
  assert.deepEqual(withFallbacks.fallbackAssets.map(({ id, sourceLocale }) => [id, sourceLocale]),
    [['gb-search', 'en-GB'], ['gb-header', 'en-GB'], ['zh-screen', 'zh-Hans']]);
  placements['en-CA'] = [placement('ca-search', search)];
  assert.deepEqual((await read({ includeFallbacks: true })).fallbackAssets.map(({ id }) => id), ['gb-header', 'zh-screen']);
  placements['en-GB'] = [];
  placements['en-CA'] = [];
  assert.deepEqual((await read({ includeFallbacks: true })).fallbackAssets.map(({ id }) => id),
    ['zh-search', 'zh-header', 'zh-screen']);
});

test('替换单图展示位时先上传并校验 Apple 规格，再移除旧图', async () => {
  const type = 'PRODUCT_PAGE_HEADER_ASSET';
  const group = 'DEFAULT_PROFILE';
  let placements = [{ id: 'old', attributes: { placementType: type, placementGroup: group } }];
  let allowedSpec = 'other';
  const events = [];
  const client = {
    async paginate(path) {
      if (path.endsWith('appStoreVersionLocalizations')) return { data: [{ id: 'loc', attributes: { locale: 'zh-Hans' } }] };
      return { data: placements, included: [] };
    },
    async request(path, method, payload) {
      if (path.startsWith('/v1/appStoreVersions/')) return { data: { attributes: { appVersionState: 'PREPARE_FOR_SUBMISSION' }, relationships: { app: { data: { id: 'app' } } } } };
      if (path.endsWith('/assetLibrary')) return { data: { id: 'library' } };
      if (path.includes('appAssetLibraryRefData')) return { data: [{ attributes: { placementTypes: [{ placementTypeId: type, specMappings: [{ placementGroupId: group, specs: [allowedSpec] }] }] } }] };
      if (path === '/v1/appAssetLibraryImages') return { data: { id: 'image', attributes: { uploadOperations: [{ method: 'PUT', url: 'https://store-030.blobstore.apple.com/asset', offset: 0, length: 8, requestHeaders: [] }] } } };
      if (path.endsWith('/appAssetLibraryImages/image')) {
        if (method === 'PATCH') { events.push('commit'); return {}; }
        return { data: { attributes: { state: 'PREPARE_FOR_SUBMISSION', specId: 'spec' } } };
      }
      if (method === 'DELETE') {
        assert.equal(path, '/v1/appAssetLibraryPlacements/old');
        events.push('remove'); placements = [];
        return {};
      }
      assert.equal(path, '/v1/appAssetLibraryPlacements');
      assert.equal(payload.data.relationships.image.data.id, 'image');
      events.push('place');
      const data = { id: 'new', attributes: payload.data.attributes };
      placements = [data];
      return { data };
    },
  };
  const snapshot = await readLocalizedMedia(client, 'app', 'version', 'zh-Hans');
  const input = { versionId: 'version', locale: 'zh-Hans', revision: snapshot.revision,
    changes: [{ type, group, items: [{ name: 'new.png', data: 'data:image/png;base64,iVBORw0KGgo=' }] }] };
  const fetcher = async () => { events.push('upload'); return { ok: true }; };
  await assert.rejects(submitLocalizedMedia(client, 'app', input, fetcher), /规格与目标展示位不匹配/);
  assert.deepEqual(events, ['upload', 'commit']);
  assert.equal(placements[0].id, 'old');
  allowedSpec = 'spec';
  events.length = 0;
  assert.equal((await submitLocalizedMedia(client, 'app', input, fetcher)).assets[0].id, 'new');
  assert.deepEqual(events, ['upload', 'commit', 'remove', 'place']);
});

test('Agent 保存 ASO 报告后，用户可将同报告的多语言建议一次写入草稿', async () => {
  const f = fixture();
  try {
    const access = { enabled: true, allowWrites: true };
    const before = { name: '原名称', subtitle: '', keywords: '', description: '原描述', promotionalText: '' };
    const proposal = { title: '首屏文案', objective: '讲清核心场景', market: 'CN', analysis: '依据商店素材',
      target: { versionId: 'v1', infoId: 'info1', locale: 'zh-Hans' }, before, fields: { ...before, subtitle: '新副标题' } };
    const report = await runTool(f.store, 'save_aso_report', {
      productId: 'p', title: '商店诊断', summary: '首屏优化', content: '# 优化建议',
      plans: [proposal, { ...proposal, target: { ...proposal.target, locale: 'en-US' } }],
    }, access);
    assert.deepEqual(f.aso.research('p').plans, []);
    assert.equal(f.aso.reports('p')[0].id, report.id);
    assert.deepEqual(f.aso['apply-report']('p', { reportId: report.id }), { count: 2 });
    assert.deepEqual(f.aso['apply-report']('p', { reportId: report.id }), { count: 0 });
    const drafts = f.aso.research('p').plans;
    assert.deepEqual(drafts.map(item => item.target.locale), ['zh-Hans', 'en-US']);
    assert.ok(drafts.every(item => item.origin === 'mcp' && item.status === 'draft' && item.fields.subtitle === '新副标题'));
  } finally {
    f.store.close();
  }
});

test('Agent 图片草稿按版本和语言隔离，重跑仅替换同组', async () => {
  const f = fixture();
  try {
    const client = {
      request: async (_path, method) => {
        assert.equal(method, undefined);
        return { data: { attributes: {}, relationships: { app: { data: { id: '123' } } } } };
      },
      paginate: async path => path.includes('/placements')
        ? { data: [], included: [] }
        : { data: [{ id: 'loc', attributes: { locale: 'zh-Hans' } }] },
    };
    const options = { apple: { status: () => ({ configured: true }), session: () => client } };
    const input = { productId: 'p', versionId: 'v1', locale: 'zh-Hans', type: 'APP_SCREENSHOT',
      group: 'IPHONE_FACE_ID_LARGE_PROFILE', images: [{ name: 'first.png', data: 'data:image/png;base64,iVBORw0KGgo=' }] };
    const save = patch => runTool(f.store, 'save_aso_media_draft', { ...input, ...patch }, { enabled: true, allowWrites: true }, options);
    assert.throws(() => runTool(f.store, 'save_aso_media_draft', input, { enabled: true, allowWrites: false }, options), /只读/);
    assert.equal((await save()).count, 1);
    await save({ group: 'IPAD_13_PROFILE' });
    await save({ images: [{ ...input.images[0], name: 'replacement.png' }] });
    await assert.rejects(save({ locale: 'ja' }), /没有这个本地化语言/);
    assert.deepEqual(f.store.asoMediaDraft('p', '123', 'v1', 'zh-Hans').map(group => group.items[0].name), ['replacement.png', 'first.png']);
    assert.deepEqual(f.store.asoMediaDraft('p', '123', 'v1', 'ja'), []);
    assert.deepEqual(f.store.asoMediaDraft('p', '123', 'v2', 'zh-Hans'), []);
    f.store.clearAsoMediaDraft('p', '123', 'v1', 'zh-Hans');
    assert.deepEqual(f.store.asoMediaDraft('p', '123', 'v1', 'zh-Hans'), []);
  } finally {
    f.store.close();
  }
});

test('支持 S3 / 泛 Apple 域名和超长分块上传，不会误判为操作无效', async () => {
  const type = 'PRODUCT_PAGE_HEADER_ASSET';
  const group = 'DEFAULT_PROFILE';
  let placements = [];
  const client = {
    async paginate(path) {
      if (path.endsWith('appStoreVersionLocalizations')) return { data: [{ id: 'loc', attributes: { locale: 'zh-Hans' } }] };
      return { data: placements, included: [] };
    },
    async request(path, method, payload) {
      if (path.startsWith('/v1/appStoreVersions/')) return { data: { attributes: { appVersionState: 'PREPARE_FOR_SUBMISSION' }, relationships: { app: { data: { id: 'app' } } } } };
      if (path.endsWith('/assetLibrary')) return { data: { id: 'library' } };
      if (path.includes('appAssetLibraryRefData')) return { data: [{ attributes: { placementTypes: [{ placementTypeId: type, specMappings: [{ placementGroupId: group, specs: ['spec'] }] }] } }] };
      if (path === '/v1/appAssetLibraryImages') {
        return {
          data: {
            id: 'image-s3',
            attributes: {
              uploadOperations: [
                { method: 'PUT', url: 'https://app-store-connect.s3.amazonaws.com/chunk1', offset: 0, length: 1024, requestHeaders: [{ name: 'Content-Type', value: 'image/png' }] },
              ],
            },
          },
        };
      }
      if (path.endsWith('/appAssetLibraryImages/image-s3')) {
        if (method === 'PATCH') return {};
        return { data: { attributes: { state: 'APPROVED', specId: 'spec' } } };
      }
      if (path === '/v1/appAssetLibraryPlacements') {
        const data = { id: 'placed', attributes: payload.data.attributes };
        placements = [data];
        return { data };
      }
      return {};
    },
  };

  const snapshot = await readLocalizedMedia(client, 'app', 'version', 'zh-Hans');
  const input = {
    versionId: 'version',
    locale: 'zh-Hans',
    revision: snapshot.revision,
    changes: [{ type, group, items: [{ name: 'test.png', data: 'data:image/png;base64,iVBORw0KGgo=' }] }],
  };
  const uploadedUrls = [];
  const fetcher = async (url, options) => {
    uploadedUrls.push(url.toString());
    assert.equal(options.body.length, 8); // clamped to actual file length (8 bytes) despite part.length = 1024
    return { ok: true };
  };
  const result = await submitLocalizedMedia(client, 'app', input, fetcher);
  assert.equal(result.assets[0].id, 'placed');
  assert.deepEqual(uploadedUrls, ['https://app-store-connect.s3.amazonaws.com/chunk1']);
});
