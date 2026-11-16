import { useEffect, useState } from "react";
import { Sparkles, Eye, EyeOff, Activity, Trash2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n, t as globalT } from "./i18n.ts";

type AiSettingsData = {
  configured: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyMasked: string;
  source: string;
};

const getPresets = (t = globalT) => [
  { id: "custom", name: t("自定义 (兼容 OpenAI 规范)", "Custom (OpenAI Compatible)"), baseUrl: "", model: "" },
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  { id: "moonshot", name: "Kimi (Moonshot)", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  { id: "zhipu", name: t("智谱 GLM", "Zhipu GLM"), baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "siliconflow", name: t("硅基流动 (SiliconFlow)", "SiliconFlow"), baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3" },
  { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat" },
  { id: "ollama", name: t("Ollama (本机服务)", "Ollama (Local Service)"), baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
];

export function AiSettings({
  notify,
  onAiChange,
}: {
  notify: (message: string) => void;
  onAiChange?: (ai: { configured: boolean; model: string }) => void;
}) {
  const { t } = useI18n();
  const presets = getPresets(t);
  const [data, setData] = useState<AiSettingsData | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [selectedPreset, setSelectedPreset] = useState("custom");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState("");

  const detectPreset = (url: string) => {
    const match = presets.find(p => p.id !== "custom" && p.baseUrl === url.trim());
    return match ? match.id : "custom";
  };

  const load = async () => {
    try {
      const res = await fetch("/api/ai/settings");
      if (!res.ok) throw new Error(t("无法读取 AI 配置", "Failed to load AI settings"));
      const result: AiSettingsData = await res.json();
      setData(result);
      setBaseUrl(result.baseUrl || "https://api.openai.com/v1");
      setModel(result.model || "gpt-4.1-mini");
      setApiKey("");
      setSelectedPreset(detectPreset(result.baseUrl || ""));
      onAiChange?.({ configured: result.configured, model: result.model });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handlePresetChange = (presetId: string) => {
    setSelectedPreset(presetId);
    const found = presets.find(p => p.id === presetId);
    if (found && found.id !== "custom") {
      setBaseUrl(found.baseUrl);
      setModel(found.model);
    }
    setTestResult(null);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey || undefined,
          model,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || t("保存失败", "Failed to save"));
      setData(result);
      setApiKey("");
      notify(t("AI 服务配置已保存", "AI service settings saved"));
      onAiChange?.({ configured: result.configured, model: result.model });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey || undefined,
          model,
        }),
      });
      const result = await res.json();
      if (res.ok && result.ok) {
        setTestResult({ ok: true, message: result.message || t("测试连接成功", "Connection successful") });
      } else {
        setTestResult({ ok: false, message: result.error || t("连接测试失败", "Connection test failed") });
      }
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message || t("网络请求失败", "Network request failed") });
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!confirm(t("确定要清除已保存的 AI 配置吗？", "Are you sure you want to clear saved AI settings?"))) return;
    setBusy(true);
    setError("");
    setTestResult(null);
    try {
      const res = await fetch("/api/ai/settings", { method: "DELETE" });
      const result = await res.json();
      setData(result);
      setApiKey("");
      setBaseUrl("https://api.openai.com/v1");
      setModel("gpt-4.1-mini");
      setSelectedPreset("custom");
      notify(t("已清除 AI 配置", "AI settings cleared"));
      onAiChange?.({ configured: result.configured, model: result.model });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel padded ai-settings-panel">
      <div className="mcp-heading">
        <h2>
          <Sparkles size={22} />
          {t("站内 AI 服务", "In-App AI Service")}
        </h2>
      </div>
      <p className="body-copy">
        {t("直接在网站中配置大模型服务，用于生成版本更新说明、优化 ASO 方案及产品数据分析。无需手动修改 .env 或重启服务。", "Configure LLM services directly in the app to generate release notes, optimize ASO copy, and analyze data. No .env edits or restarts required.")}
      </p>

      <div className="setting-status">
        <span className={data?.configured ? "online" : "offline"} />
        {data?.configured
          ? `${t("已配置 · ", "Configured · ")}${data.model} ${data.source === "env" ? t("（来源：.env 环境变量）", "(source: .env)") : t("（已在本机保存）", "(saved locally)")}`
          : t("尚未配置", "Not configured")}
      </div>

      <form onSubmit={handleSave} className="asc-fields">
        <label className="field">
          <span>{t("快捷服务预设", "Service Presets")}</span>
          <select
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>{t("API 服务地址 (Base URL)", "API Base URL")}</span>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setSelectedPreset("custom");
              setTestResult(null);
            }}
            placeholder="https://api.openai.com/v1"
            required
          />
          <small>{t("兼容 OpenAI Chat Completions 规范的根地址，通常以 /v1 结尾", "Root address compatible with OpenAI Chat Completions, typically ending in /v1")}</small>
        </label>

        <label className="field">
          <span>
            {t("API 密钥 (API Key)", "API Key")}
            {data?.hasKey && <i className="saved-badge">{t("（已保存有效密钥）", "(Valid key saved)")}</i>}
          </span>
          <div className="input-with-action">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder={
                data?.hasKey
                  ? `${t("已配置：", "Configured: ")}${data.keyMasked}${t("（留空则保持不变）", " (leave blank to keep)")}`
                  : t("输入 API Key，例如 sk-...", "Enter API Key, e.g. sk-...")
              }
            />
            <button
              type="button"
              className="icon-button"
              title={showKey ? t("隐藏密钥", "Hide key") : t("显示密钥", "Show key")}
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <small>{t("密钥仅保存在本机数据目录（文件权限 0600），不会上传给第三方，生成时直连服务商", "Keys are stored locally with 0600 permissions, never sent to third parties, and connect directly to providers.")}</small>
        </label>

        <label className="field">
          <span>{t("模型名称 (Model)", "Model Name")}</span>
          <input
            type="text"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setSelectedPreset("custom");
              setTestResult(null);
            }}
            placeholder={t("例如 gpt-4.1-mini、deepseek-chat", "e.g. gpt-4.1-mini, deepseek-chat")}
            required
          />
          <small>{t("指定发起调用时的模型标识（如 deepseek-chat、gpt-4.1-mini、glm-4-flash）", "Model identifier for API calls (e.g. deepseek-chat, gpt-4.1-mini, glm-4-flash)")}</small>
        </label>

        {testResult && (
          <div className={`ai-test-result ${testResult.ok ? "success" : "error"}`}>
            {testResult.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{testResult.message}</span>
          </div>
        )}

        {error && (
          <div className="ai-test-result error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="asc-actions">
          <button type="submit" className="button primary" disabled={busy}>
            <Save size={15} />
            {t("保存配置", "Save Settings")}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={handleTest}
            disabled={busy || (!apiKey && !data?.hasKey)}
          >
            <Activity size={15} />
            {busy ? t("处理中...", "Processing...") : t("测试连接", "Test Connection")}
          </button>
          {data?.configured && (
            <button
              type="button"
              className="button danger-subtle"
              onClick={handleClear}
              disabled={busy}
            >
              <Trash2 size={15} />
              {t("清除配置", "Clear Settings")}
            </button>
          )}
        </div>
      </form>

      <div className="setting-divider" />

      <details>
        <summary>{t("常见模型服务配置指引", "Configuration Guide for Common Models")}</summary>
        <div className="ai-providers-guide">
          <p className="body-copy">
            {t("Growmory 站内 AI 功能支持任意兼容 /v1/chat/completions 协议的大模型服务：", "Growmory supports any LLM service compatible with the /v1/chat/completions protocol:")}
          </p>
          <ul>
            <li>
              <strong>DeepSeek：</strong>Base URL: <code>https://api.deepseek.com</code>, Model: <code>deepseek-chat</code>
            </li>
            <li>
              <strong>Kimi (Moonshot)：</strong>Base URL: <code>https://api.moonshot.cn/v1</code>, Model: <code>moonshot-v1-8k</code>
            </li>
            <li>
              <strong>{t("智谱 GLM", "Zhipu GLM")}：</strong>Base URL: <code>https://open.bigmodel.cn/api/paas/v4</code>, Model: <code>glm-4-flash</code>
            </li>
            <li>
              <strong>{t("硅基流动", "SiliconFlow")}：</strong>Base URL: <code>https://api.siliconflow.cn/v1</code>, Model: <code>deepseek-ai/DeepSeek-V3</code>
            </li>
            <li>
              <strong>{t("Ollama 本地模型", "Ollama Local Model")}：</strong>Base URL: <code>http://localhost:11434/v1</code>, Model: <code>qwen2.5:7b</code>
            </li>
          </ul>
        </div>
      </details>
    </section>
  );
}
