import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateData } from "../server/validate.mjs";
import { openStore } from "../server/store.mjs";

test("server/demo-seed.json passes validateData and loads cleanly into SQLite store", () => {
  const demoSeed = JSON.parse(
    readFileSync(new URL("../server/demo-seed.json", import.meta.url), "utf8"),
  );
  assert.equal(validateData(demoSeed), true, "demo-seed.json should pass validateData");

  const store = openStore(":memory:", demoSeed);
  const { data } = store.read();
  assert.equal(data.products.length, 2);
  assert.equal(data.docs.length, 3);
  assert.equal(data.releases.length, 2);
  assert.equal(data.contents.length, 3);
  assert.equal(data.tasks.length, 3);
  assert.equal(data.analyticsReports.length, 1);
  assert.equal(data.briefings.length, 1);
  assert.equal(data.briefingItems.length, 1);
  store.close();
});
