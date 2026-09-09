# ADR-0089: Master Teacher RBAC Role and the Permanent Two-Tier Grade-Review Design

Status: Accepted — supersedes ADR-0073's interim School-Head-as-approver substitution
Date: 2026-09-09

## Context

ADR-0073 built the Multi-Tier Review & Audit Pipeline's mechanism using
School Head as an explicit, disclosed stand-in for a "Master Teacher"
approver role that did not exist yet in this codebase. That ADR recorded
the substitution as **interim**, deliberately not inventing an RBAC role
without the project owner's decision — see
`docs/product/OWNER-DECISIONS-NEEDED.md` item 1, "Master Teacher RBAC
role."

**The owner has now answered this for real** (Batch 17, 2026-09-09):
Master Teachers oversee a set of teachers; anything those teachers
submit (starting with grade submissions) is approved by their assigned
Master Teacher first, with School Head retaining final lock authority.
This is the permanent design, not another interim stopgap.

## Decision

### 1. A real `master_teacher` RBAC role

This codebase's roles are a flexible table (`user_school_roles`), not a
Rust-level fixed enum — a new role is a widened `CHECK` constraint plus a
new constant, never a type change (see `repository::role`'s own
long-standing doc comment, which already anticipated exactly this).
Migration 59 widens `user_school_roles`'s `CHECK` constraint via the same
12-step "create new table, copy data, drop old, rename" rebuild this
schema has used repeatedly (migrations 24, 26, 36, 41, 47, 48, 53, 54,
56, 58) since SQLite cannot `ALTER` a `CHECK` constraint in place.
`repository::role::MASTER_TEACHER = "master_teacher"` is the new
constant.

**Capability semantics** (`auth::Capability`):

- Holding `master_teacher` alone satisfies **no** existing
  `Capability::allowed_roles()` list — a Master Teacher does not inherit
  School-Head-level capabilities (school settings, structural lock,
  school membership, disaster-recovery backup, etc.) merely by holding
  this role. Proven by `auth::tests::holding_master_teacher_alone_grants_no_existing_capability`,
  which iterates every `Capability` variant.
- A Master Teacher's actual authority (deciding a grade submission from
  a teacher they oversee) is expressed as a relationship-scoped
  authorization gate, not a blanket capability — mirroring this
  codebase's own established shape for `authorize_adviser_of_section`/
  `authorize_child_protection_access_for_section`: "is this specific
  person the one relevant actor for this specific record," not "does
  this role unlock this whole feature school-wide."
- **Self-approval is blocked**: a Master Teacher may never decide their
  own submission, even if they also hold `TEACHER` and submitted it
  themselves. Enforced at the same trusted boundary as every other
  authorization check in this module (`auth::authorize_grade_submission_master_teacher_decision`),
  never left to the UI to hide a button.

### 2. Teacher Oversight Assignment (the permanent hierarchy)

A new time-scoped, school-scoped assignment table,
`teacher_oversight_assignments` (migration 60), mirrors
`section_advisories` (ADR-0056) exactly: half-open interval
(`starts_on`/`ends_on`, `ends_on: NULL` = active), with "at most one
active overseer per teacher" enforced by a real partial unique index
(`idx_one_active_overseer_per_teacher`), not an application
check-then-act race — the same structural-invariant pattern this
codebase has now used three times (`section_memberships`,
`section_advisories`, and this table).

`repository::teacher_oversight_assignment::assign` additionally
verifies the proposed Master Teacher actually holds the `master_teacher`
role in the school, and rejects a teacher being assigned as their own
overseer, structurally — not merely blocked later at decision time.

School-Head-only commands (`Capability::ManageTeacherOversightAssignments`,
its own variant per this codebase's established one-variant-per-distinct-
authority-decision precedent): `assign_teacher_oversight`,
`end_teacher_oversight`. Reassignment is "end the old one, then assign a
new one" — the same two-call shape `section_advisory` already
establishes, not a separate "reassign" command.

### 3. Two-tier grade-submission decision flow

[Filled in once the rewire lands — see "Rollout" below if this section
still describes the pre-rewire mechanism when read.]

The design: a submitted grade submission is decided by the teacher's
currently-assigned Master Teacher first (approve/reject); on MT
approval, School Head performs a **distinct, separate "final lock"
step** before the submission is truly final. School Head's lock is never
folded into the MT's approval into one action — both must happen, in
order, for an MT-assigned teacher's submission.

**The intentional no-MT-assigned fallback**: a teacher with no currently
active Master Teacher overseer routes directly to School-Head approval —
identical to ADR-0073's original interim behavior. This is not a bug or
a regression; it is the documented, deliberate default for a school that
has not yet set up its Master Teacher hierarchy (e.g. a small school
just past bootstrap, or a subject with no Master Teacher assigned yet).
`repository::teacher_oversight_assignment::current_overseer_for_teacher`
returning `None` is the exact signal this fallback branches on.

## Why not fold this into ADR-0073

ADR-0073 is marked Superseded (not deleted) by this ADR for its
School-Head-as-approver substitution specifically — the mechanism it
built (submission, automated checks, append-only feedback notes) is
unchanged and still governs this feature; only "who decides" and "how
many decision steps" change. Keeping both documents lets a reader see
the actual history: an honest interim decision, followed by the real
permanent design once the owner resolved the open question, rather than
rewriting history to make it look like this was always the plan.

## Consequences

- `docs/product/OWNER-DECISIONS-NEEDED.md` item 1 is marked **resolved**.
- A school that has not assigned any Master Teacher yet sees no
  behavior change from ADR-0073's interim shape (the fallback).
- A school that has assigned Master Teachers now gets genuine two-tier
  review: a subject/department-level first pass before School Head's
  final sign-off, matching real DepEd review hierarchies more closely
  than a single School-Head bottleneck.
- Holding `master_teacher` and `teacher` at once (a Master Teacher who
  also teaches) is explicitly supported and tested — the self-approval
  guard is what keeps this safe, not a prohibition on holding both
  roles.

## Verification

Batch 17 checkpoints 1–2 (role + oversight assignment table):
`cargo test` (whole crate), `cargo clippy --all-targets -- -D warnings`,
`cargo fmt --check` — see `docs/CURRENT-HANDOFF.md`'s Batch 17 entry for
the actual commands run and their real output, and for which of
checkpoints 3–4 (grade-submission rewire, UI) landed in this same batch
versus were deferred to the recorded next slice.
