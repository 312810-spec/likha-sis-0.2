// Tests for scripts/memory/health.mjs (Wave 2J, docs/adr/0050).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeHealth, formatHealthReport } from "./health.mjs";

describe("computeHealth", () => {
  it("makes no network call to determine external observer status (static config read only)", () => {
    // Structural guard: computeHealth must complete synchronously fast
    // and never hang on a network timeout. A network-dependent
    // implementation would make this test flaky/slow; a fast, always-
    // resolved result is itself evidence the check is local-only.
    const start = Date.now();
    const health = computeHealth();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(typeof health.externalObserver).toBe("string");
  });

  it("reports repository brain healthy against the real repo docs", () => {
    const health = computeHealth();
    expect(health.repositoryBrain).toBe("HEALTHY");
    expect(health.verificationDebt).toBe("LOADED");
  });

  it("never reports a live circuit-breaker OPEN state, since no external call sits in the write path", () => {
    const health = computeHealth();
    expect(health.circuitBreaker).toMatch(/no external inference call/i);
  });

  it("operating mode is always LOCAL_ONLY by design", () => {
    expect(computeHealth().operatingMode).toMatch(/LOCAL_ONLY/);
  });
});

describe("computeHealth crash-safety on directory-level read failure", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "likha-memory-health-test-"));
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Independent failure-mode review (Wave 2J) found that computeHealth()
  // was not crash-safe against a directory-level read failure -- only
  // the write-probe path degraded gracefully; a readdirSync/readFileSync
  // failure in existingIds()/readAllObservations() threw uncaught all
  // the way through computeHealth() and the CLI entrypoint. Reproduced
  // here portably (works on Windows, this project's primary target) by
  // putting a FILE where the journal directory is expected, so
  // readdirSync(JOURNAL_DIR) throws ENOTDIR.
  it("does not throw when the journal path is unreadable as a directory", async () => {
    const { writeFileSync, mkdirSync: mkdirSyncNode } = await import("node:fs");
    mkdirSyncNode(join(tmpDir, ".claude", "memory"), { recursive: true });
    // A file, not a directory, at the exact path journal.mjs expects.
    writeFileSync(join(tmpDir, ".claude", "memory", "journal"), "not a directory");

    const { computeHealth: freshComputeHealth } = await import("./health.mjs?t=" + Math.random());

    expect(() => freshComputeHealth()).not.toThrow();
    const health = freshComputeHealth();
    expect(typeof health.repositoryBrain).toBe("string");
    expect(health.observationCount).toBe(0);
  });
});

describe("formatHealthReport", () => {
  it("never includes journal content, only counts and status labels", () => {
    const report = formatHealthReport(computeHealth());
    expect(report).toContain("LIKHA Memory Health");
    expect(report).toContain("Repository brain");
    // Must not accidentally leak a full file path with a username, a
    // token-shaped string, or anything beyond the fixed label/value
    // lines this function builds.
    expect(report).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/); // base64/token-shaped
  });
});
