# ADR-0063: School Form 10 (SF10) Learner's Permanent Academic Record — Content-Based Export

## Status

Accepted.

## Context

`docs/CURRENT-HANDOFF.md` recorded SF10 Permanent Record as the safest
immediately-implementable next slice: fully unbuilt, but able to reuse
SF1's/SF5's/SF6's already-proven export architecture. SF10 is DepEd's
permanent, cumulative record of a learner's grades and promotion
decisions across every school year of their basic education — the
"axis" that varies is one learner across many years, the reverse of
SF5/SF6 (many learners within one year/section).

Separately, `docs/adr/0053-sf10-template-applicability-and-versioning.md`
recorded a **different, unrelated** SF10 effort: a resolver
(`formgen::template_version`) for selecting which official DepEd
`.xlsx` SF10 template applies to a given school year/grade/curriculum.
That track is explicitly evidence-blocked — no SF10 generator exists,
render fidelity is `NotVerified` even for the one provenance-confirmed
template (SSHS), and JHS/pre-MATATAG templates were never acquired.
Building against that track now would mean shipping nothing, or
shipping something falsely claiming official-template fidelity.

## Decision

Build SF10 as a **content-based CSV export**, exactly matching how
SF2/SF4/SF5/SF6 and the report card already ship: DepEd-content-faithful
(the same promotion-decision vocabulary, the same computed grades) but
explicitly disclosed as not a byte-faithful reproduction of the official
`.xlsx` template. This is not a new policy decision — it's the same
disclosure-not-refusal pattern already decided, reviewed, and shipped
repeatedly by this project (SF2 since M10, SF1/SF9 generation's UI
exposure at Wave 2T) — applying it to a new form is not a fresh
human-approval-gate question per
`.claude/rules/autonomous-development.md`.

This is architecturally unrelated to the `formgen::template_version`
seam. Nothing in `formgen/` was touched or needs to change; the new
module lives at `export::sf10`, mirroring `export::sf5`/`export::sf6`'s
naming, not a name that could later collide with a real `formgen`-based
SF10 generator if that track resumes.

### Domain (`src-tauri/src/export/sf10.rs`, new)

Reuses `PromotionStatus`, `Sf5SubjectGrade`, and
`Sf5LearnerRow::compute_status` from `sf5.rs` unchanged — the DepEd
promotion rule is per-school-year regardless of whether the year is
being summarized for one section (SF5) or one learner's whole history
(SF10). A new `Sf10YearRow` (school year, grade level, section name,
subject grades, general average, promotion status) is the per-year
building block; `build_sf10_export` renders one block per year, in the
order the caller supplies (oldest first), through the same
`csv::row()`-based escaping/formula-injection defense every other
export already uses. `ProficiencySummary` (SF5/SF6's per-year,
many-learners sex-disaggregated table) does not apply here and is not
reused — a per-year summary table is meaningless for one person's
record.

### Command (`commands::export::export_learner_permanent_record_sf10`)

Gated by `auth::authorize_capability(Capability::ManageLearners)` — the
same Registrar-or-School-Head gate `create_learner`/`update_learner`
already use, not SF5's adviser-of-section gate (wrong axis — a
learner's whole history spans many sections/advisers) and not SF6's
plain `require_active_school_scope` (too open — a single learner's
whole multi-year grade history is more concentrated PII than a
school-wide aggregate summary). `learner_id` is client-supplied the
same legitimate way `section_id`/`class_record_id` already are
elsewhere in this file; isolation holds because
`learner::find_by_id_in_school` resolves to `None` for a foreign
learner.

Memberships (`section_membership::list_by_learner_in_school`, already
returning full cross-school-year history, oldest-first) are grouped by
school year rather than by section — a same-year transfer (Wave 2P's
shape) collapses into one row for that year, labeled with the latest
section, with subject grades aggregated across every section the
learner sat in that year, not just the last one. Per-subject grade
aggregation reuses the identical `compute_term_grade` sum/count-average
block SF5/SF6 already duplicate; this is now duplicated a third time
inline in the same style rather than newly abstracted, since the
existing two call sites established that as this codebase's tolerated
pattern for this specific shape (`.claude/rules` and `CLAUDE.md` both
favor "three similar lines over premature abstraction").

Filename: `SF10_<FamilyName>_<GivenName>_<LRN-or-learner-id>.csv`,
every component through `sanitize_filename_component`. Falls back to
the learner's own id (not a fixed `NO-LRN` placeholder) when LRN is
unrecorded, so two same-named LRN-less learners can't collide onto the
same file.

`export_learner_permanent_record_sf10` was added to
`COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` in
`src/infrastructure/tauri/invoke.ts`, matching `create_learner`/
`update_learner`'s existing convention for `ManageLearners`-gated
commands — an ordinary "you're not a Registrar/School Head" rejection
must not force a global sign-out.

### Frontend

`Sf10ExportResult` mirrors `Sf5ExportResult`'s shape exactly.
`ExportRepository`/`TauriExportRepository`/`ExportApplicationService`
gained `exportLearnerPermanentRecordSf10(learnerId)` following the
established pattern (one trim/non-empty validation in the application
service, a one-line `invoke` in the Tauri adapter). The dev-preview
fixture (`FixtureExportRepository`) throws "not wired" for it, matching
`exportLearnerRoster`'s own precedent for a method not exercised by the
dev-preview fixture — not a new gap, the same disclosed pattern every
other unwired fixture method already uses.

`LearnerListScreen.tsx` — the only existing screen whose subject is one
learner rather than one section/class-record/school, and already home
to the per-row "View history" action — gained a per-row "Export SF10
(Permanent Record)" button, using `SectionRosterScreen.tsx`'s SF5-button
state/handler/render pattern but keyed by `learner.id` (a `Record<string,
...>` per state slot) rather than one flat `useState`, since this
screen has many rows sharing one export flow, unlike
`SectionRosterScreen.tsx`'s single section. A permission-denied
rejection surfaces as a plain-language "you may not have permission"
message, not a raw `Unauthorized` string.

## Verification

- `cargo build`, `cargo test` (633 lib tests + all integration binaries,
  including 4 new `export::sf10` unit tests and 7 new
  `tests/export.rs` integration tests — authorization gate,
  cross-school isolation, unknown-learner-id, empty-history rendering,
  multi-year oldest-first ordering, same-year-transfer collapsing, and
  no-leakage-of-another-school's-learner), `cargo clippy --all-targets
-- -D warnings`, `cargo fmt --check` — all clean. This session's sandbox
  had working system libraries (`libwebkit2gtk-4.1-dev` and friends,
  installed via `sudo apt-get update && sudo apt-get install`, which
  succeeded non-interactively this session) and a Rust toolchain
  upgrade (`rustup update stable`, 1.94.1 → 1.98.0, required — the
  workspace needs 1.95+) — a real, direct confirmation, not a hand-
  verification fallback.
- One real bug caught by `cargo test` during development, not shipped:
  an early version of `build_sf10_export`'s "Learner Name (Family,
  Given)" header label itself contained a comma, so the CSV writer's
  own formula/quoting rules quoted the _label_ too — the test's
  expected substring didn't account for that. Fixed by renaming the
  label to "Learner Name" (comma-free), which also simplifies the
  output; not a security or correctness defect in the shipped code,
  caught before commit.
- `npm run quality` — 853/853 vitest (up from 843), typecheck/lint/
  format/architecture-boundary check all clean; 10 new TypeScript tests
  (2 repository-adapter, 3 application-service, 5 UI interaction/error-
  path). `npm run build`, `npm run check:dev-preview-isolation`
  (21 files scanned, clean), `npm run harness:verify` (100/100) — all
  clean.
- No new dependency (`Cargo.lock`/`Cargo.toml` untouched); no migration;
  no change to `formgen/`.

## Independent review

A `security-reviewer`-equivalent review was dispatched via the
file-based output workaround (`docs/adr/0062-file-based-review-output-
workaround.md`), covering: authorization-gate placement and ordering,
cross-tenant isolation of `learner_id` and every downstream lookup,
CSV/formula-injection defense, filename/path safety, PII exposure in
logs, and this project's two previously-shipped failure classes
(unauthenticated bootstrap-style self-grant; SELECT-then-act races).
See the session's record in `docs/VERIFICATION-DEBT.md` and/or
`docs/CURRENT-HANDOFF.md` for the actual outcome and any findings acted
on.

## Consequences

- Registrars and School Heads can now export a learner's whole
  cumulative academic history from `LearnerListScreen`, with zero
  cross-school data leakage and an honest, structured disclosure of
  what the file is (and is not).
- SF10 official-template fidelity remains `NotVerified`/evidence-blocked
  — unchanged by this ADR, which deliberately does not touch that
  track.
- Retained/disclosed debt: no dev-preview fixture wiring for this
  action (matches `exportLearnerRoster`'s existing gap, not new); no
  Playwright/browser-rendered verification of the new button (this
  screen has never been wired into the dev-preview fixture at all, a
  pre-existing gap this ADR does not close or worsen).
