# LIKHA-SIS 0.2 — Legacy Soul Domain Gap Audit

Status: authoritative planning input for the Legacy Soul recalibration

Date: 2026-09-15

Purpose: classify the current product/domain foundation against the approved Golden Journey before any broad UI rewrite. This is not a feature wish list. Each area is classified as **KEEP**, **MOVE**, **MERGE**, **REPLACE**, **RETIRE**, or **MISSING**.

## Executive finding

The repository is materially more complete than the older project brain suggests. The redesign must therefore preserve and reconnect existing domain work rather than rebuilding the SIS from scratch.

The strongest existing primitives already match the recalibrated product:

- school-scoped local data;
- sections scoped to school year;
- teaching assignments separated from schedules;
- advisory relationships separated from subject teaching;
- attendance and subject-attendance foundations;
- grading periods and class records;
- assessment items and learner scores;
- device/sync foundations;
- My Day read model;
- form/export foundations.

The biggest structural gaps for the Golden Journey are:

1. an explicit school-year lifecycle and rollover model;
2. a single teacher-facing class-workspace context spanning assignment, section, subject, term, attendance, class record, learners, and relevant forms;
3. an explicit Offline Contract and domain-specific recovery language;
4. resumable work state that can safely power “Continue where you stopped” without becoming hidden business state;
5. deterministic Needs Attention rules built from trusted domain state;
6. a formal current-school-year/current-term context source with visible override rather than repeated selectors;
7. explicit local-cache/device-scope rules derived from assignments/advisory/capabilities.

## Classification matrix

| Area                                         | Classification                   | Evidence / reason                                                                                                   | Golden Journey action                                                                                                          |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| School tenant boundary                       | KEEP                             | Existing school-scoped tables/repositories and trusted session scope already establish the right security boundary. | Preserve. No redesign may introduce client-supplied school scope.                                                              |
| Learner                                      | KEEP                             | Existing learner/enrollment foundation is already the correct core identity source.                                 | Reuse in class/advisory workspaces. Do not create duplicate “class learner” records.                                           |
| Section                                      | KEEP                             | `sections` already carry `school_year`, grade level, and name.                                                      | Use as the school-year grouping primitive. Avoid adding another parallel class-group entity unless a proven need appears.      |
| Section membership                           | KEEP                             | Historical span (`starts_on`, `ends_on`) preserves movement instead of overwriting it.                              | Reuse for roster-at-date and rollover decisions.                                                                               |
| Teaching assignment                          | KEEP                             | Correctly models who teaches what. School year is derived from section, avoiding duplicate year fields.             | Make this the subject-class context root for normal teacher work.                                                              |
| Schedule meeting                             | KEEP                             | Correctly separated from teaching assignment and already supports the H1 manual/import schedule direction.          | Consume in Today/Now/Next. Design the adapter so H2 scheduling can later replace the producer.                                 |
| Section advisory                             | KEEP                             | Correctly modeled as its own time-bounded relationship and deliberately not a fake subject.                         | Make this the root for My Advisory.                                                                                            |
| Subject attendance                           | KEEP                             | Already distinct from official adviser/SF2 attendance.                                                              | Surface inside Class Workspace; do not merge semantics with SF2.                                                               |
| Adviser attendance / SF2-inspired attendance | KEEP                             | Existing section-level attendance remains a separate adviser workflow.                                              | Surface in My Advisory, not subject Class Workspace.                                                                           |
| Grading policy / periods                     | KEEP                             | Three-term policy and historical policy support already exist.                                                      | Current term becomes a visible context default; history remains accessible.                                                    |
| Class record                                 | KEEP, MOVE                       | Domain primitive is correct; current navigation is feature-oriented.                                                | Move experience under the persistent Class Workspace context.                                                                  |
| Assessment item / learner score              | KEEP, MOVE                       | Correct domain data; teacher should not repeatedly rebuild class/term context to use it.                            | Reuse beneath Class Workspace.                                                                                                 |
| My Day aggregate                             | KEEP, REPLACE presentation       | Existing read model has schedule, pending attendance, and pending conflicts.                                        | Evolve into Today rather than inventing a new dashboard data store. Expand only with deterministic, explainable derived items. |
| Conflict review                              | KEEP, REPLACE presentation       | Conflict mechanics exist, but generic conflict UX is not the Legacy Soul target.                                    | Present domain-specific explanations/actions instead of generic sync jargon.                                                   |
| Sync/device credentials                      | KEEP                             | Existing foundation is valuable but not yet equivalent to end-to-end production sync.                               | Keep below repositories. Do not make Today/Class depend on network availability.                                               |
| Forms/exports                                | KEEP, MOVE                       | Existing outputs should remain derived from trusted records.                                                        | Surface relevant forms from Class/Advisory/Records contexts instead of a parallel re-entry workflow.                           |
| Global feature dashboard pattern             | RETIRE                           | Legacy Soul requires teacher-job navigation and connected workspaces, not card-farm navigation.                     | Replace with Today + persistent work contexts.                                                                                 |
| Repeated class/term selectors                | RETIRE                           | Violates Don’t Ask Twice and increases error/cognitive load.                                                        | Introduce visible inherited context with easy correction.                                                                      |
| Hidden global term constraint                | REPLACE                          | A silent global filter can conceal valid historical/other-term records.                                             | Use a visible current-term default and explicit context switch.                                                                |
| Full automatic timetable generator           | MISSING, DEFER                   | Owner selected H1 now and H2 next school year.                                                                      | Keep H1 schedule ingestion/manual editing now; design stable schedule contracts for H2.                                        |
| School-year lifecycle / rollover             | MISSING                          | No explicit rollover contract exists in current migrations or product state.                                        | Required for 1.0. Specify before broad redesign.                                                                               |
| Teacher work resume state                    | MISSING                          | Needed for “Continue where you stopped,” but must not become hidden domain truth.                                   | Add a local-only navigation/work-context preference after contract review.                                                     |
| Deterministic Needs Attention engine         | MISSING                          | Today has some derived pending items but no unified rule contract.                                                  | Add explainable rules from trusted domain state; AI may summarize later but never decide compliance.                           |
| Device-local authorized scope contract       | MISSING as explicit product rule | Security foundations exist, but E1 BYOD requires a formal minimum-scope cache policy.                               | Define before production learner PII.                                                                                          |
| School-year close state                      | MISSING                          | Current records use school-year strings but no explicit lifecycle gate for closing/archiving/rollover.              | Add lifecycle contract before schema changes.                                                                                  |

## Domain contract for the Golden Journey

The Golden Journey must use these relationships, not invent UI-owned copies:

```text
School
  └─ School Year context
      ├─ Section
      │   ├─ Section Memberships → Learners
      │   └─ Section Advisory → Adviser
      ├─ Teaching Assignment
      │   ├─ Teacher
      │   ├─ Section
      │   ├─ Subject
      │   └─ Schedule Meetings
      └─ Grading Periods

Teaching Assignment + Grading Period
  └─ Class Workspace context
      ├─ Subject Attendance
      ├─ Class Record
      │   ├─ Assessment Items
      │   └─ Learner Scores
      ├─ Learners (from section membership)
      └─ Relevant outputs/forms

Section Advisory + Grading Period
  └─ My Advisory context
      ├─ Adviser attendance / monthly summary
      ├─ Learner progress
      ├─ movement/enrollment history
      └─ adviser-relevant School Forms
```

A UI context object may compose identifiers from these records, but it must not become a second database or source of academic truth.

## Class Workspace context

For 1.0, the minimum stable context is:

- school ID: trusted from active session, never selected by ordinary UI;
- teaching assignment ID;
- section ID, derived/validated from the assignment;
- subject ID, derived/validated from the assignment;
- school year, derived from section;
- grading period ID selected within the same school year;
- current schedule occurrence when entering from Today, optional;
- teacher ID derived from authenticated actor/assignment authorization.

The UI may display friendly labels (Grade 8 – Joy / Filipino / Term 1), but commands continue to validate canonical IDs at the trusted boundary.

## My Advisory context

Minimum stable context:

- school ID from active session;
- active section-advisory ID;
- section ID;
- school year derived from section;
- current grading period default, visibly switchable;
- adviser actor authorization validated below UI.

Teaching assignments must never be used as a proxy for advisory authority.

## Current term rule

“Current term” is a convenience default, not a data-visibility rule.

1. LIKHA may calculate/select the current grading period from school-entered period dates.
2. Every surface that inherits the current term shows it visibly.
3. A teacher can switch to another authorized term without leaving the workspace.
4. Historical records are not hidden merely because they are outside the default term.
5. Mutations validate that the selected period belongs to the same school year as the active section/class record.

## Needs Attention rule

Every item shown under Needs Attention must have:

- deterministic rule ID;
- human-readable reason;
- underlying authorized record reference(s);
- suggested next action;
- dismissal semantics only when dismissal makes sense;
- no learner PII in telemetry/logging.

AI is not allowed to create a compliance obligation. AI may later summarize already-derived items.

## Keep / move / retire implementation rule

Before changing a current screen, document its capabilities in a small mapping:

- **KEEP** — behavior/data remains unchanged;
- **MOVE** — behavior remains but moves into a better workspace;
- **MERGE** — multiple UI paths become one workflow without merging distinct domain concepts;
- **REPLACE** — behavior contract preserved while interaction is redesigned;
- **RETIRE** — remove only after all useful capability is accounted for;
- **MISSING** — new work requiring tests and, when durable, an ADR.

No large screen rewrite is accepted if an existing capability disappears without one of these classifications.

## First implementation consequence

Do not begin by rebuilding attendance, grading, advisory, scheduling, or sync primitives. The first new domain work should be limited to contracts/projections that connect them:

1. school-year lifecycle/rollover specification;
2. class-workspace read context;
3. advisory-workspace read context;
4. deterministic Today/Needs Attention projection;
5. local resume-context preference;
6. explicit offline/local-scope behavior.

Any schema change must be justified by one of these missing contracts and must preserve existing migration history.
