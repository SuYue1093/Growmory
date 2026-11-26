import { useState } from "react";
import { ArrowLeft, Check, Clock, FileText } from "lucide-react";
import type { Data, Doc } from "./types";
import { RichDocEditor } from "./rich-doc-editor";
import { acceptManualEdit, getRevisions, mergeRevisions, resolveRevision, type ReviewVersion, type Revision } from "./doc-revisions";
import { useI18n } from "./i18n.ts";

export type DocEditorProps = {
  doc?: Doc;
  initialProductId: string;
  initialFolderId: string;
  data: Data;
  onSave: (docData: { id?: string; productId: string; folderId: string; title: string; body: string; source: string; reviewBase?: ReviewVersion; reviewChanges?: Doc["reviewChanges"]; status?: "pending" | "confirmed" }) => Promise<boolean | void>;
  onCancel: () => void;
  onConfirm?: (docId: string) => Promise<boolean | void>;
};

export function DocEditor({ doc, initialProductId, initialFolderId, data, onSave, onCancel }: DocEditorProps) {
  const { t } = useI18n();
  const original = { title: doc?.title || "", body: doc?.body || "" };
  const [current, setCurrent] = useState(original);
  const [base, setBase] = useState<ReviewVersion>(() => (doc?.status === "pending" ? doc.reviewBase : undefined) || (doc?.status === "pending" && doc.history[0] ? { title: doc.history[0].title ?? original.title, body: doc.history[0].body } : original));
  const [productId, setProductId] = useState(doc?.productId ?? initialProductId);
  const [folderId, setFolderId] = useState(doc?.folderId ?? initialFolderId);
  const source = t("手动编辑", "Manual Edit");
  const [editTime, setEditTime] = useState(doc?.updatedAt || new Date().toISOString());
  const [edited, setEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeRevision, setActiveRevision] = useState<string | null>(null);
  const [processed, setProcessed] = useState(false);
  const rawRevisions = getRevisions(base, current);
  const [originalChanges] = useState(() => doc?.reviewChanges || getRevisions(base, original).map(revision => ({ ...revision, source: doc?.source || t("未记录来源", "Unrecorded source"), at: doc?.updatedAt || editTime })));
  const metadata = (revision: Revision) => {
    const item = originalChanges.find(item => item.field === revision.field && item.before === revision.before && item.after === revision.after) || originalChanges.find(item => item.field === revision.field && (revision.before || revision.after) && item.before.includes(revision.before) && item.after.includes(revision.after));
    return { source: item?.source || source || t("待填写", "Pending"), at: item?.at || editTime };
  };
  const revisions = mergeRevisions(base, current, rawRevisions, revision => { const item = metadata(revision); return `${item.source}\n${item.at}`; });
  const revisionMetadata = (revision: Revision) => metadata(rawRevisions.find(item => item.id === revision.id) || revision);
  const selectRevision = (id: string) => {
    setActiveRevision(id);
    requestAnimationFrame(() => document.getElementById(`revision-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };
  const change = (field: "title" | "body", value: string) => {
    const next = { ...current, [field]: value };
    setBase(acceptManualEdit(base, current, next));
    setCurrent(next);
    setProcessed(true);
    setEdited(true); setEditTime(new Date().toISOString());
  };
  const resolve = (revision: Revision, accept: boolean) => {
    const next = resolveRevision(base, current, revision, accept);
    setBase(next.base); setCurrent(next.current); setProcessed(true); setActiveRevision(null);
  };
  const resolveAll = (accept: boolean) => {
    if (accept) setBase({ ...current }); else setCurrent({ ...base });
    setProcessed(true); setActiveRevision(null);
  };
  const save = async () => {
    if (!current.title.trim()) { setError(t("请填写资料标题", "Please enter a document title")); return; }
    if (!current.body.trim()) { setError(t("请填写资料正文", "Please enter document content")); return; }
    setSaving(true); setError("");
    try {
      const ok = await onSave({ id: doc?.id, productId, folderId, ...current, source: edited ? source.trim() : doc?.source || source.trim(), reviewBase: base, reviewChanges: revisions.map(revision => ({ field: revision.field, before: revision.before, after: revision.after, ...revisionMetadata(revision) })), status: revisions.length ? "pending" : "confirmed" });
      if (ok === false) setError(t("保存失败，请重试", "Failed to save, please try again"));
    } catch (error) { setError(error instanceof Error ? error.message : t("保存失败", "Failed to save")); }
    finally { setSaving(false); }
  };
  const folders = data.docFolders.filter(folder => folder.productId === productId);
  const path = (id: string): string => {
    const folder = folders.find(item => item.id === id);
    return folder ? (folder.parentId ? path(folder.parentId) + " / " : "") + folder.name : "";
  };
  return <div className="doc-studio">
    <header className="doc-studio-header">
      <button className="text-button muted" disabled={saving} onClick={onCancel}><ArrowLeft size={16}/>{t("返回资料库", "Back to Library")}</button>
      <span className="doc-studio-state">{revisions.length ? t(`${revisions.length} 处待审修订`, `${revisions.length} pending revisions`) : processed ? t("修订已处理，待保存", "Revisions resolved, ready to save") : t("编辑资料", "Edit Document")}</span>
      <div><button className="button secondary" disabled={saving} onClick={onCancel}>{t("取消", "Cancel")}</button><button className="button primary" disabled={saving} onClick={() => void save()}><Check size={15}/>{saving ? t("保存中…", "Saving...") : t("保存资料", "Save Document")}</button></div>
    </header>
    {error && <p role="alert" className="doc-editor-error-banner">{error}</p>}
    <div className="doc-studio-workspace">
      <section className="doc-studio-paper">
        <div className="doc-studio-location"><FileText size={15}/><select aria-label={t("资料归属", "Product / Scope")} value={productId} onChange={event => { setProductId(event.target.value); setFolderId(""); }}><option value="">{t("通用资料", "Shared Docs")}</option>{data.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select><span>/</span><select aria-label={t("所属文件夹", "Folder")} value={folderId} onChange={event => setFolderId(event.target.value)}><option value="">{t("根目录", "Root Directory")}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{path(folder.id)}</option>)}</select></div>
        <input className="doc-studio-title" aria-label={t("标题", "Title")} placeholder={t("资料标题", "Document Title")} value={current.title} onChange={event => change("title", event.target.value)}/>
        <RichDocEditor revisions={revisions} activeRevision={activeRevision} onSelectRevision={selectRevision} value={current.body} onChange={value => change("body", value)}/>
        <footer className="doc-studio-footer"><span>{current.body.length} {t("字符", "chars")}</span><span>{t("支持 Markdown 输入快捷格式 · 修改后请保存", "Supports Markdown formatting · Remember to save changes")}</span></footer>
      </section>
      <aside className="doc-studio-sidebar" aria-label={t("修订审阅", "Review Revisions")}>
        <section className="doc-studio-review"><div className="doc-studio-review-heading"><h3>{t("修订记录", "Revision History")}</h3><span>{revisions.length}</span></div><p className="doc-studio-help">{t("仅审阅外部内容修改；格式调整与手动输入直接接受，无需批注。", "Only external edits require review; formatting and manual edits are applied directly.")}</p>
          <div className="doc-studio-batch"><button className="button secondary small" disabled={!revisions.length || saving} onClick={() => resolveAll(true)}>{t("全部接受", "Accept All")}</button><button className="button secondary small" disabled={!revisions.length || saving} onClick={() => resolveAll(false)}>{t("全部拒绝", "Reject All")}</button></div>
          {!revisions.length && <div className="doc-studio-empty"><Check size={22}/><b>{t("暂无待审修订", "No Pending Revisions")}</b><p>{processed ? t("处理已完成，保存后生效。", "Processing complete, save to apply.") : t("手动编辑直接接受；外部内容修改会在这里显示。", "Manual edits are accepted directly; external changes appear here.")}</p></div>}
          {revisions.map((revision, index) => <article id={`revision-${revision.id}`} key={revision.id} className={`doc-studio-revision ${activeRevision === revision.id ? "active" : ""}`} onClick={() => { setActiveRevision(revision.id); document.querySelector(`[data-revision-id="${revision.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>
            <header><b>{revision.field === "title" ? t("标题", "Title") : `${t("正文", "Body")} ${index + 1}`} · {revision.before && revision.after ? t("修改", "Edit") : revision.before ? t("删除", "Delete") : t("新增", "Add")}</b></header>
            <div className="doc-studio-revision-meta"><Clock size={12}/><time dateTime={revisionMetadata(revision).at}>{new Date(revisionMetadata(revision).at).toLocaleString("zh-CN")}</time></div>
            <p className="doc-studio-revision-source">{t("来源：", "Source: ")}{revisionMetadata(revision).source}</p>
            {revision.before && <div className="doc-studio-before"><small>{t("原内容", "Original")}</small><del>{revision.before}</del></div>}
            {revision.after && <div className="doc-studio-after"><small>{t("新内容", "New")}</small><ins>{revision.after}</ins></div>}
            <footer><button disabled={saving} className="text-button" aria-label={`${t("接受修订", "Accept revision")} ${index + 1}`} onClick={() => resolve(revision, true)}>{t("接受", "Accept")}</button><button disabled={saving} className="text-button danger" aria-label={`${t("拒绝修订", "Reject revision")} ${index + 1}`} onClick={() => resolve(revision, false)}>{t("拒绝", "Reject")}</button></footer>
          </article>)}
        </section>
      </aside>
    </div>
  </div>;
}
