//! Persistence for `formative_assessment_logs` -- Formative Assessment
//! (ESRU) logging (migration 55, ADR-0082). All SQL for this feature
//! lives here, per `.claude/rules/architecture.md` --
//! `commands::formative_assessment` calls only these functions, never raw
//! SQL. Every query is tenant-scoped by `school_id` (never a
//! client-supplied trust boundary on its own -- callers derive it from the
//! authenticated session, see `commands::formative_assessment`).
//!
//! **Storage decision (do not "fix" this without re-reading
//! `docs/product/OWNER-DECISIONS-NEEDED.md` item 3 first)**: `esru_rating`
//! is stored and queried as the bare literal letter (`E`/`S`/`R`/`U`)
//! only -- CHECK-constrained at the schema level (migration 55) to exactly
//! those four values. The full gloss word (Exploration/Structured
//! practice/Reflection/Understanding) is never persisted anywhere in this
//! module; it exists only as a UI-display label
//! (`src/domain/formative-assessment.ts`), and is explicitly marked
//! unverified against any DepEd primary source everywhere it is shown.
//! This way, if the gloss is later found to be wrong, only that label
//! string changes -- no migration, no data rewrite, no stored-value
//! change.
//!
//! **Authorization-shape decision**: this module reuses
//! `subject_attendance::authorize_own_assignment` unchanged rather than
//! introducing a `Capability::ManageFormativeAssessmentLogs`-style
//! school-wide role gate. ESRU logging is routine, per-learner,
//! per-activity formative-assessment note-taking by the teacher who
//! actually teaches that subject-section -- the same shape
//! `assessment_items`/`subject_attendance` already established ("Teacher
//! records for their own assigned learners/sections"), not the tighter
//! adviser-or-School-Head shape `child_protection` uses for incident/
//! health data. There is no concrete reason to believe an ESRU log is
//! more sensitive than an ordinary quiz score or attendance mark -- it is
//! neither incident data nor health data, and gating it behind a
//! school-wide capability would block the exact person who should be able
//! to log it (the assignment's own teacher) without a registrar's
//! involvement, for no compensating security benefit. See ADR-0082
//! Decision 1 for the full write-up.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{grading, learner, teaching_assignment};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormativeAssessmentLog {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub learner_id: String,
    pub grading_period_id: String,
    pub activity_name: String,
    /// Always exactly one of `"E"`, `"S"`, `"R"`, or `"U"` -- see this
    /// module's own doc comment. Never the full gloss word.
    pub esru_rating: String,
    pub notes: Option<String>,
    pub created_by_user_id: Option<String>,
    pub updated_by_user_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const SELECT_COLUMNS: &str = "id, school_id, teaching_assignment_id, learner_id, \
     grading_period_id, activity_name, esru_rating, notes, \
     created_by_user_id, updated_by_user_id, created_at, updated_at";

fn row_to_log(row: &rusqlite::Row) -> rusqlite::Result<FormativeAssessmentLog> {
    Ok(FormativeAssessmentLog {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        learner_id: row.get(3)?,
        grading_period_id: row.get(4)?,
        activity_name: row.get(5)?,
        esru_rating: row.get(6)?,
        notes: row.get(7)?,
        created_by_user_id: row.get(8)?,
        updated_by_user_id: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn is_valid_esru_rating(value: &str) -> bool {
    matches!(value, "E" | "S" | "R" | "U")
}

/// Returns `Err(AppError::Unauthorized)` unless `user_id` is exactly the
/// teacher on `teaching_assignment_id` within their own school. Deliberately
/// re-exported here (rather than requiring every caller to import
/// `subject_attendance` directly) so `commands::formative_assessment` has
/// one obvious authorization entry point for this feature, but the
/// underlying rule -- and its "own assignment only" semantics -- is
/// intentionally the exact same function `subject_attendance` already
/// uses, not a re-derived copy. See this module's own doc comment for why
/// this shape (not a school-wide `Capability`) is the right analogy here.
pub fn authorize_own_assignment(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    crate::repository::subject_attendance::authorize_own_assignment(
        conn,
        user_id,
        school_id,
        teaching_assignment_id,
    )
}

/// Records one ESRU observation. `teaching_assignment_id` must resolve
/// within `school_id`, `learner_id` must resolve within `school_id`, and
/// `grading_period_id` must resolve within `school_id` -- each an
/// `AppError::InvalidInput` on failure, indistinguishable from an unknown
/// id, matching this codebase's cross-school-probe-resistance convention.
/// `esru_rating` must be exactly one of the four bare letters (never the
/// gloss word -- see this module's own doc comment).
#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    learner_id: &str,
    grading_period_id: &str,
    activity_name: &str,
    esru_rating: &str,
    notes: Option<&str>,
    actor_user_id: &str,
) -> AppResult<FormativeAssessmentLog> {
    if teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?.is_none()
    {
        return Err(AppError::InvalidInput(
            "teaching assignment not found in this school".to_string(),
        ));
    }
    if learner::find_by_id_in_school(conn, school_id, learner_id)?.is_none() {
        return Err(AppError::InvalidInput(
            "learner not found in this school".to_string(),
        ));
    }
    if grading::find_by_id_in_school(conn, school_id, grading_period_id)?.is_none() {
        return Err(AppError::InvalidInput(
            "grading period not found in this school".to_string(),
        ));
    }
    let activity_name = activity_name.trim();
    if activity_name.is_empty() {
        return Err(AppError::InvalidInput(
            "activity name is required".to_string(),
        ));
    }
    if activity_name.chars().count() > 200 {
        return Err(AppError::InvalidInput(
            "activity name is too long".to_string(),
        ));
    }
    if !is_valid_esru_rating(esru_rating) {
        return Err(AppError::InvalidInput(
            "esru rating must be exactly one of 'E', 'S', 'R', or 'U'".to_string(),
        ));
    }
    let notes = notes.map(str::trim).filter(|n| !n.is_empty());
    if let Some(notes) = notes {
        if notes.chars().count() > 1000 {
            return Err(AppError::InvalidInput("notes are too long".to_string()));
        }
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO formative_assessment_logs \
            (id, school_id, teaching_assignment_id, learner_id, grading_period_id, \
             activity_name, esru_rating, notes, created_by_user_id, updated_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        (
            &id,
            school_id,
            teaching_assignment_id,
            learner_id,
            grading_period_id,
            activity_name,
            esru_rating,
            notes,
            actor_user_id,
        ),
    )?;

    find_by_id_in_school(conn, school_id, &id)?.ok_or_else(|| {
        AppError::InvalidInput(
            "formative assessment log vanished immediately after insert".to_string(),
        )
    })
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<FormativeAssessmentLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM formative_assessment_logs WHERE school_id = ?1 AND id = ?2"
    );
    conn.query_row(&sql, (school_id, id), row_to_log)
        .optional()
        .map_err(AppError::from)
}

/// A learner's full ESRU log history across every subject/assignment,
/// most recent first -- tenant-scoped by `school_id` in the query itself,
/// so a caller supplying the wrong `school_id` can never see another
/// school's logs for a same-id learner.
pub fn list_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<FormativeAssessmentLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM formative_assessment_logs \
         WHERE school_id = ?1 AND learner_id = ?2 \
         ORDER BY created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map((school_id, learner_id), row_to_log)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Every ESRU log recorded under one teaching assignment, most recent
/// first -- the data a "log ESRU for this class" screen needs, scoped by
/// `school_id` AND `teaching_assignment_id` together so a forged/
/// cross-school id can never leak another school's logs.
pub fn list_for_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<FormativeAssessmentLog>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM formative_assessment_logs \
         WHERE school_id = ?1 AND teaching_assignment_id = ?2 \
         ORDER BY created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map((school_id, teaching_assignment_id), row_to_log)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Sync-pull counterpart to `create` -- materializes a
/// `FormativeAssessmentLog` this device received, instead of re-deriving
/// one from raw caller input. Mirrors `transfer_record::upsert_from_sync`'s
/// exact shape: an `INSERT ... ON CONFLICT(id) DO UPDATE` keyed on the
/// row's own stable `id`. This table carries no natural-key `UNIQUE`
/// constraint beyond `id` (see migration 55's doc comment -- a learner may
/// have any number of ESRU logs across any number of activities in the
/// same subject/quarter), so a collision here can only ever be an `id`
/// collision, which `ON CONFLICT(id)` always resolves as an update, never
/// an error -- matching the `TransferRecord` precedent (ADR-0080), so no
/// dedicated natural-key-collision test is needed. Not re-validating
/// teaching-assignment/learner/grading-period/rating here is deliberate
/// and safe, matching `attendance::upsert_from_sync`'s own reasoning: this
/// data already passed `create`'s validation on the device that
/// originally wrote it.
pub fn upsert_from_sync(conn: &Connection, log: &FormativeAssessmentLog) -> AppResult<()> {
    conn.execute(
        "INSERT INTO formative_assessment_logs \
            (id, school_id, teaching_assignment_id, learner_id, grading_period_id, \
             activity_name, esru_rating, notes, created_by_user_id, updated_by_user_id, \
             created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) \
         ON CONFLICT(id) DO UPDATE SET \
             teaching_assignment_id = excluded.teaching_assignment_id, \
             learner_id = excluded.learner_id, \
             grading_period_id = excluded.grading_period_id, \
             activity_name = excluded.activity_name, \
             esru_rating = excluded.esru_rating, \
             notes = excluded.notes, \
             updated_by_user_id = excluded.updated_by_user_id, \
             updated_at = excluded.updated_at",
        (
            &log.id,
            &log.school_id,
            &log.teaching_assignment_id,
            &log.learner_id,
            &log.grading_period_id,
            &log.activity_name,
            &log.esru_rating,
            &log.notes,
            &log.created_by_user_id,
            &log.updated_by_user_id,
            &log.created_at,
            &log.updated_at,
        ),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{school, section, subject, teaching_assignment, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        learner_id: String,
        assignment_id: String,
        grading_period_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let t = user::create_user(
            conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        user::add_school_membership(conn, &t.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(conn, &s.id, &t.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        let l = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let grading_period_id: String = conn
            .query_row(
                "SELECT gp.id FROM grading_periods gp WHERE gp.school_id = ?1 LIMIT 1",
                (&s.id,),
                |row| row.get(0),
            )
            .unwrap_or_else(|_| {
                // No grading period exists yet for this fresh school --
                // seed one against an already-seeded policy period.
                let policy_period_id: String = conn
                    .query_row("SELECT id FROM grading_policy_periods LIMIT 1", [], |row| {
                        row.get(0)
                    })
                    .unwrap();
                let id = Uuid::now_v7().to_string();
                conn.execute(
                    "INSERT INTO grading_periods \
                        (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
                     VALUES (?1, ?2, '2026-2027', ?3, '2026-06-01', '2026-08-31')",
                    (&id, &s.id, &policy_period_id),
                )
                .unwrap();
                id
            });

        Fixture {
            school_id: s.id,
            teacher_id: t.id,
            learner_id: l.id,
            assignment_id: assignment.id,
            grading_period_id,
        }
    }

    #[test]
    fn create_and_find_round_trip() {
        let conn = open_test_db();
        let f = seed(&conn);

        let log = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            Some("Great participation"),
            &f.teacher_id,
        )
        .unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &log.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.esru_rating, "E");
        assert_eq!(found.activity_name, "Quiz 1");
        assert_eq!(found.notes.as_deref(), Some("Great participation"));
    }

    #[test]
    fn create_stores_only_the_bare_letter_never_the_gloss_word() {
        let conn = open_test_db();
        let f = seed(&conn);

        let log = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "S",
            None,
            &f.teacher_id,
        )
        .unwrap();

        assert_eq!(log.esru_rating, "S");
        assert_ne!(log.esru_rating, "Structured practice");
    }

    #[test]
    fn create_rejects_the_full_gloss_word_as_a_rating() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "Exploration",
            None,
            &f.teacher_id,
        );

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_an_unknown_teaching_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = create(
            &conn,
            &f.school_id,
            "does-not-exist",
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            None,
            &f.teacher_id,
        );

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_a_learner_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Another School").unwrap();
        let other_learner =
            learner::create(&conn, &other_school.id, "Bo", "Reyes", None, None).unwrap();

        let result = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &other_learner.id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            None,
            &f.teacher_id,
        );

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_an_empty_activity_name() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "   ",
            "E",
            None,
            &f.teacher_id,
        );

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn list_for_learner_is_tenant_scoped() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            None,
            &f.teacher_id,
        )
        .unwrap();

        let found = list_for_learner(&conn, &f.school_id, &f.learner_id).unwrap();
        assert_eq!(found.len(), 1);

        let other_school = school::create(&conn, "Another School").unwrap();
        let cross_tenant = list_for_learner(&conn, &other_school.id, &f.learner_id).unwrap();
        assert_eq!(cross_tenant.len(), 0);
    }

    #[test]
    fn list_for_assignment_never_leaks_a_different_schools_logs() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "R",
            None,
            &f.teacher_id,
        )
        .unwrap();
        let other_school = school::create(&conn, "Another School").unwrap();

        let logs = list_for_assignment(&conn, &other_school.id, &f.assignment_id).unwrap();
        assert!(logs.is_empty());

        let own = list_for_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();
        assert_eq!(own.len(), 1);
    }

    #[test]
    fn authorize_own_assignment_allows_the_assignments_own_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_own_assignment_denies_a_different_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let result =
            authorize_own_assignment(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    fn sample_incoming(
        id: &str,
        school_id: &str,
        assignment_id: &str,
        learner_id: &str,
        grading_period_id: &str,
    ) -> FormativeAssessmentLog {
        FormativeAssessmentLog {
            id: id.to_string(),
            school_id: school_id.to_string(),
            teaching_assignment_id: assignment_id.to_string(),
            learner_id: learner_id.to_string(),
            grading_period_id: grading_period_id.to_string(),
            activity_name: "Quiz 1".to_string(),
            esru_rating: "U".to_string(),
            notes: None,
            created_by_user_id: None,
            updated_by_user_id: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_from_sync_inserts_a_log_this_device_has_never_seen() {
        let conn = open_test_db();
        let f = seed(&conn);
        let incoming = sample_incoming(
            "f1",
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
        );

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, "f1")
            .unwrap()
            .unwrap();
        assert_eq!(found.esru_rating, "U");
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place_without_a_duplicate() {
        let conn = open_test_db();
        let f = seed(&conn);
        let original = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            None,
            &f.teacher_id,
        )
        .unwrap();

        let updated = FormativeAssessmentLog {
            esru_rating: "S".to_string(),
            updated_at: "2026-02-01T00:00:00.000Z".to_string(),
            ..original.clone()
        };
        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.esru_rating, "S");
        let all = list_for_learner(&conn, &f.school_id, &f.learner_id).unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }
}
