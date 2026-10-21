# Scores history comparison and repair — 21 October 2026

Scope: the existing Scores correction-history panel. Base `7bea54ac4b3e26baea3f30fd02963d606ceb154e`, branch `forge/scores-component-comparison-20261021`. Frozen H1–H7 contract is in `scores-history-comparison-contract-2026-10-21.md`. This is a handoff and measured experiment, not a FORGE checker certificate.

## Result and decision

**KEEP_BASE: refined native disclosure.** The real Base UI 1.9.0 Collapsible candidate and refined native panel passed the same 43 browser checks with identical LIKHA async model, content and CSS. Actual application builds differed only in the disclosure wrapper. Base UI added 17,915 minified JavaScript bytes / 6,754 gzip bytes, with unchanged CSS. Both repaired variants recover in one action versus the original close/reopen two actions. The async repair belongs to LIKHA, not the library. No task benefit justified adding this candidate to production. This decision covers this control only; teacher comprehension was not measured.

Read `scores-history-comparison-2026-10-21.json` for source SHA-256s, package/license metadata, all cases, asset hashes and bundle measurements. Optional reproducer: `scripts/assurance/score-history-comparison.mjs`, with pinned no-save Base UI install followed by `npm ci --ignore-scripts`. Candidate sources/builds are generated under the ignored cache; no production dependency or manifest change. Official API/composition references inspected: https://base-ui.com/react/components/collapsible and https://ui.shadcn.com/docs/components/base/collapsible. Upstream tauri-ui remains a composition reference under the existing v4 adapter, not a replacement application scaffold.

## Repairs and observed regressions

- Lazy, scoped read snapshots bind service, assessment, learner and refresh revision. Late reads cannot replace current context. Closed panels do not read. Retry/refresh guards duplicate pending reads and retains its button/focus through loading and result states.
- Explicit loading, failed-read, empty and snapshot wording; one-action retry and explicit refresh. Unique React panel IDs keep separate histories linked correctly.
- Canonical author IDs determine whether original recorder and corrector are the same person. Distinct users with missing names remain visible; colliding display names include IDs. Zero values, reasons and timestamps remain selectable history evidence.
- Long unbroken correction reasons wrap within the panel. Browser comparison reproduced overflow before the CSS repair.

Preserved baseline logs: `scores-history-baseline-2026-10-21.txt` (3 failed / 8 passed: retry, stale service snapshot, duplicate IDs), `scores-history-author-baseline-2026-10-21.txt` (2 failed / 12 passed: missing/colliding names), and `scores-history-overflow-baseline-2026-10-21.txt`. Harness locator mistakes were corrected before the final 43-case run; they were not product failures. Focused component/workspace tests: 82 passed; a subsequent closed-response regression is included in the final full quality run.

## Coverage and limits

H1–H4 pass automated component/browser checks. H5 automated keyboard/touch, linked panel, copyability, reduced motion, target bounds, axe and reflow checks pass across light/dark, three densities and widths 1280/640/390. Representative final renders were inspected internally. Manual assistive technology, OS zoom and teacher comprehension remain NOT RUN. H6 matched experiment passes with KEEP_BASE. H7 final production gates/publication receipts are recorded below when completed.

No score write, authority, schema, native, sync or permission behavior changed. The experimental package was pruned and the exact locked production dependency environment restored before final gates. The full Scores A1–A7 pilot remains INCONCLUSIVE pending actual teacher, installed Windows recovery/upgrade, Android, two-device exchange and manual accessibility observations. Existing native/installer evidence remains revision-bound; this UI experiment does not re-establish it. Main and the PR146–150 draft chain are not merged by this slice.

## Production gates and publication

Locked-dependency build, UI smoke, recovery50 and existing Scores browser47 PASS. Final full quality PASS: 1,612 tests / 161 files, including the closed-response regression. Typecheck, lint, formatting, architecture, dead-code and batch-runner checks passed. The initial lint run had one warning in the ignored generated comparison harness; it was moved outside the repo and clean lint rerun passed. Exact source/CI publication receipt follows. Parent checkpoint Quality 39609511600 and Security 39609511398 succeeded on 7bea54ac. Gated publication and merge into the existing parent branch are user-authorized; no deployment.
