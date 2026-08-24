# ADR-0010 — Grading-Period Foundation (M11)

Status: Accepted

## Context

M10 delivered the SF2 export. The user named "Grading-Period Foundation"
as the explicit next-best milestone in the same message that directed
M10, so M11 proceeds without a separate product-decision pass.

Per `.claude/rules/testing.md`/the `deped-compliance` skill, DepEd-specific
terminology must come from an authoritative source, not assumption. This
milestone hit exactly the scenario that rule exists for: **DepEd's
grading-period structure genuinely changed within this project's own
lifetime.** Research (via inline `WebSearch`/`WebFetch`, same method as
ADR-0009, for the same reason — this session's agent-resume path is
unreliable) found:

- The older K to 12 Basic Education Curriculum used four quarters per
  school year.
- **DepEd Order No. 9, s. 2026** — "Guidelines on the Implementation of
  the Three-Term School Calendar in Basic Education" — shifts Basic
  Education to a three-term structure (Term 1/2/3), effective SY
  2026-2027 (school year opens June 8, 2026, closes April 8, 2027, 201
  class days). Confirmed across multiple independent sources agreeing on
  the exact order number, title, and date range (studocu.com,
  tchersden.blogspot.com, slideshare.net, teachersclick.com,
  edureaper.com, depedtambayanph.net) — triangulated, not
  single-sourced.
- **Not confirmed**: the exact per-term instructional-block start/end
  dates beyond the overall SY bookends, and whether Senior High School
  (Grades 11-12, which independently uses a semester/2-quarters-per-
  semester structure per general K-12 grading documentation) falls under
  this same three-term order or retains its own structure. Also
  unconfirmed: the MATATAG curriculum's own phased rollout (2024-2027 by
  grade level) interacts with this order in some way not fully clarified
  by the secondary sources available.

**This is squarely the "policy is in flux, don't hardcode it" case the
`deped-compliance` skill anticipates** — not a stable historical fact
like SF2's 2014 form (ADR-0009), where the same field layout has held for
over a decade.

## Decision

**User's explicit direction: policy-driven/versioned periods, defaulting
to the current official three-term structure.** Asked directly (given the
scope ambiguity this in-flux policy created), the user chose a
policy-driven design over both a hardcoded 4-quarter assumption and
further research. This shaped the schema:

- `grading_policies` — small, versioned reference data (not school-scoped;
  every school sees the same DepEd-sourced set), each row carrying its
  own `name` and a `source_citation` naming exactly what was and wasn't
  verified. Two seeded rows: "DepEd Three-Term School Calendar" (default,
  citing DepEd Order No. 9, s. 2026, with the SHS/exact-dates gaps stated
  in its own citation text) and "DepEd Four-Quarter (legacy K to 12)"
  (not default, for schools/grade levels still transitioning or for
  historical records).
- `grading_policy_periods` — a policy's ordered, named periods (fixed
  labels: "1st Term"/"2nd Term"/"3rd Term" for the default policy;
  "1st"–"4th Quarter" for the legacy one). Reference data, not
  school-editable.
- `grading_periods` — what a school actually fills in: one row per
  (school, school year, policy period), with school-entered
  `starts_on`/`ends_on`. **Dates are never defaulted or guessed** — this
  app has no source for any individual school's real calendar, only the
  overall SY 2026-2027 bookends from the order, which are not
  necessarily any given school's own term boundaries.

**"At most one default policy" is a structural constraint, the same
established pattern as migrations 5/6's other unique-partial-index
guards** (`idx_one_default_grading_policy`) — not a re-litigation of
whether that pattern is right (settled in ADR-0008), just its third
application in this codebase.

**No grade computation, no gradebook.** Explicitly out of scope, per the
user's own "Foundation" framing and `docs/product/M8-DECISION.md`'s
rejected-alternatives note that DepEd's actual grade-computation rules
(Written Work / Performance Task / Quarterly Assessment weighting) are
"genuinely complex enough to need their own research pass" — a separate,
larger future milestone, not bundled into establishing the period
structure itself.

## Consequences

- New: migration 6 (`grading_policies`, `grading_policy_periods`,
  `grading_periods`, with the two-policy/seven-period seed data),
  `src-tauri/src/repository/grading.rs`,
  `src-tauri/src/commands/grading.rs`. No change to any existing table.
- `policy_period_id` is client-supplied to `create_grading_period` the
  same legitimate way `section_id`/`policy_period_id`-shaped ids already
  are elsewhere (ADR-0008/0009) — it identifies fixed reference data, not
  tenant data, so there is nothing for it to leak even without an
  isolation check; `create()` still verifies it resolves to a real
  policy period before writing (returns `None` otherwise), and
  `school_id` is derived only from the session.
- New TS: `src/domain/grading.ts`, `src/domain/ports/grading-repository.ts`,
  `src/infrastructure/tauri/grading-repository.ts`,
  `src/application/grading-service.ts`, `src/ui/GradingPeriodsScreen.tsx`
  (new tab: policy picker showing its source citation inline, a
  school-year input, and one row per policy period — a date-range form
  if not yet saved for that school year, read-only dates if it is).
  `src/ui/theme/styles.css` gained a `.visually-hidden` utility (the
  standard clip-rect pattern) — the first screen in this app needing a
  label that's visually redundant (a table column header already states
  it) but still required for an accessible name; kept here rather than
  inline since it's a generically reusable primitive.
- **Verification gap, disclosed honestly rather than glossed over**: the
  usual "relaunch the compiled `app.exe` and confirm the migration log
  line" step (this project's standing precedent since M5) was attempted
  three times for migration 6 and was inconclusive — the process ran
  without crashing and stderr stayed empty each time, but stdout capture
  via `Start-Process -RedirectStandardOutput` returned 0 bytes even after
  waiting for the log line, most likely PowerShell/Windows pipe buffering
  on a GUI process that was force-terminated rather than allowed to exit
  normally (this same technique did successfully capture M9's "migrated
  to version 5" line earlier in this session, so the mechanism can work —
  it just didn't reproduce reliably here). Not treated as a blocker:
  `cargo build` compiles the real `migrations()` function including
  migration 6, and six dedicated migration-6 tests
  (`db::migrations::tests::migration_6_*`) directly exercise the seed
  data, the default-policy uniqueness constraint, and the
  `starts_on <= ends_on` check against a real in-memory SQLite connection
  running the actual migration SQL — stronger, more specific evidence
  than a log-line grep would have provided anyway.
- Not implemented (deliberately out of scope): grade computation/
  weighting, a gradebook, editing or deleting a saved grading period,
  Senior High School's separate semester structure (not confirmed to
  need distinct modeling this milestone), any UI for adding a third
  grading policy beyond the two seeded ones.
