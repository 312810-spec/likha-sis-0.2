// Tests for scripts/memory/recall.mjs (Wave 2J, docs/adr/0050).
//
// The tests in "NOT_VERIFIED must never be corrupted" are the single
// highest-value test in this wave (see ADR-0050, "Verification debt is
// memory"): they prove that recall/health cannot turn an unresolved
// verification-debt claim into something reading as complete/passed/
// implemented, for the exact facts Wave 2I established. Run against the
// REAL repository docs (not a fixture) deliberately -- a fixture could
// pass while the actual docs/VERIFICATION-DEBT.md drifted; reading the
// real file is what proves this wave didn't quietly weaken it.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recall, verificationDebtSnapshot, CANONICAL_DOC_PATHS } from "./recall.mjs";

const REPO_ROOT = process.cwd();

describe("verificationDebtSnapshot", () => {
  it("returns docs/VERIFICATION-DEBT.md completely unmodified", () => {
    const onDisk = readFileSync(join(REPO_ROOT, "docs", "VERIFICATION-DEBT.md"), "utf8");
    expect(verificationDebtSnapshot()).toBe(onDisk);
  });
});

describe("NOT_VERIFIED must never be corrupted", () => {
  it("recall('NOT_VERIFIED') returns at least one match, and every matched line is a verbatim substring of its source file", () => {
    const results = recall("NOT_VERIFIED");
    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      if (r.line === null) continue; // journal-sourced match, checked separately
      const sourceText = readFileSync(join(REPO_ROOT, r.source), "utf8");
      const sourceLines = sourceText.split("\n");
      expect(sourceLines[r.line - 1]).toBe(r.text);
    }
  });

  it("SF1 official-template fidelity is still recoverable as NOT_VERIFIED", () => {
    // recall() does contiguous-substring matching, so a query has to be
    // a real substring of a real line -- "NOT_VERIFIED" alone (already
    // proven recallable above) plus a direct read of the debt doc is a
    // more robust proof than guessing exact multi-word phrasing.
    const results = recall("NOT_VERIFIED");
    expect(results.some((r) => r.source.includes("VERIFICATION-DEBT"))).toBe(true);
    const debtText = verificationDebtSnapshot();
    expect(debtText).toMatch(/SF1[\s\S]{0,120}NOT_VERIFIED/i);
  });

  it("SF9 official-template fidelity is still recoverable as NOT_VERIFIED", () => {
    const debtText = verificationDebtSnapshot();
    expect(debtText).toMatch(/SF9[\s\S]{0,200}NOT_VERIFIED/i);
  });

  it("Windows packaging is still recoverable as NOT_VERIFIED", () => {
    const debtText = verificationDebtSnapshot();
    expect(debtText).toMatch(/Windows[\s\S]{0,200}NOT_VERIFIED/i);
  });

  it("no canonical doc contains the specific corrupted phrasings this test class guards against", () => {
    // A hostile/buggy summarizer's failure mode is turning "NOT_VERIFIED"
    // into a claim of success. Since this implementation is grep-only
    // (never generates text), this test pins the architectural guarantee
    // directly: none of these exact fabricated phrases -- the kind a
    // paraphrasing summarizer could introduce -- may appear anywhere in
    // the canonical docs. Deliberately exact substrings, not a "verified"
    // regex, since "NOT_VERIFIED" itself legitimately contains the
    // substring "verified" and a naive pattern would false-positive on
    // the very fact this test exists to protect.
    const forbiddenPhrases = [
      "SF9 fidelity: PASSED",
      "SF9 fidelity is VERIFIED",
      "SF9 fidelity confirmed",
      "SF1 fidelity: PASSED",
      "SF1 fidelity is VERIFIED",
      "SF1 fidelity confirmed",
      "Windows packaging: PASSED",
      "Windows packaging is VERIFIED",
      "Windows packaging confirmed",
    ];
    for (const relPath of CANONICAL_DOC_PATHS) {
      const abs = join(REPO_ROOT, relPath);
      let text;
      try {
        text = readFileSync(abs, "utf8");
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      for (const phrase of forbiddenPhrases) {
        expect(lower).not.toContain(phrase.toLowerCase());
      }
    }
  });
});

describe("recall general behavior", () => {
  it("is case-insensitive", () => {
    const upper = recall("VERIFICATION DEBT");
    const lower = recall("verification debt");
    expect(upper.length).toBe(lower.length);
  });

  it("returns no more than maxResults", () => {
    const results = recall("e", { maxResults: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("an unmatched query returns an empty array, not an error", () => {
    expect(recall("zzz_definitely_not_present_anywhere_zzz")).toEqual([]);
  });
});
