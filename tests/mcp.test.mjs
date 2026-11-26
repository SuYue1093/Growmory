import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("真实 MCP 客户端通过 HTTP 与 stdio 管理资料，并执行权限与冲突检查", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-mcp-"));
  const port = process.env.TEST_PORT || "5191";
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: port,
      DB_PATH: join(dir, "workspace.sqlite"),
    },
    stdio: "pipe",
  });
  const http = new Client({ name: "growmory-test", version: "1" });
  const stdio = new Client({ name: "growmory-stdio-test", version: "1" });
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
    const config = await fetch(base + "/api/mcp/config", {
      method: "POST",
    }).then((r) => r.json());
    const header = config.http.mcpServers.growmory.headers;
    assert.equal(
      (
        await fetch(base + "/mcp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "/mcp", {
          method: "POST",
          headers: {
            ...header,
            "Content-Type": "application/json",
            Origin: "https://untrusted.example",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    await http.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: { headers: header },
      }),
    );
    const tools = await http.listTools();
    assert.equal(tools.tools.length, 52);
    assert.equal(tools.tools.find(t => t.name === "save_social_account_profile")?.annotations.readOnlyHint, false);
    assert.ok(tools.tools.some(t => t.name === "fetch_briefing_source"));
    assert.ok(tools.tools.some(t => t.name === "save_briefing_search_configs"));
    assert.equal(tools.tools.find(t => t.name === "get_aso_artwork_set")?.annotations.readOnlyHint, true);
    assert.equal(tools.tools.find(t => t.name === "append_aso_artwork_shots")?.annotations.readOnlyHint, false);
    assert.equal(tools.tools.find(t => t.name === "capture_aso_artwork_screenshot")?.annotations.readOnlyHint, false);
    assert.ok(tools.tools.some(tool => tool.name === "get_custom_product_pages_context"));
    assert.ok(tools.tools.some(tool => tool.name === "manage_custom_product_page"));
    assert.ok(tools.tools.some(tool => tool.name === "get_page_optimization_context"));
    assert.ok(tools.tools.some(tool => tool.name === "manage_page_optimization_experiment"));
    assert.ok(tools.tools.some(tool => tool.name === "get_in_app_events_context"));
    assert.ok(tools.tools.some(tool => tool.name === "manage_in_app_event"));
    assert.ok(tools.tools.some(tool => tool.name === "add_aso_localization"));
    assert.ok(tools.tools.some(tool => tool.name === "save_aso_media_draft"));
    assert.ok(tools.tools.some(t => t.name === 'get_marketing_context'));
    assert.ok(tools.tools.some(t => t.name === 'get_aso_context'));
    assert.ok(tools.tools.some(t => t.name === 'get_analytics_context'));
    assert.ok(tools.tools.some(t => t.name === 'save_analytics_report'));
    assert.equal(tools.tools.find(t => t.name === 'get_analytics_context')?.annotations.readOnlyHint, true);
    assert.equal(tools.tools.find(t => t.name === 'save_analytics_report')?.annotations.readOnlyHint, false);
    assert.ok(tools.tools.some(t => t.name === 'get_briefing_context'));
    assert.ok(tools.tools.some(t => t.name === 'save_briefing'));
    assert.equal(tools.tools.find(t => t.name === 'get_briefing_context')?.annotations.readOnlyHint, true);
    assert.equal(tools.tools.find(t => t.name === 'save_briefing')?.annotations.readOnlyHint, false);
    assert.equal(tools.tools.find(t => t.name === 'research_aso_markets')?.annotations.readOnlyHint, true);
    assert.ok(!tools.tools.some(t => t.name === 'save_aso_analysis'));
    assert.ok(tools.tools.some(t => t.name === 'upload_asset'));
    assert.ok(tools.tools.some(t => t.name === 'search_app_store'));
    assert.ok(tools.tools.some(t => t.name === 'get_app_store_app'));
    assert.ok(tools.tools.some(t => t.name === 'get_app_store_suggestions'));
    const call = async (name, args) => {
      const r = await http.callTool({ name, arguments: args });
      assert.ok(!r.isError, JSON.stringify(r));
      return JSON.parse(r.content[0].text);
    };
    const aiStatus = await call("get_ai_status", {});
    assert.equal(typeof aiStatus.ai.configured, "boolean");
    const configuredAi = await call("configure_ai_service", {
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-from-mcp",
      model: "deepseek-chat",
      testConnection: false,
    });
    assert.equal(configuredAi.success, true);
    assert.equal(configuredAi.ai.model, "deepseek-chat");
    assert.equal(configuredAi.ai.hasKey, true);
    const recheckAi = await call("get_ai_status", {});
    assert.equal(recheckAi.ai.configured, true);
    assert.equal(recheckAi.ai.model, "deepseek-chat");
    let current = await call("list_records", { collection: "products" });
    assert.equal(current.total, 0);
    let saved = await call("save_products", {
      expectedRevision: current.revision,
      fields: { name: "MCP 测试产品", price: "¥18" },
    });
    const pid = saved.record.id;
    const oldRevision = current.revision;
    // 验证 Agent 禁止直接写入已确认状态
    const rejectConfirmed = await http.callTool({
      name: "save_docs",
      arguments: {
        expectedRevision: saved.revision,
        fields: {
          productId: pid,
          title: "产品介绍",
          source: "MCP 集成测试",
          body: "原文",
          status: "confirmed",
        },
      },
    });
    assert.equal(rejectConfirmed.isError, true);
    assert.ok(rejectConfirmed.content[0].text.includes("已确认"));

    saved = await call("save_docs", {
      expectedRevision: saved.revision,
      fields: {
        productId: pid,
        title: "产品介绍",
        source: "MCP 集成测试",
        body: "原文",
      },
    });
    const did = saved.record.id;
    assert.equal(saved.record.status, "pending");

    // 模拟用户在 Growmory 界面人工审核并确认资料
    const state = await fetch(base + "/api/state").then((r) => r.json());
    state.data.docs.find((d) => d.id === did).status = "confirmed";
    const confirmedRes = await fetch(base + "/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    }).then((r) => r.json());
    saved.revision = confirmedRes.revision;
    const marketing = await call("get_marketing_context", { productId: pid });
    assert.equal(marketing.context.product.id, pid);
    assert.equal(marketing.context.docs[0].docId, did);
    assert.ok(marketing.guide.includes("返回完整标题和正文"));
    saved = await call("save_docs", {
      id: did,
      expectedRevision: saved.revision,
      fields: { body: "新的产品介绍", source: "MCP 修改测试" },
    });
    assert.equal(saved.record.status, "pending");
    assert.equal(saved.record.history[0].body, "原文");
    const stale = await http.callTool({
      name: "save_products",
      arguments: {
        id: pid,
        expectedRevision: oldRevision,
        fields: { name: "不应覆盖" },
      },
    });
    assert.equal(stale.isError, true);
    saved = await call("save_docFolders", {
      expectedRevision: saved.revision,
      fields: {
        productId: pid,
        name: "测试文件夹",
        parentId: "",
      },
    });
    saved = await call("save_releases", {
      expectedRevision: saved.revision,
      fields: { productId: pid, version: "1.1", changes: "新增：测试功能" },
    });
    const rid = saved.record.id;
    saved = await call("save_contents", {
      expectedRevision: saved.revision,
      fields: {
        productId: pid,
        releaseId: rid,
        title: "发布文案",
        body: "本次更新介绍",
      },
    });
    const article = await call("get_record", { collection: "contents", id: saved.record.id });
    saved = await call("save_contents", {
      id: article.record.id,
      expectedRevision: article.revision,
      fields: { body: "改写后的更新介绍" },
    });
    assert.equal(saved.record.id, article.record.id);
    assert.equal(saved.record.body, "改写后的更新介绍");
    assert.equal(saved.record.title, article.record.title);
    assert.equal(saved.record.status, article.record.status);
    assert.equal(saved.record.releaseId, rid);
    saved = await call("save_tasks", {
      expectedRevision: saved.revision,
      fields: { productId: pid, releaseId: rid, title: "审核发布文案" },
    });
    const tid = saved.record.id;
    saved = await call("save_tasks", {
      id: tid,
      expectedRevision: saved.revision,
      fields: { done: true },
    });
    assert.equal(saved.record.done, true);
    saved = await call("save_tasks", {
      id: tid,
      expectedRevision: saved.revision,
      fields: { done: false },
    });
    assert.equal(saved.record.done, false);

    saved = await call("upload_asset", {
      expectedRevision: saved.revision,
      name: "MCP 宣传物料",
      data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      fileName: "poster.png",
      productId: pid,
      releaseId: rid,
      languages: ["zh-Hans", "en-US"],
    });
    assert.equal(saved.record.name, "MCP 宣传物料");
    assert.equal(saved.record.productId, pid);
    assert.equal(saved.record.releaseId, rid);
    assert.deepEqual(saved.record.languages, ["zh-Hans", "en-US"]);
    assert.ok(saved.record.url.startsWith("data:image/png;base64,"));
    const aid = saved.record.id;

    const assetList = await call("list_records", { collection: "assets" });
    assert.equal(assetList.total, 1);
    assert.equal(assetList.records[0].name, "MCP 宣传物料");
    assert.deepEqual(assetList.records[0].languages, ["zh-Hans", "en-US"]);

    const singleAsset = await call("get_record", { collection: "assets", id: aid });
    assert.deepEqual(singleAsset.record.languages, ["zh-Hans", "en-US"]);

    // Also upload non-app shared asset
    saved = await call("upload_asset", {
      expectedRevision: saved.revision,
      name: "通用品牌 Banner",
      data: "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      fileName: "banner.jpg",
      productId: "",
    });
    assert.equal(saved.record.productId, "");
    assert.equal(saved.record.releaseId, undefined);

    // 测试 get_analytics_context
    const analyticsCtx = await call("get_analytics_context", { productId: pid, days: 30 });
    assert.ok(analyticsCtx.productsData);
    assert.equal(analyticsCtx.productsData.length, 1);
    assert.equal(analyticsCtx.productsData[0].product.id, pid);
    assert.ok(analyticsCtx.guide.structure.length > 0);

    // 测试 save_analytics_report
    const reportRes = await call("save_analytics_report", {
      expectedRevision: saved.revision,
      productId: pid,
      title: "10月产品增长与漏斗转化分析报告",
      summary: "整体展示量稳步上升，详情页转化率维持在合理区间。",
      content: "# 10月分析报告\n\n## 核心指标\n- 展示量: 1000\n- 下载量: 50\n\n## 建议\n持续优化关键词。",
      period: "近30天",
      tags: ["转化率优化", "月报"],
      metricsSummary: { impressions: 1000, downloads: 50, conversionRate: "5.0%" },
    });
    assert.equal(reportRes.success, true);
    assert.equal(reportRes.report.title, "10月产品增长与漏斗转化分析报告");
    assert.equal(reportRes.report.tags[0], "转化率优化");
    saved = reportRes;

    const reportList = await call("list_records", { collection: "analyticsReports" });
    assert.equal(reportList.total, 1);
    assert.equal(reportList.records[0].title, "10月产品增长与漏斗转化分析报告");
    const stdioConfig = config.stdio.mcpServers.growmory;
    await stdio.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [resolve("server/mcp-stdio.mjs")],
        env: stdioConfig.env,
        stderr: "pipe",
      }),
    );
    const record = await stdio.callTool({
      name: "get_record",
      arguments: { collection: "docs", id: did },
    });
    assert.equal(
      JSON.parse(record.content[0].text).record.body,
      "新的产品介绍",
    );
    const deniedProduct = await http.callTool({
      name: "delete_record",
      arguments: {
        collection: "products",
        id: pid,
        expectedRevision: saved.revision,
      },
    });
    assert.equal(deniedProduct.isError, true);
    saved = await call("delete_record", {
      collection: "tasks",
      id: tid,
      expectedRevision: saved.revision,
    });
    assert.equal(saved.deleted, true);
    await fetch(base + "/api/mcp/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true, allowWrites: false }),
    });
    const deniedWrite = await stdio.callTool({
      name: "save_tasks",
      arguments: {
        expectedRevision: saved.revision,
        fields: { productId: pid, title: "拒绝写入" },
      },
    });
    assert.equal(deniedWrite.isError, true);
    assert.ok(
      !(
        await stdio.callTool({
          name: "list_records",
          arguments: { collection: "products" },
        })
      ).isError,
    );
    const status = await fetch(base + "/api/mcp/settings").then((r) =>
      r.json(),
    );
    assert.ok(status.lastUsedAt);
    assert.ok(!JSON.stringify(status).includes(header.Authorization));
    await fetch(base + "/api/mcp/rotate", { method: "POST" });
    assert.equal(
      (
        await fetch(base + "/mcp", {
          method: "POST",
          headers: { ...header, "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      401,
    );
    // stdio reads the rotated key on each call, so it keeps working.
    assert.ok(
      !(
        await stdio.callTool({
          name: "list_records",
          arguments: { collection: "products" },
        })
      ).isError,
    );
    await fetch(base + "/api/mcp/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, allowWrites: true }),
    });
    assert.equal(
      (
        await stdio.callTool({
          name: "list_records",
          arguments: { collection: "products" },
        })
      ).isError,
      true,
    );
  } finally {
    await http.close();
    await stdio.close();
    child.kill();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});
