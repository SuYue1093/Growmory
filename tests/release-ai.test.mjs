import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateRelease, plainText } from '../server/release-ai.mjs';
const ai = { configured: true, apiKey: 'secret', baseUrl: 'https://example.test/v1', model: 'test' };
const release = { changes: '**新增**导出', languages: ['en-US'], version: 'private-version' };
const docs = [{ id: 'doc', title: '# 介绍', body: '# 当前功能\n\n[导出](https://private.test)\n\n![图片](data:image/png;base64,SECRET)', history: [{ body: '历史机密' }] }];
test('翻译只发送更新纯文本与目标语言，不携带文档或产品资料', async () => {
  let input;
  const result = await generateRelease({ release, docs, ai, onlyNotes: true, fetcher: async (_, options) => {
    input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ notes: [{ locale: 'en-US', body: 'Added export' }] }) } }] });
  } });
  assert.deepEqual(input, { changes: '新增导出', locales: ['en-US'] });
  assert.equal(result.notes[0].body, 'Added export');
});
test('文档仅发送当前纯文本，Markdown 结果保留原文供批阅', async () => {
  let input;
  const result = await generateRelease({ release, docs, ai, fetcher: async (_, options) => {
    input = JSON.parse(JSON.parse(options.body).messages[1].content);
    return Response.json({ choices: [{ message: { content: JSON.stringify({ documents: [{ docId: 'doc', body: '# 功能\n\n支持导出', reason: '新增导出' }] }) } }] });
  } });
  assert.deepEqual(input, { changes: '新增导出', docs: [{ docId: 'doc', title: '介绍', body: '当前功能\n\n导出' }] });
  assert.equal(result.documents[0].before, docs[0].body);
  assert.equal(result.documents[0].body, '# 功能\n\n支持导出');
  assert.equal(plainText('<img src="data:secret">'), '');
});
test('空更新、未配置、无文档在模型调用前拒绝', async () => {
  const fetcher = () => { throw Error('不应请求'); };
  await assert.rejects(generateRelease({ release, docs, ai: { configured: false }, fetcher }), e => e.status === 503);
  await assert.rejects(generateRelease({ release: { changes: '' }, docs, ai, fetcher }), e => e.status === 400);
  await assert.rejects(generateRelease({ release, docs: [], ai, fetcher }), e => e.status === 400);
});

test('仅选择用户指定的当前产品已确认资料，空选择和失效选择拒绝', async () => {
  const { selectReleaseDocs } = await import('../server/release-ai.mjs');
  const selected = { ...docs[0], productId: 'p', status: 'confirmed' };
  const data = { docs: [selected, { id: 'unselected', productId: 'p', status: 'confirmed' }, { id: 'pending', productId: 'p', status: 'pending' }, { id: 'other', productId: 'other', status: 'confirmed' }] };
  assert.deepEqual(selectReleaseDocs(data, { productId: 'p' }, ['doc']), [selected]);
  for (const ids of [undefined, [], ['missing'], ['pending'], ['other'], ['doc', 'other']]) assert.throws(() => selectReleaseDocs(data, { productId: 'p' }, ids), e => e.status === 400);
});
test('提示词允许忽略无关更新与返回空建议，不要求修改全部所选资料', async () => {
  let instruction;
  const result = await generateRelease({ release, docs, ai, fetcher: async (_, options) => {
    instruction = JSON.parse(options.body).messages[0].content;
    return Response.json({ choices: [{ message: { content: '{"documents":[]}' } }] });
  } });
  assert.deepEqual(result.documents, []);
  for (const rule of ['常规 bug 修复', '不要求覆盖所有更新点', '不要求修改所有所选资料', '标题、用途、主题', '仅作必要修改']) assert.ok(instruction.includes(rule));
});
test('AI 返回未选择的资料时拒绝，不能扩展更新范围', async () => {
  await assert.rejects(generateRelease({ release, docs, ai, fetcher: async () => Response.json({ choices: [{ message: { content: JSON.stringify({ documents: [{ docId: 'unselected', body: '不应修改', reason: '无效范围' }] }) } }] }) }), e => e.status === 502);
});

test('提示词要求AI提供文档版本号、版本标题与版本概述，并正确解析返回', async () => {
  let instruction;
  const result = await generateRelease({ release: { ...release, version: '2.1.0' }, docs, ai, fetcher: async (_, options) => {
    instruction = JSON.parse(options.body).messages[0].content;
    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            documents: [{
              docId: 'doc',
              version: 'v2.1',
              title: '功能介绍（2.1更新）',
              summary: '根据 2.1.0 版本新增导出功能的长期说明',
              body: '# 功能\n\n支持导出',
              reason: '新增导出功能',
            }]
          })
        }
      }]
    });
  } });
  for (const rule of ['version', 'title', 'summary', '文档版本号', '文档版本标题', '文档版本概述']) {
    assert.ok(instruction.includes(rule));
  }
  assert.equal(result.documents[0].version, 'v2.1');
  assert.equal(result.documents[0].title, '功能介绍（2.1更新）');
  assert.equal(result.documents[0].summary, '根据 2.1.0 版本新增导出功能的长期说明');
});

