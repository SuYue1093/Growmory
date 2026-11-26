import { openAppleConnection } from '../server/app-store-connect.mjs';
import { writeFileSync } from 'node:fs';
const calls = [];
const apple = openAppleConnection(new URL('../data/app-store-connect.json', import.meta.url), {
  fetcher: async (url, options = {}) => {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') throw Error(`只读检查拒绝 ${method}`);
    calls.push({ method, path: new URL(url).pathname });
    return fetch(url, options);
  },
});
const report = { checkedAt: new Date().toISOString(), apps: [], errors: [], calls };
try {
  const { apps } = await apple.apps();
  for (const app of apps) {
    try {
      const snapshot = await apple.versions(app.id);
      const reader = apple.session();
      const infos = (await reader.paginate(`/v1/apps/${app.id}/appInfos`)).data;
      const info = infos[0];
      const locales = info ? (await reader.paginate(`/v1/appInfos/${info.id}/appInfoLocalizations`)).data : [];
      report.apps.push({ name: app.name, appId: app.id, versions: snapshot.versions.length, noteLocales: [...new Set(snapshot.versions.flatMap(v => v.notes.map(n => n.locale)))], appInfoLocales: locales.map(l => l.attributes?.locale) });
    } catch (e) { report.errors.push({ app: app.name, message: e.message }); }
  }
} catch (e) { report.errors.push({ message: e.message }); }
writeFileSync(new URL('../docs/apple-readonly-result.json', import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, calls: `${calls.length} GET requests` }, null, 2));
if (report.errors.length) process.exitCode = 1;
