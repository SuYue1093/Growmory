import React, { useEffect, useState } from 'react';
import type { Data, Product, Task } from './types';
import { requestInsights, type Insights } from './trends';
import type { AsoPlan } from './aso-types';
import { storeState } from './product-app-store';
import {
  Sparkles,
  Plus,
  Image as ImageIcon,
  Smartphone,
  Tablet,
  Monitor,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Upload,
  Check,
  AlertCircle,
} from 'lucide-react';
import { AsoReports } from './aso-reports';
import { AsoMediaWorkspace } from './aso-media-workspace';
import { AsoArtworkLab } from './aso-artwork-lab';
import { APP_STORE_LOCALES } from './release-publication';
import { useI18n, t as globalT } from './i18n.ts';

export function compareVersionsDesc(
  a: { version: string; createdDate?: string },
  b: { version: string; createdDate?: string }
): number {
  if (a.createdDate && b.createdDate) {
    const timeA = new Date(a.createdDate).getTime();
    const timeB = new Date(b.createdDate).getTime();
    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) {
      return timeB - timeA;
    }
  }
  const segsA = (a.version || '').split(/[-_+.]/).map(s => parseInt(s, 10));
  const segsB = (b.version || '').split(/[-_+.]/).map(s => parseInt(s, 10));
  const maxLen = Math.max(segsA.length, segsB.length);
  for (let i = 0; i < maxLen; i++) {
    const numA = isNaN(segsA[i]) ? 0 : segsA[i];
    const numB = isNaN(segsB[i]) ? 0 : segsB[i];
    if (numB !== numA) return numB - numA;
  }
  return (b.version || '').localeCompare(a.version || '');
}

type Fields = { name: string; subtitle: string; keywords: string; description: string; promotionalText: string };
const getLabels = (t = globalT): Record<keyof Fields, string> => ({
  name: t('名称', 'Name'),
  subtitle: t('副标题', 'Subtitle'),
  keywords: t('关键词', 'Keywords'),
  description: t('描述', 'Description'),
  promotionalText: t('推广文本', 'Promotional Text'),
});
const limits = { name: 30, subtitle: 30, keywords: 100, description: 4000, promotionalText: 170 };
type Change = { field: keyof Fields; before: string; after: string };
type Snapshot = { editableFields: (keyof Fields)[]; token: string; fields: Fields; versionState: string; infoState: string; isNew?: boolean };

function checkCopy(currentCopy: Fields, t = globalT) {
  const labels = getLabels(t);
  const checks: string[] = [];
  if (!currentCopy.name.trim()) checks.push(t('名称为空，请核对商店同步状态。', 'Name is empty. Check store sync status.'));
  if (!currentCopy.description.trim()) checks.push(t('描述为空，可补充产品价值与使用场景。', 'Description is empty. Add product value and use cases.'));
  if (!currentCopy.subtitle.trim()) checks.push(t('副标题为空，可补充核心场景或差异点。', 'Subtitle is empty. Add core use case or key differentiator.'));
  if (!currentCopy.keywords.trim()) checks.push(t('关键词字段为空，可先建立候选词池。', 'Keywords are empty. Build a candidate keyword pool first.'));
  const words = currentCopy.keywords.split(/[,，]+/).map(tWord => tWord.trim().toLowerCase()).filter(Boolean);
  if (new Set(words).size !== words.length) checks.push(t('关键词字段有重复词，建议核对占用。', 'Duplicate words found in keywords. Verify character quota.'));
  const repeated = [...new Set(words.filter(w => (currentCopy.name + currentCopy.subtitle).toLowerCase().includes(w)))];
  if (repeated.length) checks.push(t('以下关键词已出现在名称或副标题，可检查重复占用：', 'Keywords already appearing in name or subtitle: ') + repeated.join('、'));
  for (const k of Object.keys(limits) as (keyof Fields)[]) if ([...currentCopy[k]].length > limits[k]) checks.push(`${labels[k]}${t('超出当前字段长度限制。', ' exceeds field length limit.')}`);
  return checks;
}

export function Aso({
  product,
  products = [],
  assetLibrary,
  notify,
  tasks = [],
  onSaveTask,
  onDeleteTask,
  onNavigateTasks,
}: {
  product: Product;
  products?: Product[];
  assetLibrary?: Pick<Data, 'assets' | 'assetFolders' | 'releases'>;
  notify?: (msg: string) => void;
  tasks?: Task[];
  onSaveTask?: (task: Task) => Promise<void> | void;
  onDeleteTask?: (id: string) => Promise<void> | void;
  onNavigateTasks?: () => void;
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<'copy' | 'media' | 'analysis' | 'artwork'>('copy');

  return (
    <div className="aso-workspace">
      <div className="tabs" aria-label={t("ASO 工作区", "ASO Workspace")}>
        <button
          type="button"
          className={activeTab === 'copy' ? 'active' : ''}
          onClick={() => setActiveTab('copy')}
        >
          {t("ASO文案", "ASO Copy")}
        </button>
        <button
          type="button"
          className={activeTab === 'media' ? 'active' : ''}
          onClick={() => setActiveTab('media')}
        >
          {t("ASO图片", "ASO Media")}
        </button>
        <button type="button" className={activeTab === 'analysis' ? 'active' : ''} onClick={() => setActiveTab('analysis')}>
          {t('ASO 分析与优化', 'ASO Analysis and Optimization')}
        </button>
        <button type="button" className={activeTab === 'artwork' ? 'active' : ''} onClick={() => setActiveTab('artwork')}>
          {t('ASO 图片实验室', 'ASO Artwork Lab')}
        </button>
      </div>

      {activeTab === 'copy' ? (
        <AsoEditor product={product} notify={notify} />
      ) : activeTab === 'media' ? (
        <AsoMediaTab key={product.id} product={product} notify={notify} />
      ) : activeTab === 'artwork' ? (
        <AsoArtworkLab key={product.id} product={product} products={products} assetLibrary={assetLibrary} notify={notify} />
      ) : (
        <AsoReports
          key={product.id}
          product={product}
          products={products.length ? products : [product]}
          notify={notify}
          tasks={tasks}
          onSaveTask={onSaveTask}
          onDeleteTask={onDeleteTask}
          onNavigateTasks={onNavigateTasks}
          onSelectTab={setActiveTab}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------
// Tab 1: ASO文案（支持编辑模式下新增本地化）
// ------------------------------------------------------------------------------------------------
function AsoEditor({ product, notify }: { product: Product; notify?: (msg: string) => void }) {
  const { t } = useI18n();
  const labels = getLabels(t);
  const [saved, setSaved] = useState<Insights | null>(null);
  const [loadedTargets, setVersionTargets] = useState<{ platform: string; versionId: string; version: string; createdDate?: string }[] | null>(null);
  const versionTargets = loadedTargets || [];
  const [platform, setPlatform] = useState(''), [savedVersion, setSavedVersion] = useState('');
  const [loadedDrafts, setLoadedDrafts] = useState<AsoPlan[]>([]);
  const [draftConflicts, setDraftConflicts] = useState<{
    locale: string;
    diffFields: (keyof Fields)[];
    plan: AsoPlan;
  }[]>([]);
  const [readAt, setReadAt] = useState('');
  const [rows, setRows] = useState<Insights['aso']['localizations'] | null>(null);
  const [tableDraft, setTableDraft] = useState<Insights['aso']['localizations'] | null>(null);
  const [tableSnapshots, setTableSnapshots] = useState<Snapshot[]>([]);
  const [showAddLocaleModal, setShowAddLocaleModal] = useState(false);
  const [selectedLocaleToAdd, setSelectedLocaleToAdd] = useState('');

  const displayedRows = tableDraft || rows;
  const tableInvalid = tableDraft?.some(l => !l.fields.name.trim() || !l.fields.description.trim() || (Object.keys(labels) as (keyof Fields)[]).some(k => [...l.fields[k]].length > limits[k]));
  const tableChanged = tableDraft?.some((l, i) => JSON.stringify(l.fields) !== JSON.stringify(rows?.[i]?.fields));
  const hasLocalDraft = Boolean(tableChanged || (loadedDrafts && loadedDrafts.length > 0));

  useEffect(() => {
    const key = `growmory:draft:aso:${product.id}`;
    if (tableChanged && tableDraft) {
      try { sessionStorage.setItem(key, "1"); } catch { }
    } else {
      try { sessionStorage.removeItem(key); } catch { }
    }
  }, [tableChanged, tableDraft, product.id]);

  const platforms = [...new Set(versionTargets.map(target => target.platform))];
  const versions = versionTargets.filter(target => target.platform === platform);

  useEffect(() => {
    if (!product.appStore?.appId) return;
    let active = true;
    void Promise.allSettled([
      requestInsights(product.id),
      api('targets') as Promise<{ versions: { id: string; platform: string; versionString: string; createdDate?: string; appVersionState?: string; appStoreState?: string }[] }>,
    ]).then(([cached, live]) => {
      if (!active) return;
      const previous = cached.status === 'fulfilled' ? cached.value : null;
      setSaved(previous);
      const targets = (live.status === 'fulfilled'
        ? live.value.versions
          .filter(v => (v.appVersionState || v.appStoreState) !== 'REPLACED_WITH_NEW_VERSION')
          .map(v => ({ platform: v.platform, versionId: v.id, version: v.versionString, createdDate: v.createdDate }))
        : previous?.aso.localizations || [])
        .filter((v, i, all) => all.findIndex(item => item.versionId === v.versionId) === i);
      const firstPlatform = targets[0]?.platform || '';
      targets.sort(compareVersionsDesc);
      setVersionTargets(targets);
      setPlatform(firstPlatform);
      setSavedVersion(targets.find(v => v.platform === firstPlatform)?.versionId || '');
      setRows(null);
      setReadAt('');
      if (live.status === 'rejected') setError(live.reason.message);
    });
    return () => { active = false; };
  }, [product.id, product.appStore?.appId, product.appStore?.syncedAt]);

  useEffect(() => {
    if (versions.length > 0 && (!savedVersion || !versions.some(v => v.versionId === savedVersion))) {
      setSavedVersion(versions[0].versionId);
    }
  }, [versions, savedVersion]);

  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [history, setHistory] = useState<{ at: string; locale: string; outcome: string; error?: string; changes?: Change[]; completed?: string[] }[]>([]);

  useEffect(() => {
    if (!product.appStore?.appId) return;
    let active = true;
    api('history').then(nextHistory => {
      if (active) setHistory(nextHistory);
    }).catch(e => {
      if (active) setError(e.message);
    });
    return () => { active = false; };
  }, [product.id, product.appStore?.appId]);

  async function api(action: string, input = {}) {
    const response = await fetch(`/api/app-store-connect/aso/${encodeURIComponent(product.id)}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || '操作失败');
    return result;
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label); setError(''); setMessage('');
    try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); }
  }

  async function readCurrent() {
    setRows(null); setReadAt('');
    setTableDraft(null); setTableSnapshots([]); setLoadedDrafts([]); setDraftConflicts([]);
    const result: Insights['aso'] = await api('current', { platform, versionId: savedVersion });
    setReadAt(result.syncedAt || '');
    if (!result.localizations.length) {
      setRows([]);
      setMessage(t('此版本暂无多语言商店文案。', 'No localized copy found for this version.'));
      return;
    }
    setRows(result.localizations);
    await editTable(result.localizations);
  }

  async function editTable(sourceRowsParam?: Insights['aso']['localizations']) {
    const sourceRows = sourceRowsParam || rows;
    if (!sourceRows || !sourceRows.length) return;
    const workspace = await api('research');
    const plans: AsoPlan[] = workspace.plans.filter((p: AsoPlan) => p.origin === 'mcp' && p.status === 'draft');
    const latest: Snapshot[] = await Promise.all(sourceRows.map(l => api('read', { versionId: l.versionId, infoId: l.infoId, locale: l.locale })));
    const fresh = sourceRows.map((l, i) => ({ ...l, fields: latest[i].fields }));
    for (const snapshot of latest) {
      if (Array.isArray(snapshot.editableFields)) continue;
      if (!snapshot.versionState || !snapshot.infoState) throw Error(t('商店未返回版本或 App 信息状态，无法判断编辑权限，请重新读取。', 'Store did not return version or app info state.'));
      const editable = new Set(['PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW', 'REJECTED', 'DEVELOPER_REJECTED', 'METADATA_REJECTED']);
      snapshot.editableFields = (Object.keys(labels) as (keyof Fields)[]).filter(k => k === 'promotionalText' || editable.has(snapshot.versionState) && (!['name', 'subtitle'].includes(k) || editable.has(snapshot.infoState)));
    }
    const draft = structuredClone(fresh);
    const applied: AsoPlan[] = [];
    const conflicts: { locale: string; diffFields: (keyof Fields)[]; plan: AsoPlan }[] = [];
    for (const [index, row] of fresh.entries()) {
      const plan = plans.find(p => p.target.versionId === row.versionId && p.target.infoId === row.infoId && p.target.locale === row.locale);
      if (!plan) continue;
      const diffFields = (Object.keys(labels) as (keyof Fields)[]).filter(k => latest[index].fields[k] !== plan.before[k]);
      if (diffFields.length > 0) {
        conflicts.push({ locale: row.locale, diffFields, plan });
        continue;
      }
      const blocked = (Object.keys(labels) as (keyof Fields)[]).filter(k => plan.fields[k] !== plan.before[k] && !(latest[index].editableFields || []).includes(k));
      if (blocked.length > 0) {
        conflicts.push({ locale: row.locale, diffFields: blocked, plan });
        continue;
      }
      draft[index].fields = structuredClone(plan.fields);
      applied.push(plan);
    }

    setDraftConflicts(conflicts);
    setLoadedDrafts(applied);
    setRows(fresh);
    setTableDraft(draft);
    setTableSnapshots(latest);
  }

  // 新增本地化语言逻辑
  async function addLocalization(localeCode: string) {
    if (!localeCode) return;
    if (displayedRows?.some(r => r.locale === localeCode)) {
      setError(t('该语言本地化已存在', 'Locale already exists in table'));
      return;
    }
    try {
      setBusy(t('正在添加本地化…', 'Adding localization...'));
      const currentInfoId = rows?.[0]?.infoId || (saved?.aso.localizations[0]?.infoId ?? '');
      const currentVersionString = versions.find(v => v.versionId === savedVersion)?.version || '';
      
      const preparedSnapshot: Snapshot = await api('prepare-localization', {
        versionId: savedVersion,
        infoId: currentInfoId,
        locale: localeCode,
        version: currentVersionString,
      });

      // 检查是否有由外部 Agent 或 MCP 保存的该语言草稿方案
      let draftPlan: AsoPlan | undefined;
      try {
        const workspace = await api('research');
        draftPlan = (workspace.plans || []).find((p: AsoPlan) =>
          p.origin === 'mcp' &&
          p.status === 'draft' &&
          p.target.locale === localeCode &&
          (!p.target.versionId || p.target.versionId === savedVersion)
        );
      } catch { }

      const newRow = {
        locale: localeCode,
        versionId: savedVersion,
        infoId: currentInfoId,
        version: currentVersionString,
        platform,
        fields: {
          name: draftPlan?.fields?.name || '',
          subtitle: draftPlan?.fields?.subtitle || '',
          keywords: draftPlan?.fields?.keywords || '',
          description: draftPlan?.fields?.description || '',
          promotionalText: draftPlan?.fields?.promotionalText || '',
        },
      };

      const emptyRow = {
        ...newRow,
        fields: {
          name: '',
          subtitle: '',
          keywords: '',
          description: '',
          promotionalText: '',
        },
      };

      if (draftPlan) {
        setLoadedDrafts(prev => [...prev, draftPlan]);
      }

      setRows(curr => (curr ? [...curr, emptyRow] : [emptyRow]));
      setTableDraft(curr => (curr ? [...curr, newRow] : [newRow]));
      setTableSnapshots(curr => [...curr, preparedSnapshot]);
      setShowAddLocaleModal(false);
      setSelectedLocaleToAdd('');
      if (notify) notify(t('已添加本地化语言：', 'Added localized language: ') + (APP_STORE_LOCALES[localeCode] || localeCode));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  function removeDraftLocalization(index: number) {
    setTableDraft(curr => curr ? curr.filter((_, i) => i !== index) : null);
    setRows(curr => curr ? curr.filter((_, i) => i !== index) : null);
    setTableSnapshots(curr => curr.filter((_, i) => i !== index));
  }

  async function submitTable() {
    if (!tableDraft || !rows) return;
    const changed = tableDraft.map((l, i) => ({ row: l, index: i })).filter(({ row, index }) => JSON.stringify(row.fields) !== JSON.stringify(rows[index]?.fields));
    const prepared = [];
    for (const item of changed) {
      const plan = loadedDrafts.find(p => p.target.versionId === item.row.versionId && p.target.infoId === item.row.infoId && p.target.locale === item.row.locale && (Object.keys(labels) as (keyof Fields)[]).every(k => item.row.fields[k] === p.fields[k]));
      prepared.push({ ...item, preview: await api('preview', { token: tableSnapshots[item.index].token, fields: item.row.fields, ...(plan ? { planId: plan.id } : {}) }) });
    }
    const completed: string[] = [];
    try {
      for (const item of prepared) {
        await api('execute', { token: item.preview.token });
        completed.push(item.row.locale);
        setRows(current => current?.map((l, i) => i === item.index ? structuredClone(item.row) : l) || null);
        setSaved(current => current ? { ...current, aso: { ...current.aso, localizations: current.aso.localizations.map(l => l.versionId === item.row.versionId && l.infoId === item.row.infoId && l.locale === item.row.locale ? structuredClone(item.row) : l) } } : current);
      }
      try {
        await api('clear-drafts');
      } catch { }
      setTableDraft(null); setTableSnapshots([]); setLoadedDrafts([]); setDraftConflicts([]);
      try { sessionStorage.removeItem(`growmory:draft:aso:${product.id}`); } catch { }
      setMessage('已提交至商店并回读验证：' + completed.join('、') + '。未提交审核或发布版本。');
      window.dispatchEvent(new Event('focus'));
    } catch (e) {
      throw Error((e as Error).message + (completed.length ? ' 已完成并验证的语言：' + completed.join('、') + '。' : '') + ' 编辑内容已保留；如需重试，请取消后重新进入编辑以核对商店最新状态。');
    } finally { setHistory(await api('history')); }
  }

  async function resetAndClearDrafts() {
    if (!window.confirm(t('确定要重置并移除所有 ASO 草稿方案吗？未提交的修改将丢失。', 'Are you sure you want to reset and remove all ASO draft proposals? Unsubmitted changes will be lost.'))) {
      return;
    }
    try {
      await api('clear-drafts');
    } catch { }
    if (rows) {
      setTableDraft(structuredClone(rows));
    } else {
      setTableDraft(null);
      setTableSnapshots([]);
    }
    setLoadedDrafts([]);
    setDraftConflicts([]);
    setError('');
    setMessage(t('已重置并清除全部草稿方案。', 'All drafts have been reset and removed.'));
    try {
      sessionStorage.removeItem(`growmory:draft:aso:${product.id}`);
    } catch { }
    window.dispatchEvent(new Event('focus'));
    if (notify) notify(t('已重置并清除草稿', 'Drafts have been reset and removed'));
  }

  const availableLocalesToAdd = Object.entries(APP_STORE_LOCALES).filter(([code]) => !displayedRows?.some(r => r.locale === code));

  return (
    <section className="panel padded store-panel">
      <h2>{t('ASO文案', 'ASO Copy')}</h2>

      {!product.appStore ? (
        <p>{t('请先在工作区设置的商店连接中导入并关联 Apple App，并在设置中配置 Apple 凭据。', 'Please connect your Apple App and credentials in Workspace Settings first.')}</p>
      ) : (
        <>
          <section className="store-preview" id={`aso-current-${product.id}`}>
            <h3>{t('ASO信息', 'Current Status')}</h3>
            {versionTargets.length ? (
              <>
                <div className="publication-target">
                  <label className="field">
                    <span>{t('平台', 'Platform')}</span>
                    <select
                      aria-label={t("现状平台", "Platform")}
                      disabled={!!busy}
                      value={platform}
                      onChange={e => {
                        const value = e.target.value;
                        setPlatform(value);
                        setSavedVersion(versionTargets.find(v => v.platform === value)?.versionId || '');
                        setRows(null);
                        setTableDraft(null);
                        setTableSnapshots([]);
                        setLoadedDrafts([]);
                        setDraftConflicts([]);
                        setReadAt('');
                      }}
                    >
                      {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t('版本', 'Version')}</span>
                    <select
                      aria-label={t("现状版本", "Version")}
                      disabled={!!busy}
                      value={savedVersion}
                      onChange={e => {
                        setSavedVersion(e.target.value);
                        setRows(null);
                        setTableDraft(null);
                        setTableSnapshots([]);
                        setLoadedDrafts([]);
                        setDraftConflicts([]);
                        setReadAt('');
                      }}
                    >
                      {versions.map(v => <option key={v.versionId} value={v.versionId}>{v.version}</option>)}
                    </select>
                  </label>
                  <button
                    className="button primary"
                    disabled={!platform || !savedVersion || !!busy}
                    onClick={() => void run('实时读取商店文案', readCurrent)}
                  >
                    {t('读取', 'Fetch')}
                  </button>
                </div>

                {busy === '实时读取商店文案' && (
                  <p role="status">{t('正在从 Apple 实时读取所选版本的全部语言文案…', 'Reading all localized copy from Apple in real time...')}</p>
                )}
                {readAt && (
                  <p className="fine-print">{t('本表格实时读取于 ', 'Fetched at ')}{new Date(readAt).toLocaleString()}</p>
                )}

                {rows && (
                  <div className="asc-actions" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, margin: '14px 0' }}>
                    {tableDraft ? (
                      <>
                        <button
                          className="button primary"
                          disabled={!!busy || !!tableInvalid || !tableChanged}
                          onClick={() => void run('提交至商店', submitTable)}
                        >
                          {t('提交至商店', 'Submit to Store')}
                        </button>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() => {
                            setTableDraft(null);
                            setTableSnapshots([]);
                            setLoadedDrafts([]);
                            setDraftConflicts([]);
                            setError('');
                            try { sessionStorage.removeItem(`growmory:draft:aso:${product.id}`); } catch { }
                          }}
                        >
                          {t('取消', 'Cancel')}
                        </button>
                        <span className="fine-print" style={{ marginLeft: 8 }}>
                          {t('提交后更新商店文案，不会提交审核或发布版本。', 'Updates store copy upon submission; does not submit for review or release.')}
                        </span>

                        {/* 添加本地化、重置并移除草稿 移动至最右侧 */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            type="button"
                            className="button secondary"
                            disabled={!!busy}
                            onClick={() => {
                              const firstAvailable = availableLocalesToAdd[0]?.[0] || '';
                              setSelectedLocaleToAdd(firstAvailable);
                              setShowAddLocaleModal(true);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Plus size={14} /> {t('添加本地化', 'Add Localization')}
                          </button>
                          <button
                            type="button"
                            className="button secondary danger"
                            disabled={!!busy || !hasLocalDraft}
                            onClick={() => void run('重置并移除草稿', resetAndClearDrafts)}
                          >
                            {t('重置并移除草稿', 'Reset & Remove Drafts')}
                          </button>
                        </div>

                        {tableInvalid && (
                          <div style={{ width: '100%', marginTop: 4 }}>
                            <span role="alert" style={{ color: '#dc2626', fontSize: 13 }}>
                              {t('请补全名称和描述，并将各字段缩短至字符上限内。', 'Please fill in name and description, and keep within character limits.')}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="button secondary"
                          disabled={!!busy}
                          onClick={() => void run('读取最新文案并进入编辑', () => editTable())}
                        >
                          {t('编辑', 'Edit')}
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* 操作状态、成功与错误提示（直接展示在编辑/提交按钮正下方） */}
                {busy && busy !== '实时读取商店文案' && (
                  <div role="status" style={{ margin: '8px 0', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1d4ed8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="spinning">⏳</span>
                    <span>{busy === '读取最新文案并进入编辑' ? t('正在读取最新文案并核对编辑权限…', 'Reading latest copy and verifying edit permissions...') : `${t('正在', 'Processing ')}${busy}…`}</span>
                  </div>
                )}

                {error && (
                  <div role="alert" style={{ margin: '10px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{error}</span>
                  </div>
                )}

                {message && (
                  <div role="status" style={{ margin: '10px 0', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#15803d', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{message}</span>
                  </div>
                )}

                {/* 添加本地化弹窗/内联卡片 */}
                {showAddLocaleModal && (
                  <div className="add-locale-modal" style={{ margin: '12px 0', padding: 14, background: '#ffffff', border: '2px solid #2563eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <strong style={{ fontSize: 14, color: '#1e293b' }}>{t('选择要添加的语言', 'Select language to add')}</strong>
                      <button
                        type="button"
                        className="button small secondary"
                        onClick={() => setShowAddLocaleModal(false)}
                      >
                        ✕
                      </button>
                    </div>
                    {availableLocalesToAdd.length > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <select
                          aria-label={t("选择语言", "Select Locale")}
                          value={selectedLocaleToAdd}
                          onChange={e => setSelectedLocaleToAdd(e.target.value)}
                          style={{ minWidth: 260, padding: '6px 10px', fontSize: 14, borderRadius: 6, border: '1px solid #cbd5e1' }}
                        >
                          {availableLocalesToAdd.map(([code, name]) => (
                            <option key={code} value={code}>
                              {name} ({code})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="button primary small"
                          disabled={!selectedLocaleToAdd || !!busy}
                          onClick={() => void addLocalization(selectedLocaleToAdd)}
                        >
                          {t('确认添加', 'Confirm Add')}
                        </button>
                      </div>
                    ) : (
                      <p className="fine-print">{t('当前版本已添加所有支持的语言本地化。', 'All supported localizations are already added to this version.')}</p>
                    )}
                  </div>
                )}

                {/* 操作状态、成功与错误提示（直接展示在编辑/提交按钮正下方） */}
                {busy && busy !== '实时读取商店文案' && (
                  <div role="status" style={{ margin: '8px 0', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1d4ed8', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="spinning">⏳</span>
                    <span>{busy === '读取最新文案并进入编辑' ? t('正在读取最新文案并核对编辑权限…', 'Reading latest copy and verifying edit permissions...') : `${t('正在', 'Processing ')}${busy}…`}</span>
                  </div>
                )}

                {error && (
                  <div role="alert" style={{ margin: '10px 0', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <AlertCircle size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{error}</span>
                  </div>
                )}

                {message && (
                  <div role="status" style={{ margin: '10px 0', padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, color: '#15803d', fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Check size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <span style={{ lineHeight: 1.5, wordBreak: 'break-word' }}>{message}</span>
                  </div>
                )}

                {busy === '读取最新文案并进入编辑' && (
                  <p className="aso-edit-loading" role="status">{t('正在读取最新文案并核对编辑权限…', 'Reading latest copy and verifying edit permissions...')}</p>
                )}
                {draftConflicts.length > 0 && tableDraft && (
                  <div className="aso-draft-conflict-notice" role="status" style={{
                    margin: '10px 0',
                    padding: '12px 14px',
                    background: '#fffbeb',
                    border: '1px solid #fef3c7',
                    borderRadius: 8,
                    fontSize: 13,
                    color: '#92400e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flex: '1 1 300px' }}>
                      <AlertCircle size={18} style={{ color: '#d97706', marginTop: 2, flexShrink: 0 }} />
                      <div style={{ lineHeight: 1.5 }}>
                        {draftConflicts.map(c => (
                          <div key={c.locale}>
                            <strong>{APP_STORE_LOCALES[c.locale] || c.locale}</strong>：
                            {t('商店原文已变化，回填草稿未直接覆盖（已安全保留最新商店原文）。', 'Store original text changed; draft was not auto-applied (retained latest store text).')}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="button small secondary danger"
                        onClick={() => void run('移除本地草稿', resetAndClearDrafts)}
                        style={{ fontSize: 12 }}
                      >
                        {t('移除本地草稿', 'Remove Local Drafts')}
                      </button>
                    </div>
                  </div>
                )}
                {loadedDrafts.length > 0 && (
                  <p className="aso-draft-review" role="status">
                    {t('已读取保存的 MCP 回填：', 'Loaded saved MCP drafts: ')}{loadedDrafts.map(p => p.target.locale).join('、')}
                    {t('。高亮字段为修改内容，请逐项确认后点击“提交至商店”。取消不会删除已保存的回填。', '. Highlighted fields are modifications; verify before clicking "Submit to Store".')}
                  </p>
                )}
                {tableDraft && (
                  <div className="aso-edit-status" role="status">
                    {tableDraft.map((l, i) => (
                      <p key={l.locale}>
                        <strong>{APP_STORE_LOCALES[l.locale] ? `${APP_STORE_LOCALES[l.locale]} (${l.locale})` : l.locale}</strong>：
                        {t('版本', 'Version')} {storeState(tableSnapshots[i]?.versionState || 'PREPARE_FOR_SUBMISSION', t)}，
                        {t('App 信息', 'App Info')} {storeState(tableSnapshots[i]?.infoState || 'PREPARE_FOR_SUBMISSION', t)}。
                        {t('可编辑：', 'Editable: ')}{tableSnapshots[i]?.editableFields?.map(k => labels[k]).join('、') || t('全部', 'All')}。
                        {tableSnapshots[i]?.isNew && <span style={{ color: '#2563eb', marginLeft: 6 }}>[{t('新增本地化', 'New Localization')}]</span>}
                      </p>
                    ))}
                  </div>
                )}

                {displayedRows ? (
                  <div className="aso-table-scroll" tabIndex={0} role="region" aria-label={t("多语言 ASO 现状", "Localized ASO Status")}>
                    <table className="aso-status-table">
                      <caption>{platform} · {versions.find(v => v.versionId === savedVersion)?.version} · {displayedRows.length} {t('种语言', 'locales')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t('字段 / 语言', 'Field / Locale')}</th>
                          {displayedRows.map((l, idx) => (
                            <th scope="col" key={l.locale}>
                              <div>{APP_STORE_LOCALES[l.locale] || l.locale}</div>
                              <small style={{ color: '#64748b', fontWeight: 'normal' }}>{l.locale}</small>
                              {tableDraft && tableSnapshots[idx]?.isNew && (
                                <button
                                  type="button"
                                  onClick={() => removeDraftLocalization(idx)}
                                  className="button small secondary"
                                  style={{ marginTop: 4, padding: '2px 6px', fontSize: 11, color: '#dc2626' }}
                                  title={t('移除该本地化', 'Remove localization')}
                                >
                                  {t('移除', 'Remove')}
                                </button>
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(Object.keys(labels) as (keyof Fields)[]).map(k => (
                          <tr key={k}>
                            <th scope="row">
                              {labels[k]}
                              <small>{t('上限 ', 'Max ')}{limits[k]}{t(' 字符', ' chars')}</small>
                            </th>
                            {displayedRows.map((l, index) => (
                              <td key={l.locale} className={tableDraft && l.fields[k] !== rows?.[index]?.fields?.[k] ? 'aso-draft-changed' : undefined}>
                                {tableDraft && (
                                  <div className="aso-draft-before">
                                    <strong>{t('商店原文', 'Store Original')}</strong>
                                    <div className="aso-cell-copy">{rows?.[index]?.fields?.[k] || t('（空）', '(empty)')}</div>
                                    <strong>{l.fields[k] !== rows?.[index]?.fields?.[k] ? t('编辑内容 · 已修改', 'Draft · Modified') : t('编辑内容', 'Draft')}</strong>
                                  </div>
                                )}
                                {tableDraft ? (
                                  <textarea
                                    className="aso-cell-input"
                                    aria-label={`${l.locale} ${labels[k]}`}
                                    rows={k === 'description' ? 10 : 3}
                                    disabled={!!busy || !(tableSnapshots[index]?.editableFields || []).includes(k)}
                                    value={l.fields[k]}
                                    onChange={e => setTableDraft(current => current?.map(row => row.locale === l.locale ? { ...row, fields: { ...row.fields, [k]: e.target.value } } : row) || null)}
                                  />
                                ) : (
                                  <div className="aso-cell-copy">{l.fields[k] || t('（空）', '(empty)')}</div>
                                )}
                                <small>{[...l.fields[k]].length} / {limits[k]}</small>
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <th scope="row">{t('检查建议', 'Recommendations')}</th>
                          {displayedRows.map(l => {
                            const checks = checkCopy(l.fields, t);
                            return (
                              <td key={l.locale} className={checks.length ? 'aso-check-highlight' : undefined}>
                                {checks.length ? (
                                  <ul>{checks.map(c => <li key={c}>{c}</li>)}</ul>
                                ) : (
                                  <p>{t('未发现缺失字段、重复关键词或长度问题。表达与功能一致性仍需结合知识库核对。', 'No missing fields, duplicates, or length issues detected.')}</p>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="fine-print">{t('选择平台和版本后，点击「读取」查看全部语言的文案与检查建议。', 'Select platform and version, then click Fetch to inspect copy and recommendations.')}</p>
                )}
              </>
            ) : (
              <p role={error ? 'alert' : 'status'}>{error || (loadedTargets === null
                ? t('正在读取商店平台和版本…', 'Loading App Store platforms and versions…')
                : t('未找到可选的商店版本。', 'No App Store versions available.'))}</p>
            )}
            {saved?.aso.status !== 'ready' && saved?.aso.message && saved.aso.localizations.length > 0 && (
              <p role="status">{saved.aso.message}{t('，当前保留上次成功文案。', ', retaining last successful copy.')}</p>
            )}
          </section>

          <h3>{t('最近回写记录', 'Recent Writeback History')}</h3>
          {history.length === 0 && <p className="fine-print">{t('暂无回写记录。', 'No writeback history yet.')}</p>}
          {history.map((h, i) => (
            <details key={i}>
              <summary>{new Date(h.at).toLocaleString()} · {h.locale} · {h.outcome === 'success' ? t('回写并核对成功', 'Writeback verified successfully') : t('需重新读取核对', 'Needs re-verification')}</summary>
              {h.error && <p>{h.error}</p>}
              {h.completed && <p>{t('已成功请求的字段：', 'Successfully updated fields: ')}{h.completed.join('、') || t('无', 'None')}</p>}
              {h.changes?.map(c => (
                <div key={c.field}>
                  <b>{labels[c.field]}</b>
                  <div className="aso-row">
                    <pre className="store-note">{c.before}</pre>
                    <pre className="store-note">{c.after}</pre>
                  </div>
                </div>
              ))}
            </details>
          ))}
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------
// Tab 2: ASO图片管理组件 (AsoMediaManager)
// ------------------------------------------------------------------------------------------------
export type AsoScreenshot = {
  id: string;
  url: string;
  caption?: string;
  subcaption?: string;
  order: number;
  deviceType?: string;
};

export type AsoMediaData = {
  productId: string;
  updatedAt: string;
  searchResult: {
    iconUrl?: string;
    title?: string;
    subtitle?: string;
    rating?: number;
    ratingsCount?: number;
    screenshots: string[];
    displayMode?: 'portrait' | 'landscape';
    landscapeScreenshot?: string;
    landscapeCaption?: string;
    creativeUrl?: string;
  };
  headerBanner: {
    url: string;
    title: string;
    description: string;
    aspectRatio?: string;
    recommendedSize?: string;
    source?: string;
  };
  platformScreenshots: {
    iphone: AsoScreenshot[];
    ipad: AsoScreenshot[];
    mac?: AsoScreenshot[];
  };
  aiDiagnosis?: {
    analyzedAt: string;
    overallScore: number;
    summary: string;
    dimensions: {
      cvr: { score: number; title: string; findings: string[]; suggestions: string[] };
      visuals: { score: number; title: string; findings: string[]; suggestions: string[] };
      typography: { score: number; title: string; findings: string[]; suggestions: string[] };
      contentAlignment: { score: number; title: string; findings: string[]; suggestions: string[] };
    };
    actionItems: { priority: 'high' | 'medium' | 'low'; title: string; description: string }[];
  } | null;
};

type StoreCreativePreview = { url: string; group: string; video: boolean };
type StoreCreativePlacements = {
  version: string;
  locale: string;
  search: StoreCreativePreview[];
  header: StoreCreativePreview[];
};

function AsoMediaTab({ product, notify }: { product: Product; notify?: (message: string) => void }) {
  return product.appStore?.appId
    ? <AsoMediaWorkspace product={product} notify={notify} />
    : <AsoMediaManager product={product} notify={notify} />;
}

export function AsoMediaManager({ product, notify }: { product: Product; notify?: (msg: string) => void }) {
  const { t } = useI18n();
  const [media, setMedia] = useState<AsoMediaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [platformTab, setPlatformTab] = useState<'iphone' | 'ipad' | 'mac'>('iphone');
  const [editBannerModal, setEditBannerModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState({ url: '', title: '', description: '' });
  const [placements, setPlacements] = useState<StoreCreativePlacements | null>(null);
  const [previewSource, setPreviewSource] = useState<"draft" | "store">("draft");

  // 加载图片数据
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/aso/media/${encodeURIComponent(product.id)}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        return data;
      })
      .then(data => {
        if (active) {
          setMedia(data);
          setLoading(false);
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [product.id]);

  // 保存图片更改
  async function saveMediaChanges(customMedia?: AsoMediaData) {
    const payload = customMedia || media;
    if (!payload) return;
    setBusy(t('正在保存图片配置…', 'Saving media configuration...'));
    setError('');
    try {
      const res = await fetch(`/api/aso/media/${encodeURIComponent(product.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.error || '保存失败');
      setMedia(updated);
      if (notify) notify(t('ASO 图片配置保存成功', 'ASO Media configuration saved'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  // 站内直接触发智能诊断 (AI / MCP 服务)
  async function triggerDiagnosis() {
    setBusy(t('正在分析已保存的 ASO 图片配置…', 'Analyzing saved ASO media…'));
    setError('');
    try {
      const res = await fetch(`/api/aso/media/${encodeURIComponent(product.id)}/diagnose`, {
        method: 'POST',
      });
      const diag = await res.json();
      if (!res.ok) throw new Error(diag.error || '诊断失败');
      setMedia(curr => curr ? { ...curr, aiDiagnosis: diag } : curr);
      if (notify) notify(t('ASO 图片智能诊断完成！综合评分已更新', 'Media diagnosis completed! Score updated.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  // 从 App Store 重新同步截图
  async function syncStoreScreenshots() {
    if (!product.appStore?.appId) {
      setError(t('请先关联 App Store App', 'Please connect an App Store App first'));
      return;
    }
    setBusy(t('正在从 App Store 同步最新上架截图与图标…', 'Syncing latest screenshots from App Store...'));
    setError('');
    try {
      const res = await fetch(`/api/aso/media/${encodeURIComponent(product.id)}/sync-store`, {
        method: 'POST',
      });
      const synced = await res.json();
      if (!res.ok) throw new Error(synced.error || '同步失败');
      setMedia(synced);
      if (notify) notify(t('已从 App Store 线上同步最新截图', 'Synced latest screenshots from App Store'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function loadCreativePlacements() {
    setBusy(t('正在读取 App Store Connect 素材…', 'Reading App Store Connect assets…'));
    setError('');
    try {
      const response = await fetch(`/api/aso/media/${encodeURIComponent(product.id)}/creative-placements`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlacements(data);
      setPreviewSource('store');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  // 编辑截图文案
  function updateScreenshotCaption(platformKey: 'iphone' | 'ipad' | 'mac', id: string, field: 'caption' | 'subcaption', val: string) {
    if (!media) return;
    const list = media.platformScreenshots[platformKey] || [];
    const nextList = list.map(item => item.id === id ? { ...item, [field]: val } : item);
    const updated: AsoMediaData = {
      ...media,
      platformScreenshots: {
        ...media.platformScreenshots,
        [platformKey]: nextList,
      },
    };
    // 同步更新搜索结果前 3 图
    if (platformKey === 'iphone') {
      updated.searchResult.screenshots = nextList.slice(0, 3).map(s => s.url).filter(Boolean);
    }
    setMedia(updated);
  }

  // 移动截图顺序
  function moveScreenshot(platformKey: 'iphone' | 'ipad' | 'mac', index: number, direction: 'left' | 'right') {
    if (!media) return;
    const list = [...(media.platformScreenshots[platformKey] || [])];
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    const reordered = list.map((item, i) => ({ ...item, order: i + 1 }));
    const updated: AsoMediaData = {
      ...media,
      platformScreenshots: {
        ...media.platformScreenshots,
        [platformKey]: reordered,
      },
    };
    if (platformKey === 'iphone') {
      updated.searchResult.screenshots = reordered.slice(0, 3).map(s => s.url).filter(Boolean);
    }
    setMedia(updated);
  }

  // 删除截图
  function deleteScreenshot(platformKey: 'iphone' | 'ipad' | 'mac', id: string) {
    if (!media) return;
    const list = (media.platformScreenshots[platformKey] || []).filter(item => item.id !== id);
    const reordered = list.map((item, i) => ({ ...item, order: i + 1 }));
    const updated: AsoMediaData = {
      ...media,
      platformScreenshots: {
        ...media.platformScreenshots,
        [platformKey]: reordered,
      },
    };
    if (platformKey === 'iphone') {
      updated.searchResult.screenshots = reordered.slice(0, 3).map(s => s.url).filter(Boolean);
    }
    setMedia(updated);
  }

  // 添加新截图
  function addScreenshot(platformKey: 'iphone' | 'ipad' | 'mac') {
    if (!media) return;
    const list = media.platformScreenshots[platformKey] || [];
    const newShot: AsoScreenshot = {
      id: `${platformKey}-${Date.now()}`,
      url: '',
      caption: t('特色功能与场景亮点', 'Feature highlight & use case'),
      subcaption: '',
      order: list.length + 1,
      deviceType: platformKey === 'ipad' ? 'ipad_13' : 'iphone_6_9',
    };
    const nextList = [...list, newShot];
    setMedia({
      ...media,
      platformScreenshots: {
        ...media.platformScreenshots,
        [platformKey]: nextList,
      },
    });
  }

  // 图片上传处理 (本地文件转换为 DataURL)
  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t('图片文件不能超过 5MB', 'Image file must not exceed 5MB'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        callback(reader.result);
      }
    };
    reader.readAsDataURL(file);
  }

  if (loading) {
    return <section className="panel padded"><p>{t('正在加载 ASO 图片资产…', 'Loading ASO media assets...')}</p></section>;
  }

  if (!media) {
    return <section className="panel padded"><p role="alert">{error || t('未能读取到 ASO 图片数据。', 'Failed to load ASO media data.')}</p></section>;
  }

  const currentScreenshots = media.platformScreenshots[platformTab] || [];
  const diag = media.aiDiagnosis;
  const searchDisplayMode = media.searchResult.displayMode || 'portrait';

  const fallbackShots = searchDisplayMode === 'landscape'
    ? [media.searchResult.landscapeScreenshot].filter((url): url is string => Boolean(url))
    : [0, 1, 2]
      .map(index => media.searchResult.screenshots[index] || media.platformScreenshots.iphone[index]?.url)
      .filter(Boolean);

  function updateSearchDraft(patch: Partial<AsoMediaData['searchResult']>) {
    setMedia(current => current && { ...current, searchResult: { ...current.searchResult, ...patch } });
  }

  function renderPlacements(assets: StoreCreativePreview[] = []) {
    if (!assets.length) return <div className="aso-placement-empty">{t('未读取到已批准素材预览', 'No approved asset preview found')}</div>;
    return assets.map((asset, index) => (
      <figure key={`${asset.group}-${index}`}>
        <img className="aso-placement-image" src={asset.url} alt={asset.video ? t('视频封面', 'Video poster') : t('素材预览', 'Asset preview')} />
        <figcaption>{asset.group}{asset.video && t(' · 视频封面', ' · Video poster')}</figcaption>
      </figure>
    ));
  }

  return (
    <div className="aso-media-studio">
      {/* 顶部操作区 */}
      <div className="panel padded store-panel" style={{ margin: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              {t('ASO图片', 'ASO Media')}
            </h2>
            <p className="fine-print" style={{ margin: '4px 0 0 0', color: '#64748b' }}>
              {t('预览两个创意展示位，管理各设备的上架截图。', 'Preview creative placements and manage device screenshots.')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {product.appStore?.appId && (
              <button
                type="button"
                className="button secondary small"
                disabled={!!busy}
                onClick={() => void syncStoreScreenshots()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <RefreshCw size={14} className={busy ? 'spinning' : ''} />
                {t('从 App Store 同步截图', 'Sync from App Store')}
              </button>
            )}
            <button
              type="button"
              className="button secondary small"
              disabled={!!busy}
              onClick={() => void triggerDiagnosis()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563eb', borderColor: '#bfdbfe', background: '#eff6ff' }}
            >
              <Sparkles size={14} />
              {t('智能诊断与建议', 'Smart Diagnosis')}
            </button>
            <button
              type="button"
              className="button primary small"
              disabled={!!busy}
              onClick={() => void saveMediaChanges()}
            >
              {t('保存图片修改', 'Save Media Changes')}
            </button>
          </div>
        </div>

        {busy && <p role="status" style={{ margin: '12px 0 0 0', color: '#2563eb', fontWeight: 500 }}>{busy}</p>}
        {error && <p role="alert" style={{ margin: '12px 0 0 0', color: '#dc2626' }}>{error}</p>}
      </div>

      <section className="aso-section-box">
        <div className="aso-section-header">
          <div className="aso-section-title-group">
            <h3>{t('App Store 展示位', 'App Store placements')}</h3>
            <p>{previewSource === 'draft'
              ? t('本地草稿预览 · 保存后记录在 Growmory', 'Local draft preview · Saved in Growmory')
              : placements
                ? `App Store Connect · iOS ${placements.version} · ${placements.locale}`
                : t('未找到已发布版本的主要语言素材', 'No primary-locale assets found for a released version')}</p>
          </div>
          <div className="aso-segmented-ctrl">
            <button type="button" aria-pressed={previewSource === 'draft'} className={previewSource === 'draft' ? 'active' : ''} onClick={() => setPreviewSource('draft')}>{t('本地草稿', 'Local draft')}</button>
            {product.appStore?.appId && <button type="button" disabled={!!busy} aria-pressed={previewSource === 'store'} className={previewSource === 'store' ? 'active' : ''} onClick={() => void loadCreativePlacements()}>{t('读取 App Store Connect', 'Read App Store Connect')}</button>}
          </div>
        </div>
        <div className="aso-placement-grid">
          <article className="aso-placement">
            <h4>{t('搜索结果创意图', 'Search results creative')}</h4>
            <p>{t('3:2 · 1920×1280 至 3840×2560 · JPEG / PNG', '3:2 · 1920×1280 to 3840×2560 · JPEG / PNG')}</p>
            {previewSource === 'store' ? renderPlacements(placements?.search) : <>
              <div className="aso-placement-meta">
                {media.searchResult.iconUrl && <img src={media.searchResult.iconUrl} alt="" />}
                <div><strong>{media.searchResult.title || product.name}</strong>
                  {media.searchResult.subtitle && <small>{media.searchResult.subtitle}</small>}
                </div>
              </div>
              {media.searchResult.creativeUrl ? (
                <img className="aso-placement-image" src={media.searchResult.creativeUrl} alt={t('搜索结果创意图预览', 'Search results creative preview')} />
              ) : <div className="aso-placement-fallback">
                <small>{t('截图回退示意', 'Screenshot fallback preview')}</small>
                <div className="aso-placement-shots">
                  {fallbackShots.map((url, index) => <img key={index} src={url} alt={t(`截图 ${index + 1}`, `Screenshot ${index + 1}`)} />)}
                  {!fallbackShots.length && <p>{t('暂无可预览的截图', 'No screenshots available for preview')}</p>}
                </div>
              </div>}
              <label>{t('搜索创意图链接', 'Search creative image URL')}
                <input type="text" value={media.searchResult.creativeUrl || ''} onChange={e => updateSearchDraft({ creativeUrl: e.target.value })} />
              </label>
              <label>{t('上传搜索创意图', 'Upload search creative image')}
                <input type="file" accept="image/jpeg,image/png" onChange={e => handleImageUpload(e, creativeUrl => updateSearchDraft({ creativeUrl }))} />
              </label>
              <details>
                <summary>{t('配置截图回退示意', 'Configure screenshot fallback')}</summary>
                <label>{t('截图方向', 'Screenshot orientation')}
                  <select value={searchDisplayMode} onChange={e => updateSearchDraft({ displayMode: e.target.value === 'landscape' ? 'landscape' : 'portrait' })}>
                    <option value="portrait">{t('最多 3 张竖屏截图', 'Up to 3 portrait screenshots')}</option>
                    <option value="landscape">{t('1 张横屏截图', '1 landscape screenshot')}</option>
                  </select>
                </label>
                {searchDisplayMode === 'landscape' && <>
                  <label>{t('横屏截图链接', 'Landscape screenshot URL')}
                    <input value={media.searchResult.landscapeScreenshot || ''} onChange={e => updateSearchDraft({ landscapeScreenshot: e.target.value })} />
                  </label>
                  <label>{t('横屏截图备注', 'Landscape screenshot note')}
                    <input value={media.searchResult.landscapeCaption || ''} onChange={e => updateSearchDraft({ landscapeCaption: e.target.value })} />
                  </label>
                  <label>{t('上传横屏截图', 'Upload landscape screenshot')}
                    <input type="file" accept="image/*" onChange={e => handleImageUpload(e, landscapeScreenshot => updateSearchDraft({ landscapeScreenshot }))} />
                  </label>
                </>}
              </details>
            </>}
          </article>
          <article className="aso-placement">
            <h4>{t('商品页标题图', 'Product page header')}</h4>
            <p>21:9 · 3840×1646 · JPEG / PNG</p>
            {previewSource === 'store' ? renderPlacements(placements?.header) : <>
              {media.headerBanner.url
                ? <img className="aso-placement-image" src={media.headerBanner.url} alt={t('商品页标题图预览', 'Product page header preview')} />
                : <div className="aso-placement-empty">{t('添加图片，预览商品页顶部的品牌视觉', 'Add an image to preview the top of your product page')}</div>}
              {media.headerBanner.title && <strong>{media.headerBanner.title}</strong>}
              {media.headerBanner.description && <p>{media.headerBanner.description}</p>}
              <button type="button" className="button secondary small" onClick={() => {
                setEditingBanner({ ...media.headerBanner });
                setEditBannerModal(true);
              }}>{t('编辑标题图', 'Edit header image')}</button>
            </>}
          </article>
        </div>
        <footer className="aso-placement-guide">
          <span>{t('两个展示位均可使用 5244×2950 的 16:9 通用 PNG。创意图片须为无透明通道的图像。搜索未配置创意素材时，可能展示 App 内活动、预览视频或截图。', 'Both placements accept a universal 5244×2950 16:9 PNG. Creative images must be opaque. Without search creative, the store can show in-app events, previews, or screenshots.')}</span>
          <a href="https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/" target="_blank" rel="noreferrer">{t('设备截图规格', 'Device screenshot specifications')}</a>
          <a href="https://developer.apple.com/app-store/asset-best-practices/" target="_blank" rel="noreferrer">{t('Apple 安全区模板与指南', 'Apple templates and guidelines')}</a>
        </footer>

        {/* 宣传标题图编辑浮层 */}
        {previewSource === 'draft' && editBannerModal && (
          <div style={{ marginTop: 14, padding: 16, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 10 }}>
            <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>{t('编辑宣传标题图 (Promotional Artwork)', 'Edit Header Banner')}</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              <label className="field">
                <span>{t('标题文案', 'Title')}</span>
                <input
                  type="text"
                  value={editingBanner.title}
                  onChange={e => setEditingBanner({ ...editingBanner, title: e.target.value })}
                />
              </label>
              <label className="field">
                <span>{t('宣传语描述', 'Description')}</span>
                <input
                  type="text"
                  value={editingBanner.description}
                  onChange={e => setEditingBanner({ ...editingBanner, description: e.target.value })}
                />
              </label>
              <label className="field" style={{ gridColumn: '1 / -1' }}>
                <span>{t('图片链接或上传', 'Image URL or upload')}</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={editingBanner.url}
                    placeholder="https://... 或 data:image/..."
                    onChange={e => setEditingBanner({ ...editingBanner, url: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <label className="button secondary small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <Upload size={14} /> {t('上传本地图片', 'Upload')}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => handleImageUpload(e, url => setEditingBanner({ ...editingBanner, url }))}
                    />
                  </label>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="button secondary small"
                onClick={() => setEditBannerModal(false)}
              >
                {t('取消', 'Cancel')}
              </button>
              <button
                type="button"
                className="button primary small"
                onClick={() => {
                  setMedia({
                    ...media,
                    headerBanner: { ...editingBanner, source: 'draft' },
                  });
                  setEditBannerModal(false);
                  if (notify) notify(t('已更新宣传标题图，请点击右上角保存', 'Banner updated. Click Save to persist.'));
                }}
              >
                {t('确认应用', 'Apply')}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* 板块三：平台对应上架图 (Platform Screenshots) */}
      {/* ========================================================================= */}
      <div className="aso-section-box">
        <div className="aso-section-header">
          <div className="aso-section-title-group">
            <h3>
              <ImageIcon size={18} color="#2563eb" />
              {t('设备截图', 'Device screenshots')}
            </h3>
            <p>
              {t('支持编辑每张截图标题、卖点说明、高清图片并调整前后顺序（每个设备尺寸最多可上传 10 张）。', 'Manage up to 10 screenshots per platform device with captions and feature tags.')}
            </p>
          </div>

          {/* 平台机型切换 */}
          <div className="tabs" style={{ margin: 0 }}>
            <button
              type="button"
              className={platformTab === 'iphone' ? 'active' : ''}
              onClick={() => setPlatformTab('iphone')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 14px' }}
            >
              <Smartphone size={14} />
              <span>iPhone</span>
              <small style={{ fontSize: 10, color: '#64748b' }}>1320×2868</small>
            </button>
            <button
              type="button"
              className={platformTab === 'ipad' ? 'active' : ''}
              onClick={() => setPlatformTab('ipad')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 14px' }}
            >
              <Tablet size={14} />
              <span>iPad 13"</span>
              <small style={{ fontSize: 10, color: '#64748b' }}>2064×2752</small>
            </button>
            <button
              type="button"
              className={platformTab === 'mac' ? 'active' : ''}
              onClick={() => setPlatformTab('mac')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '5px 14px' }}
            >
              <Monitor size={14} />
              <span>Mac 16:10</span>
              <small style={{ fontSize: 10, color: '#64748b' }}>2880×1800</small>
            </button>
          </div>
        </div>

        {/* 截图网格卡片 */}
        <div className="aso-screenshots-masonry">
          {currentScreenshots.map((shot, index) => {
            const isIphone = platformTab === 'iphone';
            const inSearchSlot = isIphone && index < 3;
            const captionLength = (shot.caption || '').trim().length;
            const subLength = (shot.subcaption || '').trim().length;
            const captionClass = captionLength >= 6 && captionLength <= 14 ? 'ok' : (captionLength > 15 ? 'warn' : '');
            const subClass = subLength >= 10 && subLength <= 24 ? 'ok' : (subLength > 25 ? 'warn' : '');

            return (
              <div
                key={shot.id}
                className={`aso-item-shot-card ${inSearchSlot ? 'in-search' : ''}`}
              >
                <div className="aso-shot-card-header">
                  <span className={`aso-order-badge ${index === 0 && isIphone ? 'search-primary' : inSearchSlot ? 'search-secondary' : 'detail-only'}`}>
                    {index === 0 && isIphone ? (
                      <>{t('#1 首张截图', '#1 First screenshot')}</>
                    ) : inSearchSlot ? (
                      <>{t(`#${index + 1} 搜索副图`, `#${index + 1} Search Slot`)}</>
                    ) : (
                      <>{t(`#${index + 1} 详情页`, `#${index + 1} Store Details`)}</>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={index === 0}
                      onClick={() => moveScreenshot(platformTab, index, 'left')}
                      title={t('向前移动', 'Move Left')}
                      style={{ padding: '2px 6px' }}
                    >
                      <ArrowLeft size={12} />
                    </button>
                    <button
                      type="button"
                      className="button small secondary"
                      disabled={index === currentScreenshots.length - 1}
                      onClick={() => moveScreenshot(platformTab, index, 'right')}
                      title={t('向后移动', 'Move Right')}
                      style={{ padding: '2px 6px' }}
                    >
                      <ArrowRight size={12} />
                    </button>
                    <button
                      type="button"
                      className="button small secondary danger"
                      onClick={() => deleteScreenshot(platformTab, shot.id)}
                      title={t('删除此图', 'Delete Screenshot')}
                      style={{ padding: '2px 6px', color: '#dc2626' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* 截图预览框 */}
                <div className={`aso-shot-preview-box ${platformTab === 'ipad' ? 'tablet' : platformTab === 'mac' ? 'mac' : ''}`}>
                  {shot.url ? (
                    <img src={shot.url} alt={`Screenshot ${index + 1}`} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: 12 }}>
                      <ImageIcon size={32} style={{ opacity: 0.4 }} />
                      <p style={{ margin: '4px 0 0 0', fontSize: 12 }}>{t('暂未设置图片', 'No image')}</p>
                      <small style={{ color: '#cbd5e1' }}>
                        {platformTab === 'iphone' ? '1320×2868' : platformTab === 'ipad' ? '2064×2752' : '2880×1800'}
                      </small>
                    </div>
                  )}
                </div>

                {/* 图片更换与上传行 */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    placeholder={t('图片 URL 或上传本地图片', 'Image URL or Upload')}
                    value={shot.url}
                    onChange={e => {
                      const list = media.platformScreenshots[platformTab] || [];
                      const nextList = list.map(item => item.id === shot.id ? { ...item, url: e.target.value } : item);
                      setMedia({
                        ...media,
                        platformScreenshots: {
                          ...media.platformScreenshots,
                          [platformTab]: nextList,
                        },
                      });
                    }}
                    style={{ flex: 1, fontSize: 12, padding: '4px 8px', borderRadius: 4, border: '1px solid #cbd5e1' }}
                  />
                  <label className="button secondary small" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', padding: '4px 8px', fontSize: 11 }}>
                    <Upload size={12} />
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={e => handleImageUpload(e, url => {
                        const list = media.platformScreenshots[platformTab] || [];
                        const nextList = list.map(item => item.id === shot.id ? { ...item, url } : item);
                        const updated: AsoMediaData = {
                          ...media,
                          platformScreenshots: {
                            ...media.platformScreenshots,
                            [platformTab]: nextList,
                          },
                        };
                        if (platformTab === 'iphone') {
                          updated.searchResult.screenshots = nextList.slice(0, 3).map(s => s.url).filter(Boolean);
                        }
                        setMedia(updated);
                      })}
                    />
                  </label>
                </div>

                {/* 文案输入与字符提示 */}
                <div className="aso-shot-inputs">
                  <div>
                    <div className="aso-caption-label">
                      <span>{t('标题文案 (Caption)', 'Caption')}</span>
                      <span className={`count-hint ${captionClass}`}>
                        {captionLength}/12 {captionLength >= 6 && captionLength <= 14 ? '✓ ' + t('适中', 'Optimal') : captionLength > 14 ? '⚠️ ' + t('较长', 'Too long') : t('建议8-12字', '8-12 chars')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder={t('例如：智能文案 · 一键生成', 'e.g. Smart AI Copywriting')}
                      value={shot.caption || ''}
                      onChange={e => updateScreenshotCaption(platformTab, shot.id, 'caption', e.target.value)}
                      style={{ width: '100%', fontSize: 12, padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <div className="aso-caption-label">
                      <span>{t('卖点说明 (Subcaption)', 'Subcaption')}</span>
                      <span className={`count-hint ${subClass}`}>
                        {subLength}/20 {subLength >= 10 && subLength <= 24 ? '✓ ' + t('适中', 'Optimal') : t('补充场景或卖点', 'Add use case')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder={t('例如：支持小红书、微信、公众号多渠道', 'e.g. Multi-channel support')}
                      value={shot.subcaption || ''}
                      onChange={e => updateScreenshotCaption(platformTab, shot.id, 'subcaption', e.target.value)}
                      style={{ width: '100%', fontSize: 12, padding: '5px 8px', marginTop: 2, borderRadius: 4, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          {/* 添加新截图卡片 */}
          <button
            type="button"
            onClick={() => addScreenshot(platformTab)}
            style={{
              minHeight: 380,
              border: '2px dashed #cbd5e1',
              borderRadius: 12,
              background: '#f8fafc',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: '#64748b'
            }}
          >
            <Plus size={32} color="#94a3b8" />
            <strong style={{ fontSize: 14 }}>{t('添加新截图', 'Add Screenshot')}</strong>
            <span style={{ fontSize: 12 }}>({platformTab.toUpperCase()})</span>
          </button>
        </div>
      </div>
      {/* 智能图片诊断报告面板 */}
      {diag && (
        <div className="aso-section-box" style={{ background: '#f0fdf4', borderColor: '#bbf7d0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26, fontWeight: 700, color: diag.overallScore >= 80 ? '#15803d' : '#b45309' }}>
                {diag.overallScore} {t('分', 'pts')}
              </span>
              <div>
                <strong style={{ fontSize: 15, color: '#14532d' }}>{t('ASO 图片视觉与转化率综合诊断报告', 'ASO Visual & CVR Diagnostic Report')}</strong>
                <p className="fine-print" style={{ margin: '2px 0 0 0', color: '#166534' }}>
                  {t('诊断于：', 'Diagnosed at: ')}{new Date(diag.analyzedAt).toLocaleString()} · {diag.summary}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button small secondary"
              onClick={() => void triggerDiagnosis()}
              style={{ fontSize: 12 }}
            >
              {t('重新诊断', 'Re-diagnose')}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 10 }}>
            {Object.entries(diag.dimensions).map(([key, dim]) => (
              <div key={key} style={{ padding: '10px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid #dcfce7' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ fontSize: 13, color: '#1e293b' }}>{dim.title}</strong>
                  <span style={{ fontSize: 12, fontWeight: 600, color: dim.score >= 80 ? '#16a34a' : '#d97706' }}>
                    {dim.score}分
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                  {dim.findings.map((f, idx) => <p key={idx} style={{ margin: '2px 0' }}>• {f}</p>)}
                  {dim.suggestions.map((s, idx) => <p key={idx} style={{ margin: '2px 0', color: '#2563eb' }}>💡 {s}</p>)}
                </div>
              </div>
            ))}
          </div>

          {diag.actionItems && diag.actionItems.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#15803d' }}>{t('高优先级优化建议项：', 'Priority Action Items:')}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                {diag.actionItems.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12 }}>
                    <span style={{
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      background: item.priority === 'high' ? '#fee2e2' : item.priority === 'medium' ? '#fef3c7' : '#f1f5f9',
                      color: item.priority === 'high' ? '#b91c1c' : item.priority === 'medium' ? '#b45309' : '#475569'
                    }}>
                      {item.priority}
                    </span>
                    <strong style={{ color: '#0f172a' }}>{item.title}</strong>
                    <span style={{ color: '#64748b' }}>— {item.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
