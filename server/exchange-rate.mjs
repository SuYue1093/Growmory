const endpoint = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
const refreshInterval = 15 * 60_000;

export function openExchangeRate({ fetcher = fetch, now = Date.now } = {}) {
  let cached = null;
  let nextCheck = 0;
  let pending;

  return function latest() {
    if (pending) return pending;
    if (now() < nextCheck) return cached;

    pending = (async () => {
      try {
        const response = await fetcher(endpoint, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw Error('ECB 汇率请求失败');
        const xml = await response.text();
        const date = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/)?.[1];
        const quote = currency => Number(xml.match(new RegExp(`<Cube\\s+currency=['"]${currency}['"]\\s+rate=['"]([\\d.]+)['"]`))?.[1]);
        const usd = quote('USD'), cny = quote('CNY');
        if (!date || !Number.isFinite(usd) || !Number.isFinite(cny) || usd <= 0 || cny <= 0 ||
            (cached && date < cached.date)) throw Error('ECB 汇率数据无效');
        cached = { date, cnyPerUsd: cny / usd, stale: false };
        nextCheck = now() + refreshInterval;
      } catch {
        if (cached) cached = { ...cached, stale: true };
        nextCheck = now() + 60_000;
      }
      return cached;
    })().finally(() => { pending = undefined; });

    return pending;
  };
}
