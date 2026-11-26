import { useEffect, useRef, useState } from "react";
import { now, uid, type Data, type Product, type StoreLink, type StoreVersion } from "./types";
import { useI18n, t as globalT } from "./i18n.ts";

const STORE_STATE_MAP: Record<string, string> = {
  READY_FOR_SALE: "已上架",
  READY_FOR_DISTRIBUTION: "已上架",
  PREPARE_FOR_SUBMISSION: "准备提交",
  READY_FOR_REVIEW: "准备审核",
  WAITING_FOR_REVIEW: "等待审核",
  IN_REVIEW: "审核中",
  PENDING_DEVELOPER_RELEASE: "等待开发者发布",
  PENDING_APPLE_RELEASE: "等待 Apple 发布",
  REJECTED: "审核被拒",
  METADATA_REJECTED: "元数据被拒",
  DEVELOPER_REJECTED: "开发者撤回",
  REMOVED_FROM_SALE: "已下架",
  DEVELOPER_REMOVED_FROM_SALE: "开发者下架",
  PROCESSING_FOR_APP_STORE: "处理中",
  REPLACED_WITH_NEW_VERSION: "已被新版替代",
};

export const storeState = (state: string, t = globalT) => {
  const zh = STORE_STATE_MAP[state] || state || "未知状态";
  return t(zh);
};

type AppleApp = { id: string; name: string; bundleId: string };
async function read(path: string) {
  const r = await fetch(`/api/app-store-connect/${path}`, { method: "POST" });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || "读取商店信息失败");
  return result;
}
function Version({ version, previous, onCreate, exists }: { version: StoreVersion; previous?: StoreVersion; onCreate?: () => void; exists?: boolean }) {
  const { t } = useI18n();
  return <article className="store-version">
    <div className="asc-actions"><h3>{version.version} · {version.platform}</h3><span className="count">{storeState(version.state, t)}</span>{onCreate && <button className="button secondary small" disabled={exists} onClick={onCreate}>{exists ? t("已创建准备记录", "Draft created") : t("创建本机准备记录", "Create local draft")}</button>}</div>
    {previous && previous.state !== version.state && <p className="fine-print">{t("状态变化：", "Status change: ")}{storeState(previous.state, t)} → {storeState(version.state, t)}</p>}
    {!previous && <p className="fine-print">{t("新增商店版本", "New store version")}</p>}
    {version.notes.length === 0 && <p className="fine-print">{t("此版本暂无多语言更新说明。", "No localized notes for this version.")}</p>}
    {version.notes.map(note => { const old = previous?.notes.find(n => n.locale === note.locale); return <details key={note.locale}><summary>{note.locale}{old && old.body !== note.body ? t(" · 更新说明有变化", " · Notes changed") : !old ? t(" · 新增语言", " · New locale") : t(" · 无变化", " · Unchanged")}</summary>{old && old.body !== note.body && <><b>{t("上次同步", "Last Synced")}</b><pre className="store-note">{old.body || t("（空）", "(empty)")}</pre><b>{t("当前商店", "Current Store")}</b></>}<pre className="store-note">{note.body || t("（暂无更新说明）", "(no notes)")}</pre></details>; })}
    {previous?.notes.filter(n => !version.notes.some(x => x.locale === n.locale)).map(n => <p key={n.locale} className="fine-print">{t("已移除语言：", "Removed locale: ")}{n.locale}</p>)}
  </article>;
}
export function ProductAppStore({ product, data, save, notify, openRelease }: { product: Product; data: Data; save: (mut: (d: Data) => void) => Promise<boolean>; notify: (s: string) => void; openRelease: (id: string) => void }) {
  const { t } = useI18n();
  const [apps, setApps] = useState<AppleApp[] | null>(null);
  const [selection, setSelection] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<StoreLink | null>(null);
  const [adoptName, setAdoptName] = useState(false);
  const [adoptId, setAdoptId] = useState(false);
  const base = useRef("");
  const link = product.appStore;
  const linkJSON = JSON.stringify(link);
  useEffect(() => { setPreview(null); setError(""); }, [linkJSON]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function current(d: Data) {
    const p = d.products.find(p => p.id === product.id);
    if (!p || JSON.stringify(p.appStore) !== base.current) throw Error(t("产品关联或商店快照已改变，请重新读取后操作。", "Connection or snapshot changed; refresh and try again."));
    return p;
  }
  async function fetchPreview() {
    const app = apps?.find(a => a.id === selection);
    const appId = app?.id || link?.appId;
    if (!appId) throw Error(t("请先选择 Apple App。", "Please select an Apple App first."));
    base.current = linkJSON;
    setPreview(null); setAdoptName(false); setAdoptId(false);
    const result = await read(`apps/${appId}/versions`);
    setPreview({ ...result, name: app?.name || link!.name, bundleId: app?.bundleId || link!.bundleId });
  }
  async function apply() {
    if (!preview) return;
    const ok = await save(d => {
      const p = current(d);
      if ((adoptName && p.name !== product.name) || (adoptId && p.appId !== product.appId)) throw Error(t("本机产品资料已改变，请核对后重试。", "Local product data changed; verify and try again."));
      p.appStore = preview;
      if (adoptName) p.name = preview.name;
      if (adoptId) p.appId = preview.appId;
    });
    if (ok) { setPreview(null); setSelection(""); notify(t("商店信息已保存，本机版本草稿已保留", "Store information saved, local drafts preserved")); }
  }
  async function create(version: StoreVersion) {
    let created = "";
    const ok = await save(d => {
      const p = d.products.find(p => p.id === product.id);
      if (!p?.appStore || p.appStore.appId !== link?.appId || JSON.stringify(p.appStore.versions.find(v => v.id === version.id)) !== JSON.stringify(version)) throw Error(t("商店快照已改变，请核对后重试。", "Store snapshot changed; verify and try again."));
      if (d.releases.some(r => r.productId === p.id && r.storeSource?.appId === link?.appId && r.storeSource?.versionId === version.id)) throw Error(t("此商店版本已有本机准备记录。", "This store version already has a local draft."));
      created = uid();
      d.releases.push({ id: created, productId: p.id, version: version.version, changes: "", languages: version.notes.length ? version.notes.map(n => n.locale) : ["中文"], channels: ["App Store"], status: "preparing", createdAt: now(), notes: version.notes.map(n => ({ language: n.locale, body: n.body, approved: false })), proposals: [], storeSource: { appId: link!.appId, versionId: version.id, platform: version.platform } });
    });
    if (ok) { notify(t("已创建准备记录，更新说明待审核", "Draft created; notes pending review")); openRelease(created); }
  }
  return <section className="panel padded store-panel">
    <h2>{t("App Store 关联与同步", "App Store Connection & Sync")}</h2>
    <p className="body-copy">{link ? `${link.name} · ${link.appId} · ${link.bundleId}` : t("尚未关联 Apple App。选择账号下的 App，预览商店信息后保存关联。", "No Apple App connected yet. Select an App from your account, preview store info, and save connection.")}</p>
    {link && <p className="fine-print">{t("上次同步：", "Last synced: ")}{new Date(link.syncedAt).toLocaleString()} · {t("刷新失败会保留已保存数据", "Saved data preserved on refresh failure")}</p>}
    <fieldset className="asc-fields" disabled={busy}>
      <div className="asc-actions"><button className="button secondary" onClick={() => void run(async () => { const result = await read("apps"); setApps(result.apps); setSelection(""); })}>{link ? t("选择 / 更换关联", "Select / Switch App") : t("读取可关联 App", "Fetch Apps")}</button>{link && <><button className="button primary" onClick={() => void run(fetchPreview)}>{t("刷新并预览差异", "Refresh & Preview Diff")}</button><button className="text-button" onClick={() => void run(async () => { base.current = linkJSON; if (await save(d => { delete current(d).appStore; })) { setPreview(null); setSelection(""); notify(t("关联已解除，本机版本记录保留", "Disconnected, local release history preserved")); } })}>{t("解除关联", "Disconnect")}</button></>}</div>
      {apps && <label className="field"><span>{t("选择 Apple App", "Select Apple App")}</span><select value={selection} onChange={e => { setSelection(e.target.value); setPreview(null); }}><option value="">{t("请选择", "Please select")}</option>{apps.map(app => <option key={app.id} value={app.id}>{app.name} · {app.id} · {app.bundleId}</option>)}</select></label>}
      {apps?.length === 0 && <p>{t("此密钥下暂无可访问的 App。", "No accessible apps found for this key.")}</p>}
      {selection && <button className="button secondary" onClick={() => void run(fetchPreview)}>{t("预览所选 App", "Preview Selected App")}</button>}
    </fieldset>
    {busy && <p role="status">{t("正在读取或保存，请稍候…", "Reading or saving, please wait...")}</p>}
    {error && <p role="alert">{error}</p>}
    {preview && <div className="store-preview"><h3>{t("同步预览 · ", "Sync Preview · ")}{preview.name}</h3><p className="fine-print">{t("确认后更新关联与商店快照；本机草稿保持原样。", "Confirm to update connection and store snapshot; local drafts remain unchanged.")}</p>
      {preview.name !== product.name && <label className="store-adopt"><input type="checkbox" checked={adoptName} onChange={e => setAdoptName(e.target.checked)} />{t("采用商店名称：", "Adopt store name: ")}{product.name} → {preview.name}</label>}
      {preview.appId !== product.appId && <label className="store-adopt"><input type="checkbox" checked={adoptId} onChange={e => setAdoptId(e.target.checked)} />{t("采用 App Store ID：", "Adopt App Store ID: ")}{product.appId || t("未填写", "Unfilled")} → {preview.appId}</label>}
      {preview.versions.length === 0 && <p>{t("此 App 暂无商店版本，仍可保存关联。", "This App has no store versions yet, but can still be connected.")}</p>}
      {preview.versions.map(v => <Version key={v.id} version={v} previous={preview.appId === link?.appId ? link.versions.find(x => x.id === v.id) : undefined} />)}
      {preview.appId === link?.appId && link.versions.filter(v => !preview.versions.some(x => x.id === v.id)).map(v => <p key={v.id}>{t("商店已不再返回：", "No longer returned by store: ")}{v.version} · {v.platform}{t("；本机准备记录将保留。", "; local draft records preserved.")}</p>)}
      <div className="asc-actions"><button className="button primary" disabled={busy} onClick={() => void run(apply)}>{t("确认保存商店信息", "Confirm & Save Store Info")}</button><button className="button secondary" disabled={busy} onClick={() => setPreview(null)}>{t("取消预览", "Cancel Preview")}</button></div>
    </div>}
    <h3>{t("已保存的商店版本 · ", "Saved Store Versions · ")}{link?.versions.length || 0}</h3>
    {link && link.versions.length === 0 && <p className="fine-print">{t("暂无商店版本。", "No store versions yet.")}</p>}
    {link?.versions.map(v => <Version key={v.id} version={v} previous={v} exists={data.releases.some(r => r.productId === product.id && r.storeSource?.appId === link.appId && r.storeSource?.versionId === v.id)} onCreate={busy ? undefined : () => void run(() => create(v))} />)}
  </section>;
}
