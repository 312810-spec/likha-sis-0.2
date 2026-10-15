//! Actual capability-boundary tests plus command-source wiring checks.
//! File writes and installed Tauri interaction are not exercised here.
use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{role, school, section, section_advisory, user};
use rusqlite::Connection;

fn fixture() -> (Connection, SessionManager, String, String) {
    let conn = app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap();
    let school = school::create(&conn, "Synthetic reporting school").unwrap();
    let actor = user::create_user(&conn, "report.actor", "password", "Synthetic actor").unwrap();
    user::add_school_membership(&conn, &actor.id, &school.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "report.actor", "password", &school.id).unwrap();
    (conn, sessions, school.id, actor.id)
}

fn denied(conn: &Connection, sessions: &SessionManager) {
    assert!(matches!(
        auth::authorize_capability(conn, sessions, Capability::ExportSchoolReports),
        Err(AppError::Unauthorized)
    ));
}

#[test]
fn school_report_export_requires_an_active_session() {
    let (conn, sessions, _, _) = fixture();
    sessions.clear();
    denied(&conn, &sessions);
}

#[test]
fn school_report_export_denies_plain_members_teachers_and_advisers() {
    let (conn, sessions, school_id, actor_id) = fixture();
    denied(&conn, &sessions);
    role::grant(&conn, &actor_id, &school_id, role::TEACHER).unwrap();
    denied(&conn, &sessions);
    let section = section::create(&conn, &school_id, "2026-2027", "10", "Synthetic").unwrap();
    section_advisory::assign(&conn, &school_id, &section.id, &actor_id, "2026-06-01")
        .unwrap();
    denied(&conn, &sessions);
}

#[test]
fn school_report_roles_are_scoped_and_rechecked_after_revocation() {
    let (conn, sessions, school_id, actor_id) = fixture();
    let foreign = school::create(&conn, "Synthetic foreign school").unwrap();
    user::add_school_membership(&conn, &actor_id, &foreign.id).unwrap();
    role::grant(&conn, &actor_id, &foreign.id, role::SCHOOL_HEAD).unwrap();
    denied(&conn, &sessions);

    for allowed in [role::REGISTRAR, role::SCHOOL_HEAD] {
        role::grant(&conn, &actor_id, &school_id, allowed).unwrap();
        assert_eq!(
            auth::authorize_capability(&conn, &sessions, Capability::ExportSchoolReports).unwrap(),
            school_id
        );
        conn.execute(
            "DELETE FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 AND role = ?3",
            (&actor_id, &school_id, allowed),
        )
        .unwrap();
        denied(&conn, &sessions);
    }
}

#[test]
fn actual_school_report_commands_authorize_before_reading_report_inputs() {
    let source = include_str!("../src/commands/export.rs");
    for name in ["export_school_eosy_sf6", "export_school_monthly_attendance_sf4"] {
        let marker = format!("pub fn {name}(");
        let body = source
            .split_once(&marker)
            .expect("real export command exists")
            .1
            .split("#[tauri::command]")
            .next()
            .unwrap();
        let gate = body.find("Capability::ExportSchoolReports").unwrap();
        let first_read = body.find("school::find_by_id").unwrap();
        assert!(body.contains("auth::authorize_capability"));
        assert!(gate < first_read, "{name} must authorize before data reads");
        assert!(!body.contains("require_active_school_scope"));
    }
}
