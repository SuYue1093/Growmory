import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { runTool } from '../server/mcp-tools.mjs';
const access = { enabled: true, allowWrites: true };
test('MCP 回填只保存待确认稿，页面核对后执行才写入商店，并记录应用状态', async () => {
  const f = fixture();
  const input = { productId: 'p', expectedRevision: 0, title: 'AI 回填', objective: '清晰表达', market: 'CN', analysis: '依据产品事实', target: { versionId: 'v', infoId: 'i', locale: 'zh-Hans' }, before: f.fields, fields: { ...f.fields, subtitle: '新版副标题' } };
  try {
    assert.throws(() => runTool(f.store, 'save_aso_draft', input, { ...access, allowWrites: false }), /只读/);
    assert.throws(() => runTool(f.store, 'save_aso_draft', { ...input, fields: { ...input.fields, name: 'a'.repeat(31) } }, access), /字符/);
    const saved = runTool(f.store, 'save_aso_draft', input, access);
    const plan = saved.workspace.plans[0];
    assert.equal(plan.origin, 'mcp'); assert.equal(plan.status, 'draft');
    assert.equal(f.writes.length, 0);
    assert.throws(() => runTool(f.store, 'save_aso_draft', input, access), /更新/);
    const snapshot = await f.read();
    const oldPreview = await f.aso.preview('p', { token: snapshot.token, fields: input.fields, planId: plan.id });
    const update = { ...input, planId: plan.id, expectedRevision: saved.workspace.revision, fields: { ...input.fields, subtitle: '更新后的副标题' } };
    assert.throws(() => runTool(f.store, 'save_aso_draft', { ...update, expectedRevision: 0 }, access), /更新/);
    assert.throws(() => runTool(f.store, 'save_aso_draft', { ...update, planId: 'unknown' }, access), /待确认/);
    assert.throws(() => runTool(f.store, 'save_aso_draft', { ...update, target: { ...input.target, locale: 'en-US' } }, access), /原目标一致/);
    const updated = runTool(f.store, 'save_aso_draft', update, access);
    assert.equal(updated.planId, plan.id);
    assert.equal(updated.workspace.plans.length, 1);
    assert.equal(updated.workspace.plans[0].createdAt, plan.createdAt);
    assert.deepEqual(updated.workspace.plans[0].fields, update.fields);
    await assert.rejects(f.aso.execute('p', { token: oldPreview.token }), /草稿.*已变化/);
    assert.equal(f.aso.research('p').plans[0].status, 'draft');
    const preview = await f.aso.preview('p', { token: snapshot.token, fields: update.fields, planId: plan.id });
    assert.equal(f.writes.length, 0);
    await f.aso.execute('p', { token: preview.token });
    assert.equal(f.writes.length, 1);
    const after = f.aso.research('p');
    assert.equal(after.plans[0].status, 'applied');
    assert.throws(() => runTool(f.store, 'save_aso_draft', { ...update, expectedRevision: after.revision }, access), /待确认/);
    const state = f.store.read(); state.data.products[0].appStore.appId = '456'; f.store.write(state.data, state.revision);
    assert.equal(f.aso.research('p').plans.length, 0);

    // 测试 clear-drafts 移除全部待确认草稿
    state.data.products[0].appStore.appId = '123'; f.store.write(state.data, state.revision);
    const draftInput = { productId: 'p', expectedRevision: f.aso.research('p').revision, title: '待清空草稿', objective: '测试清空', market: 'CN', analysis: '依据产品事实', target: { versionId: 'v', infoId: 'i', locale: 'zh-Hans' }, before: f.fields, fields: { ...f.fields, subtitle: '临时草稿' } };
    runTool(f.store, 'save_aso_draft', draftInput, access);
    assert.equal(f.aso.research('p').plans.filter(p => p.status === 'draft').length, 1);
    const cleared = f.aso['clear-drafts']('p');
    assert.equal(cleared.ok, true);
    assert.equal(f.aso.research('p').plans.filter(p => p.status === 'draft').length, 0);
  } finally { f.store.close(); }
});
