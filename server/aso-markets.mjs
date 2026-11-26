import countries from 'i18n-iso-countries';
import { researchPublicMarket } from './app-store-public.mjs';

export async function readAsoMarkets(reader, appId) {
  const { data: availability } = await reader.request(`/v1/apps/${appId}/appAvailabilityV2`);
  if (availability?.type !== 'appAvailabilities' || !availability.id) throw Error('Apple 未返回有效的 App 分发配置。');

  const [{ data }, primaryLocale] = await Promise.all([
    reader.paginate(`/v2/appAvailabilities/${encodeURIComponent(availability.id)}/territoryAvailabilities?include=territory`),
    reader.request(`/v1/apps/${appId}?fields[apps]=primaryLocale`).then(app => app.data?.attributes?.primaryLocale ?? null).catch(() => null),
  ]);
  const markets = [];
  for (const row of data) {
    if (typeof row.attributes?.available !== 'boolean') throw Error('Apple 返回的地区可用状态缺失。');
    if (!row.attributes.available) continue;
    const territory = row.relationships?.territory?.data?.id;
    if (!territory) throw Error('Apple 返回的分发地区标识缺失。');
    const country = ['XKS', 'XKX'].includes(territory) ? 'XK' : countries.alpha3ToAlpha2(territory);
    markets.push({
      territory,
      country: country?.toLowerCase() ?? null,
      releaseDate: row.attributes.releaseDate ?? null,
      contentStatuses: row.attributes.contentStatuses ?? [],
    });
  }
  return { markets, primaryLocale, syncedAt: new Date().toISOString() };
}

export async function researchAsoMarkets(queries, probe = researchPublicMarket) {
  const results = [];
  for (const query of queries) {
    try {
      results.push({ ...query, ...await probe(query) });
    } catch (error) {
      results.push({ ...query, error: error.message });
    }
  }
  return { observedAt: new Date().toISOString(), results };
}
