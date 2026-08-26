//! Integration proofs for Wave 2B — SF1 Bulk Import Engine. Standing in
//! for `commands::import::{preview_sf1_import, commit_sf1_import}`, same
//! convention as `tests/enrollment.rs`. Uses the synthetic, clearly
//! fictional `.xls` fixtures under `tests/fixtures/` — SYNTHETIC TEST DATA
//! ONLY, no real learner information anywhere in this file.

use std::path::{Path, PathBuf};

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::{AppError, AppResult};
use app_lib::import::sf1::{Sf1ImportPreview, Sf1ImportSummary, Sf1RowAction, Sf1RowCommitPlan};
use app_lib::import::{commit, preview};
use app_lib::repository::{learner, role as role_repo, school, section, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("fixtures")
        .join(name)
}

/// Standing in for `commands::import::preview_sf1_import`.
fn preview_sf1_import_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    path: &Path,
) -> AppResult<Sf1ImportPreview> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageLearners)?;
    preview::build_preview(conn, &school_id, path)
}

/// Standing in for `commands::import::commit_sf1_import`.
fn commit_sf1_import_as_current_session(
    conn: &mut rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    starts_on: &str,
    plans: &[Sf1RowCommitPlan],
) -> AppResult<Sf1ImportSummary> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageLearners)?;
    commit::commit_import(conn, &school_id, section_id, starts_on, plans)
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

fn plans_from_preview(preview: &Sf1ImportPreview) -> Vec<Sf1RowCommitPlan> {
    preview
        .new_rows
        .iter()
        .map(|&row_number| {
            let row = preview
                .rows
                .iter()
                .find(|r| r.row_number == row_number)
                .unwrap();
            Sf1RowCommitPlan {
                row_number,
                given_name: row.given_name.clone().unwrap(),
                family_name: row.family_name.clone().unwrap(),
                lrn: row.lrn.clone(),
                sex: row.sex.clone(),
                action: Sf1RowAction::CreateNewLearner,
            }
        })
        .collect()
}

// ---- Authorization ----

#[test]
fn a_registrar_can_preview_and_commit_an_sf1_import() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let mut conn = conn;
    let sect = section::create(&conn, &school.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);

    let prev =
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls"))
            .unwrap();
    assert!(!prev.new_rows.is_empty());

    let plans = plans_from_preview(&prev);
    let summary =
        commit_sf1_import_as_current_session(&mut conn, &sessions, &sect.id, "2026-06-01", &plans)
            .unwrap();

    assert_eq!(summary.rows_committed, plans.len());
}

#[test]
fn a_school_head_can_preview_and_commit_an_sf1_import() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let mut conn = conn;
    let sect = section::create(&conn, &school.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions = login_with_role_at(&conn, &school.id, "head.a", role_repo::SCHOOL_HEAD);

    let prev =
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls"))
            .unwrap();
    let plans = plans_from_preview(&prev);

    assert!(commit_sf1_import_as_current_session(
        &mut conn,
        &sessions,
        &sect.id,
        "2026-06-01",
        &plans
    )
    .is_ok());
}

#[test]
fn a_teacher_cannot_preview_an_sf1_import() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let sessions = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);

    let result =
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls"));

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_teacher_cannot_commit_an_sf1_import() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let mut conn = conn;
    let sect = section::create(&conn, &school.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions = login_with_role_at(&conn, &school.id, "teacher.a", role_repo::TEACHER);
    let plans = vec![Sf1RowCommitPlan {
        row_number: 4,
        given_name: "Ana".to_string(),
        family_name: "Dela Cruz".to_string(),
        lrn: None,
        sex: None,
        action: Sf1RowAction::CreateNewLearner,
    }];

    let result =
        commit_sf1_import_as_current_session(&mut conn, &sessions, &sect.id, "2026-06-01", &plans);

    assert!(matches!(result, Err(AppError::Unauthorized)));
    assert_eq!(learner::list_by_school(&conn, &school.id).unwrap().len(), 0);
}

#[test]
fn no_session_cannot_preview_or_commit_an_sf1_import() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let mut conn = conn;
    let sect = section::create(&conn, &school.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions = SessionManager::new();

    assert!(matches!(
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls")),
        Err(AppError::Unauthorized)
    ));
    assert!(matches!(
        commit_sf1_import_as_current_session(&mut conn, &sessions, &sect.id, "2026-06-01", &[]),
        Err(AppError::Unauthorized)
    ));
}

// ---- School scope cannot be overridden by imported content ----

#[test]
fn committing_an_import_always_writes_into_the_sessions_own_school_never_a_different_one() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let mut conn = conn;
    let section_a = section::create(&conn, &school_a.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions_a = login_with_role_at(&conn, &school_a.id, "registrar.a", role_repo::REGISTRAR);

    let plans = vec![Sf1RowCommitPlan {
        row_number: 4,
        given_name: "Ana".to_string(),
        family_name: "Dela Cruz".to_string(),
        lrn: Some("123456789012".to_string()),
        sex: Some("F".to_string()),
        action: Sf1RowAction::CreateNewLearner,
    }];

    commit_sf1_import_as_current_session(
        &mut conn,
        &sessions_a,
        &section_a.id,
        "2026-06-01",
        &plans,
    )
    .unwrap();

    assert_eq!(
        learner::list_by_school(&conn, &school_a.id).unwrap().len(),
        1
    );
    assert_eq!(
        learner::list_by_school(&conn, &school_b.id).unwrap().len(),
        0,
        "a session scoped to School A must never be able to write into School B, \
         regardless of anything the imported plan's row data claims"
    );
}

#[test]
fn a_registrar_cannot_commit_into_a_section_belonging_to_a_different_school() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let mut conn = conn;
    let section_b = section::create(&conn, &school_b.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions_a = login_with_role_at(&conn, &school_a.id, "registrar.a", role_repo::REGISTRAR);
    let plans = vec![Sf1RowCommitPlan {
        row_number: 4,
        given_name: "Ana".to_string(),
        family_name: "Dela Cruz".to_string(),
        lrn: None,
        sex: None,
        action: Sf1RowAction::CreateNewLearner,
    }];

    let result = commit_sf1_import_as_current_session(
        &mut conn,
        &sessions_a,
        &section_b.id,
        "2026-06-01",
        &plans,
    );

    assert!(result.is_err());
    assert_eq!(
        learner::list_by_school(&conn, &school_a.id).unwrap().len(),
        0
    );
}

// ---- Re-import across the authorization boundary ----

#[test]
fn re_importing_the_same_file_and_resolving_matches_as_use_existing_enrolls_without_duplicating() {
    let conn = open_test_db();
    let school = school::create(&conn, "Rizal Elementary").unwrap();
    let mut conn = conn;
    let sect = section::create(&conn, &school.id, "2026-2027", "1", "Sampaguita").unwrap();
    let sessions = login_with_role_at(&conn, &school.id, "registrar.a", role_repo::REGISTRAR);

    let first =
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls"))
            .unwrap();
    let first_plans = plans_from_preview(&first);
    let first_new_count = first_plans.len();
    commit_sf1_import_as_current_session(
        &mut conn,
        &sessions,
        &sect.id,
        "2026-06-01",
        &first_plans,
    )
    .unwrap();
    let learner_count_after_first = learner::list_by_school(&conn, &school.id).unwrap().len();

    let second =
        preview_sf1_import_as_current_session(&conn, &sessions, &fixture("sf1_synthetic_main.xls"))
            .unwrap();
    assert_eq!(
        second.new_rows.len(),
        0,
        "nothing already imported should be offered as new again"
    );

    // Resolve every exact-LRN match and every suspected duplicate as
    // "use existing" -- the reviewer confirming these are the same
    // learners, not new ones.
    let mut second_plans: Vec<Sf1RowCommitPlan> = Vec::new();
    for m in second
        .exact_matches
        .iter()
        .chain(second.needs_review.iter())
    {
        let row = second
            .rows
            .iter()
            .find(|r| r.row_number == m.row_number)
            .unwrap();
        second_plans.push(Sf1RowCommitPlan {
            row_number: m.row_number,
            given_name: row.given_name.clone().unwrap(),
            family_name: row.family_name.clone().unwrap(),
            lrn: row.lrn.clone(),
            sex: row.sex.clone(),
            action: Sf1RowAction::EnrollExistingLearner {
                learner_id: m.candidates[0].id.clone(),
            },
        });
    }
    assert_eq!(second_plans.len(), first_new_count);

    let summary = commit_sf1_import_as_current_session(
        &mut conn,
        &sessions,
        &sect.id,
        "2026-06-01",
        &second_plans,
    )
    .unwrap();

    assert_eq!(summary.new_learners_created, 0);
    assert_eq!(
        learner::list_by_school(&conn, &school.id).unwrap().len(),
        learner_count_after_first,
        "re-importing and resolving everything as use-existing must not create any new learner"
    );
}
