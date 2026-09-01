use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::export::learner_roster;
use crate::export::report_card::{self, ReportCardRow};
use crate::export::sanitize_filename_component;
use crate::export::sf2;
use crate::export::sf5::{self, Sf5LearnerRow, Sf5SubjectGrade};
use crate::export::sf6::{self, Sf6SectionSummary};
use crate::export::FieldDisclosure;
use crate::repository::{
    attendance, class_record, grading, grading_computation, learner, school, section,
    section_advisory, section_membership, user,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf6ExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf5ExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf2ExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

/// Writes a section-level, DepEd-SF2-inspired monthly attendance export to
/// `<Documents>/LIKHA-SIS/` (falling back to the app data directory if the
/// Documents directory cannot be resolved). `school_id` is derived from the
/// session, never a parameter — same convention as every other command
/// here. `section_id` is client-supplied the same way it already is for
/// `attendance_roster_for_date`/`monthly_attendance_summary`; isolation
/// holds because `section::find_by_id_in_school` resolves to `None` for a
/// foreign section, returning `None` here too rather than exporting
/// anything. See `docs/adr/0009-sf2-export-and-official-form-engine.md`.
#[tauri::command]
pub fn export_section_monthly_sf2(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    year: i32,
    month: u32,
) -> AppResult<Option<Sf2ExportResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(&conn, &school_id, &section_id)? else {
        return Ok(None);
    };
    let report = attendance::monthly_grid_for_section(&conn, &school_id, &section_id, year, month)?;

    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) => 29,
        _ => 28,
    };
    let as_of_date = format!("{year}-{month:02}-{days_in_month:02}");
    let adviser =
        section_advisory::current_adviser_for_section(&conn, &school_id, &section_id, &as_of_date)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(&conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    let export = sf2::build_sf2_export(&school, &section, adviser_name.as_deref(), &report);

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "SF2_{}_{year}-{month:02}.csv",
        sanitize_filename_component(&section.name.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(Sf2ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportCardExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

/// Writes a class-record-level, DepEd-grade-computation-inspired report
/// card export to `<Documents>/LIKHA-SIS/` — one row per learner on the
/// class record's section roster, their computed `ComputedTermGrade` if
/// one exists yet, or an explicit "not yet available" row otherwise (a
/// learner is never silently dropped from the export just because their
/// grade isn't computable yet — see `report_card`'s module doc comment).
/// `school_id` is derived from the session, never a parameter.
/// `class_record_id` is client-supplied the same legitimate way
/// `section_id` already is for the SF2 export above; isolation holds
/// because `class_record::find_detail_by_id_in_school` resolves to `None`
/// for a foreign class record, returning `None` here too.
#[tauri::command]
pub fn export_class_record_report_card(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
) -> AppResult<Option<ReportCardExportResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let Some(detail) =
        class_record::find_detail_by_id_in_school(&conn, &school_id, &class_record_id)?
    else {
        return Ok(None);
    };
    let Some((section_id, starts_on, ends_on)) =
        class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)?
    else {
        return Ok(None);
    };

    let roster = section_membership::roster_for_section_over_range(
        &conn,
        &school_id,
        &section_id,
        &starts_on,
        &ends_on,
    )?;
    let mut rows = Vec::with_capacity(roster.len());
    for member in roster {
        let grade = grading_computation::compute_term_grade(
            &conn,
            &school_id,
            &class_record_id,
            &member.learner_id,
        )?;
        rows.push(ReportCardRow {
            learner_id: member.learner_id,
            given_name: member.given_name,
            family_name: member.family_name,
            lrn: member.lrn,
            grade,
        });
    }

    let adviser =
        section_advisory::current_adviser_for_section(&conn, &school_id, &section_id, &ends_on)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(&conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    let export =
        report_card::build_report_card_export(&school, &detail, adviser_name.as_deref(), &rows);

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "ReportCard_{}_{}_{}.csv",
        sanitize_filename_component(&detail.section_name.replace(' ', "_")),
        sanitize_filename_component(&detail.subject_name.replace(' ', "_")),
        sanitize_filename_component(&detail.grading_period_label.replace(' ', "_")),
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(ReportCardExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LearnerRosterExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

/// Writes a school-wide learner roster export to `<Documents>/LIKHA-SIS/`
/// -- one row per learner currently enrolled at the caller's school, for a
/// teacher's own records or manual backup. `school_id` is derived from the
/// session, never a parameter -- same convention as every other command
/// here. Deliberately scoped to already-visible data only, not a database/
/// encryption-key backup -- see
/// `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`.
#[tauri::command]
pub fn export_learner_roster(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<LearnerRosterExportResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let learners = learner::list_by_school(&conn, &school_id)?;

    let export = learner_roster::build_learner_roster_export(&school, &learners);

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "LearnerRoster_{}.csv",
        sanitize_filename_component(&school.name.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(LearnerRosterExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}

/// Writes a section-level School Form 5 (SF5) End of School Year (EOSY)
/// Report on Promotion and Level of Proficiency export to `<Documents>/LIKHA-SIS/`.
///
/// Gated by `auth::authorize_adviser_of_section` so that only the assigned
/// class adviser for the section (or a School Head in the same school) can
/// generate the section's official SF5 report.
#[tauri::command]
pub fn export_section_eosy_sf5(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    school_year: String,
) -> AppResult<Option<Sf5ExportResult>> {
    let conn = lock_db(&db);

    let periods = grading::list_by_school_year(&conn, "", &school_year).unwrap_or_default();
    let as_of_date = if let Some(last_period) = periods.last() {
        last_period.ends_on.clone()
    } else {
        // Fallback to year boundary if no periods exist
        let end_year = school_year
            .split('-')
            .nth(1)
            .and_then(|y| y.parse::<i32>().ok())
            .unwrap_or(2027);
        format!("{end_year}-06-30")
    };

    let (_user_id, school_id) =
        match auth::authorize_adviser_of_section(&conn, &sessions, &section_id, &as_of_date) {
            Ok(pair) => pair,
            Err(crate::error::AppError::Unauthorized) => {
                return Err(crate::error::AppError::Unauthorized)
            }
            Err(_) => return Ok(None),
        };

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(&conn, &school_id, &section_id)? else {
        return Ok(None);
    };

    let school_periods = grading::list_by_school_year(&conn, &school_id, &school_year)?;
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
        section_advisory::current_adviser_for_section(&conn, &school_id, &section_id, &end_date)?;
    let adviser_name = if let Some(adv) = adviser {
        user::find_by_id(&conn, &adv.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };

    let roster = section_membership::roster_for_section_over_range(
        &conn,
        &school_id,
        &section_id,
        &start_date,
        &end_date,
    )?;

    let class_records = class_record::list_by_section_in_school(&conn, &school_id, &section_id)?;
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
                        &conn,
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

    let export = sf5::build_sf5_export(
        &school,
        &section.name,
        &section.grade_level,
        &school_year,
        adviser_name.as_deref(),
        &distinct_subjects,
        &learner_rows,
    );

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "SF5_{}_{}.csv",
        sanitize_filename_component(&section.name.replace(' ', "_")),
        sanitize_filename_component(&school_year.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(Sf5ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}

/// Writes a school-wide, DepEd-SF6-inspired summarized promotion and proficiency export to
/// `<Documents>/LIKHA-SIS/` (falling back to the app data directory if Documents cannot be resolved).
/// `school_id` is derived strictly from the authenticated session.
#[tauri::command]
pub fn export_school_eosy_sf6(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
) -> AppResult<Option<Sf6ExportResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };

    let school_periods = grading::list_by_school_year(&conn, &school_id, &school_year)?;
    let start_date = school_periods
        .first()
        .map(|p| p.starts_on.clone())
        .unwrap_or_else(|| "2000-01-01".to_string());
    let end_date = school_periods
        .last()
        .map(|p| p.ends_on.clone())
        .unwrap_or_else(|| "2099-12-31".to_string());

    let sections = section::list_by_school(&conn, &school_id)?;
    let mut section_summaries = Vec::with_capacity(sections.len());

    for sec in sections {
        let roster = section_membership::roster_for_section_over_range(
            &conn,
            &school_id,
            &sec.id,
            &start_date,
            &end_date,
        )?;
        let class_records = class_record::list_by_section_in_school(&conn, &school_id, &sec.id)?;
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
                            &conn,
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

    let export = sf6::build_sf6_export(&school, &school_year, &section_summaries);

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "SF6_{}_{}.csv",
        sanitize_filename_component(&school.name.replace(' ', "_")),
        sanitize_filename_component(&school_year.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(Sf6ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}
