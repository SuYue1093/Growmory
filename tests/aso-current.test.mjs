import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTool } from '../server/mcp-tools.mjs';
import { openAso } from '../server/aso.mjs';
test('现状实时读取所选版本的全部语言，每次访问 Apple，新增删除语言立即生效，失败不退回快照', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aso-cache-'));
  const path = join(dir, 'db.sqlite');
  const f = fixture(path);
  let closed = false;
  let calls = 0, fail = false;
  let locales = ['zh-Hans', 'en-US'];
  const apple = { session: () => ({ paginate: async path => {
    calls++;
    if (fail) throw Error('Apple 请求失败');
    if (path.endsWith('/appStoreVersions')) return { data: [{ id: 'v', attributes: { platform: 'IOS', versionString: '2.0', appVersionState: 'READY_FOR_REVIEW' } }, { id: 'mac', attributes: { platform: 'MAC_OS', versionString: '1.0', appVersionState: 'READY_FOR_SALE' } }] };
    if (path.endsWith('/appInfos')) return { data: [{ id: 'i', attributes: { state: 'READY_FOR_REVIEW' } }] };
    return { data: locales.map(locale => ({ id: locale, attributes: { locale, ...f.fields, description: `最新文案 ${calls}` } })) };
  } }) };
  const aso = openAso(f.store, apple);
  try {
    const first = await aso.current('p', { platform: 'IOS', versionId: 'v' });
    assert.equal(first.localizations.length, 2);
    assert.ok(first.localizations.every(l => l.versionId === 'v' && l.infoId === 'i'));
    f.store.productInsights('p', { ...f.store.productInsights('p'), trends: { status: 'ready', rows: [{ date: '2026-11-05', pageViews: 12 }], coverage: {} }, aso: { ...f.store.productInsights('p').aso, localizations: [...f.store.productInsights('p').aso.localizations, { versionId: 'mac', locale: 'zh-Hans', fields: f.fields }] } });
    const count = calls;
    locales = ['zh-Hans', 'de-DE', 'ja'];
    const second = await aso.current('p', { platform: 'IOS', versionId: 'v' });
    assert.ok(calls > count);
    assert.deepEqual(second.localizations.map(l => l.locale), locales);
    assert.notEqual(second.localizations[0].fields.description, first.localizations[0].fields.description);
    assert.ok(second.syncedAt);
    const cache = f.store.productInsights('p');
    assert.equal(cache.aso.localizations.filter(l => l.versionId === 'v').length, 3);
    assert.ok(cache.aso.localizations.some(l => l.versionId === 'mac'));
    assert.ok(!cache.aso.localizations.some(l => l.versionId === 'v' && l.locale === 'en-US'));
    assert.equal(cache.trends.rows[0].pageViews, 12);

    await assert.rejects(aso.current('p', { platform: 'MAC_OS', versionId: 'v' }), /不存在/);
    fail = true;
    await assert.rejects(aso.current('p', { platform: 'IOS', versionId: 'v' }), /Apple 请求失败/);
    assert.equal(f.writes.length, 0);
    f.store.close(); closed = true;
    const reopened = fixture(path);
    try {
      const result = await runTool(reopened.store, 'get_aso_context', { productId: 'p' }, { enabled: true, allowWrites: true }, { apple });
      assert.equal(result.freshness, 'cached');
      assert.equal(result.cachedAt, second.syncedAt);
      assert.match(result.refreshError, /Apple 请求失败/);
      assert.equal(result.insights.aso.localizations.find(l => l.locale === 'ja').fields.description, second.localizations.find(l => l.locale === 'ja').fields.description);
    } finally { reopened.store.close(); }

  } finally { if (!closed) f.store.close(); rmSync(dir, { recursive: true, force: true }); }
});
