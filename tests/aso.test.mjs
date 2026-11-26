import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openAso, validateAso } from '../server/aso.mjs';
function fixture() {
  const fields = { name: '测试', subtitle: '整理', keywords: '记录', description: '真实功能', promotionalText: '' };
  const version = { id: 'v', attributes: { appStoreState: 'PREPARE_FOR_SUBMISSION' } }, info = { id: 'i', attributes: { state: 'PREPARE_FOR_SUBMISSION' } };
  const vl = { id: 'vl', attributes: { locale: 'zh-Hans', keywords: fields.keywords, description: fields.description, promotionalText: '' } }, il = { id: 'il', attributes: { locale: 'zh-Hans', name: fields.name, subtitle: fields.subtitle } };
  const events = [], writes = [], data = { products: [{ id: 'p', appStore: { appId: '123' } }], docs: [{ productId: 'p', status: 'pending', body: '不要发送' }, { productId: 'p', status: 'confirmed', body: '已确认功能' }] };
  let fail = false, aiContext;
  const apple = { status: () => ({ configured: true }), session: () => ({
    async paginate(path) { return structuredClone({ data: path.endsWith('/appStoreVersions') ? [version] : path.endsWith('/appInfos') ? [info] : path.includes('/appInfos/') ? [il] : [vl] }); },
    async request(path, method, body) { writes.push({ path, method, body }); if (fail && path.includes('appStoreVersionLocalizations')) throw Error('网络中断'); Object.assign(path.includes('appInfoLocalizations') ? il.attributes : vl.attributes, body.data.attributes); },
  }) };
  const aso = openAso({ read: () => ({ data }), asoEvent: (_, event) => events.push(event), asoEvents: () => events }, apple, { env: { AI_API_KEY: 'test' }, fetcher: async (_, options) => { aiContext = JSON.parse(JSON.parse(options.body).messages[1].content); return Response.json({ choices: [{ message: { content: JSON.stringify({ analysis: '分析理由', fields: { ...fields, subtitle: '更清晰' } }) } }] }); } });
  return { aso, fields, vl, il, version, info, writes, events, data, setFail: () => { fail = true; }, aiContext: () => aiContext, read: () => aso.read('p', { versionId: 'v', infoId: 'i', locale: 'zh-Hans' }) };
}
test('ASO 读取、AI 上下文、两类资源回写及回读，token 仅执行一次', async () => {
  const f = fixture(), snapshot = await f.read();
  await assert.rejects(f.aso.analyze('p', { token: snapshot.token }), e => e.status === 410);
  assert.equal(f.aiContext(), undefined);
  const plan = await f.aso.preview('p', { token: snapshot.token, fields: { ...f.fields, name: '新名称', keywords: '记录,整理' } });
  assert.equal(plan.changes.length, 2); assert.equal(f.writes.length, 0);
  await f.aso.execute('p', { token: plan.token });
  assert.equal(f.writes.length, 2); assert.equal(f.writes[0].body.data.type, 'appInfoLocalizations'); assert.equal(f.events[0].outcome, 'success');
  await assert.rejects(f.aso.execute('p', { token: plan.token }), /过期/);
});
test('ASO 防止旧原文覆盖、关联变化、状态不允许和超长字段', async () => {
  const f = fixture(), s = await f.read(), fields = { ...f.fields, name: '新名称' };
  f.vl.attributes.description = '其他窗口修改';
  await assert.rejects(f.aso.preview('p', { token: s.token, fields }), /已改变/);
  const next = await f.read(); f.data.products[0].appStore.appId = '456';
  await assert.rejects(f.aso.preview('p', { token: next.token, fields }), /关联已改变/);
  assert.throws(() => validateAso({ ...fields, keywords: 'a'.repeat(101) }), /100/); assert.equal(f.writes.length, 0);
  const g = fixture(); g.version.attributes.appStoreState = 'READY_FOR_SALE'; const live = await g.read();
  await assert.rejects(g.aso.preview('p', { token: live.token, fields }), /仅允许/);
  const promo = await g.aso.preview('p', { token: live.token, fields: { ...g.fields, promotionalText: '推广' } });
  await g.aso.execute('p', { token: promo.token }); assert.equal(g.writes.length, 1);
});
test('ASO 执行前检查远端变化，部分写入失败留下记录', async () => {
  const f = fixture(), s = await f.read(), fields = { ...f.fields, name: '新名称', keywords: '新词' };
  const p = await f.aso.preview('p', { token: s.token, fields }); f.info.attributes.state = 'IN_REVIEW';
  await assert.rejects(f.aso.execute('p', { token: p.token }), /已改变/); assert.equal(f.writes.length, 0);
  const g = fixture(), next = await g.read(), plan = await g.aso.preview('p', { token: next.token, fields }); g.setFail();
  await assert.rejects(g.aso.execute('p', { token: plan.token }), /已成功请求写入：name/);
  assert.deepEqual(g.events[0].completed, ['name']); assert.equal(g.events[0].outcome, 'unconfirmed');
});
