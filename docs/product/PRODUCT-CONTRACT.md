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

## 3. Roles/permissions (RBAC) — BUILT (foundation), reconciled 2026-09-04

**Corrected from a stale "not yet implemented" status.** Built (Wave 1A,
`docs/adr/0036-rbac-foundation.md`): `user_school_memberships` carries a
`roles: string[]` array (a member with no role grant yet is a valid,
uniform-access state, matching §2's pre-RBAC model), and
`src-tauri/src/auth/mod.rs` gates mutating operations through a
capability-oriented `authorize_capability`/`authorize_capability_with_actor`
check, never a scattered `if role == "..."`. Capabilities defined today:
`ManageLearners` (Registrar, School Head), `ManageSchoolMembership`,
`ManageTeachingAssignments`, and `ManageSectionAdvisories` (all
School-Head-only).

**Starting role model, confirmed with the user** (M8-DECISION.md
follow-up, 2026-08-24): **Teacher, Registrar, School Head.**

- School Head: sees/manages all teachers' data within the school.
- Registrar: focused on official-form exports and learner records,
  separate from grading/attendance.
- Teacher: scoped to their own classes/sections, as today.

**Deliberately not built yet** (per ADR-0036's own scope): any
account/role-management UI (roles are assigned at the data layer only),
the full future LIKHA role universe (Adviser, LIS Coordinator, ICT
Coordinator, Master Teacher/Department Head), and a person holding more
than one functional assignment in a school at once — the schema already
supports it (`roles` is an array), but no UI or workflow exercises it.
Some finer authority boundaries between the three roles (e.g. can a
Registrar edit a grade?) remain undecided beyond the capabilities listed
above — extend from this foundation, not from a blank slate.

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
`learner_roster.rs` — ADR-0009/M10). **DIRECTION SET, not built**: the
authoritative-_template_ half — Tauri → scoped local sidecar → Java →
Apache POI/HSSF → an authoritative `.xls` template — does not exist for
any form yet; every export today is a disclosed, non-authoritative CSV.
Naming pattern in UI: `SF#: practical-use label` (e.g. "SF9: Report
Card") — the label explains use, never renames the official form.

| Form                                   | Status today                                                                                                                                                                                                                                                                                                                                                                            | Relationship                                                                                                                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SF1 Enrollment                         | **partially BUILT** — learner/enrollment core, conservative bulk import/reconciliation, transfer/end/enroll foundation, roster/export foundation, and read-only enrollment history exist. Authoritative-template SF1 output is not built.                                                                                                                                               | Remaining scope includes learner photo, a controlled correction path, authoritative-template output, and any still-evidence-gated SF1 fields. Never silently merge; adviser/authorized user compares candidates. Natural home remains combined with Wave 2 / the former UX-05 Learners scope.               |
| SF2 Attendance                         | **BUILT** (adviser-facing daily attendance + monthly summary, UX-03; explicitly disclosed as DepEd-SF2-_inspired_, not a section-level replica — see `docs/product/M8-DECISION.md`'s Update 2)                                                                                                                                                                                          | Feeds SF4; do not duplicate entry.                                                                                                                                                                                                                                                                          |
| SF3 Book/resource monitoring           | not built                                                                                                                                                                                                                                                                                                                                                                               | Lower priority.                                                                                                                                                                                                                                                                                             |
| SF4 School-level monthly consolidation | **partially BUILT** (`src-tauri/src/export/sf4.rs`, `docs/adr/0059-sf4-monthly-attendance-consolidation.md`) — disclosed CSV export, triggered from `MonthlySummaryScreen.tsx`; not an authoritative-template reproduction.                                                                                                                                                             | Default role: LIS Coordinator / authorized records function. Consumes SF2 + learner movement.                                                                                                                                                                                                               |
| SF5 Promotion & Learning Progress      | **partially BUILT** (`src-tauri/src/export/sf5.rs`, `docs/adr/0057-sf5-promotion-foundation.md`) — disclosed CSV export, triggered from `SectionRosterScreen.tsx`; not an authoritative-template reproduction.                                                                                                                                                                          | Adviser/EOSY workflow; surface seasonally near end of school year, not year-round.                                                                                                                                                                                                                          |
| SF6 School-level consolidation of SF5  | **partially BUILT** (`src-tauri/src/export/sf6.rs`, `docs/adr/0058-sf6-school-promotion-summary.md`) — disclosed CSV export, triggered from `SectionsScreen.tsx`; not an authoritative-template reproduction.                                                                                                                                                                           | Default role: LIS Coordinator, School Head oversight. Seasonal, same window as SF5.                                                                                                                                                                                                                         |
| SF7 Personnel & Teaching Assignment    | not built                                                                                                                                                                                                                                                                                                                                                                               | Collaborative: School Head, Admin Assistant/Registrar, ICT Coordinator. Teachers verify their own assignment/load and report discrepancies. Consumes Teacher Load (§6), not the other way around.                                                                                                           |
| SF8 Health & Nutrition                 | not built                                                                                                                                                                                                                                                                                                                                                                               | Keep the legacy conceptual split (learner/section-level data; Baseline/Pretest consolidation; Endline/Posttest consolidation) as a _starting point_, but revalidate formulas/templates before implementing — do not assume legacy figures remain authoritative. Tighter authorization needed (health data). |
| SF9 Report Card                        | **partially BUILT** — `report_card.rs`/UX-04 already export a CSV, explicitly disclosed as "DepEd-grade-computation-inspired," not an authoritative-template reproduction, and not gated per subject group. An authoritative-template, three-term-aware, duplex-printable SF9 is **not built**.                                                                                         | Must derive from finalized grades + attendance + learner identity; adviser reviews, doesn't re-encode; batch generation matters. Exact current template dimensions must come from an authoritative source, not a guess.                                                                                     |
| SF10 Permanent Record                  | **partially BUILT** (`src-tauri/src/export/sf10.rs`, `src-tauri/src/formgen/`, `docs/adr/0053-sf10-template-applicability-and-versioning.md`, `docs/adr/0063-sf10-permanent-record.md`) — disclosed CSV export, triggered from `LearnerListScreen.tsx`; authoritative-template output not built. Corrects a prior "zero references anywhere in the repo" claim, stale as of 2026-09-04. | Cumulative, strongly controlled, provenance-aware; needs historical records, transfer provenance, controlled corrections, issuance workflow, and a bulk importer that should reuse the same general import/reconciliation architecture as SF1 rather than a bespoke parser.                                 |

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
(School Head only) plus a self-or-School-Head view rule.
**Corrected 2026-09-04, was stale**: `TeacherLoadScreen.tsx` (179 lines,
wired in `App.tsx`) is now real, built UI over this foundation — not "no
UI."

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

## 12. Sync and remote access — SCHOOL-LAPTOP HUB SELECTED (ADR-0067)

One supervised, always-on laptop in the school computer lab is the
authoritative consolidation hub for one school's dataset. The ICT coordinator
is custodian. Teacher devices keep encrypted, scope-limited SQLite replicas;
local work and offline login never depend on hub availability.

Recommended reachability is direct LAN on campus plus optional Tailscale for
home synchronization, assuming CGNAT until the ISP proves otherwise. Next Best
is LAN-only: home changes remain safely queued until the teacher returns.
Tailscale is transport, not identity or authorization. LIKHA uses a separate,
revocable per-device sync credential and encrypted application payloads.

The hub validates and orders accepted changes; it does not silently win
conflicts. Divergent learner, enrollment, attendance, and grading edits enter a
review queue. Pulls are filtered to the authenticated teacher/device scope. The
synced allowlist excludes authentication, sessions, password hashes, local
audit material, and keys.

ADR-0065's offshore Cloudflare selection is superseded. It remains useful as
historical research but is not an implementation target. Remote Tailscale
traffic may transit an offshore encrypted relay, so LIKHA must not claim that
all data paths remain in the Philippines. Production learner use requires
documented school-head/DepEd-DPO approval plus the hardening, key-management,
backup/restore, and native verification gates in ADR-0067.

## 13. Local session / auth hardening — BUILT (current), HYPOTHESIS (extension)

Built today: Argon2id hashing, timing-safe unknown-user handling,
in-memory-only sessions, account lockout (ADR-0019), idle-timeout +
warning (ADR-0020/0026), global session expiry (ADR-0022), audit log
(ADR-0021), admin-assisted password reset (ADR-0057, Wave 3I) — a
School Head sets a new password directly for a colleague in their own
school, gated by the existing `Capability::ManageSchoolMembership`,
audited as a distinct attributable `password_reset_by_admin` event, and
clearing the target account's lockout as a deliberate side effect.
Deliberately **not** built: a self-service "forgot password" flow (no
out-of-band email/SMS channel exists in this offline, shared-computer
deployment model to make one safe) and a forced-password-change-at-
next-login flag (ADR-0057's recorded Next Best, explicitly deferred —
would need a new `users` schema flag and a new login-flow interception
point). An "offline-capable session with periodic re-authentication,
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

## 16.5 Subject Attendance and Official School Repository (added 2026-08-29)

Two new owner-supplied product specifications, recorded verbatim at
`docs/product/SUBJECT-ATTENDANCE-SPEC.md` and
`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`.

- **Subject Attendance** — **BUILT (foundation + UI)**, corrected
  2026-09-04 from a stale "no UI yet." A per-subject teacher
  attendance-monitoring tool, explicitly and permanently separate from
  SF2 (never shares storage, authorization, or workflow with it).
  Domain/repository/command layer shipped Wave 2V
  (`repository::subject_attendance`, `commands::subject_attendance`,
  migration 22); `SubjectAttendanceScreen.tsx` (549 lines, wired in
  `App.tsx`) is now real, built UI over that foundation. Full decision
  record: ADR-0055.
- **Official School Repository** — **DIRECTION SET, not started.** A
  school-owned document repository (memoranda, templates, approved
  forms, policies) surfaced through a school-owned Microsoft 365
  SharePoint library via OneDrive — never an individual employee's
  personal OneDrive. This is LIKHA's first proposed cloud-provider
  integration and carries real prerequisites before any implementation
  can begin: confirming the school has an organization-managed
  Microsoft 365 tenant, who can grant Graph/site consent, and a
  completed privacy review (see the spec's own "Privacy and safety
  gates" section) — these are external material/decisions only the
  school/owner can supply, not something this project can research or
  assume its way past. Do not begin implementation until that material
  is available; the spec's own "First implementation slice" describes a
  safe, Windows-only local-folder pilot as the first concrete step once
  it is.

## 16. Security gates — reconfirmed, unchanged

No real learner PII in development/fixtures/screenshots/demos/tests/AI
prompts, ever. Before any production PII: prove encryption at rest
(done, ADR-0003), Windows secure key storage (done), Android secure key
storage (not yet — Android not started), copied-DB resistance, backup
exposure behavior, logout behavior, device-loss behavior, authorization,
school isolation, recovery. Authorization must never rely on UI hiding
a control alone — already this project's standing rule
(`.claude/rules/security-privacy.md`), reconfirmed here, not new.

## 17. Unbuilt features from legacy LIKHA-SIS (recorded 2026-09-07)

Audited against `E:\TNHS LIKHA-SIS\tnhs-likha-sis` (Next.js/Supabase/Dexie predecessor)
per user direction. Note: Stakeholder/Parent Portal was explicitly excluded by user direction.

1. **Student Guidance & Anecdotal Records Log (DIRECTION SET / HYPOTHESIS)**:
   - Dedicated schema and UI for logging behavioral, academic, disciplinary, and socio-emotional observations.
   - SARDO / at-risk learner tracking and intervention notes.
   - Stricter access/authorization boundary needed (guidance/adviser-scoped).
2. **Awards & Recognition Engine (DIRECTION SET)**:
   - Deterministic awards evaluation engine (DO 015 criteria: General Average >= 90, no grade < 80, zero disciplinary anecdotes for the awarding term).
   - Printable certificate generator (aligned with Creation Studio sub-scope 2 unbuilt deliverables).
3. **Student Identification (ID) & Verification Engine (DIRECTION SET / HYPOTHESIS)**:
   - Front/back printable student ID card generator with photos and barcodes/QR tokens.
   - Tokenized QR verification mechanism for student enrollment status.
4. **Excel (`.xlsx`) Import & Multi-Year Scholastic Record Extraction (DIRECTION SET)**:
   - Spreadsheet parser (`.xlsx` SheetJS) to ingest official DepEd workbooks directly into learner enrollment and past academic records (beyond current CSV-only SF1 import).
5. **Multi-Tier Review & Approval Pipeline (DIRECTION SET / HYPOTHESIS)**:
   - Master Teacher (MT) review workflow: teacher grade submission -> MT compliance/out-of-bounds audit flags -> Approve/Reject with feedback notes -> administrative record locking.
   - Principal/School Head overview dashboard: composite grades, submission statuses, official form sign-offs.
6. **Formative Assessment Logging (DIRECTION SET / HYPOTHESIS)**:
   - Non-graded formative assessment logs (ESRU model) isolated from quarterly grade computations.
   - **Re-inspected 2026-09-07**: legacy's own schema (`formative_logs`:
     `student_id`, `subject_id`, `quarter`, `activity_name`,
     `esru_rating: 'E'|'S'|'R'|'U'`, `notes`) never spells out what E/S/R/U
     stand for anywhere in code or docs, and legacy never built any UI/logic
     against this table — it is an unused type definition only. This
     entry's own prior "Exploration, Structured practice, Reflection,
     Understanding" gloss is **unverified against any DepEd source** and
     should not be trusted as the real rubric — see the open question in
     `docs/CURRENT-HANDOFF.md`'s legacy-integration entry (2026-09-07)
     before implementing.

**Re-inspected 2026-09-07** (legacy codebase became accessible, prior audit
pass could not reach it): items 2 and 3's legacy "engines" are UI mockups
only — the certificate generator renders four hardcoded candidates with a
pre-assigned honor label (no GA-threshold computation), and the ID
generator is a 3-line placeholder route with no card/QR/token logic. Item
5's `reviewValidation.ts` does have real, portable validation logic worth
reusing as a design reference: three flag types (`MISSING_SCORES`,
`MISSING_PERFORMANCE_TASK`, `WEIGHT_MISMATCH`, the last cross-checking a
subject's configured weights against DO 015's expected weights for its
classification). None of items 1-6 conflict with any current 0.2 decision.
Full detail: `docs/product/2026-09-07-unbuilt-features-audit.md`'s
"Addendum" section.

## 18. UI Design System & Features from `E:\likha-sis-master` (recorded 2026-09-07)

Audited against `E:\likha-sis-master` per user direction. Note: `SF1 Fit Scaling` was explicitly excluded by user direction.

### A. UI Architecture, Layout Arrangement & Aesthetic Specification
1. **Persistent Two-Tier Layout Shell (`DashboardShell.jsx`)**:
   - **Sidebar**: Fixed width (`w-64` expanded, collapsible to `w-20` icon-only drawer with zero-dependency CSS tooltips). School brand background (`bg-primary`). Grouped navigation under uppercase Ledger Gold labels (`text-accent-light`, `text-[11px] font-semibold tracking-wider`). Leading edge accent indicator bar (`1px` accent border + `bg-white/15`) for active nav.
   - **Sticky Translucent Header**: `backdrop-blur-sm bg-white/90 dark:bg-gray-900/90 border-b border-gray-200 dark:border-gray-700`. Contains:
     - Left: Page title rendered in warm editorial serif (`font-display`). Breadcrumb identity line: "Welcome, [User] — LIKHA-SIS, [School Name]".
     - Right: Live Date/Time widget with tabular aligned numerals (`font-tabular`, IBM Plex Mono), 3-way sliding pill theme toggle (`Light`, `System`, `Dark`), Notification bell with unread badge counter and slide-out panel, and circular profile avatar with initials badge + account dropdown.
   - **Content Canvas**: `p-4 md:p-6` with no artificial max-width constraints so data tables and form sheets utilize full screen real-estate.
2. **"Ledger Pairing" Typography Engine**:
   - **Display Heading Font**: [Fraunces](https://fonts.google.com/specimen/Fraunces) serif reserved strictly for top-level `<h1>`/`<h2>` page titles (`font-display`).
   - **Interface & Body Font**: Public Sans (`font-normal` to `font-medium`, 14-16px) for form controls, buttons, table data, and badges.
   - **Tabular / Monospace Font**: [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) (`font-tabular`) for numeric clocks, dates, and column-aligned grades.
3. **Dynamic Brand Palette & Theme Engine (`colorTheory.js`, `extractTheme.js`)**:
   - **ColorThief Logo Palette Extractor**: Automatically reads uploaded school logos, eliminates near-black/near-white noise, and computes WCAG AA compliant palette candidates:
     - *Dominant*: Prominent brand colors.
     - *Vibrant*: Highest saturation accent ink.
     - *Alternate*: Re-ordered roles for versatile branding.
   - **Dual Light/Dark Derivation**: Computes companion dark-surface variables (`--dm-*`) and legible text ink (`buildTextOnRoles`) dynamically from light logo colors.
4. **Elevation & Card Depth System**:
   - Surfaces: Flat paper ground with 1px border (`border-gray-200 dark:border-gray-700`).
   - Interactive Card Lift: Soft ambient card shadow at rest (`shadow-card`), lifting on hover (`shadow-card-hover` paired with `-translate-y-0.5`).
   - Standard Radii: Uniform `8px` (`rounded-lg`) for inputs, buttons, and menus; `12px` (`rounded-xl`) for cards and containers; `rounded-full` for avatars and pill toggles.

### B. Functional Features from `likha-sis-master` (To Add to 0.2)
1. **Interactive Class Program & Timetable Generator (`ClassProgramGenerator.jsx`)**:
   - Visual drag-and-drop / click-to-arm section timetable builder.
   - Real-time teacher double-booking, room overlap, and subject minute conflict detection (`scheduleConflicts.js`).
   - One-click timetable auto-seeder wand (`scheduleSeeding.js`).
   - Dynamic derivation of Teacher's Load sheets on read from section timetables (`teacherLoadDerivation.js`).
2. **SF8 Health & Nutrition Engine (`NutritionStatus.jsx`, `NutritionConsolidator.jsx`)**:
   - WHO/DepEd BMI-for-Age and Height-for-Age exact decimal age calculators and lookup tables (`nutritionComputations.js`).
   - Full school-wide nutritional baseline (BOSY) and endline (EOSY) consolidation report (`nutritionConsolidation.js`).
3. **DO 006, s. 2026 Learner Rights & Protection (LRP) & SARDO/LARDO Tracker (`LardoTracking.jsx`)**:
   - 3-tier behavioral incident classification under DepEd child protection policy.
   - Multi-silo automated risk triggers (`autoFlagTriggers.js`): auto-flags learners when initial grade $< 70$, general average $< 75$, attendance $< 80\%$, or nutrition status is Wasted/Obese.
   - Append-only intervention history with automated remediation check (`lardoAutoResolve.js`).
4. **SMEA 3-Term Indicator & Discrepancy Rollup (`SMEAEnrollment.jsx`, `smeaIndicators.js`)**:
   - Consolidated 3-term monitoring of enrollment, promotion, dropout, and nutritional status.
   - Automated discrepancy detector catching unassigned learners or un-synced class records.
5. **School Calendar, Philippine Holidays & Hazard Alerts (`SchoolCalendar.jsx`, `weather.js`)**:
   - Offline database of Philippine regular, non-working, and Islamic holidays (`philippineHolidays.js`).
   - Hyper-local Open-Meteo weather integration using school coordinates; flags severe weather suspension warnings ($>30\text{ mm}$ rain, $>50\text{ kph}$ wind).
6. **PBKDF2 School Settings Secondary Security Key (`settingsLock.js`)**:
   - Secondary Web Crypto PBKDF2-SHA256 (150k iterations) PIN lock protecting critical school identity, curriculum tracks, and calendar structures against accidental edits or borrowed workstations.
7. **Comprehensive First-Run School Setup Wizard (`SetupWizard.jsx`)**:
   - Multi-step interactive setup wizard with DepEd hierarchy auto-fill (Division, Region, School ID from `depedHierarchy.js`), instant logo theme extraction, and key stage initialization.
8. **Transfers In/Out Documentation Registry (`TransfersLog.jsx`)**:
   - Formal tracking log for incoming and outgoing student transfers, originating/destination schools, and document statuses.
9. **Consolidated Grades Matrix (`ConsolidatedGrades.jsx`)**:
   - Cross-subject grade registry displaying all learning areas side-by-side per section across all terms.


