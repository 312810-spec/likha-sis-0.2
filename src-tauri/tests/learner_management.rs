//! Integration proofs for the M7 learner detail/edit vertical slice.
//! `tests/local_database.rs` covers list/create isolation from M1; this
//! file is specific to `get_learner`/`update_learner` — the same
//! session-derived-scope pattern applied to a learner-by-id lookup and a
//! mutation, standing in for the Tauri command layer directly.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{learner, school, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

/// Standing in for `commands::learner::get_learner`.
fn get_learner_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
) -> app_lib::error::AppResult<Option<learner::Learner>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    learner::find_by_id_in_school(conn, &school_id, learner_id)
}

/// Standing in for `commands::learner::update_learner`.
fn update_learner_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
    given_name: &str,
    family_name: &str,
) -> app_lib::error::AppResult<Option<learner::Learner>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    learner::update(conn, &school_id, learner_id, given_name, family_name, None, None)
}

fn login_as_a_teacher_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> SessionManager {
    let teacher = user::create_user(conn, username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

#[test]
fn a_teacher_can_view_and_update_their_own_schools_learner() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let created = learner::create(&conn, &school_a.id, "Juan", "Dela Cruz", None, None).unwrap();

    let fetched = get_learner_as_current_session(&conn, &sessions, &created.id)
        .unwrap()
        .unwrap();
    assert_eq!(fetched.given_name, "Juan");

    let updated =
        update_learner_as_current_session(&conn, &sessions, &created.id, "Juana", "Dela Cruz")
            .unwrap()
            .unwrap();
    assert_eq!(updated.given_name, "Juana");
}

#[test]
fn a_teacher_cannot_view_another_schools_learner_by_id() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let other_schools_learner = learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    let result =
        get_learner_as_current_session(&conn, &sessions, &other_schools_learner.id).unwrap();

    assert_eq!(
        result, None,
        "must not reveal another school's learner exists"
    );
}

#[test]
fn a_teacher_cannot_update_another_schools_learner_by_id() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let other_schools_learner = learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    let result = update_learner_as_current_session(
        &conn,
        &sessions,
        &other_schools_learner.id,
        "Tampered",
        "Name",
    )
    .unwrap();

    assert_eq!(result, None);
    let unchanged = learner::find_by_id_in_school(&conn, &school_b.id, &other_schools_learner.id)
        .unwrap()
        .unwrap();
    assert_eq!(
        unchanged.given_name, "Ana",
        "the other school's record must be untouched"
    );
}

#[test]
fn getting_a_learner_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let learner_row = learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = get_learner_as_current_session(&conn, &sessions, &learner_row.id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn updating_a_learner_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let learner_row = learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = update_learner_as_current_session(&conn, &sessions, &learner_row.id, "X", "Y");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn getting_an_unknown_learner_id_returns_none_not_an_error() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    let result = get_learner_as_current_session(&conn, &sessions, "does-not-exist").unwrap();

    assert_eq!(result, None);
}

#[test]
fn the_learner_list_remains_correct_with_a_large_synthetic_roster() {
    // A DepEd class/school roster can realistically run into the hundreds;
    // proves listing (and, transitively, the school-scope index) holds up
    // well past toy-fixture scale, and that duplicate/similar names don't
    // confuse anything (no natural key collision on names).
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    for i in 0..500 {
        learner::create(&conn, &school_a.id, "Maria", &format!("Santos {i}"), None, None).unwrap();
    }
    for i in 0..50 {
        learner::create(&conn, &school_b.id, "Other", &format!("School {i}"), None, None).unwrap();
    }

    let start = std::time::Instant::now();
    let roster = list_learners_as_current_session(&conn, &sessions).unwrap();
    let elapsed = start.elapsed();

    assert_eq!(
        roster.len(),
        500,
        "must see exactly this school's 500, none of school B's 50"
    );
    assert!(
        elapsed.as_millis() < 500,
        "listing 500 rows took {elapsed:?}, expected well under 500ms locally"
    );
    // Sorted by family_name then given_name (repository::learner::list_by_school) —
    // spot check ordering held with many near-duplicate "Santos N" names.
    assert!(roster.windows(2).all(|w| {
        (&w[0].family_name, &w[0].given_name) <= (&w[1].family_name, &w[1].given_name)
    }));
}

/// Standing in for `commands::learner::list_learners_by_school`, mirrored
/// from `tests/auth.rs` since this file exercises it too (for the scale
/// test above).
fn list_learners_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Vec<learner::Learner>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    learner::list_by_school(conn, &school_id)
}
