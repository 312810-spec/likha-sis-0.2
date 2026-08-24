# ADR-0028 — Teacher Workspace: Currently-Open Grading Period Per Section

Status: Accepted

## Context

Third pick from the post-sequence evidence-based scoring pass
(`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`, score 5.70).
Closes the deliberate gap `docs/adr/0024-teacher-workspace.md` disclosed
when Teacher Workspace first shipped: showing "currently open grading
period(s)" per section was skipped then because
`GradingApplicationService.listPeriodsBySchoolYear` needs a `schoolYear`
argument with no "list all open periods" convenience, and sections can
in principle carry different school years — ADR-0024 explicitly flagged
that correctly resolving "the" open period per section needed a
non-trivial join, not something to rush.

## Decision

No new Rust command, no new migration — this is purely a frontend
composition of two calls other screens already make
(`sectionService.listSections()`, already used; `gradingService.listPeriodsBySchoolYear(schoolYear)`,
already used by `GradingPeriodsScreen`). The join ADR-0024 deferred:

1. Collect the **distinct** school years across the teacher's sections
   (`[...new Set(sections.map(s => s.schoolYear))]`) and fetch each
   year's periods exactly once — sections commonly share a school year,
   so fetching per-section would be redundant work against the same
   data.
2. For each section, find the period (among its own school year's
   periods, not a global list) whose `[startsOn, endsOn]` range covers
   today (`isPeriodOpenOn`, inclusive on both ends, plain ISO-date
   string comparison — valid since `YYYY-MM-DD` strings sort
   lexicographically the same as chronologically).
3. Render the result as a small trailing note on each section's
   existing attendance-status line: "`<label> is open`" or "no grading
   period currently open" — never silently omitted, since "nothing is
   open right now" is itself useful information for a teacher (e.g. a
   sign they still need to create this term's period).

This is genuinely per-section, not a single value assumed to apply
uniformly — proven by a dedicated test with two sections on different
school years, one with an open period and one without.

## Consequences

- `src/ui/TeacherWorkspaceScreen.tsx`: new `gradingService` prop,
  `SectionAttendanceSummary.openGradingPeriod`, `isPeriodOpenOn` helper,
  the school-year-deduplicated fetch, and a new trailing note per
  section row.
- `src/App.tsx` now passes `gradingService` through to
  `TeacherWorkspaceScreen`.
- 3 new tests: shows the open period's label, shows "no grading period
  currently open" when today falls in a gap, and — the one that
  actually proves the per-section join, not a shared assumption — two
  sections on different school years each resolve independently.
- A test-infrastructure note, not a product one: `getByText`'s default
  matching only checks a single element's own direct text, not text
  spanning a parent and its nested-element children — the new
  `openGradingPeriod` note is a separate `<span>` inside each section's
  `<li>`, so the new tests needed a small `findSectionListItem` helper
  matching against the `<li>`'s full `textContent` instead of relying on
  the plain string/regex form of `getByText`.
- **Verification actually run this session**: `npm run quality` 316 TS
  tests (up from 313) green, typecheck/lint/format/architecture clean.
  `npm run build` succeeds. `npx knip` — same 5 pre-existing findings,
  zero new. No Rust change, so `cargo nextest run`/`clippy` unaffected
  (last run this session: 310/310, clean).
- **Independent review**: not dispatched. Both `teacher-ux-reviewer` and
  `accessibility-reviewer` are documented as currently unreliable this
  session (ADR-0027) — re-dispatching immediately after two failed
  attempts would not be a good use of the one-resume-then-self-review
  budget for a small, low-risk, read-only UI addition with no new
  authorization surface. Self-review: confirmed `openGradingPeriod`
  resolution reads only already-session-scoped data (`sections` and
  `listPeriodsBySchoolYear`'s results are both already isolated by the
  existing session-derived `school_id` on the Rust side — no new query,
  no new command); confirmed the empty/gap case is disclosed, not
  silently hidden.
