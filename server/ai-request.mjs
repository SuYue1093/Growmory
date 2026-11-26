import { randomUUID } from 'node:crypto';

// Keep each raw body in one log entry so concurrent calls can be paired by ID.
// Request headers are deliberately excluded: they contain provider credentials.
let currentRecorder = null;

export function setAiUsageRecorder(recorder) {
  currentRecorder = recorder;
}

export function getAiUsageRecorder() {
  return currentRecorder;
}

export async function aiRequest(scope, url, options, fetcher = fetch) {
  const id = randomUUID();
  const started = Date.now();
  const prefix = `[AI][${scope}][${id}]`;
  console.log(`${prefix} INPUT ${new Date(started).toISOString()}\n${options.body}`);

  let requestModel = "";
  try {
    if (typeof options?.body === "string") {
      const parsedBody = JSON.parse(options.body);
      if (parsedBody?.model) requestModel = String(parsedBody.model);
    }
  } catch {}

  const recorder = options?.recorder !== undefined ? options.recorder : currentRecorder;

  try {
    const response = await fetcher(url, options);
    const raw = await response.clone().text();
    const durationMs = Date.now() - started;
    console.log(`${prefix} OUTPUT HTTP ${response.status} ${durationMs}ms\n${raw}`);

    if (recorder && typeof recorder.record === "function") {
      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let responseModel = requestModel;
      let errorMessage = null;
      try {
        const json = JSON.parse(raw);
        if (json?.model) responseModel = json.model;
        if (json?.usage) {
          promptTokens = Number(json.usage.prompt_tokens) || 0;
          completionTokens = Number(json.usage.completion_tokens) || 0;
          totalTokens = Number(json.usage.total_tokens) || (promptTokens + completionTokens);
        }
        if (!response.ok) {
          errorMessage = json?.error?.message || json?.message || raw.slice(0, 200);
        }
      } catch {
        if (!response.ok) errorMessage = raw.slice(0, 200);
      }

      try {
        recorder.record({
          id,
          timestamp: new Date(started).toISOString(),
          scope,
          model: responseModel || requestModel || "unknown",
          status: response.ok ? "success" : "error",
          statusCode: response.status,
          durationMs,
          promptTokens,
          completionTokens,
          totalTokens,
          error: errorMessage,
          input: typeof options?.body === "string" ? options.body : (options?.body ? JSON.stringify(options.body) : ""),
          output: raw,
        });
      } catch (err) {
        console.error("[AI-Usage] 统计记录失败:", err.message);
      }
    }

    return response;
  } catch (error) {
    const durationMs = Date.now() - started;
    console.error(`${prefix} ERROR ${durationMs}ms\n${error.name}: ${error.message}`);

    if (recorder && typeof recorder.record === "function") {
      try {
        recorder.record({
          id,
          timestamp: new Date(started).toISOString(),
          scope,
          model: requestModel || "unknown",
          status: "error",
          statusCode: error.name === "TimeoutError" ? 408 : 500,
          durationMs,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          error: `${error.name}: ${error.message}`,
          input: typeof options?.body === "string" ? options.body : (options?.body ? JSON.stringify(options.body) : ""),
          output: `${error.name}: ${error.message}`,
        });
      } catch (err) {
        console.error("[AI-Usage] 统计记录失败:", err.message);
      }
    }

    throw error;
  }
}
