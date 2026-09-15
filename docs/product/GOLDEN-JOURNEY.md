# LIKHA-SIS 0.2 — Golden Journey

Date: 2026-09-15
Status: Reference implementation contract
Data policy: synthetic learner and school data only until production-PII gates pass

## Purpose

This is the first end-to-end product journey for the Legacy Soul recalibration. It is intentionally broader than one screen and narrower than the whole SIS.

Its job is to prove that LIKHA behaves like one coherent teacher workspace across navigation, domain rules, local persistence, offline work, security, accessibility, recovery, and the three comfort modes.

Do not mass-redesign unrelated screens until this journey is credible.

## Reference scenario

Synthetic scenario:

- Teacher is assigned to Filipino 8 — Joy.
- Teacher has an advisory assignment for another explicitly defined section or for Grade 8 — Joy only when the synthetic fixture says so. Teaching assignment must not imply advisory assignment.
- School year uses the current three-term model.
- Schedule source is simple manual/imported data for SY 2026–2027.
- Device may temporarily lose all internet connectivity.

Core path:

> Sign in → Today → Filipino 8 Joy → Attendance → Learner → Class Record → Grade State → work offline → reconnect → My Advisory → relevant record/form → close LIKHA → return later and continue correctly.

## Journey stage 1 — Sign in and trusted local scope

Teacher outcome: enter LIKHA and immediately understand which school/work context is active.

Required behavior:

- no public self-registration;
- account is school-provisioned;
- session resolves trusted school identity below the UI;
- local device receives only authorized scope;
- personal-device use follows the BYOD/local-data policy;
- no real learner PII is used in development or screenshots;
- session/offline state is explained without exposing implementation jargon.

Failure/recovery cases:

- first sign-in with internet unavailable;
- returning authorized user with previously provisioned local access and no internet;
- revoked account;
- device deauthorized;
- encrypted database unavailable/corrupt;
- clock/date is wrong enough to affect session or sync assumptions.

## Journey stage 2 — Today

Teacher outcome: know what to do now, what comes next, and what requires attention without browsing modules.

Today should prioritize:

- Now
- Next
- Needs Attention
- Continue Where You Stopped
- save/offline/sync confidence

Rules:

- Now/Next comes from the simple schedule contract;
- Needs Attention starts deterministic and explainable;
- no dashboard-card farm;
- current school year and term context are visible;
- global term is a convenience default, not a hidden filter that makes historical work disappear;
- no repeated class/term selector when context is already known.

## Journey stage 3 — Enter a Class Workspace

Teacher outcome: select Filipino 8 — Joy once and remain inside that teaching context.

Class Workspace target context:

- Grade 8 — Joy
- Filipino
- active school year
- active term
- teacher assignment identity

Likely workspace areas:

- Overview
- Attendance
- Learners
- Class Record
- Assessments
- Grades
- Notes/interventions when in approved scope
- relevant records/forms
- history

Rules:

- class context persists while moving between related work;
- inherited context is visible and correctable;
- no hidden change from teaching-class context to advisory context;
- keyboard-first navigation is available on Windows;
- Android uses a purpose-built mobile interpretation rather than shrinking the desktop layout.

## Journey stage 4 — Attendance

Teacher outcome: finish attendance quickly, confidently, and offline if necessary.

Required behavior:

- class roster comes from trusted enrollment/assignment data;
- ordinary attendance entry saves locally immediately;
- fast bulk/default path for the normal case;
- obvious exceptions without modal overload;
- undo/correction path exists;
- local save state is visible;
- subject-attendance behavior stays distinct from any official adviser/SF2 responsibility when those concepts differ;
- teacher cannot mutate attendance for an unauthorized class merely by manipulating UI state.

Verification scenarios:

- all present;
- several absences/lates/excused states as supported by the domain;
- accidental tap/keyboard entry corrected;
- network disappears before save;
- app closes immediately after local save;
- app restarts offline and preserves accepted local work.

## Journey stage 5 — Learner context

Teacher outcome: move from the class to one learner without losing class context.

Required behavior:

- learner information shown is limited to the teacher's authorized purpose/scope;
- teaching context remains clear;
- historical/current enrollment state is not silently mixed;
- sensitive data is not exposed merely because it exists locally;
- return path to the exact class task is obvious.

## Journey stage 6 — Class Record and assessment

Teacher outcome: enter or review scores with desktop productivity on Windows and an intentionally narrower mobile workflow on Android.

Windows expectations:

- spreadsheet-like efficiency without imitating Excel blindly;
- keyboard traversal;
- paste/fast entry where safe;
- clear maximum scores and missing/not-applicable states;
- strong row/column context;
- no accidental loss when switching learner/assessment/class context.

Android expectations:

- quick score entry/review for practical mobile jobs;
- do not require full desktop matrix parity;
- preserve the same domain rules and authorization.

Rules:

- grading policy is domain-owned, not UI-owned;
- computed values are distinguishable from entered values;
- historical grading-policy/curriculum context is pinned and stable;
- corrections are auditable where required.

## Journey stage 7 — Grade state

Teacher outcome: understand whether the class/learner/term record is incomplete, ready, reviewed, finalized, or otherwise in an approved domain state.

Rules:

- use explicit, deterministic state rules;
- AI cannot determine official grade state;
- current-term context remains visible;
- finalization/locking requires the appropriate trusted authorization boundary;
- explain why a state cannot advance and what work remains.

## Journey stage 8 — Lose the internet

Teacher outcome: keep working normally for approved classroom jobs.

Minimum offline promise for already authorized local scope:

- open existing assigned classes;
- open locally available authorized learners;
- take attendance;
- enter/edit allowed scores;
- read class/advisory context;
- save immediately to local SQLite;
- close/reopen without data loss;
- see local-only/pending state in teacher language.

Do not fake online success. Actions that genuinely require a trusted server boundary must clearly explain that they are queued, unavailable, or require reconnection.

## Journey stage 9 — Reconnect and synchronize

Teacher outcome: reconnect without having to understand distributed systems.

Required states should map to teacher-friendly language such as:

- Saved on this device
- Waiting to sync
- Synced
- Needs review
- Cannot sync because access changed

Rules:

- push is idempotent;
- duplicate delivery does not duplicate records;
- cloud validates school/account/assignment/capability/schema/version;
- pull returns only authorized scope;
- revoked/reassigned users do not regain forbidden records through stale local UI state;
- conflicts are domain-specific;
- no generic last-write-wins for grades, learner profile, or other sensitive records.

Conflict UX must explain the actual school-work conflict, not just offer "mine" versus "theirs" with no context.

## Journey stage 10 — My Advisory / Adviser Room

Teacher outcome: move into advisory work only when an advisory assignment exists.

This workspace is not a duplicate of My Classes.

It should gather adviser jobs such as the approved subset of:

- advisory-section learners;
- adviser-level attendance responsibility;
- enrollment/movement context;
- progress/readiness;
- adviser-required records;
- official School Form workflows derived from trusted data.

Rules:

- advisory scope is assignment-based;
- zero-entry/zero-case states are valid where the underlying report allows zero;
- LIKHA should derive data already known instead of asking the adviser to encode it again.

## Journey stage 11 — Record / official form

Teacher outcome: reach the relevant official output from the work that produces it.

Rules:

- forms consume normal LIKHA records;
- forms do not create a parallel source of truth;
- authoritative template generation remains a separate adapter/path;
- template version/provenance is recorded;
- readiness validation explains missing data before generation;
- historical template/curriculum differences remain explicit;
- Windows is the primary official-form workstation for 1.0.

## Journey stage 12 — Close and resume later

Teacher outcome: return later and continue naturally.

Required behavior:

- accepted local writes survive restart;
- school/class/term context resumes safely when still authorized;
- Today can offer Continue Where You Stopped;
- stale context never overrides a changed assignment or revoked permission;
- migrations preserve authorized data;
- recovery flow exists when local state cannot be opened normally.

## Comfort-mode behavioral contract

All three modes use the same underlying domain state and authorized capabilities.

### Efficient

- densest useful information;
- strongest keyboard path;
- fewer explanatory surfaces;
- inline editing/bulk actions where safe.

### Comfortable — default

- balanced information density;
- visible context and guidance at decision points;
- clear grouping and recovery without excessive interruption.

### Guided

- larger text/targets;
- fewer simultaneous choices;
- stronger grouping;
- persistent contextual help;
- stronger confirmation for consequential actions;
- stepwise completion where it genuinely reduces error;
- better recovery explanations.

Guided is not a reduced-capability mode. Never infer a mode from age, role, device, tenure, or perceived ability.

## Windows acceptance

The Golden Journey is not accepted on Windows until:

- it feels like desktop productivity software;
- keyboard-only core path works;
- important tables remain usable at realistic school sizes;
- 200% text resize/reflow is usable;
- loading/empty/error/offline/conflict states exist;
- the teacher is not forced through mobile-style stacked dialogs for routine work;
- local save/restart persistence is verified;
- the journey works with network disabled for the promised offline stages.

## Android acceptance

The Golden Journey's Android interpretation is not accepted until:

- Today, class entry, attendance, quick learner lookup, allowed score entry/review, and offline state feel intentionally mobile;
- touch targets and text remain accessible;
- no desktop grid is merely shrunk to phone width;
- local/offline behavior matches the same underlying domain rules;
- unavailable desktop-only jobs are clearly handed off rather than misleadingly half-implemented.

## Security acceptance

Before any real learner PII:

- encryption at rest is proven on Windows and Android;
- keys use OS-backed secure storage;
- copied local database exposure is tested;
- logout/remove-account/deauthorize-device semantics are defined and tested;
- lost/stolen device scenario is tested;
- local cache scope is assignment/capability constrained;
- School A cannot access School B at trusted boundaries;
- search cannot bypass authorization;
- backup/restore does not create an unprotected PII copy.

## Recovery acceptance

Test at minimum:

- app closes after a local write;
- device restarts offline;
- database migration is re-run/idempotent;
- corrupted local DB or failed migration follows a controlled recovery path;
- user changes device;
- user is reassigned;
- user is revoked while offline and later reconnects;
- duplicated sync operation arrives;
- partial batch sync fails;
- stale offline mutation returns after newer trusted state exists.

## Premium experience gate

For each major Golden Journey screen ask:

1. Can a teacher identify the job within five seconds?
2. Is the primary next action obvious?
3. Are class/term/school states visible without clutter?
4. Are repeated selectors eliminated?
5. Is dark mode intentionally designed rather than color-inverted?
6. Are empty/loading/error/offline states polished?
7. Does the screen avoid giant cards, decorative motion, excessive gradients, and generic SaaS styling?
8. Does it feel finished at realistic information density?

## Teacher validation gate

Use 5–8 teachers with varied work patterns and digital comfort. Use synthetic data only.

Representative tasks:

- "You are about to teach Filipino 8 — Joy. Take attendance."
- "Enter today's assessment scores."
- "Find the learner whose attendance needs correction."
- "The internet disappears. Continue your work."
- "Reconnect and confirm your work is safe."
- "Open your advisory work and find what still needs attention."
- "Prepare the relevant record/form without re-encoding information LIKHA already has."

Measure task success, wrong turns, repeated questions, recovery success, time-on-task, and qualitative confidence. Owner approval remains required but is not the only evidence.

## Stop rule

If implementing this journey exposes a missing domain/security/offline primitive, stop propagation and fix the primitive first.

Do not hide architectural gaps behind mock UI.
