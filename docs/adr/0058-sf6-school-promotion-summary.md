# ADR-0058: School Form 6 (SF6) Summarized Report on Promotion and Level of Proficiency Foundation

## Status

Accepted (Wave 3K and Wave 3L delivered)

## Context

Philippine Department of Education (DepEd) Order No. 4, s. 2014, DepEd Order No. 8, s. 2015, and DepEd Order No. 58, s. 2017 govern the official End of School Year (EOSY) School Form 6 (SF6): Summarized Report on Promotion and Level of Proficiency.

SF6 is the school-level counterpart and consolidation of SF5 (delivered in Waves 3I/3J). While SF5 is generated per section by the assigned Class Adviser, SF6 is generated school-wide by the School Head or LIS Coordinator to tabulate:

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
   - Implemented `src-tauri/src/export/sf6.rs` defining `Sf6SectionSummary`, `Sf6Export`, and `build_sf6_export`.
   - Reuses `ProficiencySummary` and status calculation logic established in `sf5.rs`.
   - Formats RFC-4180 CSV with formula-injection neutralization and double-table layout with grade-level subtotals and school grand totals.
2. **Backend Command & Multi-tenant Boundary**:
   - Implemented `commands::export::export_school_eosy_sf6` in `src-tauri/src/commands/export.rs`.
   - `school_id` is derived strictly from the authenticated session (`SessionManager::require_active_school_scope`).
   - Gathers all sections belonging to the school, resolves rosters and class records for the requested school year, and consolidates promotion results without any cross-school data leakage.
   - Sanitizes filename components and outputs to `<Documents>/LIKHA-SIS/SF6_<SchoolName>_<SchoolYear>.csv`.
3. **Frontend Application & Infrastructure Ports**:
   - Extended `ExportRepository` port and `TauriExportRepository` with `exportSchoolEosySf6(schoolYear)`.
   - Added `exportSchoolEosySf6` with validation (non-empty trimmed school year) to `ExportApplicationService`.
   - Registered `export_school_eosy_sf6` in `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` in `src/infrastructure/tauri/invoke.ts`.
4. **Wave 3L User-Facing Promotion Summary Interface**:
   - Added `exportService` optional prop to `SectionsScreen.tsx`, rendering an accessible "End-of-School-Year Summary (SF6)" form panel.
   - Dynamically selects from existing school years found across sections with fallback to manual entry when no sections exist.
   - Provides teacher mode contextual support (Guided mode guidance citing DepEd Order No. 4, s. 2014 & DO 8 s. 2015), in-flight disablement guards, success feedback with file path and structured field disclosures, and error messaging.
   - Wired `exportService={exportService}` to `SectionsScreen` in `src/App.tsx`.

## Consequences

- Full End-of-School-Year reporting pipeline (SF5 Section Promotion + SF6 School Summarized Promotion) is completely delivered across backend, frontend ports, and UI layers with strict multi-tenant isolation and 0 data leakage.
- Expanded Vitest test suite to 766 tests across 78 files and 613 Rust lib tests + 14 integration test suites with zero accessibility violations.
