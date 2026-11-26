import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("AI 接口使用已确认上下文、返回待审核提案，且不改写正式资料", async () => {
  let mode = "valid",
    context;
  const provider = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const payload = JSON.parse(body);
    context = JSON.parse(payload.messages[1].content);
    const result = {
      notes: [
        { language: "中文", body: "新增测试功能。" },
        { language: "英文", body: "Added a feature." },
      ],
      documents: [
        {
          docId: mode === "valid" ? "doc-firefly" : "unknown",
          body: "# 新介绍",
          reason: "补充新功能",
        },
      ],
      marketing: [
        { channel: "X", title: "A new chapter", body: "Meet the new update." },
        { channel: "小红书", title: "一次更新", body: "介绍即将到来的更新。" },
      ],
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "growmory-test-"));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5186",
      DB_PATH: join(dir, "workspace.sqlite"),
      AI_API_KEY: "test-only-key",
      AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
    },
    stdio: "pipe",
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("测试服务启动超时")), 10000);
      child.stdout.on("data", (b) => {
        if (String(b).includes("Growmory")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on("error", reject);
    });
    const base = "http://127.0.0.1:5186";
    const state = await fetch(base + "/api/state").then((r) => r.json());
    const seed = JSON.parse(readFileSync("tests/helpers/workspace.json"));
    seed.docs[0].status = "confirmed";
    seed.releases.push({
      id: "r",
      productId: "firefly",
      version: "1.1",
      changes: "新增：测试功能",
      languages: ["中文", "英文"],
      channels: ["X", "小红书"],
      status: "preparing",
      createdAt: new Date().toISOString(),
      notes: [],
      proposals: [],
    });
    const write = await fetch(base + "/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: seed, revision: state.revision }),
    });
    assert.equal(write.status, 200);
    const denied = await fetch(base + "/api/state", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
      body: "{}",
    });
    assert.equal(denied.status, 403);
    const response = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: "r", docIds: ["doc-firefly"] }),
    });
    assert.equal(response.status, 200);
    const draft = await response.json();
    assert.equal(draft.documents[0].before, seed.docs[0].body);
    assert.equal(context.docs.length, 1);
    assert.deepEqual(Object.keys(context.docs[0]).sort(), ["body", "docId", "title"]);
    assert.deepEqual(Object.keys(context).sort(), ["changes", "docs"]);
    assert.equal(draft.notes, undefined);
    assert.equal(draft.marketing, undefined);
    assert.ok(!JSON.stringify(context).includes("test-only-key"));
    const after = await fetch(base + "/api/state").then((r) => r.json());
    assert.equal(after.data.docs[0].body, seed.docs[0].body);
    assert.equal(after.data.contents.length, 0);
    mode = "invalid";
    const bad = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: "r", docIds: ["doc-firefly"] }),
    });
    assert.equal(bad.status, 502);
    const status = await fetch(base + "/api/ai/status").then((r) => r.text());
    assert.ok(!status.includes("test-only-key"));
  } finally {
    child.kill();
    provider.close();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("报告划词生成待办：调用内置AI仅提炼20字内标题，未配置平滑降级", async () => {
  let receivedPrompt = "";
  const provider = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const payload = JSON.parse(body);
    receivedPrompt = payload.messages[1].content;
    const result = {
      title: "优化副标题搜索热词匹配与首图文案",
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(result) } }],
      }),
    );
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "growmory-task-ai-"));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5187",
      DB_PATH: join(dir, "workspace.sqlite"),
      AI_API_KEY: "test-only-key",
      AI_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`,
    },
    stdio: "pipe",
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("测试服务启动超时")), 10000);
      child.stdout.on("data", (b) => {
        if (String(b).includes("Growmory")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once("error", reject);
    });

    const base = `http://127.0.0.1:5187`;

    // 1. 测试成功调用 AI 仅生成待办标题
    const resp = await fetch(`${base}/api/ai/generate-task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quote: "矩阵最大流失发生在展示->查看环节。因此这不是产品需求问题，而是待修产品的素材/关键词匹配问题。",
        productName: "逐步",
        reportTitle: "近30天矩阵诊断报告",
      }),
    });
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.configured, true);
    assert.ok(data.title.length <= 20, "待办标题必须在 20 字以内");
    assert.equal(data.title, "优化副标题搜索热词匹配与首图文案");
    assert.equal(data.note, undefined);
    assert.ok(receivedPrompt.includes("逐步"));
    assert.ok(receivedPrompt.includes("近30天矩阵诊断报告"));

    // 2. 测试超长标题必须被截断到 20 字以内
    const { generateTaskFromQuote } = await import("../server/report-task-ai.mjs");
    const mockFetcher = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "这是一段故意超过二十个汉字的极其冗长待办任务标题需要被截断",
                }),
              },
            },
          ],
        }),
      );
    const mockAi = {
      configured: true,
      baseUrl: "https://api.openai.com/v1",
      apiKey: "fake",
      model: "gpt-4.1-mini",
    };
    const truncatedRes = await generateTaskFromQuote({
      quote: "测试划线内容",
      ai: mockAi,
      fetcher: mockFetcher,
    });
    assert.equal([...truncatedRes.title].length, 20, "超长标题必须被截断为严格 20 字");
    assert.equal(truncatedRes.title, "这是一段故意超过二十个汉字的极其冗长待办");

    // 3. 测试未配置 AI 时的优雅降级
    const unconfiguredRes = await generateTaskFromQuote({
      quote: "测试划线内容",
      ai: { configured: false },
    });
    assert.equal(unconfiguredRes.configured, false);
    assert.equal(unconfiguredRes.title, "");

    // 4. 空 quote 校验
    await assert.rejects(
      async () => generateTaskFromQuote({ quote: "", ai: mockAi }),
      /请提供划线引用的报告内容/
    );
  } finally {
    child.kill();
    provider.close();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});
