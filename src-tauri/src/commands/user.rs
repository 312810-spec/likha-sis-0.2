use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::audit_log::{self, AuditEventType};
use crate::repository::role;
use crate::repository::user::{self, SchoolMember, User};

/// Always requires an active session — this is no longer a bootstrap
/// path (see ADR-0006; `auth::bootstrap_installation` is the sole way to
/// create a device's first account now). The only legitimate caller is
/// an already-authenticated teacher onboarding a colleague.
#[tauri::command]
pub fn register_user(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    username: String,
    mut password: String,
    display_name: String,
) -> AppResult<User> {
    let conn = lock_db(&db);
    auth::authorize_user_registration(&conn, &sessions)?;
    let result = user::create_user(&conn, &username, &password, &display_name);
    password.zeroize();
    result
}

/// Requires an active session scoped to `school_id` AND that the caller
/// holds the School-Head-only `ManageSchoolMembership` capability in
/// that school -- see `register_user`'s doc comment above, ADR-0006, and
/// `auth::authorize_school_membership_grant`'s doc comment for the
/// RBAC-corrective-gate fix (this command previously let any
/// authenticated Teacher add a new member; confirmed exploitable and
/// closed). Grants the new member the Teacher role by default -- the
/// least-privilege starting point (see
/// `docs/adr/0036-rbac-foundation.md`); this codebase still builds no
/// UI/command to grant Registrar/School Head to anyone other than a
/// fresh installation's founding user (`auth::bootstrap_installation`),
/// deliberately out of scope here too.
#[tauri::command]
pub fn add_user_to_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    user_id: String,
    school_id: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    auth::authorize_school_membership_grant(&conn, &sessions, &school_id)?;
    user::add_school_membership(&conn, &user_id, &school_id)?;
    role::grant(&conn, &user_id, &school_id, role::TEACHER)
}

/// Reference data any authenticated school member may read -- matching
/// `list_teaching_assignments_by_section`'s established convention.
/// Wave 2Y (Teaching Assignments UI): a School Head needs to see who
/// their colleagues are, with roles, to pick a teacher when creating an
/// assignment; usernames/display names/roles carry no more sensitivity
/// than what `AuditLogScreen` already shows within the same school.
#[tauri::command]
pub fn list_school_members(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SchoolMember>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    user::list_members_in_school(&conn, &school_id)
}

/// Admin-Assisted Password Reset (Wave 3I) -- see
/// `docs/adr/0057-admin-assisted-password-reset.md` for the full
/// 10-scenario decision. Only a School Head may reset a colleague's
/// password, and only for a colleague in their own school --
/// `auth::authorize_admin_password_reset` independently re-verifies
/// both before any write, never trusting the client-supplied
/// `target_user_id`'s school. Also clears the target's existing
/// lockout state (see `user::admin_reset_password`) and records a
/// `PasswordResetByAdmin` audit event against the target account,
/// matching every other `audit_log` row's "whose account" shape.
#[tauri::command]
pub fn admin_reset_teacher_password(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    mut new_password: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_admin_password_reset(&conn, &sessions, &target_user_id)?;
    let result = (|| {
        user::admin_reset_password(&conn, &target_user_id, &new_password)?;
        let target = user::find_by_id(&conn, &target_user_id)?
            .expect("authorize_admin_password_reset already verified this user exists");
        audit_log::record(
            &conn,
            &school_id,
            Some(&target_user_id),
            &target.username,
            AuditEventType::PasswordResetByAdmin,
        )
    })();
    new_password.zeroize();
    result
}
