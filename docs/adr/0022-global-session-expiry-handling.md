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
