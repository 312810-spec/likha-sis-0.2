use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::export::report_card::{self, ReportCardRow};
use crate::export::sanitize_filename_component;
use crate::export::sf2;
use crate::export::FieldDisclosure;
use crate::repository::{attendance, class_record, grading_computation, school, section, section_membership};

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

    let export = sf2::build_sf2_export(&school, &section, &report);

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
    let Some(detail) = class_record::find_detail_by_id_in_school(&conn, &school_id, &class_record_id)?
    else {
        return Ok(None);
    };
    let Some((section_id, starts_on, ends_on)) =
        class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)?
    else {
        return Ok(None);
    };

    let roster = section_membership::roster_for_section_over_range(
        &conn, &school_id, &section_id, &starts_on, &ends_on,
    )?;
    let mut rows = Vec::with_capacity(roster.len());
    for member in roster {
        let grade =
            grading_computation::compute_term_grade(&conn, &school_id, &class_record_id, &member.learner_id)?;
        rows.push(ReportCardRow {
            learner_id: member.learner_id,
            given_name: member.given_name,
            family_name: member.family_name,
            lrn: member.lrn,
            grade,
        });
    }

    let export = report_card::build_report_card_export(&school, &detail, &rows);

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
