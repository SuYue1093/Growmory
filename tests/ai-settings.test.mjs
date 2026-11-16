import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, statSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openAiConfig, maskApiKey } from "../server/ai-config.mjs";

test("maskApiKey 准确遮蔽密钥且不泄露明文", () => {
  assert.equal(maskApiKey(""), "");
  assert.equal(maskApiKey(null), "");
  assert.equal(maskApiKey("short123"), "••••••••");
  assert.equal(maskApiKey("sk-proj-1234567890abcdef"), "sk-p••••cdef");
});

test("openAiConfig 本机持久化、权限控制与测试连接", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-ai-config-"));
  const configFile = join(dir, "ai-config.json");
  let mockStatus = 200;
  let mockBody = { choices: [{ message: { content: "ok" } }] };

  const mockFetcher = async (url, options) => {
    return Response.json(mockStatus === 200 ? mockBody : { error: { message: "Mock error" } }, { status: mockStatus });
  };

  try {
    const config = openAiConfig(configFile, { env: {}, fetcher: mockFetcher });
    assert.equal(config.get().configured, false);
    assert.equal(config.status().configured, false);

    // Save configuration
    const saved = config.save({
      baseUrl: "https://api.deepseek.com",
      apiKey: "sk-test-deepseek-key-12345",
      model: "deepseek-chat",
    });
    assert.equal(saved.configured, true);
    assert.equal(saved.model, "deepseek-chat");
    assert.equal(saved.baseUrl, "https://api.deepseek.com");
    assert.equal(saved.hasKey, true);
    assert.ok(!saved.keyMasked.includes("sk-test-deepseek-key-12345"));

    // Check file permission
    const stats = statSync(configFile);
    assert.equal(stats.mode & 0o777, 0o600);

    // Save without apiKey preserves existing key
    const updated = config.save({
      model: "deepseek-reasoner",
    });
    assert.equal(updated.model, "deepseek-reasoner");
    assert.equal(updated.hasKey, true);
    assert.equal(config.get().apiKey, "sk-test-deepseek-key-12345");

    // Test connection success
    const testOk = await config.testConnection();
    assert.equal(testOk.ok, true);

    // Test connection 401
    mockStatus = 401;
    const test401 = await config.testConnection();
    assert.equal(test401.ok, false);
    assert.equal(test401.status, 401);

    // Clear configuration
    const cleared = config.clear();
    assert.equal(cleared.configured, false);
    assert.equal(cleared.hasKey, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("站内 AI 配置 API：保存、测试、读取及生成即时生效（无需重启服务）", async () => {
  let receivedAuth = "";
  const provider = http.createServer(async (req, res) => {
    receivedAuth = req.headers.authorization || "";
    let body = "";
    for await (const c of req) body += c;
    const payload = JSON.parse(body);

    // If it's a test connection request
    if (payload.messages?.[0]?.content === "hi") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "pong" } }] }));
      return;
    }

    // Generate request
    const result = {
      notes: [{ language: "中文", body: "动态配置生成的更新说明" }],
      documents: [],
      marketing: [],
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
  });
  await new Promise((r) => provider.listen(0, "127.0.0.1", r));

  const dir = mkdtempSync(join(tmpdir(), "growmory-ai-server-"));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5187",
      DB_PATH: join(dir, "workspace.sqlite"),
      // Start with no AI env vars!
      AI_API_KEY: "",
      AI_BASE_URL: "",
      AI_MODEL: "",
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

    const base = "http://127.0.0.1:5187";

    // 1. Initially unconfigured
    const initialStatus = await fetch(base + "/api/ai/status").then((r) => r.json());
    assert.equal(initialStatus.configured, false);

    const initialSettings = await fetch(base + "/api/ai/settings").then((r) => r.json());
    assert.equal(initialSettings.configured, false);
    assert.equal(initialSettings.hasKey, false);

    // 2. Configure via web API PUT /api/ai/settings
    const saveRes = await fetch(base + "/api/ai/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
        apiKey: "web-configured-secret-key",
        model: "web-model-v1",
      }),
    });
    assert.equal(saveRes.status, 200);
    const saveJson = await saveRes.json();
    assert.equal(saveJson.configured, true);
    assert.equal(saveJson.model, "web-model-v1");
    assert.equal(saveJson.hasKey, true);
    assert.ok(!JSON.stringify(saveJson).includes("web-configured-secret-key"));

    // 3. Test connection via POST /api/ai/test
    const testRes = await fetch(base + "/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(testRes.status, 200);
    const testJson = await testRes.json();
    assert.equal(testJson.ok, true);
    assert.equal(receivedAuth, "Bearer web-configured-secret-key");

    // 4. Verify /api/generate now immediately succeeds using the newly configured AI without restart!
    const state = await fetch(base + "/api/state").then((r) => r.json());
    const seed = JSON.parse(readFileSync("tests/helpers/workspace.json"));
    seed.docs[0].status = "confirmed";
    seed.releases.push({
      id: "rel-test",
      productId: "firefly",
      version: "2.0",
      changes: "新版发布",
      languages: ["中文"],
      channels: ["X"],
      status: "preparing",
      createdAt: new Date().toISOString(),
      notes: [],
      proposals: [],
    });
    const putRes = await fetch(base + "/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: seed, revision: state.revision }),
    });
    assert.equal(putRes.status, 200);

    const genRes = await fetch(base + "/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ releaseId: "rel-test", onlyNotes: true }),
    });
    assert.equal(genRes.status, 200);
    const genJson = await genRes.json();
    assert.equal(genJson.notes[0].body, "动态配置生成的更新说明");

    // 5. Clear settings via DELETE /api/ai/settings
    const delRes = await fetch(base + "/api/ai/settings", { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.configured, false);
    assert.equal(delJson.hasKey, false);

    const afterStatus = await fetch(base + "/api/ai/status").then((r) => r.json());
    assert.equal(afterStatus.configured, false);
  } finally {
    child.kill();
    provider.close();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});
