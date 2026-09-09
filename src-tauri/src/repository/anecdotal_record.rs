//! Anecdotal / Guidance Records (Batch 12, ADR-0083): one narrative entry
//! per learner plus an append-only follow-up log.
//!
//! This module deliberately replicates DO 006 Child Protection's
//! (`repository::child_protection`, ADR-0072) structural template almost
//! exactly -- same section-scoped narrative-plus-append-only-log shape,
//! same sensitivity class (a real per-learner narrative record). See
//! `docs/adr/0083-anecdotal-guidance-records.md` for the explicit
//! citation of ADR-0072 as this batch's precedent, and for why this
//! module reuses `auth::authorize_child_protection_access_for_section`
//! directly rather than writing a near-identical sibling function.
//!
//! `category` is a generic positive/negative/neutral classification --
//! deliberately NOT overfit to `award-eligibility.ts`'s narrow
//! "disciplinary" framing. Guidance records serve broader purposes than
//! honors eligibility (counseling notes, commendations, routine
//! observations), so a disciplinary-only vocabulary would misrepresent
//! most of what an adviser actually records here.
//!
//! Batch 13 (ADR-0084) wires this table into `award-eligibility.ts`'s
//! previously hardcoded-false anecdotes check, via the narrow read-only
//! [`has_any_category_for_learner_in_section`] existence check below --
//! it returns a bare `bool`, never the matching records' narrative
//! content, so the eligibility screen only ever learns "disqualified or
//! not", never the guidance narrative itself.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AnecdotalCategory {
    Positive,
    Negative,
    Neutral,
}

impl AnecdotalCategory {
    fn as_db_str(self) -> &'static str {
        match self {
            AnecdotalCategory::Positive => "positive",
            AnecdotalCategory::Negative => "negative",
            AnecdotalCategory::Neutral => "neutral",
        }
    }

    fn from_db_str(raw: &str) -> Option<AnecdotalCategory> {
        match raw {
            "positive" => Some(AnecdotalCategory::Positive),
            "negative" => Some(AnecdotalCategory::Negative),
            "neutral" => Some(AnecdotalCategory::Neutral),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnecdotalRecord {
    pub id: String,
    pub school_id: String,
    pub learner_id: String,
    pub section_id: String,
    pub authored_by_user_id: Option<String>,
    pub category: AnecdotalCategory,
    pub entry_date: String,
    pub narrative: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnecdotalRecordFollowup {
    pub id: String,
    pub anecdotal_record_id: String,
    pub author_user_id: Option<String>,
    pub note: String,
    pub created_at: String,
}

const RECORD_SELECT: &str = "SELECT id, school_id, learner_id, section_id, \
     authored_by_user_id, category, entry_date, narrative, created_at \
     FROM anecdotal_records WHERE school_id = ?1";

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<AnecdotalRecord> {
    let category_raw: String = row.get(5)?;
    Ok(AnecdotalRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        learner_id: row.get(2)?,
        section_id: row.get(3)?,
        authored_by_user_id: row.get(4)?,
        category: AnecdotalCategory::from_db_str(&category_raw).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                5,
                rusqlite::types::Type::Text,
                "unknown category".into(),
            )
        })?,
        entry_date: row.get(6)?,
        narrative: row.get(7)?,
        created_at: row.get(8)?,
    })
}

fn row_to_followup(row: &rusqlite::Row) -> rusqlite::Result<AnecdotalRecordFollowup> {
    Ok(AnecdotalRecordFollowup {
        id: row.get(0)?,
        anecdotal_record_id: row.get(1)?,
        author_user_id: row.get(2)?,
        note: row.get(3)?,
        created_at: row.get(4)?,
    })
}

/// Records a new anecdotal/guidance entry for a learner. The caller must
/// already have been authorized via
/// `auth::authorize_child_protection_access_for_section` -- this function
/// performs no authorization of its own, matching
/// `child_protection::create_incident`'s own contract.
#[allow(clippy::too_many_arguments)]
pub fn create_record(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    section_id: &str,
    authored_by_user_id: &str,
    category: AnecdotalCategory,
    entry_date: &str,
    narrative: &str,
) -> AppResult<AnecdotalRecord> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO anecdotal_records \
            (id, school_id, learner_id, section_id, authored_by_user_id, \
             category, entry_date, narrative) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        (
            &id,
            school_id,
            learner_id,
            section_id,
            authored_by_user_id,
            category.as_db_str(),
            entry_date,
            narrative,
        ),
    )?;
    find_record_by_id(conn, school_id, &id).map(|opt| opt.expect("just inserted"))
}

pub fn find_record_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<AnecdotalRecord>> {
    conn.query_row(
        &format!("{RECORD_SELECT} AND id = ?2"),
        (school_id, id),
        row_to_record,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        other => Err(other.into()),
    })
}

/// All anecdotal records for one section, newest first. The caller must
/// already have been authorized for this exact `section_id`.
pub fn list_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
) -> AppResult<Vec<AnecdotalRecord>> {
    let mut stmt = conn.prepare(&format!(
        "{RECORD_SELECT} AND section_id = ?2 ORDER BY entry_date DESC, created_at DESC"
    ))?;
    let rows = stmt.query_map((school_id, section_id), row_to_record)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Narrow, read-only existence check: does `learner_id` have any
/// anecdotal record in one of `categories`, scoped to one `section_id`?
/// Returns a bare `bool` -- deliberately never the matching records'
/// narrative content -- because Batch 13's award-eligibility wiring
/// (`commands::anecdotal_record::has_anecdotal_category_for_learner`)
/// only needs a disqualification signal, not the guidance narrative
/// itself. The caller must already have been authorized for this exact
/// `section_id`, same contract as [`list_for_section`]. An empty
/// `categories` slice returns `Ok(false)` without touching the database.
pub fn has_any_category_for_learner_in_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
    categories: &[AnecdotalCategory],
) -> AppResult<bool> {
    if categories.is_empty() {
        return Ok(false);
    }
    let placeholders: Vec<String> = (0..categories.len())
        .map(|i| format!("?{}", i + 4))
        .collect();
    let sql = format!(
        "SELECT 1 FROM anecdotal_records WHERE school_id = ?1 AND section_id = ?2 \
         AND learner_id = ?3 AND category IN ({}) LIMIT 1",
        placeholders.join(", ")
    );
    let category_strs: Vec<&str> = categories.iter().map(|c| c.as_db_str()).collect();
    let mut params: Vec<&dyn rusqlite::ToSql> = vec![&school_id, &section_id, &learner_id];
    for s in &category_strs {
        params.push(s);
    }
    let mut stmt = conn.prepare(&sql)?;
    stmt.exists(params.as_slice()).map_err(Into::into)
}

/// All anecdotal records for one learner across every section, newest
/// first -- used by a school-wide (School Head) view; a section-scoped
/// adviser caller should use [`list_for_section`] instead, matching
/// `child_protection::list_for_learner`'s own precedent and caveat.
pub fn list_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<AnecdotalRecord>> {
    let mut stmt = conn.prepare(&format!(
        "{RECORD_SELECT} AND learner_id = ?2 ORDER BY entry_date DESC, created_at DESC"
    ))?;
    let rows = stmt.query_map((school_id, learner_id), row_to_record)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Appends one follow-up entry to a record's log. Deliberately
/// INSERT-only -- there is no `update_followup`/`delete_followup`
/// function in this module at all, matching the append-only contract
/// migration 57 documents (and `incident_interventions`'s own
/// precedent). Unlike `child_protection::add_intervention`, there is no
/// "resolved" status transition to perform here -- an anecdotal record
/// has no incident-style status field to close out; it is a running
/// narrative history.
pub fn add_followup(
    conn: &Connection,
    school_id: &str,
    anecdotal_record_id: &str,
    author_user_id: &str,
    note: &str,
) -> AppResult<AnecdotalRecordFollowup> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO anecdotal_record_followups \
            (id, anecdotal_record_id, school_id, author_user_id, note) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, anecdotal_record_id, school_id, author_user_id, note),
    )?;
    conn.query_row(
        "SELECT id, anecdotal_record_id, author_user_id, note, created_at \
         FROM anecdotal_record_followups WHERE school_id = ?1 AND id = ?2",
        (school_id, &id),
        row_to_followup,
    )
    .map_err(Into::into)
}

/// One follow-up entry by its own `id`, tenant-scoped by `school_id`
/// (the table carries `school_id` even though `AnecdotalRecordFollowup`
/// itself does not -- same shape as
/// `child_protection::find_intervention_by_id`). Needed for the
/// conflict-review screen's local-version preview.
pub fn find_followup_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<AnecdotalRecordFollowup>> {
    conn.query_row(
        "SELECT id, anecdotal_record_id, author_user_id, note, created_at \
         FROM anecdotal_record_followups WHERE school_id = ?1 AND id = ?2",
        (school_id, id),
        row_to_followup,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The full append-only follow-up log for one anecdotal record, oldest
/// first (a chronological guidance history).
pub fn list_followups_for_record(
    conn: &Connection,
    school_id: &str,
    anecdotal_record_id: &str,
) -> AppResult<Vec<AnecdotalRecordFollowup>> {
    let mut stmt = conn.prepare(
        "SELECT id, anecdotal_record_id, author_user_id, note, created_at \
         FROM anecdotal_record_followups WHERE school_id = ?1 AND anecdotal_record_id = ?2 \
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map((school_id, anecdotal_record_id), row_to_followup)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Materializes a pulled sync change: an `INSERT ... ON CONFLICT(id) DO
/// UPDATE` keyed on the row's own stable `id`, mirroring
/// `child_protection::upsert_incident_from_sync` exactly.
/// `anecdotal_records` has no `UNIQUE` constraint besides its own `id`
/// primary key (confirmed against migration 57's own `CREATE TABLE`), so
/// there is no distinct-natural-key collision scenario to guard against
/// here, same as `behavioral_incidents`.
pub fn upsert_record_from_sync(conn: &Connection, record: &AnecdotalRecord) -> AppResult<()> {
    conn.execute(
        "INSERT INTO anecdotal_records \
            (id, school_id, learner_id, section_id, authored_by_user_id, \
             category, entry_date, narrative, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(id) DO UPDATE SET \
             category = excluded.category, \
             entry_date = excluded.entry_date, \
             narrative = excluded.narrative",
        (
            &record.id,
            &record.school_id,
            &record.learner_id,
            &record.section_id,
            &record.authored_by_user_id,
            record.category.as_db_str(),
            &record.entry_date,
            &record.narrative,
            &record.created_at,
        ),
    )?;
    Ok(())
}

/// Materializes a pulled sync change for a follow-up entry.
/// `anecdotal_record_followups` is append-only (see this module's own
/// doc comment) and has no `UNIQUE` constraint besides `id` -- same "no
/// distinct natural key to collide on" note as
/// `upsert_record_from_sync`. `AnecdotalRecordFollowup` carries no
/// `school_id` field of its own (matching
/// `child_protection::InterventionLogEntry`'s exact shape), so
/// `school_id` comes from the caller's own already-checked tenant scope.
pub fn upsert_followup_from_sync(
    conn: &Connection,
    school_id: &str,
    followup: &AnecdotalRecordFollowup,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO anecdotal_record_followups \
            (id, anecdotal_record_id, school_id, author_user_id, note, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET \
             note = excluded.note",
        (
            &followup.id,
            &followup.anecdotal_record_id,
            school_id,
            &followup.author_user_id,
            &followup.note,
            &followup.created_at,
        ),
    )?;
    Ok(())
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
    fn create_record_round_trips_every_field() {
        let conn = setup();
        let record = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic: helped a classmate with a reading exercise.",
        )
        .unwrap();
        assert_eq!(record.category, AnecdotalCategory::Positive);
        assert_eq!(record.learner_id, "l1");
        assert_eq!(record.section_id, "sec1");
    }

    #[test]
    fn list_for_section_only_returns_that_sections_records() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec2', 's1', '2026-2027', '5', 'Section B')",
            [],
        )
        .unwrap();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "Synthetic note in section A.",
        )
        .unwrap();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec2",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-02",
            "Synthetic note in section B.",
        )
        .unwrap();

        let sec1_records = list_for_section(&conn, "s1", "sec1").unwrap();
        assert_eq!(sec1_records.len(), 1);
        assert_eq!(sec1_records[0].section_id, "sec1");
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
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic entry A.",
        )
        .unwrap();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec2",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-05",
            "Synthetic entry B.",
        )
        .unwrap();

        let all = list_for_learner(&conn, "s1", "l1").unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn add_followup_appends_without_touching_earlier_entries() {
        let conn = setup();
        let record = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic description.",
        )
        .unwrap();

        add_followup(
            &conn,
            "s1",
            &record.id,
            "u1",
            "Synthetic: met with learner and guardian.",
        )
        .unwrap();
        add_followup(
            &conn,
            "s1",
            &record.id,
            "u1",
            "Synthetic: follow-up counseling session held.",
        )
        .unwrap();

        let log = list_followups_for_record(&conn, "s1", &record.id).unwrap();
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].note, "Synthetic: met with learner and guardian.");
        assert_eq!(log[1].note, "Synthetic: follow-up counseling session held.");
    }

    #[test]
    fn anecdotal_records_has_no_unique_constraint_besides_id_so_no_collision_scenario_exists() {
        let conn = setup();
        let first = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "First synthetic entry.",
        )
        .unwrap();
        // A second record for the exact same learner/section/date is
        // accepted without error -- there is nothing to collide on.
        let second = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "Second synthetic entry, same day.",
        )
        .unwrap();
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn has_any_category_for_learner_in_section_is_true_when_a_matching_record_exists() {
        let conn = setup();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic disqualifying-category entry.",
        )
        .unwrap();

        let found = has_any_category_for_learner_in_section(
            &conn,
            "s1",
            "sec1",
            "l1",
            &[AnecdotalCategory::Negative],
        )
        .unwrap();
        assert!(found);
    }

    #[test]
    fn has_any_category_for_learner_in_section_is_false_with_only_positive_and_neutral_records() {
        let conn = setup();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic positive entry.",
        )
        .unwrap();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-02",
            "Synthetic neutral entry.",
        )
        .unwrap();

        let found = has_any_category_for_learner_in_section(
            &conn,
            "s1",
            "sec1",
            "l1",
            &[AnecdotalCategory::Negative],
        )
        .unwrap();
        assert!(!found);
    }

    #[test]
    fn has_any_category_for_learner_in_section_is_false_with_no_records_at_all() {
        let conn = setup();
        let found = has_any_category_for_learner_in_section(
            &conn,
            "s1",
            "sec1",
            "l1",
            &[AnecdotalCategory::Negative],
        )
        .unwrap();
        assert!(!found);
    }

    #[test]
    fn has_any_category_for_learner_in_section_short_circuits_on_an_empty_category_list() {
        let conn = setup();
        create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic entry that must not match an empty filter.",
        )
        .unwrap();

        let found =
            has_any_category_for_learner_in_section(&conn, "s1", "sec1", "l1", &[]).unwrap();
        assert!(!found);
    }

    #[test]
    fn has_any_category_for_learner_in_section_is_scoped_to_the_given_section_and_learner() {
        let conn = setup();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec2', 's1', '2026-2027', '5', 'Section B')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l2', 's1', 'Ben', 'Santos')",
            [],
        )
        .unwrap();
        // A negative record for a different learner in the same section.
        create_record(
            &conn,
            "s1",
            "l2",
            "sec1",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic entry for a different learner.",
        )
        .unwrap();
        // A negative record for the target learner, but a different section.
        create_record(
            &conn,
            "s1",
            "l1",
            "sec2",
            "u1",
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic entry in a different section.",
        )
        .unwrap();

        let found = has_any_category_for_learner_in_section(
            &conn,
            "s1",
            "sec1",
            "l1",
            &[AnecdotalCategory::Negative],
        )
        .unwrap();
        assert!(!found, "neither record belongs to (l1, sec1) together");
    }

    fn sample_incoming_record(id: &str) -> AnecdotalRecord {
        AnecdotalRecord {
            id: id.to_string(),
            school_id: "s1".to_string(),
            learner_id: "l1".to_string(),
            section_id: "sec1".to_string(),
            authored_by_user_id: Some("u1".to_string()),
            category: AnecdotalCategory::Positive,
            entry_date: "2026-09-01".to_string(),
            narrative: "Synthetic incoming narrative.".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_record_from_sync_inserts_a_record_this_device_has_never_seen() {
        let conn = setup();
        let incoming = sample_incoming_record("ar1");

        upsert_record_from_sync(&conn, &incoming).unwrap();

        let found = find_record_by_id(&conn, "s1", "ar1").unwrap().unwrap();
        assert_eq!(found.narrative, "Synthetic incoming narrative.");
    }

    #[test]
    fn upsert_record_from_sync_updates_an_existing_row_in_place_without_a_duplicate() {
        let conn = setup();
        let original = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "Original synthetic narrative.",
        )
        .unwrap();

        let updated = AnecdotalRecord {
            narrative: "Updated synthetic narrative.".to_string(),
            ..original.clone()
        };
        upsert_record_from_sync(&conn, &updated).unwrap();

        let found = find_record_by_id(&conn, "s1", &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.narrative, "Updated synthetic narrative.");
        let all = list_for_section(&conn, "s1", "sec1").unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }

    fn sample_incoming_followup(id: &str, record_id: &str) -> AnecdotalRecordFollowup {
        AnecdotalRecordFollowup {
            id: id.to_string(),
            anecdotal_record_id: record_id.to_string(),
            author_user_id: Some("u1".to_string()),
            note: "Synthetic incoming follow-up note.".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_followup_from_sync_inserts_an_entry_this_device_has_never_seen() {
        let conn = setup();
        let record = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic narrative.",
        )
        .unwrap();
        let incoming = sample_incoming_followup("f1", &record.id);

        upsert_followup_from_sync(&conn, "s1", &incoming).unwrap();

        let log = list_followups_for_record(&conn, "s1", &record.id).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].note, "Synthetic incoming follow-up note.");
    }

    #[test]
    fn upsert_followup_from_sync_is_idempotent_on_the_same_id() {
        let conn = setup();
        let record = create_record(
            &conn,
            "s1",
            "l1",
            "sec1",
            "u1",
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic narrative.",
        )
        .unwrap();
        let incoming = sample_incoming_followup("f1", &record.id);

        upsert_followup_from_sync(&conn, "s1", &incoming).unwrap();
        upsert_followup_from_sync(&conn, "s1", &incoming).unwrap();

        let log = list_followups_for_record(&conn, "s1", &record.id).unwrap();
        assert_eq!(log.len(), 1, "re-applying the same id must never duplicate");
    }
}
