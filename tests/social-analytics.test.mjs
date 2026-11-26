import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
import { runTool } from '../server/mcp-tools.mjs';
const initial = { products: [], docs: [], releases: [], contents: [], tasks: [] };
function fixture() {
  const store = openStore(':memory:', initial);
  const saved = saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'reddit', name: '测试账号', url: 'https://www.reddit.com/user/example' }] });
  const snapshot = { accountId: saved.accounts[0].id, kind: 'content', title: '实际帖子', url: 'https://www.reddit.com/r/test/comments/abc', observedAt: '2026-11-06T10:00:00Z', period: 'lifetime', periodEnd: '2026-11-06', source: 'browser', sourceNote: 'Post Insights，累计数据', metrics: { views: 120, score: -2, likes: null } };
  return { store, snapshot };
}
test('保留历史，重复回填幂等，缺失值不补零，备份可恢复', () => {
  const { store, snapshot } = fixture();
  try {
    assert.equal(saveSocial(store, { expectedRevision: 1, snapshots: [snapshot] }).inserted, 1);
    assert.equal(saveSocial(store, { expectedRevision: 2, snapshots: [{ ...snapshot, metrics: { views: 130 } }] }).updated, 1);
    saveSocial(store, { expectedRevision: 3, snapshots: [{ ...snapshot, observedAt: '2026-11-07T10:00:00Z', periodEnd: '2026-11-07' }] });
    const context = socialContext(store);
    assert.equal(context.snapshots.length, 2);
    assert.equal(context.snapshots[0].metrics.likes, undefined);
    const restored = openStore(':memory:', initial);
    try { assert.ok(restored.write(store.read().data, 0)); assert.equal(socialContext(restored).snapshots.length, 2); } finally { restored.close(); }
  } finally { store.close(); }
});
test('拒绝冲突、未知账号、错误周期、错误指标与混入其他平台，整批不部分保存', () => {
  const { store, snapshot } = fixture();
  try {
    assert.throws(() => saveSocial(store, { expectedRevision: 0, snapshots: [snapshot] }), /已更新/);
    for (const patch of [{ accountId: 'missing' }, { period: 'range' }, { periodEnd: '2026-02-30' }, { metrics: { views: -1 } }, { metrics: {} }, { metrics: { upvoteRatio: 90 } }, { url: 'https://x.com/example/status/1' }, { metrics: { followers: 1 } }]) {
      assert.throws(() => saveSocial(store, { expectedRevision: 1, snapshots: [snapshot, { ...snapshot, ...patch }] }));
      assert.equal(socialContext(store).snapshots.length, 0);
      assert.equal(store.read().revision, 1);
    }
    assert.throws(() => saveSocial(store, { expectedRevision: 1, accounts: [{ platform: 'x', name: '错误账号', url: 'https://example.com' }] }), /不匹配/);
  } finally { store.close(); }
});
test('MCP 上下文只读，旧工作区兼容', () => {
  const { store, snapshot } = fixture();
  try {
    assert.equal(runTool(store, 'get_social_analytics_context', { platform: 'x' }, { enabled: true }).accounts.length, 0);
    assert.throws(() => runTool(store, 'save_social_analytics', { expectedRevision: 1, snapshots: [snapshot] }, { enabled: true, allowWrites: true }), /工具不存在/);
    const result = saveSocial(store, { expectedRevision: 1, snapshots: [snapshot] });
    assert.equal(result.inserted, 1);
    assert.equal(socialContext(store).snapshots[0].metrics.score, -2);
  } finally { store.close(); }
});

test('同标题用发布日期消歧，仍有重名时由用户确认且后续快照沿用关联', async () => {
  const { linkMarketing } = await import('../server/social-analytics.mjs');
  const { store, snapshot } = fixture();
  try {
    const { data, revision } = store.read();
    data.products.push({ id: 'p', name: '产品', summary: '', appId: '', price: '', platform: 'iOS', website: '', color: 'blue' });
    const content = { productId: 'p', channel: 'Reddit', title: snapshot.title, body: '', date: '', url: '', status: 'published' };
    data.contents.push({ ...content, id: 'first', publishedAt: '2026-11-05' }, { ...content, id: 'second', publishedAt: '2026-11-06' });
    store.write(data, revision);
    const row = { ...snapshot, publishedAt: '2026-11-06' };
    saveSocial(store, { expectedRevision: 2, snapshots: [row] });
    let context = socialContext(store);
    const id = context.snapshots[0].id;
    assert.equal(context.contentLinks[id].id, 'second');
    const current = store.read();
    current.data.contents.push({ ...content, id: 'third', publishedAt: '2026-11-06' });
    store.write(current.data, current.revision);
    context = socialContext(store);
    assert.deepEqual(context.contentLinks[id].options.map(c => c.id), ['second', 'third']);
    linkMarketing(store, { expectedRevision: context.revision, marketingLink: { snapshotId: id, contentId: 'third' } });
    saveSocial(store, { expectedRevision: context.revision + 1, snapshots: [{ ...row, observedAt: '2026-11-07T10:00:00Z' }] });
    context = socialContext(store);
    assert.ok(Object.values(context.contentLinks).every(c => c.id === 'third'));
  } finally { store.close(); }
});

test('未在营销内容中找到对应标题的数据，可通过 linkMarketing 手动关联营销内容文章', async () => {
  const { linkMarketing } = await import('../server/social-analytics.mjs');
  const { store, snapshot } = fixture();
  try {
    const { data, revision } = store.read();
    data.products.push({ id: 'p', name: '产品', summary: '', appId: '', price: '', platform: 'iOS', website: '', color: 'blue' });
    const content = { id: 'manual-content-1', productId: 'p', channel: 'Reddit', title: '完全不同的营销文章标题', body: '', date: '', url: '', status: 'published' };
    data.contents.push(content);
    store.write(data, revision);

    // 导入数据，其标题与营销内容文章不同
    const row = { ...snapshot, title: '导入的不匹配标题帖子', publishedAt: '2026-11-06' };
    saveSocial(store, { expectedRevision: 2, snapshots: [row] });
    let context = socialContext(store);
    const id = context.snapshots[0].id;
    // 此时未找到对应营销文章
    assert.equal(context.contentLinks[id].id, undefined);
    assert.equal(context.contentLinks[id].ambiguous, undefined);
    // context.contents 中包含该营销文章，供前端下拉选择
    assert.ok(context.contents.some(c => c.id === 'manual-content-1'));

    // 手动关联该营销内容文章
    linkMarketing(store, { expectedRevision: context.revision, marketingLink: { snapshotId: id, contentId: 'manual-content-1' } });
    context = socialContext(store);
    assert.equal(context.contentLinks[id].id, 'manual-content-1');
    assert.equal(context.contentLinks[id].title, '完全不同的营销文章标题');
  } finally { store.close(); }
});
