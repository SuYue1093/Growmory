import { designFiles, designFilePath, designResources } from "./aso-design-resources.mjs";
import { importCreatorReport, exportCreatorReport, syncWechatReport } from './creator-reports.mjs';
import { recurringReminders } from "./recurring-reminders.mjs";
import { importX, xUploadBodyLimit } from './x-import.mjs';
import { importReddit } from './social-import.mjs';
import { operationsContext, saveOperationPost, deleteOperationPosts } from './operations.mjs';
import { importXiaohongshu } from "./xiaohongshu-import.mjs";
import { socialContext, saveSocial, linkMarketing } from "./social-analytics.mjs";
import { generateRelease, selectReleaseDocs } from './release-ai.mjs';
import { generateTaskFromQuote } from './report-task-ai.mjs';
import http from "node:http";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { resolve, extname, dirname } from "node:path";
import { openStore } from "./store.mjs";
import { importAppleProducts } from "./product-import.mjs";
const initial = JSON.parse(
  readFileSync(new URL("./seed.json", import.meta.url)),
);
const dbPath = process.env.DB_PATH || fileURLToPath(new URL("../data/growmory.sqlite", import.meta.url));
const store = openStore(dbPath, initial);
import { setupInstructions, setupScriptPath } from "./mcp-setup.mjs";
import { openMcpAccess } from "./mcp-access.mjs";
import { createMcpServer, runTool } from "./mcp-tools.mjs";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
const access = openMcpAccess(
  process.env.MCP_CONFIG_PATH ||
  (process.env.DB_PATH && process.env.DB_PATH !== ":memory:"
    ? resolve(dirname(process.env.DB_PATH), "mcp-access.json")
    : fileURLToPath(new URL("../data/mcp-access.json", import.meta.url))),
);
import { openAiConfig } from "./ai-config.mjs";
const aiConfigPath =
  process.env.AI_CONFIG_PATH ||
  resolve(
    dirname(
      process.env.DB_PATH && process.env.DB_PATH !== ":memory:"
        ? process.env.DB_PATH
        : fileURLToPath(new URL("../data/growmory.sqlite", import.meta.url)),
    ),
    "ai-config.json",
  );
const aiConfig = openAiConfig(aiConfigPath);
const executeTool = async (name, args) => {
  const result = await runTool(store, name, args, access.read(), { aiConfig, apple, aso, appStorePages });
  access.used();
  return result;
};
const connectionConfig = (includeToken = false) => {
  const value = access.read();
  return {
    enabled: value.enabled,
    allowWrites: value.allowWrites,
    lastUsedAt: value.lastUsedAt,
    url: `http://127.0.0.1:${process.env.PORT || 5173}/mcp`,
    stdio: {
      mcpServers: {
        growmory: {
          command: process.execPath,
          args: [fileURLToPath(new URL("./mcp-stdio.mjs", import.meta.url))],
          env: {
            GROWMORY_URL: `http://127.0.0.1:${process.env.PORT || 5173}`,
            MCP_CONFIG_PATH:
              process.env.MCP_CONFIG_PATH ||
              (process.env.DB_PATH && process.env.DB_PATH !== ":memory:"
                ? resolve(dirname(process.env.DB_PATH), "mcp-access.json")
                : fileURLToPath(
                  new URL("../data/mcp-access.json", import.meta.url),
                )),
          },
        },
      },
    },
    ...(includeToken
      ? {
        http: {
          mcpServers: {
            growmory: {
              url: `http://127.0.0.1:${process.env.PORT || 5173}/mcp`,
              headers: { Authorization: `Bearer ${value.token}` },
            },
          },
        },
      }
      : {}),
  };
};
import { openAppleConnection, AppleConnectionError } from "./app-store-connect.mjs";
const apple = openAppleConnection(
  process.env.ASC_CONFIG_PATH || resolve(dirname(process.env.DB_PATH && process.env.DB_PATH !== ":memory:" ? process.env.DB_PATH : fileURLToPath(new URL("../data/growmory.sqlite", import.meta.url))), "app-store-connect.json"),
);
import { openAso } from "./aso.mjs";
import { optimizeAsoKeywords, generateAsoAi } from "./aso-ai.mjs";
import { getOrInitAsoMedia, fetchStoreAsoMedia, diagnoseAsoMedia, readStoreCreativePlacements, readMediaVersions, readLocalizedMedia, submitLocalizedMediaOrder, submitLocalizedMedia, saveMediaDraftGroup } from "./aso-media.mjs";
import {
  parseAppStoreInput,
  lookupPublicApp,
  searchPublicApps,
  suggestPublicKeywords,
  getPublicRatings,
  getPublicSimilar,
  getPublicTopCharts
} from './app-store-public.mjs';
import { openPublication } from "./publication.mjs";
const publication = openPublication(store, apple);
import { openProductInsights } from "./product-insights.mjs";
const insights = openProductInsights(store, apple);
import { openExchangeRate } from "./exchange-rate.mjs";
const latestExchangeRate = openExchangeRate();
const aso = openAso(store, apple);
import { openAppStorePages } from "./app-store-pages.mjs";
const appStorePages = openAppStorePages(store, apple);
const production = process.env.NODE_ENV === "production";
const vite = production
  ? null
  : await (
    await import("vite")
  ).createServer({
    server: {
      middlewareMode: true,
      hmr: { port: Number(process.env.PORT || 5173) + 1000 },
    },
    appType: "spa",
  });
const send = (res, code, data) => {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
async function body(req, maxBytes = Infinity, sizeError = "上传内容过大，请选择不超过 8 MB 的 Excel 文件") {
  const decoder = new StringDecoder("utf8");
  let raw = "", bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw Object.assign(Error(sizeError), { status: 413 });
    raw += decoder.write(chunk);
  }
  raw += decoder.end();
  return JSON.parse(raw || "{}");
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (
      !["localhost", "127.0.0.1"].includes(
        new URL(`http://${req.headers.host}`).hostname,
      )
    )
      return send(res, 403, { error: "仅允许本机访问" });
    if (req.method === "GET" && url.pathname === "/api/aso/design-resources") {
      return send(res, 200, designResources());
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/aso/design-resources/")) {
      const file = url.pathname.slice("/api/aso/design-resources/".length);
      if (!designFiles.some(item => item.file === file || item.previewFile === file || item.sourceFile === file)
          || !existsSync(designFilePath(file))) {
        return send(res, 404, { error: "设计素材未导入" });
      }
      if (file.endsWith(".svg")) {
        res.writeHead(200, {
          "Content-Type": "image/svg+xml",
          "Content-Disposition": `attachment; filename="${file}"`,
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "X-Content-Type-Options": "nosniff",
        });
      } else {
        res.writeHead(200, { "Content-Type": file.endsWith(".png") ? "image/png" : file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".jpg") ? "image/jpeg" : file.endsWith(".webp") ? "image/webp" : "font/ttf" });
      }
      return createReadStream(designFilePath(file)).pipe(res);
    }
    if (url.pathname === "/mcp" || url.pathname === "/api/mcp/execute") {
      if (
        req.headers.origin &&
        ![
          `http://localhost:${process.env.PORT || 5173}`,
          `http://127.0.0.1:${process.env.PORT || 5173}`,
        ].includes(req.headers.origin)
      )
        return send(res, 403, { error: "不允许的来源" });
      if (!access.authorized(req.headers.authorization))
        return send(res, 401, { error: "MCP 连接密钥无效" });
      if (!access.read().enabled)
        return send(res, 403, { error: "MCP 连接已关闭" });
      if (req.method !== "POST")
        return send(res, 405, { error: "请使用 MCP POST 请求" });
      const payload = await body(req);
      if (url.pathname === "/api/mcp/execute") {
        try {
          return send(res, 200, await executeTool(payload.name, payload.args));
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
      const mcp = createMcpServer(async (name, args) =>
        executeTool(name, args),
      );
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on("close", () => {
        void transport.close();
        void mcp.close();
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, payload);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (
        !["GET", "HEAD"].includes(req.method) &&
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`
      )
        return send(res, 403, { error: "仅允许本机工作台访问" });
      if (url.pathname === "/api/exchange-rate/usd-cny" && req.method === "GET")
        return send(res, 200, await latestExchangeRate());
      if (url.pathname.startsWith("/api/app-store/")) {
        try {
          if (req.method !== "POST") return send(res, 405, { error: "请使用 POST 请求" });
          const payload = await body(req);
          if (url.pathname === "/api/app-store/parse") {
            return send(res, 200, { parsed: parseAppStoreInput(payload?.input) });
          }
          if (url.pathname === "/api/app-store/lookup") {
            return send(res, 200, await lookupPublicApp(payload));
          }
          if (url.pathname === "/api/app-store/search") {
            return send(res, 200, await searchPublicApps(payload));
          }
          if (url.pathname === "/api/app-store/suggest") {
            return send(res, 200, await suggestPublicKeywords(payload));
          }
          if (url.pathname === "/api/app-store/ratings") {
            return send(res, 200, await getPublicRatings(payload));
          }
          if (url.pathname === "/api/app-store/similar") {
            return send(res, 200, await getPublicSimilar(payload));
          }
          if (url.pathname === "/api/app-store/top") {
            return send(res, 200, await getPublicTopCharts(payload));
          }
          return send(res, 404, { error: "未知的 App Store 接口" });
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
      if (url.pathname === "/api/aso/optimize-keywords" && req.method === "POST") {
        const payload = await body(req);
        return send(res, 200, optimizeAsoKeywords(payload || {}));
      }
      if (url.pathname === "/api/aso/ai-generate" && req.method === "POST") {
        const payload = await body(req);
        const { productId, seedKeywords = [], locale = "zh-Hans" } = payload;
        const data = store.read().data;
        const product = data.products.find(p => p.id === productId);
        if (!product) return send(res, 404, { error: "产品不存在" });
        const docs = data.docs.filter(d => d.productId === productId && d.status === "confirmed");
        try {
          const result = await generateAsoAi({
            product,
            docs,
            seedKeywords,
            locale,
            ai: aiConfig.get()
          });
          return send(res, 200, result);
        } catch (error) {
          return send(res, error.status || 500, { error: error.message });
        }
      }
      if (url.pathname.startsWith("/api/aso/media/")) {
        const parts = url.pathname.replace("/api/aso/media/", "").split("/");
        const productId = decodeURIComponent(parts[0]);
        const subAction = parts[1] || "";
        try {
          if (!productId) return send(res, 400, { error: "缺少产品 ID" });
          if (subAction === "diagnose" && req.method === "POST") {
            const diag = await diagnoseAsoMedia(store, productId, aiConfig);
            return send(res, 200, diag);
          }
          if (subAction === "draft" && req.method === "POST") {
            if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
              return send(res, 403, { error: "请从 Growmory 页面保存草稿。" });
            }
            const appId = store.read().data.products.find(product => product.id === productId)?.appStore?.appId;
            const input = await body(req, 48 * 1024 * 1024, "图片草稿内容过大。");
            if (!appId || typeof input?.versionId !== 'string' || !input.versionId ||
                typeof input.locale !== 'string' || !input.locale) return send(res, 400, { error: "缺少 App Store 草稿目标" });
            saveMediaDraftGroup(store, productId, appId, input);
            return send(res, 200, { success: true });
          }
          if (["versions", "localized", "submit-order", "submit-media"].includes(subAction)) {
            const product = store.read().data.products.find(p => p.id === productId);
            const appId = product?.appStore?.appId;
            if (!appId) return send(res, 400, { error: "当前产品未关联 App Store App" });
            if (subAction === "versions" && req.method === "GET") return send(res, 200, await readMediaVersions(apple.session(), appId));
            if (subAction === "localized" && req.method === "GET") {
              const versionId = url.searchParams.get("versionId");
              const locale = url.searchParams.get("locale");
              const result = await readLocalizedMedia(apple.session(), appId, versionId, locale);
              const insights = locale && store.productInsights(productId);
              const copy = insights?.appId === appId && insights.aso?.localizations?.find(item => item.versionId === versionId && item.locale === locale)?.fields;
              const draftGroups = locale ? store.asoMediaDraft(productId, appId, versionId, locale) : [];
              return send(res, 200, { ...result, name: copy?.name, subtitle: copy?.subtitle, draftGroups });
            }
            if (subAction === "submit-order" && req.method === "POST") {
              const bodyData = await body(req, 10000);
              const result = await submitLocalizedMediaOrder(
                apple.session(), appId, bodyData,
              );
              const version = product.appStore?.versions?.find(v => v.id === bodyData?.versionId)?.version ||
                store.productInsights(productId)?.aso?.localizations?.find(l => l.versionId === bodyData?.versionId)?.version || '';
              store.asoEvent(productId, {
                kind: "media",
                appId,
                locale: bodyData?.locale,
                versionId: bodyData?.versionId,
                version,
                changes: [{ type: "order", group: bodyData?.group }],
                outcome: "success",
              });
              return send(res, 200, result);
            }
            if (subAction === "submit-media" && req.method === "POST") {
              if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) {
                return send(res, 403, { error: "请从 Growmory 页面提交素材。" });
              }
              const input = await body(req, 48 * 1024 * 1024, "本次图片提交内容过大，请分批提交。");
              const submittedDrafts = store.asoMediaDraft(productId, appId, input?.versionId, input?.locale)
                .filter(draft => Array.isArray(input?.changes) && input.changes.some(change =>
                  change?.type === draft.type && change.group === draft.group &&
                  JSON.stringify(change.items) === JSON.stringify(draft.items)));
              const verified = await submitLocalizedMedia(
                apple.session(), appId, input,
              );
              const remainingDrafts = store.asoMediaDraft(productId, appId, input.versionId, input.locale);
              const cleared = remainingDrafts.filter(draft => submittedDrafts.some(submitted =>
                JSON.stringify(submitted) === JSON.stringify(draft)));
              if (cleared.length) store.asoMediaDraft(productId, appId, input.versionId, input.locale,
                cleared.map(({ type, group }) => ({ type, group })));
              const version = product.appStore?.versions?.find(v => v.id === input?.versionId)?.version ||
                store.productInsights(productId)?.aso?.localizations?.find(l => l.versionId === input?.versionId)?.version || '';
              store.asoEvent(productId, {
                kind: "media",
                appId,
                locale: input?.locale,
                versionId: input?.versionId,
                version,
                changes: (input?.changes || []).map(c => ({ type: c.type, group: c.group, count: c.items?.length || 0 })),
                outcome: "success",
              });
              return send(res, 200, { ...verified, draftGroups: store.asoMediaDraft(productId, appId, input.versionId, input.locale) });
            }
            return send(res, 405, { error: "请求方法不支持" });
          }
          if (subAction === "creative-placements" && req.method === "GET") {
            const product = store.read().data.products.find(p => p.id === productId);
            if (!product?.appStore?.appId) return send(res, 400, { error: "当前产品未关联 App Store App" });
            return send(res, 200, await readStoreCreativePlacements(apple.session(), product.appStore.appId));
          }
          if (subAction === "sync-store" && req.method === "POST") {
            const data = store.read().data;
            const product = data.products.find(p => p.id === productId);
            if (!product?.appStore?.appId) return send(res, 400, { error: "当前产品未关联 App Store App" });
            const storeData = await fetchStoreAsoMedia(product.appStore.appId);
            const current = await getOrInitAsoMedia(store, productId);
            current.searchResult.iconUrl = storeData.iconUrl || current.searchResult.iconUrl;
            current.searchResult.title = storeData.title || current.searchResult.title;
            current.searchResult.rating = storeData.rating;
            current.searchResult.ratingsCount = storeData.ratingsCount;
            if (storeData.iphone.length > 0) {
              current.searchResult.screenshots = storeData.iphone.slice(0, 3).map(s => s.url);
              current.platformScreenshots.iphone = storeData.iphone;
            }
            if (storeData.ipad.length > 0) {
              current.platformScreenshots.ipad = storeData.ipad;
            }
            current.updatedAt = new Date().toISOString();
            store.asoMedia(productId, current);
            return send(res, 200, current);
          }
          if (req.method === "GET") {
            return send(res, 200, await getOrInitAsoMedia(store, productId));
          }
          if (req.method === "PUT") {
            const payload = await body(req);
            payload.productId = productId;
            payload.updatedAt = new Date().toISOString();
            store.asoMedia(productId, payload);
            return send(res, 200, payload);
          }
        } catch (e) {
          return send(res, e.status || 500, { error: e.message });
        }
      }
      if (url.pathname.startsWith("/api/app-store-connect/")) {
        try {
          const insightsRoute = url.pathname.match(/^\/api\/app-store-connect\/insights\/([^/]+)\/(latest|sync|analyze)$/);
          if (insightsRoute && req.method === "POST") {
            const id = decodeURIComponent(insightsRoute[1]);
            if (insightsRoute[2] === "latest") {
              const value = insights.latest(id);
              if (value?.checkedAt && req.headers["x-growmory-insights-checked-at"] === value.checkedAt) {
                res.writeHead(204);
                return res.end();
              }
              return send(res, 200, value);
            }
            return send(res, 200, insightsRoute[2] === "analyze" ? await insights.analyze(id, await body(req)) : await insights.sync(id));
          }
          const asoRoute = url.pathname.match(/^\/api\/app-store-connect\/aso\/([^/]+)\/(targets|current|read|analyze|preview|execute|history|research|reports|apply-report|delete-report|toggle-read|save-plan|clear-drafts|prepare-localization)$/);
          if (asoRoute && req.method === "POST") return send(res, 200, await aso[asoRoute[2]](decodeURIComponent(asoRoute[1]), await body(req)));
          const releaseRoute = url.pathname.match(/^\/api\/app-store-connect\/releases\/([^/]+)\/(status|preview|execute|create-version)$/);
          if (releaseRoute && req.method === "POST") {
            const input = await body(req);
            const releaseId = decodeURIComponent(releaseRoute[1]);
            const action = releaseRoute[2];
            const result = action === "status" ? await publication.status(releaseId, input.platform)
              : action === "preview" ? await publication.preview(releaseId, input)
                : action === "execute" ? await publication.execute(releaseId, input.token)
                  : await publication.createVersion(releaseId, input);
            return send(res, 200, result);
          }
          const customPagesRoute = url.pathname.match(/^\/api\/app-store-connect\/custom-pages\/([^/]+)\/(list|create|update|delete|create-version|set-localization)$/);
          if (customPagesRoute && (req.method === "POST" || req.method === "GET")) {
            const productId = decodeURIComponent(customPagesRoute[1]);
            const action = customPagesRoute[2];
            const input = req.method === "POST" ? await body(req) : {};
            if (action === "list") return send(res, 200, await appStorePages.listCustomProductPages(productId, input));
            if (action === "create") return send(res, 200, await appStorePages.createCustomProductPage(productId, input));
            if (action === "update") return send(res, 200, await appStorePages.updateCustomProductPage(productId, input.pageId, input));
            if (action === "delete") return send(res, 200, await appStorePages.deleteCustomProductPage(productId, input.pageId));
            if (action === "create-version") return send(res, 200, await appStorePages.createCustomProductPageVersion(productId, input.pageId, input));
            if (action === "set-localization") return send(res, 200, await appStorePages.setCustomProductPageLocalization(productId, input.versionId, input));
          }
          const pageOptRoute = url.pathname.match(/^\/api\/app-store-connect\/page-optimization\/([^/]+)\/(list|create|update|delete|add-treatment|delete-treatment|design|analytics|treatment-media)$/);
          if (pageOptRoute && (req.method === "POST" || req.method === "GET")) {
            const productId = decodeURIComponent(pageOptRoute[1]);
            const action = pageOptRoute[2];
            const input = req.method === "POST" ? await body(req) : {};
            if (action === "list") return send(res, 200, await appStorePages.listPageOptimizations(productId, input));
            if (action === "create") return send(res, 200, await appStorePages.createPageOptimization(productId, input));
            if (action === "update") return send(res, 200, await appStorePages.updatePageOptimization(productId, input.experimentId, input));
            if (action === "delete") return send(res, 200, await appStorePages.deletePageOptimization(productId, input.experimentId));
            if (action === "add-treatment") return send(res, 200, await appStorePages.createOptimizationTreatment(productId, input.experimentId, input));
            if (action === "delete-treatment") return send(res, 200, await appStorePages.deleteOptimizationTreatment(productId, input.treatmentId));
            if (action === "design") return send(res, 200, await appStorePages.getOptimizationDesign(productId, input.experimentId || url.searchParams.get("experimentId")));
            if (action === "treatment-media") return send(res, 200, await appStorePages.updateTreatmentMedia(productId, input.experimentId, input.treatmentId, input));
            if (action === "analytics") return send(res, 200, await appStorePages.getOptimizationAnalytics(productId, input.experimentId || url.searchParams.get("experimentId")));
          }
          if (url.pathname === "/api/app-store-connect/import" && req.method === "POST")
            return send(res, 200, await importAppleProducts(store, apple, (await body(req)).appIds));
          if (url.pathname === "/api/app-store-connect/settings") {
            if (req.method === "GET") return send(res, 200, apple.status());
            if (req.method === "PUT") return send(res, 200, apple.save(await body(req)));
            if (req.method === "DELETE") return send(res, 200, apple.disconnect());
          }
          if (url.pathname === "/api/app-store-connect/apps" && req.method === "POST")
            return send(res, 200, await apple.apps());
          const versionsRoute = url.pathname.match(/^\/api\/app-store-connect\/apps\/([0-9]+)\/versions$/);
          if (versionsRoute && req.method === "POST") return send(res, 200, await apple.versions(versionsRoute[1]));
          return send(res, 405, { error: "不支持的连接操作" });
        } catch (e) {
          if (e instanceof AppleConnectionError) return send(res, e.status, { error: e.message });
          throw e;
        }
      }
      if (url.pathname === "/api/operations") {
        try {
          if (req.method === "GET") return send(res, 200, operationsContext(store));
          if (req.method === "POST") {
            const input = await body(req);
            if (!input.deleteIds && (!input.id || Object.keys(input.fields || {}).some(k => k !== 'status'))) return send(res, 400, { error: '仅支持管理已有潜在帖子' });
            return send(res, 200, input.deleteIds ? deleteOperationPosts(store, input) : saveOperationPost(store, input));
          }
          return send(res, 405, { error: "不支持的操作" });
        } catch (e) { return send(res, e.message.includes('已更新') ? 409 : 400, { error: e.message }); }
      }
      const creatorReport = url.pathname.match(/^\/api\/social-analytics\/(wechat|juejin)-(import|export|sync)$/);
      if (creatorReport) {
        const [, platform, action] = creatorReport;
        try {
          if (action === 'import' && req.method === 'POST') return send(res, 200, await importCreatorReport(store, platform, await body(req, 12 * 1024 * 1024 + 10000)));
          if (platform === 'wechat' && action === 'sync' && req.method === 'POST') {
            const input = await body(req, 4096);
            const credential = typeof input.accountId === 'string' ? store.wechatCredential(input.accountId) : null;
            if (!credential) throw Error('请先在自媒体账号中配置公众号 AppID 和 AppSecret');
            return send(res, 200, await syncWechatReport(store, { ...input, ...credential }));
          }
          if (action === 'export' && req.method === 'GET') {
            const file = await exportCreatorReport(store, platform, url.searchParams.get('accountId'), url.searchParams.get('template') === '1');
            res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': `attachment; filename="${platform}-report.xlsx"`, 'Cache-Control': 'no-store' });
            return res.end(Buffer.from(file));
          }
          return send(res, 405, { error: '不支持的操作' });
        } catch (e) { return send(res, e.status || (e.message.includes('已更新') ? 409 : 400), { error: e.message }); }
      }
      if (url.pathname === "/api/social-analytics/x-import" && req.method === "POST") {
        try { return send(res, 200, await importX(store, await body(req, xUploadBodyLimit, "上传内容过大，请选择不超过 50 MB 的 ZIP 文件"))); }
        catch (e) { return send(res, e.status || (e.message.includes('已更新') ? 409 : 400), { error: e.message }); }
      }
      if (url.pathname === "/api/social-analytics/reddit-import" && req.method === "POST") {
        try { return send(res, 200, await importReddit(store, await body(req, 12 * 1024 * 1024 + 10000, "上传内容过大，请选择不超过 9 MB 的 ZIP 文件"))); }
        catch (e) { return send(res, e.message.includes('已更新') ? 409 : 400, { error: e.message }); }
      }
      if (url.pathname === "/api/social-analytics/xiaohongshu-import" && req.method === "POST") {
        try { return send(res, 200, await importXiaohongshu(store, await body(req, 12 * 1024 * 1024 + 10000))); }
        catch (e) { return send(res, e.message.includes('已更新') ? 409 : 400, { error: e.message }); }
      }
      if (url.pathname === "/api/social-analytics") {
        try {
          if (req.method === "GET") {
            const context = socialContext(store);
            const wechatAppIds = Object.fromEntries(context.accounts.filter(a => a.platform === 'wechat')
              .map(a => [a.id, store.wechatCredential(a.id)?.appId]).filter(([, appId]) => appId));
            return send(res, 200, { ...context, wechatAppIds });
          }
          if (req.method === "POST") {
            const input = await body(req);
            if (input.snapshots !== undefined) return send(res, 400, { error: '请通过平台导出文件更新数据' });
            return send(res, 200, input.marketingLink ? linkMarketing(store, input) : saveSocial(store, input));
          }
          return send(res, 405, { error: "不支持的操作" });
        } catch (e) { return send(res, e.message.includes('已更新') ? 409 : 400, { error: e.message }); }
      }
      if (url.pathname === "/api/recurring-reminders" && req.method === "GET")
        return send(res, 200, recurringReminders(store));
      if (url.pathname === "/api/state" && req.method === "GET")
        return send(res, 200, store.read());
      if (url.pathname === "/api/state" && req.method === "PUT") {
        const b = await body(req);
        let saved;
        try {
          const { socialAnalytics } = store.read().data;
          saved = store.write(b.restoreBackup === true ? b.data : { ...b.data, socialAnalytics }, b.revision);
        } catch {
          return send(res, 400, {
            error: "资料格式不正确或包含无效链接，未保存。",
          });
        }
        return send(
          res,
          saved ? 200 : 409,
          saved || { error: "工作区已在其他窗口更新，请刷新后再编辑。" },
        );
      }
      if (url.pathname === "/api/assets/append" && req.method === "POST") {
        const payload = await body(req);
        const { assets = [], folders = [], revision } = payload;
        let result;
        try {
          result = store.appendAssets(assets, folders, revision);
        } catch (err) {
          return send(res, 400, {
            error: err.message || "素材格式不正确，未保存。",
          });
        }
        return send(
          res,
          result ? 200 : 409,
          result || { error: "工作区已在其他窗口更新，请刷新后再编辑。" },
        );
      }
      const assetFileRoute = url.pathname.match(/^\/api\/assets\/file\/([^/]+)$/);
      if (assetFileRoute && (req.method === "GET" || req.method === "HEAD")) {
        const assetId = decodeURIComponent(assetFileRoute[1]);
        let fileInfo = store.getAssetFile ? store.getAssetFile(assetId) : null;
        if (!fileInfo) {
          const asset = store.read()?.data?.assets?.find((a) => a.id === assetId);
          if (asset && typeof asset.url === "string" && asset.url.startsWith("data:")) {
            const commaIdx = asset.url.indexOf(",");
            if (commaIdx > 5) {
              const meta = asset.url.slice(5, commaIdx);
              const payload = asset.url.slice(commaIdx + 1);
              const mime = meta.split(";")[0] || asset.fileType || "image/png";
              const isBase64 = meta.split(";").includes("base64");
              let buffer;
              if (isBase64) {
                buffer = Buffer.from(payload, "base64");
              } else {
                try {
                  buffer = Buffer.from(decodeURIComponent(payload), "utf8");
                } catch {
                  buffer = Buffer.from(payload, "utf8");
                }
              }
              fileInfo = { buffer, mime };
            }
          }
        }
        if (!fileInfo) {
          return send(res, 404, { error: "素材文件不存在" });
        }
        res.writeHead(200, {
          "Content-Type": fileInfo.mime || "image/png",
          "Cache-Control": "public, max-age=31536000, immutable",
        });
        if (req.method === "HEAD") {
          res.end();
          return;
        }
        if (fileInfo.filePath) {
          createReadStream(fileInfo.filePath).pipe(res);
        } else if (fileInfo.buffer) {
          res.end(fileInfo.buffer);
        } else {
          res.end();
        }
        return;
      }
      if (url.pathname === "/api/mcp/setup" && req.method === "GET")
        return send(res, 200, setupInstructions(connectionConfig()));
      if (url.pathname === "/api/mcp/setup-script" && req.method === "GET") {
        const source = readFileSync(setupScriptPath, "utf8").replace(
          /^const DEFAULT_URL = .*;$/m,
          `const DEFAULT_URL = ${JSON.stringify(`http://127.0.0.1:${process.env.PORT || 5173}`)};`,
        );
        res.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Content-Disposition": 'attachment; filename="growmory-connect.mjs"',
          "Cache-Control": "no-store",
        });
        res.end(source);
        return;
      }
      if (url.pathname === "/api/mcp/settings" && req.method === "GET")
        return send(res, 200, connectionConfig());
      if (url.pathname === "/api/mcp/settings" && req.method === "PUT") {
        const patch = await body(req);
        if (
          typeof patch.enabled !== "boolean" ||
          typeof patch.allowWrites !== "boolean"
        )
          return send(res, 400, { error: "连接配置格式不正确" });
        access.update({
          enabled: patch.enabled,
          allowWrites: patch.allowWrites,
        });
        return send(res, 200, connectionConfig());
      }
      if (url.pathname === "/api/mcp/config" && req.method === "POST")
        return send(res, 200, connectionConfig(true));
      if (url.pathname === "/api/mcp/rotate" && req.method === "POST") {
        access.rotate();
        return send(res, 200, connectionConfig());
      }
      if (url.pathname === "/api/ai/status" && req.method === "GET") {
        const ai = aiConfig.get();
        return send(res, 200, {
          configured: ai.configured,
          model: ai.model,
          baseUrl: ai.baseUrl,
        });
      }
      if (url.pathname === "/api/ai/settings") {
        if (req.method === "GET") return send(res, 200, aiConfig.status());
        if (req.method === "PUT") {
          try {
            return send(res, 200, aiConfig.save(await body(req)));
          } catch (e) {
            return send(res, 400, { error: e.message });
          }
        }
        if (req.method === "DELETE") return send(res, 200, aiConfig.clear());
        return send(res, 405, { error: "不支持的操作" });
      }
      if (url.pathname === "/api/ai/test" && req.method === "POST") {
        try {
          const result = await aiConfig.testConnection(await body(req));
          return send(res, result.ok ? 200 : 400, result);
        } catch (e) {
          return send(res, 500, { ok: false, error: e.message });
        }
      }
      if (url.pathname === "/api/ai/generate-task" && req.method === "POST") {
        try {
          const payload = await body(req);
          const { quote, productName, reportTitle } = payload || {};
          const result = await generateTaskFromQuote({
            quote,
            productName,
            reportTitle,
            ai: aiConfig.get(),
          });
          return send(res, 200, result);
        } catch (error) {
          if (error.status) return send(res, error.status, { error: error.message });
          return send(res, 500, { error: error.message });
        }
      }
      if (url.pathname === "/api/generate" && req.method === "POST") {
        const { releaseId, locales, onlyNotes, docIds, platform } = await body(req);
        const data = store.read().data;
        const release = data.releases.find((x) => x.id === releaseId);
        if (!release) return send(res, 404, { error: "版本不存在" });
        try {
          const changes = (platform && release.platformDetails?.[platform]?.changes) || release.changes;
          const releaseForAi = { ...release, changes };
          const docs = onlyNotes ? [] : selectReleaseDocs(data, releaseForAi, docIds);
          return send(res, 200, await generateRelease({ release: releaseForAi, docs, locales, onlyNotes, ai: aiConfig.get() }));
        } catch (error) {
          if (error.status) return send(res, error.status, { error: error.message });
          throw error;
        }
      }
      return send(res, 404, { error: "接口不存在" });
    }
    if (vite) return vite.middlewares(req, res);
    const root = resolve("dist");
    let file = resolve(root, "." + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + "/") && file !== root)
      return send(res, 403, { error: "无权访问" });
    if (!existsSync(file) || statSync(file).isDirectory())
      file = resolve(root, "index.html");
    const mime = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".jpg": "image/jpeg",
      ".svg": "image/svg+xml",
      ".png": "image/png",
    };
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] || "application/octet-stream",
    });
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e.message);
    if (!res.headersSent)
      send(res, 500, {
        error:
          e.name === "TimeoutError"
            ? "生成超时，请重试。"
            : "操作失败，请检查内容或稍后重试。",
      });
  }
});
server.listen(Number(process.env.PORT || 5173), "127.0.0.1", () => {
  console.log(`Growmory → http://localhost:${process.env.PORT || 5173}`);
  let running = false;
  const syncDue = async () => {
    if (running) return;
    running = true;
    try {
      await insights.syncDue();
    } catch (error) {
      console.warn("App 趋势自动同步检查失败：", error.message);
    } finally {
      running = false;
    }
  };
  const initial = setTimeout(syncDue, 1000);
  initial.unref();
  const timer = setInterval(syncDue, 60_000);
  timer.unref();
  server.once("close", () => {
    clearTimeout(initial);
    clearInterval(timer);
  });
});
