# Progress Map

Operational map, not a project diary — see `docs/ACTIVE-PLAN.md` for full
verification detail per milestone, `docs/product/M8-DECISION.md` for the
current product-decision rationale.

Status legend: ✓ Complete · ◐ In Progress · ○ Candidate · ⚠ Blocked ·
↺ Review Required

```
FOUNDATION
  ↓
M0 Workspace Foundation ✓
  ↓
M1 LocalDatabase Foundation ✓          (deps: M0)
  ↓
M2 Encryption-at-Rest ✓                (deps: M1)
  ↓
M3 Application Services ✓              (deps: M1)
  ↓
M4 Authentication & Local Session ✓    (deps: M1-M3)
  ↓
M5 App Shell & First UI Slice ✓        (deps: M4)
  ↓
M6 First-Run Bootstrap ✓               (deps: M4, M5)
  ↓
Windows Machine-Migration Checkpoint ✓ (infra, not app milestone)
  ↓
M7 Attendance Tracking ✓ ↺             (deps: M1, M3, M4, M5)
  ↺ architecture/teacher-ux/accessibility review outstanding
    (harness agent-resume issue; security review done, self-review
    fallback for the rest — see docs/CURRENT-HANDOFF.md)
  ↓
M8 Monthly Attendance Summary ✓ ↺      (deps: M7)
  ↺ architecture/teacher-ux/accessibility not attempted; one
    security-reviewer attempt hit the same harness issue, self-review
    fallback — see docs/CURRENT-HANDOFF.md
  ↓
M9 Section Foundation + DepEd Attendance Semantic Alignment ✓ ↺ (deps: M1,
  M7, M8; redirected mid-session from the originally-decided Learner
  Profile Enrichment — see docs/product/M9-DECISION.md and
  docs/adr/0008-section-foundation-and-attendance-semantics.md)
  ↓
M10 Local Section-Level SF2 Export + Reusable Official-Form Engine
  Foundation ✓ ↺ (deps: M9; user-directed pick, not autonomous — see
  docs/adr/0009-sf2-export-and-official-form-engine.md)
  ↓
M11 Grading-Period Foundation ✓ ↺ (deps: none new; user-named next best
  in the same message that directed M10 — see
  docs/adr/0010-grading-period-foundation.md)
  ↓
M12a Gradebook/Class Record Foundation ✓ ↺ (deps: M9 sections, M11
  grading periods; user-directed the full M12/M13/M14 roadmap in one
  message, M12 phased into M12a/M12b/M12c per advisor guidance — see
  docs/adr/0011-gradebook-class-record-foundation.md)
  ↓
M12b Assessment Items and Learner Scores ✓ ↺ (deps: M12a; DepEd's
  WW/PT/QA terminology repealed and renamed mid-project, same as M11's
  grading-period finding — see
  docs/adr/0012-assessment-items-and-scores.md)
  ↓
M12c Score-Entry Keyboard, Mobile, and Audit Polish ✓ (deps: M12b;
  UI-only — Enter/Arrow row-to-row navigation, blur/Enter commit with a
  dirty-check, Escape-revert, first mobile-specific CSS in the app — see
  docs/ACTIVE-PLAN.md's "M12c" section)
  ↓
M13 DepEd Grade Computation ✓ (deps: M12b; primary-source research —
  downloaded and visually transcribed the actual DepEd Order No. 015,
  s. 2026 PDF; two of the Order's own worked examples reproduced exactly
  end-to-end; one weight group implemented, others explicitly deferred —
  see docs/adr/0013-deped-grade-computation.md)
  ↓
M14 Report Card / Official Grade Output ✓ (deps: M13; reuses M10's
  export::csv/FieldDisclosure architecture; disclosed, not gated, for
  subjects outside M13's one implemented weight group — see
  docs/adr/0014-report-card-export.md)
  ↓
M15 Expand DepEd Grading Policy Coverage ✓ (deps: M14; class records now
  explicitly pin a weight policy instead of always using the default;
  second policy seeded (EPP/TLE & MAPEH); corrects an over-flagged
  GMRC/VE gap from ADR-0013/0014 — see
  docs/adr/0015-expand-grading-policy-coverage.md)
  ↓
M16 SHS + Exceptional Grading Policies ✓ (deps: M15; all six DepEd
  Table 10/Key Stage 4 weight groups added as pure seed data, zero
  algorithm or TS/UI changes — empirically confirms ADR-0015's "purely
  additive" prediction, including two structurally exceptional shapes
  (Examinations-as-TE-only, no-Examinations) proven by new end-to-end
  tests — see docs/adr/0016-shs-and-exceptional-grading-policies.md)
  ↓
M17 Learner Profile Enrichment (LRN + Sex only) ✓ (deps: M16;
  user-directed roadmap: M15 → M16 → M17 → M18 → Roles & Permissions —
  see docs/CURRENT-HANDOFF.md. Scoped to exactly the fields
  export::sf2/export::report_card actually disclosed as missing (LRN,
  Sex) — birthdate/guardian contact deliberately not added, no shipped
  export needs them — see docs/adr/0017-learner-reference-number-and-sex.md)
  ↓
M18 Bulk Attendance / Teacher Productivity ✓ (deps: M17; Autonomous
  Continuous Development Mode's first fully self-continued milestone —
  no fresh user instruction between M17's completion and M18's start —
  see docs/adr/0018-bulk-attendance-mark-all-present.md)

Roles & Permissions — resolved: deferred, not built (2026-08-24, user
  asked directly — see docs/product/M8-DECISION.md's follow-up
  section). Directed roadmap complete; work below is autonomously
  selected, not user-directed.
  ↓
Account Lockout After Failed Logins ✓ (Autonomous Continuous
  Development Mode, selected from docs/product/M8-DECISION.md's own
  20-scenario list — deps: none new) — see
  docs/adr/0019-account-lockout.md
  ↓
Idle-Timeout Session Hardening ✓ (deps: none new — closes the other
  half of the shared-computer threat model ADR-0004 deferred, alongside
  account lockout) — see docs/adr/0020-idle-timeout-session-hardening.md

Still available, not on the directed roadmap but not superseded: Key
  Stage 1 descriptive grading (structurally different computation) and
  Grade 12 DO 8 carryover (re-investigated 2026-08-24: weights are now
  known, but DO 8's own transmutation table differs from DO 015's and
  needs its own research pass plus an architecture decision, not a
  purely-additive change like the SHS groups — deps: M16); audit
  log/activity trail, learner search/filter, teacher dashboard, data
  export/backup, password reset (all from the same original 20-scenario
  list, not yet built); a global session-expiry UI redirect (identified
  by ADR-0020 — this app has never told a teacher plainly their session
  expired for any reason, it just fails the next action generically)
LearnerListScreen edit affordance for M17's disclosed LRN/Sex gap ✓
  (2026-08-24, same session as M18)
```

## Major output per milestone (one line each)

- M0-M3: workspace, SQLCipher-encrypted local DB, validated application
  services.
- M4: Argon2id auth, school-scoped sessions, no roles yet.
- M5-M6: first real screens, teacher modes, first-run bootstrap.
- M7: teachers can mark/view daily attendance per learner.
- M8: school-wide monthly attendance overview (DepEd-SF2-inspired, not
  a verified reproduction — real gaps disclosed on-screen).
- M9: a `Section`/`SectionMembership` foundation and DepEd-aligned
  3-status attendance model (Present/Absent/Tardy, no invented
  "Excused"); attendance/roster/monthly-summary are now section-scoped.
- M10: a section-level, DepEd-SF2-inspired monthly attendance CSV export
  (`Documents\LIKHA-SIS\`), triangulated against DepEd Order No. 4 s.2014
  plus two independent sources plus M8's real workbook — every field this
  schema can't honestly populate is disclosed, not fabricated. Reusable
  pieces for future official-form exports: `export::csv` (CSV writer) and
  the `FieldDisclosure` pattern (populated/omitted fields as structured
  data, driving both the CSV's trailing comment block and the on-screen
  disclaimer from one source).
- M11: a policy-driven, versioned `GradingPolicy`/`GradingPeriod`
  foundation — DepEd's grading-period terminology changed mid-project
  (DepEd Order No. 9, s. 2026, four quarters to three terms), so periods
  are reference data with a citation, not hardcoded; schools enter their
  own actual dates. No grade computation yet.
- M12a: `Subject` and `ClassRecord` (one section + one subject + one
  grading period). No `school_year` field of its own on `ClassRecord` —
  the section's and grading period's `school_year` must match, checked
  once at creation, so there's one source of truth instead of two that
  could drift. No assessment items/scores yet (M12b).
- M12b: assessment items and learner scores. DepEd's WW/PT/QA
  terminology has itself been repealed and renamed (DO 8 s.2015 →
  DO 015 s.2026, "Quarterly Assessment" → "Examinations"), so categories
  are seeded reference data, not a hardcoded enum, mirroring M11's
  grading-policy pattern exactly. Scores follow attendance's own idiom
  (absence of a row = unrecorded, three real statuses beyond that);
  eligibility is checked against the actual grading-period date range,
  not a single date; every score is attributed to the recording
  session's own user id. No grade computation yet (M13).
- M12c: the score-entry table is now keyboard-efficient (Enter/Arrow
  commit-and-move between learners, Escape reverts, blur commits, a
  dirty-check skips no-op writes) and mobile-aware (narrow-width layout
  re-flows to full-width/44px-touch-target rows instead of shrinking the
  desktop table). A real re-entrancy bug (programmatic focus-move firing
  a synchronous native blur that re-triggered a commit already in
  flight) was caught by this milestone's own test and fixed with an
  imperative in-flight guard. UI-only; no schema/repository/command
  changes.
- M13: a real DepEd term-grade computation
  (`IG = Σ(PS × weight%)`, SY-selected transmutation-or-zero-based
  rounding, a 60-grade floor), verified against two of DepEd Order No.
  015 s.2026's own worked examples reproduced exactly. Examinations'
  internal Summative Test 1/2 + Term Exam structure modeled via a
  self-referencing `parent_category_id` on `assessment_categories`
  (10-scenario decision, reuses M12b's item/category machinery
  unchanged). Only one DepEd weight group implemented (core K-10 English/
  Filipino/Math/Science/AP/GMRC); several others (EPP/TLE & MAPEH, all
  SHS groups, GMRC/VE domain split, KS1 descriptive grading, Grade 12's
  DO 8 carryover) explicitly deferred, not silently assumed correct.
- M14: a CSV report-card export per class record (learner, Initial
  Grade, Term Grade, transmuted-vs-zero-based basis, minimum-floor note),
  reusing M10's `FieldDisclosure` pattern (relocated to a shared module
  for this second use). Not gated per DepEd weight group — `Subject` has
  no weight-group classification to gate on — so it inherits M13's own
  disclose-don't-refuse choice, with an always-visible warning rather
  than a Guided-mode-only hint, since the limitation affects every
  teacher mode.
- M15: class records explicitly pin a DepEd weight policy
  (`weight_policy_id`, teacher-set at creation) instead of always
  silently using the default; a second policy (EPP/TLE & MAPEH) is now
  seeded and genuinely applied — proven by a test showing identical raw
  scores produce different grades under the two policies. No new
  architecture decision (reused ADR-0010/0013's existing versioned-
  reference-data pattern). Corrects an over-flagged gap: GMRC/VE's
  weighting was already correct since M13, only its domain-tagging UI
  remains unimplemented.
- M16: all six DepEd SHS/Key Stage 4 weight groups (Table 10), added as
  pure seed data with zero algorithm or TS/UI code changes — empirically
  confirms every further DepEd weight group is now purely additive, per
  ADR-0015's own prediction. Two of the six are structurally exceptional
  (Examinations as a Term Examination only with no Summative Tests; no
  Examinations component at all), both proven correct by new end-to-end
  tests rather than assumed from the migration's data alone.
- M17: `learners` gains exactly two optional fields, LRN and Sex, each
  verified against two independent sources describing what this app's
  own already-shipped SF2/report-card exports actually require —
  birthdate and guardian contact stayed out because no shipped export
  discloses either as missing. Both exports now populate the fields when
  present and disclose per-learner (not globally) when absent. DB-level
  `CHECK`/unique-index enforcement, not just application validation. The
  `updateProfile` plumbing to edit an existing learner's LRN/Sex is built
  and tested but has no UI screen calling it yet — a disclosed gap.
- M18: a "Mark all present" button on `AttendanceScreen` fills in every
  currently-unmarked roster learner as Present in one action, and never
  overwrites a mark a teacher already made — the real workflow it
  targets is "assume present, then flag the exceptions," not an
  export-correctness fix (an unmarked day already renders like Present
  in SF2's export). Reuses the existing isolation-checked
  `record()`/`roster_for_section_date` paths; no new architecture, no
  new authorization surface.
- Account Lockout: five wrong passwords against one known username
  locks it for 15 minutes with immediate feedback on the triggering
  attempt; a locked account is rejected without even running Argon2id;
  a successful login resets the counter; an unknown username is
  completely unaffected. First milestone selected entirely
  autonomously (not from the user's directed roadmap) once Roles &
  Permissions was resolved.

## Next unlock

M8 unlocks: a proven "report over existing data" pattern reusable for
future exports, and a concrete, evidence-based case for a
`Section`/`GradeLevel` foundation (needed for a real section-level SF2).
M9 unlocks: a real section-level SF2 export becomes buildable, and every
future report/form milestone can scope by section instead of
school-wide.
M10 unlocks: a proven, disclosure-driven official-form export pattern
reusable for SF1/Form 137/138 and any future DepEd form this app
eventually produces.
M11 unlocks: full grading & gradebook becomes buildable once DepEd's
Written Work/Performance Task/Quarterly Assessment weighting formula is
separately researched — the period structure it needs to hang off of
now exists.
M12a unlocks: a class-record workspace (section + subject + grading
period) exists for M12b to attach assessment items and scores to.
M12b unlocks: real assessment/score data exists for M13 to compute
grades from, and M12c to layer entry-efficiency/audit polish onto.
M13 unlocks: a real, verified `ComputedTermGrade` exists for M14 to render
into an official report-card export.
M14 unlocks: a second official-form export exists alongside SF2, proving
the `FieldDisclosure` pattern generalizes across form types via the
shared `export::mod`; completing the remaining DepEd weight groups (a
future milestone) would make this same export DepEd-compliant for every
subject without any further export-layer changes.
M15 unlocks: every future DepEd weight group (SHS, KS1, Grade 12) is now
a purely additive change — seed a policy + weight rows, following
migration 10/11's exact pattern — not a new architecture decision; the
class-record-level pinning mechanism and the UI picker/column/warning
text already generalize to however many policies exist.
M16 unlocks: the report-card export (M14) is now DepEd-compliant for
every Grade 4-11 subject with a seeded policy (8 of them); only Key
Stage 1, Grade 12 under the prior curriculum, and any subject a teacher
mis-assigns to the wrong policy remain gaps, all now disclosed rather
than silently wrong.
M17 unlocks: SF2 and the report-card export can now show a learner's LRN
(and SF2 their Sex) instead of omitting the column outright — the two
identifying fields DepEd's actual official templates need, added on
verified evidence rather than the original speculative "LRN/birthdate/
guardian" list. M18 and any future form-export milestone inherit this
without further schema work for those two fields.
M18 unlocks: a proven "safe bulk write" pattern (fill only what's
missing, never overwrite an existing explicit value) reusable for any
future bulk action on a per-day or per-record basis; the roadmap now
reaches its first genuine human-approval gate (Roles & Permissions),
demonstrating Autonomous Continuous Development Mode's stop condition
firing correctly rather than guessing at a product decision.
