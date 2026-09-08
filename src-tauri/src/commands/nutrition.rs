//! Tauri commands for the SF8 Health & Nutrition Engine (ADR-0071).
//! `school_id` is always derived from the authenticated session, never a
//! client-supplied argument, per `docs/adr/0004-authentication-and-local-session.md`.
//! Both commands gate on `Capability::ManageHealthRecords` (Registrar,
//! School Head) -- see that capability's doc comment in `auth::mod` for
//! the scope decision.

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::{Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::health::consolidation::{self, ConsolidationResult, GradeLevelPercentages};
use crate::repository::nutrition::{self, NutritionRecord, Period};
use crate::repository::{grading, section, section_membership};

/// Records one BOSY/EOSY nutrition measurement for a learner. Age and BMI
/// are always computed server-side from `birth_date`/`measurement_date`/
/// `height_m`/`weight_kg` -- never accepted pre-computed from the caller.
/// See `repository::nutrition::record_measurement` for validation detail.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_nutrition_measurement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    school_year: String,
    period: String,
    grade_level: String,
    sex: String,
    birth_date: String,
    measurement_date: String,
    height_m: f64,
    weight_kg: f64,
) -> AppResult<NutritionRecord> {
    let conn = lock_db(&db);
    let school_id =
        crate::auth::authorize_capability(&conn, &sessions, Capability::ManageHealthRecords)?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;

    nutrition::record_measurement(
        &conn,
        &school_id,
        &learner_id,
        &school_year,
        period,
        &grade_level,
        &sex,
        &birth_date,
        &measurement_date,
        height_m,
        weight_kg,
    )
}

/// The learner's own nutrition record for one school year + period, if
/// any.
#[tauri::command]
pub fn get_nutrition_record_for_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    school_year: String,
    period: String,
) -> AppResult<Option<NutritionRecord>> {
    let conn = lock_db(&db);
    let school_id =
        crate::auth::authorize_capability(&conn, &sessions, Capability::ManageHealthRecords)?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;
    nutrition::find_for_learner(&conn, &school_id, &learner_id, &school_year, period)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeLevelWithPercentages {
    #[serde(flatten)]
    pub row: crate::health::consolidation::GradeLevelRow,
    pub pct: GradeLevelPercentages,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NutritionConsolidationReport {
    pub grade_levels: Vec<GradeLevelWithPercentages>,
    pub grand_total: GradeLevelWithPercentages,
}

fn with_pct(row: crate::health::consolidation::GradeLevelRow) -> GradeLevelWithPercentages {
    let pct = consolidation::with_percentages(&row);
    GradeLevelWithPercentages { row, pct }
}

fn to_report(result: ConsolidationResult) -> NutritionConsolidationReport {
    NutritionConsolidationReport {
        grade_levels: result.grade_levels.into_iter().map(with_pct).collect(),
        grand_total: with_pct(result.grand_total),
    }
}

/// The school-wide BOSY-vs-EOSY Nutritional Status Report for one school
/// year + period, aggregated by grade level. Enrolment is derived from
/// every section active during `school_year` (mirroring
/// `commands::export::export_school_eosy_sf6`'s own roster-building
/// pattern); nutrition data comes from every `nutrition_records` row
/// captured for the same school year + period. `grade_levels_offered`
/// controls display order only.
#[tauri::command]
pub fn get_nutrition_consolidation_report(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    period: String,
    grade_levels_offered: Vec<String>,
) -> AppResult<NutritionConsolidationReport> {
    let conn = lock_db(&db);
    let school_id =
        crate::auth::authorize_capability(&conn, &sessions, Capability::ManageHealthRecords)?;
    let period = Period::parse(&period)
        .ok_or_else(|| AppError::InvalidInput("unrecognized nutrition period".to_string()))?;

    let sections: Vec<_> = section::list_by_school(&conn, &school_id)?
        .into_iter()
        .filter(|s| s.school_year == school_year)
        .collect();

    // Same fallback shape as `commands::export::export_school_eosy_sf6`:
    // the school's own grading periods bound the school year when
    // present, else a wide-open default range.
    let school_periods = grading::list_by_school_year(&conn, &school_id, &school_year)?;
    let start_date = school_periods
        .first()
        .map(|p| p.starts_on.clone())
        .unwrap_or_else(|| "2000-01-01".to_string());
    let end_date = school_periods
        .last()
        .map(|p| p.ends_on.clone())
        .unwrap_or_else(|| "2099-12-31".to_string());

    let mut enrollment = Vec::new();
    for sec in &sections {
        let roster = section_membership::roster_for_section_over_range(
            &conn,
            &school_id,
            &sec.id,
            &start_date,
            &end_date,
        )?;
        for member in roster {
            if let Some(row) = nutrition::to_enrollment_row(&sec.grade_level, member.sex.as_deref())
            {
                enrollment.push(row);
            }
        }
    }

    let records = nutrition::list_for_school_year_period(&conn, &school_id, &school_year, period)?;
    let summaries: Vec<_> = records
        .iter()
        .filter_map(nutrition::to_consolidation_summary)
        .collect();

    let result =
        consolidation::consolidate_by_grade_level(&enrollment, &summaries, &grade_levels_offered);
    Ok(to_report(result))
}
