//! Synthetic assignment-boundary checks for native learner/form/score access.
//! These exercise the trusted authorization helpers. The source-wiring test
//! separately checks that exposed Tauri commands invoke those helpers.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{
    assessment_item, class_record, grading, role, school, section, section_advisory, subject,
    teaching_assignment, user,
};
use rusqlite::Connection;

const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";
const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";

fn db() -> Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn signed_in(conn: &Connection, school_id: &str, username: &str) -> (String, SessionManager) {
    let actor = user::create_user(conn, username, "password", "Synthetic teacher").unwrap();
    user::add_school_membership(conn, &actor.id, school_id).unwrap();
    role::grant(conn, &actor.id, school_id, role::TEACHER).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    (actor.id, sessions)
}

#[test]
fn only_the_current_adviser_or_administrator_may_export_a_section_form() {
    let conn = db();
    let own_school = school::create(&conn, "Synthetic A").unwrap();
    let other_school = school::create(&conn, "Synthetic B").unwrap();
    let a = section::create(&conn, &own_school.id, "2026-2027", "10", "A").unwrap();
    let b = section::create(&conn, &own_school.id, "2026-2027", "10", "B").unwrap();
    let foreign = section::create(&conn, &other_school.id, "2026-2027", "10", "C").unwrap();
    let (actor, sessions) = signed_in(&conn, &own_school.id, "teacher.a");

    assert!(matches!(
        auth::authorize_section_form_read(&conn, &sessions, &a.id, "2026-08-31"),
        Err(AppError::Unauthorized)
    ));
    section_advisory::assign(&conn, &own_school.id, &a.id, &actor, "2026-07-01").unwrap();
    assert!(matches!(
        auth::authorize_section_form_read(&conn, &sessions, &a.id, "2026-06-30"),
        Err(AppError::Unauthorized)
    ));
    assert_eq!(
        auth::authorize_section_form_read(&conn, &sessions, &a.id, "2026-08-31").unwrap(),
        own_school.id
    );
    assert!(matches!(
        auth::authorize_section_form_read(&conn, &sessions, &b.id, "2026-08-31"),
        Err(AppError::Unauthorized)
    ));

    let mathematics = subject::create(&conn, &own_school.id, "Mathematics").unwrap();
    teaching_assignment::create(&conn, &own_school.id, &actor, &b.id, &mathematics.id)
        .unwrap();
    assert!(matches!(
        auth::authorize_section_form_read(&conn, &sessions, &b.id, "2026-08-31"),
        Err(AppError::Unauthorized)
    ));

    role::grant(&conn, &actor, &own_school.id, role::REGISTRAR).unwrap();
    assert!(auth::authorize_section_form_read(&conn, &sessions, &b.id, "2026-08-31").is_ok());
    assert!(matches!(
        auth::authorize_section_form_read(&conn, &sessions, &foreign.id, "2026-08-31"),
        Err(AppError::Unauthorized)
    ));
}

#[test]
fn class_record_and_assessment_access_follow_current_subject_assignment() {
    let conn = db();
    let own_school = school::create(&conn, "Synthetic school").unwrap();
    let a = section::create(&conn, &own_school.id, "2026-2027", "10", "A").unwrap();
    let b = section::create(&conn, &own_school.id, "2026-2027", "10", "B").unwrap();
    let mathematics = subject::create(&conn, &own_school.id, "Mathematics").unwrap();
    let tle = subject::create(&conn, &own_school.id, "TLE").unwrap();
    let period = grading::create(
        &conn,
        &own_school.id,
        "2026-2027",
        TERM_1,
        "2026-06-08",
        "2026-09-15",
    )
    .unwrap()
    .unwrap();
    let math_a = class_record::create(
        &conn, &own_school.id, &a.id, &mathematics.id, &period.id, K10_POLICY, None,
    )
    .unwrap()
    .unwrap();
    let tle_a = class_record::create(
        &conn, &own_school.id, &a.id, &tle.id, &period.id, K10_POLICY, None,
    )
    .unwrap()
    .unwrap();
    let math_b = class_record::create(
        &conn, &own_school.id, &b.id, &mathematics.id, &period.id, K10_POLICY, None,
    )
    .unwrap()
    .unwrap();
    let item = assessment_item::create(
        &conn, &own_school.id, &math_a.id, WRITTEN_WORKS, "Synthetic quiz", 10.0,
    )
    .unwrap()
    .unwrap();
    let (teacher, sessions) = signed_in(&conn, &own_school.id, "math.teacher");

    assert!(matches!(
        auth::authorize_class_record_write(&conn, &sessions, &math_a.id),
        Err(AppError::Unauthorized)
    ));
    let assignment = teaching_assignment::create(
        &conn, &own_school.id, &teacher, &a.id, &mathematics.id,
    )
    .unwrap()
    .unwrap();
    assert!(auth::authorize_class_record_write(&conn, &sessions, &math_a.id).is_ok());
    assert!(auth::authorize_class_record_read(&conn, &sessions, &math_a.id).is_ok());
    assert!(matches!(
        auth::authorize_class_record_read(&conn, &sessions, &tle_a.id),
        Err(AppError::Unauthorized)
    ));
    assert!(matches!(
        auth::authorize_class_record_read(&conn, &sessions, &math_b.id),
        Err(AppError::Unauthorized)
    ));
    assert!(auth::authorize_assessment_item_access(&conn, &sessions, &item.id, true).is_ok());
    assert!(auth::authorize_assessment_item_access(&conn, &sessions, &item.id, false).is_ok());

    teaching_assignment::remove(&conn, &own_school.id, &assignment.id).unwrap();
    assert!(matches!(
        auth::authorize_assessment_item_access(&conn, &sessions, &item.id, true),
        Err(AppError::Unauthorized)
    ));
    assert!(matches!(
        auth::authorize_class_record_read(&conn, &sessions, &math_a.id),
        Err(AppError::Unauthorized)
    ));

    role::grant(&conn, &teacher, &own_school.id, role::REGISTRAR).unwrap();
    assert!(auth::authorize_class_record_read(&conn, &sessions, &math_b.id).is_ok());
    assert!(matches!(
        auth::authorize_class_record_write(&conn, &sessions, &math_b.id),
        Err(AppError::Unauthorized)
    ));
}

#[test]
fn exposed_commands_recheck_authorization_before_learner_and_grade_reads() {
    let commands = [
        (include_str!("../src/commands/formgen.rs"), "generate_sf1_form", "authorize_section_form_read"),
        (include_str!("../src/commands/formgen.rs"), "generate_sf9_form", "authorize_section_form_read"),
        (include_str!("../src/commands/export.rs"), "export_section_monthly_sf2", "authorize_section_form_read"),
        (include_str!("../src/commands/export.rs"), "export_learner_roster", "Capability::ManageLearners"),
        (include_str!("../src/commands/export.rs"), "export_class_record_report_card", "authorize_class_record_read"),
        (include_str!("../src/commands/export.rs"), "export_class_record_summary", "authorize_class_record_read"),
        (include_str!("../src/commands/class_record.rs"), "list_class_records_by_school", "can_read_class_record"),
        (include_str!("../src/commands/class_record.rs"), "create_class_record", "authorize_section_subject_write"),
        (include_str!("../src/commands/assessment_item.rs"), "list_assessment_items_by_class_record", "authorize_class_record_read"),
        (include_str!("../src/commands/assessment_item.rs"), "create_assessment_item", "authorize_class_record_write"),
        (include_str!("../src/commands/assessment_item.rs"), "rename_assessment_item", "authorize_assessment_item_access"),
        (include_str!("../src/commands/assessment_item.rs"), "update_assessment_item", "authorize_assessment_item_access"),
        (include_str!("../src/commands/assessment_item.rs"), "delete_assessment_item", "authorize_assessment_item_access"),
        (include_str!("../src/commands/learner_score.rs"), "roster_for_assessment_item", "authorize_assessment_item_access"),
        (include_str!("../src/commands/learner_score.rs"), "record_learner_score", "authorize_assessment_item_access"),
        (include_str!("../src/commands/section.rs"), "section_roster", "can_read_section_roster"),
        (include_str!("../src/commands/section.rs"), "list_learner_enrollment_history", "can_read_learner"),
        (include_str!("../src/commands/section.rs"), "get_current_enrollment", "can_read_learner"),
    ];
    for (source, name, gate) in commands {
        let start = format!("pub fn {name}(");
        let body = source
            .split_once(&start)
            .unwrap_or_else(|| panic!("missing command: {name}"))
            .1
            .split("#[tauri::command]")
            .next()
            .unwrap();
        assert!(body.contains(gate), "{name} has no {gate} boundary");
    }
}
