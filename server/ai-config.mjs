import { aiRequest } from './ai-request.mjs';
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync, rmSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function openAiConfig(filePath, { env = process.env, fetcher = fetch } = {}) {
  mkdirSync(dirname(filePath), { recursive: true });

  function readStored() {
    if (!existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return null;
  }

  function get() {
    const stored = readStored();
    const apiKey = (stored?.apiKey ?? env.AI_API_KEY ?? "").trim();
    const baseUrl = (stored?.baseUrl ?? env.AI_BASE_URL ?? "https://api.openai.com/v1").trim();
    const model = (stored?.model ?? env.AI_MODEL ?? "gpt-4.1-mini").trim();
    const configured = !!apiKey;
    const source = stored?.apiKey ? "file" : env.AI_API_KEY ? "env" : "none";
    return {
      configured,
      baseUrl: baseUrl || "https://api.openai.com/v1",
      apiKey,
      model: model || "gpt-4.1-mini",
      source,
    };
  }

  function status() {
    const current = get();
    return {
      configured: current.configured,
      baseUrl: current.baseUrl,
      model: current.model,
      hasKey: !!current.apiKey,
      keyMasked: maskApiKey(current.apiKey),
      source: current.source,
    };
  }

  function save(patch = {}) {
    const currentStored = readStored() || {};
    const baseUrl = patch.baseUrl !== undefined ? String(patch.baseUrl).trim() : (currentStored.baseUrl || "");
    const model = patch.model !== undefined ? String(patch.model).trim() : (currentStored.model || "gpt-4.1-mini");

    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        if (!["http:", "https:"].includes(u.protocol)) {
          throw new Error();
        }
      } catch {
        throw new Error("服务地址格式无效，必须以 http:// 或 https:// 开头");
      }
    }

    let apiKey = currentStored.apiKey || "";
    if (patch.apiKey !== undefined && patch.apiKey !== null) {
      const trimmed = String(patch.apiKey).trim();
      if (trimmed) {
        apiKey = trimmed;
      } else if (patch.clearKey) {
        apiKey = "";
      }
    }

    const value = {
      baseUrl: baseUrl || "https://api.openai.com/v1",
      apiKey,
      model: model || "gpt-4.1-mini",
      updatedAt: new Date().toISOString(),
    };

    const temp = `${filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, filePath);
    chmodSync(filePath, 0o600);

    return status();
  }

  function clear() {
    if (existsSync(filePath)) {
      rmSync(filePath, { force: true });
    }
    return status();
  }

  async function testConnection(params = {}) {
    const current = get();
    const baseUrl = (params.baseUrl || current.baseUrl || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    const apiKey = (params.apiKey !== undefined && params.apiKey !== null && String(params.apiKey).trim() !== ""
      ? String(params.apiKey).trim()
      : current.apiKey) || "";
    const model = (params.model || current.model || "gpt-4.1-mini").trim();

    if (!apiKey) {
      return { ok: false, error: "请先填写 API 密钥（API Key）" };
    }

    try {
      const u = new URL(baseUrl);
      if (!["http:", "https:"].includes(u.protocol)) {
        return { ok: false, error: "服务地址无效，必须以 http:// 或 https:// 开头" };
      }
    } catch {
      return { ok: false, error: "服务地址格式无效，请检查 URL" };
    }

    try {
      const response = await aiRequest('connection-test', `${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      }, fetcher);

      if (!response.ok) {
        let errorDetail = "";
        try {
          const errJson = await response.json();
          errorDetail = errJson.error?.message || errJson.message || JSON.stringify(errJson);
        } catch {
          errorDetail = await response.text();
        }
        if (response.status === 401) {
          return { ok: false, status: 401, error: `认证失败 (401)：API 密钥无效或未授权${errorDetail ? ` - ${errorDetail.slice(0, 200)}` : ""}` };
        }
        if (response.status === 404) {
          return { ok: false, status: 404, error: `服务地址未找到 (404)：请检查 Base URL 是否正确（通常需要包含 /v1）` };
        }
        if (response.status === 429) {
          return { ok: false, status: 429, error: `请求受限或额度不足 (429)${errorDetail ? ` - ${errorDetail.slice(0, 200)}` : ""}` };
        }
        return {
          ok: false,
          status: response.status,
          error: `AI 服务返回 ${response.status}${errorDetail ? `：${errorDetail.slice(0, 200)}` : ""}`,
        };
      }

      return { ok: true, message: `连接成功，模型 [${model}] 正常响应` };
    } catch (e) {
      if (e.name === "TimeoutError") {
        return { ok: false, error: "连接超时 (15s)，请检查网络或服务地址是否可达" };
      }
      return { ok: false, error: `连接失败：${e.message || "无法访问服务地址"}` };
    }
  }

  return {
    get,
    status,
    save,
    clear,
    testConnection,
  };
}
