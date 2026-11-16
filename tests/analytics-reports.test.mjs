import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../server/validate.mjs';
import { normalizeData, openStore } from '../server/store.mjs';
import { runTool, toolDefinitions } from '../server/mcp-tools.mjs';
import { inferMarketingTags } from '../src/types.ts';
import { syncProductReleaseDates } from '../server/release-sync.mjs';

test('分析报告 (Analytics Reports) 数据结构与校验', () => {
  const baseData = {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '产品增长管理工具',
        appId: '1234567890',
        price: '免费',
        platform: 'ios',
        website: 'https://growmory.com',
        color: '#0284c7',
      },
    ],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
  };

  // 1. 空报告列表校验通过
  assert.equal(validateData(baseData), true);

  // 2. 有效的报告数据校验通过
  const validReport = {
    id: 'rep-1',
    productId: 'p1',
    title: '10月产品转化漏斗分析报告',
    summary: '展示量增长稳定，首次下载转化率达 4.2%。',
    content: '# 10月分析报告\n\n## 转化漏斗\n- 展示量: 1000\n- 下载量: 42',
    period: '近30天',
    tags: ['转化率', '月报'],
    metricsSummary: { impressions: 1000, downloads: 42, conversionRate: '4.2%' },
    createdAt: new Date().toISOString(),
  };

  const dataWithReport = {
    ...baseData,
    analyticsReports: [validReport],
  };
  assert.equal(validateData(dataWithReport), true);

  // 3. 全产品综合报告 (productId 为空字符串) 校验通过
  const globalReport = {
    ...validReport,
    id: 'rep-global',
    productId: '',
    title: '全矩阵产品综合周报',
  };
  assert.equal(validateData({ ...baseData, analyticsReports: [globalReport] }), true);

  // 4. normalizeData 确保包含 analyticsReports
  const normalized = normalizeData({ products: [] });
  assert.ok(Array.isArray(normalized.analyticsReports));

  // 5. 缺少必填字段（如缺少 title 或 content）应拒绝
  const invalidReport = { ...validReport, title: '   ' };
  assert.equal(validateData({ ...baseData, analyticsReports: [invalidReport] }), false);

  // 6. 已读、未读状态与时间戳校验
  const reportWithRead = { ...validReport, isRead: true, readAt: new Date().toISOString() };
  assert.equal(validateData({ ...baseData, analyticsReports: [reportWithRead] }), true);
  const invalidReadReport = { ...validReport, isRead: 'not-a-bool' };
  assert.equal(validateData({ ...baseData, analyticsReports: [invalidReadReport] }), false);
});

test('MCP get_analytics_context 与 save_analytics_report 读写与更新', async () => {
  const store = openStore(':memory:', {
    products: [
      {
        id: 'prod-test',
        name: 'Test App',
        summary: '测试应用',
        appId: '987654321',
        price: '免费',
        platform: 'ios',
        website: 'https://example.com',
        color: '#0284c7',
      },
    ],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [
      {
        id: 'rel-1',
        productId: 'prod-test',
        version: '1.2.0',
        changes: '新增黑暗模式，修复已知问题',
        languages: ['zh-Hans'],
        channels: ['appstore'],
        status: 'published',
        createdAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
        notes: [],
        proposals: [],
      },
    ],
    contents: [
      {
        id: 'cnt-1',
        productId: 'prod-test',
        title: '小红书种草文案',
        body: '今天给大家推荐一款治愈系小工具',
        channel: 'xiaohongshu',
        status: 'published',
        publishedAt: new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 10),
        date: new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 10),
        url: 'https://www.xiaohongshu.com/discovery/item/123456',
      },
      {
        id: 'cnt-draft',
        productId: 'prod-test',
        title: '未发布草稿',
        body: '还在构思中',
        channel: 'x',
        status: 'draft',
        date: new Date(Date.now() - 2 * 86400 * 1000).toISOString().slice(0, 10),
        url: '',
      },
    ],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
  });

  const access = { enabled: true, allowWrites: true };

  // 1. 调用 get_analytics_context
  const ctx = runTool(store, 'get_analytics_context', { productId: 'prod-test', days: 30 }, access);
  assert.ok(ctx.productsData);
  assert.equal(ctx.productsData.length, 1);
  assert.equal(ctx.productsData[0].product.name, 'Test App');
  assert.equal(ctx.productsData[0].recentReleases.length, 1);
  assert.equal(ctx.productsData[0].recentReleases[0].version, '1.2.0');
  assert.ok(ctx.guide.structure.length > 0);

  // 校验 milestones 关键节点：包含已发布版本与已发布营销内容，排除草稿
  const milestones = ctx.productsData[0].milestones;
  assert.ok(Array.isArray(milestones));
  assert.ok(milestones.some(m => m.type === 'release' && m.version === '1.2.0'));
  assert.ok(milestones.some(m => m.type === 'content' && m.title.includes('小红书种草文案')));
  assert.equal(milestones.some(m => m.title.includes('未发布草稿')), false);

  // 2. 调用 save_analytics_report 保存报告
  const saveRes = runTool(store, 'save_analytics_report', {
    productId: 'prod-test',
    title: 'Test App 转化与留存深度报告',
    summary: '核心转化率健康，新版本上线后指标提升明显。',
    content: '# 诊断报告正文\n\n- 展示量: 5000\n- 下载量: 250\n\n## 结论\n继续保持。',
    period: '近30天',
    tags: ['增长复盘', '版本监控'],
    metricsSummary: { impressions: 5000, downloads: 250, conversionRate: '5.0%' },
  }, access);

  assert.equal(saveRes.success, true);
  assert.equal(saveRes.report.title, 'Test App 转化与留存深度报告');
  assert.equal(saveRes.report.tags.length, 2);
  assert.equal(saveRes.report.isRead, false, '新建报告默认为未读状态 (isRead: false)');
  const repId = saveRes.report.id;

  // 3. 从 store 校验是否已持久化
  const current = store.read().data;
  assert.equal(current.analyticsReports.length, 1);
  assert.equal(current.analyticsReports[0].id, repId);

  // 4. 更新已有报告（同时标记为已读）
  const updateRes = runTool(store, 'save_analytics_report', {
    id: repId,
    productId: 'prod-test',
    title: 'Test App 转化与留存深度报告 (修订版)',
    summary: '更新修订摘要。',
    content: '# 诊断报告正文 (修订版)',
    isRead: true,
    readAt: new Date().toISOString(),
    expectedRevision: saveRes.revision,
  }, access);

  assert.equal(updateRes.report.id, repId);
  assert.equal(updateRes.report.title, 'Test App 转化与留存深度报告 (修订版)');
  assert.equal(updateRes.report.isRead, true, '更新后状态成功标记为已读');
  assert.equal(store.read().data.analyticsReports.length, 1);
  assert.equal(store.read().data.analyticsReports[0].title, 'Test App 转化与留存深度报告 (修订版)');
  assert.equal(store.read().data.analyticsReports[0].isRead, true);

  // 5. 只读模式拒绝写入
  assert.throws(() => {
    runTool(store, 'save_analytics_report', {
      title: '尝试写入',
      summary: '摘要',
      content: '正文',
    }, { enabled: true, allowWrites: false });
  }, /只读/);
});

test('营销内容自动标签智能推断 (inferMarketingTags)', () => {
  // 1. 包含限免关键字 -> 自动标记 free
  const t1 = inferMarketingTags({
    title: '周末福利！全功能限免 3 天，免费下载领取',
    body: '感谢大家支持，原价 30 元现已开启限免福利，0元带走。',
  });
  assert.ok(t1.includes('free'));
  assert.ok(!t1.includes('discount'));

  // 2. 优惠折扣类 -> 自动标记 discount
  const t2 = inferMarketingTags({
    title: '新版本发布限时 5 折！特惠折扣促销中',
    body: '输入优惠码立享半价降价特惠。',
  });
  assert.ok(t2.includes('discount'));
  assert.ok(!t2.includes('free'));

  // 3. 同时涉及限免与优惠活动 -> 同时标记 free 与 discount
  const t3 = inferMarketingTags({
    title: '年终大促：基础版限时免费，终身版5折优惠',
    body: '双重福利放送，限免与折扣同步进行。',
  });
  assert.ok(t3.includes('free'));
  assert.ok(t3.includes('discount'));

  // 4. 普通教程/版本宣发（无优惠活动）-> 保持空标签，不污染数据时间轴
  const t4 = inferMarketingTags({
    title: 'v2.1.0 重磅更新，暗黑模式正式上线！手把手保姆级教程',
    body: '本次版本带来了大家期待已久的黑暗主题和性能优化。',
  });
  assert.deepEqual(t4, []);

  // 5. 已指定标签时保持尊重，不强制覆写
  const t5 = inferMarketingTags({
    title: '随便一篇笔记',
    body: '内容正文',
    tags: ['free'],
  });
  assert.deepEqual(t5, ['free']);
});

test('版本发布上线时间 publishedAt 校验与打点 ASO 合并', () => {
  const baseData = {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '产品增长管理工具',
        appId: '1234567890',
        price: '免费',
        platform: 'ios',
        website: 'https://growmory.com',
        color: '#0284c7',
      },
    ],
    releases: [
      {
        id: 'r1',
        productId: 'p1',
        version: '2.0.0',
        changes: '大版本更新',
        status: 'published',
        publishedAt: '2026-11-05',
        createdAt: '2026-10-01T00:00:00.000Z',
        tags: ['keywords', 'major_feature'],
        languages: ['中文'],
        channels: ['App Store'],
        notes: [],
        proposals: [],
      },
    ],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
  };

  // 1. 合法 publishedAt 校验通过
  assert.equal(validateData(baseData), true);

  // 2. 非法 publishedAt 校验拦截
  const invalidData = {
    ...baseData,
    releases: [{ ...baseData.releases[0], publishedAt: 'invalid-date' }],
  };
  assert.equal(validateData(invalidData), false);

  // 3. MCP 分析上下文取 publishedAt 并根据 ASO 模块提交历史自动识别 ASO 优化，且正确读取销售额与收益
  const store = openStore(':memory:', baseData);
  store.productInsights('p1', {
    appId: '1234567890',
    trends: {
      status: 'success',
      rows: [
        { date: '2026-11-05', source: 'App Store search', territory: 'CHN', kind: 'downloads', firstDownloads: 88, redownloads: 5, impressions: 500, pageViews: 120 },
      ],
      revenue: {
        status: 'success',
        currency: 'USD',
        rows: [
          { date: '2026-11-05', source: 'App Store search', territory: 'USA', salesUsd: 199.98, proceedsUsd: 139.98 },
          { date: '2026-11-05', source: 'App Store browse', territory: 'CHN', salesUsd: 59.99, proceedsUsd: 41.99 },
        ],
        coverage: ['2026-11-05'],
      },
    },
  });

  // 未向 Apple 提交 ASO 修改时，hasAso 应为 false（不依赖 tags 中的历史勾选）
  const resBeforeAso = runTool(store, 'get_analytics_context', { productId: 'p1', days: 7, end: '2026-11-05' }, { enabled: true });
  const rMilestoneBefore = resBeforeAso.productsData[0].milestones.find(m => m.type === 'release');
  assert.equal(rMilestoneBefore.hasAso, false, '未提交 ASO 修改时不应挂载 ASO 标签');

  // ASO 模块成功向 Apple 提交修改后，自动识别为包含 ASO 优化
  store.asoEvent('p1', {
    appId: '1234567890',
    version: '2.0.0',
    outcome: 'success',
    at: '2026-11-04T10:00:00.000Z',
  });

  const res = runTool(store, 'get_analytics_context', { productId: 'p1', days: 7, end: '2026-11-05' }, { enabled: true });
  assert.equal(res.productsData.length, 1);
  const pData = res.productsData[0];
  const rMilestone = pData.milestones.find(m => m.type === 'release');
  assert.ok(rMilestone, '应包含版本发布里程碑');
  assert.equal(rMilestone.date, '2026-11-05', '日期应优先使用 publishedAt 而不是草稿立项日 2026-10-01');
  assert.equal(rMilestone.hasAso, true, 'ASO 模块有成功提交时自动识别为包含 ASO 优化');
  assert.ok(rMilestone.title.includes('含ASO优化'));

  // 校验收入读取与正确聚合（避免旧版取 r.amount 导致 0 USD）
  assert.ok(pData.revenueSummary, '应返回收入汇总');
  assert.equal(pData.revenueSummary.recordCount, 2);
  assert.equal(pData.revenueSummary.sales, 259.97, '总销售额应准确聚合 salesUsd');
  assert.equal(pData.revenueSummary.proceeds, 181.97, '开发者分成收益应准确聚合 proceedsUsd');
  assert.equal(pData.revenueSummary.topTerritoriesBySales[0].territory, 'USA');
});

test('syncProductReleaseDates 每日自动同步线上版本发布时间与状态', async () => {
  const baseData = {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '应用',
        appId: '987654321',
        price: '免费',
        platform: 'ios',
        website: 'https://growmory.com',
        color: '#0284c7',
      },
    ],
    releases: [
      {
        id: 'r1',
        productId: 'p1',
        version: '3.1.0',
        changes: '准备中内容',
        status: 'ready',
        publishedAt: '',
        createdAt: '2026-10-01T00:00:00.000Z',
        tags: ['title_subtitle'],
        languages: ['中文'],
        channels: ['App Store'],
        notes: [],
        proposals: [],
      },
    ],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
  };

  const store = openStore(':memory:', baseData);

  // 模拟 App Store 公开接口返回该 App 线上最新正式版为 3.1.0，发布日期为 2026-11-06
  const changed = await syncProductReleaseDates(store, {
    productId: 'p1',
    fetcher: async (url) => {
      return {
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackId: 987654321,
              trackName: 'Growmory',
              version: '3.1.0',
              currentVersionReleaseDate: '2026-11-06T08:30:00Z',
              releaseNotes: '新版本优化',
            },
          ],
        }),
      };
    },
  });

  const updatedReleases = store.read().data.releases;
  const rel = updatedReleases.find(r => r.id === 'r1');
  assert.ok(rel);
  // 验证状态自动升级为 published，且 publishedAt 自动对齐线上真实上线日
  assert.equal(rel.status, 'published');
  assert.equal(rel.publishedAt, '2026-11-06');

  // 本地无匹配版本时，自动补全一条 published 记录且不发生 info is not defined 异常
  const changedAutoCreate = await syncProductReleaseDates(store, {
    productId: 'p1',
    fetcher: async (url) => {
      return {
        ok: true,
        json: async () => ({
          resultCount: 1,
          results: [
            {
              trackId: 987654321,
              trackName: 'Growmory',
              version: '3.2.0',
              currentVersionReleaseDate: '2026-11-08T08:30:00Z',
              releaseNotes: '新版本发布',
            },
          ],
        }),
      };
    },
  });

  assert.equal(changedAutoCreate, true);
  const autoCreated = store.read().data.releases.find(r => r.version === '3.2.0');
  assert.ok(autoCreated);
  assert.equal(autoCreated.status, 'published');
  assert.equal(autoCreated.publishedAt, '2026-11-08');
  assert.equal(autoCreated.changes, '新版本发布');
});

test('全部产品数据报告批处理：MCP 上下文指示生成 1 份大盘报告 + N 份各产品独立报告', () => {
  const store = openStore(':memory:', {
    products: [
      { id: 'p-alpha', name: 'Alpha Scanner', summary: '扫描工具', appId: '111', price: '免费', platform: 'ios', website: 'https://alpha.com', color: '#0284c7' },
      { id: 'p-beta', name: 'Beta Tracker', summary: '追踪工具', appId: '222', price: '免费', platform: 'ios', website: 'https://beta.com', color: '#10b981' },
    ],
    releases: [],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
  });

  const access = { enabled: true, allowWrites: true };

  // 1. 调用 get_analytics_context 不传 productId (全产品模式)
  const ctx = runTool(store, 'get_analytics_context', { days: 30 }, access);
  assert.equal(ctx.productId, null);
  assert.equal(ctx.productsData.length, 2);

  // 校验 guide 中的批处理指令
  assert.ok(ctx.guide.generationPlan);
  assert.equal(ctx.guide.generationPlan.mode, 'batch_all_products');
  assert.equal(ctx.guide.generationPlan.totalReportsToSave, 3); // 1 大盘 + 2 独立
  assert.equal(ctx.guide.generationPlan.tasks.length, 3);
  assert.equal(ctx.guide.generationPlan.tasks[0].type, 'portfolio_overview');
  assert.equal(ctx.guide.generationPlan.tasks[0].productId, '');
  assert.equal(ctx.guide.generationPlan.tasks[1].productId, 'p-alpha');
  assert.equal(ctx.guide.generationPlan.tasks[2].productId, 'p-beta');
  assert.ok(ctx.guide.nextAction.includes('1 + 2 = 3 份报告'));

  // 2. 模拟 Agent 依次保存 1 份大盘综合报告与 2 份独立产品报告
  // (1) 保存大盘报告
  const resGlobal = runTool(store, 'save_analytics_report', {
    productId: '',
    title: '全产品矩阵 近30天综合数据分析与增长大盘报告',
    summary: '大盘总览与跨产品横向对比分析。',
    content: '# 全产品大盘报告\n\n大盘正文...',
    period: '近 30 天',
    tags: ['大盘分析', '全产品'],
  }, access);
  assert.equal(resGlobal.success, true);
  assert.equal(resGlobal.report.productId, '');

  // (2) 保存 Alpha Scanner 专属报告
  const resAlpha = runTool(store, 'save_analytics_report', {
    productId: 'p-alpha',
    title: 'Alpha Scanner 近30天数据分析与增长诊断报告',
    summary: 'Alpha Scanner 独立表现与漏斗诊断。',
    content: '# Alpha Scanner 诊断报告\n\n- 展示次数: 1000\n- 查看次数: 200',
    period: '近 30 天',
    tags: ['数据诊断', 'Alpha'],
  }, access);
  assert.equal(resAlpha.success, true);
  assert.equal(resAlpha.report.productId, 'p-alpha');

  // (3) 保存 Beta Tracker 专属报告
  const resBeta = runTool(store, 'save_analytics_report', {
    productId: 'p-beta',
    title: 'Beta Tracker 近30天数据分析与增长诊断报告',
    summary: 'Beta Tracker 独立表现与商业化分析。',
    content: '# Beta Tracker 诊断报告\n\n- 展示次数: 3000\n- 查看次数: 800',
    period: '近 30 天',
    tags: ['数据诊断', 'Beta'],
  }, access);
  assert.equal(resBeta.success, true);
  assert.equal(resBeta.report.productId, 'p-beta');

  // 3. 校验知识库中准确存入 3 份报告
  const allReports = store.read().data.analyticsReports;
  assert.equal(allReports.length, 3);
  assert.ok(allReports.some(r => r.productId === '' && r.title.includes('全产品矩阵')));
  assert.ok(allReports.some(r => r.productId === 'p-alpha' && r.title.includes('Alpha Scanner')));
  assert.ok(allReports.some(r => r.productId === 'p-beta' && r.title.includes('Beta Tracker')));
});

test('时间轴里程碑准确区分 ASO 文案优化与 ASO 图片优化', async () => {
  const baseData = {
    products: [
      { id: 'p1', name: '产品1', appId: '1234567890' },
    ],
    releases: [
      {
        id: 'r1',
        productId: 'p1',
        version: '1.0.0',
        publishedAt: '2026-11-01',
        status: 'published',
        tags: [],
      },
      {
        id: 'r2',
        productId: 'p1',
        version: '2.0.0',
        publishedAt: '2026-11-03',
        status: 'published',
        tags: [],
      },
      {
        id: 'r3',
        productId: 'p1',
        version: '3.0.0',
        publishedAt: '2026-11-05',
        status: 'published',
        tags: [],
      },
    ],
    docs: [], docFolders: [], assets: [], assetFolders: [], contents: [], contentGroups: [], tasks: [], promotions: [], analyticsReports: [],
  };

  const store = openStore(':memory:', baseData);

  // r1: 仅 ASO 文案优化
  store.asoEvent('p1', {
    appId: '1234567890',
    version: '1.0.0',
    kind: 'copy',
    outcome: 'success',
    at: '2026-11-01T08:00:00Z',
  });

  // r2: 仅 ASO 图片优化
  store.asoEvent('p1', {
    appId: '1234567890',
    version: '2.0.0',
    kind: 'media',
    changes: [{ type: 'APP_SCREENSHOT', group: 'IPHONE_67' }],
    outcome: 'success',
    at: '2026-11-03T08:00:00Z',
  });

  // r3: 同时包含 ASO 文案优化 与 ASO 图片优化
  store.asoEvent('p1', {
    appId: '1234567890',
    version: '3.0.0',
    kind: 'copy',
    outcome: 'success',
    at: '2026-11-05T08:00:00Z',
  });
  store.asoEvent('p1', {
    appId: '1234567890',
    version: '3.0.0',
    kind: 'media',
    changes: [{ type: 'APP_SCREENSHOT', group: 'IPHONE_67' }],
    outcome: 'success',
    at: '2026-11-05T09:00:00Z',
  });

  const res = runTool(store, 'get_analytics_context', { productId: 'p1', days: 7, end: '2026-11-05' }, { enabled: true });
  const milestones = res.productsData[0].milestones;

  const m1 = milestones.find(m => m.version === '1.0.0');
  assert.equal(m1.hasAsoCopy, true);
  assert.equal(m1.hasAsoMedia, false);
  assert.ok(m1.title.includes('含ASO优化: 文案'));

  const m2 = milestones.find(m => m.version === '2.0.0');
  assert.equal(m2.hasAsoCopy, false);
  assert.equal(m2.hasAsoMedia, true);
  assert.ok(m2.title.includes('含ASO优化: 图片'));

  const m3 = milestones.find(m => m.version === '3.0.0');
  assert.equal(m3.hasAsoCopy, true);
  assert.equal(m3.hasAsoMedia, true);
  assert.ok(m3.title.includes('含ASO优化: 文案+图片'));
});
