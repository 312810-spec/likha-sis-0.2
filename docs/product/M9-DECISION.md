# M9 Decision Record — Section Foundation + DepEd Attendance Semantic Alignment

This is a record of a decision already made, not a re-run of the
20-scenario process from `docs/product/M8-DECISION.md`. Per that
record's "Continuous Product Loop" guidance and this project's own rule
(never reopen a milestone decision without new instruction), M9 is not
being re-litigated here — this file exists because the pivot happened
mid-session and was, until now, recorded only in ephemeral session
working notes rather than durable project docs. See ADR-0008 for the
full technical decision and rationale; this file is the shorter
product-framing record.

## What M9 was, and what it became

`docs/CURRENT-HANDOFF.md` and `docs/PROGRESS-MAP.md` previously recorded
M9 as **Learner Profile Enrichment** (LRN, birthdate, guardian contact),
selected via a lightweight update to the M8-DECISION scoring after a
near-tie with "Sections/classes entity." That scoring is still valid and
is not being redone — Learner Profile Enrichment simply moves to an
**M10 candidate**, not cancelled.

Mid-session, before this document existed, M9 was redirected to
**Section Foundation + DepEd Attendance Semantic Alignment** instead.
The reason: M8's real DepEd source work (a genuine `CONSO SF v2025.xlsx`
workbook, structural facts only) had already found that a `Section`
entity is the real prerequisite for a section-level SF2 export — a
stronger, more evidence-grounded justification than the original
tiebreaker reasoning ("produces official DepEd output," "reusable
infrastructure") that favored Learner Profile Enrichment. The three-code
DepEd attendance semantics fix (`Present`/`Absent`/`Tardy`, not the
previous four-status model) was folded into the same milestone because
it touches the same `attendance_records` table and the same migration.

## Why this isn't a re-simulation

Per `M8-DECISION.md`'s own continuous-loop rule, a full 20-scenario
re-score is warranted only for a materially new product branch or
changed dependencies. Here: no new branch — "Sections/classes entity"
was already one of the 20 originally-scored candidates, and M8's own
delivery record already argued for it as the real SF2 prerequisite. The
pivot is a re-prioritization within the existing scored set, using
information (the real DepEd workbook's actual structure) that only
became available during M8's implementation — not a new decision process.

## Status

Implemented this session: migration 5 (`sections`, `section_memberships`,
retired attendance statuses), section/section_membership repositories and
commands, section-scoped attendance repository/commands, minimal TS
wiring (a `SectionsScreen` for creating a section and enrolling a
learner — the minimum needed for the now-section-scoped Attendance and
Monthly Summary screens to be reachable), and this + ADR-0008 as the
durable record. See `docs/ACTIVE-PLAN.md`'s "M9" section for the full
verification record (tests, clippy, quality gates, independent review).

Learner Profile Enrichment (LRN/birthdate/guardian) is the leading M10
candidate, unchanged from the prior scoring.
