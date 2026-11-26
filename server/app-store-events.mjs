import { AppleConnectionError } from "./app-store-connect.mjs";

export const ALL_APP_STORE_TERRITORIES = [
  "USA", "FRA", "DEU", "GBR", "AUT", "BEL", "FIN", "GRC", "IRL", "ITA", "LUX", "NLD", "PRT", "ESP", "CAN", "SWE",
  "NOR", "DNK", "CHE", "AUS", "NZL", "JPN", "HKG", "SGP", "CHN", "KOR", "IND", "MEX", "RUS", "TWN", "VNM", "ZAF",
  "MYS", "PHL", "THA", "IDN", "PAK", "POL", "SAU", "TUR", "ARE", "HUN", "CHL", "NPL", "PAN", "LKA", "ROU", "MDV",
  "CZE", "ISR", "UKR", "KWT", "HRV", "CRI", "SVK", "LBN", "QAT", "SVN", "SRB", "COL", "VEN", "BRA", "GTM", "ARG",
  "SLV", "PER", "DOM", "ECU", "HND", "JAM", "NIC", "PRY", "URY", "MAC", "EGY", "KAZ", "EST", "LVA", "LTU", "MLT",
  "MDA", "ARM", "BWA", "BGR", "CIV", "JOR", "KEN", "MKD", "MDG", "MLI", "MUS", "NER", "SEN", "TUN", "UGA", "AIA",
  "BHS", "ATG", "BRB", "BMU", "VGB", "CYM", "DMA", "GRD", "MSR", "KNA", "LCA", "VCT", "TTO", "TCA", "GUY", "SUR",
  "BLZ", "BOL", "CYP", "ISL", "BHR", "BRN", "NGA", "OMN", "DZA", "AGO", "BLR", "UZB", "LBY", "AZE", "MMR", "YEM",
  "TZA", "GHA", "CMR", "ALB", "BEN", "BTN", "BFA", "KHM", "CPV", "TCD", "COG", "FJI", "GMB", "GNB", "KGZ", "LAO",
  "LBR", "MWI", "MRT", "FSM", "MNG", "MOZ", "NAM", "PLW", "PNG", "STP", "SYC", "SLE", "SLB", "SWZ", "TJK", "TKM",
  "ZWE", "NRU", "TON", "VUT", "AFG", "BIH", "COD", "GAB", "GEO", "IRQ", "MNE", "MAR", "RWA", "ZMB", "XKS"
];

function formatAppleImageUrl(templateUrl, width, height) {
  if (!templateUrl || typeof templateUrl !== "string") return "";
  return templateUrl
    .replace("{w}", String(width || 1920))
    .replace("{h}", String(height || 1080))
    .replace("{c}", "")
    .replace("{f}", "png");
}

export function normalizeBadge(raw) {
  if (!raw) return "SPECIAL_EVENT";
  if (raw === "LIVE_STREAM") return "LIVE_EVENT";
  return raw;
}

function parseImageBytes(mediaUrl, store) {
  if (!mediaUrl || typeof mediaUrl !== "string") return null;

  const dataMatch = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+=*)$/.exec(mediaUrl);
  if (dataMatch) {
    const ext = dataMatch[1] === "png" ? "png" : "jpg";
    const bytes = Buffer.from(dataMatch[2], "base64");
    return {
      bytes,
      fileName: `event-media-${Date.now()}.${ext}`,
      contentType: ext === "png" ? "image/png" : "image/jpeg",
    };
  }

  const assetMatch = /\/api\/assets\/([^/?#]+)/.exec(mediaUrl);
  if (assetMatch && store?.getAssetFile) {
    const file = store.getAssetFile(assetMatch[1]);
    if (file && file.data) {
      const ext = (file.filename || "").endsWith(".jpg") || (file.contentType || "").includes("jpeg") ? "jpg" : "png";
      return {
        bytes: Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data),
        fileName: file.filename || `asset-${assetMatch[1]}.${ext}`,
        contentType: ext === "png" ? "image/png" : "image/jpeg",
      };
    }
  }

  return null;
}

async function uploadAppEventScreenshot(client, localizationId, assetType, imageInfo, fetcher = fetch) {
  if (!imageInfo || !imageInfo.bytes) return null;

  // 1. 检查并清理该展示位已有的旧截图
  try {
    const existingShots = await client.paginate(`/v1/appEventLocalizations/${encodeURIComponent(localizationId)}/appEventScreenshots`);
    for (const shot of (existingShots.data || [])) {
      if (shot.attributes?.appEventAssetType === assetType) {
        try {
          await client.request(`/v1/appEventScreenshots/${encodeURIComponent(shot.id)}`, "DELETE");
        } catch (delErr) {
          console.warn("[AppStoreEvents] delete old screenshot error:", delErr.message);
        }
      }
    }
  } catch (checkErr) {
    console.warn("[AppStoreEvents] check existing screenshots warning:", checkErr.message);
  }

  // 2. 预定上传通道
  const res = await client.request("/v1/appEventScreenshots", "POST", {
    data: {
      type: "appEventScreenshots",
      attributes: {
        fileName: imageInfo.fileName,
        fileSize: imageInfo.bytes.length,
        appEventAssetType: assetType,
      },
      relationships: {
        appEventLocalization: {
          data: {
            type: "appEventLocalizations",
            id: localizationId,
          },
        },
      },
    },
  });

  const shot = res.data;
  const operations = shot?.attributes?.uploadOperations;
  if (!shot?.id || !operations?.length) {
    throw new AppleConnectionError("Apple 未返回图片上传通道 (uploadOperations)", 502);
  }

  // 3. 执行分块 PUT 上传
  for (const part of operations) {
    const chunkLength = Math.min(part.length, imageInfo.bytes.length - part.offset);
    const body = imageInfo.bytes.subarray(part.offset, part.offset + chunkLength);
    const headers = Object.fromEntries((part.requestHeaders || []).map(({ name, value }) => [name, value]));
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === "content-length") headers[key] = String(chunkLength);
    }
    const response = await fetcher(part.url, {
      method: (part.method || "PUT").toUpperCase(),
      headers,
      body,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      throw new AppleConnectionError(`图片分块上传失败 (HTTP ${response.status})`, 502);
    }
  }

  // 4. 确认上传完毕
  await client.request(`/v1/appEventScreenshots/${encodeURIComponent(shot.id)}`, "PATCH", {
    data: {
      type: "appEventScreenshots",
      id: shot.id,
      attributes: { uploaded: true },
    },
  });

  // 5. 轮询处理状态
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const { data: updatedShot } = await client.request(`/v1/appEventScreenshots/${encodeURIComponent(shot.id)}`);
      const state = updatedShot?.attributes?.assetDeliveryState?.state;
      if (state === "COMPLETE" || state === "UPLOAD_COMPLETE" || !state) {
        return updatedShot;
      }
      if (state === "FAILED") {
        const errors = updatedShot?.attributes?.assetDeliveryState?.errors || [];
        const msg = errors.map(e => e.description || e.code).join("；");
        throw new AppleConnectionError(`Apple 处理图片失败：${msg || "请检查图片尺寸（卡片需 1920×1080，详情需 1080×1920）"}`, 422);
      }
    } catch (pollErr) {
      if (pollErr instanceof AppleConnectionError) throw pollErr;
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  return shot;
}

function getProductAndAppId(store, productId) {
  const product = store.read().data.products.find(p => p.id === productId);
  if (!product) throw new AppleConnectionError("未找到指定产品", 404);
  return { product, appId: product.appStore?.appId };
}

function collectProductLocales(store, product) {
  const set = new Set();
  for (const v of product.appStore?.versions || []) {
    for (const note of v.notes || []) {
      if (note.locale) set.add(note.locale);
    }
  }
  const insights = store.productInsights?.(product.id);
  for (const l of insights?.aso?.localizations || []) {
    if (l.locale) set.add(l.locale);
  }
  if (set.size === 0) {
    return ["zh-Hans", "en-US", "ja", "zh-Hant", "ko", "de-DE", "fr-FR", "es-ES"];
  }
  return Array.from(set);
}

export function openAppStoreEvents(store, apple, fetcher = fetch) {
  const isAppleConfigured = () => apple?.status?.()?.configured;

  async function getClient() {
    if (!isAppleConfigured()) return null;
    return apple.session();
  }

  async function listInAppEvents(productId, { refresh = false } = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    const locales = collectProductLocales(store, product);

    if (!refresh) {
      const cached = store.inAppEvents(productId);
      if (cached && (!isAppleConfigured() || !appId || cached.syncedAt)) {
        return { ...cached, locales };
      }
    }

    if (!isAppleConfigured() || !appId) {
      const stored = store.inAppEvents(productId) || {
        configured: false,
        appId: appId || "",
        events: [],
        syncedAt: null,
      };
      return { ...stored, locales };
    }

    const client = await getClient();
    try {
      const appPath = `/v1/apps/${encodeURIComponent(appId)}`;
      const eventsRes = await client.paginate(`${appPath}/appEvents?include=localizations`);
      const includedLocs = (eventsRes.included || []).filter(item => item.type === "appEventLocalizations");
      const locMap = new Map(includedLocs.map(l => [l.id, l]));

      const events = [];
      for (const item of eventsRes.data) {
        const eventId = item.id;
        const attrs = item.attributes || {};
        const relLocIds = (item.relationships?.localizations?.data || []).map(l => l.id);

        let localizations = relLocIds.map(lid => locMap.get(lid)).filter(Boolean).map(l => ({
          id: l.id,
          locale: l.attributes?.locale || "",
          name: l.attributes?.name || "",
          shortDescription: l.attributes?.shortDescription || "",
          longDescription: l.attributes?.longDescription || "",
          cardMediaUrl: l.attributes?.cardMediaUrl || "",
          detailMediaUrl: l.attributes?.detailMediaUrl || "",
        }));

        if (localizations.length === 0 && relLocIds.length > 0) {
          try {
            const locRes = await client.paginate(`/v1/appEvents/${encodeURIComponent(eventId)}/localizations`);
            localizations = (locRes.data || []).map(l => ({
              id: l.id,
              locale: l.attributes?.locale || "",
              name: l.attributes?.name || "",
              shortDescription: l.attributes?.shortDescription || "",
              longDescription: l.attributes?.longDescription || "",
              cardMediaUrl: l.attributes?.cardMediaUrl || "",
              detailMediaUrl: l.attributes?.detailMediaUrl || "",
            }));
          } catch {
            localizations = [];
          }
        }

        // 读取 Apple 媒体服务器中的活动截图素材
        for (const loc of localizations) {
          if (loc.id) {
            try {
              const shotRes = await client.paginate(`/v1/appEventLocalizations/${encodeURIComponent(loc.id)}/appEventScreenshots`);
              for (const shot of (shotRes.data || [])) {
                const type = shot.attributes?.appEventAssetType;
                const tpl = shot.attributes?.imageAsset?.templateUrl;
                if (type === "EVENT_CARD" && tpl) {
                  loc.cardMediaUrl = formatAppleImageUrl(tpl, 1920, 1080);
                } else if (type === "EVENT_DETAILS_PAGE" && tpl) {
                  loc.detailMediaUrl = formatAppleImageUrl(tpl, 1080, 1920);
                }
              }
            } catch {
              // 忽略截图读取异常，降级使用本地缓存
            }
          }
        }

        // 回退合并本地 SQLite 缓存中的图片素材（处理 CDN 延迟或未完成渲染场景）
        const localCachedEvent = (store.inAppEvents(productId)?.events || []).find(e => e.id === eventId);
        if (localCachedEvent && Array.isArray(localCachedEvent.localizations)) {
          for (const loc of localizations) {
            const matchedLocal = localCachedEvent.localizations.find(l => l.locale === loc.locale || l.id === loc.id);
            if (matchedLocal) {
              if (!loc.cardMediaUrl && matchedLocal.cardMediaUrl) loc.cardMediaUrl = matchedLocal.cardMediaUrl;
              if (!loc.detailMediaUrl && matchedLocal.detailMediaUrl) loc.detailMediaUrl = matchedLocal.detailMediaUrl;
            }
          }
        }

        events.push({
          id: eventId,
          referenceName: attrs.referenceName || "",
          badge: normalizeBadge(attrs.badge),
          eventState: attrs.eventState || "DRAFT",
          deepLink: attrs.deepLink || "",
          purchaseRequirement: attrs.purchaseRequirement || "NO_COST_ASSOCIATED",
          purpose: attrs.purpose || "APPROPRIATE_FOR_ALL_USERS",
          priority: attrs.priority || "NORMAL",
          primaryLocale: attrs.primaryLocale || "zh-Hans",
          territorySchedules: attrs.territorySchedules || [],
          archivedTerritorySchedules: attrs.archivedTerritorySchedules || [],
          localizations,
          createdAt: attrs.createdAt,
          updatedAt: attrs.updatedAt,
        });
      }

      const payload = {
        configured: true,
        appId,
        events,
        locales,
        syncedAt: new Date().toISOString(),
      };
      store.inAppEvents(productId, payload);
      return payload;
    } catch (err) {
      console.warn("[AppStoreEvents] listInAppEvents warning:", err.message);
      const cached = store.inAppEvents(productId) || {
        configured: true,
        appId,
        events: [],
        syncedAt: null,
      };
      return { ...cached, locales, error: err.message };
    }
  }

  async function getInAppEvent(productId, eventId) {
    if (!eventId) throw new AppleConnectionError("请提供活动 ID (eventId)");
    const listResult = await listInAppEvents(productId);
    const event = (listResult.events || []).find(e => e.id === eventId);
    if (!event) throw new AppleConnectionError("未找到指定活动", 404);
    return {
      configured: listResult.configured,
      appId: listResult.appId,
      event,
      locales: listResult.locales,
      syncedAt: listResult.syncedAt,
    };
  }

  async function createInAppEvent(productId, input = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    const referenceName = (input.referenceName || input.name || "").trim();
    if (!referenceName) throw new AppleConnectionError("请填写活动参考名称 (referenceName)");

    const badge = normalizeBadge(input.badge);
    const primaryLocale = input.primaryLocale || input.locale || "zh-Hans";
    const deepLink = (input.deepLink || "").trim();
    const purchaseRequirement = input.purchaseRequirement || "NO_COST_ASSOCIATED";
    const purpose = input.purpose || "APPROPRIATE_FOR_ALL_USERS";
    const priority = input.priority || "NORMAL";

    let territorySchedules = [];
    const nowMs = Date.now();
    if (Array.isArray(input.territorySchedules) && input.territorySchedules.length > 0) {
      territorySchedules = input.territorySchedules.map(sched => {
        let publishStart = sched.publishStart;
        let eventStart = sched.eventStart;
        let eventEnd = sched.eventEnd;
        if (publishStart && new Date(publishStart).getTime() <= nowMs + 60000) {
          publishStart = new Date(nowMs + 15 * 60 * 1000).toISOString();
        }
        if (eventStart && new Date(eventStart).getTime() <= nowMs + 60000) {
          eventStart = new Date(nowMs + 24 * 3600 * 1000).toISOString();
        }
        if (eventEnd && eventStart && new Date(eventEnd).getTime() <= new Date(eventStart).getTime()) {
          eventEnd = new Date(new Date(eventStart).getTime() + 14 * 86400000).toISOString();
        }
        return {
          territories: (Array.isArray(sched.territories) && sched.territories.length > 0) ? sched.territories : ALL_APP_STORE_TERRITORIES,
          publishStart: publishStart || new Date(nowMs + 15 * 60 * 1000).toISOString(),
          eventStart: eventStart || new Date(nowMs + 24 * 3600 * 1000).toISOString(),
          eventEnd: eventEnd || new Date(nowMs + 14 * 86400000).toISOString(),
        };
      });
    } else {
      let publishStart = input.publishStart;
      let eventStart = input.eventStart;
      let eventEnd = input.eventEnd;
      if (publishStart && new Date(publishStart).getTime() <= nowMs + 60000) {
        publishStart = new Date(nowMs + 15 * 60 * 1000).toISOString();
      }
      if (eventStart && new Date(eventStart).getTime() <= nowMs + 60000) {
        eventStart = new Date(nowMs + 24 * 3600 * 1000).toISOString();
      }
      if (eventEnd && eventStart && new Date(eventEnd).getTime() <= new Date(eventStart).getTime()) {
        eventEnd = new Date(new Date(eventStart).getTime() + 14 * 86400000).toISOString();
      }
      territorySchedules = [{
        territories: Array.isArray(input.territories) && input.territories.length > 0 ? input.territories : ALL_APP_STORE_TERRITORIES,
        publishStart: publishStart || new Date(nowMs + 15 * 60 * 1000).toISOString(),
        eventStart: eventStart || new Date(nowMs + 24 * 3600 * 1000).toISOString(),
        eventEnd: eventEnd || new Date(nowMs + 14 * 86400000).toISOString(),
      }];
    }

    if (isAppleConfigured() && appId) {
      const client = await getClient();
      const body = {
        data: {
          type: "appEvents",
          attributes: {
            referenceName,
            badge,
            primaryLocale,
            purchaseRequirement,
            purpose,
            priority,
            ...(deepLink ? { deepLink } : {}),
            ...(territorySchedules.length > 0 ? { territorySchedules } : {}),
          },
          relationships: {
            app: { data: { type: "apps", id: String(appId) } },
          },
        },
      };

      const res = await client.request("/v1/appEvents", "POST", body);
      const createdEvent = res.data;
      const eventId = createdEvent.id;

      const locName = (input.name || referenceName).trim().slice(0, 30);
      const locLocale = input.locale || primaryLocale;
      if (locName) {
        try {
          await client.request("/v1/appEventLocalizations", "POST", {
            data: {
              type: "appEventLocalizations",
              attributes: {
                locale: locLocale,
                name: locName,
                ...(input.shortDescription ? { shortDescription: input.shortDescription.trim().slice(0, 50) } : {}),
                ...(input.longDescription ? { longDescription: input.longDescription.trim().slice(0, 120) } : {}),
              },
              relationships: {
                appEvent: { data: { type: "appEvents", id: eventId } },
              },
            },
          });
        } catch (e) {
          console.warn("[AppStoreEvents] create initial localization warning:", e.message);
        }
      }

      return listInAppEvents(productId, { refresh: true });
    }

    // Local / Offline mode fallback
    const current = store.inAppEvents(productId) || {
      configured: false,
      appId: appId || "",
      events: [],
      syncedAt: null,
    };

    const newId = `event_local_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const locId = `event_loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const localizations = [];
    const locName = (input.name || referenceName).trim().slice(0, 30);
    if (locName) {
      localizations.push({
        id: locId,
        locale: input.locale || primaryLocale,
        name: locName,
        shortDescription: (input.shortDescription || "").trim().slice(0, 50),
        longDescription: (input.longDescription || "").trim().slice(0, 120),
        cardMediaUrl: input.cardMediaUrl || "",
        detailMediaUrl: input.detailMediaUrl || "",
      });
    }

    const newEvent = {
      id: newId,
      referenceName,
      badge,
      eventState: "DRAFT",
      deepLink,
      purchaseRequirement,
      purpose,
      priority,
      primaryLocale,
      territorySchedules,
      archivedTerritorySchedules: [],
      localizations,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    current.events.unshift(newEvent);
    store.inAppEvents(productId, current);
    const locales = collectProductLocales(store, product);
    return { ...current, locales };
  }

  async function saveInAppEventLocal(productId, eventId, patch = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定要更新的活动 ID (eventId)");

    const current = store.inAppEvents(productId) || {
      configured: isAppleConfigured(),
      appId: appId || "",
      events: [],
      syncedAt: null,
    };

    let target = current.events.find(e => e.id === eventId);
    if (!target) {
      target = {
        id: eventId,
        referenceName: patch.referenceName || "未命名活动",
        badge: normalizeBadge(patch.badge),
        eventState: patch.eventState || "DRAFT",
        deepLink: patch.deepLink || "",
        purchaseRequirement: patch.purchaseRequirement || "NO_COST_ASSOCIATED",
        purpose: patch.purpose || "APPROPRIATE_FOR_ALL_USERS",
        priority: patch.priority || "NORMAL",
        primaryLocale: patch.primaryLocale || "zh-Hans",
        territorySchedules: patch.territorySchedules || [],
        archivedTerritorySchedules: [],
        localizations: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      current.events.unshift(target);
    }

    if (patch.referenceName !== undefined) target.referenceName = patch.referenceName.trim();
    if (patch.badge !== undefined) target.badge = normalizeBadge(patch.badge);
    if (patch.deepLink !== undefined) target.deepLink = patch.deepLink.trim();
    if (patch.purchaseRequirement !== undefined) target.purchaseRequirement = patch.purchaseRequirement;
    if (patch.purpose !== undefined) target.purpose = patch.purpose;
    if (patch.priority !== undefined) target.priority = patch.priority;
    if (patch.primaryLocale !== undefined) target.primaryLocale = patch.primaryLocale;
    if (patch.territorySchedules !== undefined) target.territorySchedules = patch.territorySchedules;
    if (patch.eventState !== undefined) target.eventState = patch.eventState;

    if (patch.localization) {
      const loc = patch.localization;
      const lLocale = (loc.locale || target.primaryLocale || "zh-Hans").trim();
      target.localizations = target.localizations || [];
      const idx = target.localizations.findIndex(l => l.locale === lLocale || (loc.localizationId && l.id === loc.localizationId));
      if (idx >= 0) {
        target.localizations[idx] = {
          ...target.localizations[idx],
          name: (loc.name || target.localizations[idx].name || "").slice(0, 30),
          shortDescription: (loc.shortDescription !== undefined ? loc.shortDescription : target.localizations[idx].shortDescription || "").slice(0, 50),
          longDescription: (loc.longDescription !== undefined ? loc.longDescription : target.localizations[idx].longDescription || "").slice(0, 120),
          ...(loc.cardMediaUrl !== undefined ? { cardMediaUrl: loc.cardMediaUrl } : {}),
          ...(loc.detailMediaUrl !== undefined ? { detailMediaUrl: loc.detailMediaUrl } : {}),
        };
      } else if (loc.name) {
        target.localizations.push({
          id: loc.localizationId || `event_loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          locale: lLocale,
          name: loc.name.slice(0, 30),
          shortDescription: (loc.shortDescription || "").slice(0, 50),
          longDescription: (loc.longDescription || "").slice(0, 120),
          cardMediaUrl: loc.cardMediaUrl || "",
          detailMediaUrl: loc.detailMediaUrl || "",
        });
      }
    }
    target.updatedAt = new Date().toISOString();

    store.inAppEvents(productId, current);
    const locales = collectProductLocales(store, product);
    return { ...current, locales };
  }

  async function submitInAppEventToApple(productId, eventId, patch = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定要同步的活动 ID (eventId)");
    if (!isAppleConfigured() || !appId) {
      throw new AppleConnectionError("当前未配置 App Store Connect API 或缺少 App ID，无法提交至 Apple");
    }

    // 1. 先在本地 SQLite 保存一份
    await saveInAppEventLocal(productId, eventId, patch);

    const client = await getClient();

    // 2. 检查活动是否在 Apple 上存在
    let existsOnApple = false;
    try {
      const checkRes = await client.request(`/v1/appEvents/${encodeURIComponent(eventId)}`, "GET");
      if (checkRes?.data?.id) existsOnApple = true;
    } catch {
      existsOnApple = false;
    }

    if (!existsOnApple) {
      // 远程创建活动
      const createRes = await createInAppEvent(productId, {
        referenceName: patch.referenceName,
        badge: normalizeBadge(patch.badge),
        deepLink: patch.deepLink,
        purchaseRequirement: patch.purchaseRequirement,
        purpose: patch.purpose,
        priority: patch.priority,
        primaryLocale: patch.primaryLocale,
        territorySchedules: patch.territorySchedules,
        ...(patch.localization || {}),
      });
      return {
        ...createRes,
        message: "活动已成功在 App Store Connect 创建（未直接提交审核，可在苹果后台查看）。",
      };
    }

    // 3. 在 Apple 上更新活动属性
    const attributes = {};
    if (patch.referenceName !== undefined) attributes.referenceName = patch.referenceName.trim();
    if (patch.badge !== undefined) attributes.badge = normalizeBadge(patch.badge);
    if (patch.deepLink !== undefined) attributes.deepLink = patch.deepLink.trim();
    if (patch.purchaseRequirement !== undefined) attributes.purchaseRequirement = patch.purchaseRequirement;
    if (patch.purpose !== undefined) attributes.purpose = patch.purpose;
    if (patch.priority !== undefined) attributes.priority = patch.priority;
    if (patch.primaryLocale !== undefined) attributes.primaryLocale = patch.primaryLocale;

    if (patch.territorySchedules !== undefined) {
      let existingTerritories = null;
      try {
        const evData = await client.request(`/v1/appEvents/${encodeURIComponent(eventId)}`);
        existingTerritories = evData.data?.attributes?.territorySchedules?.[0]?.territories;
      } catch (e) {
        console.warn("[AppStoreEvents] read existing territorySchedules warning:", e.message);
      }

      const fallbackTerritories = (Array.isArray(existingTerritories) && existingTerritories.length > 0)
        ? existingTerritories
        : ALL_APP_STORE_TERRITORIES;

      const nowMs = Date.now();
      attributes.territorySchedules = patch.territorySchedules.map(sched => {
        const territories = (Array.isArray(sched.territories) && sched.territories.length > 0)
          ? sched.territories
          : fallbackTerritories;

        let publishStart = sched.publishStart;
        let eventStart = sched.eventStart;
        let eventEnd = sched.eventEnd;

        if (publishStart && new Date(publishStart).getTime() <= nowMs + 60000) {
          publishStart = new Date(nowMs + 15 * 60 * 1000).toISOString();
        }
        if (eventStart && new Date(eventStart).getTime() <= nowMs + 60000) {
          eventStart = new Date(nowMs + 24 * 3600 * 1000).toISOString();
        }
        if (eventEnd && eventStart && new Date(eventEnd).getTime() <= new Date(eventStart).getTime()) {
          eventEnd = new Date(new Date(eventStart).getTime() + 14 * 86400000).toISOString();
        }

        return {
          territories,
          ...(publishStart ? { publishStart } : {}),
          ...(eventStart ? { eventStart } : {}),
          ...(eventEnd ? { eventEnd } : {}),
        };
      });
    }

    if (Object.keys(attributes).length > 0) {
      await client.request(`/v1/appEvents/${encodeURIComponent(eventId)}`, "PATCH", {
        data: {
          type: "appEvents",
          id: eventId,
          attributes,
        },
      });
    }

    // 4. 同步本地化文案及上传图片素材至 Apple Connect（不提交审核）
    if (patch.localization && patch.localization.name) {
      await setInAppEventLocalization(productId, eventId, patch.localization);
    }

    // 5. 刷新返回
    const refreshed = await listInAppEvents(productId, { refresh: true });
    return {
      ...refreshed,
      message: "活动信息与素材已成功同步至 App Store Connect（未直接提交审核，可在苹果后台查看或添加到审核）。",
    };
  }

  async function updateInAppEvent(productId, eventId, patch = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定要更新的活动 ID (eventId)");

    if (patch.localOnly) {
      return saveInAppEventLocal(productId, eventId, patch);
    }

    if (isAppleConfigured() && appId) {
      return submitInAppEventToApple(productId, eventId, patch);
    }

    return saveInAppEventLocal(productId, eventId, patch);
  }

  async function deleteInAppEvent(productId, eventId) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定要删除的活动 ID (eventId)");

    if (isAppleConfigured() && appId) {
      const client = await getClient();
      await client.request(`/v1/appEvents/${encodeURIComponent(eventId)}`, "DELETE");
      return listInAppEvents(productId, { refresh: true });
    }

    // Local / Offline mode fallback
    const current = store.inAppEvents(productId) || {
      configured: false,
      appId: appId || "",
      events: [],
      syncedAt: null,
    };

    current.events = current.events.filter(e => e.id !== eventId);
    store.inAppEvents(productId, current);
    const locales = collectProductLocales(store, product);
    return { ...current, locales };
  }

  async function setInAppEventLocalization(productId, eventId, input = {}) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定活动 ID (eventId)");
    const locale = (input.locale || "").trim();
    const name = (input.name || "").trim().slice(0, 30);
    const shortDescription = (input.shortDescription || "").trim().slice(0, 50);
    const longDescription = (input.longDescription || "").trim().slice(0, 120);

    if (!locale) throw new AppleConnectionError("请指定本地化语言代码 (locale)");
    if (!name) throw new AppleConnectionError("请填写活动本地化名称 (name, ≤30字符)");

    if (isAppleConfigured() && appId) {
      const client = await getClient();
      let existingLocId = input.localizationId;

      if (!existingLocId) {
        try {
          const locRes = await client.paginate(`/v1/appEvents/${encodeURIComponent(eventId)}/localizations`);
          const match = (locRes.data || []).find(l => l.attributes?.locale === locale);
          if (match) existingLocId = match.id;
        } catch (e) {
          console.warn("[AppStoreEvents] check existing loc warning:", e.message);
        }
      }

      if (existingLocId) {
        await client.request(`/v1/appEventLocalizations/${encodeURIComponent(existingLocId)}`, "PATCH", {
          data: {
            type: "appEventLocalizations",
            id: existingLocId,
            attributes: {
              name,
              ...(shortDescription ? { shortDescription } : {}),
              ...(longDescription ? { longDescription } : {}),
            },
          },
        });
      } else {
        const createRes = await client.request("/v1/appEventLocalizations", "POST", {
          data: {
            type: "appEventLocalizations",
            attributes: {
              locale,
              name,
              ...(shortDescription ? { shortDescription } : {}),
              ...(longDescription ? { longDescription } : {}),
            },
            relationships: {
              appEvent: { data: { type: "appEvents", id: eventId } },
            },
          },
        });
        existingLocId = createRes?.data?.id;
      }

      if (existingLocId) {
        const cardImg = parseImageBytes(input.cardMediaUrl, store);
        if (cardImg) {
          try {
            await uploadAppEventScreenshot(client, existingLocId, "EVENT_CARD", cardImg, fetcher);
          } catch (e) {
            console.warn("[AppStoreEvents] upload card screenshot error:", e.message);
            throw e;
          }
        }
        const detailImg = parseImageBytes(input.detailMediaUrl, store);
        if (detailImg) {
          try {
            await uploadAppEventScreenshot(client, existingLocId, "EVENT_DETAILS_PAGE", detailImg, fetcher);
          } catch (e) {
            console.warn("[AppStoreEvents] upload detail screenshot error:", e.message);
            throw e;
          }
        }
      }

      // 同时也写入本地缓存中以便即时预览与离线容灾
      const current = store.inAppEvents(productId) || {
        configured: true,
        appId: appId || "",
        events: [],
        syncedAt: new Date().toISOString(),
      };
      const targetEvent = current.events.find(e => e.id === eventId);
      if (targetEvent) {
        targetEvent.localizations = targetEvent.localizations || [];
        const locIdx = targetEvent.localizations.findIndex(l => l.locale === locale || l.id === existingLocId);
        if (locIdx >= 0) {
          targetEvent.localizations[locIdx] = {
            ...targetEvent.localizations[locIdx],
            id: existingLocId,
            locale,
            name,
            shortDescription,
            longDescription,
            ...(input.cardMediaUrl !== undefined ? { cardMediaUrl: input.cardMediaUrl } : {}),
            ...(input.detailMediaUrl !== undefined ? { detailMediaUrl: input.detailMediaUrl } : {}),
          };
        } else {
          targetEvent.localizations.push({
            id: existingLocId,
            locale,
            name,
            shortDescription,
            longDescription,
            cardMediaUrl: input.cardMediaUrl || "",
            detailMediaUrl: input.detailMediaUrl || "",
          });
        }
        store.inAppEvents(productId, current);
      }

      return listInAppEvents(productId, { refresh: true });
    }

    // Local / Offline mode fallback
    const current = store.inAppEvents(productId) || {
      configured: false,
      appId: appId || "",
      events: [],
      syncedAt: null,
    };

    const targetEvent = current.events.find(e => e.id === eventId);
    if (!targetEvent) throw new AppleConnectionError("未找到目标活动记录", 404);

    targetEvent.localizations = targetEvent.localizations || [];
    const locIdx = targetEvent.localizations.findIndex(l => l.locale === locale || (input.localizationId && l.id === input.localizationId));

    if (locIdx >= 0) {
      targetEvent.localizations[locIdx] = {
        ...targetEvent.localizations[locIdx],
        locale,
        name,
        shortDescription,
        longDescription,
        ...(input.cardMediaUrl !== undefined ? { cardMediaUrl: input.cardMediaUrl } : {}),
        ...(input.detailMediaUrl !== undefined ? { detailMediaUrl: input.detailMediaUrl } : {}),
      };
    } else {
      targetEvent.localizations.push({
        id: input.localizationId || `event_loc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        locale,
        name,
        shortDescription,
        longDescription,
        cardMediaUrl: input.cardMediaUrl || "",
        detailMediaUrl: input.detailMediaUrl || "",
      });
    }

    targetEvent.updatedAt = new Date().toISOString();
    store.inAppEvents(productId, current);
    const locales = collectProductLocales(store, product);
    return { ...current, locales };
  }

  async function deleteInAppEventLocalization(productId, eventId, localizationId) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定活动 ID (eventId)");
    if (!localizationId) throw new AppleConnectionError("请指定本地化 ID (localizationId)");

    if (isAppleConfigured() && appId) {
      const client = await getClient();
      await client.request(`/v1/appEventLocalizations/${encodeURIComponent(localizationId)}`, "DELETE");
      return listInAppEvents(productId, { refresh: true });
    }

    // Local / Offline mode fallback
    const current = store.inAppEvents(productId) || {
      configured: false,
      appId: appId || "",
      events: [],
      syncedAt: null,
    };

    const targetEvent = current.events.find(e => e.id === eventId);
    if (targetEvent && Array.isArray(targetEvent.localizations)) {
      targetEvent.localizations = targetEvent.localizations.filter(l => l.id !== localizationId);
      targetEvent.updatedAt = new Date().toISOString();
      store.inAppEvents(productId, current);
    }

    const locales = collectProductLocales(store, product);
    return { ...current, locales };
  }

  async function submitInAppEventForReview(productId, eventId) {
    const { product, appId } = getProductAndAppId(store, productId);
    if (!eventId) throw new AppleConnectionError("请指定要提交审核的活动 ID (eventId)");
    if (!isAppleConfigured() || !appId) {
      throw new AppleConnectionError("当前未配置 App Store Connect API 或缺少 App ID，无法向 Apple 提交审核");
    }

    const client = await getClient();

    // 1. 检查目标活动信息与素材是否满足 Apple 审核基本要求
    const detail = await getInAppEvent(productId, eventId);
    const event = detail.event;
    if (!event) throw new AppleConnectionError("未找到目标活动记录", 404);

    const primaryLoc = (event.localizations || []).find(l => l.locale === event.primaryLocale) || event.localizations?.[0];
    if (!primaryLoc || !primaryLoc.name) {
      throw new AppleConnectionError("活动主要语言缺少名称，无法提交审核");
    }

    // 2. 检查或创建该 App 对应的 iOS 审核提交单 (Review Submission)
    let reviewSubmissionId = null;
    try {
      const subsRes = await client.request(`/v1/apps/${encodeURIComponent(appId)}/reviewSubmissions?filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`);
      if (subsRes.data && subsRes.data.length > 0) {
        reviewSubmissionId = subsRes.data[0].id;
      }
    } catch (e) {
      console.warn("[AppStoreEvents] check existing reviewSubmissions warning:", e.message);
    }

    if (!reviewSubmissionId) {
      const createSubRes = await client.request("/v1/reviewSubmissions", "POST", {
        data: {
          type: "reviewSubmissions",
          attributes: { platform: "IOS" },
          relationships: {
            app: { data: { type: "apps", id: String(appId) } },
          },
        },
      });
      reviewSubmissionId = createSubRes.data?.id;
    }

    if (!reviewSubmissionId) {
      throw new AppleConnectionError("无法在 Apple 创建或获取审核提交单", 500);
    }

    // 3. 将当前活动加入到审核提交单的 items 中
    let alreadyInSubmission = false;
    try {
      const itemsRes = await client.paginate(`/v1/reviewSubmissions/${encodeURIComponent(reviewSubmissionId)}/items`);
      alreadyInSubmission = (itemsRes.data || []).some(item => {
        return item.relationships?.appEvent?.data?.id === eventId;
      });
    } catch (e) {
      console.warn("[AppStoreEvents] check reviewSubmissionItems warning:", e.message);
    }

    if (!alreadyInSubmission) {
      await client.request("/v1/reviewSubmissionItems", "POST", {
        data: {
          type: "reviewSubmissionItems",
          relationships: {
            reviewSubmission: { data: { type: "reviewSubmissions", id: reviewSubmissionId } },
            appEvent: { data: { type: "appEvents", id: eventId } },
          },
        },
      });
    }

    // 4. 尝试正式提交整个审核单 (提交给 Apple 审核团队)
    let submitted = false;
    let submitMessage = "活动已成功添加至 App Store Connect 审核单（准备提交审核）";
    try {
      await client.request(`/v1/reviewSubmissions/${encodeURIComponent(reviewSubmissionId)}`, "PATCH", {
        data: {
          type: "reviewSubmissions",
          id: reviewSubmissionId,
          attributes: { submitted: true },
        },
      });
      submitted = true;
      submitMessage = "活动已成功提交至 App Store Connect 审核！";
    } catch (submitErr) {
      console.warn("[AppStoreEvents] submit reviewSubmission warning:", submitErr.message);
      submitMessage = `活动已添加至 App Store Connect 审核单。提示：${submitErr.message || '请前往 App Store Connect 后台点击最终提交。'}`;
    }

    const updatedList = await listInAppEvents(productId, { refresh: true });
    return {
      ...updatedList,
      submitted,
      reviewSubmissionId,
      message: submitMessage,
    };
  }

  return {
    listInAppEvents,
    getInAppEvent,
    createInAppEvent,
    updateInAppEvent,
    deleteInAppEvent,
    setInAppEventLocalization,
    deleteInAppEventLocalization,
    submitInAppEventForReview,
    saveInAppEventLocal,
    submitInAppEventToApple,
  };
}
