# ADR-0022 — Global Session Expiry Handling

Status: Accepted

## Context

Second item in the user-directed sequence (2026-08-25): Audit Log →
**Global Session Expiry Handling** → Learner Search → Teacher Workspace
→ reassess. ADR-0020 (Idle-Timeout Session Hardening) explicitly
identified this gap in its own "not implemented" section: this app has
never told a teacher plainly "your session expired, please sign in
again" for **any** reason — idle timeout, the absolute 8-hour TTL, or
revocation. Every screen that hit `Unauthorized` from a protected
command just showed its own generic, screen-specific error (e.g.
`LearnerListScreen`'s "Could not load learners."), leaving a teacher
with no idea why or what to do next.

## Decision

A single centralized point, not a per-screen fix. `src/infrastructure/tauri/invoke.ts`
wraps `@tauri-apps/api/core`'s `invoke` — every `TauriXRepository` now
imports `invoke` from this wrapper instead of the Tauri SDK directly
(13 repository files, purely a one-line import-source change each, no
other behavior touched). The wrapper does exactly one extra thing: on
any rejection whose error text includes `"unauthorized"`, it notifies a
single registered listener before re-throwing the original error
unchanged — existing per-call `.catch()` handling in every repository
and application service is completely unaffected.

`login` is explicitly exempted: its own `Unauthorized` rejection means
"this account isn't a member of the selected school," a normal
login-time validation outcome `LoginScreen` already handles as an
ordinary sign-in failure — not a session that was ever valid and then
expired. Every other command is in scope.

`composition.ts` re-exports `onSessionExpired` alongside the pre-wired
services, so `App.tsx` — the one place that should ever care — registers
it there rather than importing `infrastructure/tauri/invoke` directly.
This isn't required by the automated architecture-boundary check (`App.tsx`
sits outside the check's restricted directories, same as `composition.ts`
itself), but it keeps a single, consistent entry point for anything
`infrastructure/tauri/*`-shaped, matching how every other Tauri-backed
capability already reaches `App.tsx` through `composition.ts`.

On notification, `App.tsx` clears the current session and shows
`LoginScreen` with a new `notice` prop: "Your session has expired.
Please sign in again." — rendered as a `role="status"` banner, distinct
from `LoginScreen`'s own `error` (`role="alert"`), since this describes
why the teacher landed here, not something they just did wrong. The
notice clears on a fresh successful login or an explicit logout.

## Consequences

- New: `src/infrastructure/tauri/invoke.ts` (`invoke` wrapper,
  `onSessionExpired` listener registry), 6 new tests covering: pass-
  through on success, exact-argument-shape parity with the real Tauri
  `invoke` (a real bug caught mid-implementation — see below),
  notification on an unauthorized rejection, no notification for
  `login`'s own unauthorized case, no notification for an unrelated
  error, and that only the most-recently-registered listener fires.
- 13 repository files' import source changed
  (`@tauri-apps/api/core` → `./invoke`), mechanically, no other line
  touched in any of them.
- `composition.ts` re-exports `onSessionExpired`. `App.tsx` registers
  it, tracks a `sessionExpiredNotice` state, passes it to `LoginScreen`.
  `LoginScreen` gained an optional `notice` prop and a new banner.
- **A real regression caught by running the actual test suite, not
  assumed away**: the wrapper's first draft always forwarded `args` to
  the real `invoke`, even as `undefined`, for a call site that omits
  the second argument entirely (e.g. `invoke<Learner[]>("list_learners_by_school")`).
  `tauriInvoke(command, undefined)` is an observably different call
  shape than `tauriInvoke(command)` — every repository test asserting
  the exact `invoke` call arguments failed (12 failures across 9 files)
  the moment the wrapper was wired in. Fixed by forwarding exactly as
  many arguments as the caller passed, not always two. Recorded as a
  general lesson worth knowing before wrapping any function with an
  optional parameter: passing `undefined` explicitly is not always
  equivalent to omitting the argument.
- **Verification actually run this session**: `npm run quality` — 280
  TS tests (up from 271: +6 wrapper tests, +2 `LoginScreen` notice
  tests, +1 end-to-end `App.tsx` test proving the full redirect flow
  from a rejected protected command through to the visible notice),
  typecheck/lint/format/architecture-boundary all clean. `npm run
build` succeeds. `npx knip` — no new unused-export findings (confirms
  `onSessionExpired` is genuinely wired in, not dead code). `cargo
nextest run` — 299/299 unaffected (this milestone is TS/frontend-
  only, no Rust change).
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019/0020/0021. Self-review: confirmed the wrapper never
  changes what a caller receives on success or the exact error it sees
  on failure (only adds a side-effecting notification), confirmed
  `login`'s exemption is scoped to the command name only (a locked or
  wrong-password login still shows its own specific message via
  `LoginScreen`'s existing logic, untouched), confirmed the notice
  clears on both a fresh login and an explicit logout so it can never
  persist stale across an unrelated future sign-in.
- Not implemented (deliberately out of scope): a client-side idle
  warning before expiry ("you'll be logged out in 2 minutes") — this
  app has no background polling loop today to drive one, and none was
  added just for this; a dismiss button on the notice (it already
  clears itself on the next login attempt, which happens immediately
  since the teacher is looking at the sign-in form).

## Addendum (Wave 3B, 2026-08-30): the exemption was never comprehensive

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-3B-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**The bug found while building Teacher Load's School-Head view.**
`login` was this ADR's only exemption because it was the only command
anyone had reason to test end-to-end at the time. Every subsequent
wave that added a `Capability`-gated write (Sections, Learners, SF1
Import, PSGC import, Teaching Assignments, Class Schedule), an
`authorize_view_teacher_load`-gated read (`get_teacher_load`,
`list_teacher_assignments`, `list_schedule_meetings_by_assignment`),
or an `authorize_own_assignment`-gated Subject Attendance command
inherited the same unexamined gap: `AppError::Unauthorized` serializes
identically ("unauthorized") whether the session is genuinely invalid
or the session is completely valid but simply not permitted for that
one specific action. This wrapper could not tell the two apart, so
**every one of those 30 commands was silently forcing the global
"session expired, please sign in again" logout on an ordinary
permission denial** — discarding whatever friendlier local message the
calling screen intended to show (e.g. `TeachingAssignmentsScreen`'s own
"Could not assign this teacher..." message, never actually seen by a
Teacher session, since the global redirect unmounted the screen first).

Caught while designing Wave 3B (a School Head viewing a colleague's
teaching load): that specific feature would have exercised this exact
path constantly and visibly — a Teacher who tried it would simply be
logged out, with no explanation. Per `.claude/rules/autonomous-development.md`'s
own instruction ("if a newly discovered foundational defect exists,
prefer repairing the foundation before adding dependent features"),
fixed as its own small, bounded step before the dependent feature.

**Decision**: extend `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING`
(`src/infrastructure/tauri/invoke.ts`) from a single hardcoded name to
every command gated by `Capability`, `authorize_view_teacher_load`, or
`authorize_own_assignment` — enumerated explicitly (31 commands total,
compiled by grepping every `commands::*` file for these three gate
functions, cross-checked against every `pub fn authorize_*` in
`auth/mod.rs` to confirm completeness). A command gated only by
`require_active_session`/`require_active_school_scope` (reference-data
reads with no additional permission check, e.g.
`list_teaching_assignments_by_section`) is deliberately **not**
exempted — its `Unauthorized` really can only mean the session itself
is invalid, and must keep triggering the global redirect.

**This is not a security loosening.** No `authorize_*` gate in Rust
changed at all — every one of these commands still refuses exactly the
same callers it always did. The fix only changes which _frontend_
mechanism reports that refusal: a local, in-screen error message
instead of an unrelated global logout. A session that is genuinely
expired is still caught promptly in practice, since almost every
screen also calls at least one non-exempted, session-only-gated read
in the same load cycle.

**Verification**: `npm run quality` 692/692 vitest (+6: a
parameterized test proving 5 representative newly-exempted commands
across all three gate shapes no longer notify the listener, plus one
proving a session-only-gated command still does). `npx tsc -b
--noEmit` / `eslint` / `prettier --check` / `check:architecture` all
clean. **Zero Rust files touched** — confirmed by `git status`; no
`authorize_*` function or any command's gate changed. `cargo test`
reconfirmed 571/571 unchanged as part of `npm run quality:full`. `npm
run build` + `check:dev-preview-isolation` pass. `npm run
quality:security` clean, no new dependency. `npm run harness:verify`
still exactly 100/100, unchanged.

**Deliberately not built**: no Rust-side error-type split (a
`Forbidden` variant distinct from `Unauthorized`/session-invalid,
which would let this distinction be made once, correctly, at the type
level instead of an enumerated frontend list that must be remembered
for every future gated command) — the architecturally cleaner fix, but
a larger change touching every `authorize_*` call site and the error
serialization contract, properly requiring the independent security
review `.claude/rules/security-privacy.md` calls for on
auth-touching milestones. Recorded as debt, not attempted in this
bounded wave. No independent (non-self) review was dispatched for
this frontend-only classification fix — retained as debt, consistent
with the pattern recent waves have established.
