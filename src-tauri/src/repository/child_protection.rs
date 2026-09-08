//! DO 006, s. 2026 Child Protection module (ADR-0072): 3-tier behavioral
//! incident logging plus an append-only intervention/resolution log.
//!
//! **Tier-naming confidence disclosure**: this session could not
//! confidently source DO 006's exact tier names/thresholds from a primary
//! `deped.gov.ph` document within this session's research budget. Rather
//! than guess at official DepEd vocabulary, `severity_tier` uses a
//! defensible generic 3-level scale (`level_1`/`level_2`/`level_3`,
//! low → high severity). See `docs/adr/0072-child-protection-authorization.md`
//! and `docs/VERIFICATION-DEBT.md` for the open item to re-verify and
//! rename against a sourced primary document.
//!
//! This is child-protection PII — real learner health/behavioral data.
//! Every read/write here is gated by
//! `auth::authorize_child_protection_access_for_section`, never a bare
//! `Capability` role check alone (see that function's doc comment).

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SeverityTier {
    Level1,
    Level2,
    Level3,
}

impl SeverityTier {
    fn as_db_str(self) -> &'static str {
        match self {
            SeverityTier::Level1 => "level_1",
            SeverityTier::Level2 => "level_2",
            SeverityTier::Level3 => "level_3",
        }
    }

    fn from_db_str(raw: &str) -> Option<SeverityTier> {
        match raw {
            "level_1" => Some(SeverityTier::Level1),
            "level_2" => Some(SeverityTier::Level2),
            "level_3" => Some(SeverityTier::Level3),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BehavioralIncident {
    pub id: String,
    pub school_id: String,
    pub learner_id: String,
    pub section_id: String,
    pub reported_by_user_id: Option<String>,
    pub severity_tier: SeverityTier,
    pub category: String,
    pub description: String,
    pub incident_date: String,
    pub resolved_at: Option<String>,
    pub resolved_by_user_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InterventionEntryType {
    Intervention,
    Resolution,
}

impl InterventionEntryType {
    fn as_db_str(self) -> &'static str {
        match self {
            InterventionEntryType::Intervention => "intervention",
            InterventionEntryType::Resolution => "resolution",
        }
    }

    fn from_db_str(raw: &str) -> Option<InterventionEntryType> {
        match raw {
            "intervention" => Some(InterventionEntryType::Intervention),
            "resolution" => Some(InterventionEntryType::Resolution),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterventionLogEntry {
    pub id: String,
    pub incident_id: String,
    pub author_user_id: Option<String>,
    pub entry_type: InterventionEntryType,
    pub note: String,
    pub created_at: String,
}

const INCIDENT_SELECT: &str = "SELECT id, school_id, learner_id, section_id, \
     reported_by_user_id, severity_tier, category, description, incident_date, \
     resolved_at, resolved_by_user_id, created_at \
     FROM behavioral_incidents WHERE school_id = ?1";

fn row_to_incident(row: &rusqlite::Row) -> rusqlite::Result<BehavioralIncident> {
    let tier_raw: String = row.get(5)?;
    Ok(BehavioralIncident {
        id: row.get(0)?,
        school_id: row.get(1)?,
        learner_id: row.get(2)?,
        section_id: row.get(3)?,
        reported_by_user_id: row.get(4)?,
        severity_tier: SeverityTier::from_db_str(&tier_raw).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Text,
                "unknown severity_tier".into(),
            )
        })?,
        category: row.get(6)?,
        description: row.get(7)?,
        incident_date: row.get(8)?,
        resolved_at: row.get(9)?,
        resolved_by_user_id: row.get(10)?,
        created_at: row.get(11)?,
    })
}

/// Records a new behavioral incident. `school_id`/`section_id` are always
/// caller-supplied by the authorization layer, never trusted from an
/// unauthenticated source directly — see
/// `auth::authorize_child_protection_access_for_section`, which every
/// caller of this function must go through first.
#[allow(clippy::too_many_arguments)]
pub fn create_incident(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    section_id: &str,
    reported_by_user_id: &str,
    severity_tier: SeverityTier,
    category: &str,
    description: &str,
    incident_date: &str,
) -> AppResult<BehavioralIncident> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO behavioral_incidents \
            (id, school_id, learner_id, section_id, reported_by_user_id, \
             severity_tier, category, description, incident_date) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (
            &id,
            school_id,
            learner_id,
            section_id,
            reported_by_user_id,
            severity_tier.as_db_str(),
            category,
            description,
            incident_date,
        ),
    )?;
    find_incident_by_id(conn, school_id, &id).map(|opt| opt.expect("just inserted"))
}

pub fn find_incident_by_id(
    conn: &Connection,
    school_id: &str,
    incident_id: &str,
) -> AppResult<Option<BehavioralIncident>> {
    conn.query_row(
        &format!("{INCIDENT_SELECT} AND id = ?2"),
        (school_id, incident_id),
        row_to_incident,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other.into()),
    })
}

/// All incidents for one section, newest first. The caller must already
/// have been authorized for this exact `section_id` — this function does
/// no authorization of its own.
pub fn list_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
) -> AppResult<Vec<BehavioralIncident>> {
    let mut stmt = conn.prepare(&format!(
        "{INCIDENT_SELECT} AND section_id = ?2 ORDER BY incident_date DESC, created_at DESC"
    ))?;
    let rows = stmt.query_map((school_id, section_id), row_to_incident)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// All incidents for one learner across every section, newest first —
/// used by a school-wide (School Head) view; a section-scoped adviser
/// caller should use [`list_for_section`] instead so they never see a
/// learner's incidents recorded in a section they don't advise.
pub fn list_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<BehavioralIncident>> {
    let mut stmt = conn.prepare(&format!(
        "{INCIDENT_SELECT} AND learner_id = ?2 ORDER BY incident_date DESC, created_at DESC"
    ))?;
    let rows = stmt.query_map((school_id, learner_id), row_to_incident)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Appends one intervention/resolution entry to an incident's log.
/// Deliberately INSERT-only — there is no `update_intervention`/
/// `delete_intervention` function in this module at all, matching the
/// append-only contract migration 44 documents.
pub fn add_intervention(
    conn: &Connection,
    school_id: &str,
    incident_id: &str,
    author_user_id: &str,
    entry_type: InterventionEntryType,
    note: &str,
) -> AppResult<InterventionLogEntry> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO incident_interventions \
            (id, incident_id, school_id, author_user_id, entry_type, note) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            incident_id,
            school_id,
            author_user_id,
            entry_type.as_db_str(),
            note,
        ),
    )?;
    // A `resolution` entry also marks the incident itself resolved (a
    // status transition on the incident row, never a rewrite of its
    // narrative content — see migration 44's comment).
    if entry_type == InterventionEntryType::Resolution {
        conn.execute(
            "UPDATE behavioral_incidents \
             SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), resolved_by_user_id = ?3 \
             WHERE school_id = ?1 AND id = ?2 AND resolved_at IS NULL",
            (school_id, incident_id, author_user_id),
        )?;
    }
    let row = conn.query_row(
        "SELECT id, incident_id, author_user_id, entry_type, note, created_at \
         FROM incident_interventions WHERE school_id = ?1 AND id = ?2",
        (school_id, &id),
        |row| {
            let entry_raw: String = row.get(3)?;
            Ok(InterventionLogEntry {
                id: row.get(0)?,
                incident_id: row.get(1)?,
                author_user_id: row.get(2)?,
                entry_type: InterventionEntryType::from_db_str(&entry_raw).ok_or_else(|| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Text,
                        "unknown entry_type".into(),
                    )
                })?,
                note: row.get(4)?,
                created_at: row.get(5)?,
            })
        },
    )?;
    Ok(row)
}

/// The full append-only intervention log for one incident, oldest first
/// (a chronological progress record).
pub fn list_interventions_for_incident(
    conn: &Connection,
    school_id: &str,
    incident_id: &str,
) -> AppResult<Vec<InterventionLogEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, incident_id, author_user_id, entry_type, note, created_at \
         FROM incident_interventions WHERE school_id = ?1 AND incident_id = ?2 \
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map((school_id, incident_id), |row| {
        let entry_raw: String = row.get(3)?;
        Ok(InterventionLogEntry {
            id: row.get(0)?,
            incident_id: row.get(1)?,
            author_user_id: row.get(2)?,
            entry_type: InterventionEntryType::from_db_str(&entry_raw).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    3,
                    rusqlite::types::Type::Text,
                    "unknown entry_type".into(),
                )
            })?,
            note: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn setup() -> Connection {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Ana', 'Delacruz')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '5', 'Section A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('u1', 'adviser1', 'hash', 'Adviser One')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn create_incident_round_trips_every_field() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level2,
            "bullying",
            "Synthetic test description of a fabricated incident.",
            "2026-09-01",
        )
        .unwrap();
        assert_eq!(incident.severity_tier, SeverityTier::Level2);
        assert_eq!(incident.category, "bullying");
        assert!(incident.resolved_at.is_none());
    }

    #[test]
    fn list_for_section_only_returns_that_sections_incidents() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec2', 's1', '2026-2027', '5', 'Section B')",
            [],
        )
        .unwrap();
        create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness pattern",
            "Synthetic incident in section A.",
            "2026-09-01",
        )
        .unwrap();
        create_incident(
            &conn,
            "s1",
            "l1",
            "sec2",
            "u1",
            SeverityTier::Level3,
            "fighting",
            "Synthetic incident in section B.",
            "2026-09-02",
        )
        .unwrap();

        let sec1_incidents = list_for_section(&conn, "s1", "sec1").unwrap();
        assert_eq!(sec1_incidents.len(), 1);
        assert_eq!(sec1_incidents[0].section_id, "sec1");
    }

    #[test]
    fn add_intervention_appends_without_touching_earlier_entries() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level2,
            "bullying",
            "Synthetic test description.",
            "2026-09-01",
        )
        .unwrap();

        add_intervention(
            &conn,
            "s1",
            &incident.id,
            "u1",
            InterventionEntryType::Intervention,
            "Synthetic: met with learner and guardian.",
        )
        .unwrap();
        add_intervention(
            &conn,
            "s1",
            &incident.id,
            "u1",
            InterventionEntryType::Intervention,
            "Synthetic: follow-up counseling session held.",
        )
        .unwrap();

        let log = list_interventions_for_incident(&conn, "s1", &incident.id).unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].note, "Synthetic: met with learner and guardian.");
        assert_eq!(log[1].note, "Synthetic: follow-up counseling session held.");
    }

    #[test]
    fn a_resolution_entry_marks_the_incident_resolved_without_rewriting_its_description() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level2,
            "bullying",
            "Original synthetic description.",
            "2026-09-01",
        )
        .unwrap();

        add_intervention(
            &conn,
            "s1",
            &incident.id,
            "u1",
            InterventionEntryType::Resolution,
            "Synthetic: resolved after mediation.",
        )
        .unwrap();

        let reloaded = find_incident_by_id(&conn, "s1", &incident.id)
            .unwrap()
            .unwrap();
        assert!(reloaded.resolved_at.is_some());
        assert_eq!(reloaded.resolved_by_user_id.as_deref(), Some("u1"));
        // The narrative description is untouched -- only the status
        // transition columns changed.
        assert_eq!(reloaded.description, "Original synthetic description.");
    }

    #[test]
    fn a_second_resolution_entry_does_not_overwrite_the_first_resolution_timestamp() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness",
            "Synthetic description.",
            "2026-09-01",
        )
        .unwrap();
        add_intervention(
            &conn,
            "s1",
            &incident.id,
            "u1",
            InterventionEntryType::Resolution,
            "Synthetic: first resolution note.",
        )
        .unwrap();
        let first = find_incident_by_id(&conn, "s1", &incident.id)
            .unwrap()
            .unwrap();

        add_intervention(
            &conn,
            "s1",
            &incident.id,
            "u1",
            InterventionEntryType::Resolution,
            "Synthetic: a later correction/follow-up note.",
        )
        .unwrap();
        let second = find_incident_by_id(&conn, "s1", &incident.id)
            .unwrap()
            .unwrap();

        assert_eq!(first.resolved_at, second.resolved_at);
        // Both entries still appear in the append-only log.
        let log = list_interventions_for_incident(&conn, "s1", &incident.id).unwrap();
        assert_eq!(log.len(), 2);
    }

    #[test]
    fn list_for_learner_spans_every_section() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec2', 's1', '2026-2027', '5', 'Section B')",
            [],
        )
        .unwrap();
        create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness",
            "Synthetic incident A.",
            "2026-09-01",
        )
        .unwrap();
        create_incident(
            &conn,
            "s1",
            "l1",
            "sec2",
            "u1",
            SeverityTier::Level2,
            "disruption",
            "Synthetic incident B.",
            "2026-09-05",
        )
        .unwrap();

        let all = list_for_learner(&conn, "s1", "l1").unwrap();
        assert_eq!(all.len(), 2);
    }
}
