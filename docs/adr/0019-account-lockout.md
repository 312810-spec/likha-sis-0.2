# ADR-0019 — Account Lockout After Failed Logins

Status: Accepted

## Context

Once Roles & Permissions was resolved as "deferred, not built" (see
`docs/product/M8-DECISION.md`'s follow-up section), the directed M15→M18
roadmap was exhausted. Continuing under Autonomous Continuous
Development Mode (`.claude/rules/autonomous-development.md`), the next
milestone was selected from current evidence rather than a fresh user
directive.

`docs/product/M8-DECISION.md`'s original 20-scenario scoring already
named "Account lockout after failed logins" as scenario #12
(~5.8, Security-first category) — a real, previously-identified
candidate, not a fresh invention. Unlike Roles & Permissions, this is
**not** disqualified from autonomous selection: it doesn't require the
user to define an organizational policy (what roles exist, who has
authority over whom). A lockout threshold and duration are standard
security-engineering parameters with well-established defaults (OWASP's
Authentication Cheat Sheet), not something specific to this project's
DepEd/school context.

Checked the actual gap before implementing: `auth::mod.rs`'s `login`
function had no brute-force mitigation whatsoever beyond Argon2id's own
hashing cost. Given this app's own documented deployment model — shared
school computers, multiple teacher accounts, no 1:1 Windows-account
assumption (`docs/adr/0004-authentication-and-local-session.md`) — a
colleague or student at the same physical machine repeatedly guessing a
coworker's password is a real, not hypothetical, local threat this
schema had no defense against.

## Decision

Two new nullable/defaulted columns on `users` (migration 14):
`failed_login_attempts INTEGER NOT NULL DEFAULT 0`, `locked_until TEXT`.
`repository::user::verify_credentials` now:

1. Unknown username: unchanged — dummy-timing password check, generic
   `AuthenticationFailed`, never touches the new columns.
2. Known username, currently locked (`locked_until` in the future):
   returns the new `AppError::AccountLocked` **without** attempting
   password verification at all (also a minor DoS-mitigation benefit —
   Argon2id is deliberately CPU-expensive, so skipping it during an
   active lock avoids paying that cost on an attempt that can't succeed
   anyway).
3. Known username, not locked, correct password: resets
   `failed_login_attempts` to 0 and `locked_until` to `NULL`, returns
   the user as before.
4. Known username, not locked, wrong password: increments
   `failed_login_attempts`. If this attempt is the one that reaches
   `MAX_FAILED_LOGIN_ATTEMPTS` (5), sets `locked_until` to 15 minutes
   from now and resets the counter to 0 (so the account starts with a
   fresh full set of attempts once the lock expires), and returns
   `AccountLocked` **on this same attempt** rather than the next one —
   immediate feedback, not a confusing delayed reveal. Otherwise
   returns the existing `AuthenticationFailed`.

**A disclosed, deliberate trade-off, not an oversight**: once an account
has failed enough attempts to lock, the response (`AccountLocked`, distinct
from `AuthenticationFailed`) does reveal that the username exists — this
is a narrower version of the exact enumeration concern the codebase's
own standing comment on `AppError::AuthenticationFailed` warns against
("never add a variant that lets a caller tell them apart"). The
mitigating factor: this only fires after `MAX_FAILED_LOGIN_ATTEMPTS`
wrong guesses **already targeted at that specific username** — a real
cost paid first, not a free signal. An unknown username can never reach
this branch and always returns the same `AuthenticationFailed` it
always has, regardless of how many times it's tried. This exact
trade-off is present in effectively every real system with account
lockout; treated here as accepted and disclosed (in code comments and
here), not silently introduced.

Frontend: `LoginScreen` distinguishes the new failure by checking
whether the rejected error's string form contains `"account_locked"`
(Tauri's IPC layer delivers `AppError`'s serialized category string as
the rejection value; there was no existing precedent in this codebase
for a frontend screen branching on a specific `AppError` category, so
this is a new small pattern, not an extension of an existing one) and
shows a plain, specific message ("Too many failed sign-in attempts...
temporarily locked... wait a while... or ask your school's admin") — a
real usability improvement over the previous single generic failure
message, and safe to be specific here for the same reason the backend
choice is safe: it only ever fires for a username that already required
five wrong guesses to reach.

## Consequences

- New: migration 14 (`users.failed_login_attempts`,
  `users.locked_until`), one migration test confirming the new columns
  default correctly for existing rows.
- `repository::user::verify_credentials` rewritten with three new
  private helpers (`is_locked`, `record_failed_login_attempt`,
  `reset_failed_login_attempts`), all pure SQL date-range/counter logic
  matching this codebase's established convention of doing date
  comparisons in SQL rather than parsing timestamps in Rust (see
  `section_membership::is_active_member`). Six new repository tests:
  locks after the threshold with immediate feedback, a locked account
  rejects even the correct password, a successful login resets the
  counter, an unknown username never locks, a lock expires and a fresh
  attempt afterward succeeds.
- New `AppError::AccountLocked` variant, serialized to the same
  "generic category only" string convention as every other variant
  (`"account_locked"`).
- `LoginScreen` gained a third error-message branch (locked / other
  auth failure / validation), with a new test asserting the message is
  visibly distinct from the generic failure message.
- **Independent review**: not dispatched (see the standing note in
  `docs/CURRENT-HANDOFF.md` on this session's agent-resume issue — two
  separate review agents dispatched earlier in this session for
  M12c-M18 UI both completed real work but returned no retrievable
  findings on resume). Given this milestone touches authentication
  directly, a careful self-review was performed instead: confirmed the
  lockout check happens before password verification (so a locked
  account never leaks a correct/incorrect signal for that attempt's
  password), confirmed the unknown-username path is completely
  untouched by the new code (still exactly the pre-existing dummy-timing
  branch), confirmed no new field or message leaks anything beyond the
  disclosed username-enumeration-after-cost trade-off above, and
  confirmed the lockout state lives in the persisted `users` table (not
  `SessionManager`'s in-memory state), so it survives a process restart
  as intended — a lockout that reset itself along with the session
  manager would defeat its own purpose.
- **Verification actually run this session**: `cargo test` — 226 lib
  (up from 220; +6 repository tests, +1 migration test... actually +7
  net across both) + 54 integration tests, all green. `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — 262 TS tests
  (up from 259; +3, including the new LoginScreen test), typecheck/
  lint/format/architecture-boundary all clean. `npm run build`
  succeeds.
- Not implemented (deliberately out of scope): idle-timeout/session
  hardening (scenario #14 in the same M8-DECISION scoring, related but
  distinct — a fixed-TTL session already exists per ADR-0004; idle
  tracking would be a separate change), an admin-facing "unlock this
  account early" affordance (not needed yet given no roles/permissions
  system exists to define who "admin" even is), a configurable
  threshold/duration (hardcoded constants are appropriate at this
  scale — no evidence yet that different schools need different
  policies).

## Same-session self-review addendum

While reviewing the M12c-M18 UI by self-review (after the same
agent-resume issue affected two dispatched review agents for that
work), two real, concrete UX/accessibility gaps were found and fixed in
`LearnerListScreen.tsx`'s M17/this-session edit affordance, unrelated to
account lockout itself but recorded here since they were found in the
same review pass:

1. Entering edit mode removed the "Edit" button from the DOM without
   moving focus anywhere, leaving keyboard/screen-reader focus at the
   document body — fixed by focusing the edit form's first field when
   `editingId` changes to a non-null value.
2. Clicking "Edit" on a second learner while a first learner's edit was
   still in progress silently discarded the first learner's unsaved
   typed changes with no warning — fixed by disabling every other row's
   "Edit" button while one is active, so only one edit can be in
   progress at a time.

Both are covered by new tests in `LearnerListScreen.test.tsx`.
