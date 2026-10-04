//! Versioned school configuration. It records evidence; it never changes historical grades.
use crate::{
    attachments::{invalid, is_head},
    auth::SessionManager,
    commands::lock_db,
    error::{AppError, AppResult},
    school_resources::date,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfferingInput {
    pub previous_id: Option<String>,
    pub school_year: String,
    pub grade_level: String,
    pub subject_id: String,
    pub cohort: String,
    pub term_label: String,
    pub effective_from: String,
    pub effective_until: String,
    pub weekly_minutes: i64,
    pub source_title: String,
    pub source_reference: String,
    pub verification_state: String,
    pub profile_manifest_json: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolOffering {
    pub id: String,
    pub input: OfferingInput,
    pub snapshot_hash: String,
    pub created_at: String,
}
fn bounded(s: &str, max: usize) -> bool {
    !s.trim().is_empty() && s.len() <= max
}
fn validate(i: &OfferingInput) -> AppResult<()> {
    let year = i
        .school_year
        .split_once('-')
        .and_then(|(a, b)| Some((a.parse::<u32>().ok()?, b.parse::<u32>().ok()?)));
    if i.school_year.len() != 9 || !matches!(year,Some((a,b)) if a>=1900 && a<9999 && b==a+1) {
        return Err(invalid("Use a school year such as 2026-2027."));
    }
    if !matches!(
        i.grade_level.as_str(),
        "K" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "11" | "12"
    ) || !(1..=2400).contains(&i.weekly_minutes)
    {
        return Err(invalid("Choose a grade and weekly minutes from 1 to 2400."));
    }
    date(&i.effective_from)?;
    date(&i.effective_until)?;
    if i.effective_until < i.effective_from {
        return Err(invalid("The end date must follow the start date."));
    }
    if !bounded(&i.cohort, 120)
        || !bounded(&i.term_label, 120)
        || !bounded(&i.source_title, 300)
        || i.source_reference.len() > 2000
    {
        return Err(invalid(
            "Provide cohort, term and source details within their limits.",
        ));
    }
    if !matches!(i.verification_state.as_str(), "draft" | "school_confirmed")
        || (i.verification_state == "school_confirmed" && !bounded(&i.source_reference, 2000))
    {
        return Err(invalid("School confirmation requires a source reference."));
    }
    if i.profile_manifest_json.len() > 16_384 {
        return Err(invalid("The profile manifest exceeds 16 KiB."));
    }
    let manifest: serde_json::Value = serde_json::from_str(&i.profile_manifest_json)
        .map_err(|_| invalid("Provide a valid profile manifest object."))?;
    if !manifest.is_object() {
        return Err(invalid("The profile manifest must be an object."));
    }
    Ok(())
}
pub fn store(
    c: &Connection,
    school: &str,
    actor: &str,
    input: &OfferingInput,
) -> AppResult<String> {
    if !is_head(c, school, actor)? {
        return Err(AppError::Unauthorized);
    }
    validate(input)?;
    let subject: bool = c.query_row(
        "SELECT EXISTS(SELECT 1 FROM subjects WHERE id=?1 AND school_id=?2)",
        params![input.subject_id, school],
        |r| r.get(0),
    )?;
    if !subject {
        return Err(AppError::Unauthorized);
    }
    if let Some(id) = &input.previous_id {
        let matching:bool=c.query_row("SELECT EXISTS(SELECT 1 FROM school_offering_versions WHERE id=?1 AND school_id=?2 AND school_year=?3 AND grade_level=?4 AND subject_id=?5 AND cohort=?6 AND term_label=?7 AND NOT EXISTS(SELECT 1 FROM school_offering_versions n WHERE n.previous_id=?1))",params![id,school,input.school_year,input.grade_level,input.subject_id,input.cohort,input.term_label],|r|r.get(0))?;
        if !matching {
            return Err(invalid("This offering has changed or belongs to another scope. Reload before making a new version."));
        }
    }
    let snapshot =
        serde_json::to_string(input).map_err(|_| invalid("Unable to capture offering."))?;
    let hash = Sha256::digest(snapshot.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let id = Uuid::now_v7().to_string();
    c.execute("INSERT INTO school_offering_versions(id,school_id,owner_user_id,previous_id,school_year,grade_level,subject_id,cohort,term_label,effective_from,effective_until,weekly_minutes,source_title,source_reference,verification_state,profile_manifest_json,snapshot_hash) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",params![id,school,actor,input.previous_id,input.school_year,input.grade_level,input.subject_id,input.cohort,input.term_label,input.effective_from,input.effective_until,input.weekly_minutes,input.source_title,input.source_reference,input.verification_state,input.profile_manifest_json,hash])?;
    Ok(id)
}
#[tauri::command]
pub fn save_school_offering(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    input: OfferingInput,
) -> AppResult<String> {
    let c = lock_db(&db);
    let (a, s) = sessions.require_active_session(&c)?;
    store(&c, &s, &a, &input)
}
#[tauri::command]
pub fn list_school_offerings(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SchoolOffering>> {
    let c = lock_db(&db);
    let (a, s) = sessions.require_active_session(&c)?;
    let head = is_head(&c, &s, &a)?;
    let mut q=c.prepare("SELECT o.id,o.previous_id,o.school_year,o.grade_level,o.subject_id,o.cohort,o.term_label,o.effective_from,o.effective_until,o.weekly_minutes,o.source_title,o.source_reference,o.verification_state,o.profile_manifest_json,o.snapshot_hash,o.created_at FROM school_offering_versions o WHERE o.school_id=?1 AND (?3 OR EXISTS(SELECT 1 FROM teaching_assignments t JOIN sections sec ON sec.id=t.section_id WHERE t.school_id=?1 AND t.teacher_user_id=?2 AND t.subject_id=o.subject_id AND sec.school_year=o.school_year AND sec.grade_level=o.grade_level)) ORDER BY o.created_at DESC,o.id DESC")?;
    let rows = q
        .query_map(params![s, a, head], |r| {
            Ok(SchoolOffering {
                id: r.get(0)?,
                input: OfferingInput {
                    previous_id: r.get(1)?,
                    school_year: r.get(2)?,
                    grade_level: r.get(3)?,
                    subject_id: r.get(4)?,
                    cohort: r.get(5)?,
                    term_label: r.get(6)?,
                    effective_from: r.get(7)?,
                    effective_until: r.get(8)?,
                    weekly_minutes: r.get(9)?,
                    source_title: r.get(10)?,
                    source_reference: r.get(11)?,
                    verification_state: r.get(12)?,
                    profile_manifest_json: r.get(13)?,
                },
                snapshot_hash: r.get(14)?,
                created_at: r.get(15)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}
#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> OfferingInput {
        OfferingInput {
            previous_id: None,
            school_year: "2026-2027".into(),
            grade_level: "10".into(),
            subject_id: "math".into(),
            cohort: "Current cohort".into(),
            term_label: "Term 1".into(),
            effective_from: "2026-06-01".into(),
            effective_until: "2027-03-31".into(),
            weekly_minutes: 240,
            source_title: "School configuration draft".into(),
            source_reference: String::new(),
            verification_state: "draft".into(),
            profile_manifest_json: "{}".into(),
        }
    }
    #[test]
    fn validates_dates_and_evidence() {
        let mut i = input();
        assert!(validate(&i).is_ok());
        i.verification_state = "school_confirmed".into();
        assert!(validate(&i).is_err());
        i.source_reference = "School approved memorandum".into();
        assert!(validate(&i).is_ok());
        i.effective_from = "2026-02-30".into();
        assert!(validate(&i).is_err());
    }
    #[test]
    fn rejects_bad_profile_and_year() {
        let mut i = input();
        i.profile_manifest_json = "[]".into();
        assert!(validate(&i).is_err());
        i.profile_manifest_json = "{}".into();
        i.school_year = "2026-2028".into();
        assert!(validate(&i).is_err());
    }
}
