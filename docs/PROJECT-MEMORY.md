# PROJECT MEMORY

## Purpose

Durable project facts only. Do not use this as a transcript.

## Product

LIKHA-SIS 0.2 is a native-first, local-first, offline-capable SIS for Philippine DepEd schools.

Primary targets:

- Windows desktop
- Android mobile

Shared stack:

- React
- TypeScript
- Tauri 2

## Locked Principles

- Privacy/security is highest priority.
- Synthetic data only in development, testing, screenshots, fixtures, demos, and AI-assisted work.
- SQLite is the device working database.
- Offline writes persist locally immediately.
- Synchronization is a separate subsystem.
- Provider-specific infrastructure stays behind interfaces/adapters.
- UI/domain must not depend directly on cloud providers.
- Zero-billing-oriented; no paid services without explicit approval.
- Comfortable is the default teacher interface mode.
- Efficient / Comfortable / Guided retain functional parity.

## Architecture

UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud

## Current Foundation

Greenfield repository. No old implementation is authoritative.

- **`main` verified baseline (2026-08-26): `3951c3d`.** Fast-forward
  integration of `claude/likha-sis-ux03-plan-plv80c` (30 commits: RBAC
  Foundation, Curriculum/Key-Stage Versioning, Teacher Load/Class
  Schedule Foundation, the `windows-future` target-gating fix, Rust
  formatting normalization, Minimal CI Foundation) — no merge commit,
  no squash. CI green on `main` itself (Ubuntu + Windows). Previous
  baseline: `f02bce5`. See `docs/adr/0035` through `0041` and
  `docs/CURRENT-HANDOFF.md`'s Integration Review entry for full detail.
- **Minimal CI Foundation (2026-08-26)**: `.github/workflows/quality.yml`
  runs `npm run quality:full` on `ubuntu-latest` and `windows-latest`
  (GitHub-hosted standard runners) on push/PR/manual dispatch,
  proven green on both after fixing a real Ubuntu-side gap (Tauri's
  Linux GTK/glib apt dependencies). This repo is **public**, so
  standard-runner minutes — Windows included — are free/unmetered per
  GitHub's own billing docs; no spending-limit configuration was
  needed. See `docs/adr/0041-minimal-ci-foundation.md`.

- M0 Workspace Foundation (React + TypeScript + Vite + Tauri 2, strict
  TypeScript, ESLint, Prettier, Vitest, `npm run quality`) is complete.
- M1 LocalDatabase Foundation is complete: all SQL lives in the Rust core
  (`src-tauri/src/{db,repository,commands,error}.rs`) behind narrow Tauri
  commands — the frontend never sends SQL, not even parameterized SQL.
  Decision and rationale: `docs/adr/0002-local-database-foundation.md`.
  UI/application code depends only on `src/domain/ports/*`, implemented by
  `src/infrastructure/tauri/*`.
- M2 Encryption-at-Rest is complete: the working SQLite database is
  SQLCipher-encrypted with a raw 256-bit key protected by Windows DPAPI,
  fail-closed on a corrupted/undecryptable key file (never silently mints
  a replacement key). Decision and threat-model notes:
  `docs/adr/0003-encryption-at-rest.md`. Building `src-tauri` now requires
  Perl (Strawberry Perl) on the machine, for vendored OpenSSL.
- M3 Application Services Foundation is complete:
  `src/application/{school,learner}-service.ts` validate input (trim,
  non-empty, max length) before calling a repository — new TS entities
  should follow this pattern rather than calling a repository port
  directly from UI code.
- M4 Authentication & Local Session Foundation is complete. Deployment
  model (authoritative, from the user): shared school computers, multiple
  teachers, no 1:1 Windows-account assumption — each teacher has an
  independent LIKHA username+password identity. Argon2id hashing, local
  offline auth, session tied to identity + school scope. `school_id` is
  never a client-supplied argument for tenant-data commands — it's always
  derived from the authenticated session
  (`SessionManager::require_active_school_scope`), which never survives a
  process restart. Any new command that creates accounts/memberships or
  touches tenant data must follow the authorization pattern in
  `docs/adr/0004-authentication-and-local-session.md` — an earlier draft
  of this milestone shipped an unauthenticated bootstrap path that let
  anyone self-grant access to an existing school; caught by review and
  closed. No roles/permissions system yet, deliberately.
- M5 App Shell & First Learner UI Vertical Slice is complete: the first
  real screens (`src/ui/{AppShell,LoginScreen,LearnerListScreen}.tsx`),
  wired through a composition root (`src/composition.ts` — the only file
  allowed to import concrete `infrastructure/tauri/*` classes) and the
  Efficient/Comfortable/Guided teacher modes (`src/ui/theme/`), now
  actually working (Guided shows real contextual help other modes don't,
  not just bigger text). Decision and review findings:
  `docs/adr/0005-app-shell-and-first-ui-slice.md`. This session's
  environment has no browser/screenshot/rendering tool — nothing about
  actual visual appearance was or could be verified; only structural/
  accessibility/behavioral testing (React Testing Library + `axe-core`)
  and computed WCAG contrast ratios. A human visual/screen-reader pass on
  the running app is still owed.
- M7 Attendance Tracking is complete: a teacher can mark each learner in
  their school Present/Absent/Late/Excused for a given date (defaulting
  to today, future dates disallowed) and view the full roster for that
  date, including unmarked learners. `src-tauri/src/repository/attendance.rs`
  (`record`/`roster_for_date`), `commands/attendance.rs`, migration 4
  (`attendance_records`, one row per learner+date via
  `UNIQUE(learner_id, attendance_date)` with an upsert). Follows the M5
  `learner` slice's layering exactly — no new architectural decision.
  Deliberately out of scope: official DepEd form export (SF2), bulk
  marking, date-range reporting.
- M8 Monthly Attendance Summary is complete: a school-wide monthly
  overview (school-day-only columns, per-learner totals),
  `repository::attendance::monthly_grid`, `commands::monthly_attendance_summary`,
  no new migration. Selected via an autonomous 20-scenario product-
  decision process (`docs/product/M8-DECISION.md`), not user-picked.
  **Important, evidence-based (from a real DepEd `CONSO SF v2025.xlsx`
  the user provided — structural facts extracted, no real PII copied
  into this repo)**: the official SF2 form is organized per section/
  grade level, which this schema did not model at the time (`School` had
  only `id`/`name`/`created_at`); and DepEd's actual per-day attendance
  codes are just Present(blank)/Absent(x)/Tardy(shaded) — there was no
  official 4th "Excused" code the way this app's model had. M8 was
  therefore explicitly labeled on-screen as SF2-_inspired_, not a
  verified official-template reproduction. **Both gaps are closed by
  M9** — see below; `monthly_grid`/`monthly_attendance_summary` are now
  `monthly_grid_for_section`/section-scoped, and the status model is now
  the real 3-code one.
- M9 Section Foundation + DepEd Attendance Semantic Alignment is
  complete: `sections` and `section_memberships` tables (migration 5),
  scoped attendance recording/rosters/monthly-summary now require a
  `section_id`, and the attendance status enum is the real DepEd 3-code
  set (Present/Absent/Tardy — `Excused` retired, `Late` renamed to
  `Tardy`). Redirected mid-session from the previously-decided "Learner
  Profile Enrichment" (now the leading M10 candidate, not cancelled) —
  see `docs/product/M9-DECISION.md` for why, and
  `docs/adr/0008-section-foundation-and-attendance-semantics.md` for the
  full technical decision. Membership is a half-open
  `[starts_on, ends_on)` interval per learner, with "at most one open
  membership per learner" enforced as a real unique partial index (not
  application-level check-then-act — this project has shipped that exact
  race twice before, see M4/M6). Minimal TS/UI: `SectionsScreen.tsx`
  (create a section, enroll a learner) plus a section picker added to
  `AttendanceScreen`/`MonthlySummaryScreen` — the minimum needed for
  those screens to remain reachable now that they require a section, not
  full section-roster management.
- M10 Local Section-Level SF2 Export + Reusable Official-Form Engine
  Foundation is complete: a teacher can export a section's monthly
  attendance as a DepEd-SF2-inspired CSV, saved to
  `Documents\LIKHA-SIS\`. User-directed pick, not autonomously selected.
  Field layout triangulated against DepEd Order No. 4, s. 2014 plus two
  independent web sources plus M8's real workbook — see
  `docs/adr/0009-sf2-export-and-official-form-engine.md` for the full
  citation trail. Every field this schema cannot honestly populate
  (School ID, enrollment/dropout/transfer statistics, gender, per-learner
  remarks, the late-comer/cutting-classes Tardy subtype) is disclosed via
  a `FieldDisclosure` struct computed once in Rust and rendered both as a
  trailing CSV comment block and the on-screen disclaimer — single
  source, cannot drift. No zero-filled placeholder statistics: emitting
  "0 dropouts" for data never tracked was treated as a compliance risk,
  not an acceptable gap. Reusable pieces for future official-form
  exports: `export::csv` (dependency-free CSV writer) and the
  `FieldDisclosure` pattern itself — deliberately not a generic
  form-definition framework, since only one form exists so far.
  Independent review (one `security-reviewer` episode, succeeded on its
  resume-retry) found two real should-fix issues, both fixed: CSV/formula
  injection via a leading `=`/`+`/`-`/`@`/tab in teacher-entered fields
  (mitigated with the standard leading-`'` neutralization), and an
  unstripped `:` in the exported filename (Windows/NTFS ADS risk) — see
  `docs/adr/0009-sf2-export-and-official-form-engine.md`.
- M11 Grading-Period Foundation is complete: policy-driven, versioned
  `GradingPolicy`/`GradingPolicyPeriod`/`GradingPeriod` (migration 6).
  DepEd's grading-period terminology genuinely changed within this
  project's own lifetime — DepEd Order No. 9, s. 2026 shifted Basic
  Education from four quarters to three terms for SY 2026-2027 onward —
  so period _labels_ are seeded reference data with their own source
  citation (two policies: three-term, seeded as default; legacy
  four-quarter), never hardcoded into application logic, and period
  _dates_ are always school-entered (this app has no source for any
  individual school's actual calendar). User-directed pick (named as the
  explicit next-best alongside M10's own direction), not autonomously
  selected. See `docs/adr/0010-grading-period-foundation.md`. No grade
  computation or gradebook yet — DepEd's Written Work/Performance
  Task/Quarterly Assessment weighting formula was not researched this
  milestone, deliberately out of scope.
- M12a Gradebook/Class Record Foundation is complete: `Subject`
  (school-scoped reference data) and `ClassRecord` (migration 7) joining
  one `Section` + one `Subject` + one `GradingPeriod`. User directed the
  full M12/M13/M14 roadmap in one message; per advisor consultation, M12
  was split into phases (M12a foundation, M12b assessment items/scores,
  M12c keyboard/mobile/audit polish) so M13's computation research
  doesn't force a rework of a schema built in one pass. `ClassRecord`
  intentionally stores no `school_year` of its own — `class_record::create`
  verifies the section's and grading period's `school_year` match before
  inserting, so there is one source of truth rather than two values that
  could silently drift. See
  `docs/adr/0011-gradebook-class-record-foundation.md`. No assessment
  items, scores, or grade computation yet.
- M12b Assessment Items and Learner Scores is complete: assessment
  items (migration 8) categorized under versioned reference data
  (`assessment_category_sets`/`assessment_categories`, mirroring M11's
  `grading_policies` pattern exactly) — this milestone's own inline
  research found DepEd Order No. 8, s. 2015's Written Work/Performance
  Task/Quarterly Assessment terminology has been repealed by DepEd
  Order No. 015, s. 2026 (renamed to Written Works/Performance
  Tasks/Examinations), confirming category naming genuinely is
  policy-driven, not stable. `learner_scores` follows
  `attendance_records`' idiom: absence of a row means "not yet
  recorded," not a fourth status value; a `Scored` status requires a
  score within `[0, max_score]`, checked in Rust since SQLite `CHECK`
  can't reference another table. Eligibility to be scored is checked
  against the grading period's actual date range (reusing
  `roster_for_section_over_range` from M8), not a single date. Every
  score is attributed to `SessionManager::require_active_session()`'s
  own `user_id` — a new method alongside the existing
  `require_active_school_scope()` — never a client-supplied value. See
  `docs/adr/0012-assessment-items-and-scores.md`. No grade computation
  yet (M13).
- M12c Score-Entry Keyboard/Mobile/Audit Polish is complete:
  `ClassRecordWorkspace.tsx`'s score input is now always the primary
  control (typing a number always implies `Scored`, matching the domain
  rule M12b already established); Enter/ArrowDown/ArrowUp commit-and-move
  focus spreadsheet-style between learners' score fields, Escape reverts
  an uncommitted edit, blur commits, and an unchanged/emptied value is
  never re-sent (dirty-check; emptying a field never erases a saved
  score — Excused/N/A must be chosen explicitly). A real re-entrancy bug
  (programmatic focus-move firing a synchronous `blur` that re-triggered
  the same commit before the first call's cleanup ran) was caught by this
  milestone's own new test and fixed with an imperative `useRef` guard —
  a plain React-state dirty-check could not reliably catch it, since
  state updates don't necessarily re-render before a synchronous DOM
  event fires. At `max-width: 640px` the roster table re-flows to
  stacked, 44px-touch-target rows instead of shrinking — the first
  deliberately mobile-specific CSS in this app (no prior responsive
  breakpoint existed anywhere in `src/ui/theme/styles.css`). UI-only, no
  schema/repository/command changes. See `docs/ACTIVE-PLAN.md`'s "M12c"
  section and the M12c update in `docs/adr/0012-assessment-items-and-scores.md`.
- M13 DepEd Grade Computation is complete: researched against the
  primary source directly (downloaded and visually transcribed the
  actual DepEd Order No. 015, s. 2026 PDF — 60 pages, scanned, no text
  layer — not a secondary summary), verified against two of the Order's
  own worked examples reproduced exactly end-to-end.
  `IG = Σ(PS × weight%)` per category (`PS` = pooled raw/max scores × 100,
  not item-averaged); SY 2026-2027 uses the Order's own 41-band Adjusted
  Transmutation Table (Rust constant data, not DB-seeded), SY 2027-2028
  onward uses the Zero-Based Grading System (`TG = round(IG)`, no
  transmutation) — selected from the already-existing
  `grading_periods.school_year` field. Examinations is not a flat pooled
  category like Written Works/Performance Tasks — it's composed of
  Summative Test 1/2 + Term Examination (30/30/40), modeled via a new
  nullable self-referencing `parent_category_id` on `assessment_categories`
  (chosen over a separate join table via the 10-scenario process — see
  `docs/adr/0013-deped-grade-computation.md`) so an ST1/ST2/TE item is
  created through the exact same `assessment_item::create` path as any
  other item, and `assessment_item::create` now rejects creating an item
  directly under a parent category. Weights are versioned reference data
  (`grading_weight_policies`/`grading_weight_components`, same "at most
  one default" pattern as `grading_policies`/`assessment_category_sets`) —
  only ONE DepEd weight group is implemented (core K-10
  English/Filipino/Math/Science/AP/GMRC, 20/50/30); EPP/TLE & MAPEH, all
  SHS groups, GMRC/VE's domain split, KS1 descriptive grading, and Grade
  12's DO 8 s. 2015 carryover are explicitly not implemented — DO 8's
  exact percentages could not be confirmed from a primary source this
  session and were deliberately not guessed at. A learner's grade is
  reported as "not yet computable" (this app's own interpretation, not
  DepEd's) until every weighted category has at least one `Scored` item,
  never fabricated from partial data. See
  `docs/adr/0013-deped-grade-computation.md`.
- M14 Report Card / Official Grade Output is complete: a class record's
  computed term grades export as CSV, reusing M10's `export::csv`/
  `FieldDisclosure` architecture (that struct moved from `export::sf2` to
  the shared `export::mod` for reuse). This export is **not gated** per
  DepEd weight group — `Subject` has no weight-group classification and
  `compute_term_grade` already applies the one seeded policy uniformly,
  so there was nothing to gate on; instead it inherits M13's own
  disclosure-not-refusal choice, with an always-visible (not
  Guided-mode-only) on-screen warning, since the limitation is
  correctness-affecting for every teacher mode. Every roster learner
  gets a row, including an explicit "Not yet available" marker rather
  than a silent drop for one whose grade isn't computable yet. See
  `docs/adr/0014-report-card-export.md`.
- M15 Expand DepEd Grading Policy Coverage is complete: a class record
  now explicitly pins which DepEd weight policy applies
  (`class_records.weight_policy_id`, migration 11 — nullable for
  migration safety, resolved via `class_record::resolved_weight_policy_id_in_school`'s
  COALESCE-to-default lookup) instead of every class record silently
  sharing whichever policy is marked default. This closes the exact gap
  ADR-0014 flagged as "not currently buildable" — the fix was an
  explicit per-_class-record_ pick (teacher-set at creation, same
  "explicit not inferred" pattern as `grading_period_id`), not a
  `Subject`-level classification (still not built, still would require
  guessing a subject-name-to-DepEd-group mapping). A second policy is
  now seeded: EPP/TLE & MAPEH (20%/60%/20%, DO 015 s.2026 Table 9's
  second row, from the same primary-source PDF reading M13 already did).
  Proven with a test giving identical raw scores to both policies and
  asserting the results differ, not just inspection. **Correction**:
  ADR-0013/0014 over-flagged "GMRC/VE's domain split" as a
  grade-correctness gap — GMRC/VE is already inside the K-10 core weight
  group (same 20/50/30), so those grades were already DepEd-compliant
  since M13; the domain split is an assessment-design tagging feature,
  not a different formula. See
  `docs/adr/0015-expand-grading-policy-coverage.md`.
- **User-directed roadmap (2026-08-24)**: M15 (mainstream K-10 grading
  coverage) → M16 (SHS + exceptional grading policies) → M17 (Learner
  Profile Enrichment, when required by report cards/forms) → M18 (Bulk
  Attendance / Teacher Productivity) → Roles & Permissions once the
  needed human product decisions are settled.
- M16 SHS + Exceptional Grading Policies is complete: all six DepEd
  Order No. 015, s. 2026 Table 10 (Key Stage 4/SHS) weight groups added
  as pure seed data (migration 12) — zero changes to
  `grading_computation::compute_term_grade`'s algorithm and zero TS/UI
  changes at all, since the weighting picker and policy-name display
  were already fully data-driven. Empirically confirms ADR-0015's own
  "purely additive" prediction, including for two structurally
  exceptional shapes proven correct by new end-to-end tests, not just
  asserted: Field Exposure/Arts Apprenticeship/Creative Production
  weights Examinations as a Term Examination only (no Summative Tests —
  one child weight row instead of three); Research Electives/Design and
  Innovation and Work Immersion have no Examinations component at all
  (no weight row seeded for it — the algorithm's existing "skip whatever
  a policy doesn't weight" behavior handles this without modification).
  These policies apply to Grade 11 (and Grade 12 only once it adopts the
  Strengthened SHS Curriculum); DepEd itself defers detailed SHS
  item-level specifications to a separate, not-yet-obtained issuance.
  See `docs/adr/0016-shs-and-exceptional-grading-policies.md`.
- M17 Learner Profile Enrichment (LRN + Sex only) is complete: added
  exactly the two learner-profile fields this app's own shipped exports
  (`export::sf2`, `export::report_card`) actually need, verified against
  two independent secondary sources per field describing DepEd's real
  SF2/SF9 templates -- not the full original M9-era "LRN, birthdate,
  guardian contact" list. Birthdate and guardian contact were
  deliberately not added: no shipped export discloses either as missing,
  so adding them would have been unverified PII expansion, which
  `.claude/rules/security-privacy.md` prohibits. Both fields are
  nullable (`learners.lrn`, `learners.sex`, migration 13) with
  database-level format enforcement, not just application-layer
  validation. See `docs/adr/0017-learner-reference-number-and-sex.md`.
- M18 Bulk Attendance / Teacher Productivity is complete: `AttendanceScreen`
  gained a "Mark all present" button (`repository::attendance::bulk_mark_present`)
  that marks every currently-unmarked roster learner Present in one
  action and never overwrites an existing mark -- proven by a dedicated
  test, not just asserted. Checked first whether an unmarked day already
  behaves like Present anywhere in this app (it does, in SF2's export
  rendering/totals) -- the feature's real value is auditability (a
  `recorded_at` timestamp proving the day was checked), not export
  correctness. Reuses the existing isolation-checked `record()`/
  `roster_for_section_date` paths; no new authorization surface. This
  was the first milestone continued fully autonomously under Autonomous
  Continuous Development Mode -- no fresh user instruction was given
  between M17's completion and M18's start. See
  `docs/adr/0018-bulk-attendance-mark-all-present.md`.
- `LearnerListScreen` gained an inline "Edit" affordance per learner
  (given/family name, LRN, Sex, Save/Cancel), wired to the
  `updateProfile`/`updateLearnerProfile` plumbing that M17 built but left
  unused — closing that milestone's own disclosed gap (a learner
  enrolled before M17, or without LRN/Sex filled in at enrollment, had
  no way to gain them). No schema/repository/command change; UI-only,
  same `require_active_school_scope` isolation as every other
  learner-touching command.
- Roles & Permissions -- resolved (2026-08-24): the user was asked
  directly and answered "keep deferring" (current single-role model
  stays; if revisited later, the starting role model is Teacher +
  Registrar + School Head -- see `docs/product/M8-DECISION.md`'s
  follow-up section). The user also stated a standing preference for
  how autonomous work should proceed from here: when Claude reaches a
  decision with a reasoned "recommended" option, pick it automatically
  and continue rather than pausing to ask -- the user will review and
  adjust afterward once a batch of milestones is done.
- Account Lockout After Failed Logins is complete: five wrong passwords
  against one known username locks it for 15 minutes (immediate
  feedback on the triggering attempt), a locked account is rejected
  without even running Argon2id, a successful login resets the counter,
  and an unknown username is completely unaffected (same generic
  failure as always -- no new enumeration surface for that case).
  Autonomously selected from `docs/product/M8-DECISION.md`'s own
  20-scenario list (already scored, not disqualified like Roles &
  Permissions -- a lockout threshold is a standard security default,
  not an organizational policy choice). See
  `docs/adr/0019-account-lockout.md`.
- Idle-Timeout Session Hardening is complete: a session now also expires
  after 30 minutes of no protected-command activity, independent of the
  existing fixed 8-hour absolute cap (ADR-0004) -- both must hold for a
  session to stay active. Only the one check every protected command
  already goes through (`SessionManager::require_active_session`) counts
  as activity and slides the window forward; a session-status peek
  (`current_session`) deliberately does not, or idle timeout could never
  fire. Closes the other half of the shared-school-computer threat model
  ADR-0004 explicitly deferred, alongside account lockout. See
  `docs/adr/0020-idle-timeout-session-hardening.md`.
- Independent-review agent-resume issue recurred (2026-08-24):
  `teacher-ux-reviewer`/`accessibility-reviewer` dispatched for the
  M12c-M18 UI both did real work but returned no retrievable findings.
  Self-review performed instead, catching two real UX/accessibility
  fixes in `LearnerListScreen`'s edit affordance (focus management;
  silent discard of unsaved edits when switching rows) -- but the
  broader M12c-M18 UI sweep those agents were meant to cover remains
  real, undischarged review debt.
- As of this note, work since the M0 commit is uncommitted in the working
  tree (an explicit instruction for this session was not to commit). Check
  `git status` before assuming any particular commit reflects current
  state.

## UX-01: Design Tokens, Shared Components, and App Shell (added 2026-08-25)

Second UI-First Program milestone (ADR-0031). The Calm Civic Classroom
palette is now real, computed CSS in `src/ui/theme/styles.css`, not
just a written direction — every color pair's WCAG contrast was
verified by a hand-written script against the actual final hex values
(full table in the ADR), not eyeballed. Public Sans
(`@fontsource/public-sans`, self-hosted, no runtime fetch) replaced the
accidental `system-ui` stack. Six shared components
(`Alert`/`Loading`/`EmptyState`/`StatusChip`/`PageHeader`/`NavItem`)
now live in `src/ui/components/`, each justified by real prior
repetition (documented per-component in the ADR) and migrated into
real screens — `Alert`/`Loading` everywhere (13 screens), the others
into 2 screens each as a "proves reuse" sample, not a full sweep.
`App.tsx`'s flat 8-button nav became 4 labeled groups (Daily Teaching /
Learner Records / Grading / Security) matching a teacher's actual daily
rhythm, with every destination preserved. A 10-scenario decision on
authenticated-screen visual verification (native `@wdio/tauri-service`
pilot vs. a safety-hardened dev-only fixture) selected the fixture
approach but deliberately deferred building it rather than rushing
something safety-sensitive under time pressure — see the ADR for the
full reasoning, since the directing prompt was explicit that a
production authentication bypass must never be created.

## UI-First World-Class Product Program (added 2026-08-25)

Explicit new user direction, superseding autonomous feature-list
selection until an 8-item UI tranche (UX-00 through UX-08) completes:
prioritize UI/teacher-experience polish before expanding the feature
set further. Extends the "commit after every milestone" standing
instruction to "commit and push at both the START and COMPLETION of
every milestone." `pbakaus/impeccable` (npm `impeccable`, v3.6.0,
skill-declared internal version 4.1.1) is adopted as a project-local,
hook-free critique lens — LIKHA's own `premium-teacher-ui`/
`accessibility` skills remain the authoritative design/accessibility
source of truth throughout; Impeccable is a lens, never a competing
one. Full record: `docs/adr/0030-ui-first-program-and-ux00.md`.

Two real, concrete fixes came out of starting UX-00, not just process:
(1) the Impeccable installer wrote an unrequested hook into
`.claude/settings.local.json` despite the explicit hook-free
requirement — caught and removed immediately; (2) `.claude/launch.json`
had the wrong dev-server port (`5173` instead of the actual `1420`),
which had been silently breaking Browser-pane visual verification
attempts in this and at least one prior session — fixed, and Browser-
pane DOM/text/console verification now genuinely works against the
real `vite dev` server. Pixel-level screenshot capture remains blocked
by a client-side pane-display state this session, disclosed rather
than worked around.

## Proptest Pilot on Account Lockout (added 2026-08-25)

Fourth pick from the scoring pass (4.85), resuming Compounding
Engineering's deferred Phase B. Two `proptest` properties in
`repository::user`'s `lockout_properties` module generalize the
lockout example tests into real invariants (lock state matches the
threshold for any attempt count; an unknown username never locks
regardless of content or attempt count). Deliberately kept to 8 cases
per property, not proptest's 256 default, since every case runs real
Argon2id hashing — measured ~20-25s combined. Dev-dependency only, no
production code changed. See `docs/adr/0029-proptest-lockout-pilot.md`
and `docs/SOURCE-REGISTRY.md`. **All scored candidates from the
post-sequence pass above ~4.0 are now complete** — the two remaining
low-scored entries (password reset, Trail of Bits pilot) are both
blocked on something other than raw effort; the next step is another
fresh scoring pass or user direction, not defaulting to whatever's left
on the old list.

## Teacher Workspace: Currently-Open Grading Period Per Section (added 2026-08-25)

Third pick from the scoring pass (5.70). Closes ADR-0024's own
deliberate gap: each section on the Workspace screen now shows its
currently-open grading period (or "no grading period currently open"),
resolved per section's own school year — a real join across
`listSections()` and `listPeriodsBySchoolYear()`, both pre-existing
calls, dedicated by distinct school year so sections sharing one don't
trigger redundant fetches. No new Rust command. See
`docs/adr/0028-workspace-grading-period-status.md`.

## M12c-M26 Independent Review Dispatch and Self-Review Finding (added 2026-08-25)

Next pick after the scoring pass's top two (5.75, teacher-ux-reviewer/
accessibility-reviewer dispatch on real, previously-owed review debt).
`teacher-ux-reviewer` hit the same recurring agent-resume/retrieval
failure documented since M7 — real work done, no findings text
retrievable even after the one allowed resume attempt. A self-review
substituted and found one real, concrete gap: `AuditLogScreen.tsx` and
`TeacherWorkspaceScreen.tsx` both showed a teacher a raw ISO timestamp
(e.g. `2026-08-25T08:00:00.000Z`) instead of a readable date — the same
class of bug M12c already fixed once for `ClassRecordWorkspace.tsx`'s
"Saved HH:MM" note, but never carried forward to screens added after it.
Fixed in both places. `accessibility-reviewer` (dispatched in parallel)
hit the identical failure; a second self-review found and fixed
`IdleTimeoutWarning.tsx`'s `role="alertdialog"` overclaiming modal
focus-trapping behavior it doesn't actually have — changed to
`role="alert"`, matching every other banner in this app. Hand-computed
contrast for the new `--color-warning` tokens passed comfortably in both
themes. Both reviewers remain owed a real (non-self) pass once
agent-resume behavior is confirmed reliably working. See
`docs/adr/0027-audit-timestamp-readability-fix.md`.

## Idle-Timeout Warning Before Logout (added 2026-08-25)

Second pick from the post-sequence scoring pass (score 6.30, see below).
Closes ADR-0020's disclosed gap: a session used to silently idle-time-out
with no warning. `CurrentSession.idleExpiresAtUnixMs` (a pure peek — the
existing `current_session` command already computes it without sliding
the window, matching ADR-0020's own peek-vs-activity contract) plus a
new `extend_session` command a teacher can trigger directly. A new
`IdleTimeoutWarning.tsx` component polls the peek every 30 seconds and
shows a "Stay signed in" banner inside the last 2 minutes of the
30-minute window; if a poll ever finds the session already gone, it
reuses the exact same `onExpired`/`onSessionExpired` "return to sign-in"
path ADR-0022 already established, rather than a second, divergent one.
See `docs/adr/0026-idle-timeout-warning.md`.

## Post-Sequence Reassessment and Learner Roster CSV Export (added 2026-08-25)

After the user-directed sequence's own "reassess" checkpoint, the user
confirmed: "run a fresh evidence-based scoring pass now rather than
choosing a fifth item ad hoc." A full 20-scenario-style weighted scoring
pass was run over the real remaining candidate set — full table and
rationale in `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`.
Winner (score 8.10, next-best 6.30): a CSV export of the learner roster,
implemented as `export_learner_roster` — see
`docs/adr/0025-learner-roster-export.md`. Deliberately scoped narrowly:
"data export/backup" (#15 from the original 20-scenario list) is
ambiguous between a raw encrypted-database backup and a CSV export of
already-visible data; the former was explicitly rejected for this pass
since the DPAPI-protected SQLCipher key is machine/user-bound and
exporting it safely is its own unresolved security design question, not
something to bundle into a routine feature pass. Per the user's own
standing preference ("just select the recommended automatically, will
adjust after all milestone has achieved"), the scoring pass's own
runner-up ranking is now the default next-pick order recorded in
`docs/CURRENT-HANDOFF.md`, rather than reopening the question each time.

## Teacher Workspace (added 2026-08-25)

Fourth and final named item in the user-directed sequence (Audit Log →
Global Session Expiry Handling → Learner Search → Teacher Workspace →
reassess). `TeacherWorkspaceScreen.tsx` is now the default landing tab
after sign-in: learner/section counts, today's attendance-marking
status per section, and recent sign-in activity — built entirely from
data other screens already fetch, no new Rust command. Deliberately
did not show "currently open grading period(s)" — would need a
non-trivial school-year-aware join with no evidenced need yet. See
`docs/adr/0024-teacher-workspace.md`. **This closes the user-directed
sequence** — the next step is the "reassess" point the user named
explicitly, recorded in `docs/CURRENT-HANDOFF.md`'s Next Action
section, not an automatic fifth autonomous pick.

## Learner Search (added 2026-08-25)

Third item in the user-directed sequence. `LearnerListScreen` gained a
client-side search box (given name/family name/LRN, case-insensitive
substring) above the roster — no new backend query, since the full
roster was already fetched in one call and M17's own test already
proves the data layer stays correct at 500 rows. The search box
disables while an edit is in progress, so it can never filter the
currently-edited row out of view. See
`docs/adr/0023-learner-search.md`.

## Global Session Expiry Handling (added 2026-08-25)

Second item in the user-directed sequence. `src/infrastructure/tauri/invoke.ts`
centrally wraps Tauri's own `invoke` (all 13 repository files now
import through it) and notifies `App.tsx` on any `Unauthorized`
rejection except `login`'s own (a different, already-handled case) —
the app returns to `LoginScreen` with a clear "your session expired"
notice instead of each screen failing generically. Re-exported from
`composition.ts` for a single consistent entry point. A real bug (the
wrapper's first draft always forwarded `args` even as `undefined`, an
observably different call shape than omitting it) was caught by the
existing test suite itself and fixed — see
`docs/learning/ERROR-PATTERNS.md`. See
`docs/adr/0022-global-session-expiry-handling.md`.

## Authentication Audit Log (added 2026-08-25)

User-directed sequence: Audit Log → Global Session Expiry Handling →
Learner Search → Teacher Workspace → reassess. Audit Log is complete:
`audit_log` table (migration 15) records `login_success`/
`login_failed`/`account_locked`/`logout` events only — deliberately not
a general data-mutation trail, which would be a separate, much larger
milestone. `auth::login`/`auth::logout` record every real outcome;
`commands::auth::list_audit_log` follows the same session-derived-scope
convention as every other command (no new privilege tier — this app
still has one role). New "Sign-in Activity" tab. See
`docs/adr/0021-authentication-audit-log.md`. A commit-and-push happened
mid-session at the user's explicit request (`306f880` on `main`,
covering M7-M20 plus the harness/tooling work) — the standing
"do not commit" note in this file's own constraints section reflects
the _default_, not an absolute; it was correctly overridden once by
explicit instruction and the repo returned to its normal
uncommitted-until-asked posture afterward.

## Compounding Engineering Tooling (added 2026-08-25)

Evaluated a large external-tooling shortlist against LIKHA's priorities;
full record `docs/product/COMPOUNDING-ENGINEERING-DECISION.md`. Executed
only the low-risk Phase A slice this session (measure-then-adopt, no
architecture change, no new hooks) rather than a rushed full rollout —
deferred everything else with documented resumption criteria. Adopted:
`cargo-nextest` (measured ~26% faster test runs; fast inner loop only,
`cargo test` stays the stable-checkpoint command), `knip` (unused-export
detection, `npm run check:deadcode`, not blocking). Adapted as
project-local skills: `.claude/skills/scope-drift-review/`,
`.claude/skills/commit-archaeology/`. Started
`docs/learning/ERROR-PATTERNS.md` for generalized, prevention-pointing
lessons — not a transcript, not a duplicate of ADR content. Confirmed
cargo-deny/gitleaks/SQLCipher+DPAPI were already adopted, not new gaps.
Real verification value already proven once: running `npm run quality`
as part of this pass caught a genuine, previously-invisible test bug
(two test files froze only half of a date-dependent clock), fixed and
recorded as a durable lesson rather than silently patched.

## Claude Code Development Harness

A one-time harness upgrade (2026-08-24) built the project-local Claude
Code operating system: `.claude/rules/` (architecture, security-privacy,
testing, project-state, autonomous-development), `.claude/skills/` (18,
task-triggered — 16 from the original harness upgrade plus
`scope-drift-review`/`commit-archaeology` added 2026-08-25),
`.claude/agents/` (8, read-only reviewers/researchers — `evaluator`,
`security-reviewer`, `architecture-reviewer`, `reliability-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer`, `deped-researcher`,
`dependency-researcher`), and `.claude/settings.json` +
`.claude/hooks/*.cjs` (deterministic SessionStart/PreToolUse/PostToolUse/
PreCompact/SubagentStop hooks — no auto-commit, no auto-loop). **The
original `Stop` hook was removed (2026-08-24)**: it echoed a
verification reminder as a `systemMessage` on every stop, which
functioned as an unwanted stopping point under Autonomous Continuous
Development Mode — the same substantive rule ("never claim complete
without the checks actually having run") already lives, non-blocking,
in `.claude/skills/completion-verification/SKILL.md`, so nothing was
lost by removing the hook. Decision record: `docs/adr/0007-claude-code-harness-architecture.md`.
`CLAUDE.md` stays small by design (~90 lines); durable third-party
tooling decisions live in `docs/SOURCE-REGISTRY.md`, known-pending
verification in `docs/VERIFICATION-DEBT.md`. Security/dependency tooling
(Gitleaks, cargo-deny, OSV-Scanner) is wired into `npm run
quality:security` (`scripts/check-security.mjs`, which distinguishes
"tool missing" from "tool ran, found nothing" — a plain `&&` chain of the
three tools can't, since all three exit 1 for both cases) — that repo-side
wiring is durable and machine-independent. Whether the three underlying
binaries are actually installed is **per-machine, not durable**: they
were installed via winget on the machine that built the harness, but a
2026-08-24 migration to a different Windows PC found none of the three on
that machine's `PATH` — `npm run quality:security` was not run on that
machine as a result. Don't infer "the tools are installed" from this
file; check `where.exe gitleaks`/`osv-scanner`/`cargo-deny` (or run
`scripts/verify-dev-environment.ps1`, which does not currently check
these three but could be extended to) on the actual machine in use. A new deterministic `scripts/check-architecture.mjs` enforces the
UI/domain/application → infrastructure import-direction boundary as part
of `npm run quality`. For a substantial multi-phase task, working memory
lives in `.planning/<task>/{task_plan,findings,progress}.md`
(gitignored, disposable — see the `planning-with-files` skill); this
harness upgrade itself used that pattern under
`.planning/harness-upgrade/`.

Third-party dev-tooling gets a supply-chain trust check before
installation, not just a feature-fit check — `Graphify-Labs/graphify`
(a code-graph accelerator) was rejected on independently-verified
anomalous GitHub star/fork counts and an unaddressed PyPI typosquat
vector before any code from it was ever run on this machine. See
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`.

## Operating Mode

**Autonomous Continuous Development Mode (adopted 2026-08-24, directed
by the user)** — full rule in `.claude/rules/autonomous-development.md`,
concise pointer in `CLAUDE.md`. A completed milestone is a checkpoint,
not a stopping point: verify it, record it in ADRs/handoff/memory, then
autonomously select and continue to the next highest-value work using
LIKHA's priority order, without waiting for the user to name the next
M-number. This supersedes prior handoff language implying "stop after a
milestone and ask what's next" — that language is marked superseded in
place in `docs/CURRENT-HANDOFF.md`, not deleted. Stopping is still
required for a short, fixed list of genuine human approval gates
(irreducible product-policy choices, external material only the user can
provide, paid infrastructure, a production PII/security gate, a
destructive/irreversible operation, unresolvable missing DepEd
compliance evidence, or an explicit user instruction to stop) and for
practical session/context boundaries — see the rule file for the full
list and for how reviewer-harness failures are handled without becoming
an automatic stop.

## Development Resource Assumption

**Revised 2026-08-24**: two separately subscribed Claude Pro accounts are
available for this development window (previously assumed: a single
Claude Pro/Claude Code subscription with roughly three weeks of runway —
that earlier framing was never actually written into this repo's docs,
only carried as external planning context, but is superseded here for
the record). When one account reaches its normal Claude/Claude Code
usage limit, development may continue manually using the other
subscribed account. No automation exists or should be built to rotate
accounts, evade platform safeguards, or otherwise circumvent service
limits — this is additional legitimate development capacity, not
unlimited capacity, and does not change the priority order (privacy/
security → correctness → DepEd compliance → teacher usability → offline
reliability → maintainability → zero billing → performance →
implementation speed) or license indiscriminate feature expansion. Spend
the extra capacity on: deeper architecture/database scenario analysis,
independent specialist-agent review, security threat analysis, migration
and recovery testing, Windows/Tauri native foundations, SQLite/encryption
work, offline synchronization and cloud-sync authorization/isolation
research, reusable attendance/class-record/form patterns, and
accessibility/premium teacher-UX refinement — not more modules at once.
Keep preferring one excellent reusable foundation over many incomplete
ones.

## UX-02 Complete; Account-Transition Verification Note (added 2026-08-25)

**UX-02 — Teacher Workspace Polish is complete**, pushed to `origin/main`
at `14e7e5d` (start `2418099`, baseline `826bf7d`). A later
account-transition handoff request in this same session described the
expected remote HEAD as still `2418099` ("UX-02 status: In Progress")
— that description was stale relative to work already completed and
pushed earlier in this same session, not a real divergence. Verified via
`git fetch origin` + `git log`/`git status --short --branch`: local
`main` and `origin/main` matched exactly at `14e7e5d` with a clean
working tree (only the long-standing, harmless 0-byte junk files —
`(String`, `ComputedTermGrade`, `MonthlyAttendanceReport`,
`src-tauri/MonthlyAttendanceReport`, `button`, `repomix-output.xml` —
untracked). Lesson for future sessions: when a prompt asserts a specific
"expected" git state as a premise, verify it for real before acting on
it rather than assuming the premise is current — a prompt can be
several commits stale relative to work this same session already did.
Full milestone record: `docs/adr/0032-teacher-workspace-polish.md`.

## UX-03: Daily Attendance + Monthly Attendance Summary Polish (added 2026-08-25)

Fourth UI-First Program milestone (ADR-0033), baseline `f02bce5`. Three
correctness defects were found by direct code inspection during
planning (before implementation began) and confirmed as real,
reproducible bugs with failing regression tests before being fixed:
(1) both `AttendanceScreen` and `MonthlySummaryScreen` could render a
previous section/date/month's roster or report as if it belonged to a
newly-selected context, if the new load failed — fixed by clearing the
stale state on every context change and guarding every in-flight
request with a request-identity ref; (2) `AttendanceScreen`'s shared
`savingLearnerId` string let an older write's response overwrite a
newer one's result for the same learner — fixed with a per-learner
write-generation counter; (3) "Mark all present" didn't serialize
against concurrent individual writes — fixed by disabling individual
status buttons only while the bulk operation itself is in flight (a
teacher-understandable rule), while leaving individual-write-vs-
individual-write concurrency to the generation mechanism instead of
disabling (per the milestone's own instruction not to slow ordinary
entry). A real, pre-existing document-level horizontal-overflow bug
(a `<select>`'s long option text not shrinking below its intrinsic
width in a flex row) was also found during browser-rendered visual
verification and fixed (`.form-row .field { min-width: 0 }` +
`select { max-width: 100% }`) — confirmed via `git stash` to predate
this milestone, not introduced by it.

Both `teacher-ux-reviewer` and `accessibility-reviewer` hit the
recurring agent-resume/retrieval failure (documented since M7) on both
their initial dispatch and one permitted retry each; a rigorous
self-review substituted, found and fixed one real gap ("Mark all
present preserves existing marks" was Guided-mode-only, now shown in
every teacher mode) — independent-review debt remains open, recorded
in `docs/VERIFICATION-DEBT.md`. Full detail:
`docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`.

## UX-04: Class Records, Assessments, Score Entry, Grade Output (added 2026-08-25)

Fifth UI-First Program milestone (ADR-0034), baseline `0634421`. Four
correctness defects were found by direct code inspection during
planning and fixed via TDD: (1) a failed assessment-item switch could
leave a previous item's roster rendered as the new one's, same defect
class and cure as UX-03's identical fix; (2) the score-input commit
path and the Excused/N/A exception buttons were two separate,
mutually-unguarded write trigger sites for the same learner — fixed
with one per-learner write-generation counter living inside the shared
`handleRecord` function both paths call, not duplicated per call site;
(3) re-clicking an already-active exception status issued a redundant
write; (4) a computed term grade kept looking current after the
underlying score changed. (4)'s fix is a **durable, reusable pattern**:
recomputing an entire roster's grades on every save would be wasteful
and would contradict this app's existing "grade computation is
on-demand, not automatic" design (ADR-0013); recomputing only the one
affected learner is O(1), deterministic, and safe, and is itself gated
behind "grades have already been shown at least once" so a teacher who
never opens the grade table pays no hidden cost. Apply this same
single-record-recompute-after-write pattern to any future feature that
shows a computed value which can silently go stale after a related
edit — never re-derive the "recompute everything" instinct without
first asking whether only the one changed record needs it.

Assessment-item correction was added as an approved scope expansion:
**renaming an item is always safe regardless of scoring state** (name
is purely descriptive, verified by grepping every grade-computation and
export code path for a read of it, plus checking for a uniqueness
constraint — found neither); a full edit (category/max score) or
delete is permitted only while the item has zero recorded scores of
any status (scored/excused/not-applicable alike) — a deliberately
conservative rule (an item with only Excused/N/A entries technically
contributes nothing to any computed grade yet, so a stricter "any score
at all" block is more cautious than strictly required, kept anyway to
match this codebase's established fail-closed convention). This
rename-vs-full-edit distinction is a reusable pattern: before blocking
an edit "because the record has already been used," check whether the
specific field being changed is actually read by anything downstream —
don't assume every field of a scored/finalized record is equally
sensitive.

Two real bugs were found and fixed that weren't part of the original
four: the Class Records list's Progress column (new this milestone)
didn't refresh after returning from a workspace, so it could show stale
counts — the exact same "looks current but isn't" failure mode as
defect (4), one level up in a different screen, caught by a dedicated
test; and real browser-rendered visual verification (not reachable
from jsdom-based unit tests, which have no layout engine) found two
genuine CSS layout bugs in the new assessment-item edit/list UI — both
fixed. **Durable lesson**: jsdom-based tests cannot catch flex/layout
overlap or narrow-viewport wrapping defects; a real browser pass
(Playwright against the dev-preview fixture) remains necessary for any
milestone with non-trivial new layout, not just a nice-to-have.

The dev-preview fixture (`src/dev-preview/`) was extended from scratch
to cover Class Records/Assessments/Learner Scores — previously zero
coverage. Since three separate repository classes (assessment,
learner-score, class-record) need to observe the same evolving
item/score data, the new fixture state lives at module scope rather
than duplicated per repository instance, unlike the single-repository
attendance fixture that preceded it — a reusable pattern for any future
dev-preview extension spanning more than one repository over the same
underlying entity.

`teacher-ux-reviewer` and `accessibility-reviewer` again both hit the
recurring agent-resume/retrieval failure on both their initial dispatch
and one permitted retry each; a rigorous self-review substituted, found
and fixed one real, must-fix accessibility gap (every assessment item's
Edit/Delete buttons shared an identical accessible name across the
whole list, giving a screen-reader user no way to distinguish them —
fixed with a named `role="group"`, matching this file's own Excused/N/A
buttons' existing correct pattern) — independent-review debt remains
open, recorded in `docs/VERIFICATION-DEBT.md`. `cargo test`/`cargo
build`/`cargo clippy` could not run this session at all — a
pre-existing, unrelated `windows-future`/`windows-core` Cargo.lock
dependency conflict blocks compilation in this environment; Rust
changes were verified by careful manual review instead. Full detail:
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.

## Post-UX-08 Direction: Forms, UI, and Interaction Deepening Program (added 2026-08-25, SUPERSEDED same day)

**Superseded** by the post-UX-04 roadmap reconciliation
(`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`) recorded
later the same day — kept here as historical record per this project's
"mark superseded in place, don't delete" convention, not current
instruction. The reconciliation absorbed this section's substance
(forms/UI/interaction improvements) directly into the new Wave 1-7
sequence rather than deferring it to a separate later phase; see
`docs/product/PRODUCT-CONTRACT.md` for the current durable product
facts and ADR-0035 for the current roadmap. Do not treat "after UX-00
through UX-08 all complete" as the current gating condition — the wave
sequence in ADR-0035 is now authoritative.

Original text, preserved for history:

Durable user-directed future sequencing, recorded ahead of when it
becomes actionable: **after UX-00 through UX-08 all complete**, run an
evidence-based reassessment (matching this project's established
scoring-pass pattern) and begin a focused **Forms, UI, and Interaction
Deepening Program**. Its purpose is to make LIKHA-SIS's real teacher
workflows easier, faster, safer, and more pleasant — not to replace the
stack or add unrelated features. This must not expand any current UX
milestone's present scope; it only takes effect once the UI-First
Tranche (UX-00–UX-08) is done.

Intended areas for that future program: inventory and improve every
real data-entry form; consistent labels/hints/required-indicators/
validation/error placement; validation timing that helps without
interrupting teachers; safe defaults and clear field dependencies;
keyboard-efficient field order and shortcuts; appropriate mobile
keyboards and touch controls; unsaved-change protection; explicit
saving/saved/retry/recovery states; inline editing where it reduces
unnecessary navigation; bulk actions only when safe and teacher-
justified; better search/filtering/selection/long-form navigation;
direct transitions between connected teacher tasks; accessible local
SVG icons with permanent text labels when they improve scanning;
purposeful micro-interactions with reduced-motion support; responsive
Windows and Android compositions; better preview and confidence before
producing DepEd exports; preservation of official DepEd form structure
and terminology; usability evaluation with realistic teacher scenarios
and synthetic data; a formal UX-08 pre-release checklist covering
builds, tests, security, accessibility, performance, native Windows
verification, installer behavior, backup/recovery, and rollback
readiness.

Explicit exclusions, recorded so they aren't silently reconsidered
later: no Graphify; no Supabase migration; no Next.js/Tailwind/shadcn
migration; no generic UI kit replacement; no decorative charts or
motion without a teacher decision; no real learner PII until
production-readiness gates permit it; no new post-UX milestone numbers
until the UX-08 reassessment itself determines the correct sequence.

## Post-UX-04 Roadmap Reconciliation (added 2026-08-25)

The product definition expanded substantially right after UX-04
completed — School Forms (SF1-SF10) relationships, Teacher Load/Class
Schedule, curriculum/key-stage versioning, RBAC, school branding, a
cloud/sync target hypothesis, and a Teacher Creation Studio concept. Full
durable facts: `docs/product/PRODUCT-CONTRACT.md`. Strategy decision and
scoring: `docs/product/ROADMAP-RECONCILIATION-DECISION.md`. Durable
architecture/sequencing record: `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`.

**Durable facts worth remembering without re-reading the full ADR**:

- Repository truth as of this reconciliation: RBAC, curriculum
  versioning, Teacher Load/schedule, sync, SF1 bulk import, and SF10
  all have **zero code** in the repository. SF9 exists only as a
  non-authoritative CSV. `School` has no branding fields. The app is
  Tauri-only (no PWA/web target yet). The feature branch is 13 commits
  ahead of `origin/main`, not yet merged.
- Strategy chosen (scored, not assumed): reusable engines proven via
  one representative vertical slice per domain, sequenced one domain at
  a time — not parallel half-finished domains, not fully-finished forms
  built bespoke one at a time.
- Old UX-05 (Learners/Search/Sections/Editing/Export) is **merged**
  with the new SF1 Enrollment scope — same domain, one wave, not two
  competing efforts.
- RBAC's starting role model (Teacher/Registrar/School Head) was
  already confirmed with the user during M8 — do not re-ask it; only
  the exact authority boundaries between the three roles remain open.
- The Cloudflare Worker + Durable Object (next-best: Worker + D1) cloud
  target is a **hypothesis**, not a ratified ADR decision — no prior
  cloud-architecture ADR exists in this repo. Run the actual
  10-scenario process before writing sync code, don't treat it as
  pre-approved.
- Curriculum must be modeled as versioned/cohort-aware (school year +
  grade + curriculum version + cohort + implementation status +
  applicable policy/subjects/form) from the start — reusing this
  codebase's existing grading-weight-policy versioning pattern, never a
  `grade == 11/12` heuristic.
- Recommended next milestone (not started, awaiting approval): RBAC
  foundation, the highest-leverage single slice of Wave 1.

## Wave 1A: RBAC Foundation (added 2026-08-25)

**Complete** — see `docs/adr/0036-rbac-foundation.md` for full decision
record, `docs/CURRENT-HANDOFF.md`'s top entry for the completion summary.
Durable facts worth remembering without re-reading the ADR:

- Authorization is capability-oriented, never scattered role-string
  checks: `auth::Capability` + `auth::authorize_capability()` is the one
  new gate function, mirroring the codebase's existing `authorize_*`
  pattern; `Capability::allowed_roles()` is the only place a role maps to
  what it's allowed to do.
- Roles live in a separate `user_school_roles` join table (composite PK
  `user_id, school_id, role`), not a column — a person can hold more than
  one role in the same school without any future schema change; adding a
  new role later is a migration widening the `CHECK` constraint, not a
  redesign.
- Role membership is always a fresh DB lookup, never cached on `Session`
  — the same anti-staleness reasoning as the existing session-revocation
  check.
- **Teacher/Registrar/School Head are the initial proof set, not the
  final role universe.** Adviser, LIS Coordinator, ICT Coordinator,
  Master Teacher/Department Head, and others are expected later without
  a fundamental redesign of this schema/pattern.
- Representative proof: `create_learner`/`update_learner` require
  Registrar or School Head; learner reads are still ungated (no Teacher
  regression). No account/role-management UI was built — an explicit
  non-goal; `add_user_to_school`'s only check is "same school," not "same
  school and an appropriate role" — a real, recorded, pre-existing,
  currently-unreachable-from-UI gap (`docs/VERIFICATION-DEBT.md`), not
  fixed this milestone since deciding who may grant membership is exactly
  the authority-boundary work Wave 1A deferred.
- The `windows-future`/`windows-core` Cargo blocker was reproduced and
  traced to its actual structural root cause this milestone: `windows`
  and `crypto/dpapi.rs` are both compiled **unconditionally** (no
  `cfg(windows)` anywhere), not merely a version-pin mismatch — so this
  crate cannot compile on any non-Windows host today regardless of which
  `windows-future`/`windows-core` pair is locked. A real fix is a genuine
  architecture decision (target-gating + a non-Windows `KeyStore` story),
  deliberately not made this milestone. Full detail in
  `docs/VERIFICATION-DEBT.md`.
- Harness audit concluded **no new tooling adopted** (ast-grep,
  dependency-cruiser, repomix, cargo-mutants all evaluated and rejected
  for now against actual repo evidence) — see `docs/SOURCE-REGISTRY.md`.

## Curriculum / Key-Stage Versioning Foundation (added 2026-08-25)

**Complete** — see `docs/adr/0037-curriculum-key-stage-versioning.md`
for the full decision record. Durable facts worth remembering without
re-reading the ADR:

- Two deliberately un-joined reference axes: `key_stages` (KS1-KS4 grade
  bands, global, curriculum-independent — Key Stage banding is a stable
  K-12 grading-structure concept, not a curriculum-content one) and
  `curriculum_versions` ("K to 12 Basic Education Curriculum," sole
  default; "MATATAG Curriculum," not default). `school_year` is never
  the curriculum itself — a curriculum can span years, overlap during
  transition, or cover only part of the school (SHS stays on K to 12
  while K-10 phases into MATATAG).
- `class_records.curriculum_version_id` pins which version applies per
  record, mirroring `weight_policy_id`'s exact nullable/COALESCE-to-
  default shape, with one deliberate deviation: auto-resolved to the
  default rather than requiring an always-visible picker, since nothing
  yet reads which version is pinned to make a different decision. Zero
  UI/TypeScript change was needed.
- `curriculum_learning_areas` lists learning areas per curriculum
  version, deliberately not joined to `subjects` (which still has no
  DepEd classification at all — an existing, unresolved gap from
  ADR-0015, not widened here).
- Automatic curriculum selection by grade level is **not** implemented —
  `sections.grade_level` remains unconstrained free text; building
  grade-level-based auto-resolution now would require the exact
  "infer from label" shortcut this milestone was told to avoid. A
  disclosed prerequisite for future work, not solved here.
- MATATAG's phased rollout (SY 2024-2025 → 2026-2027) was triangulated
  from secondary sources, not primary-source-verified — `deped.gov.ph`
  itself is unreachable from this environment (network egress blocked).
  Key Stage grade bands, by contrast, were already primary-source-
  verified by ADR-0013 and reused directly.
- `deped-researcher` hit the same recurring agent-resume/retrieval
  failure documented since M7 (now confirmed on this agent type too);
  direct `WebSearch`/`WebFetch` substituted successfully.
- `cargo check`/`test` remain blocked by the pre-existing
  `windows-future`/`windows-core` conflict (unchanged root cause,
  reconfirmed identical) — this milestone's Rust is manually reviewed,
  not compiler-verified.

## Codex Delegation Harness (added 2026-08-25)

**PILOT, not ADOPT.** Full record: `docs/adr/0038-codex-delegation-harness.md`,
`.claude/skills/codex-delegation/SKILL.md`. Durable facts:

- The official `codex@openai-codex` Claude Code plugin is real (verified
  via an actual `git clone` and successful install, not secondhand
  summaries — most web search results on this topic were low-quality
  SEO content, the same red flag pattern already rejected once for
  `Graphify-Labs/graphify`). It wraps the user's local `codex` CLI —
  same repository checkout, same machine, no separate sandbox.
- Rule: Claude architects/orchestrates; Codex is a bounded LOW/MEDIUM-risk
  implementation worker and a second-vendor adversarial reviewer for
  HIGH-risk work (chosen specifically because this project has a
  recurring, documented same-vendor reviewer-agent retrieval failure
  since M7); Claude always independently reviews the actual diff, never
  the summary; Codex never decides RBAC/auth/encryption/sync/schema/
  provider questions.
- **LIKHA's own `PreToolUse` secret/PII hooks do not fire for
  Codex-originated writes** (verified from the hook source itself) —
  independent review is the only real safety net for Codex-touched
  changes.
- Not promotable to ADOPT yet: this sandboxed environment's network
  egress policy blocks `api.openai.com` outright (`HTTP 403` on the
  websocket endpoint, confirmed via a real probe), independent of
  whether credentials exist. A real pilot task requires a machine
  without that restriction.

## RBAC Authorization Corrective Gate (added 2026-08-25)

**`add_user_to_school`'s reported role-authorization gap: CONFIRMED and
fixed.** Full record: `docs/VERIFICATION-DEBT.md`'s updated RBAC entry.
Durable facts:

- The gate (`auth::authorize_school_membership_grant`) checked only
  session/school scope, never role — any authenticated Teacher could add
  a new member to their own school. Confirmed exploitable end-to-end via
  `register_user` (mints an account, any role) then the unguarded
  `add_user_to_school`.
- Fixed with `Capability::ManageSchoolMembership`, School Head only
  (Registrar deliberately excluded — a conservative product-policy
  choice, not just a technical fix; broadening to include Registrar is a
  separate future decision if evidence emerges).
- Grepped every production caller of `user::add_school_membership`/
  `role::grant` — only `bootstrap_installation` (already correct) and
  `add_user_to_school` (the fixed defect) exist. No remove-membership/
  change-role/deactivate command exists anywhere in this codebase yet,
  and `user_school_memberships` has no active/revoked flag — those
  authorization-family questions don't yet apply to anything real.
- No new ADR — this is an ordinary bug fix inside the architecture
  ADR-0036 already specified (a capability-oriented gate), not a new
  architectural decision.

## Teacher Load / Class Schedule Foundation (added 2026-08-25)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`.
Durable facts:

- Three concepts, two new tables: `teaching_assignments` (who teaches
  what, school-year-long) and `schedule_meetings` (when/where, local
  `HH:MM` wall-clock text). `TeacherLoad` (assignment count, distinct-
  subject/preparation count, weekly instructional minutes) is always
  derived, never a stored total.
- Deliberately **not** linked to `class_records` — different lifecycles
  (term-scoped vs. year-long); `class_records` still has no teacher
  column at all, confirmed before designing anything.
- Advisory/ancillary duties are out of scope by DepEd's own
  classification (DO 005, s. 2024: class-advising is ancillary, not
  instructional load) — do not fold them into `teaching_assignments`
  later without re-checking that classification.
- New `Capability::ManageTeachingAssignments` (School Head only) and
  `auth::authorize_view_teacher_load` (self, or School Head within their
  own school).
- **Two real bugs were caught and fixed by this session's own TDD/
  adversarial-self-review before any independent review ran**: (1) a
  School Head's role alone was originally enough to "authorize" viewing
  a teacher from a _different_ school — fixed by checking
  `is_member_of_school` on the target too. (2) `schedule_meeting::create`
  used `INSERT OR IGNORE` with no Rust-side weekday validation — the
  same class of bug as RBAC's `role::grant` mistake — fixed with
  explicit validation plus `ON CONFLICT ... DO NOTHING`. Both are strong
  evidence the TDD-first/self-review discipline this project follows is
  catching real defects before they ship, not just theater.
- No UI this milestone — proven at repository/command layer only, same
  zero-UI shape as RBAC and Curriculum Foundation.

## Native Rust Verification Recovery (added 2026-08-25)

Full record: `docs/adr/0040-windows-only-dependency-target-gating.md`.
Durable facts:

- **`cargo check --lib`/`cargo test`/`cargo clippy` now succeed in this
  Linux dev environment.** Root cause was never a lockfile/version
  mismatch (every prior session's framing) — it was that
  `src-tauri/Cargo.toml`'s own `windows = "0.62.2"` dependency (used for
  Windows DPAPI key protection) was declared **unconditionally**, with
  no `[target.'cfg(windows)'.dependencies]` gate, forcing Windows-only
  code to try to compile on every host. Fixed by target-gating it and
  `#[cfg(windows)]`-gating `crypto::dpapi`, exactly matching the pattern
  Tauri's own Windows-only webview backend (`tao`/`wry`/`webview2-com`)
  already used correctly in the same `Cargo.lock`. Zero lockfile
  changes were needed.
- **New durable rule**: any dependency/module that only makes sense on
  one platform must be `[target.'cfg(...)'.dependencies]`-gated in
  `Cargo.toml` and `#[cfg(...)]`-gated at its `mod` declaration — never
  declared unconditionally on the assumption that only the shipping
  target will ever run `cargo check`. Apply this to any future
  Android-only dependency too.
- `db::open_app_db` now fails closed with a `KeyStore` error on any
  non-Windows host rather than silently opening an unprotected
  database — Windows is currently the only shipping desktop target.
- Restoring real compiler/test signal (previously **zero** on any
  LIKHA-authored Rust across the whole session — RBAC, Curriculum,
  Teacher Load had never actually been compiled or tested) exposed and
  fixed three genuine pre-existing bugs: a type-inference ambiguity in
  `class_record::find_detail_by_id_in_school`; a dead-code
  `CreateMeetingOutcome::Duplicate` branch in `schedule_meeting::create`
  (an exact-duplicate submission always shares its teacher with itself,
  so the teacher-conflict check always fired first); and four
  `assessment_item` tests that bound `recorded_by_user_id` to a literal
  `"teacher-1"` string that could never satisfy the real `users(id)` FK.
  All were fixed within this milestone as direct correctness issues
  revealed by restored compilation, not scope expansion.
- `cargo fmt --check` was run for the first time this session (it was
  never part of `npm run quality:full`) and found ~264 pre-existing
  formatting diffs unrelated to this fix — recorded as new verification
  debt, not corrected here.

## Foundation Independent Review Debt Closure (added 2026-08-26)

The two independent reviews owed since 2026-08-25 (Curriculum
Foundation `architecture-reviewer`, RBAC Foundation `security-reviewer`)
were re-dispatched and, this time, both completed **and** their
findings were successfully retrieved — full record in
`docs/VERIFICATION-DEBT.md`'s top entry. No BLOCKING findings in
either. Two SHOULD-FIX findings applied: a doc-comment overclaim in
`repository::curriculum.rs::default_version_id` (the unique index
enforces at most one default, not at least one), and a real
authorization gap in `commands::teaching_assignment::list_schedule_meetings_by_assignment`
(any Teacher session could reconstruct a colleague's full weekly
schedule by chaining it with the intentionally-open
`list_teaching_assignments_by_section`, bypassing
`authorize_view_teacher_load`) — fixed by gating on the assignment's
own teacher via the same pattern the sibling commands already used.
Both previously-fixed regressions (`add_user_to_school` self-grant,
Teacher Load cross-school view leak) reconfirmed intact.

**Retrieval-mechanism lesson**: the recurring since-M7 agent-resume
failure did not recur — both reviewer agents resumed fine via
`SendMessage`. What failed on the first attempt was retrieving their
findings as text at all: each agent's first reply was a terse
acknowledgment, because it had already reported findings via
`ReportFindings`, which renders to a UI channel the orchestrating
session can't read. Explicitly asking the resumed agent to restate
findings as plain text (not via `ReportFindings`) worked. Future
dispatches of `architecture-reviewer`/`security-reviewer` as background
agents should request a plain-text report in the original prompt.

## Rust Formatting + Quality Gate Normalization (added 2026-08-26)

The ~265-diff pre-existing `cargo fmt` debt is closed (mechanical
`cargo fmt`, proven semantic-free, committed in isolation as `139c36d`)
and `cargo fmt --check` is now a permanent part of `npm run
quality:full` (`8ee1187`) — the canonical milestone/release gate. This
was the actual reason formatting drift accumulated unnoticed:
`quality:full` ran `cargo test`/`clippy` but never `cargo fmt --check`.
Full record: `docs/VERIFICATION-DEBT.md`'s top entry.

## Wave 2B: SF1 Bulk Import Engine (added 2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`. Built a
reusable, local-first SF1 `.xls`/`.xlsx` bulk import engine
(`src-tauri/src/import/`) on top of Wave 2A/2A.1's Learner Core +
Enrollment domain: `calamine` (pure Rust, MIT, read-only) parses the
workbook; safe normalization and row-level validation (errors block
commit, warnings never do) run before duplicate matching, which reuses
`learner::find_candidates` unchanged to classify every row `ExactLrn` /
`SuspectedDuplicate` / `New` — never auto-merged, no merge capability
exists in this codebase at all (confirmed by Wave 2A.1's own audit).
Commit is one `rusqlite::Transaction` for the whole approved batch,
reusing `learner::create`/`section_membership::enroll` completely
unchanged (`Transaction` deref-coerces to `Connection` — verified
directly before the pipeline was designed around it). Re-import
idempotency relies entirely on existing DB invariants
(`idx_learners_school_lrn`, `idx_one_active_membership_per_learner`,
`enroll()`'s own idempotency) — no new import-fingerprint/session table
was added, since the brief only authorized one "if it provides real
value" and it didn't here. Both new Tauri commands
(`preview_sf1_import`, `commit_sf1_import`) gate on the existing
`Capability::ManageLearners`. **No official DepEd SF1 template was
available** (repo had none; `deped.gov.ph` unreachable) — the
column/header layout `import::workbook` searches for is this project's
own invented, disclosed-as-unverified structure, isolated behind a
narrow adapter so retargeting it to a real template later is a mapping
change, not a rewrite. Deliberately shipped as an engine + full
authorized command-layer checkpoint with no import-preview UI yet,
matching this project's established zero-or-minimal-UI-first precedent
(RBAC, Curriculum, Teacher Load, Wave 2A). 43 new unit tests + 8 new
integration tests, all passing alongside the full existing suite.

## Current Milestone

See `ACTIVE-PLAN.md`.
