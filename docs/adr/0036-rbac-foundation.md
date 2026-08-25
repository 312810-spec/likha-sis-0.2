# ADR-0036 — RBAC Foundation: Capability-Oriented Authorization (Wave 1A)

Status: Accepted

## Context

ADR-0004 deliberately shipped "no role/permission system" — a session
authorizes exactly "an active session scoped to this school," nothing
finer. It explicitly reserved room to grow this later: _"`Session` has
room to grow a `roles: Vec<String>` field later without restructuring
anything below it."_

`docs/product/PRODUCT-CONTRACT.md` and `docs/product/M8-DECISION.md`
already establish, as a prior product decision with the user, that the
school-level functional split for LIKHA is at minimum **Teacher,
Registrar, School Head** — Registrar handles enrollment/records
separately from grading/attendance; School Head sees and manages all
teachers' data; Teacher stays scoped to their own classes. Per
`docs/product/ROADMAP-RECONCILIATION-DECISION.md` (Wave 1A), this
milestone's job is to prove the smallest representative authorization
model for that split — not to build the full future LIKHA role universe
(Adviser, LIS Coordinator, ICT Coordinator, Master Teacher/Department
Head, and others are expected later) and not to build any
account/role-management UI.

The explicit constraint governing this decision: authorization must
never be built as scattered `if role == "..."` checks through
UI/application/domain code, and a person must eventually be able to
hold more than one functional assignment in the same school at once
(e.g. Teacher + a future Adviser role) without a schema redesign.

## Decision

**Capability-oriented authorization, one new trusted gate function.**
Introduce `auth::Capability` (currently one variant, `ManageLearners`)
and a single new function, `auth::authorize_capability(conn, sessions,
capability) -> AppResult<String>`, mirroring the existing
`authorize_user_registration`/`authorize_school_membership_grant` gate
pattern exactly: it calls `sessions.require_active_session` first (the
same fail-closed session/expiry/revocation check every other protected
command already relies on), then applies one additional check —
"does this session's user hold any of `capability.allowed_roles()` in
this session's school?" — and returns the session's `school_id` on
success, exactly like the existing gates do. `Capability::allowed_roles()`
is the _only_ place a role is ever mapped to what it's allowed to do;
no other file compares a role string.

**Schema — a separate join table with a composite primary key, not a
column.** New table `user_school_roles(user_id, school_id, role,
created_at)`, primary key `(user_id, school_id, role)`, `role` under a
`CHECK (role IN ('teacher', 'registrar', 'school_head'))` constraint
(this codebase's established enum-column pattern — see
`attendance_records.status`), foreign-keyed to
`user_school_memberships(user_id, school_id)` with `ON DELETE CASCADE`.
A single `role` column on `user_school_memberships` was rejected: it
cannot represent one person holding two roles in the same school
without inventing a delimiter/array-in-a-column hack. The join table
makes a second functional assignment a new row, never a schema change —
adding a future role (Adviser, etc.) is a migration that only widens the
CHECK constraint, the same shape as this codebase's prior status-enum
widenings.

**Always a fresh database lookup, never cached on `Session`.** Role
membership is deliberately _not_ added to the in-memory `Session`
struct. `role::has_any_role` re-queries `user_school_roles` on every
`authorize_capability` call, mirroring `require_active_session`'s
existing independent DB-based revocation lookup. This closes the
"stale local assignment" / "privilege retained after change" threat in
the same way the codebase already closes it for session revocation,
rather than inventing a second caching/invalidation mechanism.

**Representative proof: gate `create_learner`/`update_learner` behind
`ManageLearners` (Registrar + School Head only).** Considered and
rejected two alternatives: (a) gating learner _reads_ — rejected, this
would be a real regression, Teachers already legitimately read the
roster for attendance/grading and read access was never meant to
narrow; (b) gating by class-record ownership — rejected on direct
schema inspection: `class_records` has no owner/teacher column today,
so this would require inventing an entirely new ownership concept,
disproportionate scope for "smallest representative proof." Gating
enrollment writes behind Registrar/School Head requires zero new
concepts beyond the RBAC mechanism itself and maps directly onto the
already-agreed role split.

**Default role grants on the two existing account-creation paths.**
`bootstrap_installation` (a fresh device's sole first-run path) now
grants its founding user all three starting roles — there is no one
else yet to hold Registrar/School Head duties, and the founding user is
who would otherwise be locked out of enrollment on their own first
install. `add_user_to_school` (onboarding a colleague) grants only
`teacher`, the least-privilege default. No role-assignment UI/command is
built this milestone — an explicit non-goal; a School Head currently has
no way to promote a colleague to Registrar except a fresh
`bootstrap_installation` (i.e., not at all, post-bootstrap). This is
accepted as a known gap for a _foundation_ milestone, not silently
worked around.

## Consequences

- `src-tauri/src/db/migrations.rs` — migration #16, `user_school_roles`.
- `src-tauri/src/repository/role.rs` (new) — `TEACHER`/`REGISTRAR`/
  `SCHOOL_HEAD` constants, `grant`, `has_any_role`.
- `src-tauri/src/auth/mod.rs` — `Capability`, `authorize_capability`;
  `bootstrap_installation` grants all three roles to the founding user.
- `src-tauri/src/commands/learner.rs` — `create_learner`/`update_learner`
  call `authorize_capability(.., Capability::ManageLearners)` instead of
  `require_active_school_scope`; `list_learners_by_school`/`get_learner`
  are unchanged (read access stays ungated).
- `src-tauri/src/commands/user.rs` — `add_user_to_school` also grants
  `TEACHER` after adding the membership.
- No TypeScript/UI change was required: `LearnerListScreen`'s existing
  generic error handling (`err instanceof ValidationError ? … :
"Could not enroll this learner."`) already degrades an `Unauthorized`
  rejection gracefully. Security is enforced entirely below React, per
  this project's standing rule that UI hiding is never the authorization
  boundary — there is currently no UI affordance that hides the
  enroll/edit action from a Teacher session; a Teacher can still open the
  form and will be rejected by the Rust command layer on submit. Adding
  a UI-level hide/disable for a denied capability is left as future
  polish, not a security requirement.
- **Teacher/Registrar/School Head are the initial RBAC proof set, not
  the final LIKHA functional-role universe.** The schema and
  `authorize_capability` pattern must support Adviser, LIS Coordinator,
  ICT Coordinator, Master Teacher/Department Head, and other
  school-authorized responsibilities later via new role-constant values
  and widened CHECK constraints — never a redesign of
  `user_school_roles`, `Capability`, or `authorize_capability` itself.
- Not built this milestone (explicit non-goals): any account/role
  management UI, a second `Capability` variant beyond `ManageLearners`,
  any change to `Session`'s shape, cloud sync/Better Auth, curriculum
  versioning, SF1/Learner Core, Teacher Load/schedule, SMEA, or any
  other LIKHA functional role beyond the three above.
