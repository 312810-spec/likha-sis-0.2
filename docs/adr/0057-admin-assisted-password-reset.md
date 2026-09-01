# ADR-0057: Admin-Assisted Password Reset (Wave 3I)

## Status

Accepted (2026-09-01).

## Context

Confirmed by direct grep of `src-tauri/src` before this wave began: zero
password-reset/change command exists anywhere in this codebase. A
teacher who forgets their LIKHA login password has no in-app recovery
path at all — the only "recovery" today would be direct, unaudited
database manipulation outside the app, which is a materially worse
security posture than a properly gated, audited, in-app admin-reset
command.

This candidate was previously scored low (4.20, 2026-08-25) and recorded
as blocked because a safe admin-reset flow "needs the deferred Roles &
Permissions decision." RBAC has since shipped (`docs/adr/0036`) with a
`Capability::ManageSchoolMembership` gate already restricted to the
School Head role. The original blocker no longer holds — see
`docs/product/WAVE-3H-DECISION.md` for the full survey that surfaced
this as the recommended next slice.

Per `CLAUDE.md`'s standing rule ("major ... auth ... choices" use the
10-scenario process) and `.claude/rules/security-privacy.md` (every
command touching accounts/tenant data must go through the established
`authorize_*` gate pattern), this ADR runs that process for the exact
reset mechanism before writing any code.

## Decision process: 10 scenarios considered

1. **School Head sets a new password directly** (typed into a form,
   applied immediately via the existing Argon2id hashing path). Reuses
   every already-proven pattern; zero schema change; zero new UI flow
   beyond one form. Risk: the School Head necessarily learns the new
   password.
2. **School Head generates a temporary password; forced change at next
   login.** Removes the "School Head knows the permanent password" risk,
   but requires a new schema column (`must_change_password`), a new
   login-time branch, and a new "change my password" command/screen for
   the teacher to complete the forced change — a materially larger
   surface for this bounded slice.
3. **Self-service "forgot password" from the login screen via email/SMS
   OTP.** Rejected — no email/SMS channel exists anywhere in this
   codebase or its deployment model (ADR-0004's shared-school-computer,
   offline-first model has no such channel), and adding one is a paid/
   infrastructure decision this project does not make without explicit
   approval.
   3a. **Self-service "forgot password" via security questions.** Rejected
   — a long-deprecated pattern (low entropy, socially guessable), and
   still self-service with no admin oversight for a shared-computer
   deployment model where account boundaries matter for tenant isolation.
4. **A printed recovery code issued at account creation**, redeemable
   without a School Head. Rejected as out of scope for this slice — it
   changes account-creation flow (`register_user`) too, a materially
   larger, separate feature.
5. **Registrar (not just School Head) may also reset a password.**
   Rejected — `ManageSchoolMembership` is already School-Head-only by
   design (see that capability's own doc comment: onboarding/membership
   authority was deliberately not extended to Registrar). Extending it
   here would silently broaden an existing, deliberate boundary as a side
   effect of an unrelated feature.
6. **No lockout/attempt-reset on an admin password reset.** Rejected — a
   teacher locked out by 5 failed attempts (ADR-0019) who is then
   admin-reset would otherwise stay locked with a brand-new, correct
   password; the reset must also clear `failed_login_attempts`/
   `locked_until`.
7. **Do nothing (status quo).** Rejected — see Context: the only
   remaining recovery path is out-of-band database manipulation, a worse
   security posture than a gated, audited in-app command.
8. **A general "edit any user field" admin screen, of which password is
   one field.** Rejected — over-broad; no evidenced need for a School
   Head to edit a colleague's username/display name today, and it would
   invite scope creep into an unrelated general-account-editor feature.
9. **A raw SQL/CLI recovery tool bundled with the app.** Rejected —
   bypasses the audit log and the app's own authorization boundary
   entirely; contradicts `.claude/rules/security-privacy.md`'s "security
   must never rely on UI hiding" by removing the UI/authorization layer
   altogether.
10. **Reuse this feature's plumbing to also let a teacher change their
    own (known) password.** Recorded as a natural, low-risk future
    extension (self password change while signed in, not a recovery
    path) but explicitly out of scope for this wave — not requested by
    the WAVE-3H-DECISION scope contract, and adding it now would widen
    this slice beyond "admin-assisted reset."

## Decision

**Recommended and adopted: Scenario 1 — School Head sets a new password
directly**, applied immediately, no forced-change flag.

Rationale, scored against LIKHA's priority order:

- **Privacy/security**: net positive over the status quo (closes the
  only-recovery-path-is-database-manipulation gap) and no worse than the
  already-accepted School-Head-manages-all-teachers'-data authority model
  `docs/product/PRODUCT-CONTRACT.md` §3 already confirms. The "School
  Head learns the new password" risk (Scenario 2's own motivating
  concern) is explicitly accepted here, not silently ignored: it is the
  same authority model that already lets a School Head manage every
  teacher's learner/section/grading data in this school, and the reset
  event is itself audit-logged (visible, attributable) — see below.
- **Maintainability**: reuses four already-proven patterns end to end
  (a `Capability` gate mirroring `authorize_school_membership_grant`'s
  cross-school-membership check, the existing Argon2id hashing path, the
  existing `require_active_school_scope`/`is_member_of_school`
  school-scoping pattern, and the existing `audit_log` table) with **zero
  schema migration** — no new column, no new table.
- **Scope discipline**: Scenario 2 (temporary password + forced change)
  is recorded as the **explicit Next Best**, not silently dropped —
  revisit if real evidence emerges that School Heads are misusing
  knowledge of a reset password, or if a future self-service channel
  (Scenario 3/3a/4) is ever built and a forced-change flag becomes needed
  as its own companion mechanism. Building it speculatively now, with no
  such evidence, would violate `.claude/rules/autonomous-development.md`'s
  scope-discipline rule ("do not expand a milestone merely because
  capacity is available").

### What is NOT built (explicit non-goals, matching WAVE-3H-DECISION.md)

- No self-service "forgot password" flow from the login screen.
- No `must_change_password`/forced-change-at-next-login schema addition.
- No change to account lockout (ADR-0019) or idle-timeout (ADR-0020)
  mechanisms themselves — only the target account's existing lockout
  state is cleared by the reset, per Scenario 6 above.
- No change to DPAPI/SQLCipher key handling or `src-tauri/src/crypto/`/
  `src-tauri/src/db/` — this is LIKHA's own app-level username/password,
  unrelated to the OS-level DPAPI key-recovery question in ADR-0044.
- No Registrar access to this capability.

## Design

- New Rust command `admin_reset_teacher_password(target_user_id,
new_password)`.
- New auth gate `auth::authorize_admin_password_reset`, mirroring
  `authorize_school_membership_grant`'s shape: requires
  `Capability::ManageSchoolMembership` (School Head only) **and**
  independently re-verifies `target_user_id` is a member of the caller's
  own school (`user::is_member_of_school`) before any write — never
  trusts a client-supplied school id, matching every other cross-entity
  authorization gate in this codebase
  (`authorize_view_teacher_load`/`authorize_adviser_of_section`). A
  target that doesn't exist or belongs to a different school fails with
  the same `Unauthorized` as any other denial — no enumeration of which
  case occurred, matching this codebase's established
  `AuthenticationFailed`/`AccountLocked` disclosure discipline.
- New `repository::user::admin_reset_password`: hashes the new password
  with the existing `auth::hash_password` (Argon2id, unchanged), updates
  `password_hash`, and clears `failed_login_attempts`/`locked_until` in
  the same statement — a teacher is never left locked out after a School
  Head just handed them a fresh, correct password.
- New `AuditEventType::PasswordResetByAdmin`, recorded against the
  **target** account (`user_id`/`username` of the teacher whose password
  changed), matching every existing `audit_log` row's "whose account"
  shape. **Disclosed limitation, not silently accepted**: the schema has
  no column for "which School Head performed this reset" — the audit log
  proves a reset happened and when, but not who triggered it beyond "a
  School Head of this school." Adding an actor column would touch every
  existing `AuditLogEntry`/`audit_log` row shape for one new event type;
  recorded as retained debt in `docs/VERIFICATION-DEBT.md` rather than
  done as an unplanned schema change in this slice.
- `admin_reset_teacher_password` added to `invoke.ts`'s
  `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` set in the same commit
  (Wave 3B's own recorded debt: every new `Capability`-gated command must
  be added by hand or it silently reintroduces the false-positive-logout
  bug).
- New `UserApplicationService.adminResetPassword` (validated passthrough:
  trims nothing since a password is never trimmed — see
  `auth-service.test.ts`'s existing "does not trim the password" case —
  and enforces the same `MIN_PASSWORD_LENGTH` as `registerUser`/
  `setup-service`). New `UserRepository.adminResetPassword` method +
  `TauriUserRepository` adapter.
- New `SchoolMembersScreen.tsx`: lists the caller's own school's members
  (reusing `SchoolMemberApplicationService.listMembers`, the same
  reference-data read `TeachingAssignmentsScreen`'s teacher picker
  already uses) with a "Reset password" action per row, opening an
  inline form (new password + confirm) — the same generic-error/
  no-client-side-enforcement convention `TeachingAssignmentsScreen`/
  `SectionAdviserScreen` already established: any authenticated member
  may view the list, only a School Head's write succeeds, and a non-
  School-Head sees a generic failure, never a permission-specific
  message. New top-level `school-members` tab under the existing
  "Security" nav group, alongside Sign-in Activity.

## Consequences

- A School Head can now recover a colleague's access without any
  out-of-band database work, closing a real, previously undisclosed
  usability/security gap.
- The audit log gains a new event type but not a new actor-attribution
  column — retained debt, recorded above and in `VERIFICATION-DEBT.md`.
- Scenario 2 (temporary password + forced change) remains the recorded
  Next Best for a future wave if evidence justifies it.
