mod password;

pub use password::{hash_password, verify_dummy_password_for_timing_safety, verify_password};

use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};

use rusqlite::Connection;

use crate::error::{AppError, AppResult};
use crate::repository::audit_log::AuditEventType;
use crate::repository::{
    audit_log as audit_log_repo, installation as installation_repo, role as role_repo,
    school as school_repo, section as section_repo, section_advisory as section_advisory_repo,
    session as session_repo, user as user_repo,
};

/// Fixed session lifetime — an absolute cap regardless of activity. See
/// ADR-0004 for why a fixed TTL was chosen over idle tracking for that
/// milestone, and ADR-0020 for why idle tracking was added on top of it
/// (not instead of it) once account lockout closed the other half of
/// this app's shared-computer threat model.
pub const SESSION_DURATION: Duration = Duration::from_secs(8 * 60 * 60);

/// A session with no protected-command activity for this long is treated
/// as expired, even though `SESSION_DURATION`'s absolute cap hasn't been
/// reached. Standard engineering default for a moderate-risk application
/// (OWASP Session Management Cheat Sheet's general guidance), not a
/// DepEd/school-specific policy choice — same reasoning as
/// `user::MAX_FAILED_LOGIN_ATTEMPTS`. See ADR-0020.
pub const IDLE_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub school_id: String,
    pub created_at: SystemTime,
    pub expires_at: SystemTime,
    /// Updated to "now" by every `require_active_session`/
    /// `require_active_school_scope` call that succeeds — a sliding
    /// window, not a fixed point. A peek-only check like
    /// `commands::auth::current_session` must NOT touch this: it should
    /// observe idle state, not extend it, or "is anyone still logged
    /// in?" polling would itself defeat the idle timeout.
    pub last_activity_at: SystemTime,
}

impl Session {
    /// Active only if BOTH the absolute cap and the idle window are
    /// unexpired — either one alone is not enough. `duration_since`
    /// returns `Err` if `now` is somehow before `last_activity_at` (clock
    /// skew); treated as "not idle" (the safer default: don't spuriously
    /// log someone out because of a clock anomaly) rather than erroring.
    pub fn is_active(&self, now: SystemTime) -> bool {
        now < self.expires_at
            && now
                .duration_since(self.last_activity_at)
                .map(|idle_for| idle_for < IDLE_TIMEOUT)
                .unwrap_or(true)
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
        last_activity_at: created_at,
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
        self.require_active_session(conn)
            .map(|(_, school_id)| school_id)
    }

    /// The same check as `require_active_school_scope`, but also returns
    /// the session's `user_id` — for commands that need to attribute a
    /// write to who made it (e.g. `learner_scores.recorded_by_user_id`),
    /// not just which school it belongs to.
    ///
    /// A successful call slides the idle-timeout window forward to now —
    /// this IS the "activity" `Session::last_activity_at` tracks, since
    /// every protected command goes through here. A peek-only check
    /// (`current()`/`Session::is_active` called directly, as
    /// `commands::auth::current_session` does) must never do this.
    pub fn require_active_session(&self, conn: &Connection) -> AppResult<(String, String)> {
        let session = match self.lock().as_ref() {
            Some(session) if session.is_active(SystemTime::now()) => session.clone(),
            _ => return Err(AppError::Unauthorized),
        };
        if session_repo::is_revoked(conn, &session.id)? {
            return Err(AppError::Unauthorized);
        }
        if let Some(current) = self.lock().as_mut() {
            current.last_activity_at = SystemTime::now();
        }
        Ok((session.user_id, session.school_id))
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
///
/// Every outcome is recorded to `repository::audit_log` (see migration
/// 15 and ADR-0021): a successful login, a failed one (bad credentials
/// or a real user not belonging to `school_id`), or an account-locked
/// rejection. Audit writes never replace the real error being returned —
/// they happen alongside it, via `?` after the write, so a logging
/// failure surfaces honestly rather than being swallowed.
pub fn login(
    conn: &Connection,
    sessions: &SessionManager,
    username: &str,
    password: &str,
    school_id: &str,
) -> AppResult<Session> {
    let user = match user_repo::verify_credentials(conn, username, password) {
        Ok(user) => user,
        Err(AppError::AccountLocked) => {
            audit_log_repo::record(
                conn,
                school_id,
                None,
                username,
                AuditEventType::AccountLocked,
            )?;
            return Err(AppError::AccountLocked);
        }
        Err(AppError::AuthenticationFailed) => {
            audit_log_repo::record(conn, school_id, None, username, AuditEventType::LoginFailed)?;
            return Err(AppError::AuthenticationFailed);
        }
        Err(e) => return Err(e),
    };

    if !user_repo::is_member_of_school(conn, &user.id, school_id)? {
        audit_log_repo::record(
            conn,
            school_id,
            Some(&user.id),
            &user.username,
            AuditEventType::LoginFailed,
        )?;
        return Err(AppError::Unauthorized);
    }

    let duration_modifier = format!("+{} seconds", SESSION_DURATION.as_secs());
    let session_id = session_repo::insert(conn, &user.id, school_id, &duration_modifier)?;

    audit_log_repo::record(
        conn,
        school_id,
        Some(&user.id),
        &user.username,
        AuditEventType::LoginSuccess,
    )?;

    let session = new_session(session_id, user.id, school_id.to_string());
    sessions.set(session.clone());
    Ok(session)
}

/// Revokes the current session (if any) in the persisted table and clears
/// the in-memory session. A no-op, not an error, if nothing is logged in.
/// Records a `Logout` audit event when there was a session to revoke; if
/// the user row has since been deleted (should not happen in practice —
/// nothing deletes users today — but not assumed), the revoke/clear
/// still proceeds and only the audit write is skipped.
pub fn logout(conn: &Connection, sessions: &SessionManager) -> AppResult<()> {
    if let Some(session) = sessions.current() {
        session_repo::revoke(conn, &session.id)?;
        if let Some(user) = user_repo::find_by_id(conn, &session.user_id)? {
            audit_log_repo::record(
                conn,
                &session.school_id,
                Some(&user.id),
                &user.username,
                AuditEventType::Logout,
            )?;
        }
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
    // The founding user is the sole account on a fresh installation --
    // there is no one else yet to hold Registrar/School Head duties, so
    // granting all three starting roles is the only way this account can
    // actually use the app (e.g. enroll its first learner) before a
    // second account exists. A subsequently added member
    // (`add_user_to_school`) defaults to Teacher only -- the least-
    // privilege default -- not this same all-roles grant.
    role_repo::grant(&tx, &user.id, &school.id, role_repo::TEACHER)?;
    role_repo::grant(&tx, &user.id, &school.id, role_repo::REGISTRAR)?;
    role_repo::grant(&tx, &user.id, &school.id, role_repo::SCHOOL_HEAD)?;

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

/// Gate for the `add_user_to_school` command. Requires an active session
/// scoped to the SAME school being granted membership — never a
/// different school's session, never no session at all — AND that the
/// caller holds the `ManageSchoolMembership` capability (School Head
/// only) in that school. See `authorize_user_registration`'s doc
/// comment: the previous unauthenticated exception for a school's very
/// first member had the same TOCTOU flaw as the original
/// `bootstrap_installation` bug, and is removed for the same reason, not
/// ported to a write-based guard. Bootstrapping a school's first member
/// now happens exclusively through `bootstrap_installation`.
///
/// **Corrective fix (RBAC authorization gate, post-Wave-1A)**: this
/// function previously checked only "an active session scoped to this
/// school," with no role check at all — meaning any authenticated
/// Teacher could add an arbitrary user as a new member of their own
/// school. This was a known, disclosed gap recorded as debt in
/// `docs/adr/0036-rbac-foundation.md` (`add_user_to_school`'s own doc
/// comment already flagged it), not a silent regression. Confirmed
/// exploitable end-to-end via two already-existing commands
/// (`register_user` to obtain a fresh `user_id`, then the unguarded
/// `add_user_to_school` to self-grant that account membership) before
/// this fix. Now routed through `authorize_capability`, the same
/// trusted gate every other capability-checked command in this codebase
/// uses — reusing the existing pattern, not inventing a new one.
pub fn authorize_school_membership_grant(
    conn: &Connection,
    sessions: &SessionManager,
    school_id: &str,
) -> AppResult<()> {
    let current_school = authorize_capability(conn, sessions, Capability::ManageSchoolMembership)?;
    if current_school != school_id {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

/// The capabilities WAVE 1A's RBAC foundation recognizes -- each variant
/// names the role(s) allowed to exercise it, per
/// `docs/product/PRODUCT-CONTRACT.md`'s RBAC section and the confirmed
/// Teacher/Registrar/School Head starting model
/// (`docs/product/M8-DECISION.md`'s follow-up). Deliberately
/// capability-oriented rather than scattered `if role == "..."` checks
/// throughout command code: a future capability is one new match arm
/// here, not a new pattern; a future role is a widened CHECK constraint
/// (migration 16) plus a widened `allowed_roles` list here, never a
/// restructuring of this type or of any command that already calls
/// `authorize_capability`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    /// Create or edit a learner's enrollment record. The representative
    /// authorization proof for this milestone -- see
    /// `docs/adr/0036-rbac-foundation.md`.
    ManageLearners,
    /// Add an existing user account as a member of a school (and grant
    /// them a role -- currently always the least-privilege Teacher role,
    /// see `commands::user::add_user_to_school`). School Head only --
    /// see `authorize_school_membership_grant`'s doc comment for why
    /// this was tightened from "any authenticated session in the same
    /// school" (the RBAC Foundation milestone's disclosed, deliberately
    /// deferred gap) to a real role check, and why School-Head-only was
    /// chosen as the conservative fix rather than also including
    /// Registrar.
    ManageSchoolMembership,
    /// Create, reassign, or remove a `TeachingAssignment`/`ScheduleMeeting`
    /// -- see `docs/adr/0039-teacher-load-class-schedule-foundation.md`.
    /// School Head only, deliberately not reusing
    /// `ManageSchoolMembership`: assigning teachers to classes is a
    /// scheduling-authority decision, distinct from onboarding a school
    /// member, even though both currently resolve to the same role.
    ManageTeachingAssignments,
    /// Assign or end a section's adviser (`section_advisories`) -- see
    /// `docs/adr/0056-section-advisory-foundation.md`. School Head only,
    /// deliberately its own variant rather than reusing
    /// `ManageTeachingAssignments`: who advises a section is a distinct
    /// scheduling-authority decision from who teaches which subject to
    /// it, matching this codebase's own established precedent
    /// (`ManageTeachingAssignments`'s doc comment reasons the same way
    /// about not reusing `ManageSchoolMembership`), even though today
    /// both capabilities resolve to the same role.
    ManageSectionAdvisories,
}

impl Capability {
    fn allowed_roles(self) -> &'static [&'static str] {
        match self {
            Capability::ManageLearners => &[role_repo::REGISTRAR, role_repo::SCHOOL_HEAD],
            Capability::ManageSchoolMembership => &[role_repo::SCHOOL_HEAD],
            Capability::ManageTeachingAssignments => &[role_repo::SCHOOL_HEAD],
            Capability::ManageSectionAdvisories => &[role_repo::SCHOOL_HEAD],
        }
    }
}

/// A teacher may always view their own load/schedule; viewing another
/// teacher's requires the `ManageTeachingAssignments` capability **and**
/// that the target teacher is actually a member of the caller's own
/// school -- without that second check, a School Head's role in their
/// own school would incorrectly authorize viewing a same-named-parameter
/// teacher belonging to a *different* school, since holding the role
/// says nothing on its own about which school `target_teacher_user_id`
/// belongs to (caught by
/// `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`
/// during this function's own TDD pass, not shipped and fixed later).
/// This is deliberately not a `Capability` match arm -- unlike a
/// capability, whether this check passes depends on *which* teacher is
/// being viewed, not on a fixed role set alone. Fails closed with no
/// session, exactly like every other gate in this module.
pub fn authorize_view_teacher_load(
    conn: &Connection,
    sessions: &SessionManager,
    target_teacher_user_id: &str,
) -> AppResult<String> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    if user_id == target_teacher_user_id {
        return Ok(school_id);
    }
    if role_repo::has_any_role(
        conn,
        &user_id,
        &school_id,
        Capability::ManageTeachingAssignments.allowed_roles(),
    )? && user_repo::is_member_of_school(conn, target_teacher_user_id, &school_id)?
    {
        return Ok(school_id);
    }
    Err(AppError::Unauthorized)
}

/// A teacher who currently advises `section_id` (as of `as_of_date`) may
/// view its adviser-facing signals, and so may anyone holding
/// `ManageSectionAdvisories` (a School Head, matching every other
/// School-Head-oversight gate in this module). Mirrors
/// `authorize_view_teacher_load`'s self-or-School-Head shape exactly.
///
/// Not yet called by any command -- this is Section Advisory
/// Foundation (Wave 3E), the authorization boundary a future Subject
/// Attendance "Adviser View" read will be built on, matching this
/// project's own established zero-UI-first precedent for a new domain
/// (RBAC, Curriculum, Teacher Load, Subject Attendance Foundation all
/// shipped their first increment with full test coverage and no
/// caller). See `docs/adr/0056-section-advisory-foundation.md`.
pub fn authorize_adviser_of_section(
    conn: &Connection,
    sessions: &SessionManager,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<(String, String)> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    // A School Head's role holds only within their own school, but role
    // membership alone says nothing about which school `section_id`
    // belongs to -- without this check, a School Head would incorrectly
    // authorize a same-shaped `section_id` belonging to a *different*
    // school, the same class of bug
    // `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`
    // proved this module must guard against (caught here by
    // `authorize_adviser_of_section_denies_a_school_head_for_a_different_schools_section`
    // during this function's own TDD pass, not shipped and fixed later).
    if section_repo::find_by_id_in_school(conn, &school_id, section_id)?.is_none() {
        return Err(AppError::Unauthorized);
    }
    if section_advisory_repo::is_current_adviser(
        conn, &school_id, section_id, &user_id, as_of_date,
    )? {
        return Ok((user_id, school_id));
    }
    if role_repo::has_any_role(
        conn,
        &user_id,
        &school_id,
        Capability::ManageSectionAdvisories.allowed_roles(),
    )? {
        return Ok((user_id, school_id));
    }
    Err(AppError::Unauthorized)
}

/// Resolves the current Adviser View list scope. A School Head may
/// choose any section in their school; everyone else receives only
/// sections they actively advise. This is picker scoping, not the data
/// boundary -- `authorize_adviser_of_section` is still required for the
/// selected section when attendance signals are read.
pub fn resolve_adviser_view_scope(
    conn: &Connection,
    sessions: &SessionManager,
) -> AppResult<(String, String, bool)> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    let can_review_all = role_repo::has_any_role(
        conn,
        &user_id,
        &school_id,
        Capability::ManageSectionAdvisories.allowed_roles(),
    )?;
    Ok((user_id, school_id, can_review_all))
}

/// The trusted authorization boundary for a capability-gated command.
/// Mirrors `require_active_school_scope`'s fail-closed shape exactly,
/// with one addition: the session's user must also hold one of
/// `capability`'s allowed roles WITHIN that same school. Role membership
/// is looked up fresh from the database on every call, never cached on
/// the in-memory `Session` -- a role granted or revoked mid-session
/// takes effect on the very next protected call, the same guarantee
/// `require_active_session`'s independent revocation lookup already
/// gives session validity itself. `capability` is never a client-
/// supplied argument -- callers pass a fixed `Capability` variant chosen
/// by the command itself, exactly like `school_id` is never accepted
/// from the caller.
pub fn authorize_capability(
    conn: &Connection,
    sessions: &SessionManager,
    capability: Capability,
) -> AppResult<String> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    if !role_repo::has_any_role(conn, &user_id, &school_id, capability.allowed_roles())? {
        return Err(AppError::Unauthorized);
    }
    Ok(school_id)
}

/// Identical gate to `authorize_capability`, additionally returning the
/// session's `user_id` alongside `school_id`. Exists for the small set of
/// callers that need to attribute a write to an actor (e.g. Wave 2E's
/// `sf1_import_history`) without every other `authorize_capability`
/// caller having to discard an unused `user_id` — the two never diverge
/// in what they check, only in what they return.
pub fn authorize_capability_with_actor(
    conn: &Connection,
    sessions: &SessionManager,
    capability: Capability,
) -> AppResult<(String, String)> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    if !role_repo::has_any_role(conn, &user_id, &school_id, capability.allowed_roles())? {
        return Err(AppError::Unauthorized);
    }
    Ok((school_id, user_id))
}

/// Admin-Assisted Password Reset (Wave 3I, ADR-0061): a School Head sets
/// a new password directly for a colleague in their own school,
/// effective immediately. Deliberately reuses `ManageSchoolMembership`
/// rather than a new `Capability` variant -- resetting a colleague's
/// login credential is the same authority class as onboarding them in
/// the first place (`authorize_school_membership_grant`), and both
/// already resolve to School-Head-only. Reuses the existing Argon2id
/// hashing path (`hash_password`) unchanged, and the existing
/// `audit_log` table (widened by migration 24) via
/// `audit_log_repo::record_admin_action`.
///
/// Target resolution is entirely server-side and re-verified fresh on
/// every call, exactly like every other `authorize_*` gate in this
/// module -- `target_user_id` is never trusted to already belong to the
/// caller's school just because the frontend's own member list would
/// only ever show same-school colleagues.
///
/// Returns `Ok(false)` -- not an error -- both when `target_user_id`
/// does not exist at all AND when it exists but belongs to a different
/// school. This is a deliberate enumeration-safety choice: collapsing
/// both cases into one identical, auditless outcome means neither can
/// be used to probe whether a given user id exists in another school.
/// `Err(Unauthorized)` is reserved for the capability check itself (no
/// session, or a session without `ManageSchoolMembership` in its own
/// school) -- a fundamentally different situation the frontend already
/// has to distinguish for every other capability-gated command (see
/// `invoke.ts`'s exemption-set doc comment).
pub fn admin_reset_teacher_password(
    conn: &Connection,
    sessions: &SessionManager,
    target_user_id: &str,
    new_password: &str,
) -> AppResult<bool> {
    let (school_id, actor_user_id) =
        authorize_capability_with_actor(conn, sessions, Capability::ManageSchoolMembership)?;

    let target = match user_repo::find_by_id(conn, target_user_id)? {
        Some(user) => user,
        None => return Ok(false),
    };
    if !user_repo::is_exclusively_member_of_school(conn, &target.id, &school_id)? {
        return Ok(false);
    }
    let new_hash = hash_password(new_password)?;
    conn.execute_batch("SAVEPOINT admin_password_reset")?;
    let reset = (|| -> AppResult<bool> {
        if !user_repo::set_password_and_clear_lockout(conn, &target.id, &school_id, &new_hash)? {
            return Ok(false);
        }
        session_repo::revoke_all_for_user(conn, &target.id)?;
        audit_log_repo::record_admin_action(
            conn,
            &school_id,
            &actor_user_id,
            &target.id,
            &target.username,
            AuditEventType::PasswordResetByAdmin,
        )?;
        Ok(true)
    })();
    match reset {
        Ok(succeeded) => {
            conn.execute_batch("RELEASE admin_password_reset")?;
            Ok(succeeded)
        }
        Err(error) => {
            let _ = conn
                .execute_batch("ROLLBACK TO admin_password_reset; RELEASE admin_password_reset");
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{learner, school, section, user},
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
    fn a_successful_login_is_recorded_in_the_audit_log() {
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

        login(
            &conn,
            &sessions,
            "ana.cruz",
            "correct horse battery staple",
            &s.id,
        )
        .unwrap();

        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].event_type, AuditEventType::LoginSuccess);
        assert_eq!(entries[0].user_id, Some(u.id));
        assert_eq!(entries[0].username, "ana.cruz");
    }

    #[test]
    fn a_failed_login_is_recorded_with_no_known_user_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sessions = SessionManager::new();

        let _ = login(&conn, &sessions, "does.not.exist", "anything", &s.id);

        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].event_type, AuditEventType::LoginFailed);
        assert_eq!(entries[0].user_id, None);
        assert_eq!(entries[0].username, "does.not.exist");
    }

    #[test]
    fn a_locked_account_login_attempt_is_recorded_as_account_locked_not_login_failed() {
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
        for _ in 0..user::MAX_FAILED_LOGIN_ATTEMPTS {
            let _ = login(&conn, &sessions, "ana.cruz", "wrong password", &s.id);
        }

        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(
            entries[0].event_type,
            AuditEventType::AccountLocked,
            "the attempt that actually triggers the lock must be recorded as such, not as a plain failure"
        );
    }

    #[test]
    fn a_logout_is_recorded_in_the_audit_log() {
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
        login(
            &conn,
            &sessions,
            "ana.cruz",
            "correct horse battery staple",
            &s.id,
        )
        .unwrap();

        logout(&conn, &sessions).unwrap();

        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries[0].event_type, AuditEventType::Logout);
        assert_eq!(entries[0].username, "ana.cruz");
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
            last_activity_at: past,
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
            last_activity_at: now,
        });

        assert_eq!(sessions.require_active_school_scope(&conn).unwrap(), s.id);
    }

    #[test]
    fn require_active_school_scope_fails_closed_for_a_session_idle_too_long_even_within_the_absolute_ttl(
    ) {
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
            school_id: s.id,
            created_at: now - Duration::from_secs(60 * 60), // logged in an hour ago
            expires_at: now + Duration::from_secs(7 * 60 * 60), // absolute TTL far from expiring
            last_activity_at: now - IDLE_TIMEOUT - Duration::from_secs(1), // idle just past the window
        });

        assert!(matches!(
            sessions.require_active_school_scope(&conn),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn a_successful_check_slides_the_idle_window_forward_so_continued_activity_stays_logged_in() {
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
            // Idle for nearly the whole window, but not past it yet.
            last_activity_at: now - IDLE_TIMEOUT + Duration::from_secs(5),
        });

        // This call succeeds and, per its own contract, resets
        // last_activity_at to "now" -- proven by checking the in-memory
        // session directly afterward rather than trusting the call's own
        // success alone.
        assert!(sessions.require_active_school_scope(&conn).is_ok());

        let after = sessions.current().unwrap();
        assert!(
            after.last_activity_at >= now,
            "a successful check must slide last_activity_at forward, not leave the old value"
        );
    }

    #[test]
    fn current_session_peek_does_not_itself_slide_the_idle_window() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let session_id = session_repo::insert(&conn, &u.id, &s.id, "+8 hours").unwrap();
        let now = SystemTime::now();
        let stale_activity = now - Duration::from_secs(60);
        sessions.set(Session {
            id: session_id,
            user_id: u.id,
            school_id: s.id,
            created_at: now,
            expires_at: now + SESSION_DURATION,
            last_activity_at: stale_activity,
        });

        // A peek via `current()` (what `commands::auth::current_session`
        // does) must not extend the idle window -- only
        // `require_active_session`/`require_active_school_scope` count as
        // activity.
        let _ = sessions.current();

        assert_eq!(sessions.current().unwrap().last_activity_at, stale_activity);
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
            last_activity_at: now,
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
        // A School Head in School A -- so this test isolates the
        // cross-school check, not the (separately tested) role check.
        role_repo::grant(&conn, &teacher_a.id, &school_a.id, role_repo::SCHOOL_HEAD).unwrap();
        // School B already has its own first (different) member.
        let teacher_b = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &teacher_b.id, &school_b.id).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "teacher.a", "password", &school_a.id).unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &school_b.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_school_membership_grant_allows_a_school_head_session_in_the_same_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let existing =
            user::create_user(&conn, "principal.one", "password", "Principal One").unwrap();
        user::add_school_membership(&conn, &existing.id, &s.id).unwrap();
        role_repo::grant(&conn, &existing.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "principal.one", "password", &s.id).unwrap();

        assert!(authorize_school_membership_grant(&conn, &sessions, &s.id).is_ok());
    }

    // ---- RBAC authorization corrective gate: add_user_to_school ----
    //
    // `authorize_school_membership_grant` previously checked only "an
    // active session scoped to this school" -- no role check at all. Any
    // authenticated Teacher could add an arbitrary user as a new member
    // of their own school. Confirmed exploitable end-to-end via two
    // already-existing commands: `register_user` (any active session,
    // any role -- returns the new account's id) then the unguarded
    // `add_user_to_school` (same school, any role) to self-grant that
    // account membership. Fixed by routing through `authorize_capability`
    // with a new `ManageSchoolMembership` capability restricted to
    // School Head, the same trusted-gate pattern every other
    // capability-checked command in this codebase already uses.

    #[test]
    fn authorize_school_membership_grant_denies_a_teacher_only_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(&conn, &teacher.id, &s.id).unwrap();
        role_repo::grant(&conn, &teacher.id, &s.id, role_repo::TEACHER).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "teacher.a", "password", &s.id).unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &s.id);

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "an ordinary Teacher must not be able to add a new member to their own school -- \
             this is the exact defect this corrective gate closes"
        );
    }

    #[test]
    fn authorize_school_membership_grant_denies_a_session_with_no_role_granted_at_all() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        // A member with a session but zero role grants -- distinct from
        // "no session at all", already covered by the unauthenticated
        // tests above.
        let member = user::create_user(&conn, "member.a", "password", "Member A").unwrap();
        user::add_school_membership(&conn, &member.id, &s.id).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "member.a", "password", &s.id).unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &s.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_school_membership_grant_denies_a_registrar_only_session() {
        // Registrar is deliberately NOT in ManageSchoolMembership's
        // allowed-roles list -- onboarding a new school member is a
        // School Head responsibility, not bundled into Registrar's
        // enrollment/records scope. See the Capability doc comment.
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let registrar = user::create_user(&conn, "registrar.a", "password", "Registrar A").unwrap();
        user::add_school_membership(&conn, &registrar.id, &s.id).unwrap();
        role_repo::grant(&conn, &registrar.id, &s.id, role_repo::REGISTRAR).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "registrar.a", "password", &s.id).unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &s.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_school_membership_grant_denies_once_the_school_head_role_is_removed_mid_session() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let principal = user::create_user(&conn, "principal.a", "password", "Principal A").unwrap();
        user::add_school_membership(&conn, &principal.id, &s.id).unwrap();
        role_repo::grant(&conn, &principal.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let sessions = SessionManager::new();
        login(&conn, &sessions, "principal.a", "password", &s.id).unwrap();
        assert!(authorize_school_membership_grant(&conn, &sessions, &s.id).is_ok());

        conn.execute(
            "DELETE FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2",
            (&principal.id, &s.id),
        )
        .unwrap();

        let result = authorize_school_membership_grant(&conn, &sessions, &s.id);

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "a role revoked mid-session must take effect on the very next call -- no caching"
        );
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
        learner::create(&conn, &legitimate.school_id, "Ana", "Santos", None, None).unwrap();

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

    // ---- WAVE 1A RBAC Foundation: authorize_capability ----
    //
    // These are the security tests for this milestone's representative
    // authorization proof (ManageLearners, gating `create_learner`/
    // `update_learner`). See docs/adr/0036-rbac-foundation.md.

    /// A school with one plain member (no role granted at all) plus a
    /// logged-in session for them — the starting point most of the tests
    /// below build on, mirroring `authorize_school_membership_grant`'s
    /// own test fixtures.
    fn setup_member_with_session(
        conn: &Connection,
        sessions: &SessionManager,
    ) -> (crate::repository::school::School, user::User) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let u = user::create_user(conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(conn, &u.id, &s.id).unwrap();
        login(conn, sessions, "ana.cruz", "password", &s.id).unwrap();
        (s, u)
    }

    #[test]
    fn authorize_capability_fails_closed_with_no_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_capability_denies_a_teacher_only_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::TEACHER).unwrap();

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_capability_denies_a_session_with_no_role_granted_at_all() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        setup_member_with_session(&conn, &sessions);
        // Deliberately no role_repo::grant call at all.

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_capability_allows_a_registrar_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::REGISTRAR).unwrap();

        assert_eq!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners).unwrap(),
            s.id
        );
    }

    #[test]
    fn authorize_capability_allows_a_school_head_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();

        assert_eq!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners).unwrap(),
            s.id
        );
    }

    #[test]
    fn authorize_capability_allows_a_session_holding_multiple_roles_including_an_allowed_one() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::TEACHER).unwrap();
        role_repo::grant(&conn, &u.id, &s.id, role_repo::REGISTRAR).unwrap();

        assert!(authorize_capability(&conn, &sessions, Capability::ManageLearners).is_ok());
    }

    /// A tampered/forged capability cannot be supplied by a caller at
    /// all — `Capability` is a fixed enum chosen by the command's own
    /// source code, never deserialized from client input. This test
    /// instead proves the more relevant tamper scenario: a role granted
    /// in a DIFFERENT school must not authorize this one, even for the
    /// same user and the same capability — a stand-in for "forged
    /// school scope," since `school_id` itself is already proven
    /// session-derived-only by the existing `require_active_school_scope`
    /// tests above.
    #[test]
    fn authorize_capability_denies_a_role_held_only_in_a_different_school() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        let other_school = school::create(&conn, "Other School").unwrap();
        user::add_school_membership(&conn, &u.id, &other_school.id).unwrap();
        role_repo::grant(&conn, &u.id, &other_school.id, role_repo::REGISTRAR).unwrap();
        // The session above is scoped to `s`, not `other_school`.
        let _ = &s;

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_capability_denies_once_the_role_is_removed_mid_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::REGISTRAR).unwrap();
        assert!(authorize_capability(&conn, &sessions, Capability::ManageLearners).is_ok());

        // Revoke the role directly (no revoke() API exists yet -- this
        // milestone doesn't need one — but the DB is the source of
        // truth, so removing the row must take effect immediately,
        // exactly like an independently-revoked session already does).
        conn.execute(
            "DELETE FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 AND role = ?3",
            (&u.id, &s.id, role_repo::REGISTRAR),
        )
        .unwrap();

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn authorize_capability_fails_closed_for_an_expired_session_even_with_an_allowed_role() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        role_repo::grant(&conn, &u.id, &s.id, role_repo::REGISTRAR).unwrap();
        let session_id = session_repo::insert(&conn, &u.id, &s.id, "+8 hours").unwrap();
        let past = SystemTime::now() - Duration::from_secs(1);
        sessions.set(Session {
            id: session_id,
            user_id: u.id,
            school_id: s.id,
            created_at: past - SESSION_DURATION,
            expires_at: past,
            last_activity_at: past,
        });

        assert!(matches!(
            authorize_capability(&conn, &sessions, Capability::ManageLearners),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn bootstrap_installation_grants_the_founding_user_all_three_starting_roles() {
        let mut conn = open_test_db();
        let sessions = SessionManager::new();

        let session = bootstrap_installation(
            &mut conn,
            &sessions,
            "Rizal Elementary",
            "ana.cruz",
            "password",
            "Ana Cruz",
        )
        .unwrap();

        for role in [
            role_repo::TEACHER,
            role_repo::REGISTRAR,
            role_repo::SCHOOL_HEAD,
        ] {
            assert!(
                role_repo::has_any_role(&conn, &session.user_id, &session.school_id, &[role])
                    .unwrap(),
                "founding user must hold the {role} role"
            );
        }
        // Direct proof the representative gate actually accepts this
        // account, not just that role rows exist.
        assert!(authorize_capability(&conn, &sessions, Capability::ManageLearners).is_ok());
    }

    /// Regression proof for the "existing authorized workflow keeps
    /// working" completion criterion: a Teacher-only session (the
    /// default for anyone added via `add_user_to_school`, proven
    /// separately in `commands::user`'s own scope) must still pass the
    /// unrelated, unchanged `require_active_school_scope` check that
    /// `list_learners_by_school`/`get_learner` rely on -- RBAC only
    /// narrows the one gated capability, never read access generally.
    #[test]
    fn a_teacher_only_session_still_passes_the_ordinary_school_scope_check() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::TEACHER).unwrap();

        assert_eq!(sessions.require_active_school_scope(&conn).unwrap(), s.id);
    }

    // ---- Teacher Load / Class Schedule Foundation ----

    #[test]
    fn authorize_capability_allows_a_school_head_session_for_manage_teaching_assignments() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();

        assert!(
            authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments).is_ok()
        );
    }

    #[test]
    fn authorize_capability_denies_a_teacher_for_manage_teaching_assignments() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::TEACHER).unwrap();

        let result = authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_capability_denies_a_registrar_for_manage_teaching_assignments() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::REGISTRAR).unwrap();

        let result = authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_teacher_load_allows_a_teacher_to_view_their_own() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (_s, u) = setup_member_with_session(&conn, &sessions);

        assert!(authorize_view_teacher_load(&conn, &sessions, &u.id).is_ok());
    }

    #[test]
    fn authorize_view_teacher_load_denies_a_teacher_viewing_a_colleagues_load() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, _u) = setup_member_with_session(&conn, &sessions);
        let colleague = user::create_user(&conn, "colleague", "password", "Colleague").unwrap();
        user::add_school_membership(&conn, &colleague.id, &s.id).unwrap();

        let result = authorize_view_teacher_load(&conn, &sessions, &colleague.id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_teacher_load_allows_a_school_head_to_view_a_colleagues_load() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &u.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let colleague = user::create_user(&conn, "colleague", "password", "Colleague").unwrap();
        user::add_school_membership(&conn, &colleague.id, &s.id).unwrap();

        assert!(authorize_view_teacher_load(&conn, &sessions, &colleague.id).is_ok());
    }

    #[test]
    fn authorize_view_teacher_load_fails_closed_with_no_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        let result = authorize_view_teacher_load(&conn, &sessions, "someone");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_teacher_load_denies_a_school_head_from_a_different_school() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, head) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &head.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_teacher =
            user::create_user(&conn, "other.teacher", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &other_school.id).unwrap();

        let result = authorize_view_teacher_load(&conn, &sessions, &other_teacher.id);

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "a School Head's authority does not extend to a teacher outside their own school"
        );
    }

    #[test]
    fn authorize_adviser_of_section_allows_the_sections_current_adviser() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, u) = setup_member_with_session(&conn, &sessions);
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        section_advisory_repo::assign(&conn, &s.id, &sec.id, &u.id, "2026-06-01").unwrap();

        assert!(authorize_adviser_of_section(&conn, &sessions, &sec.id, "2026-08-29").is_ok());
    }

    #[test]
    fn authorize_adviser_of_section_denies_a_teacher_who_does_not_advise_it() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, _u) = setup_member_with_session(&conn, &sessions);
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let adviser = user::create_user(&conn, "adviser", "password", "The Adviser").unwrap();
        user::add_school_membership(&conn, &adviser.id, &s.id).unwrap();
        section_advisory_repo::assign(&conn, &s.id, &sec.id, &adviser.id, "2026-06-01").unwrap();

        let result = authorize_adviser_of_section(&conn, &sessions, &sec.id, "2026-08-29");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_adviser_of_section_allows_a_school_head_even_without_advising_it() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, head) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &head.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let adviser = user::create_user(&conn, "adviser", "password", "The Adviser").unwrap();
        user::add_school_membership(&conn, &adviser.id, &s.id).unwrap();
        section_advisory_repo::assign(&conn, &s.id, &sec.id, &adviser.id, "2026-06-01").unwrap();

        assert!(authorize_adviser_of_section(&conn, &sessions, &sec.id, "2026-08-29").is_ok());
    }

    #[test]
    fn authorize_adviser_of_section_denies_a_section_with_no_adviser_assigned_yet() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, _u) = setup_member_with_session(&conn, &sessions);
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();

        let result = authorize_adviser_of_section(&conn, &sessions, &sec.id, "2026-08-29");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_adviser_of_section_fails_closed_with_no_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        let result = authorize_adviser_of_section(&conn, &sessions, "some-section", "2026-08-29");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_adviser_of_section_denies_a_school_head_for_a_different_schools_section() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, head) = setup_member_with_session(&conn, &sessions);
        role_repo::grant(&conn, &head.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_sec =
            section::create(&conn, &other_school.id, "2026-2027", "7", "Rizal").unwrap();

        let result = authorize_adviser_of_section(&conn, &sessions, &other_sec.id, "2026-08-29");

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "a School Head's authority in their own school must not extend to a different school's section"
        );
    }

    // ---- Wave 3I: admin_reset_teacher_password (ADR-0061) ----

    fn setup_school_head_and_teacher(
        conn: &Connection,
        sessions: &SessionManager,
    ) -> (crate::repository::school::School, user::User) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let head =
            user::create_user(conn, "corazon.santos", "head-password", "Corazon Santos").unwrap();
        user::add_school_membership(conn, &head.id, &s.id).unwrap();
        role_repo::grant(conn, &head.id, &s.id, role_repo::SCHOOL_HEAD).unwrap();
        login(conn, sessions, "corazon.santos", "head-password", &s.id).unwrap();

        let teacher = user::create_user(conn, "ana.cruz", "old-password", "Ana Cruz").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        role_repo::grant(conn, &teacher.id, &s.id, role_repo::TEACHER).unwrap();

        (s, teacher)
    }

    #[test]
    fn admin_reset_teacher_password_succeeds_for_a_school_head_resetting_a_same_school_teacher() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (_s, teacher) = setup_school_head_and_teacher(&conn, &sessions);

        let result =
            admin_reset_teacher_password(&conn, &sessions, &teacher.id, "brand-new-password");

        assert!(result.unwrap());
        assert!(matches!(
            user::verify_credentials(&conn, "ana.cruz", "old-password"),
            Err(AppError::AuthenticationFailed)
        ));
        assert!(user::verify_credentials(&conn, "ana.cruz", "brand-new-password").is_ok());
    }

    #[test]
    fn admin_reset_teacher_password_records_a_distinct_attributable_audit_event() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, teacher) = setup_school_head_and_teacher(&conn, &sessions);
        let head_id = sessions.current().unwrap().user_id;

        admin_reset_teacher_password(&conn, &sessions, &teacher.id, "brand-new-password").unwrap();

        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        let reset_entry = entries
            .iter()
            .find(|e| e.event_type == AuditEventType::PasswordResetByAdmin)
            .expect("a password_reset_by_admin event must be recorded");
        assert_eq!(
            reset_entry.user_id,
            Some(teacher.id),
            "the event's subject is the account whose password changed"
        );
        assert_eq!(reset_entry.username, "ana.cruz");
        assert_eq!(
            reset_entry.actor_user_id,
            Some(head_id),
            "the event's actor is the School Head who performed the reset"
        );
        assert_eq!(
            reset_entry.actor_username,
            Some("corazon.santos".to_string())
        );
    }

    #[test]
    fn admin_reset_teacher_password_clears_a_lockout_on_the_target_account() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (_s, teacher) = setup_school_head_and_teacher(&conn, &sessions);
        for _ in 0..user::MAX_FAILED_LOGIN_ATTEMPTS {
            let _ = user::verify_credentials(&conn, "ana.cruz", "wrong-guess");
        }
        assert!(matches!(
            user::verify_credentials(&conn, "ana.cruz", "old-password"),
            Err(AppError::AccountLocked)
        ));

        admin_reset_teacher_password(&conn, &sessions, &teacher.id, "brand-new-password").unwrap();

        assert!(
            user::verify_credentials(&conn, "ana.cruz", "brand-new-password").is_ok(),
            "a locked-out account is very often exactly why the reset was requested -- the \
             teacher must not stay rejected by the old lockout after a successful reset"
        );
    }

    #[test]
    fn admin_reset_teacher_password_denies_a_teacher_only_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let teacher_a = user::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(&conn, &teacher_a.id, &s.id).unwrap();
        role_repo::grant(&conn, &teacher_a.id, &s.id, role_repo::TEACHER).unwrap();
        login(&conn, &sessions, "teacher.a", "password", &s.id).unwrap();
        let teacher_b = user::create_user(&conn, "teacher.b", "old-password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &teacher_b.id, &s.id).unwrap();

        let result = admin_reset_teacher_password(&conn, &sessions, &teacher_b.id, "new-password");

        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "an ordinary Teacher must not be able to reset a colleague's password"
        );
        assert!(user::verify_credentials(&conn, "teacher.b", "old-password").is_ok());
    }

    #[test]
    fn admin_reset_teacher_password_fails_closed_with_no_session() {
        let conn = open_test_db();
        let sessions = SessionManager::new();

        let result = admin_reset_teacher_password(&conn, &sessions, "some-user-id", "new-password");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn admin_reset_teacher_password_returns_false_without_writing_an_audit_event_for_an_unknown_target(
    ) {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, _teacher) = setup_school_head_and_teacher(&conn, &sessions);

        let result =
            admin_reset_teacher_password(&conn, &sessions, "does-not-exist", "new-password");

        assert!(!result.unwrap());
        let entries = audit_log_repo::list_for_school(&conn, &s.id, 10).unwrap();
        assert!(entries
            .iter()
            .all(|e| e.event_type != AuditEventType::PasswordResetByAdmin));
    }

    #[test]
    fn admin_reset_teacher_password_returns_false_for_a_target_in_a_different_school_without_leaking_which_case_it_was(
    ) {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (_s, _teacher) = setup_school_head_and_teacher(&conn, &sessions);
        let other_school = school::create(&conn, "Other School").unwrap();
        let outsider = user::create_user(&conn, "outsider", "old-password", "Outsider").unwrap();
        user::add_school_membership(&conn, &outsider.id, &other_school.id).unwrap();

        let not_found_result =
            admin_reset_teacher_password(&conn, &sessions, "does-not-exist", "new-password");
        let wrong_school_result =
            admin_reset_teacher_password(&conn, &sessions, &outsider.id, "new-password");

        assert_eq!(
            not_found_result.unwrap(),
            wrong_school_result.unwrap(),
            "a nonexistent target and a real target in a different school must be \
             indistinguishable, so neither can be used to enumerate accounts in another school"
        );
        assert!(
            user::verify_credentials(&conn, "outsider", "old-password").is_ok(),
            "a School Head's authority must not extend to a different school's member"
        );
    }

    #[test]
    fn admin_reset_teacher_password_rejects_a_target_with_memberships_outside_the_actors_school() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let (s, teacher) = setup_school_head_and_teacher(&conn, &sessions);
        let other_school = school::create(&conn, "Other School").unwrap();
        user::add_school_membership(&conn, &teacher.id, &other_school.id).unwrap();

        let result =
            admin_reset_teacher_password(&conn, &sessions, &teacher.id, "brand-new-password");

        assert!(!result.unwrap());
        assert!(user::verify_credentials(&conn, "ana.cruz", "old-password").is_ok());
        assert!(audit_log_repo::list_for_school(&conn, &s.id, 10)
            .unwrap()
            .iter()
            .all(|entry| entry.event_type != AuditEventType::PasswordResetByAdmin));
    }

    #[test]
    fn admin_reset_teacher_password_revokes_every_existing_target_session() {
        let conn = open_test_db();
        let head_sessions = SessionManager::new();
        let (s, teacher) = setup_school_head_and_teacher(&conn, &head_sessions);
        let teacher_sessions = SessionManager::new();
        login(&conn, &teacher_sessions, "ana.cruz", "old-password", &s.id).unwrap();

        admin_reset_teacher_password(&conn, &head_sessions, &teacher.id, "brand-new-password")
            .unwrap();

        assert!(matches!(
            teacher_sessions.require_active_session(&conn),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn admin_reset_teacher_password_rolls_back_password_sessions_and_audit_together() {
        let conn = open_test_db();
        let head_sessions = SessionManager::new();
        let (s, teacher) = setup_school_head_and_teacher(&conn, &head_sessions);
        let teacher_sessions = SessionManager::new();
        login(&conn, &teacher_sessions, "ana.cruz", "old-password", &s.id).unwrap();
        conn.execute_batch(
            "CREATE TRIGGER reject_admin_reset_audit \
             BEFORE INSERT ON audit_log \
             WHEN NEW.event_type = 'password_reset_by_admin' \
             BEGIN SELECT RAISE(ABORT, 'injected audit failure'); END;",
        )
        .unwrap();

        let result =
            admin_reset_teacher_password(&conn, &head_sessions, &teacher.id, "brand-new-password");

        assert!(result.is_err());
        assert!(user::verify_credentials(&conn, "ana.cruz", "old-password").is_ok());
        assert!(teacher_sessions.require_active_session(&conn).is_ok());
        assert!(audit_log_repo::list_for_school(&conn, &s.id, 10)
            .unwrap()
            .iter()
            .all(|entry| entry.event_type != AuditEventType::PasswordResetByAdmin));
    }
}
