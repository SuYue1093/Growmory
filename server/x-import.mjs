import unzipper from 'unzipper';
import { z } from 'zod';
import { saveSocial } from './social-analytics.mjs';

const maxFile = 50 * 1024 * 1024;
const maxEncodedFile = Math.ceil(maxFile / 3) * 4;
export const xUploadBodyLimit = maxEncodedFile + 10000;
const maxRecords = 20000;
const uploadSchema = z.object({
  accountId: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200).regex(/\.zip$/i),
  fileData: z.string().min(1).max(maxEncodedFile).regex(/^[A-Za-z0-9+/]+={0,2}$/),
}).strict();
const handle = /^[A-Za-z0-9_]{1,15}$/;
const id = z.string().regex(/^\d{1,25}$/);
const count = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().nonnegative().safe()).optional();
const accounts = z.array(z.object({ account: z.object({ username: z.string().regex(handle) }) })).length(1);
const tweets = z.array(z.object({ tweet: z.object({
  id_str: id,
  created_at: z.string(),
  full_text: z.string().max(200000),
  favorite_count: count,
  retweet_count: count,
}) })).max(maxRecords);
const followers = z.array(z.object({ follower: z.object({ accountId: id }) }));

async function parseArchive(buffer) {
  let archive;
  try {
    archive = await unzipper.Open.buffer(buffer);
  } catch {
    throw Error('无法读取 X ZIP 归档');
  }
  let remaining = 32 * 1024 * 1024;
  async function read(file, key, schema) {
    let parsed;
    try {
      if (file.uncompressedSize > remaining) throw Error();
      const chunks = [];
      for await (const chunk of file.stream()) {
        remaining -= chunk.length;
        if (remaining < 0) throw Error();
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const part = file.path.match(/-part(\d+)\.js$/)?.[1] || '0';
      const prefix = key === 'manifest' ? 'window.__THAR_CONFIG' : `window.YTD.${key}.part${part}`;
      const assignment = /^\s*([\w.]+)\s*=\s*/.exec(text);
      if (assignment?.[1] !== prefix) throw Error();
      parsed = schema.safeParse(JSON.parse(text.slice(assignment[0].length).trim().replace(/;$/, '')));
    } catch {
      throw Error(`无法读取 ${file.path}，文件损坏或归档数据超过 32 MB`);
    }
    if (!parsed.success) throw Error(`${file.path} 的数据格式无效`);
    return parsed.data;
  }
  function parts(name) {
    const pattern = new RegExp(`^data/${name}(?:-part(\\d+))?\\.js$`);
    const files = archive.files.filter(file => file.type === 'File' && pattern.test(file.path));
    const number = file => Number(file.path.match(pattern)[1] || 0);
    files.sort((a, b) => number(a) - number(b));
    if (files.some((file, index) => number(file) !== index)) throw Error(`${name} 归档分卷缺失或重复`);
    return files;
  }
  const accountFiles = parts('account');
  const tweetFiles = parts('tweets');
  if (accountFiles.length !== 1 || !tweetFiles.length) throw Error('X ZIP 必须包含 data/account.js 和 data/tweets.js');
  const [{ account: { username } }] = await read(accountFiles[0], 'account', accounts);
  const posts = new Map();
  for (const [files, key] of [[tweetFiles, 'tweets'], [parts('community-tweet'), 'community_tweet']]) {
    for (const file of files) {
      for (const { tweet } of await read(file, key, tweets)) {
        if (posts.has(tweet.id_str)) continue;
        const time = Date.parse(tweet.created_at);
        if (!Number.isFinite(time)) throw Error(`${file.path} 含有无效的帖子发布时间`);
        const publishedTime = new Date(time).toISOString();
        const text = tweet.full_text.trim().slice(0, 500).replace(/[\uD800-\uDBFF]$/, '');
        posts.set(tweet.id_str, {
          kind: 'content', externalId: `x:${tweet.id_str}`,
          url: `https://x.com/${username}/status/${tweet.id_str}`,
          title: text || `X · ${tweet.id_str}`,
          body: tweet.full_text, publishedTime, publishedAt: publishedTime.slice(0, 10),
          metrics: { likes: tweet.favorite_count, reposts: tweet.retweet_count },
        });
        if (posts.size > maxRecords) throw Error('X ZIP 超过 20,000 条帖子');
      }
    }
  }
  const followerIds = new Set();
  const followerFiles = parts('follower');
  for (const file of followerFiles) {
    for (const { follower } of await read(file, 'follower', followers)) followerIds.add(follower.accountId);
  }
  const manifests = parts('manifest');
  const manifest = manifests.length === 1
    ? await read(manifests[0], 'manifest', z.object({ archiveInfo: z.object({ generationDate: z.string().optional() }).optional() }))
    : undefined;
  return { username, posts: [...posts.values()], followerCount: followerFiles.length ? followerIds.size : undefined,
    generationDate: manifest?.archiveInfo?.generationDate };
}

export async function importX(store, input) {
  const { accountId, fileName, fileData } = uploadSchema.parse(input);
  const buffer = Buffer.from(fileData, 'base64');
  if (buffer.length > maxFile) throw Error('X ZIP 超过 50 MB');
  const archive = await parseArchive(buffer);
  const { data, revision } = store.read();
  const account = data.socialAnalytics?.accounts.find(a => a.id === accountId && a.platform === 'x');
  if (!account) throw Error('请选择 X 账号');
  const profile = new URL(account.url);
  const username = profile.pathname.replace(/^\/|\/$/g, '');
  if (!['x.com', 'twitter.com'].includes(profile.hostname.replace(/^(?:www|mobile)\./, '')) ||
      username.toLowerCase() !== archive.username.toLowerCase()) throw Error('归档用户名与所选 X 账号主页不匹配');

  const generated = Date.parse(archive.generationDate);
  const observedAt = Number.isFinite(generated) ? new Date(generated).toISOString() : new Date().toISOString();
  const rows = archive.posts;
  if (archive.followerCount !== undefined) rows.push({
    kind: 'account', externalId: 'x:followers', title: account.name, url: account.url,
    metrics: { followers: archive.followerCount },
  });
  const previous = new Map(data.socialAnalytics.snapshots.filter(s =>
    s.accountId === accountId && s.source === 'report' && s.externalId.startsWith('x:')
  ).map(s => [s.externalId, s]));
  const snapshots = rows.filter(row => {
    const old = previous.get(row.externalId);
    if (!old) return true;
    if (Date.parse(old.observedAt) > Date.parse(observedAt)) return false;
    return (Number.isFinite(generated) && old.observedAt !== observedAt) ||
      old.publishedTime !== row.publishedTime || old.body !== row.body || old.url !== row.url ||
      JSON.stringify(old.metrics) !== JSON.stringify(row.metrics);
  }).map(row => ({
    ...row, accountId, observedAt, period: 'lifetime', periodEnd: observedAt.slice(0, 10),
    source: 'report', sourceNote: `X 归档：${fileName}`,
  }));
  if (!snapshots.length) return { inserted: 0, updated: 0 };
  return saveSocial(store, { expectedRevision: revision, snapshots }, { snapshotLimit: maxRecords + 1 });
}
