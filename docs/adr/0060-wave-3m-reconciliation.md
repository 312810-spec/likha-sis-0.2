# ADR-0060: Wave 3m Reconciliation — Merging the Antigravity Product Lineage with the Restored Claude Harness

## Status

Accepted. Delivered from GitHub issue #16, on branch
`claude/issue-16-20260901-1208`.

## Context

Two independent delivery lineages diverged from the same point (`main`'s
Wave 3E "Section Advisory Foundation" checkpoint, `4de3973`):

- **`main`** continued with an independent implementation of Adviser View
  (Wave 3F) and Section Adviser Management UI (Wave 3G), then a separate
  harness-restoration saga (switching Claude Code out for ChatGPT/Codex
  automation, then restoring Claude Code — see `41e1af9`/`fd437e5`), plus
  Wave 3H (a planning-only roadmap survey). `main`'s head at trigger time
  was `fd437e5`.
- **`antigravity/likha-sis-wave3m-sf4-monthly-attendance-foundation`** (a
  different coding agent, "Antigravity") independently built its _own_
  Adviser View (Wave 3F) and Section Adviser Management UI (Wave 3G) from
  the same starting point, then continued with genuinely new product work
  no other lineage had: SF2/report-card class-adviser byline integration,
  School Form 5 (Wave 3I/3J, ADR-0057), School Form 6 (Wave 3K/3L,
  ADR-0058), and School Form 4 (Wave 3M, ADR-0059). This branch's head was
  `35ed7f0`, 12 commits ahead of and 21 commits behind `main`.

GitHub PR #15 exposed this branch against `main`. The owner's explicit
instruction (issue #16) was: preserve the restored Claude harness state,
and bring forward the Wave 3m product work (section advisory work plus
SF5/SF6/SF4) — reconcile deliberately, not via a blind merge, and
re-verify the source branch's own claims rather than trust them.

## Investigation

A blind three-way `git merge` was rejected as the mechanism: the two
lineages' independent Wave 3F/3G reimplementations touch the same files
(`AdviserViewScreen.tsx`, `commands/subject_attendance.rs`,
`repository/subject_attendance.rs`, `SectionsScreen.tsx`, and others)
with materially different designs, which would merge as unresolvable
content conflicts rather than a clean union.

Instead, every file either lineage changed since the shared merge-base
was diffed and classified:

- **Harness-only** (`.github/workflows/`, `.claude/`, `.codex/`,
  `.agents/`, `AGENTS.md`, `.harness/inventory.json`, the relay scripts,
  `package.json`, `CLAUDE.md`) — `main`'s restored state kept unchanged.
  `CLAUDE.md`, `package.json`, and the three relay scripts turned out to
  be byte-identical between the two lineages already (confirmed via
  `git diff <ref-a>:<path> <ref-b>:<path>`, not assumed).
- **Product files only `main` changed** (Section Advisory/Adviser View:
  `auth::authorize_adviser_of_section`, `resolve_adviser_view_scope`,
  `repository::section_advisory`, `repository::subject_attendance`'s
  `adviser_overview_for_section`, `commands::section_advisory`,
  `commands::subject_attendance::adviser_subject_attendance_overview`/
  `list_adviser_view_sections`, `AdviserViewScreen.tsx`,
  `SectionAdviserScreen.tsx`, `SectionsScreen.tsx`'s minor nav hookup) —
  **kept as-is**. This is the one substantive judgment call in this
  reconciliation (see below).
- **Product files only Wave 3m changed** (`commands/export.rs`,
  `export/{mod,sf2,sf4,sf5,sf6,report_card}.rs`, `tests/export.rs`, the
  TypeScript export application/domain/infrastructure layers,
  `SectionRosterScreen.tsx`) — **adopted wholesale** from Wave 3m's tip,
  since `main` never touched these files and Wave 3m's own version is a
  strict superset of whatever existed at the shared merge-base.
- **Files both lineages changed** (`lib.rs`'s command registration,
  `App.tsx`, `SectionsScreen.tsx`'s SF6 portion,
  `dev-preview/{DevPreviewApp,fixtures}.tsx`, `invoke.ts`'s exemption
  list, a handful of test-fixture completions) — reconciled by hand,
  keeping `main`'s Adviser View/Section Advisory Management code intact
  and layering only the genuinely new SF2-integration/SF4/SF5/SF6 work
  on top.

## Decision

**Kept `main`'s own Adviser View (Wave 3F) and Section Adviser
Management UI (Wave 3G) implementation, discarded Wave 3m's parallel
reimplementation of the same two features.** Three concrete reasons,
found by direct comparison, not assumption:

1. **A real regression in Wave 3m's version.** `main`'s
   `monitor_for_assignment` (the query both Subject Monitor and Adviser
   View share) filters `session_date <= as_of_date` — a correctness fix
   this project's own Wave 3F found and fixed via TDD (a session opened
   after the requested date was otherwise counted). Wave 3m's parallel
   `adviser_monitor_for_section` reuses the _same_ shared function but
   was written before that fix existed on its own lineage, so it never
   received it. Adopting Wave 3m's design would have reintroduced a
   known, already-fixed bug.
2. **A materially worse product shape.** `main`'s Adviser View shows one
   combined row per learner (raw Present/Absent/Tardy/Excused totals
   across every subject, which subjects have absences, the highest
   current streak) — matching the product spec's own described signals.
   Wave 3m's version instead returns one unaggregated `SubjectMonitor`
   table per subject taught in the section, which an adviser would have
   to cross-reference by hand. `main`'s shape was already reviewed
   (security-reviewer, no BLOCKING/SHOULD-FIX findings — see the Wave
   3E/3F/3G individual review-debt-closure entry in
   `docs/CURRENT-HANDOFF.md`) and Playwright-verified live in the
   dev-preview fixture.
3. **Zero real cost to keeping it.** Every genuinely new Wave 3m
   capability — the SF2 class-adviser byline, SF4, SF5, SF6 — depends
   only on the already-existing, unmodified
   `repository::section_advisory::current_adviser_for_section` and
   `auth::authorize_adviser_of_section` (both from Wave 3E, present
   identically on both lineages) for adviser-name lookups and
   authorization. None of it touches `main`'s Adviser View internals.
   Confirmed directly from `commands/export.rs`'s actual source, not
   inferred.

This means Wave 3m's own Wave 3F/3G commits
(`b7fd977`/`d264f9b`/`2baae14`) and its relay-tooling commits
(`8609925`/`b9b6d8a`/`944b988`, superseded by `main`'s own already-landed
relay work) were **not** brought forward — everything else was.

## What was preserved from each lineage

**From `main` (harness + Adviser View/Section Advisory line, unchanged):**
`.github/workflows/claude.yml` and the full restored Claude Code
harness; `AdviserViewScreen.tsx`/`SectionAdviserScreen.tsx` and their
backing Rust command/repository/auth code; the Wave 3H roadmap-survey
record.

**From Wave 3m (product line, ported forward):** SF2/report-card class
adviser byline (`export/sf2.rs`, `export/report_card.rs`); School Form 5
Section Promotion (`export/sf5.rs`, `SectionRosterScreen.tsx`'s SF5
export button, ADR-0057); School Form 6 School Promotion Summary
(`export/sf6.rs`, a new "End-of-School-Year Summary (SF6)" panel ported
into `main`'s existing `SectionsScreen.tsx` alongside its own
adviser-management UI rather than replacing it, ADR-0058); School Form 4
Monthly Attendance Consolidation (`export/sf4.rs`, backend/port-layer
only, no UI trigger yet, ADR-0059).

**Reconciled by hand, not taken wholesale from either side:**
`src-tauri/src/lib.rs` (SF4/SF5/SF6 command registration added
alongside `main`'s existing Adviser View command registration, not
Wave 3m's rename/removal of it); `src/App.tsx` (`exportService` threaded
into every `SectionsScreen`/`SectionRosterScreen` call site, `main`'s
Adviser View wiring untouched); `src/infrastructure/tauri/invoke.ts`
(only `export_section_eosy_sf5` added to the session-expiry exemption
list — it is `authorize_adviser_of_section`-gated like
`assign_section_adviser`/`end_section_adviser`; SF4/SF6 are not, since
they gate only on `require_active_school_scope`, the same as SF2, which
has never been exempt — Wave 3m's own source had added all three, which
this reconciliation corrected); `src/ui/SectionsScreen.tsx` (Wave 3m's
SF6 export panel added underneath `main`'s existing section-management
forms, its own parallel adviser-management panel left out since
`SectionAdviserScreen.tsx` already covers that); a handful of
`FakeExportRepository`/`ExportRepository` test-fixture and
dev-preview-fixture completions required once the port surface grew to
six export methods instead of three.

## Verification

- `npm run quality`: typecheck, lint, format, `check:architecture`, and
  `vitest` all run and clean — **777/777 tests passing** (up from
  `main`'s pre-reconciliation baseline; net new: the ported SF5/SF6
  export-layer and UI tests plus fixture-completion updates).
- `cargo fmt --check`: clean after one `cargo fmt` pass (pure whitespace
  drift between the two lineages' rustfmt output, no semantic change).
- `cargo build`/`cargo test`/`cargo clippy`: **could not run** in this
  session. This sandbox's Tauri/GTK system libraries
  (`glib-2.0`, discovered via `pkg-config`) are not installed, and
  installing them (`sudo apt-get install libwebkit2gtk-4.1-dev ...`,
  the same package list `docs/adr/0041-minimal-ci-foundation.md`'s CI
  job uses) requires interactive approval this unattended session could
  not obtain. In its place, every non-trivial Rust type and function
  signature the ported export code depends on
  (`repository::{attendance,school,section,section_advisory,
section_membership,class_record,grading,grading_computation,role}`'s
  public structs/functions, `auth::authorize_adviser_of_section`) was
  cross-checked by hand, field-by-field, against this repository's
  actual current source — not assumed correct from the source branch.
  Recorded as verification debt in `docs/VERIFICATION-DEBT.md`; the
  reconciliation PR's own GitHub Actions Quality/Security gates (which
  run on Ubuntu with the GTK packages installed, per ADR-0041) are the
  authoritative confirmation this session could not produce locally, and
  this reconciliation is gated on both being green before merge.
- No real learner/school PII was introduced — every fixture and test in
  the ported code uses the same synthetic-name convention
  (`"Cruz, Ana"`, `"Rizal Elementary"`, ...) already established
  throughout this codebase.
- `git diff --check`: clean (no whitespace-error markers).

## Consequences

- `main` now has the full Section Advisory → Adviser View → SF5 → SF6 →
  SF4 feature line in one coherent implementation, without a duplicate
  Adviser View design living on in a side branch.
- The `antigravity/likha-sis-wave3m-*` branch and PR #15 are superseded
  by this reconciliation for their SF2/SF4/SF5/SF6 content; their own
  Wave 3F/3G/relay commits remain unmerged by design (see above).
- SF4 has no UI entry point yet — the next natural product slice for
  this feature line (not implemented here, see `docs/CURRENT-HANDOFF.md`
  for the exact recommendation).
- The Rust-build verification gap (no local `cargo test`/`clippy` this
  session) is a real, disclosed limitation of this sandbox, not of the
  ported code — resolved once GitHub Actions CI (or a session with the
  GTK packages available) confirms it.
