import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getRevisions, mergeRevisions, type Revision } from "./doc-revisions";
import type { Doc } from "./types";
import { useI18n } from "./i18n.ts";

export function DocReview({ doc }: { doc: Doc }) {
  const { t } = useI18n();
  const previous = doc.reviewBase || doc.history[0];
  if (doc.status !== "pending" || !previous) return null;
  const base = { title: previous.title ?? doc.title, body: previous.body };
  const metadata = (rev: Revision) => doc.reviewChanges?.find(item => item.field === rev.field && item.before.includes(rev.before) && item.after.includes(rev.after)) || { source: doc.source || t("未记录来源", "Unrecorded source"), at: doc.updatedAt };
  const revisions = mergeRevisions(base, doc, getRevisions(base, doc), revision => { const item = metadata(revision); return `${item.source}\n${item.at}`; });
  if (!revisions.length) return null;
  return <aside className="doc-reader-revisions" aria-label={t("修订批注", "Revisions & Comments")}><h3>{t("待审修订", "Pending Revisions")} <span>{revisions.length}</span></h3><p>{t("正文展示当前版本，以下为外部内容修改。", "The document shows the current version; external edits are listed below.")}</p>{revisions.map((rev, index) => <article key={rev.id} className="doc-studio-revision">
    <header><b>{rev.field === "title" ? t("标题", "Title") : `${t("正文", "Body")} ${index + 1}`} · {rev.before && rev.after ? t("修改", "Edit") : rev.before ? t("删除", "Delete") : t("新增", "Add")}</b></header>
    <time dateTime={metadata(rev).at}>{new Date(metadata(rev).at).toLocaleString("zh-CN")}</time>
    <p className="doc-studio-revision-source">{t("来源：", "Source: ")}{metadata(rev).source}</p>
    {rev.before && <div className="doc-studio-before markdown"><small>{t("原内容", "Original")}</small><ReactMarkdown remarkPlugins={[remarkGfm]}>{rev.before}</ReactMarkdown></div>}
    {rev.after && <div className="doc-studio-after markdown"><small>{t("新内容", "New")}</small><ReactMarkdown remarkPlugins={[remarkGfm]}>{rev.after}</ReactMarkdown></div>}
  </article>)}</aside>;
}
