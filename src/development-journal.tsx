import { ArrowLeft, ArrowUpRight, ChevronRight, FileText, NotebookPen, Plus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { t } from "./i18n";
import { journalWritingGuide } from "./journal-agent";
import { ListPagination, listPageSize } from "./list-pagination";
import { PlatformLogo } from "./platform-logo";
import { platformCatalog } from "./platforms";
import { now, today, uid, type Data, type JournalEntry } from "./types";

type Save = (update: (data: Data) => void) => Promise<boolean>;
type Draft = Extract<JournalEntry, { kind: "draft" }>;

export function DevelopmentJournal({ entries, save, copy }: {
  entries: JournalEntry[];
  save: Save;
  copy: (text: string) => void;
}) {
  const [date, setDate] = useState(today);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [notePage, setNotePage] = useState(1);
  const [draftPage, setDraftPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openDraft, setOpenDraft] = useState<Draft | null>(null);
  const currentDay = today();
  const selectedDay = new Date(date + "T00:00:00");
  const locale = t("zh-CN", "en-US");
  const ordered = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const notes = ordered.filter(entry => entry.kind === "note");
  const drafts = ordered.filter(entry => entry.kind === "draft");
  const selectedNotes = notes.filter(note => selectedIds.includes(note.id));
  const noteArgs = JSON.stringify(selectedNotes.map(({ date, id }) => ({ date, noteId: id })));
  const notesPage = Math.min(notePage, Math.max(1, Math.ceil(notes.length / listPageSize)));
  const draftsPage = Math.min(draftPage, Math.max(1, Math.ceil(drafts.length / listPageSize)));

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("note")).trim();
    if (!text) return;
    if (await save(data => {
      (data.developmentJournal ??= []).push({ id: uid(), date, createdAt: now(), kind: "note", text });
    })) {
      form.reset();
      setNotePage(1);
    }
  }

  const prompt = t(
    `请通过 Growmory MCP 对下列每组参数分别调用 get_development_journal，只把选中的笔记作为本次开发经历的素材。逐条保留原日期，不要把跨日内容写成同一天发生。
${noteArgs}

草稿归档日期为 ${date}。目标平台为 ${platforms.join("、")}，仅为这些平台各写一篇。

${journalWritingGuide.zh}

逐篇调用 save_development_draft 保存到归档日期，platform 填对应平台名称，每次使用最新 revision。返回各篇标题与正文供我审核。`,
    `Call Growmory MCP get_development_journal separately for each argument below. Use only these notes as source material for the development events and preserve their chronology.
${noteArgs}

Archive drafts under ${date}. Write one draft for each of these platforms only: ${platforms.join(", ")}.

${journalWritingGuide.en}

Save each separately via save_development_draft under the archive date with the corresponding platform name and latest revision. Show me each title and full draft for review.`,
  );

  return <div className="development-journal">
    <header className="journal-masthead">
      <div className="journal-day-stamp" aria-hidden="true">
        <span>{new Intl.DateTimeFormat(locale, { month: "short" }).format(selectedDay)}</span>
        <strong>{date.slice(-2)}</strong>
      </div>
      <div className="journal-masthead-title">
        <p>{date === currentDay ? t("今天", "Today") : t("归档日期", "Archive date")} · {new Intl.DateTimeFormat(locale, { weekday: "long" }).format(selectedDay)}</p>
        <h2>{t("开发手记", "Development journal")}</h2>
        <span>{t(`${notes.length} 条笔记 · ${drafts.length} 篇草稿`, `${notes.length} notes · ${drafts.length} drafts`)}</span>
      </div>
      <div className="journal-date journal-navigation">
        {date !== currentDay && <button type="button" onClick={() => setDate(currentDay)}>{t("回到今天", "Back to today")}</button>}
        <input aria-label={t("新笔记和草稿归档日期", "Archive date for new notes and drafts")} type="date" value={date} onChange={event => { if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value); }} />
      </div>
    </header>
    <div className="journal-columns">
      <section className="journal-section journal-notebook">
        <h2><NotebookPen size={19} aria-hidden="true" />{t("随手记", "Field notes")}</h2>
        <form className="journal-composer" onSubmit={addNote}>
          <textarea name="note" aria-label={t("新笔记", "New note")} required maxLength={2000} rows={4}
            placeholder={t("今天做了什么？卡在哪里？有什么想法想留到以后？", "What did you build, get stuck on, or want to revisit?")} />
          <div className="journal-composer-footer">
            <span>{t("进展、卡点、灵感，都可以先记下来。", "Capture progress, snags, and ideas as they happen.")}</span>
            <button className="button journal-primary"><Plus size={15} aria-hidden="true" />{t("添加笔记", "Add note")}</button>
          </div>
        </form>
        <div className="journal-section-label journal-selection">
          <span>{t("全部笔记", "All notes")}</span>
          <span aria-live="polite">{t(`已选 ${selectedNotes.length} 条`, `${selectedNotes.length} selected`)}</span>
          {selectedNotes.length > 0 && <button className="button secondary small" onClick={() => setSelectedIds([])}>{t("清空选择", "Clear selection")}</button>}
        </div>
        {notes.length === 0 && <p className="journal-empty">{t("还没有笔记。", "No notes yet.")}</p>}
        <ol className="journal-notes">
          {notes.slice((notesPage - 1) * listPageSize, notesPage * listPageSize).map(note => <li key={note.id}>
            <label className="journal-note-choice">
              <input type="checkbox" checked={selectedIds.includes(note.id)} onChange={event => {
                const checked = event.target.checked;
                setSelectedIds(ids => checked ? [...ids, note.id] : ids.filter(id => id !== note.id));
              }} />
              <time dateTime={note.date}>{note.date}</time>
              <span>{note.text}</span>
            </label>
          </li>)}
        </ol>
        <ListPagination page={notesPage} total={notes.length} onPage={setNotePage} />
      </section>
      <section className="journal-section journal-studio">
        <h2><FileText size={19} aria-hidden="true" />{t("平台草稿", "Platform drafts")}</h2>
        <p>{t("勾选一条或多条笔记，再选择目标平台。新草稿会保存到页眉所选日期。", "Select one or more notes, then choose platforms. Drafts are saved under the date in the header.")}</p>
        <fieldset className="journal-platform-picker">
          <legend>{t("目标平台（可多选）", "Target platforms (select multiple)")}</legend>
          {[true, false].map(domestic => {
            const title = domestic ? t("国内平台", "Domestic platforms") : t("海外平台", "International platforms");
            return <div key={title} className="journal-platform-group" role="group" aria-label={title}>
              <span className="journal-platform-group-title" aria-hidden="true">{title}</span>
              <div className="journal-platform-options">
                {platformCatalog.filter(platform => platform.domestic === domestic).map(({ id, name }) => <label key={id}>
                  <input type="checkbox" checked={platforms.includes(name)} onChange={event => {
                    const checked = event.target.checked;
                    setPlatforms(selected => checked ? [...selected, name] : selected.filter(platform => platform !== name));
                  }} />
                  <PlatformLogo platform={id} size={14} />
                  <span>{name}</span>
                </label>)}
              </div>
            </div>;
          })}
        </fieldset>
        <button className="button journal-agent-button" disabled={!selectedNotes.length || !platforms.length} onClick={() => copy(prompt)}>{t("复制 Agent 成稿指令", "Copy agent prompt")}<ArrowUpRight size={15} aria-hidden="true" /></button>
        {drafts.length === 0 && <div className="journal-draft-empty">
          <FileText size={22} aria-hidden="true" />
          <strong>{t("还没有草稿", "No drafts yet")}</strong>
          <span>{notes.length ? t("选好笔记和平台并将指令交给 Agent，保存后的稿件会出现在这里。", "Select notes and platforms and send the prompt to the agent. Saved drafts will appear here.") : t("添加笔记并选择平台后，即可复制成稿指令。", "Add a note and select platforms to unlock the writing prompt.")}</span>
        </div>}
        {drafts.slice((draftsPage - 1) * listPageSize, draftsPage * listPageSize).map(draft =>
          <button className="journal-draft-link" key={draft.id} onClick={() => setOpenDraft(draft)}>
            <span className="journal-platform"><PlatformLogo platform={draft.platform} size={14} />{draft.platform}</span>
            <span><strong>{draft.title}</strong><time dateTime={draft.date}>{draft.date}</time></span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>)}
        <ListPagination page={draftsPage} total={drafts.length} onPage={setDraftPage} />
      </section>
    </div>
    {openDraft && <JournalDraft key={openDraft.id} draft={openDraft} save={save} copy={copy} close={() => setOpenDraft(null)} />}
  </div>;
}

function JournalDraft({ draft, save, copy, close }: { draft: Draft; save: Save; copy: (text: string) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saved, setSaved] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get("title")).trim();
    const platform = String(fields.get("platform")).trim();
    const body = String(fields.get("body")).trim();
    if (!title || !platform || !body) return;
    const changes = { title, platform, body, updatedAt: now() };
    setError("");
    setBusy(true);
    const ok = await save(data => {
      const current = data.developmentJournal?.find(entry => entry.id === saved.id);
      if (current?.kind !== "draft" || current.updatedAt !== saved.updatedAt) {
        throw Error(t("草稿已在其他入口更新，请复制当前修改后重新打开草稿。", "The draft changed elsewhere. Copy your edits before reopening it."));
      }
      Object.assign(current, changes);
    });
    if (ok) setSaved({ ...saved, ...changes });
    else setError(t("保存失败，当前编辑已保留。若草稿已在其他入口更新，请复制修改后重新打开草稿。", "Save failed. Your edits are still here. If the draft changed elsewhere, copy your edits before reopening it."));
    setBusy(false);
  }

  return <dialog ref={dialog} className="marketing-editor journal-detail" aria-labelledby="journal-detail-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <form onSubmit={update}>
      <header>
        <div className="marketing-editor-header-left">
          <button type="button" className="editor-back-btn" onClick={close} disabled={busy}><ArrowLeft size={16} />{t("返回开发日记", "Back to journal")}</button>
          <h1 id="journal-detail-title">{t("开发日记草稿", "Journal draft")}</h1>
        </div>
        <div className="marketing-editor-actions">
          <button type="button" className="button secondary" onClick={() => copy(saved.title + "\n\n" + saved.body)}>{t("复制已保存稿件", "Copy saved draft")}</button>
          <button className="button primary" disabled={busy}>{busy ? t("正在保存…", "Saving…") : t("保存草稿", "Save draft")}</button>
        </div>
      </header>
      {error && <p role="alert" className="notice">{error}</p>}
      <div className="marketing-editor-layout">
        <section className="marketing-writing">
          <input aria-label={t("标题", "Title")} name="title" required maxLength={200} defaultValue={draft.title} />
          <textarea aria-label={t("正文", "Article")} name="body" required maxLength={30000} rows={16} defaultValue={draft.body} />
        </section>
        <aside className="journal-detail-meta">
          <h2>{t("稿件信息", "Draft information")}</h2>
          <label>{t("平台", "Platform")}<input name="platform" required maxLength={80} defaultValue={draft.platform} /></label>
          <p>{t("归档日期", "Archive date")} <time dateTime={draft.date}>{draft.date}</time></p>
        </aside>
      </div>
    </form>
  </dialog>;
}
