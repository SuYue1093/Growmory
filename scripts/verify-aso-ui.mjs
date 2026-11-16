import { chromium } from "@playwright/test";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

console.log("1. Seeding test product into http://127.0.0.1:5174 ...");
const stateRes = await page.request.get("http://127.0.0.1:5174/api/state");
const state = await stateRes.json();

await page.request.put("http://127.0.0.1:5174/api/state", {
  data: {
    revision: state.revision,
    data: {
      products: [
        {
          id: "firefly",
          name: "萤火待办",
          summary: "极简待办与习惯打卡应用",
          appId: "123456789",
          price: "免费",
          platform: "iPhone、iPad",
          website: "https://example.com",
          color: "blue",
          appStore: {
            appId: "123456789",
            name: "萤火待办",
            bundleId: "com.firefly.todo",
            syncedAt: new Date().toISOString(),
            versions: [
              {
                version: "1.0",
                versionId: "v1",
                platform: "IOS",
                appStoreState: "PREPARE_FOR_SUBMISSION",
              },
            ],
          },
        },
      ],
      docFolders: [],
      assets: [],
      assetFolders: [],
      docs: [
        {
          id: "doc-firefly",
          productId: "firefly",
          title: "核心功能与介绍",
          body: "萤火待办是一款轻量高效的日常待办清单与习惯养成工具。支持四象限待办、番茄钟、打卡提醒与数据统计。",
          status: "confirmed",
          history: [],
          updatedAt: new Date().toISOString(),
        },
      ],
      releases: [],
      contents: [],
      tasks: [],
    },
  },
});

console.log("2. Visiting ASO Page via URL directly ...");
await page.goto("http://localhost:5174/#page=products&product=firefly&tab=aso");
await page.locator('.sidebar-products button').filter({ hasText: '萤火待办' }).first().click();
await page.getByRole('button', { name: 'ASO优化', exact: true }).click();
await page.waitForTimeout(1000);

console.log("3. Verifying ASO Page with MCP Guide ...");
await page.locator(".aso-agent-guide").waitFor({ timeout: 10000 });

// Click "复制 ASO 任务指令"
console.log("   Clicking 复制 ASO 任务指令 ...");
await page.getByRole("button", { name: "复制 ASO 任务指令" }).click();
await page.waitForTimeout(400);

// Open details to show 3 steps and 6 MCP tools
console.log("   Opening details to reveal 3 steps and 6 MCP tools ...");
await page.locator(".aso-agent-guide details summary").click();
await page.waitForTimeout(600);

await page.screenshot({ path: ".screenshots/aso-page-mcp-guide.png" });
console.log("   ✓ Saved .screenshots/aso-page-mcp-guide.png");

console.log("\nAll browser verifications finished successfully!");
console.log("Page runtime errors:", errors.length === 0 ? "0 errors" : errors);

await browser.close();
process.exit(0);
