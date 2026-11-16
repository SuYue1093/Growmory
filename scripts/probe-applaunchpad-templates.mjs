// Read-only check of preview URLs observed in AppLaunchpad's template list.
const urls = process.argv.slice(2);
if (!urls.length) {
  console.error('Usage: node scripts/probe-applaunchpad-templates.mjs <thumbnail-url> [...]');
  process.exit(2);
}

for (const value of urls) {
  try {
    const url = new URL(value);
    const match = /^\/dashboard\/applaunchpad-assets\/templates\/thumbnails\/([0-9a-f-]{36})-\d+w\.webp$/i.exec(url.pathname);
    if (url.origin !== 'https://d3q2h0tasu1gyd.cloudfront.net' || !match) {
      throw new Error('Expected an AppLaunchpad template preview URL');
    }
    // Preview identifiers are not assumed to be project or editor IDs.
    const response = await fetch(new URL(url.pathname, url.origin), {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const type = response.headers.get('content-type');
    await response.body?.cancel();
    if (!response.ok || !type?.startsWith('image/')) {
      throw new Error(`Unexpected preview response: ${response.status} ${type}`);
    }
    console.log(JSON.stringify({ previewId: match[1], url: url.origin + url.pathname, type }));
  } catch (error) {
    console.error(error.cause?.code || error.message);
    process.exitCode = 1;
  }
}
