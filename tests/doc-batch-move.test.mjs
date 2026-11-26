import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { validateData } from "../server/validate.mjs";
import { buildFolderTree, calculateFolderTotalItemCounts } from "../src/asset-folder-utils.ts";

const createMockData = () => ({
  products: [
    {
      id: "prod-1",
      name: "Growmory iOS",
      summary: "独立开发者工作台",
      appId: "1001",
      price: "免费",
      platform: "iOS",
      website: "https://growmory.app",
      color: "blue",
    },
    {
      id: "prod-2",
      name: "HabitTracker",
      summary: "习惯追踪应用",
      appId: "1002",
      price: "免费",
      platform: "iOS",
      website: "https://habit.app",
      color: "green",
    },
  ],
  docs: [
    {
      id: "doc-1",
      productId: "prod-1",
      folderId: "",
      title: "产品定位与核心卖点",
      body: "核心卖点说明",
      status: "confirmed",
      history: [],
      updatedAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "doc-2",
      productId: "prod-1",
      folderId: "",
      title: "常见问题 FAQ",
      body: "FAQ 内容",
      status: "pending",
      history: [],
      updatedAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "doc-3",
      productId: "prod-1",
      folderId: "folder-old",
      title: "旧版使用说明",
      body: "旧版文档",
      status: "confirmed",
      history: [],
      updatedAt: "2026-11-01T00:00:00Z",
    },
  ],
  docFolders: [
    { id: "folder-old", productId: "prod-1", parentId: "", name: "归档" },
    { id: "folder-parent", productId: "prod-1", parentId: "", name: "产品资料" },
    { id: "folder-sub", productId: "prod-1", parentId: "folder-parent", name: "用户指南" },
    { id: "folder-p2", productId: "prod-2", parentId: "", name: "发布规范" },
  ],
  assets: [],
  assetFolders: [],
  releases: [],
  contents: [],
  tasks: [],
});

test("资料库多选：buildFolderTree 与 calculateFolderTotalItemCounts 正确处理 docFolders 与 docs", () => {
  const data = createMockData();
  const prod1Folders = data.docFolders.filter((f) => f.productId === "prod-1");
  const tree = buildFolderTree(prod1Folders);

  assert.equal(tree.length, 3);
  const sub = tree.find((n) => n.folder.id === "folder-sub");
  assert.ok(sub);
  assert.equal(sub.depth, 1);
  assert.equal(sub.fullPath, "产品资料 / 用户指南");

  const counts = calculateFolderTotalItemCounts(data.docFolders, data.docs);
  assert.equal(counts.get("folder-old"), 1);
  assert.equal(counts.get("folder-sub"), 0);
});

test("资料库多选：支持将多篇资料批量移动至指定子文件夹", () => {
  const store = openStore(":memory:", createMockData());
  const s = store.read();

  const selectedIds = new Set(["doc-1", "doc-2"]);
  const targetFolder = s.data.docFolders.find((f) => f.id === "folder-sub");
  for (const doc of s.data.docs) {
    if (selectedIds.has(doc.id)) {
      doc.folderId = targetFolder.id;
      doc.productId = targetFolder.productId;
      doc.updatedAt = "2026-11-25T10:00:00Z";
    }
  }

  assert.equal(validateData(s.data), true);
  assert.ok(store.write(s.data, s.revision));

  const reloaded = store.read();
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-1").folderId, "folder-sub");
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-2").folderId, "folder-sub");
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-3").folderId, "folder-old");

  const counts = calculateFolderTotalItemCounts(reloaded.data.docFolders, reloaded.data.docs);
  assert.equal(counts.get("folder-sub"), 2);
  assert.equal(counts.get("folder-parent"), 2);

  store.close();
});

test("资料库多选：支持将子文件夹中的资料移回根目录与跨产品移动", () => {
  const store = openStore(":memory:", createMockData());
  const s = store.read();

  // doc-3 移至通用资料根目录
  const d3 = s.data.docs.find((d) => d.id === "doc-3");
  d3.folderId = "";
  d3.productId = "";
  d3.updatedAt = "2026-11-25T10:05:00Z";

  // doc-1 跨产品移至 prod-2 的文件夹
  const targetFolder = s.data.docFolders.find((f) => f.id === "folder-p2");
  const d1 = s.data.docs.find((d) => d.id === "doc-1");
  d1.folderId = targetFolder.id;
  d1.productId = targetFolder.productId;
  d1.updatedAt = "2026-11-25T10:05:00Z";

  assert.equal(validateData(s.data), true);
  assert.ok(store.write(s.data, s.revision));

  const reloaded = store.read();
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-3").folderId, "");
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-3").productId, "");
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-1").folderId, "folder-p2");
  assert.equal(reloaded.data.docs.find((d) => d.id === "doc-1").productId, "prod-2");

  store.close();
});
