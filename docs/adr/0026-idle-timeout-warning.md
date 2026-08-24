# ADR-0026 — Idle-Timeout Warning Before Logout

Status: Accepted

## Context

Second pick from the post-sequence evidence-based scoring pass
(`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`, score 6.30,
runner-up to Learner Roster CSV Export at 8.10). Closes a real, disclosed
gap: ADR-0020 added a 30-minute idle timeout (`auth::IDLE_TIMEOUT`) but
gave no advance warning — a teacher who stepped away mid-task would just
have their next click fail with "Your session has expired," the same
generic message ADR-0022's global handler already shows for every kind
of session loss, with no chance to avoid it.

## Decision

**Server side**: `CurrentSession` gains `idle_expires_at_unix_ms` —
`session.last_activity_at + IDLE_TIMEOUT`, computed by `to_dto` as a
pure read with no side effect (unlike `require_active_session`, this
never slides the window — same peek discipline `current_session`
already follows per ADR-0020's own contract). A new `extend_session`
command exists solely so a teacher can explicitly renew the window
without needing to go do something else in the app first — it calls
`require_active_school_scope` (the same sliding-window mechanism every
protected command already uses) and returns the refreshed
`CurrentSession`.

**Client side**: a new `IdleTimeoutWarning` component, mounted whenever
a session is active (`App.tsx`), polls `authService.currentSession()`
(a peek — never `extend_session` on its own) every 30 seconds. This
polling approach was chosen over tracking mouse/keyboard activity
client-side because the server is the sole authority on what counts as
"activity" (any protected command, from any screen) — re-deriving that
independently on the client would risk drifting out of sync with what
the backend actually honors. When the authoritative idle deadline comes
within 2 minutes, a warning banner appears with a "Stay signed in"
button that calls `extend_session` directly. If a poll ever finds the
session already gone (idle-expired, revoked, or hit its absolute TTL),
the component calls the same `onExpired` callback `App.tsx` already
uses for `onSessionExpired` (ADR-0022) — one shared "return to sign-in
with a clear reason" code path, not two.

## Consequences

- `src-tauri/src/commands/auth.rs`: `CurrentSession.idle_expires_at_unix_ms`
  field, new `extend_session` command (registered in `lib.rs`).
- New Rust integration tests in `tests/auth.rs`: extending a session
  requires an active one, and a successful extend slides
  `last_activity_at` forward (2 new tests).
- New `src/ui/IdleTimeoutWarning.tsx` (6 unit tests: no warning while
  comfortably active, warning appears within the threshold, "Stay
  signed in" extends and hides it, a poll finding no session calls
  `onExpired`, a failed extend also calls `onExpired`, no accessibility
  violations) plus the `AuthRepository`/`ExportApplicationService`
  plumbing (`extendSession()` on the port, `TauriAuthRepository`, and
  `AuthApplicationService`).
- `docs/adr/0004-authentication-and-local-session.md`'s "8 test fixture
  files needed `idleExpiresAtUnixMs`" ripple: every `CurrentSession`
  fixture across the frontend test suite gained the new required field
  (mechanical, no behavior change).
- New `--color-warning`/`--color-warning-surface` theme tokens (light
  and dark) and `.idle-timeout-warning` styling, following the exact
  pattern `--color-danger`/`--color-success` already established.
- `docs/learning/ERROR-PATTERNS.md`-relevant catch during development:
  `App.test.tsx`'s shared session fixture used the same
  `expiresAtUnixMs: 1_000_000` magic-past-timestamp convention as
  `expiresAtUnixMs` — harmless before this milestone since nothing read
  it, but `IdleTimeoutWarning` polling that value on mount would have
  made every signed-in App test immediately (and spuriously) trigger the
  idle-expired path. Fixed by seeding `idleExpiresAtUnixMs` from
  `Date.now() + 30 * 60_000` instead of a fixed magic number — caught by
  actually running the test suite, not assumed safe.
- **Verification actually run this session**: `cargo nextest run`
  310/310 (up from 308), `cargo clippy --all-targets -D warnings` clean.
  `npm run quality` 310 TS tests (up from 302) green, typecheck/lint/
  format/architecture-boundary all clean. `npm run build` succeeds.
  `npx knip` — same 5 pre-existing findings, zero new. Browser-pane
  visual verification attempted and unavailable this session
  (navigation denied/failed even on retry) — same standing gap disclosed
  since M5/M12c, not glossed over.
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019 through ADR-0025. Self-review: confirmed
  `extend_session` has no data side effect beyond sliding the same idle
  window every other protected command already slides (no new
  authorization surface, no new data exposed beyond what
  `current_session` already returns); confirmed the peek/poll never
  itself calls anything that would slide the window (only the explicit
  "Stay signed in" click calls `extend_session`); confirmed the 30-second
  poll interval and 2-minute warning threshold are conservative relative
  to the 30-minute idle window (comfortably more than one poll lands
  inside the warning period even under scheduling jitter).
- Not implemented (deliberately out of scope): tracking real
  mouse/keyboard activity client-side to reset the warning without a
  server round-trip — the server-authoritative-polling approach above
  was chosen specifically to avoid a client-side notion of "activity"
  that could drift from what the backend actually counts.
