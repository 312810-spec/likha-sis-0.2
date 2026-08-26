#!/usr/bin/env node
// Zero-cost local recall (Wave 2J, docs/adr/0050). Grep-based, not
// LLM-based: every match returned by this module is a VERBATIM
// substring of its source file, never a paraphrase or summary. This is
// a deliberate design constraint, not an oversight -- see
// `recall.test.mjs`'s "never corrupts NOT_VERIFIED" tests, which exist
// specifically to lock this in as a regression-tested guarantee. A
// summarizing/paraphrasing recall implementation could silently turn
// "SF9 fidelity: NOT_VERIFIED" into something that reads as "SF9
// fidelity confirmed" -- grep cannot do that, by construction.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readAllObservations } from "./journal.mjs";

const REPO_ROOT = process.cwd();

/** The canonical Layer-1 files this module treats as recall sources, in
 * the same authority order CLAUDE.md/.claude/rules/project-state.md
 * establish. Deliberately a fixed, explicit list -- not a recursive
 * `docs/**` glob -- so recall never accidentally starts reading, say, a
 * stray scratch file placed under `docs/` and treating it as canonical. */
export const CANONICAL_DOC_PATHS = [
  "docs/PROJECT-MEMORY.md",
  "docs/CURRENT-HANDOFF.md",
  "docs/ACTIVE-PLAN.md",
  "docs/SOURCE-REGISTRY.md",
  "docs/VERIFICATION-DEBT.md",
];

function listAdrPaths() {
  const dir = join(REPO_ROOT, "docs", "adr");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join("docs", "adr", f));
}

/** Reads `docs/VERIFICATION-DEBT.md` and returns it completely
 * unmodified -- byte-identical to what's on disk. This is the function
 * `recall.test.mjs` uses to prove verification debt is never
 * transformed in transit; if this function's return value ever stops
 * being `readFileSync(...).toString()` unmodified, that test fails. */
export function verificationDebtSnapshot() {
  const path = join(REPO_ROOT, "docs", "VERIFICATION-DEBT.md");
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

/** Case-insensitive line search across the canonical docs, ADRs, and the
 * local journal. Returns `{ source, line, text }` per match, `text`
 * always a verbatim copy of the matched line -- never rewritten,
 * truncated-with-ellipsis-that-changes-meaning, or re-worded. Bounded to
 * `maxResults` (default 50) so a broad query can't flood context -- see
 * docs/adr/0050's "Budget protection" section. */
export function recall(query, { maxResults = 50 } = {}) {
  const needle = String(query).toLowerCase();
  const results = [];

  const docSources = [...CANONICAL_DOC_PATHS, ...listAdrPaths()];
  for (const relPath of docSources) {
    const abs = join(REPO_ROOT, relPath);
    if (!existsSync(abs)) continue;
    const lines = readFileSync(abs, "utf8").split("\n");
    lines.forEach((text, idx) => {
      if (results.length >= maxResults) return;
      if (text.toLowerCase().includes(needle)) {
        results.push({ source: relPath.replace(/\\/g, "/"), line: idx + 1, text });
      }
    });
  }

  for (const obs of readAllObservations()) {
    if (results.length >= maxResults) break;
    if (String(obs.content).toLowerCase().includes(needle)) {
      results.push({
        source: `journal:${obs.type}:${obs.id.slice(0, 12)}`,
        line: null,
        text: obs.content,
      });
    }
  }

  return results.slice(0, maxResults);
}

// CLI entry point: `node scripts/memory/recall.mjs "<query>"`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const query = process.argv.slice(2).join(" ");
  if (!query) {
    console.error('Usage: node scripts/memory/recall.mjs "<query>"');
    process.exit(1);
  }
  const results = recall(query);
  if (results.length === 0) {
    console.log(`No matches for "${query}".`);
  } else {
    for (const r of results) {
      const loc = r.line ? `${r.source}:${r.line}` : r.source;
      console.log(`${loc}: ${r.text.trim()}`);
    }
  }
}
