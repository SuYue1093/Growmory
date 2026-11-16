import { fileURLToPath } from 'node:url';
import { openAppleConnection } from '../server/app-store-connect.mjs';
import { openStore } from '../server/store.mjs';
import { importAppleProducts } from '../server/product-import.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const calls = [];
const apple = openAppleConnection(new URL('../data/app-store-connect.json', import.meta.url), { fetcher: async (url, options) => {
  if (options.method !== 'GET') throw Error('只读验证禁止非 GET Apple 请求');
  calls.push(new URL(url).pathname); return fetch(url, options);
} });
const store = openStore(fileURLToPath(new URL('../data/growmory.sqlite', import.meta.url)), JSON.parse(readFileSync(new URL('../server/seed.json', import.meta.url))));
try {
  const result = await importAppleProducts(store, apple);
  const report = { checkedAt: new Date().toISOString(), appleRequests: calls.length, nonGetRequests: 0, salesRequests: calls.filter(p => p.includes('salesReports')).length, products: result.data.products.map(p => {
    const value = store.productInsights(p.id);
    return { name: p.name, appId: p.appStore.appId, asoStatus: value.aso.status, asoLocales: value.aso.localizations.length, trendsStatus: value.trends.status, trendsMessage: value.trends.message, trendRows: value.trends.rows.length };
  }) };
  writeFileSync(new URL('../docs/product-trends-live-result.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { store.close(); }
