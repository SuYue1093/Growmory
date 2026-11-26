import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { openStore } from "../server/store.mjs";
import { runTool } from "../server/mcp-tools.mjs";

test("开发日记兼容旧工作区，并独立保存笔记与平台草稿", () => {
  const store = openStore(":memory:", JSON.parse(readFileSync(new URL("../server/seed.json", import.meta.url))));
  const original = store.read().data.contents;
  const date = "2026-11-08";
  const read = (options = {}) => runTool(store, "get_development_journal", { date, ...options }, { enabled: true, allowWrites: false });
  const write = (name, fields, allowWrites = true) => runTool(store, name, { date, ...fields }, { enabled: true, allowWrites });
  assert.deepEqual(read().notes, []);
  assert.throws(() => write("append_development_note", { expectedRevision: 0, text: "只读" }, false), /只读/);
  assert.throws(() => read({ date: "2026-11-31" }));
  for (let i = 0; i < 6; i++) {
    write("append_development_note", { expectedRevision: i, text: `第 ${i + 1} 条笔记` });
  }
  assert.equal(read().nextOffset, 5);
  const selectedNote = read({ offset: 5 }).notes[0];
  assert.deepEqual(read({ noteId: selectedNote.id }).note, selectedNote);
  assert.throws(() => read({ date: "2026-11-07", noteId: selectedNote.id }), /没有这条笔记/);
  assert.equal(read({ offset: 5 }).notes[0].text, "第 6 条笔记");
  assert.throws(() => write("append_development_note", { expectedRevision: 0, text: "过期" }), /已更新/);

  const article = { title: "一次取舍", platform: "小红书", body: "今天修复了边界条件。" };
  const old = write("save_development_draft", { ...article, date: "2026-11-07", expectedRevision: 6 });
  const current = write("save_development_draft", { ...article, expectedRevision: old.revision });
  assert.equal(read({ includeHistory: true }).history[0].id, old.entry.id);
  assert.equal(read({ date: "2026-11-07", draftId: old.entry.id }).draft.body, article.body);
  assert.throws(() => write("save_development_draft", { ...article, draftId: old.entry.id, expectedRevision: current.revision }), /当天没有/);
  write("save_development_draft", { ...article, title: "修订标题", draftId: current.entry.id, expectedRevision: current.revision });
  assert.deepEqual(read().drafts.map(draft => draft.title), ["修订标题"]);
  assert.deepEqual(store.read().data.contents, original);
});
