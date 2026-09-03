# ADR-0059: School Form 4 (SF4) Monthly Learner Movement and Attendance Consolidation Foundation

## Status

Accepted. Originally delivered on the `antigravity/likha-sis-wave3m-*` lineage
(Wave 3M) and brought forward onto `main` during the Wave 3m reconciliation
(GitHub issue #16) — see `docs/adr/0060-wave-3m-reconciliation.md` for the
reconciliation record.

## Context

Philippine Department of Education (DepEd) Order No. 4, s. 2014 ("Adoption of Modified School Forms") and DepEd Order No. 58, s. 2017 govern the official School Form 4 (SF4): Monthly Learner Movement and Attendance Consolidation.

SF4 is the school-wide monthly counterpart and consolidation of SF2 (Section Daily Attendance). While SF2 is maintained by the assigned Class Adviser per section, SF4 is generated school-wide by the School Head or LIS Coordinator at the end of each calendar month to tabulate:

1. **Table 1: Monthly Attendance Consolidation by Section and Grade Level**:
   - Section Name, Grade Level, Class Adviser Name (from section advisory assignment).
   - Registered Learners (Male, Female, Total).
   - Daily Average Attendance: Male, Female, Total (total attendance for the month divided by the number of school days in the month).
   - Percentage of Attendance for the Month: Male, Female, Total (daily average attendance divided by registered learners, as a percentage).
   - Grade level subtotals and School Grand Total.
2. **Structured Field Disclosure**:
   - Populated fields (School ID, School Name, Report Month and Year, Grade Levels & Section Names, Class Advisers, Registered Learners, Daily Average Attendance, Percentage of Attendance).
   - Omitted fields (Division/District/Region hierarchy, Transferred In / Transferred Out / Dropped Out / NLPA specialized reason classification, School Head physical ink signature block).

## Decision

1. **Pure Domain Export Builder**:
   - `src-tauri/src/export/sf4.rs` defining `Sf4SectionSummary`, `Sf4Export`, and `build_sf4_export`.
   - RFC-4180 CSV with formula-injection neutralization, grade-level subtotals, and school grand totals.
2. **Backend Command & Multi-tenant Boundary**:
   - `commands::export::export_school_monthly_attendance_sf4` in `src-tauri/src/commands/export.rs`.
   - `school_id` derived strictly from the authenticated session (`SessionManager::require_active_school_scope`) — same isolation convention as SF2/SF6, not the adviser-of-section gate SF5 uses.
   - Gathers all sections in the school, resolves monthly attendance rosters and grids via `attendance::monthly_grid_for_section`, computes sex-disaggregated daily average attendance and percentage of attendance, looks up each section's active class adviser as of the end of the report month (via the existing `section_advisory::current_adviser_for_section`, ADR-0056), and writes to `<Documents>/LIKHA-SIS/SF4_<SchoolName>_<Year>-<Month>.csv`.
3. **Frontend Application & Infrastructure Ports**:
   - `Sf4ExportResult` added to `src/domain/export.ts`.
   - `ExportRepository` port and `TauriExportRepository` extended with `exportSchoolMonthlyAttendanceSf4(year, month)`.
   - `exportSchoolMonthlyAttendanceSf4` with validation (`month` 1..12, `year` 2000..2100) added to `ExportApplicationService`.
   - **Not** added to `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` — same reasoning as SF6 (ADR-0058): this command gates only on `require_active_school_scope`.
4. **No UI trigger this wave, deliberately** — SF4 shipped domain/backend/port-layer complete with no screen wired to call it, matching this project's established zero-UI-first precedent for a new export (the same pattern M10/SF2, Wave 3E's Section Advisory Foundation, and Wave 2V's Subject Attendance Foundation all used). The next slice that wants to expose SF4 in the product should add a school-wide monthly-summary trigger (e.g. alongside the existing SF2 export on `MonthlySummaryScreen`) rather than inventing a new screen.

## Consequences

- The monthly attendance reporting pipeline now covers both section level (SF2) and school-wide consolidation (SF4) with strict session-scoped school isolation.
- Verified locally at reconciliation time: `npm run quality` 777/777 vitest, typecheck/lint/format/architecture clean. `cargo build`/`cargo test`/`cargo clippy` could not run in the reconciliation session for the same missing-system-library reason recorded in ADR-0057/ADR-0058 — Rust correctness was instead verified by hand-checking every type/function signature this feature depends on against the actual current repository source. Retained as verification debt in `docs/VERIFICATION-DEBT.md`.
