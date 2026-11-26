import { readProductInsights } from './product-insights.mjs';
import { randomUUID } from 'node:crypto';
import { validIcon } from './validate.mjs';
import { AppleConnectionError } from './app-store-connect.mjs';

export async function importAppleProducts(store, apple, appIds) {
  const base = store.read();
  const reader = apple.session();
  const { apps } = await apple.apps();
  if (appIds !== undefined && (!Array.isArray(appIds) || !appIds.length || appIds.some(id => typeof id !== 'string' || !apps.some(app => app.id === id)))) throw new AppleConnectionError('请选择有效的产品。', 400);
  const selectedApps = appIds === undefined ? apps : apps.filter(app => appIds.includes(app.id));
  // Read everything before saving, so a failed Apple request leaves the workspace intact.
  const records = [];
  for (const app of selectedApps) {
    const snapshot = await apple.versions(app.id);
    const versions = snapshot.versions;
    const version = versions.find(v => ['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(v.state)) || versions[0];
    const locales = version ? (await reader.paginate(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations`)).data : [];
    const source = locales.find(l => l.attributes?.locale === 'zh-Hans') || locales.find(l => l.attributes?.locale === 'en-US') || locales[0];
    const existing = base.data.products.find(p => p.appStore?.appId === app.id || p.appId === app.id);
    const insights = await readProductInsights(apple, app.id, existing ? store.productInsights(existing.id) : null);
    let icon = '';
    if (!existing?.icon) {
      try { icon = await apple.icon(app.id, versions); } catch { reader.check(); }
      if (!validIcon(icon)) icon = '';
    }
    records.push({ app, snapshot, insights, icon, iconStatus: existing?.icon ? 'preserved' : icon ? 'imported' : 'unavailable', website: source?.attributes?.marketingUrl || '' });
  }
  reader.check();
  const data = structuredClone(base.data);
  let created = 0;
  for (const { app, snapshot, website, icon } of records) {
    const existing = data.products.find(p => p.appStore?.appId === app.id || p.appId === app.id);
    const appStore = { ...snapshot, name: app.name, bundleId: app.bundleId };
    if (existing) {
      existing.appStore = appStore;
      if (!existing.icon && icon) existing.icon = icon;
      continue;
    }
    const productId = randomUUID();
    data.products.push({ id: productId, name: app.name, englishName: '', summary: '', appId: app.id, price: '', platform: [...new Set(snapshot.versions.map(v => v.platform))].join('、'), website, color: 'blue', ...(icon ? { icon } : {}), appStore });
    created++;
  }
  const state = store.write(data, base.revision);
  if (!state) throw new AppleConnectionError('读取期间工作区已变化，请重新同步产品。', 409);
  for (const record of records) {
    const p = state.data.products.find(p => p.appStore?.appId === record.app.id);
    store.productInsights(p.id, record.insights);
  }
  return { ...state, imported: created, total: selectedApps.length, sync: records.map(r => ({ appId: r.app.id, icon: r.iconStatus, aso: r.insights.aso.status, trends: r.insights.trends.status })) };
}
