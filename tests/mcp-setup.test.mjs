import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  configPath,
  mergeConfig,
  setup,
  parseArgs,
} from "../scripts/connect-mcp.mjs";

test("配置合并保留其他服务、先备份、重复运行无变更，拒绝损坏配置", () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-setup-json-"));
  try {
    const path = join(dir, "mcp.json");
    const original = {
      preferences: { theme: "dark" },
      mcpServers: { other: { command: "other" } },
    };
    writeFileSync(path, JSON.stringify(original));
    const entry = {
      command: "node",
      args: ["/test entry.mjs"],
      env: { GROWMORY_URL: "http://127.0.0.1:5173" },
    };
    const result = mergeConfig(path, entry);
    assert.ok(result.changed);
    assert.deepEqual(JSON.parse(readFileSync(result.backup)), original);
    assert.equal(statSync(result.backup).mode & 0o777, 0o600);
    const merged = JSON.parse(readFileSync(path));
    assert.deepEqual(merged.preferences, original.preferences);
    assert.deepEqual(merged.mcpServers.other, original.mcpServers.other);
    assert.deepEqual(merged.mcpServers.growmory, entry);
    assert.equal(mergeConfig(path, entry).changed, false);
    writeFileSync(path, "{invalid");
    assert.throws(() => mergeConfig(path, entry), /有效 JSON/);
    assert.equal(readFileSync(path, "utf8"), "{invalid");
    writeFileSync(path, '{"mcpServers":[]}');
    assert.throws(() => mergeConfig(path, entry), /结构/);
    assert.throws(() => parseArgs(["--client"]), /缺少/);
    assert.throws(() => parseArgs(["--unknown"]), /未知/);
    assert.equal(
      configPath("claude-desktop", "/user", "linux", {}),
      "/user/.config/Claude/claude_desktop_config.json",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("连接脚本通过真实 MCP 查询验证，再配置隔离客户端，下载与提示词不含密钥", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-setup-"));
  const base = "http://127.0.0.1:5189";
  const child = spawn(process.execPath, ["server/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: "5189",
      DB_PATH: join(dir, "workspace.sqlite"),
    },
    stdio: "pipe",
  });
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
    const checked = await setup({ url: base, check: true });
    assert.equal(checked.status, "verified");
    assert.equal(checked.productCount, 0);
    assert.equal(checked.toolCount, 40);
    const before = await fetch(base + "/api/state").then((r) => r.json());
    for (const client of ["cursor", "claude-code", "claude-desktop"]) {
      const home = join(dir, client);
      const path = configPath(client, home, process.platform, {});
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        JSON.stringify({
          mcpServers: { other: { command: "other" } },
          theme: "dark",
        }),
      );
      const result = await setup({ url: base, client, home, env: process.env });
      assert.equal(result.status, "configured");
      assert.ok(result.backup);
      assert.ok(!result.message.includes("已连接成功"));
      assert.equal(result.productCount, 0);
      const config = JSON.parse(readFileSync(path));
      assert.equal(config.theme, "dark");
      assert.ok(config.mcpServers.other);
      assert.ok(config.mcpServers.growmory.command);
      assert.equal(
        (await setup({ url: base, client, home, env: process.env })).changed,
        false,
      );
    }
    // Exercise the real installed Codex CLI only against a temporary CODEX_HOME.
    if (spawnSync("codex", ["--version"], { stdio: "pipe" }).status === 0) {
      const codexHome = join(dir, "codex");
      mkdirSync(codexHome);
      const path = join(codexHome, "config.toml");
      writeFileSync(
        path,
        'model = "existing-model"\n\n[mcp_servers.other]\ncommand = "other"\n',
      );
      const env = { ...process.env, CODEX_HOME: codexHome };
      const installed = await setup({ url: base, client: "codex", env });
      assert.ok(installed.backup);
      const config = readFileSync(path, "utf8");
      assert.ok(config.includes("existing-model"));
      assert.ok(config.includes("[mcp_servers.other]"));
      assert.ok(config.includes("[mcp_servers.growmory]"));
      const actual = JSON.parse(
        execFileSync("codex", ["mcp", "get", "growmory", "--json"], {
          env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      );
      assert.equal(actual.transport.env.GROWMORY_URL, base);
      assert.equal(
        (await setup({ url: base, client: "codex", env })).changed,
        false,
      );
      const desktop = await setup({
        url: base,
        client: "chatgpt-desktop",
        env,
      });
      assert.equal(desktop.client, "chatgpt-desktop");
      assert.equal(desktop.configPath, path);
      assert.equal(desktop.changed, false);
    }
    const instructions = await fetch(base + "/api/mcp/setup").then((r) =>
      r.json(),
    );
    const token = JSON.parse(readFileSync(join(dir, "mcp-access.json"))).token;
    assert.ok(instructions.prompt.includes("CLIENT"));
    assert.ok(instructions.chatgpt.prompt.includes("--client chatgpt-desktop"));
    assert.ok(instructions.chatgpt.prompt.includes("如果你没有本机终端工具"));
    assert.ok(instructions.chatgpt.prompt.includes("当前聊天已连接"));
    assert.ok(!JSON.stringify(instructions.chatgpt).includes(token));
    assert.ok(
      instructions.chatgptChat.prompt.includes(
        "本机注册成功与当前 Chat 已加载工具是不同的状态",
      ),
    );
    assert.ok(!instructions.chatgptChat.prompt.includes("--client"));
    assert.ok(!JSON.stringify(instructions.chatgptChat).includes(token));
    assert.ok(instructions.prompt.includes("从当前聊天实际调用"));
    assert.ok(!instructions.prompt.includes(token));
    assert.ok(!instructions.prompt.includes("Bearer"));
    const download = await fetch(base + "/api/mcp/setup-script");
    assert.equal(download.status, 200);
    assert.ok(
      download.headers
        .get("content-disposition")
        .includes("growmory-connect.mjs"),
    );
    const source = await download.text();
    assert.ok(source.includes(base));
    assert.ok(!source.includes(token));
    const downloaded = join(dir, "downloaded-setup.mjs");
    writeFileSync(downloaded, source);
    const result = JSON.parse(
      execFileSync(process.execPath, [downloaded, "--check"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
    assert.equal(result.productCount, 0);
    await fetch(base + "/api/mcp/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, allowWrites: true }),
    });
    const absent = join(dir, "disabled-client");
    await assert.rejects(
      setup({ url: base, client: "cursor", home: absent }),
      /MCP 已关闭/,
    );
    assert.ok(!existsSync(absent));
    await assert.rejects(
      setup({ url: "https://example.com", client: "cursor" }),
      /只支持本机/,
    );
    const after = await fetch(base + "/api/state").then((r) => r.json());
    assert.deepEqual(after, before);
  } finally {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    rmSync(dir, { recursive: true, force: true });
  }
});
