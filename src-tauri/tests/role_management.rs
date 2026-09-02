//! Command-boundary proofs for the Roles & Permissions milestone's
//! `grant_school_role`/`revoke_school_role`. Standing in for the real
//! `#[tauri::command]` functions, the same pattern
//! `tests/teaching_assignment_management.rs` already uses. This closes
//! the gap `commands::user::add_user_to_school`'s own doc comment
//! previously disclosed: this codebase had a role model
//! (`repository::role`, `auth::Capability`) with no command able to
//! grant Registrar/School Head to anyone past first-run bootstrap.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{role, school, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn login_as_a_teacher_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> (String, SessionManager) {
    let teacher = user::create_user(conn, username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    role::grant(conn, &teacher.id, school_id, role::TEACHER).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    (teacher.id, sessions)
}

fn login_as_a_school_head_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> (String, SessionManager) {
    let head = user::create_user(conn, username, "password", "A School Head").unwrap();
    user::add_school_membership(conn, &head.id, school_id).unwrap();
    role::grant(conn, &head.id, school_id, role::SCHOOL_HEAD).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    (head.id, sessions)
}

/// Standing in for `commands::user::grant_school_role`.
fn grant_role_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    target_user_id: &str,
    role_name: &str,
) -> app_lib::error::AppResult<()> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageRoles)?;
    if !role::is_grantable(role_name) {
        return Err(AppError::Unauthorized);
    }
    if !user::is_member_of_school(conn, target_user_id, &school_id)? {
        return Err(AppError::Unauthorized);
    }
    role::grant(conn, target_user_id, &school_id, role_name)
}

/// Standing in for `commands::user::revoke_school_role`.
fn revoke_role_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    target_user_id: &str,
    role_name: &str,
) -> app_lib::error::AppResult<()> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageRoles)?;
    if !role::is_grantable(role_name) {
        return Err(AppError::Unauthorized);
    }
    role::revoke(conn, target_user_id, &school_id, role_name)
}

#[test]
fn a_school_head_can_grant_registrar_to_a_colleague() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _teacher_sessions) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");

    grant_role_as_current_session(&conn, &sessions, &teacher_id, role::REGISTRAR).unwrap();

    assert!(role::has_any_role(&conn, &teacher_id, &s.id, &[role::REGISTRAR]).unwrap());
}

#[test]
fn a_school_head_can_grant_school_head_to_a_colleague() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _teacher_sessions) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");

    grant_role_as_current_session(&conn, &sessions, &teacher_id, role::SCHOOL_HEAD).unwrap();

    assert!(role::has_any_role(&conn, &teacher_id, &s.id, &[role::SCHOOL_HEAD]).unwrap());
}

#[test]
fn a_school_head_can_grant_every_role_in_the_extended_taxonomy() {
    // Roles & Permissions 8-role expansion (ADR-0065): foundation only,
    // but grant/revoke must work for all seven new roles, not just
    // Registrar/School Head.
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");

    for extended_role in [
        role::MASTER_TEACHER,
        role::CLASS_ADVISER,
        role::SUBJECT_TEACHER,
        role::ICT_COORDINATOR,
        role::ADMIN_OFFICER,
        role::PROPERTY_CUSTODIAN,
        role::HEALTH_OFFICER,
    ] {
        grant_role_as_current_session(&conn, &sessions, &teacher_id, extended_role).unwrap();
        assert!(
            role::has_any_role(&conn, &teacher_id, &s.id, &[extended_role]).unwrap(),
            "{extended_role} should be grantable through the command boundary"
        );
        revoke_role_as_current_session(&conn, &sessions, &teacher_id, extended_role).unwrap();
        assert!(
            !role::has_any_role(&conn, &teacher_id, &s.id, &[extended_role]).unwrap(),
            "{extended_role} should be revocable through the command boundary"
        );
    }
}

#[test]
fn a_teacher_cannot_grant_any_role() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_teacher_id, sessions) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");
    let (other_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.b");

    let result = grant_role_as_current_session(&conn, &sessions, &other_id, role::REGISTRAR);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn granting_the_teacher_role_through_this_command_is_rejected() {
    // Teacher is already the automatic default `add_user_to_school`
    // grants at membership time -- this command exists to close the gap
    // for Registrar/School Head only, not to duplicate that path.
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");

    let result = grant_role_as_current_session(&conn, &sessions, &teacher_id, role::TEACHER);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn granting_an_unrecognized_role_name_is_rejected() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");

    let result = grant_role_as_current_session(&conn, &sessions, &teacher_id, "principal");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_head_cannot_grant_a_role_to_a_user_outside_their_own_school() {
    let conn = open_test_db();
    let s1 = school::create(&conn, "School A").unwrap();
    let s2 = school::create(&conn, "School B").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s1.id, "head.a");
    let (outsider_id, _) = login_as_a_teacher_at(&conn, &s2.id, "teacher.b");

    let result = grant_role_as_current_session(&conn, &sessions, &outsider_id, role::REGISTRAR);

    assert!(matches!(result, Err(AppError::Unauthorized)));
    assert!(!role::has_any_role(&conn, &outsider_id, &s2.id, &[role::REGISTRAR]).unwrap());
}

#[test]
fn a_school_head_can_revoke_registrar_from_a_colleague() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");
    let (teacher_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");
    role::grant(&conn, &teacher_id, &s.id, role::REGISTRAR).unwrap();

    revoke_role_as_current_session(&conn, &sessions, &teacher_id, role::REGISTRAR).unwrap();

    assert!(!role::has_any_role(&conn, &teacher_id, &s.id, &[role::REGISTRAR]).unwrap());
}

#[test]
fn revoking_the_last_school_head_through_this_command_is_refused() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (head_id, sessions) = login_as_a_school_head_at(&conn, &s.id, "head.a");

    let result = revoke_role_as_current_session(&conn, &sessions, &head_id, role::SCHOOL_HEAD);

    assert!(matches!(result, Err(AppError::CannotRemoveLastSchoolHead)));
    assert!(role::has_any_role(&conn, &head_id, &s.id, &[role::SCHOOL_HEAD]).unwrap());
}

#[test]
fn a_teacher_cannot_revoke_any_role() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (_teacher_id, sessions) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");
    let (other_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.b");
    role::grant(&conn, &other_id, &s.id, role::REGISTRAR).unwrap();

    let result = revoke_role_as_current_session(&conn, &sessions, &other_id, role::REGISTRAR);

    assert!(matches!(result, Err(AppError::Unauthorized)));
    assert!(role::has_any_role(&conn, &other_id, &s.id, &[role::REGISTRAR]).unwrap());
}

#[test]
fn granting_and_revoking_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let s = school::create(&conn, "Rizal Elementary").unwrap();
    let (teacher_id, _) = login_as_a_teacher_at(&conn, &s.id, "teacher.a");
    let sessions = SessionManager::new(); // nobody logged in

    let grant_result =
        grant_role_as_current_session(&conn, &sessions, &teacher_id, role::REGISTRAR);
    let revoke_result =
        revoke_role_as_current_session(&conn, &sessions, &teacher_id, role::REGISTRAR);

    assert!(matches!(grant_result, Err(AppError::Unauthorized)));
    assert!(matches!(revoke_result, Err(AppError::Unauthorized)));
}
