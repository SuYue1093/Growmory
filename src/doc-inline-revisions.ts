import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diffChars } from "diff";
import type { Revision } from "./doc-revisions";

export const revisionDecorationsKey = new PluginKey<DecorationSet>("document-revisions");
export const InlineRevisions = Extension.create({
  name: "inlineRevisions",
  addProseMirrorPlugins() {
    return [new Plugin({
      key: revisionDecorationsKey,
      state: {
        init: () => DecorationSet.empty,
        apply: (transaction, previous) => transaction.getMeta(revisionDecorationsKey) ?? previous.map(transaction.mapping, transaction.doc),
      },
      props: { decorations: state => revisionDecorationsKey.getState(state) },
    })];
  },
});

// 将 Markdown 原文坐标映射到编辑器可见字符，再映射到 ProseMirror 坐标。
// 格式符号不写入正文，删除内容仅作为不可编辑的修订装饰显示。
export function decorateRevisions(editor: Editor, markdown: string, revisions: Revision[], active: string | null) {
  let visible = "";
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.isTextblock && visible.length) { visible += "\n"; positions.push(pos + 1); }
    if (node.isText) {
      for (let i = 0; i < node.text!.length; i++) { positions.push(pos + i); visible += node.text![i]; }
    } else if (node.type.name === "hardBreak") { visible += "\n"; positions.push(pos); }
  });
  positions.push(Math.max(1, editor.state.doc.content.size - 1));
  const offsets: number[] = [];
  let raw = 0, rendered = 0;
  for (const part of diffChars(markdown, visible)) {
    if (part.added) { rendered += part.value.length; continue; }
    for (let i = 0; i < part.value.length; i++) { offsets[raw++] = rendered; if (!part.removed) rendered++; }
  }
  offsets[raw] = rendered;
  const position = (offset: number) => positions[Math.min(offsets[offset] ?? rendered, positions.length - 1)];
  const decorations: Decoration[] = [];
  for (const revision of revisions.filter(item => item.field === "body")) {
    const from = position(revision.afterStart), to = position(revision.afterStart + revision.after.length);
    const selected = active === revision.id ? " is-active" : "";
    if (revision.after && to > from) decorations.push(Decoration.inline(from, to, { class: `doc-inline-added${selected}`, "data-revision-id": revision.id, title: "新增内容 · 点击查看修订" }));
    if (revision.before) {
      const parsed = editor.markdown?.parse(revision.before);
      const text = parsed ? editor.schema.nodeFromJSON(parsed).textBetween(0, editor.schema.nodeFromJSON(parsed).content.size, "\n") : revision.before;
      decorations.push(Decoration.widget(from, () => {
        const marker = document.createElement("span");
        marker.className = `doc-inline-deleted${selected}`;
        marker.dataset.revisionId = revision.id;
        marker.contentEditable = "false";
        marker.setAttribute("role", "button"); marker.tabIndex = 0;
        marker.title = "删除内容 · 点击查看修订";
        marker.textContent = text || "格式删除";
        return marker;
      }, { side: -1, key: `${revision.id}-${revision.before}-${selected}` }));
    }
    if (revision.after && to === from) decorations.push(Decoration.widget(from, () => {
      const marker = document.createElement("span"); marker.className = `doc-inline-format${selected}`;
      marker.dataset.revisionId = revision.id; marker.textContent = "格式修改"; marker.contentEditable = "false";
      return marker;
    }, { side: -1, key: revision.id + selected }));
  }
  editor.view.dispatch(editor.state.tr.setMeta(revisionDecorationsKey, DecorationSet.create(editor.state.doc, decorations)).setMeta("addToHistory", false));
}
