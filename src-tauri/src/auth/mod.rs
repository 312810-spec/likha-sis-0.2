mod password;

pub use password::{hash_password, verify_dummy_password_for_timing_safety, verify_password};

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::repository::{
    installation as installation_repo, school as school_repo, session as session_repo,
    user as user_repo,
};

/// Fixed session lifetime. Not an idle timeout — a session is valid for
/// this long after login regardless of activity. See ADR-0004 for why a
/// fixed TTL was chosen over idle tracking for this milestone.
pub const SESSION_DURATION: Duration = Duration::from_secs(8 * 60 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub school_id: String,
    pub created_at: SystemTime,
    pub expires_at: SystemTime,
}

impl Session {
    pub fn is_active(&self, now: SystemTime) -> bool {
        now < self.expires_at
    }
}

/// Builds a `SESSION_DURATION`-lifetime session struct for `id`/`user_id`/
/// `school_id`, anchored to "now." Shared by every path that mints a new
/// session (`login`, `bootstrap_installation`).
fn new_session(id: String, user_id: String, school_id: String) -> Session {
    let created_at = SystemTime::now();
    Session {
        id,
        user_id,
        school_id,
        created_at,
        expires_at: created_at + SESSION_DURATION,
    }
}

/// The single source of truth for "who is currently authenticated in this
/// process." Managed as Tauri state, exactly like the M1 database
/// connection. Always empty the instant the process starts — sessions
/// never survive a restart, regardless of any un-revoked row sitting in
/// the persisted `sessions` table (see ADR-0004).
pub struct SessionManager(Mutex<Option<Session>>);

impl SessionManager {
    pub fn new() -> Self {
        SessionManager(Mutex::new(None))
    }

    pub fn set(&self, session: Session) {
        *self.lock() = Some(session);
    }

    pub fn clear(&self) {
        *self.lock() = None;
    }

    pub fn current(&self) -> Option<Session> {
        self.lock().clone()
    }

    /// The single check every protected command must go through. Returns
    /// the current session's school scope, or `Unauthorized` if there is
    /// no session, it has expired, or it has been revoked in the
    /// persisted table. The revocation check is a real database lookup,
    /// deliberately independent of the in-memory copy: today the only
    /// revocation path (`logout`) also clears the in-memory session in
    /// the same call, but this check ensures a future revocation path
    /// that forgets to do that still cannot leave a revoked session
    /// usable — see `repository::session::is_revoked`.
    pub fn require_active_school_scope(&self, conn: &Connection) -> AppResult<String> {
        let session = match self.lock().as_ref() {
            Some(session) if session.is_active(SystemTime::now()) => session.clone(),
            _ => return Err(AppError::Unauthorized),
        };
        if session_repo::is_revoked(conn, &session.id)? {
            return Err(AppError::Unauthorized);
        }
        Ok(session.school_id)
    }

    fn lock(&self) -> MutexGuard<'_, Option<Session>> {
        self.0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

impl Default for SessionManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Verifies credentials, confirms the user belongs to `school_id`, records
/// a persisted (auditable) session row, and sets it as the process's
/// current session. Fails with `AuthenticationFailed` for a bad
/// username/password and `Unauthorized` for a real user not belonging to
/// the requested school.
pub fn login(
    conn: &Connection,
    sessions: &SessionManager,
    username: &str,
    password: &str,
    school_id: &str,
) -> AppResult<Session> {
    let user = user_repo::verify_credentials(conn, username, password)?;

    if !user_repo::is_member_of_school(conn, &user.id, school_id)? {
        return Err(AppError::Unauthorized);
    }

    let duration_modifier = format!("+{} seconds", SESSION_DURATION.as_secs());
    let session_id = session_repo::insert(conn, &user.id, school_id, &duration_modifier)?;

    let session = new_session(session_id, user.id, school_id.to_string());
    sessions.set(session.clone());
    Ok(session)
}

/// Revokes the current session (if any) in the persisted table and clears
/// the in-memory session. A no-op, not an error, if nothing is logged in.
pub fn logout(conn: &Connection, sessions: &SessionManager) -> AppResult<()> {
    if let Some(session) = sessions.current() {
        session_repo::revoke(conn, &session.id)?;
    }
    sessions.clear();
    Ok(())
}

/// True if this installation has never completed first-run setup (no user
/// account exists yet). Backend-trusted — the frontend must never decide
/// bootstrap availability on its own; it only reflects what this returns.
pub fn installation_needs_setup(conn: &Connection) -> AppResult<bool> {
    Ok(!user_repo::any_users_exist(conn)?)
}

/// Creates the first school, first user, and their membership together as
/// one atomic transaction, then logs the new user in. If any step fails —
/// including the one-time-only claim below — nothing is left behind: the
/// whole transaction rolls back, so a failed bootstrap attempt can always
/// be retried cleanly rather than leaving a half-configured installation.
///
/// The one-time-only guarantee is `installation_repo::claim_bootstrap_slot`,
/// a real INSERT against a singleton row — not a `SELECT`-then-act check.
/// A read-based check was tried first and is deliberately not used: SQLite
/// does not invalidate an already-established read snapshot just because
/// a concurrent connection committed since, so two processes racing to
/// bootstrap the same on-disk file could both pass a `SELECT` check and
/// both go on to create a "first" school. An INSERT is a real write and so
/// is genuinely serialized by SQLite's cross-process write lock; a second
/// process's claim attempt only proceeds after the first's transaction has
/// fully committed (or rolled back), and by then the row already exists.
pub fn bootstrap_installation(
    conn: &mut Connection,
    sessions: &SessionManager,
    school_name: &str,
    username: &str,
    password: &str,
    display_name: &str,
) -> AppResult<Session> {
    let tx = conn.transaction()?;

    // Catches a user already having been created through the older,
    // separate `register_user` bootstrap command (see
    // `authorize_user_registration`) — a path this function's own
    // singleton-claim guard below cannot see, since that guard only
    // protects against races on THIS function being called concurrently,
    // not against a completely different code path having already
    // created an account.
    if user_repo::any_users_exist(&tx)? {
        return Err(AppError::AlreadyInitialized);
    }
    installation_repo::claim_bootstrap_slot(&tx)?;

    let school = school_repo::create(&tx, school_name)?;
    let user = user_repo::create_user(&tx, username, password, display_name)?;
    user_repo::add_school_membership(&tx, &user.id, &school.id)?;

    let duration_modifier = format!("+{} seconds", SESSION_DURATION.as_secs());
    let session_id = session_repo::insert(&tx, &user.id, &school.id, &duration_modifier)?;

    tx.commit()?;

    let session = new_session(session_id, user.id, school.id);
    sessions.set(session.clone());
    Ok(session)
}

/// Gate for the `register_user` command. Always requires an active
/// session — there is no unauthenticated case left for this to guard,
/// now that `bootstrap_installation` (ADR-0006) is the sole path for
/// creating a device's very first account, atomically and with a
/// write-based one-time-only guarantee. `register_user`'s only remaining
/// legitimate purpose is an already-authenticated teacher onboarding a
/// colleague.
///
/// This function used to also permit unauthenticated creation while
/// `!any_users_exist()`, mirroring `bootstrap_installation`'s original
/// (buggy) guard: a plain `SELECT`-based check reasoning that SQLite's
/// write lock would serialize two racing processes. It doesn't — see
/// `installation_repo::claim_bootstrap_slot`'s doc comment for why — and
/// an independent review confirmed the same flaw applied here too: two
/// processes could both pass that check and both create an
/// unauthenticated "first" account. Removing the exception entirely
/// (rather than porting the singleton-claim pattern to this function as
/// well) is simpler and has no cost: nothing in this codebase's UI calls
/// `register_user` for the zero-users case anymore.
pub fn authorize_user_registration(conn: &Connection, sessions: &SessionManager) -> AppResult<()> {
    sessions.require_active_school_scope(conn)?;
    Ok(())
}

/// Gate for the `add_user_to_school` command. Always requires an active
/// session scoped to the SAME school being granted membership — never a
/// different school's session, never no session at all. See
/// `authorize_user_registration`'s doc comment: the previous
/// unauthenticated exception for a school's very first member had the
/// same TOCTOU flaw as the original `bootstrap_installation` bug, and is
/// removed for the same reason, not ported to a write-based guard.
/// Bootstrapping a school's first member now happens exclusively through
/// `bootstrap_installation`.
pub fn authorize_school_membership_grant(
    conn: &Connection,
    sessions: &SessionManager,
    school_id: &str,
) -> AppResult<()> {
    let current_school = sessions.require_active_school_scope(conn)?;
    if current_school != school_id {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{learner, school, user},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn login_succeeds_and_sets_the_current_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let sessions = SessionManager::new();

        let session = login(
            &conn,
            &sessions,
            "ana.cruz",
            "correct horse battery staple",
            &s.id,
        )
        .unwrap();

        assert_eq!(session.user_id, u.id);
        assert_eq!(session.school_id, s.id);
        assert_eq!(sessions.current(), Some(session));
    }

    #[test]
    fn login_fails_with_wrong_password_and_sets_no_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let sessions = SessionManager::new();

        let result = login(&conn, &sessions, "ana.cruz", "wrong password", &s.id);

        assert!(matches!(result, Err(AppError::AuthenticationFailed)));
        assert_eq!(sessions.current(), None);
    }

    #[test]
    fn login_fails_for_a_school_the_user_does_not_belong_to() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &school_a.id).unwrap();
        let sessions = SessionManager::new();

        let result = login(&conn, &sessions, "ana.cruz", "password", &school_b.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
        assert_eq!(sessions.current(), None);
    }

    #[test]
    fn require_active_school_scope_fails_closed_with_no_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        assert!(matches!(
            sessions.require_active_school_scope(&conn),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn require_active_school_scope_fails_closed_for_an_expired_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let session_id = session_repo::insert(&conn, &u.id, &s.id, "+8 hours").unwrap();
        let past = SystemTime::now() - Duration::from_secs(1);
        sessions.set(Session {
            id: session_id,
            user_id: u.id,
            school_id: s.id,
            created_at: past - SESSION_DURATION,
            expires_at: past,
        });

        assert!(matches!(
            sessions.require_active_school_scope(&conn),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn require_active_school_scope_succeeds_for_an_active_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let session_id = session_repo::insert(&conn, &u.id, &s.id, "+8 hours").unwrap();
        let now = SystemTime::now();
        sessions.set(Session {
            id: session_id,
            user_id: u.id,
            school_id: s.id.clone(),
            created_at: now,
            expires_at: now + SESSION_DURATION,
        });

        assert_eq!(sessions.require_active_school_scope(&conn).unwrap(), s.id);
    }

    /// The scenario `require_active_school_scope`'s DB-revocation check
    /// exists for: a session revoked through some path OTHER than
    /// `logout` (which today always clears the in-memory copy in the
    /// same call) must still fail closed, purely from the DB state.
    #[test]
    fn require_active_school_scope_fails_closed_for_a_session_revoked_independently_of_logout() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let session_id = session_repo::insert(&conn, &u.id, &s.id, "+8 hours").unwrap();
        let now = SystemTime::now();
        sessions.set(Session {
            id: session_id.clone(),
            user_id: u.id,
            school_id: s.id,
            created_at: now,
            expires_at: now + SESSION_DURATION,
        });
        assert!(sessions.require_active_school_scope(&conn).is_ok());

        // Revoke the row directly, bypassing `auth::logout` entirely, so
        // the in-memory session is untouched.
        session_repo::revoke(&conn, &session_id).unwrap();

        assert!(matches!(
            sessions.require_active_school_scope(&conn),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn logout_revokes_the_persisted_session_and_clears_current() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let sessions = SessionManager::new();
        let session = login(&conn, &sessions, "ana.cruz", "password", &s.id).unwrap();

        logout(&conn, &sessions).unwrap();

        assert_eq!(sessions.current(), None);
        assert!(session_repo::is_revoked(&conn, &session.id).unwrap());
    }

    #[test]
    fn logout_with_no_active_session_is_not_an_error() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        assert!(logout(&conn, &sessions).is_ok());
    }

    #[test]
    fn a_fresh_session_manager_has_no_session_simulating_process_restart() {
        // A restart is, from the app's perspective, a fresh SessionManager:
        // nothing survives it by construction, regardless of DB contents.
        let conn = open_test_db();
        let sessions = SessionManager::new();
        assert_eq!(sessions.current(), None);
        assert!(sessions.require_active_school_scope(&conn).is_err());
    }

    #[test]
    fn authorize_user_registration_blocks_unauthenticated_registration_even_for_the_first_account()
    {
        // register_user is no longer a bootstrap path at all — see
        // ADR-0006. bootstrap_installation is the only way to create a
        // device's first account now.
        let conn = open_test_db();
        let sessions = SessionManager::new();

        assert!(matches!(
            authorize_user_registration(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_user_registration_blocks_further_accounts_without_a_session() {
        let conn = open_test_db();
        user::create_user(&conn, "existing.teacher", "password", "Existing Teacher").unwrap();
        let sessions = SessionManager::new();

        assert!(matches!(
            authorize_user_registration(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_user_registration_allows_further_accounts_with_an_active_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u =
            user::create_user(&conn, "existing.teacher", "password", "Existing Teacher").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "existing.teacher", "password", &s.id).unwrap();

        assert!(authorize_user_registration(&conn, &sessions).is_ok());
    }

    #[test]
    fn authorize_school_membership_grant_blocks_unauthenticated_grant_even_for_a_schools_first_member(
    ) {
        // Same rationale as the registration gate above: bootstrapping a
        // school's first member now happens exclusively through
        // bootstrap_installation, not through this command.
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sessions = SessionManager::new();

        assert!(matches!(
            authorize_school_membership_grant(&conn, &sessions, &s.id),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_school_membership_grant_blocks_further_grants_without_a_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = user::create_user(&conn, "teacher.one", "password", "Teacher One").unwrap();
        user::add_school_membership(&conn, &existing.id, &s.id).unwrap();
        let sessions = SessionManager::new();

        assert!(matches!(
            authorize_school_membership_grant(&conn, &sessions, &s.id),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_school_membership_grant_blocks_a_session_scoped_to_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let teacher_a = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(&conn, &teacher_a.id, &school_a.id).unwrap();
        // School B already has its own first (different) member.
        let teacher_b = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &teacher_b.id, &school_b.id).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "teacher.a", "password", &school_a.id).unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &school_b.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_school_membership_grant_allows_a_session_scoped_to_the_same_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing = user::create_user(&conn, "teacher.one", "password", "Teacher One").unwrap();
        user::add_school_membership(&conn, &existing.id, &s.id).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "teacher.one", "password", &s.id).unwrap();

        assert!(authorize_school_membership_grant(&conn, &sessions, &s.id).is_ok());
    }

    #[test]
    fn installation_needs_setup_reflects_whether_any_user_exists() {
        let conn = open_test_db();
        assert!(installation_needs_setup(&conn).unwrap());

        user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        assert!(!installation_needs_setup(&conn).unwrap());
    }

    #[test]
    fn bootstrap_installation_creates_school_user_membership_and_an_active_session() {
        let mut conn = open_test_db();
        let sessions = SessionManager::new();

        let session = bootstrap_installation(
            &mut conn,
            &sessions,
            "Rizal Elementary",
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        assert_eq!(sessions.current(), Some(session.clone()));
        let schools = school::list_all(&conn).unwrap();
        assert_eq!(schools.len(), 1);
        assert_eq!(schools[0].name, "Rizal Elementary");
        assert_eq!(session.school_id, schools[0].id);
        assert!(user::is_member_of_school(&conn, &session.user_id, &schools[0].id).unwrap());
    }

    #[test]
    fn bootstrap_installation_account_can_log_in_afterward() {
        let mut conn = open_test_db();
        let sessions = SessionManager::new();
        let bootstrap_session = bootstrap_installation(
            &mut conn,
            &sessions,
            "Rizal Elementary",
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        // Simulate a restart: fresh SessionManager, then a normal login.
        let sessions_after_restart = SessionManager::new();
        let login_session = login(
            &conn,
            &sessions_after_restart,
            "ana.cruz",
            "correct horse battery staple",
            &bootstrap_session.school_id,
        )
        .unwrap();

        assert_eq!(login_session.user_id, bootstrap_session.user_id);
        assert_eq!(login_session.school_id, bootstrap_session.school_id);
    }

    #[test]
    fn a_second_bootstrap_attempt_is_rejected_and_creates_nothing() {
        let mut conn = open_test_db();
        let sessions = SessionManager::new();
        bootstrap_installation(
            &mut conn,
            &sessions,
            "Rizal Elementary",
            "ana.cruz",
            "password",
            "Ana Cruz",
        )
        .unwrap();

        let second_sessions = SessionManager::new();
        let result = bootstrap_installation(
            &mut conn,
            &second_sessions,
            "A Different School",
            "someone.else",
            "password2",
            "Someone Else",
        );

        assert!(matches!(result, Err(AppError::AlreadyInitialized)));
        assert_eq!(second_sessions.current(), None);
        // Nothing from the rejected second attempt was created — still
        // exactly the one school from the first, successful bootstrap.
        let schools = school::list_all(&conn).unwrap();
        assert_eq!(schools.len(), 1);
        assert_eq!(schools[0].name, "Rizal Elementary");
    }

    #[test]
    fn bootstrap_installation_does_not_reopen_the_m4_self_registration_vulnerability() {
        // Regression test for the vulnerability the M4 review found and
        // fixed: an unauthenticated caller must not be able to attach a
        // new account to a school that already has real members/data,
        // even via the bootstrap path.
        let mut conn = open_test_db();
        let sessions = SessionManager::new();
        let legitimate = bootstrap_installation(
            &mut conn,
            &sessions,
            "Rizal Elementary",
            "legit.teacher",
            "password",
            "Legit Teacher",
        )
        .unwrap();
        learner::create(&conn, &legitimate.school_id, "Ana", "Santos").unwrap();

        let attacker_sessions = SessionManager::new();
        let attacker_bootstrap = bootstrap_installation(
            &mut conn,
            &attacker_sessions,
            "Rizal Elementary", // even reusing the same school name
            "attacker",
            "attacker-password",
            "Attacker",
        );
        assert!(matches!(
            attacker_bootstrap,
            Err(AppError::AlreadyInitialized)
        ));

        // The pre-existing authorize_* gates (proven in their own tests
        // above) are still the only path to touch an already-populated
        // school, and they still require a session scoped to it.
        assert!(matches!(
            authorize_school_membership_grant(&conn, &attacker_sessions, &legitimate.school_id),
            Err(AppError::Unauthorized)
        ));
    }
}
