use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::section::{self, Section};
use crate::repository::section_membership::{
    self, CorrectPlacementOutcome, CurrentRosterMember, EndMembershipOutcome, EnrollOutcome,
    EnrollmentCandidate, SectionMembership, TransferOutcome,
};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::learner::list_learners_by_school`.
#[tauri::command]
pub fn list_sections_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Section>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section::list_by_school(&conn, &school_id)
}

/// Gated by `ManageTeachingAssignments` -- defining what sections/classes
/// exist for a school year is a structural scheduling-authority decision,
/// the same domain `docs/adr/0039-teacher-load-class-schedule-foundation.md`
/// already scoped to School Head only, not `ManageLearners` (which governs
/// an individual learner's own record/enrollment, a Registrar's
/// operational job rather than a School Head's structural one). Previously
/// ungated beyond an active session (any role) -- closed as a real
/// authorization gap found during Wave 2A, fixed in Wave 2A.1. See
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[tauri::command]
pub fn create_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    grade_level: String,
    name: String,
) -> AppResult<Section> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    section::create(&conn, &school_id, &school_year, &grade_level, &name)
}

/// `section_id`/`learner_id` identify WHAT and WHO; `school_id` still comes
/// only from the session. Returns `None`, not an error, when either id
/// doesn't resolve within the caller's own school — see
/// `repository::section_membership::enroll`'s doc comment. Gated by the
/// same `ManageLearners` capability as `create_learner`/`update_learner` --
/// enrolling/transferring a learner is "manage learners," not a separate
/// capability (matches `update_learner`'s own established convention).
/// Previously ungated beyond an active session (any role) -- closed as a
/// real authorization gap during Wave 2A, see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[tauri::command]
pub fn enroll_learner_in_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    starts_on: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enroll(&conn, &school_id, &section_id, &learner_id, &starts_on)
}

/// The current roster for the Section Roster screen. `section_id` is
/// client-supplied the same way `learner_id` already is elsewhere —
/// isolation holds because
/// `repository::section_membership::current_roster` scopes its query by
/// `school_id` AND `section_id` together, so a `section_id` from another
/// school returns an empty roster rather than leaking rows. Ungated beyond
/// an active session, matching this codebase's "reads stay open, writes are
/// capability-gated" convention.
#[tauri::command]
pub fn section_roster(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<CurrentRosterMember>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::current_roster(&conn, &school_id, &section_id, &as_of_date)
}

/// Transfers a currently-enrolled learner to another section, effective
/// `effective_on`. `from_membership_id`/`to_section_id`/`learner_id`
/// identify WHICH placement and WHERE; `school_id` still comes only from the
/// session. Gated by `ManageLearners` -- the same capability as
/// `enroll_learner_in_section`, since "moving a learner between sections" is
/// managing that learner's enrollment (ADR-0042). The structured
/// `TransferOutcome` distinguishes success from stale-roster, unknown
/// membership, unknown/`same` destination, and an effective date before the
/// placement began -- the UI maps each to its own message; none expose SQL,
/// ids, or another school's data.
#[tauri::command]
pub fn transfer_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    from_membership_id: String,
    to_section_id: String,
    effective_on: String,
) -> AppResult<TransferOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::transfer_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &from_membership_id,
        &to_section_id,
        &effective_on,
    )
}

/// Ends a currently-enrolled learner's specific open membership, effective
/// `effective_on`. Sets `ends_on` (never deletes), so the placement history
/// is preserved. `membership_id`/`learner_id` identify WHICH placement;
/// `school_id` comes only from the session. Gated by `ManageLearners`, same
/// as transfer/enroll. The structured `EndMembershipOutcome` distinguishes
/// success from stale-roster, unknown membership, and an effective date
/// before the placement began.
#[tauri::command]
pub fn end_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    membership_id: String,
    effective_on: String,
) -> AppResult<EndMembershipOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::end_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &membership_id,
        &effective_on,
    )
}

/// Every learner in the session's school with their current open
/// membership state, for the Section Roster "Enroll learner" picker.
/// Gated by `ManageLearners` -- a school-wide learner lookup, the same
/// class of read as `find_learner_candidates` (also `ManageLearners`),
/// not the narrow open-read convention. `school_id` is session-derived;
/// the query in `section_membership::enrollable_learners` constrains
/// scope on learners, memberships, and sections together.
#[tauri::command]
pub fn list_enrollable_learners(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<EnrollmentCandidate>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enrollable_learners(&conn, &school_id)
}

/// Places an existing, eligible learner into a section, effective
/// `starts_on`. `learner_id`/`section_id` identify WHO and WHERE;
/// `school_id` comes only from the session. Gated by `ManageLearners`,
/// the same capability as `enroll_learner_in_section` /
/// `transfer_learner_membership` / `end_learner_membership`. The
/// structured `EnrollOutcome` distinguishes success from an unknown or
/// cross-school learner/section, a learner already actively enrolled
/// (transfer required -- never performed here), an overlapping retained
/// membership, an invalid start date, and a backdated start that would
/// strand dependent records. None expose SQL, ids beyond the caller's
/// school, or another school's data.
#[tauri::command]
pub fn enroll_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    section_id: String,
    starts_on: String,
) -> AppResult<EnrollOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enroll_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &section_id,
        &starts_on,
    )
}

/// Corrects a same-day data-entry mistake: `membership_id` was placed in
/// the wrong section *today*, and the strict half-open interval policy
/// (ADR-0042 Wave 2Q addendum) refuses the obvious fix -- a same-day
/// transfer -- because it would create a zero-length interval. This is not
/// a transfer: it updates the *same* row's section in place, exactly once,
/// retaining the original section. `learner_id`/`membership_id`/
/// `to_section_id` identify WHO and WHICH placement; `school_id` comes only
/// from the session. Gated by `ManageLearners`, same as
/// `enroll_learner_membership`/`transfer_learner_membership`. The
/// structured `CorrectPlacementOutcome` distinguishes success from a stale
/// or forged membership, a placement not entered today, an
/// already-corrected double submit, an unknown/same destination, and a
/// dependent-record conflict -- see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s Wave 2S
/// addendum for the full decision record.
#[tauri::command]
pub fn correct_same_day_placement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    membership_id: String,
    to_section_id: String,
    as_of_date: String,
) -> AppResult<CorrectPlacementOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::correct_same_day_placement(
        &mut conn,
        &school_id,
        &learner_id,
        &membership_id,
        &to_section_id,
        &as_of_date,
    )
}

/// A learner's full enrollment (section-placement) history -- ungated
/// beyond an active session, matching `commands::learner::get_learner`'s
/// existing "reads stay open, writes are capability-gated" convention.
#[tauri::command]
pub fn list_learner_enrollment_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Vec<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::list_by_learner_in_school(&conn, &school_id, &learner_id)
}

/// A learner's current (still-open) section placement, if any -- see
/// `repository::section_membership::current_membership_for_learner_in_school`'s
/// doc comment for why this is derived, not a stored flag.
#[tauri::command]
pub fn get_current_enrollment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::current_membership_for_learner_in_school(&conn, &school_id, &learner_id)
}
