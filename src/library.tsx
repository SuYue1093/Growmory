import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRevisions } from "./doc-revisions";
import { DocReview } from "./doc-review";
import { ArrowLeft, BookOpen, Check, Copy, FileText, Folder, History, Pencil, Plus, Search, Trash2, ChevronRight } from "lucide-react";
import type { Data, Doc, DocFolder } from "./types";
import { useI18n } from "./i18n.ts";

type Props = {
  data: Data;
  owner: string;
  setOwner?: (owner: string) => void;
  activeDoc: string | null;
  setActiveDoc: (id: string | null) => void;
  folderId: string;
  setFolderId: (id: string) => void;
  edit: (doc?: Doc, owner?: string, folder?: string) => void;
  editFolder: (folder?: DocFolder, owner?: string, parent?: string) => void;
  deleteFolder: (folder: DocFolder) => void;
  remove: (id: string) => void;
  removeSelected: (ids: string[], onDeleted: () => void) => void;
  confirm: (ids: string[]) => void;
  history: (id: string) => void;
  copy: (text: string) => Promise<void>;
};
export function Library(props: Props) {
  const { t } = useI18n();
  const { data, owner, setOwner, activeDoc, setActiveDoc, folderId, setFolderId } = props;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState("updated");
  useEffect(() => { setSelected([]); }, [owner, folderId, query, status]);
  const ownerLabel = (id: string) => id ? data.products.find(p => p.id === id)?.name.split(/\s[-–—]\s/)[0] || t("未知产品", "Unknown Product") : t("通用资料", "Shared Docs");
  const actualOwner = owner === "shared" ? "" : owner;
  const owned = data.docs.filter(doc => owner === "all" || doc.productId === actualOwner);
  const folders = data.docFolders.filter(folder => folder.productId === actualOwner);
  const folder = folders.find(folder => folder.id === folderId);
  const path: DocFolder[] = [];
  for (let current = folder; current; current = folders.find(f => f.id === current?.parentId)) path.unshift(current);
  const documents = owned.filter(doc => (owner === "all" || (doc.folderId || "") === (folder?.id || "")) && (status === "all" || doc.status === status) && (doc.title + doc.body).toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : b.updatedAt.localeCompare(a.updatedAt));
  const doc = owned.find(doc => doc.id === activeDoc);
  const previous = doc?.reviewBase || doc?.history[0];
  const hasPendingContent = doc?.status === "pending" && (!previous || getRevisions({ title: previous.title ?? doc.title, body: previous.body }, doc).length > 0);
  const targetOwner = owner === "all" ? "" : actualOwner;
  const selectedDocuments = documents.filter(doc => selected.includes(doc.id));
  const selectedPending = selectedDocuments.filter(doc => doc.status === "pending");
  const allSelected = documents.length > 0 && selectedDocuments.length === documents.length;
  const openFolder = (id: string) => { setFolderId(id); setActiveDoc(null); setQuery(""); };
  return <div className="library-workspace">
    {!doc && <div className="library-toolbar">
      {setOwner ? <select aria-label={t("资料范围", "Document scope")} value={owner} onChange={e => { setOwner(e.target.value); setFolderId(""); setActiveDoc(null); setQuery(""); }}><option value="all">{t("全部资料", "All Docs")}</option><option value="shared">{t("通用资料 · 不归属产品", "Shared Docs · Not tied to product")}</option>{data.products.map(product => <option value={product.id} key={product.id}>{ownerLabel(product.id)}</option>)}</select> : <span className="library-owner"><BookOpen size={15}/>{ownerLabel(actualOwner)} {t("资料", "Docs")}</span>}
      <div className="library-search"><Search size={15}/><input aria-label={t("搜索资料", "Search docs")} placeholder={t("搜索标题或正文", "Search title or content")} value={query} onChange={e => { setQuery(e.target.value); setActiveDoc(null); }}/></div>
      <button className="button secondary" onClick={() => props.editFolder(undefined, targetOwner, owner === "all" ? "" : folder?.id || "")}><Folder size={14}/>{t("新建文件夹", "New Folder")}</button>
      <button className="button primary" onClick={() => props.edit(undefined, targetOwner, owner === "all" ? "" : folder?.id || "")}><Plus size={15}/>{t("新建资料", "New Document")}</button>
    </div>}
    {doc ? <section className="panel library-reader">
      <div className="library-reader-top"><button className="text-button muted" onClick={() => setActiveDoc(null)}><ArrowLeft size={15}/>{t("返回资料列表", "Back to Doc List")}</button><div><button className="icon-button" aria-label={t("复制资料正文", "Copy doc content")} onClick={() => void props.copy(doc.body)}><Copy size={16}/></button><button className="icon-button" aria-label={t("文档历史", "Document history")} onClick={() => props.history(doc.id)}><History size={16}/></button><button className="button secondary small" onClick={() => props.edit(doc)}><Pencil size={14}/>{t("编辑资料", "Edit Document")}</button><button className="icon-button danger" aria-label={t("删除文档", "Delete document")} onClick={() => props.remove(doc.id)}><Trash2 size={15}/></button></div></div>
      <div className="library-document-heading"><span>{ownerLabel(doc.productId)} · {new Date(doc.updatedAt).toLocaleDateString("zh-CN")}{doc.source ? ` · ${t("来源:", "Source:")} ${doc.source}` : ""}</span><h2>{doc.title}</h2><span className={`badge ${hasPendingContent ? "pending" : "confirmed"}`}>{hasPendingContent ? t("待确认", "Pending") : t("已确认", "Confirmed")}</span></div>
      {hasPendingContent && <div className="notice"><span>{t("外部资料内容待确认，可在审阅中逐条接受或拒绝。", "External content pending review. You can accept or reject changes individually.")}</span><div style={{ display: "flex", gap: "8px" }}><button className="button secondary small" onClick={() => props.edit(doc)}>{t("审阅批注修订", "Review revisions")}</button><button onClick={() => props.confirm([doc.id])}>{t("确认资料", "Confirm Document")} <Check size={14}/></button></div></div>}
      <div className={`doc-reader-layout ${doc.status === "pending" ? "has-pending" : ""}`}><article className="markdown doc-reader-body" aria-label={t("资料预览", "Document preview")}><ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown></article><DocReview doc={doc}/></div>
    </section> : <>
      <div className="library-summary"><span>{t(`${owned.length} 篇资料`, `${owned.length} documents`)}</span><span>{t(`${owned.filter(doc => doc.status === "pending").length} 篇待确认`, `${owned.filter(doc => doc.status === "pending").length} pending`)}</span>{owner === "all" && <small>{t("新建内容默认保存至通用资料", "New items saved to Shared Docs by default")}</small>}</div>
      <div className="library-filter"><div className="segmented">{[["all", t("全部", "All")], ["pending", t("待确认", "Pending")], ["confirmed", t("已确认", "Confirmed")]].map(([id, label]) => <button key={id} className={status === id ? "active" : ""} onClick={() => setStatus(id)}>{label}</button>)}</div><select aria-label={t("资料排序", "Sort documents")} value={sort} onChange={e => setSort(e.target.value)}><option value="updated">{t("最近更新", "Recently Updated")}</option><option value="title">{t("按标题", "By Title")}</option></select></div>
      {owner !== "all" && <div className="library-breadcrumb"><button onClick={() => openFolder("")}>{t("根目录", "Root")}</button>{path.map(item => <span key={item.id}><ChevronRight size={12}/><button onClick={() => openFolder(item.id)}>{item.name}</button></span>)}</div>}
      {(owner !== "all" || !query) && <div className="library-folders">{(owner === "all" ? data.docFolders.filter(item => !item.parentId) : folders.filter(item => item.parentId === (folder?.id || ""))).filter(item => !query || item.name.toLowerCase().includes(query.toLowerCase())).map(item => <div key={item.id}><button onClick={() => { if (owner === "all") setOwner?.(item.productId || "shared"); openFolder(item.id); }}><Folder size={19}/><span><b>{item.name}</b>{owner === "all" && <small>{ownerLabel(item.productId)}</small>}</span></button><button className="icon-button" aria-label={`${t("重命名", "Rename")} ${item.name}`} onClick={() => props.editFolder(item)}><Pencil size={13}/></button><button className="icon-button danger" aria-label={`${t("删除文件夹", "Delete folder")} ${item.name}`} onClick={() => props.deleteFolder(item)}><Trash2 size={13}/></button></div>)}</div>}
      <section className="panel library-document-list">
        <div className="library-list-head"><label><input type="checkbox" aria-label={t("选择当前列表全部资料", "Select all documents")} checked={allSelected} onChange={e => setSelected(e.target.checked ? documents.map(doc => doc.id) : [])}/>{t("标题", "Title")}</label><span>{t("归属", "Product")}</span><span>{t("状态 / 更新日期", "Status / Updated")}</span></div>
        {documents.map(doc => <div className="library-document-row" key={doc.id}><input aria-label={`${t("选择", "Select")} ${doc.title}`} type="checkbox" checked={selected.includes(doc.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, doc.id] : ids.filter(id => id !== doc.id))}/><button onClick={() => setActiveDoc(doc.id)}><FileText size={17}/><div><b>{doc.title}</b><span className="library-inline-owner">{ownerLabel(doc.productId)}</span><small>{doc.body.replace(/[#*`\n]/g, " ").slice(0, 70)}</small></div></button><span className="library-row-owner">{ownerLabel(doc.productId)}</span><span className="library-row-status"><span className={`badge ${doc.status}`}>{doc.status === "confirmed" ? t("已确认", "Confirmed") : t("待确认", "Pending")}</span><small>{new Date(doc.updatedAt).toLocaleDateString("zh-CN")}</small></span></div>)}
        {!documents.length && <div className="empty"><BookOpen size={25}/><h3>{query ? t("没有匹配的资料", "No matching documents") : t("暂无资料", "No documents yet")}</h3><p>{query ? t("尝试其他关键词或筛选条件。", "Try different keywords or filters.") : actualOwner === "" || owner === "all" ? t("可记录个人介绍、品牌规范等通用资料。", "Record personal intros, brand guidelines, and shared docs.") : t("添加产品介绍、使用场景或操作指南。", "Add product overviews, use cases, or user guides.")}</p></div>}
      </section>
      {selectedDocuments.length > 0 && <div className="asset-selection-bar library-selection-bar">
        <span className="selection-count">
          {t("已选择", "Selected")} <b>{selectedDocuments.length}</b> / {documents.length} {t("篇资料", "documents")}
        </span>
        <div className="selection-actions">
          {!allSelected && <button type="button" className="button secondary small asset-select-all-btn" onClick={() => setSelected(documents.map(doc => doc.id))}>
            {t("全选当前所有", "Select All Filtered")} ({documents.length})
          </button>}
          <button type="button" className="button primary small" disabled={!selectedPending.length} onClick={() => { props.confirm(selectedPending.map(doc => doc.id)); setSelected([]); }}>
            <Check size={14}/>{t("确认所选资料", "Confirm Selected Docs")}
          </button>
          <button type="button" className="button danger small" onClick={() => {
            const ids = selectedDocuments.map(doc => doc.id);
            props.removeSelected(ids, () => setSelected(current => current.filter(id => !ids.includes(id))));
          }}>
            <Trash2 size={14}/>{t("批量删除", "Batch Delete")}
          </button>
          <button type="button" className="text-button" onClick={() => setSelected([])}>{t("取消选择", "Deselect")}</button>
        </div>
      </div>}
    </>}
  </div>;
}
