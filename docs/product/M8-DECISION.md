# M8 Product Decision Record

Date: 2026-08-24. Process: 20-scenario evidence-based simulation per the
autonomous product-decision engine. Full scoring method: weighted average
of 10 criteria (weights below); Implementation Risk scored 10=low-risk,
all others 10=highly-favorable.

Weights: Teacher Value 20%, DepEd Alignment 15%, Dependency Readiness
10%, Reuse 10%, Architectural Fit 10%, Security Safety 10%,
Implementation Risk 10%, Testing Confidence 5%, Future Leverage 5%,
Time-to-Value 5%.

## Scenarios considered (20)

| #   | Scenario                                              | Category            | Weighted score |
| --- | ----------------------------------------------------- | ------------------- | -------------- |
| 1   | SF2 attendance export (official DepEd form)           | DepEd workflow      | **8.35**       |
| 2   | Bulk attendance actions ("mark all present")          | Low-risk/high-value | 7.75           |
| 3   | Learner profile enrichment (LRN, birthdate, guardian) | Data-first          | 7.65           |
| 4   | Attendance date-range summary (non-official)          | Reporting-first     | 7.45           |
| 5   | Learner search/filter for large rosters               | Low-risk/high-value | 7.20           |
| 6   | Teacher dashboard/home screen                         | Reporting-first     | 6.75           |
| 7   | Grading periods/quarters foundation only              | Foundation-first    | 6.40           |
| 8   | Full grading & gradebook                              | Academic workflow   | 6.25           |
| 9   | Sections/classes entity                               | Foundation-first    | 6.00           |
| 10  | Roles/permissions (teacher vs. admin)                 | Security-first      | 5.70*          |
| 11  | Audit log/activity trail                              | Security-first      | ~5.9           |
| 12  | Account lockout after failed logins                   | Security-first      | ~5.8           |
| 13  | School settings/profile management                    | Administration      | ~5.6           |
| 14  | Idle-timeout/session hardening                        | Security-first      | ~5.5           |
| 15  | Data export/backup (local file)                       | Data-first          | ~5.4           |
| 16  | Multi-teacher/co-teacher handoff                      | Administration      | ~5.1           |
| 17  | Password reset/account recovery                       | Security-first      | ~5.0           |
| 18  | Audit-adjacent: session revocation UI                 | Administration      | ~4.9           |
| 19  | Attendance notifications/reminders                    | Academic workflow   | ~4.2           |
| 20  | Cloud sync / Android groundwork                       | Dependency-first    | ~2.0           |

\*Roles/permissions scored competitively but is **disqualified from
autonomous selection regardless of score**: it "would fundamentally
change roles or access expectations without documented requirements"
(automation stop condition #8) — what roles exist and what they can do
is a product decision only the user can make, same reasoning already
recorded for M4's "no role/permission system yet" scope cut.

## Top 3

1. **SF2 attendance export** — 8.35. Reuses M7 attendance data directly;
   scores highest on DepEd alignment (a literal official form) and
   teacher value (eliminates a real recurring manual paperwork task).
2. Bulk attendance actions — 7.75. Trivial to build, very low risk, but
   narrow scope and no DepEd-compliance value — a good future
   enhancement, not a milestone-scale next step on its own.
3. Learner profile enrichment — 7.65. Solid, low-risk, but lower urgency
   than a form that directly monetizes the M7 data just built.

## Winner: SF2 attendance export

**M7 → M8 relationship, evaluated explicitly**: M7 was not chosen
_because_ it would lead to SF2 — it was chosen for direct teacher value
(the checkpoint before this one had no attendance capability at all).
Now that it exists, SF2 wins on its own merits in the same 20-scenario
comparison against grading and roles/permissions, not by default.

**Rationale**: SF2 (Daily Attendance Report of Learners) is the direct,
literal DepEd output for data this app now captures. No new domain
entities are needed — it's a read/transform/export over the existing
`attendance_records` + `learners` tables, extended with a date-range
query (a small, well-understood generalization of `roster_for_date`, not
a new architectural pattern). No destructive migration, no auth/session
change, no PII beyond what M1/M7 already store.

**Confidence: MEDIUM.** The numeric gap over the runner-up (0.6) is real
but not overwhelming, and — more importantly — this project's own rule
is that DepEd form specifics must come from the `deped-researcher` agent
and `official-forms` skill, not from training-data assumption (form
layouts and required fields are revised over time). That is a genuine
open item, not a fabricated blocker. Per the decision rule for MEDIUM
confidence, autonomous execution is still permitted here because none of
the disqualifying conditions apply: no destructive/irreversible
migration, no unresolved security issue, and the milestone follows
existing architecture. Proceeding: research first via the
`deped-researcher` agent and `official-forms` skill, then implement.

## Rejected alternatives (this cycle)

- **Grading/gradebook**: highest raw teacher value but lowest
  Dependency Readiness of any real contender — no `Subject`/
  `GradingPeriod` entities exist yet, and DepEd's grade computation rules
  are genuinely complex enough to need their own research pass. Strong
  future candidate once a grading-periods foundation exists.
- **Roles/permissions**: disqualified by stop-condition #8 (see above),
  independent of its numeric score.
- **Cloud sync / Android**: explicitly deferred per
  `docs/PROJECT-MEMORY.md`'s locked principles; near-zero Dependency
  Readiness (no provider chosen, no ADR).

## Follow-up: Roles/permissions decision (2026-08-24, later session)

Asked the user directly (the only way to resolve stop-condition #8):
**deferred, not built**. The current single-role model (every
authenticated teacher has full access within their own school) stays as
is — no incident or concrete requirement has come up to justify the
added complexity/risk. If this is picked up in a future session, the
user's stated starting role model is **Teacher + Registrar + School
Head** (School Head sees/manages all teachers' data within the school;
Registrar is focused on official-form exports and learner records,
separate from grading/attendance; Teacher stays scoped to their own
classes/sections as today) — recorded here so a future session doesn't
have to re-ask this specific question, though the exact authority
boundaries for Registrar vs. School Head still need to be worked out
before implementation, not assumed from this one-line description.

## Prerequisites before implementing

1. `deped-researcher` (+ `official-forms` skill): confirm the current
   authoritative SF2 field layout/format — do not implement from
   assumption.
2. No schema migration expected beyond a possible read-side query
   addition; confirm during spec.

**Update 1 (2026-08-24)**: two `deped-researcher` agent attempts both hit
the same agent-harness retrieval issue affecting several other agents
this session (real work happened per token/tool-use counts, but no
output was retrievable).

**Update 2 (2026-08-24) — real source obtained.** The user provided an
actual DepEd school's live `CONSO SF v2025.xlsx` (a real, in-use
"Consolidated School Forms" workbook). Inspected its structure directly
(`openpyxl`/`markitdown`-class tooling) — **structural facts only were
extracted; the workbook contains real learner/staff names and a real
school identity, none of which was copied into this repository**,
consistent with the synthetic-data-only rule. Verified facts that
materially change this milestone's scope:

- SF2 is genuinely one worksheet **per calendar month per section**
  (`SF2 M1 JHS` … `SF2 M11 JHS`), confirming the monthly-grid assumption
  above.
- Per-day columns are **school days only** (Mon-Fri, weekday-labeled),
  not every calendar day.
- DepEd's actual per-day coding, per the sheet's own legend: **blank =
  Present, "x" = Absent, a half-shaded cell = Tardy** (upper half = late
  comer, lower half = cutting classes). There is **no separate "Excused"
  per-day code** in the official form — reasons live in a separate NLS
  (dropout-risk) cause taxonomy and a free-text Remarks column, not a
  4th daily status.
- **SF2 is organized per section/grade level.** LIKHA-SIS's schema has
  no `Section`/`GradeLevel` entity yet (`School` has only
  `id`/`name`/`created_at` — checked directly). A genuine per-section SF2
  cannot be produced without that foundation first (this elevates
  "Sections/classes entity", scenario #9 in the table above, as a real
  near-term dependency for an exact SF2 export later).

**Scope decision, given this evidence**: M8 ships a **school-wide
monthly attendance overview**, not a section-level SF2 replica —
reusing M7's four-category model (Present/Absent/Late/Excused) as-is
(no M7 rework; that model is already shipped, tested, and reviewed, and
remains useful for the school's own record-keeping beyond what SF2's
three-code convention captures). The UI/exported view must say plainly,
on-screen, that it is DepEd-SF2-_inspired_ (monthly grid, per-learner
totals, school-day columns) but not a submission-ready reproduction of
the official per-section form, and must name the two concrete gaps
(section/grade-level grouping; different per-day coding) rather than
imply parity. A future milestone that adds `Section`/`GradeLevel` would
be the real prerequisite for an exact SF2 export.

## Success criteria

- A teacher can generate a school-wide monthly attendance overview
  (DepEd-SF2-_inspired_, not a section-level SF2 replica — see Update 2
  above) for a selected month, reachable from the app, with the two gaps
  (no section grouping; different per-day coding than DepEd's own)
  stated plainly on screen.
- Report content is verifiably derived only from that school's own
  `attendance_records`/`learners` (school-scoped, no cross-tenant leak).
- `cargo test`, `cargo clippy -D warnings`, `npm run quality`, `npm run
build`, `npm run check:architecture` all clean.
- Independent review attempted per the one-retry rule; self-review as
  fallback, honestly disclosed if the harness issue recurs.
