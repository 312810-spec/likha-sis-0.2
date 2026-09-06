use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
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

/// Wave (School Membership Removal): a School Head revokes a colleague's
/// access to their own school. Gated identically to `add_user_to_school`
/// -- same `ManageSchoolMembership` capability, School Head only -- see
/// `auth::remove_school_member`'s doc comment for the full contract
/// (fail-closed enumeration-safety return, immediate session revocation,
/// the last-School-Head guard). `school_id` is never a parameter here;
/// it is derived from the caller's own session inside the auth gate,
/// matching every other tenant-data command in this codebase. Returns
/// `false` (not an error) for a target that doesn't exist, isn't a
/// member of the caller's school, or whose removal would leave the
/// school with zero School Heads -- the frontend shows one generic
/// message for all three, matching `admin_reset_teacher_password`'s
/// established "security must not rely on UI hiding" convention.
#[tauri::command]
pub fn remove_school_member(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::remove_school_member(&conn, &sessions, &target_user_id)
}

/// School-Member Role Management (grant half): a School Head grants a
/// colleague in their own school an additional role, on top of whatever
/// they already hold. See `auth::grant_school_member_role`'s doc comment
/// for the full contract. `school_id` is never a parameter here; it is
/// derived from the caller's own session inside the auth gate. Returns
/// `false` (not an error) for a target that doesn't exist or isn't a
/// member of the caller's school; an unrecognized `role` string is a
/// real error, not a fail-closed `false`, since it is a caller
/// programming error rather than a target-enumeration concern.
#[tauri::command]
pub fn grant_school_member_role(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    role: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::grant_school_member_role(&conn, &sessions, &target_user_id, &role)
}

/// School-Member Role Management (revoke half): a School Head revokes
/// one role from a colleague in their own school, leaving their
/// membership and any other role intact. See
/// `auth::revoke_school_member_role`'s doc comment for the full contract
/// (fail-closed enumeration-safety return, the last-School-Head-role
/// guard). `school_id` is never a parameter here.
#[tauri::command]
pub fn revoke_school_member_role(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    target_user_id: String,
    role: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::revoke_school_member_role(&conn, &sessions, &target_user_id, &role)
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
