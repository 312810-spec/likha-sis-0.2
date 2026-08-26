//! Official-form generation commands — Wave 3. See
//! `docs/adr/0048-official-form-engine-sf1.md`.
//!
//! Plays the same "application service" role `commands::export` already
//! plays for SF2/report-card exports (this crate has no separate Rust
//! application-service layer — commands are it, matching existing
//! convention): reads authorized data through repositories, builds the
//! `formgen::sf1` domain request, resolves a safe output path, and
//! invokes the `OfficialFormGenerator` port. This module is the ONLY
//! place that reads the bundled template resource from disk or touches
//! a `tauri::AppHandle` for form generation — `formgen::umya_adapter`
//! never does either.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{path::BaseDirectory, AppHandle, Manager, State};

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::export::sanitize_filename_component;
use crate::formgen::sf1::{Sf1GenerationRequest, Sf1GenerationResult, Sf1LearnerRow};
use crate::formgen::umya_adapter::UmyaSf1Generator;
use crate::formgen::OfficialFormGenerator;
use crate::repository::{school, section, section_membership};

/// Generates an SF1 (School Register) workbook for one section, as of
/// `as_of_date`, into `<Documents>/LIKHA-SIS/` (same resolution as
/// `export_section_monthly_sf2`, falling back to the app data directory
/// if Documents can't be resolved). No output-path parameter is
/// accepted from the caller at all — the command resolves it itself
/// from sanitized, authorized data, which by construction rules out
/// the entire "malicious/traversal output path" and "overwrite an
/// arbitrary file" threat class (see ADR-0048's "Security and privacy"
/// section — independent security review verified this closes the
/// threat, since `sanitize_filename_component` strips the path
/// separator characters that would make a `..` sequence meaningful).
///
/// `school_id` is session-derived, never a parameter. `section_id` is
/// caller-supplied the same legitimate way `export_section_monthly_sf2`
/// already accepts one — isolation holds because
/// `section::find_by_id_in_school` resolves to `None` for a foreign
/// section, and this command returns `Ok(None)` rather than generating
/// anything.
#[tauri::command]
pub fn generate_sf1_form(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Option<Sf1GenerationResult>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(school) = school::find_by_id(&conn, &school_id)? else {
        return Ok(None);
    };
    let Some(section) = section::find_by_id_in_school(&conn, &school_id, &section_id)? else {
        return Ok(None);
    };
    let roster =
        section_membership::roster_for_section(&conn, &school_id, &section_id, &as_of_date)?;

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

    let template_path = app
        .path()
        .resolve(
            "resources/sf1/sf1_template_synthetic.xlsx",
            BaseDirectory::Resource,
        )
        .map_err(|e| {
            AppError::FormGeneration(format!(
                "the SF1 template resource could not be located: {e}"
            ))
        })?;
    let template_bytes = std::fs::read(&template_path)?;

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;

    let file_name = format!(
        "SF1_{}_{}_{}.xlsx",
        sanitize_filename_component(&section.school_year.replace(' ', "_")),
        sanitize_filename_component(&section.grade_level.replace(' ', "_")),
        sanitize_filename_component(&section.name.replace(' ', "_")),
    );
    let output_path = export_dir.join(file_name);

    let generator = UmyaSf1Generator::sf1_synthetic_v1();
    let result = generator.generate_sf1(&template_bytes, &request, &output_path)?;

    Ok(Some(result))
}
