import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openExchangeRate } from '../server/exchange-rate.mjs';

test('ECB 同日交叉汇率、合并请求与失败时保留最后有效汇率', async () => {
  let time = 0;
  let requests = 0;
  let response = "<Cube time='2026-11-06'><Cube currency='USD' rate='1.1'/><Cube currency='CNY' rate='7.7'/></Cube>";
  const latest = openExchangeRate({
    now: () => time,
    fetcher: async () => { requests++; return new Response(response); },
  });
  const [first, second] = await Promise.all([latest(), latest()]);
  assert.equal(requests, 1);
  assert.equal(first, second);
  assert.equal(first.date, '2026-11-06');
  assert.ok(Math.abs(first.cnyPerUsd - 7) < 1e-12);
  time += 14 * 60_000;
  await latest();
  assert.equal(requests, 1);
  response = "<Cube time='2026-11-06'><Cube currency='USD' rate='0'/></Cube>";
  time += 60_000;
  assert.deepEqual(await latest(), { ...first, stale: true });
  response = "<Cube time='2026-11-09'><Cube currency='USD' rate='1.2'/><Cube currency='CNY' rate='8.4'/></Cube>";
  time += 60_000;
  const recovered = await latest();
  assert.equal(recovered.date, '2026-11-09');
  assert.equal(recovered.stale, false);
});
