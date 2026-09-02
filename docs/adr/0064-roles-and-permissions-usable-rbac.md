# ADR-0064 — Roles & Permissions: Making RBAC Actually Usable

Status: Accepted

## Context

The Wave 1A RBAC Foundation (ADR-0036) established the confirmed
three-role starting model — Teacher, Registrar, School Head
(`docs/product/PRODUCT-CONTRACT.md`'s RBAC section,
`docs/product/M8-DECISION.md`'s follow-up) — with a `Capability` enum,
`repository::role::{grant,has_any_role}`, and `user_school_roles`. But
two real gaps remained, both explicitly disclosed in code comments
rather than hidden:

1. **No command could ever grant Registrar or School Head to anyone**
   past a fresh installation's founding user
   (`auth::bootstrap_installation` grants all three starting roles to
   the founding user, per `bootstrap_installation_grants_the_founding_user_all_three_starting_roles`).
   `add_user_to_school`'s own doc comment said so plainly: "this
   codebase still builds no UI/command to grant Registrar/School Head
   to anyone other than a fresh installation's founding user."
2. **Almost nothing was actually gated by role.** Every form export
   except `export_learner_permanent_record_sf10` (SF2, SF4, SF6, report
   cards) checked only `require_active_school_scope` — any authenticated
   Teacher could pull the whole school's SF4/SF6, or another teacher's
   own SF2/report card, not just their own.

The project owner, resuming this milestone directly (not autonomously
selected — this is exactly the kind of "changing access expectations"
decision `docs/product/M8-DECISION.md`'s stop condition #8 reserves for
the user), confirmed scope explicitly: fix both gaps now, using the
existing three-role model; expand to a larger role taxonomy (the owner
separately supplied an 8-role table — School Head, Head/Master Teacher,
Class Adviser, Subject Teacher, ICT Coordinator, Admin Officer/ADAS,
Property Custodian, Health Officer) as a **separate, later milestone**,
not bundled into this one.

## Decision

### Grant/revoke, not just grant

Two new commands, `grant_school_role`/`revoke_school_role`
(`commands::user`), gated by a new `Capability::ManageRoles`
(School Head only, its own variant rather than reusing
`ManageSchoolMembership` — matching this module's own established
precedent of one variant per distinct decision, see
`ManageTeachingAssignments`'s doc comment reasoning the same way).
Deliberately restricted to Registrar/School Head only — Teacher is
already the automatic default `add_user_to_school` grants at
membership time, so a second path to grant it would be redundant.

**`repository::role::revoke` refuses to remove the last School Head in
a school** (`count_role_holders`, a new `AppError::CannotRemoveLastSchoolHead`
variant, distinct from `Unauthorized` — this isn't a permissions
problem, it's a standing invariant this app has no other recovery path
for: no super-admin, no support-desk override). Every other role has no
such guard — losing the last Registrar or Teacher is recoverable (a
School Head can always re-grant it); losing the last School Head is
not.

### New authorization primitives for the export-gating gap

- **`Capability::ViewSchoolWideReports`** (Registrar or School Head) —
  gates `export_school_eosy_sf6` and `export_school_monthly_attendance_sf4`,
  the two whole-school consolidated exports. Deliberately excludes
  Teacher, matching `PRODUCT-CONTRACT.md`'s confirmed model ("Registrar:
  focused on official-form exports and learner records... Teacher:
  scoped to their own classes/sections"). `export_learner_roster` was
  deliberately left ungated — its own doc comment already frames it as
  "for a teacher's own records or manual backup," a personal-utility
  export, not a school-wide official report; tightening it was outside
  what the owner asked for.
- **`export_section_monthly_sf2` now uses `authorize_adviser_of_section`**
  (already established by `export_section_eosy_sf5`, ADR from Wave 3m) —
  only the section's current adviser, or a School Head, may export its
  SF2. Previously any school member could export any section's
  attendance.
- **New `auth::authorize_teacher_of_class_record`**, gating
  `export_class_record_report_card` — the teacher actually holding the
  `TeachingAssignment` for the class record's section/subject pair, or
  a School Head. Deliberately **not** built by reusing
  `authorize_adviser_of_section`: a class record's subject teacher and
  the section's homeroom adviser are frequently different people (e.g.
  a Math specialist teaching several sections, advising none of them);
  reusing the adviser check would have wrongly denied a legitimate
  subject teacher access to their own class record — proven directly by
  `authorize_teacher_of_class_record_denies_the_sections_adviser_alone_without_a_teaching_assignment`.
  New `teaching_assignment::is_assigned_to_section_subject` is the
  underlying primitive.

### A real, disclosed correction caught along the way

Fixing `export_section_monthly_sf2`'s gate required first computing
`as_of_date`, which the original code only derived _after_ the
now-earlier authorization check needed it — reordering it surfaced no
bug, but is recorded here because reordering an authorization check
relative to other logic is exactly the kind of change that deserves a
second look, not just a compile-and-move-on.

### Frontend: `invoke.ts` exemption-list correctness

`export_section_monthly_sf2`, `export_class_record_report_card`,
`export_school_eosy_sf6`, `export_school_monthly_attendance_sf4`,
`grant_school_role`, and `revoke_school_role` were all added to
`COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING`. Each of these commands
can now legitimately reject `Unauthorized` for an ordinary permission
denial (not session expiry) where they previously could not — without
this, Wave 3B's own documented bug class would have recurred: a denied
permission on any of these six commands would have forced an incorrect
global "session expired, please sign in again" logout instead of
showing the calling screen's own local error message.

### `SchoolMemberApplicationService.grantRole`/`revokeRole`: `async`, not a bare `Promise`-returning method

Caught by this milestone's own tests, not shipped and fixed later: the
first version threw synchronously from `validatedTarget`/`validatedRole`
before ever returning a promise — the exact bug class M13's
`computeTermGrade` hit (`docs/adr/0013-*.md`'s consequences note). Fixed
the same way: declare the method `async`.

### UI: `RoleManagementScreen`

A new top-level nav tab ("Roles and Permissions," under Security),
listing every school member with their current roles and a grant/revoke
button per `GRANTABLE_ROLES` (Registrar, School Head — Teacher is not
shown as grantable/revocable, matching the backend). Shown to every
authenticated school member unconditionally — "security must not rely
on UI hiding" — a non-School-Head sees the same table and gets a
generic error if they try. Per-button in-flight tracking via a
`${userId}:${role}` key and `aria-disabled` (never plain `disabled`,
matching this codebase's established self-disabling-button fix). A
`CannotRemoveLastSchoolHead` rejection is detected via
`String(err).includes("cannot_remove_last_school_head")` (the same
established pattern `LoginScreen` already uses for `account_locked`)
and shown as a specific, actionable message rather than the generic
fallback.

## Consequences

- New: `repository::role::{revoke,count_role_holders}`,
  `AppError::CannotRemoveLastSchoolHead`,
  `Capability::{ManageRoles,ViewSchoolWideReports}`,
  `auth::authorize_teacher_of_class_record`,
  `teaching_assignment::is_assigned_to_section_subject`,
  `commands::user::{grant_school_role,revoke_school_role}`. No new
  migration — `user_school_roles`/`role::{TEACHER,REGISTRAR,SCHOOL_HEAD}`
  already existed.
- Tightened (real behavior change, not just a new code path):
  `export_section_monthly_sf2`, `export_class_record_report_card`,
  `export_school_eosy_sf6`, `export_school_monthly_attendance_sf4`. A
  Teacher who previously could export another section's SF2, any class
  record's report card, or the whole school's SF4/SF6 can no longer do
  so.
- New TS: `src/domain/role.ts`
  (`TEACHER`/`REGISTRAR`/`SCHOOL_HEAD`/`GRANTABLE_ROLES`/`roleLabel`),
  `SchoolMemberRepository.{grantRole,revokeRole}`,
  `TauriSchoolMemberRepository` implementation,
  `SchoolMemberApplicationService.{grantRole,revokeRole}`,
  `RoleManagementScreen.tsx`, a new `"role-management"` `SignedInTab`.
- **Verification actually run this session**: `cargo build --lib`,
  `cargo test` (665 lib + integration tests, all green, including 8 new
  `role.rs` unit tests, 5 new `teaching_assignment.rs` unit tests, 9 new
  `auth::authorize_teacher_of_class_record` unit tests, 10 new
  `tests/role_management.rs` integration tests, and updated/new
  `tests/export.rs` coverage for every tightened gate), `cargo clippy
--all-targets -- -D warnings` clean, `cargo fmt --check` clean.
  `npm run quality` (typecheck, lint, format, architecture-boundary
  check, `vitest run`) — 866/866 tests, all green, including 7 new
  `RoleManagementScreen.test.tsx` tests and updated fixture/fake
  repositories across five other test files. `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100) all
  clean. `git diff --check` clean.
- **Not independently reviewed**: this milestone touches the same
  `authorize_capability`/`require_active_session` authorization pattern
  every prior command already uses, plus two new but structurally
  analogous primitives (`authorize_teacher_of_class_record` mirrors
  `authorize_adviser_of_section`'s exact shape). Given the direct,
  security-relevant nature of the change (this is precisely the kind of
  milestone `.claude/rules/security-privacy.md` flags for independent
  review — "Milestones touching auth, persistence, or sync get an
  independent security/reliability review"), a fresh-context
  `security-reviewer` pass is recorded as **owed, not yet run** —
  should be dispatched before this milestone is considered fully closed.
- Not implemented (deliberately deferred, next milestone): the owner's
  full 8-role taxonomy (Head/Master Teacher, Class Adviser vs. Subject
  Teacher as distinct roles, ICT Coordinator, Admin Officer/ADAS,
  Property Custodian, Health Officer) and their own form/capability
  mappings; `docs/product/PRODUCT-CONTRACT.md`'s RBAC section still
  needs updating to reflect this milestone's now-decided authority
  boundaries (it previously said these were "not yet decided" and even
  that "no role concept exists anywhere in the code" — both stale
  before this milestone, more so after).
