import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync, rmSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createEmptyAiUsage() {
  return {
    summary: {
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      lastUsedAt: null,
    },
    records: [],
  };
}

export function openAiUsage(filePath, { maxRecords = 200 } = {}) {
  const isMemory = !filePath || filePath === ":memory:";

  if (!isMemory) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  function readStored() {
    if (isMemory || !existsSync(filePath)) return null;
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"));
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
    return null;
  }

  let state = readStored() || createEmptyAiUsage();

  function persist() {
    if (isMemory) return;
    try {
      const temp = `${filePath}.tmp`;
      writeFileSync(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, filePath);
      chmodSync(filePath, 0o600);
    } catch (e) {
      console.error("[AI-Usage] 持久化失败:", e.message);
    }
  }

  function getUsage(filter = {}) {
    const range = filter.range || "all";
    const now = typeof filter.now === "number" ? filter.now : Date.now();
    let startTime = null;
    let endTime = null;

    if (range === "7d") {
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      endTime = now;
    } else if (range === "14d") {
      startTime = now - 14 * 24 * 60 * 60 * 1000;
      endTime = now;
    } else if (range === "30d") {
      startTime = now - 30 * 24 * 60 * 60 * 1000;
      endTime = now;
    } else if (range === "custom" || filter.startDate || filter.endDate) {
      if (filter.startDate) {
        const parsedStart = new Date(filter.startDate).getTime();
        if (!isNaN(parsedStart)) startTime = parsedStart;
      }
      if (filter.endDate) {
        // 包含当天结束时间
        const endStr = filter.endDate.length === 10 ? `${filter.endDate}T23:59:59.999` : filter.endDate;
        const parsedEnd = new Date(endStr).getTime();
        if (!isNaN(parsedEnd)) endTime = parsedEnd;
      }
    }

    let filtered = state.records;
    if (startTime !== null || endTime !== null) {
      filtered = filtered.filter((r) => {
        const t = new Date(r.timestamp).getTime();
        if (startTime !== null && t < startTime) return false;
        if (endTime !== null && t > endTime) return false;
        return true;
      });
    }

    // 若没有筛选，则直接使用整体 summary
    if (range === "all" && startTime === null && endTime === null) {
      return {
        summary: { ...state.summary },
        records: [...state.records],
        filter: { range: "all", startDate: null, endDate: null },
      };
    }

    const totalCalls = filtered.length;
    const successCalls = filtered.filter((r) => r.status === "success").length;
    const failedCalls = filtered.filter((r) => r.status === "error").length;
    const totalTokens = filtered.reduce((acc, r) => acc + (r.totalTokens || 0), 0);
    const promptTokens = filtered.reduce((acc, r) => acc + (r.promptTokens || 0), 0);
    const completionTokens = filtered.reduce((acc, r) => acc + (r.completionTokens || 0), 0);
    const lastUsedAt = filtered.length > 0 ? filtered[0].timestamp : null;

    return {
      summary: {
        totalCalls,
        successCalls,
        failedCalls,
        totalTokens,
        promptTokens,
        completionTokens,
        lastUsedAt,
      },
      records: filtered,
      filter: {
        range,
        startDate: filter.startDate || null,
        endDate: filter.endDate || null,
      },
      allSummary: { ...state.summary },
    };
  }

  function record(entry = {}) {
    const id = entry.id || randomUUID();
    const timestamp = entry.timestamp || new Date().toISOString();
    const scope = String(entry.scope || "unknown");
    const model = String(entry.model || "unknown");
    const isSuccess = entry.status === "success" || (entry.statusCode >= 200 && entry.statusCode < 300);
    const status = isSuccess ? "success" : "error";
    const statusCode = typeof entry.statusCode === "number" ? entry.statusCode : (isSuccess ? 200 : 500);
    const durationMs = Math.max(0, Math.round(Number(entry.durationMs) || 0));

    const promptTokens = Math.max(0, Math.round(Number(entry.promptTokens) || 0));
    const completionTokens = Math.max(0, Math.round(Number(entry.completionTokens) || 0));
    const totalTokens = Math.max(0, Math.round(Number(entry.totalTokens) || (promptTokens + completionTokens)));

    const maxContentLen = 30000;
    const input = typeof entry.input === "string"
      ? (entry.input.length > maxContentLen ? `${entry.input.slice(0, maxContentLen)}\n...[内容过长已截断]` : entry.input)
      : null;
    const output = typeof entry.output === "string"
      ? (entry.output.length > maxContentLen ? `${entry.output.slice(0, maxContentLen)}\n...[内容过长已截断]` : entry.output)
      : null;

    const recordItem = {
      id,
      timestamp,
      scope,
      model,
      status,
      statusCode,
      durationMs,
      promptTokens,
      completionTokens,
      totalTokens,
      error: entry.error ? String(entry.error).slice(0, 300) : null,
      input,
      output,
    };

    state.summary.totalCalls += 1;
    if (status === "success") {
      state.summary.successCalls += 1;
    } else {
      state.summary.failedCalls += 1;
    }
    state.summary.totalTokens += totalTokens;
    state.summary.promptTokens += promptTokens;
    state.summary.completionTokens += completionTokens;
    state.summary.lastUsedAt = timestamp;

    state.records.unshift(recordItem);
    if (state.records.length > maxRecords) {
      state.records = state.records.slice(0, maxRecords);
    }

    persist();
    return recordItem;
  }

  function clear() {
    state = createEmptyAiUsage();
    if (!isMemory && existsSync(filePath)) {
      try {
        rmSync(filePath, { force: true });
      } catch {}
    }
    return getUsage();
  }

  return {
    getUsage,
    record,
    clear,
  };
}
