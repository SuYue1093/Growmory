import store from 'app-store-scraper';
import { validIcon } from './validate.mjs';

// Simple in-memory cache with TTL (default 10 minutes)
const cache = new Map();
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getCached(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function setCached(key, value, ttl = DEFAULT_TTL_MS) {
  if (cache.size > 500) {
    // Evict expired or oldest entries
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
    if (cache.size > 500) {
      const firstKey = cache.keys().next().value;
      if (firstKey) cache.delete(firstKey);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + ttl });
  return value;
}

/**
 * Parse an App Store URL or string into an app ID / bundleId / country or search term.
 * e.g. https://apps.apple.com/cn/app/%E5%BE%AE%E4%BF%A1/id414478124 -> { id: '414478124', country: 'cn' }
 */
export function parseAppStoreInput(input) {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Pure numeric ID
  if (/^\d{6,12}$/.test(raw)) {
    return { id: raw, country: 'cn' };
  }

  // URL matching
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const url = new URL(raw);
      if (url.hostname.includes('apple.com')) {
        // e.g. /cn/app/.../id414478124 or /app/id414478124
        const parts = url.pathname.split('/').filter(Boolean);
        let country = 'cn';
        if (parts[0] && /^[a-z]{2}$/i.test(parts[0])) {
          country = parts[0].toLowerCase();
        }
        const idMatch = url.pathname.match(/id(\d{6,12})/);
        if (idMatch) {
          return { id: idMatch[1], country };
        }
      }
    }
  } catch {
    // Ignore URL parse error
  }

  // Bundle ID (e.g. com.tencent.xin)
  if (/^[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+){2,}$/.test(raw)) {
    return { appId: raw, country: 'cn' };
  }

  // Otherwise treat as search keyword
  return { term: raw, country: 'cn' };
}

/**
 * Download artwork from Apple CDN and convert to 256x256 PNG data URL for Growmory logo.
 */
export async function fetchAppIconBase64(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string') return '';
  try {
    const pngUrl = iconUrl
      .replace(/\.jpg$/, '.png')
      .replace(/\/\d+x\d+bb/, '/256x256bb');
    const resp = await fetch(pngUrl, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return '';
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.length > 450000) return '';
    const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
    return validIcon(dataUrl) ? dataUrl : '';
  } catch {
    return '';
  }
}

/**
 * Public App Lookup (No Apple Developer Key needed)
 */
export async function lookupPublicApp({ id, appId, country = 'cn', withIconBase64 = false }) {
  if (!id && !appId) throw new Error('请提供 App ID、Bundle ID 或 App Store 链接。');
  const cacheKey = `lookup:${id || appId}:${country}`;
  let appData = getCached(cacheKey);

  if (!appData) {
    const opts = { country };
    if (id) opts.id = id;
    else opts.appId = appId;

    try {
      appData = await store.app(opts);
      setCached(cacheKey, appData);
    } catch (err) {
      // If failed in requested country, try 'us' as fallback if requested wasn't 'us'
      if (country !== 'us') {
        try {
          appData = await store.app({ ...opts, country: 'us' });
          setCached(cacheKey, appData);
        } catch {
          throw new Error(`未找到该 App（${err.message || '404'}）`);
        }
      } else {
        throw new Error(`未找到该 App（${err.message || '404'}）`);
      }
    }
  }

  let iconBase64 = '';
  if (withIconBase64 && appData.icon) {
    const iconCacheKey = `icon:${appData.id}`;
    iconBase64 = getCached(iconCacheKey);
    if (!iconBase64) {
      iconBase64 = await fetchAppIconBase64(appData.icon);
      if (iconBase64) setCached(iconCacheKey, iconBase64, 30 * 24 * 3600 * 1000); // 30 days
    }
  }

  return {
    ...appData,
    iconBase64: iconBase64 || undefined
  };
}

/**
 * Search Apps by keyword
 */
export async function searchPublicApps({ term, country = 'cn', num = 10, page = 1 }) {
  if (!term || !term.trim()) throw new Error('请输入搜索关键词。');
  const cleanTerm = term.trim();
  const cacheKey = `search:${cleanTerm}:${country}:${num}:${page}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const results = await store.search({
    term: cleanTerm,
    country,
    num: Math.min(Math.max(num, 1), 50),
    page
  });

  return setCached(cacheKey, results);
}

/**
 * Keyword search hints (Apple MZSearchHints)
 */
export async function suggestPublicKeywords({ term, country = 'cn' }) {
  if (!term || !term.trim()) return [];
  const cleanTerm = term.trim();
  const cacheKey = `suggest:${cleanTerm}:${country}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const hints = await store.suggest({ term: cleanTerm, country });
    const formatted = Array.isArray(hints) ? hints.map(h => (typeof h === 'string' ? h : h.term)).filter(Boolean) : [];
    return setCached(cacheKey, formatted);
  } catch {
    return [];
  }
}

/**
 * Star ratings distribution histogram
 */
export async function getPublicRatings({ id, country = 'cn' }) {
  if (!id) throw new Error('请提供 App ID。');
  const cacheKey = `ratings:${id}:${country}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const ratings = await store.ratings({ id, country });
    return setCached(cacheKey, ratings);
  } catch (err) {
    if (country !== 'us') {
      try {
        const ratings = await store.ratings({ id, country: 'us' });
        return setCached(cacheKey, ratings);
      } catch {
        return { ratings: 0, histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
      }
    }
    return { ratings: 0, histogram: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } };
  }
}

/**
 * Similar apps ("Customers also bought")
 */
export async function getPublicSimilar({ id, appId, country = 'cn' }) {
  if (!id && !appId) throw new Error('请提供 App ID 或 Bundle ID。');
  const cacheKey = `similar:${id || appId}:${country}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  try {
    const similar = await store.similar({ id, appId, country });
    return setCached(cacheKey, similar);
  } catch {
    return [];
  }
}

const CHINESE_CATEGORY_MAP = {
  '效率': 6007,
  '生产力': 6007,
  '工具': 6002,
  '实用工具': 6002,
  '财务': 6015,
  '金融': 6015,
  '理财': 6015,
  '商务': 6000,
  '生活': 6012,
  '生活方式': 6012,
  '健康健美': 6013,
  '健康': 6013,
  '健身': 6013,
  '教育': 6017,
  '学习': 6017,
  '社交': 6005,
  '社交网络': 6005,
  '娱乐': 6016,
  '新闻': 6009,
  '摄影与录像': 6008,
  '摄影': 6008,
  '照片与视频': 6008,
  '购物': 6024,
  '美食佳饮': 6023,
  '餐饮': 6023,
  '美食': 6023,
  '图书': 6018,
  '书籍': 6018,
  '阅读': 6018,
  '音乐': 6011,
  '旅游': 6003,
  '旅行': 6003,
  '天气': 6001,
  '参考': 6006,
  '参考资料': 6006,
  '医疗': 6020,
  '导航': 6010,
  '体育': 6004,
  '运动': 6004,
  '游戏': 6014,
};

export function resolveCategory(cat) {
  if (cat == null) return undefined;
  if (typeof cat === 'number') return cat;
  const trimmed = String(cat).trim();
  if (!trimmed || trimmed.toLowerCase() === 'all' || trimmed === '全品类' || trimmed === '全部' || trimmed === '总榜') return undefined;

  // Numeric string like "6007"
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }

  // Exact or uppercase match in store.category
  const upper = trimmed.toUpperCase().replace(/\s+/g, '_');
  if (store.category[upper]) return store.category[upper];

  // Chinese map match
  if (CHINESE_CATEGORY_MAP[trimmed]) return CHINESE_CATEGORY_MAP[trimmed];

  // Partial match in store.category keys
  const match = Object.keys(store.category).find(k => k === upper || k.startsWith(upper));
  if (match) return store.category[match];

  return undefined;
}

export function resolveCollection(col) {
  if (!col) return store.collection.TOP_FREE_IOS;
  const upper = String(col).trim().toUpperCase();

  if (upper === 'TOP_FREE' || upper === 'FREE' || upper === '免费榜' || upper === 'TOP_FREE_IOS') {
    return store.collection.TOP_FREE_IOS;
  }
  if (upper === 'TOP_PAID' || upper === 'PAID' || upper === '付费榜' || upper === 'TOP_PAID_IOS') {
    return store.collection.TOP_PAID_IOS;
  }
  if (upper === 'TOP_GROSSING' || upper === 'GROSSING' || upper === '畅销榜' || upper === 'TOP_GROSSING_IOS') {
    return store.collection.TOP_GROSSING_IOS;
  }
  if (upper === 'TOP_FREE_IPAD' || upper === 'IPAD_FREE') {
    return store.collection.TOP_FREE_IPAD;
  }
  if (upper === 'TOP_PAID_IPAD' || upper === 'IPAD_PAID') {
    return store.collection.TOP_PAID_IPAD;
  }
  if (upper === 'TOP_GROSSING_IPAD') {
    return store.collection.TOP_GROSSING_IPAD;
  }
  if (upper === 'TOP_FREE_MAC' || upper === 'MAC_FREE') {
    return store.collection.TOP_FREE_MAC;
  }
  if (upper === 'TOP_PAID_MAC' || upper === 'MAC_PAID') {
    return store.collection.TOP_PAID_MAC;
  }

  return store.collection[upper] || store.collection.TOP_FREE_IOS;
}

/**
 * Top charts / collections
 */
export async function getPublicTopCharts({ collection = 'TOP_FREE_IOS', category, country = 'cn', num = 25 }) {
  const colVal = resolveCollection(collection);
  const catVal = resolveCategory(category);
  const cacheKey = `top:${colVal}:${catVal || 'all'}:${country}:${num}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const results = await store.list({
    collection: colVal,
    category: catVal,
    country,
    num: Math.min(Math.max(num, 1), 100)
  });

  return setCached(cacheKey, results);
}

// The scraper silently uses the US storefront when its country table lacks a match.
export async function researchPublicMarket({ country, term, language }) {
  const requestOptions = { timeout: 5000 };
  const supported = Object.hasOwn(store.markets, country.toUpperCase());
  const [search, suggestions] = await Promise.allSettled([
    (async () => {
      if (supported) {
        try {
          const apps = await store.search({ country, term, lang: language, num: 5, requestOptions });
          return { source: 'app-store-search', apps: apps.map(({ id, title, primaryGenre, url, description }) => ({ id, title, primaryGenre, url, description: description?.slice(0, 240) })) };
        } catch {
          // Retry via Apple's public country-scoped catalog, with a distinct source label.
        }
      }
      const params = new URLSearchParams({ country, term, entity: 'software', limit: '5' });
      const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error(`iTunes Search API HTTP ${response.status}`);
      const { results } = await response.json();
      return { source: 'itunes-search-api', apps: results.map(app => ({ id: app.trackId, title: app.trackName, primaryGenre: app.primaryGenreName, url: app.trackViewUrl, description: app.description?.slice(0, 240) })) };
    })(),
    supported ? store.suggest({ country, term, requestOptions }) : Promise.reject(Error('联想接口缺少该 storefront 的标识')),
  ]);
  return {
    search: search.status === 'fulfilled' ? search.value : { error: search.reason.message },
    suggestions: suggestions.status === 'fulfilled'
      ? { source: 'app-store-search-hints', terms: suggestions.value.map(item => item.term).filter(Boolean).slice(0, 12) }
      : { error: suggestions.reason.message },
  };
}
