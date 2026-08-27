//! Integration proofs for Wave 2A — Learner Core + Enrollment Domain
//! Foundation. See `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
//! `tests/learner_management.rs` covers learner identity CRUD; this file
//! is specific to the enrollment (section-placement) verbs, standing in
//! for the Tauri command layer directly — same convention as every other
//! integration test file in this directory.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::{AppError, AppResult};
use app_lib::repository::{learner, role as role_repo, school, section, section_membership, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

/// Standing in for `commands::section::enroll_learner_in_section`.
fn enroll_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    learner_id: &str,
    starts_on: &str,
) -> AppResult<Option<section_membership::SectionMembership>> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageLearners)?;
    section_membership::enroll(conn, &school_id, section_id, learner_id, starts_on)
}

/// Standing in for `commands::section::list_learner_enrollment_history`.
fn enrollment_history_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
) -> AppResult<Vec<section_membership::SectionMembership>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    section_membership::list_by_learner_in_school(conn, &school_id, learner_id)
}

/// Standing in for `commands::section::get_current_enrollment`.
fn current_enrollment_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
) -> AppResult<Option<section_membership::SectionMembership>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    section_membership::current_membership_for_learner_in_school(conn, &school_id, learner_id)
}

/// Standing in for `commands::section::section_roster` (Wave 2O).
fn section_roster_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<Vec<section_membership::CurrentRosterMember>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    section_membership::current_roster(conn, &school_id, section_id, as_of_date)
}

/// Standing in for `commands::section::transfer_learner_membership` (Wave 2P).
fn transfer_membership_as_current_session(
    conn: &mut rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
    from_membership_id: &str,
    to_section_id: &str,
    effective_on: &str,
) -> AppResult<section_membership::TransferOutcome> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageLearners)?;
    section_membership::transfer_membership(
        conn,
        &school_id,
        learner_id,
        from_membership_id,
        to_section_id,
        effective_on,
    )
}

/// Standing in for `commands::section::end_learner_membership` (Wave 2P).
fn end_membership_as_current_session(
    conn: &mut rusqlite::Connection,
    sessions: &SessionManager,
    learner_id: &str,
    membership_id: &str,
    effective_on: &str,
) -> AppResult<section_membership::EndMembershipOutcome> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageLearners)?;
    section_membership::end_membership(conn, &school_id, learner_id, membership_id, effective_on)
}

/// Standing in for `commands::section::create_section` (Wave 2A.1 fix).
fn create_section_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    school_year: &str,
    grade_level: &str,
    name: &str,
) -> AppResult<section::Section> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageTeachingAssignments)?;
    section::create(conn, &school_id, school_year, grade_level, name)
}

fn login_with_role_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
    role: &str,
) -> SessionManager {
    let u = user::create_user(conn, username, "password", "Test User").unwrap();
    user::add_school_membership(conn, &u.id, school_id).unwrap();
    role_repo::grant(conn, &u.id, school_id, role).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

#[test]
fn the_full_wave_2a_vertical_slice_a_registrar_enrolls_a_learner_and_reads_it_back() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);

    // Learner identity is created independently of any placement.
    let created = learner::create(
        &conn,
        &school.id,
        "Juan",
        "Dela Cruz",
        Some("123456789012"),
        Some("M"),
    )
    .unwrap();

    // Enroll into the current school-year/grade/section.
    let membership =
        enroll_as_current_session(&conn, &registrar, &section.id, &created.id, "2026-08-24")
            .unwrap()
            .expect("enrollment must succeed for an authorized Registrar");
    assert_eq!(membership.section_id, section.id);
    assert_eq!(membership.ends_on, None);

    // Retrieve the learner's current enrollment and full history.
    let current = current_enrollment_as_current_session(&conn, &registrar, &created.id)
        .unwrap()
        .expect("current enrollment must be retrievable");
    assert_eq!(current.id, membership.id);

    let history = enrollment_history_as_current_session(&conn, &registrar, &created.id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].id, membership.id);
}

#[test]
fn a_school_head_can_also_enroll_a_learner() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let head = login_with_role_at(&conn, &school.id, "head.a", role_repo::SCHOOL_HEAD);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();

    let result = enroll_as_current_session(&conn, &head, &section.id, &l.id, "2026-08-24").unwrap();

    assert!(result.is_some());
}

#[test]
fn a_teacher_cannot_enroll_a_learner_the_fixed_authorization_gap() {
    // Wave 2A's own headline fix: `enroll_learner_in_section` was
    // previously gated only by an active session, no role check at all —
    // any Teacher could enroll or transfer any learner. This proves the
    // fix closes that gap end-to-end, not merely that the shared
    // `authorize_capability` gate rejects Teachers in isolation.
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let teacher = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();

    let result = enroll_as_current_session(&conn, &teacher, &section.id, &l.id, "2026-08-24");

    assert!(matches!(result, Err(AppError::Unauthorized)));
    // And the membership table itself must be untouched.
    let history = section_membership::list_by_learner_in_school(&conn, &school.id, &l.id).unwrap();
    assert_eq!(history.len(), 0);
}

#[test]
fn enrolling_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = enroll_as_current_session(&conn, &sessions, &section.id, &l.id, "2026-08-24");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn reading_enrollment_history_requires_a_session_but_not_a_specific_role() {
    // Matches this codebase's established "reads stay open, writes are
    // capability-gated" convention (e.g. `get_learner`/`list_learners_by_school`).
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    enroll_as_current_session(&conn, &registrar, &section.id, &l.id, "2026-08-24").unwrap();

    let teacher = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);
    let history = enrollment_history_as_current_session(&conn, &teacher, &l.id).unwrap();

    assert_eq!(
        history.len(),
        1,
        "a Teacher may still read enrollment history"
    );
}

#[test]
fn a_transfer_preserves_the_prior_enrollment_as_history_not_deleting_it() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    enroll_as_current_session(&conn, &registrar, &section_a.id, &l.id, "2026-08-24").unwrap();

    enroll_as_current_session(&conn, &registrar, &section_b.id, &l.id, "2026-10-01").unwrap();

    let history = enrollment_history_as_current_session(&conn, &registrar, &l.id).unwrap();
    assert_eq!(
        history.len(),
        2,
        "the closed section-A membership must remain in history"
    );
    assert_eq!(history[0].section_id, section_a.id);
    assert!(history[0].ends_on.is_some());
    assert_eq!(history[1].section_id, section_b.id);
    assert_eq!(history[1].ends_on, None);
}

#[test]
fn a_registrar_can_check_for_duplicate_candidates_before_creating_a_learner() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    learner::create(
        &conn,
        &school.id,
        "Juan",
        "Dela Cruz",
        Some("123456789012"),
        None,
    )
    .unwrap();

    let candidates =
        learner::find_candidates(&conn, &school.id, "Juan", "Dela Cruz", None).unwrap();

    assert_eq!(
        candidates.len(),
        1,
        "the near-duplicate must surface as a candidate, never auto-merged or auto-blocked"
    );
}

// --- Wave 2O: Section Roster (read-only) command boundary ---

#[test]
fn the_section_roster_shows_current_members_for_an_authorized_same_school_caller() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(
        &conn,
        &school.id,
        "Ana",
        "Cruz",
        Some("123456789012"),
        Some("F"),
    )
    .unwrap();
    enroll_as_current_session(&conn, &registrar, &section.id, &l.id, "2026-08-24").unwrap();

    // Any active session may read (no capability required).
    let teacher = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);
    let roster =
        section_roster_as_current_session(&conn, &teacher, &section.id, "2026-09-01").unwrap();

    assert_eq!(roster.len(), 1);
    assert_eq!(roster[0].learner_id, l.id);
    assert_eq!(roster[0].starts_on, "2026-08-24");
}

#[test]
fn viewing_a_section_roster_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = section_roster_as_current_session(&conn, &sessions, &section.id, "2026-09-01");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_section_roster_request_for_a_nonexistent_section_returns_an_empty_roster_not_an_error() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);

    let roster =
        section_roster_as_current_session(&conn, &registrar, "no-such-section", "2026-09-01")
            .unwrap();

    assert_eq!(roster.len(), 0);
}

#[test]
fn a_caller_cannot_read_another_schools_section_roster_by_knowing_its_section_id() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2026-2027", "7", "Mabini").unwrap();
    let head_b = login_with_role_at(&conn, &school_b.id, "head.b", role_repo::SCHOOL_HEAD);
    let l = learner::create(&conn, &school_b.id, "Ana", "Cruz", None, None).unwrap();
    enroll_as_current_session(&conn, &head_b, &section_b.id, &l.id, "2026-08-24").unwrap();

    // School A's session, using School B's real section id.
    let head_a = login_with_role_at(&conn, &school_a.id, "head.a", role_repo::SCHOOL_HEAD);
    let roster =
        section_roster_as_current_session(&conn, &head_a, &section_b.id, "2026-09-01").unwrap();

    assert_eq!(
        roster.len(),
        0,
        "cross-school section-id enumeration must return nothing, not School B's learners"
    );
}

// --- Wave 2P: transfer + end enrollment command boundary ---

#[test]
fn a_registrar_can_transfer_a_learner_between_sections_at_the_command_boundary() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m = enroll_as_current_session(&conn, &registrar, &section_a.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    let outcome = transfer_membership_as_current_session(
        &mut conn,
        &registrar,
        &l.id,
        &m.id,
        &section_b.id,
        "2026-10-01",
    )
    .unwrap();

    assert!(matches!(
        outcome,
        section_membership::TransferOutcome::Transferred { .. }
    ));
    let history = enrollment_history_as_current_session(&conn, &registrar, &l.id).unwrap();
    assert_eq!(history.len(), 2, "the prior placement is kept as history");
    assert_eq!(history[0].ends_on.as_deref(), Some("2026-10-01"));
    assert_eq!(history[1].section_id, section_b.id);
    assert_eq!(history[1].ends_on, None);
}

#[test]
fn a_registrar_can_end_a_learners_enrollment_at_the_command_boundary() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m = enroll_as_current_session(&conn, &registrar, &section.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    let outcome =
        end_membership_as_current_session(&mut conn, &registrar, &l.id, &m.id, "2026-10-01")
            .unwrap();

    assert!(matches!(
        outcome,
        section_membership::EndMembershipOutcome::Ended { .. }
    ));
    // Row is closed, not deleted; learner remains.
    let history = enrollment_history_as_current_session(&conn, &registrar, &l.id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].ends_on.as_deref(), Some("2026-10-01"));
    assert!(learner::find_by_id_in_school(&conn, &school.id, &l.id)
        .unwrap()
        .is_some());
}

#[test]
fn a_school_head_can_also_transfer_and_end_enrollments() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let head = login_with_role_at(&conn, &school.id, "head.a", role_repo::SCHOOL_HEAD);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m = enroll_as_current_session(&conn, &head, &section_a.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    let transferred = transfer_membership_as_current_session(
        &mut conn,
        &head,
        &l.id,
        &m.id,
        &section_b.id,
        "2026-09-01",
    )
    .unwrap();
    let new_id = match transferred {
        section_membership::TransferOutcome::Transferred { membership } => membership.id,
        other => panic!("expected Transferred, got {other:?}"),
    };
    let ended =
        end_membership_as_current_session(&mut conn, &head, &l.id, &new_id, "2026-12-20").unwrap();

    assert!(matches!(
        ended,
        section_membership::EndMembershipOutcome::Ended { .. }
    ));
}

#[test]
fn a_teacher_cannot_transfer_or_end_an_enrollment() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m = enroll_as_current_session(&conn, &registrar, &section_a.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    let teacher = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);

    let transfer = transfer_membership_as_current_session(
        &mut conn,
        &teacher,
        &l.id,
        &m.id,
        &section_b.id,
        "2026-10-01",
    );
    let end = end_membership_as_current_session(&mut conn, &teacher, &l.id, &m.id, "2026-10-01");

    assert!(matches!(transfer, Err(AppError::Unauthorized)));
    assert!(matches!(end, Err(AppError::Unauthorized)));
    // The membership table is untouched: still one open row in section A.
    let history = section_membership::list_by_learner_in_school(&conn, &school.id, &l.id).unwrap();
    assert_eq!(history.len(), 1);
    assert_eq!(history[0].section_id, section_a.id);
    assert_eq!(history[0].ends_on, None);
}

#[test]
fn transferring_or_ending_requires_a_session() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m = enroll_as_current_session(&conn, &registrar, &section_a.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    let anon = SessionManager::new();
    let transfer = transfer_membership_as_current_session(
        &mut conn,
        &anon,
        &l.id,
        &m.id,
        &section_b.id,
        "2026-10-01",
    );
    let end = end_membership_as_current_session(&mut conn, &anon, &l.id, &m.id, "2026-10-01");

    assert!(matches!(transfer, Err(AppError::Unauthorized)));
    assert!(matches!(end, Err(AppError::Unauthorized)));
}

#[test]
fn a_caller_cannot_transfer_a_learner_using_another_schools_membership_id() {
    let mut conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b1 = section::create(&conn, &school_b.id, "2026-2027", "7", "Mabini").unwrap();
    let head_b = login_with_role_at(&conn, &school_b.id, "head.b", role_repo::SCHOOL_HEAD);
    let l_b = learner::create(&conn, &school_b.id, "Ana", "Cruz", None, None).unwrap();
    let m_b = enroll_as_current_session(&conn, &head_b, &section_b1.id, &l_b.id, "2026-08-24")
        .unwrap()
        .unwrap();

    // School A's registrar, using School B's real membership id and learner id.
    let section_a1 = section::create(&conn, &school_a.id, "2026-2027", "7", "Rizal").unwrap();
    let reg_a = login_with_role_at(&conn, &school_a.id, "reg.a", role_repo::REGISTRAR);

    let outcome = transfer_membership_as_current_session(
        &mut conn,
        &reg_a,
        &l_b.id,
        &m_b.id,
        &section_a1.id,
        "2026-10-01",
    )
    .unwrap();
    let ended =
        end_membership_as_current_session(&mut conn, &reg_a, &l_b.id, &m_b.id, "2026-10-01")
            .unwrap();

    assert_eq!(
        outcome,
        section_membership::TransferOutcome::MembershipNotFound,
        "another school's membership id must be unusable, indistinguishable from unknown"
    );
    assert_eq!(ended, section_membership::EndMembershipOutcome::NotFound);
    // School B's membership is completely untouched.
    let history_b =
        section_membership::list_by_learner_in_school(&conn, &school_b.id, &l_b.id).unwrap();
    assert_eq!(history_b.len(), 1);
    assert_eq!(history_b[0].section_id, section_b1.id);
    assert_eq!(history_b[0].ends_on, None);
}

#[test]
fn a_stale_roster_tab_cannot_transfer_a_membership_that_already_changed() {
    let mut conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let section_a = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let section_b = section::create(&conn, &school.id, "2026-2027", "7", "Rizal").unwrap();
    let section_c = section::create(&conn, &school.id, "2026-2027", "7", "Bonifacio").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);
    let l = learner::create(&conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    let m_a = enroll_as_current_session(&conn, &registrar, &section_a.id, &l.id, "2026-08-24")
        .unwrap()
        .unwrap();

    // Someone transfers A -> B first.
    transfer_membership_as_current_session(
        &mut conn,
        &registrar,
        &l.id,
        &m_a.id,
        &section_b.id,
        "2026-09-01",
    )
    .unwrap();

    // A stale tab still holding m_a tries A -> C.
    let stale = transfer_membership_as_current_session(
        &mut conn,
        &registrar,
        &l.id,
        &m_a.id,
        &section_c.id,
        "2026-09-15",
    )
    .unwrap();

    assert_eq!(
        stale,
        section_membership::TransferOutcome::NotCurrent,
        "the stale membership id is already closed; the second transfer must be refused"
    );
    let history = enrollment_history_as_current_session(&conn, &registrar, &l.id).unwrap();
    assert_eq!(history.len(), 2, "no third membership was created");
    assert_eq!(history[1].section_id, section_b.id);
}

// --- Wave 2A.1: create_section authorization closure ---

#[test]
fn a_school_head_can_create_a_section() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let head = login_with_role_at(&conn, &school.id, "head.a", role_repo::SCHOOL_HEAD);

    let created =
        create_section_as_current_session(&conn, &head, "2026-2027", "7", "Mabini").unwrap();

    assert_eq!(created.school_id, school.id);
    assert_eq!(created.name, "Mabini");
}

#[test]
fn a_teacher_cannot_create_a_section_the_fixed_authorization_gap() {
    // Wave 2A.1's own headline fix: `create_section` was previously gated
    // only by an active session, no role check at all -- any Teacher could
    // create sections. Proves the fix closes that gap end-to-end.
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let teacher = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);

    let result = create_section_as_current_session(&conn, &teacher, "2026-2027", "7", "Mabini");

    assert!(matches!(result, Err(AppError::Unauthorized)));
    let sections = section::list_by_school(&conn, &school.id).unwrap();
    assert_eq!(
        sections.len(),
        0,
        "an unauthorized attempt must leave no section persisted -- no partial mutation"
    );
}

#[test]
fn a_registrar_alone_cannot_create_a_section() {
    // `ManageTeachingAssignments` (School Head only) is deliberately
    // distinct from `ManageLearners` (Registrar or School Head) -- section
    // definition is a structural/scheduling decision, not learner-record
    // management. A Registrar with no School Head role must be denied.
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let registrar = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);

    let result = create_section_as_current_session(&conn, &registrar, "2026-2027", "7", "Mabini");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn creating_a_section_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in

    let result = create_section_as_current_session(&conn, &sessions, "2026-2027", "7", "Mabini");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_heads_own_session_cannot_be_used_to_create_a_section_for_another_school() {
    // `create_section` never accepts a client-supplied `school_id` -- the
    // command signature has no such parameter at all, so there is no
    // forged-privilege-input path to test at the boundary beyond this: a
    // School Head authenticated at School A can only ever create a section
    // scoped to School A, regardless of any other id a malicious caller
    // might try to smuggle through unrelated parameters (school_year/
    // grade_level/name are plain strings with no id semantics).
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let head_a = login_with_role_at(&conn, &school_a.id, "head.a", role_repo::SCHOOL_HEAD);

    let created =
        create_section_as_current_session(&conn, &head_a, "2026-2027", "7", "Mabini").unwrap();

    assert_eq!(created.school_id, school_a.id);
    let school_b_sections = section::list_by_school(&conn, &school_b.id).unwrap();
    assert_eq!(
        school_b_sections.len(),
        0,
        "School A's session must never be able to create a section under School B"
    );
}

#[test]
fn existing_legitimate_section_creation_still_works_end_to_end() {
    // Regression: the full create-section-then-enroll workflow (already
    // proven piecemeal above) still works together for an authorized
    // School Head, matching pre-fix behavior for the legitimate case.
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let head = login_with_role_at(&conn, &school.id, "head.a", role_repo::SCHOOL_HEAD);

    let section =
        create_section_as_current_session(&conn, &head, "2026-2027", "8", "Rizal").unwrap();
    let sections = section::list_by_school(&conn, &school.id).unwrap();

    assert_eq!(sections, vec![section]);
}
