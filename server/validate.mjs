import { socialDataSchema } from "./social-analytics.mjs";
import { journalEntries } from "./development-journal.mjs";
const text = (x) => typeof x === "string";
const strings = (x) => Array.isArray(x) && x.every(text);
const has = (x, keys) => x && keys.every((k) => text(x[k]));
const safeUrl = (s) => !s || /^https?:\/\//i.test(s);
export function validIcon(icon) {
  if (!icon) return true;
  if (/^\/icons\/[a-z]+\.jpg$/.test(icon)) return true;
  if (
    typeof icon !== "string" ||
    icon.length > 500000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(icon)
  )
    return false;
  const bytes = Buffer.from(icon.split(",")[1], "base64");
  return (
    bytes.length > 24 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.readUInt32BE(16) <= 1024 &&
    bytes.readUInt32BE(20) <= 1024
  );
}
const validStoreVersion = v => has(v, ["id", "version", "platform", "state"]) && Array.isArray(v.notes) && v.notes.every(n => has(n, ["locale", "body"]));
const validStoreLink = v => has(v, ["appId", "name", "bundleId", "syncedAt"]) && /^[0-9]+$/.test(v.appId) && Array.isArray(v.versions) && v.versions.every(validStoreVersion) && new Set(v.versions.map(x => x.id)).size === v.versions.length;
export function validateData(data) {
  if (!data) return false;
  const journal = journalEntries.safeParse(data.developmentJournal ?? []);
  if (!journal.success || new Set(journal.data.map(entry => entry.id)).size !== journal.data.length) return false;
  if (data.socialAnalytics !== undefined && !socialDataSchema.safeParse(data.socialAnalytics).success) return false;
  data.promotions = data.promotions || [];
  data.docFolders = data.docFolders || [];
  data.assets = data.assets || [];
  data.assetFolders = data.assetFolders || [];
  data.contentGroups = data.contentGroups || [];
  data.analyticsReports = data.analyticsReports || [];
  data.briefings = data.briefings || [];
  data.briefingItems = data.briefingItems || [];
  data.briefingSearchConfigs = data.briefingSearchConfigs || [];
  const collections = [
    "products",
    "docs",
    "docFolders",
    "assets",
    "assetFolders",
    "releases",
    "contents",
    "contentGroups",
    "tasks",
    "promotions",
    "analyticsReports",
    "briefings",
    "briefingItems",
    "briefingSearchConfigs",
  ];
  if (!collections.every((k) => Array.isArray(data[k]))) return false;
  if (
    !collections.every(
      (k) =>
        data[k].every((x) => has(x, ["id"]) && x.id.length) &&
        new Set(data[k].map((x) => x.id)).size === data[k].length,
    )
  )
    return false;
  if (!data.products.every(p => !p.promotionSchedule || (
    /^([01]\d|2[0-3]):[0-5]\d$/.test(p.promotionSchedule.time) &&
    typeof p.promotionSchedule.timezone === "string" && (() => { try { new Intl.DateTimeFormat("zh-CN", { timeZone: p.promotionSchedule.timezone }); return true; } catch { return false; } })() &&
    Number.isInteger(p.promotionSchedule.minutes) && p.promotionSchedule.minutes >= 5 && p.promotionSchedule.minutes <= 120
  ))) return false;
  const productIds = new Set(data.products.map((p) => p.id));
  if (
    !collections
      .slice(1)
      .filter((k) => k !== "contentGroups" && k !== "briefings")
      .every((k) => data[k].every((x) => productIds.has(x.productId) || (k === "tasks" && x.productId === "") || (["docs", "docFolders", "assets", "assetFolders", "analyticsReports", "contents", "briefingItems", "briefingSearchConfigs"].includes(k) && (!x.productId || x.productId === "" || x.productId === "general"))))
  )
    return false;
  if (!data.contentGroups.every((g) => (g.productIds || []).every((pid) => productIds.has(pid))))
    return false;
  if (!data.briefings.every((b) =>
    has(b, ["date", "timezone", "runAt", "budget", "status"]) &&
    /^\d{4}-\d{2}-\d{2}$/.test(b.date) &&
    ["completed", "empty"].includes(b.status) &&
    Array.isArray(b.frameworks) &&
    b.frameworks.every(f => (!f.productId || f.productId === "general" || productIds.has(f.productId)) && strings(f.focusQuestions) && strings(f.competitors) && strings(f.platforms) && strings(f.keywords) && (f.insufficientFacts === undefined || typeof f.insufficientFacts === "string")) &&
    Array.isArray(b.platformSummaries) &&
    b.platformSummaries.every(s => has(s, ["platform", "query"]) && typeof s.openedCount === "number" && s.openedCount >= 0 && (s.restrictions === undefined || typeof s.restrictions === "string")) &&
    strings(b.itemIds) &&
    (b.note === undefined || typeof b.note === "string")
  )) return false;
  if (!data.briefingItems.every((i) =>
    has(i, ["briefingId", "category", "title", "summary", "relevance", "platform", "url", "publishedAt", "checkedAt", "verification", "status"]) &&
    (!i.productId || i.productId === "general" || productIds.has(i.productId)) &&
    i.title.trim() &&
    i.summary.trim() &&
    i.relevance.trim() &&
    i.platform.trim() &&
    safeUrl(i.url) &&
    i.url.trim().length > 0 &&
    ["platform_change", "competitor_move", "user_voice", "followup_lead", "industry_trend", "growth_inspiration"].includes(i.category) &&
    ["full", "snippet", "unreachable"].includes(i.verification) &&
    ["new", "saved", "dismissed"].includes(i.status) &&
    (i.savedReason === undefined || typeof i.savedReason === "string") &&
    (i.savedAt === undefined || typeof i.savedAt === "string") &&
    (i.isRead === undefined || typeof i.isRead === "boolean") &&
    (i.readAt === undefined || typeof i.readAt === "string") &&
    (i.clusterId === undefined || typeof i.clusterId === "string") &&
    (i.relatedSources === undefined || (Array.isArray(i.relatedSources) && i.relatedSources.every(s => has(s, ["title", "url", "platform"]) && safeUrl(s.url)))) &&
    (i.linkedDocId === undefined || typeof i.linkedDocId === "string") &&
    (i.linkedTaskId === undefined || typeof i.linkedTaskId === "string") &&
    (i.linkedContentId === undefined || typeof i.linkedContentId === "string")
  )) return false;
  if (!data.briefingSearchConfigs.every((c) =>
    has(c, ["name"]) &&
    typeof c.name === "string" &&
    c.name.trim() &&
    (!c.productId || c.productId === "general" || productIds.has(c.productId)) &&
    (c.weight === undefined || (typeof c.weight === "number" && c.weight >= 1 && c.weight <= 10)) &&
    (c.enabled === undefined || typeof c.enabled === "boolean") &&
    (c.category === undefined || typeof c.category === "string") &&
    (c.focusQuestions === undefined || strings(c.focusQuestions)) &&
    (c.keywords === undefined || strings(c.keywords)) &&
    (c.platforms === undefined || strings(c.platforms)) &&
    (c.competitors === undefined || strings(c.competitors)) &&
    (c.createdAt === undefined || typeof c.createdAt === "string") &&
    (c.updatedAt === undefined || typeof c.updatedAt === "string")
  )) return false;
  if (!data.analyticsReports.every((r) =>
    has(r, ["title", "content", "createdAt"]) &&
    r.title.trim() &&
    r.content.trim() &&
    (r.productId === undefined || typeof r.productId === "string") &&
    (r.summary === undefined || typeof r.summary === "string") &&
    (r.period === undefined || typeof r.period === "string") &&
    (r.tags === undefined || strings(r.tags)) &&
    (r.metricsSummary === undefined || typeof r.metricsSummary === "object") &&
    (r.isRead === undefined || typeof r.isRead === "boolean") &&
    (r.readAt === undefined || typeof r.readAt === "string")
  )) return false;
  if (!data.promotions.every(p => has(p, ["title", "body", "reason", "channel", "url", "sourceTitle", "checkedAt", "expiresAt", "date", "feedback", "updatedAt"]) && p.title.trim() &&
    ["brief", "opportunity", "action", "review"].includes(p.kind) && ["suggested", "saved", "planned", "done", "dismissed"].includes(p.status) &&
    (p.verification === undefined || ["full", "snippet"].includes(p.verification)) &&
    (p.evidence === undefined || text(p.evidence)) &&
    (p.participationAdvice === undefined || typeof p.participationAdvice === "string") &&
    (p.verification !== "snippet" || (typeof p.evidence === "string" && p.evidence.trim().length > 0)) &&
    (p.subtasks === undefined || (Array.isArray(p.subtasks) && p.subtasks.every(t => has(t, ["id", "title"]) && t.id.trim() && t.title.trim() && typeof t.done === "boolean") && new Set(p.subtasks.map(t => t.id)).size === p.subtasks.length)) &&
    (p.article === undefined || (has(p.article, ["title", "body", "channel"]) && strings(p.article.assetNames))) &&
    Number.isInteger(p.minutes) && p.minutes >= 0 && p.minutes <= 1440 && safeUrl(p.url) &&
    [p.date, p.checkedAt, p.expiresAt].every(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v)) &&
    (p.kind !== "opportunity" || (p.url && p.sourceTitle.trim() && p.checkedAt)))) return false;
  const folders = new Map(data.docFolders.map((f) => [f.id, f]));
  if (!data.docFolders.every((f) => {
    if (!has(f, ["name", "parentId"]) || !f.name.trim()) return false;
    const seen = new Set([f.id]);
    let parentId = f.parentId;
    while (parentId) {
      const parent = folders.get(parentId);
      if (!parent || parent.productId !== f.productId || seen.has(parentId)) return false;
      seen.add(parentId);
      parentId = parent.parentId;
    }
    return true;
  })) return false;
  if (!data.docs.every((d) => !d.folderId || (typeof d.folderId === "string" && folders.get(d.folderId)?.productId === d.productId))) return false;

  const assetFolders = new Map(data.assetFolders.map((f) => [f.id, f]));
  if (!data.assetFolders.every((f) => {
    if (!has(f, ["name", "parentId"]) || !f.name.trim()) return false;
    const seen = new Set([f.id]);
    let parentId = f.parentId;
    while (parentId) {
      const parent = assetFolders.get(parentId);
      if (!parent || parent.productId !== f.productId || seen.has(parentId)) return false;
      seen.add(parentId);
      parentId = parent.parentId;
    }
    return true;
  })) return false;
  const releaseMap = new Map(data.releases.map((r) => [r.id, r]));
  if (!data.assets.every((a) => {
    if (!has(a, ["name", "url", "fileName", "fileType", "createdAt", "updatedAt"])) return false;
    if (typeof a.fileSize !== "number" || a.fileSize < 0) return false;
    if (a.folderId && (!assetFolders.has(a.folderId) || assetFolders.get(a.folderId)?.productId !== a.productId)) return false;
    if (a.releaseId && (!releaseMap.has(a.releaseId) || releaseMap.get(a.releaseId)?.productId !== a.productId)) return false;
    if (a.languages !== undefined && !strings(a.languages)) return false;
    return true;
  })) return false;
  return (
    data.products.every(
      (p) =>
        has(p, [
          "name",
          "summary",
          "appId",
          "price",
          "platform",
          "website",
          "color",
        ]) &&
        (p.englishName === undefined || typeof p.englishName === "string") &&
        !!p.name.trim() &&
        safeUrl(p.website) &&
        validIcon(p.icon) &&
        (p.appStore === undefined || validStoreLink(p.appStore)),
    ) &&
    data.docs.every(
      (d) =>
        has(d, ["title", "body", "updatedAt"]) &&
        (d.reviewBase === undefined || has(d.reviewBase, ["title", "body"])) &&
        (d.reviewChanges === undefined || (Array.isArray(d.reviewChanges) && d.reviewChanges.every(r => has(r, ["field", "before", "after", "source", "at"]) && ["title", "body"].includes(r.field)))) &&
        ["confirmed", "pending"].includes(d.status) &&
        Array.isArray(d.history) &&
        d.history.every((h) => has(h, ["body", "at"])),
    ) &&
    data.releases.every(
      (r) =>
        has(r, ["version", "changes", "status", "createdAt"]) &&
        (r.storeSource === undefined || (has(r.storeSource, ["appId", "versionId", "platform"]) && /^[0-9]+$/.test(r.storeSource.appId))) &&
        (r.storeSources === undefined || (typeof r.storeSources === "object" && r.storeSources !== null && !Array.isArray(r.storeSources) && Object.values(r.storeSources).every(s => has(s, ["appId", "versionId", "platform"]) && /^[0-9]+$/.test(s.appId)))) &&
        (r.platforms === undefined || strings(r.platforms)) &&
        (r.platformDetails === undefined || (typeof r.platformDetails === "object" && r.platformDetails !== null && !Array.isArray(r.platformDetails) && Object.values(r.platformDetails).every(pd => typeof pd === "object" && pd !== null && typeof pd.version === "string" && typeof pd.changes === "string"))) &&
        strings(r.languages) &&
        strings(r.channels) &&
        (r.tags === undefined || strings(r.tags)) &&
        (r.publishedAt === undefined || (typeof r.publishedAt === "string" && (!r.publishedAt || /^\d{4}-\d{2}-\d{2}$/.test(r.publishedAt)))) &&
        Array.isArray(r.notes) &&
        r.notes.every(
          (n) =>
            has(n, ["language", "body"]) && typeof n.approved === "boolean",
        ) &&
        Array.isArray(r.proposals) &&
        r.proposals.every(
          (p) =>
            has(p, ["docId", "body", "before", "reason"]) &&
            typeof p.applied === "boolean",
        ),
    ) &&
    data.contents.every(
      (c) =>
        has(c, ["title", "body", "channel", "status", "date", "url"]) &&
        (c.productId === undefined || typeof c.productId === "string") &&
        (c.productIds === undefined || (strings(c.productIds) &&
          c.productIds.every(id => productIds.has(id)) &&
          new Set(c.productIds).size === c.productIds.length &&
          (c.productIds[0] || "") === (c.productId || ""))) &&
        ["draft", "review", "ready", "published", "archived"].includes(c.status) &&
        (c.publishedAt === undefined || (typeof c.publishedAt === "string" && (!c.publishedAt || /^\d{4}-\d{2}-\d{2}$/.test(c.publishedAt)))) &&
        (c.coverAssetId === undefined || typeof c.coverAssetId === "string") &&
        (c.assetIds === undefined || strings(c.assetIds)) &&
        (c.assetNames === undefined || strings(c.assetNames)) &&
        (c.tags === undefined || strings(c.tags)) &&
        (c.sourcePromotionId === undefined || text(c.sourcePromotionId)) &&
        (c.accountId === undefined || text(c.accountId)) &&
        (c.groupId === undefined || text(c.groupId)) &&
        (c.isAi === undefined || typeof c.isAi === "boolean") &&
        (c.createdAt === undefined || typeof c.createdAt === "string") &&
        (c.redditCommunities === undefined || (Array.isArray(c.redditCommunities) &&
          c.redditCommunities.length <= 5 && c.redditCommunities.every(entry =>
            has(entry, ["name", "reason", "rules", "notes"]) && /^r\/[a-zA-Z0-9_]{2,21}$/.test(entry.name) &&
            (entry.sourceUrl === undefined || (text(entry.sourceUrl) && /^https?:\/\//i.test(entry.sourceUrl))) &&
            (entry.checkedAt === undefined || (text(entry.checkedAt) && /^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt)))))) &&
        (c.explanation === undefined || typeof c.explanation === "string") &&
        safeUrl(c.url),
    ) &&
    data.contentGroups.every(
      (g) =>
        has(g, ["title", "direction"]) &&
        strings(g.productIds || []) &&
        strings(g.channels || []) &&
        (g.targets === undefined || (Array.isArray(g.targets) && g.targets.every((t) => has(t, ["channel"]) && !!t.channel.trim() && (t.accountId === undefined || text(t.accountId))))),
    ) &&
    data.tasks.every(
      (t) => has(t, ["title", "date"]) && typeof t.done === "boolean",
    )
  );
}
