#!/usr/bin/env node
// Run with Node.js 24+. Does not print or copy authentication secrets.
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  renameSync,
  chmodSync,
  constants,
  unlinkSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
const DEFAULT_URL = "http://127.0.0.1:5173";
const clients = [
  "chatgpt-desktop",
  "codex",
  "claude-code",
  "cursor",
  "windsurf",
  "trae",
  "claude-desktop",
];
function backup(file) {
  if (!existsSync(file)) return null;
  const target = `${file}.growmory-${Date.now()}-${randomUUID().slice(0, 8)}.bak`;
  copyFileSync(file, target, constants.COPYFILE_EXCL);
  chmodSync(target, 0o600);
  return target;
}
export function configPath(
  client,
  home = homedir(),
  platform = process.platform,
  env = process.env,
) {
  if (client === "codex" || client === "chatgpt-desktop")
    return join(env.CODEX_HOME || join(home, ".codex"), "config.toml");
  if (client === "claude-code") return join(home, ".claude.json");
  if (client === "cursor") return join(home, ".cursor", "mcp.json");
  if (client === "windsurf")
    return join(home, ".codeium", "windsurf", "mcp_config.json");
  if (client === "trae")
    return platform === "darwin"
      ? join(
          home,
          "Library",
          "Application Support",
          "Trae",
          "User",
          "globalStorage",
          "trae.mcp",
          "mcp.json",
        )
      : join(home, ".trae", "mcp.json");
  if (client === "claude-desktop")
    return platform === "darwin"
      ? join(
          home,
          "Library",
          "Application Support",
          "Claude",
          "claude_desktop_config.json",
        )
      : platform === "win32"
        ? join(
            env.APPDATA || join(home, "AppData", "Roaming"),
            "Claude",
            "claude_desktop_config.json",
          )
        : join(home, ".config", "Claude", "claude_desktop_config.json");
  throw Error(
    "请指定 --client chatgpt-desktop、codex、claude-code、cursor、windsurf、trae 或 claude-desktop",
  );
}
export function mergeConfig(file, entry) {
  const original = existsSync(file) ? readFileSync(file, "utf8") : null;
  let config;
  try {
    config = original === null ? {} : JSON.parse(original);
  } catch {
    throw Error("客户端配置不是有效 JSON，未修改。请先修复原配置。");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    (config.mcpServers !== undefined &&
      (!config.mcpServers ||
        typeof config.mcpServers !== "object" ||
        Array.isArray(config.mcpServers)))
  )
    throw Error("客户端配置结构不正确，未修改");
  if (isDeepStrictEqual(config.mcpServers?.growmory, entry))
    return { changed: false, backup: null };
  const saved = backup(file);
  config.mcpServers = { ...config.mcpServers, growmory: entry };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try {
    const indent = original?.match(/\n([ \t]+)"/)?.[1] || "  ";
    writeFileSync(tmp, JSON.stringify(config, null, indent) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    if ((existsSync(file) ? readFileSync(file, "utf8") : null) !== original)
      throw Error("客户端配置刚刚发生变化，未覆盖，请重试");
    renameSync(tmp, file);
    chmodSync(file, 0o600);
  } finally {
    if (existsSync(tmp)) unlinkSync(tmp);
  }
  return { changed: true, backup: saved };
}
export async function probe(base, config) {
  const entry = config.stdio?.mcpServers?.growmory;
  if (!entry?.command || !entry.args?.length || !entry.env?.MCP_CONFIG_PATH)
    throw Error("Growmory 返回的启动配置不完整");
  if (!existsSync(entry.command) || !existsSync(entry.args[0]))
    throw Error("本机 Node 或 MCP 入口不存在，请在 Growmory 所在的电脑执行");
  let token;
  try {
    token = JSON.parse(readFileSync(entry.env.MCP_CONFIG_PATH, "utf8")).token;
  } catch {
    throw Error("无法读取本机连接凭据，请在 Growmory 所在的电脑执行");
  }
  let protocolVersion = "2025-03-26",
    counter = 0;
  const rpc = async (method, params, notification = false) => {
    const response = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": protocolVersion,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        ...(notification ? {} : { id: ++counter }),
        method,
        params,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw Error(
        `MCP 验证失败（HTTP ${response.status}），请检查连接开关和凭据`,
      );
    if (notification) return;
    const payload = await response.json();
    if (payload.error) throw Error("MCP 协议调用失败");
    return payload.result;
  };
  const hello = await rpc("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "growmory-setup-check", version: "1.0" },
  });
  protocolVersion = hello.protocolVersion;
  await rpc("notifications/initialized", {}, true);
  const tools = await rpc("tools/list", {});
  if (!tools.tools?.some((t) => t.name === "list_records"))
    throw Error("MCP 工具列表缺少 list_records");
  const called = await rpc("tools/call", {
    name: "list_records",
    arguments: { collection: "products", limit: 5 },
  });
  if (called.isError) throw Error("MCP 产品列表调用失败");
  let output;
  try {
    output = JSON.parse(called.content.find((c) => c.type === "text").text);
  } catch {
    throw Error("MCP 产品列表返回格式不正确");
  }
  return {
    toolCount: tools.tools.length,
    productCount: output.total,
    products: output.records.map((p) => p.name),
    allowWrites: config.allowWrites,
  };
}
export async function setup({
  url = DEFAULT_URL,
  client,
  check = false,
  home = homedir(),
  env = process.env,
  execute = execFileSync,
} = {}) {
  const base = new URL(url);
  if (
    !["127.0.0.1", "localhost"].includes(base.hostname) ||
    base.protocol !== "http:" ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw Error("只支持本机 Growmory HTTP 地址");
  if (!check && !clients.includes(client))
    throw Error(
      "请指定 --client chatgpt-desktop、codex、claude-code、cursor、windsurf、trae 或 claude-desktop；仅检查可用 --check",
    );
  let response;
  try {
    response = await fetch(`${base.origin}/api/mcp/settings`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw Error("无法连接 Growmory，请先启动本机工作台再重试");
  }
  if (!response.ok) throw Error("无法读取 Growmory MCP 配置");
  const config = await response.json();
  if (!config.enabled)
    throw Error("MCP 已关闭，请在工作区设置中开启；脚本不会修改连接权限");
  const verified = await probe(base.origin, config);
  if (check)
    return {
      status: "verified",
      ...verified,
      message: "已通过独立 MCP 协议检查，尚未配置 AI 客户端。",
    };
  const entry = config.stdio.mcpServers.growmory;
  const file = configPath(client, home, process.platform, env);
  let installed;
  if (client === "codex" || client === "chatgpt-desktop") {
    const cliEnv = { ...env, CODEX_HOME: dirname(file) };
    let existing;
    try {
      existing = JSON.parse(
        execute("codex", ["mcp", "get", "growmory", "--json"], {
          env: cliEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15000,
        }),
      );
    } catch {
      /* No existing entry, or CLI unavailable: add below reports a precise error. */
    }
    const transport = existing?.transport;
    if (
      transport?.type === "stdio" &&
      transport.command === entry.command &&
      isDeepStrictEqual(transport.args, entry.args) &&
      isDeepStrictEqual(transport.env, entry.env)
    )
      installed = { changed: false, backup: null };
    else {
      const saved = backup(file);
      const args = [
        "mcp",
        "add",
        "growmory",
        ...Object.entries(entry.env).flatMap(([k, v]) => [
          "--env",
          `${k}=${v}`,
        ]),
        "--",
        entry.command,
        ...entry.args,
      ];
      try {
        execute("codex", args, {
          env: cliEnv,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 15000,
        });
      } catch (error) {
        throw Error(
          error.code === "ENOENT"
            ? "找不到 codex 命令。ChatGPT 桌面端请在设置 → MCP 服务器中添加本机 stdio 配置；普通聊天无法代替这一步"
            : `Codex 配置失败，原有备份${saved ? "位于 " + saved : "未创建"}；请检查 Codex CLI`,
        );
      }
      installed = { changed: true, backup: saved };
    }
  } else
    installed = mergeConfig(
      file,
      client === "claude-code" ? { type: "stdio", ...entry } : entry,
    );
  return {
    status: "configured",
    client,
    configPath: file,
    ...installed,
    ...verified,
    message:
      "配置已就绪，独立 MCP 调用已验证。当前聊天需重新加载 MCP 后，再调用 growmory 的 list_records 验证；若工具未出现，重开聊天或重启客户端。",
  };
}
export function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--check") options.check = true;
    else if (key === "--url" || key === "--client") {
      if (!args[i + 1] || args[i + 1].startsWith("--"))
        throw Error(`${key} 缺少参数`);
      options[key.slice(2)] = args[++i];
    } else throw Error(`未知参数：${key}`);
  }
  return options;
}
if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(await setup(parseArgs(process.argv.slice(2))), null, 2),
    );
  } catch (error) {
    console.error(JSON.stringify({ status: "error", message: error.message }));
    process.exitCode = 1;
  }
}
