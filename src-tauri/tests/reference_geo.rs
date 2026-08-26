//! Integration proofs for Wave 2G — External API & Government
//! Reference-Data Foundation (PSGC). Standing in for
//! `commands::reference_geo::{import_psgc_snapshot, get_current_psgc_snapshot,
//! list_psgc_units}`, same convention as `tests/sf1_import.rs`. Written in
//! direct response to Wave 2G's independent review, which found the
//! command module had zero test coverage at all — specifically what let
//! its blocking finding (a hardcoded `"PSA PSGC"` read literal vs. an
//! unvalidated `source_name` write field) go unnoticed.

use std::io::Write;
use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppResult;
use app_lib::import::psgc::{self, EXPECTED_SOURCE_NAME};
use app_lib::repository::reference_geo::{self, GeoSnapshot, GeoUnit, SnapshotImportOutcome};
use app_lib::repository::{role as role_repo, school, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn login_with_role(conn: &rusqlite::Connection, username: &str, role: &str) -> SessionManager {
    let sch = school::create(conn, "Rizal Elementary").unwrap();
    let u = user::create_user(conn, username, "password", "Test User").unwrap();
    user::add_school_membership(conn, &u.id, &sch.id).unwrap();
    role_repo::grant(conn, &u.id, &sch.id, role).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", &sch.id).unwrap();
    sessions
}

fn write_fixture(dir: &tempfile::TempDir, source_name: &str) -> std::path::PathBuf {
    let path = dir.path().join("psgc.json");
    let mut file = std::fs::File::create(&path).unwrap();
    write!(
        file,
        r#"{{"sourceName":"{source_name}","version":"2026Q1","units":[
            {{"code":"01","name":"Region I","level":"region"}},
            {{"code":"0101","name":"Ilocos Norte","level":"province","parentCode":"01"}}
        ]}}"#
    )
    .unwrap();
    path
}

/// Standing in for `commands::reference_geo::import_psgc_snapshot`.
fn import_psgc_snapshot_as_current_session(
    conn: &mut rusqlite::Connection,
    sessions: &SessionManager,
    file_path: &Path,
) -> AppResult<SnapshotImportOutcome> {
    let (_school_id, user_id) =
        auth::authorize_capability_with_actor(conn, sessions, Capability::ManageLearners)?;
    let username = user::find_by_id(conn, &user_id)?
        .map(|u| u.username)
        .unwrap_or_else(|| "unknown".to_string());
    let bytes = std::fs::read(file_path).unwrap();
    let snapshot = psgc::parse_and_validate(&bytes)?;
    reference_geo::record_snapshot(conn, &snapshot, Some(&user_id), &username)
}

/// Standing in for `commands::reference_geo::get_current_psgc_snapshot`.
fn get_current_psgc_snapshot_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> AppResult<Option<GeoSnapshot>> {
    sessions.require_active_school_scope(conn)?;
    reference_geo::current_snapshot(conn, EXPECTED_SOURCE_NAME)
}

/// Standing in for `commands::reference_geo::list_psgc_units`.
fn list_psgc_units_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    level: Option<&str>,
) -> AppResult<Vec<GeoUnit>> {
    sessions.require_active_school_scope(conn)?;
    let Some(current) = reference_geo::current_snapshot(conn, EXPECTED_SOURCE_NAME)? else {
        return Ok(Vec::new());
    };
    reference_geo::list_units(conn, &current.id, level, None)
}

#[test]
fn importing_then_reading_back_round_trips_through_the_command_layer() {
    let mut conn = open_test_db();
    let sessions = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let dir = tempfile::tempdir().unwrap();
    let file_path = write_fixture(&dir, EXPECTED_SOURCE_NAME);

    let outcome = import_psgc_snapshot_as_current_session(&mut conn, &sessions, &file_path)
        .expect("import should succeed for a well-formed fixture with the expected source name");
    assert!(matches!(
        outcome,
        SnapshotImportOutcome::Imported { unit_count: 2, .. }
    ));

    let current = get_current_psgc_snapshot_as_current_session(&conn, &sessions)
        .unwrap()
        .expect(
            "a snapshot imported through the command layer must be visible to the read command",
        );
    assert_eq!(current.authoritative_version, "2026Q1");

    let regions = list_psgc_units_as_current_session(&conn, &sessions, Some("region")).unwrap();
    assert_eq!(regions.len(), 1);
    assert_eq!(regions[0].code, "01");
}

/// The exact scenario Wave 2G's independent review flagged as blocking:
/// a well-formed file whose `sourceName` doesn't match the one the read
/// commands look up must NOT silently succeed and then become invisible
/// — it must be rejected outright at import time.
#[test]
fn importing_a_file_with_an_unexpected_source_name_is_rejected_not_silently_orphaned() {
    let mut conn = open_test_db();
    let sessions = login_with_role(&conn, "registrar.a", role_repo::REGISTRAR);
    let dir = tempfile::tempdir().unwrap();
    let file_path = write_fixture(&dir, "PSA PSGC 2026Q2");

    let result = import_psgc_snapshot_as_current_session(&mut conn, &sessions, &file_path);
    assert!(
        result.is_err(),
        "an unrecognized source name must be rejected at import time, not silently accepted"
    );

    let current = get_current_psgc_snapshot_as_current_session(&conn, &sessions).unwrap();
    assert!(
        current.is_none(),
        "a rejected import must leave no orphaned row behind"
    );
}

#[test]
fn no_session_cannot_import_or_read_psgc_data() {
    let mut conn = open_test_db();
    let sessions = SessionManager::new();
    let dir = tempfile::tempdir().unwrap();
    let file_path = write_fixture(&dir, EXPECTED_SOURCE_NAME);

    let import_result = import_psgc_snapshot_as_current_session(&mut conn, &sessions, &file_path);
    assert!(
        import_result.is_err(),
        "a caller with no active session must never be able to import PSGC data"
    );

    let read_result = get_current_psgc_snapshot_as_current_session(&conn, &sessions);
    assert!(
        read_result.is_err(),
        "a caller with no active session must never be able to read PSGC data"
    );
}

#[test]
fn a_teacher_without_manage_learners_cannot_import_psgc_data_but_can_still_read_it() {
    let mut conn = open_test_db();
    let sessions = login_with_role(&conn, "teacher.a", role_repo::TEACHER);
    let dir = tempfile::tempdir().unwrap();
    let file_path = write_fixture(&dir, EXPECTED_SOURCE_NAME);

    let import_result = import_psgc_snapshot_as_current_session(&mut conn, &sessions, &file_path);
    assert!(
        import_result.is_err(),
        "a teacher without ManageLearners must not be able to import PSGC data"
    );

    // Reads only require an active session, no specific capability — a
    // teacher can still look up reference data once an admin has
    // imported it (there's simply nothing imported yet in this test).
    let read_result = get_current_psgc_snapshot_as_current_session(&conn, &sessions);
    assert!(read_result.is_ok());
}
