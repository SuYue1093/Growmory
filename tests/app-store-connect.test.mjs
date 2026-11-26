import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { mkdtempSync, statSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppleToken, openAppleConnection } from "../server/app-store-connect.mjs";
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const credentials = { issuerId: "12345678-1234-1234-1234-123456789abc", keyId: "ABCDEFGHIJ", privateKey: privateKey.export({ format: "pem", type: "pkcs8" }) };
test("Apple JWT 使用 ES256、P1363 签名和两分钟有效期", () => {
  const [header, payload, signature] = createAppleToken(credentials, 1000).split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "ES256", kid: credentials.keyId, typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url")), { iss: credentials.issuerId, iat: 1000, exp: 1120, aud: "appstoreconnect-v1" });
  assert.ok(verify("sha256", Buffer.from(`${header}.${payload}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
});
test("凭据本机持久化和脱敏、分页读取、失败反馈、清除", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-apple-"));
  const path = join(dir, "credentials.json");
  let mode = "ok", calls = 0;
  const fetcher = async (url, options) => {
    assert.ok(options.headers.Authorization.startsWith("Bearer "));
    calls++;
    if (mode === "network") throw Error(credentials.privateKey);
    if (mode !== "ok") return new Response("private upstream details", { status: Number(mode) });
    return Response.json({ data: [{ id: String(calls), attributes: { name: "测试 App", bundleId: "com.test.app", sku: "app" } }], links: { next: calls === 1 ? "https://api.appstoreconnect.apple.com/v1/apps?cursor=next" : null } });
  };
  try {
    const client = openAppleConnection(path, { fetcher });
    await assert.rejects(client.apps(), /先保存/);
    assert.throws(() => client.save({ ...credentials, privateKey: "bad" }), /私钥无效/);
    const saved = client.save(credentials);
    assert.equal(saved.configured, true);
    assert.ok(!JSON.stringify(saved).includes("PRIVATE KEY"));
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(JSON.parse(readFileSync(path)).privateKey, credentials.privateKey);
    assert.equal(openAppleConnection(path).status().configured, true);
    assert.equal((await client.apps()).apps.length, 2);
    assert.ok(client.status().lastCheckedAt);
    client.save({ ...credentials, privateKey: "" });
    assert.equal(client.status().lastCheckedAt, null);
    assert.throws(() => client.save({ ...credentials, keyId: "KLMNOPQRST", privateKey: "" }), /私钥无效/);
    for (const [value, pattern] of [["401", /认证失败/], ["403", /权限/], ["429", /频繁/], ["500", /500/], ["network", /网络/]]) {
      mode = value; await assert.rejects(client.apps(), pattern);
    }
    client.disconnect();
    assert.equal(client.status().configured, false);
    assert.equal(openAppleConnection(path).status().configured, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("拒绝向外部地址发送分页认证信息", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-apple-page-"));
  let calls = 0;
  try {
    const client = openAppleConnection(join(dir, "config.json"), { fetcher: async () => { calls++; return Response.json({ data: [], links: { next: "https://example.com/steal" } }); } });
    client.save(credentials);
    await assert.rejects(client.apps(), /分页/);
    assert.equal(calls, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("Apple 只读请求自动恢复临时连接错误与限流，写入请求只发送一次", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-apple-retry-"));
  let reads = 0, writes = 0;
  try {
    const client = openAppleConnection(join(dir, "config.json"), { fetcher: async (_, options) => {
      if (options.method !== "GET") {
        writes++;
        throw new TypeError("fetch failed");
      }
      reads++;
      if (reads === 1) throw new TypeError("fetch failed");
      if (reads === 2) return new Response(null, { status: 429, headers: { "Retry-After": "0" } });
      return Response.json({ data: [] });
    } });
    client.save(credentials);
    const reader = client.session();
    assert.deepEqual((await reader.paginate("/v1/apps")).data, []);
    assert.equal(reads, 3);
    await assert.rejects(reader.request("/v1/apps/123", "PATCH", {}), /结果尚未确认/);
    assert.equal(writes, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("跨平台版本与语言独立读取，支持分页、空说明及 Apple 状态", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-versions-"));
  const paths = [];
  try {
    const client = openAppleConnection(join(dir, "config.json"), { fetcher: async url => {
      const u = new URL(url); paths.push(u.pathname);
      if (u.pathname.endsWith("/appStoreVersions")) return Response.json({ data: [
        { id: "ios-v1", attributes: { versionString: "2.0", platform: "IOS", appVersionState: "READY_FOR_DISTRIBUTION" } },
        { id: "mac-v1", attributes: { versionString: "2.0", platform: "MAC_OS", appStoreState: "IN_REVIEW" } },
      ] });
      if (u.pathname.includes("ios-v1")) return Response.json({ data: [{ attributes: { locale: u.searchParams.has("cursor") ? "en-US" : "zh-Hans", whatsNew: u.searchParams.has("cursor") ? null : "新增功能" } }], links: { next: u.searchParams.has("cursor") ? null : "https://api.appstoreconnect.apple.com/v1/appStoreVersions/ios-v1/appStoreVersionLocalizations?cursor=2" } });
      return Response.json({ data: [] });
    } });
    client.save(credentials);
    const result = await client.versions("123456");
    assert.equal(result.versions.length, 2);
    assert.equal(result.versions[0].state, "READY_FOR_DISTRIBUTION");
    assert.deepEqual(result.versions[0].notes, [{ locale: "zh-Hans", body: "新增功能" }, { locale: "en-US", body: "" }]);
    assert.equal(result.versions[1].platform, "MAC_OS");
    assert.deepEqual(result.versions[1].notes, []);
    assert.equal(paths.length, 4);
    await assert.rejects(client.versions("../bad"), /无效/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("允许 Apple v2 分发地区的只读分页，拒绝同路径写入和其他 v2 资源", async () => {
  const dir = mkdtempSync(join(tmpdir(), "growmory-apple-territories-"));
  const resource = "/v2/appAvailabilities/distribution/territoryAvailabilities";
  let calls = 0;
  try {
    const client = openAppleConnection(join(dir, "config.json"), { fetcher: async (url, options) => {
      assert.equal(new URL(url).pathname, resource);
      assert.equal(options.method, "GET");
      calls++;
      return Response.json({ data: [{ id: String(calls) }], links: { next: calls === 1 ? resource + "?cursor=next" : null } });
    } });
    client.save(credentials);
    const session = client.session();
    assert.deepEqual((await session.paginate(resource)).data, [{ id: "1" }, { id: "2" }]);
    await assert.rejects(session.request(resource, "PATCH"), /地址无效/);
    await assert.rejects(session.request("/v2/appAvailabilities/distribution"), /地址无效/);
    assert.equal(calls, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
