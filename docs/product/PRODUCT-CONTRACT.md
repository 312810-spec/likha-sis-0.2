# LIKHA-SIS 0.2 — Product Contract

Durable product-level decisions and relationships, captured 2026-08-25
during the post-UX-04 roadmap reconciliation. This is a **product map**,
not a transcript — it records what was decided and why, not the
conversation that produced it. Update it when a product decision
changes; do not append history here (use `docs/CURRENT-HANDOFF.md`/ADRs
for that).

Status marker on each item: **BUILT** (exists in the repo today),
**DIRECTION SET** (a real product decision now recorded, not yet
implemented), or **HYPOTHESIS** (a candidate the user proposed that
still needs its own scenario/research pass before being locked).

Product identity: **LIKHA-SIS 0.2** — never "2.0," never "LIKHA 2.0."
Legacy LIKHA may be inspected as reference material only.

## 1. Product summary

Native-first, local-first, cloud-synchronized, teacher-centered
Philippine DepEd School Information System. Targets: Windows `.exe`
(primary, full workstation), Android `.apk` (teacher-focused mobile),
Web/PWA (secondary — macOS/iOS/stakeholder access). Must keep working
offline; sync is separate from the working database (ADR-0001's
existing `SyncProvider` layering already models this — **BUILT** as an
architectural boundary, **not yet implemented**: no sync code exists in
the repo as of this reconciliation).

Priority order (unchanged, already in `CLAUDE.md`): privacy/security >
correctness > DepEd compliance > teacher usability > offline reliability

> maintainability > zero billing > performance > development speed.

Product promise: "Professional enough to be worth thousands of pesos.
Simple enough for every teacher to use." (Corrected currency —
LIKHA-SIS is a Philippine product; record pricing/value framing in
pesos, not dollars, in any future copy.)

## 2. School isolation — BUILT, direction reconfirmed

`schools` is the top-level tenant boundary; `user_school_memberships`
(migration 1) already joins users to schools with **no differentiated
role column** — every membership is currently uniform access.
`SessionManager::require_active_school_scope` is the trusted boundary
(ADR-0004) — school scope is never client-supplied. This already
matches the desired model (installation/account → school membership →
authenticated user → role/capabilities). A normal user must not get an
arbitrary school-picker dropdown; that constraint is already satisfied
today by construction (there is no school picker in the UI at all). A
future explicit "authorized organization switch" for legitimate
multi-school membership is **HYPOTHESIS** — not needed until a real
multi-school user is a confirmed requirement.

## 3. Roles/permissions (RBAC) — DIRECTION SET, not yet implemented

No role concept exists anywhere in the code today (`user_school_memberships`
has no role column; `auth`/`session.ts` have no role checks). This was a
deliberate, explicit deferral (`docs/product/M8-DECISION.md`, stop
condition #8: changing access expectations without a documented
requirement needs the user, not autonomous choice).

**Starting role model, already confirmed with the user** (M8-DECISION.md
follow-up, 2026-08-24): **Teacher, Registrar, School Head.**

- School Head: sees/manages all teachers' data within the school.
- Registrar: focused on official-form exports and learner records,
  separate from grading/attendance.
- Teacher: scoped to their own classes/sections, as today.

**Not yet decided**: the exact authority boundaries between these three
(e.g., can a Registrar edit a grade? can a School Head impersonate a
teacher's session?) — do not implement from assumption; this needs its
own short scoping pass when RBAC is actually built, using the confirmed
three-role starting point as the anchor, not a blank slate.

## 4. Curriculum / Key Stage versioning — DIRECTION SET, not yet implemented

No `curriculum_version`, `key_stage`, or cohort concept exists in the
schema; `sections.grade_level` is a plain string today. **Decision**:
shared architecture must not hard-code `grade == 11/12 → one SHS
curriculum`. Model curriculum as versioned and cohort-aware: school
year + grade + curriculum version + cohort + implementation status +
applicable grading policy + applicable subjects + applicable
form/template, so different SHS cohorts under the same three-term
calendar can carry different curricula simultaneously. This directly
generalizes the pattern this codebase already uses for grading policy
versioning (`grading_weight_policies`, ADR-0013/0015/0016) — apply the
same "named, versioned, explicitly pinned per record" shape, not a new
pattern. Do not invent specific current-year policy details without
authoritative research (`deped-researcher` + `deped-compliance` skill);
Key Stage 1 descriptive grading and the Grade 12 DO 8, s. 2015 carryover
remain **blocked on missing primary sources**, per
`docs/CURRENT-HANDOFF.md`'s existing note — do not re-attempt from a web
search alone.

## 5. School Forms — relationships and per-form status

General architecture: forms are outputs/workflows over trusted
operational data, not separate databases — Operational data →
validation/readiness → normalized form payload → authoritative template
adapter → official output. **BUILT (partial)**: a reusable, disclosed
CSV export engine already exists and is proven three times over
(`src-tauri/src/export/csv.rs` + the `FieldDisclosure`/`OmittedField`
pattern in `export/mod.rs`, shared by `sf2.rs`, `report_card.rs`, and
`learner_roster.rs` — ADR-0009/M10). **DIRECTION SET, not built**: the
authoritative-_template_ half — Tauri → scoped local sidecar → Java →
Apache POI/HSSF → an authoritative `.xls` template — does not exist for
any form yet; every export today is a disclosed, non-authoritative CSV.
Naming pattern in UI: `SF#: practical-use label` (e.g. "SF9: Report
Card") — the label explains use, never renames the official form.

| Form                                   | Status today                                                                                                                                                                                                                                                                                    | Relationship                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF1 Enrollment                         | **not built**                                                                                                                                                                                                                                                                                   | Bulk import, duplicate reconciliation (conservative: never silently merge; adviser/authorized user compares and chooses keep-existing / use-imported / field-by-field / confirmed-different, with provenance), learner photo, enrollment history, transfer foundation, ID-generator data foundation. Natural home: combined with the already-planned "UX-05 Learners" scope (see §12). |
| SF2 Attendance                         | **BUILT** (adviser-facing daily attendance + monthly summary, UX-03; explicitly disclosed as DepEd-SF2-_inspired_, not a section-level replica — see `docs/product/M8-DECISION.md`'s Update 2)                                                                                                  | Feeds SF4; do not duplicate entry.                                                                                                                                                                                                                                                                                                                                                     |
| SF3 Book/resource monitoring           | not built                                                                                                                                                                                                                                                                                       | Lower priority.                                                                                                                                                                                                                                                                                                                                                                        |
| SF4 School-level monthly consolidation | not built                                                                                                                                                                                                                                                                                       | Default role: LIS Coordinator / authorized records function. Consumes SF2 + learner movement.                                                                                                                                                                                                                                                                                          |
| SF5 Promotion & Learning Progress      | not built                                                                                                                                                                                                                                                                                       | Adviser/EOSY workflow; surface seasonally near end of school year, not year-round.                                                                                                                                                                                                                                                                                                     |
| SF6 School-level consolidation of SF5  | not built                                                                                                                                                                                                                                                                                       | Default role: LIS Coordinator, School Head oversight. Seasonal, same window as SF5.                                                                                                                                                                                                                                                                                                    |
| SF7 Personnel & Teaching Assignment    | not built                                                                                                                                                                                                                                                                                       | Collaborative: School Head, Admin Assistant/Registrar, ICT Coordinator. Teachers verify their own assignment/load and report discrepancies. Consumes Teacher Load (§6), not the other way around.                                                                                                                                                                                      |
| SF8 Health & Nutrition                 | not built                                                                                                                                                                                                                                                                                       | Keep the legacy conceptual split (learner/section-level data; Baseline/Pretest consolidation; Endline/Posttest consolidation) as a _starting point_, but revalidate formulas/templates before implementing — do not assume legacy figures remain authoritative. Tighter authorization needed (health data).                                                                            |
| SF9 Report Card                        | **partially BUILT** — `report_card.rs`/UX-04 already export a CSV, explicitly disclosed as "DepEd-grade-computation-inspired," not an authoritative-template reproduction, and not gated per subject group. An authoritative-template, three-term-aware, duplex-printable SF9 is **not built**. | Must derive from finalized grades + attendance + learner identity; adviser reviews, doesn't re-encode; batch generation matters. Exact current template dimensions must come from an authoritative source, not a guess.                                                                                                                                                                |
| SF10 Permanent Record                  | **not built at all** (confirmed: zero references anywhere in the repo)                                                                                                                                                                                                                          | Cumulative, strongly controlled, provenance-aware; needs historical records, transfer provenance, controlled corrections, issuance workflow, and a bulk importer that should reuse the same general import/reconciliation architecture as SF1 rather than a bespoke parser.                                                                                                            |

## 6. Teacher Load + Class Schedule — HYPOTHESIS / DIRECTION SET (not built)

Nothing exists today (`class_records` only links one section+subject+
grading-period; no schedule, load, or assignment-generation concept).
**Decision**: Teacher Load is a foundational school-organization record,
not merely an SF7 field. Chain: school structure + grade levels +
sections + curriculum + subjects + time allotments + personnel +
qualifications + position/designation + advisory + ancillary duties +
availability/constraints → Teacher Load → Class Schedule → SF7 → teacher
access → "My Day" (§9).

Automation goal for a schedule generator (**HYPOTHESIS** — a real
constraint-solver is a substantial build, not assumed as this
reconciliation's next step): cover every required subject/section,
preserve required weekly instructional time, avoid teacher/section
conflicts, respect availability/qualifications/position, preserve
protected leadership/mentoring time, balance load reasonably, minimize
unnecessary preparations. **Track both classroom teaching time and
distinct subject/grade preparation count** — do not balance on minutes
alone. Do not hard-code numeric policy thresholds (e.g. a Master
Teacher's reduced load) without an authoritative source or explicit
school configuration.

Relief/substitute assignment: LIKHA may _suggest_ candidate relieving
teachers (availability, subject/grade fit, load, fairness); an
authorized user must always confirm — never silent auto-assignment.
Temporary relief must never transfer permanent class-record ownership.

## 7. Class Record / MPS / SMEA — DATA FOUNDATION DIRECTION SET, OUTPUT DEFERRED

**Explicitly deferred**: SMEA presentation/output architecture — a
newer SMEA template may arrive later; do not build a generator against
an assumed format.

**Not deferred** — the data foundation: reuse trusted LIKHA data
(enrollment, attendance, movement, grades, failures,
interventions/LARDO, nutrition, Class Record performance, MPS) rather
than have teachers re-encode SMEA figures separately. Retain the MPS/
performance-analysis concepts from the bottom of the applicable
electronic Class Record: Assessment scores → Class Record → authoritative
calculations → WW/PT/assessment performance summaries → MPS → grade/
section/subject/school aggregation → SMEA data. Exact formulas must come
from the authoritative current E-Class Record/policy when this is
actually built — not invented now.

## 8. School branding — HYPOTHESIS, no code exists yet

`School` today has only `id`/`name`/`createdAt` — no logo/theme fields
(`src/domain/school.ts`, confirmed). Direction: each school can upload
a logo; LIKHA derives an accessibility-safe theme (primary/secondary/
accent/selected-state/restrained-surface colors) from it, deterministically
and stored locally so branding works offline. System semantic colors
(success/warning/error/critical) stay fixed regardless of branding — a
school's palette must never be allowed to compromise a status color's
meaning or contrast. This is additive to the existing design-token
system (ADR-0031, UX-01) — extend, don't replace.

## 9. Adaptive teacher UX — BUILT, principle reconfirmed

Efficient/Comfortable(default)/Guided already exist app-wide with full
functional parity (verified again this session for UX-04's new UI — no
mode gates any control, only explanatory text). Reconfirmed principle:
never infer mode from age/role/seniority/device. Windows should feel
like desktop productivity software; Android should be intentionally
mobile, not a shrunk desktop view (UX-03/UX-04 already established one
concrete "learner-ledger" mobile pattern reused twice now — see
`docs/adr/0033-...md` and `docs/adr/0034-...md`). Avoid dashboard-card
spam, excessive gradients/glassmorphism, oversized headings, decorative
animation, generic SaaS styling — already the working design language,
not a new instruction.

## 10. Daily Teacher Experience — HYPOTHESIS ("My Day")

Home screen should answer: what am I doing now / what do I need to
finish / is my work safely saved. A `TeacherWorkspaceScreen` already
exists (ADR-0024) showing sections/attendance status; a full "My Day"
using schedule + Class Record readiness + advisory + relief + deadlines
needs Teacher Load/Schedule (§6) first — sequenced accordingly.

## 11. Teacher Tools & Teacher Creation Studio — HYPOTHESIS, nothing built

Candidate low-risk classroom tools (seating plan, random picker, group
generator, quick class list, advisory checklist, parent contact log,
intervention tracker, certificate generator): must reuse existing
learner/class data, never create parallel datasets.

Teacher Creation Studio (lesson-plan → presentation/assessment/
answer-key/TOS generation, integrating the user's separate ILAWCraft
project): **research required before any implementation** — inspect the
ILAWCraft repository and classify it ADOPT/PILOT/REFERENCE/REJECT (the
`dependency-researcher` agent pattern already used for third-party
adoption decisions) before writing any adapter code. No learner PII
should ever be required by a generation tool. Nothing in this area has
been started.

## 12. Cloud / sync / web access — HYPOTHESIS, no ADR yet

**Repository-truth correction**: no cloud/sync ADR or code exists today
— `SyncProvider` is only the architecture-diagram placeholder in
ADR-0001's layering statement, never implemented. The "Cloudflare Worker

- one SQLite-backed Durable Object per school (next-best: Worker + one
  D1 database per school)" target stated in this reconciliation is
  recorded here as the **current working hypothesis**, not a ratified
  architecture decision — no prior ADR or scenario pass established it in
  this repository. **Before real sync implementation begins, run this
  project's own 10-scenario architecture-decision process** (per
  `.claude/rules/autonomous-development.md`) to actually decide the cloud
  target, rather than treating this hypothesis as pre-approved. Cloud is
  never the teacher's working database; SQLite remains primary. Web/PWA
  access (for iOS/macOS/stakeholders) must respect the same school/role
  authorization boundaries as native — no separate, weaker web auth path.

## 13. Local session / auth hardening — BUILT (current), HYPOTHESIS (extension)

Built today: Argon2id hashing, timing-safe unknown-user handling,
in-memory-only sessions, account lockout (ADR-0019), idle-timeout +
warning (ADR-0020/0026), global session expiry (ADR-0022), audit log
(ADR-0021). An "offline-capable session with periodic re-authentication,
roughly an 8-hour protection window" is a **product-requirement
candidate**, not a locked policy — any concrete numeric threshold needs
a security-focused decision pass (the `security-reviewer`/
`security-privacy` skill), not a default baked in from this
reconciliation alone.

## 14. What must NOT be overbuilt this Claude-capability window

Explicit non-goals for the remaining high-capability window (do not
silently reconsider without a new instruction): a final SMEA
presentation generator before a new template exists; every Kinder/
Elementary/JHS/SHS official form; dozens of minor Teacher Tools;
decorative UI polish ahead of the foundational work below; speculative
cloud features beyond proving the architecture; analytics without
trusted underlying data; generic AI features unrelated to teacher
workload; duplicated import engines; a bespoke implementation per School
Form (build one reusable Form Engine, prove it with representative
slices).

## 15. Definition of success for the remaining Claude-capability window

Not "every planned feature exists." Instead: architecture stable and
current in ADRs; premium design system stable; school identity/isolation
proven; RBAC proven (even if narrow); curriculum versioning established;
encrypted local storage/security gate already proven (ADR-0003) and not
regressed; one excellent representative learner vertical slice; the
attendance/Class Record UX pattern already excellent and reused, not
reinvented; an importer architecture proven once, not per-form; an
official Form Engine architecture proven once via a representative
form, not built form-by-form; a Teacher Load/Schedule architecture
proven via a representative slice; a sync protocol proven via one
real round trip, not a full feature set; cloud authorization/isolation
proven; Windows build/install path proven (already true today); an
Android critical-workflow architecture proven; a Teacher Creation Studio
integration pattern established (not fully built); durable docs/tests/
skills/agents sufficient that a lower-capability continuation session
can keep going without re-deriving architecture from chat history.

## 16. Security gates — reconfirmed, unchanged

No real learner PII in development/fixtures/screenshots/demos/tests/AI
prompts, ever. Before any production PII: prove encryption at rest
(done, ADR-0003), Windows secure key storage (done), Android secure key
storage (not yet — Android not started), copied-DB resistance, backup
exposure behavior, logout behavior, device-loss behavior, authorization,
school isolation, recovery. Authorization must never rely on UI hiding
a control alone — already this project's standing rule
(`.claude/rules/security-privacy.md`), reconfirmed here, not new.
