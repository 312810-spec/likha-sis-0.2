# ADR-0065 — Eight-Role Taxonomy: Foundation Only

Status: Accepted

## Context

ADR-0064 (Roles & Permissions) made the confirmed three-role model
(Teacher, Registrar, School Head) actually usable — grant/revoke
commands, a management UI, and real authorization gates on four export
commands. During that same session, the project owner supplied a
fuller, 8-role taxonomy directly, with an explicit sequencing
instruction: land the three-role work first (done, ADR-0064), then
expand to the full table as a separate milestone.

The owner's table (roles, their core functional scope, primary DepEd
forms managed, and system access level):

| Role                  | Core Functional Scope              | Primary DepEd Forms Managed   | System Access Level          |
| --------------------- | ---------------------------------- | ----------------------------- | ---------------------------- |
| School Head           | School-wide approval & oversight   | SF4, SF5, SF6, SF7, IPCRF     | Super Admin / Final Approver |
| Head / Master Teacher | Department monitoring & review     | Department Grade Sheets, COT  | Supervisory / Reviewer       |
| Class Adviser         | Homeroom & learner tracking        | SF1, SF2, SF5, SF9, SF10      | Section Admin (Read/Write)   |
| Subject Teacher       | Grade calculation & attendance     | Electronic Class Record (ECR) | Class Editor (Read/Write)    |
| ICT Coordinator       | System & infrastructure config     | EBEIS, LIS Exports            | Technical Admin              |
| Admin Officer / ADAS  | Student records & institutional HR | SF10, SF7, Form 48 (DTR)      | Records Admin                |
| Property Custodian    | Supplies & inventory management    | SF3, Inventory Tagging        | Inventory Admin              |
| Health Officer        | Clinic logs & nutritional records  | SF8                           | —                            |

## Decision

### Foundation only — widen the role set, wire nothing new

Migration 25 widens `user_school_roles`'s CHECK constraint (SQLite
cannot `ALTER` a CHECK constraint in place, so this reuses the same
recreate-table pattern migrations 5/24 already established) to accept
seven new role values: `master_teacher`, `class_adviser`,
`subject_teacher`, `ict_coordinator`, `admin_officer`,
`property_custodian`, `health_officer`. All seven are immediately
grantable through the existing `grant_school_role`/`revoke_school_role`
commands (a new `role::is_grantable` helper replaces the two-value
`REGISTRAR`/`SCHOOL_HEAD` check those commands previously hardcoded, so
adding a role never means touching that check again).

**Deliberately not built this milestone**: any `Capability` variant or
command gate for any of the seven new roles. Looking at what the
owner's own table maps them to, most of it doesn't exist as a feature
in this app yet:

- IPCRF (Individual Performance Commitment and Review Form)
- Department Grade Sheets, Certificate of Observation (COT)
- EBEIS/LIS exports as their own feature (distinct from this app's
  existing DepEd-form CSV exports)
- Form 48 (Daily Time Record)
- Inventory Tagging (SF3 itself is modeled in `formgen`/DO 4 s.2014
  evidence but has no export/UI yet either)
- SF8 (clinic/nutritional records) — no learner health-data schema
  exists in this app at all

Building a `Capability::ManagePropertyInventory` or similar today would
be inventing authorization for a feature that doesn't exist — exactly
the kind of guess `.claude/rules/security-privacy.md` and this
project's own `deped-compliance` discipline warn against. Each role's
real wiring is its own future slice, done when (and only when) the
feature it gates is actually built, using this migration's names as the
fixed vocabulary.

Two roles' scope does have a partial overlap with something that
already exists:

- **Class Adviser** overlaps with the existing `section_advisories`
  assignment mechanism (who currently advises a section, tracked
  per-section, not as a blanket role). **Kept deliberately separate**
  (the owner's own explicit direction, asked and confirmed this
  session): holding the `class_adviser` role is a general capability
  tag; `section_advisories` continues to be the source of truth for
  _which_ section someone advises, exactly as `authorize_adviser_of_section`
  already uses it. A future slice could decide `class_adviser` should
  gate _who is eligible to be assigned_ as a section's adviser, but
  that decision is not made here.
- **Subject Teacher** overlaps with the existing plain `teacher` role's
  own scope (a Teacher can already work with their own class records).
  Kept as its own distinct grantable role anyway, matching the owner's
  table exactly, rather than silently treating it as a synonym for
  `teacher` — the owner listed them separately.

### UI: `RoleManagementScreen` redesigned for 9 grantable roles

The three-role UI (ADR-0064) used one table column per grantable role
— unworkable at nine. Redesigned to one row per member with: a badge
list of currently-held grantable roles, each rendered as its own
"Revoke [Role]" button; and a single `<select>` (whichever grantable
roles the member doesn't already hold) plus one "Grant" button. Caught
and fixed a real duplicate-rendering bug during this redesign (a stray
first pass rendered every held non-Teacher role as both plain text
_and_ a revoke button) — proven by a new regression test
(`renders each held role exactly once`) before considering the screen
done, not just visually eyeballed.

## Consequences

- New: migration 25 (`user_school_roles` CHECK widened),
  `repository::role::{MASTER_TEACHER,CLASS_ADVISER,SUBJECT_TEACHER,
ICT_COORDINATOR,ADMIN_OFFICER,PROPERTY_CUSTODIAN,HEALTH_OFFICER,
is_grantable}`. `commands::user::{grant_school_role,revoke_school_role}`
  now call `role::is_grantable` instead of a hardcoded two-value check.
- New TS: `src/domain/role.ts` gained the same seven constants,
  `GRANTABLE_ROLES` (now nine entries), and their labels.
  `RoleManagementScreen.tsx` redesigned (badge list + single-select
  grant control, replacing the per-role-column table).
- **No `Capability` or command gate added for any of the seven new
  roles** — see "Deliberately not built" above. `Capability::allowed_roles`
  is unchanged from ADR-0064; only `TEACHER`/`REGISTRAR`/`SCHOOL_HEAD`
  appear in any `allowed_roles()` match arm today.
- `docs/product/PRODUCT-CONTRACT.md`'s RBAC section (§3) records the
  full table and this foundation-only scope explicitly, so a future
  session doesn't have to re-derive the owner's own role table from
  chat history.
- **Verification actually run this session**: `cargo build --lib`,
  `cargo test` (649 lib tests including the new migration-25 test and
  `role::grant_accepts_every_role_in_the_extended_taxonomy`, plus
  `tests/role_management.rs`'s new
  `a_school_head_can_grant_every_role_in_the_extended_taxonomy`), `cargo
clippy --all-targets -- -D warnings` clean, `cargo fmt --check`
  clean. `npm run quality` (867/867 tests, including the redesigned
  `RoleManagementScreen.test.tsx` and its new duplicate-rendering
  regression test), `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100) all
  clean. `git diff --check` clean.
- **Not independently reviewed**: same disclosed debt as ADR-0064 — an
  independent `security-reviewer` pass for the Roles & Permissions work
  as a whole (this migration included) is owed, recorded in
  `docs/VERIFICATION-DEBT.md`, not yet dispatched.
- Not implemented (deliberately, per "foundation only" above): any
  `Capability` variant, command gate, or UI beyond grant/revoke for any
  of the seven new roles; the features their forms/tools imply (IPCRF,
  Department Grade Sheets, COT, EBEIS/LIS exports as their own feature,
  Form 48 DTR, Inventory Tagging, SF8 clinic logs) — each is its own
  future product decision and slice, not started here.
