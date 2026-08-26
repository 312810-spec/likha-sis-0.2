//! Integration proofs for Wave 3 — Authoritative-Template SF1 Form
//! Engine. Standing in for `commands::formgen::generate_sf1_form`, same
//! convention as `tests/sf1_import.rs`/`tests/reference_geo.rs`. Reads
//! the SAME bytes the real command reads from its bundled Tauri
//! resource (`src-tauri/resources/sf1/sf1_template_synthetic.xlsx`,
//! byte-identical to `tests/fixtures/sf1_template_synthetic.xlsx` —
//! confirmed by both hashing to the same value this module's
//! `formgen::template::SF1_SYNTHETIC_V1` descriptor expects), so this
//! test genuinely exercises authorization → repository read → domain
//! mapping → generation, only substituting how the template bytes are
//! obtained (a direct file read here vs. `AppHandle::path().resolve()`
//! in the real command — this test harness has no live `AppHandle` to
//! call that with; see ADR-0048's "Windows packaging spike" section for
//! the disclosed, still-`NOT_VERIFIED` gap this substitution leaves:
//! the real resource-resolution call is exercised only by inspection,
//! not by this suite).
//!
//! SYNTHETIC TEST DATA ONLY.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppResult;
use app_lib::export::sanitize_filename_component;
use app_lib::formgen::sf1::{Sf1GenerationRequest, Sf1GenerationResult, Sf1LearnerRow};
use app_lib::formgen::umya_adapter::UmyaSf1Generator;
use app_lib::formgen::OfficialFormGenerator;
use app_lib::repository::{learner, role as role_repo, school, section, section_membership, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn template_bytes() -> Vec<u8> {
    std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/sf1_template_synthetic.xlsx"),
    )
    .unwrap()
}

fn login_with_role(
    conn: &rusqlite::Connection,
    username: &str,
    role: &str,
) -> (SessionManager, String) {
    let sch = school::create(conn, "Mabini Elementary (SYNTHETIC)").unwrap();
    let u = user::create_user(conn, username, "password", "Test User").unwrap();
    user::add_school_membership(conn, &u.id, &sch.id).unwrap();
    role_repo::grant(conn, &u.id, &sch.id, role).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", &sch.id).unwrap();
    (sessions, sch.id)
}

/// Standing in for `commands::formgen::generate_sf1_form`.
fn generate_sf1_form_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    as_of_date: &str,
    output_dir: &Path,
) -> AppResult<Option<Sf1GenerationResult>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    // Same capability every other data-scoped command in this crate
    // uses -- `require_active_school_scope` alone is enough for THIS
    // stand-in's authorization proof since the real command only needs
    // an active session (no ManageLearners gate on generation itself,
    // matching how SF2/report-card export are gated -- generation reads
    // already-authorized data, it does not create/modify learner
    // records).
    let _ = Capability::ManageLearners; // referenced for clarity only; not required here

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(conn, &school_id, section_id)? else {
        return Ok(None);
    };
    let roster = section_membership::roster_for_section(conn, &school_id, section_id, as_of_date)?;

    let request = Sf1GenerationRequest {
        school_name: school.name,
        school_year: section.school_year.clone(),
        grade_level: section.grade_level.clone(),
        section_name: section.name.clone(),
        learners: roster
            .into_iter()
            .map(|m| Sf1LearnerRow {
                lrn: m.lrn,
                family_name: m.family_name,
                given_name: m.given_name,
                sex: m.sex,
            })
            .collect(),
    };

    let file_name = format!(
        "SF1_{}_{}_{}.xlsx",
        sanitize_filename_component(&section.school_year.replace(' ', "_")),
        sanitize_filename_component(&section.grade_level.replace(' ', "_")),
        sanitize_filename_component(&section.name.replace(' ', "_")),
    );
    let output_path = output_dir.join(file_name);

    let generator = UmyaSf1Generator::sf1_synthetic_v1();
    let result = generator.generate_sf1(&template_bytes(), &request, &output_path)?;
    Ok(Some(result))
}

#[test]
fn a_registrar_can_generate_an_sf1_form_for_their_own_schools_section() {
    let conn = open_test_db();
    let (sessions, school_id) = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let sect = section::create(&conn, &school_id, "2026-2027", "1", "Sampaguita").unwrap();
    let l1 = learner::create(
        &conn,
        &school_id,
        "Ana",
        "Dela Cruz",
        Some("123456789012"),
        Some("F"),
    )
    .unwrap();
    section_membership::enroll(&conn, &school_id, &sect.id, &l1.id, "2026-06-01").unwrap();

    let dir = tempfile::tempdir().unwrap();
    let result =
        generate_sf1_form_as_current_session(&conn, &sessions, &sect.id, "2026-06-15", dir.path())
            .unwrap()
            .expect("section belongs to the caller's own school");

    assert_eq!(result.learner_count, 1);
    assert!(Path::new(&result.output_path).exists());
}

#[test]
fn generating_for_another_schools_section_returns_none_not_an_error() {
    let conn = open_test_db();
    let (sessions, _school_id) = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let other_school =
        school::create(&conn, "Rizal Elementary (SYNTHETIC, different school)").unwrap();
    let foreign_section =
        section::create(&conn, &other_school.id, "2026-2027", "1", "Rosal").unwrap();

    let dir = tempfile::tempdir().unwrap();
    let result = generate_sf1_form_as_current_session(
        &conn,
        &sessions,
        &foreign_section.id,
        "2026-06-15",
        dir.path(),
    )
    .unwrap();

    assert!(result.is_none());
}

#[test]
fn no_session_cannot_generate_an_sf1_form() {
    let conn = open_test_db();
    let sessions = SessionManager::new();
    let dir = tempfile::tempdir().unwrap();

    let result = generate_sf1_form_as_current_session(
        &conn,
        &sessions,
        "any-section-id",
        "2026-06-15",
        dir.path(),
    );

    assert!(result.is_err());
}

/// Opens the actual generated workbook and confirms the first data row
/// is genuinely empty — an earlier version of this test only asserted
/// `result.learner_count == 0` on the returned struct without ever
/// reading the file itself (an independent review finding: the name
/// promised verification of the generated form's row content, the body
/// verified a return-value field instead).
#[test]
fn a_section_with_no_enrolled_learners_generates_a_form_with_an_empty_first_data_row() {
    let conn = open_test_db();
    let (sessions, school_id) = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let sect = section::create(&conn, &school_id, "2026-2027", "1", "Sampaguita").unwrap();

    let dir = tempfile::tempdir().unwrap();
    let result =
        generate_sf1_form_as_current_session(&conn, &sessions, &sect.id, "2026-06-15", dir.path())
            .unwrap()
            .unwrap();

    assert_eq!(result.learner_count, 0);

    let book = umya_spreadsheet::reader::xlsx::read(&result.output_path).unwrap();
    let sheet = book.sheet_by_name("SF1").unwrap();
    assert_eq!(
        sheet.value((1, 9)),
        "",
        "the first learner data row (A9) must be empty when no learners are enrolled"
    );
}

#[test]
fn generating_a_form_never_mutates_the_learners_it_reads() {
    let conn = open_test_db();
    let (sessions, school_id) = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let sect = section::create(&conn, &school_id, "2026-2027", "1", "Sampaguita").unwrap();
    let l1 = learner::create(&conn, &school_id, "Ana", "Dela Cruz", None, None).unwrap();
    section_membership::enroll(&conn, &school_id, &sect.id, &l1.id, "2026-06-01").unwrap();

    let dir = tempfile::tempdir().unwrap();
    generate_sf1_form_as_current_session(&conn, &sessions, &sect.id, "2026-06-15", dir.path())
        .unwrap();

    let still_there = learner::find_by_id_in_school(&conn, &school_id, &l1.id)
        .unwrap()
        .unwrap();
    assert_eq!(still_there.given_name, "Ana");
    assert_eq!(still_there.family_name, "Dela Cruz");
}

#[test]
fn repeated_generation_for_the_same_section_overwrites_the_same_output_file() {
    let conn = open_test_db();
    let (sessions, school_id) = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let sect = section::create(&conn, &school_id, "2026-2027", "1", "Sampaguita").unwrap();

    let dir = tempfile::tempdir().unwrap();
    let first =
        generate_sf1_form_as_current_session(&conn, &sessions, &sect.id, "2026-06-15", dir.path())
            .unwrap()
            .unwrap();
    let l1 = learner::create(&conn, &school_id, "Ana", "Dela Cruz", None, None).unwrap();
    section_membership::enroll(&conn, &school_id, &sect.id, &l1.id, "2026-06-01").unwrap();
    let second =
        generate_sf1_form_as_current_session(&conn, &sessions, &sect.id, "2026-06-15", dir.path())
            .unwrap()
            .unwrap();

    assert_eq!(first.output_path, second.output_path);
    assert_eq!(second.learner_count, 1);

    let entries: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .collect();
    assert_eq!(
        entries.len(),
        1,
        "repeated generation must not accumulate extra files"
    );
}

/// The trusted bundled resource
/// (`src-tauri/resources/sf1/sf1_template_synthetic.xlsx`) must stay
/// byte-identical to the test fixture this suite reads, and both must
/// match `formgen::template::SF1_SYNTHETIC_V1`'s pinned hash — this is
/// the concrete, checkable proof that "the same trusted template" claim
/// in this file's own module doc comment is true, not merely asserted.
#[test]
fn the_bundled_resource_and_the_test_fixture_are_byte_identical() {
    let resource_bytes = std::fs::read(
        Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/sf1/sf1_template_synthetic.xlsx"),
    )
    .unwrap();
    assert_eq!(resource_bytes, template_bytes());
}
