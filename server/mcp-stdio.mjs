// Local MCP entry. Keep stdout exclusively for JSON-RPC.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./mcp-tools.mjs";
const base = process.env.GROWMORY_URL || "http://127.0.0.1:5173";
const config =
  process.env.MCP_CONFIG_PATH ||
  fileURLToPath(new URL("../data/mcp-access.json", import.meta.url));
const server = createMcpServer(async (name, args) => {
  let token;
  try {
    token = JSON.parse(readFileSync(config, "utf8")).token;
  } catch {
    throw Error("请先启动 Growmory 并打开工作区设置中的 MCP 连接");
  }
  let response;
  try {
    response = await fetch(`${base}/api/mcp/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, args }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error("无法连接 Growmory，请先启动本机工作台");
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "MCP 操作失败");
  return result;
});
await server.connect(new StdioServerTransport());
