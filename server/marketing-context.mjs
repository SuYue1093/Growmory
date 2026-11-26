import { plainText } from './release-ai.mjs';
import { findPlatform, supportsInlineImages } from '../src/platforms.ts';
const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
// UTF-8 bytes provide a conservative input size bound without assuming a provider tokenizer.
export const CONTEXT_BYTES = 12000;
export function clip(value, bytes) {
  let result = '', size = 0;
  for (const c of String(value || '')) {
    const next = Buffer.byteLength(c);
    if (size + next > bytes) break;
    result += c; size += next;
  }
  return result;
}
export function assetImageMeta(asset) {
  const imageUrl = /^https?:\/\//i.test(asset.url || '') ? asset.url : `/api/assets/file/${asset.id}`;
  const alt = clip(String(asset.name || asset.fileName || 'image').replace(/[\[\]]/g, ''), 60);
  return {
    id: asset.id,
    name: clip(asset.name, 100),
    fileName: clip(asset.fileName, 100),
    productId: asset.productId || '',
    languages: asset.languages || [],
    imageUrl,
    markdown: `![${alt}](${imageUrl})`,
  };
}
export function marketingContext(data, input, store = null) {
  const product = data.products.find(p => p.id === input.productId);
  if (!product) fail('请选择有效的产品。');
  if (typeof input.channel !== 'string' || !input.channel.trim() || input.channel.length > 80) fail('请选择发布渠道。');
  const release = input.releaseId ? data.releases.find(r => r.id === input.releaseId && r.productId === product.id) : null;
  if (input.releaseId && !release) fail('关联版本不存在，请重新选择。');
  const selectedAccount = input.accountId ? (data.socialAnalytics?.accounts || []).find(a => a.id === input.accountId) : null;
  if (input.accountId && !selectedAccount) fail('关联账号不存在，请重新选择。');
  const docs = data.docs.filter(d => d.productId === product.id && d.status === 'confirmed' && d.body.trim())
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const targetPlatformId = findPlatform(input.channel)?.id;
  const isSameChannel = (ch) => ch === input.channel || (!!targetPlatformId && findPlatform(ch)?.id === targetPlatformId);
  const history = data.contents.filter(c => (c.productId === product.id || c.productIds?.includes(product.id)) && c.id !== input.contentId && c.status === 'published')
    .slice().reverse().sort((a, b) =>
      Number(Boolean(selectedAccount && b.accountId === selectedAccount.id)) - Number(Boolean(selectedAccount && a.accountId === selectedAccount.id)) ||
      Number(isSameChannel(b.channel)) - Number(isSameChannel(a.channel)) ||
      (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const matchedAssets = (data.assets || [])
    .filter(a => (!a.productId || a.productId === product.id) && (a.fileType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(a.name || a.fileName)));
  const imageAssets = matchedAssets.map(a => a.name);
  const assetItems = matchedAssets.slice(0, 20).map(assetImageMeta);

  let trendRows = [];
  try {
    if (store && typeof store.productInsights === 'function') {
      const insights = store.productInsights(product.id);
      if (Array.isArray(insights?.trends?.rows)) {
        trendRows = insights.trends.rows;
      }
    }
  } catch {}

  function getPerformance(dateStr) {
    if (!dateStr || !trendRows.length) return null;
    const targetDate = dateStr.slice(0, 10);
    const start = Date.parse(`${targetDate}T00:00:00Z`);
    if (!Number.isFinite(start)) return null;
    const endDate = new Date(start + 3 * 86400000).toISOString().slice(0, 10);
    const rows = trendRows.filter(r => r.date >= targetDate && r.date < endDate);
    if (!rows.length) return null;
    const dl = rows.reduce((s, r) => s + (Number(r.firstDownloads) || 0), 0);
    const imp = rows.reduce((s, r) => s + (Number(r.impressions) || 0), 0);
    return {
      windowDays: new Set(rows.map(r => r.date)).size,
      scope: 'product',
      attribution: 'correlation_only',
      windowStart: targetDate,
      windowEndExclusive: endDate,
      completeWindow: new Set(rows.map(r => r.date)).size === 3,
      downloadsPost3d: dl,
      impressionsPost3d: imp,
    };
  }

  function getSocialPerformance(c) {
    if (!data.socialAnalytics?.snapshots?.length) return null;
    const matched = data.socialAnalytics.snapshots.filter(s =>
      (s.contentId && s.contentId === c.id) ||
      (c.url && s.url && s.url === c.url)
    );
    if (!matched.length) return null;
    const latest = matched.slice().sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || ''))[0];
    if (!latest?.metrics) return null;
    const nonNull = Object.fromEntries(Object.entries(latest.metrics).filter(([_, v]) => v != null && v !== 0));
    return Object.keys(nonNull).length > 0 ? nonNull : null;
  }

  const context = {
    product: { id: product.id, name: clip(product.name, 240), summary: clip(plainText(product.summary), 800), platform: clip(product.platform, 120) },
    channel: input.channel,
    ...(selectedAccount ? {
      account: {
        id: selectedAccount.id,
        platform: selectedAccount.platform,
        name: clip(selectedAccount.name, 120),
        ...(selectedAccount.contentDirection ? { contentDirection: clip(selectedAccount.contentDirection, 400) } : {}),
        ...(selectedAccount.writingStyle ? { writingStyle: clip(selectedAccount.writingStyle, 400) } : {}),
        ...(selectedAccount.platform === 'x' ? { isPremium: selectedAccount.isPremium === true } : {}),
      },
    } : {}),
    ...(input.channel && input.channel !== '待确认' ? { inlineImageSupported: supportsInlineImages(input.channel) } : {}),
    docs: docs.slice(0, 3).map(d => ({ docId: d.id, title: clip(plainText(d.title), 180), excerpt: clip(plainText(d.body), 1700) })),
    history: history.slice(0, 4).map(c => {
      const pubDate = (c.publishedAt || c.date || '').slice(0, 10);
      const perf = getPerformance(pubDate);
      const socialPerf = getSocialPerformance(c);
      return {
        contentId: c.id,
        title: clip(plainText(c.title), 180),
        channel: clip(c.channel, 80),
        ...(c.accountId ? { accountId: c.accountId } : {}),
        publishedDate: pubDate || null,
        tags: c.tags || [],
        ...(perf ? { dataPerformance: perf } : {}),
        ...(socialPerf ? { socialMetrics: socialPerf } : {}),
        excerpt: clip(plainText(c.body), 450),
      };
    }),
    release: release ? { version: clip(release.version, 80), status: release.status, changes: clip(plainText(release.changes), 900) } : null,
    ...(imageAssets.length ? { availableAssets: imageAssets.slice(0, 15), assetItems } : {}),
  };
  // Account for JSON escaping too; reduce reference excerpts rather than sending an oversized prompt.
  while (Buffer.byteLength(JSON.stringify(context)) > CONTEXT_BYTES) {
    const entries = [...context.docs, ...context.history];
    const longest = entries.sort((a, b) => b.excerpt.length - a.excerpt.length)[0];
    if (longest?.excerpt) {
      longest.excerpt = clip(longest.excerpt, Math.floor(Buffer.byteLength(longest.excerpt) / 2));
      continue;
    }
    if (Array.isArray(context.assetItems) && context.assetItems.length > 0) {
      context.assetItems.pop();
      continue;
    }
    fail('资料内容格式异常，请精简后重试。');
  }
  return context;
}
