import { CreatorReportImport } from './creator-report-import';
import { ListPagination, listPageSize } from './list-pagination';
import { socialIdentity, summarizeSocial, type ReportLink } from './social-identity';
import { platformLabels as platforms, type PlatformId } from './platforms';
import { PlatformLogo } from './platform-logo';
import { SocialArchiveImport } from './social-archive-import';
import { XiaohongshuImport } from './xiaohongshu-import';
import { useEffect, useRef, useState } from 'react';
import { Download, Plus, Trash2, X, Users, ThumbsUp, Eye, BarChart3, MessageCircle, Bookmark, Share2, FileText, Pencil, ListFilter } from 'lucide-react';
import type { Product } from './types';
import { useI18n } from './i18n.ts';

const exportUrls: Partial<Record<PlatformId, string>> = {
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  reddit: 'https://www.reddit.com/settings/data-request',
  x: 'https://x.com/settings/download_your_data',
  wechat: 'https://mp.weixin.qq.com/',
  juejin: 'https://juejin.cn/creator',
};

type Platform = PlatformId;
type Metrics = Partial<Record<string, number | null>>;
type Account = { id: string; platform: Platform; name: string; url: string; productId: string; followers?: number | null; isPremium?: boolean };
type Snapshot = { id: string; accountId: string; kind: 'account' | 'content'; title: string; url?: string; externalId?: string; publishedTime?: string; contentType?: string; observedAt: string; period: 'lifetime' | 'range'; periodStart?: string; periodEnd: string; source: string; sourceNote: string; metrics: Metrics };
type Context = { revision: number; wechatAppIds?: Record<string, string>; accounts: Account[]; snapshots: Snapshot[]; reportLinks?: ReportLink[]; reportOptions?: Record<string, { url: string; title: string; publishedTime?: string }[]>; guide: string; contentLinks?: Record<string, { id?: string; title?: string; ambiguous?: boolean; options?: { id: string; title: string; publishedAt?: string; product?: string; url?: string }[] }> };
async function request(input?: object): Promise<Context> {
  const r = await fetch('/api/social-analytics', input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : undefined);
  const v = await r.json(); if (!r.ok) throw Error(v.error || '数据读取失败'); return v;
}
export function SocialAnalytics({ products, scope, activePlatform, view }: { products: Product[]; scope: string; activePlatform: PlatformId; view: 'accounts' | 'data' }) {
  const { lang, t } = useI18n();
  const [data, setData] = useState<Context | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const platform = activePlatform;
  const exportUrl = exportUrls[platform];
  const [accountId, setAccountId] = useState('all');
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState('');
  const [followerAccountId, setFollowerAccountId] = useState('');
  const [followerValue, setFollowerValue] = useState('');
  const [account, setAccount] = useState<Omit<Account,'id'> & {id?:string}>({ platform: 'xiaohongshu' as Platform, name: '', url: '', productId: '' });
  useEffect(() => { if (!notice) return; const timer = setTimeout(()=>setNotice(''), 3500); return ()=>clearTimeout(timer); }, [notice]);
  const load = async () => { setData(await request()); };
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function save(payload: object) {
    if (!data) return;
    setBusy(true); setError(''); setNotice('');
    try { await request({ ...payload, expectedRevision: data.revision }); await load(); setMode(''); setNotice(t('数据已保存', 'Data saved')); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (mode && !dialog.current?.open) dialog.current?.showModal();
    if (!mode && dialog.current?.open) dialog.current?.close();
  }, [mode]);
  useEffect(() => { setAccountId('all'); }, [scope, activePlatform]);
  useEffect(() => { setError(''); setNotice(''); }, [activePlatform, view]);
  const accounts = (data?.accounts || []).filter(a => a.platform === platform && (scope === 'all' || a.productId === scope));
  const visible = new Set(accounts.filter(a => accountId === 'all' || a.id === accountId).map(a => a.id));
  const snapshots = (data?.snapshots || []).filter(s => visible.has(s.accountId)).sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  const links = data?.reportLinks || [];
  const latest = summarizeSocial(snapshots, links);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [listPage, setListPage] = useState(1);
  useEffect(() => { setPendingOnly(false); }, [activePlatform, accountId]);
  useEffect(() => { setListPage(1); }, [activePlatform, accountId, pendingOnly]);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => { setSelected([]); }, [activePlatform, accountId, view]);
  const selectedAccount = accounts.find(a => a.id === accountId);
  const unfilteredRows = latest.filter(s => s.kind === 'content' || s.externalId?.endsWith('-trend'));
  if (platform === 'x') unfilteredRows.sort((a, b) => (b.publishedTime || '').localeCompare(a.publishedTime || ''));
  const sharingMetric = platform === 'x' ? 'reposts' : 'shares';
  const sharingLabel = platform === 'x' ? t('转发', 'Reposts') : t('分享', 'Shares');
  const isPending = (s: Snapshot) => !!data?.reportOptions?.[socialIdentity(s)]?.length;
  const needsConfirmation = (s: Snapshot) => isPending(s) || !!data?.contentLinks?.[s.id]?.ambiguous;
  const pendingCount = new Set(unfilteredRows.filter(needsConfirmation).map(s => socialIdentity(s, links))).size;
  const contentRows = pendingOnly ? unfilteredRows.filter(needsConfirmation) : unfilteredRows;
  const page = Math.min(listPage, Math.max(1, Math.ceil(contentRows.length / listPageSize)));
  const pageRows = contentRows.slice((page - 1) * listPageSize, page * listPageSize);
  useEffect(() => { setSelected([]); }, [page, pendingOnly]);
  const totalRows = latest.filter(s => s.kind === 'content' && s.period === 'lifetime' && !isPending(s));
  const trendRows = platform === 'juejin' ? latest.filter(s => s.kind === 'account' && s.externalId === 'juejin-trend') : [];
  const trendAccounts = new Set(trendRows.map(row => row.accountId));
  const overviewRows = [...trendRows, ...totalRows.filter(row => !trendAccounts.has(row.accountId))];
  const followerRows = latest.filter(s => s.kind === 'account' && s.period === 'lifetime');
  const followersFor = (a: Account) => a.followers === undefined
    ? followerRows.find(s => s.accountId === a.id)?.metrics.followers : a.followers;
  const followerCounts = accounts.filter(a => visible.has(a.id)).map(followersFor).filter((n): n is number => n != null);
  const followerTotal = followerCounts.length ? followerCounts.reduce((total, n) => total + n, 0).toLocaleString() : '—';
  function selectFollowerAccount(id: string) {
    setFollowerAccountId(id);
    const current = accounts.find(a => a.id === id);
    setFollowerValue(current ? String(followersFor(current) ?? '') : '');
  }
  const sum = (key: keyof Metrics, rows = overviewRows) => {
    const values = rows.map(s => s.metrics[key]).filter((n): n is number => n != null);
    return values.length ? values.reduce((a,b)=>a+b,0).toLocaleString() : '—';
  };
  const latestWechatReaders = new Map<string, typeof latest[number]>();
  if (platform === 'wechat') {
    for (const row of latest) {
      if (row.kind !== 'content' || row.metrics.readUsers == null) continue;
      const id = socialIdentity(row, links);
      const previous = latestWechatReaders.get(id);
      if (!previous || row.periodEnd > previous.periodEnd ||
        (row.periodEnd === previous.periodEnd && Date.parse(row.observedAt) > Date.parse(previous.observedAt))) {
        latestWechatReaders.set(id, row);
      }
    }
  }
  const allSelected = pageRows.length > 0 && pageRows.every(s=>selected.includes(s.id));
  async function deleteSelected() {
    if (!data || !selected.length || !window.confirm(`删除所选 ${selected.length} 行对应的原始数据？汇总行会删除其包含的全部快照，账号会保留。`)) return;
    setBusy(true);setError('');
    try { await request({ expectedRevision:data.revision, deleteSnapshotIds:[...new Set(contentRows.filter(s => selected.includes(s.id)).flatMap(s => s.snapshotIds))] });await load();setSelected([]);setNotice('所选记录已删除'); }
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }

  const lastObserved = snapshots[0]?.observedAt;
  async function finishImport(message: string) { await load(); setMode(''); setNotice(message); }
  function openCollect() { setError(''); setNotice(''); setMode('collect'); }
  function openAccount() { setAccount({ platform: activePlatform, name: '', url: '', productId: scope === 'all' ? '' : scope }); setError(''); setNotice(''); setMode('account'); }
  const value = (s: Snapshot, key: keyof Metrics) => s.metrics[key] == null ? '—' : s.metrics[key]!.toLocaleString();
  const shortDate = (date: string) => new Date(date).toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  function feedback() { return <>{error && <div role="alert" className="social-feedback error">{error}<button type="button" className="text-button" onClick={() => load().then(() => { setError(''); setNotice(t('已刷新，可重试保存', 'Refreshed, retry saving')); }).catch(e => setError(e.message))}>{t('重新读取', 'Reload')}</button></div>}{notice && <p role="status" className="social-feedback">{notice}</p>}</>; }
  return <div className="social-analytics">
    <header className="social-heading operations-section-heading">
      <div className="operations-inline-filter">{view === 'accounts' ? <span>{t(`${accounts.length} 个账号`, `${accounts.length} accounts`)}</span> : <><label><span>{t('账号', 'Account')}</span><select aria-label={t("查看账号", "Select account")} value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="all">{t(`全部${platforms[activePlatform]}账号`, `All ${platforms[activePlatform]} accounts`)}</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><small>{lastObserved ? `${t('更新于 ', 'Updated ')}${shortDate(lastObserved)}` : t('暂无数据', 'No data')}</small></>}</div>
      <div className="social-heading-actions">{view === 'accounts' ? <button className="button primary" onClick={openAccount}><Plus size={15}/>{t('添加账号', 'Add Account')}</button> : <><button className="button primary" disabled={!exportUrl} onClick={openCollect}><Download size={15}/>{t('导入数据', 'Import Data')}</button></>}</div>
    </header>
    {view === 'data' && <section className="operations-overview" aria-label={t("累计数据总览", "Data Overview")}>{[
      {label:t('关注者', 'Followers'),value:followerTotal, editFollowers:true,icon:Users,color:'#2563eb'},
      {label:t('内容数', 'Total Posts'),value:new Set(latest.filter(s=>s.kind==='content' && !isPending(s)).map(s=>socialIdentity(s, links))).size.toLocaleString(),icon:FileText,color:'#64748b'},
      {label:t('曝光', 'Impressions'),value:sum('impressions'),icon:BarChart3,color:'#8b5cf6'},
      {label:t('浏览', 'Views'),value:platform === 'wechat' ? sum('readUsers', [...latestWechatReaders.values()]) : sum('views'),icon:Eye,color:'#0891b2'},
      {label:t('点赞', 'Likes'),value:sum('likes'),icon:ThumbsUp,color:'#e04f73'},
      {label:t('评论', 'Comments'),value:sum('comments'),icon:MessageCircle,color:'#d97706'},
      {label:t('收藏', 'Saves'),value:sum('saves'),icon:Bookmark,color:'#b18a11'},
      {label:sharingLabel,value:sum(sharingMetric),icon:Share2,color:'#15976b'},
    ].map(({label,value,icon:MetricIcon,color,editFollowers})=><div key={label}><span><MetricIcon size={23} style={{color}}/>{label}</span><div className="operations-overview-value"><strong>{value}</strong>{editFollowers && <button type="button" className="icon-button" aria-label={t('编辑关注者', 'Edit followers')} disabled={!accounts.length || busy} onClick={() => {
      selectFollowerAccount(selectedAccount?.id || accounts[0].id); setError(''); setNotice(''); setMode('followers');
    }}><Pencil size={15}/></button>}</div></div>)}</section>}
    {view === 'data' && platform === 'wechat' && latestWechatReaders.size > 0 && <p className="fine-print">{t('公众号浏览按阅读人数显示，总览取每篇文章最新统计后相加。', 'WeChat views use reader counts, summed from the latest figure for each article.')}</p>}
    {view === 'data' && trendRows.length > 0 && <p className="fine-print">{t('掘金总览按已导入的每日账号趋势汇总，覆盖全部分页。', 'Juejin totals include imported daily account trends across all pages.')}</p>}
    {!mode && feedback()}
    {!data ? <p className="operations-loading">{error ? t('数据暂时无法读取，请重试。', 'Failed to read data, please try again.') : t('正在读取账号与数据…', 'Loading accounts and data...')}</p> : view === 'accounts' ? <>
      {accounts.length ? <div className="operations-account-grid">{accounts.map(a => {
        const rows=(data.snapshots || []).filter(s=>s.accountId===a.id);
        return <article className="operations-account-card" key={a.id}><header><PlatformLogo platform={a.platform} size={32}/><div><h3>{a.name}</h3><p>{products.find(p=>p.id===a.productId)?.name || t('通用账号', 'Shared Account')}</p></div></header><dl><div><dt>{t('平台', 'Platform')}</dt><dd>{platforms[a.platform]}</dd></div>{a.platform === 'x' && <div><dt>{t('会员状态', 'Membership')}</dt><dd>{a.isPremium ? t('会员', 'Premium') : t('非会员', 'Non-Premium')}</dd></div>}<div><dt>{t('数据记录', 'Records')}</dt><dd>{t(`${rows.length} 条`, `${rows.length} records`)}</dd></div></dl><footer>{a.url && <a className="text-button" href={a.url} target="_blank" rel="noreferrer">{t('账号主页', 'Profile')}</a>}<button className="text-button" onClick={()=>{setAccount({...a});setMode('account');}}>{t('编辑账号', 'Edit Account')}</button></footer></article>;
      })}</div> : <div className="operations-empty"><PlatformLogo platform={activePlatform} size={42}/><h3>{t(`添加你的第一个${platforms[activePlatform]}账号`, `Add your first ${platforms[activePlatform]} account`)}</h3><p>{t('保存主页链接和所属产品，后续数据会归集到这个账号。', 'Save profile link and product; future analytics will map to this account.')}</p><button className="button primary" onClick={openAccount}><Plus size={15}/>{t('添加账号', 'Add Account')}</button></div>}
    </> : !accounts.length ? <div className="operations-empty"><PlatformLogo platform={activePlatform} size={42}/><h3>{t(`还没有${platforms[activePlatform]}账号`, `No ${platforms[activePlatform]} accounts yet`)}</h3><p>{t('先添加账号，再导入或采集数据。', 'Add an account first before importing or collecting data.')}</p><button className="button primary" onClick={openAccount}>{t('添加账号', 'Add Account')}</button></div> : <>

      <div className="social-report">
        <div className="social-report-header"><div><h3>{unfilteredRows.some(row => row.kind === 'account') ? t('内容与账号趋势', 'Content and account trends') : t('内容列表', 'Content List')} <small>{contentRows.length}</small></h3></div><div className="social-list-actions">{selected.length > 0 && <button type="button" className="text-button danger" disabled={busy} onClick={() => void deleteSelected()}><Trash2 size={14}/>{t(`删除所选（${selected.length}）`, `Delete selected (${selected.length})`)}</button>}<button type="button" className="button secondary" aria-pressed={pendingOnly} onClick={() => setPendingOnly(!pendingOnly)}><ListFilter size={15}/>{t(`筛选待确认（${pendingCount} 条）`, `Needs confirmation (${pendingCount})`)}</button></div></div>
        {!snapshots.length ? <div className="social-report-empty"><Download size={28}/><h3>{t('还没有内容数据', 'No content data yet')}</h3><p>{t('点击上方「导入数据」，选择或拖入平台导出的文件。', 'Click Import Data to select or drop a platform export.')}</p></div> : <>
          {contentRows.length > 0 ? <><div className="social-content-table"><table><thead><tr><th className="operations-checkbox-cell"><input type="checkbox" aria-label={t("全选本页数据记录", "Select all records on this page")} checked={allSelected} ref={node=>{if(node)node.indeterminate=selected.length>0&&!allSelected;}} onChange={e=>setSelected(e.target.checked?pageRows.map(s=>s.id):[])}/></th><th>{t('内容', 'Content')}</th><th>{t('曝光', 'Impressions')}</th><th>{t('浏览', 'Views')}</th><th>{t('点赞', 'Likes')}</th><th>{t('评论', 'Comments')}</th><th>{t('收藏', 'Saves')}</th><th>{sharingLabel}</th><th>{t('数据更新时间', 'Data updated')}</th></tr></thead><tbody>{pageRows.map(s => {
            const a = data?.accounts.find(a => a.id === s.accountId);
            const marketingLink = data?.contentLinks?.[s.id];
            const reportOptions = data?.reportOptions?.[socialIdentity(s)];
            const peopleMetrics: Record<string, [string, string]> = {
              ...(platform !== 'wechat' ? { views: ['readUsers', t('阅读人数', 'Readers')] as [string, string] } : {}),
              shares: ['shareUsers', t('分享人数', 'People sharing')],
              saves: ['favoriteUsers', t('收藏人数', 'People saving')],
            };
            return <tr key={s.id} className={selected.includes(s.id)?'selected':''}><td className="operations-checkbox-cell"><input type="checkbox" aria-label={`${t('选择数据：', 'Select: ')}${s.title}`} checked={selected.includes(s.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,s.id]:ids.filter(id=>id!==s.id))}/></td><td><>{s.url ? <a className="social-content-title" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : <span className="social-content-title">{s.title}</span>}</><small className="platform-label">{a && <PlatformLogo platform={a.platform} size={12}/>} {a ? a.name : ''}{s.publishedTime ? ` · ${s.publishedTime.slice(0, 10)}` : ''}{s.contentType ? ` · ${s.contentType}` : ''}</small>{s.kind === 'account' && (s.metrics.publishedPosts != null || s.metrics.originalReadUsers != null) && <small>{s.metrics.publishedPosts != null && t(`发表 ${value(s, 'publishedPosts')} 篇`, `${value(s, 'publishedPosts')} published`)}{s.metrics.originalReadUsers != null && t(`　跳转原文 ${value(s, 'originalReadUsers')} 人`, `　${value(s, 'originalReadUsers')} original-link readers`)}</small>}{!!reportOptions?.length && <select aria-label={t('确认同标题笔记', 'Confirm matching note')} disabled={busy} value="" onChange={e => { if (e.target.value) void save({ reportLinks: [{ accountId: s.accountId, externalId: s.externalId, url: e.target.value }] }); }}><option value="">{t('同标题笔记待确认', 'Confirm matching note')}</option>{reportOptions.map(note => <option key={note.url} value={note.url}>{[note.title, note.publishedTime, note.url].filter(Boolean).join(' · ')}</option>)}</select>}{marketingLink?.id && <small className="fine-print"><a href={`#${new URLSearchParams({ page: 'contents', content: marketingLink.id })}`} target="_blank" rel="noopener noreferrer">{t('营销内容', 'Marketing content')} · {marketingLink.title}</a></small>}{!reportOptions?.length && data?.contentLinks?.[s.id]?.ambiguous && <select aria-label={t('确认关联营销内容', 'Confirm marketing content')} disabled={busy} value="" onChange={e => { if (e.target.value) void save({ marketingLink: { snapshotId: s.id, contentId: e.target.value } }); }}><option value="">{t('同标题待确认', 'Ambiguous title')}</option>{data.contentLinks[s.id].options?.map(c => <option key={c.id} value={c.id}>{[c.title, c.product, c.publishedAt, c.url || c.id.slice(0, 8)].filter(Boolean).join(' · ')}</option>)}</select>}</td>{(['impressions', 'views', 'likes', 'comments', 'saves', sharingMetric] as const).map(key => { const people = peopleMetrics[key]; return <td key={key}>{value(s, platform === 'wechat' && key === 'views' ? 'readUsers' : key)}{people && s.metrics[people[0]] != null && <small>{people[1]} {value(s, people[0])}</small>}</td>; })}<td><time dateTime={s.observedAt} title={new Date(s.observedAt).toLocaleString()}>{shortDate(s.observedAt)}</time>{(platform === 'wechat' || platform === 'juejin') && s.period === 'range' && <small>{s.periodStart} ~ {s.periodEnd}</small>}</td></tr>;
          })}</tbody></table></div></> : <p className="social-no-content">{pendingOnly ? t('当前没有待确认记录。', 'No records need confirmation.') : t('暂时没有内容记录。', 'No content records yet.')}</p>}
          <ListPagination page={page} total={contentRows.length} onPage={setListPage}/>
          <footer className="social-report-footer"><span>{t('— 表示未获取。汇总按指标选取最新可用值，各指标时间可能不同。有多个原帖候选的报表在确认前暂缓计入顶部汇总。', '— denotes unavailable. Totals pick the latest available values per metric.')}</span></footer>
        </>}
      </div>
    </>}
    <dialog ref={dialog} className="social-dialog" aria-labelledby="social-dialog-title" onCancel={e => { if (busy) e.preventDefault(); else setMode(''); }} onClose={() => setMode('')}>
      <header className="social-dialog-header"><div><h2 id="social-dialog-title">{mode === 'account' ? (account.id ? t('编辑自媒体账号', 'Edit Social Account') : t('添加自媒体账号', 'Add Social Account')) : mode === 'followers' ? t('编辑关注者', 'Edit followers') : t('导入数据', 'Import Data')}</h2><p>{mode === 'account' ? t('先告诉 Growmory，你在运营哪个账号。', 'Specify the account you manage.') : null}</p></div><button type="button" className="icon-button" aria-label={t("关闭窗口", "Close dialog")} disabled={busy} onClick={() => setMode('')}><X size={19}/></button></header>
      <div className="social-dialog-body">
        {feedback()}
    {mode === 'account' && <form key={account.id || account.platform} className="social-form" autoComplete="off" onSubmit={e => {
      e.preventDefault();
      const fields = new FormData(e.currentTarget);
      const appId = String(fields.get('appId') || '').trim();
      const secret = String(fields.get('secret') || '').trim();
      void save({ accounts: [account.platform === 'x' ? { ...account, isPremium: account.isPremium === true } : account], ...(account.platform === 'wechat' && (appId || secret) ? { wechatApi: { appId, secret } } : {}) });
    }}><p className="social-dialog-intro">{t(`当前平台：${platforms[account.platform]}`, `Platform: ${platforms[account.platform]}`)}</p><label className="field"><span>{t('账号名称', 'Account Name')}</span><input required value={account.name} onChange={e => setAccount({ ...account, name: e.target.value })}/></label>{account.platform !== 'wechat' && <label className="field"><span>{t('账号主页链接', 'Profile URL')}</span><input required type="url" value={account.url} onChange={e => setAccount({ ...account, url: e.target.value })}/></label>}<label className="field"><span>{t('关联产品', 'Linked Product')}</span><select aria-label={t("关联产品", "Linked Product")} value={account.productId} onChange={e => setAccount({ ...account, productId: e.target.value })}><option value="">{t('通用账号', 'Shared Account')}</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {account.platform === 'x' && <label className="field"><span>{t('是否会员', 'X Premium')}</span><select value={account.isPremium ? 'yes' : 'no'} onChange={e => setAccount({ ...account, isPremium: e.target.value === 'yes' })}><option value="no">{t('非会员', 'Non-Premium')}</option><option value="yes">{t('会员', 'Premium')}</option></select></label>}
    {account.platform === 'wechat' && <fieldset className="social-form">
      <legend>{t('微信公众号 API', 'WeChat official API')}</legend>
      <label className="field"><span>AppID</span><input name="appId" pattern="wx[a-zA-Z0-9]{16}" defaultValue={account.id ? data?.wechatAppIds?.[account.id] : undefined}/></label>
      <label className="field"><span>AppSecret</span><input name="secret" type="password" autoComplete="new-password" maxLength={128}/></label>
      <p className="fine-print">{account.id && data?.wechatAppIds?.[account.id] ? t('AppID 不变时，留空 AppSecret 可保留原密钥。', 'Leave AppSecret blank to keep the existing secret for this AppID.') : t('如需使用 API 同步，请填写 AppID 和 AppSecret。仅上传报表时可留空。', 'Enter AppID and AppSecret for API sync. Leave them blank for file imports only.')}</p>
    </fieldset>}<button className="button primary" disabled={busy}>{t('保存账号', 'Save Account')}</button></form>}


        {mode === 'followers' && <form className="social-form" onSubmit={e => {
          e.preventDefault();
          const target = accounts.find(a => a.id === followerAccountId);
          if (target) void save({ accounts: [{ ...target, followers: followerValue === '' ? null : Number(followerValue) }] });
        }}>
          <label className="field"><span>{t('账号', 'Account')}</span><select disabled={busy} value={followerAccountId} onChange={e => selectFollowerAccount(e.target.value)}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="field"><span>{t('关注者数量', 'Follower count')}</span><input type="number" min="0" max={Number.MAX_SAFE_INTEGER} step="1" disabled={busy} value={followerValue} onChange={e => setFollowerValue(e.target.value)} /></label>
          <p className="fine-print">{t('填写该账号当前的关注者总数，留空表示未知。', 'Enter the current follower count, or leave blank if unknown.')}</p>
          <button type="submit" className="button primary" disabled={busy || !followerAccountId}>{t('保存关注者', 'Save followers')}</button>
        </form>}
        {mode === 'collect' && exportUrl && <div className="social-form">
          <label className="field">
            <span>{t('数据导出链接', 'Data export link')}</span>
            <input type="url" readOnly value={exportUrl}/>
          </label>
          <div className="social-heading-actions">
            <button type="button" className="button secondary" onClick={async () => {
              setError(''); setNotice('');
              try {
                await navigator.clipboard.writeText(exportUrl);
                setNotice(t('链接已复制', 'Link copied'));
              } catch {
                setError(t('复制失败，请选中网址手动复制。', 'Copy failed. Select the URL to copy it manually.'));
              }
            }}>{t('复制', 'Copy')}</button>
            <a className="button secondary" href={exportUrl} target="_blank" rel="noopener noreferrer">{t('打开', 'Open')}</a>
          </div>
          {platform === 'xiaohongshu' && <p className="fine-print">{t('登录创作服务平台后，在数据中心导出「笔记列表明细表」。', 'Sign in to the Creator Center and export the note list from Analytics.')}</p>}
          {!accounts.length && <p className="fine-print">{t('添加对应的自媒体账号后即可上传导出文件。', 'Add a matching social account to upload the export.')}</p>}
        </div>}
        {mode === 'collect' && accounts.length > 0 && (platform === 'wechat' || platform === 'juejin') &&
          <CreatorReportImport platform={platform} accounts={accounts} wechatAppIds={data?.wechatAppIds} defaultAccountId={selectedAccount?.id} revision={data?.revision || 0} onBusyChange={setBusy} onSaved={finishImport}/>}
        {mode === 'collect' && accounts.length > 0 && platform === 'xiaohongshu' && <XiaohongshuImport accounts={accounts} defaultAccountId={selectedAccount?.id} revision={data?.revision || 0} onBusyChange={setBusy} onSaved={finishImport}/>}
        {mode === 'collect' && accounts.length > 0 && (platform === 'reddit' || platform === 'x') && <SocialArchiveImport key={platform} platform={platform} accounts={accounts} defaultAccountId={selectedAccount?.id} onBusyChange={setBusy} onSaved={finishImport}/>}
      </div>
    </dialog>
  </div>;
}
