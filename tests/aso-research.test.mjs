import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/aso-research-fixture.mjs';

test('文案草稿冻结原文与已确认资料并关联成功回写', async () => {
  const f = fixture();
  try {
    const before = await f.read();
    await assert.rejects(f.aso.analyze('p', { token: before.token }), e => e.status === 410);
    assert.equal(f.context(), undefined);
    const fields = { ...f.fields, subtitle: '改进标题', keywords: '笔记,阅读' };
    const saved = f.aso['save-plan']('p', { token: before.token, fields, title: '中文方案', objective: '突出阅读场景', market: 'CN', analysis: '采用相关词', expectedRevision: 0 });
    const plan = saved.workspace.plans[0]; assert.equal(plan.before.subtitle, '副标题');
    const preview = await f.aso.preview('p', { token: before.token, fields, planId: saved.planId });
    assert.equal(f.writes.length, 0);
    await f.aso.execute('p', { token: preview.token });
    const result = f.aso.research('p').plans[0]; assert.equal(result.status, 'applied'); assert.ok(result.appliedAt); assert.equal(result.executions.length, 1);
    assert.equal(f.writes.length, 2);
  } finally { f.store.close(); }
});
test('商店原文变化不能直接应用旧方案，部分写入失败记录待核对', async () => {
  const f = fixture();
  try {
    const before = await f.read();
    const fields = { ...f.fields, name: '新产品', keywords: '新的词' };
    const saved = f.aso['save-plan']('p', { token: before.token, fields, title: '方案', objective: '搜索相关性', market: 'CN', analysis: '', expectedRevision: 0 });
    f.il.attributes.subtitle = '远端变化';
    const fresh = await f.read();
    await assert.rejects(f.aso.preview('p', { token: fresh.token, fields, planId: saved.planId }), /原文已变化/);
    assert.equal(f.writes.length, 0);
    f.il.attributes.subtitle = f.fields.subtitle;
    const current = await f.read();
    const preview = await f.aso.preview('p', { token: current.token, fields, planId: saved.planId });
    f.fail(); await assert.rejects(f.aso.execute('p', { token: preview.token }), /模拟中断/);
    const plan = f.aso.research('p').plans[0]; assert.equal(plan.status, 'unconfirmed'); assert.deepEqual(plan.executions[0].completed, ['name']);
  } finally { f.store.close(); }
});
