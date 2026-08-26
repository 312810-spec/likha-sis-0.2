//! Integration proofs for the M4 authentication/session foundation. These
//! exercise the exact same two-step pattern every protected Tauri command
//! uses (`sessions.require_active_school_scope()?` then a repository
//! call), end-to-end, independent of anything TypeScript/UI does — see
//! ADR-0004.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::audit_log::{self, AuditLogEntry};
use app_lib::repository::{learner, school, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

/// The exact check every protected command performs before touching data.
/// Standing in for `commands::learner::list_learners_by_school` /
/// `create_learner` without needing Tauri's command-invocation machinery.
fn list_learners_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Vec<learner::Learner>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    learner::list_by_school(conn, &school_id)
}

/// Standing in for `commands::user::register_user`.
fn register_user_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    username: &str,
    password: &str,
    display_name: &str,
) -> app_lib::error::AppResult<user::User> {
    auth::authorize_user_registration(conn, sessions)?;
    user::create_user(conn, username, password, display_name)
}

/// Standing in for `commands::user::add_user_to_school`.
fn add_user_to_school_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    user_id: &str,
    school_id: &str,
) -> app_lib::error::AppResult<()> {
    auth::authorize_school_membership_grant(conn, sessions, school_id)?;
    user::add_school_membership(conn, user_id, school_id)
}

#[test]
fn a_logged_in_teacher_can_only_ever_see_their_own_school_learners() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    learner::create(&conn, &school_b.id, "Ben", "Reyes", None, None).unwrap();

    let teacher_a = user::create_user(&conn, "teacher.a", "password-a", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher_a.id, &school_a.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "teacher.a", "password-a", &school_a.id).unwrap();

    let visible = list_learners_as_current_session(&conn, &sessions).unwrap();

    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0].given_name, "Ana");
    // There is no parameter through which teacher_a's session could ever
    // be asked to return school B's data — the scope is derived from the
    // session, never accepted from a caller.
}

#[test]
fn operations_are_rejected_with_no_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = list_learners_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn logout_immediately_blocks_further_protected_operations() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher.id, &school_a.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "teacher.a", "password", &school_a.id).unwrap();
    assert!(list_learners_as_current_session(&conn, &sessions).is_ok());

    auth::logout(&conn, &sessions).unwrap();

    let result = list_learners_as_current_session(&conn, &sessions);
    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_process_restart_always_requires_a_fresh_login_even_with_a_valid_unexpired_db_session() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher.id, &school_a.id).unwrap();

    let sessions_before_restart = SessionManager::new();
    auth::login(
        &conn,
        &sessions_before_restart,
        "teacher.a",
        "password",
        &school_a.id,
    )
    .unwrap();
    assert!(list_learners_as_current_session(&conn, &sessions_before_restart).is_ok());

    // Simulate a process restart: a brand new SessionManager over the SAME
    // (still-open, in this test) database. A real restart would also
    // reopen the db, but the SessionManager reset is the thing being
    // proven here — see ADR-0004's "fixed-expiry, never resumed" design.
    let sessions_after_restart = SessionManager::new();

    let result = list_learners_as_current_session(&conn, &sessions_after_restart);
    assert!(
        matches!(result, Err(AppError::Unauthorized)),
        "a fresh process must never resume a previous session, even an unexpired one"
    );
}

#[test]
fn a_user_with_no_membership_in_the_requested_school_cannot_log_in_scoped_to_it() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let teacher = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher.id, &school_a.id).unwrap();
    let sessions = SessionManager::new();

    let result = auth::login(&conn, &sessions, "teacher.a", "password", &school_b.id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
    assert_eq!(sessions.current(), None);
}

/// `register_user`/`add_user_to_school` are no longer a bootstrap path at
/// all (see ADR-0006) — `auth::bootstrap_installation`
/// (`tests/bootstrap.rs`) is the only way to create a device's first
/// account now. This proves the OLD path genuinely can't be used for
/// that anymore, even on a completely fresh, empty install: both calls
/// require an active session unconditionally.
#[test]
fn register_user_and_add_to_school_no_longer_work_unauthenticated_even_on_a_fresh_install() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in, nothing configured yet
    let s = school::create(&conn, "Rizal Elementary").unwrap();

    let registration =
        register_user_as_current_session(&conn, &sessions, "teacher.a", "password", "Teacher A");
    assert!(matches!(registration, Err(AppError::Unauthorized)));

    let grant = add_user_to_school_as_current_session(&conn, &sessions, "some-user-id", &s.id);
    assert!(matches!(grant, Err(AppError::Unauthorized)));
}

/// The exact attack the M4 review caught before this fix: an
/// unauthenticated caller must not be able to register a throwaway
/// account and self-grant it membership in a school that already has
/// real teachers/data. (`register_user`/`add_user_to_school` now reject
/// unauthenticated callers unconditionally — see the test above — so
/// this scenario is doubly covered, but kept as its own regression test
/// for the specific historical vulnerability.)
#[test]
fn an_unauthenticated_caller_cannot_self_grant_membership_in_an_already_populated_school() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let legitimate_teacher =
        user::create_user(&conn, "legit.teacher", "password", "Legit Teacher").unwrap();
    user::add_school_membership(&conn, &legitimate_teacher.id, &school_a.id).unwrap();
    learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();

    let attacker_sessions = SessionManager::new(); // no credentials at all

    let attacker_account = register_user_as_current_session(
        &conn,
        &attacker_sessions,
        "attacker",
        "attacker-password",
        "Attacker",
    );
    assert!(
        matches!(attacker_account, Err(AppError::Unauthorized)),
        "registering an account without a session must always fail"
    );

    // Even if a throwaway account already existed some other way, granting
    // it membership in the populated school must still fail unauthenticated.
    let grant = add_user_to_school_as_current_session(
        &conn,
        &attacker_sessions,
        &legitimate_teacher.id,
        &school_a.id,
    );
    assert!(matches!(grant, Err(AppError::Unauthorized)));
}

/// Standing in for `commands::auth::extend_session`.
fn extend_session_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<()> {
    sessions.require_active_school_scope(conn)?;
    Ok(())
}

#[test]
fn extending_a_session_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in

    let result = extend_session_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn extending_a_session_slides_the_idle_window_forward() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher.id, &school_a.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "teacher.a", "password", &school_a.id).unwrap();
    let before = sessions.current().unwrap().last_activity_at;

    std::thread::sleep(std::time::Duration::from_millis(5));
    extend_session_as_current_session(&conn, &sessions).unwrap();

    let after = sessions.current().unwrap().last_activity_at;
    assert!(
        after > before,
        "extend_session must slide last_activity_at forward"
    );
}

/// Standing in for `commands::auth::list_audit_log`.
fn list_audit_log_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Vec<AuditLogEntry>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    audit_log::list_for_school(conn, &school_id, 200)
}

#[test]
fn viewing_the_audit_log_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in

    let result = list_audit_log_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_teachers_audit_log_never_includes_another_schools_events() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let teacher_a = user::create_user(&conn, "teacher.a", "password-a", "Teacher A").unwrap();
    user::add_school_membership(&conn, &teacher_a.id, &school_a.id).unwrap();
    let sessions_a = SessionManager::new();
    auth::login(&conn, &sessions_a, "teacher.a", "password-a", &school_a.id).unwrap();
    // A login attempt against school B (whether it would succeed or not
    // is irrelevant here) generates its own audit event scoped to B.
    let other_sessions = SessionManager::new();
    let _ = auth::login(&conn, &other_sessions, "nobody", "wrong", &school_b.id);

    let entries = list_audit_log_as_current_session(&conn, &sessions_a).unwrap();

    assert!(
        entries.iter().all(|e| e.school_id == school_a.id),
        "must never include another school's audit events"
    );
    assert!(entries.iter().any(|e| e.username == "teacher.a"));
}
