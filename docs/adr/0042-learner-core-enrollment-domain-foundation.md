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

## Addendum (Wave 2O, 2026-08-27): Section Roster read-only view — `current_roster` is the current-members query

Wave 2O delivered the first teacher-visible increment of Section Roster +
Enrollment Management: a read-only "open my class roster" screen
(`src/ui/SectionRosterScreen.tsx`), reached from `SectionsScreen` via a
per-section "Open roster" button. No transfer, end-enrollment, bulk, or
import — those are the next increment (Wave 2P) and hang off the same
command/domain seam (a selected roster row → a membership action).

**Deviation from the wave brief's §5.** The brief proposed a new
repository function named `list_current_members_in_school(section_id, …)`.
It was instead implemented as
`section_membership::current_roster(conn, school_id, section_id,
as_of_date)`, reusing the exact query shape already proven by
`roster_for_section` (a single indexed `learners ⋈ section_memberships`
JOIN, `ORDER BY family_name, given_name`, school-scoped by `school_id`
**and** `section_id` together). Creating a second, near-identical query
under a different name would have been a parallel representation with no
benefit. This is recorded as an explicit, considered departure from the
brief's suggested shape — in the same spirit as Wave 3's departure from
its own Java/POI working hypothesis — not an omission.

**"Current member" is not a new temporal semantic.** It is exactly the
existing half-open-interval definition: a learner is on the roster for
`as_of_date` iff `starts_on <= as_of_date < ends_on` (with `ends_on IS
NULL` meaning still open) — the same condition
`idx_one_active_membership_per_learner` and `enroll` already encode. A
future-dated enrollment and an already-ended membership are both
deliberately absent; the screen shows the "as of" date so a teacher can
see why. Covered by unit tests
(`current_roster_excludes_a_future_dated_enrollment`,
`…_excludes_a_membership_that_has_already_ended`,
`…_is_empty_for_a_section_with_no_members`,
`…_returns_empty_for_a_section_belonging_to_another_school`,
`…_is_ordered_by_family_then_given_name`) and command-boundary tests in
`tests/enrollment.rs` (authorized same-school; no session denied;
nonexistent `section_id` → `[]`; cross-school `section_id` → `[]`).

**New projection, not a changed one.** `CurrentRosterMember` (identity +
`lrn` + `starts_on`) is a separate struct from the shared
`SectionRosterMember` that `formgen::sf1` and the attendance-adjacent
callers use, so adding `starts_on` for the roster UI does not perturb
those queries. This matches the codebase's existing
one-projection-per-use-case pattern (`AttendanceRosterEntry`,
`LearnerScoreRosterEntry`). `roster_for_section` and
`roster_for_section_over_range` are untouched. `sex` was in the first
draft of this projection but was removed after the security and
architecture reviews both flagged it as serialized over IPC with no
consumer — the roster screen renders only name, LRN, and enrolment date.

**School scope in the query.** `current_roster` filters
`section_memberships` by `school_id` AND `section_id`, **and**
independently constrains the joined `learners` row to the same
`school_id` — so a forged/corrupted membership row pointing a
foreign-school learner at this section (which `enroll` itself refuses to
create) still cannot leak that learner. Added after the security review;
proven by a hand-crafted-row regression test.

**Ordering** is family name then given name — already this project's
convention (`export::report_card` formats `"{family}, {given}"`;
`formgen::sf1`; `roster_for_section`) — applied in the SQL, never
re-sorted client-side. **No search box:** one section is tens of
learners; a stable sorted list scans faster than it filters, and a query
surface now would be speculative. Dates are shown `2 Jun 2025` via a
small screen-local formatter (no shared date utility exists yet; adding
one is out of scope).

**Navigation** uses the same narrowly-typed parent-state handoff as
Attendance→Monthly Summary and Workspace→Audit Log: `App.tsx` holds
`rosterSectionId`, `SectionsScreen` calls `onOpenRoster(id)`, the screen
has its own "← Back to sections". `"section-roster"` is a `SignedInTab`
value but intentionally **not** a `NAV_GROUPS` destination (it needs a
selected section); `WorkbenchNav` keeps "Sections" visually active while
the sub-screen is open. `TAB_LABELS` is an explicit
`Record<SignedInTab, string>` literal (compiler-enforced), and `App.tsx`
no longer falls through to the audit-log screen for an unhandled tab —
both tightened after the architecture review. No new ADR — this addendum
is the durable record.

**Accessibility (independent review).** The one BLOCKING finding: the
`@media (max-width: 640px)` layout applies `display:block` to the
`<table>`, which strips the browser's implicit ARIA table roles (and is
reachable on desktop at 400% zoom, not only on phones), leaving the
`data-label` generated content as the sole column-label carrier. Fixed
by adding **explicit** `role="table|rowgroup|row|columnheader|rowheader|
cell"` to the table — explicit roles survive `display:block`. Also
fixed: a polite `role="status"` region announcing the roster result,
focus returned to the heading on retry, the Guided column explanation
moved above the table and linked by `aria-describedby`, and axe
coverage extended to the not-found and roster-error states. A native
NVDA/Narrator pass on the compiled binary at 400% zoom remains owed —
see `docs/VERIFICATION-DEBT.md`.

## Addendum (Wave 2P, 2026-08-27): transfer learner + end enrollment — dedicated `transfer_membership` / `end_membership`

Wave 2P adds the two roster-driven membership changes the Wave 2O
addendum said would "hang off the same command/domain seam": from a
Section Roster row, an authorized user can **transfer** a currently
enrolled learner to another section, or **end** their enrollment. Both
are effective-dated, preserve the prior placement as history, and are
enforced at the Tauri command boundary. Excluded, as directed: learner
deletion, bulk transfer, bulk end-enrollment, CSV/XLS import, cloud
sync, an enrollment-history editor.

**`enroll` was not reused for transfer — a deliberate, reviewed call.**
`enroll` closes _whatever membership is currently open_ for the learner,
is not transactional on a bare `&Connection`, and treats
enroll-into-the-current-section as a silent idempotent no-op. Those are
correct for its job (SF1 import, first placement) but wrong for a
teacher pressing "Transfer" from a roster row that may be minutes stale.
Rather than add a second, weaker transfer path, Wave 2P adds
`section_membership::transfer_membership` and `end_membership` as the
strengthened authoritative roster-management operations:

- They take `&mut Connection` and run the whole read→close→insert
  sequence in one `conn.transaction()` — a failure at any step leaves
  the learner in their original section.
- They target an **exact `from_membership_id` / `membership_id`** and
  _fail_ (`NotCurrent` / `MembershipNotFound`) rather than mutate a
  different row if that id is no longer the open one. This is what makes
  a stale roster tab safe: a double-submit produces exactly one change,
  the second call finding the source already closed.
- The closing `UPDATE` is guarded `... WHERE ends_on IS NULL` with an
  affected-row-count check; the destination `INSERT` relies on the
  partial unique index `idx_one_active_membership_per_learner` as the
  structural backstop.
- Every negative case is a typed outcome
  (`TransferOutcome` / `EndMembershipOutcome`, serde `tag = "kind"`,
  camelCase) mirrored 1:1 by TS discriminated unions
  (`TransferResult` / `EndEnrollmentResult` in `src/domain/section.ts`).
  No outcome exposes SQL, a DB path, an internal id, or a stack trace.
  `AppError::Unauthorized` still covers "no session" **and** "wrong
  role" — not split into a `Forbidden` variant, which would be a
  cross-cutting change.

`enroll`, `roster_for_section`, and `roster_for_section_over_range` are
untouched. `CurrentRosterMember` gained `membership_id` so a roster row
can name the exact membership an action targets.

**Capability.** Both commands are gated by `Capability::ManageLearners`
(Registrar or School Head) — the same capability as
`enroll_learner_in_section`, per this ADR's original "enrolling /
transferring a learner is 'manage learners'" decision. No new
capability. `school_id` is session-derived
(`authorize_capability`); `learner_id` / `membership_id` /
`to_section_id` are legitimate client identifiers, and every query is
scoped on `school_id` **and** the id together. Following the same
review, `transfer_membership` / `end_membership` also call
`learner::find_by_id_in_school` independently, so a hand-forged
`section_memberships` row pairing this school with a foreign learner is
refused rather than moved — the same defense-in-depth the Wave 2O
`current_roster` query got.

**Date handling (Wave 2P security + reliability review).** The
repository layer keeps dates as opaque ISO strings and SQLite compares
them lexically. The TypeScript `DATE_PATTERN` guard is bypassable over
raw IPC, so `transfer_membership` / `end_membership` now shape-check
`effective_on` in Rust (`is_iso_date`: length, dashes, digits,
plausible month/day) and return `InvalidEffectiveDate` for anything
malformed. `effective_on < starts_on` is still rejected; same-day
(`effective_on == starts_on`) is still a legal `[D, D)` empty interval.
The Section Roster panel additionally caps its date input at today
(`max={asOfDate}`) so a mistyped future year cannot silently create a
change that "takes effect" months later. Two gaps are recorded as
verification debt rather than fixed here: (1) `enroll` has the same
Rust-side date-shape and non-transactional-close gaps and should be
hardened when next touched; (2) neither operation rejects an
`effective_on` that predates an **existing attendance/score record** in
the source section — back-dating that far would orphan those rows from
`roster_for_section_over_range` and under-report an SF2 grid. Both are
out of Wave 2P's scope (they cross into the attendance/scoring layer)
and are logged in `docs/VERIFICATION-DEBT.md`.

**A zero-length `[D, D)` source membership** (same-day transfer/end)
still appears in `roster_for_section_over_range` — pinned by
`zero_length_membership_still_appears_in_the_historical_range_roster`.
This is deliberate historical row coverage, but whether a monthly grid
should show a row that can never hold a valid mark is an open product
question, noted here so a future change is a decision, not a surprise.

**UI.** The Section Roster gains a per-row "Transfer" / "End enrollment"
pair opening **one inline confirmation panel at a time**, rendered as a
sibling `<tr>` with a `colSpan` cell — the house inline-panel pattern
(`LearnerListScreen` edit), not a modal (the app has no dialog
primitive). The panel carries an effective-date input (default today,
`min` = the learner's start date, `max` = today), a school-scoped
destination `<select>` for transfer, a plain-language consequence
sentence, and mode-specific Guided help. Outcomes split three ways:
`notCurrent` / `membershipNotFound` / `destinationNotFound` →
a "the roster changed — it is being refreshed" recovery whose buttons
both reload the roster; `sameSection` / `invalidEffectiveDate` → an
inline field error (`aria-invalid` + `aria-describedby` on the
offending control) with the panel kept open; a thrown error → a generic
retry message. Focus moves into the panel heading on open **and on any
error/conflict outcome** (fixing a focus-to-`<body>` drop the
accessibility review found), and back to the trigger button on cancel.
The class list stays visible during the post-action refresh instead of
blanking to a spinner. `npm run check:architecture` passes; UI/domain/
application still import no infrastructure.

**Independent review.** Five fresh reviewers (security, reliability/
membership-invariants, architecture, teacher-UX, accessibility) ran
against the feature commit. **No blocking findings.** Acted on in the
review-fix commit: Rust `effective_on` shape validation, the
independent learner-school check, the focus-on-error fix, routing
`destinationNotFound` to the refresh recovery, the date `max` cap,
`aria-invalid`/`aria-describedby` on panel fields, keeping the roster
visible during refresh, consistent "Family, Given" naming between the
panel and the success banner, an effective-date hint shown in all
modes, and added axe coverage for the error / stale-conflict / Guided
panel states. Non-blocking items deferred to `docs/VERIFICATION-DEBT.md`:
the two `enroll`/backdating gaps above, a two-connection race test for
the guarded-`UPDATE` path (correctness is currently reasoning-verified
via the guard + affected-row check + partial unique index + the
app-wide `Mutex<Connection>`), and a native NVDA/Narrator pass on the
compiled binary for the new interactive surface. This addendum is the
durable record; no separate ADR.

## Addendum (Wave 2Q, 2026-08-28): safe learner enrollment + membership-integrity closure

Wave 2Q completes the Section Roster's core enrollment lifecycle: an
authorized user (`ManageLearners` — Registrar or School Head) can now
place an **existing, eligible** learner into a section from the roster.
It also closes the four highest-value membership-correctness debts Wave
2P recorded. Excluded, as directed: learner creation, SF1 import
redesign, cloud sync, attendance/grading UI changes beyond the narrow
dependent-record check.

### `enroll_membership` — the typed, stale-safe placement verb

`section_membership::enroll_membership(&mut Connection, school_id,
learner_id, section_id, starts_on) -> EnrollOutcome` runs the whole
eligibility-check → `INSERT` sequence in one `conn.transaction()`. It
mirrors Wave 2P's choice: `section_membership::enroll` stays the bulk
create-and-place primitive (SF1 import, first placement), and a
separate typed verb serves the roster. `EnrollOutcome` (serde
`tag = "kind"`, camelCase; TS mirror `EnrollMembershipResult` in
`src/domain/section.ts`) distinguishes:

- `Enrolled { membership }`
- `LearnerNotFound` / `SectionNotFound` — id unknown or cross-school,
  indistinguishable from each other's absence (probe resistance)
- `AlreadyEnrolled { currentMembershipId, currentSectionId }` — the
  learner already holds an open membership. **Never moved implicitly**;
  the UI compares `currentSectionId` to the target and either says
  "already here" or routes the teacher to Transfer. Distinct from
  `OverlappingMembership` on purpose (open placement vs. a retained
  historical span).
- `OverlappingMembership` — a retained (closed or future) membership
  ends strictly after the proposed `starts_on`, so `[starts_on, ∞)`
  would double-count a day. Enrolling exactly on a prior stint's end
  date is allowed (half-open).
- `InvalidStartDate` — `is_iso_date` shape check fails. A zero-length
  interval cannot arise from this verb (it only ever opens
  `[starts_on, NULL)`), so there is no `ZeroLengthInterval` variant
  here; documented rather than added speculatively.
- `DependentRecordConflict { record }` — see below.

Authorization: `authorize_capability(ManageLearners)` at the command
boundary, `school_id` session-derived; `learner`/`section` are
independently constrained to that school in every query, and
`learner::find_by_id_in_school` is checked directly (forged-row
defense, matching Wave 2O/2P). Command `enroll_learner_membership`;
read `list_enrollable_learners`.

`enrollable_learners(conn, school_id) -> Vec<EnrollmentCandidate>` is
one `LEFT JOIN` from `learners` to the open membership and to
`sections`, `school_id`-constrained on all three tables, ordered
`family_name, given_name` in SQL. Gated by `ManageLearners` (not the
open-read convention) because it is a **school-wide learner lookup** —
the same class as `learner::find_candidates`, which is also
`ManageLearners`-gated. It returns every school learner with their
current membership state; the UI renders eligible / already-here /
enrolled-elsewhere, and `enroll_membership` re-checks every rule
regardless of what the list said.

### Debt 1 — `enroll` hardened in place

`section_membership::enroll` now (a) shape-checks `starts_on` with
`is_iso_date` and returns `Ok(None)` for a malformed date (the same
"unresolvable request" signal it already uses; both production callers
validate upstream), and (b) wraps its close-old + open-new pair in a
`SAVEPOINT` (**not** `Connection::transaction()` — `import::commit`
calls `enroll` inside its own `Transaction` and rusqlite transactions
do not nest). A failure between the two writes now rolls back cleanly
instead of leaving the learner with zero open memberships. `enroll`'s
observable semantics are otherwise unchanged.

### Debt 2 — zero-length membership policy: **strict**

**Decision: membership intervals are half-open `[starts_on, ends_on)`
and `starts_on` must be strictly earlier than `ends_on` when `ends_on`
exists.** `starts_on == ends_on` is invalid. `transfer_membership` /
`end_membership` now return a typed `ZeroLengthInterval` when
`effective_on == starts_on` (Wave 2P allowed it as a "legal empty
interval"). No historical row is ever deleted to make an operation fit.

Repository-evidence challenge (per the brief): Wave 2P's permissive
behavior was recorded in `VERIFICATION-DEBT.md` as *"an open product
question,"* not as an evidence-backed choice, so the brief's escape
hatch ("strong repository evidence requires another policy") does not
apply — the strict rule is adopted. Three previously-passing tests were
renamed and rewritten to assert the new behavior (a flipped assertion
under an old name is a defect this project's reviews have caught twice
before):
`end_membership_rejects_a_same_day_end_as_a_zero_length_interval`,
`transfer_membership_rejects_a_same_day_transfer_as_a_zero_length_interval`,
`a_same_day_transfer_is_refused_so_no_zero_length_membership_is_ever_created`.

**Exemption, stated:** `enroll`'s same-day cross-section re-placement
still closes the source with `ends_on = starts_on`, i.e. it can still
mint `[D, D)`. It is exempt because it is the create-and-place
primitive, always called inside a caller-owned transaction from
`import::commit`, and SF1 import never enrolls one learner into two
sections on the same day. Recorded as residual debt with a closure
gate (apply the strict rule to `enroll` when the SF1 importer is next
reworked).

**Mistake entered today:** under the strict rule, a placement whose
`starts_on` is today cannot be transferred or ended effective-today
(both return `ZeroLengthInterval`), and the row cannot be deleted. The
recovery path is: wait until tomorrow, or (once built) an
enrollment-history editor / undo. There is no same-day undo in Wave 2Q;
closure gate is a dedicated "correct a placement entered in error"
affordance, recorded in `VERIFICATION-DEBT.md`.

### Debt 3 — backdating vs. dependent records

`dependent_records_stranded(...)` is a private, **bounded** helper (not
a dependency framework): given the resulting `[interval_start,
interval_end)` for a `(learner, section)`, it returns
`Some(DependentRecordKind)` when a record would fall outside it **and**
outside every *other* retained membership the learner holds for that
section:

- **Attendance** — an `attendance_records` row for `(learner,
  section)` whose `attendance_date` no resulting interval covers.
  `ar.section_id = ?` excludes the migration-12 legacy `NULL`-section
  rows automatically (a NULL-section row predates section scoping and
  is not attributable to a membership) — pinned by a test.
- **Grades** — a *scored* `learner_scores` row whose grading period
  lies **wholly** outside the resulting coverage (entirely before the
  new start, or entirely on/after the new end). Scores are
  grading-period granular, so a period that merely *straddles* the
  boundary is allowed; only a period with no possible enrolled day is
  a conflict. This deliberately does **not** block ending an enrollment
  mid-term.

Wired into `enroll_membership`, `end_membership`, and
`transfer_membership` (the source side). Returns a typed
`DependentRecordConflict { record }` — the UI names the *category*
("attendance records" / "grades"), never the records. Nothing is
cascade-deleted, rewritten, or reassigned.

For `enroll_membership` this is genuine defense-in-depth but rarely
bites: if `OverlappingMembership` passes, every retained span ends at
or before the new `starts_on`, and attendance before that date was
written while a prior membership covered it (`is_active_member` gates
attendance creation), so it is not stranded. The check still catches a
true orphan (e.g. one left by an earlier backdated end that this same
guard now prevents) — honest asymmetry, stated rather than papered
over with fake symmetry.

### Debt 4 — real two-connection concurrency

`src-tauri/tests/enrollment_concurrency.rs` (new) opens a real
SQLCipher **file** with two independent `db::open` connections sharing
one key — the `tests/bootstrap.rs` pattern, not `:memory:` (private per
connection). It pins:

- **Exactly one commits.** Two connections from the same eligible
  state both attempt an incompatible write; the loser gets a typed
  conflict (`AlreadyEnrolled` / `NotCurrent`) from its own fresh
  transaction's `SELECT`, never a duplicate membership.
- **Stale-snapshot writes fail cleanly.** A connection that pinned a
  read snapshot before the winner committed then tries to write: WAL
  returns `SQLITE_BUSY_SNAPSHOT` — a whole-transaction rollback, no
  partial row — and a **retry from a refreshed connection is
  deterministic** (`AlreadyEnrolled`), not a "database busy" error
  surfaced to the teacher.
- **The guarded close writes nothing once the row is closed**
  (`UPDATE ... WHERE ends_on IS NULL` → 0 rows → `NotCurrent`).
- `TransactionBehavior::Immediate` surfaces contention as an immediate
  error, never a silent partial write — the bounded, non-retrying tool
  if write-write serialisation stronger than the app's
  `Mutex<Connection>` is ever needed.

Concurrency strategy of record: in the shipping app **all in-process
writes are serialised by `Mutex<Connection>`** (`commands::lock_db`),
so the stale-snapshot path is not reachable there. The layered
guarantees are: `Mutex<Connection>` (serialisation) → WAL snapshot
isolation (`SQLITE_BUSY_SNAPSHOT` on a stale writer) → the guarded
`UPDATE` + affected-row check (`NotCurrent`) → the
`idx_one_active_membership_per_learner` partial unique index
(structural backstop). No retry loop was added; there is no "database
busy" leaking as a logical outcome.

### UI

The Section Roster gains **one** "Enroll learner" button above the
table (both populated and empty ready states). It opens a single inline
panel — the same house pattern as the Wave 2P row panels, no modal —
with: a name/LRN search filter, a native `<select>` of candidates
annotated with their current state, a destination summary (this
section's name/grade/year), a start-date input defaulting to today and
**capped at today** (`max={asOfDate}` — a future `starts_on` would
enrol the learner off the current roster and read as failure), a single
Confirm, and a pending "Enrolling…" state that blocks double-submit.
Confirm is disabled for a candidate already in this section or enrolled
elsewhere, with inline guidance (transfer is required; it is not
performed here). Outcomes: `enrolled` → success banner + roster refresh
+ focus to the page heading; `alreadyEnrolled` / `overlappingMembership`
/ `dependentRecordConflict` / `invalidStartDate` → inline correctable
field errors, panel kept open, entry preserved; `learnerNotFound` /
`sectionNotFound` → "the list was out of date" recovery that refetches
candidates; a thrown error → generic retry. Focus moves to the panel
heading on open and on every error; back to the "Enroll learner" button
on cancel. Efficient / Comfortable / Guided run the identical workflow
(Guided adds explanatory copy only). `npm run check:architecture`
passes; `knip` reports no new findings (the domain → port → adapter →
service → UI chain is fully wired in one commit).

### Verification (run this session)

`npm run quality` green — typecheck, eslint, `prettier --check`,
`check:architecture`, **534 vitest** (58 files; +51 in
`SectionRosterScreen.test.tsx`, +service/adapter tests). `cargo test`
— **528 lib** + every integration binary, incl. `enrollment` 31 (+7
Wave 2Q command-boundary) and `enrollment_concurrency` 5 (new).
`cargo nextest` on `section_membership` — 55 (+19 Wave 2Q).
`cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
clean. `check:dev-preview-isolation` pass; `knip` no new findings;
`cargo deny check` ok (no dependency change). `gitleaks` / OSV not on
this machine's PATH — CI Security Gate authoritative.

### Independent review + retained debt

Five fresh reviewers (security/isolation, SQLite concurrency,
domain/architecture, teacher-UX/mode parity, accessibility/focus) run
against the feature commit; results, fixes, and any deferred findings
recorded in the Wave 2Q entry of `docs/VERIFICATION-DEBT.md`. Retained
debt after this wave: the native NVDA/Narrator pass (now covering
Enroll + Transfer + End), `enroll`'s same-day `[D, D)` exemption, and
the "correct a placement entered today" affordance. This addendum is
the durable record; no separate ADR.
