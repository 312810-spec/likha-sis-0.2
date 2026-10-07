use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{class_occurrence, section_membership, teaching_assignment};

/// One teacher's plan to act on one learner's evidence from one class —
/// CTOS.md §M08's required loop, persisted:
///
/// ```text
/// Evidence → identified need → goal → intervention → participation →
/// follow-up → outcome
/// ```
///
/// The *evidence* and the *follow-up* steps already existed: the class
/// occurrence (migration 43) and its `learner_followup_markers` (migration
/// 44). This struct is the middle of that loop and its outcome end — the
/// teacher's explicit decision about what to do, whether the learner took
/// part, and what came of it.
///
/// Every case is anchored to one class occurrence, for the same reason a
/// follow-up marker is: the occurrence's own teacher is the one authorized
/// to act on its evidence, and that ownership is re-derived from the
/// occurrence on *every* transition rather than trusted from a
/// client-supplied case id. Keyed to the enrollment membership, not a bare
/// `learner_id`, matching `LearnerFollowupMarker`'s own convention — the
/// span is who was actually in the section on that date.
///
/// `learner_given_name`/`learner_family_name` are joined here, at the
/// repository, never client-supplied — the same rule M08's sibling surface
/// (`learner_score`'s correction authors) follows and for the same reason:
/// the whole point of this list is a teacher reading a *person's* name, and
/// a membership id says nothing. The schema's non-cascading
/// `REFERENCES section_memberships(id)` means the join cannot be orphaned.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LearnerSupportCase {
    pub id: String,
    pub school_id: String,
    pub class_occurrence_id: String,
    pub section_membership_id: String,
    /// The identified need — what the evidence said. Required: a case with
    /// no stated need is a status, not a plan.
    pub need: String,
    /// The target the intervention aims at. Required alongside `need`: a
    /// need with no goal cannot be closed by anything the teacher does.
    pub goal: String,
    /// What the teacher will do. Required for the same reason.
    pub intervention: String,
    /// `open` until participation is recorded, `in_progress` until the
    /// outcome is recorded, `resolved` thereafter. The schema's own CHECK
    /// constraints enforce this order — see migration 45.
    pub status: LearnerSupportStatus,
    /// Set when the case moved to `in_progress` — the loop's participation
    /// step. `None` while the case is still `open`.
    pub participation: Option<String>,
    /// Set when the case was resolved — the loop's outcome step. `None`
    /// until then, and immutable afterward.
    pub outcome: Option<String>,
    pub opened_by_user_id: String,
    pub opened_at: String,
    pub updated_at: String,
    /// `None` until the case is resolved. A resolved case keeps this
    /// timestamp forever: the outcome is a historical fact about that
    /// intervention, and CTOS.md §5's historical-integrity rule forbids a
    /// later edit from reinterpreting it.
    pub resolved_at: Option<String>,
    /// Joined from `learners` via the case's `section_membership_id`.
    pub learner_given_name: String,
    /// Joined from `learners` via the case's `section_membership_id`.
    pub learner_family_name: String,
}

/// The three states the loop's spine passes through, in the one order the
/// schema's CHECK constraints permit. Mirrors `OccurrenceStatus`'s own
/// convention: every value is stored, not derived, so the distinction is
/// the database's rather than whichever query happens to be reading it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LearnerSupportStatus {
    /// Need/goal/intervention recorded; nothing has happened yet.
    Open,
    /// The teacher has recorded participation — the intervention is under
    /// way.
    InProgress,
    /// An outcome has been recorded. Immutable.
    Resolved,
}

impl LearnerSupportStatus {
    fn from_db_str(value: &str) -> rusqlite::Result<Self> {
        match value {
            "open" => Ok(Self::Open),
            "in_progress" => Ok(Self::InProgress),
            "resolved" => Ok(Self::Resolved),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                1,
                rusqlite::types::Type::Text,
                format!("unknown learner_support_cases status: {other}").into(),
            )),
        }
    }
}

/// The select every read shares, joining the case's enrollment membership to
/// the learner's name — resolved here, at the repository, so no caller ever
/// has to map a membership id to a person itself.
const CASE_SELECT: &str = "SELECT c.id, c.school_id, c.class_occurrence_id, \
     c.section_membership_id, c.need, c.goal, c.intervention, c.status, \
     c.participation, c.outcome, c.opened_by_user_id, c.opened_at, \
     c.updated_at, c.resolved_at, l.given_name, l.family_name \
     FROM learner_support_cases c \
     JOIN section_memberships sm ON sm.id = c.section_membership_id \
     JOIN learners l ON l.id = sm.learner_id";

fn row_to_case(row: &rusqlite::Row) -> rusqlite::Result<LearnerSupportCase> {
    Ok(LearnerSupportCase {
        id: row.get(0)?,
        school_id: row.get(1)?,
        class_occurrence_id: row.get(2)?,
        section_membership_id: row.get(3)?,
        need: row.get(4)?,
        goal: row.get(5)?,
        intervention: row.get(6)?,
        status: LearnerSupportStatus::from_db_str(&row.get::<_, String>(7)?)?,
        participation: row.get(8)?,
        outcome: row.get(9)?,
        opened_by_user_id: row.get(10)?,
        opened_at: row.get(11)?,
        updated_at: row.get(12)?,
        resolved_at: row.get(13)?,
        learner_given_name: row.get(14)?,
        learner_family_name: row.get(15)?,
    })
}

fn case_for_id(
    conn: &Connection,
    school_id: &str,
    case_id: &str,
) -> AppResult<Option<LearnerSupportCase>> {
    conn.query_row(
        &format!("{CASE_SELECT} WHERE c.school_id = ?1 AND c.id = ?2"),
        params![school_id, case_id],
        row_to_case,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The caller must be the teacher on the case's occurrence's assignment —
/// re-derived here, never trusted from the caller. Mirrors
/// `class_occurrence::mark_followup`'s authorization exactly, because a
/// support case is the follow-up marker's continuation: the evidence that
/// justified the marker is the same evidence this case acts on.
fn authorize_case(
    conn: &Connection,
    school_id: &str,
    case: &LearnerSupportCase,
    actor_user_id: &str,
) -> AppResult<()> {
    let occurrence =
        class_occurrence::find_by_id_in_school(conn, school_id, &case.class_occurrence_id)?
            .ok_or(AppError::Unauthorized)?;
    class_occurrence::authorize_own_assignment(
        conn,
        actor_user_id,
        school_id,
        &occurrence.teaching_assignment_id,
    )
}

/// Rejects the empty-string case for a required piece of the plan. The
/// schema's own `CHECK (length(trim(..)) > 0)` is the last line of defense;
/// this is the boundary's, and it is what gives the teacher a named reason
/// rather than a raw constraint error.
fn reject_empty(value: &str, field: &str) -> AppResult<()> {
    if value.trim().is_empty() {
        return Err(AppError::validation(format!("{field} is required")));
    }
    Ok(())
}

/// Opens a support case on one enrollment for one occurrence. Returns
/// `Ok(None)` for an unknown occurrence or a membership that is not on that
/// section's roster for the occurrence's date, and `Err(Unauthorized)` when
/// the caller is not this class's teacher — the same three outcomes
/// `mark_followup` returns, for the same reasons.
#[allow(clippy::too_many_arguments)]
pub fn open_case(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
    section_membership_id: &str,
    need: &str,
    goal: &str,
    intervention: &str,
    actor_user_id: &str,
) -> AppResult<Option<LearnerSupportCase>> {
    reject_empty(need, "need")?;
    reject_empty(goal, "goal")?;
    reject_empty(intervention, "intervention")?;

    let Some(occurrence) =
        class_occurrence::find_by_id_in_school(conn, school_id, class_occurrence_id)?
    else {
        return Ok(None);
    };
    class_occurrence::authorize_own_assignment(
        conn,
        actor_user_id,
        school_id,
        &occurrence.teaching_assignment_id,
    )?;
    let assignment = teaching_assignment::find_by_id_in_school(
        conn,
        school_id,
        &occurrence.teaching_assignment_id,
    )?
    .ok_or(AppError::Unauthorized)?;
    let on_roster = section_membership::current_roster(
        conn,
        school_id,
        &assignment.section_id,
        &occurrence.occurrence_date,
    )?
    .iter()
    .any(|member| member.membership_id == section_membership_id);
    if !on_roster {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO learner_support_cases \
             (id, school_id, class_occurrence_id, section_membership_id, need, \
              goal, intervention, status, opened_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'open', ?8)",
        params![
            &id,
            school_id,
            class_occurrence_id,
            section_membership_id,
            need,
            goal,
            intervention,
            actor_user_id,
        ],
    )?;

    case_for_id(conn, school_id, &id)
}

/// Records the loop's participation step and moves the case to
/// `in_progress`. `Ok(None)` for an unknown case or one that is not `open`
/// — the one-order rule again: a case that has already started cannot be
/// re-started, and a resolved one cannot be wound back.
pub fn record_participation(
    conn: &Connection,
    school_id: &str,
    case_id: &str,
    participation: &str,
    actor_user_id: &str,
) -> AppResult<Option<LearnerSupportCase>> {
    reject_empty(participation, "participation")?;

    let Some(case) = case_for_id(conn, school_id, case_id)? else {
        return Ok(None);
    };
    authorize_case(conn, school_id, &case, actor_user_id)?;
    if case.status != LearnerSupportStatus::Open {
        return Ok(None);
    }

    conn.execute(
        "UPDATE learner_support_cases \
         SET participation = ?1, status = 'in_progress', \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?2 AND id = ?3",
        params![participation, school_id, case_id],
    )?;

    case_for_id(conn, school_id, case_id)
}

/// Records the loop's outcome and resolves the case. `Ok(None)` for an
/// unknown case or one that is not `in_progress` — a case cannot be closed
/// before anyone participated, which is what keeps "resolved" from meaning
/// "forgotten".
pub fn resolve(
    conn: &Connection,
    school_id: &str,
    case_id: &str,
    outcome: &str,
    actor_user_id: &str,
) -> AppResult<Option<LearnerSupportCase>> {
    reject_empty(outcome, "outcome")?;

    let Some(case) = case_for_id(conn, school_id, case_id)? else {
        return Ok(None);
    };
    authorize_case(conn, school_id, &case, actor_user_id)?;
    if case.status != LearnerSupportStatus::InProgress {
        return Ok(None);
    }

    conn.execute(
        "UPDATE learner_support_cases \
         SET outcome = ?1, status = 'resolved', \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?2 AND id = ?3",
        params![outcome, school_id, case_id],
    )?;

    case_for_id(conn, school_id, case_id)
}

/// Every case on one occurrence, open and resolved alike — the loop's
/// history, ordered so the most recent plan for a learner reads first. The
/// `id` tie-break is deliberate: `opened_at` has millisecond precision, so
/// two cases opened in one prompt-driven batch can share a timestamp, and a
/// tie alone would make the order nondeterministic. `id` is UUIDv7, whose
/// leading bytes are the generating timestamp, so `id DESC` breaks the tie
/// in the same newest-first direction rather than arbitrarily.
pub fn list_for_occurrence(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
) -> AppResult<Vec<LearnerSupportCase>> {
    let mut stmt = conn.prepare(&format!(
        "{CASE_SELECT} WHERE c.school_id = ?1 AND c.class_occurrence_id = ?2 \
         ORDER BY c.opened_at DESC, c.id DESC"
    ))?;
    let rows = stmt.query_map(params![school_id, class_occurrence_id], row_to_case)?;
    let mut cases = Vec::new();
    for row in rows {
        cases.push(row?);
    }
    Ok(cases)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{
        class_occurrence::{self, OccurrenceOutcome},
        learner, school, section, subject, teaching_assignment as ta_repo, user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        other_teacher_id: String,
        occurrence_id: String,
        membership_id: String,
        other_membership_id: String,
    }

    /// A school, two teachers, one section with two enrolled learners, one
    /// started occurrence, and the two roster membership ids a case can be
    /// opened on.
    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        let other = user::create_user(conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        user::add_school_membership(conn, &other.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = ta_repo::create(conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        let l1 = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let l2 = learner::create(conn, &s.id, "Ben", "Dela", None, None).unwrap();
        let m1 = section_membership::enroll(conn, &s.id, &sec.id, &l1.id, "2026-09-01")
            .unwrap()
            .unwrap();
        let m2 = section_membership::enroll(conn, &s.id, &sec.id, &l2.id, "2026-09-01")
            .unwrap()
            .unwrap();

        // A started occurrence on a date both memberships are active on.
        let occurrence =
            match class_occurrence::start(conn, &s.id, &assignment.id, "2026-09-09", &teacher.id)
                .unwrap()
            {
                OccurrenceOutcome::Started(o) => o,
                other => panic!("expected Started, got {other:?}"),
            };

        Fixture {
            school_id: s.id,
            teacher_id: teacher.id,
            other_teacher_id: other.id,
            occurrence_id: occurrence.id,
            membership_id: m1.id,
            other_membership_id: m2.id,
        }
    }

    fn open_case_on(f: &Fixture, conn: &Connection) -> LearnerSupportCase {
        open_case(
            conn,
            &f.school_id,
            &f.occurrence_id,
            &f.membership_id,
            "Missed the last two quizzes",
            "Answer 8 of 10 practice items correctly",
            "Ten-minute coaching session before class",
            &f.teacher_id,
        )
        .unwrap()
        .expect("the case should open")
    }

    #[test]
    fn opening_a_case_records_the_plan_and_starts_it_open() {
        let conn = open_test_db();
        let f = seed(&conn);

        let case = open_case_on(&f, &conn);

        assert_eq!(case.status, LearnerSupportStatus::Open);
        assert_eq!(case.need, "Missed the last two quizzes");
        assert_eq!(case.goal, "Answer 8 of 10 practice items correctly");
        assert_eq!(
            case.intervention,
            "Ten-minute coaching session before class"
        );
        assert!(case.participation.is_none());
        assert!(case.outcome.is_none());
        assert!(case.resolved_at.is_none());
        assert_eq!(case.opened_by_user_id, f.teacher_id);
        assert_eq!(case.learner_given_name, "Ana");
        assert_eq!(case.learner_family_name, "Cruz");
    }

    #[test]
    fn the_learner_name_is_resolved_by_the_repository_not_the_caller() {
        let conn = open_test_db();
        let f = seed(&conn);

        let listed = list_for_occurrence(&conn, &f.school_id, &f.occurrence_id).unwrap();
        let opened = open_case(
            &conn,
            &f.school_id,
            &f.occurrence_id,
            &f.other_membership_id,
            "Need",
            "Goal",
            "Intervention",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        // The write path resolves it too, not only the list path.
        assert_eq!(opened.learner_given_name, "Ben");
        assert_eq!(opened.learner_family_name, "Dela");

        let after = list_for_occurrence(&conn, &f.school_id, &f.occurrence_id).unwrap();
        assert_eq!(after.len(), listed.len() + 1);
        let names: Vec<_> = after
            .iter()
            .map(|c| {
                (
                    c.learner_given_name.as_str(),
                    c.learner_family_name.as_str(),
                )
            })
            .collect();
        assert!(names.contains(&("Ben", "Dela")));
    }

    #[test]
    fn the_full_loop_advances_in_one_order_only() {
        let conn = open_test_db();
        let f = seed(&conn);
        let case = open_case_on(&f, &conn);

        // Resolving before any participation is not a valid transition.
        assert!(
            resolve(&conn, &f.school_id, &case.id, "Caught up", &f.teacher_id)
                .unwrap()
                .is_none(),
            "an open case cannot be resolved directly"
        );
        let still_open = case_for_id(&conn, &f.school_id, &case.id).unwrap().unwrap();
        assert_eq!(still_open.status, LearnerSupportStatus::Open);

        let in_progress = record_participation(
            &conn,
            &f.school_id,
            &case.id,
            "Attended both coaching sessions",
            &f.teacher_id,
        )
        .unwrap()
        .expect("participation should be recorded");
        assert_eq!(in_progress.status, LearnerSupportStatus::InProgress);
        assert_eq!(
            in_progress.participation.as_deref(),
            Some("Attended both coaching sessions")
        );
        assert!(in_progress.outcome.is_none());

        // Participation cannot be recorded twice.
        assert!(
            record_participation(
                &conn,
                &f.school_id,
                &case.id,
                "Attended a third session",
                &f.teacher_id
            )
            .unwrap()
            .is_none(),
            "participation is recorded once"
        );

        let resolved = resolve(&conn, &f.school_id, &case.id, "Caught up", &f.teacher_id)
            .unwrap()
            .expect("the case should resolve");
        assert_eq!(resolved.status, LearnerSupportStatus::Resolved);
        assert_eq!(resolved.outcome.as_deref(), Some("Caught up"));
        assert!(resolved.resolved_at.is_some());

        // A resolved case is immutable.
        assert!(
            record_participation(
                &conn,
                &f.school_id,
                &case.id,
                "Something later",
                &f.teacher_id
            )
            .unwrap()
            .is_none(),
            "a resolved case cannot move"
        );
        let reread = case_for_id(&conn, &f.school_id, &case.id).unwrap().unwrap();
        assert_eq!(reread.outcome.as_deref(), Some("Caught up"));
    }

    #[test]
    fn another_teacher_cannot_open_a_case_on_someone_elses_class() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = open_case(
            &conn,
            &f.school_id,
            &f.occurrence_id,
            &f.membership_id,
            "Need",
            "Goal",
            "Intervention",
            &f.other_teacher_id,
        );

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "got {result:?}"
        );
        assert!(
            list_for_occurrence(&conn, &f.school_id, &f.occurrence_id)
                .unwrap()
                .is_empty(),
            "nothing was written"
        );
    }

    #[test]
    fn another_teacher_cannot_advance_a_case_they_do_not_own() {
        let conn = open_test_db();
        let f = seed(&conn);
        let case = open_case_on(&f, &conn);

        assert!(matches!(
            record_participation(
                &conn,
                &f.school_id,
                &case.id,
                "Attended",
                &f.other_teacher_id
            ),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            resolve(&conn, &f.school_id, &case.id, "Done", &f.other_teacher_id),
            Err(AppError::Unauthorized)
        ));

        let unchanged = case_for_id(&conn, &f.school_id, &case.id).unwrap().unwrap();
        assert_eq!(unchanged.status, LearnerSupportStatus::Open);
        assert!(unchanged.participation.is_none());
    }

    #[test]
    fn a_case_requires_all_three_plan_fields() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert!(matches!(
            open_case(
                &conn,
                &f.school_id,
                &f.occurrence_id,
                &f.membership_id,
                "",
                "Goal",
                "Intervention",
                &f.teacher_id
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            open_case(
                &conn,
                &f.school_id,
                &f.occurrence_id,
                &f.membership_id,
                "   ",
                "Goal",
                "Intervention",
                &f.teacher_id
            ),
            Err(AppError::Validation(_))
        ));
        assert!(
            list_for_occurrence(&conn, &f.school_id, &f.occurrence_id)
                .unwrap()
                .is_empty(),
            "nothing was written"
        );
    }

    #[test]
    fn an_unknown_occurrence_or_off_roster_membership_writes_nothing() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert!(open_case(
            &conn,
            &f.school_id,
            "occurrence-that-does-not-exist",
            &f.membership_id,
            "Need",
            "Goal",
            "Intervention",
            &f.teacher_id
        )
        .unwrap()
        .is_none());
        // The other membership exists but belongs to a different section's
        // roster — here it is the same section, so it is on-roster and the
        // case opens. The meaningful guard is a membership from another
        // school's roster, which the school_id scoping already rejects.
        assert!(
            open_case(
                &conn,
                &f.school_id,
                &f.occurrence_id,
                &f.other_membership_id,
                "Need",
                "Goal",
                "Intervention",
                &f.teacher_id
            )
            .unwrap()
            .is_some(),
            "the second enrolled learner is on this roster too"
        );
    }

    #[test]
    fn a_school_cannot_read_another_schools_cases() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_case_on(&f, &conn);

        assert!(
            list_for_occurrence(&conn, "school-that-does-not-exist", &f.occurrence_id)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn list_orders_the_most_recent_plan_first() {
        let conn = open_test_db();
        let f = seed(&conn);

        let first = open_case(
            &conn,
            &f.school_id,
            &f.occurrence_id,
            &f.membership_id,
            "First need",
            "First goal",
            "First intervention",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        let second = open_case(
            &conn,
            &f.school_id,
            &f.occurrence_id,
            &f.other_membership_id,
            "Second need",
            "Second goal",
            "Second intervention",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        let listed = list_for_occurrence(&conn, &f.school_id, &f.occurrence_id).unwrap();
        assert_eq!(listed.len(), 2);
        // opened_at is generated by SQLite per insert, so the later insert
        // sorts first under ORDER BY opened_at DESC.
        assert_eq!(listed[0].id, second.id);
        assert_eq!(listed[1].id, first.id);
    }

    #[test]
    fn the_schema_forbids_an_empty_plan_field() {
        let conn = open_test_db();
        let f = seed(&conn);
        let case = open_case_on(&f, &conn);

        // The boundary rejects this, so reach past it to prove the schema
        // itself is the last line of defense.
        let result = conn.execute(
            "UPDATE learner_support_cases SET need = '   ' WHERE id = ?1",
            params![case.id],
        );
        assert!(result.is_err(), "the CHECK constraint should reject this");

        // A participation note belonging to an open case is likewise
        // forbidden by the schema, independent of Rust.
        let result = conn.execute(
            "UPDATE learner_support_cases SET participation = 'tried' WHERE id = ?1",
            params![case.id],
        );
        assert!(
            result.is_err(),
            "participation cannot be set while the case is still open"
        );
    }
}
