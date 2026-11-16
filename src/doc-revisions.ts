import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { toString } from "mdast-util-to-string";
import { diffChars, diffWordsWithSpace } from "diff";

export type Revision = { id: string; field: "body" | "title"; before: string; after: string; beforeStart: number; afterStart: number };
export type ReviewVersion = { title: string; body: string };

const markdownParser = unified().use(remarkParse).use(remarkGfm);
export const contentText = (markdown: string) => toString(markdownParser.parse(markdown)).replace(/\s+/g, " ").trim();
const fragmentText = (text: string) => /^[*_~`#>\s-]*$/.test(text) ? "" : contentText(text);

export function getRevisions(base: ReviewVersion, current: ReviewVersion): Revision[] {
  const result: Revision[] = [];
  for (const field of ["title", "body"] as const) {
    if (field === "body" && contentText(base.body) === contentText(current.body)) continue;
    let beforeOffset = 0, afterOffset = 0;
    const parts = diffWordsWithSpace(base[field], current[field]);
    const contentSpan = (value: string, start: number) => {
      if (field === "title") return { value, start };
      const prefix = value.match(/^(?:\*\*|__|~~|`+|\*(?!\s)|_(?!\s)|#{1,6} |>[ ]?)+/)?.[0] || "";
      const rest = value.slice(prefix.length).replace(/(?:\*\*|__|~~|`+|\*|_)+$/, "");
      return { value: rest, start: start + prefix.length };
    };
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.added && !part.removed) { beforeOffset += part.value.length; afterOffset += part.value.length; continue; }
      const beforeText = part.removed ? part.value : "";
      const afterText = part.added ? part.value : parts[i + 1]?.added ? parts[++i].value : "";
      const before = contentSpan(beforeText, beforeOffset), after = contentSpan(afterText, afterOffset);
      if (field === "title" || fragmentText(before.value) !== fragmentText(after.value)) result.push({ id: `${field}-${before.start}-${after.start}`, field, before: before.value, after: after.value, beforeStart: before.start, afterStart: after.start });
      beforeOffset += beforeText.length; afterOffset += afterText.length;
    }
  }
  return result;
}

export function mergeRevisions(base: ReviewVersion, current: ReviewVersion, revisions: Revision[], author: (revision: Revision) => string): Revision[] {
  const result: Revision[] = [];
  let previousAuthor = "";
  for (const revision of revisions) {
    const currentAuthor = author(revision);
    const previous = result[result.length - 1];
    const gap = previous && previous.field === revision.field ? current[revision.field].slice(previous.afterStart + previous.after.length, revision.afterStart) : null;
    const beforeGap = previous && previous.field === revision.field ? base[revision.field].slice(previous.beforeStart + previous.before.length, revision.beforeStart) : null;
    if (previous && gap !== null && gap === beforeGap && !gap.includes("\n") && (revision.field === "title" || (gap.length <= 24 && ![previous.before, previous.after, revision.before, revision.after].some(text => text.includes("\n")))) && previousAuthor === currentAuthor) {
      previous.before += gap + revision.before;
      previous.after += gap + revision.after;
    } else result.push({ ...revision });
    previousAuthor = currentAuthor;
  }
  return result;
}

export function resolveRevision(base: ReviewVersion, current: ReviewVersion, revision: Revision, accept: boolean) {
  if (accept) return { base: { ...base, [revision.field]: base[revision.field].slice(0, revision.beforeStart) + revision.after + base[revision.field].slice(revision.beforeStart + revision.before.length) }, current };
  return { base, current: { ...current, [revision.field]: current[revision.field].slice(0, revision.afterStart) + revision.before + current[revision.field].slice(revision.afterStart + revision.after.length) } };
}


// 手动编辑直接接受；只恢复未被此次手动操作触及的外部待审内容。
export function acceptManualEdit(base: ReviewVersion, current: ReviewVersion, next: ReviewVersion): ReviewVersion {
  const result = { ...next };
  for (const field of ["title", "body"] as const) {
    const edits: { start: number; end: number; length: number; contentChanged: boolean }[] = [];
    let offset = 0;
    const parts = diffChars(current[field], next[field]);
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part.added && !part.removed) { offset += part.value.length; continue; }
      const start = offset;
      const before = part.removed ? part.value : "";
      if (part.removed) offset += part.value.length;
      const length = part.added ? part.value.length : parts[i + 1]?.added ? parts[++i].value.length : 0;
      const after = part.added ? part.value : length ? parts[i].value : "";
      edits.push({ start, end: offset, length, contentChanged: fragmentText(before) !== fragmentText(after) });
    }
    const pending = getRevisions(base, current).filter(revision => revision.field === field);
    for (const revision of pending.reverse()) {
      const start = revision.afterStart, end = start + revision.after.length;
      if (edits.some(edit => edit.contentChanged && (edit.start === edit.end ? edit.start >= start && edit.start <= end : start === end ? edit.start <= start && edit.end >= end : edit.start < end && edit.end > start))) continue;
      const shift = edits.filter(edit => edit.end <= start).reduce((sum, edit) => sum + edit.length - (edit.end - edit.start), 0);
      const position = start + shift;
      result[field] = result[field].slice(0, position) + revision.before + result[field].slice(position + revision.after.length);
    }
  }
  return result;
}
