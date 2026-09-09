# ADR-0073: Multi-Tier Review & Audit Pipeline — Interim (School-Head-as-Approver)

Status: **Superseded** (2026-09-09) by
`docs/adr/0089-master-teacher-rbac-and-two-tier-grade-review.md` for the
"who decides, how many steps" question this ADR's Decision section
answers below. The pipeline **mechanism** this ADR built (submission,
automated checks, append-only feedback notes, the Principal Overview
Dashboard) is unchanged and still governs this feature — only the
School-Head-as-approver substitution and the single-decision-step shape
are superseded. Kept in place (not deleted) as the honest historical
record of the interim decision and why it was made; see ADR-0089 for the
real, permanent Master Teacher design and the intentional no-MT-assigned
fallback it documents.
Date: 2026-09-08

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §2.5 calls for a "Master
Teacher Review Workflow": a teacher submits quarterly grades, a Master
Teacher runs automated audit checks and approves/rejects with feedback,
and a Principal Overview Dashboard shows a school-wide composite-grade
view and submission-status matrix.

**This codebase has exactly three RBAC roles today: Teacher, Registrar,
School Head.** There is no "Master Teacher" role and no "Principal"
role distinct from School Head. This is a known, explicitly undecided
gap recorded in the 2026-09-07 unbuilt-features audit
(`docs/CURRENT-HANDOFF.md`) — deciding whether/how to introduce a
Master Teacher tier (and what authority it should have relative to
Registrar/School Head) is exactly the kind of "irreducible
product-policy choice" `.claude/rules/autonomous-development.md`'s
human-approval-gate #1 reserves for the project owner, not something to
resolve unilaterally mid-batch.

## Decision

Build the pipeline's **mechanism** now (submission, automated checks,
append-only feedback log, approval/rejection, dashboard), using
**School Head as the interim approver/principal role**, and record that
substitution explicitly here rather than silently shipping "Master
Teacher" as a renamed School Head capability.

- "Master Teacher reviews" → **School Head reviews**
  (`Capability::ManageGradeSubmissionReview`, School-Head-only).
- "Principal Overview Dashboard" → **School Head's dashboard** (the same
  role, since this codebase has no separate Principal role either).
- A teacher submitting their own class record's grades needs no new
  role — `auth::authorize_grade_submission_owner` is a self-or-School-Head
  check (mirroring `authorize_child_protection_access_for_section`'s
  established shape from ADR-0072): the teacher actually assigned to
  teach that section+subject (via `teaching_assignments`), or a School
  Head, may submit it.

### Why not invent a "Master Teacher" role now

The task instruction for this batch is explicit: "MUST NOT invent a new
RBAC role." Widening the role enum is also unusually consequential here
— every existing `Capability::allowed_roles()` call site, every existing
test asserting a fixed 3-role model, and the RBAC Foundation ADR
(`docs/adr/0036-rbac-foundation.md`) would need re-examination for a
change this structural. That is real product-policy work (what
authority should Master Teacher actually have? does it replace or sit
alongside School Head for grade approval specifically? does it apply to
every subject or only the teacher's own department?) with no accepted
answer in this project yet — squarely the owner's call, not a
default-and-proceed autonomous decision.

### Data model (migration 45)

- `grade_submissions`: one row per submit event for a `class_record_id`
  (a class record can be resubmitted after rejection — each submission
  is its own row, never an in-place edit of the rejected one, matching
  this project's general preference for an append/versioned history over
  mutation where the two are equally simple).
- `grade_submission_notes`: **append-only**, same discipline as
  ADR-0072's `incident_interventions` — an automated-check finding and a
  reviewer's feedback are both new rows, never edits of a past one.

### Automated checks (run at submission time, in `repository::grade_submission::run_automated_checks`)

Reuses existing repository functions — no parallel grading engine:

- **Missing summative scores**: `learner_score::roster_for_item` per
  assessment item, counting any status other than `Scored`.
- **Out-of-bounds values**: any recorded score outside `0..=max_score`
  for its item.
- **Weight-group mismatch**: `class_record::resolved_weight_policy_id_in_school`
  returning `None` (no resolvable grading weight policy for this class
  record).

Findings are advisory only — a submission with findings still gets
created; findings simply appear as `automated_check` notes for the
reviewer, matching the task's "approve/reject with feedback notes" shape
(the automated checks feed the same notes list a human review adds to,
they don't block submission).

### Principal Overview Dashboard

`get_principal_overview_dashboard` returns each learner's composite
General Average for a section, reusing
`grading_computation::compute_term_grade` (no separate computation).
The submission-status matrix is `list_grade_submissions_for_school`
(same `ManageGradeSubmissionReview` gate) — the frontend composes the
two, matching this codebase's established pattern of narrow commands
over one monolithic dashboard query (see `commands::nutrition`'s own
composition of `list_by_school_year_period` + `to_enrollment_row` for a
precedent). "Formal SF sign-offs" (the inventory's third dashboard
bullet) is out of scope for this slice — no SF export currently has a
sign-off/attestation field to wire this into; recorded as unfinished
below.

## Superseded when

This ADR's School-Head-as-approver interim decision is superseded the
moment the project owner decides the Master Teacher RBAC question (Tier
4 of the unbuilt-features audit). At that point:
`Capability::ManageGradeSubmissionReview`'s `allowed_roles()` gains the
new role (or is redefined), and this ADR should be marked Superseded
with a pointer to whatever ADR records that RBAC decision. No schema
change is anticipated — `grade_submissions.decided_by_user_id` already
just records whichever user decided it, regardless of role.

## Consequences

- Ships real, working review mechanics today without blocking on an
  unresolved product-policy question.
- A school currently has only School Head available as the reviewer —
  in a school with several grade levels/departments, one person reviews
  everything. This is the same limitation the interim role substitution
  necessarily carries; not a new regression, an explicitly disclosed
  scope of "interim."
- "Formal SF sign-offs" and a UI are deferred (see Batch 3's handoff
  entry).

## Verification

- `cargo test` (whole crate): new tests in `db::migrations` (migration
  45), `repository::grade_submission` (4), `auth` (3 new authorization
  tests for `authorize_grade_submission_owner`).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean.
