import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openStore } from "../server/store.mjs";
const initial = JSON.parse(readFileSync(new URL("./helpers/workspace.json", import.meta.url)));
test("商店快照兼容旧数据、保留本机草稿、拒绝旧 revision 与无效备份", () => {
  const store = openStore(":memory:", initial);
  try {
    const old = store.read();
    const data = structuredClone(old.data);
    const before = structuredClone(data.releases);
    data.products[0].appStore = { appId: "123456", name: "测试", bundleId: "com.test", syncedAt: new Date().toISOString(), versions: [{ id: "v1", platform: "IOS", version: "2.0", state: "IN_REVIEW", notes: [{ locale: "zh-Hans", body: "更新" }] }] };
    const result = store.write(data, old.revision);
    assert.deepEqual(result.data.releases, before);
    assert.equal(store.write(old.data, old.revision), null);
    assert.deepEqual(store.read().data.products[0].appStore, data.products[0].appStore);
    data.products[0].appStore.versions[0].notes = "invalid";
    assert.throws(() => store.write(data, result.revision), /格式/);
    assert.equal(store.read().revision, result.revision);
  } finally { store.close(); }
});
