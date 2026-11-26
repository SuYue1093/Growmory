import { test } from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { openAppStoreEvents } from "../server/app-store-events.mjs";
import { openAppStorePages } from "../server/app-store-pages.mjs";
import { runTool } from "../server/mcp-tools.mjs";
import {
  buildInAppEventsAgentPrompt,
  buildInAppEventImagePrompt,
} from "../src/in-app-events-agent-prompt.ts";

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

test("App 内活动 (In-App Events) 本地草稿模式：创建、更新、加本地化、删本地化、删除活动", async () => {
  const store = createMockStore();
  const mockApple = { status: () => ({ configured: false }) };
  const events = openAppStoreEvents(store, mockApple);

  // 1. 列表初始为空
  const initial = await events.listInAppEvents("prod-1");
  assert.equal(initial.configured, false);
  assert.equal(initial.events.length, 0);

  // 2. 创建活动
  const created = await events.createInAppEvent("prod-1", {
    referenceName: "2026春季效率挑战赛",
    badge: "CHALLENGE",
    deepLink: "growmory://events/spring-2026",
    purchaseRequirement: "NO_COST_ASSOCIATED",
    purpose: "ATTRACT_NEW_USERS",
    priority: "HIGH",
    primaryLocale: "zh-Hans",
    publishStart: "2026-03-01T00:00:00Z",
    eventStart: "2026-03-05T00:00:00Z",
    eventEnd: "2026-03-25T00:00:00Z",
    name: "春季效率大挑战",
    shortDescription: "打卡赢取专属徽章与生产力大礼包",
    longDescription: "参与为期三周的习惯打卡挑战，解锁深度分析报告与高级模板。",
  });
  assert.equal(created.events.length, 1);
  const ev = created.events[0];
  assert.equal(ev.referenceName, "2026春季效率挑战赛");
  assert.equal(ev.badge, "CHALLENGE");
  assert.equal(ev.priority, "HIGH");
  assert.equal(ev.purpose, "ATTRACT_NEW_USERS");
  assert.equal(ev.deepLink, "growmory://events/spring-2026");
  assert.equal(ev.territorySchedules.length, 1);
  assert.equal(ev.localizations.length, 1);
  assert.equal(ev.localizations[0].name, "春季效率大挑战");
  assert.equal(ev.localizations[0].locale, "zh-Hans");

  // 3. 读取单个活动详情
  const single = await events.getInAppEvent("prod-1", ev.id);
  assert.equal(single.event.id, ev.id);
  assert.equal(single.event.referenceName, "2026春季效率挑战赛");

  // 4. 更新活动属性
  const updated = await events.updateInAppEvent("prod-1", ev.id, {
    referenceName: "2026春季效率挑战赛 (已更新)",
    priority: "NORMAL",
    badge: "SPECIAL_EVENT",
    eventState: "READY_FOR_REVIEW",
  });
  const updatedEv = updated.events.find(e => e.id === ev.id);
  assert.equal(updatedEv.referenceName, "2026春季效率挑战赛 (已更新)");
  assert.equal(updatedEv.priority, "NORMAL");
  assert.equal(updatedEv.badge, "SPECIAL_EVENT");
  assert.equal(updatedEv.eventState, "READY_FOR_REVIEW");

  // 5. 添加英语本地化
  const withEn = await events.setInAppEventLocalization("prod-1", ev.id, {
    locale: "en-US",
    name: "Spring Productivity Challenge",
    shortDescription: "Complete daily quests to win exclusive packs",
    longDescription: "Join the 3-week productivity challenge and unlock deep analytics.",
  });
  const evWithEn = withEn.events.find(e => e.id === ev.id);
  assert.equal(evWithEn.localizations.length, 2);
  const enLoc = evWithEn.localizations.find(l => l.locale === "en-US");
  assert.ok(enLoc);
  assert.equal(enLoc.name, "Spring Productivity Challenge");

  // 6. 更新已有语言本地化文案
  const withUpdatedZh = await events.setInAppEventLocalization("prod-1", ev.id, {
    locale: "zh-Hans",
    name: "春季效率极速营",
    shortDescription: "全新打卡挑战开启",
  });
  const evWithUpdatedZh = withUpdatedZh.events.find(e => e.id === ev.id);
  const zhLoc = evWithUpdatedZh.localizations.find(l => l.locale === "zh-Hans");
  assert.equal(zhLoc.name, "春季效率极速营");

  // 7. 删除英语本地化
  const afterDeleteLoc = await events.deleteInAppEventLocalization("prod-1", ev.id, enLoc.id);
  const evAfterDelLoc = afterDeleteLoc.events.find(e => e.id === ev.id);
  assert.equal(evAfterDelLoc.localizations.length, 1);
  assert.equal(evAfterDelLoc.localizations[0].locale, "zh-Hans");

  // 8. 删除活动
  const afterDelete = await events.deleteInAppEvent("prod-1", ev.id);
  assert.equal(afterDelete.events.length, 0);
});

test("App Store Connect API 联调模拟：In-App Events 远程接口调用与数据映射", async () => {
  const store = createMockStore();
  const calls = [];

  const fakeSession = {
    async paginate(path) {
      calls.push({ method: "GET", path });
      if (path.includes("/appEvents?include=localizations")) {
        return {
          data: [
            {
              id: "apple-event-101",
              type: "appEvents",
              attributes: {
                referenceName: "Summer Mega Update",
                badge: "MAJOR_UPDATE",
                eventState: "PUBLISHED",
                deepLink: "growmory://update/summer",
                purchaseRequirement: "NO_COST_ASSOCIATED",
                purpose: "KEEP_ACTIVE_USERS_INFORMED",
                priority: "HIGH",
                primaryLocale: "en-US",
                territorySchedules: [
                  {
                    territories: ["USA", "CHN"],
                    publishStart: "2026-06-01T00:00:00Z",
                    eventStart: "2026-06-10T00:00:00Z",
                    eventEnd: "2026-06-30T00:00:00Z",
                  },
                ],
              },
              relationships: {
                localizations: {
                  data: [{ type: "appEventLocalizations", id: "apple-loc-201" }],
                },
              },
            },
          ],
          included: [
            {
              id: "apple-loc-201",
              type: "appEventLocalizations",
              attributes: {
                locale: "en-US",
                name: "Summer Mega Update 2026",
                shortDescription: "Explore new AI features and faster syncing",
                longDescription: "A brand new update with massive performance improvements.",
              },
            },
          ],
        };
      }
      return { data: [] };
    },
    async request(path, method, body) {
      calls.push({ method, path, body });
      if (path === "/v1/appEvents" && method === "POST") {
        return {
          data: {
            id: "apple-event-new-1",
            type: "appEvents",
            attributes: body.data.attributes,
          },
        };
      }
      if (path === "/v1/appEventLocalizations" && method === "POST") {
        return {
          data: {
            id: "apple-loc-new-1",
            type: "appEventLocalizations",
            attributes: body.data.attributes,
          },
        };
      }
      return { data: {} };
    },
  };

  const mockApple = {
    status: () => ({ configured: true }),
    session: () => fakeSession,
  };

  const mockFetcher = async (url, opts) => {
    uploads.push({ url, opts });
    return { ok: true, status: 200 };
  };

  const events = openAppStoreEvents(store, mockApple, mockFetcher);

  // 1. 列表获取并映射
  const list = await events.listInAppEvents("prod-1", { refresh: true });
  assert.equal(list.configured, true);
  assert.equal(list.events.length, 1);
  assert.equal(list.events[0].id, "apple-event-101");
  assert.equal(list.events[0].referenceName, "Summer Mega Update");
  assert.equal(list.events[0].badge, "MAJOR_UPDATE");
  assert.equal(list.events[0].localizations.length, 1);
  assert.equal(list.events[0].localizations[0].name, "Summer Mega Update 2026");

  // 2. 远程创建活动
  await events.createInAppEvent("prod-1", {
    referenceName: "秋季创作者挑战",
    badge: "COMPETITION",
    locale: "zh-Hans",
    name: "创作者大赛",
    shortDescription: "发布作品赢大奖",
  });

  const postEventCall = calls.find(c => c.method === "POST" && c.path === "/v1/appEvents");
  assert.ok(postEventCall);
  assert.equal(postEventCall.body.data.attributes.referenceName, "秋季创作者挑战");
  assert.equal(postEventCall.body.data.attributes.badge, "COMPETITION");

  const postLocCall = calls.find(c => c.method === "POST" && c.path === "/v1/appEventLocalizations");
  assert.ok(postLocCall);
  assert.equal(postLocCall.body.data.attributes.name, "创作者大赛");
});

test("App Store Connect 审核提交与素材上传：Review Submissions 流程与 appEventScreenshots 通道", async () => {
  const store = createMockStore();
  const calls = [];
  const uploads = [];

  const fakeSession = {
    async paginate(path) {
      calls.push({ method: "GET", path });
      if (path.includes("/appEvents?include=localizations")) {
        return {
          data: [
            {
              id: "apple-event-submit-1",
              type: "appEvents",
              attributes: {
                referenceName: "Duo 双屏适配上线",
                badge: "MAJOR_UPDATE",
                eventState: "DRAFT",
                primaryLocale: "zh-Hans",
              },
              relationships: {
                localizations: {
                  data: [{ type: "appEventLocalizations", id: "apple-loc-submit-1" }],
                },
              },
            },
          ],
          included: [
            {
              id: "apple-loc-submit-1",
              type: "appEventLocalizations",
              attributes: {
                locale: "zh-Hans",
                name: "全面适配 iPhone Duo",
              },
            },
          ],
        };
      }
      if (path.includes("/appEventScreenshots")) {
        return { data: [] };
      }
      if (path.includes("/reviewSubmissions")) {
        return { data: [] };
      }
      return { data: [] };
    },
    async request(path, method, body) {
      calls.push({ method, path, body });
      if (path.includes("/reviewSubmissions") && method === "GET") {
        return { data: [] };
      }
      if (path === "/v1/reviewSubmissions" && method === "POST") {
        return {
          data: {
            id: "rev-sub-mock-1",
            type: "reviewSubmissions",
            attributes: { platform: "IOS", state: "READY_FOR_REVIEW" },
          },
        };
      }
      if (path === "/v1/reviewSubmissionItems" && method === "POST") {
        return {
          data: {
            id: "rev-item-mock-1",
            type: "reviewSubmissionItems",
            attributes: { state: "READY_FOR_REVIEW" },
          },
        };
      }
      if (path === "/v1/reviewSubmissions/rev-sub-mock-1" && method === "PATCH") {
        return {
          data: {
            id: "rev-sub-mock-1",
            type: "reviewSubmissions",
            attributes: { submitted: true, state: "WAITING_FOR_REVIEW" },
          },
        };
      }
      if (path === "/v1/appEventScreenshots" && method === "POST") {
        return {
          data: {
            id: "shot-mock-1",
            type: "appEventScreenshots",
            attributes: {
              uploadOperations: [
                {
                  method: "PUT",
                  url: "https://mock-upload.apple.com/part1",
                  length: 10,
                  offset: 0,
                  requestHeaders: [{ name: "Content-Type", value: "image/png" }],
                },
              ],
            },
          },
        };
      }
      if (path === "/v1/appEventScreenshots/shot-mock-1" && method === "PATCH") {
        return {
          data: {
            id: "shot-mock-1",
            type: "appEventScreenshots",
            attributes: { uploaded: true },
          },
        };
      }
      if (path === "/v1/appEventScreenshots/shot-mock-1" && method === "GET") {
        return {
          data: {
            id: "shot-mock-1",
            type: "appEventScreenshots",
            attributes: {
              assetDeliveryState: { state: "COMPLETE" },
              imageAsset: {
                templateUrl: "https://apple-cdn.mock/{w}x{h}{c}.{f}",
              },
            },
          },
        };
      }
      return { data: {} };
    },
  };

  const mockApple = {
    status: () => ({ configured: true }),
    session: () => fakeSession,
  };

  const mockFetcher = async (url, opts) => {
    uploads.push({ url, opts });
    return { ok: true, status: 200 };
  };

  const events = openAppStoreEvents(store, mockApple, mockFetcher);

  // 1. 初始化列表
  await events.listInAppEvents("prod-1", { refresh: true });

  // 2. 模拟上传卡片截图 (Base64 PNG)
  const dummyPngBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  await events.setInAppEventLocalization("prod-1", "apple-event-submit-1", {
    localizationId: "apple-loc-submit-1",
    locale: "zh-Hans",
    name: "全面适配 iPhone Duo (带图)",
    cardMediaUrl: dummyPngBase64,
  });

  const shotPostCall = calls.find(c => c.method === "POST" && c.path === "/v1/appEventScreenshots");
  assert.ok(shotPostCall, "应该调用 /v1/appEventScreenshots 预留上传通道");
  assert.equal(shotPostCall.body.data.attributes.appEventAssetType, "EVENT_CARD");
  assert.equal(shotPostCall.body.data.relationships.appEventLocalization.data.id, "apple-loc-submit-1");

  const shotPatchCall = calls.find(c => c.method === "PATCH" && c.path === "/v1/appEventScreenshots/shot-mock-1");
  assert.ok(shotPatchCall, "上传后应该调用 PATCH appEventScreenshots 标记 uploaded: true");

  // 3. 提交审核流程 (Review Submission)
  const submitResult = await events.submitInAppEventForReview("prod-1", "apple-event-submit-1");
  assert.equal(submitResult.submitted, true);
  assert.equal(submitResult.reviewSubmissionId, "rev-sub-mock-1");

  const subPostCall = calls.find(c => c.method === "POST" && c.path === "/v1/reviewSubmissions");
  assert.ok(subPostCall, "应该创建或获取 reviewSubmissions");

  const subItemCall = calls.find(c => c.method === "POST" && c.path === "/v1/reviewSubmissionItems");
  assert.ok(subItemCall, "应该将活动添加至 reviewSubmissionItems");
  assert.equal(subItemCall.body.data.relationships.appEvent.data.id, "apple-event-submit-1");

  const subPatchCall = calls.find(c => c.method === "PATCH" && c.path === "/v1/reviewSubmissions/rev-sub-mock-1");
  assert.ok(subPatchCall, "应该正式提交审核单 submitted: true");
});

test("本地保存 vs 提交至 App Store Connect (不直接提交审核)", async () => {
  const store = createMockStore();
  const appleCalls = [];

  const fakeSession = {
    async paginate(path) {
      appleCalls.push({ method: "GET", path });
      if (path.includes("/appEvents?include=localizations")) {
        return {
          data: [
            {
              id: "apple-event-duo-1",
              type: "appEvents",
              attributes: {
                referenceName: "全面适配 iPhone Duo",
                badge: "MAJOR_UPDATE",
                eventState: "DRAFT",
                primaryLocale: "zh-Hans",
                territorySchedules: [
                  { territories: ["USA", "CHN"], publishStart: "2026-12-01T00:00:00Z" }
                ]
              },
              relationships: { localizations: { data: [{ type: "appEventLocalizations", id: "loc-duo-1" }] } },
            },
          ],
          included: [
            { id: "loc-duo-1", type: "appEventLocalizations", attributes: { locale: "zh-Hans", name: "Duo 双屏排程" } },
          ],
        };
      }
      return { data: [] };
    },
    async request(path, method, body) {
      appleCalls.push({ method, path, body });
      if (path.includes("/appEvents/apple-event-duo-1") && (!method || method === "GET")) {
        return {
          data: {
            id: "apple-event-duo-1",
            type: "appEvents",
            attributes: {
              referenceName: "全面适配 iPhone Duo",
              territorySchedules: [{ territories: ["USA", "CHN"] }],
            },
          },
        };
      }
      if (path.includes("/appEvents/apple-event-duo-1") && method === "PATCH") {
        return {
          data: { id: "apple-event-duo-1", type: "appEvents", attributes: body.data.attributes },
        };
      }
      return { data: {} };
    },
  };

  const mockApple = {
    status: () => ({ configured: true }),
    session: () => fakeSession,
  };

  const events = openAppStoreEvents(store, mockApple);

  // 1. 初始化
  await events.listInAppEvents("prod-1", { refresh: true });
  const initialAppleCallCount = appleCalls.length;

  // 2. 本地保存（不提交到 App Store Connect）
  const savedLocal = await events.saveInAppEventLocal("prod-1", "apple-event-duo-1", {
    referenceName: "本地草稿修改",
    localization: { locale: "zh-Hans", name: "本地草稿标题" },
  });
  const duoLocal = savedLocal.events.find(e => e.id === "apple-event-duo-1");
  assert.equal(duoLocal.referenceName, "本地草稿修改");
  assert.equal(duoLocal.localizations[0].name, "本地草稿标题");
  // 必须保证本地保存没有向 Apple 发起任何额外网络调用！
  assert.equal(appleCalls.length, initialAppleCallCount, "saveInAppEventLocal 严禁调用 Apple 接口");

  // 3. 提交至 App Store Connect（同步活动属性与本地化，但不直接提交审核）
  const syncedApple = await events.submitInAppEventToApple("prod-1", "apple-event-duo-1", {
    referenceName: "全面适配 iPhone Duo (线上版)",
    localization: { locale: "zh-Hans", name: "iPhone Duo 生产力体验" },
  });
  assert.ok(syncedApple.message.includes("App Store Connect"));
  const patchEventCall = appleCalls.find(c => c.method === "PATCH" && c.path === "/v1/appEvents/apple-event-duo-1");
  assert.ok(patchEventCall, "submitInAppEventToApple 应该调用 PATCH 更新 Apple 活动");
  assert.equal(patchEventCall.body.data.attributes.referenceName, "全面适配 iPhone Duo (线上版)");

  // 校验：严禁调用 reviewSubmissions 审核提交接口
  const reviewSubCall = appleCalls.find(c => c.path.includes("reviewSubmissions") && c.body?.data?.attributes?.submitted);
  assert.equal(reviewSubCall, undefined, "提交至 App Store Connect 严禁直接触发正式审核");
});

test("MCP 协议工具执行：读取与管理 App 内活动 (In-App Events)", async () => {
  const store = createMockStore();
  const mockApple = { status: () => ({ configured: false }) };
  const pagesManager = openAppStorePages(store, mockApple);

  const access = { enabled: true, allowWrites: true };

  // 1. get_in_app_events_context
  const ctx = await runTool(store, "get_in_app_events_context", { productId: "prod-1" }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(ctx.product.id, "prod-1");
  assert.ok(Array.isArray(ctx.events));
  assert.ok(ctx.guide);

  // 2. manage_in_app_event: create
  const createRes = await runTool(store, "manage_in_app_event", {
    productId: "prod-1",
    action: "create",
    referenceName: "MCP 自动化测试活动",
    badge: "PREMIERE",
    purpose: "ATTRACT_NEW_USERS",
    deepLink: "growmory://events/mcp-test",
    locale: "zh-Hans",
    name: "新版功能首映礼",
    shortDescription: "首发限时尝鲜新特性",
    longDescription: "了解最新推出的 AI 写作助手与深度分析看板。",
  }, access, { apple: mockApple, appStorePages: pagesManager });

  assert.equal(createRes.success, true);
  assert.equal(createRes.action, "create");
  assert.equal(createRes.events[0].referenceName, "MCP 自动化测试活动");
  assert.equal(createRes.events[0].badge, "PREMIERE");
  assert.equal(createRes.events[0].localizations[0].name, "新版功能首映礼");

  const eventId = createRes.events[0].id;

  // 3. get_in_app_events_context with eventId
  const detailCtx = await runTool(store, "get_in_app_events_context", { productId: "prod-1", eventId }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.ok(detailCtx.event);
  assert.equal(detailCtx.event.id, eventId);
  assert.equal(detailCtx.event.referenceName, "MCP 自动化测试活动");

  // 4. manage_in_app_event: update
  const updateRes = await runTool(store, "manage_in_app_event", {
    productId: "prod-1",
    action: "update",
    eventId,
    referenceName: "MCP 自动化测试活动 (已更新)",
    priority: "HIGH",
  }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(updateRes.events[0].referenceName, "MCP 自动化测试活动 (已更新)");
  assert.equal(updateRes.events[0].priority, "HIGH");

  // 5. manage_in_app_event: set_localization (add en-US)
  const setLocRes = await runTool(store, "manage_in_app_event", {
    productId: "prod-1",
    action: "set_localization",
    eventId,
    locale: "en-US",
    name: "Feature Premiere Ceremony",
    shortDescription: "Experience all-new features first",
    longDescription: "Discover latest AI assistant and analytics dashboards.",
  }, access, { apple: mockApple, appStorePages: pagesManager });
  const updatedEv = setLocRes.events.find(e => e.id === eventId);
  assert.equal(updatedEv.localizations.length, 2);

  // 6. manage_in_app_event: delete
  const deleteRes = await runTool(store, "manage_in_app_event", {
    productId: "prod-1",
    action: "delete",
    eventId,
  }, access, { apple: mockApple, appStorePages: pagesManager });
  assert.equal(deleteRes.events.length, 0);
});

test("In-App Events Agent 提示词生成器：中英双语输出与核心指引", () => {
  const prod = { id: "p1", name: "Growmory", appStore: { appId: "987654321" } };

  // 中文提示词
  const zhPrompt = buildInAppEventsAgentPrompt(prod, "zh");
  assert.ok(zhPrompt.includes("Growmory"));
  assert.ok(zhPrompt.includes("987654321"));
  assert.ok(zhPrompt.includes("get_in_app_events_context"));
  assert.ok(zhPrompt.includes("manage_in_app_event"));
  assert.ok(zhPrompt.includes("CHALLENGE"));

  // 英文提示词
  const enPrompt = buildInAppEventsAgentPrompt(prod, "en");
  assert.ok(enPrompt.includes("In-App Events"));
  assert.ok(enPrompt.includes("Growmory"));
  assert.ok(enPrompt.includes("987654321"));
  assert.ok(enPrompt.includes("get_in_app_events_context"));
  assert.ok(enPrompt.includes("manage_in_app_event"));
  assert.ok(enPrompt.includes("save_docs"));

  // 完善具体活动提示词（带 event 和 direction，包含严禁写入资料库的约束）
  const refinePromptZh = buildInAppEventsAgentPrompt(prod, "zh", {
    event: {
      id: "ev-1001",
      referenceName: "秋季创作者大赛",
      badge: "COMPETITION",
      purpose: "ATTRACT_NEW_USERS",
    },
    direction: "针对流失用户召回，重点宣传新功能与体验大礼包",
  });
  assert.ok(refinePromptZh.includes("ev-1001"));
  assert.ok(refinePromptZh.includes("秋季创作者大赛"));
  assert.ok(refinePromptZh.includes("针对流失用户召回"));
  assert.ok(refinePromptZh.includes("严禁写入资料库"));
  assert.ok(refinePromptZh.includes("save_docs"));
  assert.ok(refinePromptZh.includes("manage_in_app_event"));

  const refinePromptEn = buildInAppEventsAgentPrompt(prod, "en", {
    event: {
      id: "ev-1001",
      referenceName: "Autumn Contest",
      badge: "COMPETITION",
    },
    direction: "Focus on lapsing user reactivation",
  });
  assert.ok(refinePromptEn.includes("ev-1001"));
  assert.ok(refinePromptEn.includes("Autumn Contest"));
  assert.ok(refinePromptEn.includes("Focus on lapsing user reactivation"));
  assert.ok(refinePromptEn.includes("DO NOT WRITE TO DOCS"));
  assert.ok(refinePromptEn.includes("save_docs"));
  assert.ok(refinePromptEn.includes("manage_in_app_event"));
});

test("In-App Events AI 生图提示词生成器：16:9 卡片与 9:16 详情页多引擎输出与合规规则", () => {
  // 1. 16:9 卡片图像提示词
  const cardPrompt = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "春季习惯养成打卡挑战",
    referenceName: "2026春季挑战赛",
    badge: "CHALLENGE",
    mediaType: "card",
    styleKey: "3d_clay",
    lang: "zh",
  });

  assert.equal(cardPrompt.mediaType, "card");
  assert.equal(cardPrompt.aspectRatio, "16:9");
  assert.ok(cardPrompt.resolution.includes("1920 x 1080"));
  assert.ok(cardPrompt.prompt.includes("【创作主题"));
  assert.ok(cardPrompt.prompt.includes("【任务目标】"));
  assert.ok(cardPrompt.prompt.includes("【构图与规格要求】"));
  assert.ok(cardPrompt.prompt.includes("春季习惯养成打卡挑战"));
  assert.ok(cardPrompt.prompt.includes("16:9"));
  assert.ok(cardPrompt.prompt.includes("严禁文字与符号"));
  assert.ok(cardPrompt.prompt.includes("严禁界面与图标"));
  assert.ok(cardPrompt.midjourneyPrompt.includes("--ar 16:9"));
  assert.ok(cardPrompt.midjourneyPrompt.includes("--no text"));
  assert.ok(cardPrompt.midjourneyPrompt.includes("trophy"));
  assert.ok(cardPrompt.stableDiffusion.positive.includes("3D"));
  assert.ok(cardPrompt.stableDiffusion.negative.includes("text"));
  assert.ok(cardPrompt.dallePrompt.includes("16:9"));
  assert.ok(cardPrompt.appleGuidelines.some(g => g.includes("严禁添加任何文字")));

  // 2. 9:16 详情页图像提示词
  const detailPrompt = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "Spring Mega Overhaul 2.0",
    badge: "MAJOR_UPDATE",
    mediaType: "detail",
    styleKey: "cyber_tech",
    lang: "en",
  });

  assert.equal(detailPrompt.mediaType, "detail");
  assert.equal(detailPrompt.aspectRatio, "9:16");
  assert.ok(detailPrompt.resolution.includes("1080 x 1920"));
  assert.ok(detailPrompt.prompt.includes("[Theme Context"));
  assert.ok(detailPrompt.prompt.includes("[Objective]"));
  assert.ok(detailPrompt.prompt.includes("[Composition & Technical Constraints]"));
  assert.ok(detailPrompt.prompt.includes("Spring Mega Overhaul 2.0"));
  assert.ok(detailPrompt.prompt.includes("9:16"));
  assert.ok(detailPrompt.prompt.includes("Strictly No Text"));
  assert.ok(detailPrompt.prompt.includes("Strictly No UI or Icons"));
  assert.ok(detailPrompt.midjourneyPrompt.includes("--ar 9:16"));
  assert.ok(detailPrompt.midjourneyPrompt.includes("--no text"));
  assert.ok(detailPrompt.midjourneyPrompt.includes("crystalline core"));
  assert.ok(detailPrompt.stableDiffusion.positive.includes("cyberpunk"));
  assert.ok(detailPrompt.stableDiffusion.negative.includes("text"));
  assert.ok(detailPrompt.dallePrompt.includes("Strict Rule"));
  assert.ok(detailPrompt.appleGuidelines.some(g => g.includes("Strictly NO text")));

  // 3. 有参考图 (hasReference: true / 图生图 / 垫图) 分流测试
  const cardPromptRefZh = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "春季习惯养成打卡挑战",
    badge: "CHALLENGE",
    mediaType: "card",
    hasReference: true,
    lang: "zh",
  });
  assert.equal(cardPromptRefZh.hasReference, true);
  assert.ok(cardPromptRefZh.prompt.includes("忠实还原参考图"));
  assert.ok(cardPromptRefZh.prompt.includes("屏幕外严禁额外文字"));
  assert.ok(cardPromptRefZh.prompt.includes("活动卡片主视觉图"));

  const detailPromptRefEn = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "Spring Mega Overhaul 2.0",
    badge: "MAJOR_UPDATE",
    mediaType: "detail",
    referenceImages: ["screenshot.png"],
    lang: "en",
  });
  assert.equal(detailPromptRefEn.hasReference, true);
  assert.ok(detailPromptRefEn.prompt.includes("Faithful UI Preservation"));
  assert.ok(detailPromptRefEn.prompt.includes("No Extra Text Outside the Screen"));
  assert.ok(detailPromptRefEn.prompt.includes("In-App Event full-screen detail artwork"));

  // 验证 App Store Connect 官方 Badge (LIVE_EVENT 及 LIVE_STREAM 兼容映射)
  const livePrompt = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "Online Concert",
    badge: "LIVE_EVENT",
    mediaType: "card",
  });
  assert.ok(livePrompt.prompt.includes("直播活动 (Live Event)"));

  const legacyLivePrompt = buildInAppEventImagePrompt({
    productName: "Growmory",
    eventTitle: "Online Concert",
    badge: "LIVE_STREAM",
    mediaType: "card",
  });
  assert.ok(legacyLivePrompt.prompt.includes("直播活动 (Live Event)"));
});
