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
  - [x] Wired to a live screen (Batch 8 item 6, 2026-09-08, ADR-0078):
        `useLivePalette` draws the current school logo to an offscreen
        canvas, samples it, and -- only when the derived pair clears
        WCAG AA -- overrides `--color-primary`/`--color-surface`/
        `--color-text` for dark mode only via a single injected
        `<style>`, falling back cleanly to the existing static dark
        palette otherwise. Mounted once in `AppLayout` (reuses the logo
        object URL already fetched there). Tested without a real image
        decode (`useLivePalette.test.ts`, 9 tests).
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

- [x] **Sub-scope 2.2: Certificate & Recognition Template:** Printable DepEd Academic Excellence Award certificate generator with automated DO 015 honors qualification engine. **Batch 5 (2026-09-08):** eligibility engine + certificate content builder shipped and tested (`src/domain/award-eligibility.ts`, `src/domain/certificate.ts`) with the GA threshold explicitly flagged as unverified/configurable and the disciplinary-anecdotes check explicitly not implemented (no Anecdotal Records feature exists). **Batch 8 item 1 (2026-09-08):** printable `CertificateAwardScreen` shipped and wired — loops a section roster through `computeTermGrade` per subject/grading-period, both disclosures render visibly on the eligibility list and on the printed certificate itself, eligible-only "Print certificate" gating, tested (`CertificateAwardScreen.test.tsx`, axe-clean).
- [x] **Sub-scope 2.3: Custom Seating Chart:** Drag-and-drop section seating arrangement tool reusing class rosters. **Batch 5:** arrangement validation logic shipped and tested (`src/domain/seating-chart.ts`), session-local by design, click-to-place per Batch 4's precedent (not drag-and-drop — flagged deviation from this line item's own wording). **Batch 8 item 2 (2026-09-08):** `SeatingChartScreen` shipped and wired — click a learner then a seat (or click a filled seat to clear it), session-local banner shown, tested (`SeatingChartScreen.test.tsx`, axe-clean).

### 3.4 Operational Classroom & School Productivity Tools

- [x] **School Calendar & Philippine Holidays:** Offline database of regular, non-working, and Islamic holidays (`philippineHolidays.js`). **Batch 5:** hardcoded, sourced SY 2025-2026 table shipped and tested (`src/domain/ph-holidays.ts`). **Batch 8 item 3 (2026-09-08):** `CalendarScreen` shipped and wired — sorted holiday table with the Proclamation No. 727/665 source citation visible in the UI itself (not just a code comment), tested (`CalendarScreen.test.tsx`, axe-clean).
- [x] **Weather & Hazard Suspension Alerts:** Hyper-local Open-Meteo integration via school coordinates; flags severe weather suspension warnings ($>30\text{ mm}$ rain, $>50\text{ kph}$ wind). **Batch 5:** full port/adapter/service slice shipped and tested, ADR-0076; fail-safe degrade-to-unavailable proven in tests. **Batch 8 item 5 (2026-09-08, ADR-0079):** wired end to end — migration 51 (`schools.latitude`/`longitude`), new `ManageSchoolCoordinates` capability + commands, `SchoolCoordinatesApplicationService`/repository, `composition.ts` now instantiates `weatherService`, a "School location" section on `SchoolBrandingScreen`, and `WeatherAdvisoryBanner` mounted app-wide that renders nothing unless a genuine advisory exists (never an error state). `cargo test --lib` 1233 passed; `npm run quality` full pass.
- [x] **Transfers In/Out Documentation Registry:** Formal ledger tracking student transfer dates, receiving/originating schools, and document statuses. **Batch 5:** deferred entirely except domain validation (`src/domain/transfer-record.ts`). **Batch 9 (2026-09-08, ADR-0080):** full vertical slice shipped and tested — migration 52 (`transfer_records` table) + migration 53 (entity_kind CHECK widening), new `ManageTransferRecords` capability (Registrar, School Head), `repository::transfer_record` (tenant-scoped CRUD reusing the TS validation's exact rules), `commands::transfer_record` (`record_transfer`/`list_transfers_for_learner`/`list_transfers_for_school`/`update_transfer_status`), `TransferRecordApplicationService`/`TauriTransferRecordRepository` wired in `composition.ts`, `TransfersScreen` reachable from the "Learner Records" nav group (axe-clean), and full Batch 6-pattern sync wiring (`EntityKind::TransferRecord`, `upsert_from_sync`, sync-aware command enqueue, `apply_decrypted_change` arm, conflict-review typed preview) — no natural-key-collision test needed (no natural key beyond `id`, see ADR-0080). `cargo test`/`cargo clippy --all-targets -- -D warnings`/`cargo fmt --check` and `npm run quality` all pass.
- [x] **Consolidated Grades Matrix:** Cross-subject grade registry displaying all learning areas side-by-side per section across all terms. **Batch 5:** pure aggregation over already-computed grades shipped and tested (`src/domain/consolidated-grades.ts`), no new grade storage. **Batch 8 item 4 (2026-09-08):** `ConsolidatedGradesScreen` shipped and wired — section x subject x term grid with a general-average column, horizontally scrollable, tested (`ConsolidatedGradesScreen.test.tsx`, axe-clean).
- [x] **Formative Assessment (ESRU) Logging:** Quick per-learner, per-activity E/S/R/U formative-assessment logging. Legacy `likha-sis` carried only a type shape, never a working implementation. **Batch 11 (2026-09-08, ADR-0082):** full vertical slice shipped and tested — migration 55 (`formative_assessment_logs` table, `esru_rating` CHECK-constrained to the four bare literal letters only, never the gloss word) + migration 56 (entity_kind CHECK widening), `repository::formative_assessment` (tenant-scoped CRUD reusing `subject_attendance::authorize_own_assignment` unchanged — "Teacher owns this assignment," not a school-wide `Capability`; see ADR-0082 Decision 1 for why this shape was chosen over `ManageChildProtection`'s tighter one), `commands::formative_assessment` (`record_formative_assessment`/`list_formative_assessment_logs_for_assignment`), `FormativeAssessmentApplicationService`/`TauriFormativeAssessmentRepository` wired in `composition.ts`, `FormativeAssessmentScreen` reachable from the "Daily Teaching" nav group (axe-clean, ESRU rating always shown as the bare letter with the gloss word explicitly flagged unverified per `docs/product/OWNER-DECISIONS-NEEDED.md` item 3), and full Batch 6/9-pattern sync wiring (`EntityKind::FormativeAssessmentLog`, `upsert_from_sync`, sync-aware command enqueue, `apply_decrypted_change` arm, conflict-review typed preview) — no natural-key-collision test needed (no natural key beyond `id`, see ADR-0082 Decision 3). `cargo test`/`cargo clippy --all-targets -- -D warnings`/`cargo fmt --check` and `npm run quality` all pass.
- [x] **Student ID Card Generator:** Front/back printable student ID cards with photos, emergency contacts, and tokenized QR verification codes. **Batch 5:** offline-only HMAC token generate/verify engine shipped and tested (`src/domain/id-card-token.ts`), ADR-0077 resolves the cloud-vs-offline audit question conservatively as offline-only. **Batch 8 item 7 (2026-09-08):** `IdCardScreen` shipped and wired — front/back printable layout, explicit photo-placeholder (real photo storage deliberately NOT decided here, flagged in the UI), token shown as plain text (no QR-rendering dependency added — checked `docs/SOURCE-REGISTRY.md` first, nothing added), session-local non-persisted signing key (real device/school-bound secret sourcing still deferred, per `id-card-token.ts`'s own scope note). Tested (`IdCardScreen.test.tsx`, axe-clean).

---

## Tier 4: Offline Reliability & Synchronization

### 4.1 Sync Scope Expansion

- [x] `LessonPlan` -- wired end to end (migration 47, `EntityKind::LessonPlan`, `upsert_from_sync`, sync-aware `create`/`update` commands, natural-key-collision test). Commit `1fab715`.
- [x] `NutritionRecord` (SF8) -- wired end to end (migration 48, create-only, natural-key-collision test on `UNIQUE (learner_id, school_year, period)`). Commit `b6ad48e`.
- [x] `BehavioralIncident` + `IncidentIntervention` (DO 006 Child Protection) -- wired end to end (migration 49, both create-only; no distinct natural key beyond `id` on either table, stated explicitly and tested; `authorize_child_protection_access_for_section` verified to survive unchanged through the sync path). Commit `b6ad48e`.
- [x] `GradeSubmission` + `GradeSubmissionNote` (interim Multi-Tier Review & Audit Pipeline) -- wired end to end (migration 50; `submit`=create, `decide`=update+optional note, both atomic with their note enqueues; natural-key-collision test on `UNIQUE (class_record_id, submitted_at)`). Commit `f85d91d`.
- [x] Conflict-review screen generalization -- proved the resolution mechanism was already generic across every `EntityKind`; found and fixed a real gap in the PREVIEW half (`decrypt_preview` returned `None` for every entity kind added after the screen shipped, which the frontend's own gating treated as "cannot resolve" -- the "use incoming" button was silently disabled for all six entities above). Fixed with a `ConflictEntityPreview::Unknown` fallback (Rust) and a matching `{ kind: "unknown" }` TS variant, so every wired entity is now resolvable via the UI, even before it gets a dedicated field-level preview. Commit `01d0ac7`.
- [x] Conflict-review typed field-level previews for the six entities that fell back to `Unknown` -- `LessonPlan`, `NutritionRecord`, `BehavioralIncident`, `IncidentIntervention`, `GradeSubmission`, `GradeSubmissionNote` each now have a dedicated `ConflictEntityPreview` variant (Rust `commands::conflict_review` + mirrored TS `domain/conflict-review.ts`/`ConflictReviewScreen.tsx`) showing real field values (competency text, height/weight, incident description, submission status, etc.) on both the incoming and local sides, not just "Unknown, but resolvable." Added two small repository lookups needed for the local-side preview (`child_protection::find_intervention_by_id`, `grade_submission::find_note_by_id` -- neither entity previously had a find-by-own-id function since only their append-only list-by-parent queries existed). `Unknown` remains only as the fallback for a future entity kind wired to sync before its own preview lands (exercised by a new test against `Subject`, replacing the old test that used to prove this against `LessonPlan` before this slice gave it a typed preview). Batch 8, item 8.
- [x] `SchoolLogo` / Branding bytes -- **Batch 10 (2026-09-08, ADR-0081)**: `MAX_LOGO_BYTES` shrunk from 512 KiB to 48 KiB (byte-budget math in the ADR: worst-case JSON-array-of-numbers encoding of the raw bytes since this crate deliberately does not add a `base64` direct dependency, plus the small JSON field wrapper, plus AES-256-GCM's 28-byte nonce+tag overhead, solved against a 200 KiB safety-margin target, ~25% headroom under the real 256 KiB cap) rather than building a new binary-safe payload path -- a judgment call made in the owner's absence per their instruction, disclosed as an FYI in `docs/product/OWNER-DECISIONS-NEEDED.md` item 5. Wired end to end: migration 54 (entity_kind CHECK widening), `EntityKind::SchoolLogo`, `repository::school::SchoolLogoSyncRecord`/`upsert_logo_from_sync`/`find_logo_by_id` (entity_id IS school_id -- a logo has no row id of its own, a school-scoped singleton), sync-aware `set_school_logo`/`clear_school_logo` (the second entity, after `TeachingAssignment`, to use `ChangeOperation::Delete`), `apply_decrypted_change` arm, `ConflictEntityPreview::SchoolLogo { mime, byte_len }` (deliberately omits the raw bytes from the preview). ADR-0070's structural-lock-PIN gate verified to survive completely unchanged -- runs before any sync code in both commands, no code path skips it. `cargo test`/`cargo clippy --all-targets -- -D warnings`/`cargo fmt --check` and `npm run quality` all pass.
- [ ] `scholastic_history_records` (DepEd `.xlsx` multi-year importer) -- **deferred, matches an established precedent, not an oversight**: `scholastic_history::insert` has exactly one caller, `import::scholastic::commit_scholastic_import`, a bulk-import transaction over potentially many rows. `sync_client.rs`'s own module doc comment already establishes that this codebase deliberately leaves bulk/import write paths unwired to sync (e.g. the SF1 CSV `enroll` primitive) in favor of the typed, single-row verbs a screen actually drives. There is no other write path for this entity to wire instead.
- Anecdotal Records and Schedule Grids: no persisted entity exists yet for either (Anecdotal Records was confirmed not built in the 2026-09-07 audit, referenced in the Batch 5 Certificate & Recognition entry above) -- nothing to wire until the entity itself is built.
- **Sync Resiliency & Edge Cases:**
  - Natural key collision handling confirmed generic and now tested across nine entities total (`Subject`/`Section` originally, plus `LessonPlan`, `NutritionRecord`, `GradeSubmission` this batch) -- `BehavioralIncident`/`IncidentIntervention`/`GradeSubmissionNote` were confirmed to have NO distinct natural key to collide on (their only uniqueness is `id`), so no collision test applies to those three; this is stated explicitly in each's own repository doc comment rather than left implicit.
  - Multi-device simultaneous conflict resolution UX.

---

## Tier 5: Maintainability & Verification Debt

### 5.1 Verification Debt Reduction

**Batch 7 (2026-09-08):** audited, not implemented -- none of these
three items is safely actionable as feature work in this sandbox (real
hardware, a new-platform architecture decision, and an owner-provided
prerequisite respectively). See `docs/VERIFICATION-DEBT.md`'s 2026-09-08
Batch 7 entry for the full audit; still unchecked and blocked below.

- [ ] **Native Visual & Screen-Reader Inspection:** Comprehensive screen-reader pass on the native Windows WebView2 binary with NVDA and Windows Narrator across all 25+ screens. Still open -- one narrow, real, human-driven NVDA walkthrough happened 2026-09-07 covering a handful of screens (not exhaustive, no saved transcript); every screen shipped since (Batches 3-7, including `SectionTimetableScreen` and the redesigned shell) has zero native visual/screen-reader verification, only automated `axe-core` structural checks. Blocked on real Windows hardware/screen-reader access, same as prior sessions -- not attempted or simulated.
- [ ] **Android Platform Architecture Proof:** First Android build target, secure key storage adapter, and touch-optimized layout proof. No code/config started (correctly, per `CLAUDE.md`'s "Windows first; Android later" and the 10-scenario process this new-platform decision requires). A scoping note (not a decision) listing what the real decision needs to weigh -- secure-storage adapter options, touch-layout audit of the existing shell, Tauri Android toolchain, zero-billing distribution -- is recorded at `docs/research/2026-09-08-android-architecture-scoping.md`.
- [ ] **Official School Repository Prerequisites:** Awaiting school-owned Microsoft 365 tenant confirmation and privacy review before implementing SharePoint sync. Spec already approved (`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`); zero integration code exists. This is a genuine human approval gate (external material only the project owner can provide) -- stays open until the owner confirms a tenant.
