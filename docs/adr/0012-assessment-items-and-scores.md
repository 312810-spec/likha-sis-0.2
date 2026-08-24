# ADR-0012 — Assessment Items and Learner Scores (M12b)

Status: Accepted

## Context

M12a delivered the `Subject`/`ClassRecord` workspace foundation. M12b
builds on it: assessment items (e.g. "Quiz 1") and learner scores, the
next phase of the user's M12 roadmap.

Before writing schema, this milestone did its own inline DepEd research
(`WebSearch`/`WebFetch`, same method as ADR-0009/0010/0011, per
`.claude/rules/testing.md`/the `deped-compliance` skill) into whether
DepEd's Written Work/Performance Task/Quarterly Assessment terminology
was still current. It is not:

- **DepEd Order No. 8, s. 2015** ("Policy Guidelines on Classroom
  Assessment for the K to 12 Basic Education Program") — Written Work /
  Performance Task / Quarterly Assessment — has been **repealed**.
- **DepEd Order No. 015, s. 2026** ("Revised Guidelines on Classroom
  Assessment, Grading System, and Awards and Recognition for the K to 12
  Basic Education Program"), effective SY 2026-2027 alongside the
  three-term calendar M11 already modeled, renames the categories to
  **Written Works / Performance Tasks / Examinations** (the third
  category, formerly "Quarterly Assessment," now comprises Summative
  Tests plus a Term Examination). Triangulated across two independent
  secondary sources (depedclub.com, educlickph.com) agreeing on the
  category names, recommended quantities, and the repeal fact; the
  primary DepEd Order text was not directly fetched. **Per-category
  weighting percentages were not found in either source and are
  explicitly not modeled here** — that is DepEd Grade Computation's
  (M13) own research scope.

This is the exact same "policy is in flux, don't hardcode it" case M11
hit — advisor consultation before implementation confirmed the correct
response is the same one: versioned reference data with a citation, not
a hardcoded enum.

## Decision

- **`assessment_category_sets`/`assessment_categories`** — mirrors
  `grading_policies`/`grading_policy_periods` exactly: two seeded sets
  (DO 015 s. 2026, marked default; DO 8 s. 2015, marked explicitly
  repealed in its own citation text, not just non-default), each with
  fixed ordered category names. **Deliberately no FK tying a category set
  to a `grading_policies` row** — a school could reasonably record scores
  under either category naming regardless of which calendar policy it's
  on during the SY 2026-2027 transition. This pairing is unconstrained,
  disclosed here rather than left implicit; a future milestone could add
  the FK if that assumption turns out wrong.
- **`assessment_items`** — one per class record, categorized under a
  fixed reference-data category, `max_score REAL NOT NULL CHECK (max_score
  > 0)` always school-entered (DepEd's real per-item point values aren't
  > sourced anywhere this app can read).
- **`learner_scores`** — follows `attendance_records`' exact idiom:
  **absence of a row means "not yet recorded,"** not a fourth `status`
  value. `status IN ('scored', 'excused', 'not_applicable')`, with a
  `CHECK` pairing `scored` to a non-null `score` and the other two to a
  null one. `score <= max_score` cannot be a SQL `CHECK` (SQLite `CHECK`
  constraints cannot reference another table), so that bound lives in
  `repository::learner_score::record` and is tested directly against a
  real `max_score`. `recorded_by_user_id`/`recorded_at`/`updated_at` exist
  because this is the first mutable, teacher-authored data in this
  project's schema — not a separate "audit feature" (full mutation
  history remains M12c-or-later scope, per advisor guidance: three
  columns needed now, not a queue or log built early).
- **Eligibility check**: `learner_score::record` verifies the target
  learner held an active section membership at _any point_ in the class
  record's grading-period date range, via
  `section_membership::roster_for_section_over_range` (already built for
  M8's monthly grid) — a range check, not a single-date one, since a
  score covers a whole grading period, not one day. A learner who
  transferred in mid-period is still legitimately scoreable; a learner
  never on that section's roster during that period is not.
- **Attribution**: `SessionManager` gained `require_active_session()`
  (returns `(user_id, school_id)`, alongside the existing
  `require_active_school_scope()` which now delegates to it) so
  `commands::learner_score::record_learner_score` can set
  `recorded_by_user_id` from the session, never a client-supplied
  parameter — the same principle `school_id` has followed since ADR-0004,
  extended to "who," not just "which school."
- **Rejection convention**: every invalid-reference, ineligible-learner,
  or out-of-range-score rejection in `learner_score::record` collapses
  into `Ok(None)`, continuing `section_membership::enroll`'s established
  pattern. Score-range validation is _also_ done in
  `LearnerScoreApplicationService` (TypeScript) as a `ValidationError`
  with a specific message ("Score must be between 0 and 20") — the Rust
  `None` is the real security backstop; the TS layer exists purely so a
  teacher gets an actionable message instead of a generic failure.

## Consequences

- New: migration 8 (`assessment_category_sets`, `assessment_categories`,
  `assessment_items`, `learner_scores`), three new migration tests.
  `src-tauri/src/repository/{assessment_category,assessment_item,
learner_score}.rs`, `src-tauri/src/commands/{assessment_category,
assessment_item,learner_score}.rs`, `src-tauri/tests/assessment.rs`.
  `src-tauri/src/auth/mod.rs` gained `require_active_session`.
  `src-tauri/src/repository/class_record.rs` gained
  `section_and_period_range_in_school`, reused by both
  `assessment_item`/`learner_score`. New TS:
  `src/domain/{assessment,learner-score}.ts`, matching ports/adapters/
  services, `src/ui/ClassRecordWorkspace.tsx` (opened from a "Open
  workspace" action on the Class Records list) — item creation form,
  item list, and a per-item roster scoring table (status buttons +
  a score input revealed only for "Scored").
- Rust: 163 lib tests (up from 141) + 6 new `tests/assessment.rs`
  integration tests + migration-8 tests, all green;
  `cargo clippy --all-targets -- -D warnings` clean. TS: 221 tests green
  (39 files, up from 189/34); `npm run quality`/`npm run build` clean.
- Independent review: `security-reviewer` was dispatched for this
  milestone (per advisor guidance) but its findings text was not
  retrievable through the normal completion-notification/resume path on
  either the initial run or one resume-retry (real work confirmed via
  token/tool-use counts — 30 tool uses, ~87K tokens across two runs — but
  no usable output either time), the same session-wide agent-resume
  issue hit repeatedly since M7. Per this session's established
  escalation rule, a careful self-review was performed instead, covering
  the same four questions the dispatched review was asked: (1)
  `recorded_by_user_id` spoofing — `commands::learner_score::record_learner_score`
  (re-read directly) takes only `assessment_item_id`, `learner_id`,
  `status`, `score` as parameters; `user_id` comes exclusively from
  `sessions.require_active_session(&conn)?` and is passed straight to
  `learner_score::record`'s `recorded_by_user_id` argument — there is no
  code path by which a client-supplied value could reach that column.
  Not spoofable. (2) The `max_score` bound and status/score pairing —
  `learner_score::record`'s `match (status, score)` block (checked before
  any DB write) rejects every combination except `Scored` with a value
  in `0.0..=item.max_score`, or a non-`Scored` status with `None`; the
  schema's `CHECK` constraint independently enforces the null-ness
  pairing structurally, so even a hypothetical bypass of the Rust check
  (there isn't one reachable from a Tauri command — this is the only
  write path) would still be caught for null-ness, though not for the
  `max_score` bound itself, which is a cross-table check SQLite `CHECK`
  cannot express and therefore genuinely only lives in Rust — disclosed,
  not silently assumed safe. (3) Roster eligibility —
  `roster_for_section_over_range`'s overlap condition
  (`sm.starts_on <= ?end AND (sm.ends_on IS NULL OR ?start < sm.ends_on)`)
  is the same helper M8's monthly grid already relies on; `record`
  rejects any `learner_id` not present in that result before writing.
  Sound. (4) No new injection surface found — every new query in
  `assessment_category.rs`/`assessment_item.rs`/`learner_score.rs` uses
  parameterized `rusqlite` placeholders, no string concatenation.
  **No blocking findings; this is a self-review, not a substitute for a
  real second set of eyes** — re-run `security-reviewer` for M12b once
  agent-resume behavior is confirmed reliably working in a future
  session.
- Not implemented (deliberately out of scope, deferred to M12c or later):
  keyboard-efficient entry (bulk paste, tab-through), mobile-specific
  layout beyond ordinary responsive CSS, a full mutation-history/audit
  log beyond `recorded_at`/`updated_at`, editing/deleting an assessment
  item once created, per-category weighting/grade computation (M13),
  a UI for adding a third assessment category set beyond the two seeded
  ones, an FK constraining which category set pairs with which grading
  policy.

## M12c update (2026-08-24, continuation session)

The `security-reviewer` dispatched for M12b (above) never returned usable
output on either the initial attempt or the resume-retry — confirmed
still true at the start of this continuation session (no new completion
notification had arrived in the interim). Per the one-retry-then-self-
review rule, no further retry was attempted; the self-review finding
above was **re-verified directly against the current source** rather
than simply trusted: `src-tauri/src/commands/learner_score.rs:31-42`
still takes only `assessment_item_id`/`learner_id`/`status`/`score` as
parameters, with `(user_id, school_id)` coming exclusively from
`sessions.require_active_session(&conn)?`. Confirmed accurate,
unchanged.

M12c (keyboard-efficient entry, mobile-aware responsive layout,
auditability polish — listed above as deferred) is now complete; see
`docs/ACTIVE-PLAN.md`'s "M12c" section for the full implementation and
verification record. It was UI-only (no changes to this ADR's schema,
repository, or command surface) and did not require a new
`security-reviewer` dispatch, since it touches no
authorization/persistence/tenant-isolation logic. Still deferred, now to
a later milestone rather than M12c specifically: a full mutation-
history/audit log beyond a single "last saved" note, and a resolved
teacher display name on the score roster (would require a
`users` join the roster query doesn't currently do).
