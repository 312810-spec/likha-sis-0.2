import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { candidate, prepareTrial, verifyArchive } from "./prepare-scores-trial.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "likha-trial-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = path.join(root, "synthetic.zip");
  const bytes = Buffer.from("Synthetic bytes, not a real installer archive.");
  await writeFile(archive, bytes);
  const expected = {
    ...candidate,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  return { root, archive, expected, output: path.join(root, "results") };
}

test("matching bytes verify only archive identity; all observations stay untested", async (t) => {
  const { archive, output, expected } = await fixture(t);
  const record = await prepareTrial(archive, output, expected);
  const saved = JSON.parse(await readFile(path.join(output, "observations.json"), "utf8"));
  assert.deepEqual(saved, record);
  assert.equal(record.preparation.archiveCheck.status, "PASS");
  assert.equal(record.readiness, "INCONCLUSIVE");
  assert.equal(record.observations.length, 12);
  assert(
    record.observations.every(
      (x) => x.status === "NOT RUN" && x.actual === null && x.observedAt === null,
    ),
  );
  assert(Object.values(record.deviceObservation).every((x) => x === null));
  assert(Object.values(record.separateGates).every((x) => x === "NOT RUN"));
  assert(!Object.hasOwn(record.preparation, "hostname"));
  assert(!Object.hasOwn(record.preparation, "username"));
});

test("same-size corruption rejects without creating output", async (t) => {
  const { archive, output, expected } = await fixture(t);
  await writeFile(archive, Buffer.alloc(expected.bytes, 1));
  await assert.rejects(prepareTrial(archive, output, expected), /does not match/);
  await assert.rejects(access(output), { code: "ENOENT" });
});

test("truncation rejects without creating output", async (t) => {
  const { archive, output, expected } = await fixture(t);
  await writeFile(archive, "short");
  await assert.rejects(prepareTrial(archive, output, expected), /does not match/);
  await assert.rejects(access(output), { code: "ENOENT" });
});

test("existing observations cannot be overwritten", async (t) => {
  const { archive, output, expected } = await fixture(t);
  await prepareTrial(archive, output, expected);
  const file = path.join(output, "observations.json");
  await writeFile(file, "previous actual observations");
  await assert.rejects(prepareTrial(archive, output, expected), { code: "EEXIST" });
  assert.equal(await readFile(file, "utf8"), "previous actual observations");
});

test("missing archive cannot create a record", async (t) => {
  const { root, output } = await fixture(t);
  await assert.rejects(prepareTrial(path.join(root, "missing.zip"), output), { code: "ENOENT" });
  await assert.rejects(access(output), { code: "ENOENT" });
});

test("default candidate pin cannot accept a synthetic replacement", async (t) => {
  const { archive } = await fixture(t);
  await assert.rejects(verifyArchive(archive), /does not match/);
  assert(Object.isFrozen(candidate));
});

test("actual CLI rejects wrong ZIP and refuses candidate override arguments", async (t) => {
  const { archive, output } = await fixture(t);
  const script = fileURLToPath(new URL("./prepare-scores-trial.mjs", import.meta.url));
  const mismatch = spawnSync(process.execPath, [script, archive, output], { encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /does not match/);
  const override = spawnSync(process.execPath, [script, archive, output, "--sha256=override"], {
    encoding: "utf8",
  });
  assert.equal(override.status, 1);
  assert.match(override.stderr, /Usage:/);
  await assert.rejects(access(output), { code: "ENOENT" });
});
