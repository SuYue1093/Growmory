import { platformNames, findPlatform, platformName } from '../src/platforms.ts';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
const text = z.string().trim().min(1).max(500);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const operationsFilter = { productId: text.optional(), channel: z.enum(platformNames).optional() };
export const operationPostShape = {
  expectedRevision: z.number().int().nonnegative(), id: text.optional(),
  fields: z.object({ productId: text.optional(), title: text.optional(), body: z.string().max(200000).optional(), reason: text.optional(), participationAdvice: z.string().trim().max(3000).optional(),
    channel: z.enum(platformNames).optional(), url: z.string().url().optional(), sourceTitle: text.optional(), checkedAt: date.optional(),
    status: z.enum(['suggested', 'saved', 'dismissed']).optional() }).strict(),
};
export const operationsGuide = '查看历史潜在帖子及其参与建议。';
export function operationsContext(store, filter = {}) {
  const { data, revision } = store.read();
  if (filter.productId && !data.products.some(p => p.id === filter.productId)) throw Error('产品不存在');
  return { revision, products: data.products.map(({id,name,summary}) => ({id,name,summary})),
    docs: data.docs.filter(d => d.status === 'confirmed' && (!filter.productId || d.productId === filter.productId)),
    posts: (data.promotions || []).filter(p => p.kind === 'opportunity' && (!filter.productId || p.productId === filter.productId) && (!filter.channel || platformName(p.channel) === platformName(filter.channel))), guide: operationsGuide };
}
const canonical = value => { const u = new URL(value); return u.hostname.toLowerCase().replace(/^www\./,'') + u.pathname.replace(/\/$/,''); };
export function saveOperationPost(store, input) {
  const args = z.object(operationPostShape).strict().parse(input);
  const { data, revision } = store.read();
  if (args.expectedRevision !== revision) throw Error('工作区已更新，请重新读取后回填');
  const records = data.promotions || (data.promotions = []);
  let record = args.id ? records.find(p => p.id === args.id && p.kind === 'opportunity') : undefined;
  if (args.id && !record) throw Error('帖子不存在');
  const f = args.fields;
  if (!record) {
    if (!f.productId || !f.url || !f.channel || !f.title || !f.body?.trim() || !f.sourceTitle || !f.checkedAt) throw Error('新帖子需要产品、标题、正文、渠道、链接及核实时间');
    record = records.find(p => p.kind === 'opportunity' && p.productId === f.productId && canonical(p.url) === canonical(f.url));
  }
  const status = record?.status;
  const next = { id: randomUUID(), kind: 'opportunity', body:'',reason:'',expiresAt:'',date:'',minutes:0,feedback:'',status:'suggested', ...record, ...f, verification: f.body?.trim() ? 'full' : record?.verification || 'full', updatedAt:new Date().toISOString() };
  if (!data.products.some(p => p.id === next.productId)) throw Error('产品不存在');
  const host = new URL(next.url).hostname.toLowerCase();
  const domains = findPlatform(next.channel)?.domains || [];
  if (!domains.some(d => host === d || host.endsWith('.' + d))) throw Error('链接与所选平台不匹配');
  if (records.some(p => p.id !== next.id && p.kind === 'opportunity' && p.productId === next.productId && canonical(p.url) === canonical(next.url))) throw Error('帖子链接重复');
  if (f.status === undefined && status) next.status = status;
  if (record) Object.assign(record, next); else records.push(next);
  const result = store.write(data, revision);
  if (!result) throw Error('工作区已更新，请重新读取后回填');
  return { revision:result.revision, record:next };
}

export const operationDeleteShape = { expectedRevision: z.number().int().nonnegative(), deleteIds: z.array(text).min(1).max(1000) };
export function deleteOperationPosts(store, input) {
  const args = z.object(operationDeleteShape).strict().parse(input);
  const {data, revision} = store.read();
  if (args.expectedRevision !== revision) throw Error('工作区已更新，请重新读取后删除');
  const ids = new Set(args.deleteIds);
  if (ids.size !== args.deleteIds.length || [...ids].some(id => !(data.promotions || []).some(p => p.id === id && p.kind === 'opportunity'))) throw Error('待删除帖子不存在或重复，请刷新后重试');
  data.promotions = (data.promotions || []).filter(p => !ids.has(p.id));
  const saved = store.write(data, revision);
  if (!saved) throw Error('工作区已更新，请重新读取后删除');
  return {revision: saved.revision, deleted: ids.size};
}
