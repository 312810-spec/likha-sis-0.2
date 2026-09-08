//! Tauri commands for the DO 006, s. 2026 Child Protection module
//! (ADR-0072) and the multi-silo automated at-risk trigger. Every command
//! gates on `auth::authorize_child_protection_access_for_section` — never
//! a bare `Capability` check — so a general Teacher with no adviser
//! relationship to the target section is denied, matching the task's
//! explicit tighter-than-tenant-scoping requirement. `school_id` is
//! always session-derived, never a client-supplied argument.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::at_risk::{self, AtRiskFlag};
use crate::repository::child_protection::{
    self, BehavioralIncident, InterventionEntryType, InterventionLogEntry, SeverityTier,
};

fn parse_tier(raw: &str) -> AppResult<SeverityTier> {
    match raw {
        "level_1" => Ok(SeverityTier::Level1),
        "level_2" => Ok(SeverityTier::Level2),
        "level_3" => Ok(SeverityTier::Level3),
        _ => Err(AppError::InvalidInput(
            "unrecognized severity tier".to_string(),
        )),
    }
}

fn parse_entry_type(raw: &str) -> AppResult<InterventionEntryType> {
    match raw {
        "intervention" => Ok(InterventionEntryType::Intervention),
        "resolution" => Ok(InterventionEntryType::Resolution),
        _ => Err(AppError::InvalidInput(
            "unrecognized intervention entry type".to_string(),
        )),
    }
}

/// Records a new behavioral incident for a learner in `section_id`. Only
/// that section's current adviser, or a School Head, may do this.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_behavioral_incident(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    section_id: String,
    severity_tier: String,
    category: String,
    description: String,
    incident_date: String,
) -> AppResult<BehavioralIncident> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &incident_date,
    )?;
    let tier = parse_tier(&severity_tier)?;

    let category = category.trim();
    let description = description.trim();
    if category.is_empty() {
        return Err(AppError::InvalidInput(
            "incident category must not be empty".to_string(),
        ));
    }
    if description.is_empty() {
        return Err(AppError::InvalidInput(
            "incident description must not be empty".to_string(),
        ));
    }

    child_protection::create_incident(
        &conn,
        &school_id,
        &learner_id,
        &section_id,
        &user_id,
        tier,
        category,
        description,
        &incident_date,
    )
}

/// All incidents for one section, newest first — same gate as
/// [`record_behavioral_incident`].
#[tauri::command]
pub fn list_behavioral_incidents_for_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<BehavioralIncident>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    child_protection::list_for_section(&conn, &school_id, &section_id)
}

/// Appends one intervention/resolution entry — the caller must already
/// be authorized for the incident's own section.
#[tauri::command]
pub fn add_incident_intervention(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    incident_id: String,
    section_id: String,
    as_of_date: String,
    entry_type: String,
    note: String,
) -> AppResult<InterventionLogEntry> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let entry_type = parse_entry_type(&entry_type)?;
    let note = note.trim();
    if note.is_empty() {
        return Err(AppError::InvalidInput(
            "intervention note must not be empty".to_string(),
        ));
    }
    // Defense-in-depth: confirm the incident itself really belongs to the
    // authorized section, not merely to the caller's school — a forged
    // `incident_id` from a different section must not be writable just
    // because the caller advises `section_id`.
    let Some(incident) = child_protection::find_incident_by_id(&conn, &school_id, &incident_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if incident.section_id != section_id {
        return Err(AppError::Unauthorized);
    }

    child_protection::add_intervention(&conn, &school_id, &incident_id, &user_id, entry_type, note)
}

/// The full append-only intervention log for one incident.
#[tauri::command]
pub fn list_incident_interventions(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    incident_id: String,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<InterventionLogEntry>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let Some(incident) = child_protection::find_incident_by_id(&conn, &school_id, &incident_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if incident.section_id != section_id {
        return Err(AppError::Unauthorized);
    }
    child_protection::list_interventions_for_incident(&conn, &school_id, &incident_id)
}

/// Multi-silo automated at-risk detection for one section, computed on
/// read — same gate as every other child-protection command (this is
/// still child-protection-adjacent PII: which learners are flagged as at
/// risk).
#[tauri::command]
pub fn get_at_risk_flags_for_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    school_year: String,
    as_of_date: String,
) -> AppResult<Vec<AtRiskFlag>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    at_risk::compute_for_section(&conn, &school_id, &section_id, &school_year, &as_of_date)
}
