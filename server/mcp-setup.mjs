import { fileURLToPath } from "node:url";
export const setupScriptPath = fileURLToPath(
  new URL("../scripts/connect-mcp.mjs", import.meta.url),
);
const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;
export function setupInstructions(config) {
  const entry = config.stdio.mcpServers.growmory;
  const base = entry.env.GROWMORY_URL;
  const command = `${quote(entry.command)} ${quote(setupScriptPath)} --url ${quote(base)}`;
  const project = fileURLToPath(new URL("../", import.meta.url));
  return {
    scriptPath: setupScriptPath,
    command,
    clients: [
      "chatgpt-desktop",
      "auto",
      "codex",
      "claude-code",
      "cursor",
      "windsurf",
      "trae",
      "claude-desktop",
    ],
    chatgptChat: {
      docsUrl:
        "https://developers.openai.com/api/docs/guides/custom-mcp-server",
      tunnelDocsUrl:
        "https://developers.openai.com/api/docs/guides/secure-mcp-tunnels",
      prompt: `请检查当前普通 Chat 会话是否实际具有 Growmory 的 MCP 工具。如果有，请实际调用 list_records，参数 {"collection":"products","limit":5}，返回产品名称。
如果当前工具中没有 growmory，不要声称已连接，不要通过回忆产品名称代替调用，也不要让我反复粘贴本机路径或重跑本机 STDIO 注册脚本。本机注册成功与当前 Chat 已加载工具是不同的状态。
请指导我使用能在当前 Chat 启用的插件或远程 MCP 连接。Growmory 当前仅运行在本机 ${base}，此地址不是公网服务地址，不能直接当作远程 MCP 地址使用。
可采用 OpenAI Secure MCP Tunnel 保持服务位于本机，或部署经过鉴权的远程 MCP；这需要先在目标账号完成连接与授权。不要编造隧道 ID、远程地址或授权结果，不要公开本机管理后台或关闭鉴权。
官方接入说明：https://developers.openai.com/api/docs/guides/custom-mcp-server
安全隧道说明：https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
只有在当前 Chat 实际调用工具成功后，才能报告连接成功。`,
    },
    chatgpt: {
      command: entry.command,
      args: entry.args,
      env: entry.env,
      docsUrl: "https://learn.chatgpt.com/docs/extend/mcp",
      prompt: `请帮我在 ChatGPT 桌面客户端连接本机 Growmory。请先检查你在当前聊天中实际可用的工具，不要把 ChatGPT 普通聊天当成有本机终端权限的编码代理。

1. 如果 growmory 的 MCP 工具已经可用，直接实际调用 list_records，参数 {"collection":"products","limit":5}，列出产品名称。只有这次工具调用成功，才能报告“当前聊天已连接”。
2. 如果你有当前电脑的终端和文件操作工具，我授权你仅添加或更新 growmory 的 MCP 配置。先阅读 ${setupScriptPath}，再运行：

${command} --client chatgpt-desktop

支持本机 MCP 的 ChatGPT 桌面端与同一主机上的 Codex 共享 MCP 配置。脚本会备份并保留其他配置，不变更访问权限或产品数据。成功后重新加载 MCP 工具，再从当前聊天调用 list_records 验证。不要自动退出客户端。
3. 如果你没有本机终端工具，不能执行该脚本；云端 Python、网页浏览工具和普通 HTTP 请求都不能代替本机执行。请直接指导我在支持本机 MCP 的 ChatGPT 桌面端中操作：设置 → MCP servers → Add server，名称 growmory，传输 STDIO，填写以下配置：

command: ${entry.command}
args: ${JSON.stringify(entry.args)}
env: ${JSON.stringify(entry.env, null, 2)}

保存后重新加载 MCP，重开聊天，再发送“调用 growmory 的 list_records 列出产品”。
4. 如果我的设置中没有 MCP servers，或只有远程自定义 MCP 入口，请明确说明尚不能通过此本机配置连接。localhost 地址不是远程服务地址；需要支持本机 MCP 的桌面环境，或另行配置安全隧道／远程 MCP。不要建议把本机 HTTP 地址当公网地址粘贴，也不要关闭鉴权或自动公开本机服务。

官方说明：https://learn.chatgpt.com/docs/extend/mcp
请明确区分“当前聊天调用已验证”“配置已写入但需重新加载”“当前聊天没有本机执行能力”。不要凭提示词声称已获得连接权限，不要输出连接密钥。`,
    },
    prompt: `请帮我将本机独立运行的 Growmory 系统接入为你当前 AI 环境可用的 MCP 工具，并完成连接验证。我授权你仅添加或更新名为 growmory 的 MCP 配置，保留你已有的其他 MCP 服务与配置。

### 1. 标准 STDIO 配置（直接写入或配置）
如果你的环境支持直接修改或加载 MCP 配置文件（如 Cursor、Windsurf、Trae、Claude Desktop / Code、VS Code、Cherry Studio、Chatbox 等），请将以下内容合并至你的 MCP 配置（如 mcp.json 或 claude_desktop_config.json 中的 mcpServers 节点）：

\`\`\`json
{
  "mcpServers": {
    "growmory": {
      "command": ${JSON.stringify(entry.command)},
      "args": ${JSON.stringify(entry.args)},
      "env": ${JSON.stringify(entry.env, null, 2)}
    }
  }
}
\`\`\`

### 2. 自动化配置命令（若具备本机终端权限）
如果你具备本机命令行执行能力，可直接运行以下命令进行配置（将 CLIENT 替换为你当前的客户端标识：cursor、windsurf、trae、claude-code、claude-desktop、codex 或 chatgpt-desktop）：

${command} --client CLIENT

注：脚本会自动备份原有配置并仅合并 growmory 服务，不会更改其它项。若本地脚本不存在，可先从 ${base}/api/mcp/setup-script 下载后执行。若服务未启动，项目位于 ${project}，请先在本机终端启动。

### 3. 连接验证
配置完成后，请重新加载你的 MCP 工具，并从当前聊天实际调用 growmory 的 list_records 工具进行验证：
- 工具名称：list_records
- 参数：{"collection":"products","limit":5}

调用成功并返回产品列表（初次使用返回空列表 [] 也表示连接成功）即代表连接完成。请简要告诉我已配置的客户端与实际验证结果。`,
  };
}
