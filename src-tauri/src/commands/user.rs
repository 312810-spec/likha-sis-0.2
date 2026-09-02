use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
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
/// least-privilege starting point (see `docs/adr/0036-rbac-foundation.md`).
/// `grant_school_role`/`revoke_school_role` below (Roles & Permissions
/// milestone) close the gap this doc comment used to disclose here: this
/// codebase previously built no UI/command to grant Registrar/School
/// Head to anyone past a fresh installation's founding user.
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

/// Grants `role_name` (must satisfy `role::is_grantable` -- see that
/// function's doc comment) to `target_user_id` within the caller's own
/// school. School Head only (`Capability::ManageRoles`).
#[tauri::command]
pub fn grant_school_role(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    role_name: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageRoles)?;
    if !role::is_grantable(&role_name) {
        return Err(AppError::Unauthorized);
    }
    if !user::is_member_of_school(&conn, &target_user_id, &school_id)? {
        return Err(AppError::Unauthorized);
    }
    role::grant(&conn, &target_user_id, &school_id, &role_name)
}

/// Revokes `role_name` (must satisfy `role::is_grantable`) from
/// `target_user_id` within the caller's own school. School Head only
/// (`Capability::ManageRoles`), same as `grant_school_role`. Fails with
/// `AppError::CannotRemoveLastSchoolHead` rather than silently succeeding
/// if this would leave the school with zero School Heads -- see
/// `repository::role::revoke`'s doc comment; the frontend surfaces this
/// as a specific, actionable message rather than a generic failure.
#[tauri::command]
pub fn revoke_school_role(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    role_name: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageRoles)?;
    if !role::is_grantable(&role_name) {
        return Err(AppError::Unauthorized);
    }
    role::revoke(&conn, &target_user_id, &school_id, &role_name)
}

/// Wave 3I (ADR-0057): a School Head sets a new password directly for a
/// colleague in their own school. See `auth::admin_reset_teacher_password`
/// for the full authorization/enumeration-safety contract -- this
/// command only wires it up and zeroizes the raw password afterward,
/// matching `register_user`'s established convention. Returns `false`
/// (not an error) for a target that doesn't exist or belongs to a
/// different school; the frontend shows the same generic message either
/// way, matching this codebase's "security must not rely on UI hiding"
/// convention.
#[tauri::command]
pub fn admin_reset_teacher_password(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    mut new_password: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let result =
        auth::admin_reset_teacher_password(&conn, &sessions, &target_user_id, &new_password);
    new_password.zeroize();
    result
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
