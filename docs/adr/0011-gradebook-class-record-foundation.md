# ADR-0011 — Gradebook / Class Record Foundation, Phase 1 (M12a)

Status: Accepted

## Context

The user directed the full M12/M13/M14 roadmap in one message: M12
Gradebook/Class Record Foundation (section + subject + grading period
workspace, assessment items/components, learner scores, missing/N-A
states, offline save, keyboard-efficient entry, mobile-aware layout,
auditability, school/section isolation), M13 DepEd Grade Computation
(researched weighting as a versioned policy layer), M14 Report Card /
Official Grade Output (reusing M10's export architecture).

Given advisor consultation before implementation, M12 was split into
phases rather than built as one pass, for two reasons: (1) M13's
computation work will very likely change the assessment-item schema
M12b would introduce, so landing the foundation (Subject + ClassRecord)
first, verified, keeps that later change cheap and isolated; (2) this
matches the M9-M10-M11 rhythm that has worked all session — ship a
verified slice, then continue.

This ADR covers **M12a only**: `Subject` and `ClassRecord`, the
workspace a teacher will open to record scores in M12b. No assessment
items, no scores, no keyboard/mobile/audit UI polish yet — those are
M12b/M12c.

## Decision

- **`Subject`** — school-scoped reference data a teacher creates inline
  (e.g. "Mathematics"), mirroring `Section`'s shape exactly
  (`src-tauri/src/repository/subject.rs`).
- **`ClassRecord`** — joins one `Section`, one `Subject`, one
  `GradingPeriod`. Deliberately **stores no `school_year` of its own**.
  Both `sections` and `grading_periods` already carry their own
  `school_year` column; if `ClassRecord` stored a third copy, nothing
  would stop those three values from silently drifting apart (a section
  could be paired with a grading period from a different year). Instead,
  `class_record::create` verifies `section.school_year ==
grading_period.school_year` before inserting — one source of truth
  enforced at the one place a class record is ever created, not three
  copies trusted to stay in sync.
- **Isolation**: `create()` verifies `section_id`, `subject_id`, and
  `grading_period_id` all resolve within the caller's own school before
  writing (`find_by_id_in_school` for each), and rejects a school-year
  mismatch — all four rejection reasons collapse into `Ok(None)`, the
  same convention `section_membership::enroll` already established for
  "two distinct-but-related invalid-reference reasons, made
  indistinguishable on purpose so a caller can't use the response to
  probe another school's data." `grading::find_by_id_in_school` was
  changed from private to `pub` so `class_record::create` could reuse it
  rather than re-querying `grading_periods` directly.
- **No duplicate combination**: `UNIQUE (section_id, subject_id,
grading_period_id)` on `class_records` — a structural constraint, not a
  check-then-act guard, continuing the pattern from migrations 5/6.
- **Commands** (`commands::subject`, `commands::class_record`): `school_id`
  derived only from `sessions.require_active_school_scope(&conn)`, never
  a parameter — `section_id`/`subject_id`/`grading_period_id` are
  client-supplied the same legitimate way `section_id` already is in
  `enroll_learner_in_section`, since `create()` verifies each in-school
  before any write.
- **UI** (`ClassRecordsScreen`): picking a section loads that section's
  own `school_year`'s grading periods (via
  `gradingService.listPeriodsBySchoolYear`), so a teacher is steered away
  from constructing a mismatched combination in the first place, rather
  than only finding out after a rejected submission. A generic error
  message covers all four `None` reasons, consistent with the backend
  not distinguishing them.

## Consequences

- New: migration 7 (`subjects`, `class_records`), one new migration test
  (`migration_7_rejects_a_duplicate_class_record_for_the_same_section_subject_and_period`).
  `src-tauri/src/repository/subject.rs`,
  `src-tauri/src/repository/class_record.rs`,
  `src-tauri/src/commands/subject.rs`,
  `src-tauri/src/commands/class_record.rs`,
  `src-tauri/tests/class_record.rs`. New TS: `src/domain/subject.ts`,
  `src/domain/class-record.ts`, matching ports/adapters/services,
  `src/ui/ClassRecordsScreen.tsx` (new "Class Records" tab).
- Rust: 141 lib tests + integration suites (`class_record.rs` adds 5)
  green, `cargo clippy --all-targets -- -D warnings` clean. TS: 189
  tests green (34 files), `npm run quality` and `npm run build` clean.
- Independent review: `architecture-reviewer` was dispatched for this
  milestone (owed since M7). It completed real work (17 tool uses,
  ~61K tokens across two runs) but its findings text was not retrievable
  through the normal completion-notification/resume path both times —
  the same session-wide agent-resume issue hit repeatedly since M7 (see
  `docs/ACTIVE-PLAN.md`'s M7/M9 entries). Per this session's established
  escalation rule (attempt once more, then fall back to self-review), a
  careful self-review was performed instead, covering the same four
  questions the dispatched review was asked: (1) layering — every
  new/changed file was re-read; `commands::subject`/`commands::class_record`
  import only `repository::*`/`auth::*`/`error::*`, never
  `infrastructure`/Tauri internals beyond `tauri::State`; the TS side
  (`ClassRecordsScreen.tsx`, the new application services) imports no
  `infrastructure/tauri/*` outside `composition.ts` — confirmed by
  re-reading the files directly, not by trusting `npm run
check:architecture` alone, since that script only catches restricted
  import paths, not misplaced business logic. (2) The school-year
  single-source-of-truth check in `class_record::create` (lines 62-73):
  section, subject, and grading period are each verified in-school
  before the year comparison runs, the comparison is a plain string
  equality on values already fetched from trusted rows (no re-query, no
  TOCTOU window), and the insert only proceeds after all four checks
  pass. Sound. (3) The isolation/session-derivation pattern in
  `commands/subject.rs` and `commands/class_record.rs` matches
  `commands/section.rs` and `commands/grading.rs` exactly:
  `school_id` comes only from `sessions.require_active_school_scope(&conn)`,
  every other id is client-supplied and verified downstream. (4) No
  concrete problem found for M12b to inherit — `class_records` has no
  `updated_at`/audit columns, but that's expected since a `ClassRecord`
  is immutable in this phase (no edit/delete path exists yet); M12b will
  need its own audit-column decision when scores become mutable, per
  ADR-0011's own deferred-scope note. **No blocking findings; this is a
  self-review, not a substitute for a real second set of eyes** — re-run
  `architecture-reviewer` for M12a once agent-resume behavior is
  confirmed reliably working in a future session.
- Not implemented (deliberately deferred to M12b/M12c): assessment
  components/items, learner scores, missing/not-applicable states,
  keyboard-efficient entry, mobile-specific layout beyond ordinary
  responsive CSS, and a mutation-audit trail beyond
  `created_at`/`updated_at`-shaped fields (none of which exist yet since
  there is nothing mutable in this phase — a `ClassRecord`, once opened,
  is never edited or deleted here). Editing/closing a class record,
  Senior High School's separate semester structure, and any
  multi-teacher/co-teacher concept are also out of scope.
