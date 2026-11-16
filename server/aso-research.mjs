import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppleConnectionError } from './app-store-connect.mjs';
const text = z.string().max(10000), id = z.string().min(1).max(100), market = z.string().regex(/^[A-Z]{2}$/), locale = z.string().regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)*$/);
const copyFields = z.object({ name: z.string(), subtitle: z.string(), keywords: z.string(), description: z.string(), promotionalText: z.string() }).strict();
export const asoDraftSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  planId: id.optional(),
  platform: z.string().trim().optional(),
  title: z.string().trim().min(1).max(200), objective: z.string().trim().min(1).max(2000), market,
  analysis: text,
  target: z.object({ versionId: id, infoId: id, locale, platform: z.string().trim().optional() }).strict(),
  before: copyFields, fields: copyFields,
}).strict();
export const asoMediaItemSchema = z.object({
  order: z.number().int().min(1).max(20),
  type: z.string().trim().default('APP_SCREENSHOT'),
  title: z.string().trim().min(1).max(100),
  caption: z.string().trim().max(300).optional(),
  subcaption: z.string().trim().max(500).optional(),
  visualConcept: z.string().trim().max(2000).optional(),
  rationale: z.string().trim().max(2000).optional(),
  device: z.string().trim().optional(),
}).strict();
export const asoMediaPlanSchema = z.object({
  title: z.string().trim().min(1).max(200),
  platform: z.string().trim().default('IOS'),
  locale: z.string().trim().default('zh-Hans'),
  overview: z.string().trim().max(2000).optional(),
  testingHypothesis: z.string().trim().max(2000).optional(),
  items: z.array(asoMediaItemSchema).max(20).default([]),
}).strict();
export const asoReportSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(2000),
  content: z.string().trim().min(1).max(60000),
  plans: z.array(asoDraftSchema.omit({ expectedRevision: true, planId: true })).max(30).default([]),
  mediaPlans: z.array(asoMediaPlanSchema).max(30).optional().default([]),
});
const fail = (message, status = 400) => { throw new AppleConnectionError(message, status); };
const sameTarget = (a, b) => a.versionId === b.versionId && a.infoId === b.infoId && a.locale === b.locale;
export function openAsoResearch(store, context) {
  function read(productId) {
    const appId = context(productId).product.appStore.appId;
    const saved = store.asoWorkspace?.(productId);
    return saved?.appId === appId ? saved : { appId, revision: saved?.revision || 0, plans: [] };
  }
  function write(productId, value, expectedRevision) {
    const current = read(productId);
    if (current.revision !== expectedRevision) fail('ASO 资料已在其他入口更新，请刷新后再保存。', 409);
    const { revision: _revision, ...body } = value;
    const result = store.saveAsoWorkspace(productId, { ...body, appId: current.appId }, expectedRevision);
    if (!result) fail('ASO 资料已更新，请刷新后再保存。', 409);
    return result;
  }
  return {
    research(productId) {
      const { reports: _reports, ...workspace } = read(productId);
      return workspace;
    },
    reports(productId) {
      return read(productId).reports || [];
    },
    deleteReport(productId, reportId) {
      const current = read(productId);
      const remainingReports = (current.reports || []).filter(item => item.id !== reportId);
      write(productId, { ...current, reports: remainingReports }, current.revision);
      return { ok: true };
    },
    toggleRead(productId, reportId, isRead) {
      const current = read(productId);
      const reports = (current.reports || []).map(r => {
        if (r.id !== reportId) return r;
        const nextRead = isRead !== undefined ? isRead : !r.isRead;
        return {
          ...r,
          isRead: nextRead,
          readAt: nextRead ? (r.readAt || new Date().toISOString()) : undefined,
        };
      });
      write(productId, { ...current, reports }, current.revision);
      return { ok: true };
    },
    saveReport(productId, report) {
      const current = read(productId);
      const saved = { ...report, id: randomUUID(), createdAt: new Date().toISOString() };
      write(productId, { ...current, reports: [saved, ...(current.reports || [])] }, current.revision);
      return saved;
    },
    applyReport(productId, reportId) {
      const current = read(productId);
      const report = current.reports?.find(item => item.id === reportId);
      if (!report?.plans.length) fail('此报告没有可使用的文案方案。');
      const pending = report.plans.filter(plan => !current.plans.some(saved =>
        saved.sourceReportId === report.id && sameTarget(saved.target, plan.target)));
      if (!pending.length) return { count: 0 };
      const docs = context(productId).docs;
      const drafts = pending.map(plan => ({
        ...plan, id: randomUUID(), createdAt: new Date().toISOString(), status: 'draft', origin: 'mcp',
        sourceReportId: report.id, executions: [], sources: { docs: docs.map(({ id, title, updatedAt }) => ({ id, title, updatedAt })) },
      }));
      write(productId, { ...current, plans: [...drafts, ...current.plans] }, current.revision);
      return { count: drafts.length };
    },
    savePlan(productId, input, snapshot) {
      const meta = z.object({ title: z.string().trim().min(1).max(200), objective: z.string().trim().min(1).max(2000), market, expectedRevision: z.number().int().nonnegative(), analysis: text }).safeParse(input);
      if (!meta.success) fail('请填写方案名称、优化目标、市场及有效版本号。');
      const current = read(productId), ctx = context(productId);
      const planId = snapshot.origin === 'mcp' ? input.planId : undefined;
      const existing = planId ? current.plans.find(p => p.id === planId) : null;
      if (planId && (!existing || existing.status !== 'draft')) fail('只能更新当前 App 的待确认草稿。', 409);
      if (existing && !sameTarget(existing.target, snapshot.target)) fail('更新草稿时版本、App 信息和语言必须与原目标一致。', 409);
      const now = new Date().toISOString();
      const plan = {
        ...(existing || { id: randomUUID(), createdAt: now, status: 'draft', executions: [] }),
        ...(existing ? { updatedAt: now } : {}),
        ...(snapshot.origin === 'mcp' ? { origin: 'mcp' } : {}),
        ...(snapshot.isNew ? { isNew: true } : {}),
        title: meta.data.title, objective: meta.data.objective, market: meta.data.market, analysis: meta.data.analysis,
        target: snapshot.target, before: snapshot.before, fields: snapshot.fields,
        sources: { docs: ctx.docs.map(d => ({ id: d.id, title: d.title, updatedAt: d.updatedAt })) },
      };
      return { workspace: write(productId, { ...current, plans: [plan, ...current.plans.filter(p => p.id !== plan.id)] }, meta.data.expectedRevision), planId: plan.id, plan };
    },
    checkPlan(productId, planId, snapshot, fields) {
      const plan = read(productId).plans.find(p => p.id === planId);
      if (!plan || plan.status !== 'draft') fail('方案不存在或已执行，请另存新方案。', 409);
      if (!sameTarget(plan.target, snapshot) || JSON.stringify(plan.fields) !== JSON.stringify(fields) || JSON.stringify(plan.before) !== JSON.stringify(snapshot.fields)) fail('草稿或商店原文已变化，请重新读取并核对。', 409);
      return plan;
    },
    recordExecution(productId, planId, outcome, details) {
      if (!planId) return;
      const current = read(productId), plan = current.plans.find(p => p.id === planId);
      if (!plan) return;
      const at = new Date().toISOString();
      const next = { ...plan, status: outcome === 'success' ? 'applied' : 'unconfirmed', ...(outcome === 'success' ? { appliedAt: at } : {}), executions: [...plan.executions, { at, outcome, ...details }] };
      write(productId, { ...current, plans: current.plans.map(p => p.id === planId ? next : p) }, current.revision);
    },
    clearDrafts(productId) {
      const current = read(productId);
      const remainingPlans = current.plans.filter(p => p.status !== 'draft');
      const result = write(productId, { ...current, plans: remainingPlans }, current.revision);
      return { ok: true, workspace: result };
    },
  };
}
