use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::export::learner_roster;
use crate::export::report_card::{self, ReportCardRow};
use crate::export::sanitize_filename_component;
use crate::export::sf10::{self, Sf10YearRow};
use crate::export::sf2;
use crate::export::sf4::{self, Sf4SectionSummary};
use crate::export::sf5::{self, Sf5LearnerRow, Sf5SubjectGrade};
use crate::export::sf6::{self, Sf6SectionSummary};
use crate::export::FieldDisclosure;
use crate::repository::{
    attendance, class_record, grading, grading_computation, learner, school, section,
    section_advisory, section_membership, user,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sf4ExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

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
pub struct Sf10ExportResult {
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

    // Session-derived only, never client-supplied -- used here purely to
    // compute a correct `as_of_date` fallback before the real authorization
    // check below (which independently re-derives and re-verifies
    // school_id/section ownership; this lookup grants nothing on its own).
    // A prior version of this query passed an empty-string school_id here,
    // which `grading::list_by_school_year`'s exact-match `WHERE` clause can
    // never match -- `periods` was silently always empty, so `as_of_date`
    // silently always took the year-boundary fallback below instead of the
    // real last grading period's end date.
    let session_school_id = sessions.require_active_school_scope(&conn)?;
    let periods =
        grading::list_by_school_year(&conn, &session_school_id, &school_year).unwrap_or_default();
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

/// Consolidates monthly attendance and learner movement metrics across all sections
/// and grade levels in the school for a given month and year into a DepEd School Form 4 (SF4)
/// CSV export file.
#[tauri::command]
pub fn export_school_monthly_attendance_sf4(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    year: i32,
    month: u32,
) -> AppResult<Option<Sf4ExportResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };

    if !(1..=12).contains(&month) {
        return Ok(None);
    }

    let sections = section::list_by_school(&conn, &school_id)?;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) => 29,
        _ => 28,
    };
    let as_of_date = format!("{year}-{month:02}-{days_in_month:02}");

    let mut section_summaries = Vec::new();

    for sec in sections {
        let report = attendance::monthly_grid_for_section(&conn, &school_id, &sec.id, year, month)?;
        let adviser =
            section_advisory::current_adviser_for_section(&conn, &school_id, &sec.id, &as_of_date)?;
        let adviser_name = if let Some(adv) = adviser {
            user::find_by_id(&conn, &adv.teacher_user_id)?.map(|u| u.display_name)
        } else {
            None
        };

        let mut reg_m: u32 = 0;
        let mut reg_f: u32 = 0;
        let mut att_days_m: u32 = 0;
        let mut att_days_f: u32 = 0;
        let mut att_days_total: u32 = 0;

        for l in &report.learners {
            let is_m = l
                .sex
                .as_deref()
                .map(|s| s.eq_ignore_ascii_case("male") || s.eq_ignore_ascii_case("m"))
                .unwrap_or(false);
            let is_f = l
                .sex
                .as_deref()
                .map(|s| s.eq_ignore_ascii_case("female") || s.eq_ignore_ascii_case("f"))
                .unwrap_or(false);

            let l_att = l.present_count + l.tardy_count;
            if is_m {
                reg_m += 1;
                att_days_m += l_att;
            } else if is_f {
                reg_f += 1;
                att_days_f += l_att;
            }
            att_days_total += l_att;
        }
        let reg_total = report.learners.len() as u32;

        let num_school_days = report.school_days.len();
        let num_days_f64 = num_school_days as f64;

        let daily_avg_m = if num_school_days > 0 {
            att_days_m as f64 / num_days_f64
        } else {
            0.0
        };
        let daily_avg_f = if num_school_days > 0 {
            att_days_f as f64 / num_days_f64
        } else {
            0.0
        };
        let daily_avg_total = if num_school_days > 0 {
            att_days_total as f64 / num_days_f64
        } else {
            0.0
        };

        let attendance_pct_m = if reg_m > 0 && num_school_days > 0 {
            (att_days_m as f64 / (reg_m as f64 * num_days_f64)) * 100.0
        } else {
            0.0
        };
        let attendance_pct_f = if reg_f > 0 && num_school_days > 0 {
            (att_days_f as f64 / (reg_f as f64 * num_days_f64)) * 100.0
        } else {
            0.0
        };
        let attendance_pct_total = if reg_total > 0 && num_school_days > 0 {
            (att_days_total as f64 / (reg_total as f64 * num_days_f64)) * 100.0
        } else {
            0.0
        };

        section_summaries.push(Sf4SectionSummary {
            section_id: sec.id,
            section_name: sec.name,
            grade_level: sec.grade_level,
            adviser_name,
            registered_male: reg_m,
            registered_female: reg_f,
            registered_total: reg_total,
            daily_avg_male: daily_avg_m,
            daily_avg_female: daily_avg_f,
            daily_avg_total,
            attendance_pct_male: attendance_pct_m,
            attendance_pct_female: attendance_pct_f,
            attendance_pct_total,
        });
    }

    let export = sf4::build_sf4_export(&school, year, month, &section_summaries);

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "SF4_{}_{year}-{month:02}.csv",
        sanitize_filename_component(&school.name.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(Sf4ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}

/// Writes a learner-level, DepEd-SF10-inspired cumulative Permanent
/// Academic Record export to `<Documents>/LIKHA-SIS/` -- one block per
/// distinct school year the learner has ever been enrolled in (oldest
/// first, mirroring `section_membership::list_by_learner_in_school`'s own
/// ordering), each listing that year's subject final grades, computed
/// General Average, and Action Taken. See `export::sf10`'s module doc
/// comment: content-based, not the official DepEd `.xlsx` template.
///
/// Gated by `Capability::ManageLearners` -- the same Registrar-or-School-
/// Head gate `create_learner`/`update_learner` already use -- because a
/// single learner's whole multi-year grade history is more concentrated
/// PII than a school-wide aggregate summary (SF6, session-only-gated) or
/// a section-scoped roster (SF5, adviser-of-section-gated); an ordinary
/// teacher with no administrative role has no reason to pull one
/// learner's entire academic history at once. `learner_id` is
/// client-supplied the same legitimate way `section_id`/`class_record_id`
/// already are elsewhere in this file -- isolation holds because
/// `learner::find_by_id_in_school` resolves to `None` for a foreign
/// learner, returning `None` here too rather than exporting anything.
#[tauri::command]
pub fn export_learner_permanent_record_sf10(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<Sf10ExportResult>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let Some(learner_row) = learner::find_by_id_in_school(&conn, &school_id, &learner_id)? else {
        return Ok(None);
    };

    let memberships =
        section_membership::list_by_learner_in_school(&conn, &school_id, &learner_id)?;

    // Group memberships by school year, preserving the oldest-first order
    // `list_by_learner_in_school` already returns. A learner re-sectioned
    // within one school year (e.g. a mid-year transfer, Wave 2P) collapses
    // into ONE row for that year, not a duplicate -- the display label
    // (grade level/section name) tracks the LATEST section seen for that
    // year, but subject grades below are aggregated across every section
    // the learner sat in that year, not just the last one.
    struct YearGroup {
        school_year: String,
        grade_level: String,
        section_name: String,
        section_ids: Vec<String>,
    }
    let mut year_groups: Vec<YearGroup> = Vec::new();
    for membership in &memberships {
        let Some(section) =
            section::find_by_id_in_school(&conn, &school_id, &membership.section_id)?
        else {
            continue;
        };
        if let Some(group) = year_groups
            .iter_mut()
            .find(|g| g.school_year == section.school_year)
        {
            group.grade_level = section.grade_level.clone();
            group.section_name = section.name.clone();
            if !group.section_ids.contains(&section.id) {
                group.section_ids.push(section.id.clone());
            }
        } else {
            year_groups.push(YearGroup {
                school_year: section.school_year.clone(),
                grade_level: section.grade_level.clone(),
                section_name: section.name.clone(),
                section_ids: vec![section.id.clone()],
            });
        }
    }

    let mut year_rows = Vec::with_capacity(year_groups.len());
    for group in &year_groups {
        let mut filtered_records = Vec::new();
        for section_id in &group.section_ids {
            let class_records =
                class_record::list_by_section_in_school(&conn, &school_id, section_id)?;
            filtered_records.extend(
                class_records
                    .into_iter()
                    .filter(|cr| cr.school_year == group.school_year),
            );
        }

        let mut distinct_subjects: Vec<String> = filtered_records
            .iter()
            .map(|cr| cr.subject_name.clone())
            .collect();
        distinct_subjects.sort();
        distinct_subjects.dedup();

        let mut subject_grades = Vec::with_capacity(distinct_subjects.len());
        for subj in &distinct_subjects {
            let subj_records: Vec<_> = filtered_records
                .iter()
                .filter(|cr| cr.subject_name == *subj)
                .collect();

            let mut sum = 0.0;
            let mut count = 0;
            let mut all_scored = true;
            for cr in subj_records {
                let computed = grading_computation::compute_term_grade(
                    &conn,
                    &school_id,
                    &cr.id,
                    &learner_id,
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

        let (general_average, promotion_status) = Sf5LearnerRow::compute_status(&subject_grades);

        year_rows.push(Sf10YearRow {
            school_year: group.school_year.clone(),
            grade_level: group.grade_level.clone(),
            section_name: group.section_name.clone(),
            subject_grades,
            general_average,
            promotion_status,
        });
    }

    let export = sf10::build_sf10_export(
        &school,
        &learner_row.given_name,
        &learner_row.family_name,
        learner_row.lrn.as_deref(),
        learner_row.sex.as_deref(),
        &year_rows,
    );

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    // Falls back to the learner's own (unique) id rather than a fixed
    // "NO-LRN" placeholder when LRN is unrecorded -- two same-named
    // learners without an LRN yet would otherwise collide onto the same
    // filename and silently overwrite each other's export.
    let file_name = format!(
        "SF10_{}_{}.csv",
        sanitize_filename_component(
            &format!("{}_{}", learner_row.family_name, learner_row.given_name).replace(' ', "_")
        ),
        sanitize_filename_component(learner_row.lrn.as_deref().unwrap_or(&learner_row.id)),
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(Some(Sf10ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    }))
}
