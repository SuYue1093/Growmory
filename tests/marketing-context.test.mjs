import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketingContext, CONTEXT_BYTES } from '../server/marketing-context.mjs';
import {
  marketingAgentPrompt,
  marketingGroupPrompt,
  marketingAgentGuide,
  getPlatformCoverSpec,
  coverImageAgentPrompt,
  COVER_SIZE_OPTIONS,
  getDefaultCoverSize,
  getPlatformCoverSizes
} from '../src/marketing-agent.ts';
import { isAiContent, formatCreatedTime } from '../src/types.ts';
import { validateData } from '../server/validate.mjs';
import { runTool } from '../server/mcp-tools.mjs';
import { openStore } from '../server/store.mjs';
const input = { action: 'suggestions', productId: 'p', channel: '小红书' };
const fixture = () => ({
  products: [{ id: 'p', name: '拾页', summary: '文字摘录与重读', platform: 'iOS' }, { id: 'other', name: '其他产品' }],
  docs: [
    { id: 'd', productId: 'p', status: 'confirmed', title: '产品介绍', body: '支持整理摘录。![image](data:SECRET)\n[阅读](https://PRIVATE.test)', updatedAt: '2026-11-05', history: [{ body: '旧版秘密' }] },
    { id: 'pending', productId: 'p', status: 'pending', title: '待确认', body: '未确认秘密' },
    { id: 'other', productId: 'other', status: 'confirmed', title: '别的产品', body: '跨产品秘密' },
  ], releases: [], contents: [
    { id: 'old', productId: 'p', status: 'published', channel: '小红书', title: '旧文章', body: '之前介绍过摘录', publishedAt: '2026-11-01' },
    { id: 'draft', productId: 'p', status: 'draft', channel: 'X', title: '草稿秘密', body: '草稿秘密' },
  ],
});
test('仅选当前产品确认资料和已发布文章，移除图片、链接及修订历史', () => {
  const context = marketingContext(fixture(), input);
  assert.equal(context.docs.length, 1); assert.equal(context.history.length, 1);
  const serialized = JSON.stringify(context);
  for (const secret of ['SECRET', 'PRIVATE', '旧版秘密', '未确认秘密', '跨产品秘密', '草稿秘密']) assert.equal(serialized.includes(secret), false);
  assert.ok(serialized.includes('之前介绍过摘录'));
});
test('大资料及转义字符下仍限制上下文字节和资料数量', () => {
  const data = fixture();
  data.docs = Array.from({ length: 50 }, (_, i) => ({ id: '' + i, productId: 'p', status: 'confirmed', title: '资料'.repeat(200), body: '长文\\"\n'.repeat(20000) }));
  data.contents = Array.from({ length: 100 }, (_, i) => ({ id: '' + i, productId: 'p', status: 'published', channel: '小红书', title: '标题'.repeat(200), body: '旧文'.repeat(10000) }));
  const context = marketingContext(data, { ...input, action: 'article', suggestion: { title: '标题'.repeat(1000), angle: '角度'.repeat(1000) } });
  assert.equal(context.docs.length, 3); assert.equal(context.history.length, 4);
  assert.ok(Buffer.byteLength(JSON.stringify(context)) <= CONTEXT_BYTES);
});
test('MCP 产品发现、限定资料读取与草稿保存不依赖内置 AI', () => {
  const data = fixture();
  data.products = data.products.map(p => ({ summary: '', appId: '', price: '', platform: '', website: '', color: 'blue', ...p }));
  data.docFolders = []; data.assets = []; data.assetFolders = []; data.tasks = [];
  data.docs = data.docs.map(d => ({ history: [], updatedAt: '2026-11-05', ...d, history: (d.history || []).map(h => ({ ...h, at: '2026-11-01' })) }));
  data.contents = data.contents.map(c => ({ date: '', url: '', ...c }));
  const store = openStore(':memory:', data), access = { enabled: true, allowWrites: true };
  try {
    const discovered = runTool(store, 'get_marketing_context', { limit: 1 }, { ...access, allowWrites: false });
    assert.equal(discovered.products.length, 1); assert.equal(discovered.total, 2);
    const result = runTool(store, 'get_marketing_context', { productId: 'p', channel: '小红书' }, access);
    assert.equal(result.context.docs[0].docId, 'd'); assert.equal(result.context.history[0].contentId, 'old');
    const saved = runTool(store, 'save_contents', { expectedRevision: result.revision, fields: { productId: 'p', title: '完整文章', body: '全文在 Agent 中输出，并按用户要求保存。', channel: '小红书', status: 'draft' } }, access);
    assert.equal(saved.record.body, '全文在 Agent 中输出，并按用户要求保存。');
    assert.equal(saved.record.isAi, true);
    assert.ok(saved.record.createdAt);
    assert.throws(() => runTool(store, 'save_contents', { expectedRevision: result.revision, fields: { productId: 'p', title: '过期保存' } }, access), /已更新/);
    assert.throws(() => runTool(store, 'get_marketing_context', { productId: 'other', releaseId: 'bad' }, access), /版本不存在/);
    assert.throws(() => runTool(store, 'get_marketing_context', {}, { enabled: false }), /已关闭/);
  } finally { store.close(); }
});
test('创作指令要求在 Agent 对话中先确认、提议、选题，再返回完整文章', () => {
  const guide = marketingAgentPrompt({ productId: 'p', releaseId: 'r' });
  for (const rule of ['一次最多用三个简短问题', '每个需要用户选择的阶段停下来等回复', '2至3个不同推广提议', '3个具体选题', '返回完整标题和正文', '只有用户要求保存时', 'get_marketing_context', 'save_contents', '不调用 Growmory 内置 AI']) assert.ok(guide.includes(rule));
  assert.ok(guide.includes('"productId":"p"')); assert.ok(guide.includes('"releaseId":"r"'));
});

test('平台问答进入提示词，已知偏好保留且不重复第一步问答', () => {
  const guide = marketingAgentPrompt({ productId: 'p', releaseId: 'r', brief: { channels: ['小红书'], format: '图文文章', theme: '使用场景', audience: '阅读爱好者' } });
  for (const value of ['小红书', '图文文章', '使用场景', '阅读爱好者', '第一步需求问答已在 Growmory 平台完成', '不要重新进行第一步问答', '直接进入第3步']) assert.ok(guide.includes(value));
  assert.equal(guide.includes('一次最多用三个简短问题确认：'), false);
});
test('平台未指定的需求明确交给 AI 提议，未选产品不默认为首个产品', () => {
  const guide = marketingAgentPrompt({ brief: {} });
  assert.ok(guide.includes('"productId":null'));
  assert.ok(guide.includes('"channels":"让 AI 提供提议"'));
  assert.ok(guide.includes('"theme":"让 AI 提供提议"'));
  assert.ok(guide.includes('不要反复追问'));
  assert.ok(guide.includes('让用户选择并确认'));
});

test('多渠道完整写入提示词，并要求分别成文和逐条保存', () => {
  const prompt = marketingAgentPrompt({ productId: 'p', brief: { channels: ['X', '小红书', 'X'], theme: '新功能推广' } });
  assert.ok(prompt.includes('"channels":["X","小红书"]'));
  assert.ok(prompt.includes('每个渠道分别输出'));
  assert.ok(prompt.includes('多渠道时逐条保存'));
});

test('中英文营销创作和内容组提示词要求核对版本并回填实际关联字段', () => {
  const group = { groupId: 'g', title: '拾页 2.0 推广', direction: '推广 2.0 新功能', products: [{ id: 'p', name: '拾页' }], channels: ['X', '小红书'] };
  const prompts = [marketingAgentGuide];
  for (const lang of ['zh', 'en']) {
    prompts.push(marketingGroupPrompt(group, lang), marketingAgentPrompt({ productId: 'p', brief: {} }, lang));
  }
  for (const prompt of prompts) {
    assert.match(prompt, /list_records[ （(]+collection: "releases"/);
    assert.match(prompt, /fields\.releaseId/);
    assert.match(prompt, /record\.releaseId/);
    assert.match(prompt, /通用内容省略该字段|Omit the field for general content/);
  }
});

test('营销同期指标仅覆盖发布日起三个自然日，缺失日期不跨窗补齐', () => {
  const context = marketingContext(fixture(), input, { productInsights: () => ({ trends: { rows: [
    { date: '2026-11-05', firstDownloads: 999, impressions: 999 },
    { date: '2026-11-03', firstDownloads: 3, impressions: 30 },
    { date: '2026-11-01', firstDownloads: 1, impressions: 10 },
  ] } }) });
  const perf = context.history[0].dataPerformance;
  assert.equal(perf.downloadsPost3d, 4);
  assert.equal(perf.impressionsPost3d, 40);
  assert.equal(perf.windowDays, 2);
  assert.equal(perf.completeWindow, false);
  assert.equal(perf.windowEndExclusive, '2026-11-04');
  assert.equal(perf.attribution, 'correlation_only');
});

test('isAiContent 正确判断文案是否为 AI 生成', () => {
  assert.equal(isAiContent({ isAi: true, title: '测试', body: '', channel: 'X', status: 'draft', date: '', url: '', id: '1', productId: 'p' }), true);
  assert.equal(isAiContent({ isAi: false, title: '测试', body: '', channel: 'X', status: 'draft', date: '', url: '', id: '2', productId: 'p' }), false);
  // 未明确设置 isAi，但有 groupId（营销组由 Agent 回填）
  assert.equal(isAiContent({ groupId: 'group-1', title: '测试', body: '', channel: 'X', status: 'draft', date: '', url: '', id: '3', productId: 'p' }), true);
  // 未明确设置 isAi，但有国外平台中文全文翻译 explanation
  assert.equal(isAiContent({ explanation: '全文翻译', title: '测试', body: '', channel: 'X', status: 'draft', date: '', url: '', id: '4', productId: 'p' }), true);
  // 手动创建且无 groupId、无 explanation
  assert.equal(isAiContent({ title: '测试', body: '', channel: 'X', status: 'draft', date: '', url: '', id: '5', productId: 'p' }), false);
});

test('formatCreatedTime 正确格式化创建时间（包含时分）', () => {
  assert.equal(formatCreatedTime(''), '—');
  assert.equal(formatCreatedTime(undefined), '—');
  assert.equal(formatCreatedTime('2026-11-06'), '2026-11-06 00:00');
  const formatted = formatCreatedTime('2026-11-08T14:35:50.000Z');
  assert.ok(formatted.startsWith('2026-11-08'));
  assert.ok(formatted.includes(':'));
});

test('validateData 校验支持文案包含 createdAt 和 isAi 字段', () => {
  const data = {
    products: [{ id: 'p', name: '产品', summary: '', appId: '', price: '', platform: 'iOS', website: '', color: 'blue' }],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [],
    tasks: [],
    contentGroups: [],
    contents: [
      {
        id: 'c1',
        productId: 'p',
        title: '测试文案',
        body: '正文',
        channel: 'X',
        status: 'draft',
        date: '',
        url: '',
        createdAt: '2026-11-08T14:35:50.000Z',
        isAi: true,
      },
    ],
  };
  assert.equal(validateData(data), true);
});

test('getPlatformCoverSpec 返回各平台的封面比例与规格', () => {
  const xhs = getPlatformCoverSpec('小红书');
  assert.equal(xhs.ratio, '3:4');
  assert.ok(xhs.advice.includes('3:4 竖版'));

  const wechat = getPlatformCoverSpec('微信公众号');
  assert.equal(wechat.ratio, '2.35:1');

  const x = getPlatformCoverSpec('X');
  assert.equal(x.ratio, '16:9');

  const reddit = getPlatformCoverSpec('Reddit');
  assert.ok(reddit.ratio.includes('16:9'));
});

test('getPlatformCoverSizes 返回平台定制的预设规格集合（横屏、竖屏、方图等）', () => {
  const xhsSizes = getPlatformCoverSizes('小红书');
  assert.equal(xhsSizes.length, 5);
  assert.equal(xhsSizes[0].id, '3:4');
  assert.equal(xhsSizes[0].orientation, 'portrait');
  assert.ok(xhsSizes.some((s) => s.id === '4:3' && s.orientation === 'landscape'));
  assert.ok(xhsSizes.some((s) => s.id === '16:9' && s.orientation === 'landscape'));
  assert.ok(xhsSizes.some((s) => s.id === '1:1' && s.orientation === 'square'));
  assert.ok(xhsSizes.some((s) => s.id === '9:16' && s.orientation === 'fullscreen'));

  const wechatSizes = getPlatformCoverSizes('微信公众号');
  assert.equal(wechatSizes.length, 4);
  assert.equal(wechatSizes[0].id, '2.35:1');
  assert.ok(wechatSizes.some((s) => s.id === '6:7'));

  const xSizes = getPlatformCoverSizes('X');
  assert.equal(xSizes[0].id, '16:9');
  assert.ok(xSizes.some((s) => s.id === '4:5'));

  const bilibiliSizes = getPlatformCoverSizes('B站');
  assert.equal(bilibiliSizes[0].id, '16:10');

  const phSizes = getPlatformCoverSizes('Product Hunt');
  assert.equal(phSizes[0].id, '1.67:1');

  const jikeSizes = getPlatformCoverSizes('即刻');
  assert.equal(jikeSizes[0].id, '1:1');

  const genericSizes = getPlatformCoverSizes('');
  assert.ok(genericSizes.length >= 5);
});

test('coverImageAgentPrompt 包含平台规格、正文摘要、MCP素材工具与备注，不硬编码logo和产品详情', () => {
  const prompt = coverImageAgentPrompt({
    product: { id: 'p1', name: '拾页' },
    content: { id: 'c1', title: '限免第一天，下载超1000次', channel: '小红书' },
    notes: '突出限免红色标签，暗黑模式背景',
  }, 'zh');

  assert.ok(prompt.includes('小红书'));
  assert.ok(prompt.includes('3:4'));
  assert.ok(prompt.includes('限免第一天，下载超1000次'));
  assert.ok(prompt.includes('拾页'));
  assert.ok(prompt.includes('突出限免红色标签，暗黑模式背景'));
  assert.ok(prompt.includes('upload_asset'));
  assert.ok(prompt.includes('list_records'));
  assert.ok(prompt.includes('get_record'));
  // 验证产品详细介绍与 logo 等不硬编码写在提示词中，而是通过 MCP 工具获取
  assert.equal(prompt.includes('data:icon'), false);

  // 验证传入自定义尺寸规格（如横图 16:9）
  const landscapeSize = COVER_SIZE_OPTIONS.find((s) => s.id === '16:9');
  const landscapePrompt = coverImageAgentPrompt({
    product: { id: 'p1', name: '拾页' },
    content: { id: 'c1', title: '限免第一天，下载超1000次', channel: '小红书' },
    size: landscapeSize,
    notes: '极简横版',
  }, 'zh');
  assert.ok(landscapePrompt.includes('16:9'));
  assert.ok(landscapePrompt.includes('极简横版'));
  assert.ok(landscapePrompt.includes('中文界面截图'), '国内渠道应要求获取中文素材');

  // 验证海外渠道（如 Reddit）应要求获取英文素材
  const redditPrompt = coverImageAgentPrompt({
    product: { id: 'p1', name: '拾页' },
    content: { id: 'c2', title: 'Reddit promo recap', channel: 'Reddit' },
  }, 'zh');
  assert.ok(redditPrompt.includes('英文界面截图'), '海外渠道应要求获取英文素材');
  assert.ok(redditPrompt.includes('海外/英文平台'));
});

test('营销质量规范与 Agent 指令要求写作前浏览历史相似文章与数据表现、去AI味且避免突兀人话', () => {
  const guideZh = marketingAgentGuide;
  const promptZh = marketingAgentPrompt({ productId: 'p1' }, 'zh');
  const groupZh = marketingGroupPrompt({ groupId: 'g1', title: '推广组', direction: '新品发布', products: [{ id: 'p1', name: '拾页' }], channels: ['小红书'] }, 'zh');

  for (const text of [guideZh, promptZh, groupZh]) {
    assert.match(text, /get_marketing_context/);
    assert.match(text, /历史.*(文章|相似).*数据表现|数据表现.*历史/);
    assert.match(text, /去\s*AI\s*味/);
    assert.match(text, /突兀.*人话|突兀/);
  }

  // 验证附带自媒体快照指标时，marketingContext 会将其实际提取至 history.socialMetrics
  const data = fixture();
  data.socialAnalytics = {
    accounts: [{ id: 'acc1', platform: 'xiaohongshu', name: '我的小红书', url: 'https://www.xiaohongshu.com/user/profile/123' }],
    snapshots: [
      {
        id: 's1',
        accountId: 'acc1',
        kind: 'content',
        contentId: 'old',
        title: '旧文章',
        url: 'https://www.xiaohongshu.com/explore/123',
        observedAt: '2026-11-05T12:00:00Z',
        period: 'lifetime',
        periodEnd: '2026-11-05',
        source: 'report',
        sourceNote: '导入',
        metrics: { views: 5200, likes: 320, comments: 45, saves: 180 },
      }
    ]
  };
  const ctx = marketingContext(data, input);
  assert.equal(ctx.history[0].contentId, 'old');
  assert.deepEqual(ctx.history[0].socialMetrics, { views: 5200, likes: 320, comments: 45, saves: 180 });
});

test('多账号上下文优先返回同账号历史文章并透出内容方向与文风，save_contents 校验 accountId', () => {
  const data = fixture();
  data.products = data.products.map(p => ({ summary: '', appId: '', price: '', platform: '', website: '', color: 'blue', ...p }));
  data.docFolders = []; data.assets = []; data.assetFolders = []; data.tasks = [];
  data.docs = data.docs.map(d => ({ history: [], updatedAt: '2026-11-05', ...d, history: (d.history || []).map(h => ({ ...h, at: '2026-11-01' })) }));
  data.socialAnalytics = {
    accounts: [
      { id: 'acc-xhs-1', platform: 'xiaohongshu', name: 'SuYue | AI独立开发', url: 'https://www.xiaohongshu.com/user/profile/1', productId: '', contentDirection: '独立开发幕后故事', writingStyle: '克制真诚、第一人称' },
      { id: 'acc-xhs-2', platform: 'xiaohongshu', name: 'infini的SOP手记', url: 'https://www.xiaohongshu.com/user/profile/2', productId: '', contentDirection: 'SOP 效率与方法论', writingStyle: '条理清晰、步骤清单' },
      { id: 'acc-x-1', platform: 'x', name: 'Suyue X', url: 'https://x.com/suyue', productId: '', isPremium: true },
    ],
    snapshots: [],
  };
  data.contents = [
    { id: 'old-1', productId: 'p', status: 'published', channel: '小红书', accountId: 'acc-xhs-1', title: '独立开发日记', body: '账号1历史文章', date: '2026-11-01', publishedAt: '2026-11-01', url: '' },
    { id: 'old-2', productId: 'p', status: 'published', channel: '小红书', accountId: 'acc-xhs-2', title: 'SOP 清单实践', body: '账号2历史文章', date: '2026-11-02', publishedAt: '2026-11-02', url: '' },
  ];
  data.contentGroups = [
    {
      id: 'g-multi',
      title: '双账号测试',
      direction: '新功能上线',
      productIds: ['p'],
      channels: ['小红书'],
      targets: [
        { channel: '小红书', accountId: 'acc-xhs-1' },
        { channel: '小红书', accountId: 'acc-xhs-2' },
      ],
      createdAt: '2026-11-05',
    },
  ];
  assert.equal(validateData(data), true);

  const store = openStore(':memory:', data), access = { enabled: true, allowWrites: true };
  try {
    const ctx = runTool(store, 'get_marketing_context', { productId: 'p', channel: '小红书', accountId: 'acc-xhs-1' }, access);
    assert.equal(ctx.accounts.length, 1);
    assert.equal(ctx.accounts[0].contentDirection, '独立开发幕后故事');
    assert.equal(ctx.accounts[0].writingStyle, '克制真诚、第一人称');
    assert.equal(ctx.context.account.id, 'acc-xhs-1');
    assert.equal(ctx.context.history[0].contentId, 'old-1');

    const saved = runTool(store, 'save_contents', {
      expectedRevision: ctx.revision,
      fields: { productId: 'p', title: '账号2草稿', body: '正文', channel: '小红书', accountId: 'acc-xhs-2', status: 'draft' },
    }, access);
    assert.equal(saved.record.accountId, 'acc-xhs-2');

    assert.throws(() => runTool(store, 'save_contents', {
      expectedRevision: saved.revision,
      fields: { productId: 'p', title: '跨平台错绑', body: '正文', channel: '小红书', accountId: 'acc-x-1', status: 'draft' },
    }, access), /平台不匹配/);

    assert.throws(() => runTool(store, 'save_contents', {
      expectedRevision: saved.revision,
      fields: { productId: 'p', title: '不存在账号', body: '正文', channel: '小红书', accountId: 'missing', status: 'draft' },
    }, access), /账号不存在/);

    const updatedProfile = runTool(store, 'save_social_account_profile', {
      accountId: 'acc-xhs-2',
      contentDirection: 'SOP 效率与个人工作流沉淀',
      writingStyle: '结构清晰、干货清单体、少废话',
      expectedRevision: saved.revision,
    }, access);
    assert.equal(updatedProfile.account.contentDirection, 'SOP 效率与个人工作流沉淀');
    assert.equal(updatedProfile.account.writingStyle, '结构清晰、干货清单体、少废话');
    assert.throws(() => runTool(store, 'save_social_account_profile', {
      accountId: 'acc-xhs-2',
      contentDirection: '过期写入',
      expectedRevision: saved.revision,
    }, access), /已更新/);
    assert.throws(() => runTool(store, 'save_social_account_profile', {
      accountId: 'acc-xhs-2',
      contentDirection: '无写权限',
      expectedRevision: updatedProfile.revision,
    }, { enabled: true, allowWrites: false }), /只读/);
  } finally {
    store.close();
  }

  const groupPrompt = marketingGroupPrompt({
    groupId: 'g-multi',
    title: '双账号测试',
    direction: '新功能上线',
    products: [{ id: 'p', name: '拾页' }],
    channels: ['小红书'],
    targets: [
      { channel: '小红书', accountId: 'acc-xhs-1', accountName: 'SuYue | AI独立开发', contentDirection: '独立开发幕后故事', writingStyle: '克制真诚' },
      { channel: '小红书', accountId: 'acc-xhs-2', accountName: 'infini的SOP手记', contentDirection: 'SOP 效率与方法论', writingStyle: '步骤清单' },
    ],
  }, 'zh');
  assert.ok(groupPrompt.includes('SuYue | AI独立开发'));
  assert.ok(groupPrompt.includes('infini的SOP手记'));
  assert.ok(groupPrompt.includes('独立开发幕后故事'));
  assert.ok(groupPrompt.includes('步骤清单'));
  assert.ok(groupPrompt.includes('fields.accountId'));
});
