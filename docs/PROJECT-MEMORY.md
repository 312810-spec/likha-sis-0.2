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

## Current Milestone

See `ACTIVE-PLAN.md`.
