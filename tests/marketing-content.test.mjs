import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateData } from '../server/validate.mjs';
import { openStore } from '../server/store.mjs';
import { runTool } from '../server/mcp-tools.mjs';
const fixture = () => {
  const data = JSON.parse(readFileSync(new URL('../server/seed.json', import.meta.url)));
  data.products = [{ id: 'p', name: '测试产品', summary: '', appId: '', price: '', platform: 'iOS', website: '', color: 'blue' }];
  data.contents = [{ id: 'marketing-test', productId: data.products[0].id, title: '营销文案', body: '正文', channel: 'X', status: 'ready', date: '', url: '' }];
  return data;
};
test('营销内容兼容历史待审核状态和新增待发布状态', () => {
  for (const status of ['review', 'ready', 'draft', 'published', 'archived']) {
    const data = fixture(); data.contents[0].status = status;
    assert.equal(validateData(data), true);
  }
});
test('实际发布日期可选，存在时校验类型与日期格式', () => {
  for (const date of ['', '2026-11-05']) {
    const data = fixture(); data.contents[0].publishedAt = date;
    assert.equal(validateData(data), true);
  }
  for (const date of [123, 'tomorrow', '2026-1-5']) {
    const data = fixture(); data.contents[0].publishedAt = date;
    assert.equal(validateData(data), false);
  }
});

test('营销内容草稿未绑定产品时，服务端与校验规则允许无 productId 或空 productId', () => {
  // 1. productId 为空字符串，无 sourceSocialIdentity
  const data1 = fixture();
  data1.contents[0].productId = '';
  data1.contents[0].productIds = [];
  assert.equal(validateData(data1), true);

  // 2. productId 未设置 (undefined)，productIds 为 undefined
  const data2 = fixture();
  delete data2.contents[0].productId;
  delete data2.contents[0].productIds;
  assert.equal(validateData(data2), true);

  // 3. 关联无效/不存在的产品 ID 时，依然严格拦截
  const data3 = fixture();
  data3.contents[0].productId = 'non-existent-product';
  assert.equal(validateData(data3), false);
});

test('通过 MCP save_contents 为营销内容组或通用营销保存草稿时，不强制要求 productId', () => {
  const store = openStore(':memory:', fixture());
  const access = { enabled: true, allowWrites: true };

  // 1. productId 传空字符串（营销内容组未绑定产品时，Agent 自动传空字符串）
  const res1 = runTool(store, 'save_contents', {
    expectedRevision: 0,
    fields: {
      groupId: 'grp-1',
      productId: '',
      channel: 'X',
      title: '通用品牌文案1',
      body: '独立开发全流程分享',
      status: 'draft',
    },
  }, access);
  assert.equal(res1.record.productId, '');
  assert.equal(res1.record.title, '通用品牌文案1');
  assert.equal(res1.record.status, 'draft');

  // 2. 省略 productId 字段
  const res2 = runTool(store, 'save_contents', {
    expectedRevision: res1.revision,
    fields: {
      groupId: 'grp-1',
      channel: '小红书',
      title: '通用品牌文案2',
      body: '打造个人品牌',
      status: 'draft',
    },
  }, access);
  assert.equal(res2.record.productId, '');
  assert.equal(res2.record.title, '通用品牌文案2');

  // 3. 传 productIds 为空数组 []
  const res3 = runTool(store, 'save_contents', {
    expectedRevision: res2.revision,
    fields: {
      groupId: 'grp-1',
      productIds: [],
      channel: '知乎',
      title: '通用品牌文案3',
      body: '独立思考与创作',
      status: 'draft',
    },
  }, access);
  assert.equal(res3.record.productId, '');
  assert.equal(res3.record.title, '通用品牌文案3');

  // 4. 传无效产品 ID 时仍应抛错
  assert.throws(() => {
    runTool(store, 'save_contents', {
      expectedRevision: res3.revision,
      fields: {
        productId: 'invalid-prod',
        channel: 'X',
        title: '错误关联产品',
        body: '正文',
        status: 'draft',
      },
    }, access);
  }, /请提供有效的 productId/);
});

test('营销内容支持保存与校验 coverAssetId 封面素材字段', () => {
  const data = fixture();
  data.contents[0].coverAssetId = 'asset-cover-123';
  assert.equal(validateData(data), true);

  // 非字符串类型拦截
  data.contents[0].coverAssetId = 12345;
  assert.equal(validateData(data), false);

  // 空字符串或 undefined 均合法
  data.contents[0].coverAssetId = '';
  assert.equal(validateData(data), true);
  delete data.contents[0].coverAssetId;
  assert.equal(validateData(data), true);
});
