# ADR-0057: School Form 5 (SF5) Report on Promotion and Level of Proficiency Foundation

## Status

Accepted. Originally delivered on the `antigravity/likha-sis-wave3m-*` lineage
(Waves 3I/3J) and brought forward onto `main` during the Wave 3m
reconciliation (GitHub issue #16) — see
`docs/adr/0060-wave-3m-reconciliation.md` for the reconciliation record.

## Context

Philippine Department of Education (DepEd) Order No. 8, s. 2015 and DepEd Order No. 58, s. 2017 govern the official End of School Year (EOSY) Report on Promotion and Level of Proficiency (School Form 5 / SF5).

SF5 is an official form generated per section at the end of the school year by the designated Class Adviser and certified by the School Head. It tabulates:

1. Learner final grades across all learning areas (subjects).
2. Computed General Average (rounded to two decimal places / nearest whole number per DepEd standard).
3. Action Taken / Promotion Decision:
   - `PROMOTED`: Learner obtained a final grade of >= 75 in all subject areas and general average >= 75.
   - `CONDITIONAL`: Learner failed in 1 or 2 subjects (candidate for remedial classes).
   - `RETAINED`: Learner failed in 3 or more subjects.
   - `PENDING`: Missing or incomplete subject term scores prevent complete evaluation.
4. Summary tables disaggregated by sex (Male, Female, Total):
   - Level of Proficiency (<75 Did Not Meet Expectations, 75-79 Fairly Satisfactory, 80-84 Satisfactory, 85-89 Very Satisfactory, 90-100 Outstanding).
   - Promotion Decisions counts.
5. Field Disclosure block detailing populated fields vs omitted certification blocks.

## Decision

1. **Pure Domain Export Builder**: `src-tauri/src/export/sf5.rs` containing:
   - `PromotionStatus` and `LevelOfProficiency` types with pure classification logic.
   - `Sf5LearnerRow::compute_status` implementing DepEd promotion and average rules.
   - `ProficiencySummary::compute` aggregating sex-disaggregated distributions.
   - `build_sf5_export` generating CSV and `FieldDisclosure`.
2. **Advisory Authorization Boundary**:
   - `commands::export::export_section_eosy_sf5` gates execution with `auth::authorize_adviser_of_section` (the same Section Advisory Foundation gate from ADR-0056, Wave 3E) — only the assigned Class Adviser (as of EOSY) or an authorized School Head in the same school may generate the section's official SF5.
   - Multi-tenant school isolation strictly verified.
3. **Frontend Integration**:
   - `ExportRepository` port and `TauriExportRepository` adapter with `exportSectionEosySf5(sectionId, schoolYear)`.
   - `ExportApplicationService` with validation on trimmed parameters.
   - `export_section_eosy_sf5` added to `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` in `src/infrastructure/tauri/invoke.ts` — it is `authorize_adviser_of_section`-gated the same way `assign_section_adviser`/`end_section_adviser` already are, so an ordinary "not this section's adviser" rejection must not force a global sign-out (ADR-0056's Wave 3B discovery). SF4 and SF6 (below) are deliberately **not** added to this list — both gate only on `require_active_school_scope`, the same as the pre-existing SF2 export, which has never been exempt.

## Addendum — Wave 3J: Section Promotion UI

Delivered user-facing SF5 export capability in `SectionRosterScreen.tsx`:

1. "Export SF5 (Promotion & Level of Proficiency)" button under `.section-roster-forms`.
2. `exportService` threaded through `App.tsx` and `SectionRosterScreenProps` (optional prop, matching this screen's existing `formGenerationService` convention).
3. `sf5Exporting` included in `anyActionInFlight` to avoid concurrent mutations or multiple exports racing.
4. Success alert with file path and structured `FieldDisclosure` omitted-fields disclaimer.
5. Teacher-mode parity preserved (Guided mode contextual help explaining who can export SF5 and for what purpose).
6. Unit and accessibility test coverage across every state.

## Consequences

- Teachers assigned as class advisers and school heads can officially generate section-level SF5 exports with zero data leakage across schools.
- Promotion calculations strictly follow DepEd Order No. 8, s. 2015 without ad-hoc rules.
- Verified locally at reconciliation time: `npm run quality` 777/777 vitest, typecheck/lint/format/architecture clean. `cargo build`/`cargo test`/`cargo clippy` could not run in the reconciliation session — this environment's Tauri/GTK system libraries (`glib-2.0` via `pkg-config`) are not installed and installing them requires `sudo apt-get`, which needed interactive approval unavailable in that unattended session; every non-trivial Rust type/function signature this feature depends on was instead cross-checked by hand against the actual current repository source (not assumed from the source branch) — see the reconciliation record for the full list. Retained as verification debt in `docs/VERIFICATION-DEBT.md` until a session with working Rust build tooling confirms it.
