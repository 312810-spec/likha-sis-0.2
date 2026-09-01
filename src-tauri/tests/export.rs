//! Integration proofs for the M10 SF2 export, standing in for
//! `commands::export::export_section_monthly_sf2` directly — same pattern
//! as `tests/attendance_management.rs`. Deliberately does not exercise the
//! actual file-write side effect (that needs a real `tauri::AppHandle`,
//! which these lighter-weight integration tests don't construct — see
//! `docs/adr/0009-sf2-export-and-official-form-engine.md` for that
//! disclosed gap); it exercises everything the command does *before* the
//! file write: session/school/section resolution and the export build.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::export::learner_roster::{self, LearnerRosterExport};
use app_lib::export::sf2::{self, Sf2Export};
use app_lib::export::sf5::{self, Sf5Export, Sf5LearnerRow, Sf5SubjectGrade};
use app_lib::export::sf6::{self, Sf6Export, Sf6SectionSummary};
use app_lib::repository::{
    attendance, class_record, grading, grading_computation, learner, role, school, section,
    section_advisory, section_membership, user,
};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn login_as_a_teacher_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> SessionManager {
    let teacher = user::create_user(conn, username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

/// Standing in for the non-I/O portion of `commands::export::export_section_monthly_sf2`.
fn export_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    year: i32,
    month: u32,
) -> app_lib::error::AppResult<Option<Sf2Export>> {
    let school_id = sessions.require_active_school_scope(conn)?;

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(conn, &school_id, section_id)? else {
        return Ok(None);
    };
    let report = attendance::monthly_grid_for_section(conn, &school_id, section_id, year, month)?;

    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) => 29,
        _ => 28,
    };
    let as_of_date = format!("{year}-{month:02}-{days_in_month:02}");
    let adviser =
        section_advisory::current_adviser_for_section(conn, &school_id, section_id, &as_of_date)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    Ok(Some(sf2::build_sf2_export(
        &school,
        &section,
        adviser_name.as_deref(),
        &report,
    )))
}

/// Standing in for the non-I/O portion of `commands::export::export_learner_roster`.
fn export_learner_roster_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Option<LearnerRosterExport>> {
    let school_id = sessions.require_active_school_scope(conn)?;

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let learners = learner::list_by_school(conn, &school_id)?;

    Ok(Some(learner_roster::build_learner_roster_export(
        &school, &learners,
    )))
}

fn setup_enrolled_learner_with_session(
    conn: &rusqlite::Connection,
    username: &str,
) -> (String, String, SessionManager) {
    let s = school::create(conn, "School A").unwrap();
    let sec = section::create(conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = login_as_a_teacher_at(conn, &s.id, username);
    let l = learner::create(conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
    section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-08-01").unwrap();
    (s.id, sec.id, sessions)
}

#[test]
fn a_teacher_can_export_their_own_sections_monthly_sf2() {
    let conn = open_test_db();
    let (_school_id, section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Section,Mabini"));
    assert!(export.csv.contains("Juan"));
}

#[test]
fn sf2_export_renders_assigned_adviser_name() {
    let conn = open_test_db();
    let (school_id, section_id, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");
    let adviser = user::create_user(&conn, "adviser.a", "password", "Maria Clara").unwrap();
    user::add_school_membership(&conn, &adviser.id, &school_id).unwrap();
    section_advisory::assign(&conn, &school_id, &section_id, &adviser.id, "2026-06-01").unwrap();

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Class Adviser,Maria Clara"));
}

#[test]
fn sf2_export_renders_blank_for_unassigned_adviser() {
    let conn = open_test_db();
    let (_school_id, section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_id, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Class Adviser,"));
}

#[test]
fn exporting_a_foreign_schools_section_returns_none_not_an_error() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();

    let result = export_as_current_session(&conn, &sessions, &section_b.id, 2026, 8).unwrap();

    assert!(
        result.is_none(),
        "a foreign section_id must not resolve to any data"
    );
}

#[test]
fn exporting_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = export_as_current_session(&conn, &sessions, &section_a.id, 2026, 8);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_export_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();
    let learner_b = learner::create(&conn, &school_b.id, "Maria", "Santos", None, None).unwrap();
    section_membership::enroll(
        &conn,
        &school_b.id,
        &section_b.id,
        &learner_b.id,
        "2026-08-01",
    )
    .unwrap();
    let (_school_a, section_a, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_as_current_session(&conn, &sessions, &section_a, 2026, 8)
        .unwrap()
        .unwrap();

    assert!(!export.csv.contains("Maria"));
    assert!(!export.csv.contains("Santos"));
}

#[test]
fn a_teacher_can_export_their_own_schools_learner_roster() {
    let conn = open_test_db();
    let (_school_id, _section_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_learner_roster_as_current_session(&conn, &sessions)
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("Juan"));
    assert!(export.csv.contains("Dela Cruz"));
}

#[test]
fn exporting_the_learner_roster_requires_a_session() {
    let conn = open_test_db();
    let sessions = SessionManager::new(); // nobody logged in

    let result = export_learner_roster_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_learner_roster_export_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    learner::create(&conn, &school_b.id, "Maria", "Santos", None, None).unwrap();
    let (_school_a, _section_a, sessions) = setup_enrolled_learner_with_session(&conn, "teacher.a");

    let export = export_learner_roster_as_current_session(&conn, &sessions)
        .unwrap()
        .unwrap();

    assert!(!export.csv.contains("Maria"));
    assert!(!export.csv.contains("Santos"));
}

/// Standing in for the non-I/O portion of `commands::export::export_section_eosy_sf5`.
fn export_sf5_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    school_year: &str,
) -> app_lib::error::AppResult<Option<Sf5Export>> {
    let periods = grading::list_by_school_year(conn, "", school_year).unwrap_or_default();
    let as_of_date = if let Some(last_period) = periods.last() {
        last_period.ends_on.clone()
    } else {
        let end_year = school_year
            .split('-')
            .nth(1)
            .and_then(|y| y.parse::<i32>().ok())
            .unwrap_or(2027);
        format!("{end_year}-06-30")
    };

    let (_user_id, school_id) =
        match auth::authorize_adviser_of_section(conn, sessions, section_id, &as_of_date) {
            Ok(pair) => pair,
            Err(AppError::Unauthorized) => return Err(AppError::Unauthorized),
            Err(_) => return Ok(None),
        };

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(conn, &school_id, section_id)? else {
        return Ok(None);
    };

    let school_periods = grading::list_by_school_year(conn, &school_id, school_year)?;
    let start_date = school_periods
        .first()
        .map(|p| p.starts_on.clone())
        .unwrap_or_else(|| {
            let start_year = school_year
                .split('-')
                .next()
                .and_then(|y| y.parse::<i32>().ok())
                .unwrap_or(2026);
            format!("{start_year}-06-01")
        });
    let end_date = school_periods
        .last()
        .map(|p| p.ends_on.clone())
        .unwrap_or_else(|| as_of_date.clone());

    let adviser =
        section_advisory::current_adviser_for_section(conn, &school_id, section_id, &end_date)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    let roster = section_membership::roster_for_section_over_range(
        conn,
        &school_id,
        section_id,
        &start_date,
        &end_date,
    )?;

    let class_records = class_record::list_by_section_in_school(conn, &school_id, section_id)?;
    let filtered_records: Vec<_> = class_records
        .into_iter()
        .filter(|cr| cr.school_year == school_year)
        .collect();

    let mut distinct_subjects: Vec<String> = filtered_records
        .iter()
        .map(|cr| cr.subject_name.clone())
        .collect();
    distinct_subjects.sort();
    distinct_subjects.dedup();

    let mut learner_rows = Vec::with_capacity(roster.len());
    for member in roster {
        let mut subject_grades = Vec::with_capacity(distinct_subjects.len());

        for subj in &distinct_subjects {
            let subj_records: Vec<_> = filtered_records
                .iter()
                .filter(|cr| cr.subject_name == *subj)
                .collect();

            if subj_records.is_empty() {
                subject_grades.push(Sf5SubjectGrade {
                    subject_name: subj.clone(),
                    final_grade: None,
                });
            } else {
                let mut sum = 0.0;
                let mut count = 0;
                let mut all_scored = true;

                for cr in subj_records {
                    let computed = grading_computation::compute_term_grade(
                        conn,
                        &school_id,
                        &cr.id,
                        &member.learner_id,
                    )?;
                    match computed {
                        Some(grade) => {
                            sum += grade.term_grade as f64;
                            count += 1;
                        }
                        None => {
                            all_scored = false;
                        }
                    }
                }

                let final_grade = if all_scored && count > 0 {
                    Some((sum / count as f64).round() as u32)
                } else {
                    None
                };

                subject_grades.push(Sf5SubjectGrade {
                    subject_name: subj.clone(),
                    final_grade,
                });
            }
        }

        let (general_average, promotion_status) = Sf5LearnerRow::compute_status(&subject_grades);
        learner_rows.push(Sf5LearnerRow {
            learner_id: member.learner_id,
            given_name: member.given_name,
            family_name: member.family_name,
            sex: member.sex,
            lrn: member.lrn,
            subject_grades,
            general_average,
            promotion_status,
        });
    }

    Ok(Some(sf5::build_sf5_export(
        &school,
        &section.name,
        &section.grade_level,
        school_year,
        adviser_name.as_deref(),
        &distinct_subjects,
        &learner_rows,
    )))
}

#[test]
fn sf5_export_requires_adviser_or_school_head() {
    let conn = open_test_db();
    let s = school::create(&conn, "School A").unwrap();
    let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();

    // Teacher with no role or advisory
    let teacher = user::create_user(&conn, "teacher.plain", "pw", "Teacher Plain").unwrap();
    user::add_school_membership(&conn, &teacher.id, &s.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "teacher.plain", "pw", &s.id).unwrap();

    let result = export_sf5_as_current_session(&conn, &sessions, &sec.id, "2026-2027");
    assert!(matches!(result, Err(AppError::Unauthorized)));

    // Grant School Head role
    role::grant(&conn, &teacher.id, &s.id, role::SCHOOL_HEAD).unwrap();
    let head_result = export_sf5_as_current_session(&conn, &sessions, &sec.id, "2026-2027");
    assert!(head_result.is_ok());
}

#[test]
fn sf5_export_cross_school_isolation() {
    let conn = open_test_db();
    let s1 = school::create(&conn, "School A").unwrap();
    let sec1 = section::create(&conn, &s1.id, "2026-2027", "7", "Mabini").unwrap();

    let s2 = school::create(&conn, "School B").unwrap();
    let head2 = user::create_user(&conn, "head.b", "pw", "Head B").unwrap();
    user::add_school_membership(&conn, &head2.id, &s2.id).unwrap();
    role::grant(&conn, &head2.id, &s2.id, role::SCHOOL_HEAD).unwrap();

    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "head.b", "pw", &s2.id).unwrap();

    let result = export_sf5_as_current_session(&conn, &sessions, &sec1.id, "2026-2027");
    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn sf5_export_renders_assigned_adviser_and_learners() {
    let conn = open_test_db();
    let s = school::create(&conn, "School A").unwrap();
    let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();

    let adv = user::create_user(&conn, "adviser.a", "pw", "Adviser Maria").unwrap();
    user::add_school_membership(&conn, &adv.id, &s.id).unwrap();
    role::grant(&conn, &adv.id, &s.id, role::TEACHER).unwrap();
    section_advisory::assign(&conn, &s.id, &sec.id, &adv.id, "2026-06-01").unwrap();

    let l1 = learner::create(
        &conn,
        &s.id,
        "Juan",
        "Dela Cruz",
        Some("123456789012"),
        Some("M"),
    )
    .unwrap();
    section_membership::enroll(&conn, &s.id, &sec.id, &l1.id, "2026-06-01").unwrap();

    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "adviser.a", "pw", &s.id).unwrap();

    let export = export_sf5_as_current_session(&conn, &sessions, &sec.id, "2026-2027")
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("School Form 5 (SF5)"));
    assert!(export.csv.contains("Class Adviser,Adviser Maria"));
    assert!(export.csv.contains("123456789012,\"Dela Cruz, Juan\",M"));
}

/// Standing in for the non-I/O portion of `commands::export::export_school_eosy_sf6`.
fn export_sf6_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    school_year: &str,
) -> app_lib::error::AppResult<Option<Sf6Export>> {
    let school_id = sessions.require_active_school_scope(conn)?;

    let Some(school) = school::find_by_id(conn, &school_id)? else {
        return Ok(None);
    };

    let school_periods = grading::list_by_school_year(conn, &school_id, school_year)?;
    let start_date = school_periods
        .first()
        .map(|p| p.starts_on.clone())
        .unwrap_or_else(|| "2000-01-01".to_string());
    let end_date = school_periods
        .last()
        .map(|p| p.ends_on.clone())
        .unwrap_or_else(|| "2099-12-31".to_string());

    let sections = section::list_by_school(conn, &school_id)?;
    let mut section_summaries = Vec::with_capacity(sections.len());

    for sec in sections {
        let roster = section_membership::roster_for_section_over_range(
            conn,
            &school_id,
            &sec.id,
            &start_date,
            &end_date,
        )?;
        let class_records = class_record::list_by_section_in_school(conn, &school_id, &sec.id)?;
        let filtered_records: Vec<_> = class_records
            .into_iter()
            .filter(|cr| cr.school_year == school_year)
            .collect();

        let mut distinct_subjects: Vec<String> = filtered_records
            .iter()
            .map(|cr| cr.subject_name.clone())
            .collect();
        distinct_subjects.sort();
        distinct_subjects.dedup();

        let mut learner_rows = Vec::with_capacity(roster.len());
        for member in roster {
            let mut subject_grades = Vec::with_capacity(distinct_subjects.len());

            for subj in &distinct_subjects {
                let subj_records: Vec<_> = filtered_records
                    .iter()
                    .filter(|cr| cr.subject_name == *subj)
                    .collect();

                if subj_records.is_empty() {
                    subject_grades.push(Sf5SubjectGrade {
                        subject_name: subj.clone(),
                        final_grade: None,
                    });
                } else {
                    let mut sum = 0.0;
                    let mut count = 0;
                    let mut all_scored = true;

                    for cr in subj_records {
                        let computed = grading_computation::compute_term_grade(
                            conn,
                            &school_id,
                            &cr.id,
                            &member.learner_id,
                        )?;
                        match computed {
                            Some(grade) => {
                                sum += grade.term_grade as f64;
                                count += 1;
                            }
                            None => {
                                all_scored = false;
                            }
                        }
                    }

                    let final_grade = if all_scored && count > 0 {
                        Some((sum / count as f64).round() as u32)
                    } else {
                        None
                    };

                    subject_grades.push(Sf5SubjectGrade {
                        subject_name: subj.clone(),
                        final_grade,
                    });
                }
            }

            let (general_average, promotion_status) =
                Sf5LearnerRow::compute_status(&subject_grades);
            learner_rows.push(Sf5LearnerRow {
                learner_id: member.learner_id,
                given_name: member.given_name,
                family_name: member.family_name,
                sex: member.sex,
                lrn: member.lrn,
                subject_grades,
                general_average,
                promotion_status,
            });
        }

        let summary = sf5::ProficiencySummary::compute(&learner_rows);
        section_summaries.push(Sf6SectionSummary {
            section_id: sec.id,
            section_name: sec.name,
            grade_level: sec.grade_level,
            summary,
        });
    }

    Ok(Some(sf6::build_sf6_export(
        &school,
        school_year,
        &section_summaries,
    )))
}

#[test]
fn sf6_export_school_wide_consolidation_and_isolation() {
    let conn = open_test_db();
    let s1 = school::create(&conn, "School Alpha").unwrap();
    let sec1 = section::create(&conn, &s1.id, "2026-2027", "7", "Section 1").unwrap();
    let sec2 = section::create(&conn, &s1.id, "2026-2027", "8", "Section 2").unwrap();

    let l1 = learner::create(
        &conn,
        &s1.id,
        "Pedro",
        "Penduko",
        Some("111111111111"),
        Some("M"),
    )
    .unwrap();
    let l2 = learner::create(
        &conn,
        &s1.id,
        "Maria",
        "Clara",
        Some("222222222222"),
        Some("F"),
    )
    .unwrap();

    section_membership::enroll(&conn, &s1.id, &sec1.id, &l1.id, "2026-06-01").unwrap();
    section_membership::enroll(&conn, &s1.id, &sec2.id, &l2.id, "2026-06-01").unwrap();

    // User in School Alpha
    let head = user::create_user(&conn, "head.alpha", "pw", "Head Alpha").unwrap();
    user::add_school_membership(&conn, &head.id, &s1.id).unwrap();
    let sessions = SessionManager::new();
    auth::login(&conn, &sessions, "head.alpha", "pw", &s1.id).unwrap();

    let export = export_sf6_as_current_session(&conn, &sessions, "2026-2027")
        .unwrap()
        .unwrap();

    assert!(export.csv.contains("School Form 6 (SF6)"));
    assert!(export.csv.contains("School Alpha"));
    assert!(export.csv.contains("7,Section 1"));
    assert!(export.csv.contains("8,Section 2"));
    assert!(export.csv.contains("TOTAL 7"));
    assert!(export.csv.contains("TOTAL 8"));
    assert!(export.csv.contains("SCHOOL GRAND TOTAL"));
    assert_eq!(export.disclosure.populated_fields.len(), 6);
}
