import { useEffect, useState } from "react";
import { Copy, Link2, Code2 } from "lucide-react";
import { useI18n, type Lang } from "./i18n.ts";

function localizeMcpPrompt(originalPrompt: string, lang: Lang) {
  if (lang === 'zh' || !originalPrompt) return originalPrompt;
  return originalPrompt
    .replace('请帮我将本机独立运行的 Growmory 系统接入为你当前 AI 环境可用的 MCP 工具，并完成连接验证。我授权你仅添加或更新名为 growmory 的 MCP 配置，保留你已有的其他 MCP 服务与配置。',
      'Please help me connect Growmory running locally on this machine to your current AI environment as an MCP tool and verify the connection. I authorize you to add or update only the MCP configuration named growmory, preserving your other existing MCP services and configurations.')
    .replace('### 1. 标准 STDIO 配置（直接写入或配置）', '### 1. Standard STDIO Configuration (Direct write or configure)')
    .replace('如果你的环境支持直接修改或加载 MCP 配置文件（如 Cursor、Windsurf、Trae、Claude Desktop / Code、VS Code、Cherry Studio、Chatbox 等），请将以下内容合并至你的 MCP 配置（如 mcp.json 或 claude_desktop_config.json 中的 mcpServers 节点）：',
      'If your environment supports editing or loading MCP configuration files directly (e.g. Cursor, Windsurf, Trae, Claude Desktop / Code, VS Code, Cherry Studio, Chatbox, etc.), please merge the following into your MCP configuration (such as mcpServers in mcp.json or claude_desktop_config.json):')
    .replace('### 2. 自动配置脚本（适用于具备本机终端权限的 Agent，如 Claude Code）', '### 2. Auto-configuration Script (For Agents with local terminal permissions, like Claude Code)')
    .replace('如果你有当前电脑的终端和文件操作权限，请先阅读安装脚本源码：', 'If you have terminal and file operation access on this machine, please read the setup script source first:')
    .replace('然后执行以下命令之一完成一键配置：', 'Then run one of the following commands to complete auto configuration:')
    .replace('### 3. 连接验证（必须执行）', '### 3. Connection Verification (Required)')
    .replace('配置完成后，请从当前聊天实际调用 growmory 的 list_records 工具，参数为 {"collection":"products","limit":5}。返回产品列表（或初始空列表 []）即表示连接成功并向我报告。不要使用普通 HTTP 请求或编造结果代替工具调用。',
      'After configuration, please call Growmory list_records tool directly from this conversation with {"collection":"products","limit":5}. Returning the product list (or empty list []) confirms the connection is successful. Do not use plain HTTP requests or fabricate results.')
    .replace('请只添加或修改 growmory 服务配置，保留用户已配置的其他 MCP 工具。', 'Please only add or modify the growmory configuration, preserving any other MCP tools already configured.');
}

export function McpSettings({
  notify,
  copy,
}: {
  notify: (message: string) => void;
  copy: (text: string) => Promise<void>;
}) {
  const { lang, t } = useI18n();
  const [connection, setConnection] = useState<{
    enabled: boolean;
    allowWrites: boolean;
    lastUsedAt: string | null;
    stdio?: unknown;
  } | null>(null);
  const [rawPrompt, setRawPrompt] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/mcp/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then(setConnection)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/mcp/setup")
      .then(async (r) => {
        if (!r.ok) throw Error(t("无法读取连接提示词", "Failed to fetch setup prompt"));
        setRawPrompt((await r.json()).prompt);
      })
      .catch((e) => setError((e as Error).message));
  }, [t]);

  const prompt = localizeMcpPrompt(rawPrompt, lang);

  const testPrompt = lang === 'en'
    ? 'Please call Growmory list_records from this conversation with {"collection":"products","limit":5}. An empty list also indicates success; if tools are not available, please state clearly rather than using plain HTTP requests.'
    : '请从当前会话实际调用 Growmory 的 list_records，参数 {"collection":"products","limit":5}。空列表也表示连接成功；工具不可用时请明确说明，不要通过普通 HTTP 请求替代测试。';

  return (
    <section className="panel padded mcp-settings">
      <div className="mcp-heading">
        <h2>
          <Link2 size={22} />
          {t("外部 Agent · MCP 连接", "External Agent · MCP Connection")}
        </h2>
      </div>
      <p className="body-copy">
        {t(
          "适用于 Claude Code、Cursor、Trae、Windsurf、VS Code、OpenAI、DeepSeek 等国内外常见具备 MCP 支持的 AI 客户端 / Agent。接入后，Agent 可直接在对话中检索产品、读取 ASO 与分析数据并协助创作。",
          "Compatible with Claude Code, Cursor, Trae, Windsurf, VS Code, OpenAI, DeepSeek, and other MCP-enabled AI clients/agents. Once connected, Agents can search products, read ASO and analytics, and assist with content creation directly in conversations."
        )}
      </p>

      <div className="setting-status">
        <span className={connection?.enabled ? "online" : "offline"} />
        {connection
          ? `${
              connection.enabled
                ? connection.allowWrites
                  ? t("服务已开启 · 读取与编辑", "Service Running · Read & Write")
                  : t("服务已开启 · 只读", "Service Running · Read Only")
                : t("服务已关闭", "Service Stopped")
            } · ${t("最近成功调用：", "Last Call: ")}${
              connection.lastUsedAt
                ? new Date(connection.lastUsedAt).toLocaleString()
                : t("尚无记录", "No records yet")
            }`
          : t("正在读取连接状态…", "Checking connection status...")}
      </div>

      <div className="mcp-content-expanded">
        <div className="mcp-steps-box">
          <ol className="chatgpt-steps">
            <li>
              <b>{t("复制连接提示词", "Copy Setup Prompt")}</b>：{t("直接点击下方按钮复制包含自动配置命令与标准 STDIO 的提示词。", "Click the button below to copy the prompt with auto-setup commands and standard STDIO config.")}
            </li>
            <li>
              <b>{t("发给你的 AI Agent", "Send to your AI Agent")}</b>：{t("粘贴发送给当前使用的 AI Agent（如 Claude Code、Cursor、Trae、Windsurf 等），由 Agent 自动写入配置。", "Paste and send to your AI Agent (e.g. Claude Code, Cursor, Windsurf), letting the Agent configure itself.")}
            </li>
            <li>
              <b>{t("验证连接生效", "Verify Connection")}</b>：{t("让 Agent 在会话中实际调用 list_records，返回产品列表（或初始空列表 []）即表示连接成功。", "Ask the Agent to call list_records in chat; returning products (or empty []) confirms success.")}
            </li>
          </ol>
        </div>

        <div className="asc-actions mcp-actions">
          <button
            className="button primary"
            disabled={!prompt || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await copy(prompt);
                notify(t("已复制连接提示词，请发给 AI Agent 自动配置与验证", "Setup prompt copied. Please send to AI Agent to configure and verify"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Copy size={16} /> {t("复制连接提示词", "Copy Setup Prompt")}
          </button>

          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              try {
                await copy(testPrompt);
                notify(t("已复制测试提示词", "Test prompt copied"));
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Copy size={16} /> {t("复制测试提示词", "Copy Test Prompt")}
          </button>

          {Boolean(connection?.stdio) && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={async () => {
                try {
                  await copy(JSON.stringify(connection?.stdio, null, 2));
                  notify(t("已复制 STDIO 配置 JSON，可直接用于手动配置", "STDIO JSON copied for manual configuration"));
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Code2 size={16} /> {t("复制 STDIO 配置 (JSON)", "Copy STDIO Config (JSON)")}
            </button>
          )}
        </div>

        {prompt && (
          <div className="mcp-preview-box">
            <div className="mcp-preview-header">
              <span>{t("连接提示词预览", "Setup Prompt Preview")}</span>
            </div>
            <pre className="mcp-preview-code">{prompt}</pre>
          </div>
        )}
      </div>

      {error && (
        <p className="setting-feedback" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
