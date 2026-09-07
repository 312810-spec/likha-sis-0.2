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
* **Sync Payload Encryption & Key Rotation** (`hub_server::payload_key_wrap_handler`, `repository::sync_payload_key`): Needs fresh-context independent review.
* **Device Revocation & Key Rotation** (`db::rotate_sspk`): Needs independent review.
* **In-App School Branding Logo Upload** (`set_school_logo` BLOB/MIME handling): Currently self-reviewed only; needs independent review.

### 1.2 Sync Production Security & Hardware Gates (ADR-0067)
* **School-Laptop Hub Daemon/Service Resilience:** Windows service relaunch / reboot persistence behavior for the hub laptop is not yet hardened.
* **Hub Hardware Gates:** Operational validation of BitLocker, firewall rules, and patch management on the physical hub machine.
* **Disaster Recovery Drill:** Two-copy encrypted backup creation and witnessed restoration drill not yet executed.
* **Secondary PIN Lock (from `likha-sis-master`):** Port `settingsLock.js` (Web Crypto PBKDF2-SHA256, 150,000 iterations) to protect school identity, curriculum tracks, and calendar structures from accidental edits or unattended terminals.

---

## Tier 2: Correctness & Compliance (DepEd Orders)

### 2.1 Authoritative School Forms (SF) Engine
* **SF1 (School Register):** Current engine proven against synthetic templates; needs field-verified alignment against authoritative DepEd SF1 template.
* **SF9 (Learner Progress Report Card):** Authoritative-template, 3-term-aware, duplex-printable SF9 layout (current export is CSV-inspired).
* **SF10 (Learner's Permanent Academic Record):** Multi-year scholastic history export with controlled correction provenance (current is CSV-inspired).
* **DepEd Form 137 / 138 Reconciliation:** Triangulate SF9/SF10 naming and layout with historical Form 137/138 requirements.

### 2.2 SF8 Health & Nutrition Engine (Port from `likha-sis-master`)
* **WHO/DepEd BMI & HFA Calculator:** Decimal age in months calculator + WHO/DepEd BMI-for-Age and Height-for-Age lookup tables (`nutritionComputations.js`).
* **BOSY vs. EOSY Consolidation:** School-wide baseline vs. endline nutritional consolidation report (`nutritionConsolidation.js`).

### 2.3 DO 006, s. 2026 Child Protection & Automated At-Risk Triggers
* **3-Tier Behavioral Incident Logging:** DO 006 safe environment classification.
* **Multi-Silo Automated Risk Detection (`autoFlagTriggers.js`):** Automatically flag learners at risk without manual searching:
  - *Academic:* Initial grade $< 70$ (early DO 015 intervention) or General Average $< 75$.
  - *Health:* Nutrition status Wasted/Severely Wasted/Obese.
  - *Attendance:* Attendance rate $< 80\%$.
* **Append-Only Intervention Log & Auto-Resolution:** Intervention documentation + remediation progress tracking.

### 2.4 Multi-Year Scholastic Importer (`.xlsx`)
* **DepEd `.xlsx` Spreadsheet Parser:** Ingest official DepEd workbooks directly into learner profiles and past academic records (SF10) using SheetJS rather than manual entry.

### 2.5 Multi-Tier Review & Audit Pipeline
* **Master Teacher Review Workflow:** Teacher quarterly grade submission $\rightarrow$ MT audit checks (missing summative scores, out-of-bounds values, weight group mismatches) $\rightarrow$ Approve or Reject with feedback notes.
* **Principal Overview Dashboard:** School-wide composite grade view, submission status matrix, and formal SF sign-offs.

---

## Tier 3: Teacher Usability & UI/Theme Engine Replication

### 3.1 UI & Theme Engine Replication (Replicating `likha-sis-master`)
* **Persistent Two-Tier Layout Shell (`DashboardShell`):**
  - Brand-filled collapsible sidebar (`w-64` expanded, `w-20` collapsed with CSS tooltips) with Ledger Gold section labels.
  - Sticky translucent header (`backdrop-blur-sm bg-white/90 dark:bg-gray-900/90`) featuring Fraunces serif page title, live tabular clock, 3-way theme toggle (`Light`/`System`/`Dark`), notification bell with unread badge counter, and user profile avatar.
* **"Ledger Pairing" Typography System:**
  - Page-level `<h1>`/`<h2>` in [Fraunces](https://fonts.google.com/specimen/Fraunces) editorial serif (`font-display`).
  - Interface controls and tables in Public Sans.
  - Aligned numbers, clocks, and grade columns in [IBM Plex Mono](https://fonts.google.com/specimen/IBM+Plex+Mono) (`font-tabular`).
* **Dynamic Logo Palette Extractor (`ColorThief`):**
  - Auto-extracts Dominant, Vibrant, and Alternate palette sets from uploaded school logos.
  - Auto-derives WCAG AA-compliant dark surface variables (`--dm-*`) and legible text ink (`buildTextOnRoles`).
* **Card Elevation & Depth:**
  - `8px` (`rounded-lg`) inputs/buttons, `12px` (`rounded-xl`) cards with soft ambient shadow and hover lift (`-translate-y-0.5`).

### 3.2 Visual Timetable & Class Program Builder (from `likha-sis-master`)
* **Visual Schedule Grid:** Interactive drag-and-drop / click-to-arm timetable builder.
* **Real-Time Conflict Detection:** Double-booking, room overlap, and subject hours validation (`scheduleConflicts.js`).
* **One-Click Auto-Seed Wand:** Auto-distribute subject minutes into section slots (`scheduleSeeding.js`).
* **Derived Teacher Load:** Automatically compute individual Teacher's Load sheets on read from section timetables (`teacherLoadDerivation.js`).

### 3.3 Teacher Creation Studio Remaining Deliverables
* **Sub-scope 2.2: Certificate & Recognition Template:** Printable DepEd Academic Excellence Award certificate generator with automated DO 015 honors qualification engine.
* **Sub-scope 2.3: Custom Seating Chart:** Drag-and-drop section seating arrangement tool reusing class rosters.

### 3.4 Operational Classroom & School Productivity Tools
* **School Calendar & Philippine Holidays:** Offline database of regular, non-working, and Islamic holidays (`philippineHolidays.js`).
* **Weather & Hazard Suspension Alerts:** Hyper-local Open-Meteo integration via school coordinates; flags severe weather suspension warnings ($>30\text{ mm}$ rain, $>50\text{ kph}$ wind).
* **Transfers In/Out Documentation Registry:** Formal ledger tracking student transfer dates, receiving/originating schools, and document statuses.
* **Consolidated Grades Matrix:** Cross-subject grade registry displaying all learning areas side-by-side per section across all terms.
* **Student ID Card Generator:** Front/back printable student ID cards with photos, emergency contacts, and tokenized QR verification codes.

---

## Tier 4: Offline Reliability & Synchronization

### 4.1 Sync Scope Expansion
* **Remaining Unwired Sync Entities:**
  - `LessonPlan` (currently local only).
  - `SchoolLogo` / Branding bytes.
  - New incoming entities (Anecdotal, Nutrition/SF8, Schedule Grids).
* **Sync Resiliency & Edge Cases:**
  - Natural key collision handling is generic but needs systematic testing across all remaining entities.
  - Multi-device simultaneous conflict resolution UX.

---

## Tier 5: Maintainability & Verification Debt

### 5.1 Verification Debt Reduction
* **Native Visual & Screen-Reader Inspection:** Comprehensive screen-reader pass on the native Windows WebView2 binary with NVDA and Windows Narrator across all 25+ screens.
* **Android Platform Architecture Proof:** First Android build target, secure key storage adapter, and touch-optimized layout proof.
* **Official School Repository Prerequisites:** Awaiting school-owned Microsoft 365 tenant confirmation and privacy review before implementing SharePoint sync.
