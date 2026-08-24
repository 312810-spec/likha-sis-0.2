# ADR-0021 — Authentication Audit Log

Status: Accepted

## Context

User-directed sequence (2026-08-25): Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess. This closes
the first item. "Audit log/activity trail" was already scenario #11 in
`docs/product/M8-DECISION.md`'s original 20-scenario scoring
(Security-first, ~5.9) — a real, previously-identified candidate.

## Decision

Scoped tightly to **authentication events only** — `login_success`,
`login_failed`, `account_locked`, `logout` — not a general
data-mutation audit trail (who edited which learner, which attendance
mark, etc.). That is a much larger, separate future milestone: it would
touch every repository write path in the app, not one auth entry point,
and deserves its own scoping pass rather than being folded in here
opportunistically just because capacity was available.

New `audit_log` table (migration 15): `school_id` NOT NULL (the login
screen always requires a school selection, even for a doomed attempt,
so every event has a real tenant scope), `user_id` nullable (a failed
login against a username that doesn't resolve to a real user has no
user to reference), `username` always populated (the attempted or
actual username, independent of whether it resolved) so a security
review can still see "someone tried X repeatedly" even for a
nonexistent account. `event_type` is a `CHECK`-constrained enum, not
free text.

`auth::login`/`auth::logout` are the only writers — every outcome of a
login attempt is recorded, via `repository::audit_log::record` called
alongside the real return path (never replacing it — a logging write
uses `?` after, so if it somehow failed the caller sees a real error,
not a silently-swallowed one). The account-lockout attempt that
actually crosses the threshold is recorded as `AccountLocked`, not
`LoginFailed` — immediate, accurate feedback for whoever reviews the
log, matching ADR-0019's same "tell them on the triggering attempt, not
a delayed reveal" choice for the login response itself.

`commands::auth::list_audit_log` follows the identical
session-derived-scope convention as every other command — there is no
"view another school's log" capability, and no new privilege tier: this
app still has exactly one role (every teacher has full access within
their own school, per the Roles & Permissions "deferred" decision), so
this is simply another screen any signed-in teacher can see for their
own school, not an admin-only surface that doesn't exist yet.

## Consequences

- New: migration 15 (`audit_log` table + index), 5 migration tests
  (valid row with known user, valid row with no known user, rejects an
  unrecognized event type, rejects an unknown school, a deleted user
  leaves the row intact with `user_id` cleared via `ON DELETE SET
NULL`).
- New: `repository::audit_log` (`record`, `list_for_school`), 5
  repository tests. `list_for_school` orders by `created_at DESC, id
DESC` — a deliberate tie-break, since millisecond-precision timestamps
  are not fine enough to guarantee order among rows written in the same
  millisecond (caught by a real test failure during this session, not
  assumed correct — see `docs/learning/ERROR-PATTERNS.md` if a similar
  ordering assumption needs checking elsewhere).
- `auth::login`/`auth::logout` instrumented; 5 new tests proving actual
  audit events are recorded for each real outcome (success, failure,
  lockout, logout), not just that login/logout still function.
- New `commands::auth::list_audit_log` command, capped at 200 rows (a
  review/troubleshooting screen, not an export — no pagination UI was
  built since 200 recent events comfortably covers normal review needs
  at this app's scale).
- New `AuditLogScreen.tsx`, wired as a "Sign-in Activity" tab.
- **Verification actually run this session**: `cargo nextest run` —
  299/299 passing (up from 288 lib+integration before this feature).
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  271 TS tests (up from 262), typecheck/lint/format/architecture-
  boundary all clean. `npm run build` succeeds.
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019/0020. Self-review: confirmed every write goes
  through the session-derived `school_id` (no client-supplied scope),
  confirmed the unknown-username login-failure path still never touches
  `user_id` (no enumeration risk beyond what ADR-0019 already accepted
  and disclosed for lockout), confirmed a logging write failure would
  propagate as a real error via `?` rather than being silently
  swallowed and masking a real login/logout outcome.
- Not implemented (deliberately out of scope): general data-mutation
  auditing (a separate, larger future milestone), pagination/filtering
  UI beyond the 200-row cap, an export of the audit log (no evidenced
  need yet), any role-gating on who can view it (no roles system exists
  — see `docs/product/M8-DECISION.md`'s follow-up).
