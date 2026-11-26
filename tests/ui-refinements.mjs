import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const base = "http://127.0.0.1:5174";
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const mcp = new Client({ name: "browser-test", version: "1" });
try {
  await page.request.put(base + "/api/mcp/settings", {
    data: { enabled: true, allowWrites: true },
  });
  const initial = await page.request
    .get(base + "/api/state")
    .then((r) => r.json());
  initial.data.tasks = initial.data.tasks.filter(
    (t) => t.title !== "通过 MCP 创建的任务",
  );
  await page.request.put(base + "/api/state", { data: initial });
  await page.goto(base);
  await page.getByRole("heading", { name: "工作台", exact: true }).waitFor();
  assert.equal(
    await page.locator(".welcome,.eyebrow,.sidebar-note,.quiet-footer").count(),
    0,
  );
  await page
    .locator("nav")
    .getByRole("button", { name: "产品", exact: true })
    .click();
  await page.getByRole("button", { name: /拾页.*篇文档/ }).click();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await page
    .getByLabel("上传产品 Logo")
    .setInputFiles("public/icons/firefly.jpg");
  await page.waitForFunction(() =>
    document
      .querySelector('[alt="产品 Logo 预览"]')
      ?.src.startsWith("data:image/png;base64,"),
  );
  await page.getByRole("button", { name: "保存", exact: true }).click();
  let state = await page.request.get(base + "/api/state").then((r) => r.json());
  const icon = state.data.products.find((p) => p.id === "shiye").icon;
  assert.ok(icon.startsWith("data:image/png;base64,"));
  await page.reload();
  await page
    .locator("nav")
    .getByRole("button", { name: "产品", exact: true })
    .click();
  const card = page.getByRole("button", { name: /拾页.*篇文档/ });
  assert.equal(await card.locator("img").getAttribute("src"), icon);
  await card.click();
  await page.getByRole("button", { name: "编辑资料", exact: true }).click();
  await page
    .getByLabel("上传产品 Logo")
    .setInputFiles({
      name: "invalid.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
  await page.getByRole("alert").filter({ hasText: "请选择 PNG" }).waitFor();
  await page.getByRole("button", { name: "关闭表单" }).click();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  // Existing document history restores directly; a release publication record can be undone directly.
  await page
    .locator("nav")
    .getByRole("button", { name: "版本发布", exact: true })
    .click();
  await page.getByRole("button", { name: /FocusPulse QA-1.0/ }).click();
  await page.getByRole("button", { name: "记录为已发布", exact: true }).click();
  await page.getByRole("button", { name: "撤销发布记录" }).click();
  await page
    .getByRole("button", { name: "记录为已发布", exact: true })
    .waitFor();
  assert.equal(await page.getByRole("alertdialog").count(), 0);
  // Native MCP edit appears without reloading an already-open browser page.
  await page.getByRole("button", { name: "工作区设置", exact: true }).click();
  await page.getByRole("heading", { name: "AI · MCP 连接" }).waitFor();
  const connection = await page.request
    .post(base + "/api/mcp/config")
    .then((r) => r.json());
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: { headers: connection.http.mcpServers.growmory.headers },
    }),
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /运营任务/ })
    .click();
  state = await page.request.get(base + "/api/state").then((r) => r.json());
  const result = await mcp.callTool({
    name: "save_tasks",
    arguments: {
      expectedRevision: state.revision,
      fields: { productId: "shiye", title: "通过 MCP 创建的任务" },
    },
  });
  assert.ok(!result.isError, JSON.stringify(result));
  await page
    .getByRole("button", { name: /^通过 MCP 创建的任务/ })
    .waitFor({ timeout: 7000 });
  await page.getByRole("button", { name: "工作区设置", exact: true }).click();
  await page.getByLabel("MCP 访问权限").selectOption("read");
  await page.waitForFunction(
    async () =>
      !(await fetch("/api/mcp/settings").then((r) => r.json())).allowWrites,
  );
  state = await page.request.get(base + "/api/state").then((r) => r.json());
  assert.equal(
    (
      await mcp.callTool({
        name: "save_tasks",
        arguments: {
          expectedRevision: state.revision,
          fields: { productId: "shiye", title: "不得写入" },
        },
      })
    ).isError,
    true,
  );
  await page.getByLabel("MCP 访问权限").selectOption("write");
  await page.waitForFunction(
    async () =>
      (await fetch("/api/mcp/settings").then((r) => r.json())).allowWrites,
  );
  await page.getByRole("switch", { name: "启用 MCP 连接" }).uncheck();
  await page.waitForFunction(
    async () =>
      !(await fetch("/api/mcp/settings").then((r) => r.json())).enabled,
  );
  await page.getByRole("switch", { name: "启用 MCP 连接" }).check();
  await page.waitForFunction(
    async () =>
      (await fetch("/api/mcp/settings").then((r) => r.json())).enabled,
  );
  await page.screenshot({
    path: ".screenshots/mcp-settings.png",
    fullPage: true,
  });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px settings overflow`,
    );
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator("nav")
    .getByRole("button", { name: "工作台", exact: true })
    .click();
  const size = await page
    .locator(".mini-product p")
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  assert.ok(parseInt(size) >= 14, `字号过小 ${size}`);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: Logo 上传/刷新持久化/格式校验，关闭无确认，发布记录与撤销无确认，真实 MCP 编辑自动同步到页面，权限开关，5 种宽度的 MCP 设置布局。",
  );
} finally {
  await mcp.close();
  await browser.close();
}
