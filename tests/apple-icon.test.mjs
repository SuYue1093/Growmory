import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAppleIcon } from '../server/apple-icon.mjs';
import { validIcon } from '../server/validate.mjs';
import { openAppleConnection } from '../server/app-store-connect.mjs';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=', 'base64');
const asset = templateUrl => ({ attributes: { iconAsset: { width: 1024, height: 1024, templateUrl } } });
const template = 'https://is1-ssl.mzstatic.com/image/{w}x{h}{c}.{f}';

test('通过版本构建读取 PNG 图标并本地化，图片请求不携带 Apple 凭据', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'growmory-icon-'));
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const calls = [];
  try {
    const client = openAppleConnection(join(dir, 'apple.json'), { fetcher: async (url, options) => {
      calls.push(url);
      if (url.startsWith('https://api.appstoreconnect.apple.com/')) {
        assert.ok(options.headers.Authorization.startsWith('Bearer '));
        if (url.includes('/appStoreVersions/')) return Response.json({ data: { id: 'build-1' } });
        return Response.json({ data: [asset(template)] });
      }
      assert.equal(options.headers?.Authorization, undefined);
      assert.equal(url, 'https://is1-ssl.mzstatic.com/image/256x256.png');
      assert.equal(options.redirect, 'error');
      return new Response(png);
    } });
    client.save({ issuerId: '12345678-1234-1234-1234-123456789abc', keyId: 'ABCDEFGHIJ', privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }) });
    const icon = await client.icon('123', [{ id: 'v1', state: 'READY_FOR_SALE' }]);
    assert.equal(validIcon(icon), true);
    assert.equal(icon, `data:image/png;base64,${png.toString('base64')}`);
    assert.equal(calls.length, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('优先发布版本，没有版本构建时回退最新有效构建', async () => {
  const paths = [];
  const reader = { check() {}, request: async path => {
    paths.push(path);
    if (path.includes('published')) return { data: null };
    if (path.includes('draft')) throw Error('无构建');
    return { data: [{ id: 'latest' }] };
  }, paginate: async path => { paths.push(path); return { data: [asset(template)] }; } };
  const icon = await readAppleIcon(reader, async () => new Response(png), '123', [{ id: 'draft', state: 'PREPARE_FOR_SUBMISSION' }, { id: 'published', state: 'READY_FOR_DISTRIBUTION' }]);
  assert.equal(paths[0], '/v1/appStoreVersions/published/build');
  assert.ok(paths.some(path => path.includes('sort=-uploadedDate')));
  assert.equal(validIcon(icon), true);
});

test('图标缺失、网络失败、无效图片及超大响应返回空值，拒绝非 Apple 下载地址', async () => {
  for (const [url, fetcher] of [
    ['https://127.0.0.1/private.png', () => { throw Error('不应请求'); }],
    ['https://mzstatic.com.attacker.test/private.png', () => { throw Error('不应请求'); }],
    [template, async () => { throw Error('网络失败'); }],
    [template, async () => new Response('<html>错误页面</html>')],
    [template, async () => new Response(png, { headers: { 'content-length': '9999999' } })],
    [template, async () => new Response(new Uint8Array(350001))],
  ]) {
    let downloads = 0;
    const reader = { check() {}, request: async path => ({ data: path.includes('appStoreVersions') ? { id: 'build' } : [] }), paginate: async () => ({ data: [asset(url)] }) };
    const result = await readAppleIcon(reader, (...args) => { downloads++; return fetcher(...args); }, '123', [{ id: 'v1' }]);
    assert.equal(result, '');
    if (!url.includes('{w}')) assert.equal(downloads, 0);
  }
  assert.equal(await readAppleIcon({ check() {}, request: async () => ({ data: [] }) }, fetch, '123', []), '');
});
