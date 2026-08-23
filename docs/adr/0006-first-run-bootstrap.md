# ADR-0006 — First-Run / School Bootstrap Experience (M6)

Status: Accepted

## Context

M4 introduced narrow, unauthenticated bootstrap gates (`register_user`,
`add_user_to_school`) so a fresh install could create its first account
at all. M5 built the login/learner screens on top of that — but nothing
in the UI could ever REACH those gates: a fresh install has zero schools
to pick from and zero accounts to sign in with, so the app had no way to
bootstrap itself without a developer manually driving individual
commands. M6 closes that gap with a real first-run experience.

## Decision

**One atomic operation, not three separate calls.** `auth::bootstrap_installation`
creates the first school, first user, and their membership — plus signs
the new user in — as a single SQL transaction, exposed as one Tauri
command (`bootstrap_installation`). The UI never calls
`register_school`/`register_user`/`add_user_to_school` individually for
this flow; those commands still exist for their own narrow ongoing
purpose (an already-authenticated teacher onboarding a colleague), but
first-run setup goes through the one atomic path so a failure partway
through can never leave a school with no user, or a user with no
membership. If any step fails, the whole transaction rolls back and the
attempt can be retried cleanly.

**Backend-trusted first-run detection.** `installation_status` (backed by
`auth::installation_needs_setup`, itself `!any_users_exist()`) is the
only thing that decides whether the frontend shows the setup screen.
`App.tsx` calls it on mount alongside `currentSession()`, before
rendering anything — the frontend never guesses.

**The one-time-only guarantee is a real write, not a read-then-act
check — this was gotten wrong once and fixed.** The first version of
`bootstrap_installation` checked "does any user exist yet" with a plain
`SELECT` as the first statement inside the transaction, reasoning that
SQLite's cross-process write lock would serialize two racing processes.
A closer adversarial pass (self-review, since an independent reviewer
hit a session limit mid-run) found this doesn't hold: SQLite does not
invalidate an already-established read snapshot just because a
different connection committed in the meantime, so two connections
racing to bootstrap the same on-disk file could both read "no users yet"
and both go on to successfully create a "first" school. The fix:
`installation_state`, a singleton-row table
(`id INTEGER PRIMARY KEY CHECK (id = 1)`), claimed via a real `INSERT`
(`repository::installation::claim_bootstrap_slot`) as the actual guard.
An INSERT is a write, so it genuinely participates in SQLite's
cross-process write-lock serialization the way a SELECT never does — a
second connection's claim attempt only proceeds once the first's
transaction has fully committed or rolled back, and by then the row
already exists, so the second claim hits a real constraint violation
(mapped to `AppError::AlreadyInitialized`). Verified with a real
multi-thread, multi-`Connection`, same-file concurrency test
(`tests/bootstrap.rs`) — two connections racing via a `Barrier`, not
just sequential re-calls — confirming exactly one of two simultaneous
attempts succeeds and exactly one school exists afterward.

The older `any_users_exist` check is still run first, alongside the new
guard, not replaced by it: it is what catches an account already having
been created through the separate `register_user` path, a case the
`installation_state` claim alone cannot see (that guard only protects
`bootstrap_installation` against races with itself).

**Accepted residual risk, not fixed.** A narrower race remains between
`bootstrap_installation` and the _older_ `register_user`/
`add_user_to_school` commands racing each other specifically (not
`bootstrap_installation` racing itself) — both are gated by their own
`any_users_exist`/`school_has_any_members` SELECT-based checks, which
have the same snapshot-staleness property as the original bug. Closing
this fully would mean migrating those M4 gates onto the same
write-based singleton-claim pattern. Not done here: it requires two
_different_ UI flows to be driven by two separate processes
simultaneously — a materially narrower window than "the same install
wizard gets double-clicked" — and the worst case is data-integrity
oddity (two independent accounts/schools created), not a privilege
escalation or data leak. Documented rather than silently ignored;
revisit if the threat model changes or before this pattern is reused for
something higher-stakes.

**Minimal fields, teacher-facing language, single form.** School name;
display name, username, password, confirmation. No school code/ID field
— DepEd identifier formats were not researched for this milestone, and
the `schools` table has no such column yet; inventing a validation rule
without an authoritative source would be worse than not asking. A single
form with two headed sections ("Your school" / "Your account") was
chosen over a multi-step wizard: ~5 fields do not justify the extra
clicks and state a wizard adds, and the design review agreed no
structural piece was missing from this shape. Password fields have a
shared show/hide toggle (both fields at once, not one click per field)
and a length requirement always visible, not just in Guided mode.

## Consequences

- New: `src-tauri/src/repository/installation.rs`,
  `src-tauri/tests/bootstrap.rs`, `src-tauri/src/commands/setup.rs`;
  migration 3 (`installation_state`); `AppError::AlreadyInitialized`.
- New TS: `src/domain/ports/setup-repository.ts`,
  `src/infrastructure/tauri/setup-repository.ts`,
  `src/application/setup-service.ts`, `src/ui/FirstRunSetupScreen.tsx`,
  `src/domain/password-policy.ts` (the minimum length constant is now
  shared between `UserApplicationService` and `SetupApplicationService`
  so the two account-creation paths can't silently drift).
- `App.tsx` now checks installation status before anything else and
  routes to the setup screen, ahead of session/login logic.
- Independently reviewed (design/teacher-comfort — via the M5 reviewer
  pattern reused for consistency; accessibility). A session-limit failure
  prevented a planned adversarial security/reliability pass from an
  independent agent; the self-review that filled the gap is the reason
  the concurrency bug above was caught and fixed at all — a reminder that
  "looks good" from either a human or an agent is not evidence without
  someone actually trying to break it.
- Still not implemented: any way to change the school name after setup,
  any account recovery if the bootstrap teacher forgets their password,
  DepEd school-identifier validation. None were required for this
  milestone; none are blocked by anything built here.
