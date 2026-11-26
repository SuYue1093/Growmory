import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { runTool, toolDefinitions } from "../server/mcp-tools.mjs";
import { diffWordsWithSpace } from "diff";

const initial = () => ({
  products: [
    {
      id: "prod-1",
      name: "Growmory 测试应用",
      summary: "独立开发者的产品管理中心",
      appId: "12345678",
      price: "免费",
      platform: "iOS",
      website: "https://example.com",
      color: "blue",
    },
  ],
  docs: [],
  docFolders: [],
  releases: [],
  contents: [],
  tasks: [],
});

test("创建与编辑资料：保存来源 (source) 并保留完整修订历史与来源", () => {
  const store = openStore(":memory:", initial());
  const snap = store.read();

  // 创建初始资料
  snap.data.docs.push({
    id: "doc-1",
    productId: "prod-1",
    folderId: "",
    title: "产品核心功能",
    body: "Growmory 帮助开发者追踪版本发布，记录资料。",
    status: "confirmed",
    updatedAt: "2026-11-04T10:00:00.000Z",
    source: "人工创建",
    history: [],
  });

  let saved = store.write(snap.data, snap.revision);
  assert.equal(saved.data.docs[0].source, "人工创建");

  // 编辑资料，正文改变，补充来源为 MCP 连接
  const current = saved.data.docs[0];
  const oldBody = current.body;
  const oldAt = current.updatedAt;
  const oldSource = current.source;

  current.history.unshift({
    body: oldBody,
    at: oldAt,
    source: oldSource,
  });
  current.body = "Growmory 帮助独立创作者追踪版本发布，整理多语言资料。";
  current.source = "MCP 连接 (Claude Desktop)";
  current.status = "pending";
  current.updatedAt = "2026-11-05T12:00:00.000Z";

  saved = store.write(saved.data, saved.revision);
  const doc = saved.data.docs[0];
  assert.equal(doc.body, "Growmory 帮助独立创作者追踪版本发布，整理多语言资料。");
  assert.equal(doc.source, "MCP 连接 (Claude Desktop)");
  assert.equal(doc.status, "pending");
  assert.equal(doc.history.length, 1);
  assert.equal(doc.history[0].body, oldBody);
  assert.equal(doc.history[0].source, "人工创建");

  store.close();
});

test("通过 MCP 连接编辑资料时自动或显式补充来源并在历史记录中留存", () => {
  const store = openStore(":memory:", initial());
  const access = { enabled: true, allowWrites: true };

  // 1. 通过 MCP 创建文档（默认待确认，禁止直接传入 confirmed）
  let current = store.read();
  assert.throws(
    () => runTool(
      store,
      "save_docs",
      {
        expectedRevision: current.revision,
        fields: {
          productId: "prod-1",
          title: "版本发布指南",
          body: "版本发布第一步：准备更新说明。",
          status: "confirmed",
          source: "MCP 连接 (Cursor)",
        },
      },
      access
    ),
    /禁止 Agent 直接将资料库文档状态设为'已确认'/
  );

  let result = runTool(
    store,
    "save_docs",
    {
      expectedRevision: current.revision,
      fields: {
        productId: "prod-1",
        title: "版本发布指南",
        body: "版本发布第一步：准备更新说明。",
        source: "MCP 连接 (Cursor)",
      },
    },
    access
  );

  assert.equal(result.record.title, "版本发布指南");
  assert.equal(result.record.source, "MCP 连接 (Cursor)");
  assert.equal(result.record.status, "pending");

  // 用户在界面人工审核确认资料
  const snapDoc = store.read();
  snapDoc.data.docs.find(d => d.id === result.record.id).status = "confirmed";
  store.write(snapDoc.data, snapDoc.revision);

  // 2. 通过 MCP 编辑文档，正文变更，补充新的来源
  const docId = result.record.id;
  current = store.read();
  result = runTool(
    store,
    "save_docs",
    {
      id: docId,
      expectedRevision: current.revision,
      fields: {
        body: "版本发布第一步：准备更新说明与多语言截图。",
        source: "MCP 连接 (外部自动化脚本)",
      },
    },
    access
  );

  assert.equal(result.record.status, "pending");
  assert.equal(result.record.body, "版本发布第一步：准备更新说明与多语言截图。");
  assert.equal(result.record.source, "MCP 连接 (外部自动化脚本)");
  assert.equal(result.record.history.length, 1);
  assert.equal(result.record.history[0].body, "版本发布第一步：准备更新说明。");
  assert.equal(result.record.history[0].source, "MCP 连接 (Cursor)");

  store.close();
});

test("Word 批注修订算法：准确检测删除、新增与修改，并携带时间、内容和来源", () => {
  const oldText = "这是旧的资料正文。\n包含删除内容。";
  const newText = "这是修改后的资料正文。\n包含新增功能！";
  const source = "MCP 连接 (外部 Agent)";
  const time = "2026/11/05 13:45";

  const diffs = diffWordsWithSpace(oldText, newText);
  const revisions = [];
  const tokens = [];

  let i = 0;
  while (i < diffs.length) {
    const curr = diffs[i];
    if (!curr.added && !curr.removed) {
      tokens.push({ type: "unchanged", value: curr.value });
      i++;
    } else if (curr.removed && i + 1 < diffs.length && diffs[i + 1].added) {
      const next = diffs[i + 1];
      const revId = revisions.length + 1;
      revisions.push({
        id: revId,
        type: "modify",
        removedText: curr.value,
        addedText: next.value,
        source,
        time,
      });
      tokens.push({ type: "removed", value: curr.value, revisionId: revId });
      tokens.push({ type: "added", value: next.value, revisionId: revId });
      i += 2;
    } else if (curr.removed) {
      const revId = revisions.length + 1;
      revisions.push({
        id: revId,
        type: "delete",
        removedText: curr.value,
        source,
        time,
      });
      tokens.push({ type: "removed", value: curr.value, revisionId: revId });
      i++;
    } else if (curr.added) {
      const revId = revisions.length + 1;
      revisions.push({
        id: revId,
        type: "insert",
        addedText: curr.value,
        source,
        time,
      });
      tokens.push({ type: "added", value: curr.value, revisionId: revId });
      i++;
    }
  }

  // 验证提取的修订批注列表
  assert.ok(revisions.length > 0);
  for (const rev of revisions) {
    assert.ok(rev.id > 0);
    assert.ok(["modify", "insert", "delete"].includes(rev.type));
    assert.equal(rev.source, source);
    assert.equal(rev.time, time);
    if (rev.type === "modify") {
      assert.ok(rev.removedText);
      assert.ok(rev.addedText);
    }
  }

  // 验证正文中的标记 tokens
  assert.ok(tokens.some((t) => t.type === "removed" && t.revisionId));
  assert.ok(tokens.some((t) => t.type === "added" && t.revisionId));
  assert.ok(tokens.some((t) => t.type === "unchanged"));
});

test("MCP 资料修改必须显式提供来源，标题修改也保留可追溯历史", () => {
  const store = openStore(":memory:", initial());
  const access = { enabled: true, allowWrites: true };
  try {
    const saved = runTool(store, "save_docs", { expectedRevision: 0, fields: { productId: "prod-1", title: "旧标题", body: "正文", source: "原始需求" } }, access);
    assert.equal(saved.record.status, "pending");
    // 用户确认
    const snap = store.read();
    snap.data.docs.find(d => d.id === saved.record.id).status = "confirmed";
    store.write(snap.data, snap.revision);
    const rev = store.read().revision;

    for (const source of [undefined, "", "   "]) {
      assert.throws(() => runTool(store, "save_docs", { id: saved.record.id, expectedRevision: rev, fields: { title: "新标题", source } }, access));
      assert.equal(store.read().revision, rev);
    }
    const updated = runTool(store, "save_docs", { id: saved.record.id, expectedRevision: rev, fields: { title: "新标题", source: "Cursor · 用户需求" } }, access);
    assert.equal(updated.record.history[0].title, "旧标题");
    assert.equal(updated.record.history[0].source, "原始需求");
    assert.equal(updated.record.source, "Cursor · 用户需求");
    assert.equal(updated.record.status, "pending");
  } finally { store.close(); }
});

test("MCP 仅调整 Markdown 格式保留已确认状态，不创建待审批注", () => {
  const store = openStore(":memory:", initial());
  const access = { enabled: true, allowWrites: true };
  try {
    const saved = runTool(store, "save_docs", { expectedRevision: 0, fields: { productId: "prod-1", title: "介绍", body: "产品介绍\n\n核心功能", source: "原始需求" } }, access);
    assert.equal(saved.record.status, "pending");
    // 用户确认
    const snap = store.read();
    snap.data.docs.find(d => d.id === saved.record.id).status = "confirmed";
    store.write(snap.data, snap.revision);
    const rev = store.read().revision;

    const formatted = runTool(store, "save_docs", { id: saved.record.id, expectedRevision: rev, fields: { body: "# 产品介绍\n\n**核心功能**", source: "MCP · 排版调整" } }, access);
    assert.equal(formatted.record.status, "confirmed");
    assert.equal(formatted.record.history.length, 1);
    assert.equal(formatted.record.reviewBase, undefined);
  } finally { store.close(); }
});

test("资料库 MCP 严格禁止 Agent 直接写入状态'已确认'，写入资料默认待确认且必须由用户确认", () => {
  const store = openStore(":memory:", initial());
  const access = { enabled: true, allowWrites: true };
  try {
    // 1. 新建资料时禁止传入 status: 'confirmed'
    assert.throws(
      () => runTool(store, "save_docs", {
        expectedRevision: 0,
        fields: {
          productId: "prod-1",
          title: "新功能",
          body: "正文内容",
          source: "Agent 编写",
          status: "confirmed",
        },
      }, access),
      /禁止 Agent 直接将资料库文档状态设为'已确认'/
    );

    // 2. 新建资料不传 status，默认为 pending
    const created = runTool(store, "save_docs", {
      expectedRevision: 0,
      fields: {
        productId: "prod-1",
        title: "新功能",
        body: "正文内容",
        source: "Agent 编写",
      },
    }, access);
    assert.equal(created.record.status, "pending");

    // 3. 用户确认资料后，Agent 再次更新时禁止传入 status: 'confirmed'
    const snap = store.read();
    snap.data.docs.find(d => d.id === created.record.id).status = "confirmed";
    store.write(snap.data, snap.revision);
    const confirmedRev = store.read().revision;

    assert.throws(
      () => runTool(store, "save_docs", {
        id: created.record.id,
        expectedRevision: confirmedRev,
        fields: {
          title: "新功能修订",
          source: "Agent 修改",
          status: "confirmed",
        },
      }, access),
      /禁止 Agent 直接将资料库文档状态设为'已确认'/
    );

    // 4. Agent 传入 status: 'pending' 合法保存，正文修改重置为待确认
    const updated = runTool(store, "save_docs", {
      id: created.record.id,
      expectedRevision: confirmedRev,
      fields: {
        title: "新功能修订",
        body: "正文内容有更新",
        source: "Agent 修改",
        status: "pending",
      },
    }, access);
    assert.equal(updated.record.status, "pending");
  } finally {
    store.close();
  }
});
