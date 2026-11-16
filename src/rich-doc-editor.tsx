import { useEffect } from "react";
import { Pilcrow, Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, List, ListOrdered, ListTodo, Quote, Code, Table2, Undo2, Redo2 } from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { InlineRevisions, decorateRevisions } from "./doc-inline-revisions";
import type { Revision } from "./doc-revisions";
import { useI18n } from "./i18n.ts";

export function RichDocEditor({ value, onChange, revisions, activeRevision, onSelectRevision }: { value: string; onChange: (value: string) => void; revisions: Revision[]; activeRevision: string | null; onSelectRevision: (id: string) => void }) {
  const { t } = useI18n();
  const editor = useEditor({
    extensions: [InlineRevisions, StarterKit, Markdown, TableKit, TaskList, TaskItem.configure({ nested: true }), Image],
    content: value,
    contentType: "markdown",
    editorProps: { attributes: { class: "markdown doc-rich-content", role: "textbox", "aria-label": t("文档正文", "Document content"), "aria-multiline": "true" } },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
  });
  useEffect(() => {
    if (editor && editor.getMarkdown() !== value) editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (!editor.view.composing) decorateRevisions(editor, value, revisions, activeRevision);
    let frame = 0;
    const finishComposition = () => {
      frame = requestAnimationFrame(() => {
        if (!editor.isDestroyed) decorateRevisions(editor, editor.getMarkdown(), revisions, activeRevision);
      });
    };
    const dom = editor.view.dom;
    dom.addEventListener("compositionend", finishComposition);
    return () => { dom.removeEventListener("compositionend", finishComposition); cancelAnimationFrame(frame); };
  }, [editor, value, revisions, activeRevision]);
  const selectMarker = (target: EventTarget | null) => {
    const id = target instanceof Element ? target.closest<HTMLElement>("[data-revision-id]")?.dataset.revisionId : undefined;
    if (id) onSelectRevision(id);
  };
  const headingLevel = useEditorState({ editor, selector: ({ editor }) => {
    if (!editor) return 0;
    return ([1, 2, 3] as const).find(level => editor.isActive("heading", { level })) || 0;
  } }) ?? 0;
  const headingActions = [
    { level: 0, label: t("正文", "Body"), icon: Pilcrow },
    { level: 1, label: t("一级标题", "H1"), icon: Heading1 },
    { level: 2, label: t("二级标题", "H2"), icon: Heading2 },
    { level: 3, label: t("三级标题", "H3"), icon: Heading3 },
  ] as const;
  const groups = [
    { label: t("文字格式", "Text Format"), actions: [
    { label: t("加粗", "Bold"), icon: Bold, active: editor?.isActive("bold"), run: () => editor?.chain().focus().toggleBold().run() },
    { label: t("斜体", "Italic"), icon: Italic, active: editor?.isActive("italic"), run: () => editor?.chain().focus().toggleItalic().run() },
    { label: t("删除线", "Strikethrough"), icon: Strikethrough, active: editor?.isActive("strike"), run: () => editor?.chain().focus().toggleStrike().run() },
    ] },
    { label: t("列表", "Lists"), actions: [
    { label: t("列表", "Bullet"), icon: List, active: editor?.isActive("bulletList"), run: () => editor?.chain().focus().toggleBulletList().run() },
    { label: t("编号", "Number"), icon: ListOrdered, active: editor?.isActive("orderedList"), run: () => editor?.chain().focus().toggleOrderedList().run() },
    { label: t("待办", "Task"), icon: ListTodo, active: editor?.isActive("taskList"), run: () => editor?.chain().focus().toggleTaskList().run() },
    ] },
    { label: t("内容插入", "Insert"), actions: [
    { label: t("引用", "Quote"), icon: Quote, active: editor?.isActive("blockquote"), run: () => editor?.chain().focus().toggleBlockquote().run() },
    { label: t("代码", "Code"), icon: Code, active: editor?.isActive("codeBlock"), run: () => editor?.chain().focus().toggleCodeBlock().run() },
    { label: t("表格", "Table"), icon: Table2, active: editor?.isActive("table"), run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    ] },
    { label: t("撤销重做", "History"), actions: [
    { label: t("撤销", "Undo"), icon: Undo2, run: () => editor?.chain().focus().undo().run() },
    { label: t("重做", "Redo"), icon: Redo2, run: () => editor?.chain().focus().redo().run() },
    ] },
  ];
  return <div className="doc-rich-editor" onClick={event => selectMarker(event.target)} onKeyDown={event => { if (event.key === "Enter" && event.target instanceof Element && event.target.matches(".doc-inline-deleted")) { event.preventDefault(); selectMarker(event.target); } }}>
    <div className="doc-format-toolbar" role="toolbar" aria-label={t("正文格式", "Text formatting")}>
      <div className="doc-format-group" role="group" aria-label={t("段落样式", "Paragraph styles")}>
        <span className="doc-format-group-label" aria-hidden="true">{t("段落样式", "Styles")}</span>
        <div className="doc-format-group-actions">
          {headingActions.map(action => <button type="button" key={action.level} aria-pressed={headingLevel === action.level} className={headingLevel === action.level ? "active" : ""} onMouseDown={event => event.preventDefault()} onClick={() => {
            if (action.level === 0) editor?.chain().focus().setParagraph().run();
            else editor?.chain().focus().setHeading({ level: action.level }).run();
          }}><action.icon size={14} aria-hidden="true"/><span>{action.label}</span></button>)}
        </div>
      </div>
      {groups.map(group => <div className="doc-format-group" role="group" aria-label={group.label} key={group.label}>
        <span className="doc-format-group-label" aria-hidden="true">{group.label}</span>
        <div className="doc-format-group-actions">{group.actions.map(action => <button type="button" key={action.label} aria-pressed={"active" in action ? action.active ?? false : false} className={"active" in action && action.active ? "active" : ""} onMouseDown={event => event.preventDefault()} onClick={action.run}><action.icon size={14} aria-hidden="true"/><span>{action.label}</span></button>)}</div>
      </div>)}
    </div>
    <EditorContent editor={editor}/>
  </div>;
}
