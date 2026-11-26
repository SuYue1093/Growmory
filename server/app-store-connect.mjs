import { readAppleIcon } from "./apple-icon.mjs";
import { gunzipSync } from "node:zlib";
import { createPrivateKey, sign } from "node:crypto";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { retryAppleRead } from "./apple-read-retry.mjs";

export class AppleConnectionError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function validate(value) {
  if (!value || typeof value.issuerId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.issuerId) ||
      typeof value.keyId !== "string" || !/^[A-Z0-9]{10}$/.test(value.keyId))
    throw new AppleConnectionError("请填写有效的 Issuer ID 和 10 位 Key ID（团队 API Key）。");
  try {
    if (typeof value.privateKey !== "string" || value.privateKey.length > 20000 || !value.privateKey.includes("-----BEGIN PRIVATE KEY-----")) throw Error();
    const key = createPrivateKey(value.privateKey);
    if (key.type !== "private" || key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw Error();
  } catch { throw new AppleConnectionError("私钥无效，请上传 Apple 下载的 ES256 .p8 私钥。"); }
  return { issuerId: value.issuerId, keyId: value.keyId, privateKey: value.privateKey };
}
export function createAppleToken(credentials, now = Math.floor(Date.now() / 1000)) {
  const value = validate(credentials);
  const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${encode({ alg: "ES256", kid: value.keyId, typ: "JWT" })}.${encode({ iss: value.issuerId, iat: now, exp: now + 120, aud: "appstoreconnect-v1" })}`;
  return `${input}.${sign("sha256", Buffer.from(input), { key: value.privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")}`;
}
export function openAppleConnection(path, { fetcher = fetch } = {}) {
  let credentials = existsSync(path) ? validate(JSON.parse(readFileSync(path, "utf8"))) : null;
  if (credentials) chmodSync(path, 0o600);
  let lastCheckedAt = null;
  const status = () => ({ configured: !!credentials, issuerId: credentials?.issuerId || "", keyId: credentials?.keyId || "", lastCheckedAt });
  function session() {
    const current = currentCredentials();
    const check = () => {
      if (credentials !== current) throw new AppleConnectionError("连接配置已变更，请重新预览。", 409);
    };
    async function request(path, method = "GET", body, binary = false) {
      check();
      const url = new URL(path, "https://api.appstoreconnect.apple.com");
      const isTerritoryRead = method === "GET" && /^\/v2\/appAvailabilities\/[^/]+\/territoryAvailabilities$/.test(url.pathname);
      if (url.origin !== "https://api.appstoreconnect.apple.com" || (!url.pathname.startsWith("/v1/") && !isTerritoryRead)) throw new AppleConnectionError("Apple 请求地址无效。");
      let response, readBody;
      const send = () => {
        check();
        return fetcher(url.href, { method, headers: { Authorization: `Bearer ${createAppleToken(current)}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000), redirect: "error" });
      };
      try {
        response = await (method === "GET" ? retryAppleRead(send, async reply => {
          if (reply.status !== 204) readBody = binary ? await reply.arrayBuffer() : await reply.text();
          return reply;
        }) : send());
      }
      catch (error) {
        if (error instanceof AppleConnectionError) throw error;
        const code = error.cause?.code;
        const networkDetail = typeof code === "string" && /^(?:E[A-Z0-9_]+|UND_ERR_[A-Z_]+)$/.test(code) ? `（${code}）` : "";
        throw new AppleConnectionError(method === "GET"
          ? error.name === "TimeoutError" ? "Apple API 请求超时，请稍后重试。" : `无法连接 Apple API${networkDetail}，请检查网络后重试。`
          : "Apple 请求中断，结果尚未确认。请重新读取状态和预览后再操作。", 502);
      }
      if (binary && response.ok) {
        check();
        try {
          const bytes = Buffer.from(readBody ?? await response.arrayBuffer());
          return (bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 }) : bytes).toString("utf8");
        } catch { throw new AppleConnectionError("Apple 报表解压失败，请重新读取。", 502); }
      }
      let payload = null;
      if (response.status !== 204) {
        try { payload = readBody === undefined ? await response.json() : JSON.parse(readBody); } catch { if (response.ok) throw new AppleConnectionError("Apple 返回内容无效，请重新读取状态。", 502); }
      }
      if (!response.ok) {
        const messages = { ...(binary ? { 404: "此日期销售日报不可用，可能尚未生成或当天没有销售报表；请检查日期与供应商编号。" } : {}), 401: "Apple 认证失败，请核对 Issuer ID、Key ID、私钥及本机时间。", 403: "此 API Key 没有操作权限，请检查 Apple 账号角色及 App 访问权限。", 429: "Apple 请求过于频繁，请稍后重试。" };
        const details = Array.isArray(payload?.errors) ? payload.errors.map(e => e.detail || e.title || e.code).filter(x => typeof x === "string").join("；").slice(0, 1500) : "";
        throw new AppleConnectionError(messages[response.status] || `Apple 服务返回 ${response.status}${details ? `：${details}` : "，请稍后重试。"}`, 502);
      }
      check();
      return payload;
    }
    async function paginate(path) {
      const first = new URL(path, "https://api.appstoreconnect.apple.com");
      if (!first.searchParams.has("limit")) first.searchParams.set("limit", "200");
      let next = first.href;
      const seen = new Set(), data = [], included = [];
      while (next) {
        const url = new URL(next, first);
        if (url.origin !== first.origin || url.pathname !== first.pathname || seen.has(url.href)) throw new AppleConnectionError("Apple 返回的分页信息无效，请重试。", 502);
        seen.add(url.href);
        const payload = await request(url.href);
        if (!Array.isArray(payload?.data)) throw new AppleConnectionError("Apple 返回的列表无效。", 502);
        data.push(...payload.data); included.push(...(payload.included || []));
        next = payload.links?.next || null;
      }
      return { data, included };
    }
    return { request, paginate, check, report: path => request(path, "GET", undefined, true) };
  }
  async function list(path) { return (await session().paginate(path)).data; }
  function currentCredentials() {
    if (!credentials) throw new AppleConnectionError("请先保存 App Store Connect 凭据。", 409);
    return credentials;
  }
  return {
    status,
    session,
    save(patch) {
      const value = validate({ issuerId: patch.issuerId?.trim(), keyId: patch.keyId?.trim(), privateKey: patch.privateKey || (patch.keyId?.trim() === credentials?.keyId && patch.issuerId?.trim() === credentials?.issuerId ? credentials?.privateKey : undefined) });
      mkdirSync(dirname(path), { recursive: true });
      const temp = `${path}.tmp`;
      writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
      chmodSync(temp, 0o600);
      renameSync(temp, path);
      credentials = value;
      lastCheckedAt = null;
      return status();
    },
    disconnect() { rmSync(path, { force: true }); credentials = null; lastCheckedAt = null; return status(); },
    async apps() {
      const records = await list("/v1/apps");
      lastCheckedAt = new Date().toISOString();
      return { ...status(), apps: records.map(app => ({ id: app.id, name: app.attributes?.name || "", bundleId: app.attributes?.bundleId || "", sku: app.attributes?.sku || "" })) };
    },
    async icon(appId, versions) {
      return readAppleIcon(session(), fetcher, appId, versions);
    },
    async versions(appId) {
      if (typeof appId !== "string" || !/^[0-9]+$/.test(appId)) throw new AppleConnectionError("App Store ID 无效。");
      const reader = session();
      const records = (await reader.paginate(`/v1/apps/${appId}/appStoreVersions`)).data;
      const versions = [];
      for (const record of records) {
        if (typeof record.id !== "string" || !/^[a-zA-Z0-9-]+$/.test(record.id)) throw new AppleConnectionError("Apple 返回的版本 ID 无效。", 502);
        const localizations = (await reader.paginate(`/v1/appStoreVersions/${record.id}/appStoreVersionLocalizations`)).data;
        versions.push({ id: record.id, version: record.attributes?.versionString || "", platform: record.attributes?.platform || "", state: record.attributes?.appVersionState || record.attributes?.appStoreState || "", notes: localizations.map(item => ({ locale: item.attributes?.locale || "", body: item.attributes?.whatsNew || "" })) });
      }
      return { appId, syncedAt: new Date().toISOString(), versions };
    },
  };
}
