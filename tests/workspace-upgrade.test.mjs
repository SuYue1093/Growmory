import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { runTool } from '../server/mcp-tools.mjs';
import { reviseRelease, releaseReadiness } from '../src/release-workflow.ts';

const initial = () => ({ products: [], docs: [], docFolders: [], releases: [], contents: [], tasks: [] });
const product = { id: 'product', name: '产品', summary: '', appId: '', price: '', platform: '', website: '', color: 'blue' };
const doc = (productId = '') => ({ id: 'doc', productId, title: '个人信息', body: '开发者简介', status: 'pending', history: [], updatedAt: '2026-11-05' });
const access = { enabled: true, allowWrites: true };

test('没有产品时也能创建通用资料、分层归档并保留历史', () => {
  const store = openStore(':memory:', initial());
  try {
    const state = store.read();
    state.data.docFolders.push({ id: 'root', productId: '', name: '个人资料', parentId: '' }, { id: 'child', productId: '', name: '品牌', parentId: 'root' });
    state.data.docs.push({ ...doc(), folderId: 'child', history: [{ body: '旧简介', at: '2026-11-04' }] });
    const saved = store.write(state.data, state.revision);
    assert.equal(saved.data.docs[0].productId, '');
    assert.equal(store.read().data.docs[0].history[0].body, '旧简介');
    const invalid = structuredClone(saved.data);
    invalid.tasks.push({ id: 't', productId: 'missing-product', title: '任务不可关联不存在产品', done: false, date: '' });
    assert.throws(() => store.write(invalid, saved.revision));
  } finally { store.close(); }
});

test('通用与产品资料不能跨域引用目录，也不能把错误产品 ID 当成通用资料', () => {
  const store = openStore(':memory:', initial());
  try {
    const state = store.read();
    state.data.products.push(product);
    state.data.docFolders.push({ id: 'shared', productId: '', name: '通用', parentId: '' }, { id: 'owned', productId: product.id, name: '产品', parentId: '' });
    state.data.docs.push({ ...doc(), folderId: 'shared' });
    const saved = store.write(state.data, state.revision);
    for (const patch of [{ productId: product.id }, { folderId: 'owned' }, { productId: 'missing' }]) {
      const invalid = structuredClone(saved.data);
      Object.assign(invalid.docs[0], patch);
      assert.throws(() => store.write(invalid, saved.revision));
    }
    const invalid = structuredClone(saved.data);
    invalid.docFolders[0].parentId = 'owned';
    assert.throws(() => store.write(invalid, saved.revision));
  } finally { store.close(); }
});

test('MCP 创建和查询通用资料，更新正文保留历史并撤销确认', () => {
  const store = openStore(':memory:', initial());
  try {
    let saved = runTool(store, 'save_docs', { expectedRevision: 0, fields: { source: 'MCP 测试', title: '开发者介绍', body: '原文', status: 'confirmed' } }, access);
    const id = saved.record.id;
    assert.equal(saved.record.productId, '');
    saved = runTool(store, 'save_products', { expectedRevision: saved.revision, fields: { name: '测试产品' } }, access);
    saved = runTool(store, 'save_docs', { expectedRevision: saved.revision, fields: { productId: saved.record.id, source: 'MCP 测试', title: '产品资料', body: '产品事实' } }, access);
    const shared = runTool(store, 'list_records', { collection: 'docs', productId: '' }, access);
    assert.equal(shared.total, 1);
    assert.equal(runTool(store, 'list_records', { collection: 'docs' }, access).total, 2);
    const updated = runTool(store, 'save_docs', { expectedRevision: saved.revision, id, fields: { body: '新简介', source: 'MCP 修改测试' } }, access);
    assert.equal(updated.record.status, 'pending');
    assert.equal(updated.record.history[0].body, '原文');
  } finally { store.close(); }
});

const release = () => ({ id: 'r', productId: 'p', version: '1.0', changes: '新增功能', languages: ['中文', '英文'], channels: ['X'], status: 'preparing', createdAt: '2026-11-05', notes: [{ language: '中文', body: '说明', approved: true }, { language: '英文', body: 'Notes', approved: true }], proposals: [{ docId: 'd', before: '', body: '', reason: '', applied: false }] });

test('渠道调整保留说明确认与知识建议，更新内容改变才使相关成果失效', () => {
  const source = release();
  const channels = reviseRelease(source, { channels: ['小红书'] });
  assert.ok(channels.notes.every(note => note.approved));
  assert.equal(channels.proposals.length, 1);
  const changes = reviseRelease(source, { changes: '不同的更新内容' });
  assert.ok(changes.notes.every(note => !note.approved));
  assert.equal(changes.proposals.length, 0);
  assert.ok(source.notes.every(note => note.approved));
});

test('语言增减保留已有说明，新增语言准确显示为待补充', () => {
  const changed = reviseRelease(release(), { languages: ['中文', '日文'] });
  assert.deepEqual(changed.notes.map(note => note.language), ['中文']);
  assert.equal(changed.notes[0].approved, true);
  assert.deepEqual(releaseReadiness(changed), { missing: ['日文'], unapproved: [], confirmed: 1 });
  changed.notes.push({ language: '日文', body: '  ', approved: true });
  assert.deepEqual(releaseReadiness(changed).missing, ['日文']);
});
