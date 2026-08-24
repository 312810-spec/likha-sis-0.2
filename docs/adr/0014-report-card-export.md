# ADR-0014 — Report Card / Official Grade Output (M14)

Status: Accepted

## Context

M13 delivered a real, primary-source-verified `ComputedTermGrade` per
learner per class record, but only as data a teacher could see one row at
a time via "Show term grades." M14 turns that into a file a teacher can
keep or hand to a school head, reusing M10's `export::csv`/`FieldDisclosure`
architecture — the same pattern already proven for the SF2-inspired
monthly attendance export.

**Scope decision, corrected during implementation.** The scope proposed
at the end of the M13 session considered "gating" the export to only the
one DepEd weight group M13 implements, refusing to export a class record
outside it. On inspection, this isn't actually implementable without new
scope: `Subject` carries no DepEd weight-group classification (it's a
free-text name, e.g. "Mathematics"), and `grading_computation::compute_term_grade`
already applies the single seeded weight policy uniformly to every class
record — there is nothing to gate _on_. Building a `Subject`-to-weight-
group mapping would itself require guessing how this app's arbitrary
teacher-entered subject names correspond to DepEd's own subject-group
categories, which is exactly the kind of inference the `deped-compliance`
rule warns against. **Decision: disclose, don't gate** — this export
inherits M13's own already-accepted choice (apply the one implemented
weight group everywhere, state the limitation prominently) rather than
inventing a new blocking mechanism this milestone wasn't asked to build.

## Decision

- **Shared `FieldDisclosure`/`OmittedField` moved from `export::sf2` to
  `export::mod`** — both SF2 and this report card export now use the same
  types, exactly matching `sf2.rs`'s own doc comment ("this is the
  reusable part of the official-form engine... every future official-form
  export should return one of these").
- **New `export::report_card` module**: one CSV row per learner on the
  class record's section roster (via the same
  `section_membership::roster_for_section_over_range` composition
  `learner_score::record` already uses), their `ComputedTermGrade` if one
  exists, or an explicit "Not yet available" / "Scoring is incomplete for
  this grading period" row otherwise — a learner is never silently
  dropped from the export just because scoring isn't finished, matching
  `roster_for_item`'s own "every eligible learner, marked or not"
  convention.
- **Omitted, disclosed, not fabricated**: the EPP/TLE & MAPEH / SHS
  weighting gap (the one above); a Qualitative Descriptor column (DepEd
  Order No. 015, s. 2026's Table 11 was only read at low resolution
  during M13's research, not independently re-verified at the same
  rigor as the tables actually implemented — omitted rather than risk a
  wrong label, a stricter standard than strictly required but consistent
  with this session's own primary-source discipline); the Grade 12 DO 8,
  s. 2015 carryover (still no primary source located); a General Average
  across a learner's full course load (this export is one class record —
  one section, one subject, one grading period — not a full multi-subject
  report card, which this schema does not yet aggregate).
- **New repository function**: `class_record::find_detail_by_id_in_school`
  — the single-record counterpart to the existing `list_by_school`, same
  join, so the export command gets section/subject/grading-period names
  in one query instead of composing them from separate lookups.
- **New command** `export_class_record_report_card`: `class_record_id`
  client-supplied the same legitimate way `section_id` already is for the
  SF2 export; `school_id` from the session only; writes to
  `<Documents>/LIKHA-SIS/ReportCard_<section>_<subject>_<period>.csv`,
  reusing `sanitize_filename_component` for the same NTFS-alternate-
  data-stream/reserved-character hardening the SF2 export already has.
- **UI**: `ClassRecordWorkspace.tsx` gained an "Export report card (CSV)"
  button beside "Show term grades," with an always-visible warning (not
  gated behind Guided mode, since this is a correctness-affecting
  limitation every mode's teacher needs to see) stating the export
  assumes core K-10 weighting for every subject.

## Consequences

- New: `src-tauri/src/export/report_card.rs`,
  `class_record::find_detail_by_id_in_school`, `export_class_record_report_card`
  command; `FieldDisclosure`/`OmittedField` relocated to `export::mod`
  (a non-breaking move — `sf2.rs` re-imports them, its own tests
  unchanged). New TS: `ReportCardExportResult`,
  `ExportRepository.exportClassRecordReportCard`,
  `ExportApplicationService.exportClassRecordReportCard`. `exportService`
  threaded through `App.tsx` → `ClassRecordsScreen` → `ClassRecordWorkspace`
  (a new prop on both, following the same pattern every other service
  already uses).
- **Verification actually run this session**: `cargo test` — 192 lib
  tests (up from 184) + 51 integration tests, all green. `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — 239 TS tests
  (up from 233), typecheck/lint/format/architecture-boundary all clean.
  `npm run build` succeeds. Visual verification not attempted — same
  standing gap as M12c/M13 (no Tauri IPC bridge in a plain browser).
- **Independent review**: not dispatched. This milestone's new command
  follows the identical authorization pattern (`require_active_school_scope`,
  resolve-within-school-first, `sanitize_filename_component` reused
  verbatim rather than re-implemented) every existing export/read command
  already uses — no new pattern, no new file-write surface beyond what
  `export_section_monthly_sf2` already established and was reviewed for
  (CSV/formula-injection and NTFS-ADS hardening, both reused as-is).
- Not implemented (deliberately out of scope): per-subject gating (see
  Decision above — not currently implementable without new schema),
  Qualitative Descriptors, Grade 12 DO 8 carryover, General
  Average/multi-subject aggregation, an official-template-exact `.xlsx`
  reproduction, printing/PDF rendering, a user-chosen save location
  (matches `docs/adr/0009-sf2-export-and-official-form-engine.md`'s same
  scope cut).
