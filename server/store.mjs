import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, resolve, extname, join } from "node:path";
import { validateData } from "./validate.mjs";
export function inferAssetLanguages(asset, folders = []) {
  if (Array.isArray(asset.languages) && asset.languages.length > 0) {
    return asset.languages;
  }
  const folderMap = new Map((folders || []).map((f) => [f.id, f]));
  const parts = [];
  let cur = folderMap.get(asset.folderId);
  while (cur) {
    parts.unshift(cur.name);
    cur = folderMap.get(cur.parentId);
  }
  const combined = `${parts.join("/")} / ${asset.name || ""} / ${asset.fileName || ""}`.toLowerCase();
  if (/英文|english|\ben\b|[\s_/-]en[\s_./-]|en[-_]us/i.test(combined)) {
    return ["en-US"];
  }
  if (/日文|日语|japanese|\bja\b|[\s_/-]ja[\s_./-]|ja[-_]jp/i.test(combined)) {
    return ["ja"];
  }
  if (/繁体|繁體|traditional|zh[-_]hant|zh[-_]tw|zh[-_]hk/i.test(combined)) {
    return ["zh-Hant"];
  }
  if (/韩文|韩语|korean|\bko\b|[\s_/-]ko[\s_./-]|ko[-_]kr/i.test(combined)) {
    return ["ko"];
  }
  return ["zh-Hans"];
}

export function normalizeData(data) {
  const { features, ...rest } = data;
  return {
    ...rest,
    products: (data.products || []).map(p => ({
      ...p,
      englishName: p.englishName || "",
    })),
    promotions: data.promotions || [],
    developmentJournal: data.developmentJournal ?? [],
    contents: (data.contents || []).map(c => ({
      ...c,
      tags: c.tags || [],
    })),
    docFolders: data.docFolders || [],
    assets: (data.assets || []).map(a => ({
      ...a,
      languages: Array.isArray(a.languages) && a.languages.length > 0
        ? a.languages
        : inferAssetLanguages(a, data.assetFolders),
    })),
    assetFolders: data.assetFolders || [],
    contentGroups: (data.contentGroups || []).map(g => ({
      ...g,
      productIds: g.productIds || [],
      channels: g.channels || [],
    })),
    analyticsReports: (data.analyticsReports || []).map(r => ({
      ...r,
      tags: r.tags || [],
    })),
    releases: (data.releases || []).map(r => ({
      ...r,
      tags: r.tags || [],
      languages: r.languages || [],
      channels: r.channels || [],
      notes: r.notes || [],
      proposals: r.proposals || [],
    })),
  };
}
export function openStore(path, initial) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, body TEXT NOT NULL)",
  );

  const isMemory = path === ":memory:";
  const assetsDir = isMemory ? null : resolve(dirname(path), "assets");
  const memoryBlobs = isMemory ? new Map() : null;

  if (assetsDir) {
    mkdirSync(assetsDir, { recursive: true });
  }

  function persistAssetFile(asset, force = false) {
    if (!assetsDir) return;
    if (!asset || typeof asset.url !== "string") return;
    if (!asset.url.startsWith("data:")) return;
    if (!force && asset.url.length < 64 * 1024) return;

    const match = asset.url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return;

    const mime = match[1];
    const base64Data = match[2];
    const ext =
      (asset.fileName && extname(asset.fileName).replace(/^\./, "")) ||
      (mime.includes("png") ? "png" : mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "png");

    const buf = Buffer.from(base64Data, "base64");
    if (!asset.fileSize || asset.fileSize <= 0) {
      asset.fileSize = buf.length;
    }

    const filePath = join(assetsDir, `${asset.id}.${ext}`);
    writeFileSync(filePath, buf);

    asset.url = `/api/assets/file/${asset.id}`;
  }

  function getAssetFile(id) {
    if (memoryBlobs && memoryBlobs.has(id)) {
      const item = memoryBlobs.get(id);
      return { buffer: item.buffer, mime: item.mime };
    }
    if (assetsDir) {
      try {
        const files = readdirSync(assetsDir);
        const match = files.find((f) => f.startsWith(`${id}.`));
        if (match) {
          const filePath = join(assetsDir, match);
          const ext = extname(match).replace(/^\./, "").toLowerCase();
          const mimeMap = {
            png: "image/png",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            webp: "image/webp",
            gif: "image/gif",
            svg: "image/svg+xml",
          };
          return { filePath, mime: mimeMap[ext] || "image/png" };
        }
      } catch {}
    }
    return null;
  }

  function deleteAssetFile(id) {
    if (memoryBlobs) memoryBlobs.delete(id);
    if (assetsDir) {
      try {
        const files = readdirSync(assetsDir);
        const match = files.find((f) => f.startsWith(`${id}.`));
        if (match) unlinkSync(join(assetsDir, match));
      } catch {}
    }
  }

  const normalizedInitial = normalizeData(initial);
  if (normalizedInitial.assets && Array.isArray(normalizedInitial.assets)) {
    for (const a of normalizedInitial.assets) {
      persistAssetFile(a);
    }
  }

  db.prepare("INSERT OR IGNORE INTO workspace VALUES (1, 0, ?)").run(
    JSON.stringify(normalizedInitial),
  );

  // 检查是否需要自动将历史 data: URL 资产迁移至本地文件，释放超大 JSON 占用
  const current = db.prepare("SELECT revision, body FROM workspace WHERE id=1").get();
  if (current && typeof current.body === "string" && current.body.includes('"url":"data:')) {
    try {
      const data = JSON.parse(current.body);
      let migrated = false;
      for (const a of data.assets || []) {
        if (typeof a.url === "string" && a.url.startsWith("data:")) {
          persistAssetFile(a);
          migrated = true;
        }
      }
      if (migrated) {
        db.prepare("UPDATE workspace SET body=? WHERE id=1").run(JSON.stringify(data));
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      }
    } catch (e) {
      console.warn("自动迁移历史资产文件警告:", e.message);
    }
  }

  // 检查是否需要自动将历史素材标注上适用语言
  const workspaceRow = db.prepare("SELECT revision, body FROM workspace WHERE id=1").get();
  if (workspaceRow && typeof workspaceRow.body === "string") {
    try {
      const data = JSON.parse(workspaceRow.body);
      let needsLanguageAnnotation = false;
      if (data.assets && Array.isArray(data.assets)) {
        for (const a of data.assets) {
          if (!Array.isArray(a.languages) || a.languages.length === 0) {
            a.languages = inferAssetLanguages(a, data.assetFolders);
            needsLanguageAnnotation = true;
          }
        }
      }
      if (needsLanguageAnnotation) {
        db.prepare("UPDATE workspace SET body=? WHERE id=1").run(JSON.stringify(data));
        db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      }
    } catch (e) {
      console.warn("自动标注素材语言警告:", e.message);
    }
  }
  db.exec("CREATE TABLE IF NOT EXISTS publication_events (id INTEGER PRIMARY KEY, release_id TEXT NOT NULL, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS aso_events (id INTEGER PRIMARY KEY, product_id TEXT NOT NULL, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS aso_media_drafts (target TEXT PRIMARY KEY, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS aso_media (product_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS product_insights (product_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS aso_workspaces (product_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS app_store_custom_pages (product_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS app_store_page_optimizations (product_id TEXT PRIMARY KEY, body TEXT NOT NULL)");
  // 删除已移除研究模块的数据，保留文案草稿、执行记录和新版分析报告。
  const updateAsoWorkspace = db.prepare("UPDATE aso_workspaces SET body=?, revision=revision+1 WHERE product_id=?");
  for (const row of db.prepare("SELECT product_id, body FROM aso_workspaces").all()) {
    const value = JSON.parse(row.body);
    const cleaned = { appId: value.appId, plans: (value.plans || []).map(plan => {
      const { keywords, competitors, ...sources } = plan.sources || {};
      return { ...plan, sources };
    }), ...(Array.isArray(value.reports) ? { reports: value.reports } : {}) };
    if (JSON.stringify(cleaned) !== row.body) updateAsoWorkspace.run(JSON.stringify(cleaned), row.product_id);
  }
  db.exec("CREATE TABLE IF NOT EXISTS wechat_credentials (account_id TEXT PRIMARY KEY, app_id TEXT NOT NULL, secret TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS personal_site_stats (key TEXT PRIMARY KEY, body TEXT NOT NULL)");
  return {
    personalSiteStats(value) {
      if (value) {
        db.prepare("INSERT INTO personal_site_stats VALUES ('overview', ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body").run(JSON.stringify(value));
      }
      const row = db.prepare("SELECT body FROM personal_site_stats WHERE key='overview'").get();
      return row ? JSON.parse(row.body) : null;
    },
    baiduOAuth(value) {
      if (value) {
        db.prepare("INSERT INTO personal_site_stats VALUES ('baidu_oauth', ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body").run(JSON.stringify(value));
      }
      const row = db.prepare("SELECT body FROM personal_site_stats WHERE key='baidu_oauth'").get();
      return row ? JSON.parse(row.body) : null;
    },
    articleMetrics(value) {
      if (value) {
        db.prepare("INSERT INTO personal_site_stats VALUES ('article_metrics', ?) ON CONFLICT(key) DO UPDATE SET body=excluded.body").run(JSON.stringify(value));
      }
      const row = db.prepare("SELECT body FROM personal_site_stats WHERE key='article_metrics'").get();
      return row ? JSON.parse(row.body) : null;
    },
    wechatCredential(accountId) {
      return db.prepare("SELECT app_id AS appId, secret FROM wechat_credentials WHERE account_id=?").get(accountId);
    },
    asoWorkspace(productId) {
      const row = db.prepare("SELECT revision, body FROM aso_workspaces WHERE product_id=?").get(productId);
      return row ? { ...JSON.parse(row.body), revision: row.revision } : null;
    },
    saveAsoWorkspace(productId, value, expectedRevision) {
      const body = JSON.stringify(value);
      const result = db.prepare("INSERT INTO aso_workspaces VALUES (?, 1, ?) ON CONFLICT(product_id) DO UPDATE SET revision=revision+1, body=excluded.body WHERE revision=?").run(productId, body, expectedRevision);
      return result.changes ? this.asoWorkspace(productId) : null;
    },
    productInsights(productId, value) {
      if (value) db.prepare("INSERT INTO product_insights VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET body=excluded.body").run(productId, JSON.stringify(value));
      const row = db.prepare("SELECT body FROM product_insights WHERE product_id=?").get(productId);
      return row ? JSON.parse(row.body) : null;
    },
    asoMediaDraft(productId, appId, versionId, locale, changes) {
      const target = JSON.stringify([productId, String(appId), versionId, locale]);
      const row = db.prepare("SELECT body FROM aso_media_drafts WHERE target=?").get(target);
      const saved = row ? JSON.parse(row.body) : [];
      const groups = new Map();
      for (const entry of saved) {
        const key = JSON.stringify([entry.type, entry.group]);
        if (entry.items) groups.set(key, entry);
        else {
          if (!groups.has(key)) groups.set(key, { type: entry.type, group: entry.group, items: [] });
          groups.get(key).items.push({ name: entry.name, data: entry.upload });
        }
      }
      if (changes) {
        for (const change of changes) {
          const key = JSON.stringify([change.type, change.group]);
          if (change.items) groups.set(key, change);
          else groups.delete(key);
        }
        db.prepare("INSERT INTO aso_media_drafts VALUES (?, ?) ON CONFLICT(target) DO UPDATE SET body=excluded.body").run(target, JSON.stringify([...groups.values()]));
      }
      return [...groups.values()];
    },
    asoMedia(productId, value) {
      if (value) db.prepare("INSERT INTO aso_media VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET body=excluded.body").run(productId, JSON.stringify(value));
      const row = db.prepare("SELECT body FROM aso_media WHERE product_id=?").get(productId);
      return row ? JSON.parse(row.body) : null;
    },
    customProductPages(productId, value) {
      if (value) db.prepare("INSERT INTO app_store_custom_pages VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET body=excluded.body").run(productId, JSON.stringify(value));
      const row = db.prepare("SELECT body FROM app_store_custom_pages WHERE product_id=?").get(productId);
      return row ? JSON.parse(row.body) : null;
    },
    pageOptimizations(productId, value) {
      if (value) db.prepare("INSERT INTO app_store_page_optimizations VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET body=excluded.body").run(productId, JSON.stringify(value));
      const row = db.prepare("SELECT body FROM app_store_page_optimizations WHERE product_id=?").get(productId);
      return row ? JSON.parse(row.body) : null;
    },
    asoEvent(productId, event) {
      db.prepare("INSERT INTO aso_events (product_id, body) VALUES (?, ?)").run(productId, JSON.stringify({ ...event, at: new Date().toISOString() }));
    },
    asoEvents(productId) {
      return db.prepare("SELECT body FROM aso_events WHERE product_id=? ORDER BY id DESC LIMIT 100").all(productId).map(r => JSON.parse(r.body));
    },
    publicationEvents(releaseId) {
      return db.prepare("SELECT body FROM publication_events WHERE release_id=? ORDER BY id DESC LIMIT 20").all(releaseId).map(r => JSON.parse(r.body));
    },
    publicationEvent(releaseId, event) {
      db.prepare("INSERT INTO publication_events (release_id, body) VALUES (?, ?)").run(releaseId, JSON.stringify({ ...event, at: new Date().toISOString() }));
    },
    read() {
      const r = db.prepare("SELECT * FROM workspace WHERE id=1").get();
      return { revision: r.revision, data: normalizeData(JSON.parse(r.body)) };
    },
    write(data, revision, wechatCredential) {
      data = normalizeData(data);
      if (data.assets && Array.isArray(data.assets)) {
        for (const a of data.assets) {
          persistAssetFile(a);
        }
      }
      if (!validateData(data)) throw new Error("工作区数据格式不正确");
      const prevRow = db.prepare("SELECT body FROM workspace WHERE id=1").get();
      if (prevRow) {
        try {
          const prevAssets = JSON.parse(prevRow.body)?.assets || [];
          const currentIds = new Set((data.assets || []).map((a) => a.id));
          for (const prev of prevAssets) {
            if (!currentIds.has(prev.id)) {
              deleteAssetFile(prev.id);
            }
          }
        } catch {}
      }
      const update = db.prepare("UPDATE workspace SET body=?, revision=revision+1 WHERE id=1 AND revision=?");
      if (wechatCredential) db.exec("BEGIN IMMEDIATE");
      try {
        const result = update.run(JSON.stringify(data), revision);
        if (wechatCredential) {
          if (result.changes) db.prepare(
            "INSERT INTO wechat_credentials VALUES (?, ?, ?) ON CONFLICT(account_id) DO UPDATE SET app_id=excluded.app_id, secret=excluded.secret"
          ).run(wechatCredential.accountId, wechatCredential.appId, wechatCredential.secret);
          db.exec("COMMIT");
        }
        if (!result.changes) return null;
      } catch (error) {
        if (wechatCredential) db.exec("ROLLBACK");
        throw error;
      }
      return this.read();
    },
    appendAssets(newAssets = [], newFolders = [], expectedRevision) {
      const row = db.prepare("SELECT revision, body FROM workspace WHERE id=1").get();
      if (!row) return null;
      if (expectedRevision !== undefined && row.revision !== expectedRevision) {
        return null;
      }
      const data = JSON.parse(row.body);
      if (newFolders.length > 0) {
        data.assetFolders = [...(data.assetFolders || []), ...newFolders];
      }
      for (const a of newAssets) {
        persistAssetFile(a, true);
      }
      if (newAssets.length > 0) {
        data.assets = [...(data.assets || []), ...newAssets];
      }
      const nextData = normalizeData(data);
      if (!validateData(nextData)) throw new Error("工作区数据格式不正确");
      const r = db
        .prepare(
          "UPDATE workspace SET body=?, revision=revision+1 WHERE id=1 AND revision=?",
        )
        .run(JSON.stringify(nextData), row.revision);
      if (!r.changes) return null;
      return { revision: row.revision + 1, count: newAssets.length };
    },
    getAssetFile(id) {
      return getAssetFile(id);
    },
    deleteAssetFile(id) {
      return deleteAssetFile(id);
    },
    close() {
      db.close();
    },
  };
}
