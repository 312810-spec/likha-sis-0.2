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

**Autonomous Wave Development Mode (revised 2026-08-28, owner-directed)**
— full rule in `.claude/rules/autonomous-development.md`, concise pointer
in `CLAUDE.md`. Work continues autonomously within one active wave. Once
that wave's final CI is green, verify and record the checkpoint, produce
the copy-ready wave summary, identify the exact next slice, and stop.
Never begin another wave until the user asks to continue. This
supersedes the 2026-08-24 cross-wave Continuous Development instruction.
Stopping earlier is still required for genuine human approval gates
(irreducible product-policy choices, external material only the user can
provide, paid infrastructure, a production PII/security gate, a
destructive/irreversible operation, unresolvable missing DepEd
compliance evidence, or an explicit user instruction to stop) and for
practical session/context boundaries — see the rule file for the full
list and for how reviewer-harness failures are handled without becoming
an automatic mid-wave stop.

**LIKHA Production Harness v2.0 (certified 2026-08-28, 100/100,
locked).** ADR-0054 adds a repository-local inventory/state/scorecard,
deterministic anti-drift certification, 14-day metadata health checks,
a real Playwright + axe UI gate, and a Windows-native Tauri build gate.
Corrected candidate `5a4b75d3` passed Quality `33175058626` and Security
`33175058671`; zero fatal overrides. Future harness changes require a
new owner-authorized unlock and the same certification protocol.

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

## Wave 2C: SF1 Import Preview + Duplicate Review UX (added 2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2C
addendum. Connects Wave 2B's tested engine to a teacher-facing screen
(`src/ui/Sf1ImportScreen.tsx` + `src/ui/components/Sf1DuplicateReview.tsx`),
under a new "SF1: Enrollment" nav item (Learner Records group) — never
renamed to a generic "Learner Import." Flow: pick target section + date
→ choose an `.xls`/`.xlsx` file via the native OS dialog (new
`tauri-plugin-dialog`/`@tauri-apps/plugin-dialog` dependency, first-party
Tauri plugins, `dialog:allow-open` only) → LIKHA classifies every row
New/Already-in-LIKHA/Needs-review/Has-an-error → suspected duplicates
get an inline side-by-side comparison with explicit "same learner" /
"different learners" decisions (no merge option — matches Wave 2A.1's
finding that this codebase has no merge capability) → transactional
commit reusing Wave 2B's `commit_sf1_import` unchanged → success/failure
summary using only backend-reported numbers. The UI never supplies
`school_id` or a capability and never re-implements Wave 2B's
parsing/validation/matching rules — it only presents the already-computed
`Sf1ImportPreview` and assembles a `Sf1RowCommitPlan` from the teacher's
decisions. Kept Windows-only deliberately (no Android build target
exists in this codebase yet — nothing to evaluate feasibility against).

An independent teacher-UX review (premium-design + teacher-comfort)
found and this session fixed 4 real issues: duplicate review only ever
showed the first of potentially several matching candidates (the
backing SQL has no row limit and can genuinely return more than one) —
now shows a candidate count and selector; the "nothing is saved until
you decide" safety reassurance was Guided-mode-only instead of shown in
every mode — now shown in all three; a whole-file failure collapsed
every cause into one generic message — now recognizes the backend's
`import_error` category specifically; two different phrasings described
the same "birthdate not stored in LIKHA" fact — reconciled to one. 25
new unit/component tests (application service, two infrastructure
adapters, the screen itself) all passing alongside the full existing
429-test suite.

## Wave 2D: Local Data Security Verification (added 2026-08-26)

Full record: `docs/adr/0044-local-data-security-verification.md`.
**Important repository-truth correction**: local encryption-at-rest was
NOT greenfield work — it already existed and was accepted in M2
(`docs/adr/0003-encryption-at-rest.md`): SQLCipher (page-level AES-256

- HMAC-SHA512) via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`,
  keyed with a DPAPI-protected (current-Windows-user-scope) 256-bit raw
  key, fail-closed on a corrupted key file. Wave 2D verified and
  lightly hardened that existing architecture rather than building a new
  one. Reaffirmed the SQLCipher+DPAPI decision against current evidence
  (no reason found to change it).

**New primary evidence produced this session**: the real
`sqlite3.org` CLI tool (freshly installed) pointed at a genuine
encrypted LIKHA database file with synthetic learner data — `.tables`
returns nothing, a raw `SELECT` fails with "file is not a database,"
and a raw byte-level `grep` of the file finds zero occurrences of the
synthetic name/LRN/school-name strings anywhere in the file. This is
the literal "ordinary SQLite tooling" scenario proven, not just
asserted.

**One genuine coverage gap found and closed**: WAL/SHM sidecar files
(already enabled since M1/M2 for crash-resilience reasons) had never
been checked for plaintext leakage — a new test
(`wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`,
`src-tauri/src/db/mod.rs`) now proves no plaintext learner data
appears in either sidecar file while the WAL file genuinely holds
unflushed content (not a vacuous pass on an empty file).

**Long-carried dependency-security debt (unavailable since M6) is
closed for this session**: `gitleaks`, `cargo-deny`, and `osv-scanner`
were all installed via `winget`/`cargo install` (network access
available this session) and actually run — clean across all three,
specifically confirming `calamine` and `tauri-plugin-dialog` have no
flagged advisories. Not yet wired into CI (deliberately deferred, see
`docs/VERIFICATION-DEBT.md`).

**Threat model documented explicitly** (17 scenarios: stolen device,
copied DB/backup, another local Windows account, corrupted DB, lost
key, backup restore same/different device, WAL/journal files, etc.) in
ADR-0044, with an honest in-scope/out-of-scope boundary — malicious
code running as the same logged-in Windows user remains out of scope
(a known DPAPI limitation), and there is deliberately no local
self-service recovery path for a lost key or a device/profile change
(deferred to future authenticated cloud-sync infrastructure, not
solved with an insecure workaround).

`KeyStore` (the existing `crypto::KeyStore` trait) was reconfirmed as
already being the platform-abstraction boundary Android will need — no
new abstraction layer was proposed, since building one before a second
implementation exists would be the premature genericization this
project's engineering rules warn against.

## Wave 2E: SF1 Import Operational Hardening & Auditability (added 2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E
addendum. Adds import history/auditability on top of the unchanged
Wave 2B engine, Wave 2C UI, and Wave 2D encryption architecture — no
existing preview/commit contract or duplicate-resolution semantics
changed. New `sf1_import_history` table (migration 19), written inside
`import::commit::commit_import`'s existing single transaction so a
history row exists if and only if that batch actually committed —
deliberately no `status` column, since there is no other reachable
state for one to represent. Re-import detection is a SHA-256 content
fingerprint (`import::fingerprint`, new but zero-build-cost `sha2`
dependency — already resolved transitively via `tauri-codegen`),
compared by content never filename, and purely advisory: it never
blocks a commit and the client never supplies it — `commit_sf1_import`
re-reads the file server-side, exactly like `school_id` is never
client-supplied. `std`'s `DefaultHasher` was rejected for this because
its own docs disclaim algorithm stability across Rust releases, which
would silently break a fingerprint persisted in SQLite after a
toolchain upgrade. New `list_sf1_import_history` command, same
`ManageLearners` capability gate and session-derived `school_id` as
every other SF1 command. Teacher-facing: a non-blocking "you've
imported this file before" advisory banner on the preview screen, and
a minimal "View past imports" panel (filename/actor/timestamp/counts
only — no learner names/LRNs/raw SF1 content). Security tooling
(`gitleaks`/`cargo-deny`/`osv-scanner`) re-confirmed clean against the
changed dependency graph; still not wired into CI, now with a concrete
named plan (separate job, specific pinned actions) instead of a
repeated deferral — see `docs/VERIFICATION-DEBT.md`.

## Claude Code harness audit (added 2026-08-26, not a LIKHA feature milestone)

Full record: `docs/adr/0045-claude-code-harness-audit.md`,
`docs/SOURCE-REGISTRY.md`'s top entry. Does not change the LIKHA
feature track — Wave 2E remains the current/most recent feature
milestone. Enabled in `.claude/settings.json`:
`typescript-lsp`/`rust-analyzer-lsp` (official LSP plugins, ~0 tok
always-on each, out-of-process — installed the missing underlying
binaries, `typescript-language-server` via npm and the `rust-analyzer`
rustup component), `claude-code-setup` (read-only automation auditor,
kept enabled for future re-audits), and `claude-security` (on-demand
whole-repo vulnerability scanner, menu-driven only, not run this
session). `security-guidance` was already correctly configured
(deterministic pattern layer only; LLM diff/commit review already
disabled) — no change made. Deliberately NOT enabled:
`frontend-design` (auto-triggers on frontend work, conflicting with
`premium-teacher-ui`'s restraint/parity philosophy — LIKHA is an
internal teacher tool, not a marketing site), `pr-review-toolkit`
(3 of its 6 agents are worded to trigger proactively/automatically,
conflicting with this project's milestone-gated review discipline),
`feature-dev`/`code-review`/`commit-commands`/`plugin-dev` (LIKHA's
existing workflow/reviewers/git-conventions are already more precise).
Zero MCP servers added — no `.mcp.json` exists in this repo.
AgentMemory (external, researched only, not installed) classified
REFERENCE: Windows install requires manual binary extraction or
WSL2/Docker, privacy filtering doesn't document PII-shape handling
beyond secrets, and its memory store isn't git-controlled — conflicts
with this project's memory-authority hierarchy
(`CLAUDE.md` → ADRs → `PROJECT-MEMORY.md` → `CURRENT-HANDOFF.md`).
Rust Token Killer (`rtk-ai/rtk`) confirmed already active at user
scope, predating this session, with a real measured 78.3% token
reduction across 1,489 commands on this machine — no LIKHA-specific
action needed.

## Wave 2F: harness closure + security CI gate (added 2026-08-26, not a LIKHA feature milestone)

Full record: `docs/adr/0045-claude-code-harness-audit.md`'s Wave 2F
addendum, `docs/adr/0046-security-ci-gate.md`,
`docs/VERIFICATION-DEBT.md`'s top entries. Closes the two remaining
gaps the harness audit above left open.

**LSP verification gap closed, with a correction to the original
audit**: enabling a plugin in `.claude/settings.json` is necessary but
NOT sufficient — a plugin's content must also be fetched into the
local cache via `claude plugin install <name>@claude-plugins-official`
(user scope, not repo-scoped) before it actually loads; `claude plugin
details` (used in the original audit) only inspects a manifest, not
whether the plugin is cached. Fixed for all four plugins. Both LSP
servers then demonstrated genuine, correct semantic navigation
(go-to-definition, find-references, hover), cross-checked against
`grep` for every result — not just claimed. rust-analyzer needs ~60s
to index this Tauri-scale workspace before symbol queries succeed
(cold-start cost, not a defect).

**Controlled MCP pilot: zero MCP servers installed.** Context7
classified REFERENCE (ordinary `WebSearch`/`WebFetch` already resolved
every real doc-lookup need this session with 100% success). GitHub MCP
rejected — `gh` CLI already fully covers CI/PR/issue inspection,
proven by dozens of successful real calls across this and prior
sessions. Playwright MCP rejected — the existing `playwright-cli`
skill (already adopted) is a functional superset, invoked via `Bash`
with zero standing MCP cost. Cloudflare Docs/Workers-Bindings MCP
rejected — no concrete need, cloud sync hasn't started. Semgrep
classified REFERENCE, CLI-only if ever adopted (never MCP) — no
capability gap this project's existing deterministic checks
(`check-architecture.mjs`, clippy, project hooks, the three security
scanners) don't already cover.

**Security tool CI gate implemented**: new
`.github/workflows/security.yml`, three independent jobs
(`gitleaks`, `cargo-deny`, `osv-scanner`), each `contents: read` only,
separate from `quality.yml`. `gitleaks-action`/`cargo-deny-action`
pinned to exact release commit SHAs (verified via GitHub's API, not
invented). `osv-scanner` deliberately NOT wired via
`google/osv-scanner-action` (its own docs say not to use it directly;
its reusable workflow needs `security-events: write` plus a
`continue-on-error` step that risks masking a scanner crash) — instead
a direct official static binary, checksum-verified against Google's
own published SHA256SUMS before execution. All three tools re-confirmed
clean locally immediately before wiring CI.

## Wave 2G: External API & Government Reference-Data Foundation (added 2026-08-26)

Full record: `docs/adr/0047-psgc-reference-data-foundation.md`. First
concrete implementation of a pattern for external/public reference-data
providers that does not make LIKHA depend on Internet availability.

**PSGC (PSA Philippine Standard Geographic Code) implemented as a
local-file import, not a live PSA API call.** PSA's own API site
(`psa.gov.ph/classifications-api/psgc`) returned HTTP 403 Forbidden from
this environment — the same disclosed network-egress gap already
recorded for `deped.gov.ph`/`lis.deped.gov.ph`. Ten-scenario decision:
Recommended = a local-file importer (admin picks a JSON snapshot via
the same `dialog:allow-open` capability SF1 import already uses; no new
Tauri capability needed), explicitly the brief's own "Next Best"
hypothesis, taken because the "switch condition" (direct PSA sync
proving unreachable/unverifiable) was concretely met, not assumed.

**Schema (migration 20) is deliberately global (no `school_id` — the
only tables in this schema without one) and append-only/versioned**:
`reference_geo_snapshots` + `reference_geo_units`, one immutable
generation per import, only one snapshot per source ever `is_current`.
Old generations are never deleted or updated in place — this is what
lets a historical geographic reference survive a future PSA rename
without inventing a supersession/rename mapping PSA's own public data
does not clearly expose from this environment. Every PSGC code is
stored as an **opaque authoritative string**, never sliced to derive
hierarchy — `level`/`parent_code` are their own explicit columns — because
the exact PSGC code-length convention (9 vs. 10 digits, per
inconsistent secondary sources) could not be independently verified.
`authoritative_version`/`authoritative_published_at` come only from the
imported file's own declared content, never from the local import
timestamp and never operator-typed.

`import::psgc` (parse/validate an untrusted JSON snapshot file) →
`repository::reference_geo` (transactional, versioned commit — same
all-or-nothing shape `import::commit::commit_import` already proved for
SF1 — plus network-free reads) → `commands::reference_geo` (3 Tauri
commands: import gated behind `Capability::ManageLearners`, reads
gated behind only an active session). **Zero dependencies added** —
`src-tauri/Cargo.toml` is unchanged; the local-file design needed no
HTTP client crate. No UI screen built this wave (deliberately deferred,
per the brief's own permission to prefer domain/repository/application
tests over premature UI) — no SF1 redesign, no `learners` schema
change.

**12 external providers classified** (PSGC, PSCED, OpenSTAT, Cloudflare
Turnstile, Tauri Biometric, Tauri Barcode/QR, Tauri Updater, DepEd
Integration, GeoRisk/PHIVOLCS/PAGASA, Philippine eGov interoperability,
scraping services, AI providers) — full table in
`docs/SOURCE-REGISTRY.md`'s Wave 2G section. Only PSGC (A) was
implemented; the rest are ADOPT-selectively-deferred, REFERENCE/PILOT,
WATCH, REJECT, or DEFER, each with an evidence-based revisit trigger —
none implemented this wave.

## Wave 3: Authoritative-Template SF1 Form Engine (added 2026-08-26)

Full record: `docs/adr/0048-official-form-engine-sf1.md`. First reusable
pattern for filling an authoritative DepEd spreadsheet template with
trusted local data while preserving the template itself — not a CSV
re-derivation like ADR-0009's SF2 export.

**No authoritative SF1 template exists anywhere in this repository or
was obtainable from this environment** (same disclosed gap ADR-0043
already recorded for the import direction). Official SF1 fidelity
against a real DepEd template remains **`NOT_VERIFIED`** — the engine
was built and tested against a synthetic, clearly-labeled fixture
instead, per the milestone's own explicit permission to do so rather
than fabricate a template.

**Ten-scenario decision departed from the brief's own named working
hypothesis** (a Java + Apache POI/HSSF sidecar) **on the strength of
this repo's own prior evidence**: a real, in-use `CONSO SF v2025.xlsx`
DepEd workbook (inspected during M8, cited in ADR-0009) is `.xlsx`/
OOXML, not legacy `.xls`/BIFF — the one fact that would have forced
POI's HSSF path. Adopted `umya-spreadsheet` (MIT, pure Rust) instead:
zero new runtime, packaging story, or process-invocation surface. Java/
POI retained as the documented Next Best with an explicit switch
condition (a real template turning out to be legacy `.xls`, or fidelity
verification showing unacceptable data loss).

**Architecture**: `commands::formgen` (application-service role) →
`formgen::OfficialFormGenerator` (port trait) → `formgen::umya_adapter`
(the only production module coupled to `umya_spreadsheet`) → a
SHA-256-hash-pinned bundled template resource. The generator never
grows the template (fixed learner-row capacity, checked before any
cell is touched), never opens the template path for writing, and
writes atomically (sibling `.tmp` file + rename, cleaned up on any
failure including a rename failure). No output-path parameter is
accepted from the caller at all — the command resolves it itself from
sanitized, authorized data, closing the path-traversal/arbitrary-file-
overwrite threat class by construction.

**Structural fidelity** (not byte-for-byte, which the library can't
guarantee across a save regardless of content changes) is verified by
`formgen::fidelity` (test-only): sheet names/order/visibility, merged
regions, formulas outside the write region, row/column sizing, and
defined names (where a print area lives) all survive generation
unchanged, empirically checked including at the full 30-learner
capacity.

**Three independent reviews (form fidelity, security/native-boundary,
architecture/maintainability), all CLOSED, no blocking findings.** All
three hit this project's recurring reviewer-retrieval bug and were
recovered via the established protocol. Real findings fixed: a genuine
temp-file-cleanup gap (a rename failure after a successful write didn't
clean up, only a write failure did); several tests whose names claimed
more than their bodies proved (a "structurally wrong workbook" test
actually only exercised the hash check, not the structural check it
claimed to; a "blank vs placeholder" test couldn't actually distinguish
the two; a "temp file cleanup" test never exercised the cleanup branch
it named); an inaccurate module-doc claim ("only module that imports
umya_spreadsheet") that was false until `formgen::fidelity` was gated
test-only; an unimplemented "defined names" fidelity claim (now
implemented); two dangling ADR-section citations in code comments
pointing at content that didn't exist at the time (now real content).
Also newly disclosed: generated official-form files are unencrypted
(unlike the SQLCipher-encrypted database) — a deliberate, now-explicit
data-exposure boundary; generation's authorization gate (session-only,
no capability) matches every sibling export command's existing
convention but was previously undocumented as a deliberate choice.

**Zero dependencies removed, one added** (`umya-spreadsheet`). No new
database migration — generation only reads existing learner/section
data and writes a spreadsheet file. No UI screen built this wave,
deliberately deferred per the brief's own permission.

## Wave 2I: Multi-Form Official-Form Contract + SF9 Readiness (added 2026-08-27)

Full record: `docs/adr/0049-multi-form-official-form-contract.md`.
Generalizes Wave 3's single-form (SF1) engine to a second form (SF9)
without collapsing the port into one generic method — a deliberate
architecture choice, not an oversight: `OfficialFormGenerator` (SF1)
and the new `Sf9FormGenerator` (SF9) stay separate traits with their
own typed request types, so a form-specific mapping bug cannot silently
compile as a different form's data. `TemplateDescriptor` itself was
generalized (added `workbook_format: WorkbookFormat`, widened two
fixed-size arrays to slices) — this is the one part of the contract
meant to be shared across forms.

**No authoritative DepEd SF9 template exists anywhere in this
repository or was obtainable from `deped.gov.ph` directly** (a live
fetch of the department's own homepage this wave found no School
Forms/SF9 link — same recurring gap this project has now hit for SF1,
PSGC, and SF9 alike). **Official SF9 fidelity remains `NOT_VERIFIED`**
— built and tested against a synthetic fixture instead.

**The multi-form adapter policy is now a checked fact, not only
prose**: `umya_adapter::reject_unsupported_format` rejects a
`WorkbookFormat::LegacyXls` descriptor before any parsing is attempted
— proven by a dedicated test that flips a real descriptor's format and
confirms generation fails closed. No legacy-`.xls` template was
encountered this wave, so no Java/POI adapter was built; the seam
exists and is tested, the adapter remains ADR-0048's recorded Next Best
if one is ever needed.

**SF9 grade data is never computed in `formgen`** — `formgen::
sf9_projection::subject_term_grades_for_learner` (new, read-only) calls
the EXISTING `repository::grading_computation::compute_term_grade` once
per class record, via a new narrow query
(`repository::class_record::list_by_section_in_school`). A class record
with no computable grade yet produces an explicit blank cell, never a
placeholder — proven end-to-end by a test that creates a real class
record with zero scores entered and confirms the generated SF9 shows a
genuinely empty grade cell, not a hardcoded/faked value.

**Data-exposure contract formalized as reusable** (ADR-0049): every
official-form generator now shares, by construction: PII classification
disclosed, no caller-controlled output path, deterministic overwrite,
atomic write with guaranteed temp-file cleanup on any failure, no PII
in logs/errors, local-only (no network/upload/sync), and — a deliberate,
disclosed gap, not solved this wave — still unencrypted, per the
brief's own instruction not to add encryption merely to "solve" the
issue absent evidence it's required.

**One independent review dispatched this wave (security) — CLOSED, no
blocking findings.** One should-fix, fixed: `sf9_projection` did not
itself enforce that `learner_id` belongs to `school_id` (it relied on
the caller having already checked); now verifies this directly via
`learner::find_by_id_in_school` before reading any grade data. The
other three roles the brief named are retained as verification debt,
not dropped — see `docs/VERIFICATION-DEBT.md`.

## Wave 2J: Resilient Zero-Cost Memory Observer + Project-Brain Hardening (added 2026-08-27)

Full record: `docs/adr/0050-resilient-zero-cost-memory-observer.md`.
Harness/developer-infrastructure milestone triggered by a third-party
plugin's own outage: `claude-mem` (an inference-backed, OPTIONAL Claude
Code memory plugin, distinct from this project's own `docs/`-based
memory) exhausted its free-trial allowance and stopped observing.

**Empirical finding that shaped the whole decision**: this repository's
actual durable memory — `docs/PROJECT-MEMORY.md`, `CURRENT-HANDOFF.md`,
`ACTIVE-PLAN.md`, `VERIFICATION-DEBT.md`, every ADR — was updated
successfully in every wave (2G through 2I) during claude-mem's entire
multi-day outage. It was never dependent on claude-mem, or on any
external inference call, at any point. This finding, not a hypothetical
risk, is what justified the architecture below.

**Decision**: repository-brain-authoritative (unchanged) + a new,
zero-cost, purely local "Layer 2" (`scripts/memory/journal.mjs`,
`recall.mjs`, `health.mjs`) + claude-mem disabled globally as "Layer 3"
optional enrichment (data preserved, not deleted — reversible via
`~/.claude/settings.json`'s `enabledPlugins["claude-mem@thedotmack"]`).
The key architectural move: because no external inference call exists
anywhere in the new code's write or read path, the required
five-state failure machine (HEALTHY/LOCAL_ONLY/DEGRADED/DISABLED/
RECOVERING) mostly describes states this architecture cannot enter —
operating mode is always and only `LOCAL_ONLY`, by design, not reached
as a fallback after detecting a failure.

**What Layer 2 actually captures**: at each session's `Stop` event, one
deterministic record (git HEAD sha/subject + changed file PATHS only —
never file contents, env vars, or Bash/tool output; secret-shaped paths
dropped before recording) into a gitignored local JSONL journal, keyed
by a SHA-256 id derived from normalized (project, session, type,
content) — never a timestamp — so replay/restart/duplicate-event
scenarios are dedup-safe by construction, not by retry logic.

**Recall is grep-based, deliberately never LLM-based**: this is what
makes the wave's highest-value guarantee provable at all —
`recall.test.mjs`'s tests run against the REAL `docs/VERIFICATION-
DEBT.md` and prove SF1 fidelity, SF9 fidelity, and Windows packaging
all remain recoverable as `NOT_VERIFIED`, that every match is a
verbatim substring of its source line, and that no canonical doc
contains a fabricated "PASSED/VERIFIED/confirmed" phrasing for any of
those three facts. A summarizing/paraphrasing recall implementation
could not offer this guarantee; a grep-only one can, by construction.

**Two independent reviews dispatched in parallel this wave** (security;
failure-mode/silent-failure) — a deliberate process correction from
Wave 2I's sequential, under-recorded review dispatch. A third role
(architecture/harness review) was NOT dispatched — recorded honestly as
retained debt in `docs/VERIFICATION-DEBT.md`, not omitted.

**No new npm dependency was added** — Layer 2 uses only Node.js
built-ins (`node:fs`, `node:path`, `node:crypto`, `node:child_process`,
`node:url`). No new database migration, no new Rust code, no
learner-facing functionality changed.

## Wave 2K: Official-Form Template Evidence & Provenance Registry (added 2026-08-27)

Full record: `docs/adr/0051-official-form-template-evidence-registry.md`.

`src-tauri/src/formgen/evidence.rs` (NEW) models template provenance and
generated-output fidelity as **two independent enums**
(`ProvenanceState`, `FidelityState`) on a `TemplateEvidence` struct —
never one collapsed status field, per this wave's non-negotiable design
rule. `SF1_SYNTHETIC_V1_EVIDENCE`/`SF9_SYNTHETIC_V1_EVIDENCE` are the two
registered records, both `(Synthetic, NotVerified)`.
`confirm_authoritative_source(current, authoritative_issuance)` is the
only function permitted to promote a template to
`AuthoritativeSourceConfirmed`, and refuses without a real DepEd
Order/Memorandum citation — the coded expression of "a community source
must never self-promote to authoritative."

`src-tauri/examples/inspect_template_candidate.rs` (NEW) is a dev-only
intake tool (same shape as `examples/gen_sf9_fixture.rs` — not a Tauri
command, not UI) that hashes/inspects a local candidate spreadsheet and
prints a suggested-starting-classification evidence report; it never
registers a `TemplateDescriptor`/`TemplateEvidence` itself. Refuses
files over 25 MB before parsing (zip-bomb defense); handles a malformed
file as a printed evidence gap, not a panic.

**Research found a genuine lead for SF10** (not SF1/SF9): four `.xlsx`
files on `support.lis.deped.gov.ph` (an official `*.deped.gov.ph`
subdomain), personally confirmed by direct fetch as valid xlsx
containers. Not registered as evidence this wave — no SF10 generator
exists, and none was built merely to exercise this framework, per the
brief's explicit instruction. See `docs/VERIFICATION-DEBT.md` for the
full, honestly-disclosed gaps (internal content unread; DO/DM issuance
unresolved; the "no SF1/SF9 on this portal" claim is snippet-only, not a
directly fetched listing).

`OFFICIAL_SF1_FIDELITY`/`OFFICIAL_SF9_FIDELITY` remain `NOT_VERIFIED`,
now also asserted by `formgen::evidence`'s own test suite rather than
prose alone.

## Wave 2L — LIKHA Production Harness v1.0 (frozen) + ProjectForge (added 2026-08-27)

Full record: `docs/adr/0052-wave2l-production-harness-v1.md`. Portable
extraction: `docs/harness/{HARNESS-IDEOLOGY,HARNESS-MEMORY,ADOPTION-GUIDE}.md`
and `docs/harness/portable/templates/`.

Final harness/tooling consolidation before accelerated production work.
Every installed/configured/referenced harness component received a
disposition (KEEP/UPGRADE/REPAIR/PILOT/REPLACE/DISABLE/REMOVE/DEFER)
against current repository truth. A 40-architecture review (superseding
the normal 10-scenario process for this wave only) was scored on the
brief's weighted rubric and run through four elimination rounds.

**Recommended = S1 "current harness + targeted cleanup" (score 92/100).**
The harness was already CLI-first, had **zero project-scoped MCP
servers** (no `.mcp.json`), three deterministic hooks, eight narrow
read-only review agents, progressive-disclosure skills, a concise
`CLAUDE.md`, repo-authoritative memory with a zero-cost local journal,
and quality + security CI. Wave 2L's only change to it: **removed one
dead plugin-config line** (`security-guidance@claude-plugins-official`
was enabled in `.claude/settings.json` but never installed, absent from
`claude plugin list`, named in no ADR — `claude-security` already
covers that need). No code logic changed; no dependency added/removed;
no migration.

**Next Best = S3 "CLI-first minimal"** (drop the two LSP plugins + the
vendored `impeccable` tree). Switch condition in ADR-0052: an LSP
plugin supply-chain/telemetry concern, the rust-analyzer ~60s
cold-start proving not worth it, or repeated onboarding failure on the
per-user plugin cache.

**Three contradictions the brief named, reconciled:**

- `claude-mem` — genuinely inert: `false` at user scope, no project
  override, no claude-mem hooks in either settings file, data
  preserved. Wave 2J's disable stands.
- Native Tauri smoke verification — **never executed in any wave**
  (`cargo build` succeeds; no `tauri build` installer, no WebdriverIO
  run ever). Retained as verification debt, not claimed done.
- The owed Wave 2J architecture/harness review — dispatched this wave
  (`architecture-reviewer`); it hit this project's recurring
  reviewer-retrieval bug, so a rigorous self-review was substituted and
  the independent-review debt retained (see `docs/VERIFICATION-DEBT.md`).

**Harness experimentation is now FROZEN.** A harness change may occur
only for: a production blocker; an important security/correctness
defect; a genuinely missing capability; a retained component becoming
insecure/obsolete/incompatible; or benchmarked evidence of substantial
improvement. Popularity/novelty/stars do not qualify. Default action
from here: **build the product.**

**ProjectForge** — the reusable, non-LIKHA ideology and mechanisms were
extracted to a standalone **private** repo `312810-spec/projectforge`
(**ProjectForge v0.1**): provider-independent core, a Claude Code
adapter built from the evidence-backed parts, and initial project-type
profiles (general/software/web/native/research/business/data/automation/
education/writing/design) as capability-selection recipes. It has its
own independent memory and is not coupled to LIKHA at runtime; LIKHA
does not depend on it at runtime and remains independently buildable.

## Wave 2M — SF10 Template Applicability & Version Resolution (added 2026-08-27)

Full record: `docs/adr/0053-sf10-template-applicability-and-versioning.md`;
form-evidence detail in `docs/form-evidence/sf10/README.md`.

Turned the Wave 2K SF10 lead into the first real external consumer of
`formgen::evidence`. Compliance-sensitive; evidence precedes fidelity
claims.

- **Four DepEd-hosted SF10 `.xlsx` candidates acquired** from
  `support.lis.deped.gov.ph` (verified `*.deped.gov.ph` subdomain),
  hashed, and structurally inspected. All registered as
  `ProvenanceState::CandidateUnverified` / `FidelityState::NotVerified`
  — **none promoted.** `SSHS SF 10 v2026.xlsx` is the cleanest (has
  formulas + data validation, no community sheet); the three JHS
  candidates all carry a non-DepEd `SirWedz Guides` worksheet
  (community-annotated copies on the official portal — hosting is not
  proof of authority).
- **Governing-issuance research (primary sources on deped.gov.ph):**
  DepEd Memorandum No. 020, s. 2026 (13 Mar 2026) governs the
  Strengthened SHS SF10 for SY 2025-2026 pilot implementers —
  confirmed to EXIST, but its body is a scanned PDF with no text layer
  and the frozen harness has no OCR, so the file↔issuance binding and
  exact field prescriptions are unconfirmed. DepEd Order No. 69,
  s. 2016 (ECR + Form 137 for SHS) and DepEd Order No. 4, s. 2014
  (modified school forms) are the prior generations. No single
  governing issuance was pinned for the JHS MATATAG revision.
- **Intake tool** (`examples/inspect_template_candidate.rs`) extended
  with per-sheet structural evidence (formulas, defined names / print
  areas, data validation, hidden rows/cols, page setup) and
  workbook-level named ranges — **umya-spreadsheet's existing API
  only, zero new dependency.** Still dev-only, read-only, never
  registers anything. Regression-checked against the SF1 fixture.
- **`formgen::template_version` (NEW, pure domain — no DB / command /
  UI / migration):** `resolve(registry, FormContext,
require_verified_fidelity)` selects the SF10 template version that
  was **authoritative for the record's own context** (form, school-year
  range, grade band, curriculum, optional track) and **fails
  explicitly** (`NoApplicableTemplate` / `AmbiguousTemplates` /
  `FidelityInsufficient` / `ProvenanceUnusable`) — it never falls back
  to the newest template. This is the centralized seam later SF10
  generation plugs into instead of scattering `school_year < "2025"`
  checks. It reads `TemplateEvidence`'s provenance and fidelity as the
  independent axes Wave 2K designed — the axes stay uncollapsed.
- **10-scenario decision (ADR-0053):** Recommended = evidence-backed
  `TemplateVersion` registry + centralized applicability resolver.
  Next Best = per-record frozen template-version stamp (adopt as a
  _complement_ the first time an SF10 record is persisted; nothing to
  stamp this wave).
- **The user's historical-fidelity hypothesis is supported by evidence
  but NOT encoded as certainty** — SF10 has had ≥3 template generations
  (DO 4 s.2014 → DO 69 s.2016 → MATATAG 2025 → DM 020 s.2026); older
  records must keep their era's template. Modeled as leads, marked as
  such, promotable only after reading the governing issuances.
- **Deliberately NOT built** (Wave 2M scope guard): SF10
  generation/import, teacher/transcript UI, historical-grade migration,
  persistence, production export, any migration.

## Wave 2N — SF10 Evidence Closure (added 2026-08-27)

Full record: `docs/adr/0053-*` Wave 2N addendum,
`docs/form-evidence/sf10/README.md`. Citations only here.

- **DepEd Memorandum No. 020, s. 2026 page 2 was read verbatim** (via
  `pdftotext`, a Git-for-Windows bundled tool — no harness change).
  Para 5(b) names the official filename **`SSHS SF 10 v2026.xlsx`**;
  para 4 scopes the modified SF10 to **SSHS Pilot Schools** and keeps
  the DepEd Order No. 69, s. 2016 SF10 for all other SHS classes.
  Pages 1/3/4 are scanned images (unread).
- **`SF10_SSHS_V2026_CANDIDATE_EVIDENCE` provenance promoted
  `CandidateUnverified` → `AuthoritativeSourceConfirmed`** — the memo
  names the exact file this project downloaded from the exact portal
  it names (explicit binding, not temporal proximity). Promotion
  validated against `confirm_authoritative_source`, not bypassed.
  **Fidelity stays `NotVerified`** (no SF10 generator; `Provenance !=
Fidelity` preserved and now enforced inside `resolve`).
- **No Academic/TechPro template split** — DM 020's readable page
  describes one SSHS SF10, one filename. `track: None` is now
  evidence-backed.
- **MATATAG JHS transition rule** (DepEd Order No. 010, s. 2024
  primary-confirmed; Joint Memorandum ref. STR-250331-0910-PS
  secondary/division only, national PDF NOT obtained): a
  previously-completed old SF10 is **preserved and attached**, not
  rewritten; the revised SF10 phases in **per grade** (Grade 7 first,
  SY 2024-2025). The Wave 2M JHS applicability band was corrected from
  Grades 7-10 to **Grade 7 only** (fail closed for the rest).
- **JHS SF10 candidates stay `CandidateUnverified` — EVIDENCE
  BLOCKED**: community-touched (`SirWedz Guides` sheet), LIS directory
  listing 403, no clean master proven.
- **SF10 readiness = PARTIALLY READY.** SSHS provenance confirmed;
  JHS blocked; pre-MATATAG templates not acquired. Per the Wave 2N
  directive, SF10 research **stops here** — no generator/import/UI/
  persistence/migration was built. Next work is an unrelated
  teacher-facing production slice (see `CURRENT-HANDOFF.md`).

## Wave 2U — Create Learner duplicate-candidate warning (added 2026-08-29)

Full record: `docs/adr/0042-*` Wave 2U addendum; `docs/VERIFICATION-DEBT.md`
Wave 2U entry. **New branch** `claude/likha-sis-wave2u-duplicate-warning`,
created from `c51b46c` (Wave 2T's own final, independently-verified
checkpoint); the Wave 2T branch itself was not modified. No candidate
was pre-selected for scoring — Wave 2T's own scoring table had already
named this exact candidate **Next Best**; this wave implements it.

- **Built**: `repository::learner::create_with_duplicate_check` reuses
  `find_candidates` (Wave 2A's existing school-scoped, deterministic,
  exact-match-only query — no second detection engine added) and
  returns a typed `CreateLearnerOutcome` (`Created`/`LrnConflict`/
  `DuplicateCandidates`), mirroring the `CorrectPlacementOutcome`/
  `TransferOutcome` house convention rather than surfacing a raw DB
  constraint error. `LrnConflict` (an exact LRN match) is hard and never
  overridable, even by an explicit confirmed retry — DepEd's own
  per-learner identifier cannot legitimately collide. Any other
  name/LRN overlap is `DuplicateCandidates`: blocks creation until a
  `confirmed: true` retry, which re-fetches candidates fresh so a
  conflict introduced between the warning and the confirmation is still
  caught atomically. New command `create_learner_with_duplicate_check`
  (same `ManageLearners` gate as `create_learner`) is what
  `LearnerListScreen`'s Create Learner form now calls; `create_learner`,
  `import::matching::classify_row`, `MatchKind`, and `import::commit`'s
  direct calls to `learner::create` are all unchanged — SF1 import's own
  duplicate-resolution flow carries zero regression risk from this
  wave. `LearnerListScreen` gained an inline `role="alert"` warning
  panel (not a modal, matching the existing Transfer/End/Correct
  confirmation-panel convention), with focus management and form-value
  preservation on both the soft (`DuplicateCandidates`) and hard
  (`LrnConflict`) cases.
- **Deliberately not built (explicit scope guard held)**: no learner-
  merging capability (still none in this codebase); no probabilistic/
  fuzzy/AI matching (the existing exact-match rule is unchanged); no
  SF1/SF9/SF10 fidelity or UI change; no schema/migration change (pure
  read-then-write over the existing `learners` table and its existing
  unique index).
- **Verification/checkpoint**: `cargo test` 546 lib (+7, up from 539) +
  all integration binaries incl. `learner_management.rs` 13/13 (+6) —
  zero regression, `tests/sf1_import.rs` unchanged at 12/12. `npm run
quality` 600/600 vitest (+15); typecheck/eslint/format/architecture
  clean; `npm run quality:security` clean, no new dependency; `npm run
quality:full` green end to end, exit 0; harness 100/100, unchanged.
  `npm run quality:ui`'s Playwright browser launch hit the pre-existing,
  already-documented `chromium-1237`-vs-`chromium-1194` binary mismatch;
  the documented workaround was re-run against the existing smoke script
  and passed with zero axe violations (no regression to
  `LearnerListScreen`'s already-covered flows); the new warning UI
  itself has jsdom+axe coverage only this session — the dev-preview
  fixture's write methods are deliberately all "not wired."
- **Next**: a scoped first cut of the Teaching Assignment/Class Schedule
  UI (7 unwired commands, previously judged too large for one bounded
  slice — e.g. read-only schedule display first); or the native
  NVDA/Narrator pass; or the carried SF1-importer debt once evidence
  justifies it. No candidate pre-selected.

## Wave 2T — SF1/SF9 official-form generation UI (added 2026-08-28)

Full record: `docs/adr/0049-*` Wave 2T addendum; `docs/VERIFICATION-DEBT.md`
Wave 2T entry. **New branch** `claude/likha-sis-wave2t-teacher-slice`,
created from `49695d3a` (Wave 2S's CI-confirmed final HEAD); the Wave
2S branch itself was not modified. No candidate was pre-selected — all
69 registered Tauri commands were cross-checked against every frontend
`invoke()` call site (16 had zero caller) to find real unfinished
teacher workflows, not inferred from filenames.

- **Recommended and built**: expose the already-built, already-tested
  `generate_sf1_form`/`generate_sf9_form` commands (Wave 3/2I,
  registered since those waves but never reachable from any screen) via
  a new section-level "Generate SF1" button and per-row "Generate SF9"
  action on `SectionRosterScreen`. **Zero Rust changes** — only a new
  `FormGenerationRepository` port (kept separate from
  `SectionRepository`/`ExportRepository`, one-port-per-concern
  convention) → adapter → `FormGenerationApplicationService` → UI.
  Neither action opens a confirmation panel (no membership state is
  mutated, both are safely repeatable) — reuses the plain single-click
  export-button pattern already established for SF2/report-card CSV
  exports. An always-visible (all three modes) notice discloses both
  templates remain `Synthetic`/`NOT_VERIFIED` (`formgen::evidence`'s own
  registered state, unchanged since Wave 3/2I) — the same disclosure-
  not-refusal stance this project has shipped since M10, applied to a
  new surface, not a new policy call.
- **Next Best (not built, recorded)**: a duplicate-learner-candidate
  warning wired into Create Learner, using the already-built
  `find_learner_candidates` command (also never wired to any UI —
  "for a Registrar to compare before deciding... never auto-merged," per
  its own doc comment).
- **Evaluated and correctly not selected**: a Teaching Assignment/Class
  Schedule UI (7 unwired `teaching_assignment::*` commands — real value,
  but too large for one bounded slice, and more School-Head-
  administrative than a daily teacher workflow); a PSGC/address-entry UI
  (no shipped form/export reads address data — building it now would
  repeat the "collect ahead of evidenced need" mistake M17 already
  declined once); the carried SF1-importer debt (no fresh evidence
  justifies reopening it — `tests/sf1_import.rs` stayed 12/12 green);
  the carried native NVDA/Narrator pass (genuinely infeasible in this
  remote Linux-container session — no Windows machine, no screen reader
  — disclosed honestly rather than faked or silently skipped).
- **Verification/checkpoint**: no Rust change; `cargo test` 539 lib + all
  integration binaries incl. `formgen.rs` 10/10, unchanged from Wave
  2S — zero regression. `npm run quality` 585/585 vitest (+22); build +
  dev-preview isolation pass; harness 100/100, unchanged.
  `gitleaks`/`cargo-deny`/`osv-scanner` all clean, no new dependency.
  `npm run quality:full` green end to end. Feature commit `820d1b2`;
  docs commit `54dc8fc` pushed (owner-authorized) as the branch HEAD —
  final Security Gate `33212130131` + Quality Gate `33212130223`, both
  `completed/success` (Ubuntu canonical + Playwright/axe; Windows
  canonical + native Tauri build). Harness reconfirmed 100/100 after
  the push. `main` untouched.
- **Next**: the Next Best duplicate-learner-candidate warning, or the
  native screen-reader pass, or a bounded first increment of the
  Teaching Assignment/Class Schedule UI — no candidate pre-selected.

## Wave 2S — same-day placement correction (added 2026-08-28)

Full record: `docs/adr/0042-*` Wave 2S addendum; `docs/VERIFICATION-DEBT.md`
Wave 2S entry. Fifth teacher-visible enrollment increment; closes the
Wave 2Q/2R same-day-correction gap.

- **Decision-first**: 8 correction representations scored against LIKHA's
  priority order (full table in the ADR-0042 Wave 2S addendum).
  **Recommended (built)**: in-place, single-use correction of a same-day
  membership's `section_id` — no new row, no deletion, `starts_on`/
  `ends_on` untouched, zero changes to any existing "is this membership
  open" query. **Next Best (recorded, not built)**: a retained void/
  re-open representation, for a placement with real dependent records or
  outside the same-day window.
- **`section_membership::correct_same_day_placement` (NEW)**: one
  transaction, one guarded `UPDATE`, gated on exact-membership resolution
  (forged/cross-school → `NotFound`), still-open, `starts_on == as_of_date`
  (`NotEnteredToday`), not already corrected (`AlreadyCorrected` —
  one-time, not repeatable), a resolvable different destination, and no
  dependent attendance/scored-grade record in the current section —
  reusing `dependent_records_stranded` with a **zero-width interval**
  rather than new SQL. Migration 21 adds nullable
  `original_section_id`/`corrected_at` provenance columns (written, not
  yet surfaced anywhere — disclosed debt).
- **UI:** `SectionRosterScreen` gains a third row action, "Correct
  today's placement," shown only when a row's placement started today;
  reuses the Transfer/End inline-panel pattern with no effective-date
  field. The pre-existing zero-length-interval Transfer/End error now
  points a teacher at this action instead of leaving them stuck.
- **Verification/checkpoint:** `cargo test` 539 lib (+15) + all
  integration binaries incl. `enrollment.rs` 39/39 (+9); `cargo fmt`/
  `clippy` clean. `npm run quality` 563/563 vitest; build + dev-preview
  isolation pass; harness 100/100, unchanged. `gitleaks`/`cargo-deny`/
  `osv-scanner` installed fresh this session and all three passed
  clean locally — a first for this project (every prior wave disclosed
  this as a per-machine gap). Feature `1ca2103`; CI run ids recorded in
  `CURRENT-HANDOFF.md`. `main` untouched.
- **Next:** no candidate pre-selected — native NVDA/Narrator pass (now
  covering Enroll/Transfer/End/Correct), the `enroll`/SF1-importer
  zero-length-rule debt, or a new teacher-facing slice now that the
  enrollment lifecycle is complete end to end.

## Wave 2R — read-only learner enrollment history (added 2026-08-28)

Full record: `docs/adr/0042-*` Wave 2R addendum;
`docs/VERIFICATION-DEBT.md` Wave 2R entry. Fourth teacher-visible
enrollment increment.

- **Reused the authoritative read path:**
  `list_learner_enrollment_history` →
  `section_membership::list_by_learner_in_school`, whose SQL constrains
  both `school_id` and `learner_id`, returns every retained span, and
  orders oldest first. No Rust/domain write, migration, or capability
  change.
- **Narrow frontend seam:** `EnrollmentHistoryRepository` +
  `TauriEnrollmentHistoryRepository` +
  `EnrollmentHistoryApplicationService`. Raw membership scope ids do not
  enter the UI projection. Same-school section labels are resolved via
  the existing section directory; missing labels do not erase history.
  Empty history skips the independent label lookup.
- **UI:** one per-learner disclosure on Learner List; past/current spans,
  friendly dates, loading/empty/error+retry, async stale-response guard,
  only one history panel at a time, edit/history conflict avoided.
  Efficient/Comfortable/Guided parity; Guided explanation only.
- **Deterministic browser proof:** synthetic dev preview wires the exact
  production screen; Playwright opens a two-span history, verifies past
  and current content, asserts no phone-width horizontal overflow, then
  runs axe.
- **Verification/checkpoint:** local `npm run quality` 543/543, build,
  dev-preview isolation, history 31/31, harness 100/100. Feature
  `05ad2e85` — Security `33180045501` + Quality `33180045507`, both
  successful, including Windows-native build. `main` untouched.
- **Next:** Wave 2S is a decision-first, narrowly authorized and
  auditable same-day placement-correction proof; not a general history
  editor or silent deletion path.

## Wave 2Q — safe learner enrollment + membership-integrity closure (added 2026-08-28)

Full record: `docs/adr/0042-*` Wave 2Q addendum; `docs/VERIFICATION-DEBT.md`
Wave 2Q entry. Third teacher-visible increment: place an existing eligible
learner into a section from the Section Roster, plus closure of four
Wave 2P membership-correctness debts.

- **`section_membership::enroll_membership(&mut Connection, school_id,
learner_id, section_id, starts_on) -> EnrollOutcome`** is the typed,
  transactional, stale-safe placement verb. `enroll` stays the bulk
  create-and-place primitive. `EnrollOutcome` (serde `tag="kind"`; TS
  `EnrollMembershipResult`) variants: `Enrolled` / `LearnerNotFound` /
  `SectionNotFound` / `AlreadyEnrolled {currentMembershipId,
currentSectionId}` (**never moved implicitly — caller must choose
  transfer**) / `OverlappingMembership` (a retained span ends after the
  proposed start) / `InvalidStartDate` / `DependentRecordConflict
{record}`. Command `enroll_learner_membership`, gated `ManageLearners`,
  `school_id` session-derived, forged-row `learner::find_by_id_in_school`
  check.
- **`enrollable_learners(conn, school_id) -> Vec<EnrollmentCandidate>`**
  — one `LEFT JOIN` learners→open membership→sections, `school_id`
  constrained on all three, ordered in SQL. Command
  `list_enrollable_learners`, gated `ManageLearners` (school-wide learner
  lookup, same class as `find_candidates` — **not** the open-read
  convention). Returns every school learner + current state; UI renders
  eligible / already-here / enrolled-elsewhere; domain re-checks.
- **Zero-length membership policy = STRICT.** `starts_on` must be
  strictly `<` `ends_on`. `transfer_membership` / `end_membership` return
  typed `ZeroLengthInterval` for a same-day change (Wave 2P allowed it).
  No historical row is ever deleted. `enroll` (the primitive) keeps a
  documented same-day `[D,D)` exemption (always inside a caller-owned
  import transaction). Decision + evidence in the ADR-0042 Wave 2Q
  addendum.
- **Backdating vs. dependent records.** `dependent_records_stranded()` —
  bounded helper — blocks a backdated `starts_on` / `effective_on` that
  would leave an `attendance_records` row or a scored `learner_scores`
  row outside every resulting membership interval for that
  `(learner, section)`, as typed `DependentRecordConflict {record}`.
  Legacy NULL-section attendance excluded; grades block only when the
  grading period lies _wholly_ outside coverage (mid-term end is fine).
  Wired into enroll / transfer / end. Nothing is cascade-deleted.
- **`enroll` hardened in place:** `is_iso_date` guard on `starts_on`
  (→ `Ok(None)`) + close-old/open-new wrapped in a `SAVEPOINT` (nests
  inside `import::commit`'s `Transaction`; `Connection::transaction`
  would not).
- **Real two-connection concurrency test** —
  `src-tauri/tests/enrollment_concurrency.rs` (5): two `db::open`
  connections on one SQLCipher file. Exactly one write commits; loser
  gets a typed conflict or a clean `SQLITE_BUSY_SNAPSHOT` rollback;
  guarded `UPDATE` writes 0 rows on a closed row; refreshed-connection
  retry is deterministic. Strategy of record: `Mutex<Connection>`
  serialises in-process writes → WAL snapshot isolation → guarded
  `UPDATE` → partial unique index. No retry loop added.
- **UI:** Section Roster gains one "Enroll learner" button + inline
  panel (house pattern, no modal): name/LRN filter, candidate `<select>`
  annotated with state, start-date input capped at today, one Confirm,
  double-submit block. Confirm disabled for already-here / enrolled-
  elsewhere with inline transfer guidance. Typed outcomes → inline
  correctable errors / stale-list refetch / success-refresh; focus to
  panel heading on open + error, to the trigger on cancel. 3-mode
  parity. `knip` clean (full domain→port→adapter→service→UI wiring).
- **Verification:** `npm run quality` green (534 vitest); `cargo test`
  528 lib + all integration (`enrollment` 31, `enrollment_concurrency`
  5); `cargo fmt --check` / `clippy -D warnings` clean;
  `check:dev-preview-isolation` pass; `knip` no new; `cargo deny` ok.
- **Checkpoint / CI:** [feature commit + gates recorded at commit time in
  `CURRENT-HANDOFF.md`]. `main` `d9ab036` untouched.

## Wave 2P — transfer learner + end enrollment (added 2026-08-27)

Full record: `docs/adr/0042-*` Wave 2P addendum;
`docs/VERIFICATION-DEBT.md` Wave 2P entry. Second teacher-visible
increment: the two membership changes that hang off a Section Roster row.

- **`section_membership::transfer_membership` / `end_membership` are the
  authoritative roster-driven membership operations**, distinct from
  `enroll`. `enroll` (closes "whatever is open", non-transactional on a
  bare `&Connection`, same-section = silent no-op) stays the
  create-and-place primitive for SF1 import / first placement. The two
  new functions take `&mut Connection`, run read→close→insert in one
  `conn.transaction()`, target an **exact `membership_id`**, and _fail_
  (`NotCurrent` / `MembershipNotFound`) rather than mutate a different
  row — this is what makes a minutes-stale roster tab safe (double
  submit → exactly one change). Closing `UPDATE` is
  `... WHERE ends_on IS NULL` + affected-row check; the destination
  `INSERT` leans on `idx_one_active_membership_per_learner`. History is
  end-dated, never deleted.
- **No new capability.** Both commands
  (`transfer_learner_membership` / `end_learner_membership`) are gated by
  `Capability::ManageLearners` (Registrar / School Head) — ADR-0042
  already scoped "transferring a learner" to that capability.
  `school_id` session-derived; `learner_id` / `membership_id` /
  `to_section_id` are client identifiers, every query scoped on
  `school_id` **and** the id together. Both functions also call
  `learner::find_by_id_in_school` independently, so a forged
  `section_memberships` row pairing this school with a foreign learner is
  refused (defense-in-depth parity with `enroll`).
- **Rust now shape-validates `effective_on`** (`is_iso_date`: length,
  dashes, digits, plausible month/day) because the TS `DATE_PATTERN`
  guard is bypassable over raw IPC and SQLite compares dates lexically.
  `effective_on < starts_on` still rejected; same-day
  (`== starts_on`) is a legal `[D, D)` empty interval. `enroll` has the
  same latent gap — deferred to `VERIFICATION-DEBT.md`.
- **TS mirror**: `TransferResult` / `EndEnrollmentResult` discriminated
  unions (serde `tag = "kind"`, camelCase) in `domain/section.ts`;
  `SectionApplicationService` does shape + date-format validation only,
  Rust stays authoritative on same-section / date-order / stale.
- **UI**: `SectionRosterScreen` gains per-row Transfer / End actions →
  one inline confirmation panel (house pattern, no dialog primitive),
  effective-date input (default today, `min` = start, `max` = today),
  school-scoped destination select. Outcomes: stale/gone → a refresh
  recovery that reloads the roster; `sameSection` / `invalidEffectiveDate`
  → inline field error, panel kept open; thrown → generic retry. Focus
  moves into the panel on open and on every error/conflict; back to the
  trigger on cancel. Class list stays visible during the post-action
  refresh. 3-mode parity. `App.tsx` unchanged.
- **Independent review**: 5 fresh reviewers (security, reliability,
  architecture, teacher-ux, accessibility) against feature commit
  `59f9440` — **no blocking findings**. Fixes folded into the
  review-fix commit; non-blocking items (native SR pass, two-connection
  race test, `enroll` hardening, backdating-vs-existing-records,
  zero-length-membership product question) in `VERIFICATION-DEBT.md`.
- **Verification**: `npm run quality` 514 vitest + gates green;
  `cargo test` 509 lib + integration (`enrollment` 24); `section_membership`
  36 unit tests; clippy/fmt clean. Feature CI `59f9440` — Quality
  `33046336519` + Security `33046336518` `completed/success`.
- **Still NOT built** (later waves): learner deletion, bulk transfer /
  bulk end, CSV/XLS import, cloud sync, an enrollment-history editor.

## Wave 2O — Section Roster read-only foundation (added 2026-08-27)

Full record: `docs/adr/0042-*` Wave 2O addendum. First teacher-visible
increment of Section Roster + Enrollment Management.

- **The roster data pipeline already existed** end to end from Wave 2A /
  attendance work: `section_membership::roster_for_section` +
  `commands::section::section_roster` on the Rust side; the
  `SectionRosterMember` domain type, `SectionRepository.roster()` port,
  Tauri adapter, and `SectionApplicationService.roster()` on the TS
  side. Wave 2O added the missing **UI** plus a small projection
  enrichment.
- **`section_membership::current_roster(school_id, section_id,
as_of_date)` (NEW)** — the current-members query for the roster
  screen. Same shape as `roster_for_section` (one indexed
  `learners ⋈ section_memberships` JOIN, `ORDER BY family_name,
given_name`) but scoped by `school_id` on **both** `section_memberships`
  and the joined `learners` row (defense in depth — security review),
  returning a **separate `CurrentRosterMember` projection**
  (name + `lrn` + `starts_on`) so `roster_for_section` /
  `roster_for_section_over_range` (used by `formgen::sf1` and the
  attendance-adjacent callers) are untouched. The brief proposed
  `list_current_members_in_school`; reusing the proven query shape was
  the deliberate call, recorded in the ADR addendum.
- **"Current member" is the existing half-open-interval definition** —
  `starts_on <= as_of_date < ends_on` (NULL `ends_on` = open) — not a
  new temporal semantic. Future-dated enrollments and ended memberships
  are correctly absent; the screen shows the "as of" date so a teacher
  can see why.
- **`SectionRosterScreen.tsx` (NEW)** — reached from `SectionsScreen`
  via a per-section "Open roster" button (`App.tsx` `rosterSectionId`
  handoff, same pattern as Attendance→Monthly Summary); its own "← Back
  to sections". `"section-roster"` is a `SignedInTab` value but **not** a
  `NAV_GROUPS` destination (needs a selected section); `WorkbenchNav`
  keeps "Sections" active while it is open. Loading / populated / empty
  ("no learners as of <date>") / section-not-found recovery /
  roster-load-error+retry states. Efficient / Comfortable / Guided
  parity (density is global CSS vars; the component varies only
  explanatory copy). Desktop `<table>` → `@media (max-width: 640px)`
  stacked-card layout mirroring `.attendance-roster`.
- **Decisions:** no search (one section = tens of learners; a stable
  sorted list scans faster than it filters). Ordering = family then
  given name, already this project's convention, applied in SQL. `sex`
  dropped from the projection (no consumer — security + architecture
  review); `lrn` shown for identity confirmation. Dates shown
  `2 Jun 2025` via a small screen-local formatter.
- **Independent review:** teacher-ux, accessibility, security,
  architecture reviewers ran in parallel and all four returned complete
  findings. One BLOCKING (a11y: `@media` `display:block` strips implicit
  table ARIA roles at 400% zoom) — fixed by adding explicit
  `role="table|row|columnheader|rowheader|cell"`. No blocking from the
  other three; ~15 non-blocking items acted on (status live region,
  focus-on-retry, `l.school_id` JOIN predicate + forged-row test,
  `TAB_LABELS` exhaustive literal, `App.tsx` no longer falls through to
  audit-log, all-mode purpose line, "Enrolled since", friendly dates,
  hint above table, section-error Retry). Owed: native NVDA/Narrator
  pass at 400% zoom (standing UI gap). Full list:
  `docs/VERIFICATION-DEBT.md` Wave 2O.
- **Verification actually run:** `cargo fmt --check` clean; `cargo
clippy --all-targets -- -D warnings` clean; `cargo test` 491 lib
  (+7 `current_roster` unit tests) + all integration binaries incl.
  `tests/enrollment.rs` 17 (+4 command-boundary tests: authorized
  same-school, no session denied, nonexistent section → `[]`,
  cross-school `section_id` → `[]`), 0 doctests; `cargo nextest run`
  595/595. One transient `learner_management.rs` `db::open` flake on a
  single full-suite run (SQLCipher key derivation under parallel load;
  not reproduced; unrelated — no db/crypto code touched). `npm run
quality` green — 484 vitest tests. `cargo-deny` clean (no dependency
  change); `gitleaks`/`osv-scanner` not on PATH locally (standing gap,
  CI Security Gate authoritative). No packaged-native Tauri run
  (standing environment gap — `quality:ui` is a placeholder).
- **Deliberately NOT built** (Wave 2P onward): transfer between
  sections, end enrollment, bulk enrollment, CSV/XLS import,
  drag-and-drop, SF1 export, learner editing/deletion, historical
  membership editor. The transfer/end seam is documented in prose in
  the screen's doc comment; no dead buttons.

## Wave 2V — Subject Attendance Foundation (added 2026-08-29)

Full record: `docs/adr/0055-subject-attendance-foundation.md`;
`docs/product/SUBJECT-ATTENDANCE-SPEC.md`;
`docs/VERIFICATION-DEBT.md` Wave 2V entry. **New branch**
`claude/likha-sis-wave2v-subject-attendance-foundation`, created from
`647ba09` (Wave 2U's own final, CI-confirmed checkpoint); the Wave 2U
branch itself was not modified. Owner-supplied product specification
(not autonomously selected) — the owner sent two new specs mid-session
(Subject Attendance, Official School Repository) and directed continued
autonomous work with a notification at each wave boundary, since their
own separate research assistant's usage was exhausted.

- **Both specs recorded** at `docs/product/SUBJECT-ATTENDANCE-SPEC.md` /
  `docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`, with a status
  pointer added to `docs/product/PRODUCT-CONTRACT.md` §16.5. Subject
  Attendance was chosen as this wave's implementation target — it needs
  no external administrative material and reuses foundations LIKHA
  already has (roster, enrollment history, teaching assignments,
  authorization). Official School Repository is recorded but not
  started — it requires owner-supplied external material (confirming an
  organization-managed Microsoft 365 tenant, who can grant Graph/site
  consent) before any implementation is safe to begin, per
  `.claude/rules/autonomous-development.md`'s "external material only
  the user can provide" gate.
- **Built**: a session-centered schema (migration 22:
  `subject_attendance_sessions` + `subject_attendance_entries`,
  deliberately NOT columns on `attendance_records` — Subject Attendance
  must never be able to become SF2 by sharing storage) and
  `repository::subject_attendance` (`open_or_get_session`/`mark_no_class`
  — idempotent via `INSERT ... ON CONFLICT DO NOTHING`, never creates a
  duplicate on retry; `record_entry` — typed `RecordEntryOutcome`,
  refuses a `NoClass` session or a membership from a different section;
  `mark_all_present` — reuses the `bulk_mark_present` "never overwrite"
  idiom; `roster_for_session` — reuses `section_membership::current_roster`
  unchanged). New `subject_attendance::authorize_own_assignment` gate —
  deliberately not a `Capability` match arm, since authorization depends
  on _which_ assignment is targeted, the same shape
  `auth::authorize_view_teacher_load`'s "self" branch already uses.
  Six new Tauri commands in `commands::subject_attendance`, all gated on
  this same rule.
- **Deliberately not built this wave**: no UI (matches this project's
  established zero-UI-first precedent for a new domain — RBAC,
  Curriculum, Teacher Load, Wave 2A all shipped this way); no
  adviser/School-Head read access to another teacher's records (the
  spec's own "Adviser View" is a later implementation-order step); no
  amendment/audit-trail beyond basic actor/timestamp columns; no
  sync/offline-conflict handling beyond existing SQLite serialization;
  zero change to `attendance_records`/SF2/any existing attendance code
  path.
- **Verification/checkpoint**: `cargo test` 564 lib (+18, up from 546) +
  all integration binaries incl. new `tests/subject_attendance.rs` 7/7 —
  zero regression to any existing suite. `cargo fmt --check`/`cargo
clippy --all-targets -- -D warnings` clean. `npm run quality` 600/600
  vitest, unchanged (Rust-only wave, zero frontend files touched).
  `npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged — not reopened. `npm
run build` + `check:dev-preview-isolation` pass.
- **Next**: a scoped first UI increment (Today's Classes + Attendance
  Check screens, per the spec's own recommended order steps 3-4); or
  the Teaching Assignment/Class Schedule UI carried from Wave 2T/2U; or
  the native NVDA/Narrator pass. No candidate pre-selected.

## Wave 2W — Subject Attendance first UI increment (added 2026-08-29)

Full record: `docs/adr/0055-*` Wave 2W addendum;
`docs/VERIFICATION-DEBT.md` Wave 2W entry. **New branch**
`claude/likha-sis-wave2w-subject-attendance-ui`, created from `4a7629e`
(Wave 2V's own final, CI-confirmed checkpoint).

- **Built**: `SubjectAttendanceScreen.tsx` — a teacher picks one of
  their own teaching assignments and a date, sees whether a session
  already exists for that date (via the existing, non-mutating
  `list_subject_attendance_sessions`), and either opens one ("Check
  attendance"/"No class today" — session-creation is always an explicit
  teacher action, never triggered by merely browsing to a date) or goes
  straight to the roster if one already exists. Roster marking reuses
  `AttendanceScreen.tsx`'s exact pattern (per-learner write-generation
  guard, `role="group"` status buttons, "Mark all present never
  overwrites"). New narrow `TeachingAssignmentRepository` port
  (`listMine`) reuses the already-built `list_teacher_assignments`
  command — not the deferred full Teaching Assignment/Class Schedule UI.
  Zero Rust changes; six new/modified TS files under
  `domain`/`application`/`infrastructure`/`ui`, wired via
  `composition.ts` and a new `subject-attendance` nav tab.
- **Deliberately not built**: no dev-preview-fixture wiring (no real
  browser/axe screenshot coverage yet, jsdom+axe only — same disclosed
  gap Wave 2U's own new UI left open); no Today's Classes list; no
  Subject Monitor/Adviser View.
- **Verification/checkpoint**: `npm run quality` 625/625 vitest (+25);
  typecheck/eslint/format/architecture clean; zero Rust files touched
  (`cargo test` reconfirmed 564/564 unchanged); `npm run build` +
  `check:dev-preview-isolation` pass; `npm run quality:security` clean,
  no new dependency; `npm run harness:verify` still exactly 100/100,
  unchanged.
- **Next**: Today's Classes (a schedule-driven list of a teacher's own
  classes, closing the "not checked" state's real UI purpose); the
  carried Teaching Assignment/Class Schedule UI; or the native
  NVDA/Narrator pass. No candidate pre-selected.

## Wave 2X — Today's Classes (added 2026-08-29)

Full record: `docs/adr/0055-*` Wave 2X addendum;
`docs/VERIFICATION-DEBT.md` Wave 2X entry. **New branch**
`claude/likha-sis-wave2x-todays-classes`, created from `bde802f`
(Wave 2W's own final, CI-confirmed checkpoint).

- **Built**: `TodaysClassesScreen.tsx` — lists every class the
  signed-in teacher meets today (schedule order), each with its Subject
  Attendance status (Not checked / Checked / No class) and a "Check
  attendance" action that hands off to `SubjectAttendanceScreen` with
  that class preselected. Reuses `list_schedule_meetings_by_assignment`
  and `list_subject_attendance_sessions` unchanged — zero new backend
  surface. **Established the `schedule_meetings.weekday` convention**
  (0 = Sunday … 6 = Saturday, matching `Date.getDay()`) — the column
  had no documented calendar meaning anywhere in this codebase before
  this wave; now documented at `src/domain/schedule-meeting.ts` and in
  the ADR-0055 Wave 2X addendum, binding for future schedule-creation
  UI. `TeachingAssignmentRepository` gained `listMeetings`;
  `SubjectAttendanceScreen` gained an `initialAssignmentId` handoff
  prop (mount-time default, verified against the loaded list — same
  shape as `AttendanceScreen`'s `initialSectionId`).
- **Deliberately not built**: no dev-preview-fixture wiring (same
  disclosed gap as Waves 2U/2W); no `TeacherWorkspaceScreen` entry
  point into Today's Classes; no Subject Monitor/Adviser View.
- **Verification/checkpoint**: `npm run quality` 637/637 vitest (+12);
  typecheck/eslint/format/architecture clean; zero Rust files touched
  (`cargo test` reconfirmed 564/564 unchanged, `cargo fmt --check` /
  `cargo clippy --all-targets -- -D warnings` clean); `npm run build` +
  `check:dev-preview-isolation` pass; `npm run quality:security` clean,
  no new dependency; `npm run harness:verify` still exactly 100/100,
  unchanged.
- **Next**: the carried Teaching Assignment/Class Schedule UI; Subject
  Monitor / Adviser View; or the native NVDA/Narrator pass. No
  candidate pre-selected.

## Wave 2Y — Teaching Assignments (added 2026-08-29)

Full record: `docs/adr/0039-*` Wave 2Y addendum;
`docs/VERIFICATION-DEBT.md` Wave 2Y entry. **New branch**
`claude/likha-sis-wave2y-teaching-assignments`, created from `361a2ba`
(Wave 2X's own final, CI-confirmed checkpoint).

- **Built**: `TeachingAssignmentsScreen.tsx` — a School Head assigns/
  unassigns which teacher teaches which subject for a section, reached
  from `SectionsScreen`'s new "Manage assignments" action. Wires
  `create_teaching_assignment`/`remove_teaching_assignment`/
  `list_teaching_assignments_by_section` (existed since ADR-0039,
  never reachable from any screen, never proven at the command
  boundary before this wave). New backend surface:
  `list_school_members` + `repository::user::list_members_in_school`
  (no prior command enumerated a school's own members). Teacher picker
  filters client-side to the `teacher` role; the backend gate
  (`Capability::ManageTeachingAssignments`, School Head only) is the
  real boundary, not the UI filter. New
  `TeachingAssignmentApplicationService` + `SchoolMemberApplicationService`,
  wired via `composition.ts`; nav-invisible `teaching-assignments` tab
  (reached only via the `SectionsScreen` handoff, mirroring
  `section-roster`).
- **Deliberately not built**: no dev-preview-fixture wiring (same
  disclosed gap as Waves 2U/2W/2X); no `replace_teacher_assignment`
  wiring (explicit remove-then-create is ADR-0039's own intended
  shape); no schedule-meeting create/edit UI; no teacher-load view.
- **Verification/checkpoint**: `npm run quality` 658/658 vitest (+21);
  typecheck/eslint/format/architecture clean; `cargo test` 568 lib
  tests (+4) plus new `tests/teaching_assignment_management.rs` (9/9,
  closing a pre-existing command-boundary test gap); `cargo fmt
--check` / `cargo clippy --all-targets -- -D warnings` clean; `npm
run build` + `check:dev-preview-isolation` pass; `npm run
quality:security` clean, no new dependency; `npm run harness:verify`
  still exactly 100/100, unchanged.
- **Next**: `create_schedule_meeting` (the weekly schedule builder,
  which also lets the Wave 2X weekday convention be verified
  end-to-end); `get_teacher_load`; Subject Monitor / Adviser View; or
  the native NVDA/Narrator pass. No candidate pre-selected.

## Wave 2Z — Class Schedule (added 2026-08-29)

Full record: `docs/adr/0039-*` Wave 2Z addendum;
`docs/VERIFICATION-DEBT.md` Wave 2Z entry. **New branch**
`claude/likha-sis-wave2z-class-schedule`, created from `cbc3f74`
(Wave 2Y's own final, CI-confirmed checkpoint).

- **Built**: `ScheduleMeetingsScreen.tsx` — a School Head
  schedules/unschedules a class's weekly meeting times (weekday,
  start/end time, optional room), reached from
  `TeachingAssignmentsScreen`'s new "Manage schedule" action. Wires
  `create_schedule_meeting`/`list_schedule_meetings_by_assignment`
  (existed since ADR-0039, never reachable from any screen, never
  proven at the command boundary). New backend surface:
  `remove_schedule_meeting` + `repository::schedule_meeting::remove` —
  no removal function existed for schedule meetings at all. Completes
  the Wave 2X weekday convention's write-side verification via a new
  `WEEKDAY_LABELS` constant (0=Sunday..6=Saturday). `CreateMeetingOutcome`'s
  eight typed variants (designed at ADR-0039's original milestone,
  never consumed past the repository layer) now reach the UI via a
  mirrored TS discriminated union, showing a distinct message per
  conflict type.
- **Deliberately not built**: no dev-preview-fixture wiring (same
  disclosed gap as Waves 2U/2W/2X/2Y); no `get_teacher_load` view; no
  one-off exceptional-date schedule overrides (ADR-0039's own
  long-standing non-goal).
- **Verification/checkpoint**: `npm run quality` 678/678 vitest (+20);
  typecheck/eslint/format/architecture clean; `cargo test` 571 lib
  tests (+3) plus new `tests/schedule_meeting_management.rs` (9/9,
  closing a second pre-existing command-boundary test gap); `cargo fmt
--check` / `cargo clippy --all-targets -- -D warnings` clean; `npm
run build` + `check:dev-preview-isolation` pass; `npm run
quality:security` clean, no new dependency; `npm run harness:verify`
  still exactly 100/100, unchanged.
- **Next**: `get_teacher_load` (the derived-load view); Subject
  Monitor / Adviser View; or the native NVDA/Narrator pass. No
  candidate pre-selected.

## Wave 3A — Teacher Load (added 2026-08-30)

Full record: `docs/adr/0039-*` Wave 3A addendum;
`docs/VERIFICATION-DEBT.md` Wave 3A entry. **New branch**
`claude/likha-sis-wave3a-teacher-load`, created from `62c58e0`
(Wave 2Z's own final, CI-confirmed checkpoint).

- **Built**: `TeacherLoadScreen.tsx` — a teacher views their own
  derived load (assignment count, distinct subjects, weekly
  instructional time as "Xh Ym") plus the assignments counted toward
  it, reusing the already-built `listMyAssignments`. Top-level "My
  Teaching Load" nav tab, no contextual handoff needed. **Zero new
  backend surface** — `get_teacher_load` already existed, gated, and
  unit-tested since ADR-0039's original milestone.
- **Deliberately not built**: School-Head-views-a-colleague's-load UI
  (deferred); no dev-preview-fixture wiring (same disclosed gap as
  Waves 2U/2W/2X/2Y/2Z); no overload-threshold warning/enforcement
  (ADR-0039's own long-standing non-goal).
- **Verification/checkpoint**: `npm run quality` 686/686 vitest (+8);
  typecheck/eslint/format/architecture clean; zero Rust files touched
  (`cargo test` reconfirmed 571/571 unchanged); `npm run build` +
  `check:dev-preview-isolation` pass; `npm run quality:security` clean,
  no new dependency; `npm run harness:verify` still exactly 100/100,
  unchanged.
- **Next**: Subject Monitor / Adviser View; the School-Head-views-a-
  colleague's-load extension; or the native NVDA/Narrator pass. No
  candidate pre-selected.

## Wave 3B — Session-Expiry False-Positive Fix (added 2026-08-30)

Full record: `docs/adr/0022-*` Wave 3B addendum;
`docs/VERIFICATION-DEBT.md` Wave 3B entry. **New branch**
`claude/likha-sis-wave3b-session-expiry-fix`, created from `e465a42`
(Wave 3A's own final, CI-confirmed checkpoint).

- **Discovered and fixed**: `AppError::Unauthorized` serializes
  identically for "session genuinely invalid" and "session valid but
  not permitted for this action" — the frontend's session-expiry
  wrapper (ADR-0022) could not tell them apart, so every
  `Capability`/`authorize_view_teacher_load`/`authorize_own_assignment`-gated
  command (31 total, already shipped across Sections, Learners, SF1
  Import, Teaching Assignments, Class Schedule, Subject Attendance)
  was silently force-logging out a session that merely got a
  legitimate permission denial. Found while planning the
  School-Head-views-a-colleague's-load feature, which would have
  exercised this path constantly. Fixed by extending `invoke.ts`'s
  exemption set from `login` alone to all 31 gated commands,
  enumerated explicitly and cross-checked against every `pub fn
authorize_*` in `auth/mod.rs`. Not a security change — no Rust
  `authorize_*` gate touched.
- **Deliberately not built**: the deeper Rust-side `Forbidden`/
  `Unauthorized` type split — properly needs independent security
  review, out of proportion to this bounded fix.
- **Verification/checkpoint**: `npm run quality` 692/692 vitest (+6);
  typecheck/eslint/format/architecture clean; zero Rust files touched
  (`cargo test` reconfirmed 571/571 unchanged); `npm run build` +
  `check:dev-preview-isolation` pass; `npm run quality:security` clean,
  no new dependency; `npm run harness:verify` still exactly 100/100,
  unchanged.
- **Next**: the School-Head-views-a-colleague's-load extension (now
  safe to build); Subject Monitor / Adviser View; or the native
  NVDA/Narrator pass. No candidate pre-selected.

## Wave 3C — School Head views a colleague's Teacher Load (added 2026-08-30)

Full record: `docs/adr/0039-*` Wave 3C addendum;
`docs/VERIFICATION-DEBT.md` Wave 3C entry. **New branch**
`claude/likha-sis-wave3c-teacher-load-colleague-view`, created from
`72fc3cc` (Wave 3B's own final, CI-confirmed checkpoint).

- **Built**: `TeacherLoadScreen` gained a "View" picker
  (`list_school_members`, filtered to the `teacher` role) letting a
  School Head view a colleague's derived load; the heading updates to
  "`<Name>`'s Teaching Load". Zero new backend surface —
  `get_teacher_load` already supported any authorized target id.
  Security must not rely on UI hiding: every school member sees the
  same picker, and a Teacher who selects a colleague is denied
  server-side exactly as before, now surfaced as a local message
  (safe since Wave 3B closed the false-positive-logout bug this path
  would otherwise trigger).
- **Deliberately not built**: no dev-preview-fixture wiring (same
  disclosed gap as Waves 2U/2W/2X/2Y/2Z); no overload-threshold
  warning/enforcement (ADR-0039's own long-standing non-goal).
- **Verification/checkpoint**: `npm run quality` 696/696 vitest (+4
  net); typecheck/eslint/format/architecture clean; zero Rust files
  touched (`cargo test` reconfirmed 571/571 unchanged); `npm run
build` + `check:dev-preview-isolation` pass; `npm run
quality:security` clean, no new dependency; `npm run harness:verify`
  still exactly 100/100, unchanged.
- **Next**: Subject Monitor / Adviser View (needs real new
  authorization-shape design work); or the native NVDA/Narrator pass.
  No candidate pre-selected.

## Wave 3D — Subject Monitor (added 2026-08-30)

Full record: `docs/adr/0055-*` Wave 3D addendum;
`docs/VERIFICATION-DEBT.md` Wave 3D entry. **New branch**
`claude/likha-sis-wave3d-subject-monitor`, created from `f7d7029`
(Wave 3C's own final, CI-confirmed checkpoint).

- **Built**: `subject_attendance::monitor_for_assignment` (Rust) —
  per-learner present/absent/late/excused counts and a current
  consecutive-absence streak, scoped to one teaching assignment's
  roster as of a requested date. New `subject_attendance_monitor`
  command, gated identically to every other command in that file
  (`authorize_own_assignment` — zero new authorization shape). New
  `SubjectMonitorScreen`, reachable directly from the Daily Teaching
  nav group.
- **Deliberately split from Adviser View** (the other half of "Subject
  Monitor / Adviser View" carried since Wave 2V): Adviser View needs an
  "adviser of a section" relationship that does not exist anywhere in
  this codebase's schema — confirmed by an exhaustive grep, including
  SF2's own command file, which gates only on
  `require_active_school_scope` despite being informally called
  "adviser-facing" in `PRODUCT-CONTRACT.md`. Real, cross-cutting design
  work (SF2, SF5, SF9, RBAC), deferred as its own wave rather than
  rushed alongside this one.
- **A real bug caught by TDD before shipping**: the first streak
  implementation walked only entry rows that exist (an inner join), so
  a `held` session opened but never marked for a learner was invisible
  to the streak instead of breaking it — silently bridging two
  non-adjacent absences into a false "consecutive" streak. A dedicated
  test written before the fix caught it (expected `1`, got `2`). Fixed
  by walking every `held` session id and looking up each learner's
  entry by `(session_id, membership_id)`, so a missing entry now
  explicitly breaks the streak.
- **Deliberately not built**: Adviser View (see above); no
  dev-preview-fixture wiring (same disclosed gap recent waves' new UI
  left open); no configurable absence-streak threshold or automatic
  flag (the spec explicitly defers this as a later enhancement).
- **Verification/checkpoint**: `npm run quality` 705/705 vitest (+9
  net from Wave 3C's 696/696); typecheck/eslint/format/architecture
  clean; `cargo test` 579 lib tests (+8) and all integration binaries
  green, including 2 new command-boundary tests; `cargo fmt --check` /
  `cargo clippy --all-targets -- -D warnings` clean; `npm run build` +
  `check:dev-preview-isolation` pass; `npm run quality:security` clean,
  no new dependency; `npm run harness:verify` still exactly 100/100,
  unchanged.
- **Next**: Adviser View (needs the 10-scenario evaluation process for
  its authorization-shape design); or the native NVDA/Narrator pass. No
  candidate pre-selected.

## Wave 3E — Section Advisory Foundation (added 2026-08-30)

Full record: `docs/adr/0056-section-advisory-foundation.md`;
`docs/VERIFICATION-DEBT.md` Wave 3E entry. **New branch**
`claude/likha-sis-wave3e-section-advisory-foundation`, created from
`00b4040` (Wave 3D's own final, CI-confirmed checkpoint).

- **Built**: ran the project's own 10-scenario evaluation process to
  decide how "adviser of a section" is represented and authorized.
  Recommended (chosen): `section_advisories`, a half-open temporal
  interval table mirroring `section_memberships` exactly
  (`starts_on`/`ends_on` nullable, "at most one active adviser per
  section" as a real unique partial index) — chosen over a bare
  `sections.adviser_user_id` column (Next Best) because DepEd schools
  reassign advisers by school year and a mutable column would silently
  lose prior years' history. New `Capability::ManageSectionAdvisories`
  (School Head only); new `auth::authorize_adviser_of_section` gate
  (self-or-School-Head, mirrors `authorize_view_teacher_load`) — not
  yet called by any command, ready for the next wave's Adviser View
  read; three new commands (assign/end, capability-gated;
  current-adviser read, session-only-gated reference data).
  **Foundation only**: zero UI, zero change to any existing Subject
  Attendance code path, matching this project's zero-UI-first
  precedent for a new domain.
- **A real cross-school isolation bug caught by TDD before shipping**:
  the first `authorize_adviser_of_section` implementation never
  verified `section_id` actually belonged to the caller's own school
  before authorizing a School Head via the capability path — a
  dedicated test caught it on first run (the same bug class
  `authorize_view_teacher_load`'s own TDD pass caught during an earlier
  wave). Fixed by resolving the section against the caller's school
  before either authorization path.
- **Deliberately not built**: the actual Adviser View read of Subject
  Attendance data (next slice); no UI; no seed/migration path from
  prior data (correct — no history exists to migrate).
- **Verification/checkpoint**: `cargo test` 594 lib tests (+15: 9
  repository tests, 6 auth-gate tests) and all integration binaries
  green, including 7 new command-boundary tests; `cargo fmt --check` /
  `cargo clippy --all-targets -- -D warnings` clean; `npm run quality`
  705/705 vitest, unchanged (backend-only wave except the `invoke.ts`
  exemption-list addition for the two new capability-gated commands);
  `npm run harness:verify` still exactly 100/100, unchanged.
- **Next**: the actual Adviser View read (repository function +
  command + UI screen), reusing `authorize_adviser_of_section`; or the
  native NVDA/Narrator pass. No candidate pre-selected.

## Wave 3F — Adviser View (added 2026-08-30)

Full record: `docs/adr/0056-section-advisory-foundation.md` Wave 3F
addendum; `docs/VERIFICATION-DEBT.md` Wave 3F entry. Branch
`codex/likha-sis-wave3f-adviser-view`, based exactly on Wave 3E
checkpoint `4de3973`; remote feature checkpoint `874a630`.

- **Built**: read-only section-wide Subject Attendance projection;
  authorized Adviser View section listing; Tauri commands; TypeScript
  domain/port/application/adapter wiring; and a Daily Teaching Adviser
  View screen in all three comfort modes.
- **Authorization**: an adviser lists only active advisory section(s); a
  School Head lists their own school's sections. The selected section is
  re-authorized by `authorize_adviser_of_section` on every overview read.
  Cross-school and unrelated-teacher reads fail closed; the picker is
  never the boundary.
- **Signals**: per current learner, raw Present/Absent/Late/Excused
  totals across assigned subjects; subject names containing absences;
  highest current absence streak within any one subject. Streaks are not
  combined across subjects. No notes or write controls. Screen states
  **Subject attendance — not SF2**.
- **Correctness fix**: Subject Monitor's “as of” date now filters future
  sessions/entries (`session_date <= as_of_date`), not only the roster.
  Adviser View reuses the corrected projection.
- **Verification**: local `npm run quality` 714/714, build/architecture/
  format/type/lint green, `cargo fmt --check` green, harness 100/100;
  GitHub Security Gate `33317574476` and Quality Gate `33317574392`
  completed/success (Ubuntu 598 Rust lib tests + UI gate; Windows 602
  Rust lib tests + native Tauri build; all integration/clippy green).
- **Next**: Wave 3G, Section Adviser Management UI — wire assign/end
  advisory commands into the School Head's Sections workflow so the
  new view is configurable without seeded data.

## Wave 3G — Section Adviser Management UI (added 2026-08-31)

Full record: `docs/CURRENT-HANDOFF.md` top entry;
`docs/ACTIVE-PLAN.md`'s new top section. Continued on branch
`claude/continue-working-v7xzb3` (this session's designated harness
branch), reset onto Wave 3F's exact checkpoint `0c62884` — the
`codex/likha-sis-wave3f-adviser-view` line was the actual most-advanced,
CI-verified state of the project (Wave 2Z through 3F), not yet reflected
on `main`; this session's own prior branch content (a single `.skills`
compatibility commit) was trivial and not lost in substance. `main`
remains untouched at `d9ab036`, unaware of Waves 2Z-3G.

- **Built**: closes the setup gap Wave 3F's report explicitly named —
  Adviser View worked once advisories existed, but no production UI
  created them. New TS domain/port/application/Tauri-adapter layers for
  `SectionAdvisory`/`AssignAdviserOutcome`/`EndAdvisoryOutcome`, mirroring
  Wave 2Y's Teaching Assignments pattern exactly. New
  `SectionAdviserScreen`, reached from `SectionsScreen`'s new "Manage
  adviser" button, wired into `App.tsx` as a contextual tab
  (`section-adviser`) the same way `teaching-assignments` already is.
- **No new authorization surface** — every command wired here
  (`assign_section_adviser`/`end_section_adviser`/
  `current_section_adviser`) already existed and was already tested from
  Wave 3E; this milestone is UI-only, zero Rust changes.
- **Reassignment is deliberately explicit end-then-assign**, not a
  one-step replace — the assign form only appears once the current
  adviser has been ended, matching `TeachingAssignmentsScreen`'s own
  remove-then-create convention and preserving advisory history.
- **Verification, all actually run this session**: `npm run quality`
  735/735 (up from 714 — 21 new tests), typecheck/lint/format/
  architecture all clean; `npm run build` clean; `npm run
check:dev-preview-isolation` clean; `npx knip` unchanged from the
  pre-existing baseline (zero new findings); `cargo fmt --check` clean
  (no Rust files touched). GitHub Actions CI not yet re-run on this
  session's push.
- **Not done this milestone**: a fresh independent security review
  (still owed generally per `docs/VERIFICATION-DEBT.md`; this slice adds
  no new authorization logic, so the risk is lower than Wave 3E/3F, but
  the debt is not closed by that alone).
- **Next**: no candidate pre-selected — see `docs/CURRENT-HANDOFF.md` for
  the evaluation once this checkpoint's CI is confirmed.

## Integration Review + Main Fast-Forward (added 2026-08-31)

**`main` is now the verified integration baseline at `9c1514c`**,
fast-forwarded from `d9ab036` through Waves 2Z, 3A-3G (79 commits). Full
record: `docs/CURRENT-HANDOFF.md` top entry; `docs/VERIFICATION-DEBT.md`'s
new top entry.

- A real, pre-existing CI failure on `main` itself was found and fixed
  during this milestone: the `.skills` commit (`7365180`, landed by a
  prior session without running `npm run quality`) was failing Quality
  Gate CI on `main`. Fixed with a formatting-only pass confined to
  `.agents/`.
- A `security-reviewer` closed the specific cross-milestone question
  this gate exists to answer (does authorization compose correctly
  across every wave's commands combined) — no BLOCKING/SHOULD-FIX
  findings. Each wave's own individual review debt (3E/3F/3G) remains
  separately open.
- Both Quality Gate and Security Gate confirmed green on `main`'s new
  head (`9c1514c`) after the fast-forward, not assumed.

## Wave 1 — UI redesign shell (ADR-0064) (added 2026-09-03)

Wave 1 UI redesign shell (ADR-0064): a persistent sidebar + adaptive
drawer/bottom-nav replaces the flat workbench nav; Calm Civic Classroom
palette unchanged, five additive contrast-verified tokens; pinned Home
still routes to Teacher Workspace (role-adaptive Home is Wave 3). Old
AppShell/WorkbenchNav/NavItem removed.

## Wave 2 — UI redesign layout primitives (ADR-0064 addendum) (added 2026-09-03)

Wave 2 (ADR-0064 addendum): layout primitives Page / KpiStrip+Kpi /
BentoGrid+Card / DataTable added; DataTable's phone reflow is a prop
(`reflowAt`) keyed to a `data-reflow` CSS block, not per-screen CSS;
Today's Classes and Sections migrated onto them as proof; KpiStrip/Card/
BentoGrid first consumed in Wave 3.

## Wave 3 — UI redesign role-adaptive Home (ADR-0064 addendum) (added 2026-09-03)

Wave 3 (ADR-0064 addendum): the `CurrentSession` DTO gains
`roles: Vec<String>` (frontend `roles: string[]`), populated from a new
parameterised `repository::role::list_roles`, scoped to the session's own
user+school, reached only post-auth — **display-only**, never an
authorization signal. New `HomeScreen` renders the Home tab: a plain
teacher gets `TeacherWorkspaceScreen` as-is; a `school_head` gets a local
view-switch to a new `SchoolHeadHome` (section/learner totals + recent
SF1 imports, existing reads only — attendance rollup / advisers-without /
teacher-load are Wave 4). Independent `security-reviewer` pass:
PASS-WITH-MINORS, no blocking, the one Minor fixed in-wave.
`TeacherWorkspaceScreen` not yet deleted (later slice).

## Wave 4 — UI redesign School-Head Home enrichment (ADR-0064 addendum) (added 2026-09-03)

Wave 4 (ADR-0064 addendum): one new aggregate read —
`attendance::school_day_totals(conn, school_id, date)` → `{present,
absent, tardy}` counts only, `ManageLearners`-gated command with
server-derived school scope. `SchoolHeadHome` gains an "Attendance
today" KPI (% present, tone thresholds, raw-count foot), a "Sections
without an adviser" card, and a "Teaching load" card with a

> 1.5×-median outlier text flag — the last two composed client-side from
> existing reads (`currentAdviser`, `listMembers` + `getLoad`).
> Independent `security-reviewer`: **PASS** (no blocking, no should-fix).
> Attendance-by-grade still deferred (needs a temporal membership join).

## Current Milestone

## Wave 6 — UI redesign final review + merge (ADR-0064 addendum) (added 2026-09-03)

Wave 6 (ADR-0064 addendum): no screen-migration tasks executed (the four
remaining table screens' keyboard models made DataTable migration too
risky for the session budget). Independent whole-branch review (Opus):
SHIP-WITH-FOLLOWUPS, no Critical, Rust/auth + architecture + behaviour
preservation all clean; three Important findings (drawer focus into an
inert subtree; missing signed-in <h1>; DataTable reflow dropping table
roles) fixed in-wave. Redesign (Waves 1-6) merged to `main`. Accepted
backlog: DataTable adoption by the 4 table screens, teacher-Home rebuild

- TeacherWorkspaceScreen/PageHeader deletion, Login/first-run restyle,
  SchoolHeadHome attendance-by-grade, six review minors, native SR pass.

## Current Milestone

## Wave 5 — UI redesign Page scaffold re-fit (ADR-0064 addendum) (added 2026-09-03)

Wave 5 (ADR-0064 addendum): all 16 remaining in-shell screens moved onto
the shared `Page` primitive (wrapper only — no data/behaviour/table
change; almost every test file unchanged). `Page` gained an optional
`headingRef` prop so `SectionRosterScreen` (which returns focus to its
heading from six action handlers) could re-fit. Remaining redesign
slices (Wave 6): DataTable migration of the table screens, the teacher
Home redesign + `TeacherWorkspaceScreen` deletion, Login/first-run
restyle, and the attendance-by-grade card.

## Wave 3H — Fresh Roadmap Survey and Next-Slice Selection (added 2026-08-31)

Planning-only wave, run from GitHub issue #6 on branch
`claude/issue-6-20260831-1042`, `HEAD` `9ff7c09` (confirmed exactly the
issue's expected checkpoint, not merely an ancestor). Full record:
`docs/product/WAVE-3H-DECISION.md`; `docs/CURRENT-HANDOFF.md` top entry;
`docs/ACTIVE-PLAN.md`'s new top section.

Surveyed every required authority doc plus ADR-0035's Wave 0-7 roadmap
and evaluated 11 next-slice candidates (the 10 the issue named plus one
this survey surfaced) directly against current repository state,
including a source grep confirming no password-reset/change command
exists anywhere in `src-tauri/src` today.

**Durable finding**: "password reset/account recovery" was previously
scored low (4.20, 2026-08-25 reassessment) specifically because a safe
admin-reset flow needed the then-deferred Roles & Permissions decision.
RBAC shipped since (ADR-0036, Wave 1) and this candidate was never
re-scored — the original blocker is gone. Recorded here so a future
session doesn't re-read the stale 4.20 score without this correction.

**Recommended (Wave 3I, not started)**: Admin-Assisted Password Reset —
a School Head resets a colleague's LIKHA password within their own
school, reusing `Capability::ManageSchoolMembership`, existing Argon2id
hashing, school-scoping, and the audit-log table unchanged. Deliberately
unrelated to the separate, still-unresolved Windows-DPAPI/SQLCipher
key-recovery question (ADR-0044) — LIKHA's own app-level credentials are
independent of that. **Runner-up**: close the Adviser View dev-preview/
Playwright verification debt already on record. Wave 5 Sync's
10-scenario decision and the raw-database backup/recovery design
question were both evaluated and deliberately not selected — each is
decision-shaped, not implementation-shaped, and needs its own dedicated
scenario-process wave first.

**Completion estimates recorded** (both explicitly disclosed as coarse,
evidence-derived, not precise): roughly 44% of the originally-planned
ADR-0035 Wave 0-7 roadmap (Subject Attendance/Section Advisory, a full
additional owner-supplied feature line, delivered outside that plan and
not counted in the denominator); roughly 55-65% ready for a Windows-only
synthetic-data facilitator-guided mock pilot, roughly 20-25% ready for
production use with real learner PII.

**Verification**: doc-only wave; no product/Rust/test/dependency/
migration/workflow/harness-metadata file touched — see
`docs/CURRENT-HANDOFF.md`'s top entry for the actual verification run.

## Wave 3J: SF4 Export UI Trigger (added 2026-09-01)

Full record: `docs/CURRENT-HANDOFF.md`'s top entry. Recommended next
slice from the Wave 3m reconciliation below, now shipped: a second
export button in `MonthlySummaryScreen.tsx` calling the already-shipped
`exportSchoolMonthlyAttendanceSf4`, enabled independent of the selected
section's report (SF4 is school-wide, not section-scoped) — only a
valid month gates it. `npm run quality` 794/794 (3 new tests), build,
`check:dev-preview-isolation`, `harness:verify` 100/100, `git diff
--check` all clean. No Rust files touched — pure TS/UI change against
an already-CI-verified Rust command. **Self-correction, same session**:
this entry originally (and PR #19's body) wrongly claimed SF5/SF6 UI
triggers were "deliberately unwired" per ADR-0059 — that ADR's "no UI"
claim was only ever about SF4. SF5 (`SectionRosterScreen.tsx`) and SF6
(`SectionsScreen.tsx`) already shipped real UI during the Wave 3m
reconciliation (ADR-0057/0058's own "Addendum" sections); only their
dev-preview fixture demo stub was unwired. See
`docs/CURRENT-HANDOFF.md`'s top entry for the full correction.

## Wave 3m Reconciliation (added 2026-09-01)

Full record: `docs/adr/0060-wave-3m-reconciliation.md`. Two independent
delivery lineages (`main`'s own harness-restoration line and a
different coding agent's `antigravity/likha-sis-wave3m-*` product line)
diverged from the same Wave 3E checkpoint and were reconciled by hand
(not a blind merge — their independent Adviser View reimplementations
conflict at the content level). **`main` kept its own Adviser View/
Section Adviser Management implementation** (already reviewed,
Playwright-verified, and free of a real `session_date <= as_of_date`
regression the parallel Wave 3m version still carries) and **adopted
Wave 3m's genuinely new work on top of it**: SF2/report-card class-
adviser byline, School Form 5 Section Promotion (ADR-0057), School Form
6 School Promotion Summary (ADR-0058), School Form 4 Monthly Attendance
Consolidation (ADR-0059, backend/port-layer only — deliberately no UI
trigger yet). `npm run quality` 777/777 vitest, typecheck/lint/format/
architecture clean. `cargo build`/`cargo test`/`cargo clippy` could not
run locally this session (missing Tauri/GTK system libraries,
`sudo apt-get` install needed unavailable interactive approval) — every
dependent Rust signature was instead hand-verified against the actual
current repository source; this is disclosed verification debt
(`docs/VERIFICATION-DEBT.md`), pending GitHub Actions CI confirmation.
Merged as PR #18 (2026-09-01) after Quality Gate and Security Gate both
confirmed green on the exact head SHA, zero open review threads.

## Wave 3I — Admin-Assisted Password Reset (added 2026-08-31)

Implementation wave, run from GitHub issue #9 (a delivery-retry of an
earlier same-issue run whose ephemeral session produced no durable
artifact). Branch `claude/issue-9-20260831-1305`, `HEAD` `fa8d21c`
(confirmed exactly the issue's expected checkpoint). Full record:
`docs/adr/0061-admin-assisted-password-reset.md`;
`docs/CURRENT-HANDOFF.md`'s new top entry.

Closes the gap Wave 3H's survey identified: a teacher who forgets their
LIKHA password (distinct from the existing 15-minute lockout, which
already self-clears) previously had no legitimate in-app recovery path
at all. Ran the project's 10-scenario decision process; selected
**School Head sets a new password directly, effective immediately**
(reuses `Capability::ManageSchoolMembership`, the existing Argon2id
path, and the existing `audit_log` table, widened not replaced).
Recorded **Next Best, explicitly deferred not rejected**: a
system-generated temporary password with forced change at next login —
would need a new `users` schema flag and a new login-flow interception
point this codebase doesn't have yet; the switch condition is a future
finding that School-Head-durably-knows-the-password is unacceptable for
this deployment model, not effort alone.

**Durable facts for future sessions**: `admin_reset_teacher_password`
is the first `audit_log` event type where the acting user
(`actor_user_id`) genuinely differs from the event's subject
(`user_id`/`username`) — migration 24 widened the table for this,
preserving every pre-existing row losslessly with `actor_user_id =
NULL`. A successful reset also clears the target account's lockout
state as a deliberate, in-scope side effect (not a change to ADR-0019's
lockout policy itself). An unknown target and a target in a different
school are indistinguishable (`Ok(false)`, no audit write) —
enumeration-safety by construction, not code-review vigilance.

**Verification**: `npm run quality` 770/770; `npm run build`; `npm run
harness:verify` 100/100; `cargo fmt --check`; `git diff --check`; all
clean. `cargo test`/`cargo clippy` could not run in-session (missing
Linux GTK/WebKit system libraries, `apt-get install` needs interactive
approval unavailable here) — retained as debt in
`docs/VERIFICATION-DEBT.md`; GitHub CI is authoritative for that check.
Independent security review dispatched — see this wave's own final
report and `docs/VERIFICATION-DEBT.md` for the actual outcome.

## Reveal-Exported-File ("Open folder") Feature (added 2026-09-01)

User-directed continuation. Second of two app-wide debts the UX-03
teacher-ux review retry flagged (the first, self-disabling buttons, was
already fixed). Scoped to SF2/SF4 in `MonthlySummaryScreen.tsx` only —
remaining export surfaces (SF5, SF6, report card, learner roster) stay
open debt, pattern proven.

Added `tauri-plugin-opener` v2.5.5 (Rust) / `@tauri-apps/plugin-opener`
v2.5.5 (npm) — official first-party Tauri 2 plugin, `revealItemInDir()`
opens the OS file manager at a path. Registered in `src-tauri/src/lib.rs`;
capability `opener:allow-reveal-item-in-dir` granted narrowly. Has a
real, fixed CVE (CVE-2025-31477) in its `open`-family APIs' untrusted-
input path/URL-scope validation, patched upstream at 2.2.1+, this
project pins 2.5.5 — the standing discipline (enforced in doc comments
at every layer) is to only ever call `revealExportedFile` with a path
this app itself just returned from a successful export, never a
user-typed or otherwise untrusted string. See `docs/SOURCE-REGISTRY.md`.

Plumbing: `revealExportedFile(filePath)` added to `ExportRepository` →
`TauriExportRepository` → `ExportApplicationService` (trims, rejects
empty) → `FixtureExportRepository` (genuine no-op, dev-preview has no OS
file manager to open). UI: an "Open folder" button next to each of the
SF2/SF4 result blocks in `MonthlySummaryScreen.tsx`, with its own
loading/error state, reset on section/month change.

**Verified**: `npm run quality` 801/801 (9 new tests, plus a
`revealExportedFile` stub added to every existing `FakeExportRepository`/
`SlowExportRepository` test double the interface change touched), `npm
run build`, `npm run check:dev-preview-isolation`, `npm run
harness:verify` 100/100, `git diff --check` — all clean. Rust touched
(`lib.rs`, `Cargo.toml`, `capabilities/default.json`): `cargo build`
clean; `cargo test`/`cargo clippy --all-targets -- -D warnings`/`cargo
fmt --check` run this wave — see `docs/CURRENT-HANDOFF.md`'s top entry
for the confirmed outcome.

## Verification Debt Sweep: Wave 3I Security Review Retry + Native Visual Pass (added 2026-09-01)

User-directed ("work on verification debts"). Retried the previously
agent-resume-blocked Wave 3I `security-reviewer` — succeeded this time.
0 BLOCKING, 1 SHOULD-FIX (missing Rust-side minimum password length in
`admin_reset_teacher_password`; deliberately not fixed inline, since it
matches an already-disclosed, deliberate codebase-wide convention
documented in `src/domain/password-policy.ts` — fixing only this one
path would create an undocumented asymmetry with `register_user`/
`bootstrap_installation`; recorded as a project-wide follow-up).

Closed the visual half of the long-open "Native visual / screen-reader
inspection" debt for the four M0–M6 screens (`LoginScreen`,
`FirstRunSetupScreen`, `AppShell`, `LearnerListScreen`) using the
documented `playwright-cli` workaround (`chromium.launch({
executablePath: "/opt/pw-browsers/chromium" })`). Found and fixed a real
layout bug in the process: `WorkbenchNav`'s CSS used a `border-right`
divider between nav groups, correct only when every group shares one
row — once `.workbench-nav`'s flex-wrap pushes a later group onto its
own row (which happens at ordinary desktop widths too, not just narrow
ones, confirmed even at the primary 1366px width), an earlier group's
divider became an orphaned floating line. Fixed by making the divider an
unconditional `border-bottom` in `src/ui/theme/styles.css`, which
degrades correctly under any wrap configuration — this is the kind of
finding jsdom-based structural tests structurally cannot catch, which is
exactly why this debt category exists. Screen-reader pass (NVDA/Narrator)
remains open — no Windows screen reader available in this sandbox.

`npm run quality` 801/801 (no regressions), `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100), `git
diff --check` all clean. Only `src/ui/theme/styles.css` changed.

## Reveal-in-Folder: SF5/SF6/Report Card/Roster (added 2026-09-02)

Extended the "Open folder" reveal affordance (proven on SF2/SF4 in Wave
"Reveal-Exported-File", PR #24) to the four remaining export surfaces:
SF5 (`SectionRosterScreen.tsx`), SF6 (`SectionsScreen.tsx`), report
card export (`ClassRecordWorkspace.tsx`), learner roster export
(`LearnerListScreen.tsx`). Pure UI wiring — the `revealExportedFile`
plumbing already existed at every layer (port, `TauriExportRepository`,
`ExportApplicationService`, `FixtureExportRepository`'s no-op) from
PR #24, so no backend change was needed. This closes the app-wide
"raw file path, no reveal affordance" verification debt completely.

`npm run quality` 805/805 (4 new interaction tests), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` all clean. No Rust touched.

## Self-Disabling-Button Sweep: GradingPeriods/ScheduleMeetings/TeachingAssignments (added 2026-09-02)

Second batch of the self-disabling-button sweep, prepared in parallel
with PR #27's first batch (auth/session screens) while its CI ran.
Applied the proven `disabled=` → `aria-disabled=` + handler-guard
pattern to `GradingPeriodsScreen.tsx` (per-row "Save"),
`ScheduleMeetingsScreen.tsx` ("Schedule meeting" + per-row "Remove"),
and `TeachingAssignmentsScreen.tsx` ("Assign teacher" + per-row
"Remove") — five instances across three screens sharing a simple
create-form-plus-removable-row shape. Per-row guards check the specific
row/id already in flight, preserving each screen's existing per-row
(not whole-list) disabling behavior.

`npm run quality` 810/810 (5 new interaction tests), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` all clean. No Rust touched.

## Self-Disabling-Button Sweep: Auth/Session-Critical Screens (added 2026-09-02)

Extended the proven `disabled=` → `aria-disabled=` + handler-guard
pattern (first fixed for 3 instances in Wave "Self-disabling-button
focus loss") to four more: `LoginScreen.tsx` ("Sign in"),
`FirstRunSetupScreen.tsx` ("Finish setup"),
`AdminPasswordResetScreen.tsx` ("Reset password"), and
`IdleTimeoutWarning.tsx` ("Stay signed in") — the standalone
auth/session-critical screens with exactly one self-contained submit
button each. Deliberately scoped, not the full ~40-instance sweep across
~15 files, to keep the change reviewable; the remaining instances stay
open debt with the pattern fully proven (see
`docs/VERIFICATION-DEBT.md`).

`npm run quality` 809/809 (4 new interaction tests, each proving the
handler guard blocks a second submission while the first is still in
flight, not just that the button looks disabled), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` all clean. No Rust touched.

## Self-Disabling-Button Sweep: ClassRecords/SectionAdviser/LearnerList (added 2026-09-02)

Third batch of the self-disabling-button sweep. Applied the proven
`disabled=` → `aria-disabled=` + handler-guard pattern to
`ClassRecordsScreen.tsx` ("Open class record", "Add subject"),
`SectionAdviserScreen.tsx` ("End advisory", "Assign adviser"), and
`LearnerListScreen.tsx` ("Export learner list", per-row "Save",
"Enroll learner", "Create separate learner") — 7 instances across 3
screens. `LearnerListScreen.tsx`'s per-row "View history"/"Edit" and
"Cancel" buttons were deliberately left native `disabled` after
confirming by reading the code that neither is an instance of this bug.

`npm run quality` 821/821 (7 new interaction tests), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` all clean. No Rust touched. 19 of ~45
total instances now fixed across 10 screens.

## File-Based Independent-Review Workaround (added 2026-09-02)

The recurring agent-resume/retrieval failure (dispatched reviewer
subagents complete real work but their findings text never comes back
to the orchestrating session — documented since M7) now has a real
workaround, not just a self-review fallback: dispatch via the
`general-purpose` agent instead of a dedicated reviewer agent, with
the dedicated reviewer's own checklist inlined into the prompt,
restricted to writing exactly one findings file to the session
scratchpad (no repository edits), then read that file directly instead
of relying on the notification channel. Validated live: UX-02, UX-03,
and the SF10 security review all returned real, retrievable,
evidence-backed findings this way after direct dispatches (plus the
one permitted resume) kept failing. Deliberately does **not** grant
`Write` to the dedicated reviewer agents themselves — see ADR-0062 for
why that was ruled out. Use this pattern next time the failure recurs,
after the one permitted resume, before falling back to self-review.

**Refinement (2026-09-04):** the `teacher-ux-reviewer`, `accessibility-reviewer`,
and `deped-researcher` agents have **no `Write` tool at all** (only
Read/Grep/Glob, plus Bash for the a11y one / WebSearch+WebFetch for the
researcher), so a "write your findings to a file" instruction to those
dedicated agents cannot work and the resume is wasted. For those three,
skip straight to a `general-purpose` agent with the dedicated reviewer's
checklist inlined. `security-reviewer` and `architecture-reviewer` do
have `Bash` and were able to write a findings file directly this session.

## Section-membership readers cross-school JOIN hardening (added 2026-09-03)

Every reader that joins `learners` to `section_memberships` now
independently constrains `l.school_id` — the conjunct `current_roster` /
`enrollable_learners` already had since the Wave 2O security review, now
applied uniformly to `section_membership::roster_for_section`,
`section_membership::roster_for_section_over_range`,
`attendance::roster_for_section_date`, `learner_score::roster_for_item`,
and (as an `EXISTS` on `learners`, since it returns only a bool)
`section_membership::is_active_member`. Previously these scoped only
`sm.school_id`, so a hand-forged `section_memberships` row pointing a
foreign-school `learner_id` at a local section would leak that learner's
name/LRN/sex through SF1 formgen, the monthly attendance grid, SF2
export, `import::commit`, the attendance roster, and the score roster
(and let an attendance write hit a foreign `learner_id` via
`is_active_member`). Behaviour-preserving for all correct data (every
membership-creating path binds the same `school_id` to both the
in-school guard and the `INSERT`; `learners.school_id` is never
updated). The `roster_for_section*` half was long-carried verification
debt (Wave 2O/2P/2Q/2T "apply next time that area is touched"); the
`attendance` / `learner_score` readers were found by this change's
mandatory `security-reviewer` pass (verdict PASS-WITH-MINORS, no
blocking — findings retrieved via the file-based workaround after the
direct return came back empty). Six TDD isolation tests. No new ADR —
the established defense-in-depth pattern applied uniformly; recorded as
`docs/adr/0042-*` "Addendum (post-Wave-3, 2026-09-03)". Branch
`claude/p1-roster-school-id-join-hardening` off `main` `860cede`.

## SF10 Permanent Record (added 2026-09-02)

Content-based CSV export of a learner's cumulative academic history
(grades/promotion status per school year, across every school year
ever enrolled) — `export::sf10` + `export_learner_permanent_record_sf10`,
gated by `Capability::ManageLearners` (Registrar/School Head only,
unlike SF5's adviser-of-section or SF6's plain session-scope gates).
Deliberately unrelated to the separate, still-evidence-blocked official
`.xlsx` SF10 template track (`formgen::template_version`, ADR-0053) —
this is the same disclosure-not-refusal CSV pattern SF2/SF4/SF5/SF6
already ship. Full detail: `docs/adr/0063-sf10-permanent-record.md`.

## UI-redesign independent reviews closed; Wave 5 sync PoC blocked by EO 119 (added 2026-09-04)

The owed independent reviews of the UI redesign (Waves 1-6, ADR-0064) +
UX-02/03/04 were finally run (via `general-purpose` agents writing to
files — the dedicated `teacher-ux-reviewer` / `accessibility-reviewer`
have no Write tool and could not deliver findings through the harness).
Reports: `docs/reviews/2026-09-04-ui-redesign-*.md`. **Architecture PASS
(debt closed). Teacher-UX PASS-WITH-MINORS (debt closed; S4 fixed —
`SchoolHeadHome` raw ISO date + "rows" → `formatIsoDate` + "learners").
Accessibility PASS-WITH-MINORS (downgraded, not closed): F1 (`home-view-toggle`
had no CSS/pressed state), F2 (skip-to-content link added), F3 (drawer
focus-return no longer races the Page heading focus) fixed; the native
NVDA/Narrator + `quality:ui` pass across the redesigned surface remains
owed.** vitest 963/963.

**Wave 5 sync PoC is BLOCKED.** The DepEd/government data-governance gate
ADR-0065 flagged as decision-invalidating was researched
(`docs/research/2026-09-04-deped-data-governance-gate-eo-119.md`).
**Executive Order No. 119, s. 2026** (signed 13-14 July 2026) — a
government data classification + residency framework that covers
government data held by private contractors regardless of whether it is
personal data — makes offshore hosting of a school's learner PII
contingent on its EO 119 classification: **Confidential** → offshore
only with Joint Oversight Committee approval (a government act LIKHA
cannot self-grant, no published process); **Restricted** → secured cloud
anywhere with encryption. The classification is unsettled until the EO
119 implementing guidelines publish (~November 2026). ADR-0065's status
is now "shortlist chosen but not approvable as-is"; the sync
implementation PoC must not start; the likely re-scope is a
Philippines-hostable backend (which may need paid-infra approval if no
free PH option qualifies). ADR-0065's "DepEd Order No. 58, s. 2017"
citation was wrong — that Order adopts new school forms, it is not a
data-privacy policy; DepEd relies on RA 10173 directly + regional
Privacy Manuals; the DepEd Central Office Privacy Manual must be
obtained from the DepEd DPO before the gate can close.

## Cloud Sync Target ratified — Cloudflare Worker + single D1 (added 2026-09-03; SUPERSEDED by the 2026-09-04 EO 119 gate above)

**ADR-0065** decides Wave 5's cloud sync target (decision-only — no
Worker, no schema, no `SyncProvider` implementation). 20-scenario
weighted pass against a purpose-built **100-point metric**, under a hard
**zero-cost + no-payment-card-at-signup** gate the owner set. Scope
(owner, 2026-09-03): **one database for one school** — not multi-tenant,
not one-DB-per-school-at-scale — which removed the multi-tenant
structural-isolation advantage that drove the earlier, unmerged
"Durable Object per school" draft (branch
`origin/claude/cloudflare-likha-setup-a5oq5i`, superseded, do not merge).

- **Recommended: Cloudflare Worker + one D1 database.** D1 is SQLite
  (41+ migrations carry over), the query API is SQL-over-HTTPS callable
  from the Rust core with no JS SDK, one Worker + one binding is the
  smallest secure surface, Cloudflare's standard free plan needs **no
  card**, D1 is GA, and the free tier is perpetual with no inactivity
  auto-pause.
- **Next Best: Cloudflare Worker + one SQLite Durable Object** — first
  fallback if D1's consistency model is awkward; keeps structural
  per-school isolation in hand if the scope ever re-widens.
- **Third (only if leaving Cloudflare): Turso single database over
  HTTP** — best non-Cloudflare SQLite-native option, discounted only for
  vendor-direction churn (Turso is publicly discontinuing edge replicas
  for new users and steering off `libSQL sync()`).
- **Disqualified on the card gate or the Rust-client requirement:** the
  JS-first local-first engines (PowerSync, ElectricSQL, Triplit,
  InstantDB, Jazz — no Rust client, would force sync into the frontend),
  cr-sqlite self-hosted (no zero-card managed cloud), Supabase (7-day
  inactivity auto-pause + standing "no Supabase" exclusion), Firestore /
  Mongo (document-model reuse mismatch).

Left for the implementation milestone (own ADR + mandatory
`security-reviewer`): sync unit, conflict policy, the device credential
shape, and end-to-end encryption of the cloud copy. The zero-cost +
no-card gate is now a recorded constraint on any future infrastructure
choice.

## Repo-wide tenant-isolation JOIN audit (added 2026-09-04)

**ADR-0066** extends the ADR-0042-addendum `l.school_id` hardening
(which covered only readers joining `learners` to `section_memberships`)
to **every** `JOIN` across two+ tenant-scoped tables in
`src-tauri/src/repository/**` (there are none in `export/**` /
`formgen/**`). 8 readers gained an independent `school_id` constraint on
each joined tenant table: `class_record` (`DETAIL_SELECT_LIST` +
`section_and_period_range_in_school` + `school_year_in_school`),
`teaching_assignment` (`DETAIL_SELECT`),
`attendance::roster_for_section_date` (the `attendance_records`
`LEFT JOIN`), `grading_computation::leaf_percentage_score` (took a new
`school_id` param), `schedule_meeting` (`has_teacher_conflict` /
`has_section_conflict` / `total_weekly_minutes_for_teacher`), and
`section_membership::dependent_records_stranded`. All defense-in-depth —
`class_record::create` / `teaching_assignment::create` /
`schedule_meeting::create` already validate every FK is in-school, so
cross-school FK rows cannot arise through the app; a hand-forged one is
the threat model. The `grading_computation` fix is grade-correctness (a
forged foreign `scored` row would be pooled into a DepEd term grade —
regression test proves PS 85.0 vs 92.5). 5 new forged-row regression
tests, each watched RED→GREEN. No schema/migration/command/`authorize_*`
change. Full record: `docs/adr/0066-repo-wide-tenant-isolation-join-audit.md`.
Confirmed already-safe (no change): global reference-data joins,
`section_advisory` (`sec.school_id = sa.school_id` in the `ON`),
`user::list_members_in_school` (`users` global), `subject_attendance`
entries (no `school_id` column — child of its session).

## Current Milestone

See `ACTIVE-PLAN.md`. (The harness audit above is a separate,
non-feature milestone and does not change this pointer.)
