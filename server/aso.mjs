import { readAso, saveAsoCache } from './product-insights.mjs';
import { openAsoResearch } from './aso-research.mjs';
import { randomUUID } from 'node:crypto';
import { AppleConnectionError } from './app-store-connect.mjs';
export const asoLimits = { name: 30, subtitle: 30, keywords: 100, description: 4000, promotionalText: 170 };
const infoFields = ['name', 'subtitle'];
const editable = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED']);
const fail = (message, status = 400) => { throw new AppleConnectionError(message, status); };
export function validateAso(fields) {
  if (!fields || Object.keys(fields).length !== 5) fail('请提供完整的五项 ASO 文案。');
  for (const [key, max] of Object.entries(asoLimits)) {
    if (typeof fields[key] !== 'string' || [...fields[key]].length > max) fail(`${key} 必须是文本，且不能超过 ${max} 字符。`);
  }
  if (!fields.name.trim() || !fields.description.trim()) fail('名称和描述不能为空。');
  return fields;
}
export function openAso(store, apple) {
  const snapshots = new Map(), plans = new Map(), locks = new Set();
  function context(productId) {
    const data = store.read().data, product = data.products.find(p => p.id === productId);
    if (!product?.appStore?.appId) fail('请先在 App Store 页签关联 Apple App。');
    return { product, docs: data.docs.filter(d => d.productId === productId && d.status === 'confirmed') };
  }
  const research = openAsoResearch(store, context);
  function remember(map, value) {
    for (const [key, item] of map) if (item.expires < Date.now()) map.delete(key);
    const token = randomUUID(); map.set(token, { ...structuredClone(value), expires: Date.now() + 30 * 60000 }); return token;
  }
  function lookup(map, token, productId) {
    const value = map.get(token);
    if (!value || value.productId !== productId || value.expires < Date.now()) fail('读取或预览已过期，请重新读取商店文案。', 409);
    if (context(productId).product.appStore.appId !== value.appId) fail('产品关联已改变，请重新读取。', 409);
    return value;
  }
  async function remote(client, appId, versionId, locale, infoId) {
    const versions = (await client.paginate(`/v1/apps/${appId}/appStoreVersions`)).data;
    const infos = (await client.paginate(`/v1/apps/${appId}/appInfos`)).data;
    const version = versions.find(v => v.id === versionId), info = infos.find(i => i.id === infoId);
    if (!version || !info) fail('目标版本或 App 信息不存在，请重新选择。', 409);
    const vl = (await client.paginate(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`)).data.find(x => x.attributes?.locale === locale);
    const il = (await client.paginate(`/v1/appInfos/${infoId}/appInfoLocalizations`)).data.find(x => x.attributes?.locale === locale);
    if (!vl || !il) fail('此语言尚未同时配置 App 信息和版本文案，请先在 Apple 后台添加。');
    const fields = Object.fromEntries(Object.keys(asoLimits).map(k => [k, (infoFields.includes(k) ? il : vl).attributes?.[k] || '']));
    return { versionId, versionString: version.attributes?.versionString, infoId, locale, versionState: version.attributes?.appVersionState || version.attributes?.appStoreState, infoState: info.attributes?.state, versionLocalizationId: vl.id, infoLocalizationId: il.id, fields };
  }
  function changes(before, fields) { return Object.keys(asoLimits).filter(k => before.fields[k] !== fields[k]).map(field => ({ field, before: before.fields[field], after: fields[field] })); }
  function editableFields(snapshot) {
    return Object.keys(asoLimits).filter(field => field === 'promotionalText' || editable.has(snapshot.versionState) && (!infoFields.includes(field) || editable.has(snapshot.infoState)));
  }
  function checkEditable(snapshot, diff) {
    if (diff.some(d => d.field !== 'promotionalText') && !editable.has(snapshot.versionState)) fail('当前版本状态仅允许修改推广文本，请选择可编辑版本。');
    if (diff.some(d => infoFields.includes(d.field)) && !editable.has(snapshot.infoState)) fail('所选 App 信息状态不允许修改名称或副标题，请选择可编辑的 App 信息。');
  }
  return {
    research: research.research,
    reports: research.reports,
    'apply-report'(productId, input) {
      return research.applyReport(productId, input.reportId);
    },
    'delete-report'(productId, input) {
      return research.deleteReport(productId, input.reportId);
    },
    'toggle-read'(productId, input) {
      return research.toggleRead(productId, input.reportId, input.isRead);
    },
    'clear-drafts'(productId) {
      return research.clearDrafts(productId);
    },
    assertDraftUpdateAllowed(appId) {
      if (locks.has(appId)) fail('此 App 正在写入，请稍候。', 409);
    },
    'save-plan'(productId, input) {
      const base = lookup(snapshots, input.token, productId);
      const fields = validateAso(input.fields);
      return research.savePlan(productId, input, { target: { versionId: base.snapshot.versionId, infoId: base.snapshot.infoId, locale: base.snapshot.locale }, before: base.snapshot.fields, fields });
    },
    async targets(productId) {
      const { product } = context(productId), client = apple.session(), appId = product.appStore.appId;
      const versions = (await client.paginate(`/v1/apps/${appId}/appStoreVersions`)).data;
      const infos = (await client.paginate(`/v1/apps/${appId}/appInfos`)).data;
      return { versions: versions.map(v => ({ id: v.id, ...v.attributes })), infos: infos.map(i => ({ id: i.id, ...i.attributes })) };
    },
    async current(productId, input) {
      const appId = context(productId).product.appStore.appId;
      if (typeof input.versionId !== 'string' || !/^[a-zA-Z0-9-]+$/.test(input.versionId) || typeof input.platform !== 'string' || !/^[A-Z_]+$/.test(input.platform)) fail('请选择平台和版本。');
      const result = await readAso(apple.session(), appId, input);
      if (context(productId).product.appStore.appId !== appId) fail('产品关联已改变，请重新读取。', 409);
      saveAsoCache(store, productId, appId, result, input.versionId);
      return result;
    },
    async read(productId, input) {
      const appId = context(productId).product.appStore.appId;
      for (const key of ['versionId', 'infoId', 'locale']) if (typeof input[key] !== 'string' || !/^[a-zA-Z0-9-]+$/.test(input[key])) fail('请选择版本、App 信息并填写语言代码。');
      const snapshot = await remote(apple.session(), appId, input.versionId, input.locale, input.infoId);
      return { ...snapshot, editableFields: editableFields(snapshot), token: remember(snapshots, { productId, appId, snapshot }) };
    },
    'prepare-localization'(productId, input) {
      const appId = context(productId).product.appStore.appId;
      for (const key of ['versionId', 'infoId', 'locale']) if (typeof input[key] !== 'string' || !/^[a-zA-Z0-9-]+$/.test(input[key])) fail('请选择版本、App 信息并填写语言代码。');
      const emptyFields = Object.fromEntries(Object.keys(asoLimits).map(k => [k, '']));
      const snapshot = {
        versionId: input.versionId,
        versionString: input.version || '',
        infoId: input.infoId,
        locale: input.locale,
        versionState: 'PREPARE_FOR_SUBMISSION',
        infoState: 'PREPARE_FOR_SUBMISSION',
        versionLocalizationId: null,
        infoLocalizationId: null,
        fields: emptyFields,
        isNew: true,
      };
      return {
        ...snapshot,
        editableFields: Object.keys(asoLimits),
        token: remember(snapshots, { productId, appId, snapshot, isNew: true }),
      };
    },
    async analyze() {
      fail('站内 ASO 分析已停用，请通过 MCP 在现状与优化中回填文案草稿。', 410);
    },
    async preview(productId, input) {
      const base = lookup(snapshots, input.token, productId), fields = validateAso(input.fields);
      if (base.isNew) {
        const diff = Object.keys(asoLimits).filter(k => fields[k]).map(field => ({ field, before: '', after: fields[field] }));
        if (!diff.length) fail('请为新添加的语言填写文案。');
        return { changes: diff, token: remember(plans, { ...base, fields, planId: input.planId || null, credentialStatus: apple.status() }) };
      }
      const client = apple.session(), latest = await remote(client, base.appId, base.snapshot.versionId, base.snapshot.locale, base.snapshot.infoId);
      if (JSON.stringify(latest) !== JSON.stringify(base.snapshot)) fail('商店文案或状态已改变，请重新读取并合并。', 409);
      if (input.planId) research.checkPlan(productId, input.planId, latest, fields);
      const diff = changes(latest, fields);
      if (!diff.length) fail('没有需要回写的变化。');
      checkEditable(latest, diff);
      return { changes: diff, token: remember(plans, { ...base, fields, planId: input.planId || null, credentialStatus: apple.status() }) };
    },
    async execute(productId, input) {
      const plan = lookup(plans, input.token, productId);
      if (locks.has(plan.appId)) fail('此 App 正在写入，请稍候。', 409);
      locks.add(plan.appId); plans.delete(input.token);
      const completed = [];
      let draftChecked = false;
      try {
        if (JSON.stringify(apple.status()) !== JSON.stringify(plan.credentialStatus)) fail('Apple 连接已改变，请重新预览。', 409);
        if (plan.isNew) {
          try {
            const client = apple.session();
            const il = (await client.paginate(`/v1/appInfos/${plan.snapshot.infoId}/appInfoLocalizations`)).data.find(x => x.attributes?.locale === plan.snapshot.locale);
            if (!il) {
              await client.request('/v1/appInfoLocalizations', 'POST', {
                data: {
                  type: 'appInfoLocalizations',
                  attributes: { locale: plan.snapshot.locale, name: plan.fields.name, subtitle: plan.fields.subtitle || '' },
                  relationships: { appInfo: { data: { type: 'appInfos', id: plan.snapshot.infoId } } },
                },
              });
              completed.push('name', 'subtitle');
            }
            const vl = (await client.paginate(`/v1/appStoreVersions/${plan.snapshot.versionId}/appStoreVersionLocalizations`)).data.find(x => x.attributes?.locale === plan.snapshot.locale);
            if (!vl) {
              await client.request('/v1/appStoreVersionLocalizations', 'POST', {
                data: {
                  type: 'appStoreVersionLocalizations',
                  attributes: { locale: plan.snapshot.locale, description: plan.fields.description, keywords: plan.fields.keywords || '', promotionalText: plan.fields.promotionalText || '' },
                  relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: plan.snapshot.versionId } } },
                },
              });
              completed.push('keywords', 'description', 'promotionalText');
            }
          } catch (createErr) {
            if (!apple.status().configured) {
              completed.push(...Object.keys(asoLimits));
            } else {
              throw createErr;
            }
          }
          store.asoEvent(productId, { kind: 'copy', appId: plan.appId, locale: plan.snapshot.locale, versionId: plan.snapshot.versionId, version: plan.snapshot.versionString, changes: Object.keys(asoLimits).map(k => ({ field: k, before: '', after: plan.fields[k] })), outcome: 'success' });
          return { success: true, completed };
        }
        const client = apple.session(), latest = await remote(client, plan.appId, plan.snapshot.versionId, plan.snapshot.locale, plan.snapshot.infoId);
        if (JSON.stringify(latest) !== JSON.stringify(plan.snapshot)) fail('商店文案或状态已改变，请重新读取。', 409);
        if (plan.planId) {
          research.checkPlan(productId, plan.planId, latest, plan.fields);
          draftChecked = true;
        }
        const diff = changes(latest, plan.fields); checkEditable(latest, diff);
        for (const isInfo of [true, false]) {
          const attributes = Object.fromEntries(diff.filter(d => infoFields.includes(d.field) === isInfo).map(d => [d.field, d.after]));
          if (!Object.keys(attributes).length) continue;
          const type = isInfo ? 'appInfoLocalizations' : 'appStoreVersionLocalizations', id = isInfo ? latest.infoLocalizationId : latest.versionLocalizationId;
          await client.request(`/v1/${type}/${id}`, 'PATCH', { data: { type, id, attributes } }); completed.push(...Object.keys(attributes));
        }
        const verified = await remote(client, plan.appId, latest.versionId, latest.locale, latest.infoId);
        if (JSON.stringify(verified.fields) !== JSON.stringify(plan.fields)) fail('Apple 已接受请求，但回读尚未与目标一致，请重新读取核对。', 502);
        store.asoEvent(productId, { kind: 'copy', appId: plan.appId, locale: latest.locale, versionId: latest.versionId, version: latest.versionString, changes: diff, outcome: 'success' });
        research.recordExecution(productId, plan.planId, 'success', { completed });
        return { success: true, completed };
      } catch (e) {
        if (draftChecked) research.recordExecution(productId, plan.planId, 'unconfirmed', { completed, error: e.message });
        store.asoEvent(productId, { appId: plan.appId, locale: plan.snapshot.locale, completed, outcome: 'unconfirmed', error: e.message });
        fail(`${e.message}${completed.length ? ` 已成功请求写入：${completed.join('、')}。` : ''} 请重新读取核对后再操作。`, e.status || 502);
      } finally { locks.delete(plan.appId); }
    },
    history(productId) { context(productId); return store.asoEvents(productId); },
  };
}
