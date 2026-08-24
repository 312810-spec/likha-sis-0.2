# ADR-0020 — Idle-Timeout Session Hardening

Status: Accepted

## Context

Continuing autonomously per `.claude/rules/autonomous-development.md`
after Account Lockout (ADR-0019) closed one half of this app's
documented shared-computer threat model. The other half named in
`docs/product/M8-DECISION.md`'s original 20-scenario scoring, scenario
#14 ("Idle-timeout/session hardening," Security-first, ~5.5), was still
open: ADR-0004 deliberately chose a fixed 8-hour session TTL over idle
tracking for that milestone, explicitly noting a session "is valid for
this long after login regardless of activity."

On a shared school computer, that means a teacher who logs in and walks
away — for lunch, a meeting, the rest of the day — leaves a fully
active session (full read/write access to their school's data) usable
by anyone else at that machine for up to 8 hours. Account lockout
protects the login step; nothing protected an already-authenticated,
abandoned session. This is the concrete, previously-flagged gap ADR-0004
left for a later milestone, not a newly invented one.

Like account lockout, this is not disqualified from autonomous
selection: a 30-minute idle window is a standard security-engineering
default (OWASP Session Management Cheat Sheet), not a decision that
needs the user's school-specific input.

## Decision

Added `Session::last_activity_at`, a sliding timestamp distinct from
the existing fixed `expires_at`. `Session::is_active` now requires
**both** to hold: the absolute 8-hour cap (`SESSION_DURATION`,
unchanged) and less than 30 minutes (`IDLE_TIMEOUT`) since
`last_activity_at`. Only `SessionManager::require_active_session` (and
its `require_active_school_scope` wrapper) — the single check every
protected command already goes through — updates
`last_activity_at` to now on a successful call. This is the "activity"
signal: as long as a teacher keeps issuing real commands, the window
keeps sliding forward and they never hit the idle timeout before the
8-hour absolute cap.

`commands::auth::current_session` (a peek — "am I still logged in?")
deliberately does **not** slide the window: it calls `Session::is_active`
directly against the current in-memory session without going through
`require_active_session`. If a peek counted as activity, idle timeout
could never actually fire as long as the frontend queried session state
at all, defeating the point.

No new architecture decision, no schema change, no new command — this
extends `auth::mod.rs`'s existing `Session`/`SessionManager` types in
place, the same shape ADR-0004 already established.

**Frontend**: no change made. An idle-expired session fails the next
protected command with the same `Unauthorized` every other session
failure (revocation, absolute expiry) already produces — screens
already handle that generically (e.g. a failed data load shows a
generic error). This is a pre-existing gap this milestone does not
newly introduce: the app has never had a global "your session expired,
please sign in again" redirect for _any_ expiry reason, including the
original 8-hour absolute cap. Building that is a real, separate UX
improvement (arguably higher-value than the backend hardening itself,
since a teacher silently locked out with a generic error is a worse
experience than one who's told plainly what happened) — scoped out of
this milestone deliberately, not overlooked.

## Consequences

- `auth::mod.rs`: new `IDLE_TIMEOUT` constant (30 minutes), new
  `Session::last_activity_at` field, `Session::is_active` now checks
  both windows, `require_active_session` slides the window on success.
  Three new tests: an idle-but-not-absolutely-expired session is
  rejected; a successful check slides the window forward (verified by
  re-reading the in-memory session afterward, not just trusting the
  call's own success); a `current()` peek does not itself slide the
  window. Three pre-existing test fixtures updated for the new required
  field.
- **Verification actually run this session**: `cargo test` — 229 lib
  tests (up from 226; +3) + 54 integration tests, all green. `cargo
clippy --all-targets -- -D warnings` clean. `npm run quality` — 262 TS
  tests (unchanged — confirms zero frontend impact, as intended). `npm
run build` succeeds.
- **Independent review**: not dispatched (same standing agent-resume
  note as ADR-0019). Self-review performed instead: confirmed the idle
  check is purely additive to the existing absolute-expiry check (an
  `&&`, not a replacement — a session must still pass the original
  8-hour test regardless of idle state), confirmed only the one
  activity-attributing function (`require_active_session`) ever writes
  `last_activity_at`, confirmed the peek path
  (`commands::auth::current_session`) never does, and confirmed the
  revocation check (a real DB lookup, independent of in-memory state)
  is unchanged and still runs before the idle window is extended — so
  a revoked-but-not-yet-idle session still correctly fails closed.
- Not implemented (deliberately out of scope): a global session-expiry
  UI redirect (a real, separate, arguably higher-value UX milestone —
  see "Frontend" above), a configurable idle duration (no evidence yet
  that different schools need different policies, same reasoning as
  ADR-0019's fixed lockout threshold), a client-side idle warning
  ("you'll be logged out in 2 minutes") — this app has no background
  polling loop today to drive one.
