//! Explicit recovery for the narrow pre-RBAC sole-owner installation.
//! Never infer authority from username, school name or frontend flags.
use rusqlite::{Connection, Transaction, TransactionBehavior};

use super::SessionManager;
use crate::error::{AppError, AppResult};
use crate::repository::{audit_log, role, user};
use audit_log::AuditEventType;

fn eligible(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<bool> {
    Ok(conn.query_row(
        "SELECT (SELECT count(*) FROM users) = 1
         AND (SELECT count(*) FROM schools) = 1
         AND (SELECT count(*) FROM user_school_memberships) = 1
         AND EXISTS (SELECT 1 FROM user_school_memberships WHERE user_id = ?1 AND school_id = ?2)
         AND EXISTS (SELECT 1 FROM installation_state WHERE id = 1)
         AND NOT EXISTS (SELECT 1 FROM user_school_roles)
         AND NOT EXISTS (SELECT 1 FROM audit_log WHERE event_type IN
           ('school_member_role_granted','school_member_role_revoked','school_membership_removed'))",
        (user_id, school_id),
        |row| row.get(0),
    )?)
}

pub fn legacy_setup_recovery_available(
    conn: &Connection,
    sessions: &SessionManager,
) -> AppResult<bool> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    eligible(conn, &user_id, &school_id)
}

pub fn restore_legacy_setup_access(
    conn: &Connection,
    sessions: &SessionManager,
    password: &str,
) -> AppResult<()> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    if !eligible(conn, &user_id, &school_id)? {
        return Err(AppError::Unauthorized);
    }
    let account = user::find_by_id(conn, &user_id)?.ok_or(AppError::Unauthorized)?;
    // Outside the role transaction: failed-attempt/lockout counters must persist
    // even when reauthentication fails. No username/password supplied by a caller
    // can select a different account.
    match user::verify_credentials(conn, &account.username, password) {
        Ok(verified) if verified.id == user_id => {}
        Ok(_) => return Err(AppError::Unauthorized),
        Err(error) => {
            let event = if matches!(error, AppError::AccountLocked) {
                AuditEventType::AccountLocked
            } else if matches!(error, AppError::AuthenticationFailed) {
                AuditEventType::LoginFailed
            } else {
                return Err(error);
            };
            audit_log::record(conn, &school_id, Some(&user_id), &account.username, event)?;
            return Err(error);
        }
    }

    // Serialize eligibility and grants against other connections. The initial
    // read-only availability result is never the authorization for this write.
    let tx = Transaction::new_unchecked(conn, TransactionBehavior::Immediate)?;
    let current = sessions.require_active_session(&tx)?;
    if current != (user_id.clone(), school_id.clone()) || !eligible(&tx, &user_id, &school_id)? {
        return Err(AppError::Unauthorized);
    }
    for granted_role in [role::TEACHER, role::REGISTRAR, role::SCHOOL_HEAD] {
        role::grant(&tx, &user_id, &school_id, granted_role)?;
        // These are actual role grants by this reauthenticated account. No
        // historical approval, office/designation or backdated audit is invented.
        audit_log::record_admin_action(
            &tx,
            &school_id,
            &user_id,
            &user_id,
            &account.username,
            AuditEventType::SchoolMemberRoleGranted,
        )?;
    }
    tx.commit()?;
    Ok(())
}
