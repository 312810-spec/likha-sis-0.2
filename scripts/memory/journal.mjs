#!/usr/bin/env node
// Deterministic, zero-cost local memory journal (Wave 2J,
// docs/adr/0050-resilient-zero-cost-memory-observer.md). No network call,
// no inference call, no embedding, anywhere in this module — that is the
// entire point: an "event -> local durable journal" write path that
// cannot be disrupted by an external inference provider's quota, trial
// expiry, or outage, because no such provider is ever in the path.
//
// This is Layer 2 ("zero-cost local observation/retrieval") of LIKHA's
// three-layer memory architecture. Layer 1 (docs/PROJECT-MEMORY.md,
// CURRENT-HANDOFF.md, ACTIVE-PLAN.md, ADRs, VERIFICATION-DEBT.md,
// SOURCE-REGISTRY.md, git history) remains authoritative and is
// untouched by this module -- this journal is a supplementary, disposable
// episodic trail, never a substitute for durable repository facts.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  readdirSync,
  statSync,
  openSync,
  readSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const REPO_ROOT = process.cwd();
export const JOURNAL_DIR = join(REPO_ROOT, ".claude", "memory", "journal");

/** Collapses whitespace so near-identical content (differing only in
 * incidental spacing) still normalizes to the same identity -- part of
 * what makes `deterministicId` resistant to trivial non-semantic replay
 * variance, not just exact-byte replay. */
export function normalizeContent(content) {
  return String(content).trim().replace(/\s+/g, " ");
}

/** Replay-safe identity, per docs/adr/0050 ("Idempotency and recovery"):
 * derived from normalized fields, never from a timestamp. The same
 * (project, session, type, content) tuple -- whether replayed by a
 * retried hook, a restarted process, or a duplicated event -- always
 * produces the same id, so `appendObservation` below can deduplicate
 * deterministically rather than relying on "don't call this twice." */
export function deterministicId({ project, sessionId, type, content }) {
  const material = [project, sessionId, type, normalizeContent(content)].join("\n");
  return createHash("sha256").update(material, "utf8").digest("hex");
}

function todayFileName() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}.jsonl`;
}

function ensureJournalDir() {
  if (!existsSync(JOURNAL_DIR)) {
    mkdirSync(JOURNAL_DIR, { recursive: true });
  }
}

/** Every existing id across every journal file -- used for cross-file
 * (not just cross-line-in-today's-file) dedup, since a session spanning
 * midnight UTC could otherwise see the same id land in two files.
 *
 * Directory-level and per-file read failures (permission error, a
 * TOCTOU race where the journal dir/file is deleted or locked between
 * `existsSync`/`readdirSync` and the subsequent read -- plausible on
 * Windows, this project's primary target, via antivirus locking or a
 * concurrent `rm -rf .claude/memory/`) are caught here too, not just
 * per-line JSON errors -- an independent failure-mode review of this
 * wave found the original version only guarded per-line parsing,
 * leaving `readdirSync`/`readFileSync` themselves able to throw
 * uncaught through every caller, including `/memory-health`. */
export function existingIds() {
  const ids = new Set();
  try {
    ensureJournalDir();
    for (const file of readdirSync(JOURNAL_DIR)) {
      if (!file.endsWith(".jsonl")) continue;
      let text;
      try {
        text = readFileSync(join(JOURNAL_DIR, file), "utf8");
      } catch {
        continue; // one unreadable file must not block reading the rest
      }
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id) ids.add(parsed.id);
        } catch {
          // A corrupted line is skipped, never thrown -- a malformed
          // journal entry must not break dedup for every entry after it.
        }
      }
    }
  } catch {
    // Directory-level failure (can't create/list the journal dir) --
    // fail open with whatever ids were already collected (none, if this
    // is where it failed), never throw out to the caller.
  }
  return ids;
}

/** Appends one observation, deduplicated by `deterministicId`. Returns
 * `{ written, id, duplicate }`. Never throws on a filesystem problem
 * that isn't the caller's to fix -- callers (the Stop hook, in
 * particular) must be fail-open: a memory-journal write failure must
 * never surface as a Claude Code interruption. */
/** True if `path` exists and its last byte is NOT a newline -- i.e. the
 * file was left mid-line by a previous write (most plausibly a process
 * killed mid-`appendFileSync`). Reading only the last byte (via a tiny
 * ranged read) keeps this cheap even for a large file. */
function endsWithoutTrailingNewline(path) {
  if (!existsSync(path)) return false;
  const size = statSync(path).size;
  if (size === 0) return false;
  const buf = Buffer.alloc(1);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, 1, size - 1);
  } finally {
    closeSync(fd);
  }
  return buf.toString("utf8") !== "\n";
}

/** Appends one observation, deduplicated by `deterministicId`. Returns
 * `{ written, id, duplicate }`. Never throws on a filesystem problem
 * that isn't the caller's to fix -- callers (the Stop hook, in
 * particular) must be fail-open: a memory-journal write failure must
 * never surface as a Claude Code interruption. */
export function appendObservation({ project, sessionId, type, content, meta = {} }) {
  try {
    // `id` computation moved inside the try (an independent failure-
    // mode review of this wave flagged it sitting outside, which -- for
    // unusual input types -- could in principle throw uncaught here;
    // the caller's own try/catch already covered it, but this is the
    // correct place for it regardless).
    const id = deterministicId({ project, sessionId, type, content });
    ensureJournalDir();
    if (existingIds().has(id)) {
      return { written: false, id, duplicate: true };
    }
    const record = {
      id,
      project,
      sessionId,
      type,
      content: normalizeContent(content),
      meta,
      recordedAt: new Date().toISOString(),
    };
    const targetPath = join(JOURNAL_DIR, todayFileName());
    // Defense against a truncated (no-trailing-newline) prior write --
    // an independent failure-mode review of this wave found that
    // appending directly onto such a file merges two records into one
    // unparseable line, silently losing BOTH (not just the truncated
    // one). Prefixing a newline when needed guarantees this write is
    // always its own line, regardless of what came before it.
    const prefix = endsWithoutTrailingNewline(targetPath) ? "\n" : "";
    appendFileSync(targetPath, prefix + JSON.stringify(record) + "\n", "utf8");
    return { written: true, id, duplicate: false };
  } catch (err) {
    return {
      written: false,
      id: undefined,
      duplicate: false,
      error: String(err && err.message ? err.message : err),
    };
  }
}

/** Reads every observation across every journal file, oldest file first.
 * Used by recall.mjs and health.mjs -- never by anything that sends
 * content off-device (see docs/adr/0050's security section).
 *
 * Same directory/file-level fail-open discipline as `existingIds` (see
 * its doc comment) -- a read failure anywhere in this function degrades
 * to "fewer observations returned," never an uncaught throw. */
export function readAllObservations() {
  const observations = [];
  try {
    if (!existsSync(JOURNAL_DIR)) return observations;
    for (const file of readdirSync(JOURNAL_DIR).sort()) {
      if (!file.endsWith(".jsonl")) continue;
      let text;
      try {
        text = readFileSync(join(JOURNAL_DIR, file), "utf8");
      } catch {
        continue; // one unreadable file must not block reading the rest
      }
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          observations.push(JSON.parse(line));
        } catch {
          // skip corrupted line, same fail-open discipline as existingIds
        }
      }
    }
  } catch {
    // Directory-level failure -- return whatever was already collected.
  }
  return observations;
}
