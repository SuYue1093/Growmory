import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseXiaohongshu, importXiaohongshu } from '../server/xiaohongshu-import.mjs';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
const headers = ['笔记标题', '首次发布时间', '体裁', '曝光', '观看量', '封面点击率', '点赞', '评论', '收藏', '涨粉', '分享', '人均观看时长', '弹幕'];
async function file(rows = [['测试笔记', '2026年11月06日13时50分23秒', '视频', 0, 70, 0.208, 1, 0, 0, 2, 1, 1.5, 0]]) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date('2026-11-06T07:49:20Z');
  const sheet = workbook.addWorksheet('Sheet1');
  sheet.addRow(Array(13).fill('最多导出排序后前1000条笔记'));
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
function fixture() {
  const store = openStore(':memory:', { products: [], docs: [], contents: [], releases: [], tasks: [] });
  const saved = saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'xiaohongshu', name: '测试账号', url: 'https://www.xiaohongshu.com/user/profile/test' }, { platform: 'reddit', name: 'Reddit', url: 'https://www.reddit.com/user/test' }] });
  return { store, accountId: saved.accounts[0].id, otherId: saved.accounts[1].id };
}
test('识别说明行、原始列和中文时间，保留0与比例、小数时长，不将缺失指标补0', async () => {
  const parsed = await parseXiaohongshu(await file());
  assert.equal(parsed.headerRow, 2);
  assert.equal(parsed.rows[0].publishedTime, '2026-11-06T13:50:23+08:00');
  assert.equal(parsed.rows[0].metrics.impressions, 0);
  assert.equal(parsed.rows[0].metrics.coverClickRate, 0.208);
  assert.equal(parsed.rows[0].metrics.avgViewDuration, 1.5);
  assert.equal(parsed.rows[0].url, undefined);
  assert.equal(parsed.exportedAt, '2026-11-06T07:49:20.000Z');
  const missing = await parseXiaohongshu(await file([['', '2026年11月06日13时50分23秒', '图文', null, 70, '20.8%', 0]]));
  assert.equal(missing.rows[0].title, '无标题笔记');
  assert.equal(missing.rows[0].metrics.impressions, undefined);
  assert.equal(missing.rows[0].metrics.likes, 0);
  assert.ok(Math.abs(missing.rows[0].metrics.coverClickRate - 0.208) < 1e-12);
  assert.equal(missing.issues.length, 0);
});
test('按完整发布时间区分同名笔记，同文件重复导入更新，不同文件保留历史，支持整体恢复', async () => {
  const { store, accountId } = fixture();
  try {
    const buffer = await file([['同名', '2026年11月06日13时50分23秒', '图文', 10, 2], ['同名', '2026年11月06日13时50分24秒', '图文', 20, 3]]);
    const input = { action: 'save', fileName: '笔记列表明细表.xlsx', fileData: buffer.toString('base64'), accountId, observedAt: '2026-11-06T07:49:20Z', period: 'lifetime' };
    assert.equal((await importXiaohongshu(store, { ...input, expectedRevision: 1 })).inserted, 2);
    assert.equal((await importXiaohongshu(store, { ...input, expectedRevision: 2, observedAt: '2026-11-06T08:00:00Z' })).updated, 2);
    const next = await file([['同名', '2026年11月06日13时50分23秒', '图文', 12, 4]]);
    assert.equal((await importXiaohongshu(store, { ...input, fileData: next.toString('base64'), expectedRevision: 3, observedAt: '2026-11-07T08:00:00Z' })).inserted, 1);
    assert.equal(socialContext(store).snapshots.length, 3);
    const restored = openStore(':memory:', { products: [], docs: [], contents: [], releases: [], tasks: [] });
    try { assert.ok(restored.write(store.read().data, 0)); assert.equal(socialContext(restored).snapshots.length, 3); } finally { restored.close(); }
  } finally { store.close(); }
});
test('错误行、公式、重复身份、无效时间与错误账号阻止整批写入；预览不写库', async () => {
  const { store, accountId, otherId } = fixture();
  try {
    const buffer = await file();
    const input = { action: 'save', fileName: '原始.xlsx', fileData: buffer.toString('base64'), accountId, observedAt: '2026-11-06T07:49:20Z', period: 'lifetime', expectedRevision: 1 };
    await importXiaohongshu(store, { ...input, action: 'preview' });
    assert.equal(store.read().revision, 1);
    await assert.rejects(() => importXiaohongshu(store, { ...input, accountId: otherId }), /小红书账号/);
    await assert.rejects(() => importXiaohongshu(store, { ...input, observedAt: '2026-01-01T00:00:00Z' }), /早于/);
    await assert.rejects(() => importXiaohongshu(store, { ...input, period: 'range' }), /起止日期/);
    await assert.rejects(() => importXiaohongshu(store, { ...input, expectedRevision: 0 }), /已更新/);
    for (const cell of [-1, { formula: '1+1', result: 2 }, '未知数值']) {
      const bad = await file([['错误行', '2026年11月06日13时50分23秒', '图文', cell, 2]]);
      const parsed = await parseXiaohongshu(bad);
      assert.equal(parsed.issues[0].row, 3);
      await assert.rejects(() => importXiaohongshu(store, { ...input, fileData: bad.toString('base64') }), /修正/);
    }
    const repeated = await parseXiaohongshu(await file([['重复', '2026年11月06日13时50分23秒', '图文', 1], ['重复', '2026年11月06日13时50分23秒', '图文', 2]]));
    assert.equal(repeated.issues.length, 1);
    const wrongDate = await parseXiaohongshu(await file([['日期', '2026年02月30日13时50分23秒', '图文', 1]]));
    assert.equal(wrongDate.issues.length, 1);
    await assert.rejects(() => parseXiaohongshu(Buffer.from('not an xlsx')), /无法读取/);
    assert.equal(socialContext(store).snapshots.length, 0);
    assert.equal(store.read().revision, 1);
  } finally { store.close(); }
});
test('支持官方导出上限1000条，超限拒绝', async () => {
  const { store, accountId } = fixture();
  try {
    const rows = Array.from({ length: 1000 }, (_, i) => [`笔记${i}`, '2026年11月06日13时50分23秒', '图文', i, 0]);
    const buffer = await file(rows);
    const saved = await importXiaohongshu(store, { action: 'save', expectedRevision: 1, accountId, fileName: '1000.xlsx', fileData: buffer.toString('base64'), observedAt: '2026-11-06T07:49:20Z', period: 'range', periodStart: '2026-11-01' });
    assert.equal(saved.inserted, 1000);
    assert.equal(socialContext(store).snapshots[0].periodStart, '2026-11-01');
    rows.push(['超限', '2026年11月06日13时50分23秒', '图文', 1]);
    await assert.rejects(() => file(rows).then(parseXiaohongshu), /1000/);
  } finally { store.close(); }
});
