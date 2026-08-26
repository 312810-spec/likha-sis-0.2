# ADR-0042: Learner Core + Enrollment Domain Foundation (Wave 2A)

Status: Accepted (2026-08-26)

## Context

Wave 2 (`docs/adr/0035`) begins with a foundation milestone: settle the
relationship between learner identity and enrollment placement before
building SF1 bulk import (Wave 2B). The directing brief's default
hypothesis was a new `Learner 1 → N Enrollment` schema. Repository
truth was checked before assuming that hypothesis was correct.

## Repository truth: the domain separation already exists

`learners` (migration 1, `lrn`/`sex` added migration 13) holds only
identity fields — `id`, `school_id`, `given_name`, `family_name`,
`lrn`, `sex`. It has never carried `grade_level`/`section`/
`school_year` as mutable attributes.

`section_memberships` (migration 5) already is the enrollment-history
model the brief describes, not a placeholder to be replaced:

- `(learner_id, section_id, starts_on, ends_on)`, modeled as a
  half-open interval `[starts_on, ends_on)`.
- `idx_one_active_membership_per_learner` — a `UNIQUE INDEX ...
WHERE ends_on IS NULL` — makes "at most one current placement" a
  structural database invariant, not check-then-act application code
  (this project has shipped that exact race twice before: the M4
  self-grant bug and the M6 bootstrap race, both closed only after
  independent review; migration 5's own comment already cites this).
- `section_membership::enroll()` already implements transfer
  correctly: enrolling into a new section auto-closes any open
  membership at the new `starts_on` and opens the new one — proven by
  an existing test, `transfer_closes_the_old_membership_and_opens_a_new_one`,
  which this milestone re-ran, not merely cited.
- `roster_for_section`/`roster_for_section_over_range`/
  `is_active_member` already give point-in-time and range roster
  queries, already used by attendance and exports.
- `sections` carries `school_year`/`grade_level` — so "which school
  year/grade a learner is in" is already derived via the section a
  membership points to, never duplicated onto the learner or the
  membership row. This is exactly the derivation-over-duplication
  principle the brief itself asks for (§34: "Can LIKHA derive this
  from existing data?").

Since SF1's own School Register is _generated per section_ by the
class adviser (confirmed via DepEd source research below), DepEd's own
workflow already treats "section roster as of a date" as the
authoritative enrollment view — the exact shape `section_memberships`
already provides.

## DepEd / SF1 research

Fetched from current secondary sources (official `deped.gov.ph`/`lis.deped.gov.ph`
were not directly fetchable this session — network egress limitation
consistent with every prior session's disclosed gap; findings below
are triangulated across independent secondary sources, not primary-source-verified):

- **CONFIRMED REQUIREMENT**: LRN is a permanent, system-generated
  12-digit number issued once and kept for the learner's whole basic-education
  career "regardless of transfer to another school" (DepEd Order No.
  22, s. 2012, "Adoption of the Unique Learner Reference Number" —
  cited by multiple independent secondary sources). This matches
  `learners.lrn`'s already-shipped shape exactly (ADR-0017): a
  stable, per-learner field that survives any section/school change,
  never re-derived per enrollment. No change needed.
- **CONFIRMED REQUIREMENT**: SF1's own "Remarks" column tracks
  learner movement/status categories — Transferred In, Transferred
  Out, Transferred Out to ALS, Dropped Out, Balik-Aral (a returning
  learner after dropping out), plus unrelated learner-attribute flags
  (CCT/4Ps recipient, Learner with Exceptionality per DepEd Order 45,
  s. 2017).
- **PRODUCT INTERPRETATION**: the "why did this placement end"
  categories above are real DepEd data points, but they are a mix of
  genuinely different concerns — some describe _why a section
  membership ended_ (transfer, drop), others describe _learner-level
  flags unrelated to placement_ (CCT/4Ps, exceptionality). Building a
  correct, complete representation of this taxonomy needs SF1's exact
  field-level requirements, which belong to Wave 3 (Authoritative-template
  Form Engine, `docs/adr/0035`'s own sequencing) — not to be guessed
  at partially here. See "Deferred: enrollment status/reason" below.
- **UNRESOLVED**: exact alphanumeric SF1 remarks codes were not found
  in any source reachable this session (described only as "equivalent
  codes exist" without listing them) — not encoded as a rigid rule,
  per this milestone's own instruction not to guess.
- **CONFIRMED, already known** (ADR-0013, prior session, primary-source-verified
  against DepEd Order No. 015, s. 2026): LIKHA uses three grading
  terms, not four quarters. Nothing in this milestone's research
  suggests enrollment itself needs term granularity — see "three-term
  model" below.

## Domain decision

### 10 scenarios evaluated

1. Current `learners` table extended minimally (add `grade_level`/
   `section` columns directly) — rejected: this is the exact
   anti-pattern the brief itself warns against; would also contradict
   already-shipped, already-tested behavior (`section_memberships`
   already gives transfer/history correctly; adding mutable fields to
   `learners` would create two competing sources of truth).
2. **Learner + `section_memberships` as Enrollment, extended only
   where a real gap exists** — recommended, see below.
3. A brand-new, separate `enrollments` table (learner/school/year/grade/section/status),
   with `section_memberships` kept only for classroom-roster mechanics
   — rejected: this is exactly the "accidental competing concept"
   failure mode the Integration Review milestone was just watching
   for. Two tables would both need to answer "is this learner
   currently placed," and every write (enroll, transfer, withdraw)
   would need to keep both in sync — a maintenance burden and a race
   condition risk with zero functional benefit over extending the one
   table that already works.
4. Learner + current-enrollment-pointer + separate event-log table —
   rejected for this milestone: `section_memberships` already _is_ an
   event-log-shaped history (one row per placement span); adding a
   parallel event table on top would duplicate, not clarify, the
   existing history.
5. Enrollment-as-authoritative, section as a derived reference (invert
   today's model so an `enrollments` row is primary and `section_id`
   is one of several attributes on it) — rejected: no repository
   evidence shows a need for placement without a concrete section (see
   "school-year-only enrollment" below); this would be a real
   architecture inversion for a need that hasn't been demonstrated.
6. Section-membership model as the sole enrollment mechanism — this
   is what's already built (repeats #2 in the brief's own list); same
   answer.
7. School-year-specific learner snapshot rows (one denormalized row
   per learner per school year) — rejected: denormalizes exactly the
   data `sections`+`section_memberships` already normalize correctly;
   would need its own reconciliation logic to stay in sync with the
   membership table, solving a problem that doesn't exist.
8. Append-only event-derived model (replay events to compute state) —
   rejected: adds event-sourcing complexity (replay logic, snapshotting)
   this project has no other precedent for and no demonstrated need;
   `section_memberships`' half-open-interval rows already give correct
   point-in-time state via a single indexed query, proven fast enough
   for this app's scale (attendance/rosters already query it this way
   in production paths).
9. Provider-independent generic normalized ERD (Learner/Person,
   Enrollment, Placement, Institution as fully generic entities) —
   rejected: over-abstracts for a single-product, single-country,
   single-curriculum-family app; this codebase's own established
   convention (concrete DepEd-shaped tables, not a generic SIS kernel)
   already rejected this shape when Curriculum Versioning was designed
   (ADR-0037).
10. An unconventional model borrowed from a mature OSS SIS (e.g.
    OpenSIS/Fedena's course-period-enrollment triples) — considered,
    not adopted: those models solve a harder problem (many concurrent
    course enrollments per term) LIKHA doesn't have (one section per
    learner at a time, per DepEd's own single-adviser-classroom
    structure); adopting that shape would import unneeded complexity.

### Recommended

**Option 2/6: keep `learners` (identity) and `section_memberships`
(enrollment/placement, already history-preserving) as the domain
model. No new table, no schema migration for the core model.**
Formalize this in the domain vocabulary (TS/Rust doc comments call
`section_memberships` "the Enrollment record" explicitly where it
clarifies intent) without renaming the physical table — a rename
would touch every existing call site (attendance, exports, section
commands) for zero functional benefit, contradicting "don't replace
working code merely for aesthetic reasons."

Add only what's genuinely missing, each independently justified by
evidence gathered this session (not speculative):

1. **Close a real authorization gap**: `commands::section::enroll_learner_in_section`
   was gated only by `require_active_school_scope` — no capability
   check at all, so any authenticated Teacher session could enroll or
   transfer any learner in the school. Fixed to
   `auth::authorize_capability(Capability::ManageLearners)`, reusing
   `create_learner`/`update_learner`'s existing capability rather than
   inventing a new one — matches this codebase's own established
   convention (`update_learner`'s doc comment: "the same 'manage
   learners' capability, not a separate one"). `create_section`'s
   identical gap was found in passing but is a separate, adjacent
   decision (section _definition_ is closer to scheduling/admin than
   learner enrollment) — flagged as a follow-up task, not fixed here,
   to keep this milestone's scope to enrollment itself.
2. **Enrollment history retrieval**: no repository function existed to
   answer "given a learner, what are all their section memberships,
   past and current" — every existing query goes the other direction
   (section → roster). Added `section_membership::list_by_learner_in_school`
   and `current_membership_for_learner_in_school` (the latter derived
   from the same `ends_on IS NULL` invariant the unique index already
   enforces — no new "is this current" flag, per the brief's own §17).
3. **Duplicate-candidate lookup**: no repository function existed to
   check "does a learner resembling this one already exist" before
   creating a new one. Added `learner::find_candidates` — exact-LRN
   match OR case-insensitive, trimmed exact-name match, school-scoped,
   read-only, returns candidates for a human to compare — never
   auto-merges, matching this project's own already-recorded product
   policy (`docs/product/PRODUCT-CONTRACT.md`'s SF1 row: "never
   silently merge; adviser/authorized user compares and chooses").
   Deliberately no fuzzy/phonetic matching (punctuation, middle names,
   Filipino naming conventions) — out of scope per the brief's own
   §20 instruction; exact-match-only is a conservative, safe starting
   point that produces zero false "possible duplicate" merges.

### Next Best

A new dedicated `enrollments` table (scenario 3) was the strongest
competitor — it would give a home for enrollment-specific metadata
(status, provenance) without touching `section_memberships`'s existing
shape. Rejected because the metadata it would hold (status/provenance)
turned out, on inspection, to not yet be justified (see "Deferred"
below) — building the table now would mean shipping an empty
placeholder, or guessing at columns Wave 2B's actual importer design
will determine better later.

### Why Recommended Won

Every alternative that adds a new table or event layer either (a)
duplicates data `section_memberships` already owns correctly, creating
exactly the "two systems representing who's placed where" class of bug
the Integration Review milestone was watching for, or (b) solves a
scale/concurrency problem (many simultaneous course enrollments,
event-sourced replay) LIKHA's actual domain — one adviser-owned
section per learner at a time — doesn't have. The existing model is
already correct, already tested, and already used in production code
paths (attendance, exports). The evidence-based answer is to close the
one real gap (authorization) and add the two genuinely missing queries
(history, duplicate-candidates), not to rebuild a working foundation.

### Risks / Deferred Questions

- **Deferred: enrollment status/reason.** SF1's real remarks taxonomy
  (transfer/drop/Balik-Aral/etc.) is not encoded now — a nullable
  `end_reason`-shaped column can be added to `section_memberships`
  later with zero destructive redesign (a plain `ALTER TABLE ADD
COLUMN`, matching every other additive migration in this codebase,
  e.g. migration 13's `lrn`/`sex` addition). Revisit when Wave 3 (Form
  Engine) locks SF1's exact field requirements, so the column is built
  right once instead of guessed at twice.
- **Deferred: provenance (source/import-batch tracking).** This
  codebase's only precedent for per-row actor tracking is
  `learner_scores.recorded_by_user_id`, added for a narrow,
  well-justified reason (grade-dispute resolution) — it is not a
  blanket convention. Adding a bare `created_by_user_id` now would not
  actually serve Wave 2B's real need (distinguishing an _imported_ row
  from a _manual_ one, and eventually supporting field-by-field
  reconciliation per `PRODUCT-CONTRACT.md`'s SF1 row) — that shape
  depends on decisions the importer itself hasn't made yet (batch
  identity, per-row source reference). Adding a field now risks
  guessing wrong and needing to extend it again. `learners`/
  `section_memberships` remain purely additive tables, so this is safe
  to add later without any destructive change.
- **Deferred: cross-school transfer.** No representation for a
  learner moving between two LIKHA-managed schools exists (`learners.school_id`
  is fixed at creation). No repository evidence this session showed it
  was needed yet (SF1 bulk import is same-school; SF10 permanent
  records, `PRODUCT-CONTRACT.md`'s own row, is where cross-school
  transfer provenance is explicitly scoped). Not addressed here.
- **School-year-only enrollment (no section yet)**: no repository
  evidence found that LIKHA needs to represent "enrolled in the school
  for SY2026-2027, section not yet assigned" as a distinct state —
  DepEd's own SF1 workflow assigns section at the same enrollment
  event in practice. If real evidence for this state emerges later
  (e.g. a large school's registration backlog), `section_memberships`
  can be extended with a nullable `section_id` without breaking any
  existing query (`WHERE ends_on IS NULL` still holds; roster queries
  already join on `section_id`, so a NULL row simply wouldn't appear
  on any roster, correctly).

## Three-term model

Enrollment (a school-year/placement fact) is deliberately **not**
attached to any of LIKHA's three grading terms — `section_memberships`
has no term column and none was added. This matches the brief's own
§18 instruction and this project's existing convention: grading
periods/terms already live entirely under `grading_policies`/
`grading_periods`, scoped to `school_year` alone, never to placement.

## Consequences

- No schema migration in this milestone — `learners`/`section_memberships`
  are unchanged in shape.
- `commands::section::enroll_learner_in_section` now requires
  `Capability::ManageLearners` (Registrar or School Head) — a Teacher
  session that previously could enroll/transfer any learner can no
  longer do so. This is a **behavior change closing a real
  vulnerability**, not a new restriction invented for this milestone;
  disclosed plainly, not framed as routine.
- New read-only repository functions:
  `section_membership::list_by_learner_in_school`,
  `section_membership::current_membership_for_learner_in_school`,
  `learner::find_candidates`. New commands exposing the first two
  (ungated read, matching `get_learner`'s existing convention) and the
  third (gated `ManageLearners`, matching `create_learner`'s
  convention — a pre-creation check performed by the same actor who
  creates).
- `create_section`'s identical missing-capability-gate issue is
  tracked as a separate follow-up (spawned as a background task this
  session), not fixed here.

## Addendum (Wave 2A.1, 2026-08-26): `create_section` fixed, capability split confirmed deliberate

`create_section` is now gated by `Capability::ManageTeachingAssignments`
(School Head only) — not `ManageLearners` (Registrar or School Head),
the capability that gates `enroll_learner_in_section`. This asymmetry
was flagged by this session's independent `security-reviewer` as a
non-security, documentation-worthy SHOULD-FIX ("confirm this is
deliberate policy"), and it is: defining what sections/classes exist
for a school year is a structural scheduling decision — the same
domain `docs/adr/0039-teacher-load-class-schedule-foundation.md`
already scoped to School Head only, distinct from an individual
learner's own record/placement, which is a Registrar's ordinary
operational job. A Registrar can enroll a learner into a section a
School Head already created, but cannot define new sections
themselves — this mirrors real Philippine school administrative
practice (School Head/Registrar jointly plan the year's sections;
Registrar handles day-to-day enrollment into them) and is not an
oversight. Full independent review record: `docs/VERIFICATION-DEBT.md`.
