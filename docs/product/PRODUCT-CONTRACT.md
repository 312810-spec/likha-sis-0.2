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

## 4. Curriculum / Key Stage versioning — BUILT (foundation), narrower than the full cohort model

**Built** (2026-08-25, see `docs/adr/0037-curriculum-key-stage-versioning.md`):
`key_stages` (KS1-KS4 grade bands, global reference data, curriculum-
independent) and `curriculum_versions` ("K to 12 Basic Education
Curriculum," default; "MATATAG Curriculum") exist as versioned reference
data, and `class_records.curriculum_version_id` pins which version
applies per record — mirroring `grading_weight_policies`/
`class_records.weight_policy_id`'s already-proven "named, versioned,
explicitly pinned per record" shape exactly. `school_year` is never
treated as the curriculum itself.

**Not yet built, narrower scope than this section originally described**:
the full "school year + grade + curriculum version + **cohort** +
implementation status + applicable subjects + applicable form/template"
model. This foundation proves the versioning/pinning/historical-stability
mechanism; it does not yet model per-cohort rollout tracking, does not
join `curriculum_learning_areas` to a school's actual `subjects`, and
does not auto-select a curriculum version by grade level (blocked on
`sections.grade_level` still being unconstrained free text — building
grade-level-based auto-resolution now would require exactly the
"infer from label" shortcut this project avoids). Key Stage 1 descriptive
grading and the Grade 12 DO 8, s. 2015 carryover remain **blocked on
missing primary sources**, unchanged from before this milestone — do not
re-attempt from a web search alone.

## 5. School Forms — relationships and per-form status

General architecture: forms are outputs/workflows over trusted
operational data, not separate databases — Operational data →
validation/readiness → normalized form payload → authoritative template
adapter → official output. **BUILT (partial)**: a reusable, disclosed
CSV export engine already exists and is proven three times over
(`src-tauri/src/export/csv.rs` + the `FieldDisclosure`/`OmittedField`
pattern in `export/mod.rs`, shared by `sf2.rs`, `report_card.rs`, and
`learner_roster.rs` — ADR-0009/M10). **DIRECTION SET, not built, plan
revised**: the authoritative-_template_ half does not exist for any form
yet — every export today is a disclosed, non-authoritative CSV. The
previously-assumed "Tauri → scoped sidecar → Apache POI/HSSF → `.xls`"
plan is **superseded by research** (`docs/adr/0044-pre-wave-research-waves-3-4-5-7.md`):
recommend pure-Rust `umya-spreadsheet` (reads/writes `.xlsx`, preserves
an existing template's formatting) instead — no JVM sidecar, no
unproven cross-language integration, better fit for LIKHA's
maintainability/offline-reliability priorities. SF9/SF10/SF7 structural
findings (three-term columns, personal-info/academic-progress split,
personnel-assignment sections) and the still-open "obtain an
authoritative template file" gate are recorded in ADR-0044 — ready for
Wave 3 to act on directly, not yet acted on.
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

## 6. Teacher Load + Class Schedule — BUILT (foundation), narrower than the full chain

**Built** (2026-08-25, see
`docs/adr/0039-teacher-load-class-schedule-foundation.md`):
`teaching_assignments` (who teaches what, school-year-long) and
`schedule_meetings` (when/where, local wall-clock time, with teacher/
section/room conflict detection) exist as real, tested tables and
repository functions; `TeacherLoad` (assignment count, distinct-subject/
preparation count, weekly instructional minutes — confirmed via RA 4670/
DepEd Order No. 005, s. 2024 to be the right kind of metric) is derived,
never stored. Authorization: `Capability::ManageTeachingAssignments`
(School Head only) plus a self-or-School-Head view rule. No UI.

**Not yet built**: the full chain below (personnel/qualifications/
position/designation, advisory/ancillary duties — deliberately excluded,
DepEd itself classifies advisory as non-instructional — availability/
constraints, a schedule generator, SF7 export, "My Day" integration).
`class_records` was deliberately not linked to `teaching_assignments`
this milestone (different lifecycles — see the ADR); a future milestone
may derive one from the other without a schema change.

Nothing existed before this milestone (`class_records` only linked one
section+subject+grading-period; no schedule, load, or assignment
concept, and no teacher/owner column on `class_records` at all).
**Decision**: Teacher Load is a foundational school-organization record,
not merely an SF7 field. Chain: school structure + grade levels +
sections + curriculum + subjects + time allotments + personnel +
qualifications + position/designation + advisory + ancillary duties +
availability/constraints → Teacher Load → Class Schedule → SF7 → teacher
access → "My Day" (§9).

Personnel/position research ready (ADR-0044): position ladder Teacher
I-VII → Master Teacher I-V/VI, RA 4670 primary-source-confirmed 6hr/day
classroom-teaching cap (125% pay for excess up to 8hrs), a candidate
"1hr credit per Master Teacher coaching/mentoring hour" figure found but
**not yet primary-source-verified** — do not hardcode without confirming
against DepEd Order 005 s.2024's own text first. SF7's actual
structure (three sections, per-person fields) is recorded in ADR-0044,
ready to inform the personnel/designation schema.

Automation goal for a schedule generator (**HYPOTHESIS** — a real
constraint-solver is a substantial build, not assumed as this
reconciliation's next step; ADR-0044 narrows _how_: build on the
MIT-licensed, actively-maintained `highs`/`good_lp` Rust crates
directly — an existing candidate repo, `school-scheduling-rs`, was
**rejected** for a real license conflict and prototype status, not
adopted): cover every required subject/section,
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

## 11. Teacher Tools & Teacher Creation Studio — READY SPEC (2026-08-29), nothing built yet

**Research/classification complete, full catalog and integration
architecture complete** — full records:
`docs/adr/0042-ilawcraft-research-and-classification.md` (ilawcraft
classification) and `docs/adr/0043-teacher-tools-catalog-and-integration-architecture.md`
(the full tool catalog, evidence tiers, architecture-impact tiers, and
build order — a ready-to-execute Wave 6 spec, deliberately produced
ahead of Wave 6 itself so no further research blocks it once Waves 1-5
complete). Nothing in this area has been implemented; this section
stays the concise durable-facts summary — read ADR-0043 for the full
per-tool detail.

**ilawcraft (`alotski15-png/ilaw-app-2`) classification — split by
asset, not one label**: the DepEd Annex E-1 COT (Classroom Observation
Tool) 21-indicator rubric it encodes is **ADOPT** as seeded reference
data (the single most reusable asset — pure DepEd reference data,
independent of ilawcraft's own code); its AI-generation architecture
(ILAW-format-aware prompt, schema-validated output, PPTX generation
already cleanly separated into its own step consuming the lesson plan's
stored data) is **REFERENCE** — a sound design blueprint, not portable
code (different stack: Next.js/JS vs. LIKHA's Rust/Tauri); its GCash
payment/token-monetization layer is **REJECT**, excluded entirely
(conflicts with LIKHA's zero-billing-by-default rule). Overall: **PILOT**
— build one representative Lesson Plan → Slide Deck generator adapter
natively in LIKHA's architecture (not by embedding or reusing
ilawcraft's own running app), per Wave 6's original scope.

**A genuine differentiator confirmed**: no competitor product researched
this session (AnongKlase, Ecrah, DCOFF 2.0, the free ilawlessonplan.com/
.net generators) ties lesson planning to DepEd's official COT/RPMS
teacher-appraisal indicators the way ilawcraft does — this is worth
building around, not just a nice-to-have.

**A genuine human-approval gate, not an autonomous decision**: whether
AI-generation calls are funded BYOK (teacher supplies their own Gemini
key — zero LIKHA billing, matching ilawcraft's own model) or LIKHA-hosted
(a real financial commitment) is an irreducible product-policy choice
(`.claude/rules/autonomous-development.md` gate #3) — must be decided by
the user before any adapter code is written when Wave 6 begins. BYOK is
the lower-risk default to propose.

**Wave 6 internal ordering refined** (no wave reordering — Wave 6 stays
Wave 6, per ADR-0042's reasoning): split into **6a — item analysis +
low-risk classroom utilities** (no paid API, reuses existing
`learner_scores`/sections/learners data, no new architecture; item
analysis first — ties to DepEd's live ARAL remediation policy, DepEd
Order 18 s.2025) and **6b — Teacher Creation Studio** (the AI generator
adapter, gated on the BYOK-vs-LIKHA-funded decision above).

**Full catalog (ADR-0043), summarized by tier**: Tier A — Item Analysis,
Phil-IRI reading-level digitization (strongest evidence, cheapest
architecture). Tier B — LAC session minutes/attendance, an RPMS/IPCRF
**evidence tracker** (explicitly not a replacement for DepEd's own
official `eipcrf.deped.gov.ph` submission — an input aid reusing the
already-adopted COT rubric), Learner Support/Intervention Tracker. Tier
C — low-risk classroom utilities (seating plan, random picker/group
generator, timer, certificate generator, quick formative check): must
reuse existing learner/class data, never create parallel datasets;
validated by generic/international edtech patterns, weaker
Filipino-teacher-specific evidence than Tier A/B. Tier D — the AI
generation studio itself (lesson plan, slide deck, worksheet, quiz+TOS,
rubric), Wave 6b, gated as above. **Tier E — explicitly blocked/
deprioritized, not silently dropped**: a SPED/IEP tool is **blocked**
(Republic Act 11650 requires one, but DepEd's own detailed IEP framework
remains unissued — do not guess a format); GAD Plan/DRRM Sitrep
generators are **deprioritized** (official DepEd tooling already exists
for both, role-specific rather than universal-teacher need); a
sub/relief-teacher plan generator was **dropped** (no evidence of real
demand found). No learner PII should ever be required by a generation
tool.

**Recommended build order within Wave 6** (full reasoning in ADR-0043):
6a-i Item Analysis → 6a-ii Phil-IRI → 6a-iii low-risk utilities batch →
6a-iv LAC + Portfolio/Evidence tracker → 6a-v Intervention Tracker →
6b Teacher Creation Studio (gated).

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
  target, rather than treating this hypothesis as pre-approved. **Pricing
  reconfirmed current and still zero-billing-viable** (ADR-0044, 2026
  figures): Durable Objects' SQLite storage is free on the Workers Free
  plan; D1's free tier is 5M reads/100K writes per day, 5GB storage. **No
  drop-in sync engine fits this design** — PowerSync/ElectricSQL are
  Postgres-backend-centric, and the one CRDT-based SQLite-native engine
  found syncs only to Supabase/PostgreSQL/SQLite Cloud, and Supabase is
  already excluded by this project's own prior decision; a bespoke
  protocol on Cloudflare primitives is genuinely needed. Two unscored
  candidate approaches recorded for the real 10-scenario pass to weigh:
  full CRDT-based merge, or an operation-log/per-field last-write-wins
  model with logical timestamps (explicit risk: naive whole-record LWW
  silently discards data — any LWW design needs deliberate field-level
  scoping). Cloud is
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

## 17. Windows distribution / code signing — RESEARCHED (2026-08-29), gate identified

**HYPOTHESIS, not built.** Full record:
`docs/adr/0044-pre-wave-research-waves-3-4-5-7.md`. Trustworthy Windows
distribution needs a Code Signing certificate (Digicert/Sectigo/
GoDaddy) or Windows SmartScreen shows "Unknown Publisher" — a real
teacher-trust risk. **This is a genuine paid-infrastructure item**, same
approval-gate class as the Wave 6b AI-funding decision. **A real
zero-cost alternative exists**: the SignPath Foundation signs
qualifying open-source projects for free — LIKHA-SIS is already public
(ADR-0041) but **has no `LICENSE` file today**, so does not yet
qualify. Adding an OSI-approved license is cheap and reversible, but
choosing to genuinely open-source LIKHA is itself a product-policy
decision for the user, not to be made autonomously. Mechanically
straightforward otherwise (NSIS/WiX+MSI, `publisher` field in
`tauri.conf.json`, an official Tauri GitHub Action for CI signing) and
compatible with the existing CI foundation (ADR-0041). Decide at Wave
7's start: license-for-free-signing vs. budget for a paid certificate.
