import { lookupPublicApp } from './app-store-public.mjs';

/**
 * 同步指定产品或全工作区产品的线上真实版本发布时间与上线状态
 */
export async function syncProductReleaseDates(store, { productId, apple, fetcher = fetch } = {}) {
  const current = store.read();
  const data = current.data;
  let changed = false;

  const targetProducts = productId
    ? data.products.filter((p) => p.id === productId)
    : data.products;

  for (const product of targetProducts) {
    const appId = product.appStore?.appId || product.appId;
    if (!appId || !/^\d+$/.test(appId)) continue;

    try {
      // 1. 优先通过官方 iTunes Lookup API 查询线上最新发布版本与真实上线日期
      let onlineVersion = null;
      let onlineDate = null;
      let releaseNotes = '';

      try {
        const resp = await fetcher(`https://itunes.apple.com/lookup?id=${appId}&country=cn`, {
          signal: AbortSignal.timeout(6000),
        });
        if (resp && resp.ok) {
          const body = await resp.json();
          const item = body?.results?.[0];
          if (item?.version) {
            onlineVersion = String(item.version).trim();
            onlineDate = (item.currentVersionReleaseDate || item.releaseDate || '').slice(0, 10);
            releaseNotes = item.releaseNotes || '';
          }
        }
      } catch { }

      // 若原生 iTunes 接口未取到，回退到 lookupPublicApp
      if (!onlineVersion || !onlineDate) {
        let info = null;
        try {
          info = await lookupPublicApp({ id: appId, country: 'cn' });
        } catch {
          try {
            info = await lookupPublicApp({ id: appId, country: 'us' });
          } catch {
            info = null;
          }
        }
        if (info?.version) {
          onlineVersion = String(info.version).trim();
          onlineDate = (info.updated || info.released || '').slice(0, 10);
          releaseNotes = info.releaseNotes || '';
        }
      }

      if (!onlineVersion || !onlineDate || !/^\d{4}-\d{2}-\d{2}$/.test(onlineDate)) continue;

      // 在本地 releases 中查找对应版本
      let matching = data.releases.find(
        (r) =>
          r.productId === product.id &&
          (r.version === onlineVersion ||
            r.version === `v${onlineVersion}` ||
            `v${r.version}` === onlineVersion)
      );

      if (matching) {
        if (
          !matching.publishedAt ||
          matching.publishedAt !== onlineDate ||
          matching.status !== 'published'
        ) {
          matching.publishedAt = onlineDate;
          matching.status = 'published';
          changed = true;
        }
      } else {
        // 如果本地完全没有该版本的 release 记录，自动补全一条已发布记录
        data.releases.push({
          id: `rel-${product.id}-${onlineVersion.replace(/[^a-zA-Z0-9]/g, '_')}`,
          productId: product.id,
          version: onlineVersion,
          changes: releaseNotes || '从 App Store 同步的正式版本',
          tags: [],
          publishedAt: onlineDate,
          languages: ['中文'],
          channels: ['App Store'],
          status: 'published',
          createdAt: `${onlineDate}T00:00:00.000Z`,
          notes: [],
          proposals: [],
        });
        changed = true;
      }
    } catch (err) {
      console.warn(`[ReleaseSync] 同步产品 ${product.name} (appId: ${appId}) 版本发布时间失败:`, err.message);
    }
  }

  if (changed) {
    store.write(data, current.revision);
  }
  return changed;
}
