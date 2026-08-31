# ADR-0057: Admin-Assisted Password Reset (Wave 3I)

Status: Accepted

## Context

`docs/product/WAVE-3H-DECISION.md` (Wave 3H's fresh roadmap survey)
confirmed by direct grep of `src-tauri/src` that this codebase has
**zero** password-reset/change command of any kind: a teacher who
forgets their LIKHA login password, or whose account is not merely
temporarily locked out (ADR-0019's 15-minute lockout) but whose actual
password is lost, has no legitimate in-app recovery path at all. The
only "recovery" available today would be direct, unaudited SQLite
manipulation outside the app entirely — a materially worse security
posture than a properly gated, audited, in-app admin-reset command.

This candidate was previously scored low (4.20, 2026-08-25) and
explicitly deferred because a safe admin-reset flow "needs the
deferred Roles & Permissions decision." RBAC has since shipped
(`docs/adr/0036-rbac-foundation.md`: Teacher/Registrar/School Head with
`Capability`-gated commands), so that blocker no longer holds. This is
an authentication-touching milestone, so per
`.claude/rules/security-privacy.md` it requires the project's
established 10-scenario decision process before implementation, and an
independent security review before completion.

This ADR is deliberately narrow: it decides the exact reset mechanism
and its authorization/audit shape only. It does not touch DPAPI/
SQLCipher/database-key recovery (ADR-0044 — a completely separate,
OS-level concern from LIKHA's own app-level username/password), account
lockout (ADR-0019) or idle-timeout (ADR-0020) behavior, or Sync.

## Decision

### Reset mechanism: a School Head sets a new password directly, effective immediately

Ten scenarios were generated and scored against the project rubric
(Teacher Value 20%, DepEd Alignment 15%, Dependency Readiness 10%,
Reuse 10%, Architectural Fit 10%, Security Safety 10%, Implementation
Risk 10%, Testing Confidence 5%, Future Leverage 5%, Time-to-Value 5% —
the same weights `docs/product/M8-DECISION.md` established and
`docs/adr/0056-section-advisory-foundation.md` most recently reused):

1. **A School Head sets a new password directly, effective
   immediately.**
2. A School Head triggers generation of a system-random temporary
   password, shown once, with a forced change at the teacher's next
   login.
3. Self-service "forgot password" from the login screen, gated by
   security questions set at account creation.
4. Self-service password reset via an emailed one-time link/code.
5. Self-service password reset via an SMS one-time code.
6. A printed/pre-generated recovery code issued at account creation,
   redeemable from the login screen.
7. A School Head triggers a system-random password (like #2) but with
   no forced change at next login — the School Head never sees or
   chooses the password themselves, only causes a reset.
8. Same as #1, but the capability to reset is also delegated to
   Registrar, not School Head alone.
9. A two-person-approval workflow: one School Head requests a reset,
   a second School Head (or Registrar) must confirm before it takes
   effect.
10. Do nothing — leave direct, unaudited database manipulation as the
    only recovery path (status quo).

- **Recommended (chosen): Scenario 1.** Highest score on Teacher Value,
  Reuse, Architectural Fit, Implementation Risk, and Time-to-Value.
  Every one of the four moving parts it needs already exists and is
  already tested: the `ManageSchoolMembership` capability
  (`authorize_school_membership_grant` already establishes School-Head-
  only as the correct authority tier for onboarding/managing a
  colleague's account), the Argon2id hashing path
  (`auth::hash_password`), the school-scoping pattern
  (`user_repo::is_member_of_school`), and the `audit_log` table (widened,
  not replaced). It requires zero new schema beyond widening
  `audit_log` for attribution — every other scenario needs at least one
  net-new column or table of its own. It also matches this app's
  established deployment model (ADR-0004: shared school computers, no
  verified email/SMS channel, offline-first) better than any
  self-service option: there is no out-of-band channel to make #3-#6
  safe, and inventing one (a security-question bank, an SMS/email
  provider integration) would itself be a new, separate, and much
  larger product/security decision this bounded wave should not make
  under time pressure — exactly the "researching under time pressure on
  something safety-sensitive" pattern this project has deliberately
  avoided before (see ADR-0031's fixture decision).
- **Next Best: Scenario 2, a system-generated temporary password with
  forced change at next login.** Meaningfully more defense-in-depth
  than Scenario 1 — the School Head never durably knows the teacher's
  real password, only a one-time value the teacher must immediately
  replace. Scored second-highest overall (Security Safety edges out
  Scenario 1 here) but loses on Implementation Risk and Time-to-Value:
  it needs a new `users.must_change_password` (or equivalent) column, a
  new login-flow interception point that does not exist anywhere in
  this codebase today (`auth::login` currently returns a `Session`
  unconditionally on success — there is no concept of "authenticated
  but must complete a step before proceeding"), and a new forced-change
  screen with its own validation and tests. That is a second,
  self-contained feature-shaped unit of work on top of the reset
  mechanism itself, not a small addition to it — disproportionate scope
  for one bounded wave when Scenario 1 already fully closes the actual
  problem (a teacher with no recovery path at all). **Explicitly
  deferred, not rejected** — recorded as the standing next-best option
  if a future finding shows "School Head durably knows the teacher's
  password" is an unacceptable residual risk for this deployment model.
  The switch condition is a real finding to that effect, not effort
  alone.

Scenarios 3-6 were rejected outright: no out-of-band channel (email,
SMS, a pre-established security-question bank) exists anywhere in this
codebase or product model to make any of them safe, and building one
would itself be a separate, large product/security decision (a new
external dependency for #4/#5, violating the zero-billing-by-default
posture without explicit approval; a security-question bank for #3 is
widely considered weak authentication in current guidance; a printed
recovery code for #6 has its own custody/storage problem — where does a
school safely keep it? — that this codebase has no established answer
for). Scenario 7 scored close to Scenario 2 but strictly dominated by
it: it has the same new-schema/new-login-interception cost as #2 (a
forced-change flag) without even #2's benefit of the School Head never
seeing the password, since #7 still requires showing the generated
password to someone to hand to the teacher — there is no way to notify
the teacher directly in this offline, no-channel deployment model.
Scenario 8 was rejected on authority-tier grounds: this project's own
established RBAC precedent for account/membership actions
(`ManageSchoolMembership`, `authorize_school_membership_grant`'s own
doc comment) already reserves this authority to School Head only,
deliberately narrower than Registrar's enrollment/records scope — a
password reset is at least as sensitive as onboarding a member, so
widening it to Registrar with no new evidence would be a real widening
of privilege for no stated benefit. Scenario 9 was rejected as
disproportionate: a two-person-approval workflow is a real, useful
pattern in general, but this codebase has no existing "pending
approval" concept anywhere to build on, making this by far the largest
scenario, for a single-School-Head-per-school-license reality where a
second approver may not even reliably exist. Scenario 10 (do nothing)
directly contradicts the evidence in Context: leaving unaudited direct
database manipulation as the only recovery path is a worse security
outcome than a gated, audited in-app command, not a neutral one.

### Authorization: reuse `Capability::ManageSchoolMembership`, no new capability variant

`auth::admin_reset_teacher_password(conn, sessions, target_user_id,
new_password) -> AppResult<bool>` is gated by
`authorize_capability_with_actor(conn, sessions,
Capability::ManageSchoolMembership)` — the same School-Head-only
capability `add_user_to_school` already uses. Deliberately **not** a
new `Capability` variant: unlike `ManageTeachingAssignments` and
`ManageSectionAdvisories` (each its own variant despite resolving to
the same role today, per their own doc comments, because they are
distinct _scheduling-authority_ decisions from membership), resetting a
colleague's login credential is not a new authority class — it is the
same "manage this person's presence/access in the school" authority
`ManageSchoolMembership` already names. Inventing a fifth variant that
resolves to the exact same role set with no distinct policy question
behind it would be complexity with no offsetting benefit.

Target resolution is entirely server-side, re-verified fresh on every
call — `target_user_id` is never trusted to already belong to the
caller's school just because the frontend's own member list
(`list_school_members`) would only ever show same-school colleagues, or
because the caller already passed the capability check. This matches
every existing `authorize_*` gate's own "never trust a client-supplied
school id" convention.

### Enumeration safety: an unknown target and a cross-school target are indistinguishable

`admin_reset_teacher_password` returns `Ok(false)` — not an error, and
with no audit-log write — both when `target_user_id` does not resolve
to any user at all, and when it resolves to a real user who is a member
of a _different_ school. This is a deliberate choice: if the two cases
returned different results (or one wrote an audit entry and the other
didn't), a caller who already holds `ManageSchoolMembership` in their
own school (a real, but _scoped_, credential) could use the difference
to probe whether an arbitrary user id exists in another school entirely
— a privilege-escalation-adjacent information leak this design closes
by construction rather than by code-review vigilance. `Err(Unauthorized)`
is reserved strictly for the capability check itself (no session, or a
session without `ManageSchoolMembership`) — a fundamentally different
situation the frontend must not conflate with "bad target," matching
every other capability-gated command's `invoke.ts` exemption-set
treatment.

A known, disclosed, accepted residual: resolving the target user first
and only then checking school membership means a cross-school target
takes marginally longer (one extra query) than a wholly unknown target.
This is a theoretical local-IPC timing signal, not a network-observable
one — consistent with this app's own established threat model (a
trusted single-user desktop application, not a networked API service;
see `auth::password`'s own login-timing-safety comment, which defends
against exactly the kind of signal that _is_ practically observable
over a real network boundary). No analogous local-timing defense exists
anywhere else in this codebase's authorization code either, so adding
one here alone would be inconsistent, not more secure in practice.

### Password handling and the lockout side effect

The existing Argon2id hashing path (`auth::hash_password`) is reused
completely unchanged — this reset never adds a second hashing scheme or
a lower-cost "temporary" hash. The raw new password is zeroized in the
Tauri command layer after use (`commands::user::admin_reset_teacher_password`),
matching `register_user`'s already-established convention, and is never
logged.

A successful reset also clears any lockout currently in effect on the
_target_ account (`repository::user::set_password_and_clear_lockout`
resets `failed_login_attempts` to 0 and `locked_until` to `NULL`). A
locked-out account is very often exactly why the reset was requested in
the first place; without this, a teacher would stay rejected by the
15-minute lockout window (ADR-0019) even after receiving the correct
new password. This introduces no new privilege — it is reachable only
through the same `ManageSchoolMembership` check that already permits
changing the password directly — and does not touch ADR-0019's lockout
_policy_ (threshold, duration) at all, only this one already-authorized
write path's side effect on one specific account.

### Audit: widen `audit_log` for actor attribution, one new event type

Migration 24 widens `audit_log` (via the same 12-step recreate-table
pattern migration 5 already established, since SQLite cannot `ALTER` a
`CHECK` constraint in place) to add a nullable `actor_user_id` column
and a new `password_reset_by_admin` event type. Every pre-existing row
is preserved losslessly with `actor_user_id = NULL` — every event type
before this one is self-caused (the subject of the event IS the actor:
a login/logout/lockout is always about the same person who triggered
it), so backfilling an actor for old rows would be fabricating
attribution that was never recorded, not a correction.
`repository::audit_log::record_admin_action` is a new function rather
than a widened `record` signature, since every existing caller
(`login`, `logout`) is self-caused and would only ever pass `None` for
an actor — a separate, explicitly-named function is clearer than a
rarely-used extra parameter on the one already-proven, heavily-called
path. `list_for_school` resolves `actor_username` via a `LEFT JOIN` at
read time for display, matching how `username` itself is already the
value valid at the time of the event, not a live re-lookup of the
subject.

### Post-review hardening: global identity scope, revocation, and atomicity

Codex review identified three blocking invariants that the initial
implementation did not enforce. Because `users.password_hash` is global
to a user rather than scoped per school, a School Head may reset only a
target whose memberships are confined to the Head's own school. A
same-school target that also belongs to another school is rejected with
the same non-enumerating `Ok(false)` result and no audit event.

A successful reset revokes every active persisted session for the target
across all school scopes. Other running application instances therefore
fail their next trusted-boundary authorization check even if their
in-memory `SessionManager` still holds the old session.

The password replacement and lockout clearing, target-session
revocation, and attributable audit insertion execute inside one SQLite
savepoint. Any failure rolls all three effects back together; callers
cannot receive an error after a password changed without its required
audit record. Regression tests cover multi-school rejection,
cross-`SessionManager` revocation, and an injected audit failure that
must preserve the old password and session.

## Consequences

**In scope, shipped this wave:**

- `admin_reset_teacher_password` (Rust command + `auth`/`repository`
  layers), gated by `Capability::ManageSchoolMembership`.
- Migration 24 (`audit_log` widening).
- `AdminPasswordResetScreen` (School Head UI affordance, reached from
  the "Security" nav group), following `SectionAdviserScreen`'s
  established generic-error/no-client-side-enforcement convention.
- `invoke.ts`'s session-expiry exemption-set addition for the new
  command (Wave 3B's own recorded debt: every new capability-gated
  command must be added by hand).
- Command-boundary and UI/application tests covering same-school
  success, cross-school denial, non-School-Head denial, target-not-found,
  audit actor/target attribution, and lockout clearing.

**Non-goals, explicitly not built this wave:**

- No self-service ("forgot password" from the login screen) flow — see
  the rejected Scenarios 3-6 above.
- No forced-password-change-at-next-login flag or schema — that is
  Scenario 2, the recorded runner-up, not selected.
- No change to `docs/adr/0019-account-lockout.md`'s lockout _policy_ or
  `docs/adr/0020`'s idle-timeout behavior — only one already-authorized
  write path's side effect on one specific account, as described above.
- No change to DPAPI/SQLCipher key handling, `src-tauri/src/crypto/`,
  or `src-tauri/src/db/` — entirely LIKHA's own app-level auth, unrelated
  to the Windows-OS-level key-recovery question in ADR-0044.
- Does not touch Wave 5 Sync or the raw-database backup/recovery
  question — both remain open, separately tracked candidates.

**Follow-up, not started:** if future evidence shows the School Head
durably knowing the teacher's chosen password is an unacceptable
residual risk for this deployment model, revisit and implement Scenario
2 (the recorded Next Best) as its own bounded wave — it requires a new
`users`-table flag and a new login-flow interception point, not a
trivial addition to what this wave ships.
