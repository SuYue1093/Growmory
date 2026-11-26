import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { AppleConnectionError } from './app-store-connect.mjs';
import { syncProductReleaseDates } from './release-sync.mjs';
import { retryAppleRead } from './apple-read-retry.mjs';
const fail = message => { throw new AppleConnectionError(message, 502); };
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const fields = ['name', 'subtitle', 'keywords', 'description', 'promotionalText'];

// Apple's report files use tab-separated columns, including quoted text fields.
export function parseReport(text, appId, kind) {
  const rows = []; let row = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === '\t' || c === '\n')) { row.push(value.replace(/\r$/, '')); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else value += c;
  }
  if (quoted) fail('趋势报告引号格式无效。');
  if (value || row.length) { row.push(value.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift() || [];
  const required = kind === 'purchases' ? ['Sales in USD', 'Proceeds in USD'] : ['Counts', kind === 'engagement' ? 'Event' : 'Download Type'];
  for (const key of ['Date', 'App Apple Identifier', ...required]) if (!headers.includes(key)) fail(`趋势报告缺少字段：${key}`);
  const groups = new Map();
  for (const values of rows) {
    if (values.every(v => !v.trim())) continue;
    if (values.length !== headers.length) fail('趋势报告列数不匹配。');
    const r = Object.fromEntries(headers.map((h, i) => [h, values[i]]));
    if (r['App Apple Identifier'] !== appId) continue;
    const key = JSON.stringify([r.Date, r['Source Type'] || '未知', r.Territory || '未知']);
    if (kind === 'purchases') {
      const [sales, proceeds] = required.map(field => r[field].trim() ? Number(r[field]) : NaN);
      if (!day(r.Date) || !Number.isFinite(sales) || !Number.isFinite(proceeds)) fail('购买报告日期或金额无效。');
      const group = groups.get(key) || { date: r.Date, source: r['Source Type'] || '未知', territory: r.Territory || '未知', salesUsd: 0, proceedsUsd: 0 };
      group.salesUsd += sales;
      group.proceedsUsd += proceeds;
      groups.set(key, group);
      continue;
    }
    const count = Number(r.Counts);
    if (!day(r.Date) || !r.Counts.trim() || !Number.isSafeInteger(count) || count < 0) fail('趋势报告日期或数值无效。');
    if (!groups.has(key)) groups.set(key, { date: r.Date, source: r['Source Type'] || '未知', territory: r.Territory || '未知', impressions: 0, pageViews: 0, firstDownloads: 0, redownloads: 0 });
    const g = groups.get(key);
    if (kind === 'engagement') {
      if (r.Event === 'Impression') g.impressions += count;
      if (r.Event === 'Page view' && r['Page Type'] === 'Product page') g.pageViews += count;
    } else {
      if (r['Download Type'].toLowerCase() === 'first-time download') g.firstDownloads += count;
      if (r['Download Type'].toLowerCase() === 'redownload') g.redownloads += count;
    }
  }
  return [...groups.values()];
}

export async function downloadSegment(segment, fetcher = fetch) {
  const { url, checksum, sizeInBytes } = segment.attributes || {};
  const parsed = new URL(url);
  // Signed storage URLs are supplied only by Apple's authenticated segment API.
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/(?:\.amazonaws\.com|\.apple\.com|\.mzstatic\.com)$/.test(parsed.hostname)) fail('Apple 趋势报告下载地址无效。');
  let bytes;
  try {
    bytes = await retryAppleRead(
      () => fetcher(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30000) }),
      async response => {
        const chunks = []; let length = 0;
        for await (const chunk of response.body) { length += chunk.length; if (length > 32 * 1024 * 1024) fail('趋势报告分片过大。'); chunks.push(chunk); }
        return Buffer.concat(chunks);
      }
    );
  } catch (error) {
    if (error instanceof AppleConnectionError) throw error;
    fail(error.name === 'TimeoutError' ? '趋势报告分片下载超时。' : '无法连接 Apple 报告下载服务。');
  }
  if (!Buffer.isBuffer(bytes)) fail(`趋势报告下载失败（${bytes.status}）。`);
  if (sizeInBytes != null && Number(sizeInBytes) !== bytes.length) fail('趋势报告下载大小不匹配。');
  if (checksum && createHash('md5').update(bytes).digest('hex') !== checksum.toLowerCase()) fail('趋势报告校验失败。');
  return (bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }) : bytes).toString('utf8');
}

export function saveAsoCache(store, productId, appId, aso, versionId) {
  const product = store.read().data.products.find(p => p.id === productId);
  if (product?.appStore?.appId !== appId) throw new AppleConnectionError('产品关联已改变，请重新读取。', 409);
  const old = store.productInsights(productId);
  const previous = old?.appId === appId ? old : null;
  const localizations = aso.localizations.map(l => ({ ...l, syncedAt: aso.syncedAt }));
  const value = {
    ...(previous || { appId, trends: { status: 'not_requested', rows: [], coverage: {} } }),
    checkedAt: aso.syncedAt,
    aso: { ...aso, cacheScope: versionId ? 'version' : 'allVersions', localizations: versionId ? [...(previous?.aso?.localizations || []).filter(l => l.versionId !== versionId), ...localizations] : localizations },
  };
  store.productInsights(productId, value);
  return value;
}

export async function readAso(reader, appId, target) {
  const versions = (await reader.paginate(`/v1/apps/${appId}/appStoreVersions`)).data;
  const infos = (await reader.paginate(`/v1/apps/${appId}/appInfos`)).data;
  const infoLocales = [];
  for (const info of infos) for (const l of (await reader.paginate(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data) infoLocales.push({ info, l });
  // One current public version and one editable version per platform; don't duplicate historical copy.
  const selected = new Map();
  for (const v of versions) {
    const state = v.attributes?.appVersionState || v.attributes?.appStoreState;
    const lane = ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(state) ? 'public' : ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(state) ? 'editable' : null;
    const key = `${v.attributes?.platform}:${lane}`;
    if (lane && !selected.has(key)) selected.set(key, v);
  }
  if (target?.allVersions) {
    selected.clear();
    for (const version of versions) selected.set(version.id, version);
  } else if (target) {
    const version = versions.find(v => v.id === target.versionId && v.attributes?.platform === target.platform);
    if (!version) throw new AppleConnectionError('所选平台或版本已不存在，请重新同步版本列表后选择。', 409);
    selected.clear(); selected.set('requested', version);
  } else if (!selected.size && versions[0]) selected.set('latest', versions[0]);
  const localizations = [];
  for (const v of selected.values()) {
    const versionState = v.attributes?.appVersionState || v.attributes?.appStoreState;
    const isPublic = ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(versionState);
    for (const l of (await reader.paginate(`/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data) {
      const candidates = infoLocales.filter(x => x.l.attributes?.locale === l.attributes?.locale);
      const info = candidates.find(x => isPublic ? ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(x.info.attributes?.state) : x.info.attributes?.state === versionState) || candidates[0];
      localizations.push({ locale: l.attributes.locale, versionId: v.id, version: v.attributes.versionString, platform: v.attributes.platform, versionState, createdDate: v.attributes?.createdDate || '', infoId: info?.info.id || '', infoState: info?.info.attributes?.state || '', fields: Object.fromEntries(fields.map(k => [k, (['name', 'subtitle'].includes(k) ? info?.l.attributes : l.attributes)?.[k] || ''])) });
    }
  }
  return { status: 'ready', syncedAt: new Date().toISOString(), localizations, appInfoLocalizations: infoLocales.map(({ info, l }) => ({ infoId: info.id, infoState: info.attributes?.state || '', locale: l.attributes.locale, name: l.attributes.name || '', subtitle: l.attributes.subtitle || '' })) };
}

export async function readTrends(reader, appId, previous, { fetcher = fetch, now = new Date() } = {}) {
  const requests = (await reader.paginate(`/v1/apps/${appId}/analyticsReportRequests`)).data;
  const active = requests.filter(r => !r.attributes?.stoppedDueToInactivity).sort((a, b) => (b.attributes?.accessType === 'ONGOING') - (a.attributes?.accessType === 'ONGOING'));
  if (!active.length) return { status: 'not_requested', message: 'Apple 尚无可用趋势报告请求。需由管理员在具备管理权限的工具中启用 Analytics Reports；首次生成通常需要 1–2 天。本次只读同步不会创建请求。', rows: previous?.rows || [], coverage: previous?.coverage || {}, syncedAt: previous?.syncedAt, revenue: { rows: [], coverage: [], ...previous?.revenue, status: 'not_requested' } };
  const reportGroups = [];
  for (const request of active) reportGroups.push((await reader.paginate(`/v1/analyticsReportRequests/${request.id}/reports`)).data);
  const kinds = {
    engagement: ['App Store Discovery and Engagement Standard', 'App Store Discovery and Engagement', 'Discovery and Engagement'],
    downloads: ['App Downloads Standard', 'App Store Downloads Standard', 'App Downloads', 'App Store Downloads']
  };
  const cutoff = new Date(now.getTime() - 180 * 86400000).toISOString().slice(0, 10);
  async function readKind(kind, candidateNames, previousRows, previousInstances = []) {
    const reports = reportGroups.map(group => candidateNames.map(name => group.find(r => r.attributes?.name === name)).find(Boolean)).filter(Boolean);
    if (!reports.length) {
      const rows = previousRows.filter(row => row.date >= cutoff);
      return { rows, coverage: [...new Set(rows.map(row => row.date))].sort(), status: 'not_available', instanceIds: previousInstances };
    }
    let refreshed = false;
    const uniqueInstances = new Map();
    for (const report of reports) {
      for (const instance of (await reader.paginate(`/v1/analyticsReports/${report.id}/instances?filter[granularity]=DAILY`)).data) {
        if (instance.attributes?.granularity === 'DAILY' && instance.attributes.processingDate >= cutoff && !uniqueInstances.has(instance.id)) uniqueInstances.set(instance.id, instance);
      }
    }
    const instances = [...uniqueInstances.values()].sort((a, b) => b.attributes.processingDate.localeCompare(a.attributes.processingDate));
    const completed = new Set(previousInstances);
    // Re-read ties together so a newly listed instance on the same processing date
    // still follows the report ordering used by a full sync.
    const pendingDates = new Set(instances.filter(instance => !completed.has(instance.id)).map(instance => instance.attributes.processingDate));
    const instanceIds = [];
    const dates = new Map();
    for (const instance of instances) {
      if (!pendingDates.has(instance.attributes.processingDate)) { instanceIds.push(instance.id); continue; }
      const segments = (await reader.paginate(`/v1/analyticsReportInstances/${instance.id}/segments`)).data;
      if (!segments.length) continue;
      const instanceRows = [];
      for (const segment of segments) instanceRows.push(...parseReport(await downloadSegment(segment, fetcher), appId, kind));
      instanceIds.push(instance.id);
      const batches = new Map();
      for (const row of instanceRows) { if (row.date < cutoff) continue; if (!batches.has(row.date)) batches.set(row.date, []); batches.get(row.date).push(row); }
      refreshed ||= batches.size > 0;
      // Later processing dates replace the whole event-date partition, never add to older revisions.
      for (const [date, rows] of batches) if (!dates.has(date)) dates.set(date, rows.map(r => ({ ...r, processingDate: instance.attributes.processingDate })));
    }
    // Retain historical partitions outside the reports Apple currently returns.
    const oldDates = new Map();
    for (const row of previousRows) if (row.date >= cutoff && (!dates.has(row.date) || row.processingDate > (dates.get(row.date)[0]?.processingDate || ''))) { if (!oldDates.has(row.date)) oldDates.set(row.date, []); oldDates.get(row.date).push(row); }
    for (const [date, rows] of oldDates) dates.set(date, rows);
    return {
      rows: [...dates.values()].flat(),
      coverage: [...dates.keys()].sort(),
      status: instances.length && dates.size ? 'ready' : 'pending',
      refreshed,
      instanceIds,
    };
  }

  const all = [], coverage = {}, missing = [], errors = [];
  const reportInstances = { ...previous?.reportInstances };
  let refreshed = false, ready = false;
  for (const [kind, names] of Object.entries(kinds)) {
    const label = kind === 'engagement' ? '曝光与互动' : '下载';
    const previousRows = (previous?.rows || []).filter(row => row.kind === kind);
    try {
      const result = await readKind(kind, names, previousRows, reportInstances[kind]);
      reportInstances[kind] = result.instanceIds;
      refreshed ||= result.refreshed === true;
      ready ||= result.status === 'ready';
      if (result.status !== 'ready') missing.push(label);
      coverage[kind] = result.coverage;
      all.push(...result.rows.map(row => ({ ...row, kind })));
    } catch (error) {
      errors.push({ label, message: error.message });
      coverage[kind] = previous?.coverage?.[kind] || [];
      all.push(...previousRows);
    }
  }

  let revenue;
  try {
    const { instanceIds, refreshed, ...result } = await readKind('purchases', ['App Store Purchases Standard', 'App Store Purchases'], previous?.revenue?.rows || [], reportInstances.purchases);
    reportInstances.purchases = instanceIds;
    revenue = { ...result, syncedAt: refreshed ? new Date().toISOString() : previous?.revenue?.syncedAt };
  } catch (error) {
    revenue = { rows: [], coverage: [], ...previous?.revenue, status: 'error', message: error.message };
  }

  const status = ready ? (missing.length || errors.length ? 'partial' : 'ready')
    : errors.length ? (errors.every(error => /没有操作权限|权限不足/.test(error.message)) ? 'forbidden' : 'error') : 'pending';
  const message = errors.length ? errors.map(error => `${error.label}报表同步失败：${error.message}`).join(' ')
    : !ready ? 'Apple 尚未返回每日趋势数据，报告可能仍在生成或未达到隐私门槛。'
      : missing.length ? `部分报告尚不可用：${missing.join('、')}。对应指标可能缺失或保留旧数据。` : '';
  return { status, message, rows: all, coverage, syncedAt: refreshed ? new Date().toISOString() : previous?.syncedAt, revenue, reportInstances, reportSyncFailed: errors.length > 0 };
}

export async function readProductInsights(apple, appId, previous, options) {
  const reader = apple.session();
  if (previous?.appId !== appId) previous = null;
  const result = { appId, ...(previous?.asoMarkets ? { asoMarkets: previous.asoMarkets } : {}) };
  for (const [key, action] of [['aso', () => readAso(reader, appId)], ['trends', () => readTrends(reader, appId, previous?.trends, options)]]) {
    try { result[key] = await action(); }
    catch (e) { result[key] = { ...previous?.[key], status: /没有操作权限|权限不足/.test(e.message) ? 'forbidden' : 'error', message: e.message, ...(key === 'trends' ? { rows: previous?.trends?.rows || [], coverage: previous?.trends?.coverage || {}, revenue: { rows: [], coverage: [], ...previous?.trends?.revenue, status: 'error', message: e.message } } : { localizations: previous?.aso?.localizations || [] }) }; }
  }
  reader.check();
  result.trends.checkedAt = result.checkedAt = new Date().toISOString();
  return result;
}

export function openProductInsights(store, apple, { fetcher = fetch } = {}) {
  function context(id) { const p = store.read().data.products.find(p => p.id === id); if (!p?.appStore) throw new AppleConnectionError('请先从 App Store Connect 同步产品。', 409); return p; }
  const manual = new Map();
  const automatic = new Map();

  async function syncTrends(id) {
    const p = context(id), appId = p.appStore.appId, previous = service.latest(id);
    const reader = apple.session();
    let trends;
    try {
      trends = await readTrends(reader, appId, previous?.trends, { fetcher });
    } catch (error) {
      trends = {
        ...previous?.trends,
        status: /没有操作权限|权限不足/.test(error.message) ? 'forbidden' : 'error',
        message: error.message,
        rows: previous?.trends?.rows || [],
        coverage: previous?.trends?.coverage || {},
        revenue: { rows: [], coverage: [], ...previous?.trends?.revenue, status: 'error', message: error.message },
      };
    }
    reader.check();
    const latest = service.latest(id);
    if (context(id).appStore.appId !== appId || latest?.trends?.checkedAt !== previous?.trends?.checkedAt ||
        latest?.trends?.syncedAt !== previous?.trends?.syncedAt || (previous && !latest)) return;
    const checkedAt = new Date().toISOString();
    store.productInsights(id, {
      ...(latest || { appId, aso: { status: 'not_requested', localizations: [] } }),
      checkedAt,
      trends: { ...trends, checkedAt },
    });
  }

  const service = {
    latest(id) { const p = context(id), value = store.productInsights(id); return value?.appId === p.appStore.appId ? value : null; },
    async analyze() {
      throw new AppleConnectionError('站内趋势分析已停用，请通过外部 AI 分析。', 410);
    },
    sync(id) {
      if (manual.has(id)) return manual.get(id);
      const task = (async () => {
        await automatic.get(id)?.catch(() => {});
        const p = context(id), previous = service.latest(id);
        const value = await readProductInsights(apple, p.appStore.appId, previous, { fetcher });
        if (context(id).appStore.appId !== p.appStore.appId) throw new AppleConnectionError('产品关联已变化，请重新同步。', 409);
        const latest = service.latest(id);
        if (JSON.stringify(latest?.trends) !== JSON.stringify(previous?.trends)) throw new AppleConnectionError('趋势已由其他操作更新，请重新同步。', 409);
        const merged = { ...latest, ...value };
        if (latest?.asoMarkets) merged.asoMarkets = latest.asoMarkets;
        if (latest?.aso && JSON.stringify(latest.aso) !== JSON.stringify(previous?.aso)) merged.aso = latest.aso;
        store.productInsights(id, merged);
        await syncProductReleaseDates(store, { productId: id, apple, fetcher }).catch(() => {});
        return merged;
      })().finally(() => manual.delete(id));
      manual.set(id, task);
      return task;
    },
    async syncDue(now = Date.now()) {
      // 每日自动同步全库产品的最新版本上线时间与发布状态
      await syncProductReleaseDates(store, { apple, fetcher }).catch((err) => {
        console.warn('全库产品版本发布时间同步未完成：', err.message);
      });
      for (const product of store.read().data.products) {
        const id = product.id;
        if (!apple.status().configured) break;
        if (!product.appStore || manual.has(id) || automatic.has(id)) continue;
        try {
          const trends = service.latest(id)?.trends;
          const retry = ['error', 'forbidden', 'pending'].includes(trends?.status) || trends?.reportSyncFailed || trends?.revenue?.status === 'error';
          const interval = (retry ? 1 : 12) * 60 * 60 * 1000;
          const checked = Date.parse(trends?.checkedAt || trends?.syncedAt || '');
          if (trends?.revenue && now - checked < interval) continue;
          const task = syncTrends(id).finally(() => automatic.delete(id));
          automatic.set(id, task);
          await task;
        } catch (error) {
          console.warn('App 趋势自动同步未完成：', id, error.message);
        }
      }
    },
  };
  return service;
}
