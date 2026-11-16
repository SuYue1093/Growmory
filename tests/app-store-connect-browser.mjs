import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = mkdtempSync(join(tmpdir(), "growmory-asc-ui-"));
const server = spawn(process.execPath, ["server/index.mjs"], { env: { ...process.env, NODE_ENV: "production", PORT: "5192", DB_PATH: join(dir, "db.sqlite") }, stdio: "pipe" });
let browser;
try {
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error("启动超时")), 10000); server.stdout.on("data", data => { if (String(data).includes("Growmory")) { clearTimeout(timer); resolve(); } }); });
  const base = "http://127.0.0.1:5192";
  assert.equal((await fetch(base + "/api/app-store-connect/settings").then(r => r.json())).configured, false);
  assert.equal((await fetch(base + "/api/app-store-connect/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ issuerId: "bad" }) })).status, 400);
  assert.equal((await fetch(base + "/api/app-store-connect/apps", { method: "POST" })).status, 409);
  assert.equal((await fetch(base + "/api/app-store-connect/settings", { method: "DELETE", headers: { Origin: "https://example.com" } })).status, 403);
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const config = { configured: false, issuerId: "", keyId: "", lastCheckedAt: null };
  await page.route("**/api/app-store-connect/**", async route => {
    const req = route.request();
    if (req.url().endsWith("/import")) { const state = await fetch(base + "/api/state").then(r => r.json()); return route.fulfill({ json: { ...state, total: 1, imported: 0 } }); }
    if (req.method() === "PUT") Object.assign(config, { configured: true, issuerId: req.postDataJSON().issuerId, keyId: req.postDataJSON().keyId });
    if (req.method() === "DELETE") Object.assign(config, { configured: false, issuerId: "", keyId: "", lastCheckedAt: null });
    if (req.url().endsWith("/apps")) return route.fulfill({ json: { ...config, lastCheckedAt: new Date().toISOString(), apps: [{ id: "123", name: "测试 App", bundleId: "com.test.app" }] } });
    await route.fulfill({ json: config });
  });
  await page.goto(base);
  assert.equal(await page.getByRole("heading", { name: "1. AI MCP 连接", exact: true }).count(), 1);
  await page.getByLabel("使用模式").selectOption("chat");
  assert.equal(await page.getByRole("button", { name: "复制连接提示词", exact: true }).count(), 0);
  await page.getByLabel("使用模式").selectOption("agent");
  assert.equal(await page.getByLabel("Issuer ID", { exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "复制连接提示词", exact: true }).count(), 0);
  await page.getByLabel("Issuer ID", { exact: true }).fill("12345678-1234-1234-1234-123456789abc");
  await page.getByLabel("Key ID", { exact: true }).fill("ABCDEFGHIJ");
  await page.getByLabel(".p8 私钥文件", { exact: true }).setInputFiles({ name: "AuthKey_ABCDEFGHIJ.p8", mimeType: "application/octet-stream", buffer: Buffer.from("mock private key") });
  await page.getByRole("button", { name: "连接并读取 App 列表", exact: true }).click();
  await page.getByText("测试 App", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "导入选中产品（0）" }).isDisabled(), true);
  await page.getByLabel("测试 App", { exact: true }).check();
  await page.getByRole("button", { name: "导入选中产品（1）" }).click();
  await page.getByRole("status").filter({ hasText: "导入完成" }).waitFor();
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  assert.equal(await page.getByLabel("测试 App", { exact: true }).isChecked(), true);
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "重新读取 App 列表", exact: true }).click();
  await page.getByText("测试 App", { exact: true }).waitFor();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `布局溢出 ${width}`);
  }
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "移除连接", exact: true }).click();
  await page.getByText("尚未连接", { exact: true }).waitFor();
  console.log("通过：真实 HTTP 校验/来源限制；浏览器模拟 Apple 保存、读取、移除及 1440/390/320px 布局");
} finally { await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true }); }
