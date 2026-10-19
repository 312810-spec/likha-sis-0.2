use app_lib::auth::legacy_setup_recovery::{
    legacy_setup_recovery_available as available, restore_legacy_setup_access as restore,
};
use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{audit_log, installation, role, school, session, user};
use rusqlite::Connection;
use std::path::Path;

const PASSWORD: &str = "synthetic-owner-password";

fn populate(conn: &Connection) -> (SessionManager, String, String) {
    let school = school::create(conn, "Synthetic legacy school").unwrap();
    let account = user::create_user(conn, "synthetic.owner", PASSWORD, "Synthetic owner").unwrap();
    user::add_school_membership(conn, &account.id, &school.id).unwrap();
    installation::claim_bootstrap_slot(conn).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, &account.username, PASSWORD, &school.id).unwrap();
    (sessions, account.id, school.id)
}

fn fixture() -> (Connection, SessionManager, String, String) {
    let conn = app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap();
    let (sessions, account, school) = populate(&conn);
    (conn, sessions, account, school)
}

fn role_count(conn: &Connection) -> i64 {
    conn.query_row("SELECT count(*) FROM user_school_roles", [], |r| r.get(0))
        .unwrap()
}

#[test]
fn sole_authenticated_owner_explicitly_restores_setup_with_password_and_real_audits() {
    let (conn, sessions, account, school) = fixture();
    let before: (String, String) = conn
        .query_row(
            "SELECT password_hash, created_at FROM users WHERE id=?1",
            [&account],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert!(available(&conn, &sessions).unwrap());
    assert!(matches!(
        auth::authorize_capability(&conn, &sessions, auth::Capability::ManageLearners),
        Err(AppError::Unauthorized)
    ));
    restore(&conn, &sessions, PASSWORD).unwrap();
    assert_eq!(
        role::list_roles(&conn, &account, &school).unwrap(),
        vec!["registrar", "school_head", "teacher"]
    );
    assert!(auth::authorize_capability(&conn, &sessions, auth::Capability::ManageLearners).is_ok());
    let after: (String, String) = conn
        .query_row(
            "SELECT password_hash, created_at FROM users WHERE id=?1",
            [&account],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!(before, after);
    let grants: Vec<_> = audit_log::list_for_school(&conn, &school, 100)
        .unwrap()
        .into_iter()
        .filter(|x| x.event_type == audit_log::AuditEventType::SchoolMemberRoleGranted)
        .collect();
    assert_eq!(grants.len(), 3);
    assert!(grants.iter().all(
        |x| x.user_id.as_ref() == Some(&account) && x.actor_user_id.as_ref() == Some(&account)
    ));
    assert!(!available(&conn, &sessions).unwrap());
    assert!(matches!(
        restore(&conn, &sessions, PASSWORD),
        Err(AppError::Unauthorized)
    ));
    assert_eq!(role_count(&conn), 3);
}

#[test]
fn wrong_password_counts_toward_lockout_and_never_grants_roles() {
    let (conn, sessions, _, _) = fixture();
    for _ in 0..4 {
        assert!(matches!(
            restore(&conn, &sessions, "wrong"),
            Err(AppError::AuthenticationFailed)
        ));
    }
    assert!(matches!(
        restore(&conn, &sessions, "wrong"),
        Err(AppError::AccountLocked)
    ));
    assert!(matches!(
        restore(&conn, &sessions, PASSWORD),
        Err(AppError::AccountLocked)
    ));
    assert_eq!(role_count(&conn), 0);
}

#[test]
fn no_session_or_revoked_session_cannot_recover() {
    let (conn, sessions, _, _) = fixture();
    assert!(matches!(
        available(&conn, &SessionManager::new()),
        Err(AppError::Unauthorized)
    ));
    assert!(matches!(
        restore(&conn, &SessionManager::new(), PASSWORD),
        Err(AppError::Unauthorized)
    ));
    session::revoke(&conn, &sessions.current().unwrap().id).unwrap();
    assert!(matches!(
        restore(&conn, &sessions, PASSWORD),
        Err(AppError::Unauthorized)
    ));
    assert_eq!(role_count(&conn), 0);
}

#[test]
fn ambiguous_existing_managed_or_unclaimed_installations_fail_closed() {
    for change in [
        "INSERT INTO users(id,username,password_hash,display_name) VALUES('other','synthetic.other','unused','Other')",
        "INSERT INTO schools(id,name) VALUES('other-school','Other school')",
        "DELETE FROM user_school_memberships",
        "DELETE FROM installation_state",
        "INSERT INTO user_school_roles(user_id,school_id,role) SELECT user_id,school_id,'teacher' FROM user_school_memberships",
        "INSERT INTO audit_log(id,school_id,user_id,username,event_type) SELECT 'prior',school_id,user_id,'synthetic.owner','school_member_role_revoked' FROM user_school_memberships",
    ] {
        let (conn, sessions, _, _) = fixture();
        conn.execute_batch(change).unwrap();
        let before = role_count(&conn);
        assert!(!available(&conn, &sessions).unwrap());
        assert!(matches!(restore(&conn, &sessions, PASSWORD), Err(AppError::Unauthorized)), "{change}");
        assert_eq!(role_count(&conn), before);
    }
}

#[test]
fn stale_positive_status_cannot_authorize_later_changed_state() {
    let (conn, sessions, _, _) = fixture();
    assert!(available(&conn, &sessions).unwrap());
    user::create_user(&conn, "synthetic.second", PASSWORD, "Second").unwrap();
    assert!(matches!(
        restore(&conn, &sessions, PASSWORD),
        Err(AppError::Unauthorized)
    ));
    assert_eq!(role_count(&conn), 0);
}

#[test]
fn audit_failure_rolls_back_every_role_and_every_recovery_audit() {
    let (conn, sessions, _, school) = fixture();
    conn.execute_batch(
        "CREATE TRIGGER reject_second_recovery_audit BEFORE INSERT ON audit_log
        WHEN NEW.event_type='school_member_role_granted' AND
          (SELECT count(*) FROM audit_log WHERE event_type='school_member_role_granted') >= 1
        BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;",
    )
    .unwrap();
    assert!(restore(&conn, &sessions, PASSWORD).is_err());
    assert_eq!(role_count(&conn), 0);
    assert!(audit_log::list_for_school(&conn, &school, 100)
        .unwrap()
        .iter()
        .all(|x| x.event_type != audit_log::AuditEventType::SchoolMemberRoleGranted));
    assert!(available(&conn, &sessions).unwrap());
}

#[test]
fn concurrent_connections_can_commit_only_one_recovery() {
    use std::sync::{Arc, Barrier};
    let temp = tempfile::tempdir().unwrap();
    let path = temp.path().join("synthetic.db");
    let key = app_lib::crypto::generate_key();
    let conn = app_lib::db::open(&path, &key).unwrap();
    let (sessions, _, _) = populate(&conn);
    let current = sessions.current().unwrap();
    let barrier = Arc::new(Barrier::new(2));
    let workers: Vec<_> = (0..2)
        .map(|_| {
            let path = path.clone();
            let worker_key = key;
            let current = current.clone();
            let barrier = barrier.clone();
            std::thread::spawn(move || {
                let conn = app_lib::db::open(&path, &worker_key).unwrap();
                let sessions = SessionManager::new();
                sessions.set(current);
                barrier.wait();
                restore(&conn, &sessions, PASSWORD).is_ok()
            })
        })
        .collect();
    assert_eq!(
        workers
            .into_iter()
            .map(|worker| worker.join().unwrap())
            .filter(|success| *success)
            .count(),
        1
    );
    assert_eq!(role_count(&conn), 3);
}

#[test]
fn expired_session_cannot_recover_even_with_correct_password() {
    let (conn, sessions, _, _) = fixture();
    let mut expired = sessions.current().unwrap();
    expired.expires_at = std::time::UNIX_EPOCH;
    sessions.set(expired);
    assert!(matches!(
        restore(&conn, &sessions, PASSWORD),
        Err(AppError::Unauthorized)
    ));
    assert_eq!(role_count(&conn), 0);
}
