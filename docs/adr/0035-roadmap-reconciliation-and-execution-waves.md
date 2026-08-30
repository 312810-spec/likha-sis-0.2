# ADR-0035 — Post-UX-04 Roadmap Reconciliation and Execution Waves

Status: Accepted

## Context

Immediately after UX-04 completed (`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`,
completion checkpoint `c91a45e`), the user substantially expanded the
product definition — School Forms (SF1–SF10) relationships, Teacher
Load/Class Schedule, curriculum/key-stage versioning, RBAC, school
branding, a cloud/sync target hypothesis, a Teacher Creation Studio, and
explicit non-goals for the remaining Claude Pro/Claude Code
high-capability window — and directed an explicit roadmap-reconciliation
pass rather than continuing the previously-queued UX-05 automatically.
This ADR is the durable record of that reconciliation's architectural
and sequencing decisions. The full distilled product facts live in
`docs/product/PRODUCT-CONTRACT.md`; the scenario-scoring pass behind the
sequencing decision lives in
`docs/product/ROADMAP-RECONCILIATION-DECISION.md`. This ADR does not
restate either in full — it records what changes as a result.

**This reconciliation implemented no feature code.** It is a planning
checkpoint, per explicit instruction.

## Repository-truth findings that shaped this decision

Verified directly (not assumed) during this reconciliation:

- The UI-First Tranche (UX-00–04) is the only substantially-proven
  asset in the repo: a working design-token/app-shell system
  (ADR-0031), full adaptive-mode parity, a reusable mobile-ledger UI
  pattern (used twice — UX-03 and UX-04), a dev-preview visual-
  verification pipeline, and an established TDD/ADR/scenario-decision
  discipline.
- **Most of the expanded product definition has zero code**: no
  role/RBAC column anywhere (`user_school_memberships` is a plain join
  table); no curriculum/key-stage/cohort concept in the schema
  (`sections.grade_level` is a plain string); no Teacher Load/schedule
  code; no sync/`SyncProvider` implementation (only the architecture-
  diagram placeholder from ADR-0001); no SF1 bulk-import/duplicate-
  detection code; **zero references to SF10 anywhere in the repository**;
  `School` has no branding fields (`id`/`name`/`createdAt` only); no
  Teacher Tools or Creation Studio code; the app is Tauri-only, no PWA/
  web build target.
- **Correction — a lightweight, reusable export engine already exists
  and is proven three times over**, contrary to an initial assumption
  in this reconciliation's first pass: `src-tauri/src/export/csv.rs` (a
  dependency-free RFC-4180 CSV writer) and the `FieldDisclosure`/
  `OmittedField` pattern (`src-tauri/src/export/mod.rs`) are shared by
  `sf2.rs`, `report_card.rs` (SF9), and `learner_roster.rs` — three
  independent official/near-official exports built on the exact same
  foundation (ADR-0009 established this foundation, M10). What does
  **not** exist is the authoritative-_template_ path (Tauri → scoped
  sidecar → Apache POI/HSSF → a real `.xls` DepEd template) — every
  export today produces a disclosed, non-authoritative CSV. Wave 3
  below extends the proven CSV-engine pattern's _discipline_
  (disclosure, no fabricated fields, shared writer) to a genuinely new
  authoritative-template adapter, rather than starting from nothing.
- The branch `claude/likha-sis-ux03-plan-plv80c` is 13 commits ahead of
  `origin/main` (still at `f02bce5`, the pre-UX-03 point) — UX-03 and
  UX-04 are complete on this feature branch but not yet merged to
  `main`. Recorded as a fact, not something this reconciliation changes
  (no merge was requested).

## Decision 1: Strategy — reusable engines + representative slices + architecture freeze, narrowly

Per the scenario-scoring pass (`ROADMAP-RECONCILIATION-DECISION.md`),
the user's stated hypothesis — build each new architectural domain
(RBAC, curriculum versioning, Form Engine, Teacher Load, sync) via one
representative, teacher-visible slice rather than either (a) finishing
every domain completely one at a time, or (b) doing architecture work
with no visible slice at all — scores highest (7.55 vs. 7.30 for the
closest alternative, "just continue the original UX-05 plan"). The
margin is real but modest; this is recorded as a MEDIUM-confidence
judgment call, not an obvious win, with the tie-breaker being this
session's own explicit success definition (architecture proven >
feature count, `PRODUCT-CONTRACT.md` §15).

**Narrowing applied to control the strategy's main risk** (touching too
many new domains at once with nothing finished): sequence the domains
one at a time in dependency order (below), each ending in a real,
working, teacher-visible or reviewer-visible slice before the next
begins — never multiple half-built domains in flight simultaneously.

## Decision 2: Combine old-UX-05 with new SF1 Enrollment scope

The previously-queued **UX-05 — Learners, Search, Sections, Editing,
Export** and the newly-defined **SF1 Enrollment + bulk import +
duplicate reconciliation** are the same underlying domain (learner
records) evaluated at two different times. Running them as separate,
competing efforts would directly contradict the product contract's own
"no bespoke implementation per School Form / one reusable pattern"
principle. **Decision: merge them into one wave** (Wave 2 below).
UX-05's original scope was never implemented, so nothing is lost by
folding it in — the reconciliation record for this is here and in
`ROADMAP-RECONCILIATION-DECISION.md`, not a separate loss.

## Decision 3: Curriculum must be modeled as versioned/cohort-aware from the start

Reconfirms and generalizes the pattern this codebase already uses for
grading-weight-policy versioning (`grading_weight_policies`, pinned per
`class_record` — ADR-0013/0015/0016): curriculum must be `school_year +
grade + curriculum_version + cohort + implementation_status +
applicable_grading_policy + applicable_subjects + applicable_form`, never
a `grade == 11/12` heuristic. This is a genuine, durable architecture
decision (not yet implemented) recorded now so Wave 1's schema work
starts from the right shape rather than a placeholder that would need
reworking later.

## Decision 4: RBAC starting model reconfirmed, not re-litigated

The three-role starting model (**Teacher, Registrar, School Head**) was
already asked and answered directly with the user during M8
(`docs/product/M8-DECISION.md`'s follow-up section, 2026-08-24) — this
reconciliation does not re-ask it. What remains genuinely open (exact
authority boundaries between the three roles) is explicitly **not**
decided here; it is scoped as part of Wave 1's implementation, using
the confirmed three-role anchor rather than starting from a blank
slate or asking the human-approval-gate question again unnecessarily.

## Decision 5: Cloud target is a hypothesis, not yet a ratified decision

**Correcting an assumption in the reconciliation request itself**: no
prior ADR or scenario pass in this repository selected Cloudflare
Worker + Durable Object (or D1) as the cloud target — `SyncProvider` has
always been an unimplemented architecture-diagram placeholder
(ADR-0001). This reconciliation records the Worker+Durable-Object/
Worker+D1 pair as the **current working hypothesis** for when Wave 5
(sync) actually begins, but does **not** ratify it. Per this project's
own established rule, running the 10-scenario architecture-decision
process for the cloud target is required work _within_ Wave 5, not
something this planning-only reconciliation is entitled to skip.

## Decision 6: Realigned execution waves (supersedes the flat UX-05..UX-08 queue)

Supersedes `docs/PROGRESS-MAP.md`'s previous flat "UX-05 through UX-08 —
Queued" listing (marked superseded there, not deleted — UX-00 through
UX-04's history is unchanged and remains accurate). UX-06's original
scope (auth/first-run/session/trust states) is absorbed into Waves 1 and
5 below (RBAC needs session extension; sync needs session hardening);
UX-07's scope (Android adaptation) is absorbed into Wave 6; UX-08's
scope (cross-app finish/accessibility/performance/regression gate)
becomes Wave 7, unchanged in substance, renumbered.

| Wave | Name                                                             | Objective                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Repository truth + roadmap reconciliation                        | This ADR + its supporting docs. **Complete.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1    | Foundational primitives                                          | **Complete.** RBAC (`docs/adr/0036`) and curriculum-versioning schema (`docs/adr/0037`) built 2026-08-25 (`PRODUCT-CONTRACT.md` §3 was stale claiming otherwise, corrected 2026-08-29); School branding (`docs/adr/0045`) built 2026-08-29, closing the wave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2    | Learner Core (combined UX-05 + SF1)                              | **Complete** (`docs/adr/0046`, built 2026-08-30). Bulk import with conservative, provenance-tracked duplicate reconciliation; learner photo (BLOB-in-encrypted-SQLite, reusing the Wave 1 School Branding pattern); enrollment history (new query over the existing section-membership model). Gated by Wave 1's RBAC (`Capability::ManageLearners`, Registrar/School-Head). Transfer foundation deliberately deferred to Wave 5 (needs the cloud/sync layer); ID-generator data foundation satisfied by the existing nullable `lrn` field, no new code needed.                                                                                                                                                                                                                                              |
| 3    | Authoritative-template Form Engine                               | Pre-researched, ready (`docs/adr/0044-pre-wave-research-waves-3-4-5-7.md`). SF9/SF10/SF7 structure recorded; a real prior-art gap found for the previously-assumed Apache POI/HSSF sidecar — recommend pure-Rust `umya-spreadsheet` instead (no JVM dependency). One gate remains: obtain the current authoritative template file (from the user, matching the M8 `CONSO SF v2025.xlsx` precedent, or a verified `deped.gov.ph` fetch) before implementation. SF9 (report card) still recommended first — extends UX-04's grade computation directly.                                                                                                                                                                                                                                                        |
| 4    | Teacher Load + Class Schedule foundation                         | Pre-researched, ready (`docs/adr/0044`). Position ladder (Teacher I-VII → Master Teacher I-V/VI) and RA 4670's primary-source-confirmed 6hr/day teaching cap recorded for the personnel model; one figure (Master Teacher coaching-credit ratio) flagged as not yet primary-verified. Schedule generator: `school-scheduling-rs` rejected (license conflict, prototype); recommend the MIT-licensed `highs`/`good_lp` crates as the real foundation. **Personnel data collection decided**: a real Google Form → CSV → bulk-import via Wave 2's reconciliation architecture, a disclosed exception to LIKHA's local-first posture, needs an RA 10173 notice on the form. Schema + a representative single-section scheduling proof (not a full constraint solver yet) → feeds SF7.                           |
| 5    | Sync + cloud authorization + session hardening                   | Pre-researched, not pre-decided (`docs/adr/0044`): Cloudflare Durable Objects/D1 pricing reconfirmed zero-billing-viable at 2026 rates; no off-the-shelf sync engine fits (PowerSync/ElectricSQL are Postgres-centric, the one CRDT-native SQLite engine found requires Supabase, already excluded) — two unscored candidate approaches (full CRDT vs. field-scoped last-write-wins) recorded for the real 10-scenario cloud-target decision (Decision 5 above), still required before writing sync code. One real end-to-end sync round trip, not a full feature set. Formalize the offline-session/re-authentication product requirement (`PRODUCT-CONTRACT.md` §13) with an actual security-reviewer pass, not a default number.                                                                          |
| 6    | Teacher Creation Studio integration + Android critical workflows | ILAWCraft classification **complete** (`docs/adr/0042`) and full Teacher Tools catalog + integration architecture + build order **complete, ready to execute** (`docs/adr/0043-teacher-tools-catalog-and-integration-architecture.md`) — no further research needed to start this wave. Order: **6a-i** Item Analysis → **6a-ii** Phil-IRI digitization → **6a-iii** low-risk classroom utilities → **6a-iv** LAC sessions + RPMS/IPCRF evidence tracker → **6a-v** Learner Support/Intervention Tracker (none need a paid API or new architecture pattern) → **6b** Teacher Creation Studio (lesson plan → slide deck → worksheet/quiz/TOS/rubric pipeline, gated on a human BYOK-vs-LIKHA-funded AI-cost decision before adapter code). Android: My Day + Attendance critical-workflow architecture proof. |
| 7    | Cross-app finish, accessibility, performance, regression gate    | Unchanged in substance from the original UX-08 scope. Final hardening and handoff-readiness pass before/at the high-capability window's end. **One real gate found** (`docs/adr/0044`, `PRODUCT-CONTRACT.md` §17): Windows code signing needs either an OSI-approved license (to qualify for SignPath Foundation's free signing — this repo has no `LICENSE` file yet) or a paid certificate; decide at wave start.                                                                                                                                                                                                                                                                                                                                                                                          |

## Consequences

- `docs/PROGRESS-MAP.md`'s UX-05..UX-08 row is marked superseded in
  place (not deleted) and points here.
- `docs/PROJECT-MEMORY.md`'s "Post-UX-08 Direction" section (added
  2026-08-25, before this reconciliation) is marked superseded in place
  — its substance (forms/UI/interaction deepening) is now absorbed into
  the wave list above rather than sitting as a separate, later-phase
  note.
- No feature code changed. `npm run quality` (390/390), `npm run
build`, `check:dev-preview-isolation`, and `npx knip` were re-verified
  clean as part of establishing repository truth for this reconciliation
  (see the completion report for exact output); `cargo test`/`build`/
  `clippy` remain blocked by the pre-existing, unrelated
  `windows-future`/`windows-core` conflict recorded in
  `docs/VERIFICATION-DEBT.md`.
- **Per explicit instruction, Wave 1 has not been started.** The next
  implementation milestone (RBAC foundation, the highest-leverage single
  slice of Wave 1) is specified in the completion report and
  `docs/CURRENT-HANDOFF.md`, awaiting approval before implementation
  begins.
