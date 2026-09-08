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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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

/// Materializes a pulled sync change: an `INSERT ... ON CONFLICT(id) DO
/// UPDATE` keyed on the row's own stable `id`, mirroring
/// `lesson_plan::upsert_from_sync` exactly. `behavioral_incidents` has no
/// `UNIQUE` constraint besides its own `id` primary key (unlike
/// `LessonPlan`/`NutritionRecord`), so there is no distinct-natural-key
/// collision scenario to guard against here -- see this module's own
/// sync-wiring doc comment for that explicit statement, rather than
/// silently assuming one exists.
pub fn upsert_incident_from_sync(
    conn: &Connection,
    incident: &BehavioralIncident,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO behavioral_incidents \
            (id, school_id, learner_id, section_id, reported_by_user_id, \
             severity_tier, category, description, incident_date, \
             resolved_at, resolved_by_user_id, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12) \
         ON CONFLICT(id) DO UPDATE SET \
             severity_tier = excluded.severity_tier, \
             category = excluded.category, \
             description = excluded.description, \
             incident_date = excluded.incident_date, \
             resolved_at = excluded.resolved_at, \
             resolved_by_user_id = excluded.resolved_by_user_id",
        (
            &incident.id,
            &incident.school_id,
            &incident.learner_id,
            &incident.section_id,
            &incident.reported_by_user_id,
            incident.severity_tier.as_db_str(),
            &incident.category,
            &incident.description,
            &incident.incident_date,
            &incident.resolved_at,
            &incident.resolved_by_user_id,
            &incident.created_at,
        ),
    )?;
    Ok(())
}

/// Materializes a pulled sync change for an intervention/resolution log
/// entry. `incident_interventions` is append-only (see this module's own
/// doc comment) and has no `UNIQUE` constraint besides `id` -- same
/// "no distinct natural key to collide on" note as
/// `upsert_incident_from_sync` above. This never re-runs the
/// resolution-marks-the-incident-resolved side effect `add_intervention`
/// performs -- the incoming `BehavioralIncident` change (pushed
/// alongside this one, see
/// `commands::child_protection::enqueue_intervention_sync_change`)
/// already carries that state directly. `InterventionLogEntry` itself
/// carries no `school_id` field (it always resolves through its parent
/// incident), so `school_id` comes from the caller's own
/// already-checked tenant scope -- matching every other entity's
/// `incoming.school_id != school_id` check, just supplied directly
/// rather than read back out of the payload.
pub fn upsert_intervention_from_sync(
    conn: &Connection,
    school_id: &str,
    entry: &InterventionLogEntry,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO incident_interventions \
            (id, incident_id, school_id, author_user_id, entry_type, note, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(id) DO UPDATE SET \
             note = excluded.note",
        (
            &entry.id,
            &entry.incident_id,
            school_id,
            &entry.author_user_id,
            entry.entry_type.as_db_str(),
            &entry.note,
            &entry.created_at,
        ),
    )?;
    Ok(())
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

/// One intervention/resolution log entry by its own `id`, tenant-scoped
/// by `school_id` (the `incident_interventions` table carries `school_id`
/// even though `InterventionLogEntry` itself does not, see
/// `upsert_intervention_from_sync`'s doc comment). Added for the
/// conflict-review screen's local-version preview
/// (`commands::conflict_review::local_preview`) -- a conflict's
/// `entity_id` is the intervention's own id, not its parent incident's,
/// so `list_interventions_for_incident` (keyed by incident) cannot serve
/// that lookup.
pub fn find_intervention_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<InterventionLogEntry>> {
    conn.query_row(
        "SELECT id, incident_id, author_user_id, entry_type, note, created_at \
         FROM incident_interventions WHERE school_id = ?1 AND id = ?2",
        (school_id, id),
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
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
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

    fn sample_incoming_incident(id: &str) -> BehavioralIncident {
        BehavioralIncident {
            id: id.to_string(),
            school_id: "s1".to_string(),
            learner_id: "l1".to_string(),
            section_id: "sec1".to_string(),
            reported_by_user_id: Some("u1".to_string()),
            severity_tier: SeverityTier::Level2,
            category: "bullying".to_string(),
            description: "Synthetic incoming description.".to_string(),
            incident_date: "2026-09-01".to_string(),
            resolved_at: None,
            resolved_by_user_id: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_incident_from_sync_inserts_an_incident_this_device_has_never_seen() {
        let conn = setup();
        let incoming = sample_incoming_incident("bi1");

        upsert_incident_from_sync(&conn, &incoming).unwrap();

        let found = find_incident_by_id(&conn, "s1", "bi1").unwrap().unwrap();
        assert_eq!(found.category, "bullying");
    }

    #[test]
    fn upsert_incident_from_sync_updates_an_existing_row_in_place_without_a_duplicate() {
        let conn = setup();
        let original = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness",
            "Original synthetic description.",
            "2026-09-01",
        )
        .unwrap();

        let updated = BehavioralIncident {
            resolved_at: Some("2026-09-05T00:00:00.000Z".to_string()),
            resolved_by_user_id: Some("u1".to_string()),
            ..original.clone()
        };
        upsert_incident_from_sync(&conn, &updated).unwrap();

        let found = find_incident_by_id(&conn, "s1", &original.id)
            .unwrap()
            .unwrap();
        assert!(found.resolved_at.is_some());
        let all = list_for_section(&conn, "s1", "sec1").unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }

    /// Unlike `LessonPlan`/`NutritionRecord`, `behavioral_incidents` has
    /// no `UNIQUE` constraint besides its own `id` primary key (confirmed
    /// against migration 44's own `CREATE TABLE`) -- so there is no
    /// distinct-natural-key collision scenario for this entity to guard
    /// against, and no such test is written here. This is stated
    /// explicitly, not silently assumed: an `ON CONFLICT(id) DO UPDATE`
    /// against a table whose only uniqueness IS `id` can never trip a
    /// second constraint the way `LessonPlan`'s
    /// `UNIQUE (teaching_assignment_id, plan_date)` or
    /// `NutritionRecord`'s `UNIQUE (learner_id, school_year, period)` can.
    #[test]
    fn behavioral_incidents_has_no_unique_constraint_besides_id_so_no_collision_scenario_exists() {
        let conn = setup();
        let first = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness",
            "First synthetic incident.",
            "2026-09-01",
        )
        .unwrap();
        // A second incident for the exact same learner/section/date is
        // accepted without error -- there is nothing to collide on.
        let second = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level1,
            "tardiness",
            "Second synthetic incident, same day.",
            "2026-09-01",
        )
        .unwrap();
        assert_ne!(first.id, second.id);
    }

    fn sample_incoming_intervention(id: &str, incident_id: &str) -> InterventionLogEntry {
        InterventionLogEntry {
            id: id.to_string(),
            incident_id: incident_id.to_string(),
            author_user_id: Some("u1".to_string()),
            entry_type: InterventionEntryType::Intervention,
            note: "Synthetic incoming intervention note.".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_intervention_from_sync_inserts_an_entry_this_device_has_never_seen() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level2,
            "bullying",
            "Synthetic description.",
            "2026-09-01",
        )
        .unwrap();
        let incoming = sample_incoming_intervention("ii1", &incident.id);

        upsert_intervention_from_sync(&conn, "s1", &incoming).unwrap();

        let log = list_interventions_for_incident(&conn, "s1", &incident.id).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].note, "Synthetic incoming intervention note.");
    }

    #[test]
    fn upsert_intervention_from_sync_is_idempotent_on_the_same_id() {
        let conn = setup();
        let incident = create_incident(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            SeverityTier::Level2,
            "bullying",
            "Synthetic description.",
            "2026-09-01",
        )
        .unwrap();
        let incoming = sample_incoming_intervention("ii1", &incident.id);

        upsert_intervention_from_sync(&conn, "s1", &incoming).unwrap();
        upsert_intervention_from_sync(&conn, "s1", &incoming).unwrap();

        let log = list_interventions_for_incident(&conn, "s1", &incident.id).unwrap();
        assert_eq!(log.len(), 1, "re-applying the same id must never duplicate");
    }
}
