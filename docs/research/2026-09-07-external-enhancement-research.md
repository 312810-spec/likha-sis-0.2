# External Enhancement Research: DepEd National Systems, Competing SIS Products, Privacy Law, Local-First Patterns, Recent Policy

Status: COMPLETE (best-effort; several findings are secondary-source-only — see
per-section confidence notes and the summary table at the end).

Research date: 2026-09-07
Researcher: background research agent (no code changes made)
Scope: research only — external, outward-looking findings not derivable from
this project's own internal audits. Nothing here authorizes implementation;
it is meant to inform future roadmap/ADR decisions. Format follows
`docs/research/2026-09-07-matatag-ks1-do8-sources.md`.

---

## Top actionable findings (read this first)

1. **DepEd's national learner/school data systems (LIS + EBEIS) are real,
   actively-used, mandatory data pipelines that every DepEd-recognized
   school — public or private — must report into every school year**, keyed
   on the 12-digit Learner Reference Number (LRN). LIKHA-SIS does not need
   to integrate live with LIS/EBEIS (they are DepEd's own hosted web
   systems, not something a school's local SIS talks to via API), but it
   **should treat the LRN as a canonical learner identifier field** (if it
   doesn't already) and consider an export helper that shapes locally-held
   enrollment/profile data into whatever a school's registrar needs to
   manually re-key into LIS/EBEIS — because that manual re-entry is a real,
   recurring, high-friction teacher/registrar task DepEd itself imposes
   every "Beginning of School Year" and "End of School Year" cycle.
   Confidence: Medium-High (existence and mandatory nature of LIS/EBEIS is
   well-corroborated by many division-office memo pages; the "LIKHA should
   export a LIS/EBEIS-shaped file" recommendation is this researcher's
   inference, not a DepEd requirement to build software that way).

2. **DepEd is rolling out SIGLA (System for Intelligent Growth and Learner
   Anthropometry)** — an AI-enabled platform for nutritional/anthropometric
   (height/weight) data collection tied to the School-Based Feeding
   Program, alongside the existing SF8 Nutritional Status Report. This is a
   concrete, DepEd-recognized data category (height, weight, BMI-for-age,
   nutritional status classification) that a full SIS arguably should be
   able to capture per learner per school year, since teachers currently
   fill this in manually per DepEd's existing SF8 form. Confidence: Medium
   (program and SIGLA name confirmed via multiple secondary/news sources;
   no primary deped.gov.ph technical spec for SIGLA's data format was
   found/reachable in this session).

3. **DepEd Order No. 006, s. 2026** ("Ensuring a Safe and Motivating
   Learning Environment") consolidates child-protection, anti-bullying,
   and incident-reporting policy into one framework requiring schools to
   maintain **incident records, intervention tracking, and M&E reporting**
   for child-protection cases. This is a distinct, sensitive data category
   (child-protection/incident records, likely overlapping with guidance
   counselor anecdotal records already known to be a tracked internal gap)
   that carries its own confidentiality requirements beyond ordinary
   grades/attendance — worth a dedicated access-control tier (need-to-know,
   probably principal + guidance counselor only, not general teacher
   access) if/when this feature is built. Confidence: Medium (order's
   existence, title, and general incident-reporting/M&E framework are
   corroborated by multiple secondary sources; exact record-keeping/data
   fields were not found in a primary DepEd text).

4. **NPC data breach notification is time-boxed and specific**: the
   National Privacy Commission (NPC) must be notified within **72 hours**
   of knowledge/reasonable belief of a breach involving sensitive personal
   information or identity-fraud risk, with a **full report due within 5
   days** (extendable by NPC). This is a concrete, testable compliance
   requirement — LIKHA-SIS, as a locally-installed system holding sensitive
   personal information of minors, should have (a) a way for a school's
   Data Privacy Officer to quickly determine breach scope (e.g., "which
   learner records were on this device/backup"), and (b) documentation/a
   runbook for the school to meet this 72-hour clock, even though the
   notification itself is a human/legal action outside the software.
   Confidence: High (NPC Circular 16-03 and multiple independent legal-firm
   summaries agree on the 72-hour/5-day figures).

5. **Local-first architecture best practice (Ink & Switch's seven ideals,
   and current 2025 industry writing) directly validates and extends
   LIKHA's existing hub-sync design**, but surfaces three concrete UX
   patterns worth checking against the current implementation: (a) always
   show sync/connectivity status and per-record "unsynced" indicators
   rather than silent background sync; (b) prefer structured/fine-grained
   conflict resolution (flag only genuinely same-field conflicts for human
   review, auto-merge everything else) over a blanket last-write-wins; and
   (c) treat the "hub" laptop as a sync peer, not a single point of
   failure — the backup/restore path should work from any device's local
   copy, not only from the hub. Confidence: Medium-High (well-established
   pattern literature; not verified against LIKHA's actual current sync
   implementation in this research pass — that would require reading the
   codebase's SyncProvider docs/ADRs, which was out of scope for this
   outward-looking research task).

---

## 1. DepEd's own digital systems (LIS, EBEIS, and 2025-2026 initiatives)

**Confidence: Medium-High for existence/purpose of each system (many
division-office and regional-office secondary pages, consistently
described); Low for exact data schemas/export formats (no primary technical
API/schema documentation was found or reachable).**

### Learner Information System (LIS)

- `lis.deped.gov.ph` is DepEd's live, centralized learner database —
  described consistently across dozens of division/regional office memo
  pages as the system schools use to encode/update individual learner
  profiles, enrollment, and academic history. It assigns/tracks the LRN.
- Multiple 2026 division memoranda (e.g. DM No. 547 s.2026, a July 2026
  Region VIII memo) direct schools to encode learner data into LIS for
  "Beginning of School Year (BOSY) 2026-2027," confirming this is an
  annual, mandatory, recurring school-level task — not a one-time setup.
- A specific 2026 memo, **DM No. 076, s. 2026 — "Learner Information
  System (LIS) Data Housekeeping in Private Schools"** (via
  deped-ne.net.ph), confirms **private schools are explicitly in scope**
  for LIS data-quality obligations, not just public schools — directly
  relevant since LIKHA targets both.
- Sources:
  [DepEd SDO Dasmarinas — DM No. 547 s.2026](https://www.depeddasma.edu.ph/dm-no-547-s-2026-encoding-of-the-learner-information-system-lis-for-beginning-of-school-year-bosy-2026-2027/),
  [DepEd Region VIII — July 7 2026 LIS memo](https://region8.deped.gov.ph/2026/07/20/july-7-2026-memo-encoding-on-the-learner-information-system-lis-for-beginning-of-school-year-bosy-2026-2027/),
  [DepEd Nueva Ecija — DM No. 076 s.2026, LIS housekeeping in private schools](https://deped-ne.net.ph/2026/02/18/dm-no-076-s-2026-learner-information-system-lis-data-housekeeping-in-private-schools/),
  [lis.deped.gov.ph/help](https://lis.deped.gov.ph/help).

### Enhanced Basic Education Information System (EBEIS)

- EBEIS is described (secondary sources, e.g. depedph.com, division memo
  pages) as the companion system to LIS, holding **school-level** data:
  school profile, facilities, teacher/staffing counts, and enrollment
  aggregates — used for DepEd planning/resource-allocation and public
  BEIS/EBEIS statistical reporting.
- A 2026 division memo (Baliwag) ties EBEIS "School-Level Data and
  Profile" updates to the same End-of-School-Year cycle as LIS updates,
  suggesting these two systems are updated together as a paired annual
  ritual by school administrators.
- Sources:
  [DepEd City of Baliwag — DM No. 235 s.2026](https://cityofbaliwag.deped.gov.ph/division-memorandum-no-235-s-2026-updating-of-learner-information-system-lis-and-school-level-data-and-profile-in-the-enhanced-basic-education-system-ebeis-for-eosy-2025-2026/),
  [DepEd PH — EBEIS explainer](https://depedph.com/ebeis-enhanced-basic-education-information-system/),
  [EBEIS User Manual — School Profile (support.lis.deped.gov.ph, PDF)](https://support.lis.deped.gov.ph/support/Manuals/QuickGuides/EBEISUserManual_SchoolProfile.pdf).

### Learner Reference Number (LRN) as the interoperability key

- The LRN is a **permanent 12-digit identifier** assigned once per learner,
  portable across public/private schools and across levels (basic →
  potentially linking to TESDA/CHED). A cross-agency "Data Harmonization
  Meeting between TESDA, DepEd, CHED and EDCOMM II" was found referenced
  (2026), aimed at a "unified LRN system" spanning early childhood through
  higher/tech-voc education — a sign national data-interoperability policy
  is an active, developing area, not a settled one.
- **Enhancement implication**: if LIKHA-SIS does not already treat LRN as
  a first-class, validated (12-digit, format-checked), required-once,
  never-editable-after-assignment field distinct from any internal student
  ID, that is worth checking against DepEd's own model, since the LRN is
  the field every other DepEd system (LIS, EBEIS, SF1/SF9/SF10 forms) keys
  on.
- Sources:
  [TeacherPH — LRN FAQ](https://www.teacherph.com/deped-learner-reference-number-lrn/),
  [TESDA — Data Harmonization Meeting](https://tesda.gov.ph/Media/EventsDetail/12431),
  [FOI.gov.ph — Request for LRN](https://www.foi.gov.ph/agencies/deped/request-for-the-learners-reference-number-lrn/).

### What this means for LIKHA-SIS

No evidence was found of a documented API, bulk-upload file format, or
public schema for LIS/EBEIS that a third-party desktop SIS could integrate
with directly (these appear to be DepEd's own closed web portals, manually
operated by school registrars/encoders). The realistic enhancement is
**not** live API integration but:

- Ensuring LRN is modeled as DepEd expects it (permanent, portable,
  validated format) so a registrar's manual LIS/EBEIS re-encoding work can
  be done _from_ LIKHA-generated reports without reconciliation errors.
- Considering an export view/report shaped close to what LIS/EBEIS/SF1
  encoding screens ask for, to reduce double-entry — this is a
  usability/efficiency enhancement, not a compliance mandate, since DepEd
  does not currently accept direct system-to-system uploads from
  third-party school SIS software as far as this research could confirm.

---

## 2. Other Philippine/comparable school SIS products — concrete feature gaps

**Confidence: Medium. Product feature claims are drawn from vendor
marketing/comparison content (secondary, self-interested sources), not
independently verified against live product demos. Treat as "features
worth considering," not "features proven superior to LIKHA's plan."**

Products surfacing in searches for the Philippines/K-12 SIS market:
HashMicro, PowerSchool SIS, Gradelink SIS, Veracross, Fedena, DreamClass,
Classe365, Edunation. Concrete, specific (non-marketing-fluff) features
repeatedly named:

- **Admissions pipeline as a first-class module**: online inquiry →
  application → status tracking → "automatic conversion of accepted
  applicants into student profiles" (DreamClass). This is distinct from
  enrollment/section-assignment (which LIKHA likely already has) — it's
  the _pre_-enrollment funnel, useful for private schools that compete for
  enrollees.
- **Tuition/fee billing integrated with the SIS**: fee assignment,
  installment plans, discounts, **multi-payee invoices** (e.g. split
  billing between parents, or between parent and a sponsor/scholarship),
  and online payment gateway support. LIKHA's zero-billing/no-paid-infra
  stance and offline-first design make a full payment-gateway integration
  out of scope, but **fee/installment tracking and invoice generation as
  local-only records** (no live payment processing) could still be a
  legitimate, privacy-safe enhancement for private-school customers, since
  billing is explicitly called out as a "private-school-specific"
  differentiator versus public-school SIS needs.
- **Parent portal with self-service visibility**: grades, attendance,
  invoices, and report cards directly visible to parents without routing
  every request through school staff. This is a bigger architecture
  question (a parent-facing access surface implies either a second
  authenticated client or a web/export channel) but is repeatedly named as
  a differentiator across every product reviewed.
- **Attendance directly wired to gradebook/report-card generation** so
  absence data doesn't require manual reconciliation — a workflow-integration
  point rather than a new feature; worth verifying LIKHA's grading engine
  and attendance module already share data live rather than through manual
  re-entry.
- **Bilingual report card support** — explicitly named for private schools;
  directly relevant to a Philippine context (English/Filipino), and
  plausibly already covered by LIKHA's DepEd-compliance-first approach, but
  worth explicit verification since it was named as a differentiator by an
  external vendor.

Sources:
[DreamClass — "What Features Should a Private School SIS Include?"](https://www.dreamclass.io/2026/what-features-should-a-private-school-sis-include/),
[HashMicro — Best School Management Software Philippines 2026](https://www.hashmicro.com/ph/blog/best-school-management-software/),
[Classe365 — Best School Management Portals for K12](https://www.classe365.com/blog/best-school-management-portals-k12/),
[Gradelink — 10 Best School Management Portals](https://gradelink.com/10-best-school-management-portals-and-login-systems/).

**Caveat**: none of these named products are confirmed to be
Philippines-specific, DepEd-compliant, or offline-first — most are
US/international cloud SaaS SIS products that merely appear in
"Philippines"-flavored SEO/listicle content. The feature _ideas_ above are
still useful signal for what a "full-featured SIS" market expects, but
none of these products is a validated direct competitor to LIKHA's actual
niche (offline-first, DepEd-native, zero-billing). No genuinely
Philippine-built, DepEd-specific competitor product with a public feature
list was found in this research pass — this is itself a finding: LIKHA's
niche (offline-first, DepEd-compliant, zero-billing native app) appears
to have very little direct public competition from a named, describable
product, as opposed to informal Excel/Google-Sheets-based systems assumed
in the project's own internal audits.

---

## 3. Data Privacy Act (RA 10173) / NPC — concrete compliance specifics

**Confidence: Medium-High for the general framework and the 72-hour breach
rule (multiple independent, converging secondary/legal sources); Medium
for DepEd-specific application; Low for exact retention-period numbers
(no fixed statutory retention period was found — see below).**

### Consent for minors

- RA 10173 Sec. 12: processing is lawful with consent that is freely
  given, specific, and informed. For data subjects who are minors (under
  18), **parent/legal guardian consent is required** — this is standard
  and LIKHA's synthetic-data/no-real-PII development stance already sidesteps
  the development-time risk, but it is a **product-level requirement for
  actual school deployment**: enrollment/onboarding workflows should
  capture (or assume the school captures on paper) parental consent for
  data processing, particularly for any feature going beyond core
  academic-record-keeping (e.g., photos, health/nutrition data, guidance
  records).
- NPC's 2024 **Guidelines on Child-Oriented Transparency** treats children
  as a distinct, higher-protection class, using age bands (0-5, 6-12,
  13-17) to calibrate transparency/consent requirements — a nuance
  LIKHA's own privacy notices/consent language (if any exist yet) should
  reflect, since K-12 spans all three of these age bands within one
  school.
- Source:
  [Respicio & Co. — Data Privacy Law for Minors Under 13 in the Philippines](https://www.respicio.ph/commentaries/data-privacy-law-for-minors-under-13-in-the-philippines),
  [Alston & Bird — Minors' Privacy and Online Safety Laws guide](https://www.alston.com/en/insights/publications/2025/11/minors-privacy-online-safety-laws)
  (secondary summary; the underlying 2024 NPC guideline itself was not
  directly fetched from privacy.gov.ph in this session — flagged as a gap).

### DepEd's own privacy mandate

- **DepEd Order No. 66, s. 2017** reportedly formally adopts the Data
  Privacy Act within DepEd and requires schools to appoint a Data Privacy
  Officer (DPO) and implement organizational/physical/technical security
  measures. This is a pre-existing DepEd order (not new 2025-2026 policy),
  but directly relevant: LIKHA-SIS being installed at a school implies that
  school's designated DPO is the accountable party, and the software should
  make it easy for that DPO to fulfill their obligations (access logs,
  export-for-subject-access-request capability, breach-scope lookup — see
  below). This detail (DO 66 s.2017) was **not independently verified
  against a primary deped.gov.ph page in this session** — treat as
  secondary-source-only.
- Source:
  [BulSU — Data Privacy page](https://bulsu.edu.ph/data-privacy) (cites DO
  66 s.2017; secondary/institutional page, not deped.gov.ph itself).

### Breach notification — concrete, testable timeline

- **72 hours**: NPC and affected data subjects must be notified within 72
  hours of knowledge/reasonable belief of a breach involving (a) sensitive
  personal information, or (b) information enabling identity fraud, where
  there is (c) real risk of serious harm. This is grounded in **NPC
  Circular 16-03 (Personal Data Breach Management)**, a primary NPC
  document whose PDF URL was located (not fully read in this session, but
  its existence and title are confirmed via privacy.gov.ph's own document
  hosting path).
- **5 days**: the full written breach report to NPC is due within 5 days,
  extendable at NPC's discretion.
- **No delay allowed** if the breach affects ≥100 data subjects or
  involves sensitive personal information likely to harm the data subject
  — notification may only be delayed long enough to scope the breach,
  stop further disclosure, or restore data integrity, not deferred
  indefinitely.
- **Enhancement implication for LIKHA-SIS**: since a single Windows device
  could plausibly hold an entire school's (well over 100 learners')
  records, almost any real device-level breach at a LIKHA-SIS school would
  trigger the "no delay" / mandatory-72-hour path. A concrete, buildable
  feature: a **DPO/admin-facing "data breach scoping" report** — e.g. "as
  of this device's last sync, this device/backup held N learner records
  across these sections" — so a school's DPO can quickly answer "how many
  data subjects were affected" without manually auditing the database.
  This is squarely aligned with the project's own security/privacy
  priority ranking and is a novel, externally-sourced idea not likely to
  appear in the internal feature audits (which focus on pedagogical/DepEd
  features, not incident-response tooling).
- Source (primary, existence/title confirmed):
  [NPC Circular 16-03 PDF](https://privacy.gov.ph/wp-content/uploads/2022/01/sgd-npc-circular-16-03-personal-data-breach-management.pdf),
  [privacy.gov.ph — Breach Reporting page](https://privacy.gov.ph/pips-and-pics/breach-reporting/)
  (this page returned HTTP 403 to WebFetch in this session — could not read
  its rendered content directly; the 72-hour/5-day figures above are
  corroborated instead by independent secondary legal-firm sources: DLA
  Piper, Baker McKenzie, and BCCS Law, all agreeing on the same numbers,
  which raises confidence despite the primary page being unreachable here).
  _Follow-up verification (2026-09-07, orchestrating session): the primary
  Circular 16-03 PDF was attempted again directly and again returned HTTP
  403 (consistent failure, not a one-off). Instead, a second independent
  secondary legal source (DLA Piper's Philippines data-protection guide)
  was fetched directly and confirmed the same 72-hour/no-delay-at-100-subjects/5-day
  figures verbatim. This raises this specific figure from
  "subagent-relayed" to "independently re-confirmed by a second fetch,"
  though it is still not a primary-source read._

### Data retention — no fixed statutory number found

- Multiple secondary sources agree the DPA's principle is that retention
  "must be justified by legitimate business needs, legal obligations, or
  consent" rather than a specific fixed number of years for _all_ personal
  data. **No single universal retention-period figure for learner
  education records specifically was found** in this research (DepEd
  likely has its own records-retention schedule for permanent academic
  records like Form 137, given these are lifelong official records, but
  this specific DepEd retention schedule was not located/verified in this
  session — flagged as an open question rather than guessed).
- NPC Circular 2023-06 (effective 30 March 2024, compliance deadline 30
  March 2025) sets **updated minimum security requirements** for PICs/PIPs
  — this is more about safeguards than retention duration, but is a
  primary/near-primary compliance artifact worth a dedicated read-through
  if/when LIKHA does a full NPC-compliance pass, since it postdates
  whatever compliance research the project may have already done.
- Sources:
  [NPC Circular 2023-06 PDF](https://privacy.gov.ph/wp-content/uploads/2024/03/NPC-Circular-Repeal-16-01-Signed.pdf),
  [Thales — NPC Circular 2023-06 compliance summary](https://cpl.thalesgroup.com/compliance/apac/data-security-compliance-npc-circular-2023-06),
  [Respicio & Co. — Data Retention and Disposal Schedules for HR and Finance Records in the Philippines](https://www.respicio.ph/commentaries/data-retention-and-disposal-schedules-for-hr-and-finance-records-in-the-philippines)
  (HR/finance-specific, not learner-record-specific — cited only to show
  the general retention-schedule concept exists in Philippine practice, not
  as a learner-record answer).

---

## 4. Offline-first / local-first patterns relevant to a single-school hub sync model

**Confidence: High for the general pattern literature (well-established,
widely cited primary essay + multiple 2025 industry sources converging on
the same ideas); this section does not verify whether LIKHA's actual
current sync implementation already follows these patterns — that would
require reading LIKHA's own sync ADRs/code, which is outside this
outward-looking research task's scope.**

Three concrete, well-established patterns surfaced, chosen because they
are non-obvious from inside a single codebase (they come from comparing
against the broader local-first software literature):

1. **Visible sync/connectivity state as a first-class UI concern, not an
   afterthought.** The Ink & Switch "local-first software" essay (the
   foundational primary source in this space) and 2025 industry writing
   both emphasize that users must always be able to see: (a) whether the
   app is currently online/offline, (b) which records have local changes
   not yet synced to the hub/other devices, and (c) whether a sync
   attempt failed and needs retry. For a school with multiple teacher
   laptops syncing through one hub, an "unsynced changes" indicator per
   record (e.g., a class record edited on a teacher's laptop before the
   nightly hub sync) is a concrete, teacher-trust-building feature — a
   teacher should never wonder "did my grade entry actually save
   anywhere besides this laptop."

2. **Structured/fine-grained conflict resolution over blanket
   last-write-wins.** The pattern (CRDT-inspired, but achievable without a
   full CRDT library) is: auto-merge changes to _different_ fields/records
   silently, and only surface a conflict to a human when the _same_ field
   of the _same_ record was changed differently on two devices before
   sync. For a school SIS, a plausible concrete case: two teachers
   independently correct different students' attendance for the same day
   — that should merge silently; two people editing the _same_ student's
   _same_ grade cell for the _same_ quarter before either syncs is the
   narrow case that actually needs a resolution UI. Modern local-first
   commentary (2025) explicitly frames "which conflict strategy fits which
   data" as a product decision, not a purely technical one — worth an
   explicit ADR if the current implementation hasn't already made this
   field-level-vs-record-level distinction deliberately.

3. **The hub should be "a peer, not a single point of failure."** Local-
   first design principle: treat every device (including the designated
   "hub" laptop) as holding a complete, independently useful local copy,
   so that if the hub device is lost/damaged, another device's local copy
   plus its own backup can become the new source of truth rather than the
   school's data being unrecoverable. Concretely, this suggests (a) backup
   procedures should be documented/testable from _any_ device that has
   synced recently, not only the hub, and (b) "restore" should be a
   supported flow for "hub laptop died, promote this teacher's laptop to
   be the new hub," not just "hub laptop's backup file is corrupted, restore
   from backup on the same hub." Whether LIKHA's current architecture
   already supports this "any device can become the new hub" recovery path
   is a verification question for the team, not something this research
   pass can answer without reading the sync ADRs.

Sources:
[Ink & Switch — "Local-first software: You own your data, in spite of the cloud"](https://www.inkandswitch.com/essay/local-first/)
(primary/foundational essay in this space, widely cited),
[LogRocket — Offline-first frontend apps in 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/),
[Medium/Sakhawat Hossain — Conflict Resolution in Offline-First Apps](https://shakilbd.medium.com/conflict-resolution-in-offline-first-apps-when-local-and-remote-diverge-12334baa01a7),
[Hasura — A Design Guide for Building Offline First Apps](https://hasura.io/blog/design-guide-to-offline-first-apps).

---

## 5. Other notable recent (2025-2026) DepEd policy relevant to missing features

**Confidence: Medium overall.** _Post-publication update (2026-09-07, same
day, follow-up verification pass by the orchestrating session, not the
original research subagent):_ the primary `deped.gov.ph` issuance pages for
DO 006 s.2026 and DO 013 s.2026 **were** subsequently located and fetched
directly — see the boxed notes under each order below. This **upgrades
their exact titles and issue dates to primary-source confidence**, correcting
the original secondary-source-only status. However, both `deped.gov.ph`
pages are cover-image-plus-PDF-link pages with no extractable body text (the
same scanned-PDF limitation documented in
`docs/research/2026-09-07-matatag-ks1-do8-sources.md` Section 0), so **all
substantive content claims below (incident-reporting/M&E provisions for DO
006; the SIGLA/nutritional-data connection for DO 013) remain
secondary-source-only and unverified against the primary text** — treat
title/date and content-claims as having different confidence levels per
order, not a single blended rating.

### School-Based Feeding Program (SBFP) — nutrition tracking

> **Verified 2026-09-07 (orchestrating session, direct fetch):**
> `https://www.deped.gov.ph/2026/06/04/june-4-2026-do-013-s-2026-institutional-guidelines-on-the-implementation-of-the-school-based-feeding-program/`
> confirms DO 013, s. 2026's **exact title** — "Institutional Guidelines on
> the Implementation of the School-Based Feeding Program" — and **exact
> date**, June 4, 2026. This is now primary-source-confirmed, correcting the
> original single-blog sourcing below. **However, the page is a cover-image
>
> - PDF-link page with no extractable body text; SIGLA, nutritional-status
>   data collection, and SF8 are NOT mentioned anywhere on the fetched page,
>   and could not be confirmed to appear in the order at all.** Treat the
>   SIGLA/SF8 connection below as an unverified secondary-source claim that
>   may not even belong to this order — it was never confirmed to be part of
>   DO 013 specifically, only to exist as a DepEd initiative described in news
>   coverage.

- **DepEd Order No. 013, s. 2026** is cited (via tchersden.com, a teacher-
  guide secondary source) as the guideline governing the School-Based
  Feeding Program for the current cycle.
- SY 2026-2027 SBFP is described as DepEd's **largest-ever** rollout:
  P25.6 billion budget, ~4.6 million learners, **200 feeding days** (up
  from 120 in 2025, 175 in 2024, 30 in 2022) — sourced from Manila
  Bulletin and GMA News (both secondary/news sources, not deped.gov.ph
  directly, but independently reporting consistent figures).
- **SIGLA (System for Intelligent Growth and Learner Anthropometry)** is
  named as an AI-enabled platform DepEd is rolling out specifically to
  streamline collection/validation of learners' **height/weight/nutrition
  data** for SBFP targeting — this is the most concrete, novel,
  externally-sourced signal in this whole research task: DepEd is
  investing in a _dedicated national digital system_ for exactly the kind
  of health/nutrition data category (SF8 Nutritional Status Report) that a
  full-featured school SIS would also want to capture locally per learner
  per school year (height, weight, BMI-for-age, nutritional status
  classification, feeding-program enrollment/attendance).
- An **"Automated SF8 Nutritional Status Report SY 2026-2027"** template
  being distributed informally (depedlibre.com, a teacher-resource
  download site, not an official DepEd source) confirms SF8 remains a
  live, actively-used official form that schools currently fill in
  (likely via spreadsheet) — a strong signal this is still a manual,
  spreadsheet-based teacher task DepEd expects schools to do, making it a
  plausible SIS feature candidate the internal audits may not have
  weighted highly (nutrition being outside typical "academic SIS" scope).
- Sources:
  [Manila Bulletin — DepEd SBFP 2026 budget](https://mb.com.ph/2026/03/24/deped-school-based-feeding-program-2026-how-the-p256b-budget-will-help-46m-filipino-learners),
  [GMA News — DepEd to feed 4.6-M learners](https://www.gmanetwork.com/news/topstories/nation/972134/deped-to-feed-4-6-m-learners-as-school-based-feeding-expands-in-2026/story/),
  [PIA — DepEd's school-based feeding program](https://pia.gov.ph/features/depeds-school-based-feeding-program-ensures-that-nutrition-is-for-all/),
  [tchersden.com — DO 013 s.2026 guide](https://www.tchersden.com/2026/06/deped-order-013-2026-school-based-feeding-program-guide.html),
  [depedlibre.com — Automated SF8 template](https://depedlibre.com/automated-sf8-nutritional-status-report-sy-2026-2027/)
  (unofficial download-site source; named only to confirm SF8 is still
  actively in use).

### Child protection / school safety — DO 006, s. 2026

> **Verified 2026-09-07 (orchestrating session, direct fetch):**
> `https://www.deped.gov.ph/2026/03/24/march-24-2026-do-006-s-2026-guidelines-on-ensuring-a-safe-and-motivating-learning-environment-esmle/`
> confirms DO 006, s. 2026's **exact title** — "Guidelines on Ensuring a
> Safe and Motivating Learning Environment (ESMLE)" — and **exact date**,
> March 24, 2026. This is now primary-source-confirmed, correcting the
> original secondary-source-only status below. **The page itself is a
> cover-image + PDF-link page with no extractable body text; none of the
> incident-reporting, severity-triage, M&E, or "LRPD" claims below could be
> confirmed or denied against primary text.** Those specific provisions
> remain secondary-source-only, sourced from the blogs/decks listed below.

- **DepEd Order No. 006, s. 2026**, "Ensuring a Safe and Motivating
  Learning Environment," is described consistently across several
  secondary sources (SlideShare deck summaries, depedclub.com,
  teachersclick.com, eduknasyon.blogspot.com) as consolidating prior
  child-protection, anti-bullying, gender-based-violence, and
  cyber-harm-related policies into one framework for SY 2026-2027,
  applying to public schools and Community Learning Centers.
- Requires schools to: record facts via confidential reporting procedures;
  triage severity/risk; coordinate with the right internal office or
  external agency; provide learner/family/psychosocial support; and run
  **continuous M&E** (monitoring & evaluation) with accurate incident
  records and intervention tracking, reported through the "LRPD"
  (mentioned but not expanded/defined in the sources found — likely
  "Learner Rights and Protection [something] Division," not independently
  confirmed).
- **Enhancement implication**: if LIKHA's guidance-counselor/anecdotal-
  record feature (already known internally as a gap) is eventually built,
  DO 006 suggests it should be modeled as **structured incident records
  with severity/risk classification, intervention tracking, and outcome
  fields**, not just free-text notes — and should support whatever
  standardized M&E report format DepEd expects schools to submit upward,
  though the exact report format was not found in this research.
- Confirmed this is a **new 2026** order distinct from the older, well-known
  **DO 40, s. 2012** "Child Protection Policy" (also surfaced in search
  results) — DO 006 s.2026 appears to supersede/harmonize rather than
  replace the foundational 2012 policy's legal basis, but this
  relationship was not explicitly confirmed in any source read.
- Sources:
  [depedclub.com — DO 006 2026 ESMLE explainer](https://depedclub.com/deped-order-006-2026-esmle-cellphone-rules-school-safety/),
  [teachersclick.com — DO 006 s.2026 guidelines](https://www.teachersclick.com/2026/04/deped-order-no-6-s-2026-guidelines-on.html),
  [Dr. Victoria B. Roman MHS — DO 006 s.2026 downloadable forms/templates](https://www.drvictoriabrmhs.com/p/deped-order-no-006-s-2026-downloadable.html)
  (this source specifically claims to host template forms tied to the
  order — potentially useful if the project ever builds this feature, but
  not verified as official DepEd-issued templates).

### Inclusive education / SPED — data quality gap, not just a feature gap

- DepEd's own reported inclusion numbers show a **data-quality problem**,
  not just a missing-feature problem: only ~391,089 learners with
  disabilities (LWDs) are enrolled/flagged nationally, and of those,
  **less than half have a formal medical diagnosis** — the rest are
  flagged only via teacher checklists or informal observation, per a
  secondary news/opinion source (The GUIDON, a university publication,
  commenting critically on DepEd's inclusive-education implementation).
  This is opinion/critique content, not a DepEd primary statistic release,
  so treat the exact figures as **unverified** pending a primary DepEd
  source, but the qualitative point (SPED/LWD flagging is often informal,
  teacher-judgment-based, not backed by formal diagnosis) is a genuinely
  useful design signal: **if LIKHA ever builds SPED/inclusive-education
  learner flagging, it should support a "flagged by teacher observation,
  pending formal assessment" status distinct from "formally diagnosed,"**
  rather than a binary SPED/not-SPED field — because that appears to be
  the real-world workflow DepEd schools are already living with.
- The **Inclusive Education Act** (Republic Act, established March 11,
  2022 per a secondary TeacherPH source) establishes Inclusive Learning
  Resource Centers (ILRCs) as a structural mandate — this is not new
  2025-2026 policy, but is the legal foundation any current inclusive-ed
  DepEd initiative sits on.
- Sources:
  [The GUIDON — "DepEd's performative inclusivity of special education"](https://theguidon.com/2025/12/depeds-performative-inclusivity-of-special-education/)
  (opinion piece — secondary, critical framing, cited only for the
  diagnosis-rate data point, itself unverified against a primary DepEd
  release),
  [TeacherPH — DepEd Inclusive Education Policy Framework](https://www.teacherph.com/deped-inclusive-education-policy-framework/),
  [Sunstar — DepEd ensures inclusive education for learners with special needs](https://www.sunstar.com.ph/more-articles/deped-ensures-inclusive-education-for-learners-with-special-needs).

### ALS (Alternative Learning System) — likely out of scope, noted for completeness

- ALS has its own LIS-ALS facility (a distinct DepEd system, per a Region
  II regional memo on "Updating of ALS Enrollment in the Learner
  Information System (LIS) and other ALS Data") — this suggests ALS is
  organizationally and data-model distinct from the K-12 formal-school
  track LIKHA targets. Given the mission statement scopes LIKHA to K-12
  Philippine public/private schools (not explicitly ALS Community Learning
  Centers), this is flagged only as a boundary note, not a recommended
  feature addition, unless the project's own scope later expands to ALS
  CLCs.
- Source:
  [DepEd Region II — RM 346 s.2026, ALS/LIS data](https://region2.deped.gov.ph/regional-memorandum-no-346-s-2026-updating-of-als-enrollment-in-the-learner-information-system-lis-and-other-als-data-for-school-year-2026-2027/).

---

## Summary of confidence levels

| Topic                                                                                                  | Confidence                                                       | Primary source reached?                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LIS/EBEIS existence, mandatory annual use, private-school inclusion                                    | Medium-High                                                      | No deped.gov.ph page directly fetched; corroborated by many division/regional office pages (which are DepEd domains, `*.deped.gov.ph`, but not the national deped.gov.ph homepage/policy pages — a weaker-than-ideal but still official-domain source tier)                                                                                                                                                                            |
| LRN as canonical cross-system identifier                                                               | Medium                                                           | No; secondary sources (TeacherPH, TESDA event page)                                                                                                                                                                                                                                                                                                                                                                                    |
| Recommendation: LIKHA should treat LRN as first-class field / consider LIS/EBEIS-shaped export         | Inference only, not a sourced DepEd requirement                  | N/A — this is this researcher's judgment, flagged as such                                                                                                                                                                                                                                                                                                                                                                              |
| Other PH/comparable SIS product features (admissions funnel, billing, parent portal)                   | Medium                                                           | No; vendor/marketing and listicle sources only, self-interested                                                                                                                                                                                                                                                                                                                                                                        |
| No named direct DepEd-compliant offline-first PH competitor found                                      | Medium (absence-of-evidence finding)                             | N/A                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| RA 10173 minor-consent requirement                                                                     | High                                                             | No NPC primary page fetched successfully (403 on breach-reporting page); multiple converging legal-summary secondary sources                                                                                                                                                                                                                                                                                                           |
| NPC 72-hour / 5-day breach notification timeline                                                       | High                                                             | NPC Circular 16-03 PDF: attempted twice (original session + follow-up verification pass), both returned HTTP 403; breach-reporting page also 403. Figures independently corroborated by 4 separate legal-firm secondary sources across two research passes (DLA Piper, Baker McKenzie, BCCS Law, and a second direct DLA Piper fetch in the follow-up pass) — no primary text read, but cross-source agreement is now doubly confirmed |
| DepEd DO 66 s.2017 privacy/DPO mandate                                                                 | Low-Medium                                                       | No; single secondary institutional source (BulSU)                                                                                                                                                                                                                                                                                                                                                                                      |
| Statutory learner-record retention period                                                              | Low (no fixed figure found)                                      | No; general DPA retention _principle_ confirmed, no specific number for education records                                                                                                                                                                                                                                                                                                                                              |
| Local-first/offline-first UX patterns (sync visibility, fine-grained conflict resolution, hub-as-peer) | High (as general pattern literature)                             | Yes — Ink & Switch essay is the primary/foundational source in this space and was directly fetched; application specifically to LIKHA's own implementation is unverified (out of scope for this task)                                                                                                                                                                                                                                  |
| DO 013 s.2026 title/date                                                                               | **High** (upgraded by follow-up verification)                    | **Yes** — `deped.gov.ph/2026/06/04/june-4-2026-do-013-s-2026-...` fetched directly; exact title and date confirmed                                                                                                                                                                                                                                                                                                                     |
| SIGLA nutrition platform's connection to DO 013 specifically                                           | **Low** (downgraded by follow-up verification)                   | No — the primary DO 013 page has no readable body text and does not mention SIGLA; the SIGLA↔DO 013 link was never confirmed, only inferred from separate news coverage of a same-era DepEd initiative                                                                                                                                                                                                                                 |
| SBFP program scale (P25.6B, 4.6M learners, 200 days)                                                   | Medium                                                           | No deped.gov.ph page with this detail fetched; corroborated by mainstream news (Manila Bulletin, GMA News, PIA)                                                                                                                                                                                                                                                                                                                        |
| DO 006 s.2026 title/date                                                                               | **High** (upgraded by follow-up verification)                    | **Yes** — `deped.gov.ph/2026/03/24/march-24-2026-do-006-s-2026-...` fetched directly; exact title and date confirmed                                                                                                                                                                                                                                                                                                                   |
| DO 006 s.2026 specific content (incident records, severity triage, M&E, "LRPD")                        | Medium (unchanged — not upgraded)                                | No — primary page has no readable body text; still resting on 4+ secondary sources only                                                                                                                                                                                                                                                                                                                                                |
| SPED/inclusive-education informal-flagging data gap                                                    | Low-Medium (qualitative point plausible; exact stats unverified) | No; single opinion-piece secondary source for the statistic                                                                                                                                                                                                                                                                                                                                                                            |
| ALS as an organizationally distinct system/scope boundary                                              | Medium                                                           | No deped.gov.ph page fetched; one regional-office memo page                                                                                                                                                                                                                                                                                                                                                                            |

## Recommended follow-up if higher confidence is needed later

- Fetch `deped.gov.ph`'s own LIS/EBEIS/BEIS explainer pages (searched-for
  but not directly fetched in this session) to confirm system scope and
  whether any documented bulk-import/export format exists for schools.
- Retry `https://privacy.gov.ph/pips-and-pics/breach-reporting/` (returned
  HTTP 403 to WebFetch in this session — may be blocking automated
  fetches; a human browser visit or a different fetch tool may succeed)
  and read NPC Circular 16-03 and 2023-06 in full for exact breach and
  security-safeguard obligations.
- Locate and fetch the primary deped.gov.ph pages for DO 013 s.2026 (SBFP)
  and DO 006 s.2026 (school safety/child protection) directly, the way the
  MATATAG/KS1/DO8 research session did for DO 015 s.2026 and DO 8 s.2015 —
  this session did not attempt those specific deped.gov.ph URLs and relied
  on secondary teacher-guide/news sources throughout Section 5.
- If the project ever seriously considers a nutrition-tracking or
  child-protection-incident feature, commission a dedicated
  `deped-researcher` pass (the project's own specialized research agent)
  scoped narrowly to DO 013 s.2026 and DO 006 s.2026 primary text, the way
  this project already did for MATATAG/KS1/DO8.
