import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { inlineImagePlatforms, supportsInlineImages } from "../src/platforms.ts";
import {
  buildAssetMarkdownSnippet,
  extractBodyAssetReferences,
  insertMarkdownImageAtCursor,
  parseAssetIdFromSrc,
  renderMarkdownToPlatformHtml,
  resolveContentAssets,
} from "../src/marketing-rich-copy.ts";
import {
  marketingAgentGuide,
  marketingAgentPrompt,
  marketingGroupPrompt,
  marketingRewritePrompt,
} from "../src/marketing-agent.ts";
import { validateData } from "../server/validate.mjs";

const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

test("supportsInlineImages 准确区分支持正文插图与纯外挂配图平台", () => {
  for (const name of ["微信公众号", "WeChat", "稀土掘金", "juejin", "知乎", "Zhihu", "Medium", "B站", "Bilibili"]) {
    assert.equal(supportsInlineImages(name), true, `${name} 应支持正文插图`);
  }
  for (const name of ["小红书", "X", "Product Hunt", "Reddit", "微博", "LinkedIn"]) {
    assert.equal(supportsInlineImages(name), false, `${name} 不应开启富文本正文插图`);
  }
  assert.ok(inlineImagePlatforms.includes("微信公众号"));
  assert.ok(inlineImagePlatforms.includes("稀土掘金"));
});

test("validateData 校检 content.assetIds 字段", () => {
  const valid = validateData({
    products: [],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [],
    tasks: [],
    contents: [
      {
        id: "c1",
        productId: "",
        title: "t",
        body: "b",
        channel: "微信公众号",
        status: "draft",
        date: "2026-11-12",
        url: "",
        assetIds: ["a1", "a2"],
        assetNames: ["图1.png"],
      },
    ],
  });
  assert.equal(valid, true);

  const invalid = validateData({
    products: [],
    docs: [],
    docFolders: [],
    assets: [],
    assetFolders: [],
    releases: [],
    tasks: [],
    contents: [
      {
        id: "c1",
        productId: "",
        title: "t",
        body: "b",
        channel: "微信公众号",
        status: "draft",
        date: "2026-11-12",
        url: "",
        assetIds: [123],
      },
    ],
  });
  assert.equal(invalid, false);
});

test("关联素材解析、正文插图提取与内联样式 HTML 渲染正确工作", () => {
  const assets = [
    {
      id: "asset-1",
      name: "主界面截图.png",
      url: SAMPLE_PNG_DATA_URL,
      productId: "p1",
      fileName: "home.png",
      fileType: "image/png",
      fileSize: 120,
      width: 1200,
      height: 800,
      createdAt: "2026-11-12T00:00:00Z",
      updatedAt: "2026-11-12T00:00:00Z",
    },
    {
      id: "asset-2",
      name: "功能对比图.png",
      url: SAMPLE_PNG_DATA_URL,
      productId: "p1",
      fileName: "compare.png",
      fileType: "image/png",
      fileSize: 120,
      width: 800,
      height: 600,
      createdAt: "2026-11-12T00:00:00Z",
      updatedAt: "2026-11-12T00:00:00Z",
    },
  ];

  const resolved = resolveContentAssets(
    {
      productId: "p1",
      assetIds: ["asset-1"],
      assetNames: ["功能对比图.png", "待补图.png"],
    },
    assets,
  );
  assert.deepEqual(
    resolved.linkedAssets.map((a) => a.id),
    ["asset-1", "asset-2"],
  );
  assert.deepEqual(resolved.unmatchedNames, ["待补图.png"]);

  const snippet = buildAssetMarkdownSnippet(assets[0]);
  assert.equal(snippet, "![主界面截图.png](/api/assets/file/asset-1)");
  assert.equal(parseAssetIdFromSrc("/api/assets/file/asset-1"), "asset-1");
  assert.equal(parseAssetIdFromSrc("http://127.0.0.1:4173/api/assets/file/asset-1"), "asset-1");
  assert.equal(parseAssetIdFromSrc("asset://asset-2"), "asset-2");

  const inserted = insertMarkdownImageAtCursor("第一段\n第二段", 3, 3, snippet);
  assert.ok(inserted.nextBody.includes("第一段\n\n![主界面截图.png](/api/assets/file/asset-1)\n\n第二段"));

  const refs = extractBodyAssetReferences(inserted.nextBody, assets);
  assert.equal(refs.refs.length, 1);
  assert.ok(refs.usedAssetIds.has("asset-1"));

  const html = renderMarkdownToPlatformHtml("## 小标题\n\n" + snippet, { assets });
  assert.match(html, /<h2[^>]*style="[^"]*border-left:4px solid #2563eb/);
  assert.match(html, /<img[^>]*src="data:image\/png;base64,/);
  assert.ok(!html.includes("/api/assets/file/asset-1"), "导出粘贴 HTML 应将本地素材路径替换为可独立加载的图片数据");
});

test("MCP 与创作/改写提示词包含正文插图与 assetIds 规范", () => {
  const groupZh = marketingGroupPrompt(
    {
      groupId: "g1",
      title: "发布宣发",
      direction: "介绍新版特性",
      products: [{ id: "p1", name: "Growmory" }],
      channels: ["微信公众号", "小红书"],
      assetNames: ["主图.png"],
      assets: [{ id: "a1", name: "主图.png" }],
    },
    "zh",
  );
  assert.match(groupZh, /assetIds/);
  assert.match(groupZh, /\/api\/assets\/file\/<assetId>|\/api\/assets\/file\/a1/);
  assert.match(groupZh, /微信公众号/);

  const agentZh = marketingAgentPrompt({ productId: "p1" }, "zh");
  assert.match(agentZh, /assetIds/);
  assert.match(agentZh, /\/api\/assets\/file\/<assetId>/);
  assert.match(marketingAgentGuide, /assetIds/);

  const rewrite = marketingRewritePrompt("content-123", "在第二段加入产品截图");
  assert.match(rewrite, /associatedAssets/);
  assert.match(rewrite, /assetIds/);
  assert.match(rewrite, /\/api\/assets\/file\/<assetId>/);
});

test("重写提示词只加载目标平台的专属要求，未分组时沿用原稿目标", () => {
  const x = marketingRewritePrompt("content-x", "重写首段", { channel: "Twitter" });
  assert.match(x, /"groupId":null,"group":null/);
  assert.match(x, /沿用原文明确的目标/);
  assert.match(x, /xAccounts/);
  assert.match(x, /isPremium/);
  assert.match(x, /成稿标题与全文的完整中文译文/);
  assert.doesNotMatch(x, /redditCommunities/);

  const reddit = marketingRewritePrompt("content-reddit", "适配发布社区", { channel: "reddit" });
  assert.match(reddit, /优先社区相关性、实用价值与身份透明/);
  assert.match(reddit, /fields\.redditCommunities/);
  assert.doesNotMatch(reddit, /xAccounts/);
});

test("MCP 工具链支持 assetIds、正文插图自动关联、上下文 assetItems 与素材文件访问", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-inline-mcp-"));
  const port = 5192;
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DB_PATH: join(dir, "workspace.sqlite"),
    },
    stdio: "pipe",
  });
  const mcp = new Client({ name: "growmory-inline-test", version: "1" });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("服务启动超时")), 10000);
      child.stdout.on("data", (b) => {
        if (String(b).includes("Growmory")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", reject);
    });

    const config = await fetch(`${base}/api/mcp/config`, { method: "POST" }).then((r) => r.json());
    const headers = config.http.mcpServers.growmory.headers;
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers } }));

    const call = async (name, args) => {
      const r = await mcp.callTool({ name, arguments: args });
      assert.ok(!r.isError, JSON.stringify(r));
      return JSON.parse(r.content[0].text);
    };

    const initialList = await call("list_records", { collection: "products" });
    const init = await call("save_products", {
      fields: { name: "DemoApp", price: "Free" },
      expectedRevision: initialList.revision,
    });
    const rev1 = init.revision;
    const productId = init.record.id;

    // 1. upload_asset 返回 imageUrl 与 markdown
    const uploaded = await call("upload_asset", {
      name: "架构总览.png",
      fileName: "arch.png",
      data: SAMPLE_PNG_DATA_URL,
      productId,
      expectedRevision: rev1,
    });
    assert.ok(uploaded.record?.id);
    const assetId = uploaded.record.id;
    assert.equal(uploaded.imageUrl, `/api/assets/file/${encodeURIComponent(assetId)}`);
    assert.equal(uploaded.markdown, `![架构总览.png](/api/assets/file/${encodeURIComponent(assetId)})`);

    // 2. HTTP 访问 /api/assets/file/:id 返回图片
    const fileRes = await fetch(`${base}/api/assets/file/${encodeURIComponent(assetId)}`);
    assert.equal(fileRes.status, 200);
    assert.match(fileRes.headers.get("content-type") || "", /image\/png/);

    // 3. get_marketing_context 返回 inlineImageSupported 与 assetItems
    const ctxWechat = await call("get_marketing_context", { productId, channel: "微信公众号" });
    assert.equal(ctxWechat.context.inlineImageSupported, true);
    assert.ok(ctxWechat.context.assetItems.some((item) => item.id === assetId && item.imageUrl));
    assert.ok(ctxWechat.inlineImagePlatforms.includes("稀土掘金"));

    const ctxXhs = await call("get_marketing_context", { productId, channel: "小红书" });
    assert.equal(ctxXhs.context.inlineImageSupported, false);

    // 4. save_contents 通过正文插图自动关联 assetIds
    const saved = await call("save_contents", {
      action: "create",
      fields: {
        productId,
        channel: "微信公众号",
        title: "公众号深度评测",
        body: `欢迎使用 DemoApp。\n\n![架构总览.png](/api/assets/file/${assetId})\n\n以上是核心结构。`,
        assetNames: ["架构总览.png"],
        status: "draft",
      },
      expectedRevision: uploaded.revision,
    });
    assert.deepEqual(saved.record.assetIds, [assetId]);
    const contentId = saved.record.id;

    // 5. get_record 返回 associatedAssets 与 inlineImageSupported
    const fetched = await call("get_record", { collection: "contents", id: contentId });
    assert.equal(fetched.inlineImageSupported, true);
    assert.equal(fetched.associatedAssets.length, 1);
    assert.equal(fetched.associatedAssets[0].id, assetId);

    // 6. list_records(assets) 返回 imageUrl 与 markdown
    const listedAssets = await call("list_records", { collection: "assets", productId });
    assert.equal(listedAssets.records[0].imageUrl, `/api/assets/file/${encodeURIComponent(assetId)}`);

    // 7. 删除素材时自动清理内容中的 assetIds
    const deleted = await call("delete_record", {
      collection: "assets",
      id: assetId,
      expectedRevision: saved.revision,
    });
    assert.ok(deleted.deletedId === assetId || deleted.ok === true || deleted.revision > saved.revision);

    const fetchedAfterDelete = await call("get_record", { collection: "contents", id: contentId });
    assert.deepEqual(fetchedAfterDelete.record.assetIds, []);
    assert.equal(fetchedAfterDelete.associatedAssets.length, 0);
  } finally {
    await mcp.close().catch(() => {});
    child.kill("SIGTERM");
    rmSync(dir, { recursive: true, force: true });
  }
});
