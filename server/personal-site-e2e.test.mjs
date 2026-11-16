import assert from "node:assert";
import { openStore } from "./store.mjs";
import { openPersonalSite } from "./personal-site.mjs";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

console.log("=== Testing Personal Site & Baidu OpenAPI E2E ===");

const initial = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url)));
const tempDir = mkdtempSync(join(tmpdir(), "growmory-test-"));
const dbPath = join(tempDir, "test.db");
const store = openStore(dbPath, initial);
const personalSite = openPersonalSite(store);

// 1. Initial Baidu Config
const initialConfig = personalSite.getBaiduConfig();
assert.strictEqual(initialConfig.apiKey, "2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w");
assert.strictEqual(initialConfig.secretKey, "rRoHt1EkIcozRAFeHFOf6YFAJgKemB3p");
assert.ok(initialConfig.authorizeUrl.includes("client_id=2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w"));
console.log("✓ Initial Baidu Config verified");

// 2. Save Config
personalSite.saveBaiduConfig({
  apiKey: "2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w",
  secretKey: "rRoHt1EkIcozRAFeHFOf6YFAJgKemB3p",
  numericSiteId: 998877,
  token: "test_access_token"
});
const updatedConfig = personalSite.getBaiduConfig();
assert.strictEqual(updatedConfig.numericSiteId, 998877);
assert.strictEqual(updatedConfig.hasToken, true);
assert.strictEqual(updatedConfig.configured, true);
console.log("✓ Save Baidu Config verified");

// 3. Store Article Metrics
store.articleMetrics({
  "test-article": { pv: 120, uv: 85 }
});
const cached = store.articleMetrics();
assert.deepStrictEqual(cached["test-article"], { pv: 120, uv: 85 });
console.log("✓ Store Article Metrics verified");

// 4. Overview
const overview = await personalSite.getOverview();
assert.ok(overview.baiduConfig);
assert.strictEqual(overview.baiduConfig.hasToken, true);
console.log("✓ Overview contains Baidu Config verified");

store.close();
rmSync(tempDir, { recursive: true, force: true });
console.log("All E2E tests passed successfully!");
