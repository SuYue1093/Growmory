import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1100 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const current = await page.request
  .get("http://127.0.0.1:5174/api/state")
  .then((r) => r.json());
await page.request.put("http://127.0.0.1:5174/api/state", {
  data: {
    revision: current.revision,
    data: {
      products: [
        { id: "firefly", name: "FocusPulse", summary: "测试产品", appId: "", price: "", platform: "iOS", website: "", color: "blue" },
        { id: "shiye", name: "拾页", summary: "测试产品", appId: "", price: "", platform: "iOS", website: "", color: "purple" },
      ],
      docFolders: [],
      assets: [],
      assetFolders: [],
      docs: ["firefly", "shiye"].map(id => ({ id: "doc-" + id, productId: id, title: "产品介绍", body: "待确认的测试产品资料。", status: "pending", history: [], updatedAt: new Date().toISOString() })),
      releases: [], contents: [], tasks: [],
    },
  },
});
await page.goto("http://127.0.0.1:5174");
await page.getByRole("heading", { name: "工作台" }).waitFor();
await page.screenshot({ path: ".screenshots/desktop.png", fullPage: true });
// Persisted document edits, approval and history restore.
await page
  .locator("nav")
  .getByRole("button", { name: "产品", exact: true })
  .click();
await page.getByRole("button", { name: /拾页.*篇文档/ }).click();
await page.getByRole("button", { name: "产品资料", exact: true }).click();
await page.getByRole("button", { name: "确认资料", exact: true }).click();
await page.getByText("已确认", { exact: true }).first().waitFor();
await page.getByRole("button", { name: "编辑文档", exact: true }).click();
const original = await page.getByLabel("文档正文").innerText();
await page.getByLabel("文档正文").fill(original + "\n\nQA 新增说明");
await page.getByRole("button", { name: "保存资料", exact: true }).click();
await page.getByRole("button", { name: "文档历史" }).click();
await page.getByRole("button", { name: "恢复版本" }).first().click();
await page.getByRole("button", { name: "确认资料", exact: true }).waitFor();
await page.waitForFunction(
  () =>
    !document.querySelector(".markdown")?.textContent?.includes("QA 新增说明"),
);
assert.equal(
  await page
    .locator(".markdown")
    .innerText()
    .then((t) => t.includes("QA 新增说明")),
  false,
);
await page.reload();
assert.match(page.url(), /product=shiye/);
// Create and prepare a release.
await page.locator("nav").getByRole("button", { name: "工作台", exact: true }).click();
await page.getByRole("button", { name: "新建发布", exact: true }).click();
await page.getByLabel("版本号").fill("QA-1.0");
await page
  .getByLabel("本次更新")
  .fill("新增：产品发布准备\n优化：内容管理体验\n修复：已知问题");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page.getByRole("heading", { name: "FocusPulse QA-1.0" }).first().waitFor();
await page.getByRole("button", { name: "手动编写" }).click();
await page
  .getByLabel(/^更新说明/)
  .fill("本次新增产品发布准备，优化内容管理，修复已知问题。");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page.getByRole("button", { name: "确认这份说明" }).click();
await page.getByRole("button", { name: "生成发布草稿" }).click();
await page
  .getByRole("status")
  .filter({ hasText: "尚未配置 AI 服务" })
  .waitFor();
await page.getByRole("button", { name: "4 推广与归档", exact: true }).click();
await page.getByRole("button", { name: "添加内容", exact: true }).click();
await page.getByLabel("标题").fill("QA 发布故事");
await page.getByLabel(/^正文/).fill("记录本次产品更新，准备与用户分享。");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page.getByRole("button", { name: "QA 发布故事" }).waitFor();
await page.getByRole("button", { name: "添加关联任务" }).click();
await page.getByLabel("要做什么").fill("QA 审核发布草稿");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page
  .locator("nav")
  .getByRole("button", { name: /待办/ })
  .click();
await page.getByRole("button", { name: "完成任务", exact: true }).click();
await page.getByRole("button", { name: "撤销完成", exact: true }).click();
await page.getByRole("button", { name: "完成任务", exact: true }).waitFor();
await page.reload();
await page
  .locator("nav")
  .getByRole("button", { name: /待办/ })
  .click();
await page.getByRole("button", { name: /^QA 审核发布草稿/ }).waitFor();
await page.getByRole("button", { name: "内容", exact: true }).click();
await page.getByRole("button", { name: "QA 发布故事" }).click();
await page.getByLabel("状态").selectOption("published");
await page.getByLabel("发布链接").fill("https://example.com/post");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page.getByRole("button", { name: /已发布/ }).click();
await page.getByRole("button", { name: "QA 发布故事" }).waitFor();
await page.getByLabel("搜索工作区").fill("QA 发布故事");
await page.locator(".search-result").waitFor();
await page.getByRole("button", { name: "清空搜索" }).click();
// Review a document proposal using an explicit test fixture; this is not an AI call.
const proposalState = await page.request
  .get("http://127.0.0.1:5174/api/state")
  .then((r) => r.json());
const release = proposalState.data.releases[0];
const doc = proposalState.data.docs.find((d) => d.id === "doc-firefly");
doc.status = "confirmed";
release.proposals = [
  {
    docId: doc.id,
    before: doc.body,
    body: doc.body + "\n\nQA 已审核的版本说明",
    reason: "测试文档差异审核",
    applied: false,
  },
];
await page.request.put("http://127.0.0.1:5174/api/state", {
  data: proposalState,
});
await page.reload();
await page.locator("nav").getByRole("button", { name: "工作台", exact: true }).click();
await page.getByRole("button", { name: "全部发布", exact: true }).click();
await page.getByRole("button", { name: /FocusPulse QA-1.0/ }).click();
await page.getByRole("button", { name: "4 推广与归档", exact: true }).click();
await page.getByRole("button", { name: /测试文档差异审核/ }).click();
await page.getByRole("button", { name: "修改建议正文" }).click();
await page.getByLabel("建议正文").fill(doc.body + "\n\nQA 人工修订后应用");
await page.getByRole("button", { name: "保存", exact: true }).click();
await page.getByRole("button", { name: /测试文档差异审核/ }).click();
await page.getByRole("button", { name: "确认并应用" }).click();
await page.getByRole("status").filter({ hasText: "文档已更新" }).waitFor();
const applied = await page.request
  .get("http://127.0.0.1:5174/api/state")
  .then((r) => r.json());
assert.ok(
  applied.data.docs
    .find((d) => d.id === doc.id)
    .body.includes("QA 人工修订后应用"),
);
assert.equal(
  applied.data.docs.find((d) => d.id === doc.id).history[0].body,
  doc.body,
);
await page.screenshot({ path: ".screenshots/release.png", fullPage: true });
// Responsive routes must not overflow.
for (const width of [1440, 1024, 768, 390, 320]) {
  await page.setViewportSize({ width, height: 950 });
  for (const route of ["工作台", "产品", "内容", "待办"]) {
    if (width <= 640) {
      await page.getByRole("button", { name: "打开导航" }).click();
    }
    await page
      .locator("nav")
      .getByRole("button", {
        name: route === "待办" ? /待办/ : route,
        exact: route !== "待办",
      })
      .click();
    await page.waitForTimeout(100);
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${width}px ${route} horizontal overflow`,
    );
  }
  if (width === 390) {
    if (width <= 640)
      await page.getByRole("button", { name: "打开导航" }).click();
    await page
      .locator("nav")
      .getByRole("button", { name: "工作台", exact: true })
      .click();
    await page.waitForTimeout(350);
    await page.screenshot({ path: ".screenshots/mobile.png", fullPage: true });
  }
}
// Verify narrow detail layouts, beyond the list pages.
await page.setViewportSize({ width: 320, height: 950 });
await page.getByRole("button", { name: "打开导航" }).click();
await page.locator("nav").getByRole("button", { name: "工作台", exact: true }).click();
await page.getByRole("button", { name: "全部发布", exact: true }).click();
await page.getByRole("button", { name: /FocusPulse QA-1.0/ }).click();
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "320px release detail overflow",
);
await page.getByRole("button", { name: "打开导航" }).click();
await page
  .locator("nav")
  .getByRole("button", { name: "产品", exact: true })
  .click();
await page.getByRole("button", { name: /FocusPulse.*篇文档/ }).click();
await page.getByRole("button", { name: "产品资料", exact: true }).click();
assert.ok(
  await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  "320px document detail overflow",
);
assert.deepEqual(errors, []);
console.log(
  "PASS: 文档确认/历史恢复、版本/说明审核、未配置 AI 提示、关联内容与任务、完成/撤销/刷新持久化、搜索、5 种宽度与 4 个入口无横向溢出；浏览器无脚本错误。",
);
await browser.close();
