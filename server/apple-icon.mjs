import { validIcon } from './validate.mjs';

const MAX_BYTES = 350000;
async function downloadIcon(template, fetcher) {
  const url = new URL(template.replaceAll('{w}', '256').replaceAll('{h}', '256').replaceAll('{c}', '').replaceAll('{f}', 'png'));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['mzstatic.com', 'apple.com'].some(host => url.hostname === host || url.hostname.endsWith('.' + host)) || /[{}]/.test(url.href)) return '';
  const response = await fetcher(url.href, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) return '';
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel(); }
  const icon = `data:image/png;base64,${Buffer.concat(chunks).toString('base64')}`;
  return validIcon(icon) ? icon : '';
}

export async function readAppleIcon(reader, fetcher, appId, versions) {
  if (!/^[0-9]+$/.test(appId)) return '';
  const tried = new Set();
  async function fromBuild(buildId) {
    if (typeof buildId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(buildId) || tried.has(buildId)) return '';
    tried.add(buildId);
    const { data } = await reader.paginate(`/v1/builds/${buildId}/icons`);
    const assets = data.map(item => item.attributes?.iconAsset).filter(asset => typeof asset?.templateUrl === 'string').sort((a, b) => (b.width || 0) - (a.width || 0));
    for (const asset of assets.slice(0, 3)) {
      try {
        const icon = await downloadIcon(asset.templateUrl, fetcher);
        reader.check();
        if (icon) return icon;
      } catch { reader.check(); }
    }
    return '';
  }
  const ordered = [...versions].sort((a, b) => Number(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(b.state)) - Number(['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(a.state)));
  for (const version of ordered.slice(0, 3)) {
    if (!/^[a-zA-Z0-9-]+$/.test(version.id)) continue;
    try {
      const build = await reader.request(`/v1/appStoreVersions/${version.id}/build`);
      const icon = await fromBuild(build?.data?.id);
      if (icon) return icon;
    } catch { reader.check(); }
  }
  try {
    const builds = await reader.request(`/v1/apps/${appId}/builds?sort=-uploadedDate&limit=1&filter[processingState]=VALID`);
    return await fromBuild(builds?.data?.[0]?.id);
  } catch { reader.check(); return ''; }
}
