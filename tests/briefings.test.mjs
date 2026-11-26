import test from 'node:test';
import assert from 'node:assert/strict';
import { validateData } from '../server/validate.mjs';
import { normalizeData, openStore } from '../server/store.mjs';
import { runTool, toolDefinitions, normalizeUrl } from '../server/mcp-tools.mjs';

test('URL 规范化 (normalizeUrl) 校验', () => {
  // 1. 去除 utm_*、spm、from 等跟踪参数
  const raw1 = 'https://Example.com/post/123/?utm_source=twitter&utm_medium=social&utm_campaign=launch#comments';
  assert.equal(normalizeUrl(raw1), 'https://example.com/post/123');

  // 2. 去除尾随斜杠与默认端口
  const raw2 = 'https://news.ycombinator.com:443/item?id=99999/';
  assert.equal(normalizeUrl(raw2), 'https://news.ycombinator.com/item?id=99999/');

  const raw3 = 'https://reddit.com/r/indiehackers/comments/xyz/';
  assert.equal(normalizeUrl(raw3), 'https://reddit.com/r/indiehackers/comments/xyz');

  // 3. 空与无效链接保持安全
  assert.equal(normalizeUrl(''), '');
  assert.equal(normalizeUrl(null), '');
});

test('资讯数据结构与校验 (validateData & normalizeData)', () => {
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
    briefings: [],
    briefingItems: [],
  };

  // 1. 空简报与条目数据校验通过
  assert.equal(validateData(baseData), true);

  // 2. 有效的简报与条目校验通过
  const validBriefing = {
    id: 'b-1',
    date: '2026-11-20',
    timezone: 'Asia/Shanghai',
    runAt: new Date().toISOString(),
    budget: '15分钟',
    status: 'completed',
    frameworks: [
      {
        productId: 'p1',
        focusQuestions: ['数据导入机制有何变化？'],
        competitors: ['CompetitorApp'],
        platforms: ['Reddit', 'X'],
        keywords: ['ASO', 'local-first'],
      },
    ],
    platformSummaries: [
      { platform: 'Reddit', query: 'ASO local-first', openedCount: 3 },
    ],
    itemIds: ['item-1'],
  };

  const validItem = {
    id: 'item-1',
    briefingId: 'b-1',
    productId: 'p1',
    category: 'platform_change',
    title: 'App Store 审核政策调整更新',
    summary: '苹果更新了针对独立开发者的审核说明，对外链与应用内描述做出明确规范。',
    relevance: '直接影响我们新版本上架描述的撰写方式。',
    platform: 'App Store',
    url: 'https://developer.apple.com/news/12345',
    publishedAt: '2026-11-19',
    checkedAt: '2026-11-20',
    verification: 'full',
    status: 'new',
  };

  const dataWithBriefing = {
    ...baseData,
    briefings: [validBriefing],
    briefingItems: [validItem],
  };
  assert.equal(validateData(dataWithBriefing), true);

  // 3. 条目缺少 URL 或 URL 为空被拒绝
  assert.equal(validateData({
    ...dataWithBriefing,
    briefingItems: [{ ...validItem, url: '' }],
  }), false);

  // 4. 条目引用不存在的产品 ID 被拒绝
  assert.equal(validateData({
    ...dataWithBriefing,
    briefingItems: [{ ...validItem, productId: 'p-non-existent' }],
  }), false);

  // 5. 非法核实程度或非法类别被拒绝
  assert.equal(validateData({
    ...dataWithBriefing,
    briefingItems: [{ ...validItem, verification: 'unknown' }],
  }), false);
  assert.equal(validateData({
    ...dataWithBriefing,
    briefingItems: [{ ...validItem, category: 'rumor' }],
  }), false);

  // 6. normalizeData 确保包含 briefings 和 briefingItems
  const normalized = normalizeData({ products: [] });
  assert.ok(Array.isArray(normalized.briefings));
  assert.ok(Array.isArray(normalized.briefingItems));
});

test('MCP get_briefing_context 读取已确认事实、缺口检测与 14 天历史', () => {
  const store = openStore(':memory:', {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '面向独立开发者的产品增长工作台',
        appId: '1234567890',
        price: '免费',
        platform: 'macOS, iOS',
        website: 'https://growmory.com',
        color: '#0284c7',
      },
      {
        id: 'p2',
        name: 'ThinApp',
        summary: '', // 故意无定位，测试事实缺口检测
        appId: '9876543210',
        price: '免费',
        platform: 'iOS',
        website: 'https://thin.app',
        color: '#10b981',
      },
    ],
    docs: [
      {
        id: 'doc-1',
        productId: 'p1',
        title: '产品介绍与目标用户使用场景',
        body: 'Growmory 专门为独立开发者设计，在本地管理应用数据与 ASO 推广...',
        status: 'confirmed',
        history: [],
        updatedAt: '2026-11-15T00:00:00Z',
      },
      {
        id: 'doc-2',
        productId: 'p1',
        title: '草稿：未确认规划',
        body: '未来可能支持 Android...',
        status: 'pending', // 待确认，不应作为依据
        history: [],
        updatedAt: '2026-11-15T00:00:00Z',
      },
    ],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [
      {
        id: 'rel-1',
        productId: 'p1',
        version: '1.2.0',
        changes: '新增个人主页数据同步与多平台 ASO',
        publishedAt: '2026-11-10',
        languages: ['zh-Hans'],
        channels: ['AppStore'],
        status: 'published',
        createdAt: '2026-11-10T00:00:00Z',
        notes: [],
        proposals: [],
      },
    ],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
    briefings: [],
    briefingItems: [
      {
        id: 'old-item-1',
        briefingId: 'b-old',
        productId: 'p1',
        category: 'competitor_move',
        title: '竞品大幅降价',
        summary: '竞品下调年度订阅价格',
        relevance: '参考其定价策略',
        platform: 'X',
        url: 'https://x.com/competitor/status/111',
        publishedAt: '2026-11-18',
        checkedAt: '2026-11-18',
        verification: 'full',
        status: 'dismissed', // 已被用户忽略
      },
      {
        id: 'old-item-2',
        briefingId: 'b-old',
        productId: 'p1',
        category: 'user_voice',
        title: '用户询问数据导出',
        summary: '用户询问如何迁移本地 SQLite',
        relevance: '可作为文档选题',
        platform: 'Reddit',
        url: 'https://reddit.com/r/indiehackers/123',
        publishedAt: '2026-11-18',
        checkedAt: '2026-11-18',
        verification: 'full',
        status: 'saved',
        savedReason: '很好的营销选题切入点',
      },
    ],
  });

  const access = { enabled: true, allowWrites: true };
  const res = runTool(store, 'get_briefing_context', { date: '2026-11-20', timezone: 'Asia/Shanghai' }, access);

  assert.equal(res.date, '2026-11-20');
  assert.equal(res.timezone, 'Asia/Shanghai');
  assert.equal(res.products.length, 2);

  // 1. p1 具有确认文档与定位，缺口较小
  const p1Facts = res.products.find(p => p.id === 'p1');
  assert.ok(p1Facts);
  assert.equal(p1Facts.confirmedDocs.length, 1);
  assert.equal(p1Facts.confirmedDocs[0].title, '产品介绍与目标用户使用场景');

  // 2. p2 缺少定位与文档，明确标记缺口
  const p2Facts = res.products.find(p => p.id === 'p2');
  assert.ok(p2Facts);
  assert.equal(p2Facts.hasSufficientFacts, false);
  assert.ok(p2Facts.factGaps.includes('缺少一句话定位'));
  assert.ok(p2Facts.factGaps.includes('缺少目标用户与使用场景'));

  // 3. 14 天内条目包含留下的原因和已忽略链接，且返回详细内容与摘要
  assert.equal(res.recentItems.length, 2);
  assert.ok(res.dismissedUrls.includes('https://x.com/competitor/status/111'));
  const savedItem = res.recentItems.find(i => i.status === 'saved');
  assert.equal(savedItem?.savedReason, '很好的营销选题切入点');
  assert.equal(savedItem?.summary, '用户询问如何迁移本地 SQLite');
  assert.equal(savedItem?.relevance, '可作为文档选题');

  // 4. 返回精选已留下条目 savedItems（包含完整内容 summary/relevance 与 savedReason）
  assert.ok(Array.isArray(res.savedItems));
  assert.equal(res.savedItems.length, 1);
  assert.equal(res.savedItems[0].title, '用户询问数据导出');
  assert.equal(res.savedItems[0].summary, '用户询问如何迁移本地 SQLite');
  assert.equal(res.savedItems[0].relevance, '可作为文档选题');
  assert.equal(res.savedItems[0].savedReason, '很好的营销选题切入点');
});

test('MCP save_briefing 写入、去重、同一天重跑更新、保留用户处置与已忽略过滤', () => {
  const store = openStore(':memory:', {
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
    briefings: [],
    briefingItems: [
      {
        id: 'dismissed-old',
        briefingId: 'b-past',
        productId: 'p1',
        category: 'platform_change',
        title: '已忽略的规则',
        summary: '不感兴趣',
        relevance: '不相关',
        platform: 'Reddit',
        url: 'https://reddit.com/r/ignored/item1',
        publishedAt: '2026-11-15',
        checkedAt: '2026-11-15',
        verification: 'full',
        status: 'dismissed', // 14 天内已被忽略
      },
    ],
  });

  const access = { enabled: true, allowWrites: true };
  const currentRevision = store.read().revision;

  // 1. 首次保存当天简报（包含 2 条新条目 + 1 条已被忽略的链接 + 1 条重复链接）
  const saveInput = {
    expectedRevision: currentRevision,
    date: '2026-11-20',
    timezone: 'Asia/Shanghai',
    budget: '15分钟',
    status: 'completed',
    frameworks: [
      {
        productId: 'p1',
        focusQuestions: ['数据存储与隐私规则'],
        competitors: ['AppA'],
        platforms: ['Reddit', 'X'],
        keywords: ['SQLite', 'privacy'],
      },
    ],
    platformSummaries: [
      { platform: 'Reddit', query: 'SQLite privacy', openedCount: 2 },
    ],
    items: [
      {
        productId: 'p1',
        category: 'platform_change',
        title: '欧洲隐私新规出台',
        summary: '本地优先工具获得更多关注。',
        relevance: '利好 Growmory 本地优先架构。',
        platform: 'Reddit',
        url: 'https://reddit.com/r/privacy/eurules?utm_source=rss',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      // 重复的链接（参数不同但规范化后相同）
      {
        productId: 'p1',
        category: 'platform_change',
        title: '欧洲隐私新规（重复）',
        summary: '重复内容',
        relevance: '重复',
        platform: 'Reddit',
        url: 'https://reddit.com/r/privacy/eurules/?utm_source=twitter',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      // 14天内已被忽略的链接，不应被重新引入
      {
        productId: 'p1',
        category: 'platform_change',
        title: '试图复活的已忽略链接',
        summary: '此链接之前已被用户忽略',
        relevance: '无',
        platform: 'Reddit',
        url: 'https://reddit.com/r/ignored/item1',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      {
        productId: 'p1',
        category: 'user_voice',
        title: '用户寻找 macOS 记账工具',
        summary: '希望完全不联网也可以用。',
        relevance: '我们的卖点匹配。',
        platform: 'X',
        url: 'https://x.com/user/status/222',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
    ],
  };

  const saveRes = runTool(store, 'save_briefing', saveInput, access);
  assert.equal(saveRes.success, true);
  // 4 条输入中：1 条重复去重、1 条已忽略被过滤，实际入库 2 条
  assert.equal(saveRes.itemCount, 2);

  const afterFirstSave = store.read();
  assert.equal(afterFirstSave.data.briefings.length, 1);
  const firstBriefing = afterFirstSave.data.briefings[0];
  assert.equal(firstBriefing.date, '2026-11-20');
  assert.equal(firstBriefing.itemIds.length, 2);

  // 2. 模拟用户在前端对第一条标记为「留下」，并写下原因
  const itemToSave = afterFirstSave.data.briefingItems.find(i => i.url.includes('eurules'));
  assert.ok(itemToSave);
  itemToSave.status = 'saved';
  itemToSave.savedReason = '准备写一篇隐私保护的深度文章';
  store.write(afterFirstSave.data, afterFirstSave.revision);

  // 3. 同一天 Agent 重新运行（重跑简报）
  const rerunRevision = store.read().revision;
  const rerunInput = {
    ...saveInput,
    expectedRevision: rerunRevision,
    budget: '15分钟',
    platformSummaries: [
      { platform: 'Reddit', query: 'SQLite privacy rerun', openedCount: 5 },
    ],
    items: [
      {
        productId: 'p1',
        category: 'platform_change',
        title: '欧洲隐私新规出台（重跑更新标题）',
        summary: '本地优先架构更新摘要。',
        relevance: '更新的相关性说明。',
        platform: 'Reddit',
        url: 'https://reddit.com/r/privacy/eurules',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      {
        productId: 'p1',
        category: 'followup_lead',
        title: '新的跟进线索',
        summary: '开发者社区正在讨论开源方案',
        relevance: '可以参与讨论',
        platform: 'Reddit',
        url: 'https://reddit.com/r/opensource/topic3',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
    ],
  };

  const rerunRes = runTool(store, 'save_briefing', rerunInput, access);
  assert.equal(rerunRes.success, true);

  const afterRerun = store.read();
  // 同一天同一份简报更新，不产生第二份简报！
  assert.equal(afterRerun.data.briefings.length, 1);
  assert.equal(afterRerun.data.briefings[0].platformSummaries[0].openedCount, 5);

  // 关键校验：保留了用户对 eurules 的「留下」状态和留下原因！
  const preservedItem = afterRerun.data.briefingItems.find(i => i.url.includes('eurules'));
  assert.ok(preservedItem);
  assert.equal(preservedItem.status, 'saved');
  assert.equal(preservedItem.savedReason, '准备写一篇隐私保护的深度文章');
  assert.equal(preservedItem.title, '欧洲隐私新规出台（重跑更新标题）');

  // 4. 当天无合格结果时，支持 empty 状态与 0 条目
  const emptyRevision = store.read().revision;
  const emptyRes = runTool(store, 'save_briefing', {
    expectedRevision: emptyRevision,
    date: '2026-11-21',
    status: 'empty',
    note: '今天没有合格资讯，Reddit 与 X 均未检索到对近期决定有实质影响的变化。',
    frameworks: [],
    platformSummaries: [
      { platform: 'Reddit', query: 'privacy', openedCount: 0, restrictions: '未找到近期新帖' },
    ],
    items: [],
  }, access);
  assert.equal(emptyRes.success, true);
  assert.equal(emptyRes.itemCount, 0);
  assert.equal(emptyRes.status, 'empty');

  // 5. 不设固定最多 8 条限制，可以正常保存 10 条条目
  const resMoreThan8 = runTool(store, 'save_briefing', {
    expectedRevision: store.read().revision,
    date: '2026-11-22',
    status: 'completed',
    frameworks: [],
    platformSummaries: [],
    items: Array.from({ length: 10 }, (_, i) => ({
      productId: 'p1',
      category: 'platform_change',
      title: `Item ${i}`,
      summary: 'summary',
      relevance: 'relevance',
      platform: 'Reddit',
      url: `https://example.com/item/${i}`,
      publishedAt: '2026-11-22',
      checkedAt: '2026-11-22',
      verification: 'full',
    })),
  }, access);
  assert.equal(resMoreThan8.success, true);
  assert.equal(resMoreThan8.itemCount, 10);

  // 6. 错误的 expectedRevision 被拒绝
  assert.throws(() => {
    runTool(store, 'save_briefing', {
      expectedRevision: 99999,
      date: '2026-11-23',
      status: 'completed',
      frameworks: [],
      platformSummaries: [],
      items: [],
    }, access);
  }, /工作区已在其他窗口更新/);
});

test('留下的条目转为待办与营销选题（只带标题、链接和相关性说明，不自动写正文）', () => {
  const store = openStore(':memory:', {
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
    briefings: [],
    briefingItems: [
      {
        id: 'item-saved-1',
        briefingId: 'b-1',
        productId: 'p1',
        category: 'followup_lead',
        title: '独立开发者分享数据迁移技巧',
        summary: '许多用户在寻找轻量化离线工具。',
        relevance: '可以撰写一篇如何利用 SQLite 进行产品管理的深度教程。',
        platform: 'Reddit',
        url: 'https://reddit.com/r/indiehackers/migration-tips',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
        status: 'saved',
        savedReason: '很适合作为内容切入点',
      },
    ],
  });

  const snapshot = store.read();
  const savedItem = snapshot.data.briefingItems[0];

  // 1. 转为待办 (Task)
  const newTask = {
    id: 'task-lead-1',
    productId: savedItem.productId,
    title: `[资讯线索] ${savedItem.title}`,
    done: false,
    date: '2026-11-20',
    note: `相关性说明：${savedItem.relevance}\n原文链接：${savedItem.url}`,
  };
  snapshot.data.tasks.push(newTask);
  const writeTaskResult = store.write(snapshot.data, snapshot.revision);
  assert.ok(writeTaskResult);
  assert.equal(writeTaskResult.data.tasks.length, 1);
  assert.equal(writeTaskResult.data.tasks[0].title, '[资讯线索] 独立开发者分享数据迁移技巧');
  assert.ok(writeTaskResult.data.tasks[0].note.includes('https://reddit.com/r/indiehackers/migration-tips'));

  // 2. 转为营销选题 (Content Draft) - 只带标题、链接和相关性说明，不自动写正文
  const newContent = {
    id: 'content-lead-1',
    productId: savedItem.productId,
    productIds: [savedItem.productId],
    title: savedItem.title,
    body: '', // 不自动写正文
    explanation: savedItem.relevance,
    channel: savedItem.platform,
    url: savedItem.url,
    status: 'draft',
    date: '2026-11-20',
    tags: [],
  };
  writeTaskResult.data.contents.push(newContent);
  const writeContentResult = store.write(writeTaskResult.data, writeTaskResult.revision);
  assert.ok(writeContentResult);
  assert.equal(writeContentResult.data.contents.length, 1);
  const createdContent = writeContentResult.data.contents[0];
  assert.equal(createdContent.title, '独立开发者分享数据迁移技巧');
  assert.equal(createdContent.body, '');
  assert.equal(createdContent.explanation, '可以撰写一篇如何利用 SQLite 进行产品管理的深度教程。');
  assert.equal(createdContent.url, 'https://reddit.com/r/indiehackers/migration-tips');
  assert.equal(createdContent.channel, 'Reddit');
  assert.equal(createdContent.status, 'draft');
});

test('支持泛生态资讯 (Product Hunt / X / Reddit) 与新增行业/增长分类', () => {
  const store = openStore(':memory:', {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '面向独立开发者的产品增长工作台',
        appId: '1234567890',
        price: '免费',
        platform: 'macOS, iOS',
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
    briefings: [],
    briefingItems: [],
  });

  const access = { enabled: true, allowWrites: true };
  const ctx = runTool(store, 'get_briefing_context', { date: '2026-11-20', timezone: 'Asia/Shanghai' }, access);

  // 回填包含 Product Hunt、X、Reddit 平台的泛生态条目 (productId: "general")
  const saveRes = runTool(store, 'save_briefing', {
    expectedRevision: ctx.revision,
    date: '2026-11-20',
    timezone: 'Asia/Shanghai',
    budget: '15分钟',
    status: 'completed',
    frameworks: [
      {
        productId: 'general',
        focusQuestions: ['本周 Product Hunt 热门独立开发工具有何打法？', 'AI 模型与工作流更新动态'],
        competitors: ['TopHuntTool'],
        platforms: ['Product Hunt', 'X', 'Reddit'],
        keywords: ['launch playbook', 'indie hacker', 'AI tool'],
      },
    ],
    platformSummaries: [
      { platform: 'Product Hunt', query: 'daily top launches', openedCount: 5 },
      { platform: 'X', query: 'indie hackers launch', openedCount: 4 },
      { platform: 'Reddit', query: 'r/SideProject top', openedCount: 3 },
    ],
    items: [
      {
        productId: 'general',
        category: 'growth_inspiration',
        title: 'Product Hunt 今日榜首：极简 macOS 工具的 Launch 策略拆解',
        summary: '开发者在 Product Hunt 分享了首日获取 800+ Upvotes 并登上榜首的具体准备清单与社媒预热节奏。',
        relevance: '对后续我们发布新特性或新产品时的 Launch 传播节奏很有参考价值。',
        platform: 'Product Hunt',
        url: 'https://www.producthunt.com/posts/mac-growth-kit',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      {
        productId: 'general',
        category: 'industry_trend',
        title: 'OpenAI 与 Claude 开发者 API 更新与成本变动分析',
        summary: '社区开发者对比了最新 API 的响应速度与 Token 成本，提供了更轻量的本地集成方案。',
        relevance: '有助于评估后续我们集成 AI 辅助功能的接口成本与响应表现。',
        platform: 'X',
        url: 'https://x.com/tech_insider/status/987654321',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
      {
        productId: 'p1',
        category: 'user_voice',
        title: 'Reddit 讨论：独立开发者如何统一管理多平台文案与版本',
        summary: 'r/SideProject 帖子中多位创作者抱怨在 App Store 与各大自媒体维护版本描述非常耗时。',
        relevance: '正好击中 Growmory 版本发布与营销内容的核心场景，可直接作为获客讨论跟进。',
        platform: 'Reddit',
        url: 'https://reddit.com/r/SideProject/comments/multi_platform_copy',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
    ],
  }, access);

  assert.equal(saveRes.success, true);
  assert.equal(saveRes.itemCount, 3);

  const snapshot = store.read();
  assert.equal(validateData(snapshot.data), true);
  assert.equal(snapshot.data.briefings.length, 1);
  assert.equal(snapshot.data.briefingItems.length, 3);

  const phItem = snapshot.data.briefingItems.find(i => i.platform === 'Product Hunt');
  assert.ok(phItem);
  assert.equal(phItem.category, 'growth_inspiration');
  assert.equal(phItem.productId, 'general');

  const xItem = snapshot.data.briefingItems.find(i => i.platform === 'X');
  assert.ok(xItem);
  assert.equal(xItem.category, 'industry_trend');
  assert.equal(xItem.productId, 'general');
});

test('用户已读原文标记 (isRead / readAt) 保存、校验与重跑保留', () => {
  const store = openStore(':memory:', {
    products: [
      {
        id: 'p1',
        name: 'Growmory',
        summary: '面向独立开发者的产品增长工作台',
        appId: '1234567890',
        price: '免费',
        platform: 'macOS, iOS',
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
    briefings: [],
    briefingItems: [],
  });

  const access = { enabled: true, allowWrites: true };
  const ctx = runTool(store, 'get_briefing_context', { date: '2026-11-20', timezone: 'Asia/Shanghai' }, access);

  // 1. 初次回填：条目默认未读
  runTool(store, 'save_briefing', {
    expectedRevision: ctx.revision,
    date: '2026-11-20',
    timezone: 'Asia/Shanghai',
    budget: '15分钟',
    status: 'completed',
    frameworks: [],
    platformSummaries: [],
    items: [
      {
        productId: 'p1',
        category: 'platform_change',
        title: 'App Store 审核新规',
        summary: '苹果更新外链规定',
        relevance: '影响文案',
        platform: 'App Store',
        url: 'https://developer.apple.com/news/test-read',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
    ],
  }, access);

  let snap = store.read();
  assert.equal(snap.data.briefingItems.length, 1);
  assert.equal(snap.data.briefingItems[0].isRead, false);

  // 2. 用户在客户端打开阅读原文，更新 isRead 和 readAt
  const nowIso = new Date().toISOString();
  snap.data.briefingItems[0].isRead = true;
  snap.data.briefingItems[0].readAt = nowIso;
  const writeRes = store.write(snap.data, snap.revision);
  assert.ok(writeRes);
  assert.equal(validateData(writeRes.data), true);

  // 3. Agent 再次重跑回填同一天简报，用户的已读原文状态 (isRead, readAt) 保持不被覆盖
  const rerunRes = runTool(store, 'save_briefing', {
    expectedRevision: writeRes.revision,
    date: '2026-11-20',
    timezone: 'Asia/Shanghai',
    budget: '15分钟',
    status: 'completed',
    frameworks: [],
    platformSummaries: [],
    items: [
      {
        productId: 'p1',
        category: 'platform_change',
        title: 'App Store 审核新规（更新摘要）',
        summary: '更新后的说明',
        relevance: '影响文案',
        platform: 'App Store',
        url: 'https://developer.apple.com/news/test-read',
        publishedAt: '2026-11-20',
        checkedAt: '2026-11-20',
        verification: 'full',
      },
    ],
  }, access);

  assert.equal(rerunRes.success, true);
  const finalSnap = store.read();
  const itemAfterRerun = finalSnap.data.briefingItems[0];
  assert.equal(itemAfterRerun.isRead, true);
  assert.equal(itemAfterRerun.readAt, nowIso);
  assert.equal(itemAfterRerun.title, 'App Store 审核新规（更新摘要）');
});

test('资讯列表分页逻辑：默认 20 条一页，分页切片与页码计算准确', () => {
  const pageSize = 20;
  // 生成 45 条测试条目
  const dummyItems = Array.from({ length: 45 }, (_, idx) => ({
    id: `item-${idx + 1}`,
    title: `资讯条目 ${idx + 1}`,
    url: `https://example.com/item/${idx + 1}`,
  }));

  const totalPages = Math.ceil(dummyItems.length / pageSize);
  assert.equal(totalPages, 3);

  // 第 1 页：1 ~ 20 条
  const page1 = dummyItems.slice(0, pageSize);
  assert.equal(page1.length, 20);
  assert.equal(page1[0].id, 'item-1');
  assert.equal(page1[19].id, 'item-20');

  // 第 2 页：21 ~ 40 条
  const page2 = dummyItems.slice(pageSize, pageSize * 2);
  assert.equal(page2.length, 20);
  assert.equal(page2[0].id, 'item-21');
  assert.equal(page2[19].id, 'item-40');

  // 第 3 页：41 ~ 45 条
  const page3 = dummyItems.slice(pageSize * 2, pageSize * 3);
  assert.equal(page3.length, 5);
  assert.equal(page3[0].id, 'item-41');
  assert.equal(page3[4].id, 'item-45');
});

test('资讯检索配置 (briefingSearchConfigs) 校验与 MCP 操作支持', () => {
  const store = openStore(':memory:', {
    products: [
      {
        id: 'p1',
        name: 'PicClean',
        summary: '智能照片与相册清理工具',
        appId: '1234567890',
        price: '免费',
        platform: 'ios',
        website: 'https://picclean.app',
        color: '#0284c7',
      },
    ],
    docs: [
      {
        id: 'd1',
        productId: 'p1',
        title: '定位与核心功能',
        body: '已确认：PicClean 是一款专注于相册隐私和无损压缩的工具。目标用户为摄影爱好者。',
        status: 'confirmed',
        updatedAt: '2026-11-20T00:00:00Z',
        history: [],
      },
    ],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [],
    contents: [],
    contentGroups: [],
    tasks: [],
    promotions: [],
    analyticsReports: [],
    briefings: [],
    briefingItems: [],
    briefingSearchConfigs: [],
  });

  const access = { enabled: true, allowWrites: true };
  const currentRevision = store.read().revision;

  // 1. 调用 MCP 工具 save_briefing_search_configs 批量写入检索配置项（包含权重 1~5）
  const saveRes = runTool(
    store,
    'save_briefing_search_configs',
    {
      expectedRevision: currentRevision,
      items: [
        {
          name: '相册隐私痛点与用户差评',
          productId: 'p1',
          weight: 5, // 极高优先级
          category: 'user_voice',
          platforms: ['Reddit', 'X', 'App Store'],
          keywords: ['相册', '隐私', 'Exif', '清理'],
          focusQuestions: ['用户对类似工具有哪些最强烈的隐私顾虑？'],
          competitors: ['Slidebox', 'HashPhotos'],
          enabled: true,
        },
        {
          name: '出海独立开发爆款与增长打法',
          productId: 'general',
          weight: 4, // 较高优先级
          category: 'growth_inspiration',
          platforms: ['Product Hunt', 'X'],
          keywords: ['Indie Hacker', 'Launch', 'MRR'],
          focusQuestions: ['最近有哪些独立开发者的相册或工具类产品登上 PH Top？'],
          enabled: true,
        },
        {
          name: '低频行业趋势追踪',
          productId: 'general',
          weight: 1, // 最低权重
          category: 'industry_trend',
          keywords: ['AI', 'LLM'],
          enabled: false, // 停用
        },
      ],
    },
    access
  );

  assert.equal(saveRes.count, 3);
  assert.equal(saveRes.configs.length, 3);

  // 2. 检查写入后的数据结构与权重
  const curData = store.read().data;
  assert.equal(curData.briefingSearchConfigs.length, 3);

  const highWeightConfig = curData.briefingSearchConfigs.find((c) => c.name === '相册隐私痛点与用户差评');
  assert.ok(highWeightConfig);
  assert.equal(highWeightConfig.weight, 5);
  assert.equal(highWeightConfig.productId, 'p1');
  assert.equal(highWeightConfig.enabled, true);

  // 3. 调用 get_briefing_context，验证 searchConfigs 是否正确返回且按权重降序排列
  const contextRes = runTool(
    store,
    'get_briefing_context',
    { timezone: 'Asia/Shanghai' },
    access
  );

  assert.ok(Array.isArray(contextRes.searchConfigs));
  // 只有已启用的配置会被推荐给 Agent
  assert.equal(contextRes.searchConfigs.length, 2);
  // 第一项应为权重 5 的配置
  assert.equal(contextRes.searchConfigs[0].weight, 5);
  assert.equal(contextRes.searchConfigs[0].name, '相册隐私痛点与用户差评');
  // 第二项应为权重 4 的配置
  assert.equal(contextRes.searchConfigs[1].weight, 4);
  assert.equal(contextRes.searchConfigs[1].name, '出海独立开发爆款与增长打法');

  // 4. list_records 支持查询 briefingSearchConfigs
  const listRes = runTool(
    store,
    'list_records',
    { collection: 'briefingSearchConfigs', limit: 10, offset: 0 },
    access
  );
  assert.equal(listRes.total, 3);
  assert.equal(listRes.records[0].weight, 5);

  // 5. delete_record 支持删除检索配置项
  const deleteRes = runTool(
    store,
    'delete_record',
    {
      collection: 'briefingSearchConfigs',
      id: highWeightConfig.id,
      expectedRevision: store.read().revision,
    },
    access
  );
  assert.equal(deleteRes.record.id, highWeightConfig.id);

  const afterDeleteData = store.read().data;
  assert.equal(afterDeleteData.briefingSearchConfigs.length, 2);
  assert.equal(
    afterDeleteData.briefingSearchConfigs.some((c) => c.id === highWeightConfig.id),
    false
  );
});

test('资讯 4 个阶段优化系统验证：偏好闭环、信源直连、事件聚类与知识库资产联动', async () => {
  const store = openStore(':memory:', {
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
    briefings: [],
    briefingSearchConfigs: [
      {
        id: 'cfg-1',
        name: 'AI 独立开发动态',
        productId: 'p1',
        weight: 5,
        category: 'growth_inspiration',
        platforms: ['Hacker News', 'Reddit'],
        keywords: ['indie hacker', 'AI tool'],
        focusQuestions: ['最近有哪些 AI 工具被独立开发者广泛采用？'],
        enabled: true,
      },
    ],
    briefingItems: [
      {
        id: 'item-saved-historical',
        briefingId: 'b-old',
        productId: 'p1',
        category: 'competitor_move',
        title: '竞品大幅下调订阅费用并上线协同白板',
        summary: '竞品由年付 68 美元降至 29 美元，用户流失明显逆转。',
        relevance: '直接冲击我们的客单价定位，需重新核算定价门槛。',
        platform: 'Reddit',
        url: 'https://reddit.com/r/indie/pricing-drop',
        publishedAt: '2026-11-15',
        checkedAt: '2026-11-15',
        verification: 'full',
        status: 'saved',
        savedReason: '竞品激进降价策略，作为定价调整核心参考',
        savedAt: '2026-11-15T10:00:00Z',
      },
    ],
  });

  const access = { enabled: true, allowWrites: true };

  // 1. 阶段 1：偏好闭环验证
  // get_briefing_context 返回的 savedItems 包含完整内容（summary, relevance）、留下原因 (savedReason) 以及 savedAt
  const ctx = runTool(store, 'get_briefing_context', { timezone: 'Asia/Shanghai' }, access);
  assert.equal(ctx.savedItems.length, 1);
  assert.equal(ctx.savedItems[0].savedReason, '竞品激进降价策略，作为定价调整核心参考');
  assert.equal(ctx.savedItems[0].summary, '竞品由年付 68 美元降至 29 美元，用户流失明显逆转。');
  assert.equal(ctx.savedItems[0].relevance, '直接冲击我们的客单价定位，需重新核算定价门槛。');
  assert.ok(ctx.searchConfigs.length >= 1);
  assert.equal(ctx.searchConfigs[0].weight, 5);

  // 2. 阶段 2：轻量信源直连 (fetch_briefing_source) 参数与错误校验
  await assert.rejects(
    async () => await runTool(store, 'fetch_briefing_source', { source: 'jina_reader', url: 'not-a-url' }, access),
    /有效的 http\/https 页面链接/
  );
  await assert.rejects(
    async () => await runTool(store, 'fetch_briefing_source', { source: 'github_release', repo: 'no-slash' }, access),
    /必须传入 owner\/repo/
  );

  // 3. 阶段 3：跨源事件聚类 (save_briefing 支持 clusterId 与 relatedSources)
  const saveClusterRes = runTool(
    store,
    'save_briefing',
    {
      expectedRevision: store.read().revision,
      date: '2026-11-22',
      status: 'completed',
      frameworks: [],
      platformSummaries: [],
      items: [
        {
          productId: 'p1',
          category: 'competitor_move',
          title: 'Todoist 推出重大 2026 年底 AI 路线图更新',
          summary: 'Todoist 宣布整合自然语言语音任务解析并调整个人版订阅方案。',
          relevance: '作为待办竞品的核心风向，用户对其定价变动有强烈讨论。',
          platform: '官方博客',
          url: 'https://todoist.com/blog/2026-ai-roadmap',
          publishedAt: '2026-11-22',
          checkedAt: '2026-11-22',
          verification: 'full',
          clusterId: 'cluster-todoist-2026',
          relatedSources: [
            {
              platform: 'Reddit',
              title: 'r/productivity: Todoist users reacting to new pricing & AI features',
              url: 'https://reddit.com/r/productivity/comments/todoist_2026',
            },
            {
              platform: 'Hacker News',
              title: 'Todoist announces 2026 strategy overhaul',
              url: 'https://news.ycombinator.com/item?id=9999999',
            },
          ],
        },
      ],
    },
    access
  );
  assert.equal(saveClusterRes.success, true);
  assert.equal(saveClusterRes.itemCount, 1);

  const curData = store.read().data;
  const clusteredItem = curData.briefingItems.find((i) => i.clusterId === 'cluster-todoist-2026');
  assert.ok(clusteredItem);
  assert.equal(clusteredItem.clusterId, 'cluster-todoist-2026');
  assert.equal(clusteredItem.relatedSources.length, 2);
  assert.equal(clusteredItem.relatedSources[0].platform, 'Reddit');

  // 4. 阶段 4：资产联动 (Actionability Bridge: linkedDocId, linkedTaskId, linkedContentId)
  // 模拟将该条资讯沉淀为产品知识库文档 (Doc)
  const docTitle = `[外部情报] ${clusteredItem.title}`;
  const newDoc = {
    id: 'doc-briefing-linked-1',
    productId: clusteredItem.productId,
    title: docTitle,
    body: `# 外部情报分析：${clusteredItem.title}\n\n${clusteredItem.summary}`,
    status: 'confirmed',
    updatedAt: new Date().toISOString(),
    history: [],
    source: '资讯简报转入',
  };
  curData.docs.push(newDoc);
  clusteredItem.linkedDocId = newDoc.id;
  clusteredItem.status = 'saved';
  clusteredItem.savedReason = '竞品重大功能重塑，沉淀为竞品档案';
  clusteredItem.savedAt = new Date().toISOString();

  const writeDocRes = store.write(curData, store.read().revision);
  assert.ok(writeDocRes);

  // 校验数据结构与反向关联
  const afterLinkData = store.read().data;
  const linkedItem = afterLinkData.briefingItems.find((i) => i.id === clusteredItem.id);
  assert.equal(linkedItem.linkedDocId, 'doc-briefing-linked-1');
  assert.equal(linkedItem.status, 'saved');
  assert.ok(afterLinkData.docs.some((d) => d.id === 'doc-briefing-linked-1'));
});

test('资讯条目删除与级联清理 (delete_record briefingItems & briefing.itemIds 清理)', () => {
  const store = openStore(':memory:', {
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
    briefings: [
      {
        id: 'b-today',
        date: '2026-11-23',
        timezone: 'Asia/Shanghai',
        runAt: '2026-11-23T08:00:00Z',
        budget: '15分钟',
        frameworks: [],
        platformSummaries: [],
        itemIds: ['item-del-1', 'item-del-2'],
        status: 'completed',
      },
    ],
    briefingItems: [
      {
        id: 'item-del-1',
        briefingId: 'b-today',
        productId: 'p1',
        category: 'platform_change',
        title: '需要删除的测试资讯 1',
        summary: '摘要内容',
        relevance: '关注原因',
        platform: '官方更新日志',
        url: 'https://example.com/test-del-1',
        publishedAt: '2026-11-23',
        checkedAt: '2026-11-23',
        verification: 'full',
        status: 'new',
      },
      {
        id: 'item-del-2',
        briefingId: 'b-today',
        productId: 'p1',
        category: 'competitor_move',
        title: '保留的资讯 2',
        summary: '摘要内容 2',
        relevance: '关注原因 2',
        platform: 'Reddit',
        url: 'https://example.com/test-del-2',
        publishedAt: '2026-11-23',
        checkedAt: '2026-11-23',
        verification: 'full',
        status: 'new',
      },
    ],
  });

  const access = { enabled: true, allowWrites: true };

  // 1. 删除 item-del-1
  const delRes = runTool(
    store,
    'delete_record',
    {
      collection: 'briefingItems',
      id: 'item-del-1',
      expectedRevision: store.read().revision,
    },
    access
  );

  assert.equal(delRes.deleted, true);
  assert.equal(delRes.record.id, 'item-del-1');

  // 2. 校验 briefingItems 中已被移除，且 briefing.itemIds 中同步清理
  const curData = store.read().data;
  assert.equal(curData.briefingItems.length, 1);
  assert.equal(curData.briefingItems[0].id, 'item-del-2');
  assert.equal(curData.briefings[0].itemIds.includes('item-del-1'), false);
  assert.deepEqual(curData.briefings[0].itemIds, ['item-del-2']);
});

