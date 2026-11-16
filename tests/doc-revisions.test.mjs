import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRevisions, resolveRevision } from '../src/doc-revisions.ts';

test('逐条接受、拒绝支持重复文本及位置变化，保留未处理修订', () => {
  let base = { title: '旧标题', body: '第一段：保留。\n第二段：删除。\n第三段：原文。' };
  let current = { title: '新标题', body: '第一段：保留。\n第二段：新增。\n第三段：更新。\n末尾追加。' };
  const title = getRevisions(base, current).find(r => r.field === 'title');
  ({ base, current } = resolveRevision(base, current, title, true));
  assert.equal(base.title, current.title);
  const body = getRevisions(base, current).find(r => r.field === 'body');
  const expected = current.body.slice(0, body.afterStart) + body.before + current.body.slice(body.afterStart + body.after.length);
  ({ base, current } = resolveRevision(base, current, body, false));
  assert.equal(current.body, expected);
  while (getRevisions(base, current).length) ({ base, current } = resolveRevision(base, current, getRevisions(base, current)[0], true));
  assert.deepEqual(base, current);
});

test('纯新增、纯删除和重复文本可完整拒绝恢复', () => {
  for (const [before, after] of [['', '新增'], ['删除', ''], ['相同 相同 相同', '不同 相同 不同']]) {
    let base = { title: '标题', body: before }, current = { title: '标题', body: after };
    while (getRevisions(base, current).length) ({ base, current } = resolveRevision(base, current, getRevisions(base, current)[0], false));
    assert.equal(current.body, before);
  }
});

test('同段相邻修订合并为一条，可整体接受和拒绝', async () => {
  const { mergeRevisions } = await import('../src/doc-revisions.ts');
  const base = { title: '标题', body: '原来支持苹果系统以及旧版功能。' };
  const current = { title: '标题', body: '现在支持安卓系统以及新版功能。' };
  const raw = getRevisions(base, current);
  assert.ok(raw.length > 1);
  const merged = mergeRevisions(base, current, raw, () => '用户需求 · 同一次编辑');
  assert.equal(merged.length, 1);
  assert.deepEqual(resolveRevision(base, current, merged[0], false).current, base);
  assert.deepEqual(resolveRevision(base, current, merged[0], true).base, current);
});

test('跨段落、距离较远、不同来源的修订不合并', async () => {
  const { mergeRevisions } = await import('../src/doc-revisions.ts');
  for (const gap of ['\n\n', '这是需要完整保留的一大段中间正文，两个相隔很远的改动应独立审阅。']) {
    const base = { title: '', body: '旧' + gap + '原' }, current = { title: '', body: '新' + gap + '改' };
    assert.equal(mergeRevisions(base, current, getRevisions(base, current), () => '同来源').length, 2);
  }
  const base = { title: '', body: '旧内容和原资料' }, current = { title: '', body: '新内容和新资料' };
  assert.equal(mergeRevisions(base, current, getRevisions(base, current), r => r.id).length, 2);
});

test('格式变化不生成修订，混合内容变化只保留文字差异', () => {
  const base = { title: '标题', body: '产品介绍\n\n核心功能' };
  const current = { title: '标题', body: '# 产品介绍\n\n**核心功能**' };
  assert.equal(getRevisions(base, current).length, 0);
  const changes = getRevisions({ title: '', body: '旧功能' }, { title: '', body: '**新功能**' });
  assert.equal(changes.length, 1);
  assert.ok(changes[0].before.includes('旧'));
  assert.equal(resolveRevision({ title: '', body: '旧功能' }, { title: '', body: '**新功能**' }, changes[0], false).current.body, '**旧功能**');
});

test('手动增删直接接受，拒绝外部修改仍保留手动内容', async () => {
  const { acceptManualEdit } = await import('../src/doc-revisions.ts');
  const base = { title: '标题', body: '第一段原文。\n\n第二段原文。' };
  const current = { title: '标题', body: '第一段外部修改。\n\n第二段原文。' };
  const next = { title: '手动标题', body: current.body + '\n\n手动新增内容。' };
  const accepted = acceptManualEdit(base, current, next);
  assert.equal(accepted.title, '手动标题');
  assert.equal(accepted.body, base.body + '\n\n手动新增内容。');
  assert.ok(getRevisions(accepted, next).every(r => r.field === 'body'));
  const touched = { ...current, body: '第一段用户确定的内容。\n\n第二段原文。' };
  assert.deepEqual(acceptManualEdit(base, current, touched), touched);
});

test('手动格式调整保留未审阅的外部文字差异', async () => {
  const { acceptManualEdit } = await import('../src/doc-revisions.ts');
  const base = { title: '', body: '旧内容' }, current = { title: '', body: '新内容' }, next = { title: '', body: '**新内容**' };
  const accepted = acceptManualEdit(base, current, next);
  assert.equal(accepted.body, '**旧内容**');
  assert.equal(getRevisions(accepted, next).length, 1);
});
