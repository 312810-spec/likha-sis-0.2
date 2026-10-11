# TANAW SMEA/DMET evidence matrix — research checkpoint (2026-10-08)

**Status:** PARTIAL — source-discovery and representative content inspection, not an approved DMET field dictionary.

## Authoritative workflow

Division Memorandum 0439, s. 2026 (2026-09-29), paragraph 6: School Heads / school M&E Coordinators provide data via Division Monitoring and Evaluation Tool (DMET); Public School District Supervisors validate submitted data for consistency and accuracy. Paragraph 4 requires First-Term DMEA reporting on crucial BLICs with supporting data and promising practices. The 2026-10-06 conference and 2026-10-02 PSDS submission deadline are past; do not treat them as new future requirements.

**Project decision supplied by product owner:** no DMET API; official DMET entry is a separate, human-operated process. **TANAW Lock authority:** SMEA Coordinator only. This is an internal TANAW privilege, not a claim that the Division granted or defined it.

## Discovered connected Drive source structure

- Current SY 2026–2027 top-level folder `SMEA 2026-2027` (`1aIj4bdsgRE3pUTLohi0fT65jdfUmnTmr`)
  - `reference` folder: recent `TINGUB NHS SMEA Q1(1).pptx` (`1cnZHUe0bUjG-znn8m9CooCuKS2XlvLoi`).
  - `CONSOLIDATORS`: `Division`, `District`, `School` subfolders.
  - `BOW files`, `ECR` folders.
- Historical `SMEA DATA 2025-2026`: `SMEA RAW DATA`, `SMEA PPT FILES`, `SMEA DOCS`, consolidation workbook (`1qB2mSbIsAFaSmwkq2Nl1x0nWevmT3FWO`).
- `Division` consolidators: separate JHS/SHS enrollment, dropouts, grade-level failures and BLIC/promising-practice folder.
- `District` consolidators: `TERM 1`, `TERM 2`, `TERM 3`, `FINAL GRADE`.
- Historical first-quarter school executive summary (`1qBo7ZopQ-5bUeRZVn-JCgebRrJIP6nPp`).

## Extracted representative indicator/source inventory

| Family                                  | Representative source evidence                                                                                                                     | Required model semantics                                                                                | Formula / denominator status                         |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Enrollment                              | School `7. Enrollment.xlsx`; Division `3.1 ENROLLMENT (JUNIOR HIGH).xlsx`, `3.2 ENROLLMENT (SENIOR HIGH).xlsx`                                     | snapshot date, grade/program, sex aggregation if source supports, comparison baseline                   | PENDING official exact counting rule                 |
| Dropouts / transfers / learners-at-risk | School `2&3. LARDOs, Failures (Per grade level), Dropouts & Transfers.xlsx`; Division `2.1 Dropouts JHS.xlsx`, `2.2 Dropouts SHS.xlsx`             | distinguish learner-level sensitive working records from aggregate projection; intervention provenance  | PENDING eligibility/cohort and event timing rules    |
| Failures                                | Division `1. Failures Per Grade Level_Sec.xlsx`; school LARDO/failures workbook                                                                    | grade, subject, section, applicable term, assessment/finalization state                                 | PENDING unit and denominator                         |
| Academic achievement                    | Consolidation workbook and sample Q1 SMEA PPT: GSA, Written Works, Performance-Based Tasks, Term Assessment, MPS, proficiency/achievement measures | subject × grade × term; raw scores vs derived indicators; explicit sample size, complete vs provisional | PENDING official formula and aggregation/weighting   |
| Competency/curriculum coverage          | `BOW files`; historical Q1 executive summary refers to coverage                                                                                    | cohort/version, learning area, term, planned vs delivered vs evidenced competencies                     | PENDING competency denominator and signoff source    |
| Nutrition                               | School `6. Learners with Poor Nutrition.xlsx`                                                                                                      | restricted health data; aggregate-only district export                                                  | BLOCKED pending approved health definitions/workflow |
| BLIC                                    | `1. Crucial BLICs Reported.xlsx`; current DM 0439 paragraph 4                                                                                      | issue type, supporting evidence, affected scope, actions, human review                                  | descriptive; no inferred numeric formula             |
| Promising practice                      | `2. Promising Practices Reported.xlsx`; current DM 0439 paragraph 4                                                                                | practice, evidence, observed result, confirmation/attribution                                           | narrative; no AI auto-certification                  |
| Submission completion                   | `CONSO SMEA NO DATA 2025-2026.xlsx`                                                                                                                | submitted/complete/missing and expected submissions, independent of academic values                     | PENDING exact denominator for completion percentage  |

The sampled 2025–2026 consolidation workbook includes separate expected/submitted tracking, section-level missing reports, grade/subject columns, and a completion proportion. These are **historical sample structures**, not a verified 2026–2027 DMET specification.

The sampled Q1 SMEA presentation provides performance-by-subject, grade and term views (e.g., performance tasks, term assessment, GSA, trend comparisons); it is presentation evidence, not automatically a machine-readable DMET schema.

## Data quality warning

The historical `Q1 Executive Summary Tingub NHS.docx` contains a declared count of 77 Filipino frustration-level readers but the listed Grade 7/8/9/10 subtotals (30+14+12+13) do not total 77. Do not import the narrative as authoritative aggregated data until reconciled against primary Phil-IRI source. An executive summary is a _derived reporting artifact_, not source-record authority.

## Design consequences / minimal mechanism

1. Create a **versioned indicator registry** with source reference, exact definition, unit, scope, numerator, denominator, exclusions, rounding, reporting window, missing-data semantics, effective school year/term and review/approval state.
2. Create **source-to-report mappings** for school → district → Division, without sharing restricted learner-identifiable data outside authorized scope.
3. Require deterministic calculation with formula and cohort denominators explicitly approved before an indicator becomes `calculable` or `validated`. Unknown formula = `PENDING`, not zero.
4. Track raw observation, calculated projection, school-reviewed snapshot, SMEA Coordinator locked snapshot, DMET entry status, and external PSDS validation separately. Never imply automatic DMET submission.
5. Only role with internal `tanaw_lock` privilege is the SMEA Coordinator. Server-side authorization, lock hash/version, attributable unlock reason and re-lock history required; do not infer role by display title or external reviewer privilege.
6. Export an ordered **DMET preparation worksheet** and evidence register initially, not a direct API integration. No speculative scraping or silent browser submission.
7. Preserve source provenance, including file ID/worksheet/row/range where possible, source SY, and revision/approval. The 2026–2027 sources supersede older templates if conflict is verified.
8. The exact public/official DMET field dictionary, import facility, rounding and denominators remain unverified. The current SMEA PPT is evidence for a school presentation, not proof of an identical online DMET interface.

## Parked dependencies and reopening tests

- **2026–2027 current SMEA presentation deep parse:** inspect the recent PPT's full slide/table structure, compare district/Division consolidators, and extract exact report columns. Current content fetch was a partial human-readable projection and must not be treated as 100% slide fidelity.
- **DMET field mapping:** capture official on-screen field labels/requiredness/validation (approved screenshot or accessible form specification). Required before exact-format export.
- **Indicator formulas/denominators:** verify at least one approved formula source for each computed indicator and unit-test boundary cases (missing, zero denominator, mixed cohorts, inconsistent periods).
- **West 1-specific differences:** require dated PSDS/district instruction or approved template; otherwise no district-specific overrides.
- **SF/eSF7:** not blocking this DMEA/DMET scope; only a prerequisite for separately claimed official school-form generation/submission.
- **Actual Tingub scheduling data, Windows/Android runtime/device proofs:** outside the research scope, unchanged and pending.

## Validation

Drive directory and representative-file reads performed; this document has not undergone local npm/Rust or end-to-end native validation. It adds **documentation only**, without source schema/migration or production data writes. Continue implementation only through small verifiable slices in a shell-capable executor.
