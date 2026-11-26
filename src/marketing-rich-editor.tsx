import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Table2,
  Undo2,
  Redo2,
  ImagePlus,
} from "lucide-react";
import { EditorContent, mergeAttributes, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import type { Asset } from "./types.ts";
import { useI18n } from "./i18n.ts";
import { resolveImageSrc } from "./marketing-rich-copy.ts";

export interface MarketingRichEditorHandle {
  insertImage: (src: string, alt?: string) => void;
  focus: () => void;
}

interface MarketingRichEditorProps {
  value: string;
  onChange: (value: string) => void;
  assets: Asset[];
  disabled?: boolean;
  onOpenAssetPicker?: () => void;
}

export const MarketingRichEditor = forwardRef<MarketingRichEditorHandle, MarketingRichEditorProps>(
  function MarketingRichEditor({ value, onChange, assets, disabled = false, onOpenAssetPicker }, ref) {
    const { t } = useI18n();
    const assetsRef = useRef(assets);
    assetsRef.current = assets;

    const ResolvedImage = useMemo(
      () =>
        Image.extend({
          renderHTML({ HTMLAttributes }) {
            const rawSrc = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
            const displaySrc = resolveImageSrc(rawSrc, assetsRef.current);
            return [
              "img",
              mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
                src: displaySrc,
                "data-asset-src": rawSrc,
              }),
            ];
          },
        }),
      [],
    );

    const editor = useEditor({
      extensions: [
        StarterKit,
        Markdown,
        TableKit,
        TaskList,
        TaskItem.configure({ nested: true }),
        ResolvedImage.configure({ inline: false, allowBase64: true }),
      ],
      content: value,
      contentType: "markdown",
      editable: !disabled,
      editorProps: {
        attributes: {
          class: "markdown marketing-rich-content",
          role: "textbox",
          "aria-label": t("营销正文", "Article Body"),
          "aria-multiline": "true",
        },
      },
      onUpdate: ({ editor: ed }) => {
        onChange(ed.getMarkdown());
      },
    });

    useEffect(() => {
      if (!editor) return;
      editor.setEditable(!disabled);
    }, [editor, disabled]);

    useEffect(() => {
      if (editor && editor.getMarkdown() !== value) {
        editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
      }
    }, [editor, value]);

    // Refresh inline <img> src attributes if an asset's in-memory data changes after mount.
    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      const imgs = editor.view.dom.querySelectorAll<HTMLImageElement>("img[data-asset-src]");
      imgs.forEach((img) => {
        const raw = img.getAttribute("data-asset-src") || "";
        const nextSrc = resolveImageSrc(raw, assets);
        if (nextSrc && img.getAttribute("src") !== nextSrc) {
          img.setAttribute("src", nextSrc);
        }
      });
    }, [editor, assets]);

    useImperativeHandle(
      ref,
      () => ({
        insertImage(src: string, alt = "") {
          if (!editor) return;
          editor
            .chain()
            .focus()
            .insertContent([
              { type: "image", attrs: { src, alt } },
              { type: "paragraph" },
            ])
            .run();
        },
        focus() {
          editor?.chain().focus().run();
        },
      }),
      [editor],
    );

    const headingLevel =
      useEditorState({
        editor,
        selector: ({ editor: ed }) => {
          if (!ed) return 0;
          return ([1, 2, 3] as const).find((level) => ed.isActive("heading", { level })) || 0;
        },
      }) ?? 0;

    const headingActions = [
      { level: 0, label: t("正文", "Body"), icon: Pilcrow },
      { level: 1, label: t("一级标题", "H1"), icon: Heading1 },
      { level: 2, label: t("二级标题", "H2"), icon: Heading2 },
      { level: 3, label: t("三级标题", "H3"), icon: Heading3 },
    ] as const;

    const groups = [
      {
        label: t("文字格式", "Text Format"),
        actions: [
          {
            label: t("加粗", "Bold"),
            icon: Bold,
            active: editor?.isActive("bold"),
            run: () => editor?.chain().focus().toggleBold().run(),
          },
          {
            label: t("斜体", "Italic"),
            icon: Italic,
            active: editor?.isActive("italic"),
            run: () => editor?.chain().focus().toggleItalic().run(),
          },
          {
            label: t("删除线", "Strikethrough"),
            icon: Strikethrough,
            active: editor?.isActive("strike"),
            run: () => editor?.chain().focus().toggleStrike().run(),
          },
        ],
      },
      {
        label: t("列表", "Lists"),
        actions: [
          {
            label: t("列表", "Bullet"),
            icon: List,
            active: editor?.isActive("bulletList"),
            run: () => editor?.chain().focus().toggleBulletList().run(),
          },
          {
            label: t("编号", "Number"),
            icon: ListOrdered,
            active: editor?.isActive("orderedList"),
            run: () => editor?.chain().focus().toggleOrderedList().run(),
          },
        ],
      },
      {
        label: t("内容插入", "Insert"),
        actions: [
          {
            label: t("引用", "Quote"),
            icon: Quote,
            active: editor?.isActive("blockquote"),
            run: () => editor?.chain().focus().toggleBlockquote().run(),
          },
          {
            label: t("代码", "Code"),
            icon: Code,
            active: editor?.isActive("codeBlock"),
            run: () => editor?.chain().focus().toggleCodeBlock().run(),
          },
          {
            label: t("表格", "Table"),
            icon: Table2,
            active: editor?.isActive("table"),
            run: () => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
          },
        ],
      },
      {
        label: t("撤销重做", "History"),
        actions: [
          { label: t("撤销", "Undo"), icon: Undo2, run: () => editor?.chain().focus().undo().run() },
          { label: t("重做", "Redo"), icon: Redo2, run: () => editor?.chain().focus().redo().run() },
        ],
      },
    ];

    return (
      <div className="marketing-rich-editor doc-rich-editor">
        <div className="doc-format-toolbar" role="toolbar" aria-label={t("正文格式", "Text formatting")}>
          <div className="doc-format-group" role="group" aria-label={t("段落样式", "Paragraph styles")}>
            <span className="doc-format-group-label" aria-hidden="true">
              {t("段落样式", "Styles")}
            </span>
            <div className="doc-format-group-actions">
              {headingActions.map((action) => (
                <button
                  type="button"
                  key={action.level}
                  disabled={disabled}
                  aria-pressed={headingLevel === action.level}
                  className={headingLevel === action.level ? "active" : ""}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (action.level === 0) editor?.chain().focus().setParagraph().run();
                    else editor?.chain().focus().setHeading({ level: action.level }).run();
                  }}
                >
                  <action.icon size={14} aria-hidden="true" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {groups.map((group) => (
            <div className="doc-format-group" role="group" aria-label={group.label} key={group.label}>
              <span className="doc-format-group-label" aria-hidden="true">
                {group.label}
              </span>
              <div className="doc-format-group-actions">
                {group.actions.map((action) => (
                  <button
                    type="button"
                    key={action.label}
                    disabled={disabled}
                    aria-pressed={"active" in action ? (action.active ?? false) : false}
                    className={"active" in action && action.active ? "active" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={action.run}
                  >
                    <action.icon size={14} aria-hidden="true" />
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {onOpenAssetPicker && (
            <div className="doc-format-group" role="group" aria-label={t("插图", "Media")}>
              <span className="doc-format-group-label" aria-hidden="true">
                {t("插图", "Media")}
              </span>
              <div className="doc-format-group-actions">
                <button
                  type="button"
                  disabled={disabled}
                  className="marketing-insert-img-toolbar-btn"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={onOpenAssetPicker}
                >
                  <ImagePlus size={14} aria-hidden="true" />
                  <span>{t("插入图片", "Insert Image")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
        <EditorContent editor={editor} />
      </div>
    );
  },
);
