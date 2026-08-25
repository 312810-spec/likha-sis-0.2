# ADR-0033 — Daily Attendance + Monthly Attendance Summary Polish (UX-03)

Status: Proposed (in progress — this ADR is filled in as the milestone
proceeds, per this project's convention of recording decisions as they
are made rather than backfilling at the end)

## Context

Fourth milestone of the UI-First World-Class Product Program (ADR-0030),
following UX-01 (ADR-0031) and UX-02 (ADR-0032). Baseline SHA `f02bce5`
(the account-transition checkpoint, one commit after UX-02's own
completion `14e7e5d` — no code changed in between). Scope: polish
`AttendanceScreen`/`MonthlySummaryScreen` — the same information
hierarchy, non-color-cue, and dev-preview-fixture disciplines UX-01/
UX-02 already established — while fixing three correctness defects
found during planning by direct inspection of the live code, not merely
hypothesized from the milestone brief.

Product name note: this project's product/version identity is
**LIKHA-SIS 0.2**. A repository-wide grep (case-insensitive, whole
repo) confirmed zero occurrences of "LIKHA-SIS 2.0"/"LIKHA SIS 2.0" —
there was no stale naming to correct anywhere in this project's durable
documents.

## Confirmed correctness defects (found before implementation began)

Direct reading of `src/ui/AttendanceScreen.tsx` and
`src/ui/MonthlySummaryScreen.tsx` at the pre-UX-03 baseline confirmed
three real, reproducible defects — not just theoretical risks:

1. **Stale context after a failed load.** Both screens call
   `setLoading(true)` on a section/date/month change but never clear the
   previous `roster`/`report` state. If the new fetch fails, `loading`
   becomes `false` again in the effect's `.finally`, and the component
   renders the _previous_ section's roster (or a _previous_ month's
   grid) underneath the new error banner — a teacher could mistake
   stale data for the current selection.
2. **Overlapping same-learner writes.** `AttendanceScreen`'s
   `savingLearnerId` is a single string with no per-request identity.
   Two writes for the same learner (e.g. two quick clicks before the
   first resolves) can have an older response's roster update land
   after a newer one's, since neither checks whether it is still the
   latest request for that learner. Re-selecting the already-active
   status also performs a redundant write today.
3. **Bulk vs. individual write race.** "Mark all present" disables only
   its own button; the per-row status buttons stay clickable during a
   bulk operation, so an individual write can race the bulk write with
   no serialization at all.

## Decisions

(Filled in as each piece is implemented — see the sections below, added
incrementally during this milestone.)
