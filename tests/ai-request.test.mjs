import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiRequest } from '../server/ai-request.mjs';

test('AI 请求原样记录完整输入输出、状态和关联 ID，不消耗响应或记录认证头', async t => {
  const logs = []; t.mock.method(console, 'log', line => logs.push(line));
  const body = JSON.stringify({ model: 'test', messages: [{ role: 'user', content: '完整输入'.repeat(3000) }] });
  const raw = ' {"choices":[{"message":{"content":"原始输出\\n下一行"}}],"usage":{"total_tokens":123}}\n';
  const options = { method: 'POST', headers: { Authorization: 'Bearer secret-key' }, body };
  const response = await aiRequest('test', 'https://example.test', options, async (_, passed) => { assert.equal(passed, options); return new Response(raw, { status: 200 }); });
  assert.equal(logs.length, 2);
  assert.ok(logs[0].endsWith(body)); assert.ok(logs[1].endsWith(raw));
  assert.equal(logs[0].match(/\[AI\]\[test\]\[([^\]]+)\]/)[1], logs[1].match(/\[AI\]\[test\]\[([^\]]+)\]/)[1]);
  assert.match(logs[1], /HTTP 200 \d+ms/);
  assert.equal(logs.join('').includes('secret-key'), false);
  assert.equal(await response.text(), raw);
});
test('AI 服务非 JSON 错误响应也原样输出，HTTP 状态保持不变', async t => {
  const logs = []; t.mock.method(console, 'log', line => logs.push(line));
  const response = await aiRequest('test-error', 'https://example.test', { body: '{}' }, async () => new Response('<html>upstream unavailable</html>', { status: 503 }));
  assert.equal(response.status, 503); assert.match(logs[1], /HTTP 503/);
  assert.ok(logs[1].endsWith('<html>upstream unavailable</html>'));
  assert.equal(await response.text(), '<html>upstream unavailable</html>');
});
test('AI 超时或网络失败打印关联错误并原样抛出', async t => {
  const logs = [], errors = [];
  t.mock.method(console, 'log', line => logs.push(line)); t.mock.method(console, 'error', line => errors.push(line));
  const error = new DOMException('request timed out', 'TimeoutError');
  await assert.rejects(aiRequest('test-timeout', 'https://example.test', { body: '{}' }, async () => { throw error; }), e => e === error);
  assert.equal(logs.length, 1); assert.equal(errors.length, 1);
  assert.match(errors[0], /ERROR \d+ms\nTimeoutError: request timed out/);
  assert.equal(logs[0].split('] INPUT')[0], errors[0].split('] ERROR')[0]);
});
