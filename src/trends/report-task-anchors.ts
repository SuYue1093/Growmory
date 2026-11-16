import type { Element, Root, Text } from 'hast';
import type { ReportTaskAnchor, Task } from '../types';

export function captureReportTaskAnchors(reader: HTMLElement, selection: Range): ReportTaskAnchor[] {
  const anchors: ReportTaskAnchor[] = [];
  for (const section of reader.querySelectorAll<HTMLElement>('[data-report-section]')) {
    if (!selection.intersectsNode(section)) continue;

    const range = document.createRange();
    range.selectNodeContents(section);
    if (range.compareBoundaryPoints(Range.START_TO_START, selection) < 0) {
      range.setStart(selection.startContainer, selection.startOffset);
    }
    if (range.compareBoundaryPoints(Range.END_TO_END, selection) > 0) {
      range.setEnd(selection.endContainer, selection.endOffset);
    }

    const selected = range.toString();
    const text = selected.trim();
    if (!text) continue;

    const prefix = document.createRange();
    prefix.selectNodeContents(section);
    prefix.setEnd(range.startContainer, range.startOffset);
    anchors.push({
      section: section.dataset.reportSection!,
      start: prefix.toString().length + selected.length - selected.trimStart().length,
      text,
    });
  }
  return anchors;
}

function uniqueIndex(text: string, quote: string) {
  if (!quote) return -1;
  const start = text.indexOf(quote);
  return start >= 0 && text.indexOf(quote, start + 1) === -1 ? start : -1;
}

const inlineTags = new Set(['a', 'code', 'del', 'em', 's', 'strong']);

function isTaskMark(node: Root['children'][number] | undefined): node is Element & { properties: { dataReportTask: string } } {
  return node?.type === 'element' && node.tagName === 'span' && typeof node.properties.dataReportTask === 'string';
}

function mergeTaskMarks(parent: Root | Element) {
  for (let i = 0; i < parent.children.length; i++) {
    let child = parent.children[i];
    if (child.type === 'element' && !isTaskMark(child)) {
      mergeTaskMarks(child);
      const mark = child.children[0];
      if (inlineTags.has(child.tagName) && child.children.length === 1 && isTaskMark(mark) &&
          (parent.type !== 'element' || parent.tagName !== 'pre')) {
        child = { ...mark, children: [{ ...child, children: mark.children }] };
        parent.children[i] = child;
      }
    }

    const previous = parent.children[i - 1];
    if (isTaskMark(previous) && isTaskMark(child) &&
        previous.properties.dataReportTask === child.properties.dataReportTask) {
      previous.children.push(...child.children);
      parent.children.splice(i--, 1);
    }
  }
}

export function reportTaskHighlights(section: string, tasks: Task[]) {
  return () => (tree: Root) => {
    const leaves: { node: Text; parent: Root | Element; index: number; start: number }[] = [];
    let text = '';
    function collect(parent: Root | Element) {
      parent.children.forEach((node, index) => {
        if (node.type === 'element') collect(node);
        // React Markdown renders literal HTML as text when skipHtml is disabled.
        const leaf: Text | undefined = node.type === 'raw'
          ? { type: 'text', value: node.value }
          : node.type === 'text' ? node : undefined;
        if (!leaf) return;
        // React Markdown drops whitespace directly inside table structure elements.
        if (parent.type === 'element' && /^(table|thead|tbody|tfoot|tr)$/.test(parent.tagName) && !leaf.value.trim()) return;
        leaves.push({ node: leaf, parent, index, start: text.length });
        text += leaf.value;
      });
    }
    collect(tree);

    const matches = tasks.flatMap(task => {
      const anchors = task.reportAnchors
        ? task.reportAnchors.filter(anchor => anchor.section === section)
        : [{ section, start: -1, text: task.quote?.trim() || '' }];
      return anchors.flatMap(anchor => {
        const start = anchor.start >= 0 && text.startsWith(anchor.text, anchor.start)
          ? anchor.start
          : uniqueIndex(text, anchor.text);
        return start < 0 ? [] : [{ start, end: start + anchor.text.length, task }];
      });
    }).sort((a, b) => a.start - b.start || b.end - a.end);

    // Work backwards so splitting a text node preserves earlier child indices.
    for (const { node, parent, index, start } of leaves.reverse()) {
      const children: (Text | Element)[] = [];
      let cursor = 0;
      for (const match of matches) {
        if (match.start >= start + node.value.length) break;
        const from = Math.max(cursor, match.start - start);
        const to = Math.min(node.value.length, match.end - start);
        if (from >= to) continue;
        if (from > cursor) children.push({ type: 'text', value: node.value.slice(cursor, from) });
        children.push({
          type: 'element',
          tagName: 'span',
          properties: { dataReportTask: match.task.id },
          children: [{ type: 'text', value: node.value.slice(from, to) }],
        });
        cursor = to;
      }
      if (!children.length) continue;
      if (cursor < node.value.length) children.push({ type: 'text', value: node.value.slice(cursor) });
      parent.children.splice(index, 1, ...children);
    }
    if (matches.length) mergeTaskMarks(tree);
  };
}
