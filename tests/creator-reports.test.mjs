import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
import { importCreatorReport, exportCreatorReport, syncWechatReport } from '../server/creator-reports.mjs';

const initial = { products: [], docs: [], tasks: [], releases: [], contents: [] };

test('掘金 CSV 保留真实指标和区间，Excel 导出可读，校验失败不部分写入', async () => {
  const store = openStore(':memory:', initial);
  try {
    const { accounts } = saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'juejin', name: '测试', url: 'https://juejin.cn/user/123' }] });
    const args = { accountId: accounts[0].id, expectedRevision: 1, fileName: 'report.csv',
      period: 'range', periodStart: '2026-11-01', periodEnd: '2026-11-08',
      fileData: Buffer.from('文章标题,发布日期,阅读次数,点赞数,展现量\n测试文章,2026/11/2,23,0,').toString('base64') };
    await assert.rejects(importCreatorReport(store, 'wechat', args), /对应平台/);
    assert.equal((await importCreatorReport(store, 'juejin', args)).inserted, 1);
    assert.equal((await importCreatorReport(store, 'juejin', { ...args, expectedRevision: 2 })).updated, 1);
    const context = socialContext(store);
    assert.deepEqual(context.snapshots[0].metrics, { views: 23, likes: 0 });
    assert.equal(context.snapshots[0].publishedAt, '2026-11-02');
    const output = await exportCreatorReport(store, 'juejin', accounts[0].id);
    await importCreatorReport(store, 'juejin', { ...args, expectedRevision: 3, fileName: 'report.xlsx', fileData: Buffer.from(output).toString('base64') });
    assert.equal(socialContext(store).summaries.length, 1);
  } finally { store.close(); }
});

test('微信公众号官方接口链路保留截至日期和真实指标，重复同步更新同一区间', async () => {
  const store = openStore(':memory:', initial);
  try {
    const { accounts } = saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'wechat', name: '测试' }] });
    const args = { accountId: accounts[0].id, expectedRevision: 1, appId: 'wx1234567890abcdef', secret: 'fixture-secret', publishedDay: '2025-11-01' };
    const fetcher = async (url, options) => {
      assert.equal(new URL(url).host, 'api.weixin.qq.com');
      if (url.endsWith('/stable_token')) return Response.json({ access_token: 'fixture-token' });
      assert.match(url, /getarticletotal/);
      assert.deepEqual(JSON.parse(options.body), { begin_date: '2025-11-01', end_date: '2025-11-01' });
      return Response.json({ list: [{ msgid: '123_1', title: '测试文章', details: [
        { stat_date: '2025-11-01', int_page_read_count: 10 },
        { stat_date: '2025-11-03', int_page_read_count: 24, share_count: 3, target_user: 300 },
      ] }] });
    };
    assert.equal((await syncWechatReport(store, args, fetcher)).inserted, 1);
    assert.equal((await syncWechatReport(store, { ...args, expectedRevision: 2 }, fetcher)).updated, 1);
    const { snapshots } = socialContext(store);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].periodEnd, '2025-11-03');
    assert.deepEqual(snapshots[0].metrics, { views: 24, shares: 3 });
    assert.ok(!JSON.stringify(store.read()).includes(args.secret));
  } finally { store.close(); }
});

test('公众号配置随账号提交，保留未改密钥且不进入工作区数据', () => {
  const store = openStore(':memory:', initial);
  try {
    const account = { platform: 'wechat', name: '测试' };
    const api = { appId: 'wx1234567890abcdef', secret: 'fixture-secret' };
    assert.throws(() => saveSocial(store, { expectedRevision: 0, accounts: [account], wechatApi: { appId: api.appId } }), /AppSecret/);
    assert.throws(() => saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'juejin', name: '掘金测试' }] }), /主页链接/);
    assert.equal(store.read().revision, 0);
    const { accounts: [saved] } = saveSocial(store, { expectedRevision: 0, accounts: [account], wechatApi: api });
    saveSocial(store, { expectedRevision: 1, accounts: [{ ...saved, name: '改名' }], wechatApi: { appId: api.appId } });
    assert.deepEqual({ ...store.wechatCredential(saved.id) }, api);
    assert.throws(() => saveSocial(store, { expectedRevision: 2, accounts: [saved], wechatApi: { appId: 'wxabcdef1234567890' } }), /AppSecret/);
    assert.equal(store.read().revision, 2);
    assert.ok(!JSON.stringify(store.read()).includes(api.secret));
    assert.ok(!JSON.stringify(socialContext(store)).includes(api.secret));
    const { accounts } = saveSocial(store, { expectedRevision: 2, accounts: [{ ...account, name: '另一个公众号' }] });
    assert.equal(accounts.length, 2);
    assert.ok(accounts.every(a => a.url === ''));
  } finally { store.close(); }
});

test('公众号历史同步逐日读取，额度错误保留已取得数据并返回续跑位置', async () => {
  const store = openStore(':memory:', initial);
  try {
    const { accounts } = saveSocial(store, { expectedRevision: 0, accounts: [{ platform: 'wechat', name: '历史同步' }] });
    const args = { accountId: accounts[0].id, expectedRevision: 1, appId: 'wx1234567890abcdef', secret: 'fixture-secret' };
    const dates = [];
    const fetcher = async (url, options) => {
      if (url.endsWith('/stable_token')) return Response.json({ access_token: 'fixture-token' });
      const { begin_date, end_date } = JSON.parse(options.body);
      assert.equal(begin_date, end_date);
      dates.push(begin_date);
      if (begin_date === '2014-12-01') return Response.json({ errcode: 45009 });
      return Response.json({ list: [{ msgid: '123_1', title: '历史图文', details: [{ stat_date: begin_date, int_page_read_count: 12 }] }] });
    };
    const batch = await syncWechatReport(store, { ...args, cursor: '2014-12-02' }, fetcher);
    assert.deepEqual(dates, ['2014-12-02', '2014-12-01']);
    assert.equal(batch.inserted, 1);
    assert.equal(batch.nextCursor, '2014-12-01');
    assert.match(batch.error, /调用额度/);
    const final = await syncWechatReport(store, { ...args, expectedRevision: batch.revision, cursor: batch.nextCursor },
      async url => Response.json(url.endsWith('/stable_token') ? { access_token: 'fixture-token' } : { list: [] }));
    assert.equal(final.nextCursor, null);
    assert.equal(socialContext(store).snapshots.length, 1);
  } finally { store.close(); }
});

test('公众号旧版报表只保存文章阅读人数，掘金整体分析按日保存，错平台文件不入库', async () => {
  const { utils, write } = await import('@e965/xlsx');
  const store = openStore(':memory:', initial);
  try {
    const { accounts } = saveSocial(store, { expectedRevision: 0, accounts: [
      { platform: 'wechat', name: '公众号' },
      { platform: 'juejin', name: '掘金', url: 'https://juejin.cn/user/example' },
    ] });
    const upload = (platform, rows, bookType) => {
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet(rows), '报表');
      const data = write(book, { type: 'buffer', bookType });
      return importCreatorReport(store, platform, { accountId: accounts.find(a => a.platform === platform).id,
        expectedRevision: store.read().revision, period: 'range',
        fileName: bookType === 'biff8' ? 'report.xls' : 'report.xlsx', fileData: data.toString('base64') });
    };
    await upload('wechat', [
      ['', '', '', '', '', '', '', '', '', '', '数据来源概况(2026.10.10-2026.11.08)'],
      ['日期','渠道','阅读人数','','日期','分享人数','跳转阅读原文人数','微信收藏人数','发表篇数','','传播渠道','发表日期','内容标题','阅读人数','阅读人数占比'],
      ['2026-11-08','搜一搜',4,'','2026-11-08',2,0,1,1,'','全部','20251215','历史文章',7,0.5],
      ['2026-11-08','全部',5],
    ], 'biff8');
    const wechat = socialContext(store, { platform: 'wechat' }).snapshots;
    assert.equal(wechat.length, 1);
    assert.ok(wechat.every(row => row.kind === 'content'));
    const article = wechat.find(row => row.kind === 'content');
    assert.equal(article.publishedAt, '2025-12-15');
    assert.equal(article.periodStart, '2026-10-10');
    assert.deepEqual(article.metrics, { readUsers: 7 });
    await upload('juejin', [['日期', '文章展现数', '文章阅读数', '文章点赞数'], ['2026-11-08', 19, 2, 0]], 'xlsx');
    const juejin = socialContext(store, { platform: 'juejin' }).snapshots[0];
    assert.equal(juejin.kind, 'account');
    assert.equal(juejin.periodStart, '2026-11-08');
    assert.deepEqual(juejin.metrics, { impressions: 19, views: 2, likes: 0 });
    await assert.rejects(upload('juejin', [['笔记标题', '首次发布时间', '曝光']], 'xlsx'), /小红书/);
  } finally { store.close(); }
});
