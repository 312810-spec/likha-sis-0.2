# LIKHA-SIS 0.2 — Legacy Soul Recalibration

Date: 2026-09-15
Status: Approved product direction; implementation not yet started

## Product thesis

LIKHA is not an SIS with teacher features. LIKHA is the teacher's operating workspace for school work, backed by a secure SIS.

North star:

> Legacy Soul. 0.2 Spine. Teacher's work, not software features.

The redesign must preserve the local-first, security, authorization, offline, repository, and DepEd-compliance foundations already built in 0.2 while rebuilding the experience around the teacher's actual job.

## Owner decisions — locked for this recalibration

- A1 — Official 1.0 targets a focused Minimum Lovable School Product, not an exhaustive SIS.
- B1 — Teacher is unequivocally the primary product user. Adviser work is an elevated teacher workspace. Administration remains powerful but separate.
- C1 — Android is a purpose-built mobile subset. Windows is the full productivity workstation.
- D1 — Ordinary classroom work has a strong offline guarantee.
- E1 — Personal Windows PCs and Android devices are permitted with restricted, encrypted, authorized local scope.
- F1 — Accounts are school-provisioned. No public self-registration.
- G1 — AI is optional assistance only and never a dependency for core operations, compliance, authorization, or offline work.
- H1 — For SY 2026–2027, LIKHA consumes a simple manually entered or imported schedule.
- H2 — A full scheduling system is planned for the next school year. H1 must expose a replaceable schedule contract so H2 can replace the source without redesigning teacher workflows.
- I1 — School-year rollover is required for official 1.0.
- J1 — Product validation uses a 5–8 teacher panel with varied workflows and digital comfort, using synthetic/non-PII data.
- K1 — Official 1.0 is operationally single-school while remaining architecturally future-capable for multi-school use.
- L1 — Strict feature admission applies. A feature enters 1.0 only when it materially supports a core teacher/school job, compliance, privacy, security, reliability, accessibility, recovery, or the approved Golden Journey.

## Seven product pillars

### 1. Product

- Product Contract
- Legacy Soul principles
- Minimum Lovable Release boundary
- strict feature admission

### 2. Experience

- Today Workspace
- Class Workspace
- My Advisory / Adviser Room
- Learner Workspace
- Records & Forms
- Management for authorized users
- Efficient / Comfortable / Guided behavioral contracts
- Windows desktop productivity patterns
- intentionally mobile Android patterns

### 3. Domain

Before large UI propagation, lock the school-life model around:

- school and school year;
- academic term;
- learner identity and enrollment history;
- section membership;
- teaching assignment;
- advisory assignment;
- subject / learning area;
- schedule meeting;
- attendance;
- assessment and learner score;
- class record and grade state;
- official-form output and provenance;
- capability / assignment-based authorization;
- school-year close and rollover.

Teaching Assignment and Advisory Assignment are separate concepts. A class a teacher teaches must never be silently treated as the section they advise.

### 4. Local platform

- Tauri 2 native Windows/Android shell;
- SQLite working database;
- tested migrations;
- restart persistence and transaction guarantees;
- encryption-at-rest before real learner PII;
- OS-backed key storage;
- least local data for authorized scope;
- explicit BYOD device-trust rules.

### 5. Reliability

- local write first;
- explicit Offline Contract;
- outbox and pull cursor behind `SyncProvider`;
- domain-specific conflict handling;
- revoked-user and reassignment handling;
- backup, restore, database recovery, reinstall, and device-loss scenarios.

### 6. Delivery

- Minimum Sufficient Harness;
- affected-work verification;
- independent security gates;
- small reversible changes;
- durable ADRs for material decisions;
- tests that prove behavior, not merely code presence.

### 7. Operations

- one clear Windows installation path;
- first-run school setup separated from teacher first run;
- school-provisioned account flow;
- signed update strategy;
- backup / restore;
- privacy-safe diagnostics and support bundle;
- pilot criteria;
- release criteria.

## Legacy Soul experience laws

1. Start with the teacher's job, not the module list.
2. Familiar before impressive.
3. Show the next useful thing.
4. One place naturally leads to the next related task.
5. Quiet confidence beats decoration.
6. Advanced power appears only when needed.
7. Do not ask twice for context LIKHA already knows; inherited context must remain visible and correctable.
8. Explain system state in teacher language: saved locally, waiting to sync, synchronized, needs review, locked, unavailable.
9. Official forms are generated outputs from trusted operational records, not parallel databases.
10. AI may assist but never decide authorization, compliance, grades, conflicts, or whether work is safely saved.

## Primary navigation target

For an ordinary teacher, keep primary destinations to roughly 5–7:

- Today
- My Classes
- My Advisory — only when assigned
- Learners
- Records & Forms
- School
- Management — only when authorized

Search is a power tool, not a replacement for understandable navigation. It must enforce the same authorization locally and remotely.

## Golden Journey strategy

Do not redesign ten isolated screens first. Build one complete end-to-end reference journey and use it to prove the product grammar.

Reference journey:

> Sign in → Today → Filipino 8 Joy → Attendance → Learner → Class Record → Grade State → work offline → reconnect → My Advisory → relevant record/form → close LIKHA → return later and continue correctly.

This journey is specified separately in `docs/product/GOLDEN-JOURNEY.md`.

## Current-school-year scheduling boundary

For SY 2026–2027:

- schedule data may be entered manually or imported;
- Today uses that data for Now / Next context;
- teachers must be able to correct visible schedule context through an authorized workflow;
- no constraint solver or full timetable generator is required for the current release.

For the next school year:

- replace or extend the schedule source with a proper scheduling system;
- preserve the teacher-facing schedule contract so Today, My Classes, and Android do not require a redesign.

## Offline Contract — required before implementation propagation

The Golden Journey must define exactly what remains possible with no network, including at minimum:

- opening already authorized classes and learners;
- taking attendance;
- entering/editing allowed scores;
- reading local class/advisory context;
- saving local work immediately;
- seeing whether data is local-only, pending, synchronized, conflicted, or blocked;
- reconnecting without losing accepted work.

Authorization, reassignment, device revocation, and stale offline writes require explicit domain rules; no generic last-write-wins policy is permitted for sensitive records.

## School-year lifecycle — 1.0 requirement

LIKHA must prove this lifecycle before official 1.0:

> school setup → create school year → enroll/import learners → create sections → assign teachers/advisers → daily work → term close → year close → final outputs → promotion/transfer/archive → next-school-year rollover.

Rollover is not a post-release cleanup feature.

## Feature admission rule

Before accepting a new feature, ask:

1. Can this task be eliminated entirely?
2. Can LIKHA generate it from data already entered?
3. Does it belong inside an existing class/advisory/learner/workflow context?
4. Can the teacher finish it without unnecessary navigation or repeated selectors?
5. Does it preserve offline operation where appropriate?
6. Does it preserve privacy, authorization, accessibility, and recovery?
7. Is it required for the approved 1.0 scope?

If several answers are no, the feature is deferred or redesigned.

## Progress reporting after recalibration

Do not use one code-weighted completion percentage as the primary truth. Report four separate health measures:

- Product Experience
- Engineering Foundation
- Production Safety
- Pilot Readiness

Overall completion may be shown secondarily, but must never hide a weak experience or safety pillar behind a large amount of completed code.

## Recalibration gate before broad redesign

Broad Legacy Soul propagation begins only after:

1. the provider-neutral harness branch is green and reviewed;
2. stale project-brain instructions and contradictory milestones are reconciled;
3. this product/domain direction is reflected in durable repository documentation;
4. the Golden Journey is specified with Windows, Android, offline, security, accessibility, recovery, and comfort-mode acceptance criteria;
5. the first implementation slice uses synthetic data only.

## Definition of success

The desired reaction is:

> This is definitely LIKHA — but it has grown up.

That means familiar school work, strong continuity with legacy LIKHA's usefulness, substantially better execution, clear offline confidence, secure local handling, calm premium presentation, and fewer decisions demanded from the teacher.
