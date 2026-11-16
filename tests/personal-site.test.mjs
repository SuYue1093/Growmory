import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openPersonalSite } from "../server/personal-site.mjs";

test("publishes the original rich body and site-hosted images, then reads article counters via GET", async t => {
  const root = mkdtempSync(join(tmpdir(), "growmory-journal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "content"));
  mkdirSync(join(root, "scripts"));
  const articlesPath = join(root, "content/articles.json");
  writeFileSync(articlesPath, '{"zh":[],"en":[]}');
  writeFileSync(join(root, "scripts/build.py"), "print('Built fixture')\n");

  const assets = ["cover", "attached", "inline"].map(id => ({
    id, name: id, fileName: id + ".png", fileType: "image/png", url: "/api/assets/file/" + id
  }));
  const article = {
    id: "marketing", title: "示例文章", coverAssetId: "cover", assetIds: ["cover", "attached"],
    body: "# 正文章节\n\n**加粗** 和 *斜体*\n\n> 引用\n\n- [x] 完成\n\n| 字段 | 值 |\n| --- | --- |\n| 甲 | 乙 |\n\n![插图][inline]\n\n[inline]: asset://inline\n\n[坏链接](javascript:alert%281%29)\n\n<script>alert(1)</script>"
  };
  const contents = [article];
  const site = openPersonalSite({
    read: () => ({ data: { contents, assets } }),
    getAssetFile: id => assets.find(asset => asset.id === id) && { buffer: Buffer.from(id) },
    write: () => assert.fail("Local builds and metric reads must not write Growmory records")
  }, root);

  const payload = { slug: " Sample-- ", title: article.title, contentId: article.id, body: "伪造内容" };
  assert.equal((await site.publishArticle(payload)).deployed, false);
  assert.equal((await site.getUnpublishedContents())[0].siteSlug, "sample");
  await site.publishArticle(payload);
  const saved = JSON.parse(readFileSync(articlesPath));
  assert.equal(saved.zh.length, 1);
  assert.deepEqual(saved.en, []);
  const [result] = saved.zh;
  assert.deepEqual(result.images.map(image => image.alt), ["cover", "attached"]);
  assert.equal(result.cover, result.images[0].src);
  assert.equal(readFileSync(join(root, "public", result.cover), "utf-8"), "cover");
  assert.match(result.bodyHtml, /<h2>正文章节<\/h2>/);
  assert.match(result.bodyHtml, /<strong>加粗<\/strong> 和 <em>斜体<\/em>/);
  assert.match(result.bodyHtml, /<blockquote>/);
  assert.match(result.bodyHtml, /<table>/);
  assert.match(result.bodyHtml, /type="checkbox"/);
  assert.match(result.bodyHtml, /src="\/assets\/journal\/[a-f0-9]+\.png" alt="插图"/);
  assert.doesNotMatch(result.bodyHtml, /<script|javascript:|伪造内容|asset:\/\//);
  await assert.rejects(site.publishArticle({ ...payload, slug: "../escape" }), /有效的 URL/);

  const record = { channel: "hisuyue", status: "published", url: "https://hisuyue.com/journal/sample/", title: "上线时改过标题" };
  contents.push(record);
  assert.deepEqual(await site.getUnpublishedContents(), []);
  contents.pop();

  let online = true;
  const requests = [];
  const server = createServer((req, res) => {
    requests.push([req.method, req.headers.authorization]);
    res.writeHead(online ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ articles: { sample: { pv: 3, uv: 2 } } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const previousUrl = process.env.HISUYUE_METRICS_URL;
  const previousToken = process.env.HISUYUE_METRICS_TOKEN;
  process.env.HISUYUE_METRICS_URL = `http://127.0.0.1:${server.address().port}/journal-metrics/counts`;
  process.env.HISUYUE_METRICS_TOKEN = "test-token";
  t.after(() => {
    if (previousUrl === undefined) delete process.env.HISUYUE_METRICS_URL;
    else process.env.HISUYUE_METRICS_URL = previousUrl;
    if (previousToken === undefined) delete process.env.HISUYUE_METRICS_TOKEN;
    else process.env.HISUYUE_METRICS_TOKEN = previousToken;
  });
  const overview = await site.getOverview();
  assert.equal(overview.articles[0].views, 3);
  assert.equal(overview.articles[0].visitors, 2);
  online = false;
  const unavailable = await site.getOverview();
  assert.equal(unavailable.articleMetricsAvailable, false);
  assert.equal(unavailable.articles[0].views, null);
  assert.deepEqual(requests, [["GET", "Bearer test-token"], ["GET", "Bearer test-token"]]);
});
