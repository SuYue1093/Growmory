import { createHash, randomUUID } from 'node:crypto';
import { parseString } from 'fast-csv';
import unzipper from 'unzipper';
import { z } from 'zod';
import { addMarketingArticle, saveSocial } from './social-analytics.mjs';
import { hasCompleteBody } from '../src/social-identity.ts';

const maxFile = 9 * 1024 * 1024;
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');

export async function parseReddit(buffer) {
  if (buffer.length > maxFile) throw Error('Reddit ZIP 超出 9 MB');
  const archive = await unzipper.Open.buffer(buffer);
  const files = archive.files.filter(file => file.type === 'File' && /(?:^|\/)posts\.csv$/.test(file.path));
  if (files.length !== 1) throw Error('Reddit ZIP 必须包含唯一的 posts.csv');
  const chunks = [];
  let size = 0;
  for await (const chunk of files[0].stream()) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw Error('posts.csv 超出 32 MB');
    chunks.push(chunk);
  }
  const rows = await new Promise((resolve, reject) => {
    const records = [];
    parseString(Buffer.concat(chunks).toString('utf8'), { headers: true, ignoreEmpty: true, strictColumnHandling: true })
      .on('headers', headers => {
        if (!['id', 'permalink', 'date', 'subreddit', 'title', 'body'].every(key => headers.includes(key))) reject(Error('posts.csv 缺少必需列'));
      })
      .on('data-invalid', (_row, number) => reject(Error(`posts.csv 第 ${number} 条数据列数不符`)))
      .on('error', reject)
      .on('data', row => records.push(row))
      .on('end', () => resolve(records));
  });
  const seen = new Set();
  return rows.map(({ id, permalink, date, subreddit, title, body }, index) => {
    const url = new URL(permalink, 'https://www.reddit.com');
    const postId = url.pathname.match(/^\/r\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i)?.[1];
    const time = Date.parse(date.replace(/ UTC$/, 'Z').replace(' ', 'T'));
    if (!id || id !== postId || seen.has(id) || !/(^|\.)reddit\.com$/i.test(url.hostname) || url.protocol !== 'https:' || !title.trim() || !Number.isFinite(time)) {
      throw Error(`posts.csv 第 ${index + 2} 行的帖子身份、标题或日期无效`);
    }
    seen.add(id);
    const publishedTime = new Date(time).toISOString();
    return { externalId: `reddit:${id}`, url: `https://www.reddit.com${url.pathname}`, title, body, publishedTime, publishedAt: publishedTime.slice(0, 10), articleDetails: { community: subreddit, bodyStatus: body.trim() ? 'complete' : 'empty' } };
  });
}

const redditUpload = z.object({
  accountId: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200).regex(/\.zip$/i),
  fileData: z.string().min(1).max(12 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();

export async function importReddit(store, input) {
  const { accountId, fileName, fileData } = redditUpload.parse(input);
  const buffer = Buffer.from(fileData, 'base64');
  const observedAt = new Date().toISOString();
  const rows = await parseReddit(buffer);
  const { data, revision } = store.read();
  if (!data.socialAnalytics?.accounts.some(a => a.id === accountId && a.platform === 'reddit')) throw Error('请选择 Reddit 账号');
  const reportFileHash = sha256(buffer);
  const previous = new Map(data.socialAnalytics.snapshots.filter(s => s.accountId === accountId && s.source === 'report' && s.externalId.startsWith('reddit:')).map(s => [s.externalId, s]));
  const changed = rows.filter(row => {
    const old = previous.get(row.externalId);
    return !old || (old.reportFileHash !== reportFileHash && Date.parse(old.observedAt) <= Date.parse(observedAt));
  });
  if (!changed.length) return { inserted: 0, updated: 0 };
  return saveSocial(store, { expectedRevision: revision, snapshots: changed.map(row => ({
    ...row, accountId, kind: 'content', observedAt, period: 'lifetime', periodEnd: row.publishedAt,
    source: 'report', sourceNote: `Reddit 导出：${fileName} / posts.csv（文章资料）`, reportFileHash, metrics: {},
  })) }, { importArticles: true });
}

export function migrateSocialArticles(store) {
  const { data, revision } = store.read();
  const social = data.socialAnalytics;
  if (!social) return 0;
  const accounts = new Map(social.accounts.map(a => [a.id, a]));
  let added = 0;
  const rows = [...social.snapshots].sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  for (const row of rows) {
    const account = accounts.get(row.accountId);
    if (!account || row.kind !== 'content' || !row.url || !hasCompleteBody(row)) continue;
    if (addMarketingArticle(data, account, row, true)) added++;
  }
  if (added && !store.write(data, revision)) throw Error('工作区已更新，请重试迁移');
  return added;
}
