// Tests for scripts/memory/journal.mjs (Wave 2J, docs/adr/0050).
// Uses a temp CWD so these tests never touch the real repo's
// .claude/memory/journal/ directory.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpDir;
let journal;

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), "likha-memory-test-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  vi.resetModules();
  journal = await import("./journal.mjs?t=" + Math.random());
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("deterministicId", () => {
  it("is stable for the same normalized inputs", () => {
    const a = journal.deterministicId({
      project: "p",
      sessionId: "s",
      type: "episodic",
      content: "hello   world",
    });
    const b = journal.deterministicId({
      project: "p",
      sessionId: "s",
      type: "episodic",
      content: "hello world",
    });
    expect(a).toBe(b);
  });

  it("differs when any identity field differs", () => {
    const base = { project: "p", sessionId: "s", type: "episodic", content: "x" };
    const a = journal.deterministicId(base);
    const b = journal.deterministicId({ ...base, sessionId: "different" });
    expect(a).not.toBe(b);
  });

  it("does not depend on a timestamp", () => {
    // No timestamp field is even accepted by deterministicId's inputs --
    // this test documents that guarantee explicitly rather than relying
    // on the function's signature alone.
    const id1 = journal.deterministicId({
      project: "p",
      sessionId: "s",
      type: "episodic",
      content: "x",
    });
    const id2 = journal.deterministicId({
      project: "p",
      sessionId: "s",
      type: "episodic",
      content: "x",
    });
    expect(id1).toBe(id2);
  });
});

describe("appendObservation replay-safety", () => {
  it("writes a new observation", () => {
    const result = journal.appendObservation({
      project: "p",
      sessionId: "s1",
      type: "episodic",
      content: "first event",
    });
    expect(result.written).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(journal.readAllObservations()).toHaveLength(1);
  });

  it("replaying the exact same event does not duplicate it", () => {
    const event = { project: "p", sessionId: "s1", type: "episodic", content: "same event" };
    journal.appendObservation(event);
    journal.appendObservation(event);
    journal.appendObservation(event);
    expect(journal.readAllObservations()).toHaveLength(1);
  });

  it("a restart (fresh module import, same journal dir) still deduplicates", async () => {
    const event = { project: "p", sessionId: "s1", type: "episodic", content: "restart event" };
    journal.appendObservation(event);

    vi.resetModules();
    const reimported = await import("./journal.mjs?t=" + Math.random());
    reimported.appendObservation(event);

    expect(reimported.readAllObservations()).toHaveLength(1);
  });

  it("distinct content produces distinct, both-retained observations", () => {
    journal.appendObservation({ project: "p", sessionId: "s1", type: "episodic", content: "a" });
    journal.appendObservation({ project: "p", sessionId: "s1", type: "episodic", content: "b" });
    expect(journal.readAllObservations()).toHaveLength(2);
  });

  it("a corrupted journal line is skipped, not thrown, and does not break reading other lines", async () => {
    const { appendFileSync, mkdirSync } = await import("node:fs");
    journal.appendObservation({ project: "p", sessionId: "s1", type: "episodic", content: "good" });
    mkdirSync(journal.JOURNAL_DIR, { recursive: true });
    appendFileSync(join(journal.JOURNAL_DIR, "corrupt.jsonl"), "{not valid json\n", "utf8");

    expect(() => journal.readAllObservations()).not.toThrow();
    const all = journal.readAllObservations();
    expect(all.some((o) => o.content === "good")).toBe(true);
  });

  // Independent failure-mode review (Wave 2J) found this exact gap: a
  // process killed mid-appendFileSync can leave a file with no trailing
  // newline; the next append used to concatenate directly onto those
  // truncated bytes with no separator, merging two records into one
  // unparseable line and losing the NEW observation too, not just the
  // truncated one. This test reproduces that exact scenario.
  it("a truncated (no trailing newline) prior write does not corrupt or swallow the next observation", async () => {
    const { appendFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(journal.JOURNAL_DIR, { recursive: true });
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fileName = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}.jsonl`;
    // Simulate a crash mid-write: a record with NO trailing newline.
    appendFileSync(
      join(journal.JOURNAL_DIR, fileName),
      '{"id":"deadbeef","project":"p","sessionId":"s1","type":"episodic","content":"truncated"}',
      "utf8",
    );

    const result = journal.appendObservation({
      project: "p",
      sessionId: "s1",
      type: "episodic",
      content: "the new valid observation after a crash",
    });

    expect(result.written).toBe(true);
    const all = journal.readAllObservations();
    expect(all.some((o) => o.content === "the new valid observation after a crash")).toBe(true);
  });
});
