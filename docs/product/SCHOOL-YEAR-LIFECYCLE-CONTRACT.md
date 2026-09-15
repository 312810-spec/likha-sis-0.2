# LIKHA-SIS 0.2 — School-Year Lifecycle Contract

Status: approved direction for 1.0 implementation

Date: 2026-09-15

Owner decision: I1 — school-year rollover is required for 1.0.

## Why this exists

LIKHA must remain trustworthy when a school moves from one school year to the next. Existing records already carry school-year context through sections and grading periods, but there is no explicit lifecycle contract for preparing, activating, closing, archiving, and rolling forward a school year.

Rollover is not “copy last year.” It is a controlled process that preserves history, carries forward only appropriate school structure, and requires deliberate review for changing assignments, rosters, schedules, policies, and curriculum context.

## Lifecycle states

The product-level states are:

1. **Preparing** — next school year may be configured without affecting current ordinary work.
2. **Active** — default working school year for normal operations.
3. **Closing** — end-of-year review/finalization period; ordinary records remain readable and controlled finalization actions are allowed.
4. **Closed** — historical year; normal academic mutations are blocked except explicitly authorized correction workflows with audit trail.
5. **Archived** — optional operational state for compact/default-hidden historical data after retention/export rules are satisfied. Archive never means deletion.

A school has at most one ordinary **Active** school year at a time. Preparing the next year is allowed while the current year remains Active/Closing.

## What rollover may carry forward

### Carry forward as reference/configuration

- school identity and non-semantic branding;
- active user accounts, subject to provisioning/revocation review;
- stable subject definitions where still applicable;
- reusable school configuration;
- schedule templates/import mappings where useful;
- authorized form/template packs that remain applicable;
- curriculum/policy reference data, versioned rather than copied as editable facts.

### Create new records for the new school year

- sections;
- section memberships/enrollments;
- section advisory assignments;
- teaching assignments;
- schedule meetings;
- grading periods/date ranges;
- class records;
- school-year-specific form/workflow states.

### Never copy as if current

- attendance records;
- subject attendance sessions/entries;
- assessment items unless explicitly duplicated by the teacher as a new-year template;
- learner scores;
- computed grades/finalized grade states;
- historical conflicts/outbox delivery state;
- learner movement history as new movement;
- issued official forms as new-year documents;
- audit logs;
- old adviser/teacher assignment spans.

## Learner rollover

Learner identity persists across years; enrollment/section membership does not.

Rollover creates or imports the learner’s new-year enrollment/section membership while retaining prior-year history. Promotion, retention, transfer-out, transfer-in, and uncertain placement are explicit outcomes. LIKHA must never infer promotion solely from a new grade-level label.

A learner may legitimately have no new-year section yet during Preparing.

## Teacher/adviser rollover

Teaching assignments and section advisories are new-year decisions, not permanent properties of a user.

LIKHA may offer last year as a starting comparison, but it must not silently assign a teacher or adviser for the new year. Reassignment requires authorized confirmation.

## Schedule rollover

For H1, LIKHA may clone/import a prior schedule as a **draft** only. Every cloned meeting belongs to a newly confirmed teaching assignment and is checked for teacher/section/time conflicts before activation.

For H2 next school year, a future schedule generator must output into the same schedule-meeting contract so Today/Class Workspace do not need redesign.

## Grading-period rollover

Grading periods are created for the new school year from an applicable versioned policy, with school-entered dates. Dates are never assumed from the previous year.

Current-term resolution only operates within the Active school year by default. Historical years remain explicitly accessible.

## Closing contract

Before moving Active → Closing, LIKHA produces a deterministic checklist including, where applicable:

- unresolved attendance gaps;
- incomplete class records;
- unfinalized grades;
- unresolved sync conflicts that affect closing data;
- learners without an end-of-year enrollment outcome where required;
- required adviser/school forms not ready or generated;
- unresolved controlled corrections;
- backup/export readiness.

The checklist is evidence, not an automatic school decision. Authorized users resolve or explicitly acknowledge allowed exceptions.

## Closed-year mutation rule

Once Closed:

- ordinary teacher entry for that year is disabled;
- historical data remains readable to authorized users;
- correction requires an explicit correction workflow/capability;
- the correction records actor, reason, timestamp, original value/provenance as appropriate, and synchronization metadata;
- official outputs regenerated after correction disclose or preserve revision/provenance semantics where applicable.

UI hiding is not sufficient; trusted commands/repositories must enforce closed-year rules.

## Offline behavior during rollover

Rollover is an administrative operation and is not required to be fully executable offline in 1.0. However:

- an already-downloaded Active year remains fully usable for ordinary authorized classroom work during internet loss;
- preparing/activating/closing a year must not corrupt or invalidate the existing local working year;
- a device that has not received the new Active-year authorization/scope must not invent or assume it;
- stale devices returning after a year transition require a safe synchronization/re-authorization path before receiving new-year scoped data.

## Recovery and rollback

Preparing is reversible. Activation is auditable. Closing/Closed transitions require explicit confirmation and backup/readiness evidence.

If activation fails part-way, LIKHA must recover to one clearly defined active-year state; it must never leave two ordinary Active years or a half-created set of assignments presented as authoritative.

Implementation should prefer transactionally staged local changes and idempotent cloud operations.

## Minimal schema direction

Do not immediately add a large `school_years` subsystem merely because this contract exists. First evaluate whether an explicit lifecycle table is the smallest correct mechanism.

If introduced, a school-year lifecycle record should minimally identify:

- school;
- canonical school-year label/identifier;
- lifecycle status;
- activated/closed timestamps and actor provenance where applicable;
- policy/config references that genuinely belong to the year.

It must not duplicate fields already owned by sections, grading periods, or curriculum/versioned policy records.

## Acceptance scenarios

Before 1.0, synthetic-data tests must demonstrate:

1. prepare next year while current year remains usable;
2. promote/retain/transfer/no-placement learner outcomes without destroying history;
3. create new sections without mutating old sections;
4. teacher/adviser changes between years;
5. draft schedule reuse with conflict validation;
6. grading periods with new dates;
7. closing blocked/warned by deterministic incomplete-work checks as designed;
8. closed-year ordinary writes rejected below UI;
9. authorized historical correction audited;
10. stale/offline device safely returns after year transition;
11. backup/restore preserves both years;
12. forms for prior year still resolve against the correct historical records/template versions.

## UI implication

Normal teachers should not think in lifecycle machinery. They see:

- the current school year visibly in context;
- a clear historical-year switch when needed;
- a calm notice when a year is Closing/Closed;
- no accidental data-entry path into the wrong year.

School Head/authorized setup workflows receive the detailed preparation/rollover controls.
