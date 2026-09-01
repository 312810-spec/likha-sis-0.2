# ADR-0059: School Form 4 (SF4) Monthly Learner Movement and Attendance Consolidation Foundation

## Status

Accepted (Wave 3M delivered)

## Context

Philippine Department of Education (DepEd) Order No. 4, s. 2014 ("Adoption of Modified School Forms") and DepEd Order No. 58, s. 2017 govern the official School Form 4 (SF4): Monthly Learner Movement and Attendance Consolidation.

SF4 is the school-wide monthly counterpart and consolidation of SF2 (Section Daily Attendance). While SF2 is maintained by the assigned Class Adviser per section, SF4 is generated school-wide by the School Head or LIS Coordinator at the end of each calendar month to tabulate:

1. **Table 1: Monthly Attendance Consolidation by Section and Grade Level**:
   - Section Name, Grade Level, Class Adviser Name (from section advisory assignment).
   - Registered Learners (Male, Female, Total).
   - Daily Average Attendance: Male, Female, Total ($\text{Daily Average Attendance} = \frac{\text{Total Attendance for Month}}{\text{Number of School Days in Month}}$).
   - Percentage of Attendance for the Month: Male, Female, Total ($\text{Percentage of Attendance} = \frac{\text{Daily Average Attendance}}{\text{Registered Learners}} \times 100\%$).
   - Grade level subtotals and School Grand Total.
2. **Structured Field Disclosure**:
   - Populated fields (School ID, School Name, Report Month and Year, Grade Levels & Section Names, Class Advisers, Registered Learners, Daily Average Attendance, Percentage of Attendance).
   - Omitted fields (Division/District/Region hierarchy, Transferred In / Transferred Out / Dropped Out / NLPA specialized reason classification, School Head physical ink signature block).

## Decision

1. **Pure Domain Export Builder**:
   - Implemented `src-tauri/src/export/sf4.rs` defining `Sf4SectionSummary`, `Sf4Export`, and `build_sf4_export`.
   - Formats RFC-4180 CSV with formula-injection neutralization, grade-level subtotals, and school grand totals.
2. **Backend Command & Multi-tenant Boundary**:
   - Implemented `commands::export::export_school_monthly_attendance_sf4` in `src-tauri/src/commands/export.rs`.
   - Derives `school_id` strictly from the authenticated session (`SessionManager::require_active_school_scope`).
   - Gathers all sections in the school, resolves monthly attendance rosters and grids via `attendance::monthly_grid_for_section`, computes sex-disaggregated daily average attendance and percentage of attendance, queries active class advisers as of the end of the report month, and writes to `<Documents>/LIKHA-SIS/SF4_<SchoolName>_<Year>-<Month>.csv`.
3. **Frontend Application & Infrastructure Ports**:
   - Added `Sf4ExportResult` in `src/domain/export.ts`.
   - Extended `ExportRepository` port and `TauriExportRepository` with `exportSchoolMonthlyAttendanceSf4(year, month)`.
   - Added `exportSchoolMonthlyAttendanceSf4` with validation (`month` 1..12, `year` 2000..2100) to `ExportApplicationService`.
   - Registered `export_school_monthly_attendance_sf4` in `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` in `src/infrastructure/tauri/invoke.ts`.

## Consequences

### Reconciliation security addendum (2026-09-01)

School-wide SF4 export is gated by
`Capability::ExportSchoolReports` (Registrar + School Head). A plain Teacher
session cannot consolidate attendance across every section. This is the same
dedicated records-authority boundary used by SF6 and can later be widened to
the planned LIS Coordinator role without changing either command.

- Full Monthly Attendance reporting pipeline now covers both section level (SF2) and school-wide consolidation (SF4) with strict session-scoped school isolation.
- Prepares for the Wave 3N User Interface integration.
