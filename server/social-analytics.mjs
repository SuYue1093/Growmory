import { socialUrl, socialIdentity, hasCompleteBody, summarizeSocial } from '../src/social-identity.ts';
import { platformIds, platformCatalog, findPlatform, platformLabels, isPersonalSiteChannel } from '../src/platforms.ts';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const text = z.string().trim().min(1).max(500);
const url = z.string().url().refine(v => /^https?:\/\//.test(v), '仅支持 HTTP/HTTPS 链接');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, '日期无效');
const platform = z.enum(platformIds);
const accountFields = z.object({ id: text.optional(), platform, name: text, url: z.union([url, z.literal('')]).default(''), productId: z.string().default(''), followers: z.number().int().nonnegative().safe().nullable().optional(), isPremium: z.boolean().optional(), contentDirection: z.string().trim().max(1000).optional(), writingStyle: z.string().trim().max(1000).optional() }).strict();
const hasAccountUrl = account => account.platform === 'wechat' || !!account.url;
const hasValidMembership = account => account.platform === 'x' || account.isPremium === undefined;
const membershipIssue = { path: ['isPremium'], message: '只有 X 账号可以设置会员状态' };
const accountUrlIssue = { path: ['url'], message: '请填写账号主页链接' };
export const accountSchema = accountFields.refine(hasAccountUrl, accountUrlIssue).refine(hasValidMembership, membershipIssue);
export const metricKeys = ['views', 'impressions', 'likes', 'comments', 'saves', 'shares', 'reposts', 'score', 'upvoteRatio', 'followers', 'linkClicks', 'coverClickRate', 'gainedFollowers', 'avgViewDuration', 'danmaku', 'readUsers', 'shareUsers', 'favoriteUsers', 'originalReadUsers', 'publishedPosts'];
const metrics = z.object(Object.fromEntries(metricKeys.map(k => [k, k === 'score' ? z.number().int().safe().nullable().optional() : ['upvoteRatio', 'coverClickRate'].includes(k) ? z.number().min(0).max(1).nullable().optional() : k === 'avgViewDuration' ? z.number().nonnegative().safe().nullable().optional() : z.number().int().nonnegative().safe().nullable().optional()]))).strict();
export const articleDetailsSchema = z.object({ author: z.string().max(500).optional(), community: z.string().max(500).optional(), tags: z.array(text).max(100).optional(), mediaUrls: z.array(url).max(100).optional(), linkUrl: url.optional(), bodyStatus: z.enum(['complete', 'empty']).optional() }).strict();
function allowsUnlinked(row, platform) {
  if (row.kind === 'account') return row.source === 'report' && row.period === 'range' &&
    row.periodStart === row.periodEnd && ['wechat', 'juejin'].some(id =>
      (!platform || platform === id) && row.externalId === `${id}-trend`);

  return (row.source === 'report' && (
    ((!platform || platform === 'xiaohongshu') && row.externalId.startsWith('xhs-report:') && row.publishedTime) ||
    ['wechat', 'juejin'].some(id => (!platform || platform === id) && row.externalId.startsWith(`${id}-report:`) && row.publishedAt)
  )) || ((!platform || platform === 'wechat') && row.source === 'api' && row.externalId.startsWith('wechat-api:') && row.publishedAt);
}
export const snapshotSchema = z.object({ accountId: text, kind: z.enum(['account', 'content']), contentId: z.string().default(''), externalId: z.string().max(500).default(''), title: z.string().max(500).default(''), body: z.string().max(200000).optional(), articleDetails: articleDetailsSchema.optional(), url: url.optional(), publishedTime: z.string().datetime({ offset: true }).optional(), contentType: z.string().max(80).optional(), reportFileHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), publishedAt: date.optional(), observedAt: z.string().datetime({ offset: true }), period: z.enum(['lifetime', 'range']), periodStart: date.optional(), periodEnd: date, source: z.enum(['browser', 'report', 'screenshot', 'manual', 'api']), sourceNote: text, metrics }).strict().superRefine((v, ctx) => {
  if (!v.url && !allowsUnlinked(v)) ctx.addIssue({ code: 'custom', message: '缺少内容链接或有效报表标识' });
  if (!Object.values(v.metrics).some(n => n != null) && !(v.source === 'report' && v.kind === 'content' && (v.externalId.startsWith('reddit:') || /^x:\d+$/.test(v.externalId)) && v.url && v.publishedTime)) ctx.addIssue({ code: 'custom', message: '至少提供一个实际读取到的指标' });
  if (v.period === 'range' && (!v.periodStart || v.periodStart > v.periodEnd)) ctx.addIssue({ code: 'custom', message: '区间数据必须提供有效起止日期' });
  if (v.period === 'lifetime' && v.periodStart) ctx.addIssue({ code: 'custom', message: '累计数据不应设置区间开始日期' });
  if (v.kind === 'content' && !v.title.trim()) ctx.addIssue({ code: 'custom', message: '内容快照必须有标题' });
});
const reportLinkSchema = z.object({ accountId: text, externalId: z.string().startsWith('xhs-report:'), url }).strict();
export const socialDataSchema = z.object({ reportLinks: z.array(reportLinkSchema).optional(), accounts: z.array(accountFields.extend({ id: text }).refine(hasAccountUrl, accountUrlIssue).refine(hasValidMembership, membershipIssue)).max(500), snapshots: z.array(z.object({ id: text }).passthrough().superRefine((v, ctx) => {
  const { id, ...fields } = v;
  const parsed = snapshotSchema.safeParse(fields);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue(issue);
})) }).superRefine((v, ctx) => {
  const ids = new Set(v.accounts.map(a => a.id));
  if (ids.size !== v.accounts.length || new Set(v.snapshots.map(s => s.id)).size !== v.snapshots.length || v.snapshots.some(s => !ids.has(s.accountId))) ctx.addIssue({ code: 'custom', message: '自媒体账号或快照关联无效' });
});
export const socialSaveShape = { expectedRevision: z.number().int().nonnegative(), accounts: z.array(accountSchema).max(100).default([]), snapshots: z.array(snapshotSchema).max(1000).default([]), wechatApi: z.object({ appId: z.string().trim().regex(/^wx[a-zA-Z0-9]{16}$/), secret: z.string().trim().max(128).default('') }).strict().optional(), reportLinks: z.array(reportLinkSchema.extend({ url: z.union([url, z.literal('')]) })).max(1000).default([]), deleteSnapshotIds: z.array(text).max(1000).default([]) };
export const socialGuide = '自媒体数据来自平台导出文件和历史记录。缺失指标留空，原帖链接或报表标识用于归集。';

const title = value => value?.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const titleKey = s => JSON.stringify([s.accountId, title(s.title)]);

export function matchMarketing(data, account, row) {
  if (row.kind !== 'content') return {};
  const candidates = data.contents.filter(c => findPlatform(c.channel)?.id === account.platform &&
    (!c.accountId || c.accountId === account.id) &&
    (!account.productId || (c.productId === account.productId || c.productIds?.includes(account.productId)) || !c.productId));
  const result = c => ({ id: c.id, title: c.title });
  const options = rows => rows.map(c => ({ ...result(c), publishedAt: c.publishedAt, product: data.products.find(p => p.id === c.productId)?.name, url: c.url }));
  if (row.contentId) {
    const explicit = data.contents.find(c => c.id === row.contentId);
    if (explicit) return result(explicit);
  }
  const linked = candidates.find(c => c.sourceSocialIdentity === socialIdentity(row));
  if (linked) return result(linked);
  const byUrl = row.url ? candidates.filter(c => c.url && socialUrl(c.url) === socialUrl(row.url)) : [];
  if (byUrl.length === 1) return result(byUrl[0]);
  const sameTitle = (byUrl.length ? byUrl : candidates).filter(c =>
    title(row.title) && title(c.title) === title(row.title) &&
    (!row.url || !c.url || socialUrl(c.url) === socialUrl(row.url)));
  if (row.source === 'report' && row.externalId?.startsWith('xhs-report:')) {
    if (row.title === '无标题笔记') return {};
    if (sameTitle.length === 1 && !row.undatedTitleConflict) return result(sameTitle[0]);
    return sameTitle.length ? { ambiguous: true, options: options(sameTitle) } : {};
  }
  const sameDay = sameTitle.filter(c => row.publishedAt && c.publishedAt === row.publishedAt);
  const matches = sameDay.length ? sameDay : sameTitle.filter(c => !row.publishedAt || !c.publishedAt);
  if (matches.length === 1 && !row.titleConflict && (matches[0].publishedAt || !row.undatedTitleConflict)) return result(matches[0]);
  const choices = matches.length ? matches : byUrl;
  return choices.length ? { ambiguous: true, options: options(choices) } : {};
}


export function addMarketingArticle(data, account, row, migrate = false) {
  const identity = socialIdentity(row);
  if (data.contents.some(c => c.sourceSocialIdentity === identity)) return false;
  const match = matchMarketing(data, account, row);
  if (match.ambiguous || (match.id && (!migrate || data.contents.find(c => c.id === match.id)?.url))) return false;
  const publishedAt = row.publishedAt || row.publishedTime?.slice(0, 10) || '';
  data.contents.push({ id: randomUUID(), sourceSocialIdentity: identity, accountId: account.id, productId: account.productId,
    title: row.title, body: row.body, url: row.url, channel: platformLabels[account.platform],
    status: 'published', date: publishedAt, publishedAt, isAi: false });
  return true;
}

function resolveReportLinks(snapshots, savedLinks) {
  const links = [...savedLinks];
  const options = {};
  const groups = new Map();
  const reports = new Map();
  for (const row of snapshots) {
    if (row.kind !== 'content') continue;
    const key = titleKey(row);
    if (row.url) {
      if (!groups.has(key)) groups.set(key, new Map());
      const notes = groups.get(key);
      const identity = socialUrl(row.url);
      const previous = notes.get(identity);
      if (!previous || (!previous.publishedTime && row.publishedTime)) notes.set(identity, row);
    } else if (row.source === 'report' && row.title !== '无标题笔记') {
      if (!reports.has(key)) reports.set(key, new Map());
      reports.get(key).set(row.externalId, row);
    }
  }
  for (const [key, rows] of reports) {
    const notes = [...(groups.get(key)?.values() || [])];
    if (!notes.length) continue;
    for (const row of rows.values()) {
      if (savedLinks.some(l => l.accountId === row.accountId && l.externalId === row.externalId)) continue;
      const available = notes.filter(note => !savedLinks.some(l =>
        l.accountId === row.accountId && l.externalId !== row.externalId && socialUrl(l.url) === socialUrl(note.url)));
      if (notes.length === 1 && available.length === 1 && rows.size === 1) {
        links.push({ accountId: row.accountId, externalId: row.externalId, url: available[0].url });
      } else if (available.length) {
        options[socialIdentity(row)] = available.map(({ url, title, publishedTime }) => ({ url, title, publishedTime }));
      }
    }
  }
  return { links, options };
}

export function socialContext(store, filter = {}) {
  const { data, revision } = store.read();
  const social = data.socialAnalytics || { accounts: [], snapshots: [] };
  const accounts = social.accounts.filter(a => (!filter.platform || a.platform === filter.platform) && (!filter.accountId || a.id === filter.accountId) && (!filter.productId || a.productId === filter.productId));
  const ids = new Set(accounts.map(a => a.id));
  const snapshots = social.snapshots.filter(s => ids.has(s.accountId));
  const { links, options: reportOptions } = resolveReportLinks(snapshots, (social.reportLinks || []).filter(l => ids.has(l.accountId)));
  const summaries = summarizeSocial(snapshots, links);
  const index = new Map();
  for (const s of [...summaries].sort((a,b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))) {
    if (s.kind !== 'content') continue;
    const key = socialIdentity(s, links);
    if (!index.has(key)) index.set(key, { accountId: s.accountId, url: s.url, externalId: s.externalId, title: s.title, bodyStatus: hasCompleteBody(s) ? (s.body === '' ? 'empty' : 'complete') : 'missing', bodyObservedAt: s.bodyObservedAt, bodyTitle: s.bodyTitle });
  }
  const accountById = new Map(accounts.map(a => [a.id, a]));
  const titleGroups = new Map();
  for (const s of summaries) {
    if (s.kind !== 'content') continue;
    const key = titleKey(s);
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(s);
  }
  const contentLinks = Object.fromEntries([...snapshots, ...summaries].map(s => {
    const identity = socialIdentity(s, links);
    const conflicts = (titleGroups.get(titleKey(s)) || []).filter(other => socialIdentity(other, links) !== identity);
    const explicit = snapshots.find(other => other.contentId && socialIdentity(other, links) === identity);
    return [s.id, matchMarketing(data, accountById.get(s.accountId), {
      ...s, url: s.url || links.find(l => l.accountId === s.accountId && l.externalId === s.externalId)?.url, contentId: explicit?.contentId || s.contentId,
      titleConflict: conflicts.some(other => !s.publishedAt || !other.publishedAt || s.publishedAt === other.publishedAt),
      undatedTitleConflict: conflicts.length > 0,
    })];
  }));
  return {
    revision,
    accounts,
    contentLinks,
    collectionIndex: [...index.values()],
    reportLinks: links,
    reportOptions,
    summaries,
    snapshots,
    products: data.products.map(({ id, name }) => ({ id, name })),
    contents: (data.contents || [])
      .filter(c => !isPersonalSiteChannel(c.channel) && (!filter.productId || (c.productId === filter.productId || c.productIds?.includes(filter.productId))))
      .map(({ id, productId, productIds, title, channel, url, publishedAt, date, createdAt }) => ({
        id,
        productId,
        productIds,
        title,
        channel,
        url,
        publishedAt: publishedAt || date,
        createdAt
      })),
    guide: socialGuide,
    metricKeys
  };
}
function checkPlatform(value, platform) {
  const host = new URL(value).hostname.toLowerCase();
  const domains = platformCatalog.find(p => p.id === platform)?.domains || [];
  if (!domains.some(d => host === d || host.endsWith('.' + d))) throw Error('链接与所选平台不匹配');
}
function canonical(value) { return socialUrl(value); }
export function saveSocial(store, input, { importArticles = false, snapshotLimit } = {}) {
  const shape = snapshotLimit ? { ...socialSaveShape, snapshots: z.array(snapshotSchema).max(snapshotLimit).default([]) } : socialSaveShape;
  const args = z.object(shape).strict().parse(input);
  const { data, revision } = store.read();
  if (args.expectedRevision !== revision) throw Error('工作区已更新，请重新读取 revision 后回填');
  const social = structuredClone(data.socialAnalytics || { accounts: [], snapshots: [] });
  if (args.wechatApi && (args.accounts.length !== 1 || args.accounts[0].platform !== 'wechat')) throw Error('API 配置必须对应一个微信公众号');
  let credential;
  for (const item of args.accounts) {
    if (item.url) checkPlatform(item.url, item.platform);
    if (item.productId && !data.products.some(p => p.id === item.productId)) throw Error('关联产品不存在');
    const sameLink = a => a.platform === item.platform && !!a.url && !!item.url && canonical(a.url) === canonical(item.url);
    const old = item.id ? social.accounts.find(a => a.id === item.id) : social.accounts.find(sameLink);
    if (item.id && !old) throw Error('账号不存在');
    if (old && old.platform !== item.platform) throw Error('已有账号不能更改平台');
    if (social.accounts.some(a => a.id !== old?.id && sameLink(a))) throw Error('账号链接重复');
    const record = { ...item, id: old?.id || randomUUID() };
    if (args.wechatApi) {
      const previous = old && store.wechatCredential(old.id);
      const secret = args.wechatApi.secret || (previous?.appId === args.wechatApi.appId ? previous.secret : '');
      if (!secret) throw Error('请填写与 AppID 对应的 AppSecret');
      credential = { accountId: record.id, appId: args.wechatApi.appId, secret };
    }
    if (old) Object.assign(old, record); else social.accounts.push(record);
  }
  let inserted = 0, updated = 0;
  const key = s => {
    if (s.source === 'report' && /^x:(?:\d+|followers)$/.test(s.externalId)) return JSON.stringify([s.accountId, s.kind, s.externalId, s.source]);
    return JSON.stringify([s.accountId, s.kind, s.kind === 'account' ? '' : s.url ? canonical(s.url) : s.externalId, s.source, s.source === 'api' && s.externalId.startsWith('wechat-api:') ? 'wechat-api' : s.source === 'report' && s.externalId.startsWith('reddit:') ? 'reddit-export' : s.source === 'report' && s.reportFileHash ? s.reportFileHash : new Date(s.observedAt).toISOString(), s.period, s.periodStart || '', s.periodEnd]);
  };
  const snapshotIndex = new Map();
  for (const snapshot of social.snapshots) {
    const identity = key(snapshot);
    if (!snapshotIndex.has(identity)) snapshotIndex.set(identity, snapshot);
  }
  for (const item of args.snapshots) {
    const account = social.accounts.find(a => a.id === item.accountId);
    if (!account) throw Error('快照对应账号不存在');
    if (item.url) checkPlatform(item.url, account.platform);
    if (!item.url && !allowsUnlinked(item, account.platform)) throw Error('无链接记录与平台不匹配');
    if (item.contentId && (!item.url || !data.contents.some(c => c.id === item.contentId && canonical(c.url) === canonical(item.url) && (!account.productId || (c.productId === account.productId || c.productIds?.includes(account.productId)))))) throw Error('内容关联不存在或链接、产品不匹配');
    if (item.kind === 'account' && item.url && (!account.url || canonical(item.url) !== canonical(account.url))) throw Error('账号快照链接与账号不匹配');
    if (item.kind === 'content' && item.metrics.followers != null) throw Error('关注者数仅用于账号快照');
    if (item.articleDetails) {
      delete item.articleDetails.mediaUrls;
      delete item.articleDetails.linkUrl;
    }
    if (['xiaohongshu', 'reddit'].includes(account.platform) && item.kind === 'content' && item.source === 'api') {
      if (item.body !== undefined && !hasCompleteBody(item)) throw Error('提供正文时必须是完整正文 body；确认无文字的帖子需标记 articleDetails.bodyStatus=empty');
      if (item.body === undefined && item.articleDetails?.bodyStatus) throw Error('未读取正文时请省略 bodyStatus，不得标记已完成');
    }
    if (importArticles) addMarketingArticle(data, account, item);
    const identity = key(item);
    const old = snapshotIndex.get(identity);
    if (old) {
      Object.assign(old, { ...item, contentId: item.contentId || old.contentId }); updated++;
    } else {
      const record = { ...item, id: randomUUID() };
      social.snapshots.push(record);
      snapshotIndex.set(identity, record);
      inserted++;
    }
  }
  social.reportLinks ||= [];
  for (const link of args.reportLinks) {
    const account = social.accounts.find(a => a.id === link.accountId);
    if (account?.platform !== 'xiaohongshu') throw Error('报表关联仅支持已存在的小红书账号');
    if (!link.url) { social.reportLinks = social.reportLinks.filter(l => l.accountId !== link.accountId || l.externalId !== link.externalId); continue; }
    checkPlatform(link.url, account.platform);
    if (!social.snapshots.some(s => s.accountId === link.accountId && s.source === 'report' && s.externalId === link.externalId && !s.url)) throw Error('待关联报表不存在或已有原始链接');
    if (!social.snapshots.some(s => s.accountId === link.accountId && s.kind === 'content' && s.url && canonical(s.url) === canonical(link.url))) throw Error('请选择同账号已采集的笔记');
    if (social.reportLinks.some(l => l.accountId === link.accountId && l.externalId !== link.externalId && canonical(l.url) === canonical(link.url))) throw Error('该笔记已与另一条报表关联');
    const old = social.reportLinks.find(l => l.accountId === link.accountId && l.externalId === link.externalId);
    if (old) Object.assign(old, link); else social.reportLinks.push(link);
  }
  const deleting = new Set(args.deleteSnapshotIds);
  if (deleting.size !== args.deleteSnapshotIds.length || [...deleting].some(id => !social.snapshots.some(s => s.id === id))) throw Error('待删除记录不存在或重复，请刷新后重试');
  social.snapshots = social.snapshots.filter(s => !deleting.has(s.id));
  const result = store.write({ ...data, socialAnalytics: social }, revision, credential);
  if (!result) throw Error('工作区已更新，请重新读取后回填');
  return { revision: result.revision, inserted, updated, deleted: deleting.size, accounts: social.accounts };
}

export function linkMarketing(store, input) {
  const args = z.object({ expectedRevision: z.number().int(), marketingLink: z.object({ snapshotId: text, contentId: text }).strict() }).strict().parse(input);
  const { data, revision } = store.read();
  if (args.expectedRevision !== revision) throw Error('工作区已更新，请重新读取');
  const { snapshotId, contentId } = args.marketingLink;
  const social = data.socialAnalytics;
  const row = social?.snapshots.find(s => s.id === snapshotId);
  const targetContent = data.contents?.find(c => c.id === contentId);
  if (!row || !targetContent) throw Error('待关联记录或目标内容不存在');
  const context = socialContext(store);
  const identity = socialIdentity(row, context.reportLinks);
  for (const s of social.snapshots) {
    if (socialIdentity(s, context.reportLinks) === identity) s.contentId = contentId;
  }
  const saved = store.write(data, revision);
  if (!saved) throw Error('工作区已更新，请重新读取');
  return { revision: saved.revision };
}
