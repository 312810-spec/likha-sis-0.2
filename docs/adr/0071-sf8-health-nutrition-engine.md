# ADR-0071: SF8 Health & Nutrition Engine — Data Model, Classification Logic, and BOSY/EOSY Consolidation

## Status

Accepted (engineering checkpoint — see "Verification debt" below).

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s Tier 2.2 asked to port the
WHO/DepEd BMI-for-Age and Height-for-Age growth-standard lookup logic
and the BOSY-vs-EOSY nutritional consolidation report from
`likha-sis-master`'s `src/utils/nutritionComputations.js` and
`nutritionConsolidation.js`. That legacy source was not reachable from
this machine directly; it lives in the GitHub repository
`312810-spec/likha-sis` (a public, read-accessible repo, not the same as
this project's own `312810-spec/likha-sis-0.2`), cloned read-only this
session specifically to read those two files and their test suites.

This is real learner health data — a new PII surface, gated by this
project's `authorize_*` pattern like every other tenant-scoped write
(`docs/adr/0004-authentication-and-local-session.md`), and a correctness/
safety surface: a wrong BMI-for-Age classification is a wrong
malnutrition/obesity flag for a real child, not a cosmetic bug.

## Research: can the WHO 2007 growth-standard numeric tables be sourced with confidence?

The legacy `bmiForAgeTable.js`/`hfaForAgeTable.js` ship a full 169-row
(ages 60-228 months) BMI-for-Age cutoff table and a matching
Height-for-Age table, each with a source comment attributing them to
"the DepEd School Form 8 (SF8) workbook's BMI Tables sheet." That
attribution is:

- **Not a primary citation this session verified.** It is a comment in a
  sibling AI-assisted project's source tree, not a URL this session
  fetched and read, and not a `deped.gov.ph`/WHO document this session
  opened directly.
- **Internally inconsistent with this session's own general knowledge of
  the published WHO 2007 5-19y BMI-for-age reference.** A spot-check at
  exactly 60 months (5 years) found the legacy table's boys `normalMax`
  (18.3) and `overweightMax` (20.2) implausibly high against the
  published WHO median/SD values for that age (which this session
  recalls placing the +1SD/+2SD BMI cutoffs noticeably lower, closer to
  16-18). That mismatch could mean the legacy table is wrong, or this
  session's recollection is wrong — either way, it is not a "verify and
  ship" situation.

**Decision: do not hardcode the legacy numeric table.** Per this
project's own rule (`.claude/rules/autonomous-development.md` gate #6,
`CLAUDE.md`'s "never guess" instruction, and the task's own explicit
instruction), a numeric growth-standard table that cannot be verified
with medium-high confidence must be flagged as verification debt, not
shipped as if it were authoritative. Silently misclassifying a real
child's nutrition status would be a correctness/safety defect, ranked
above teacher usability and every lower priority in this project's own
priority order.

No new WebSearch this session surfaced a directly fetchable, `who.int`-
or `deped.gov.ph`-hosted machine-readable copy of the exact BMI-for-Age/
Height-for-Age cutoff bands (as opposed to the WHO's own interactive
chart tool, which this sandbox cannot screen-scrape numeric LMS data
from). This remains open verification debt — see
`docs/VERIFICATION-DEBT.md`.

## Decision: split classification _logic_ (ship now) from the numeric _table_ (flag as debt)

`src-tauri/src/health/nutrition.rs`:

- `age_in_months(birth_date, measurement_date) -> Option<i64>` — pure
  calendar arithmetic (whole months, floored), ported in spirit from the
  legacy `getAgeInMonths`. No date-library dependency, following this
  project's own established precedent
  (`repository::attendance`'s `days_in_month`/`is_leap_year`) rather
  than adding `chrono` as an unflagged new dependency.
- `compute_bmi(weight_kg, height_m) -> Option<f64>` — pure arithmetic,
  rounded to 2 decimal places, matching the legacy `computeBMI` exactly.
- `classify_bmi_for_age(bmi, &BmiForAgeCutoffs) -> NutritionalStatus` and
  `classify_height_for_age(height_m, &HfaForAgeCutoffs) -> HeightForAgeStatus`
  — the inclusive-upper-bound band logic, ported exactly from
  `classifyNutritionalStatus`/`classifyHeightForAge`. These take
  already-resolved cutoffs as plain data; they make no claim about
  where the cutoffs came from.
- `lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` — the seam a verified WHO/
  DepEd table would plug into. **Return `None` unconditionally today**,
  by design, with a regression test
  (`lookup_bmi_cutoffs_is_deliberately_unpopulated_pending_a_verified_who_source`)
  that fails loudly if a future change flips this silently without also
  updating this ADR and `docs/VERIFICATION-DEBT.md`.

This means: age computation and BMI computation are fully correct and
usable today; a captured measurement can be recorded with its
classification left unset until a verified table lands. This is a
disclosed, deliberate partial-feature state, not a half-finished
oversight — every other part of the pipeline (persistence, tenant
isolation, authorization, the BOSY/EOSY report) is complete and tested
regardless of this one gap.

## Decision: BOSY/EOSY consolidation is pure aggregation, fully shippable regardless of the table gap

`src-tauri/src/health/consolidation.rs` ports `nutritionConsolidation.js`'s
`consolidateByGradeLevel`/`withPercentages` faithfully: per-grade-level
Enrolment/Weighed/BMI-category/HFA-category counts split Male/Female/
Total, a school-wide grand total, and percentage derivation (Pupils
Weighed % = weighed/enrolment; every category % = category count/
weighed). A record with `nutritional_status: None` is counted as
"weighed" but lands in no BMI bucket — exactly the legacy
`if (bmiKey) increment(...)` tolerance — so this report works correctly
today even though real classification cannot run yet.

## Data model (`src-tauri/src/db/migrations.rs` migration 43, `src-tauri/src/repository/nutrition.rs`)

`nutrition_records`: one row per learner per school year per period
(`BOSY`/`EOSY`, `UNIQUE (learner_id, school_year, period)`), storing
`birth_date`, `measurement_date`, `height_m`, `weight_kg`, the
server-computed `age_in_months`/`bmi`, and nullable
`nutritional_status`/`height_for_age_status`. `school_id` is a foreign
key and every query is scoped by it, matching this project's tenant-
isolation rule throughout.

**Why `birth_date` lives on this table, not on `learners`**:
`docs/adr/0017-learner-reference-number-and-sex.md` deliberately kept
birthdate off the learner profile until it could be verified against an
official template this app already generates. SF8 genuinely needs a
learner's age at measurement time, but adding it here — captured
per-record, the same way a real paper SF8 form is filled per
weighing — does not reopen ADR-0017's decision; it scopes the field to
exactly the one feature that needs it.

`repository::nutrition::record_measurement` validates sex, dates, and
height/weight in Rust (`AppError::InvalidInput`) before ever writing to
the database — not left to `CHECK` constraints alone, matching this
project's `AttendanceStatus::from_db_str` precedent of not trusting the
schema to be the only line of defense.

## Authorization (`src-tauri/src/auth/mod.rs`)

New `Capability::ManageHealthRecords`, allowed roles `[Registrar, School
Head]` — the same conservative pair as `ManageLearners`. **Deliberately
not extended to Teacher in this ADR**: DepEd's real workflow has a
section adviser measure only their own section, but this project's role
model has no per-section restriction analog yet (the
`authorize_adviser_of_section`/`authorize_own_assignment` pattern other
features use). Granting a bare Teacher role unrestricted read/write over
every learner's health data school-wide would be broader than the real
workflow, so this is deferred rather than shipped too permissively —
matching this project's own precedent of disclosed, scoped deferral
(ADR-0070 deferred curriculum-version/calendar-structure PIN gating the
same way).

## Commands (`src-tauri/src/commands/nutrition.rs`)

`record_nutrition_measurement`, `get_nutrition_record_for_learner`,
`get_nutrition_consolidation_report` — all gated by
`Capability::ManageHealthRecords`, `school_id` always derived from the
session. The consolidation command builds school-wide enrolment by
reusing `section::list_by_school` +
`section_membership::roster_for_section_over_range`, the exact pattern
`commands::export::export_school_eosy_sf6` already established for a
school-wide, section-spanning report — no new query shape was invented.

## Scope explicitly deferred (not part of this ADR)

- Frontend UI (a measurement-entry screen, a consolidation report view)
  — Rust-side data model/logic/authorization only, matching this
  project's established split between a security/architecture ADR and
  its later UI slice (ADR-0070's own "Frontend UI ... is not part of
  this ADR's scope" precedent).
- A CSV/official-form export of the consolidation report — the task
  asked for the report logic, not a new export format; `export::sf5`/
  `sf6`'s CSV pattern is available to reuse later if a real official SF8
  consolidation workbook layout is sourced.
- Section-scoped Teacher authorization for recording measurements (see
  above).
- Populating `lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` with a real,
  verified WHO/DepEd table (see "Verification debt").

## Verification

- `cargo test` (whole crate, `--lib` and all `tests/*.rs` integration
  binaries): all green, including 39 new tests across
  `health::nutrition`, `health::consolidation`, `repository::nutrition`,
  `db::migrations` (migration 43), and `auth` (the new capability).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean (after one `cargo fmt` pass).
- `npm run quality`: typecheck/lint/format:check/architecture-check/
  `knip`/vitest all passed (no frontend file was touched by this slice;
  run to confirm no regression).

## Verification debt

Recorded in `docs/VERIFICATION-DEBT.md`: the WHO 2007 BMI-for-Age and
Height-for-Age numeric cutoff tables are **not populated** —
`lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` return `None` unconditionally.
A future session should source these from a primary WHO (`who.int`) or
DepEd (`deped.gov.ph`) document this session could not fetch and read
directly, independently verify a representative sample of rows, and
only then populate the lookup functions — updating this ADR and the
verification-debt entry together, never silently.
