import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { researchAsoMarkets } from '../server/aso-markets.mjs';
import { runTool } from '../server/mcp-tools.mjs';
test('MCP 默认实时获取所有版本的新语言，返回仅 App 信息配置的语言，失败不伪装成最新快照', async () => {
  const f = fixture();
  let locales = ['zh-Hans'], fail = false, calls = 0;
  const apple = { session: () => ({ request: async path => {
    if (fail) throw Error('Apple 请求失败');
    if (path === '/v1/apps/123?fields[apps]=primaryLocale') return { data: { attributes: { primaryLocale: 'zh-Hans' } } };
    assert.equal(path, '/v1/apps/123/appAvailabilityV2');
    return { data: { type: 'appAvailabilities', id: 'distribution' } };
  }, paginate: async path => {
    calls++;
    if (fail) throw Error('Apple 请求失败');
    if (path.startsWith('/v2/appAvailabilities/')) {
      assert.equal(path, '/v2/appAvailabilities/distribution/territoryAvailabilities?include=territory');
      return { data: ['CHN', 'GBR', 'JPN', 'XKS', 'XXX', 'USA'].map(territory => ({
        attributes: { available: territory !== 'USA' },
        relationships: { territory: { data: { id: territory } } },
      })) };
    }
    if (path.endsWith('/appStoreVersions')) return { data: [{ id: 'old', attributes: { platform: 'IOS', versionString: '1', appVersionState: 'READY_FOR_SALE' } }, { id: 'new', attributes: { platform: 'IOS', versionString: '2', appVersionState: 'READY_FOR_REVIEW' } }] };
    if (path.endsWith('/appInfos')) return { data: [{ id: 'info', attributes: { state: 'READY_FOR_REVIEW' } }] };
    const list = path.includes('/appInfos/') ? [...locales, 'fr-FR'] : path.includes('/old/') ? ['zh-Hans'] : locales;
    return { data: list.map(locale => ({ id: locale, attributes: { ...f.fields, locale } })) };
  } }) };
  try {
    const get = () => runTool(f.store, 'get_aso_context', { productId: 'p' }, { enabled: true, allowWrites: true }, { apple });
    fail = true; await assert.rejects(get(), /Apple 请求失败/); fail = false;
    const first = await get(); assert.equal(first.freshness, 'live');
    assert.equal(first.marketCoverage.freshness, 'live');
    assert.equal(first.marketCoverage.primaryLocale, 'zh-Hans');
    assert.deepEqual(first.marketCoverage.markets.map(m => m.country), ['cn', 'gb', 'jp', 'xk', null]);
    locales.push('ja'); const previousCalls = calls;
    const next = await get(); assert.ok(calls > previousCalls);
    assert.ok(next.insights.aso.localizations.some(l => l.versionId === 'new' && l.locale === 'ja'));
    assert.ok(next.insights.aso.appInfoLocalizations.some(l => l.locale === 'fr-FR'));
    assert.ok(!next.insights.aso.localizations.some(l => l.locale === 'fr-FR'));
    fail = true;
    const fallback = await get();
    assert.equal(fallback.freshness, 'cached');
    assert.equal(fallback.marketCoverage.freshness, 'cached');
    assert.equal(fallback.marketCoverage.syncedAt, next.marketCoverage.syncedAt);
    assert.equal(fallback.cachedAt, next.insights.aso.syncedAt);
    assert.match(fallback.refreshError, /Apple 请求失败/);
    assert.deepEqual(fallback.insights.aso.localizations, next.insights.aso.localizations);
    const state = f.store.read(); state.data.products[0].appStore.appId = '999'; f.store.write(state.data, state.revision);
    await assert.rejects(get(), /Apple 请求失败/);

    const cached = await runTool(f.store, 'get_aso_context', { productId: 'p', refresh: false }, { enabled: true, allowWrites: true }, { apple });
    assert.equal(cached.freshness, 'cached'); assert.equal(cached.marketCoverage.freshness, 'unavailable'); assert.equal(f.writes.length, 0);
  } finally { f.store.close(); }
});


test('多地区查询按各自地区执行，局部失败与空结果可区分', async () => {
  const queries = [{ country: 'jp', term: 'メモ', language: 'ja' }, { country: 'gb', term: 'notes' }];
  const batch = await researchAsoMarkets(queries, async ({ country }) => {
    if (country === 'jp') throw Error('请求超时');
    return { search: { source: 'app-store-search', apps: [] } };
  });
  assert.deepEqual(batch.results, [
    { ...queries[0], error: '请求超时' },
    { ...queries[1], search: { source: 'app-store-search', apps: [] } },
  ]);
});
