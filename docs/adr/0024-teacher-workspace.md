# ADR-0024 — Teacher Workspace / Home Screen

Status: Accepted

## Context

Fourth and final named item in the user-directed sequence (2026-08-25):
Audit Log → Global Session Expiry Handling → Learner Search → **Teacher
Workspace** → reassess. This is the same idea as scenario #6 in
`docs/product/M8-DECISION.md`'s original 20-scenario list ("Teacher
dashboard/home screen") — treated as one item, not built twice.

Before landing on a design, checked what a teacher actually needs at a
glance and what's already cheaply available rather than inventing new
queries: `sectionService.listSections()`, `attendanceService.rosterForDate()`
per section, `learnerService.listLearners()`, and
`authService.listAuditLog()` (new this session, ADR-0021) are all
existing calls other screens already make. No new Rust command, no new
migration.

## Decision

`TeacherWorkspaceScreen.tsx` is now the default landing tab after
sign-in (previously "Learners" was first/default with no real
justification beyond being first in the list). It shows:

1. A greeting using the session's own `displayName` (no new data).
2. Learner and section counts.
3. **Today's attendance-marking status per section** — for each
   section, fetches today's roster and reports "not yet marked today,"
   "N of M marked," or "all M marked." This is the single most useful
   at-a-glance fact for a teacher's morning: which of their sections
   still need attendance taken.
4. **Recent sign-in activity** (last 5 entries) — reuses the audit log
   built earlier this session, giving it a second, more discoverable
   surface beyond its own dedicated tab.

All data fetches run in parallel (`Promise.all` for the three
top-level calls, then a second `Promise.all` over per-section roster
fetches) rather than serially, since none depend on each other.

**Deliberately not attempted**: showing "currently open grading
period(s)." `GradingApplicationService.listPeriodsBySchoolYear`
requires a `schoolYear` argument with no "list all currently open
periods" convenience — and sections can in principle carry different
school years, so correctly resolving "the" open period per section
would need a non-trivial join this session didn't have evidence was
worth building yet. Recorded as a real, deliberate gap, not an
oversight — a reasonable next addition to this screen if a teacher
workflow specifically needs it.

## Consequences

- New `src/ui/TeacherWorkspaceScreen.tsx`, wired as `App.tsx`'s new
  default `activeTab` ("workspace," now first in `SIGNED_IN_TABS`).
- 8 new tests: greeting, learner/section counts, all three
  attendance-status message variants (not yet marked / partially
  marked with count / fully marked), recent activity rendering, the
  no-sections-yet empty state, and an accessibility check.
- Two pre-existing `App.test.tsx` tests updated for the new default
  landing tab: the old "shows the learner screen when there is an
  active session" test now asserts the Workspace screen renders by
  default, and a new test explicitly proves the Learners tab still
  works by clicking to it first — the navigation path itself didn't
  change, only what's shown before any tab click.
- **Verification actually run this session**: `npm run quality` — 295
  TS tests (up from 286), typecheck/lint/format/architecture-boundary
  all clean. `npm run build` succeeds. `npx knip` — same 5 pre-existing
  findings, zero new ones (confirms the new screen and its data are
  genuinely wired in, not dead code). No Rust change.
- **Independent review**: not dispatched — same standing agent-resume
  note as ADR-0019-0023. UI-only, reuses existing session-scoped
  service calls exclusively, no new authorization surface.
- Not implemented (deliberately out of scope, see "Decision" above):
  currently-open grading period(s) on the workspace; a client-side
  refresh/auto-poll (the screen loads once per visit, matching every
  other screen's own convention — no screen in this app currently
  polls).
