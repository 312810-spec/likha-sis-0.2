# ADR-0058: School Form 6 (SF6) Summarized Report on Promotion and Level of Proficiency Foundation

## Status

Accepted. Originally delivered on the `antigravity/likha-sis-wave3m-*` lineage
(Waves 3K/3L) and brought forward onto `main` during the Wave 3m
reconciliation (GitHub issue #16) — see
`docs/adr/0060-wave-3m-reconciliation.md` for the reconciliation record.

## Context

Philippine Department of Education (DepEd) Order No. 4, s. 2014, DepEd Order No. 8, s. 2015, and DepEd Order No. 58, s. 2017 govern the official End of School Year (EOSY) School Form 6 (SF6): Summarized Report on Promotion and Level of Proficiency.

SF6 is the school-level counterpart and consolidation of SF5 (ADR-0057). While SF5 is generated per section by the assigned Class Adviser, SF6 is generated school-wide by the School Head or LIS Coordinator to tabulate:

1. **Table 1: Summary of Promotion Status by Section and Grade Level**:
   - Number of Promoted (Male, Female, Total)
   - Number of Conditional (Male, Female, Total)
   - Number of Retained (Male, Female, Total)
   - Total Promotion Decisions (Male, Female, Combined)
   - Grade level subtotals and School Grand Total.
2. **Table 2: Summary of Level of Proficiency by Section and Grade Level**:
   - Did Not Meet Expectations (<75): Male, Female, Total
   - Fairly Satisfactory (75-79): Male, Female, Total
   - Satisfactory (80-84): Male, Female, Total
   - Very Satisfactory (85-89): Male, Female, Total
   - Outstanding (90-100): Male, Female, Total
   - Combined Level of Proficiency counts per section, grade level subtotal, and School Grand Total.
3. **Structured Field Disclosure**:
   - Populated fields (School ID, School Name, School Year, Grade Levels & Section Names, Promotion Status Summary, Level of Proficiency Summary).
   - Omitted fields (Division/District/Region hierarchy, School Head physical ink signature block, Division validation block).

## Decision

1. **Pure Domain Export Builder**:
   - `src-tauri/src/export/sf6.rs` defining `Sf6SectionSummary`, `Sf6Export`, and `build_sf6_export`.
   - Reuses `ProficiencySummary` and status calculation logic established in `sf5.rs` (ADR-0057).
   - RFC-4180 CSV with formula-injection neutralization and a two-table layout with grade-level subtotals and school grand totals.
2. **Backend Command & Multi-tenant Boundary**:
   - `commands::export::export_school_eosy_sf6` in `src-tauri/src/commands/export.rs`.
   - `school_id` is derived strictly from the authenticated session (`SessionManager::require_active_school_scope`) — the same isolation convention as SF2/the learner roster export, not the adviser-of-section gate SF5 uses, since SF6 is a school-wide summary with no single section owner.
   - Gathers all sections belonging to the school, resolves rosters and class records for the requested school year, and consolidates promotion results without any cross-school data leakage.
   - Sanitizes filename components and outputs to `<Documents>/LIKHA-SIS/SF6_<SchoolName>_<SchoolYear>.csv`.
3. **Frontend Application & Infrastructure Ports**:
   - `ExportRepository` port and `TauriExportRepository` extended with `exportSchoolEosySf6(schoolYear)`.
   - `exportSchoolEosySf6` with validation (non-empty trimmed school year) added to `ExportApplicationService`.
   - **Not** added to `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` — it gates only on `require_active_school_scope`, the same as SF2's own export, which has never been exempt; only `export_section_eosy_sf5` (adviser-of-section-gated) needed the exemption (see ADR-0057).
4. **Wave 3L User-Facing Promotion Summary Interface**:
   - Optional `exportService` prop on `SectionsScreen.tsx`, rendering an accessible "End-of-School-Year Summary (SF6)" form panel underneath the existing section-management forms.
   - Dynamically selects from existing school years found across sections with fallback to manual entry when no sections exist.
   - Teacher-mode contextual support (Guided mode guidance citing DepEd Order No. 4, s. 2014 & DO 8 s. 2015), in-flight disablement guards, success feedback with file path and structured field disclosures, and error messaging.
   - `exportService={exportService}` wired into every `SectionsScreen` usage in `src/App.tsx` (the "sections" tab and every fallback branch that renders it after a stale-state reload).

## Consequences

- The End-of-School-Year reporting pipeline (SF5 Section Promotion + SF6 School Summarized Promotion) is delivered across backend, frontend ports, and UI layers with strict multi-tenant isolation and no data leakage, built on top of `main`'s existing Section Advisory/Adviser View foundation (ADR-0056) rather than a second, parallel implementation of it.
- Verified locally at reconciliation time: `npm run quality` 777/777 vitest, typecheck/lint/format/architecture clean. `cargo build`/`cargo test`/`cargo clippy` could not run in the reconciliation session for the same missing-system-library reason recorded in ADR-0057 — Rust correctness was instead verified by hand-checking every type/function signature this feature depends on against the actual current repository source. Retained as verification debt in `docs/VERIFICATION-DEBT.md`.
