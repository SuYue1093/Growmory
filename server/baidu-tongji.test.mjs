import assert from "node:assert";
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  parseOverviewReport,
  parseTopPagesReport
} from "./baidu-tongji.mjs";

console.log("=== Testing Baidu Tongji OpenAPI Module ===");

// 1. Authorize URL
const authUrl = getAuthorizeUrl("2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w");
assert.ok(authUrl.includes("client_id=2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w"));
assert.ok(authUrl.includes("response_type=code"));
assert.ok(authUrl.includes("redirect_uri=oob"));
console.log("✓ Authorize URL generation passed");

// 2. parseOverviewReport
const mockOverviewData = {
  fields: ["timeSpan", "pv_count", "visitor_count", "ip_count", "bounce_ratio", "avg_visit_time"],
  sum: [
    [null, 136, 92, 84, 34.2, 158]
  ]
};
const parsed = parseOverviewReport(mockOverviewData);
assert.strictEqual(parsed.pv, 136);
assert.strictEqual(parsed.uv, 92);
assert.strictEqual(parsed.ip, 84);
assert.strictEqual(parsed.bounceRate, "34.20%");
assert.strictEqual(parsed.avgDuration, "02:38");
console.log("✓ parseOverviewReport passed:", parsed);

// 3. parseTopPagesReport
const mockTopPagesData = {
  fields: ["visit_page_title", "pv_count", "visitor_count"],
  items: [
    [
      { name: "https://hisuyue.com/journal/firefly-preview/" },
      { name: "https://hisuyue.com/journal/stepbystep-v1/" },
      { name: "https://hisuyue.com/about/" }
    ],
    [
      [45, 30],
      [28, 19],
      [10, 8]
    ]
  ]
};
const topPages = parseTopPagesReport(mockTopPagesData);
assert.deepStrictEqual(topPages["firefly-preview"], { pv: 45, uv: 30 });
assert.deepStrictEqual(topPages["stepbystep-v1"], { pv: 28, uv: 19 });
assert.strictEqual(topPages["about"], undefined); // not in /journal/
console.log("✓ parseTopPagesReport passed:", topPages);

// 4. Live test against Baidu Token Endpoint with provided API Key & Secret Key
try {
  await exchangeCodeForToken({
    code: "mock_test_code",
    apiKey: "2g2Oi1id8EBz4fVa7TlOXqOK5Dgmo89w",
    secretKey: "rRoHt1EkIcozRAFeHFOf6YFAJgKemB3p"
  });
  assert.fail("Should have thrown error on dummy code");
} catch (err) {
  // It should throw that the code is invalid or expired, NOT invalid_client!
  assert.ok(
    err.message.includes("授权码无效") || err.message.includes("invalid code"),
    `Unexpected error message: ${err.message}`
  );
  console.log("✓ Live Baidu server verified user API Key and Secret Key successfully (invalid_grant confirmed):", err.message);
}

console.log("All Baidu Tongji unit tests passed successfully!");
