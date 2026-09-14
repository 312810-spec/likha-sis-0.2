import assert from "node:assert/strict";
import test from "node:test";
import { classifyChanges } from "./classify-changes.mjs";

test("UI-only changes skip native and Windows verification", () => {
  const result = classifyChanges(["src/ui/MyDayScreen.tsx", "src/ui/MyDayScreen.test.tsx"]);
  assert.equal(result.full, false);
  assert.equal(result.javascript, true);
  assert.equal(result.ui, true);
  assert.equal(result.native, false);
  assert.equal(result.windows, false);
});

test("docs-only changes stay on the documentation fast path", () => {
  const result = classifyChanges(["docs/product/GOLDEN-JOURNEY.md"]);
  assert.equal(result.full, false);
  assert.equal(result.docsOnly, true);
  assert.equal(result.javascript, false);
  assert.equal(result.native, false);
  assert.equal(result.windows, false);
});

test("harness documentation also requests harness verification", () => {
  const result = classifyChanges(["docs/harness/HARNESS-PRINCIPLES.md"]);
  assert.equal(result.docsOnly, true);
  assert.equal(result.harness, true);
});

test("native changes activate Rust and Windows verification", () => {
  const result = classifyChanges(["src-tauri/src/sync_client.rs"]);
  assert.equal(result.full, false);
  assert.equal(result.native, true);
  assert.equal(result.windows, true);
});

test("workflow changes deliberately take the full path", () => {
  const result = classifyChanges([".github/workflows/quality.yml"]);
  assert.equal(result.full, true);
  assert.equal(result.javascript, true);
  assert.equal(result.ui, true);
  assert.equal(result.native, true);
  assert.equal(result.windows, true);
});

test("package manifest changes deliberately take the full path", () => {
  const result = classifyChanges(["package-lock.json"]);
  assert.equal(result.full, true);
});

test("unknown paths fail conservative by selecting full verification", () => {
  const result = classifyChanges(["mystery/new-format.data"]);
  assert.equal(result.full, true);
  assert.deepEqual(result.unknown, ["mystery/new-format.data"]);
});

test("manual dispatch can force full verification", () => {
  const result = classifyChanges(["src/ui/MyDayScreen.tsx"], { forceFull: true });
  assert.equal(result.full, true);
  assert.equal(result.windows, true);
});
