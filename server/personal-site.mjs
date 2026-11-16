import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseAssetIdFromSrc, resolveContentAssets } from "../src/marketing-rich-copy.ts";

import { normalizeHisuyueSlug } from "../src/hisuyue-slug.ts";
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getSiteList,
  getReportData,
  parseOverviewReport,
  parseTopPagesReport
} from "./baidu-tongji.mjs";

const imageOptimizer = fileURLToPath(new URL("./hisuyue-image.py", import.meta.url));
const slugPattern = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const siteDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" });
const imageExtensions = { png: "png", jpeg: "jpg", gif: "gif", webp: "webp", avif: "avif", "svg+xml": "svg" };

export function openPersonalSite(store, customPath) {
  const siteDomain = process.env.PERSONAL_SITE_DOMAIN || process.env.HISUYUE_DOMAIN || (existsSync(resolve(process.cwd(), "../hisuyue/个人主页代码")) ? "hisuyue.com" : "example.com");
  const fallbackSiteDir = existsSync(resolve(process.cwd(), "../hisuyue/个人主页代码"))
    ? resolve(process.cwd(), "../hisuyue/个人主页代码")
    : resolve(process.cwd(), "personal-site");
  const personalSitePath = customPath || process.env.PERSONAL_SITE_PATH || process.env.HISUYUE_PATH || fallbackSiteDir;
  const articlesFile = join(personalSitePath, "content/articles.json");
  const appsFile = join(personalSitePath, "content/apps.json");
  const journalAssetsDir = join(personalSitePath, "public/assets/journal");

  const categoryMap = {
    dev: { app: "dev", tag: "开发手记", name: "开发手记" },
    firefly: { app: "firefly", tag: "萤火待办", name: "萤火待办" },
    stepbystep: { app: "stepbystep", tag: "一步步", name: "一步步" },
    quicknotes: { app: "quicknotes", tag: "灵感随记", name: "灵感随记" },
    shiye: { app: "shiye", tag: "拾页", name: "拾页" },
    picin: { app: "picin", tag: "Picin", name: "Picin" }
  };

  function getApps() {
    if (existsSync(appsFile)) {
      try {
        return JSON.parse(readFileSync(appsFile, "utf-8"));
      } catch {}
    }
    return [
      { slug: "firefly", name: "萤火待办" },
      { slug: "stepbystep", name: "一步步" },
      { slug: "quicknotes", name: "灵感随记" },
      { slug: "shiye", name: "拾页" },
      { slug: "picin", name: "Picin" }
    ];
  }

  function getArticles(metricsMap = null) {
    if (existsSync(articlesFile)) {
      try {
        const data = JSON.parse(readFileSync(articlesFile, "utf-8"));
        const apps = getApps();
        const appMap = Object.fromEntries(apps.map(a => [a.slug, a.name]));
        appMap["dev"] = "开发手记";

        const decorate = (articles, prefix) => articles.map(art => {
          const m = metricsMap && (Object.hasOwn(metricsMap, art.slug) ? metricsMap[art.slug] : { pv: 0, uv: 0 });
          return {
            ...art,
            category: art.app || "dev",
            appName: categoryMap[art.app]?.name || appMap[art.app] || art.tag || "开发手记",
            views: m?.pv ?? null,
            visitors: m?.uv ?? null,
            url: `https://${siteDomain}${prefix}/journal/${art.slug}/`
          };
        });
        return { zh: decorate(data.zh || [], ""), en: decorate(data.en || [], "/en") };
      } catch (err) {
        console.error("Failed to read personal site articles:", err);
      }
    }
    return { zh: [], en: [] };
  }

  const canDeploy = process.env.PERSONAL_SITE_DEPLOY === "1" || process.env.HISUYUE_DEPLOY === "1";

  function getBeijingDate(offsetDays = 0) {
    const d = new Date(Date.now() + (8 * 3600 + offsetDays * 86400) * 1000);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  function getBeijingHour() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.getUTCHours();
  }

  async function readArticleMetrics() {
    if (store.articleMetrics) {
      const cached = store.articleMetrics();
      if (cached && typeof cached === "object" && Object.keys(cached).length > 0) {
        return cached;
      }
    }
    try {
      const metricsUrl = process.env.PERSONAL_SITE_METRICS_URL || process.env.HISUYUE_METRICS_URL;
      if (!metricsUrl) return null;
      const metricsToken = process.env.PERSONAL_SITE_METRICS_TOKEN || process.env.HISUYUE_METRICS_TOKEN;
      const response = await fetch(metricsUrl, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(4000),
        headers: metricsToken ? { Authorization: `Bearer ${metricsToken}` } : {}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const { articles } = await response.json();
      if (!articles || typeof articles !== "object" || Array.isArray(articles) ||
          Object.values(articles).some(m => !Number.isSafeInteger(m?.pv) || !Number.isSafeInteger(m?.uv) ||
            m.pv < 0 || m.uv < 0 || m.uv > m.pv)) throw new Error("统计数据格式无效");
      return articles;
    } catch {
      return null;
    }
  }

  function getBaiduConfig() {
    const saved = store.baiduOAuth ? (store.baiduOAuth() || {}) : {};
    const apiKey = saved.apiKey || process.env.BAIDU_TONGJI_API_KEY || "";
    const secretKey = saved.secretKey || process.env.BAIDU_TONGJI_SECRET_KEY || "";
    const siteId = saved.siteId || process.env.BAIDU_TONGJI_SITE_ID || "";
    const hasToken = !!(saved.accessToken || process.env.BAIDU_TONGJI_TOKEN);

    return {
      apiKey,
      secretKey,
      siteId,
      numericSiteId: saved.numericSiteId || null,
      siteDomain: saved.siteDomain || siteDomain,
      configured: hasToken,
      hasToken,
      expiresAt: saved.expiresAt || null,
      lastSyncedAt: saved.lastSyncedAt || null,
      authorizeUrl: apiKey ? getAuthorizeUrl(apiKey) : "",
      sites: saved.sites || []
    };
  }

  function saveBaiduConfig(config) {
    const saved = store.baiduOAuth ? (store.baiduOAuth() || {}) : {};
    const next = {
      ...saved,
      apiKey: (config.apiKey !== undefined ? config.apiKey : saved.apiKey || process.env.BAIDU_TONGJI_API_KEY || "").trim(),
      secretKey: (config.secretKey !== undefined ? config.secretKey : saved.secretKey || process.env.BAIDU_TONGJI_SECRET_KEY || "").trim(),
      siteId: (config.siteId !== undefined ? config.siteId : saved.siteId || process.env.BAIDU_TONGJI_SITE_ID || "").trim()
    };
    if (config.numericSiteId) next.numericSiteId = Number(config.numericSiteId);
    if (config.token !== undefined) {
      next.accessToken = config.token.trim();
    }
    if (store.baiduOAuth) store.baiduOAuth(next);
    return getBaiduConfig();
  }

  async function exchangeBaiduCode(input) {
    const code = input?.code || "";
    const apiKey = (input?.apiKey || store.baiduOAuth?.()?.apiKey || process.env.BAIDU_TONGJI_API_KEY || "").trim();
    const secretKey = (input?.secretKey || store.baiduOAuth?.()?.secretKey || process.env.BAIDU_TONGJI_SECRET_KEY || "").trim();

    const tokenRes = await exchangeCodeForToken({ code, apiKey, secretKey });
    let saved = store.baiduOAuth ? (store.baiduOAuth() || {}) : {};
    saved = {
      ...saved,
      apiKey,
      secretKey,
      accessToken: tokenRes.accessToken,
      refreshToken: tokenRes.refreshToken,
      expiresAt: tokenRes.expiresAt,
      sessionSecret: tokenRes.sessionSecret,
      sessionKey: tokenRes.sessionKey
    };

    // Auto discover site_id
    try {
      const sites = await getSiteList(tokenRes.accessToken);
      saved.sites = sites;
      const targetSite = sites.find(s => s.domain && (s.domain.includes(siteDomain) || (siteDomain === "example.com" && s.domain.includes("hisuyue")))) || sites[0];
      if (targetSite) {
        saved.numericSiteId = targetSite.site_id;
        saved.siteDomain = targetSite.domain;
      }
    } catch (err) {
      console.warn("Auto-discover site list failed:", err.message);
    }

    if (store.baiduOAuth) store.baiduOAuth(saved);

    // Auto sync data if numericSiteId was found
    let syncResult = null;
    if (saved.numericSiteId) {
      try {
        syncResult = await syncBaiduData();
      } catch (err) {
        console.warn("Initial sync after exchange failed:", err.message);
      }
    }

    return {
      success: true,
      config: getBaiduConfig(),
      synced: !!syncResult
    };
  }

  async function refreshBaiduToken() {
    let saved = store.baiduOAuth ? (store.baiduOAuth() || {}) : {};
    const apiKey = saved.apiKey || process.env.BAIDU_TONGJI_API_KEY || "";
    const secretKey = saved.secretKey || process.env.BAIDU_TONGJI_SECRET_KEY || "";
    if (!saved.refreshToken) {
      throw new Error("缺少 refresh_token，请重新获取授权码登录");
    }
    const tokenRes = await refreshAccessToken({ refreshToken: saved.refreshToken, apiKey, secretKey });
    saved = { ...saved, ...tokenRes };
    if (store.baiduOAuth) store.baiduOAuth(saved);
    return { success: true, config: getBaiduConfig() };
  }

  async function syncBaiduData() {
    let oauth = store.baiduOAuth ? (store.baiduOAuth() || {}) : {};
    const apiKey = oauth.apiKey || process.env.BAIDU_TONGJI_API_KEY || "";
    const secretKey = oauth.secretKey || process.env.BAIDU_TONGJI_SECRET_KEY || "";
    let accessToken = oauth.accessToken || process.env.BAIDU_TONGJI_TOKEN || "";

    if (!accessToken) {
      throw new Error("未配置百度统计 Access Token，请先完成授权绑定");
    }

    // Refresh if expiring in 5 minutes
    if (oauth.expiresAt && Date.now() > oauth.expiresAt - 300000 && oauth.refreshToken) {
      try {
        const refreshed = await refreshAccessToken({ refreshToken: oauth.refreshToken, apiKey, secretKey });
        accessToken = refreshed.accessToken;
        oauth = { ...oauth, ...refreshed };
        if (store.baiduOAuth) store.baiduOAuth(oauth);
      } catch (err) {
        console.warn("Token refresh attempt failed, using existing:", err.message);
      }
    }

    // Ensure site_id
    let siteId = oauth.numericSiteId;
    if (!siteId) {
      try {
        const sites = await getSiteList(accessToken);
        oauth.sites = sites;
        const targetSite = sites.find(s => s.domain && (s.domain.includes(siteDomain) || (siteDomain === "example.com" && s.domain.includes("hisuyue")))) || sites[0];
        if (targetSite) {
          siteId = targetSite.site_id;
          oauth.numericSiteId = siteId;
          oauth.siteDomain = targetSite.domain;
        }
        if (store.baiduOAuth) store.baiduOAuth(oauth);
      } catch (err) {
        if (oauth.refreshToken && (err.message.includes("Token") || err.message.includes("111"))) {
          const refreshed = await refreshAccessToken({ refreshToken: oauth.refreshToken, apiKey, secretKey });
          accessToken = refreshed.accessToken;
          oauth = { ...oauth, ...refreshed };
          const sites = await getSiteList(accessToken);
          oauth.sites = sites;
          const targetSite = sites.find(s => s.domain && (s.domain.includes(siteDomain) || (siteDomain === "example.com" && s.domain.includes("hisuyue")))) || sites[0];
          if (targetSite) {
            siteId = targetSite.site_id;
            oauth.numericSiteId = siteId;
            oauth.siteDomain = targetSite.domain;
          }
          if (store.baiduOAuth) store.baiduOAuth(oauth);
        } else {
          throw err;
        }
      }
    }

    if (!siteId) {
      throw new Error(`未能获取到百度统计的有效站点 ID，请检查该百度账号中是否添加了 ${siteDomain} 站点`);
    }

    const todayStr = getBeijingDate(0);
    const yesterdayStr = getBeijingDate(-1);
    const last7StartStr = getBeijingDate(-6);
    const last30StartStr = getBeijingDate(-29);

    const fetchWithRetry = async (method, startDate, endDate, metrics, maxResults) => {
      try {
        return await getReportData({ accessToken, siteId, method, startDate, endDate, metrics, maxResults });
      } catch (err) {
        if (oauth.refreshToken && (err.message.includes("111") || err.message.toLowerCase().includes("token"))) {
          const refreshed = await refreshAccessToken({ refreshToken: oauth.refreshToken, apiKey, secretKey });
          accessToken = refreshed.accessToken;
          oauth = { ...oauth, ...refreshed };
          if (store.baiduOAuth) store.baiduOAuth(oauth);
          return await getReportData({ accessToken, siteId, method, startDate, endDate, metrics, maxResults });
        }
        throw err;
      }
    };

    const [todayRep, yesterdayRep, last7Rep, last30Rep, topPagesRep] = await Promise.all([
      fetchWithRetry("overview/getTimeTrendRpt", todayStr, todayStr),
      fetchWithRetry("overview/getTimeTrendRpt", yesterdayStr, yesterdayStr),
      fetchWithRetry("overview/getTimeTrendRpt", last7StartStr, todayStr),
      fetchWithRetry("overview/getTimeTrendRpt", last30StartStr, todayStr),
      fetchWithRetry("visit/toppage/a", last30StartStr, todayStr, "pv_count,visitor_count", 100).catch(() => null)
    ]);

    const parsedToday = parseOverviewReport(todayRep) || { pv: 0, uv: 0, ip: 0, bounceRate: "0.00%", avgDuration: "00:00:00" };
    const parsedYesterday = parseOverviewReport(yesterdayRep) || { pv: 0, uv: 0, ip: 0, bounceRate: "0.00%", avgDuration: "00:00:00" };
    const parsedLast7 = parseOverviewReport(last7Rep) || { pv: 0, uv: 0, ip: 0, bounceRate: "0.00%", avgDuration: "00:00:00" };
    const parsedLast30 = parseOverviewReport(last30Rep) || { pv: 0, uv: 0, ip: 0, bounceRate: "0.00%", avgDuration: "00:00:00" };

    const currentHour = getBeijingHour();
    const hourFactor = 24 / Math.max(1, currentHour + 1);
    parsedToday.estimatedPv = Math.round(parsedToday.pv * hourFactor);
    parsedToday.estimatedUv = Math.round(parsedToday.uv * hourFactor);
    parsedToday.estimatedIp = Math.round(parsedToday.ip * hourFactor);

    const stats = {
      today: parsedToday,
      yesterday: parsedYesterday,
      last7days: parsedLast7,
      last30days: parsedLast30,
      lastUpdatedAt: new Date().toISOString()
    };

    if (store.personalSiteStats) {
      store.personalSiteStats(stats);
    }

    const pageMetrics = parseTopPagesReport(topPagesRep);
    if (pageMetrics && Object.keys(pageMetrics).length > 0 && store.articleMetrics) {
      const existing = store.articleMetrics() || {};
      store.articleMetrics({ ...existing, ...pageMetrics });
    }

    oauth.lastSyncedAt = new Date().toISOString();
    if (store.baiduOAuth) store.baiduOAuth(oauth);

    return { success: true, stats, articleMetrics: pageMetrics, lastSyncedAt: oauth.lastSyncedAt };
  }

  async function getUnpublishedMarketingContents() {
    const { data } = store.read();
    const contents = data.contents || [];
    const { zh, en } = getArticles();
    const hisuyueArticles = [...zh, ...en];
    const syncedSlugs = new Map(hisuyueArticles.filter(a => a.sourceContentId).map(a => [a.sourceContentId, a]));
    const published = contents.filter(c => (c.channel === "hisuyue" || c.channel === "个人主页") && c.status === "published");
    const publishedUrls = new Set(published.map(c => (c.url || "").replace(/\/$/, "")));
    if (canDeploy) {
      // Older successful deployments may not have a corresponding Growmory record.
      await Promise.all(hisuyueArticles.filter(a => a.sourceContentId && !publishedUrls.has(a.url.replace(/\/$/, ""))).map(async article => {
        try {
          const response = await fetch(article.url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(3000) });
          if (response.status === 200) publishedUrls.add(article.url.replace(/\/$/, ""));
        } catch {
          // A local draft remains available to retry while the website is unreachable.
        }
      }));
    }
    const publishedTitles = new Set([
      ...published.map(c => c.title),
      ...hisuyueArticles.filter(a => !a.sourceContentId || publishedUrls.has(a.url.replace(/\/$/, ""))).map(a => a.title)
    ].map(title => title?.trim().toLowerCase()).filter(Boolean));

    const filtered = contents.filter(c => {
      if (c.channel === "hisuyue" || c.channel === "个人主页") return false;
      const article = syncedSlugs.get(c.id);
      if (article && publishedUrls.has(article.url.replace(/\/$/, ""))) return false;
      return !publishedTitles.has((c.title || "").trim().toLowerCase());
    });

    // Sort descending by creation date/time
    return filtered.map(c => ({ ...c, siteSlug: syncedSlugs.get(c.id)?.slug })).sort((a, b) => (b.createdAt || b.date || "").localeCompare(a.createdAt || a.date || ""));
  }

  function prepareArticleBody(content, assets) {
    const files = new Map();
    const copied = new Map();
    const assetsById = new Map(assets.map(asset => [asset.id, asset]));
    const assetsByUrl = new Map(assets.filter(asset => asset.url).map(asset => [asset.url, asset]));

    function saveImage(bytes, extension) {
      if (extension === "png" && bytes.length >= 50_000) {
        try {
          const output = execFileSync("python3", [imageOptimizer], {
            input: bytes, stdio: ["pipe", "pipe", "ignore"], timeout: 15_000,
            maxBuffer: bytes.length + 1
          });
          if (output.length > 1 && (output[0] === 80 || output[0] === 87)) {
            extension = output[0] === 87 ? "webp" : "png";
            bytes = output.subarray(1);
          }
        } catch {
          // An unavailable optimizer or unsupported image must not block publishing.
        }
      }
      const filename = `${createHash("sha256").update(bytes).digest("hex")}.${extension}`;
      files.set(filename, bytes);
      return `/assets/journal/${filename}`;
    }

    function copyImage(assetId, required = false) {
      if (copied.has(assetId)) return copied.get(assetId);
      const asset = assetsById.get(assetId);
      if (!required && asset && !asset.fileType?.startsWith("image/")) return null;
      const inline = asset?.url?.match(/^data:image\/([^;]+);base64,([a-z0-9+/=\s]+)$/i);
      const file = store.getAssetFile(assetId) || (inline && {
        buffer: Buffer.from(inline[2], "base64"), mime: `image/${inline[1]}`
      });
      const subtype = (asset?.fileType || file?.mime || "").split("/")[1];
      const extension = imageExtensions[subtype];
      if (!file || !extension) throw new Error(`无法发布图片：${asset?.name || assetId}`);
      const bytes = file.buffer ?? readFileSync(file.filePath);
      const image = { src: saveImage(bytes, extension), alt: asset?.name || "" };
      copied.set(assetId, image);
      return image;
    }

    const { linkedAssets } = resolveContentAssets(content, assets);
    const images = [...new Set([content.coverAssetId, ...(content.assetIds || []), ...linkedAssets.map(a => a.id)].filter(Boolean))]
      .map(id => copyImage(id, id === content.coverAssetId))
      .filter(Boolean);
    const headings = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [
      `h${index + 1}`, ({ children }) => createElement(`h${Math.min(index + 2, 6)}`, null, children)
    ]));
    const bodyHtml = renderToStaticMarkup(createElement(ReactMarkdown, {
      remarkPlugins: [remarkGfm],
      urlTransform(url, key) {
        if (key === "src") {
          const id = parseAssetIdFromSrc(url) || assetsByUrl.get(url)?.id;
          if (id) return copyImage(id, true).src;
          const inline = /^data:image\/(png|jpeg|gif|webp|avif);base64,([a-z0-9+/=\s]+)$/i.exec(url);
          if (inline) return saveImage(Buffer.from(inline[2], "base64"), imageExtensions[inline[1].toLowerCase()]);
        }
        return defaultUrlTransform(url);
      },
      components: {
        ...headings,
        img: ({ src, alt, title }) => src ? createElement("img", {
          src, alt: alt || "", title, className: "article-inline-image", loading: "lazy", decoding: "async"
        }) : null
      }
    }, content.body));
    return { files, images: [...new Map(images.map(image => [image.src, image])).values()], bodyHtml };
  }

  function buildSite(currentData, previous) {
    const pending = `${articlesFile}.tmp`;
    writeFileSync(pending, JSON.stringify(currentData, null, 2) + "\n");
    renameSync(pending, articlesFile);
    try {
      return execFileSync("python3", ["scripts/build.py"], { cwd: personalSitePath, encoding: "utf-8" }).trim();
    } catch (err) {
      if (previous != null) writeFileSync(articlesFile, previous);
      else rmSync(articlesFile, { force: true });
      throw new Error(`静态站构建失败：${err.stderr?.trim() || err.message}`);
    }
  }

  async function publishArticle({ contentId, slug, title, category = "dev", desc = "", deploy = false }) {
    const requestedSlug = typeof slug === "string" ? slug.trim().toLowerCase() : "";
    if (!title?.trim()) throw new Error("请输入文章标题");
    if (/[\\/]/.test(requestedSlug)) throw new Error("请输入有效的 URL 标识，不能包含斜线");
    // Keep valid existing addresses (including underscores) stable.
    const cleanSlug = slugPattern.test(requestedSlug) && requestedSlug.length <= 100
      ? requestedSlug
      : normalizeHisuyueSlug(requestedSlug || title) || `post-${randomUUID().slice(0, 8)}`;
    if (!Object.hasOwn(categoryMap, category)) throw new Error("无效的文章分类");
    if (deploy && !canDeploy) throw new Error("尚未启用线上发布功能");
    const { data } = store.read();
    const content = (data.contents || []).find(c => c.id === contentId);
    if (!content?.body?.trim()) throw new Error("请选择一篇有正文的营销文章");

    const previous = existsSync(articlesFile) ? readFileSync(articlesFile, "utf-8") : null;
    const currentData = previous === null ? { zh: [], en: [] } : JSON.parse(previous);
    const existing = currentData.zh.find(a => a.slug === cleanSlug);
    if ((existing && existing.sourceContentId !== contentId) || (!existing && currentData.en.some(a => a.slug === cleanSlug))) {
      throw new Error("该 URL 标识已被其他文章使用");
    }
    if (currentData.zh.some(a => a.sourceContentId === contentId && a.slug !== cleanSlug)) {
      throw new Error("这篇营销文章已同步，请使用原有的 URL 标识");
    }

    const cat = categoryMap[category];
    const { files, images, bodyHtml } = prepareArticleBody(content, data.assets || []);
    if (files.size) mkdirSync(journalAssetsDir, { recursive: true });
    for (const [filename, bytes] of files) {
      const target = join(journalAssetsDir, filename);
      if (!existsSync(target)) writeFileSync(target, bytes);
    }
    const todayStr = siteDate.format(new Date());
    const articleAuthor = process.env.PERSONAL_SITE_AUTHOR || "Growmory";
    const article = {
      slug: cleanSlug,
      date: existing?.date || todayStr,
      ...(existing ? { updatedAt: todayStr } : {}),
      tag: cat.tag,
      title: title.trim(),
      desc: desc.trim() || title.trim(),
      app: cat.app,
      author: articleAuthor,
      sourceContentId: contentId,
      images,
      ...(images[0] ? { cover: images[0].src, cover_alt: images[0].alt } : {}),
      bodyHtml
    };
    currentData.zh = existing ? currentData.zh.map(a => a === existing ? article : a) : [article, ...currentData.zh];
    const buildOutput = buildSite(currentData, previous);
    const url = `https://${siteDomain}/journal/${cleanSlug}/`;

    if (deploy) {
      await deploySite();
      const { data: latest, revision } = store.read();
      const contents = latest.contents || [];
      const previousRecord = contents.find(c => (c.channel === "hisuyue" || c.channel === "personal-site") && c.url === url);
      const record = {
        ...content, id: previousRecord?.id || randomUUID(), title: article.title, channel: "hisuyue",
        status: "published", publishedAt: previousRecord?.publishedAt || todayStr,
        date: article.date, url
      };
      try {
        if (!store.write({ ...latest, contents: [record, ...contents.filter(c => c !== previousRecord)] }, revision)) {
          throw new Error("工作区已更新");
        }
      } catch (error) {
        console.warn("发布记录保存失败:", error.message);
        return { success: true, slug: cleanSlug, url, buildOutput, deployed: true,
          message: `文章已发布到 ${siteDomain}，但 Growmory 发布记录保存失败。` };
      }
    }

    return {
      success: true, slug: cleanSlug, url, buildOutput, deployed: deploy,
      message: deploy ? `文章已发布到 ${siteDomain}。` : "文章已同步到本地独立站点并完成构建。"
    };
  }

  function deploySite() {
    return new Promise((resolve, reject) => {
      execFile("python3", ["scripts/deploy.py", "--publish-build"], {
        cwd: personalSitePath, timeout: 15 * 60 * 1000, maxBuffer: 4 * 1024 * 1024
      }, (error, stdout, stderr) => {
        if (error) reject(new Error(`线上发布未完成，已保留本地版本：${stderr.trim() || error.message}`));
        else resolve(stdout);
      });
    });
  }

  function deleteArticle(slug) {
    if (!slug) throw new Error("缺少要删除的文章标识 (slug)");

    if (!existsSync(articlesFile)) {
      throw new Error("手记数据文件不存在");
    }

    const previous = readFileSync(articlesFile, "utf-8");
    const currentData = JSON.parse(previous);
    const previousCount = currentData.zh.length + currentData.en.length;
    currentData.zh = currentData.zh.filter(a => a.slug !== slug);
    currentData.en = currentData.en.filter(a => a.slug !== slug);

    if (currentData.zh.length + currentData.en.length === previousCount) {
      throw new Error(`未找到标识为 ${slug} 的文章`);
    }

    buildSite(currentData, previous);

    return {
      success: true,
      slug,
      message: `文章《${slug}》已从本地站点移除并重新构建。`
    };
  }

  let publishing = false;

  return {
    prepareArticleBody,
    async getOverview(options = {}) {
      let savedStats = store.personalSiteStats ? store.personalSiteStats() : null;
      const bConfig = getBaiduConfig();

      const shouldSync = options.forceSync || (bConfig.hasToken && (!savedStats || !savedStats.lastUpdatedAt || (Date.now() - new Date(savedStats.lastUpdatedAt).getTime() > 10 * 60 * 1000)));
      if (shouldSync) {
        try {
          const syncRes = await syncBaiduData();
          savedStats = syncRes.stats;
        } catch (err) {
          console.warn("Auto sync in getOverview failed:", err.message);
        }
      }

      const metrics = await readArticleMetrics();
      const { zh, en } = getArticles(metrics);
      const chineseSlugs = new Set(zh.map(article => article.slug));
      const articles = [...zh, ...en.filter(article => !chineseSlugs.has(article.slug))].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

      return {
        canDeploy,
        articleMetricsAvailable: metrics !== null,
        baiduConfig: getBaiduConfig(),
        hasData: !!savedStats,
        stats: savedStats,
        totalArticles: articles.length,
        articles
      };
    },
    async getArticles() {
      return getArticles(await readArticleMetrics());
    },
    getUnpublishedContents() {
      return getUnpublishedMarketingContents();
    },
    async publishArticle(payload) {
      if (publishing) throw new Error("正在发布另一篇文章，请稍后再试");
      publishing = true;
      try {
        return await publishArticle(payload);
      } finally {
        publishing = false;
      }
    },
    deleteArticle(slug) {
      if (publishing) throw new Error("正在发布文章，请稍后再试");
      return deleteArticle(slug);
    },
    updateStats(newStats) {
      const current = store.personalSiteStats ? (store.personalSiteStats() || {}) : {};
      const merged = { ...current, ...newStats, lastUpdatedAt: new Date().toISOString() };
      if (store.personalSiteStats) {
        store.personalSiteStats(merged);
      }
      return { success: true, stats: merged };
    },
    getBaiduConfig() {
      return getBaiduConfig();
    },
    saveBaiduConfig(config) {
      return saveBaiduConfig(config);
    },
    exchangeBaiduCode(input) {
      return exchangeBaiduCode(input);
    },
    syncBaiduData() {
      return syncBaiduData();
    },
    refreshBaiduToken() {
      return refreshBaiduToken();
    }
  };
}
