import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAppStoreInput,
  lookupPublicApp,
  searchPublicApps,
  suggestPublicKeywords,
  getPublicRatings,
  getPublicSimilar,
  getPublicTopCharts
} from '../server/app-store-public.mjs';

test('parseAppStoreInput 正确解析各种 App Store 输入格式', () => {
  // 纯数字 ID
  assert.deepEqual(parseAppStoreInput('553834731'), { id: '553834731', country: 'cn' });

  // 网页链接 (带国家与中文 slug)
  assert.deepEqual(
    parseAppStoreInput('https://apps.apple.com/cn/app/%E5%BE%AE%E4%BF%A1/id414478124'),
    { id: '414478124', country: 'cn' }
  );

  // 网页链接 (美区)
  assert.deepEqual(
    parseAppStoreInput('https://apps.apple.com/us/app/candy-crush-saga/id553834731?mt=8'),
    { id: '553834731', country: 'us' }
  );

  // itunes 链接
  assert.deepEqual(
    parseAppStoreInput('https://itunes.apple.com/app/id553834731'),
    { id: '553834731', country: 'cn' }
  );

  // Bundle ID
  assert.deepEqual(
    parseAppStoreInput('com.midasplayer.apps.candycrushsaga'),
    { appId: 'com.midasplayer.apps.candycrushsaga', country: 'cn' }
  );

  // 普通关键词搜索
  assert.deepEqual(parseAppStoreInput('Notion'), { term: 'Notion', country: 'cn' });
  assert.deepEqual(parseAppStoreInput('  记账助手 '), { term: '记账助手', country: 'cn' });

  // 空值或非字符串
  assert.equal(parseAppStoreInput(''), null);
  assert.equal(parseAppStoreInput('   '), null);
  assert.equal(parseAppStoreInput(null), null);
});

test('suggestPublicKeywords 能够获取真实搜索下拉建议', async () => {
  const hints = await suggestPublicKeywords({ term: 'notion', country: 'cn' });
  assert.ok(Array.isArray(hints));
  assert.ok(hints.length > 0);
  assert.ok(hints.some(h => h.toLowerCase().includes('notion')));
});

test('lookupPublicApp 能够查询公开应用元数据', async () => {
  const app = await lookupPublicApp({ id: '553834731', country: 'us' });
  assert.equal(app.id, 553834731);
  assert.equal(app.appId, 'com.midasplayer.apps.candycrushsaga');
  assert.ok(app.title.includes('Candy Crush'));
  assert.ok(typeof app.score === 'number');
  assert.ok(Array.isArray(app.genres));
  assert.ok(typeof app.icon === 'string');
});

test('searchPublicApps 能够检索应用列表', async () => {
  const results = await searchPublicApps({ term: 'notion', country: 'cn', num: 3 });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0);
  assert.ok(results[0].title);
  assert.ok(results[0].id);
});

test('getPublicRatings 能够获取评分直方图', async () => {
  const result = await getPublicRatings({ id: '553834731', country: 'us' });
  assert.ok(typeof result.ratings === 'number');
  assert.ok(result.histogram);
  assert.ok(typeof result.histogram['5'] === 'number');
});

test('getPublicTopCharts 支持按品类与大盘获取榜单', async () => {
  // 1. 全品类总榜
  const allCharts = await getPublicTopCharts({ collection: 'TOP_FREE', num: 3 });
  assert.ok(Array.isArray(allCharts));
  assert.equal(allCharts.length, 3);

  // 2. 效率品类榜单（英文标识）
  const productivityCharts = await getPublicTopCharts({ category: 'PRODUCTIVITY', num: 3 });
  assert.ok(Array.isArray(productivityCharts));
  assert.equal(productivityCharts.length, 3);

  // 3. 效率品类榜单（中文分类名）
  const chineseCatCharts = await getPublicTopCharts({ category: '效率', num: 3 });
  assert.ok(Array.isArray(chineseCatCharts));
  assert.equal(chineseCatCharts.length, 3);
  assert.equal(chineseCatCharts[0].id, productivityCharts[0].id);
});
