import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import { openStore } from "../server/store.mjs";

const store = openStore(":memory:", {
  products: [
    {
      id: "firefly",
      name: "萤火待办 - 专注与待办清单",
      summary: "极简番茄钟与任务管理",
      appId: "6471234567",
      price: "免费",
      platform: "iOS、macOS",
      website: "https://firefly.example.com",
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
      productId: "firefly",
      version: "2.1.0",
      changes: "新增番茄钟音效与素材库支持",
      languages: ["zh-Hans"],
      channels: ["app-store"],
      status: "ready",
      createdAt: "2026-11-05T00:00:00Z",
      notes: [{ language: "zh-Hans", body: "新版本", approved: true }],
      proposals: [],
    },
  ],
  contents: [],
  tasks: [],
});

// Create simple test server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/api/assets/append" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const { assets = [], folders = [], revision } = JSON.parse(raw);
    const cur = store.read();
    const next = cur.data;
    if (folders.length > 0) next.assetFolders = [...(next.assetFolders || []), ...folders];
    if (assets.length > 0) next.assets = [...(next.assets || []), ...assets];
    const saved = store.write(next, revision ?? cur.revision);
    res.writeHead(saved ? 200 : 409, { "Content-Type": "application/json" });
    res.end(JSON.stringify(saved ? { revision: saved.revision, count: assets.length } : { error: "conflict" }));
    return;
  }
  const assetFileRoute = url.pathname.match(/^\/api\/assets\/file\/([^/]+)$/);
  if (assetFileRoute && req.method === "GET") {
    const fileInfo = store.getAssetFile ? store.getAssetFile(assetFileRoute[1]) : null;
    res.writeHead(200, { "Content-Type": fileInfo?.mime || "image/png" });
    res.end(fileInfo?.buffer || Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    return;
  }
  if (url.pathname === "/api/state") {
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(store.read()));
      return;
    }
    if (req.method === "PUT") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const b = JSON.parse(raw);
      const saved = store.write(b.data, b.revision);
      res.writeHead(saved ? 200 : 409, { "Content-Type": "application/json" });
      res.end(JSON.stringify(saved || { error: "conflict" }));
      return;
    }
  }
  // Serve static dist
  import("node:fs").then(({ readFileSync, existsSync, statSync }) => {
    import("node:path").then(({ resolve, extname }) => {
      let file = resolve("dist", "." + decodeURIComponent(url.pathname));
      if (!existsSync(file) || statSync(file).isDirectory()) file = resolve("dist", "index.html");
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
      }[extname(file)] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(readFileSync(file));
    });
  });
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
});

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

try {
  // 1. Visit home page
  await page.goto(base);
  await page.waitForLoadState("networkidle");

  // Verify left global sidebar has '素材库'
  const globalAssetTab = page.locator("nav button:has-text('素材库')");
  assert.equal(await globalAssetTab.count(), 1, "全局导航栏应存在素材库 tab");

  // 2. Click global sidebar '素材库'
  await globalAssetTab.click();
  await page.waitForTimeout(300);
  assert.ok(page.url().includes("page=assets"), "应导航到素材库页面");

  // Check heading
  await page.locator("h1:has-text('素材库')").waitFor();
  await page.locator("button:has-text('上传素材')").waitFor();
  await page.locator("button:has-text('新建文件夹')").waitFor();

  // 3. Create nested folders in global view
  // 3a. Create root folder for shared non-app assets
  await page.locator("button:has-text('新建文件夹')").click();
  await page.locator(".asset-folder-modal").waitFor();
  await page.locator(".asset-folder-modal input").fill("通用品牌物料");
  await page.locator(".asset-folder-modal button:has-text('确认创建')").click();
  await page.waitForTimeout(300);

  // Folder should appear
  await page.locator(".asset-folder-card:has-text('通用品牌物料')").waitFor();

  // 3b. Open root folder and create nested subfolder
  await page.locator(".asset-folder-card:has-text('通用品牌物料') .folder-main-btn").click();
  await page.waitForTimeout(200);
  // Breadcrumb should show "通用品牌物料"
  await page.locator(".asset-breadcrumb:has-text('通用品牌物料')").waitFor();

  // Create subfolder
  await page.locator("button:has-text('新建文件夹')").click();
  await page.locator(".asset-folder-modal").waitFor();
  await page.locator(".asset-folder-modal input").fill("宣传海报");
  await page.locator(".asset-folder-modal button:has-text('确认创建')").click();
  await page.waitForTimeout(300);

  await page.locator(".asset-folder-card:has-text('宣传海报')").waitFor();

  // 4. Test product detail page '素材库' tab
  // Go to product
  const productNavBtn = page.locator(".sidebar-products button:has-text('萤火待办')");
  await productNavBtn.click();
  await page.waitForTimeout(300);

  // Verify product navigation links have '素材库' tab
  const productAssetTab = page.locator(".product-navigation-links button:has-text('素材库')");
  assert.equal(await productAssetTab.count(), 1, "产品详情导航应存在素材库 tab");

  // Click product '素材库' tab
  await productAssetTab.click();
  await page.waitForTimeout(300);
  assert.ok(page.url().includes("tab=assets"), "URL 应切换到 tab=assets");

  // Check product asset scope badge
  await page.locator(".asset-owner-badge:has-text('萤火待办')").waitFor();

  // Create product-scoped folder
  await page.locator("button:has-text('新建文件夹')").click();
  await page.locator(".asset-folder-modal").waitFor();
  await page.locator(".asset-folder-modal input").fill("应用商店截图");
  await page.locator(".asset-folder-modal button:has-text('确认创建')").click();
  await page.waitForTimeout(300);

  await page.locator(".asset-folder-card:has-text('应用商店截图')").waitFor();

  // 5. Upload image asset in product assets tab
  await page.locator("button:has-text('上传素材')").click();
  await page.locator(".upload-asset-drawer").waitFor();

  // Set file into file input
  const fileInput = page.locator(".upload-asset-drawer input[accept='image/*']");
  const testBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64"
  );
  await fileInput.setInputFiles({
    name: "screenshot-6.5.png",
    mimeType: "image/png",
    buffer: testBuffer,
  });
  await page.waitForTimeout(300);

  // Edit name and link version
  await page.locator(".upload-item-fields input").fill("主界面 6.5寸截屏");
  await page.locator(".upload-asset-drawer select:has-text('未关联特定版本')").selectOption({ label: "版本 2.1.0" });

  // Submit upload
  await page.locator(".upload-asset-drawer button[type='submit']").click();
  await page.waitForTimeout(400);

  // Verify asset card appears in grid
  const assetCard = page.locator(".asset-card:has-text('主界面 6.5寸截屏')");
  await assetCard.waitFor();
  assert.equal(await assetCard.count(), 1, "应显示上传的素材卡片");
  assert.ok(await assetCard.locator(".version-tag").innerText().then(t => t.includes("v2.1.0")), "应标注关联版本 v2.1.0");

  // 6. Test Lightbox Preview Modal
  await assetCard.locator(".asset-thumb-wrap").click();
  await page.locator(".asset-lightbox-container").waitFor();
  await page.locator(".lightbox-meta-list:has-text('screenshot-6.5.png')").waitFor();
  await page.locator(".lightbox-meta-list:has-text('v2.1.0')").waitFor();
  await page.locator(".lightbox-meta-list:has-text('萤火待办')").waitFor();

  // Close lightbox
  await page.locator(".close-lightbox").click();
  await page.waitForTimeout(200);

  // 7. Test Edit Asset
  await assetCard.locator(".asset-card-actions button[title='编辑素材']").click();
  await page.locator(".edit-asset-drawer").waitFor();
  await page.locator(".edit-asset-drawer input[type='text']").fill("主界面截图 (已更新)");
  await page.locator(".edit-asset-drawer button:has-text('保存修改')").click();
  await page.waitForTimeout(400);
  await page.locator(".asset-card:has-text('主界面截图 (已更新)')").waitFor();

  // 8. Test View Toggle (Switch to List View)
  await page.locator(".view-toggle button[title='列表视图']").click();
  await page.waitForTimeout(200);
  const listRow = page.locator(".asset-list-row:has-text('主界面截图 (已更新)')");
  await listRow.waitFor();
  assert.equal(await listRow.count(), 1, "列表视图中应展示该素材");

  // 9. Test Search
  await page.locator(".asset-search-input input").fill("已更新");
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".asset-list-row").count(), 1, "搜索应匹配到 1 个素材");
  await page.locator(".asset-search-input input").fill("不存在的素材");
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".asset-list-row").count(), 0, "无匹配素材");
  await page.locator(".asset-search-input .clear-btn").click();
  await page.waitForTimeout(200);

  // 10. Test Delete Asset
  await page.locator(".asset-list-row:has-text('主界面截图 (已更新)') button[title='删除']").click();
  await page.locator(".confirm-dialog").waitFor();
  await page.locator(".confirm-dialog button:has-text('确认')").click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".asset-list-row:has-text('主界面截图')").count(), 0, "素材应已删除");

  // 11. Check store state
  const state = store.read();
  assert.equal(state.data.assets.length, 0, "素材已被删除");
  assert.equal(state.data.assetFolders.length, 3, "应保留已创建的 3 个文件夹");
  const sub = state.data.assetFolders.find(f => f.name === "宣传海报");
  const root = state.data.assetFolders.find(f => f.name === "通用品牌物料");
  assert.equal(sub?.parentId, root?.id, "宣传海报应嵌套在通用品牌物料下");

  // 12. Test Select All functionality (全选与批量删除)
  // Switch back to grid view
  await page.locator(".view-toggle button[title='网格视图']").click();
  await page.waitForTimeout(200);

  // Upload 2 assets
  await page.locator("button:has-text('上传素材')").click();
  await page.locator(".upload-asset-drawer").waitFor();

  const multiInput = page.locator(".upload-asset-drawer input[accept='image/*']");
  await multiInput.setInputFiles([
    {
      name: "screen-1.png",
      mimeType: "image/png",
      buffer: testBuffer,
    },
    {
      name: "screen-2.png",
      mimeType: "image/png",
      buffer: testBuffer,
    },
  ]);
  await page.waitForTimeout(300);
  await page.locator(".upload-asset-drawer button[type='submit']").click();
  await page.waitForTimeout(400);

  // Both assets should appear in grid
  assert.equal(await page.locator(".asset-card").count(), 2, "应展示 2 个素材卡片");

  // Check select all label
  const selectAllLabel = page.locator(".asset-select-all-label");
  await selectAllLabel.waitFor();
  assert.ok(await selectAllLabel.innerText().then(t => t.includes("全选")), "应显示全选控件");

  // Click select all
  await selectAllLabel.locator("input[type='checkbox']").click();
  await page.waitForTimeout(200);

  // Both cards should be selected
  assert.equal(await page.locator(".asset-card.selected").count(), 2, "全选后 2 个卡片均应为选中状态");

  // Selection bar should appear
  const selectionBar = page.locator(".asset-selection-bar");
  await selectionBar.waitFor();
  assert.ok(await selectionBar.locator(".selection-count").innerText().then(t => t.includes("2 / 2")), "应显示已选择 2 / 2");

  // Uncheck 1 card
  await page.locator(".asset-card").first().locator(".asset-select-check input").click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".asset-card.selected").count(), 1, "取消 1 个后剩余 1 个选中");
  assert.ok(await selectionBar.locator(".selection-count").innerText().then(t => t.includes("1 / 2")), "应显示已选择 1 / 2");

  // Click "全选当前所有" in selection bar
  await selectionBar.locator("button:has-text('全选当前所有')").click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".asset-card.selected").count(), 2, "点击全选当前所有后全部选中");

  // Batch delete
  await selectionBar.locator("button:has-text('批量删除')").click();
  await page.locator(".confirm-dialog").waitFor();
  await page.locator(".confirm-dialog button:has-text('确认')").click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator(".asset-card").count(), 0, "批量删除后卡片已清空");

  // 13. Test Folder Upload & Synchronous Folder Creation (文件夹拖入上传与同步创建嵌套文件夹)
  await page.locator("button:has-text('上传素材')").click();
  await page.locator(".upload-asset-drawer").waitFor();

  // Test folder drop simulation with relative folder path
  await page.evaluate(() => {
    const dropzone = document.querySelector(".asset-dropzone");
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const byteCharacters = atob(b64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    const file = new File([byteArray], "app-preview.png", { type: "image/png" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "设计物料/社交营销/app-preview.png",
    });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const dropEvent = new Event("drop", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(dropEvent, "dataTransfer", { value: dataTransfer });
    dropzone.dispatchEvent(dropEvent);
  });
  await page.waitForTimeout(400);

  // Verify folder badge is displayed for the dropped folder file
  const folderBadge = page.locator(".upload-item-folder-badge:has-text('设计物料 / 社交营销')").first();
  await folderBadge.waitFor();
  assert.ok(await page.locator(".upload-item-folder-badge:has-text('设计物料 / 社交营销')").count() >= 1, "应显示同步创建的文件夹层级 badge");

  // Submit upload
  await page.locator(".upload-asset-drawer button[type='submit']").click();
  await page.waitForTimeout(500);

  // Check store state for synchronized folders
  const stateAfterFolder = store.read();
  const designFolder = stateAfterFolder.data.assetFolders.find(f => f.name === "设计物料");
  assert.ok(designFolder, "应同步创建一级文件夹「设计物料」");
  const socialFolder = stateAfterFolder.data.assetFolders.find(f => f.name === "社交营销");
  assert.ok(socialFolder, "应同步创建二级子文件夹「社交营销」");
  assert.equal(socialFolder.parentId, designFolder.id, "社交营销必须嵌套在设计物料下");

  const uploadedInFolder = stateAfterFolder.data.assets.find(a => a.fileName === "app-preview.png");
  assert.ok(uploadedInFolder, "素材应成功上传");
  assert.equal(uploadedInFolder.folderId, socialFolder.id, "素材 folderId 应准确指向同步创建的子文件夹");

  // 14. Verify recursive folder asset count display (文件夹素材数量递归综合统计显示)
  // Navigate back to root
  await page.locator(".breadcrumb-item:has-text('根目录')").click();
  await page.waitForTimeout(300);

  // Parent folder "设计物料" has 0 direct assets, but 1 nested asset in "社交营销"
  // It must display "1 个素材" rather than "0 个素材"
  const designCard = page.locator(".asset-folder-card:has-text('设计物料')");
  await designCard.waitFor();
  const designCountText = await designCard.locator(".folder-count").innerText();
  assert.ok(designCountText.includes("1 个素材"), `父文件夹应统计子文件夹素材综合数量，实际为: ${designCountText}`);

  // Enter "设计物料"
  await designCard.locator(".folder-main-btn").click();
  await page.waitForTimeout(300);

  // Subfolder "社交营销" contains 1 asset
  const socialCard = page.locator(".asset-folder-card:has-text('社交营销')");
  await socialCard.waitFor();
  const socialCountText = await socialCard.locator(".folder-count").innerText();
  assert.ok(socialCountText.includes("1 个素材"), `子文件夹自身包含1个素材，实际为: ${socialCountText}`);

  assert.equal(errors.length, 0, "浏览器控制台无错误: " + errors.join("; "));
  console.log("✔ 素材库浏览器自动化验证通过：全选功能、文件夹拖入同步创建多层嵌套文件夹、文件夹素材数量递归层级综合统计、批量删除与完整增删改查闭环正常");
} finally {
  await browser.close();
  server.close();
  store.close();
}
