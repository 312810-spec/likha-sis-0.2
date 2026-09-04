# Independent security review - ADR-0066 repo-wide tenant-isolation JOIN audit

Branch claude/tenant-isolation-join-audit @ 7bd0145 (off main). Read-only.

## VERDICT: PASS (safe to merge as-is)

No blocking or should-fix issues. Three Minor/Informational notes only.
Every create path validates same-school FKs; school_id is never UPDATEd
after insert (grep: only assessment_items SET name/category_id/max_score).

## 1. Completeness of the audit - CONFIRMED COMPLETE

- Every multi-table JOIN returning tenant data is in repository/**.
  commands/**, import/**, auth/**, export/**, formgen/** have NO JOIN SQL
  (export/sf2.rs and export/mod.rs render from structs). ADR claim verified.
- db/migrations.rs JOINs are one-time backfill DML over the whole DB, not
  tenant reads. Out of scope, correctly.
- Two repo JOINs not in the ADR inventory, both SAFE: assessment_item.rs:252
  and grading_computation.rs:264, each JOIN assessment_categories /
  grading_weight_components which are global reference tables with no
  school_id (migrations 309/451).
- Verified every ADR "Already correct" entry against source: audit_log:149
  users global; grading:147/170 policy_periods global; class_record:289/432
  weight_policies / curriculum_versions global; learner_score:192 sm/l/ls
  scoped; section_advisory:189 sa.school_id=?1 + transitive
  sec.school_id=sa.school_id; user:300 users global, m.school_id=?1, roles
  school_id=?2; subject_attendance:593 entries table has NO school_id
  (migration 1182), s.school_id=?1 present. All correct.

## 2. Correctness of the 8 fixes - CORRECT (no off-by-one; pure tightenings)

- #1 section_and_period_range_in_school: params (crid, school_id)=?1,?2;
  added AND gp.school_id = ?2.
- #2 school_year_in_school: same binding.
- #3 DETAIL_SELECT_LIST: ?1 is always school_id (list_by_school;
  list_by_section_in_school appends AND cr.section_id = ?2;
  find_detail_by_id_in_school appends AND cr.id = ?2). Added AND
  sec.school_id=?1 AND sub.school_id=?1 AND gp.school_id=?1. recorded_count
  subquery added AND ls.school_id = cr.school_id (see Minor A).
- #4 teaching_assignment DETAIL_SELECT: added AND sec.school_id=?1 AND
  sub.school_id=?1.
- #5 attendance roster LEFT JOIN: params (school_id, section_id, date)=
  ?1,?2,?3; added AND a.school_id = ?1 inside the ON. Row kept, foreign
  status nulled.
- #6 leaf_percentage_score: new sig (conn, school_id, crid, category_id,
  learner_id); query params (crid, category_id, learner_id, school_id)=
  ?1..?4; added AND ai.school_id = ?4 AND ls.school_id = ?4.
- #7 schedule_meeting x3: conflict checks params ?1..?5 with school_id=?2;
  total_weekly_minutes_for_teacher (teacher_user_id, school_id)=?1,?2;
  added AND sm.school_id = ?2. schedule_meetings has own school_id
  (migration 942).
- #8 dependent_records_stranded: ?2 = school_id (ls.school_id=?2 already);
  added AND cr.school_id = ?2 (see Minor B).
  Create paths validate FKs in-school: class_record::create lines 115/118/121;
  teaching_assignment::create and schedule_meeting::create call
  find_by_id_in_school on every FK. school_id immutable => cannot drop a
  legit row.

## 3. leaf_percentage_score signature change - SUFFICIENT

compute_term_grade threads its own school_id into both call sites (single
leaf plus child loop). Its school_id is session-derived everywhere:
commands/learner_score.rs:69 require_active_school_scope;
commands/export.rs:151/397/543/875 same; formgen/sf9_projection.rs:60 from a
session-scoped caller. compute_term_grade gates on school_year_in_school
(now cr.school_id AND gp.school_id) => None for a foreign class record. The
weight-component query (line 262) hits only global reference tables.
leaf_percentage_score is the ONLY learner_scores pool in the grade path.

## 4. dependent_records_stranded without a dedicated test - ACCEPTABLE

Added AND cr.school_id = ?2 is correct on an already heavily-constrained
subquery. Whole-subquery impact is availability-only (whether a transfer/
end is blocked), not a leak. Covered-by-existing-tests claim acceptable for
a one-token tightening. Parity forged-row test nice-to-have. Severity Minor.

## 5. The 5 new regression tests - GENUINE

Each forges via raw conn.execute INSERT that bypasses create, using a real
second school (school::create "Other School"), not a bogus/NULL FK. RED
reason traced to the isolation gap:

- attendance: forged row has in-scope section_id, learner, date, so without
  a.school_id=?1 the LEFT JOIN yields Some(Present); asserts None.
- class_record: cr-forged has in-scope school_id but Other-school section/
  subject/period, so without the 3 predicates the INNER JOINs resolve and
  leak SecretSection / school year / period label; asserts None from all 4
  readers.
- teaching_assignment: same shape; asserts ta-forged absent from list.
- grading_computation: WW1 17/20 legit plus forged scored 20/20 on real
  in-scope WW2 with school_id=other, so without ls.school_id=?4 PS=37/40=
  92.5; asserts Some(85.0). Matches the ADR RED value.
- schedule_meeting: forged meeting wd0 07:30-08:20 in Other school on the
  in-scope assignment overlaps new 08:00-08:50 and ta.school_id/ta.teacher
  match, so without sm.school_id=?2 it returns TeacherConflict; asserts
  Created. Deliberately sidesteps the UNIQUE(assignment,weekday,starts,ends)
  index.

## 6. Nothing wrongly classified SAFE

subject_attendance (no school_id on entries), section_advisory (transitive
sec.school_id = sa.school_id), user::list_members_in_school (users global;
membership plus roles constrained) all verified against db/migrations.rs.

## 7. Architecture boundary - UNAFFECTED

All edits are SQL strings / one private fn signature inside repository/**.
No SQL to frontend, no command surface change, no authorize_* change, no
schema/migration change. leaf_percentage_score stays private (not pub).
check:architecture unaffected.

## Minor / Informational

### A. Minor - class_record DETAIL_SELECT_LIST item_count subquery not school-scoped

src-tauri/src/repository/class_record.rs:312
(SELECT COUNT(*) FROM assessment_items ai WHERE ai.class_record_id = cr.id)
lacks AND ai.school_id = cr.school_id, unlike the sibling recorded_count
subquery hardened on line 315. A forged assessment_items row with a
cross-school school_id but in-scope class_record_id inflates item_count.
Cosmetic count only, no PII leak, not reachable via assessment_item::create.
Fix: add AND ai.school_id = cr.school_id for parity.

### B. Minor - dependent_records_stranded grades subquery: gp.school_id not constrained

src-tauri/src/repository/section_membership.rs:570-574
Fix added cr.school_id = ?2 but not AND gp.school_id = ?2, though
grading_periods carries school_id and fixes #1/#2 added exactly that
predicate on the same table. With cr.school_id = ?2 present a forged
class_records row is already excluded; needs a forged grading_periods id on
a legit cr (impossible via class_record::create). Availability-only.
Fix: add AND gp.school_id = ?2 for consistency.

### C. Informational - assessment_item::has_any_scores single-table, unscoped by design

src-tauri/src/repository/assessment_item.rs:113-119
Single-table guard (outside JOIN-audit scope) with an explicit comment that
the caller resolved the item in-school. A forged cross-school learner_scores
row on an in-scope item makes it return true => more conservative edit/
delete (fail-safe), availability-only, no leak. No action required.

## Recurrence check - the two historical failure classes

- Unauthenticated self-grant bootstrap: not touched. user.rs membership
  helpers are single-table, school-scoped, fail-closed for multi-school
  targets. No new unauthenticated path.
- SELECT-then-act singleton race: none introduced. All changes are added AND
  predicates on existing single-statement reads; no new check-then-write.
  schedule_meeting::create conflict checks remain additionally guarded by
  the DB UNIQUE index.
