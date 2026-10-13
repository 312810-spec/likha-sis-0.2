import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "./verify-batches.mjs";

async function check(command, args, options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "likha-check-"));
  try {
    return await runCheck(command, args, {
      cwd: directory,
      logPath: path.join(directory, "check.log"),
      ...options,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("a successful executed check passes", async () => {
  const result = await check(process.execPath, ["-e", "process.stdout.write('synthetic')"]);
  assert.equal(result.status, "PASS");
  assert.equal(result.exitCode, 0);
});
test("failure cannot be reported as pass", async () => {
  assert.equal((await check(process.execPath, ["-e", "process.exit(7)"])).status, "FAIL");
});
test("missing execution capability stays not run", async () => {
  assert.equal((await check("likha-nonexistent-validator", [])).status, "NOT RUN");
});
test("timeout cannot be reported as completed", async () => {
  const result = await check(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    timeoutMs: 30,
  });
  assert.equal(result.status, "INCONCLUSIVE");
  assert.equal(result.timedOut, true);
});
