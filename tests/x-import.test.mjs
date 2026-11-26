import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { openStore } from '../server/store.mjs';
import { saveSocial, socialContext } from '../server/social-analytics.mjs';
import { importX } from '../server/x-import.mjs';

async function exportFile({ generated = '2026-11-10T00:00:00Z', likes = '2', invalid = false } = {}) {
  const zip = new JSZip();
  const write = (file, key, data) => zip.file(`data/${file}.js`, `window.${key} = ${JSON.stringify(data)}`);
  const post = (id, extra) => ({ tweet: { id_str: id, full_text: '一条 X 帖子', created_at: 'Tue Nov 10 00:00:00 +0000 2026', ...extra } });
  write('account', 'YTD.account.part0', [{ account: { username: 'GrowmoryQA', email: 'private@example.invalid' } }]);
  write('tweets', 'YTD.tweets.part0', [post('123', { favorite_count: likes, retweet_count: '0' })]);
  write('tweets-part1', 'YTD.tweets.part1', [post('124')]);
  write('community-tweet', 'YTD.community_tweet.part0', [post('123'), post('125', invalid ? { created_at: 'invalid' } : {})]);
  write('follower', 'YTD.follower.part0', ['555', '555', '666'].map(accountId => ({ follower: { accountId } })));
  write('manifest', '__THAR_CONFIG', { archiveInfo: { generationDate: generated } });
  zip.file('data/direct-messages.js', 'private-message');
  return zip.generateAsync({ type: 'base64' });
}

test('X archives import public post records and aggregate followers into the matching account', async () => {
  const store = openStore(':memory:', { products: [], docs: [], releases: [], contents: [], tasks: [] });
  const { accounts } = saveSocial(store, { expectedRevision: store.read().revision, accounts: [
    { platform: 'x', name: 'QA', url: 'https://twitter.com/growmoryqa/' },
    { platform: 'x', name: 'Other', url: 'https://x.com/other' },
  ] });
  const input = { accountId: accounts[0].id, fileName: 'twitter.zip', fileData: await exportFile() };
  const before = store.read().revision;
  await assert.rejects(importX(store, { ...input, accountId: accounts[1].id }), /用户名/);
  await assert.rejects(importX(store, { ...input, fileData: await exportFile({ invalid: true }) }), /发布时间/);
  assert.equal(store.read().revision, before);

  assert.equal((await importX(store, input)).inserted, 4);
  const context = socialContext(store);
  const post = context.snapshots.find(row => row.externalId === 'x:123');
  assert.equal(post.url, 'https://x.com/GrowmoryQA/status/123');
  assert.deepEqual(post.metrics, { likes: 2, reposts: 0 });
  assert.deepEqual(context.snapshots.find(row => row.externalId === 'x:124').metrics, {});
  assert.equal(context.snapshots.find(row => row.kind === 'account').metrics.followers, 2);
  assert.doesNotMatch(JSON.stringify(store.read().data), /private@example|private-message|"555"|"666"/);
  assert.deepEqual(await importX(store, input), { inserted: 0, updated: 0 });

  const newer = { ...input, fileData: await exportFile({ generated: '2026-11-11T00:00:00Z', likes: '3' }) };
  assert.equal((await importX(store, newer)).updated, 4);
  assert.deepEqual(await importX(store, input), { inserted: 0, updated: 0 });
  const updated = socialContext(store).snapshots.find(row => row.externalId === 'x:123');
  assert.equal(updated.id, post.id);
  assert.equal(updated.metrics.likes, 3);
});
