import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/publication-fixture.mjs";

test("完整发布：预览只读、创建手动版本、说明与构建写入、现代审核接口及上架状态", async () => {
  const f = fixture();
  try {
    const status = await f.pub.status("r", "IOS"); assert.equal(status.builds[0].number, "42");
    const plan = await f.pub.preview("r", f.input); assert.equal(plan.createsVersion, true); assert.equal(f.state.writes.length, 0);
    await f.pub.execute("r", plan.token);
    assert.equal(f.state.versions[0].attributes.releaseType, "MANUAL"); assert.equal(f.state.notes.length, 2); assert.equal(f.state.build.id, "b1");
    await assert.rejects(f.pub.execute("r", plan.token), /失效/);
    const writes = f.state.writes.length;
    await f.pub.execute("r", (await f.pub.preview("r", f.input)).token);
    assert.equal(f.state.writes.length, writes); // unchanged sync is idempotent
    await f.pub.execute("r", (await f.pub.preview("r", { ...f.input, action: "submit" })).token);
    assert.ok(f.state.writes.some(w => w.path === "/v1/reviewSubmissions/s1" && w.body.attributes.submitted));
    assert.equal(f.state.items.length, 1); assert.equal(f.db.read().data.releases[0].status, "preparing");
    await assert.rejects(f.pub.preview("r", { ...f.input, action: "release" }), /等待开发者/);
    f.state.versions[0].attributes.appStoreState = "PENDING_DEVELOPER_RELEASE";
    await f.pub.execute("r", (await f.pub.preview("r", { ...f.input, action: "release" })).token);
    assert.equal(f.db.read().data.releases[0].status, "preparing");
    f.state.versions[0].attributes.appStoreState = "READY_FOR_SALE";
    await f.pub.status("r", "IOS"); assert.equal(f.db.read().data.releases[0].status, "published");
    assert.ok(f.db.publicationEvents("r").some(e => e.action === "release" && e.outcome === "success"));
  } finally { f.cleanup(); }
});
test("部分失败可重新发现版本继续，不重复创建，错误保留步骤记录", async () => {
  const f = fixture();
  try {
    f.state.failLocale = "en-US";
    const plan = await f.pub.preview("r", f.input);
    await assert.rejects(f.pub.execute("r", plan.token), /en-US.*测试语言错误/);
    assert.equal(f.state.versions.length, 1); assert.equal(f.state.notes.length, 1);
    f.state.failLocale = "";
    await f.pub.execute("r", (await f.pub.preview("r", f.input)).token);
    assert.equal(f.state.versions.length, 1); assert.equal(f.state.notes.length, 2);
    assert.ok(f.db.publicationEvents("r").some(e => e.outcome === "failed"));
  } finally { f.cleanup(); }
});
test("阻止未审核、重复语言映射、错误构建、跨平台、陈旧本机与远端预览", async () => {
  const f = fixture();
  try {
    f.edit(d => d.releases[0].notes[0].approved = false);
    await assert.rejects(f.pub.preview("r", f.input), /审核/);
    f.edit(d => d.releases[0].notes[0].approved = true);
    await assert.rejects(f.pub.preview("r", { ...f.input, localeMap: { 中文: "en-US", 英文: "en-US" } }), /同一个/);
    f.state.badBuild = true; await assert.rejects(f.pub.preview("r", f.input), /构建/); f.state.badBuild = false;
    await assert.rejects(f.pub.preview("r", { ...f.input, platform: "MAC_OS" }), /构建/);
    let plan = await f.pub.preview("r", f.input);
    f.edit(d => d.releases[0].notes[0].body = "新说明");
    await assert.rejects(f.pub.execute("r", plan.token), /本机版本或产品关联已改变/); assert.equal(f.state.writes.length, 0);
    await f.pub.execute("r", (await f.pub.preview("r", f.input)).token);
    plan = await f.pub.preview("r", f.input); f.state.notes[0].attributes.whatsNew = "外部修改";
    const before = f.state.writes.length;
    await assert.rejects(f.pub.execute("r", plan.token), /商店资料已改变/); assert.equal(f.state.writes.length, before);
    await assert.rejects(f.pub.preview("r", { ...f.input, action: "submit" }), /不一致/);
  } finally { f.cleanup(); }
});
test("审核批次包含其他项目时拒绝提交；重试复用已有单版本批次", async () => {
  const f = fixture();
  try {
    await f.pub.execute("r", (await f.pub.preview("r", f.input)).token);
    f.state.reviews = [{ id: "s1", attributes: { platform: "IOS", state: "READY_FOR_REVIEW" } }];
    f.state.items = [{ id: "i1", relationships: { reviewSubmission: { data: { id: "s1" } }, appStoreVersion: { data: { id: "v1" } } } }, { id: "other", relationships: { reviewSubmission: { data: { id: "s1" } } } }];
    await assert.rejects(f.pub.preview("r", { ...f.input, action: "submit" }), /其他项目/);
    f.state.items.pop();
    await f.pub.execute("r", (await f.pub.preview("r", { ...f.input, action: "submit" })).token);
    assert.equal(f.state.writes.filter(w => w.path === "/v1/reviewSubmissions" || w.path === "/v1/reviewSubmissionItems").length, 0);
  } finally { f.cleanup(); }
});
test("同一平台串行执行，预览过期和凭据变化需重新预览", async () => {
  const f = fixture();
  try {
    const one = await f.pub.preview("r", f.input), two = await f.pub.preview("r", f.input);
    let releaseGate; f.state.gate = new Promise(r => { releaseGate = r; });
    const running = f.pub.execute("r", one.token);
    while (!f.state.writes.length) await new Promise(r => setTimeout(r, 1));
    await assert.rejects(f.pub.execute("r", two.token), /正在执行/);
    releaseGate(); f.state.gate = null; await running;
    const plan = await f.pub.preview("r", f.input);
    f.apple.disconnect();
    await assert.rejects(f.pub.execute("r", plan.token), /配置已变更/);
    const now = Date.now; Date.now = () => now() + 6 * 60000;
    try { await assert.rejects(f.pub.execute("r", two.token), /失效/); } finally { Date.now = now; }
  } finally { f.cleanup(); }
});
test("新版本继承的商店语言可更新，重复成功请求在服务重建后仍被拒绝", async () => {
  const f = fixture();
  try {
    // Apple can inherit localization metadata when creating a new version.
    f.state.notes.push({ id: "inherited", attributes: { locale: "zh-Hans", whatsNew: "旧版说明" } });
    await f.pub.execute("r", (await f.pub.preview("r", f.input)).token);
    assert.equal(f.state.notes.find(n => n.id === "inherited").attributes.whatsNew, "中文说明");
    await f.pub.execute("r", (await f.pub.preview("r", { ...f.input, action: "submit" })).token);
    f.state.versions[0].attributes.appStoreState = "PREPARE_FOR_SUBMISSION"; // simulate delayed Apple state propagation
    const { openPublication } = await import("../server/publication.mjs");
    await assert.rejects(openPublication(f.db, f.apple).preview("r", { ...f.input, action: "submit" }), /请求已被 Apple 接受/);
  } finally { f.cleanup(); }
});
test("多步骤写入中本机说明变化时停止后续写入，保留已创建版本供恢复", async () => {
  const f = fixture();
  try {
    const plan = await f.pub.preview("r", f.input);
    let unblock; f.state.gate = new Promise(r => { unblock = r; });
    const executing = f.pub.execute("r", plan.token);
    while (!f.state.writes.length) await new Promise(r => setTimeout(r, 1));
    f.edit(d => d.releases[0].notes[0].body = "执行中修改");
    unblock(); f.state.gate = null;
    await assert.rejects(executing, /本机版本或产品关联已改变/);
    assert.equal(f.state.versions.length, 1); assert.equal(f.state.notes.length, 0);
  } finally { f.cleanup(); }
});
test("创建商店版本：支持各端创建与幂等识别已存在，写入 storeSources 与产品版本列表", async () => {
  const f = fixture();
  try {
    // 首次在 App Store Connect 创建版本
    const res = await f.pub.createVersion("r", { platform: "IOS", version: "2.1.0" });
    assert.equal(res.success, true);
    assert.equal(res.created, true);
    assert.equal(res.alreadyExists, false);
    assert.equal(res.version, "2.1.0");
    assert.equal(f.state.versions.length, 1);
    assert.equal(f.state.versions[0].attributes.versionString, "2.1.0");

    // 校验 release.storeSources 与 product.appStore.versions 已正确写入
    const data = f.db.read().data;
    const rel = data.releases.find(r => r.id === "r");
    assert.equal(rel.storeSources?.IOS?.versionId, f.state.versions[0].id);
    const prod = data.products.find(p => p.id === "p");
    assert.ok(prod.appStore.versions.some(v => v.version === "2.1.0" && v.platform === "IOS"));

    // 校验 publication event 事件记录
    const events = f.db.publicationEvents("r");
    assert.ok(events.some(e => e.action === "create_version" && e.outcome === "success"));

    // 再次调用时，检测到 Apple 已有此版本，幂等返回已有状态
    const res2 = await f.pub.createVersion("r", { platform: "IOS", version: "2.1.0" });
    assert.equal(res2.success, true);
    assert.equal(res2.created, false);
    assert.equal(res2.alreadyExists, true);
  } finally { f.cleanup(); }
});
