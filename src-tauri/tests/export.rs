//! Integration proofs for the M10 SF2 export, standing in for
//! `commands::export::export_section_monthly_sf2` directly — same pattern
//! as `tests/attendance_management.rs`. Deliberately does not exercise the
//! actual file-write side effect (that needs a real `tauri::AppHandle`,
//! which these lighter-weight integration tests don't construct — see
//! `docs/adr/0009-sf2-export-and-official-form-engine.md` for that
//! disclosed gap); it exercises everything the command does *before* the
//! file write: session/school/section resolution and the export build.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::export::learner_roster::{self, LearnerRosterExport};
use app_lib::export::sf2::{self, Sf2Export};
use app_lib::repository::{
    attendance, learner, school, section, section_advisory, section_membership, user,
};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
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

/// Standing in for the non-I/O portion of `commands::export::export_section_monthly_sf2`.
fn export_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    year: i32,
    month: u32,
) -> app_lib::error::AppResult<Option<Sf2Export>> {
    let school_id = sessions.require_active_school_scope(conn)?;

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(conn, &school_id, section_id)? else {
        return Ok(None);
    };
    let report = attendance::monthly_grid_for_section(conn, &school_id, section_id, year, month)?;

    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) => 29,
        _ => 28,
    };
    let as_of_date = format!("{year}-{month:02}-{days_in_month:02}");
    let adviser =
        section_advisory::current_adviser_for_section(conn, &school_id, section_id, &as_of_date)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    Ok(Some(sf2::build_sf2_export(
        &school,
        &section,
        adviser_name.as_deref(),
        &report,
    )))
}

/// Standing in for the non-I/O portion of `commands::export::export_learner_roster`.
fn export_learner_roster_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Option<LearnerRosterExport>> {
    let school_id = sessions.require_active_school_scope(conn)?;

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let learners = learner::list_by_school(conn, &school_id)?;

    Ok(Some(learner_roster::build_learner_roster_export(
        &school, &learners,
    )))
}

fn setup_enrolled_learner_with_session(
    conn: &rusqlite::Connection,
    username: &str,
) -> (String, String, SessionManager) {
    let s = school::create(conn, "School A").unwrap();
    let sec = section::create(conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = login_as_a_teacher_at(conn, &s.id, username);
    let l = learner::create(conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
    section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-08-01").unwrap();
    (s.id, sec.id, sessions)
}

#[test]
fn a_teacher_can_export_their_own_sections_monthly_sf2() {
    let conn = open_test_db();
    let (_school_id, section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Section,Mabini"));
    assert!(export.csv.contains("Juan"));
}

#[test]
fn sf2_export_renders_assigned_adviser_name() {
    let conn = open_test_db();
    let (school_id, section_id, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");
    let adviser = user::create_user(&conn, "adviser.a", "password", "Maria Clara").unwrap();
    user::add_school_membership(&conn, &adviser.id, &school_id).unwrap();
    section_advisory::assign(&conn, &school_id, &section_id, &adviser.id, "2026-06-01").unwrap();

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Class Adviser,Maria Clara"));
}

#[test]
fn sf2_export_renders_blank_for_unassigned_adviser() {
    let conn = open_test_db();
    let (_school_id, section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Class Adviser,"));
}

#[test]
fn exporting_a_foreign_schools_section_returns_none_not_an_error() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();

    let result = export_as_current_session(&conn, &sessions, &section_b.id, 2026, 8).unwrap();

    assert!(
        result.is_none(),
        "a foreign section_id must not resolve to any data"
    );
}

#[test]
fn exporting_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = export_as_current_session(&conn, &sessions, &section_a.id, 2026, 8);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_export_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();
    let learner_b = learner::create(&conn, &school_b.id, "Maria", "Santos", None, None).unwrap();
    section_membership::enroll(
        &conn,
        &school_b.id,
        &section_b.id,
        &learner_b.id,
        "2026-08-01",
    )
    .unwrap();
    let (_school_a, section_a, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_a, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(!export.csv.contains("Maria"));
    assert!(!export.csv.contains("Santos"));
}

#[test]
fn a_teacher_can_export_their_own_schools_learner_roster() {
    let conn = open_test_db();
    let (_school_id, _section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_learner_roster_as_current_session(&conn, &sessions)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Juan"));
    assert!(export.csv.contains("Dela Cruz"));
}

#[test]
fn exporting_the_learner_roster_requires_a_session() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in

    let result = export_learner_roster_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_learner_roster_export_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    learner::create(&conn, &school_b.id, "Maria", "Santos", None, None).unwrap();
    let (_school_a, _section_a, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_learner_roster_as_current_session(&conn, &sessions)
        .unwrap()
        .unwrap();

    assert!(!export.csv.contains("Maria"));
    assert!(!export.csv.contains("Santos"));
}
