# Security review - roster_for_section family - l.school_id JOIN hardening

Branch: claude/p1-roster-school-id-join-hardening (uncommitted working tree, off main @ 860cede)
Independent security review, read-only. Date: 2026-09-03

## VERDICT: PASS-WITH-MINORS

The production change adds AND l.school_id = ?2 to two SQL reads in
repository::section_membership (roster_for_section and roster_for_section_over_range)
and adds two regression tests. It is correct, safe, a pure tightening, and
adequately tested. No blocking issues. Findings 1 and 2 concern equivalent readers
elsewhere that were left untouched; Finding 3 is doc wording that overstates
completeness.

## Requested checks - results

### 1. Predicate correctness - PASS

File: src-tauri/src/repository/section_membership.rs

- roster_for_section (lines 963-971): query_map params tuple is
  (section_id, school_id, as_of_date) so ?1=section_id, ?2=school_id, ?3=as_of_date.
  The added AND l.school_id = ?2 binds school_id. Correct. Byte-identical scoping to
  the already-hardened current_roster (line 1013).
- roster_for_section_over_range (lines 1050-1058): params tuple is
  (section_id, school_id, start_date, end_date) so ?1=section_id, ?2=school_id,
  ?3=start_date, ?4=end_date. Body compares starts_on to ?4 and ends_on to ?3.
  The added AND l.school_id = ?2 binds school_id. Correct.
- No off-by-one; both queries already bound ?2 = school_id, so no renumbering.

### 2. Behaviour preservation - PASS (pure tightening)

Every section_memberships-creating path binds the SAME school_id to both its
in-school guard and its INSERT:

- enroll (section_membership.rs:196-263): guards
  learner::find_by_id_in_school(conn, school_id, learner_id) at line 219, then
  INSERTs with that same school_id at 259-263. import::commit calls enroll.
- enroll_membership (656-719): same shape.
- transfer_membership (408-489): guards learner::find_by_id_in_school at line 426,
  INSERTs with school_id at 485-489.
- learners.school_id is never updated anywhere. The only UPDATE on learners
  (repository/learner.rs:120) sets given_name, family_name, lrn, sex only. Learners
  never move schools.
- No CHECK or trigger ties section_memberships.school_id to the learner or section
  school (db/migrations.rs:92-100: FOREIGN KEY clauses only).
  Therefore a legitimately-enrolled learner ALWAYS has sm.school_id == l.school_id,
  and the new conjunct can only ever drop a row produced by a cross-school-corrupted
  or forged membership. It cannot drop a valid roster member.

### 3. Do the two new tests prove isolation? - PASS (genuine, not false-green)

Tests in section_membership.rs mod tests:
roster_for_section_join_independently_constrains_the_learner_to_the_same_school and
roster_for_section_over_range_join_independently_constrains_the_learner_to_the_same_school.
Each: setup() creates a real school and section; a second school and a foreign
learner are created; a section_memberships row is force-INSERTed via raw SQL with
school_id = LOCAL school, section_id = LOCAL section, learner_id = FOREIGN learner.

- The forged INSERT bypasses the enroll guard (find_by_id_in_school checks).
- It satisfies every FK (all three ids exist in their own tables).
- No CHECK constraint exists to reject it.
- It does not violate idx_one_active_membership_per_learner (foreign learner has
  no other open membership).
- execute(...).unwrap() would PANIC (test failure), not silently pass, if the
  INSERT were rejected, so there is no realistic trivially-green path.
  Without the production predicate: the forged row matches sm.section_id, sm.school_id
  and the date window, JOINs to the foreign learner, roster length becomes 1, and
  assert_eq len 0 fails with left 1 right 0 (matches the reported behaviour).
  With the predicate: l.school_id (other school) is not ?2 (local school), the row is
  filtered, roster is empty. The tests fail without the change and pass with it.

### 4. Completeness - TWO OTHER READERS HAVE THE SAME GAP (Findings 1 and 2)

### 5. Architecture boundary - PASS

Diff touches only: two SQL string literals inside the Rust repository layer, their
doc comments, two Rust unit tests, and three docs md files. No SQL added to the
frontend, no new or modified Tauri command, no change to any authorize gate or
SessionManager::require_active_school_scope path. check:architecture is unaffected.

### 6. Doc accuracy - see Finding 3. Core claims are accurate; the last-two-siblings

phrasing overstates completeness repo-wide.

## FINDINGS

### Finding 1 - SHOULD-FIX - two sibling readers with the identical isolation gap, unhardened and untracked

Severity: Should-fix
Files and lines:

- src-tauri/src/repository/attendance.rs:156-165 (fn roster_for_section_date)
- src-tauri/src/repository/learner_score.rs:185-194 (fn roster_for_item)
  Evidence:
- attendance.rs:157-164 selects l.id, l.given_name, l.family_name, joins
  learners l JOIN section_memberships sm ON sm.learner_id = l.id, and filters only
  sm.section_id = ?2 AND sm.school_id = ?1 (plus the date window). No independent
  l.school_id predicate. Returns learner PII. Live via the session-scoped command
  attendance_roster_for_date (src-tauri/src/commands/attendance.rs:22-32).
- learner_score.rs:186-193 selects l.id, l.given_name, l.family_name, joins
  learners l JOIN section_memberships sm ON sm.learner_id = l.id, and filters only
  sm.section_id = ?3 AND sm.school_id = ?2 (plus the date window). No independent
  l.school_id predicate. Returns learner PII. Live via the session-scoped command
  in src-tauri/src/commands/learner_score.rs:26.
  Failure scenario: identical to the one this change fixes. A forged or sync-
  corrupted section_memberships row (local school_id, foreign learner_id, which is
  possible because the schema has FKs only and no CHECK binding sm.school_id to the
  learner school) makes both queries JOIN through to the foreign learner and return
  that learner given_name and family_name across the tenant boundary, into the daily
  attendance roster grid and the learner-score entry roster respectively. These two
  readers are NOT covered by the superseded Wave 2O, 2P, 2Q, 2T debt items (which
  name only roster_for_section and roster_for_section_over_range), so the CLOSED
  record does not account for them.
  Suggested fix: add the same one-line predicate to each query:
  attendance.rs: add AND l.school_id = ?1 alongside sm.school_id = ?1
  learner_score.rs: add AND l.school_id = ?2 alongside sm.school_id = ?2
  plus a mirrored forged-cross-school-row regression test for each. If the team
  prefers to keep this change tightly scoped, instead add an explicit
  VERIFICATION-DEBT.md entry naming these two readers so the closure claim is not
  misleading.

### Finding 2 - MINOR - is_active_member checks only section_memberships

Severity: Minor
File and line: src-tauri/src/repository/section_membership.rs:1081-1088
Evidence: it counts rows in section_memberships filtered by section_id = ?1,
school_id = ?2, learner_id = ?3 and the date window only. No join to learners;
returns bool only.
Failure scenario: with a forged cross-school membership row, is_active_member
returns true for a foreign learner_id under the local school. It emits no PII, but
it is the roster gate for recording attendance, so a forged row could let an
attendance_records row be written for a foreign learner_id attributed to the local
school. That is a data-integrity effect, not a disclosure, and it requires the same
forged-row precondition. Materially lower risk than Finding 1.
Suggested fix: for consistency with the Wave 2O defense-in-depth pattern, add an
EXISTS check that learner_id resolves within ?2, or a
learner::find_by_id_in_school pre-check. Not required to land the current change.

### Finding 3 - MINOR - ADR-0042 addendum and PROJECT-MEMORY wording overstates completeness

Severity: Minor
Files:

- docs/adr/0042-learner-core-enrollment-domain-foundation.md (addendum near line
  1210: pattern "extended to its two remaining siblings")
- docs/PROJECT-MEMORY.md (new section: "extended to its last two siblings")
  Evidence: those phrases are accurate only within section_membership.rs and against
  the specifically-worded Wave 2O item 3, 2P item 3, 2Q item 4, 2T item 6 debt
  items, all of which name only roster_for_section and roster_for_section_over_range.
  Read repo-wide the claim is incomplete: attendance::roster_for_section_date and
  learner_score::roster_for_item (Finding 1) have the same JOIN shape and PII
  exposure and remain unhardened.
  Accurate in the docs: behaviour-preserving for all correct data; the composing-
  caller lists; the VERIFICATION-DEBT supersedes statement (correct as those items
  are worded); the no-new-ADR justification.
  Suggested fix: add one sentence to the addendum and the VERIFICATION-DEBT entry
  scoping the claim to these two functions and pointing at the two readers in
  Finding 1 as still-open (or fixed in the same change).

## Recurrence check (self-grant path and SELECT-then-act race)

- No unauthenticated bootstrap or self-grant pattern is introduced or touched; the
  change is read-only SQL. Not applicable.
- No new SELECT-then-act singleton guard; the change only adds a WHERE conjunct to
  two existing reads. The forged-row tests exercise the opposite: they confirm a
  check-then-act bypass via raw INSERT is contained by the query. Not applicable.

## Verification I ran

Source inspection only (read-only review). I did not re-run cargo test or cargo
clippy. The reported run (648 lib tests plus 20 integration binaries, 0 failed;
clippy -D warnings clean; fmt clean; npm run quality 961 of 961; quality:security
3 ok) is consistent with the diff scope.
