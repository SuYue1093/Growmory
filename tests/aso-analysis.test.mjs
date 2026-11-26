import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { crc32, deflateSync } from 'node:zlib';
import { saveMediaDraftGroup } from '../server/aso-media.mjs';
import { fixture } from './helpers/aso-research-fixture.mjs';
import { runTool, toolDefinitions, resolveAsoMarketCode } from '../server/mcp-tools.mjs';

test('ASO MCP 支持新版报告，旧研究写入入口保持关闭', () => {
  const f = fixture();
  try {
    assert.deepEqual(toolDefinitions.filter(t => t.name.includes('_aso_')).map(t => t.name).sort(), [
      'add_aso_localization',
      'analyze_aso_media',
      'append_aso_artwork_shots',
      'capture_aso_artwork_screenshot',
      'get_aso_artwork_set',
      'get_aso_context',
      'get_aso_media',
      'list_aso_artwork_simulators',
      'research_aso_markets',
      'save_aso_artwork_plan',
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

const screenshotPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII=', 'base64');
const artworkShot = { key: '01-reading', title: 'Reading', headline: 'Read with focus', capture: 'Reading page showing the book title and an excerpt' };
const duoTarget = { locale: 'en-US', profile: 'IPHONE_DUO_PROFILE', size: '1398x2034', goal: 'Show reading flow' };

function rgbPng(width, height, color) {
  function chunk(type, bytes) {
    const payload = Buffer.concat([Buffer.from(type), bytes]);
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    checksum.writeUInt32BE(crc32(payload));
    return Buffer.concat([size, payload, checksum]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const stride = width * 3 + 1;
  const data = Buffer.alloc(stride * height, color);
  for (let offset = 0; offset < data.length; offset += stride) data[offset] = 0;
  return Buffer.concat([screenshotPng.subarray(0, 8), chunk('IHDR', header), chunk('IDAT', deflateSync(data)), chunk('IEND', Buffer.alloc(0))]);
}

test('图片实验室确认、截图、成图和草稿状态依次推进，按方案顺序提交并保护已有草稿', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aso-artwork-')), path = join(dir, 'db.sqlite');
  let f = fixture(path);
  try {
    const access = { enabled: true, allowWrites: true };
    assert.throws(() => f.store.artwork.create('p', { ...duoTarget, size: '1320x2868' }), /设备组不支持/);
    for (const size of ['2034x1398', '2007x2853', '2853x2007']) {
      assert.equal(f.store.artwork.create('p', { ...duoTarget, size }).target.size, size);
    }
    const created = f.store.artwork.create('p', duoTarget);
    const { id } = created;
    const plan = { shots: [artworkShot, { ...artworkShot, key: '02-reading' }] };
    const save = (revision, nextPlan, permission = access) => runTool(f.store, 'save_aso_artwork_plan',
      { productId: 'p', setId: id, revision, plan: nextPlan }, permission);
    assert.ok(Date.parse(created.createdAt));
    assert.equal(created.status, 'planning');
    assert.throws(() => f.store.artwork.confirmPlan('p', id, 0), /回填方案/);
    assert.throws(() => save(0, plan, { ...access, allowWrites: false }), /只读/);
    assert.throws(() => save(0, { ...plan, shots: [artworkShot, artworkShot] }), /标识必须唯一/);
    assert.equal(save(0, plan).status, 'review');
    assert.throws(() => save(0, plan), /重新读取/);
    assert.throws(() => runTool(f.store, 'capture_aso_artwork_screenshot', {
      productId: 'p', setId: id, revision: 1, slot: artworkShot.key, deviceId: '123e4567-e89b-42d3-8123-426614174000',
    }, access), /确认方案/);
    assert.throws(() => f.store.artwork.saveCapture('p', id, 1, artworkShot.key, screenshotPng, 'import'), /确认方案/);

    assert.equal(f.store.artwork.confirmPlan('p', id, 1).status, 'capture');
    assert.throws(() => save(2, plan), /已确认/);
    assert.throws(() => f.store.artwork.saveCapture('p', id, 2, 'unknown', screenshotPng, 'import'), /没有这个截图位置/);
    assert.throws(() => f.store.artwork.saveCapture('p', id, 2, artworkShot.key, Buffer.alloc(33), 'import'), /有效的 PNG/);
    assert.throws(() => f.store.artwork.saveCapture('p', id, 2, artworkShot.key, screenshotPng, 'simulator'), /iPhone Duo 屏幕或方向不符/);
    assert.throws(() => f.store.artwork.saveFinal('p', id, 2, artworkShot.key, screenshotPng), /补齐原始截图/);
    assert.equal(f.store.artwork.saveCapture('p', id, 2, artworkShot.key, screenshotPng, 'import').status, 'capture');
    assert.equal(f.store.artwork.saveCapture('p', id, 3, '02-reading', screenshotPng, 'import').status, 'design');
    assert.throws(() => f.store.artwork.png('other', id, 4, artworkShot.key), /找不到/);
    assert.throws(() => f.store.artwork.saveFinal('p', id, 4, artworkShot.key, screenshotPng), /成图需为 1398 × 2034/);
    const first = rgbPng(1398, 2034, 60), second = rgbPng(1398, 2034, 170);
    assert.equal(f.store.artwork.saveFinal('p', id, 4, '02-reading', second).status, 'design');
    assert.equal(f.store.artwork.saveFinal('p', id, 5, artworkShot.key, first).status, 'ready');
    assert.throws(() => f.store.artwork.removeCapture('p', id, 6, artworkShot.key), /先移除/);

    const mediaTarget = { versionId: 'v', locale: 'en-US', type: 'APP_SCREENSHOT', group: 'IPHONE_DUO_PROFILE' };
    const read = () => f.store.asoMediaDraft('p', '123', 'v', 'en-US').find(entry => entry.group === mediaTarget.group)?.items;
    const write = items => saveMediaDraftGroup(f.store, 'p', '123', { ...mediaTarget, items });
    const submit = (token, mode = 'replace') => f.store.submitArtworkDraft('p', id, 6, { id: 'v', name: '2.7.0' }, { mode, replaceRevision: token }, read, write);
    const fullGroup = Array.from({ length: 10 }, (_, i) => ({ id: `saved-${i}` }));
    write(fullGroup);
    assert.throws(() => submit(undefined, 'append'), /超过 10 张/);
    assert.deepEqual(read(), fullGroup);
    write([{ id: 'existing' }]);
    saveMediaDraftGroup(f.store, 'p', '123', { ...mediaTarget, group: 'IPAD_13_PROFILE', items: [{ id: 'ipad' }] });
    let token;
    assert.throws(() => submit(), error => {
      token = error.draftRevision;
      return error.status === 409 && /^[a-f0-9]{64}$/.test(token);
    });
    write([{ id: 'edited-in-other-tab' }]);
    assert.throws(() => submit(token), error => {
      assert.notEqual(error.draftRevision, token);
      token = error.draftRevision;
      return error.status === 409;
    });
    assert.equal(f.store.artwork.read('p', id).revision, 6);
    const appendAssets = f.store.appendAssets;
    f.store.appendAssets = function (...args) {
      appendAssets.apply(this, args);
      throw new Error('模拟素材保存失败');
    };
    try {
      assert.throws(() => submit(token), /模拟素材保存失败/);
      assert.equal(f.store.artwork.read('p', id).revision, 6);
      assert.deepEqual(read(), [{ id: 'edited-in-other-tab' }]);
      assert.deepEqual(f.store.read().data.assets, []);
      assert.deepEqual(readdirSync(join(dir, 'assets')), []);
    } finally {
      f.store.appendAssets = appendAssets;
    }
    assert.equal(submit(token).status, 'submitted');
    assert.deepEqual(read().map(item => item.name), ['01-reading.png', '02-reading.png']);
    assert.deepEqual(Buffer.from(read()[0].data.split(',')[1], 'base64'), first);
    assert.deepEqual(f.store.asoMediaDraft('p', '123', 'v', 'en-US').find(entry => entry.group === 'IPAD_13_PROFILE').items, [{ id: 'ipad' }]);
    f.store.close(); f = fixture(path);
    const summary = f.store.artwork.list('p').find(set => set.id === id);
    assert.equal(summary.status, 'submitted');
    assert.equal(summary.shotCount, 2);
    assert.equal(summary.createdAt, created.createdAt);
    assert.equal(summary.submission.version, '2.7.0');
    assert.deepEqual(Buffer.from(f.store.artwork.png('p', id, 7, artworkShot.key, true)), first);
    const supplement = { ...artworkShot, key: '03-supplement' };
    const append = (revision, shots, permission = access) => runTool(f.store, 'append_aso_artwork_shots',
      { productId: 'p', setId: id, revision, shots }, permission);
    assert.throws(() => append(7, [supplement], { ...access, allowWrites: false }), /只读/);
    assert.throws(() => append(6, [supplement]), /重新读取/);
    assert.throws(() => append(7, [artworkShot]), /标识必须唯一/);
    assert.throws(() => append(7, Array.from({ length: 9 }, (_, i) => ({ ...artworkShot, key: `added-${i}` }))), /最多 10 项/);
    const appended = append(7, [supplement]);
    assert.equal(appended.status, 'review');
    assert.equal(appended.submission, null);
    assert.deepEqual(appended.plan.shots, [...plan.shots, supplement]);
    assert.deepEqual(appended.finals.sort(), [artworkShot.key, '02-reading']);
    assert.deepEqual(Buffer.from(f.store.artwork.png('p', id, 8, '02-reading', true)), second);
    assert.throws(() => f.store.artwork.deleteShot('p', id, 7, '02-reading'), /重新读取/);
    const reduced = f.store.artwork.deleteShot('p', id, 8, '02-reading');
    assert.deepEqual(reduced.plan.shots, [artworkShot, supplement]);
    assert.deepEqual(reduced.captures.map(capture => capture.slot), [artworkShot.key]);
    assert.deepEqual(reduced.finals, [artworkShot.key]);
    assert.deepEqual(Buffer.from(f.store.artwork.png('p', id, 9, artworkShot.key, true)), first);
    assert.equal(f.store.artwork.deleteShot('p', id, 9, artworkShot.key).captureCount, 0);
    const empty = f.store.artwork.deleteShot('p', id, 10, supplement.key);
    assert.equal(empty.status, 'planning');
    assert.equal(empty.plan, null);
    assert.equal(empty.confirmedAt, null);
    assert.deepEqual(append(11, [supplement]).plan.shots, [supplement]);
    assert.equal(read().length, 2, '已经写入的本地草稿独立保留');
  } finally { f.store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('图片实验室兼容旧版方案与原图，未知的创建时间保持未记录', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aso-artwork-legacy-')), path = join(dir, 'db.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`CREATE TABLE aso_artwork_sets (id TEXT PRIMARY KEY, product_id TEXT NOT NULL, revision INTEGER NOT NULL, target TEXT NOT NULL, plan TEXT);
    CREATE TABLE aso_artwork_captures (set_id TEXT, slot TEXT, width INTEGER, height INTEGER, source TEXT, png BLOB, PRIMARY KEY(set_id, slot));`);
  legacy.prepare('INSERT INTO aso_artwork_sets VALUES (?, ?, ?, ?, ?)').run('legacy', 'p', 2,
    JSON.stringify({ ...duoTarget, version: '1.0' }), JSON.stringify({ direction: 'Light', shots: [{ ...artworkShot, layout: 'Use an open book view' }] }));
  legacy.prepare('INSERT INTO aso_artwork_captures VALUES (?, ?, ?, ?, ?, ?)').run('legacy', artworkShot.key, 1, 1, 'import', screenshotPng);
  legacy.close();
  const f = fixture(path);
  try {
    const legacySet = f.store.artwork.list('p')[0];
    assert.equal(legacySet.createdAt, null);
    assert.equal(legacySet.captureCount, 1);
    assert.equal(legacySet.status, 'review');
    assert.equal(f.store.artwork.read('p', 'legacy').plan.shots[0].layout, 'Use an open book view');
    assert.deepEqual(Buffer.from(f.store.artwork.png('p', 'legacy', 2, artworkShot.key)), screenshotPng);
    assert.equal(f.store.artwork.confirmPlan('p', 'legacy', 2).status, 'design');
  } finally { f.store.close(); rmSync(dir, { recursive: true, force: true }); }
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
