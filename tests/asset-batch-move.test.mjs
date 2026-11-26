import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { validateData } from "../server/validate.mjs";
import { buildFolderTree, calculateFolderTotalAssetCounts } from "../src/asset-folder-utils.ts";

const createMockData = () => ({
  products: [
    {
      id: "prod-1",
      name: "Growmory iOS",
      summary: "记账与成长管理应用",
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
  docs: [],
  docFolders: [],
  assets: [
    {
      id: "asset-1",
      name: "宣传海报 A",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      productId: "prod-1",
      releaseId: "rel-1",
      folderId: "",
      fileSize: 2048,
      fileName: "poster_a.png",
      fileType: "image/png",
      width: 100,
      height: 100,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "asset-2",
      name: "宣传海报 B",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      productId: "prod-1",
      releaseId: "rel-1",
      folderId: "",
      fileSize: 4096,
      fileName: "poster_b.png",
      fileType: "image/png",
      width: 100,
      height: 100,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    },
    {
      id: "asset-3",
      name: "宣传海报 C",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      productId: "prod-1",
      releaseId: "rel-1",
      folderId: "folder-old",
      fileSize: 8192,
      fileName: "poster_c.png",
      fileType: "image/png",
      width: 100,
      height: 100,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    },
  ],
  assetFolders: [
    {
      id: "folder-old",
      productId: "prod-1",
      parentId: "",
      name: "旧分类",
    },
    {
      id: "folder-parent",
      productId: "prod-1",
      parentId: "",
      name: "推广物料",
    },
    {
      id: "folder-sub",
      productId: "prod-1",
      parentId: "folder-parent",
      name: "社交媒体图",
    },
    {
      id: "folder-sub-nested",
      productId: "prod-1",
      parentId: "folder-sub",
      name: "小红书配图",
    },
  ],
  releases: [
    {
      id: "rel-1",
      productId: "prod-1",
      version: "1.0.0",
      changes: "首发版本",
      languages: ["zh-Hans"],
      channels: ["app-store"],
      status: "ready",
      createdAt: "2026-11-01T00:00:00Z",
      notes: [],
      proposals: [],
    },
  ],
  contents: [],
  tasks: [],
});

test("素材库多选：buildFolderTree 正确生成嵌套文件夹深度与全路径", () => {
  const data = createMockData();
  const tree = buildFolderTree(data.assetFolders);

  assert.equal(tree.length, 4);

  // 验证各节点深度与完整路径
  const parentNode = tree.find((t) => t.folder.id === "folder-parent");
  assert.ok(parentNode);
  assert.equal(parentNode.depth, 0);
  assert.equal(parentNode.fullPath, "推广物料");

  const subNode = tree.find((t) => t.folder.id === "folder-sub");
  assert.ok(subNode);
  assert.equal(subNode.depth, 1);
  assert.equal(subNode.fullPath, "推广物料 / 社交媒体图");

  const nestedNode = tree.find((t) => t.folder.id === "folder-sub-nested");
  assert.ok(nestedNode);
  assert.equal(nestedNode.depth, 2);
  assert.equal(nestedNode.fullPath, "推广物料 / 社交媒体图 / 小红书配图");
});

test("素材库多选：支持将多个素材批量移动至指定文件夹", () => {
  const store = openStore(":memory:", createMockData());
  const s = store.read();

  const selectedIds = ["asset-1", "asset-2"];
  const targetFolderId = "folder-sub";

  // 执行批量移动
  const set = new Set(selectedIds);
  for (const a of s.data.assets) {
    if (set.has(a.id)) {
      a.folderId = targetFolderId;
      a.updatedAt = "2026-11-16T12:00:00Z";
    }
  }

  const saved = store.write(s.data, s.revision);
  assert.ok(saved);

  const reloaded = store.read();
  const moved1 = reloaded.data.assets.find((a) => a.id === "asset-1");
  const moved2 = reloaded.data.assets.find((a) => a.id === "asset-2");
  const untouched = reloaded.data.assets.find((a) => a.id === "asset-3");

  assert.equal(moved1.folderId, "folder-sub");
  assert.equal(moved2.folderId, "folder-sub");
  assert.equal(moved1.updatedAt, "2026-11-16T12:00:00Z");
  assert.equal(untouched.folderId, "folder-old");

  // 验证移动后的文件夹素材计数
  const counts = calculateFolderTotalAssetCounts(reloaded.data.assetFolders, reloaded.data.assets);
  // folder-sub 本身有 2 个素材
  assert.equal(counts.get("folder-sub"), 2);
  // folder-parent 递归包含 folder-sub 的 2 个素材
  assert.equal(counts.get("folder-parent"), 2);

  store.close();
});

test("素材库多选：支持将子文件夹中的素材批量移动至根目录", () => {
  const store = openStore(":memory:", createMockData());
  const s = store.read();

  const selectedIds = ["asset-3"];
  const targetFolderId = ""; // 根目录

  const set = new Set(selectedIds);
  for (const a of s.data.assets) {
    if (set.has(a.id)) {
      a.folderId = targetFolderId;
      a.updatedAt = "2026-11-16T12:05:00Z";
    }
  }

  const saved = store.write(s.data, s.revision);
  assert.ok(saved);

  const reloaded = store.read();
  const moved = reloaded.data.assets.find((a) => a.id === "asset-3");
  assert.equal(moved.folderId, "");
  assert.equal(moved.updatedAt, "2026-11-16T12:05:00Z");

  // 旧文件夹中素材计数变为 0
  const counts = calculateFolderTotalAssetCounts(reloaded.data.assetFolders, reloaded.data.assets);
  assert.equal(counts.get("folder-old"), 0);

  store.close();
});

test("素材库多选：跨 App 移动时同步更新 productId 并清除版本 releaseId", () => {
  const store = openStore(":memory:", createMockData());
  const s = store.read();

  const selectedIds = ["asset-1", "asset-2"];
  const targetProductId = "prod-2"; // 移动至 HabitTracker
  const targetFolderId = ""; // 根目录

  const set = new Set(selectedIds);
  for (const a of s.data.assets) {
    if (set.has(a.id)) {
      a.folderId = targetFolderId;
      if (a.productId !== targetProductId) {
        a.productId = targetProductId;
        a.releaseId = undefined; // 跨产品清除原版本关联
      }
      a.updatedAt = "2026-11-16T12:10:00Z";
    }
  }

  // 严格数据验证通过
  assert.doesNotThrow(() => validateData(s.data));

  const saved = store.write(s.data, s.revision);
  assert.ok(saved);

  const reloaded = store.read();
  const a1 = reloaded.data.assets.find((a) => a.id === "asset-1");
  assert.equal(a1.productId, "prod-2");
  assert.equal(a1.releaseId, undefined);
  assert.equal(a1.folderId, "");

  store.close();
});
