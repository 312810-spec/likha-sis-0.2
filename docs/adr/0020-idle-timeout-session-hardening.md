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

## Addendum (2026-08-29) — Wave 5 security-reviewer pass on the offline-session/re-authentication policy

`docs/product/PRODUCT-CONTRACT.md` §13 named this exact question as
still open: "an offline-capable session with periodic
re-authentication, roughly an 8-hour protection window is a
product-requirement candidate, not a locked policy — any concrete
numeric threshold needs a security-focused decision pass." A
`security-reviewer` agent was dispatched for that pass; it completed
real work but — the same recurring agent-resume/retrieval failure
documented since M7 — returned no retrievable findings on the initial
dispatch or the one permitted retry (the second attempt claimed its
findings had "already [been] delivered in plain text earlier in this
thread," but the orchestrating session never received any such text;
it declined to restate a third time without new input). A rigorous
self-review was substituted, reading `src-tauri/src/auth/mod.rs`
directly end to end.

**Conclusion on the numeric policy: keep 8-hour absolute cap / 30-minute
idle timeout / 15-minute lockout unchanged.** No evidence surfaced that
any of the three thresholds is wrong for this threat model — shortening
the 8-hour cap would conflict with offline reliability (a teacher
working a full school day with no network connectivity to re-
authenticate against a cloud service must not be forcibly logged out
mid-lesson), and the 30-minute idle window is already inside standard
guidance with a 2-minute warning banner (ADR-0026) as the mitigating
control for the "stepped away" case. Changing a number without new
evidence would repeat the exact mistake `PRODUCT-CONTRACT.md` already
warns against.

**One real defect found and fixed** (`Confirmed`, TDD, not merely
theorized): `login()` unconditionally overwrote `SessionManager`'s one
in-memory slot with the new session, but never revoked or logged out
whatever session was already held. On a shared school computer, if
Teacher B logged in without Teacher A explicitly signing out first,
Teacher A's persisted session row stayed **active or un-revoked**
indefinitely (until its own 8-hour expiry) and no `Logout` audit event
was ever recorded for Teacher A — silently losing exactly the
"who was using this account and when" fact ADR-0021's audit log exists
to preserve. A failing regression test
(`logging_in_as_a_second_user_revokes_and_audits_the_first_users_still_active_session`)
reproduced it before the fix; `login()` now revokes the previous
session and records its `Logout` audit event (mirroring `logout()`'s
own logic exactly) immediately after the new login's own credentials
are verified — never before, so a failed second-login attempt cannot
sign the first teacher out.

**One real hardening gap identified, not fixed this session (recorded,
not silently dropped)**: every session-lifetime comparison
(`Session::is_active`, `expires_at`, `last_activity_at`) is computed
from `SystemTime::now()` — ordinary OS wall-clock time, not a monotonic
clock. On a shared computer, anyone able to roll the system clock
backward could keep a live in-memory session (and thus a stolen or
unattended one) alive indefinitely past both the 30-minute idle window
and the 8-hour absolute cap, since both bounds are themselves points on
the same manipulable clock. **Real-world severity is mitigated, not
eliminated**: changing the system clock on Windows requires the
`SeSystemtimePrivilege` right, which a correctly-configured shared
school deployment (standard teacher accounts, no local admin) does not
grant by default — this is a defense-in-depth gap for a properly locked
down device, not an actively exploitable one under the assumed
deployment model. Given the size of the change (switching `Session`'s
internal time fields to `std::time::Instant` for the enforcement
comparisons touches the struct, `new_session`, `is_active`,
`require_active_session`'s slide-forward logic, and a large share of
this module's existing `SystemTime`-constructing tests) versus its
conditional severity, this is recorded as **SHOULD-FIX debt** in
`docs/VERIFICATION-DEBT.md` for a dedicated small follow-up, not
bundled into this pass as an unrelated large refactor.

**Verification, all actually run this session**: Rust toolchain updated
(`rustup update stable`, 1.94.1 → 1.98.0 — the crate requires 1.95) and
this session's Linux sandbox's missing Tauri GTK/webkit2gtk system
packages installed (the same package list `.github/workflows/quality.yml`
already uses for the Ubuntu CI job) — both were blocking `cargo
check`/`test` entirely before this session; a real native Rust
toolchain now works in this environment, not merely on Windows/CI.
`cargo check --lib` clean. `cargo test --lib auth::` — 58/58, including
the new regression test. Full `cargo test` — all lib and integration
suites green, 0 failed. `cargo fmt --check` / `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality:full` — full
end-to-end pass, exit code 0.
