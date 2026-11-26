import { openStore } from '../../server/store.mjs';
import { openAso } from '../../server/aso.mjs';
export function fixture(path = ':memory:') {
  const store = openStore(path, { products: [{ id: 'p', name: '产品', summary: '', appId: '123', price: '', platform: '', website: '', color: 'blue', appStore: { appId: '123', name: '产品', bundleId: 'com.test', syncedAt: '', versions: [] } }], docs: [{ id: 'doc', productId: 'p', title: '产品事实', status: 'confirmed', updatedAt: '2026-11-05', body: '只包含真实能力', history: [] }], docFolders: [], contents: [], releases: [], tasks: [] });
  const fields = { name: '产品', subtitle: '副标题', keywords: '笔记', description: '真实功能介绍', promotionalText: '' };
  const v = { id: 'v', attributes: { appStoreState: 'PREPARE_FOR_SUBMISSION' } }, info = { id: 'i', attributes: { state: 'PREPARE_FOR_SUBMISSION' } };
  const il = { id: 'il', attributes: { locale: 'zh-Hans', name: fields.name, subtitle: fields.subtitle } }, vl = { id: 'vl', attributes: { locale: 'zh-Hans', keywords: fields.keywords, description: fields.description, promotionalText: '' } };
  const writes = []; let context, fail = false;
  const apple = { status: () => ({ configured: true }), session: () => ({ paginate: async path => ({ data: structuredClone(path.endsWith('/appStoreVersions') ? [v] : path.endsWith('/appInfos') ? [info] : path.includes('/appInfos/') ? [il] : [vl]) }), request: async (path, method, body) => { writes.push({ method, path }); if (fail && path.includes('appStoreVersionLocalizations')) throw Error('模拟中断'); Object.assign(path.includes('appInfoLocalizations') ? il.attributes : vl.attributes, body.data.attributes); } }) };
  const aso = openAso(store, apple, { env: { AI_API_KEY: 'secret-test-key' }, fetcher: async (_, input) => { context = JSON.parse(JSON.parse(input.body).messages[1].content); return Response.json({ choices: [{ message: { content: JSON.stringify({ fields: { ...fields, subtitle: '改进标题' }, analysis: '基于所选词的建议' }) } }] }); } });
  return { store, aso, fields, il, vl, writes, context: () => context, fail: () => { fail = true; }, read: () => aso.read('p', { versionId: 'v', infoId: 'i', locale: 'zh-Hans' }) };
}
