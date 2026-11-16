import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../../server/store.mjs";
import { openAppleConnection } from "../../server/app-store-connect.mjs";
import { openPublication } from "../../server/publication.mjs";
const privateKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" });
export function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "growmory-publish-"));
  const db = openStore(":memory:", { products: [{ id: "p", name: "本机产品", summary: "", appId: "123", price: "", platform: "", website: "", color: "blue", appStore: { appId: "123", name: "Apple App", bundleId: "com.test", syncedAt: new Date().toISOString(), versions: [] } }], docs: [], docFolders: [], contents: [], tasks: [], releases: [{ id: "r", productId: "p", version: "2.1", changes: "更新", languages: ["中文", "英文"], channels: ["App Store"], status: "preparing", createdAt: new Date().toISOString(), notes: [{ language: "中文", body: "中文说明", approved: true }, { language: "英文", body: "English notes", approved: true }], proposals: [] }] });
  const state = { versions: [], notes: [], build: null, reviews: [], items: [], writes: [], failLocale: "", badBuild: false, gate: null };
  const apple = openAppleConnection(join(dir, "apple.json"), { fetcher: async (url, options) => {
    const path = new URL(url).pathname, method = options.method || "GET", body = options.body ? JSON.parse(options.body).data : null;
    assert.ok(options.headers.Authorization.startsWith("Bearer "));
    const json = data => Response.json(data);
    if (method === "GET") {
      if (path.endsWith("/appStoreVersions")) return json({ data: state.versions });
      if (path.endsWith("/appStoreVersionLocalizations")) return json({ data: state.notes });
      if (path.endsWith("/build")) return json({ data: state.build });
      if (path === "/v1/builds") return json({ data: state.badBuild ? [] : [{ id: "b1", attributes: { version: "42", expired: false, processingState: "VALID" }, relationships: { preReleaseVersion: { data: { id: "pre1" } } } }], included: [{ id: "pre1", type: "preReleaseVersions", attributes: { version: "2.1", platform: "IOS" } }] });
      if (path.endsWith("/reviewSubmissions")) return json({ data: state.reviews });
      if (path.endsWith("/items")) return json({ data: state.items.filter(i => i.relationships.reviewSubmission.data.id === path.split("/")[3]) });
      throw Error(`未实现 GET ${path}`);
    }
    state.writes.push({ path, method, body });
    if (state.gate) await state.gate;
    if (body?.attributes?.locale === state.failLocale && state.failLocale) return Response.json({ errors: [{ detail: "测试语言错误" }] }, { status: 409 });
    if (path === "/v1/appStoreVersions") { const version = { id: "v1", type: body.type, attributes: { ...body.attributes, appStoreState: "PREPARE_FOR_SUBMISSION" } }; state.versions.push(version); return json({ data: version }); }
    if (path === "/v1/appStoreVersions/v1") { Object.assign(state.versions[0].attributes, body.attributes); return json({ data: state.versions[0] }); }
    if (path === "/v1/appStoreVersionLocalizations") { const note = { ...body, id: `n${state.notes.length + 1}` }; state.notes.push(note); return json({ data: note }); }
    if (path.startsWith("/v1/appStoreVersionLocalizations/")) { const note = state.notes.find(n => n.id === body.id); Object.assign(note.attributes, body.attributes); return json({ data: note }); }
    if (path.endsWith("/relationships/build")) { state.build = { ...body, attributes: { version: "42" } }; return new Response(null, { status: 204 }); }
    if (path === "/v1/reviewSubmissions") { const review = { ...body, id: "s1", attributes: { ...body.attributes, state: "READY_FOR_REVIEW" } }; state.reviews.push(review); return json({ data: review }); }
    if (path === "/v1/reviewSubmissionItems") { state.items.push({ ...body, id: "i1" }); return json({ data: state.items.at(-1) }); }
    if (path === "/v1/reviewSubmissions/s1") { state.reviews[0].attributes.state = "WAITING_FOR_REVIEW"; state.versions[0].attributes.appStoreState = "WAITING_FOR_REVIEW"; return json({ data: state.reviews[0] }); }
    if (path === "/v1/appStoreVersionReleaseRequests") { state.versions[0].attributes.appStoreState = "PROCESSING_FOR_APP_STORE"; return json({ data: { id: "release1" } }); }
    throw Error(`未实现 ${method} ${path}`);
  } });
  apple.save({ issuerId: "12345678-1234-1234-1234-123456789abc", keyId: "ABCDEFGHIJ", privateKey });
  const pub = openPublication(db, apple);
  const input = { platform: "IOS", action: "sync", localeMap: { 中文: "zh-Hans", 英文: "en-US" }, buildId: "b1" };
  const edit = mutate => { const s = db.read(); mutate(s.data); db.write(s.data, s.revision); };
  return { pub, db, state, apple, input, edit, cleanup: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}