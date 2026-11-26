import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
const initial = () => ({
  products: [
    {
      id: "p",
      name: "产品",
      summary: "",
      appId: "",
      price: "",
      platform: "",
      website: "",
      color: "blue",
    },
  ],
  docs: [],
  features: [],
  releases: [],
  contents: [],
  tasks: [],
});
test("保存工作区，重新读取保留完整文档历史", () => {
  const store = openStore(":memory:", initial());
  const s = store.read();
  s.data.docs.push({
    id: "d",
    productId: "p",
    title: "产品说明",
    body: "新内容",
    status: "confirmed",
    updatedAt: "2026-11-04",
    history: [{ body: "旧内容", at: "2026-11-03" }],
  });
  const saved = store.write(s.data, s.revision);
  assert.equal(saved.revision, 1);
  assert.equal(store.read().data.docs[0].history[0].body, "旧内容");
  store.close();
});
test("创建版本发布支持初始空语言与营销渠道列表并成功保存", () => {
  const store = openStore(":memory:", initial());
  const s = store.read();
  s.data.releases.push({
    id: "r1",
    productId: "p",
    version: "1.0.0",
    changes: "初始版本",
    languages: [],
    channels: [],
    status: "preparing",
    notes: [],
    proposals: [],
    createdAt: "2026-11-05",
  });
  const saved = store.write(s.data, s.revision);
  assert.equal(saved.revision, 1);
  assert.equal(saved.data.releases[0].version, "1.0.0");
  store.close();
});
test("拒绝旧窗口覆盖较新工作区", () => {
  const store = openStore(":memory:", initial());
  const a = store.read(),
    b = store.read();
  a.data.tasks.push({
    id: "1",
    productId: "p",
    title: "新任务",
    date: "",
    done: false,
  });
  assert.ok(store.write(a.data, a.revision));
  assert.equal(store.write(b.data, b.revision), null);
  assert.equal(store.read().data.tasks[0].title, "新任务");
  store.close();
});
test("拒绝不完整数据，保留原始工作区", () => {
  const store = openStore(":memory:", initial());
  assert.throws(() => store.write({ products: [] }, 0));
  assert.equal(store.read().revision, 0);
  store.close();
});

test("拒绝不安全链接和悬空产品关联", () => {
  const store = openStore(":memory:", initial());
  const s = store.read();
  s.data.products[0].website = "javascript:alert(1)";
  assert.throws(() => store.write(s.data, s.revision));
  const next = store.read();
  next.data.tasks.push({
    id: "bad",
    productId: "missing",
    title: "无归属",
    date: "",
    done: false,
  });
  assert.throws(() => store.write(next.data, next.revision));
  assert.equal(store.read().revision, 0);
  store.close();
});

test("SQLite 关闭并重新打开后仍保留资料与 revision", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "growmory-store-"));
  try {
    const path = join(dir, "workspace.sqlite");
    const a = openStore(path, initial());
    const current = a.read();
    current.data.products[0].price = "¥18";
    a.write(current.data, current.revision);
    a.close();
    const b = openStore(path, initial());
    assert.equal(b.read().data.products[0].price, "¥18");
    assert.equal(b.read().revision, 1);
    b.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("上传的 PNG Logo 随资料保存，拒绝 SVG 与伪造图片链接", () => {
  const store = openStore(":memory:", initial());
  const state = store.read();
  const icon =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==";
  state.data.products[0].icon = icon;
  const saved = store.write(state.data, state.revision);
  assert.equal(saved.data.products[0].icon, icon);
  for (const bad of [
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
    "https://example.com/track.png",
    "data:image/png;base64,dGVzdA==",
  ]) {
    const next = store.read();
    next.data.products[0].icon = bad;
    assert.throws(() => store.write(next.data, next.revision));
  }
  assert.equal(store.read().data.products[0].icon, icon);
  store.close();
});

test("知识库保存多层文件夹，拒绝循环、跨产品和悬空引用", () => {
  const store = openStore(":memory:", initial());
  const state = store.read();
  state.data.docFolders.push(
    { id: "a", productId: "p", name: "资料", parentId: "" },
    { id: "b", productId: "p", name: "FAQ", parentId: "a" },
    { id: "c", productId: "p", name: "细节", parentId: "b" },
  );
  state.data.docs.push({ id: "d", productId: "p", folderId: "c", title: "说明", body: "正文", status: "pending", history: [], updatedAt: "2026-11-04" });
  const saved = store.write(state.data, state.revision);
  assert.equal(saved.data.docs[0].folderId, "c");
  for (const parentId of ["c", "missing"]) {
    const invalid = structuredClone(saved.data);
    invalid.docFolders[0].parentId = parentId;
    assert.throws(() => store.write(invalid, saved.revision));
  }
  const invalid = structuredClone(saved.data);
  invalid.docFolders.pop();
  assert.throws(() => store.write(invalid, saved.revision));
  const cross = structuredClone(saved.data);
  cross.products.push({ ...cross.products[0], id: "other" });
  cross.docFolders[2].productId = "other";
  assert.throws(() => store.write(cross, saved.revision));
  assert.equal(store.read().revision, saved.revision);
  store.close();
});
