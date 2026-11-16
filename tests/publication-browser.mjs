import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { fixture } from "./helpers/publication-fixture.mjs";
const dir = mkdtempSync(join(tmpdir(), "growmory-publication-ui-"));
const server = spawn(process.execPath, ["server/index.mjs"], { env: { ...process.env, NODE_ENV: "production", PORT: "5193", DB_PATH: join(dir, "db.sqlite") }, stdio: "pipe" });
const f = fixture();
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error("启动超时")), 10000); server.stdout.on("data", data => { if (String(data).includes("Growmory")) { clearTimeout(timer); resolve(); } }); });
  const base = "http://127.0.0.1:5193";
  const invalid = await fetch(base + "/api/app-store-connect/releases/missing/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: "IOS" }) });
  assert.equal(invalid.status, 404); assert.match((await invalid.json()).error, /版本不存在/);
  const denied = await fetch(base + "/api/app-store-connect/releases/missing/execute", { method: "POST", headers: { Origin: "https://example.com", "Content-Type": "application/json" }, body: "{}" });
  assert.equal(denied.status, 403);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  // Exercise real publication logic and SQLite through the browser; only Apple is simulated.
  await page.route("**/api/state", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: f.db.read() });
    const body = route.request().postDataJSON(); const result = f.db.write(body.data, body.revision);
    return route.fulfill({ status: result ? 200 : 409, json: result || { error: "工作区已更新" } });
  });
  await page.route("**/api/app-store-connect/releases/**", async route => {
    const action = new URL(route.request().url()).pathname.split("/").at(-1);
    const body = route.request().postDataJSON();
    try {
      const result = action === "status" ? await f.pub.status("r", body.platform) : action === "preview" ? await f.pub.preview("r", body) : await f.pub.execute("r", body.token);
      return route.fulfill({ json: result });
    } catch (e) { return route.fulfill({ status: e.status || 500, json: { error: e.message } }); }
  });
  await page.goto(base);
  await page.locator("nav").getByRole("button", { name: "版本发布", exact: true }).click();
  await page.getByRole("button", { name: /本机产品.*2.1/ }).click();
  await page.getByRole("heading", { name: "发布到 App Store", exact: true }).waitFor();
  const refresh = page.getByRole("button", { name: "读取商店状态与构建", exact: true });
  await refresh.click();
  await page.getByText("尚未创建商店版本", { exact: true }).waitFor();
  await page.getByLabel("选择已上传的构建").selectOption("b1");
  const preview = page.getByRole("button", { name: "预览商店资料写入", exact: true });
  await preview.click();
  await page.getByRole("region", { name: "发布操作预览" }).waitFor();
  assert.equal(f.state.writes.length, 0);
  await page.getByRole("button", { name: "取消操作", exact: true }).click();
  assert.equal(f.state.writes.length, 0);
  await preview.click();
  await page.getByRole("button", { name: "确认写入商店资料", exact: true }).click();
  await page.getByText("准备提交", { exact: true }).waitFor();
  assert.equal(f.state.notes.length, 2); assert.equal(f.state.build.id, "b1");
  await page.getByRole("button", { name: "预览提交审核", exact: true }).click();
  await page.getByRole("button", { name: "确认提交 Apple 审核", exact: true }).click();
  await page.getByText("等待审核", { exact: true }).waitFor();
  assert.ok(await preview.isDisabled());
  f.state.versions[0].attributes.appStoreState = "PENDING_DEVELOPER_RELEASE";
  await refresh.click(); await page.getByText("等待开发者发布", { exact: true }).waitFor();
  await page.getByRole("button", { name: "预览正式上架", exact: true }).click();
  await page.getByText(/确认后立即向 Apple 请求正式上架/).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `布局溢出 ${width}`);
  }
  await page.getByRole("button", { name: "确认正式上架", exact: true }).click();
  await page.getByText("处理中", { exact: true }).waitFor();
  assert.equal(f.db.read().data.releases[0].status, "preparing");
  f.state.versions[0].attributes.appStoreState = "READY_FOR_SALE";
  await refresh.click(); await page.getByText("已上架", { exact: true }).waitFor();
  assert.equal(f.db.read().data.releases[0].status, "published");
  assert.deepEqual(errors, []);
  console.log("通过：真实发布服务逻辑与 SQLite + 浏览器完整流程（Apple 模拟），取消不写入、审核、上架、发布状态回读与 1440/390/320px 布局；真实 HTTP 路由与来源校验");
} finally { await browser?.close(); server.kill(); f.cleanup(); rmSync(dir, { recursive: true, force: true }); }
