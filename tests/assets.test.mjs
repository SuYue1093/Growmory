import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore, inferAssetLanguages } from "../server/store.mjs";
import { validateData } from "../server/validate.mjs";

const initial = () => ({
  products: [
    {
      id: "app-1",
      name: "Growmory App",
      summary: "应用介绍",
      appId: "12345",
      price: "免费",
      platform: "iOS",
      website: "https://growmory.app",
      color: "blue",
    },
  ],
  docs: [],
  docFolders: [],
  assets: [],
  assetFolders: [],
  releases: [
    {
      id: "rel-1",
      productId: "app-1",
      version: "1.0.0",
      changes: "初始版本",
      languages: ["zh-Hans"],
      channels: ["app-store"],
      status: "ready",
      createdAt: "2026-11-05T00:00:00Z",
      notes: [{ language: "zh-Hans", body: "新功能", approved: true }],
      proposals: [],
    },
  ],
  contents: [],
  tasks: [],
});

test("素材库：支持保存 App 素材、关联版本、文件大小与图片数据", () => {
  const store = openStore(":memory:", initial());
  const s = store.read();

  const asset = {
    id: "asset-1",
    name: "App 宣传海报",
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    productId: "app-1",
    releaseId: "rel-1",
    fileSize: 102400,
    fileName: "poster.png",
    fileType: "image/png",
    folderId: "",
    width: 1080,
    height: 1920,
    createdAt: "2026-11-05T10:00:00Z",
    updatedAt: "2026-11-05T10:00:00Z",
  };

  s.data.assets.push(asset);
  const saved = store.write(s.data, s.revision);
  assert.ok(saved);
  assert.equal(saved.revision, 1);

  const reloaded = store.read();
  assert.equal(reloaded.data.assets.length, 1);
  assert.equal(reloaded.data.assets[0].name, "App 宣传海报");
  assert.equal(reloaded.data.assets[0].productId, "app-1");
  assert.equal(reloaded.data.assets[0].releaseId, "rel-1");
  assert.equal(reloaded.data.assets[0].fileSize, 102400);
  assert.equal(reloaded.data.assets[0].fileName, "poster.png");
  assert.equal(reloaded.data.assets[0].width, 1080);
  assert.equal(reloaded.data.assets[0].height, 1920);

  store.close();
});

test("素材库：支持创建非 App 通用图片素材与多层嵌套文件夹", () => {
  const store = openStore(":memory:", initial());
  const s = store.read();

  // Root folder for shared assets
  const rootFolder = {
    id: "f-root",
    productId: "", // 非 App 通用素材
    name: "通用品牌物料",
    parentId: "",
  };

  // Subfolder nested inside root folder
  const subFolder = {
    id: "f-sub",
    productId: "",
    name: "社交媒体图",
    parentId: "f-root",
  };

  s.data.assetFolders.push(rootFolder, subFolder);

  // Non-app asset placed inside nested subfolder
  const nonAppAsset = {
    id: "asset-shared-1",
    name: "Twitter 标头",
    url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    productId: "", // 非 App
    fileSize: 51200,
    fileName: "twitter-header.jpg",
    fileType: "image/jpeg",
    folderId: "f-sub",
    createdAt: "2026-11-05T11:00:00Z",
    updatedAt: "2026-11-05T11:00:00Z",
  };

  s.data.assets.push(nonAppAsset);
  const saved = store.write(s.data, s.revision);
  assert.ok(saved);

  const reloaded = store.read();
  assert.equal(reloaded.data.assetFolders.length, 2);
  const foundSub = reloaded.data.assetFolders.find((f) => f.id === "f-sub");
  assert.equal(foundSub?.parentId, "f-root");
  assert.equal(foundSub?.productId, "");

  const foundAsset = reloaded.data.assets.find((a) => a.id === "asset-shared-1");
  assert.equal(foundAsset?.productId, "");
  assert.equal(foundAsset?.folderId, "f-sub");
  assert.equal(foundAsset?.releaseId, undefined);

  store.close();
});

test("数据校验：拒绝文件夹循环引用、跨域归属及悬空版本关联", () => {
  const data = initial();

  // 1. Cyclic folder reference
  const cyclicData = structuredClone(data);
  cyclicData.assetFolders = [
    { id: "f1", productId: "app-1", name: "A", parentId: "f2" },
    { id: "f2", productId: "app-1", name: "B", parentId: "f1" },
  ];
  assert.equal(validateData(cyclicData), false);

  // 2. Cross-domain folder reference (shared folder claiming app folder as parent)
  const crossData = structuredClone(data);
  crossData.assetFolders = [
    { id: "app-folder", productId: "app-1", name: "App目录", parentId: "" },
    { id: "shared-folder", productId: "", name: "通用目录", parentId: "app-folder" },
  ];
  assert.equal(validateData(crossData), false);

  // 3. Asset pointing to release of another product
  const crossRelData = structuredClone(data);
  crossRelData.assets = [
    {
      id: "a-cross",
      name: "跨产品素材",
      url: "data:image/png;base64,123",
      productId: "", // 通用素材不能关联某个 App 的 release
      releaseId: "rel-1",
      fileSize: 100,
      fileName: "test.png",
      fileType: "image/png",
      createdAt: "2026-11-05T12:00:00Z",
      updatedAt: "2026-11-05T12:00:00Z",
    },
  ];
  assert.equal(validateData(crossRelData), false);

  // 4. Asset pointing to folder of another product
  const crossFolderAsset = structuredClone(data);
  crossFolderAsset.assetFolders = [
    { id: "f-app", productId: "app-1", name: "App目录", parentId: "" },
  ];
  crossFolderAsset.assets = [
    {
      id: "a-wrong-folder",
      name: "错位目录素材",
      url: "data:image/png;base64,123",
      productId: "", // 通用素材不能放置在 App 的专属目录下
      folderId: "f-app",
      fileSize: 100,
      fileName: "test.png",
      fileType: "image/png",
      createdAt: "2026-11-05T12:00:00Z",
      updatedAt: "2026-11-05T12:00:00Z",
    },
  ];
  assert.equal(validateData(crossFolderAsset), false);

  // 5. Negative file size rejected
  const negSizeData = structuredClone(data);
  negSizeData.assets = [
    {
      id: "a-neg",
      name: "负大小素材",
      url: "data:image/png;base64,123",
      productId: "app-1",
      fileSize: -1,
      fileName: "test.png",
      fileType: "image/png",
      createdAt: "2026-11-05T12:00:00Z",
      updatedAt: "2026-11-05T12:00:00Z",
    },
  ];
  assert.equal(validateData(negSizeData), false);
});

test("素材库：文件夹拖入上传层级解析与同步创建文件夹验证", () => {
  function resolveFolderHierarchy(items, existingFolders, baseParentId, productId) {
    const newFolders = [];
    const itemFolderIdList = [];
    let idCounter = 1;

    for (const item of items) {
      if (!item.folderPath || item.folderPath.length === 0) {
        itemFolderIdList.push(baseParentId || "");
        continue;
      }

      let currentParentId = baseParentId || "";
      for (const segment of item.folderPath) {
        const trimmed = segment.trim();
        if (!trimmed) continue;

        let found = existingFolders.find(
          (f) =>
            f.productId === productId &&
            (f.parentId || "") === currentParentId &&
            f.name === trimmed
        );
        if (!found) {
          found = newFolders.find(
            (f) =>
              f.productId === productId &&
              (f.parentId || "") === currentParentId &&
              f.name === trimmed
          );
        }

        if (found) {
          currentParentId = found.id;
        } else {
          const created = {
            id: `new-folder-${idCounter++}`,
            productId,
            parentId: currentParentId,
            name: trimmed,
          };
          newFolders.push(created);
          currentParentId = created.id;
        }
      }
      itemFolderIdList.push(currentParentId);
    }

    return { newFolders, itemFolderIdList };
  }

  const existing = [
    { id: "f-root", productId: "app-1", parentId: "", name: "现有根目录" },
  ];

  const droppedFiles = [
    { name: "pic1.png", folderPath: ["设计物料", "iPad端"] },
    { name: "pic2.png", folderPath: ["设计物料", "iPhone端"] },
    { name: "pic3.png", folderPath: ["现有根目录", "子图"] },
    { name: "root.png", folderPath: [] },
  ];

  const { newFolders, itemFolderIdList } = resolveFolderHierarchy(droppedFiles, existing, "", "app-1");

  // "设计物料", "iPad端", "iPhone端", "子图" -> 4 new folders
  assert.equal(newFolders.length, 4);

  const design = newFolders.find((f) => f.name === "设计物料");
  assert.ok(design);
  assert.equal(design.parentId, "");
  assert.equal(design.productId, "app-1");

  const ipad = newFolders.find((f) => f.name === "iPad端");
  assert.equal(ipad.parentId, design.id);

  const iphone = newFolders.find((f) => f.name === "iPhone端");
  assert.equal(iphone.parentId, design.id);

  const sub = newFolders.find((f) => f.name === "子图");
  assert.equal(sub.parentId, "f-root");

  assert.equal(itemFolderIdList[0], ipad.id);
  assert.equal(itemFolderIdList[1], iphone.id);
  assert.equal(itemFolderIdList[2], sub.id);
  assert.equal(itemFolderIdList[3], ""); // loose file into root

  // Verify full data validates
  const fullData = initial();
  fullData.assetFolders = [...existing, ...newFolders];
  fullData.assets = droppedFiles.map((f, i) => ({
    id: `asset-${i}`,
    name: f.name,
    url: "data:image/png;base64,123",
    productId: "app-1",
    fileSize: 100,
    fileName: f.name,
    fileType: "image/png",
    folderId: itemFolderIdList[i],
    createdAt: "2026-11-05T12:00:00Z",
    updatedAt: "2026-11-05T12:00:00Z",
  }));

  assert.equal(validateData(fullData), true, "批量创建的文件夹与素材必须通过全量数据校验");
});

test("素材库：大文件及文件夹拖入支持分批次上传算法与边界处理", () => {
  function splitIntoBatches(assets, maxBatchBytes = 25 * 1024 * 1024) {
    if (assets.length <= 1) return [assets];
    const batches = [];
    let currentBatch = [];
    let currentBatchBytes = 0;

    for (const asset of assets) {
      const assetBytes = (asset.url ? asset.url.length : 0) + (asset.fileSize || 0);
      if (currentBatch.length > 0 && currentBatchBytes + assetBytes > maxBatchBytes) {
        batches.push(currentBatch);
        currentBatch = [asset];
        currentBatchBytes = assetBytes;
      } else {
        currentBatch.push(asset);
        currentBatchBytes += assetBytes;
      }
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  // 1. Single asset of 50MB (exceeds 25MB threshold) should form 1 batch without being discarded
  const bigAsset = { id: "a-1", name: "big.png", url: "x".repeat(30 * 1024 * 1024), fileSize: 30 * 1024 * 1024 };
  const singleResult = splitIntoBatches([bigAsset]);
  assert.equal(singleResult.length, 1);
  assert.equal(singleResult[0].length, 1);

  // 2. 10 assets of 10MB each (total 100MB) should split into 4 batches of ~25MB
  const assets = Array.from({ length: 10 }, (_, i) => ({
    id: `asset-${i}`,
    name: `photo-${i}.png`,
    url: "a".repeat(10 * 1024 * 1024),
    fileSize: 10 * 1024 * 1024,
  }));

  const batches = splitIntoBatches(assets, 25 * 1024 * 1024);
  assert.ok(batches.length > 1, "总计 100MB+ 素材应被切分为多个批次");
  assert.equal(batches.reduce((sum, b) => sum + b.length, 0), 10, "分批后素材总数应完整保留");

  // 3. Small assets (5 assets of 100KB each) should remain in a single batch
  const smallAssets = Array.from({ length: 5 }, (_, i) => ({
    id: `small-${i}`,
    name: `small-${i}.png`,
    url: "b".repeat(100 * 1024),
    fileSize: 100 * 1024,
  }));
  const smallBatches = splitIntoBatches(smallAssets);
  assert.equal(smallBatches.length, 1);
  assert.equal(smallBatches[0].length, 5);
});

test("素材库：不支持格式的文件（如 .txt, .pdf, .mp4, .DS_Store, .zip）自动跳过不上传", () => {
  function isImageFile(fileName, type = "") {
    if (type && type.startsWith("image/")) return true;
    return /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif)$/i.test(fileName);
  }

  const mixedFiles = [
    { name: "screenshot1.png", type: "image/png" },
    { name: ".DS_Store", type: "" },
    { name: "readMe.txt", type: "text/plain" },
    { name: "demo.mov", type: "video/quicktime" },
    { name: "poster.jpg", type: "image/jpeg" },
    { name: "archive.zip", type: "application/zip" },
    { name: "icon.svg", type: "image/svg+xml" },
    { name: "document.pdf", type: "application/pdf" },
  ];

  const filtered = mixedFiles.filter((f) => isImageFile(f.name, f.type));
  assert.equal(filtered.length, 3, "只有 png, jpg, svg 通过过滤");
  assert.deepEqual(
    filtered.map((f) => f.name),
    ["screenshot1.png", "poster.jpg", "icon.svg"]
  );
});

test("素材库：增量追加逻辑支持分批次上传，且后续批次无需重新发送历史素材", () => {
  const store = openStore(":memory:", initial());

  // Batch 1: create 1 folder and 2 assets
  const current1 = store.read();
  const folder = { id: "f-batch", productId: "app-1", name: "分批目录", parentId: "" };
  const batch1 = [
    {
      id: "b1-1",
      name: "b1-1",
      url: "data:image/png;base64,111",
      fileName: "b1-1.png",
      fileType: "image/png",
      productId: "app-1",
      folderId: "f-batch",
      fileSize: 100,
      createdAt: "2026-11-05T10:00:00Z",
      updatedAt: "2026-11-05T10:00:00Z",
    },
  ];

  const next1 = current1.data;
  next1.assetFolders.push(folder);
  next1.assets.push(...batch1);
  const saved1 = store.write(next1, current1.revision);
  assert.ok(saved1);
  assert.equal(saved1.revision, 1);
  assert.equal(saved1.data.assets.length, 1);

  // Batch 2: append 1 more asset without sending previous batch items in network payload
  const current2 = store.read();
  const batch2 = [
    {
      id: "b2-1",
      name: "b2-1",
      url: "data:image/png;base64,222",
      fileName: "b2-1.png",
      fileType: "image/png",
      productId: "app-1",
      folderId: "f-batch",
      fileSize: 100,
      createdAt: "2026-11-05T10:00:00Z",
      updatedAt: "2026-11-05T10:00:00Z",
    },
  ];

  const next2 = current2.data;
  next2.assets.push(...batch2);
  const saved2 = store.write(next2, current2.revision);
  assert.ok(saved2);
  assert.equal(saved2.revision, 2);
  assert.equal(saved2.data.assets.length, 2);

  store.close();
});

test("素材库：文件夹素材数量综合统计，包含所有下一级及更深层级子文件夹的所有素材", () => {
  function calculateFolderTotalAssetCounts(allFolders = [], allAssets = []) {
    const childrenMap = new Map();
    for (const f of allFolders) {
      const p = f.parentId || "";
      if (!childrenMap.has(p)) childrenMap.set(p, []);
      childrenMap.get(p).push(f.id);
    }

    const directCounts = new Map();
    for (const a of allAssets) {
      if (a.folderId) {
        directCounts.set(a.folderId, (directCounts.get(a.folderId) || 0) + 1);
      }
    }

    const memo = new Map();

    function getCount(fid, stack) {
      if (memo.has(fid)) return memo.get(fid);
      if (stack.has(fid)) return 0; // 防御循环引用
      stack.add(fid);

      let total = directCounts.get(fid) || 0;
      const children = childrenMap.get(fid) || [];
      for (const childId of children) {
        total += getCount(childId, stack);
      }
      stack.delete(fid);
      memo.set(fid, total);
      return total;
    }

    const result = new Map();
    const stack = new Set();
    for (const f of allFolders) {
      result.set(f.id, getCount(f.id, stack));
    }
    return result;
  }

  // 构建如下文件夹层级：
  // 根文件夹 rootA (自身直接素材: 1 个)
  //   ├─ 子文件夹 subB (自身直接素材: 2 个)
  //   │    └─ 孙文件夹 grandC (自身直接素材: 3 个)
  //   │         └─ 曾孙文件夹 greatD (自身直接素材: 4 个)
  //   └─ 子文件夹 subE (自身直接素材: 0 个)
  //        └─ 孙文件夹 grandF (自身直接素材: 5 个)
  // 独立空根文件夹 rootG (自身直接素材: 0 个)
  const folders = [
    { id: "rootA", name: "根A", parentId: "", productId: "app-1" },
    { id: "subB", name: "子B", parentId: "rootA", productId: "app-1" },
    { id: "grandC", name: "孙C", parentId: "subB", productId: "app-1" },
    { id: "greatD", name: "曾孙D", parentId: "grandC", productId: "app-1" },
    { id: "subE", name: "子E", parentId: "rootA", productId: "app-1" },
    { id: "grandF", name: "孙F", parentId: "subE", productId: "app-1" },
    { id: "rootG", name: "根G", parentId: "", productId: "app-1" },
  ];

  const assets = [
    // rootA: 1 个
    { id: "a1", folderId: "rootA" },
    // subB: 2 个
    { id: "a2", folderId: "subB" },
    { id: "a3", folderId: "subB" },
    // grandC: 3 个
    { id: "a4", folderId: "grandC" },
    { id: "a5", folderId: "grandC" },
    { id: "a6", folderId: "grandC" },
    // greatD: 4 个
    { id: "a7", folderId: "greatD" },
    { id: "a8", folderId: "greatD" },
    { id: "a9", folderId: "greatD" },
    { id: "a10", folderId: "greatD" },
    // grandF: 5 个
    { id: "a11", folderId: "grandF" },
    { id: "a12", folderId: "grandF" },
    { id: "a13", folderId: "grandF" },
    { id: "a14", folderId: "grandF" },
    { id: "a15", folderId: "grandF" },
    // 根目录未分类素材（无 folderId）: 3 个
    { id: "a16", folderId: "" },
    { id: "a17", folderId: "" },
    { id: "a18", folderId: "" },
  ];

  const counts = calculateFolderTotalAssetCounts(folders, assets);

  // 验证各层级递归综合数量：
  // greatD: 4
  assert.equal(counts.get("greatD"), 4, "曾孙D包含自身4个素材");
  // grandC: 3 (自身) + 4 (曾孙D) = 7
  assert.equal(counts.get("grandC"), 7, "孙C应包含自身3个及曾孙4个，共7个");
  // subB: 2 (自身) + 7 (孙C) = 9
  assert.equal(counts.get("subB"), 9, "子B应包含自身2个及孙C全部，共9个");
  // grandF: 5
  assert.equal(counts.get("grandF"), 5, "孙F包含自身5个素材");
  // subE: 0 (自身) + 5 (孙F) = 5
  assert.equal(counts.get("subE"), 5, "子E自身0个但包含孙F的5个，共5个");
  // rootA: 1 (自身) + 9 (subB) + 5 (subE) = 15
  assert.equal(counts.get("rootA"), 15, "根A应包含所有下级及更深层级所有素材综合共15个");
  // rootG: 0
  assert.equal(counts.get("rootG"), 0, "空根G应为0个素材");

  // 验证防御循环引用数据结构不会引起死循环
  const cyclicFolders = [
    { id: "c1", name: "环1", parentId: "c2" },
    { id: "c2", name: "环2", parentId: "c1" },
  ];
  const cyclicAssets = [{ id: "ca1", folderId: "c1" }];
  const cyclicCounts = calculateFolderTotalAssetCounts(cyclicFolders, cyclicAssets);
  assert.equal(cyclicCounts.get("c1"), 1);
});

test("素材库：素材文件持久化至本地 assets 目录，SQLite 仅保存轻量引用以防止内存溢出", () => {
  import("node:fs").then(({ mkdtempSync, rmSync, existsSync }) => {
    import("node:os").then(({ tmpdir }) => {
      import("node:path").then(({ join }) => {
        const tempDir = mkdtempSync(join(tmpdir(), "growmory-assets-test-"));
        try {
          const dbPath = join(tempDir, "test.sqlite");
          const store = openStore(dbPath, initial());

          const asset = {
            id: "disk-asset-1",
            name: "高分辨率海报",
            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            fileName: "large-poster.png",
            fileType: "image/png",
            productId: "app-1",
            folderId: "",
            fileSize: 1024,
            createdAt: "2026-11-05T10:00:00Z",
            updatedAt: "2026-11-05T10:00:00Z",
          };

          const result = store.appendAssets([asset], [], 0);
          assert.ok(result);
          assert.equal(result.count, 1);

          // 验证读取的工作区中，asset.url 已转为 /api/assets/file/:id
          const reloaded = store.read();
          const savedAsset = reloaded.data.assets.find((a) => a.id === "disk-asset-1");
          assert.ok(savedAsset);
          assert.equal(savedAsset.url, "/api/assets/file/disk-asset-1");

          // 验证本地磁盘确实生成了对应图片文件
          const fileInfo = store.getAssetFile("disk-asset-1");
          assert.ok(fileInfo);
          assert.ok(fileInfo.filePath);
          assert.equal(existsSync(fileInfo.filePath), true);
          assert.equal(fileInfo.mime, "image/png");

          store.close();
        } finally {
          rmSync(tempDir, { recursive: true, force: true });
        }
      });
    });
  });
});

test("素材语言智能推断：根据文件夹层级与文件名推断适用语言并兜底中文", () => {
  const folders = [
    { id: "f-root", name: "素材", parentId: "" },
    { id: "f-en", name: "英文", parentId: "f-root" },
    { id: "f-zh", name: "中文", parentId: "f-root" },
    { id: "f-ja", name: "日语截图", parentId: "f-root" },
    { id: "f-tw", name: "繁体中文", parentId: "f-root" },
  ];

  // 1. 英文文件夹中的素材
  assert.deepEqual(
    inferAssetLanguages({ folderId: "f-en", name: "主页时间视图", fileName: "timeline.png" }, folders),
    ["en-US"]
  );

  // 2. 带有英文名称或标记的素材
  assert.deepEqual(
    inferAssetLanguages({ folderId: "", name: "screenshot_en_us", fileName: "home.png" }, folders),
    ["en-US"]
  );

  // 3. 日语文件夹中的素材
  assert.deepEqual(
    inferAssetLanguages({ folderId: "f-ja", name: "カレンダー", fileName: "calendar.png" }, folders),
    ["ja"]
  );

  // 4. 繁体中文文件夹中的素材
  assert.deepEqual(
    inferAssetLanguages({ folderId: "f-tw", name: "備忘錄", fileName: "notes.png" }, folders),
    ["zh-Hant"]
  );

  // 5. 中文文件夹或普通素材兜底简体中文
  assert.deepEqual(
    inferAssetLanguages({ folderId: "f-zh", name: "主页视图", fileName: "home.png" }, folders),
    ["zh-Hans"]
  );
  assert.deepEqual(
    inferAssetLanguages({ folderId: "", name: "FocusPulselogo", fileName: "logo.png" }, folders),
    ["zh-Hans"]
  );

  // 6. 已有语言标签的素材原样保留
  assert.deepEqual(
    inferAssetLanguages({ folderId: "f-en", name: "图", fileName: "p.png", languages: ["es-ES", "fr-FR"] }, folders),
    ["es-ES", "fr-FR"]
  );
});

test("素材库自动标注语言与持久化：旧素材在 store 初始化时自动完成多语言标注", () => {
  const data = initial();
  data.assetFolders = [
    { id: "f-en", productId: "app-1", name: "英文素材", parentId: "" },
  ];
  data.assets = [
    {
      id: "old-asset-1",
      name: "黑暗日历",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      productId: "app-1",
      fileName: "dark-calendar.png",
      fileType: "image/png",
      folderId: "f-en",
      fileSize: 100,
      createdAt: "2026-11-05T10:00:00Z",
      updatedAt: "2026-11-05T10:00:00Z",
    },
    {
      id: "old-asset-2",
      name: "日历-黑",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      productId: "app-1",
      fileName: "cal.png",
      fileType: "image/png",
      folderId: "",
      fileSize: 100,
      createdAt: "2026-11-05T10:00:00Z",
      updatedAt: "2026-11-05T10:00:00Z",
    },
  ];

  assert.equal(validateData(data), true);

  const store = openStore(":memory:", data);
  const reloaded = store.read();

  const a1 = reloaded.data.assets.find((a) => a.id === "old-asset-1");
  const a2 = reloaded.data.assets.find((a) => a.id === "old-asset-2");

  assert.ok(a1);
  assert.ok(a2);
  assert.deepEqual(a1.languages, ["en-US"]);
  assert.deepEqual(a2.languages, ["zh-Hans"]);

  store.close();
});

test("素材库多选批量下载打包：支持多素材无重名打包生成有效 ZIP 数据包", async () => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const mockAssets = [
    { name: "主页截图", fileName: "home.png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" },
    { name: "主页截图", fileName: "home.png", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" },
    { name: "侧边栏", fileName: "sidebar", data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" },
  ];

  const usedNames = new Set();
  for (let i = 0; i < mockAssets.length; i++) {
    const asset = mockAssets[i];
    let fileName = (asset.fileName || asset.name || `asset-${i + 1}`).trim();
    if (!/\.(png|jpe?g|webp|svg|gif|avif)$/i.test(fileName)) {
      fileName = `${fileName}.png`;
    }
    let finalName = fileName;
    let counter = 1;
    const dotIndex = fileName.lastIndexOf(".");
    const baseName = dotIndex !== -1 ? fileName.substring(0, dotIndex) : fileName;
    const ext = dotIndex !== -1 ? fileName.substring(dotIndex) : "";

    while (usedNames.has(finalName)) {
      finalName = `${baseName} (${counter})${ext}`;
      counter++;
    }
    usedNames.add(finalName);
    zip.file(finalName, asset.data, { base64: true });
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  assert.ok(zipBuffer.length > 0);

  const unzipped = await (await import("unzipper")).Open.buffer(zipBuffer);
  const fileNames = unzipped.files.map((f) => f.path);
  assert.deepEqual(fileNames.sort(), ["home (1).png", "home.png", "sidebar.png"].sort());
});
