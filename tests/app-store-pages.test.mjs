import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { openAppStorePages } from "../server/app-store-pages.mjs";
import { runTool } from "../server/mcp-tools.mjs";
import { buildCustomPagesAgentPrompt } from "../src/custom-pages-agent-prompt.ts";
import { buildPageOptimizationAgentPrompt } from "../src/page-optimization-agent-prompt.ts";

function createMockStore() {
  const initial = {
    products: [
      {
        id: "prod-1",
        name: "Growmory Test App",
        platform: "iOS",
        appStore: {
          appId: "1234567890",
          name: "Growmory Test App",
          bundleId: "com.growmory.test",
        },
      },
      {
        id: "prod-2",
        name: "No Apple App",
        platform: "macOS",
      },
    ],
    features: [],
    docs: [],
    releases: [],
    contents: [],
    tasks: [],
    assets: [],
  };
  return openStore(":memory:", initial);
}

test("自定义页面 (CPP) 本地草稿模式：创建、更新、加版本、加本地化、删除", async () => {
  const store = createMockStore();
  const mockApple = { status: () => ({ configured: false }) };
  const pages = openAppStorePages(store, mockApple);

  // 1. 列表初始为空
  const initial = await pages.listCustomProductPages("prod-1");
  assert.equal(initial.configured, false);
  assert.equal(initial.pages.length, 0);

  // 2. 创建自定义页面
  const created = await pages.createCustomProductPage("prod-1", {
    name: "夏日推广专属页",
    deepLink: "growmory://promo/summer",
    locale: "zh-Hans",
    promotionalText: "限时夏日效率大礼包",
  });
  assert.equal(created.pages.length, 1);
  const page = created.pages[0];
  assert.equal(page.name, "夏日推广专属页");
  assert.ok(page.url.includes("1234567890"));
  assert.equal(page.versions.length, 1);
  assert.equal(page.versions[0].deepLink, "growmory://promo/summer");
  assert.equal(page.versions[0].localizations.length, 1);
  assert.equal(page.versions[0].localizations[0].promotionalText, "限时夏日效率大礼包");

  // 3. 更新页面名称与可见性
  const updated = await pages.updateCustomProductPage("prod-1", page.id, {
    name: "夏日推广专属页 (更新)",
    visibleToAllUsers: false,
  });
  const updatedPage = updated.pages.find(p => p.id === page.id);
  assert.equal(updatedPage.name, "夏日推广专属页 (更新)");
  assert.equal(updatedPage.visibleToAllUsers, false);

  // 4. 新建版本
  const withNewVer = await pages.createCustomProductPageVersion("prod-1", page.id, {
    deepLink: "growmory://promo/summer/v2",
  });
  const targetPage = withNewVer.pages.find(p => p.id === page.id);
  assert.equal(targetPage.versions.length, 2);

  // 5. 添加本地化文案
  const ver2 = targetPage.versions[1];
  const withLoc = await pages.setCustomProductPageLocalization("prod-1", ver2.id, {
    locale: "en-US",
    promotionalText: "Limited Summer Productivity Pack",
  });
  const ver2Updated = withLoc.pages.find(p => p.id === page.id).versions.find(v => v.id === ver2.id);
  assert.equal(ver2Updated.localizations.length, 1);
  assert.equal(ver2Updated.localizations[0].locale, "en-US");

  // 6. 删除自定义页面
  const deleted = await pages.deleteCustomProductPage("prod-1", page.id);
  assert.equal(deleted.pages.length, 0);
});

test("产品页面优化 (PPO) 本地草稿模式：创建实验、启停、增删变体、删除实验", async () => {
  const store = createMockStore();
  const mockApple = { status: () => ({ configured: false }) };
  const pages = openAppStorePages(store, mockApple);

  // 1. 列表初始为空
  const initial = await pages.listPageOptimizations("prod-1");
  assert.equal(initial.configured, false);
  assert.equal(initial.experiments.length, 0);

  // 2. 创建实验
  const created = await pages.createPageOptimization("prod-1", {
    name: "应用图标风格 A/B 测试",
    trafficProportion: 50,
    platform: "IOS",
    treatments: [
      { name: "极简扁平风", appIconName: "AppIcon-Flat", locales: ["zh-Hans", "en-US"] },
    ],
  });
  assert.equal(created.experiments.length, 1);
  const exp = created.experiments[0];
  assert.equal(exp.name, "应用图标风格 A/B 测试");
  assert.equal(exp.trafficProportion, 50);
  assert.equal(exp.treatments.length, 1);
  assert.equal(exp.treatments[0].appIconName, "AppIcon-Flat");

  // 3. 启动与停止实验
  const started = await pages.updatePageOptimization("prod-1", exp.id, { started: true });
  assert.equal(started.experiments[0].state, "APPROVED");
  assert.ok(started.experiments[0].startDate);

  const stopped = await pages.updatePageOptimization("prod-1", exp.id, { started: false });
  assert.equal(stopped.experiments[0].state, "STOPPED");
  assert.ok(stopped.experiments[0].endDate);

  // 4. 添加变体方案
  const withTreatment = await pages.createOptimizationTreatment("prod-1", exp.id, {
    name: "质感立体风",
    appIconName: "AppIcon-3D",
    locales: ["zh-Hans"],
  });
  assert.equal(withTreatment.experiments[0].treatments.length, 2);
  const t2 = withTreatment.experiments[0].treatments[1];
  assert.equal(t2.name, "质感立体风");

  // 4.1 页面设计对比 (Design Preview) 与素材更新
  const design = await pages.getOptimizationDesign("prod-1", exp.id);
  assert.equal(design.experimentId, exp.id);
  assert.ok(design.control);
  assert.ok(design.control.screenshots.length > 0);
  assert.equal(design.treatments.length, 2);

  const updatedMedia = await pages.updateTreatmentMedia("prod-1", exp.id, t2.id, {
    screenshots: [
      { id: "custom-shot-1", url: "https://example.com/shot1.png", name: "特色测试首图" },
    ],
  });
  const t2Media = updatedMedia.treatments.find(t => t.id === t2.id);
  assert.equal(t2Media.screenshots.length, 1);
  assert.equal(t2Media.screenshots[0].name, "特色测试首图");

  // 4.2 数据分析看板 (Analytics) 计算
  const analytics = await pages.getOptimizationAnalytics("prod-1", exp.id);
  assert.equal(analytics.experimentId, exp.id);
  assert.ok(analytics.baseline.conversionRate > 0);
  assert.equal(analytics.treatments.length, 2);
  assert.ok(analytics.treatments[0].dailySeries.length === 14);
  assert.ok(analytics.treatments[0].confidenceInterval.length === 2);
  assert.ok(analytics.summary.length > 0);

  // 5. 删除变体方案
  const afterDelTreatment = await pages.deleteOptimizationTreatment("prod-1", t2.id);
  assert.equal(afterDelTreatment.experiments[0].treatments.length, 1);

  // 6. 删除实验
  const afterDelExp = await pages.deletePageOptimization("prod-1", exp.id);
  assert.equal(afterDelExp.experiments.length, 0);
});

test("App Store Connect API 联调模拟：CPP 与 PPO 远程调用与数据映射", async () => {
  const store = createMockStore();
  const calls = [];

  const fakeSession = {
    async paginate(path) {
      calls.push({ method: "GET", path });
      if (path.includes("/appCustomProductPages")) {
        return {
          data: [
            {
              id: "remote_cpp_1",
              type: "appCustomProductPages",
              attributes: {
                name: "ASA 搜索广告专用页",
                url: "https://apps.apple.com/app/id1234567890?ppid=remote_cpp_1",
                visibleToAllUsers: true,
              },
              relationships: {
                appCustomProductPageVersions: {
                  data: [{ id: "ver_remote_1", type: "appCustomProductPageVersions" }],
                },
              },
            },
          ],
          included: [
            {
              id: "ver_remote_1",
              type: "appCustomProductPageVersions",
              attributes: { version: "1.0", state: "APPROVED", deepLink: "growmory://feature" },
            },
          ],
        };
      }
      if (path.includes("/appCustomProductPageLocalizations")) {
        return {
          data: [
            {
              id: "loc_remote_1",
              attributes: { locale: "zh-Hans", promotionalText: "专业高效记录" },
            },
          ],
        };
      }
      if (path.includes("/appStoreVersionExperiments")) {
        return {
          data: [
            {
              id: "remote_exp_1",
              type: "appStoreVersionExperiments",
              attributes: {
                name: "首屏截屏痛点测试",
                trafficProportion: 50,
                state: "APPROVED",
                reviewRequired: true,
                platform: "IOS",
              },
              relationships: {
                appStoreVersionExperimentTreatments: {
                  data: [{ id: "tr_remote_1", type: "appStoreVersionExperimentTreatments" }],
                },
              },
            },
          ],
          included: [
            {
              id: "tr_remote_1",
              type: "appStoreVersionExperimentTreatments",
              attributes: { name: "痛点强调组" },
            },
          ],
        };
      }
      if (path.includes("/appStoreVersionExperimentTreatmentLocalizations")) {
        return {
          data: [{ id: "tr_loc_1", attributes: { locale: "zh-Hans" } }],
        };
      }
      return { data: [], included: [] };
    },
    async request(path, method, body) {
      calls.push({ method, path, body });
      if (path === "/v1/appCustomProductPages" && method === "POST") {
        return { data: { id: "new_remote_page", attributes: { name: body.data.attributes.name } } };
      }
      if (path === "/v1/appStoreVersionExperimentsV2" && method === "POST") {
        return { data: { id: "new_remote_exp", attributes: { name: body.data.attributes.name } } };
      }
      return { data: {} };
    },
  };

  const mockApple = {
    status: () => ({ configured: true }),
    session: () => fakeSession,
  };

  const pages = openAppStorePages(store, mockApple);

  // 1. 读取远程 CPP
  const cppList = await pages.listCustomProductPages("prod-1", { refresh: true });
  assert.equal(cppList.configured, true);
  assert.equal(cppList.pages.length, 1);
  assert.equal(cppList.pages[0].name, "ASA 搜索广告专用页");
  assert.equal(cppList.pages[0].versions[0].localizations[0].promotionalText, "专业高效记录");

  // 2. 读取远程 PPO
  const ppoList = await pages.listPageOptimizations("prod-1", { refresh: true });
  assert.equal(ppoList.configured, true);
  assert.equal(ppoList.experiments.length, 1);
  assert.equal(ppoList.experiments[0].name, "首屏截屏痛点测试");
  assert.equal(ppoList.experiments[0].treatments[0].name, "痛点强调组");
});

test("MCP 协议工具执行：读取与管理 CPP / PPO", async () => {
  const store = createMockStore();
  const mockApple = { status: () => ({ configured: false }) };
  const pagesManager = openAppStorePages(store, mockApple);

  const access = { enabled: true, allowWrites: true };

  // 1. get_custom_product_pages_context
  const cppCtx = await runTool(store, "get_custom_product_pages_context", { productId: "prod-1" }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(cppCtx.product.id, "prod-1");
  assert.ok(Array.isArray(cppCtx.pages));
  assert.ok(cppCtx.guide);

  // 2. manage_custom_product_page: create
  const createCppRes = await runTool(store, "manage_custom_product_page", {
    productId: "prod-1",
    action: "create",
    name: "MCP 创建的自定义页面",
    deepLink: "growmory://promo/mcp",
    locale: "zh-Hans",
    promotionalText: "由 AI Agent 规划生成的专属促销页面",
  }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(createCppRes.success, true);
  assert.equal(createCppRes.action, "create");
  assert.equal(createCppRes.pages[0].name, "MCP 创建的自定义页面");

  // 3. get_page_optimization_context
  const ppoCtx = await runTool(store, "get_page_optimization_context", { productId: "prod-1" }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(ppoCtx.product.id, "prod-1");
  assert.ok(Array.isArray(ppoCtx.experiments));
  assert.ok(ppoCtx.guide);

  // 4. manage_page_optimization_experiment: create
  const createPpoRes = await runTool(store, "manage_page_optimization_experiment", {
    productId: "prod-1",
    action: "create",
    name: "MCP A/B 测试实验",
    trafficProportion: 40,
    platform: "IOS",
    treatments: [
      { name: "变体 1 - 强调轻量极简", locales: ["zh-Hans"] },
    ],
  }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(createPpoRes.success, true);
  assert.equal(createPpoRes.action, "create");
  assert.equal(createPpoRes.experiments[0].name, "MCP A/B 测试实验");
  assert.equal(createPpoRes.experiments[0].trafficProportion, 40);
});

test("Agent 提示词生成器：中英双语输出与核心指引", () => {
  const prod = { id: "p1", name: "Growmory", appStore: { appId: "987654321" } };

  // CPP 提示词
  const cppZh = buildCustomPagesAgentPrompt(prod, "zh");
  assert.ok(cppZh.includes("Growmory"));
  assert.ok(cppZh.includes("987654321"));
  assert.ok(cppZh.includes("get_custom_product_pages_context"));
  assert.ok(cppZh.includes("manage_custom_product_page"));

  const cppEn = buildCustomPagesAgentPrompt(prod, "en");
  assert.ok(cppEn.includes("Custom Product Pages"));
  assert.ok(cppEn.includes("Growmory"));

  // PPO 提示词
  const ppoZh = buildPageOptimizationAgentPrompt(prod, "zh");
  assert.ok(ppoZh.includes("Growmory"));
  assert.ok(ppoZh.includes("A/B 测试"));
  assert.ok(ppoZh.includes("get_page_optimization_context"));
  assert.ok(ppoZh.includes("manage_page_optimization_experiment"));

  const ppoEn = buildPageOptimizationAgentPrompt(prod, "en");
  assert.ok(ppoEn.includes("Product Page Optimization"));
  assert.ok(ppoEn.includes("Growmory"));
});
