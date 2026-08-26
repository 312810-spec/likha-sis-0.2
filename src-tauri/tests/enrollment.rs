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
