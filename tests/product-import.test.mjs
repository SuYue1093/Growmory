import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { importAppleProducts } from '../server/product-import.mjs';
const empty = () => ({ products: [], docs: [], docFolders: [], releases: [], contents: [], tasks: [] });
function connection(fail = false) {
  return {
    session: () => ({ check() {}, paginate: async path => {
      if (path.endsWith('analyticsReportRequests')) return { data: [] };
      if (path.endsWith('appStoreVersions')) return { data: [{ id: 'v1', attributes: { appStoreState: 'READY_FOR_SALE', platform: 'IOS', versionString: '1.0' } }] };
      if (path.endsWith('/appInfos')) return { data: [{ id: 'i1', attributes: { state: 'READY_FOR_SALE' } }] };
      return { data: [{ attributes: { locale: 'zh-Hans', name: '真实产品', subtitle: '副标题', keywords: '关键词', description: '来自 Apple 的介绍', marketingUrl: 'https://example.com' } }] };
    } }),
    apps: async () => ({ apps: [{ id: '123', name: '真实产品', bundleId: 'com.example.app' }] }),
    versions: async () => { if (fail) throw Error('读取失败'); return { appId: '123', syncedAt: new Date().toISOString(), versions: [{ id: 'v1', version: '1.0', platform: 'IOS', state: 'READY_FOR_SALE', notes: [] }] }; },
  };
}
test('从 Apple 创建产品但不生成介绍资料，重复同步保留用户完善内容', async () => {
  const store = openStore(':memory:', empty());
  try {
    const first = await importAppleProducts(store, connection());
    assert.equal(first.imported, 1);
    assert.equal(first.sync[0].aso, 'ready');
    assert.equal(first.sync[0].trends, 'not_requested');
    assert.equal(store.productInsights(first.data.products[0].id).aso.localizations[0].fields.keywords, '关键词');
    assert.equal(first.data.products[0].appStore.bundleId, 'com.example.app');
    assert.deepEqual(first.data.docs, []);
    assert.equal(first.data.products[0].website, 'https://example.com');
    first.data.docs.push({ id: 'user-doc', productId: first.data.products[0].id, title: '用户资料', body: '手动整理的产品介绍', status: 'confirmed', history: [], updatedAt: new Date().toISOString() });
    first.data.products[0].summary = '用户补充';
    first.data.products[0].name = '用户命名';
    store.write(first.data, first.revision);
    const again = await importAppleProducts(store, connection());
    assert.equal(again.imported, 0);
    assert.equal(again.data.products.length, 1);
    assert.deepEqual(again.data.docs, first.data.docs);
    assert.equal(again.data.products[0].summary, '用户补充');
    assert.equal(again.data.products[0].name, '用户命名');
  } finally { store.close(); }
});
test('Apple 读取失败不写入半成品，读取期间发生本地编辑时拒绝覆盖', async () => {
  const store = openStore(':memory:', empty());
  try {
    await assert.rejects(importAppleProducts(store, connection(true)), /读取失败/);
    assert.equal(store.read().revision, 0);
    const apple = connection();
    const versions = apple.versions;
    apple.versions = async () => { store.write(empty(), 0); return versions(); };
    await assert.rejects(importAppleProducts(store, apple), /工作区已变化/);
    assert.equal(store.read().data.products.length, 0);
  } finally { store.close(); }
});
test('只导入选中的 App，拒绝空选择及未知 App', async () => {
  const store = openStore(':memory:', empty());
  try {
    const apple = connection();
    apple.apps = async () => ({ apps: [{ id: '123', name: '已选', bundleId: 'com.selected' }, { id: '456', name: '未选', bundleId: 'com.other' }] });
    for (const ids of [[], ['missing'], '123']) {
      await assert.rejects(importAppleProducts(store, apple, ids), /请选择有效的产品/);
      assert.equal(store.read().revision, 0);
    }
    const result = await importAppleProducts(store, apple, ['123']);
    assert.equal(result.total, 1);
    assert.deepEqual(result.data.docs, []);
    assert.deepEqual(result.data.products.map(p => p.appId), ['123']);
  } finally { store.close(); }
});

test('初始化导入图标，重复同步保留现有 Logo，缺失时补齐且失败不阻断产品导入', async () => {
  const store = openStore(':memory:', empty());
  const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=';
  try {
    const apple = connection();
    let calls = 0;
    apple.icon = async () => { calls++; return icon; };
    const first = await importAppleProducts(store, apple);
    assert.equal(first.data.products[0].icon, icon);
    assert.equal(first.sync[0].icon, 'imported');
    first.data.products[0].icon = '/icons/firefly.jpg';
    store.write(first.data, first.revision);
    const again = await importAppleProducts(store, apple);
    assert.equal(again.data.products[0].icon, '/icons/firefly.jpg');
    assert.equal(again.sync[0].icon, 'preserved');
    assert.equal(calls, 1);
    delete again.data.products[0].icon;
    store.write(again.data, again.revision);
    apple.icon = async () => { throw Error('图标读取失败'); };
    const missing = await importAppleProducts(store, apple);
    assert.equal(missing.data.products.length, 1);
    assert.equal(missing.sync[0].icon, 'unavailable');
    apple.icon = async () => icon;
    const patched = await importAppleProducts(store, apple);
    assert.equal(patched.data.products[0].icon, icon);
    assert.equal(patched.data.docs.length, 0);
  } finally { store.close(); }
});
