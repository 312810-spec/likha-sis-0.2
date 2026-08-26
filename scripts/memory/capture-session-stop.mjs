#!/usr/bin/env node
// Stop-hook memory capture (Wave 2J, docs/adr/0050). Wired as a
// project-scoped `Stop` hook in `.claude/settings.json`. Fail-open by
// design: every RUNTIME error here (missing git, malformed stdin, a
// filesystem failure, stdin never closing) is caught and the process
// exits 0, because a memory-journal problem must never interrupt or
// fail a Claude Code session (docs/adr/0050's "Required failure
// architecture"). Disclosed exception, per independent security review
// (Wave 2J): a crash during this module's own top-level import (e.g. a
// corrupted journal.mjs) would occur before any try/catch below exists
// and is therefore NOT self-caught -- a low-probability, host-level
// edge case (this script only imports Node built-ins plus journal.mjs,
// which has its own test suite), not an absolute guarantee.
//
// What this captures, deliberately narrow (docs/adr/0050's "Security
// requirements"): the session id Claude Code provides on stdin, the
// current git HEAD commit hash + subject line (already-public repo
// metadata), and a list of CHANGED FILE PATHS ONLY from `git status
// --porcelain` -- never file contents, never command output, never
// environment variables, never Bash tool output. A path containing
// "secret"/"credential"/".env" (case-insensitive) is dropped from the
// recorded list entirely, not merely redacted, as defense in depth on
// top of already never reading file contents.
//
// Stdin is read via the async `data`/`end` event pattern, matching the
// existing hooks in this repo (.claude/hooks/check-bash.cjs,
// check-write-edit.cjs) rather than a blocking sync read.

import { appendObservation } from "./journal.mjs";
import { execFileSync } from "node:child_process";

function safeGit(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", timeout: 5000 }).trim();
  } catch {
    return "";
  }
}

const SENSITIVE_PATH_PATTERN = /secret|credential|\.env(\.|$)/i;

// Applied to the commit SUBJECT too, not just changed-file paths --
// independent security review (Wave 2J) flagged that the subject line
// was captured verbatim/unfiltered while paths were filtered. The
// subject is already public via `git log` in the same repo (this
// doesn't close a real exfiltration path, since the journal is
// gitignored/local-only), but redacting it here avoids duplicating
// sensitive-looking text into a second local store for no reason.
function redactIfSensitive(text) {
  return SENSITIVE_PATH_PATTERN.test(text) ? "[redacted: sensitive-looking content]" : text;
}

function captureAndExit(sessionId) {
  try {
    const headSha = safeGit(["rev-parse", "--short", "HEAD"]);
    const headSubject = redactIfSensitive(safeGit(["log", "-1", "--pretty=%s"]));
    const statusPorcelain = safeGit(["status", "--porcelain"]);
    const changedPaths = statusPorcelain
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.slice(3)) // strip the 2-char status code + space
      .filter((path) => !SENSITIVE_PATH_PATTERN.test(path));

    if (headSha) {
      const content = `HEAD ${headSha} "${headSubject}" | changed: ${changedPaths.join(", ") || "(none)"}`;
      appendObservation({
        project: "likha-sis-0.2",
        sessionId,
        type: "episodic",
        content,
        meta: { changedFileCount: changedPaths.length },
      });
    }
  } catch {
    // Fail-open, unconditionally -- see module doc comment.
  }
  process.exit(0);
}

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let sessionId = "unknown";
  try {
    const payload = JSON.parse(input || "{}");
    if (payload && payload.session_id) sessionId = String(payload.session_id);
  } catch {
    // malformed/absent stdin -- proceed with the "unknown" fallback.
  }
  captureAndExit(sessionId);
});
// If stdin never closes (unexpected, but the existing hooks in this
// repo don't guard against it either), fail-open after a short timeout
// rather than hang the Stop event indefinitely.
setTimeout(() => captureAndExit("unknown"), 3000).unref();
