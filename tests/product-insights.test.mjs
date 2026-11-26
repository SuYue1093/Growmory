import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseReport, downloadSegment, readTrends, readProductInsights, openProductInsights } from '../server/product-insights.mjs';
import { openStore } from '../server/store.mjs';
const header = 'Date\tApp Apple Identifier\tCounts\tDownload Type\tSource Type\tTerritory\n';
const text = (date, count) => header + `${date}\t123\t${count}\tFirst-time Download\tApp Store search\tCHN\n`;
function fixture() {
  const calls = [], files = new Map();
  const segments = (id, value) => { const bytes = gzipSync(value); const url = `https://test.s3.amazonaws.com/${id}.gz`; files.set(url, bytes); return { id, attributes: { url, sizeInBytes: bytes.length, checksum: createHash('md5').update(bytes).digest('hex') } }; };
  const data = {
    '/v1/apps/123/analyticsReportRequests': [{ id: 'request', attributes: { accessType: 'ONGOING' } }],
    '/v1/analyticsReportRequests/request/reports': [{ id: 'detailed', attributes: { name: 'App Store Downloads Detailed' } }, { id: 'report', attributes: { name: 'App Store Downloads Standard' } }],
    '/v1/analyticsReports/report/instances?filter[granularity]=DAILY': [{ id: 'old', attributes: { granularity: 'DAILY', processingDate: '2026-10-31' } }, { id: 'new', attributes: { granularity: 'DAILY', processingDate: '2026-11-01' } }],
    '/v1/analyticsReportInstances/old/segments': [segments('old', text('2026-10-30', 100))],
    '/v1/analyticsReportInstances/new/segments': [segments('new1', text('2026-10-30', 3)), segments('new2', text('2026-10-30', 4) + '2026-10-31\t123\t2\tRedownload\tApp Store browse\tUSA\n')],
  };
  return { calls, data, reader: { check() {}, async paginate(path) { calls.push(path); if (!data[path]) throw Error('unexpected ' + path); return { data: data[path] }; } }, fetcher: async (url, options) => { assert.equal(options.method, 'GET'); assert.equal(options.headers, undefined); if (!files.has(url)) throw Error('unexpected download'); return new Response(files.get(url)); } };
}
test('趋势 TSV 区分下载和更新、按 App 过滤，支持带引号字段，拒绝损坏数据', () => {
  const rows = parseReport(text('2026-10-30', 3) + '2026-10-30\t123\t9\tAuto-update\t"Web\treferrer"\tCHN\n2026-10-30\t456\t100\tFirst-time Download\tOther\tUSA\n', '123', 'downloads');
  assert.equal(rows.reduce((n, r) => n + r.firstDownloads, 0), 3);
  assert.equal(rows[1].source, 'Web\treferrer');
  const engagement = 'Date\tApp Apple Identifier\tCounts\tEvent\tPage Type\n2026-10-30\t123\t5\tImpression\tNo page\n2026-10-30\t123\t2\tPage view\tProduct page\n2026-10-30\t123\t4\tPage view\tDeveloper page\n';
  const [row] = parseReport(engagement, '123', 'engagement');
  assert.equal(row.impressions, 5); assert.equal(row.pageViews, 2);
  assert.throws(() => parseReport(text('2026-10-30', -1), '123', 'downloads'), /无效/);
  assert.throws(() => parseReport('Date\tCounts\n', '123', 'downloads'), /缺少字段/);
});
test('读取趋势使用标准日报与全部分片，新 processingDate 按日期覆盖旧数据，重复读取不累加', async () => {
  const f = fixture(), options = { fetcher: f.fetcher, now: new Date('2026-11-05') };
  const result = await readTrends(f.reader, '123', null, options);
  assert.equal(result.status, 'partial');
  assert.equal(result.rows.reduce((n, r) => n + r.firstDownloads, 0), 7);
  assert.equal(result.rows.reduce((n, r) => n + r.redownloads, 0), 2);
  assert.deepEqual(result.coverage.downloads, ['2026-10-30', '2026-10-31']);
  f.calls.length = 0;
  const again = await readTrends(f.reader, '123', result, options);
  assert.deepEqual(again.rows, result.rows);
  assert.equal(again.syncedAt, result.syncedAt);
  assert.ok(f.calls.every(path => !path.endsWith('/segments')));
  const cached = { ...result, rows: [{ ...result.rows[0], date: "2026-10-30", firstDownloads: 50, processingDate: "2026-11-03" }] };
  const stale = await readTrends(f.reader, "123", cached, options);
  assert.equal(stale.rows.filter(r => r.date === "2026-10-30").reduce((n, r) => n + r.firstDownloads, 0), 50);
  assert.ok(f.calls.every(p => !p.includes('salesReports') && !p.includes('detailed')));
});
test('曝光报表失败时保留上次数据，继续下载新实例并按事件日期覆盖', async () => {
  const f = fixture(), options = { fetcher: f.fetcher, now: new Date('2026-11-05') };
  const previous = await readTrends(f.reader, '123', null, options);
  const engagement = { ...previous.rows[0], kind: 'engagement', impressions: 20 };
  previous.rows.push(engagement);
  previous.coverage.engagement = [engagement.date];
  f.data['/v1/analyticsReportRequests/request/reports'].push({ id: 'engagement', attributes: { name: 'App Store Discovery and Engagement Standard' } });
  const reports = f.data['/v1/analyticsReports/report/instances?filter[granularity]=DAILY'];
  reports.push({ id: 'correction', attributes: { granularity: 'DAILY', processingDate: '2026-11-04' } });
  f.data['/v1/analyticsReportInstances/correction/segments'] = f.data['/v1/analyticsReportInstances/old/segments'];
  f.calls.length = 0;
  const result = await readTrends(f.reader, '123', previous, options);
  assert.equal(result.status, 'partial');
  assert.equal(result.reportSyncFailed, true);
  assert.match(result.message, /曝光与互动报表同步失败/);
  assert.deepEqual(result.rows.find(row => row.kind === 'engagement'), engagement);
  assert.equal(result.rows.filter(row => row.kind === 'downloads').reduce((sum, row) => sum + row.firstDownloads, 0), 100);
  assert.deepEqual(f.calls.filter(path => path.endsWith('/segments')), ['/v1/analyticsReportInstances/correction/segments']);
});
test('分片校验大小与 MD5，不向下载地址发送 Apple 凭据，拒绝不可信地址', async () => {
  const bytes = gzipSync('test');
  const segment = { attributes: { url: 'https://test.s3.amazonaws.com/file', sizeInBytes: bytes.length, checksum: createHash('md5').update(bytes).digest('hex') } };
  assert.equal(await downloadSegment(segment, async (_, opts) => { assert.equal(opts.headers, undefined); return new Response(bytes); }), 'test');
  await assert.rejects(downloadSegment({ attributes: { ...segment.attributes, checksum: 'bad' } }, async () => new Response(bytes)), /校验失败/);
  await assert.rejects(downloadSegment({ attributes: { ...segment.attributes, sizeInBytes: 1 } }, async () => new Response(bytes)), /大小不匹配/);
  await assert.rejects(downloadSegment({ attributes: { url: 'http://127.0.0.1/file' } }), /地址无效/);
});
test('同步 ASO 和趋势独立成功，权限失败保留旧曲线；SQLite 重开与关联隔离', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growmory-insights-'));
  const initial = { products: [{ id: 'p', name: '测试', summary: '', appId: '123', price: '', platform: '', website: '', color: 'blue', appStore: { appId: '123', name: '测试', bundleId: 'com.test', syncedAt: '', versions: [] } }], docs: [], docFolders: [], releases: [], contents: [], tasks: [] };
  let store = openStore(join(dir, 'db.sqlite'), initial);
  try {
    const apple = { session: () => ({ check() {}, async paginate(path) {
      if (path.endsWith('analyticsReportRequests')) throw Error('此 API Key 没有操作权限');
      if (path.endsWith('appStoreVersions')) return { data: [{ id: 'v', attributes: { appStoreState: 'READY_FOR_SALE', platform: 'IOS', versionString: '1.0' } }] };
      if (path.endsWith('/appInfos')) return { data: [{ id: 'i', attributes: { state: 'READY_FOR_SALE' } }] };
      if (path.endsWith('appInfoLocalizations')) return { data: [{ attributes: { locale: 'zh-Hans', name: '测试名称', subtitle: '副标题' } }] };
      return { data: [{ attributes: { locale: 'zh-Hans', keywords: '关键词', description: '介绍', promotionalText: '推广' } }] };
    } }) };
    const previous = { appId: '123', trends: { status: 'ready', rows: [{ date: '2026-10-30', firstDownloads: 5 }], coverage: { downloads: ['2026-10-30'] }, syncedAt: '2026-10-31' } };
    const result = await readProductInsights(apple, '123', previous);
    assert.equal(result.aso.status, 'ready'); assert.equal(result.aso.localizations[0].fields.keywords, '关键词');
    assert.equal(result.trends.status, 'forbidden'); assert.deepEqual(result.trends.rows, previous.trends.rows);
    assert.equal(result.trends.syncedAt, previous.trends.syncedAt);
    store.productInsights('p', result); store.close(); store = openStore(join(dir, 'db.sqlite'), initial);
    const service = openProductInsights(store, apple);
    assert.deepEqual(service.latest('p'), result);
    const state = store.read(); state.data.products[0].appStore.appId = '456'; store.write(state.data, state.revision);
    assert.equal(service.latest('p'), null);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
test('没有既有报告请求时明确提示，不创建 Apple 报告请求', async () => {
  let count = 0;
  const value = await readTrends({ paginate: async () => { count++; return { data: [] }; } }, '123');
  assert.equal(value.status, 'not_requested'); assert.equal(count, 1); assert.deepEqual(value.rows, []);
});
test('站内趋势分析停用，不调用模型', async () => {
  let calls = 0;
  const service = openProductInsights({}, {}, { fetcher: async () => { calls++; throw Error(); } });
  await assert.rejects(service.analyze('p', {}), e => e.status === 410);
  assert.equal(calls, 0);
});
test('持续报告与历史快照一起读取，重叠日期不重复累计，历史日期保留', async () => {
  const f = fixture();
  f.data['/v1/apps/123/analyticsReportRequests'].push({ id: 'snapshot', attributes: { accessType: 'ONE_TIME_SNAPSHOT' } });
  f.data['/v1/analyticsReportRequests/snapshot/reports'] = [{ id: 'history', attributes: { name: 'App Store Downloads Standard' } }];
  f.data['/v1/analyticsReports/history/instances?filter[granularity]=DAILY'] = [
    { id: 'old', attributes: { granularity: 'DAILY', processingDate: '2026-10-31' } },
    { id: 'historic', attributes: { granularity: 'DAILY', processingDate: '2026-10-01' } },
  ];
  const bytes = gzipSync(text('2026-09-30', 12));
  f.data['/v1/analyticsReportInstances/historic/segments'] = [{ id: 'historic-segment', attributes: { url: 'https://test.s3.amazonaws.com/historic', sizeInBytes: bytes.length, checksum: createHash('md5').update(bytes).digest('hex') } }];
  const result = await readTrends(f.reader, '123', null, { now: new Date('2026-11-05'), fetcher: (url, options) => url.endsWith('/historic') ? new Response(bytes) : f.fetcher(url, options) });
  assert.equal(result.rows.reduce((n, r) => n + r.firstDownloads, 0), 19);
  assert.ok(result.coverage.downloads.includes('2026-09-30'));
  assert.equal(f.calls.filter(p => p === '/v1/analyticsReportInstances/old/segments').length, 1);
});

test('自动同步只读取已关联 App 的趋势，到期才运行，失败保留缓存并按重试间隔恢复', async () => {
  const f = fixture();
  const latestDay = new Date().toISOString().slice(0, 10);
  const instance = f.data['/v1/analyticsReports/report/instances?filter[granularity]=DAILY'][1];
  instance.attributes.processingDate = latestDay;
  const bytes = gzipSync(text(latestDay, 7));
  f.data['/v1/analyticsReportInstances/new/segments'] = [{
    attributes: { url: 'https://test.s3.amazonaws.com/auto', sizeInBytes: bytes.length, checksum: createHash('md5').update(bytes).digest('hex') },
  }];
  const aso = { status: 'ready', localizations: [{ locale: 'zh-Hans' }] };
  let cache = { appId: '123', aso };
  let configured = false, fail = false;
  const store = {
    read: () => ({ data: { products: [{ id: 'p', appStore: { appId: '123' } }, { id: 'unlinked' }] } }),
    productInsights(id, value) {
      assert.equal(id, 'p');
      if (value) cache = value;
      return cache;
    },
  };
  const apple = {
    status: () => ({ configured }),
    session: () => ({ ...f.reader, paginate: path => {
      if (fail) throw Error('无法连接 Apple');
      return f.reader.paginate(path);
    } }),
  };
  const service = openProductInsights(store, apple, { fetcher: async (url, options) => url.endsWith('/auto') ? new Response(bytes) : f.fetcher(url, options) });
  await service.syncDue();
  assert.equal(f.calls.length, 0);
  configured = true;
  await service.syncDue();
  assert.equal(cache.trends.rows.find(row => row.date === latestDay).firstDownloads, 7);
  assert.deepEqual(cache.aso, aso);
  assert.ok(f.calls.every(path => !/appInfos|appStoreVersions/.test(path)));
  const first = cache;
  await service.syncDue();
  assert.equal(cache, first);
  fail = true;
  await service.syncDue(Date.parse(cache.trends.checkedAt) + 12 * 3600_000);
  assert.equal(cache.trends.status, 'error');
  assert.deepEqual(cache.trends.rows, first.trends.rows);
  assert.equal(cache.trends.syncedAt, first.trends.syncedAt);
  const failed = cache;
  fail = false;
  await service.syncDue(Date.parse(failed.trends.checkedAt) + 30 * 60_000);
  assert.equal(cache, failed);
  await service.syncDue(Date.parse(failed.trends.checkedAt) + 3600_000);
  assert.equal(cache.trends.status, 'partial');
});

test('购买标准报告分开累计美元销售额与预计所得，保留退款和修订，失败不影响获客', async () => {
  const f = fixture();
  const purchaseDay = '2026-10-30';
  const header = 'Date\tApp Apple Identifier\tSource Type\tTerritory\tPurchases\tSales in USD\tProceeds in USD\tPaying Users\n';
  const sale = (app, count, sales, proceeds) => `${purchaseDay}\t${app}\tApp Store search\tCHN\t${count}\t${sales}\t${proceeds}\t1\n`;
  const files = new Map();
  const segment = (name, body) => {
    const bytes = gzipSync(header + body), url = `https://test.s3.amazonaws.com/${name}`;
    files.set(url, bytes);
    return { attributes: { url, sizeInBytes: bytes.length, checksum: createHash('md5').update(bytes).digest('hex') } };
  };
  f.data['/v1/analyticsReportRequests/request/reports'].push(
    { id: 'purchase-detailed', attributes: { name: 'App Store Purchases Detailed' } },
    { id: 'purchases', attributes: { name: 'App Store Purchases Standard' } },
  );
  f.data['/v1/analyticsReports/purchases/instances?filter[granularity]=DAILY'] = [
    { id: 'p-old', attributes: { granularity: 'DAILY', processingDate: '2026-10-31' } },
    { id: 'p-new', attributes: { granularity: 'DAILY', processingDate: '2026-11-01' } },
  ];
  f.data['/v1/analyticsReportInstances/p-old/segments'] = [segment('purchase-old', sale('123', 1, 100, 75))];
  f.data['/v1/analyticsReportInstances/p-new/segments'] = [
    segment('purchase-sale', sale('123', 1, 10.5, 8) + sale('456', 1, 999, 999)),
    segment('purchase-refund', sale('123', 0, -1.25, -1)),
  ];
  const options = { now: new Date('2026-11-05'), fetcher: (url, options) => files.has(url) ? new Response(files.get(url)) : f.fetcher(url, options) };
  const result = await readTrends(f.reader, '123', null, options);
  assert.equal(result.revenue.status, 'ready');
  assert.deepEqual(result.revenue.coverage, [purchaseDay]);
  assert.deepEqual(result.revenue.rows.map(({ salesUsd, proceedsUsd }) => [salesUsd, proceedsUsd]), [[10.5, 8], [-1.25, -1]]);
  assert.equal(result.rows.reduce((sum, row) => sum + row.firstDownloads, 0), 7);
  assert.ok(f.calls.every(path => !path.includes('purchase-detailed')));
  f.data['/v1/analyticsReports/purchases/instances?filter[granularity]=DAILY'].push({ id: 'p-bad', attributes: { granularity: 'DAILY', processingDate: '2026-11-02' } });
  f.data['/v1/analyticsReportInstances/p-bad/segments'] = [segment('purchase-bad', sale('123', 1, '', 1))];
  const failed = await readTrends(f.reader, '123', result, options);
  assert.equal(failed.revenue.status, 'error');
  assert.deepEqual(failed.revenue.rows, result.revenue.rows);
  assert.deepEqual(failed.rows, result.rows);
});

test('报表分片在临时服务错误后重试并校验文件', async () => {
  const bytes = gzipSync('test');
  let calls = 0;
  const segment = { attributes: { url: 'https://test.s3.amazonaws.com/file', sizeInBytes: bytes.length } };
  const result = await downloadSegment(segment, async () => ++calls === 1 ? new Response(null, { status: 503 }) : new Response(bytes));
  assert.equal(result, 'test');
  assert.equal(calls, 2);
});
