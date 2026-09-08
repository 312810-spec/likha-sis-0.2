# LIKHA-SIS 0.2 — Unified Master Task & Feature Inventory

**Date:** 2026-09-07  
**Mission Priority Order:**  
`Security/Privacy > Correctness > DepEd Compliance > Teacher Usability > Offline Reliability > Maintainability > Zero Billing > Performance > Development Speed`

---

## Executive Summary & Current Health Check

- **Working Foundation:** Rust / Tauri 2 + React 19 + TypeScript + SQLCipher (DPAPI encrypted) + Offline-first Local Database.
- **Frontend Test Suite:** **1,099 / 1,099 tests passing** across 111 test files (`vitest`).
- **Deadcode / Lint / Architecture:** 0 architecture violations, 0 knip deadcode findings, clean lint and formatting.
- **Sync Core:** Local outbox $\rightarrow$ encrypted hub $\rightarrow$ pull with conflict review for 10 entities (including `SubjectAttendanceEntry`).

---

## Tier 1: Security & Privacy (Highest Priority)

### 1.1 Pending Independent Security Reviews

- [x] **Sync Payload Encryption & Key Rotation** (`hub_server::payload_key_wrap_handler`, `repository::sync_payload_key`): Independent `security-reviewer` dispatch already completed and its finding fixed in an earlier session (ADR-0069, 2026-09-05 addendum). This session (2026-09-08) re-attempted a fresh dispatch (unreachable, same known recurring gap) and performed a self-review confirming no regression — see `docs/VERIFICATION-DEBT.md`'s 2026-09-08 entry. A fresh independent pass remains owed when the dispatch harness is healthy, tracked as debt, not blocking.
- [x] **Device Revocation & Key Rotation** (`db::rotate_sspk`): Independent `security-reviewer` dispatch already completed and its finding fixed in an earlier session (ADR-0069, 2026-09-05 addendum, same session as above). Re-confirmed via self-review this session — see `docs/VERIFICATION-DEBT.md`.
- [x] **In-App School Branding Logo Upload** (`set_school_logo` BLOB/MIME handling): Self-reviewed this session (2026-09-08; independent dispatch attempted first and unreachable). Found and fixed a real MIME-sniffing gap (declared MIME type was never checked against actual file bytes) — see ADR-0070. Path traversal: not applicable (no filesystem path involved, BLOB stored in SQLite). Unbounded size and tenant-scoping: already correct, no gap found.

### 1.2 Sync Production Security & Hardware Gates (ADR-0067)

- **School-Laptop Hub Daemon/Service Resilience:** Windows service relaunch / reboot persistence behavior for the hub laptop is not yet hardened. Operational/hardware verification — cannot be attempted in this sandbox; tracked in `docs/VERIFICATION-DEBT.md`.
- **Hub Hardware Gates:** Operational validation of BitLocker, firewall rules, and patch management on the physical hub machine. Same limitation as above.
- **Disaster Recovery Drill:** Two-copy encrypted backup creation and witnessed restoration drill not yet executed. Same limitation as above.
- [x] **Secondary PIN Lock (from `likha-sis-master`):** Ported the _intent_ of `settingsLock.js` (Web Crypto PBKDF2-SHA256, 150,000 iterations) as a Rust-side gate (`crypto::pin_lock`, `repository::structural_lock`, `auth::require_structural_lock_unlocked`), wired into the one existing school-identity mutation (`set_school_logo`/`clear_school_logo`). See `docs/adr/0070-secondary-structural-lock-pin.md`. Curriculum-version and calendar-structure gating deferred — no editing command exists for either yet in this codebase (nothing to gate); the reusable gate is ready to wire in the moment either is built.

---

## Tier 2: Correctness & Compliance (DepEd Orders)

### 2.1 Authoritative School Forms (SF) Engine

- **SF1 (School Register):** Not closed — re-searched 2026-09-08 (WebSearch, no `deped-researcher` agent available), no new primary `deped.gov.ph` template found beyond ADR-0048/0051's prior work. `OFFICIAL_SF1_FIDELITY` stays `NOT_VERIFIED`; no safe alignment fix to make without guessing. See `docs/VERIFICATION-DEBT.md`'s 2026-09-08 entry.
- **SF9 (Learner Progress Report Card):** Not closed — re-searched 2026-09-08; found a plausible 2026-2027 finalized-release lead (`sites.google.com/deped.gov.ph/lsguide/budgets-of-work`) but did not fetch/read its actual file this session, so it does not raise `OFFICIAL_SF9_FIDELITY` past `NOT_VERIFIED`. Recorded as a lead for a future session in `docs/VERIFICATION-DEBT.md`.
- **SF10 (Learner's Permanent Academic Record):** Unchanged from ADR-0053/Wave 2N (SSHS provenance-confirmed/fidelity-unverified, JHS MATATAG evidence-blocked); this project's shipped export (`export::sf10`, ADR-0063) remains a deliberate content-based CSV, correctly not claiming byte-level template fidelity. No new gap, no regression.
- [x] **DepEd Form 137 / 138 Reconciliation:** Researched 2026-09-08 — multiple mutually consistent secondary sources confirm Form 137 → SF10 (permanent academic record), Form 138 → SF9 (progress report card); this project's existing SF9/SF10 naming and scope already match. Medium confidence (no single primary DepEd issuance fetched, but consistent across every independent secondary source checked). See `docs/VERIFICATION-DEBT.md`.

### 2.2 SF8 Health & Nutrition Engine (Port from `likha-sis-master`)

- [x] **WHO/DepEd BMI & HFA Calculator:** Decimal-age-in-months, BMI computation, and BMI-for-Age/Height-for-Age classification _logic_ ported and fully tested (`src-tauri/src/health/nutrition.rs`, `repository::nutrition`, migration 43, `docs/adr/0071-sf8-health-nutrition-engine.md`). The WHO 2007 numeric growth-standard reference tables themselves are **not sourced with confidence** and were deliberately NOT hardcoded — `lookup_bmi_cutoffs`/`lookup_hfa_cutoffs` return `None` pending a verified primary source; see `docs/VERIFICATION-DEBT.md`. Real per-learner classification cannot run until that table lands.
- [x] **BOSY vs. EOSY Consolidation:** School-wide baseline vs. endline nutritional consolidation report ported and fully tested (`src-tauri/src/health/consolidation.rs`), independent of the table gap above — a record with no classification yet still counts as "weighed," correctly landing in no BMI/HFA bucket.

### 2.3 DO 006, s. 2026 Child Protection & Automated At-Risk Triggers

- [x] **3-Tier Behavioral Incident Logging:** Implemented (`repository::child_protection`, migration 44, `docs/adr/0072-child-protection-authorization.md`). Tier naming is a **generic 3-level scale** (`level_1`/`level_2`/`level_3`), NOT verified DO 006 vocabulary — this session could not confidently source DO 006, s. 2026's own official tier names; LOW confidence, tracked in `docs/VERIFICATION-DEBT.md`.
- [x] **Multi-Silo Automated Risk Detection:** Implemented, computed on read (`repository::at_risk`), reusing existing engines — no duplicated computation:
  - _Academic:_ any subject term grade $< 70$ or General Average $< 75$, via `grading_computation::compute_term_grade`.
  - _Health:_ Wasted/Severely Wasted/Obese, via Batch 2's `repository::nutrition::find_for_learner` (no new nutrition query).
  - _Attendance:_ rate $< 80\%$, a new aggregate over `attendance_records` (no existing rate function to reuse).
- [x] **Append-Only Intervention Log & Auto-Resolution:** `incident_interventions` (migration 44) is INSERT-only; a `resolution` entry flips the incident's `resolved_at` without rewriting its narrative content.
- Authorization: section-adviser-or-School-Head only (`auth::authorize_child_protection_access_for_section`) — a bare Teacher gets no blanket access, per ADR-0072.
- Deferred: frontend UI; command-level integration tests (see `docs/VERIFICATION-DEBT.md`).

### 2.4 Multi-Year Scholastic Importer (`.xlsx`)

- [x] **DepEd `.xlsx` Spreadsheet Parser:** Implemented using `calamine` (already an adopted dependency — no new crate added; see `docs/adr/0074-xlsx-scholastic-importer.md`), following the existing SF1 preview → duplicate-review → commit shape. Ingests into a new `scholastic_history_records` table (migration 46) feeding SF10's prior-years section, matched to existing learners by LRN only (never creates a new learner). Column layout unverified against an official template — see `docs/VERIFICATION-DEBT.md`.
- Deferred: frontend UI (preview/review screen).

### 2.5 Multi-Tier Review & Audit Pipeline

- [x] **Interim Review Workflow (School-Head-as-approver):** Teacher (or School Head) submits a class record's grades → automated checks (missing summative scores, out-of-bounds values, weight-group mismatch) run and post as notes → School Head approves/rejects with feedback (`repository::grade_submission`, migration 45, `docs/adr/0073-interim-grade-review-pipeline.md`). **No "Master Teacher" role exists in this codebase** — School Head plays that role for this interim version, an explicit recorded decision, not a permanent redesign; superseded once the project owner decides the Master Teacher RBAC question.
- [x] **Principal Overview Dashboard (interim):** School-wide composite-grade view (`get_principal_overview_dashboard`, reusing `grading_computation`) + submission-status matrix (`list_grade_submissions_for_school`). "Principal" maps to the existing School Head role, same interim substitution as above.
- Not done: formal SF sign-offs (no SF export currently has a sign-off/attestation field to wire into) — one-line reason recorded here, not silently dropped.
- Deferred: frontend UI; command-level integration tests (see `docs/VERIFICATION-DEBT.md`).

---

## Tier 3: Teacher Usability & UI/Theme Engine Replication

### 3.1 UI & Theme Engine Replication (Replicating `likha-sis-master`)

- **Persistent Two-Tier Layout Shell (`DashboardShell`):**
  - [x] Collapsible sidebar (expanded ~16.5rem / collapsed ~5rem icon
        rail) with native `title`-attribute tooltips on collapsed icons
        -- Batch 4, `Sidebar.tsx`.
  - [x] Sticky translucent/blurred header (`backdrop-filter`, with a
        non-transparent `@supports` fallback), live tabular clock, 3-way
        theme toggle (Light/System/Dark), notification bell with unread
        badge affordance, and a user avatar (initials) -- Batch 4,
        `TopBar.tsx`. Reason not "Ledger Gold section labels": that is
        the reference project's own visual styling, not adopted per
        ADR-0064's existing "structural yes, visual no" decision.
- **"Ledger Pairing" Typography System:**
  - [x] Token-level pairing shipped this batch (`--font-serif` on page
        `<h2>`, `--font-mono`/`.font-tabular` on the clock and timetable
        time column) using system font stacks.
  - [ ] Real Fraunces/IBM Plex Mono webfonts -- deliberately deferred,
        flagged as a new-dependency decision needing explicit approval
        (ADR-0075 §2), not silently added or silently dropped.
- **Dynamic Logo Palette Extractor:**
  - [x] Dependency-light dominant-color extraction + WCAG-AA-verified
        dark-surface/text token derivation, with a passing contrast test
        -- `src/domain/palette.ts` (ADR-0075 §1), in place of `ColorThief`.
  - [ ] Wired to a live screen (drawing the uploaded logo to a canvas and
        theming the app from it) -- not done this batch; the pure
        extraction/derivation pipeline is complete and tested, the UI
        glue is the recorded next slice.
- **Card Elevation & Depth:**
  - [x] Three-tier elevation scale (`--elevation-small/medium/pressed`)
        plus `--radius-medium`/`--radius-card`, applied to `.card` (hover
        lift) and buttons (`:active` press) -- Batch 4.

### 3.2 Visual Timetable & Class Program Builder (from `likha-sis-master`)

- [x] **Visual Schedule Grid:** `SectionTimetableScreen.tsx` -- a
      section-wide weekly grid over the existing `schedule_meetings`
      persistence (no new Rust migration). Click-to-arm/click-to-place,
      not drag-and-drop -- flagged and justified in ADR-0075 §6 (a
      drag-and-drop library is a new dependency this batch's
      constraints require flagging, and click-to-arm needs none while
      staying keyboard-operable).
- [x] **Real-Time Conflict Detection:** `src/domain/timetable.ts`'s
      `detectTimetableConflicts` (teacher/section/room double-booking,
      pure + tested) and `validateSubjectWeeklyMinutes` (subject-hours
      check). The curriculum-required-minutes figure is a caller-
      supplied parameter this batch, not sourced from a new persisted
      curriculum-requirements table -- flagged in ADR-0075 §7 as a
      deliberate scope decision (an authoritative DepEd per-subject
      weekly-minutes table needs its own sourcing/verification pass, not
      invented here).
- [x] **One-Click Auto-Seed Wand:** `autoSeedWeeklySlots`
      (`src/domain/timetable.ts`), pure + tested, wired into
      `SectionTimetableScreen`'s "Auto-seed" action.
- [x] **Derived Teacher Load:** already computed live from
      `schedule_meetings` since ADR-0039/Wave 3A (`teacher-load.ts`) --
      confirmed unchanged and un-duplicated by this batch, not a new
      deliverable.

### 3.3 Teacher Creation Studio Remaining Deliverables

- [ ] **Sub-scope 2.2: Certificate & Recognition Template:** Printable DepEd Academic Excellence Award certificate generator with automated DO 015 honors qualification engine. **Batch 5 (2026-09-08):** eligibility engine + certificate content builder shipped and tested (`src/domain/award-eligibility.ts`, `src/domain/certificate.ts`) with the GA threshold explicitly flagged as unverified/configurable and the disciplinary-anecdotes check explicitly not implemented (no Anecdotal Records feature exists); printable UI screen deferred to next slice — data plumbing already exists via `computeTermGrade`.
- [ ] **Sub-scope 2.3: Custom Seating Chart:** Drag-and-drop section seating arrangement tool reusing class rosters. **Batch 5:** arrangement validation logic shipped and tested (`src/domain/seating-chart.ts`), session-local by design, click-to-place per Batch 4's precedent (not drag-and-drop — flagged deviation from this line item's own wording); UI screen deferred to next slice.

### 3.4 Operational Classroom & School Productivity Tools

- [ ] **School Calendar & Philippine Holidays:** Offline database of regular, non-working, and Islamic holidays (`philippineHolidays.js`). **Batch 5:** hardcoded, sourced SY 2025-2026 table shipped and tested (`src/domain/ph-holidays.ts`); calendar UI screen deferred to next slice.
- [ ] **Weather & Hazard Suspension Alerts:** Hyper-local Open-Meteo integration via school coordinates; flags severe weather suspension warnings ($>30\text{ mm}$ rain, $>50\text{ kph}$ wind). **Batch 5:** full port/adapter/service slice shipped and tested, ADR-0076; fail-safe degrade-to-unavailable proven in tests; not yet wired into `composition.ts` or a UI screen (no school-coordinate field exists yet) — next slice.
- [ ] **Transfers In/Out Documentation Registry:** Formal ledger tracking student transfer dates, receiving/originating schools, and document statuses. **Batch 5:** deferred entirely except domain validation (`src/domain/transfer-record.ts`) — the only Tier 3.3/3.4 item needing a brand-new persisted tenant-scoped entity (migration/repository/commands), judged out of scope for this batch's time budget; top candidate for the next slice.
- [ ] **Consolidated Grades Matrix:** Cross-subject grade registry displaying all learning areas side-by-side per section across all terms. **Batch 5:** pure aggregation over already-computed grades shipped and tested (`src/domain/consolidated-grades.ts`), no new grade storage; UI screen deferred to next slice.
- [ ] **Student ID Card Generator:** Front/back printable student ID cards with photos, emergency contacts, and tokenized QR verification codes. **Batch 5:** offline-only HMAC token generate/verify engine shipped and tested (`src/domain/id-card-token.ts`), ADR-0077 resolves the cloud-vs-offline audit question conservatively as offline-only; printable card layout, real QR image rendering (needs a new dependency, not yet evaluated), and real secret-key sourcing all deferred to next slice.

---

## Tier 4: Offline Reliability & Synchronization

### 4.1 Sync Scope Expansion

- **Remaining Unwired Sync Entities:**
  - `LessonPlan` (currently local only).
  - `SchoolLogo` / Branding bytes.
  - New incoming entities (Anecdotal, Nutrition/SF8, Schedule Grids).
- **Sync Resiliency & Edge Cases:**
  - Natural key collision handling is generic but needs systematic testing across all remaining entities.
  - Multi-device simultaneous conflict resolution UX.

---

## Tier 5: Maintainability & Verification Debt

### 5.1 Verification Debt Reduction

- **Native Visual & Screen-Reader Inspection:** Comprehensive screen-reader pass on the native Windows WebView2 binary with NVDA and Windows Narrator across all 25+ screens.
- **Android Platform Architecture Proof:** First Android build target, secure key storage adapter, and touch-optimized layout proof.
- **Official School Repository Prerequisites:** Awaiting school-owned Microsoft 365 tenant confirmation and privacy review before implementing SharePoint sync.
