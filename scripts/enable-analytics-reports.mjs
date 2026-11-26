import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { openAppleConnection } from '../server/app-store-connect.mjs';
import { openStore } from '../server/store.mjs';
import { readTrends } from '../server/product-insights.mjs';
if (!process.argv.includes('--enable')) throw Error('启用会向 Apple 创建分析报告请求，需要明确传入 --enable。');
const store = openStore(fileURLToPath(new URL('../data/growmory.sqlite', import.meta.url)), JSON.parse(readFileSync(new URL('../server/seed.json', import.meta.url))));
const products = store.read().data.products.filter(p => p.appStore?.appId);
const allowedApps = new Set(products.map(p => p.appStore.appId));
const types = ['ONGOING', 'ONE_TIME_SNAPSHOT'];
const report = { startedAt: new Date().toISOString(), operations: [], products: [] };
const output = new URL('../docs/analytics-report-activation.json', import.meta.url);
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2));
const apple = openAppleConnection(new URL('../data/app-store-connect.json', import.meta.url), { fetcher: async (url, options) => {
  const path = new URL(url).pathname;
  if (options.method !== 'GET') {
    const payload = JSON.parse(options.body || '{}');
    if (options.method !== 'POST' || path !== '/v1/analyticsReportRequests' || payload.data?.type !== 'analyticsReportRequests' || !types.includes(payload.data.attributes?.accessType) || !allowedApps.has(payload.data.relationships?.app?.data?.id)) throw Error('拒绝范围外的 Apple 写入。');
  }
  const response = await fetch(url, options);
  report.operations.push({ method: options.method, path, status: response.status }); persist();
  return response;
} });
const client = apple.session();
try {
  const accessible = new Set((await apple.apps()).apps.map(a => a.id));
  for (const product of products) {
    const appId = product.appStore.appId;
    const item = { name: product.name, appId, requests: [] }; report.products.push(item); persist();
    if (!accessible.has(appId)) { item.error = '当前密钥无法访问此产品'; persist(); continue; }
    const list = async () => (await client.paginate(`/v1/apps/${appId}/analyticsReportRequests`)).data;
    try {
      for (const accessType of types) {
        const existing = await list(), active = existing.find(r => r.attributes?.accessType === accessType && !r.attributes.stoppedDueToInactivity);
        let request = active, outcome = 'existing', error;
        if (!request) {
          try {
            const result = await client.request('/v1/analyticsReportRequests', 'POST', { data: { type: 'analyticsReportRequests', attributes: { accessType }, relationships: { app: { data: { type: 'apps', id: appId } } } } });
            request = result.data; outcome = 'created';
          } catch (e) {
            error = e.message;
            // Never replay an ambiguous POST: re-read Apple to establish whether it succeeded.
            request = (await list()).find(r => r.attributes?.accessType === accessType && !r.attributes.stoppedDueToInactivity && !existing.some(old => old.id === r.id));
            outcome = request ? 'recovered_after_read' : 'failed';
          }
        }
        if (request?.id) {
          const verified = (await client.request(`/v1/analyticsReportRequests/${request.id}`)).data;
          if (verified?.id !== request.id || verified.attributes?.accessType !== accessType || verified.attributes.stoppedDueToInactivity) throw Error('报告请求回读核对失败');
          item.requests.push({ accessType, id: request.id, outcome, verified: true });
        } else item.requests.push({ accessType, outcome: 'failed', error });
        persist(); console.log(`${product.name} · ${accessType} · ${item.requests.at(-1).outcome}`);
      }
      const current = store.read().data.products.find(p => p.id === product.id);
      if (current?.appStore?.appId === appId) {
        const previous = store.productInsights(product.id);
        const trends = await readTrends(client, appId, previous?.appId === appId ? previous.trends : null);
        if (previous?.appId === appId) store.productInsights(product.id, { ...previous, checkedAt: new Date().toISOString(), trends });
        item.trendsStatus = trends.status;
      }
    } catch (e) { item.error = e.message; console.log(`${product.name} · ${e.message}`); }
    persist();
  }
  report.finishedAt = new Date().toISOString(); persist();
  const requests = report.products.flatMap(p => p.requests);
  console.log(JSON.stringify({ products: report.products.length, created: requests.filter(r => r.outcome === 'created').length, reused: requests.filter(r => r.outcome === 'existing').length, verified: requests.filter(r => r.verified).length, errors: report.products.filter(p => p.error || p.requests.some(r => r.outcome === 'failed')).map(p => ({ name: p.name, error: p.error, requests: p.requests })) }, null, 2));
  if (report.products.some(p => p.error || p.requests.some(r => !r.verified))) process.exitCode = 1;
} finally { store.close(); }
