import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openAiUsage, createEmptyAiUsage } from '../server/ai-usage.mjs';
import { aiRequest, setAiUsageRecorder } from '../server/ai-request.mjs';

test('aiUsage 内存模式与基础数据结构', () => {
  const usage = openAiUsage(':memory:');
  const initial = usage.getUsage();
  assert.equal(initial.summary.totalCalls, 0);
  assert.equal(initial.summary.successCalls, 0);
  assert.equal(initial.summary.failedCalls, 0);
  assert.equal(initial.summary.totalTokens, 0);
  assert.equal(initial.records.length, 0);

  usage.record({
    scope: 'release-notes',
    model: 'gpt-4.1-mini',
    status: 'success',
    statusCode: 200,
    durationMs: 300,
    promptTokens: 100,
    completionTokens: 20,
    totalTokens: 120,
  });

  const updated = usage.getUsage();
  assert.equal(updated.summary.totalCalls, 1);
  assert.equal(updated.summary.successCalls, 1);
  assert.equal(updated.summary.failedCalls, 0);
  assert.equal(updated.summary.totalTokens, 120);
  assert.equal(updated.summary.promptTokens, 100);
  assert.equal(updated.summary.completionTokens, 20);
  assert.equal(updated.records.length, 1);
  assert.equal(updated.records[0].scope, 'release-notes');
  assert.equal(updated.records[0].model, 'gpt-4.1-mini');
  assert.equal(updated.records[0].status, 'success');
});

test('aiUsage 磁盘持久化、权限控制与清空', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'growmory-usage-test-'));
  const filePath = join(tempDir, 'ai-usage.json');
  try {
    const usage = openAiUsage(filePath);
    usage.record({
      scope: 'aso-generate',
      model: 'deepseek-chat',
      status: 'success',
      statusCode: 200,
      durationMs: 450,
      promptTokens: 500,
      completionTokens: 100,
      totalTokens: 600,
    });
    usage.record({
      scope: 'aso-media-diagnosis',
      model: 'deepseek-chat',
      status: 'error',
      statusCode: 429,
      durationMs: 120,
      error: 'Rate limit exceeded',
    });

    assert.ok(existsSync(filePath));
    const fileContent = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(fileContent.summary.totalCalls, 2);
    assert.equal(fileContent.summary.successCalls, 1);
    assert.equal(fileContent.summary.failedCalls, 1);
    assert.equal(fileContent.summary.totalTokens, 600);
    assert.equal(fileContent.records.length, 2);
    assert.equal(fileContent.records[0].status, 'error');

    // 重新打开同一文件
    const reloaded = openAiUsage(filePath);
    assert.equal(reloaded.getUsage().summary.totalCalls, 2);

    // 清空
    reloaded.clear();
    assert.equal(reloaded.getUsage().summary.totalCalls, 0);
    assert.equal(reloaded.getUsage().records.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test('aiRequest 调用内部 AI 时自动记录并统计 token 与耗时', async t => {
  const usage = openAiUsage(':memory:');
  setAiUsageRecorder(usage);
  t.after(() => setAiUsageRecorder(null));

  const options = {
    method: 'POST',
    body: JSON.stringify({ model: 'gpt-4.1-mini', messages: [{ role: 'user', content: 'hello' }] }),
  };
  const mockSuccessResponse = {
    choices: [{ message: { content: 'world' } }],
    usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
  };

  await aiRequest('connection-test', 'https://mock.api/v1/chat/completions', options, async () => {
    return new Response(JSON.stringify(mockSuccessResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const state1 = usage.getUsage();
  assert.equal(state1.summary.totalCalls, 1);
  assert.equal(state1.summary.successCalls, 1);
  assert.equal(state1.summary.totalTokens, 20);
  assert.equal(state1.summary.promptTokens, 15);
  assert.equal(state1.summary.completionTokens, 5);
  assert.equal(state1.records[0].scope, 'connection-test');
  assert.equal(state1.records[0].model, 'gpt-4.1-mini');
  assert.equal(state1.records[0].status, 'success');
  assert.ok(state1.records[0].input.includes('hello'));
  assert.ok(state1.records[0].output.includes('world'));

  // 测试失败请求统计
  await assert.rejects(aiRequest('failing-task', 'https://mock.api/v1/chat/completions', options, async () => {
    throw new DOMException('network timeout', 'TimeoutError');
  }));

  const state2 = usage.getUsage();
  assert.equal(state2.summary.totalCalls, 2);
  assert.equal(state2.summary.successCalls, 1);
  assert.equal(state2.summary.failedCalls, 1);
  assert.equal(state2.records[0].scope, 'failing-task');
  assert.equal(state2.records[0].status, 'error');
  assert.equal(state2.records[0].statusCode, 408);
});

test('aiUsage 支持时间段筛选：近7天、近14天、近30天与自定义时间段', () => {
  const usage = openAiUsage(':memory:');
  const now = new Date('2026-11-16T12:00:00Z').getTime();

  // 1天前 (2026-11-15)
  usage.record({
    timestamp: new Date(now - 1 * 24 * 3600 * 1000).toISOString(),
    scope: 'release-notes',
    model: 'gpt-4.1-mini',
    status: 'success',
    totalTokens: 100,
    promptTokens: 80,
    completionTokens: 20,
  });

  // 10天前 (2026-11-06)
  usage.record({
    timestamp: new Date(now - 10 * 24 * 3600 * 1000).toISOString(),
    scope: 'aso-generate',
    model: 'deepseek-chat',
    status: 'success',
    totalTokens: 200,
    promptTokens: 150,
    completionTokens: 50,
  });

  // 25天前 (2026-10-22)
  usage.record({
    timestamp: new Date(now - 25 * 24 * 3600 * 1000).toISOString(),
    scope: 'generate-task',
    model: 'gpt-4.1-mini',
    status: 'success',
    totalTokens: 300,
    promptTokens: 200,
    completionTokens: 100,
  });

  // 40天前 (2026-10-07)
  usage.record({
    timestamp: new Date(now - 40 * 24 * 3600 * 1000).toISOString(),
    scope: 'connection-test',
    model: 'gpt-4.1-mini',
    status: 'error',
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
  });

  // 1. 全部
  const allResult = usage.getUsage({ range: 'all', now });
  assert.equal(allResult.records.length, 4);
  assert.equal(allResult.summary.totalCalls, 4);
  assert.equal(allResult.summary.totalTokens, 600);

  // 2. 近7天（仅包含1天前的记录）
  const res7d = usage.getUsage({ range: '7d', now });
  assert.equal(res7d.records.length, 1);
  assert.equal(res7d.summary.totalCalls, 1);
  assert.equal(res7d.summary.totalTokens, 100);
  assert.equal(res7d.records[0].scope, 'release-notes');

  // 3. 近14天（包含1天前与10天前的记录）
  const res14d = usage.getUsage({ range: '14d', now });
  assert.equal(res14d.records.length, 2);
  assert.equal(res14d.summary.totalCalls, 2);
  assert.equal(res14d.summary.totalTokens, 300);

  // 4. 近30天（包含1天前、10天前与25天前的记录）
  const res30d = usage.getUsage({ range: '30d', now });
  assert.equal(res30d.records.length, 3);
  assert.equal(res30d.summary.totalCalls, 3);
  assert.equal(res30d.summary.totalTokens, 600);

  // 5. 自定义时间段：2026-11-01 至 2026-11-10（仅包含10天前的记录）
  const resCustom = usage.getUsage({
    range: 'custom',
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    now,
  });
  assert.equal(resCustom.records.length, 1);
  assert.equal(resCustom.records[0].scope, 'aso-generate');
  assert.equal(resCustom.summary.totalTokens, 200);
});
