import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC";
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1_BASE64}`;
const SVG_DATA_URL =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#2563eb"/><text x="16" y="46" fill="#fff" font-size="16">Demo</text></svg>`,
  ).toString("base64");

const reservation = http.createServer();
await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));

const base = `http://127.0.0.1:${port}`;
const dir = mkdtempSync(join(tmpdir(), "growmory-inline-browser-"));
const child = spawn(process.execPath, ["server/index.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DB_PATH: join(dir, "workspace.sqlite"),
  },
  stdio: "pipe",
});

let browser;
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("测试服务启动超时")), 10000);
    child.stdout.on("data", (b) => {
      if (String(b).includes("Growmory")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(Error("测试服务退出：" + code));
    });
  });

  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const current = await page.request.get(`${base}/api/state`).then((r) => r.json());
  const data = {
    products: [
      {
        id: "p1",
        name: "Growmory",
        summary: "独立开发者营销工作台",
        appId: "",
        price: "",
        platform: "macOS",
        website: "",
        color: "blue",
      },
    ],
    docs: [],
    docFolders: [],
    assets: [
      {
        id: "a1",
        name: "架构图.png",
        url: PNG_DATA_URL,
        productId: "p1",
        folderId: "f1",
        languages: ["zh-Hans"],
        fileName: "arch.png",
        fileType: "image/png",
        fileSize: 96,
        width: 10,
        height: 10,
        createdAt: "2026-11-12T00:00:00Z",
        updatedAt: "2026-11-12T00:00:00Z",
      },
      {
        id: "a2",
        name: "流程图.svg",
        url: SVG_DATA_URL,
        productId: "p1",
        folderId: "f2",
        languages: ["en-US"],
        fileName: "flow.svg",
        fileType: "image/svg+xml",
        fileSize: 180,
        width: 120,
        height: 80,
        createdAt: "2026-11-12T00:00:00Z",
        updatedAt: "2026-11-12T00:00:00Z",
      },
      ...Array.from({ length: 14 }, (_, idx) => ({
        id: `extra-${idx + 1}`,
        name: `商店竖图-${idx + 1}.png`,
        url: PNG_DATA_URL,
        productId: idx % 2 === 0 ? "p1" : "",
        folderId: idx % 2 === 0 && idx % 3 === 0 ? "f1" : "",
        languages: idx % 2 === 0 ? ["zh-Hans"] : ["en-US"],
        fileName: `portrait-${idx + 1}.png`,
        fileType: "image/png",
        fileSize: 2048 + idx * 100,
        width: 1290,
        height: 2796,
        createdAt: "2026-11-12T00:00:00Z",
        updatedAt: "2026-11-12T00:00:00Z",
      })),
    ],
    assetFolders: [
      { id: "f1", productId: "p1", name: "产品截图", parentId: "" },
      { id: "f2", productId: "p1", name: "子流程", parentId: "f1" },
    ],
    releases: [],
    tasks: [],
    contents: [
      {
        id: "wechat-post",
        productId: "p1",
        title: "公众号深度实践",
        body: "## 核心特性\n\n第一段文字说明。",
        channel: "微信公众号",
        status: "draft",
        date: "2026-11-12",
        url: "",
        assetNames: ["架构图.png"],
      },
      {
        id: "xhs-post",
        productId: "p1",
        title: "小红书种草笔记",
        body: "纯图文外挂测试",
        channel: "小红书",
        status: "draft",
        date: "2026-11-12",
        url: "",
        assetIds: ["a1"],
      },
    ],
  };

  const putRes = await page.request.put(`${base}/api/state`, {
    data: { revision: current.revision, data },
  });
  assert.equal(putRes.ok(), true);

  await page.goto(`${base}/#page=products&product=p1&tab=contents`);
  await page.getByRole("heading", { name: "营销内容", exact: true }).waitFor();

  // 打开微信公众号草稿
  await page.getByText("公众号深度实践", { exact: true }).click();
  const linkedPanel = page.locator(".marketing-linked-assets");
  await linkedPanel.waitFor();

  // 校验关联素材模块位于正文上方
  const richBox = await page.locator(".marketing-rich-editor").boundingBox();
  const linkedBox = await linkedPanel.boundingBox();
  assert.ok(linkedBox && richBox && linkedBox.y < richBox.y, "关联素材模块应显示在正文上方");

  // 校验缩略图加载且可点击查看大图 Lightbox
  await linkedPanel.locator(".linked-asset-thumb img").first().waitFor();
  await linkedPanel.locator(".linked-asset-thumb").first().click();
  await page.locator(".asset-lightbox-stage img").waitFor();
  await page.getByRole("button", { name: "关闭图片预览" }).click();

  // 打开从素材库添加弹窗并检验显示尺寸不被压缩与多维筛选
  await linkedPanel.getByRole("button", { name: "从素材库添加" }).click();
  await page.locator(".asset-picker-modal").waitFor();
  await page.locator(".asset-picker-item").first().waitFor();

  const itemBox = await page.locator(".asset-picker-item").first().boundingBox();
  const thumbBox = await page.locator(".asset-picker-thumb").first().boundingBox();
  assert.ok(itemBox && itemBox.height >= 180, `素材选择器卡片高度异常压缩: ${itemBox?.height}`);
  assert.ok(thumbBox && thumbBox.height >= 140, `素材缩略图区域高度异常压缩: ${thumbBox?.height}`);

  await page.screenshot({ path: "/tmp/growmory-asset-picker.png" });

  // 验证简化后的筛选：已移除比例、格式、关联状态、排序
  assert.equal(await page.getByLabel("按尺寸比例筛选").count(), 0, "应已移除比例筛选");
  assert.equal(await page.getByLabel("按格式筛选").count(), 0, "应已移除格式筛选");
  assert.equal(await page.getByLabel("按关联状态筛选").count(), 0, "应已移除关联状态筛选");
  assert.equal(await page.getByLabel("排序方式").count(), 0, "应已移除排序筛选");

  // 验证国内平台（微信公众号）默认选中 zh-Hans
  assert.equal(await page.getByLabel("按语言筛选").inputValue(), "zh-Hans", "国内平台应默认选中 zh-Hans");

  // 切换为英文筛选或全部语言，即可看到流程图.svg
  await page.getByLabel("按语言筛选").selectOption("en-US");
  assert.ok((await page.locator(".asset-picker-item", { hasText: "流程图.svg" }).count()) === 1);

  // 测试卡片放大预览按钮
  await page.getByRole("button", { name: "预览图片 流程图.svg" }).click();
  await page.getByRole("button", { name: "关闭图片放大预览" }).click();

  // 切换回全部语言测试文件夹筛选
  await page.getByLabel("按语言筛选").selectOption("all");
  await page.getByLabel("按文件夹筛选").selectOption("f1");
  assert.ok((await page.locator(".asset-picker-item", { hasText: "流程图.svg" }).count()) === 1, "父文件夹应包含子文件夹内素材");

  // 选中 流程图.svg 并关联且插入正文
  await page.locator(".asset-picker-item", { hasText: "流程图.svg" }).click();
  await page.getByRole("button", { name: "关联并插入正文" }).click();

  // 验证富文本编辑区内直接渲染出 <img>
  const inlineImg = page.locator('.marketing-rich-content img[data-asset-src="/api/assets/file/a2"]');
  await inlineImg.waitFor();

  // 测试直接上传本地多张图片并关联
  const uploadInput = linkedPanel.locator('input[type="file"]');
  await uploadInput.setInputFiles([
    {
      name: "upload-1.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1X1_BASE64, "base64"),
    },
    {
      name: "upload-2.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1X1_BASE64, "base64"),
    },
  ]);
  await linkedPanel.locator(".linked-asset-name", { hasText: "upload-1.png" }).waitFor();
  await linkedPanel.locator(".linked-asset-name", { hasText: "upload-2.png" }).waitFor();

  // 测试单张下载
  const [singleDl] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载关联素材 架构图.png" }).click(),
  ]);
  assert.ok(singleDl.suggestedFilename().endsWith(".png"));

  // 测试批量选择 + 批量打包下载（ZIP）
  await page.getByLabel("全选关联素材").check();
  await linkedPanel.getByRole("button", { name: "批量下载 (4)" }).waitFor();
  const [zipDl] = await Promise.all([
    page.waitForEvent("download"),
    linkedPanel.getByRole("button", { name: "批量下载 (4)" }).click(),
  ]);
  assert.match(zipDl.suggestedFilename(), /^growmory-content-assets-.*\.zip$/);
  await page.getByLabel("全选关联素材").uncheck();

  // 测试批量选择并批量移出 upload-1.png 与 upload-2.png
  await page.getByLabel("选择关联素材 upload-1.png").check();
  await page.getByLabel("选择关联素材 upload-2.png").check();
  await linkedPanel.getByRole("button", { name: "批量移出 (2)" }).click();
  assert.equal(await linkedPanel.locator(".linked-asset-name", { hasText: "upload-1.png" }).count(), 0);
  assert.equal(await linkedPanel.locator(".linked-asset-name", { hasText: "upload-2.png" }).count(), 0);

  // 将 架构图.png 也插入正文，校验「已插入正文」徽标出现
  await linkedPanel.locator(".linked-asset-card", { hasText: "架构图.png" }).getByRole("button", { name: "插入正文", exact: true }).click();
  assert.equal(
    await linkedPanel.locator(".linked-asset-card", { hasText: "架构图.png" }).locator(".linked-asset-inbody-badge").count(),
    1,
  );

  // 切换到 Markdown 模式校验语法正确，再切回图文排版
  await page.getByRole("tab", { name: "Markdown" }).click();
  const mdValue = await page.getByLabel("营销正文", { exact: true }).inputValue();
  assert.ok(mdValue.includes("![流程图.svg](/api/assets/file/a2)"), `Markdown 应包含 SVG 素材引用: ${mdValue}`);
  assert.ok(mdValue.includes("![架构图.png](/api/assets/file/a1)"), `Markdown 应包含 PNG 素材引用: ${mdValue}`);
  await page.getByRole("tab", { name: "图文排版" }).click();

  // 点击「复制正文（含图片）」并检查剪贴板 HTML + Plain Text
  await page.getByRole("button", { name: "复制正文（含图片）" }).click();
  await page.locator(".marketing-copy-feedback").waitFor();
  const clipboardData = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out = {};
    for (const item of items) {
      if (item.types.includes("text/html")) {
        out.html = await (await item.getType("text/html")).text();
      }
      if (item.types.includes("text/plain")) {
        out.text = await (await item.getType("text/plain")).text();
      }
    }
    return out;
  });
  assert.ok(clipboardData.html && clipboardData.html.includes("data:image/png;base64,"), "剪贴板 HTML 应包含内联 PNG base64 图片");
  assert.ok(!clipboardData.html.includes("/api/assets/file/"), "剪贴板 HTML 不应残留本地相对图片路径");
  assert.ok(clipboardData.text && clipboardData.text.includes("![架构图.png](/api/assets/file/a1)"));

  await page.screenshot({ path: "/tmp/growmory-marketing-inline.png" });

  // 校验移出关联不会删除素材库中的 upload-1.png
  const latestState = await page.request.get(`${base}/api/state`).then((r) => r.json());
  assert.ok(latestState.data.assets.some((a) => a.name === "upload-1.png"));

  // 保存并刷新验证持久化
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator("dialog.marketing-editor footer", { hasText: "已保存" }).waitFor();

  // 测试按 ESC 不会退出营销内容详情页
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("dialog.marketing-editor[open]").count(), 1, "按 ESC 不应关闭营销内容详情页");

  await page.getByRole("button", { name: "关闭营销编辑" }).click();

  await page.reload();
  await page.getByText("公众号深度实践", { exact: true }).click();
  await page.locator(".marketing-linked-assets .linked-asset-card", { hasText: "流程图.svg" }).waitFor();
  await page.locator('.marketing-rich-content img[data-asset-src="/api/assets/file/a2"]').waitFor();
  await page.getByRole("button", { name: "关闭营销编辑" }).click();

  // 校验非正文插图平台（小红书）保留关联素材面板 + 原生 textarea + 复制正文
  await page.getByText("小红书种草笔记", { exact: true }).click();
  await page.locator(".marketing-linked-assets .linked-asset-card", { hasText: "架构图.png" }).waitFor();
  assert.equal(await page.locator(".marketing-rich-editor").count(), 0);
  await page.getByLabel("营销正文", { exact: true }).waitFor();
  await page.getByRole("button", { name: "复制正文", exact: true }).waitFor();

  assert.deepEqual(errors, []);
  console.log("PASS: marketing-inline-browser.mjs all assertions succeeded");
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
}
