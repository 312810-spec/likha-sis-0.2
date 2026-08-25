# Post-UX-04 Roadmap Reconciliation — Evidence-Based Scoring Pass (2026-08-25)

## Why this exists

The user's product definition expanded substantially after UX-04
completed (School Forms relationships, Teacher Load/Schedule, curriculum
versioning, RBAC, school branding, cloud/sync direction, Teacher
Creation Studio — captured in `docs/product/PRODUCT-CONTRACT.md`) and
explicitly directed a roadmap reset rather than continuing UX-05
automatically. This document is that reset's scenario-scoring pass,
answering: **given the remaining Claude Pro/Claude Code high-capability
window, what execution strategy should govern the next stretch of
work?** This is a strategy-level decision (which _kind_ of work to do
first), not a single-feature pick — so it reuses the established
weighted rubric (`docs/product/M8-DECISION.md`: Teacher Value 20%,
DepEd Alignment 15%, Dependency Readiness 10%, Reuse 10%, Architectural
Fit 10%, Security Safety 10%, Implementation Risk 10%, Testing
Confidence 5%, Future Leverage 5%, Time-to-Value 5%) but applies each
criterion to a _pathway_ rather than one feature.

## Repository-truth inputs to this scoring pass

Verified directly this session (see the completion report for exact
commands): no RBAC/role column exists anywhere; no curriculum/key-stage/
cohort concept exists in the schema; no Teacher Load/schedule code
exists; no sync/SyncProvider code exists beyond the architecture-diagram
placeholder; no SF1 bulk-import/duplicate-detection code exists; SF10 has
zero references anywhere in the repo; `School` has no branding fields;
no Teacher Tools/Creation Studio code exists; the app is Tauri-only (no
PWA/web build config). **Correction to an initial assumption**: a
reusable, disclosed CSV export engine already exists and is proven
three times over (`export/csv.rs` + `FieldDisclosure`, shared by SF2,
SF9's `report_card.rs`, and the learner roster export, per ADR-0009) —
what's actually missing is only the authoritative-_template_ (`.xls`)
adapter path, not a reusable-export concept from scratch. The
already-complete UI-First Tranche (UX-00–04) is the other
substantially-proven asset: a working
design system, app shell, adaptive teacher modes, a mobile-ledger UI
pattern reused twice, a dev-preview verification pipeline, and a
disciplined TDD/ADR/scenario-decision process itself.

## Disqualified before scoring

- **SMEA output/presentation as a pathway focus** — the product contract
  itself defers this pending a new template; scoring it competitively
  would contradict the very instruction that produced this reconciliation.
- **Cloud/sync-first** — near-zero Dependency Readiness (no provider
  ADR, no code) and the product contract explicitly says cloud is not
  the working database; building this before any local-data foundation
  work would invert the project's own "offline-first, sync separate"
  principle.
- **Forms-first (build SF1 through SF10 in form-number order)** — the
  product contract explicitly calls out "bespoke implementation per
  School Form" as something _not_ to overbuild; scoring this iteration
  order competitively would reward the exact anti-pattern already ruled
  out.

## Scored candidates

| #   | Pathway                                                                                                                          | Teacher Value (20%) | DepEd (15%) | Dep. Readiness (10%) | Reuse (10%) | Arch. Fit (10%) | Security (10%) | Impl. Risk (10%) | Testing Conf. (5%) | Future Leverage (5%) | Time-to-Value (5%) | **Weighted** |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------- | -------------------- | ----------- | --------------- | -------------- | ---------------- | ------------------ | -------------------- | ------------------ | ------------ |
| 1   | **Reusable engines + representative vertical slices + architecture freeze** (user's stated hypothesis)                           | 7                   | 8           | 6                    | 9           | 9               | 8              | 7                | 6                  | 10                   | 5                  | **7.55**     |
| 2   | Finish the already-planned UI-First Tranche (UX-05 exactly as originally scoped) fully before touching new scope                 | 6                   | 5           | 10                   | 10          | 10              | 5              | 9                | 8                  | 3                    | 8                  | 7.30         |
| 3   | Strict end-to-end vertical slices (finish SF1 completely, then SF7 completely, etc., without a deliberate reusable-engine layer) | 8                   | 8           | 6                    | 5           | 6               | 6              | 6                | 6                  | 6                    | 8                  | 6.70         |
| 4   | Security/architecture-freeze only (RBAC + curriculum + auth hardening, defer nearly all visible features)                        | 3                   | 2           | 10                   | 8           | 8               | 9              | 9                | 7                  | 4                    | 4                  | 6.05         |
| 5   | UI/design-system polish + school branding only, no new data domains                                                              | 5                   | 1           | 10                   | 9           | 9               | 6              | 9                | 7                  | 3                    | 6                  | 6.20         |

## Winner: Reusable engines + representative vertical slices + architecture freeze (#1) — but the margin is real, not overwhelming

**The user's stated hypothesis wins on the evidence, by 0.25 over the
safest incremental alternative (#2, "just continue UX-05 as planned").**
This is a genuine, non-trivial comparison, not a rubber stamp:

- #2 scores higher on Dependency Readiness, Reuse, Architectural Fit,
  Implementation Risk, and Testing Confidence — it is objectively the
  _safer_ choice, continuing a pattern already proven four times with
  390 passing tests and a real dev-preview verification pipeline behind
  it.
- #1 wins because of where the _rubric itself_ weights things this
  session's stated goal cares about: Future Leverage (10 vs. 3) and
  DepEd Alignment (8 vs. 5) dominate the gap. The explicit Claude-window
  success definition (`PRODUCT-CONTRACT.md` §15) is written entirely in
  terms of "architecture proven," not "features shipped" — that
  framing is exactly what Future Leverage measures, and #2 does not
  advance any of the genuinely new architectural unknowns (RBAC,
  curriculum versioning, Teacher Load, sync, Form Engine) at all.
- #3 (strict full-feature slices) loses specifically on Reuse and
  Architectural Fit — finishing one form completely before deliberately
  proving a shared engine risks exactly the "bespoke per form" anti-
  pattern the product contract rules out, even though its Teacher Value
  and Time-to-Value are the highest of any candidate.
- #4 and #5 lose on Teacher Value and DepEd Alignment — pure
  architecture-or-polish work with no representative slice attached
  produces nothing a teacher or DepEd-compliance reviewer could actually
  exercise, which this project's own priority order (teacher usability
  above maintainability) argues against as a _sole_ focus.

**Confidence: MEDIUM.** The scoring gap (7.55 vs. 7.30) is close enough
that this is a judgment call between two defensible strategies, not a
clear-cut win — recorded honestly rather than overstated. The tie-
breaker is the explicit, user-stated definition of success for this
specific remaining window (architecture proven > features shipped),
which is a real, documented input to this decision, not an assumption.

## Next Best: Finish the UI-First Tranche as originally scoped (#2)

If a future re-evaluation finds the "one representative slice per
engine" approach producing too much half-finished surface area (a real
risk with #1 — five-plus new architectural domains touched at once),
falling back to #2 is the documented next-best: pick up UX-05 exactly
as it was already scoped before this reconciliation, finish UX-06
through UX-08, and defer the entire expanded product contract to a
dedicated follow-up phase. This is never a wrong choice, only a lower-
leverage one given this session's stated goal.

## Resulting decision

Adopt #1, with one deliberate narrowing to control its main risk (too
many simultaneous new domains): **combine, don't parallelize.** UX-05's
already-planned "Learners, Search, Sections, Editing, Export" scope and
the new "SF1 Enrollment + bulk import + duplicate reconciliation" scope
are the _same underlying domain_ (learner records) — merge them into
one wave rather than running old-UX-05 and new-SF1 as separate,
competing efforts. See the realigned wave sequencing in the completion
report and `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`.
