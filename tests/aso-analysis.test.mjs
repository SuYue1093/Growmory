import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { runTool, toolDefinitions, resolveAsoMarketCode } from '../server/mcp-tools.mjs';
import { hydrateLucideIcons } from '../scripts/render-aso-html.mjs';

test('ASO MCP 支持新版报告，旧研究写入入口保持关闭', () => {
  const f = fixture();
  try {
    assert.deepEqual(toolDefinitions.filter(t => t.name.includes('_aso_')).map(t => t.name).sort(), [
      'add_aso_localization',
      'analyze_aso_media',
      'get_aso_context',
      'get_aso_media',
      'list_aso_design_resources',
      'research_aso_markets',
      'save_aso_draft',
      'save_aso_media',
      'save_aso_media_draft',
      'save_aso_report'
    ]);
    assert.throws(() => runTool(f.store, 'save_aso_analysis', {}, { enabled: true, allowWrites: true }), /工具不存在/);
    assert.equal(f.aso['save-research'], undefined);
    const context = runTool(f.store, 'get_aso_context', { productId: 'p' }, { enabled: true, allowWrites: true });
    assert.deepEqual(context.workspace, { appId: '123', revision: 0, plans: [] });
    assert.equal(context.docs[0].body, '只包含真实能力');
  } finally { f.store.close(); }
});

test('ASO 素材工具仅返回原始资源目录与截图/Logo，不预设版式或风格素材', () => {
  const f = fixture();
  const access = { enabled: true, allowWrites: false };
  try {
    const read = kind => runTool(f.store, 'list_aso_design_resources', { kind }, access);
    const { backgrounds, renderer, resources, labSample } = read('frame');
    assert.match(backgrounds.source, /app-store-screenshot-imagegen/);
    assert.match(renderer.htmlCommand, /render-aso-html\.mjs design\.html/);
    assert.match(renderer.htmlCommand, /--profile SCREENSHOT_GROUP/);
    assert.equal('canvas' in renderer, false);
    assert.equal('appStoreCommand' in renderer, false);
    assert.equal('sceneCommand' in renderer, false);
    assert.deepEqual(renderer.screenshotProfiles.IPHONE_FACE_ID_LARGE_PROFILE.slice(0, 2), [[1242, 2688], [1284, 2778]]);
    assert.ok(resources.some(item => item.usage === 'screen-overlay' && item.screen.length === 4 && item.radius > 0));
    assert.ok(read('font').resources.some(item => item.locales.includes('zh-Hans')));
    assert.ok(read('model').resources.some(item => item.usage === 'screen-texture'));
    assert.match(renderer.deviceModelCommand, /render-aso-device-model/);
    assert.match(renderer.deviceModelCommand, /--trim/);
    assert.equal('presets' in renderer.designSystem, false);
    assert.match(renderer.designSystem.freedomOfComposition, /No layout presets/i);
    assert.match(renderer.designSystem.factAndLocaleBoundary, /ONLY validate that the screenshot UI language/i);
    assert.match(renderer.designSystem.headlineCraft, /96px-132px/);
    assert.equal(labSample.screenshotPath, 'public/aso-lab/sample-screenshot.png');
    assert.equal(labSample.iconPath, 'public/aso-lab/sample-icon.png');
    assert.equal('assetPresets' in labSample, false);
    assert.match(renderer.studio.bundle, /aso:studio -- bundle/);
  } finally { f.store.close(); }
});

test('ASO HTML 渲染脚本支持 Lucide 图标注入及 24-bit RGB 输出', async () => {
  const hydrated = hydrateLucideIcons('<i data-lucide="camera" data-size="32" data-color="#C25E18"></i>');
  assert.match(hydrated, /<svg[^>]+width="32"/);
  assert.match(hydrated, /stroke="#C25E18"/);

  const dir = mkdtempSync(join(tmpdir(), 'aso-render-test-'));
  try {
    const customHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="aso-size" content="1242x2688" />
<style>
  html, body { width: 1242px; height: 2688px; margin: 0; overflow: hidden; background: linear-gradient(160deg, #F7EFE3 0%, #EAD6BC 100%); font-family: 'notoserifsc', serif; }
  .wrap { padding: 120px 80px; display: flex; flex-direction: column; gap: 40px; align-items: center; }
  h1 { font-size: 96px; color: #2B180C; margin: 0; }
  .shot { width: 720px; border-radius: 48px; box-shadow: 0 30px 70px rgba(0,0,0,0.22); }
</style>
</head>
<body>
  <div class="wrap">
    <i data-lucide="camera" data-size="48" data-color="#C25E18"></i>
    <h1>把灵感留下</h1>
    <img class="shot" src="/aso-lab/sample-screenshot.png" />
  </div>
</body>
</html>`;
    const htmlPath = join(dir, 'cli.html');
    const outPath = join(dir, 'cli-out.png');
    const thumbPath = join(dir, 'cli-thumb.png');
    writeFileSync(htmlPath, customHtml);
    execFileSync(
      'node',
      ['scripts/render-aso-html.mjs', htmlPath, outPath, '--profile', 'IPHONE_FACE_ID_LARGE_PROFILE', '--thumb', thumbPath],
      { encoding: 'utf8' },
    );
    const cliPng = readFileSync(outPath);
    assert.equal(cliPng.readUInt32BE(16), 1242);
    assert.equal(cliPng.readUInt32BE(20), 2688);
    assert.equal(cliPng[25], 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('启动清理旧研究数据及草稿研究依据，保留文案草稿，重复启动不重复迁移', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aso-cleanup-')), path = join(dir, 'db.sqlite');
  let f = fixture(path);
  try {
    f.store.saveAsoWorkspace('p', { appId: '123', keywords: [{ term: '旧词' }], competitors: [{}], analyses: [{ body: '旧报告' }], reports: [{ id: 'new-report' }], plans: [{ id: 'draft', fields: f.fields, sources: { keywords: [{}], competitors: [{}], docs: [] }, executions: [] }] }, 0);
    f.store.close(); f = fixture(path);
    const cleaned = f.store.asoWorkspace('p');
    assert.equal(cleaned.keywords, undefined);
    assert.equal(cleaned.competitors, undefined);
    assert.equal(cleaned.analyses, undefined);
    assert.deepEqual(cleaned.reports, [{ id: 'new-report' }]);
    assert.equal(cleaned.plans[0].id, 'draft');
    assert.deepEqual(cleaned.plans[0].sources, { docs: [] });
    assert.equal(cleaned.revision, 2);
    f.store.close(); f = fixture(path);
    assert.deepEqual(f.store.asoWorkspace('p'), cleaned);
  } finally { f.store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('ASO 报告列表与详情接口支持读取、标记已读、应用文案方案与删除报告', async () => {
  const f = fixture();
  try {
    // 1. 通过 MCP 保存一份包含文案方案的 ASO 报告
    const reportData = {
      productId: 'p',
      title: 'ASO 深度诊断与优化报告',
      summary: '### 阶段表现总览\n近30天展示量稳定，查看转化率存在断点。\n\n### 核心诊断结论\n展示➔查看流失35%。\n\n### ASO 落地建议\n- **P0** 优化副标题热词',
      content: '## 1. 转化漏斗剖析\n\n| 漏斗阶段 | 数值 |\n|---|---|\n| 展示 | 10000 |\n\n## 2. 视觉素材诊断\n首图需提炼价值。',
      plans: [{
        title: '核心词优化 · zh-Hans',
        platform: 'IOS',
        objective: '提升阅读类词汇搜索可见度',
        market: 'CN',
        analysis: '围绕真实功能选词，去重名称已有词汇',
        target: { versionId: 'v', infoId: 'i', locale: 'zh-Hans', platform: 'IOS' },
        before: f.fields,
        fields: { ...f.fields, subtitle: '深度阅读与高光书摘' },
      }, {
        title: 'Mac 版差异化副标题 · zh-Hans',
        platform: 'MAC_OS',
        objective: '桌面端高效率书摘与全屏沉浸',
        market: 'CN',
        analysis: '强调快捷键与桌面端联动',
        target: { versionId: 'v_mac', infoId: 'i_mac', locale: 'zh-Hans', platform: 'MAC_OS' },
        before: f.fields,
        fields: { ...f.fields, subtitle: '桌面全屏沉浸式书摘' },
      }],
      mediaPlans: [{
        title: 'iPhone 视觉素材转化方案',
        platform: 'IOS',
        locale: 'zh-Hans',
        overview: '浅色极简背景，放大界面关键文字，突出黄金3秒触达',
        testingHypothesis: '首图放大书摘卡片对比常规列表，预期提升产品页查看➔下载转化率 15%',
        items: [{
          order: 1,
          type: 'APP_SCREENSHOT',
          title: '第1张首屏Hook图',
          caption: '10秒记录高光书摘',
          subcaption: '拍照即识别 · 跨端云同步',
          visualConcept: '真实书摘高亮卡片微倾斜居中，背景柔和米白',
          rationale: '直接击中高频刚需，降低新用户理解门槛',
          device: 'IPHONE',
        }],
      }],
    };
    const saved = runTool(f.store, 'save_aso_report', reportData, { enabled: true, allowWrites: true });
    assert.ok(saved.id);
    assert.equal(saved.title, reportData.title);
    assert.equal(saved.plans.length, 2);
    assert.equal(saved.mediaPlans.length, 1);
    const context = runTool(f.store, 'get_aso_context', { productId: 'p', reportId: saved.id }, { enabled: true, allowWrites: false });
    assert.equal(context.report.id, saved.id);
    assert.deepEqual(context.report.mediaPlans, saved.mediaPlans);

    assert.equal(saved.mediaPlans[0].items[0].caption, '10秒记录高光书摘');

    // 2. 列表查询报告
    let reports = f.aso.reports('p');
    assert.equal(reports.length, 1);
    assert.equal(reports[0].id, saved.id);
    assert.equal(reports[0].isRead, undefined);
    assert.equal(reports[0].mediaPlans.length, 1);

    // 3. 标记已读与未读
    f.aso['toggle-read']('p', { reportId: saved.id, isRead: true });
    reports = f.aso.reports('p');
    assert.equal(reports[0].isRead, true);
    assert.ok(reports[0].readAt);

    f.aso['toggle-read']('p', { reportId: saved.id, isRead: false });
    reports = f.aso.reports('p');
    assert.equal(reports[0].isRead, false);

    // 4. 应用文案方案生成草稿
    const applyRes = f.aso['apply-report']('p', { reportId: saved.id });
    assert.equal(applyRes.count, 2);
    const workspace = f.aso.research('p');
    assert.equal(workspace.plans.length, 2);
    assert.equal(workspace.plans[0].sourceReportId, saved.id);
    assert.equal(workspace.plans[0].fields.subtitle, '深度阅读与高光书摘');
    assert.equal(workspace.plans[1].fields.subtitle, '桌面全屏沉浸式书摘');

    // 重复应用返回 count: 0
    const applyAgain = f.aso['apply-report']('p', { reportId: saved.id });
    assert.equal(applyAgain.count, 0);

    // 5. 删除报告
    const delRes = f.aso['delete-report']('p', { reportId: saved.id });
    assert.deepEqual(delRes, { ok: true });
    reports = f.aso.reports('p');
    assert.equal(reports.length, 0);
  } finally { f.store.close(); }
});

test('add_aso_localization MCP 工具支持为目标版本添加全新本地化语言草稿', () => {
  const f = fixture();
  try {
    // 写入初始 insights 缓存，包含 zh-Hans
    f.store.productInsights('p', {
      appId: '123',
      aso: {
        editableVersions: [{ id: 'v-1.0.0', versionString: '1.0.0', platform: 'ios', localizations: ['zh-Hans'] }]
      }
    });

    // 1. 重复已存在语言报错
    assert.throws(
      () => runTool(f.store, 'add_aso_localization', {
        productId: 'p',
        locale: 'zh-Hans',
        fields: { name: '重复语言', subtitle: '测试副标题', keywords: '关键词1,关键词2', description: '介绍' }
      }, { enabled: true, allowWrites: true }),
      /该版本已存在.*语言本地化/
    );

    // 2. 字段超限报错
    assert.throws(
      () => runTool(f.store, 'add_aso_localization', {
        productId: 'p',
        locale: 'ja',
        fields: { name: '超过三十个字符的名字超过三十个字符的名字超过三十个字符的名字超过三十个字符的名字', subtitle: '副标题', keywords: '词', description: '介绍' }
      }, { enabled: true, allowWrites: true }),
      /30 character/
    );

    // 3. 正常创建全新语言本地化草稿（以 en-US 为例）
    const result = runTool(f.store, 'add_aso_localization', {
      productId: 'p',
      locale: 'en-US',
      fields: {
        name: 'Growmory Notes',
        subtitle: 'Capture & Reflect',
        keywords: 'notes,journal,daily,habits,focus,planner,tracker,mind,memory,quote,spark,idea,book,reading,minimal',
        description: 'Growmory helps you capture notes and reflect on your memories effortlessly.'
      },
      title: 'US 市场英文首发方案',
      objective: '拓展北美英文搜索流量'
    }, { enabled: true, allowWrites: true });

    assert.equal(result.ok, true);
    assert.equal(result.locale, 'en-US');
    assert.equal(result.versionId, 'v-1.0.0');
    assert.ok(result.planId);
    assert.equal(result.plan.isNew, true);
    assert.equal(result.plan.fields.name, 'Growmory Notes');
    assert.equal(result.plan.origin, 'mcp');

    // 4. 验证已存入 workspace.plans
    const ws = f.store.asoWorkspace('p');
    const matched = ws.plans.find(p => p.id === result.planId);
    assert.ok(matched);
    assert.equal(matched.target.locale, 'en-US');
    assert.equal(matched.isNew, true);

    // 5. 再次添加相同 locale (en-US) 应当被排重拒绝
    assert.throws(
      () => runTool(f.store, 'add_aso_localization', {
        productId: 'p',
        locale: 'en-US',
        fields: { name: 'Duplicate En', subtitle: 'Sub', keywords: 'a,b,c', description: 'Desc' }
      }, { enabled: true, allowWrites: true }),
      /本地化草稿/
    );

    // 6. 添加繁体中文 zh-Hant，不指定 market，自动正确映射为两位大写 'TW' 且符合 market schema
    const zhHantResult = runTool(f.store, 'add_aso_localization', {
      productId: 'p',
      locale: 'zh-Hant',
      fields: {
        name: 'Growmory 筆記',
        subtitle: '捕捉靈感與記憶',
        keywords: '筆記,手帳,靈感,極簡,日記,清單',
        description: 'Growmory 繁體中文介紹'
      }
    }, { enabled: true, allowWrites: true });

    assert.equal(zhHantResult.ok, true);
    assert.equal(zhHantResult.locale, 'zh-Hant');
    const zhHantPlan = f.store.asoWorkspace('p').plans.find(p => p.id === zhHantResult.planId);
    assert.ok(zhHantPlan);
    assert.equal(zhHantPlan.market, 'TW');
  } finally { f.store.close(); }
});

test('resolveAsoMarketCode 正确将各类 locale 解析为 2 位大写国家/地区代码', () => {
  assert.equal(resolveAsoMarketCode('zh-Hant'), 'TW');
  assert.equal(resolveAsoMarketCode('zh-Hans'), 'CN');
  assert.equal(resolveAsoMarketCode('zh-TW'), 'TW');
  assert.equal(resolveAsoMarketCode('zh-HK'), 'HK');
  assert.equal(resolveAsoMarketCode('zh-Hant-TW'), 'TW');
  assert.equal(resolveAsoMarketCode('zh-Hant-HK'), 'HK');
  assert.equal(resolveAsoMarketCode('en-US'), 'US');
  assert.equal(resolveAsoMarketCode('en-GB'), 'GB');
  assert.equal(resolveAsoMarketCode('ja'), 'JP');
  assert.equal(resolveAsoMarketCode('ko'), 'KR');
  assert.equal(resolveAsoMarketCode('pt-BR'), 'BR');
  assert.equal(resolveAsoMarketCode('de-DE'), 'DE');
  // 显式指定 inputMarket 优先
  assert.equal(resolveAsoMarketCode('zh-Hant', 'HK'), 'HK');
  assert.equal(resolveAsoMarketCode('zh-Hans', 'sg'), 'SG');
});
