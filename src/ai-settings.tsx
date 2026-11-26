import { useEffect, useState } from "react";
import {
  Sparkles,
  Eye,
  EyeOff,
  Activity,
  Trash2,
  Save,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  RotateCw,
  Zap,
  Clock,
  Calendar,
  X,
  Copy,
  FileText,
} from "lucide-react";
import { useI18n, t as globalT } from "./i18n.ts";

type AiSettingsData = {
  configured: boolean;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  keyMasked: string;
  source: string;
};

type AiUsageRecord = {
  id: string;
  timestamp: string;
  scope: string;
  model: string;
  status: "success" | "error";
  statusCode: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  error: string | null;
  input?: string | null;
  output?: string | null;
};

type AiUsageData = {
  summary: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    lastUsedAt: string | null;
  };
  records: AiUsageRecord[];
  filter?: {
    range: string;
    startDate: string | null;
    endDate: string | null;
  };
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

const getScopeLabel = (scope: string, t: (zh: string, en: string) => string) => {
  switch (scope) {
    case "release-notes":
      return t("版本说明生成", "Release Notes");
    case "document-revision":
      return t("资料文档修订", "Doc Revision");
    case "aso-generate":
      return t("ASO 文案生成", "ASO Copy");
    case "aso-media-diagnosis":
      return t("ASO 媒体诊断", "ASO Media Diagnosis");
    case "generate-task":
      return t("报告划词待办", "Report Quote Task");
    case "connection-test":
      return t("连接测试", "Connection Test");
    default:
      return scope;
  }
};

const formatTokens = (num: number) => {
  return Number(num || 0).toLocaleString();
};

const formatTime = (isoString?: string | null) => {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return isoString;
  }
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatPrettyJson = (raw?: string | null) => {
  if (!raw) return "-";
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
};

const getTodayStr = () => new Date().toISOString().slice(0, 10);
const getDaysAgoStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

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

  // 用量记录状态与时间段筛选
  const [usageData, setUsageData] = useState<AiUsageData | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [range, setRange] = useState<"7d" | "14d" | "30d" | "custom" | "all">("7d");
  const [startDate, setStartDate] = useState(() => getDaysAgoStr(7));
  const [endDate, setEndDate] = useState(() => getTodayStr());

  // 详情弹窗状态
  const [selectedRecord, setSelectedRecord] = useState<AiUsageRecord | null>(null);
  const [detailTab, setDetailTab] = useState<"input" | "output">("input");

  // 支持 ESC 关闭弹窗
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedRecord(null);
    };
    if (selectedRecord) {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }
  }, [selectedRecord]);

  const detectPreset = (url: string) => {
    const match = presets.find(p => p.id !== "custom" && p.baseUrl === url.trim());
    return match ? match.id : "custom";
  };

  const loadUsage = async (override?: { range?: string; startDate?: string; endDate?: string }) => {
    const currentRange = override?.range ?? range;
    const currentStart = override?.startDate ?? startDate;
    const currentEnd = override?.endDate ?? endDate;

    try {
      setLoadingUsage(true);
      const params = new URLSearchParams();
      params.set("range", currentRange);
      if (currentRange === "custom" || (currentStart && currentEnd)) {
        if (currentStart) params.set("startDate", currentStart);
        if (currentEnd) params.set("endDate", currentEnd);
      }
      const res = await fetch(`/api/ai/usage?${params.toString()}`);
      if (res.ok) {
        const u: AiUsageData = await res.json();
        setUsageData(u);
      }
    } catch {
      // 忽略用量加载偶发异常
    } finally {
      setLoadingUsage(false);
    }
  };

  const handleRangeChange = (newRange: "7d" | "14d" | "30d" | "custom" | "all") => {
    setRange(newRange);
    let newStart = startDate;
    let newEnd = endDate;
    if (newRange === "7d") {
      newStart = getDaysAgoStr(7);
      newEnd = getTodayStr();
    } else if (newRange === "14d") {
      newStart = getDaysAgoStr(14);
      newEnd = getTodayStr();
    } else if (newRange === "30d") {
      newStart = getDaysAgoStr(30);
      newEnd = getTodayStr();
    }
    setStartDate(newStart);
    setEndDate(newEnd);
    void loadUsage({ range: newRange, startDate: newStart, endDate: newEnd });
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
    if (start && end) {
      void loadUsage({ range: "custom", startDate: start, endDate: end });
    }
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
      if (result.configured) {
        void loadUsage();
      }
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
      if (result.configured) {
        void loadUsage();
      }
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
      // 测试连接也是一次内部 AI 调用，测试完成后刷新用量统计
      void loadUsage();
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

  const handleClearUsage = async () => {
    if (!confirm(t("确定要清空所有站内 AI 用量统计与历史记录吗？", "Are you sure you want to clear all in-app AI usage statistics and history?"))) return;
    try {
      const res = await fetch("/api/ai/usage", { method: "DELETE" });
      if (res.ok) {
        const u = await res.json();
        setUsageData(u);
        notify(t("已清空用量统计与记录", "Usage statistics and records cleared"));
      }
    } catch {
      notify(t("清空失败", "Failed to clear usage"));
    }
  };

  const handleCopy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      notify(t("已复制到剪贴板", "Copied to clipboard"));
    } catch {
      notify(t("复制失败", "Failed to copy"));
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

      {/* 如果已配置站内 AI，在下方显示用量记录模块 */}
      {data?.configured && (
        <div className="ai-usage-module">
          <div className="setting-divider" />
          <div className="ai-usage-header">
            <div className="ai-usage-title">
              <BarChart3 size={18} />
              <h3>{t("用量统计与调用记录", "Usage Statistics & Records")}</h3>
            </div>
            <div className="ai-usage-actions">
              <button
                type="button"
                className="button secondary mini-button"
                onClick={() => void loadUsage()}
                disabled={loadingUsage}
                title={t("刷新用量记录", "Refresh Usage Records")}
              >
                <RotateCw size={13} className={loadingUsage ? "animate-spin" : ""} />
                {t("刷新", "Refresh")}
              </button>
              {Boolean(usageData && usageData.summary.totalCalls > 0) && (
                <button
                  type="button"
                  className="button secondary mini-button danger-hover"
                  onClick={handleClearUsage}
                  title={t("清空用量记录", "Clear Usage Records")}
                >
                  <Trash2 size={13} />
                  {t("清空记录", "Clear Records")}
                </button>
              )}
            </div>
          </div>

          {/* 时间段筛选栏：近7天、近14天、近30天、自定义时间段、全部 */}
          <div className="ai-usage-filter-bar" role="toolbar" aria-label={t("用量统计时间段筛选", "Usage Date Range Filter")}>
            <div className="ai-usage-filter-pills">
              <div className="ai-usage-filter-label">
                <Calendar size={13} />
                <span>{t("统计时间段：", "Period:")}</span>
              </div>
              <button
                type="button"
                className={`filter-pill-btn ${range === "7d" ? "active" : ""}`}
                onClick={() => handleRangeChange("7d")}
              >
                {t("近7天", "Past 7 Days")}
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${range === "14d" ? "active" : ""}`}
                onClick={() => handleRangeChange("14d")}
              >
                {t("近14天", "Past 14 Days")}
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${range === "30d" ? "active" : ""}`}
                onClick={() => handleRangeChange("30d")}
              >
                {t("近30天", "Past 30 Days")}
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${range === "custom" ? "active" : ""}`}
                onClick={() => handleRangeChange("custom")}
              >
                {t("自定义时间段", "Custom Range")}
              </button>
              <button
                type="button"
                className={`filter-pill-btn ${range === "all" ? "active" : ""}`}
                onClick={() => handleRangeChange("all")}
              >
                {t("全部", "All")}
              </button>
            </div>

            {/* 自定义时间段输入控件 */}
            {range === "custom" && (
              <div className="ai-usage-custom-dates">
                <label className="custom-date-field">
                  <span>{t("开始日期", "Start Date")}</span>
                  <input
                    type="date"
                    value={startDate}
                    max={endDate || getTodayStr()}
                    onChange={(e) => handleCustomDateChange(e.target.value, endDate)}
                  />
                </label>
                <span className="date-separator">{t("至", "to")}</span>
                <label className="custom-date-field">
                  <span>{t("结束日期", "End Date")}</span>
                  <input
                    type="date"
                    value={endDate}
                    min={startDate}
                    max={getTodayStr()}
                    onChange={(e) => handleCustomDateChange(startDate, e.target.value)}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="workspace-overview ai-usage-overview">
            <div className="overview-number">
              <span>
                <Activity size={14} />
                {t("所选时段调用", "Period Calls")}
              </span>
              <strong>{usageData?.summary.totalCalls ?? 0}</strong>
              <small className="overview-subtext">
                {`${usageData?.summary.successCalls ?? 0} ${t("成功", "ok")} · ${usageData?.summary.failedCalls ?? 0} ${t("失败", "fail")}`}
              </small>
            </div>

            <div className="overview-number">
              <span>
                <Zap size={14} />
                {t("所选时段 Token", "Period Tokens")}
              </span>
              <strong>{formatTokens(usageData?.summary.totalTokens ?? 0)}</strong>
              <small className="overview-subtext">
                {t("时段内输入输出总和", "Prompt & completion in period")}
              </small>
            </div>

            <div className="overview-number">
              <span>
                <Sparkles size={14} />
                {t("输入 / 输出 Token", "Prompt / Completion")}
              </span>
              <strong className="tokens-split">
                {formatTokens(usageData?.summary.promptTokens ?? 0)} / {formatTokens(usageData?.summary.completionTokens ?? 0)}
              </strong>
              <small className="overview-subtext">
                {t("输入提示词 / 生成回复", "Prompt / Generated")}
              </small>
            </div>

            <div className="overview-number">
              <span>
                <Clock size={14} />
                {t("最近调用时间", "Last Used")}
              </span>
              <strong className="time-strong">
                {usageData?.summary.lastUsedAt ? formatTime(usageData.summary.lastUsedAt) : t("尚未调用", "Never")}
              </strong>
              <small className="overview-subtext">
                {usageData?.summary.totalCalls ? t("时段内最近交互", "Latest call in period") : t("该时段暂无调用", "No call in period")}
              </small>
            </div>
          </div>

          <div className="ai-usage-records-section">
            <div className="ai-usage-records-title">
              <h4>{t("调用历史记录", "Call History")}</h4>
              {Boolean(usageData?.records.length) && (
                <span className="count-badge">
                  {t(`时段内共 ${usageData!.records.length} 条记录`, `${usageData!.records.length} records in period`)}
                </span>
              )}
            </div>

            {(!usageData || usageData.records.length === 0) ? (
              <div className="ai-usage-empty">
                <p>
                  {range === "all"
                    ? t("暂无调用记录。当在站内生成版本更新说明、优化 ASO 或进行连接测试时，每次调用均会自动统计。", "No usage records yet. Invocations for release notes, ASO copy, or connectivity tests will be tracked here in real time.")
                    : t("所选时间段内暂无站内 AI 调用记录。您可以切换时间范围或选择全部查看历史记录。", "No AI invocations found for the selected time range. Switch time range or select 'All' to view historical records.")}
                </p>
              </div>
            ) : (
              <div className="trend-table ai-usage-table-wrap">
                <table className="ai-usage-table">
                  <thead>
                    <tr>
                      <th>{t("时间", "Time")}</th>
                      <th>{t("场景", "Scope")}</th>
                      <th>{t("模型", "Model")}</th>
                      <th>{t("状态", "Status")}</th>
                      <th>{t("耗时", "Latency")}</th>
                      <th>{t("Token 消耗 (输入 / 输出 / 总量)", "Tokens (In / Out / Total)")}</th>
                      <th className="text-right">{t("操作", "Action")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usageData.records.map((r) => (
                      <tr key={r.id}>
                        <td className="usage-time-cell">{formatTime(r.timestamp)}</td>
                        <td>
                          <span className="scope-tag">{getScopeLabel(r.scope, t)}</span>
                        </td>
                        <td>
                          <code className="model-badge">{r.model}</code>
                        </td>
                        <td>
                          <span className={`status-pill ${r.status === "success" ? "status-success" : "status-error"}`} title={r.error || undefined}>
                            {r.status === "success" ? t("成功", "Success") : `${t("失败", "Failed")} (${r.statusCode})`}
                          </span>
                        </td>
                        <td className="usage-num-cell">{formatDuration(r.durationMs)}</td>
                        <td className="usage-num-cell">
                          <span className="tokens-detail" title={t(`输入: ${formatTokens(r.promptTokens)} | 输出: ${formatTokens(r.completionTokens)}`, `In: ${formatTokens(r.promptTokens)} | Out: ${formatTokens(r.completionTokens)}`)}>
                            {formatTokens(r.promptTokens)} / {formatTokens(r.completionTokens)} <b className="total-token-bold">({formatTokens(r.totalTokens)})</b>
                          </span>
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="button secondary mini-button"
                            onClick={() => {
                              setSelectedRecord(r);
                              setDetailTab("input");
                            }}
                            title={t("查看输入与输出详情", "View Input & Output Details")}
                          >
                            <FileText size={12} />
                            {t("详情", "Details")}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 弹窗：查看输入输出详情 */}
      {selectedRecord && (
        <div className="modal-backdrop" onClick={() => setSelectedRecord(null)}>
          <div className="modal-box ai-usage-detail-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760, width: "95%" }}>
            <div className="modal-header">
              <div className="detail-modal-title-group">
                <div className="detail-modal-title">
                  <Sparkles size={18} />
                  <h3>{t("站内 AI 调用详情", "In-App AI Invocation Details")}</h3>
                </div>
                <div className="detail-modal-badges">
                  <span className="scope-tag">{getScopeLabel(selectedRecord.scope, t)}</span>
                  <code className="model-badge">{selectedRecord.model}</code>
                  <span className={`status-pill ${selectedRecord.status === "success" ? "status-success" : "status-error"}`}>
                    {selectedRecord.status === "success" ? t("成功", "Success") : `${t("失败", "Failed")} (${selectedRecord.statusCode})`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedRecord(null)}
                aria-label={t("关闭", "Close")}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body ai-usage-detail-body">
              <div className="detail-meta-grid">
                <div>
                  <span className="meta-label">{t("调用时间", "Time")}</span>
                  <span className="meta-val">{formatTime(selectedRecord.timestamp)}</span>
                </div>
                <div>
                  <span className="meta-label">{t("响应耗时", "Latency")}</span>
                  <span className="meta-val">{formatDuration(selectedRecord.durationMs)}</span>
                </div>
                <div>
                  <span className="meta-label">{t("Token 消耗", "Tokens")}</span>
                  <span className="meta-val">
                    {formatTokens(selectedRecord.totalTokens)} ({t("输入", "In")}: {formatTokens(selectedRecord.promptTokens)} · {t("输出", "Out")}: {formatTokens(selectedRecord.completionTokens)})
                  </span>
                </div>
                <div>
                  <span className="meta-label">{t("调用 ID", "Call ID")}</span>
                  <span className="meta-val mono-id" title={selectedRecord.id}>
                    {selectedRecord.id.slice(0, 8)}...
                  </span>
                </div>
              </div>

              {selectedRecord.error && (
                <div className="ai-test-result error detail-error-banner">
                  <AlertCircle size={16} />
                  <span>{selectedRecord.error}</span>
                </div>
              )}

              <div className="detail-tabs">
                <button
                  type="button"
                  className={`detail-tab-btn ${detailTab === "input" ? "active" : ""}`}
                  onClick={() => setDetailTab("input")}
                >
                  {t("请求输入 (Input / Prompt)", "Request Input (Prompt)")}
                </button>
                <button
                  type="button"
                  className={`detail-tab-btn ${detailTab === "output" ? "active" : ""}`}
                  onClick={() => setDetailTab("output")}
                >
                  {t("模型输出 (Output / Response)", "Model Output (Response)")}
                </button>
              </div>

              <div className="detail-content-box">
                <div className="detail-box-header">
                  <span className="detail-box-label">
                    {detailTab === "input"
                      ? t("发送至大模型的完整请求 Body (已脱敏 API Key)", "Full Request Body Sent to Model (API Key Excluded)")
                      : t("上游大模型返回的原始输出或生成结果", "Raw Upstream Output or Generation")}
                  </span>
                  <button
                    type="button"
                    className="button secondary mini-button"
                    onClick={() =>
                      handleCopy(
                        detailTab === "input" ? selectedRecord.input || "" : selectedRecord.output || ""
                      )
                    }
                  >
                    <Copy size={13} />
                    {t("复制内容", "Copy Content")}
                  </button>
                </div>
                <pre className="detail-code-pre">
                  {detailTab === "input"
                    ? formatPrettyJson(selectedRecord.input)
                    : formatPrettyJson(selectedRecord.output)}
                </pre>
              </div>
            </div>

            <div className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setSelectedRecord(null)}
              >
                {t("关闭", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}

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
