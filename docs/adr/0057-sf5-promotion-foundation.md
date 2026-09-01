# ADR-0057: School Form 5 (SF5) Report on Promotion and Level of Proficiency Foundation

## Status

Accepted (Wave 3I delivered)

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

1. **Pure Domain Export Builder**: Implemented `src-tauri/src/export/sf5.rs` containing:
   - `PromotionStatus` and `LevelOfProficiency` types with pure classification logic.
   - `Sf5LearnerRow::compute_status` implementing DepEd promotion and average rules.
   - `ProficiencySummary::compute` aggregating sex-disaggregated distributions.
   - `build_sf5_export` generating CSV and `FieldDisclosure`.
2. **Advisory Authorization Boundary**:
   - `commands::export::export_section_eosy_sf5` gates execution with `auth::authorize_adviser_of_section`.
   - Only the assigned Class Adviser (as of EOSY) or an authorized School Head in the same school may generate the section's official SF5.
   - Multi-tenant school isolation strictly verified.
3. **Frontend Integration**:
   - Updated `ExportRepository` port and `TauriExportRepository` adapter with `exportSectionEosySf5(sectionId, schoolYear)`.
   - Updated `ExportApplicationService` with validation on trimmed parameters.
   - Updated `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` in `src/infrastructure/tauri/invoke.ts` so permission denials do not trigger accidental global logouts.

## Consequences

- Teachers assigned as class advisers and school heads can officially generate section-level SF5 exports with zero data leakage across schools.
- Promotion calculations strictly follow DepEd Order No. 8, s. 2015 without ad-hoc rules.
- Test coverage expanded to 611 lib tests + 14 integration test suites and 755 vitest tests.
