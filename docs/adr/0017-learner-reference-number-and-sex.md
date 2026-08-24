# ADR-0017 — Learner Reference Number and Sex (M17)

Status: Accepted

## Context

The user directed a roadmap ending in "M17 — Learner Profile Enrichment,
when required by report cards/forms" — a deliberately narrower framing
than the original M9-era "Learner Profile Enrichment" idea (LRN,
birthdate, guardian contact), which was never built. This milestone is
also the first exercised under Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`): no user pick was requested
for scope inside M17, only evidence-based judgment against the
qualifier already given.

Before adding any field, this milestone checked what this app's own
already-shipped exports actually disclose as missing:

- `export::report_card` (M14) discloses five omissions — DepEd weight
  coverage gaps, the Qualitative Descriptor table, DO 8 s.2015, General
  Average, and signatures. **None of them was a learner-profile field.**
- `export::sf2` (M10) discloses one profile-shaped gap, bundled into a
  dropout/transfer-statistics line: "does not track learner gender,
  drop-out events, or transfer events at all."

That is, LRN, birthdate, and guardian contact were **not** shown as
missing by any shipped form before this milestone — the "when required"
qualifier did not automatically select the original M9 field list.
Per `.claude/rules/security-privacy.md` ("do not expand PII collection
unnecessarily") and the "explicit, not inferred" DepEd-compliance rule,
adding a field because a report card conventionally carries it, from
memory, is exactly the kind of unverified inference this project
prohibits — training-data recall is not a primary source.

## Research

Verified via independent secondary sources describing DepEd's actual
official templates (the primary DepEd Order PDFs for SF2/SF9 were not
available as machine-readable text in this session — same limitation
M13 hit and resolved by visual transcription of a scanned PDF; this
milestone instead applied the bar M10 already established for SF2's own
field layout: two independent corroborating web sources, not a single
unverified one):

- **SF2** (already exported by this app): teacherph.com's SF2 template
  walkthrough and ilovedeped.net's independent how-to-interpret guide
  both describe the same per-learner roster columns — "Name of
  Learners... with their learner reference number (LRN)" and "Sex...
  Male (M) or Female (F)." Two independent sources agree.
- **SF9-style report card** (this app's own DepEd-grade-computation-
  inspired export, `export::report_card`): openeducat.org's SF9 field
  inventory names the Learner Information header as "Name, LRN, grade
  level, section, school, school year."

Birthdate and guardian contact were checked against the same sources and
found in neither — no shipped export currently discloses either as
missing, so neither is added. This is a real, evidence-driven scope cut,
not an oversight: the milestone qualifier says "when required," and
these two do not currently meet that bar.

## Decision

Add exactly two fields to `learners`: **LRN** (12-digit national Learner
Reference Number) and **Sex** ('M'/'F'), via migration 13. Both nullable
— there is no honest default for either (unlike M15's weight-policy
COALESCE-to-default), and no backfill is possible for a learner enrolled
before this migration. Format is enforced at the database boundary, not
just the application layer: `CHECK (lrn IS NULL OR (length(lrn) = 12 AND
lrn GLOB '[0-9]...'))`, `CHECK (sex IS NULL OR sex IN ('M', 'F'))`, plus
a partial unique index `(school_id, lrn) WHERE lrn IS NOT NULL` — this
app can only ever see one school's data, so it enforces LRN uniqueness
within that scope as a data-entry sanity check, not a claim of verified
national uniqueness (a duplicate LRN reused across two different
schools' own separately-isolated data is not rejected, by design — see
the migration's own test,
`migration_13_allows_the_same_lrn_pattern_reused_across_different_schools`).

No new architecture decision was needed — this follows the established
"add an optional column, thread it through the existing repository/
command/service layers" shape used throughout M9-M16, not a new pattern.

Both `export::sf2` and `export::report_card` were updated to actually
populate the fields when present, and to disclose per-row (not
globally) when a specific learner doesn't have one recorded yet — "not
fabricated," matching this project's own established disclosure
convention. `export::sf2`'s existing "gender" omission text was
corrected: it previously said the app "does not track learner gender...
at all," which stopped being true; the corrected text says Sex is now
tracked, but drop-out/transfer _events_ (and therefore the by-sex
breakdown DepEd's statistics need) still are not.

`LearnerApplicationService` validates LRN format (`/^\d{12}$/`) before
ever calling the repository — this app cannot verify a real learner's
LRN is _correct_, only that it's _shaped_ like one, so a malformed value
is rejected rather than silently stored as a wrong identifier. An empty/
whitespace LRN is treated as "not provided," not a validation error,
since the field is optional.

`LearnerListScreen`'s enrollment form gained two new optional fields
(LRN, Sex), with a Guided-mode hint explaining why they matter (the SF2/
report-card exports need them) even though nothing requires filling them
in immediately.

## Consequences

- New: migration 13 (`learners.lrn`, `learners.sex`, plus the partial
  unique index). Six new migration tests covering nullability for
  existing rows, valid values, format rejection (three malformed LRN
  shapes), sex-domain rejection, same-school duplicate rejection, and
  cross-school duplicate tolerance.
- `repository::learner::{create,update}` gained `lrn`/`sex` parameters
  (both `Option<&str>`); every call site across the Rust codebase (51
  occurrences across 12 files — repository tests, integration tests,
  `auth/mod.rs`'s isolation test, `grading_computation.rs`/
  `learner_score.rs`'s fixtures) was updated to pass `None, None` unless
  the test specifically exercises the new fields.
- `repository::section_membership::SectionRosterMember` and
  `repository::attendance::MonthlyLearnerAttendance` both gained `lrn`/
  `sex` fields, threaded from the `learners` table through both roster
  queries (`roster_for_section`, `roster_for_section_over_range`) so
  both exports can see them without a second query.
- `commands::learner::{create_learner,update_learner}` gained optional
  `lrn`/`sex` parameters (`update_learner`'s Rust command existed since
  M7 but had no TS caller until this milestone — its TS wiring,
  `LearnerRepository.updateProfile`/`LearnerApplicationService.updateLearnerProfile`,
  is new and used so far only by tests; no UI screen calls it yet — see
  "Not implemented" below).
- **Verification actually run this session**: `cargo test` — 217 lib (up
  from 208; +9: 6 migration tests, 3 `learner.rs` repository tests) + 51
  integration tests, all green. `cargo clippy --all-targets -D warnings`
  clean. `npm run quality` — 249 TS tests (up from 242), typecheck/lint/
  format/architecture-boundary all clean. `npm run build` succeeds.
- **Independent review**: not dispatched. This milestone touches no new
  authorization surface (still session-derived `school_id` throughout)
  and no new command pattern (`create_learner`/`update_learner` already
  existed; only their parameter lists grew) — the same reasoning M15/M16
  used to skip dispatch. Given LRN/Sex are new PII fields, a
  `security-reviewer` self-check was still performed inline: confirmed
  no new field bypasses `require_active_school_scope`, confirmed the
  format `CHECK` constraints cannot be bypassed by the TS layer (they're
  enforced by SQLite itself, not just `LearnerApplicationService`), and
  confirmed no LRN/Sex value is ever logged, echoed in an error message,
  or placed in a URL/query string anywhere touched by this change.
- **Not implemented (deliberately out of scope)**: birthdate and
  guardian contact — no shipped export currently discloses either as
  missing, so neither was added (see "Research" above; revisit only if
  a future export's own disclosure names one of them as missing). No UI
  for editing an _existing_ learner's LRN/Sex — the repository/service/
  command plumbing (`updateProfile`/`updateLearnerProfile`) is built and
  tested, but `LearnerListScreen` has no edit affordance yet, so a
  learner enrolled before this migration (or without LRN/Sex filled in
  at enrollment) can only gain them once such a screen exists. This is a
  real, disclosed gap, not an oversight — closing it is worth doing
  alongside a future milestone that touches learner-detail UI, not
  worth a rushed addition here.
