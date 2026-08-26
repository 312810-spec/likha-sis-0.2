//! PSGC reference-geography repository — Wave 2G. See migration 20's
//! comment in `db::migrations` and
//! `docs/adr/0047-psgc-reference-data-foundation.md` for the append-only,
//! versioned-snapshot design this module implements. Deliberately global
//! (no `school_id`) — see the migration comment for why.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::import::psgc::PsgcSnapshot;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoSnapshot {
    pub id: String,
    pub source_name: String,
    pub authoritative_version: String,
    pub authoritative_published_at: Option<String>,
    pub imported_at: String,
    pub unit_count: i64,
    pub imported_by_user_id: Option<String>,
    pub imported_by_username: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoUnit {
    pub id: String,
    pub snapshot_id: String,
    pub code: String,
    pub name: String,
    pub level: String,
    pub parent_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SnapshotImportOutcome {
    /// A new snapshot was written and made current.
    Imported {
        snapshot_id: String,
        unit_count: usize,
    },
    /// `(source_name, authoritative_version)` already existed — no-op,
    /// matching this project's established re-import-is-recognized (not
    /// silently duplicated) convention (see `section_membership::enroll`).
    /// Carries the EXISTING snapshot's own `unit_count` (not `0`) so a
    /// caller can report "already up to date, N places" rather than a
    /// misleading "imported 0 places" on a benign no-op.
    AlreadyImported {
        snapshot_id: String,
        unit_count: usize,
    },
}

/// Imports one already-validated `PsgcSnapshot` as a new generation of
/// reference data. Runs entirely inside one transaction: if any insert
/// fails partway through (e.g. a malformed hierarchy that only the
/// database's own self-referencing foreign key catches), nothing is
/// written and the previously-current snapshot — if any — remains
/// current and fully intact. The new snapshot only becomes current in
/// the same transaction that finishes writing all of its units.
///
/// `imported_by_user_id`/`imported_by_username` are pure provenance (same
/// pattern as `sf1_import_history`) — they never affect what gets
/// written to `reference_geo_units` or which snapshot becomes current.
pub fn record_snapshot(
    conn: &mut Connection,
    snapshot: &PsgcSnapshot,
    imported_by_user_id: Option<&str>,
    imported_by_username: &str,
) -> AppResult<SnapshotImportOutcome> {
    let tx = conn.transaction()?;

    let existing: Option<(String, i64)> = tx
        .query_row(
            "SELECT id, unit_count FROM reference_geo_snapshots WHERE source_name = ?1 AND authoritative_version = ?2",
            params![snapshot.source_name, snapshot.authoritative_version],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    if let Some((snapshot_id, unit_count)) = existing {
        // No-op: this exact version was already imported. Do not touch
        // `is_current` — a repeat import of the currently-current
        // version is a no-op, and a repeat import of an older version
        // must not resurrect it as current.
        tx.commit()?;
        return Ok(SnapshotImportOutcome::AlreadyImported {
            snapshot_id,
            unit_count: unit_count as usize,
        });
    }

    let snapshot_id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO reference_geo_snapshots \
         (id, source_name, authoritative_version, authoritative_published_at, is_current, unit_count, \
          imported_by_user_id, imported_by_username) \
         VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7)",
        params![
            snapshot_id,
            snapshot.source_name,
            snapshot.authoritative_version,
            snapshot.authoritative_published_at,
            snapshot.units.len() as i64,
            imported_by_user_id,
            imported_by_username,
        ],
    )?;

    // `snapshot.units` is already level-sorted by `import::psgc`, so every
    // unit's parent (one level above it) is always inserted first — this
    // satisfies the self-referencing (snapshot_id, parent_code) ->
    // (snapshot_id, code) foreign key without a full topological sort.
    for unit in &snapshot.units {
        tx.execute(
            "INSERT INTO reference_geo_units (id, snapshot_id, code, name, level, parent_code) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                Uuid::now_v7().to_string(),
                snapshot_id,
                unit.code,
                unit.name,
                unit.level,
                unit.parent_code,
            ],
        )?;
    }

    tx.execute(
        "UPDATE reference_geo_snapshots SET is_current = 0 WHERE source_name = ?1 AND is_current = 1",
        params![snapshot.source_name],
    )?;
    tx.execute(
        "UPDATE reference_geo_snapshots SET is_current = 1 WHERE id = ?1",
        params![snapshot_id],
    )?;

    tx.commit()?;

    Ok(SnapshotImportOutcome::Imported {
        snapshot_id,
        unit_count: snapshot.units.len(),
    })
}

/// The current snapshot for a source, if any has ever been imported.
/// Reads only the local database — never touches the network, so this
/// works identically online or fully offline (see the ADR's offline
/// guarantee).
pub fn current_snapshot(conn: &Connection, source_name: &str) -> AppResult<Option<GeoSnapshot>> {
    conn.query_row(
        "SELECT id, source_name, authoritative_version, authoritative_published_at, imported_at, \
         unit_count, imported_by_user_id, imported_by_username \
         FROM reference_geo_snapshots WHERE source_name = ?1 AND is_current = 1",
        params![source_name],
        |row| {
            Ok(GeoSnapshot {
                id: row.get(0)?,
                source_name: row.get(1)?,
                authoritative_version: row.get(2)?,
                authoritative_published_at: row.get(3)?,
                imported_at: row.get(4)?,
                unit_count: row.get(5)?,
                imported_by_user_id: row.get(6)?,
                imported_by_username: row.get(7)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Lists units within one snapshot, optionally filtered by level and/or
/// exact parent code. Passing `parent_code: Some(None)` is not
/// representable here on purpose — callers wanting top-level (parentless)
/// units use `level: Some("region")` instead, since that is the only
/// level PSGC ever leaves parentless.
pub fn list_units(
    conn: &Connection,
    snapshot_id: &str,
    level: Option<&str>,
    parent_code: Option<&str>,
) -> AppResult<Vec<GeoUnit>> {
    let mut sql = String::from(
        "SELECT id, snapshot_id, code, name, level, parent_code FROM reference_geo_units WHERE snapshot_id = ?1",
    );
    let mut bound: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(snapshot_id.to_string())];

    if let Some(level) = level {
        sql.push_str(&format!(" AND level = ?{}", bound.len() + 1));
        bound.push(Box::new(level.to_string()));
    }
    if let Some(parent_code) = parent_code {
        sql.push_str(&format!(" AND parent_code = ?{}", bound.len() + 1));
        bound.push(Box::new(parent_code.to_string()));
    }
    sql.push_str(" ORDER BY name");

    let mut stmt = conn.prepare(&sql)?;
    let params_ref: Vec<&dyn rusqlite::ToSql> = bound.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(GeoUnit {
            id: row.get(0)?,
            snapshot_id: row.get(1)?,
            code: row.get(2)?,
            name: row.get(3)?,
            level: row.get(4)?,
            parent_code: row.get(5)?,
        })
    })?;

    let mut units = Vec::new();
    for row in rows {
        units.push(row?);
    }
    Ok(units)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;
    use crate::db;
    use crate::import::psgc::parse_and_validate;

    fn fresh_conn() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn snapshot(version: &str) -> PsgcSnapshot {
        let bytes = format!(
            r#"{{"sourceName":"PSA PSGC","version":"{version}","publishedAt":"2026-04-01","units":[
                {{"code":"01","name":"Region I","level":"region"}},
                {{"code":"0101","name":"Ilocos Norte","level":"province","parentCode":"01"}}
            ]}}"#
        );
        parse_and_validate(bytes.as_bytes()).unwrap()
    }

    fn record(conn: &mut Connection, snap: &PsgcSnapshot) -> SnapshotImportOutcome {
        // `imported_by_user_id` is a nullable FK to `users(id)` — these
        // repository-level tests don't need a real seeded user (that's
        // exercised in `tests/reference_geo.rs`'s command-layer round
        // trip), so pass `None` here and only check the username field.
        record_snapshot(conn, snap, None, "registrar1").unwrap()
    }

    #[test]
    fn imports_a_first_snapshot_and_makes_it_current() {
        let mut conn = fresh_conn();
        let outcome = record(&mut conn, &snapshot("2026Q1"));
        assert!(matches!(
            outcome,
            SnapshotImportOutcome::Imported { unit_count: 2, .. }
        ));

        let current = current_snapshot(&conn, "PSA PSGC").unwrap().unwrap();
        assert_eq!(current.authoritative_version, "2026Q1");
        assert_eq!(current.unit_count, 2);
        assert_eq!(current.imported_by_user_id, None);
        assert_eq!(current.imported_by_username, "registrar1");
    }

    #[test]
    fn repeat_import_of_the_same_version_is_a_recognized_no_op_and_reports_the_real_unit_count() {
        let mut conn = fresh_conn();
        let first = record(&mut conn, &snapshot("2026Q1"));
        let second = record(&mut conn, &snapshot("2026Q1"));

        let SnapshotImportOutcome::Imported {
            snapshot_id: first_id,
            ..
        } = first
        else {
            panic!("expected Imported");
        };
        let SnapshotImportOutcome::AlreadyImported {
            snapshot_id: second_id,
            unit_count,
        } = second
        else {
            panic!("expected AlreadyImported");
        };
        assert_eq!(first_id, second_id);
        assert_eq!(
            unit_count, 2,
            "a no-op re-import must report the existing snapshot's real unit count, \
             not 0 (which would misreport as a failed/empty import)"
        );

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reference_geo_snapshots", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "no duplicate snapshot row was created");
    }

    #[test]
    fn a_newer_version_import_becomes_current_and_the_old_one_is_preserved() {
        let mut conn = fresh_conn();
        record(&mut conn, &snapshot("2026Q1"));
        record(&mut conn, &snapshot("2026Q2"));

        let current = current_snapshot(&conn, "PSA PSGC").unwrap().unwrap();
        assert_eq!(current.authoritative_version, "2026Q2");

        let total_snapshots: i64 = conn
            .query_row("SELECT COUNT(*) FROM reference_geo_snapshots", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            total_snapshots, 2,
            "the older snapshot generation is preserved, not deleted"
        );
    }

    /// Wave 2G independent review (both the security and reliability
    /// reviewers) found the original version of this test never actually
    /// called `record_snapshot` — it hand-rolled its own separate
    /// transaction, so it only proved `rusqlite::Transaction` rolls back
    /// on `Drop`, a general library property, not this function's own
    /// behavior. This version constructs a `PsgcSnapshot` directly
    /// (bypassing `import::psgc::parse_and_validate`'s own file-level
    /// validation, which would itself reject this hierarchy — see
    /// `psgc::tests::rejects_a_parent_that_is_not_exactly_one_level_above_its_child`)
    /// so the malformed data reaches `record_snapshot` itself, and the
    /// only thing that rejects it is the function's own use of the
    /// database's self-referencing foreign key, exercised inside the
    /// transaction this function opens.
    #[test]
    fn a_failure_inside_record_snapshot_itself_preserves_the_previous_current_snapshot() {
        let mut conn = fresh_conn();
        record(&mut conn, &snapshot("2026Q1"));

        let malformed = PsgcSnapshot {
            source_name: "PSA PSGC".to_string(),
            authoritative_version: "2026Q3-bad".to_string(),
            authoritative_published_at: None,
            units: vec![crate::import::psgc::PsgcUnit {
                code: "zz".to_string(),
                name: "Bad Unit".to_string(),
                level: "province",
                parent_code: Some("does-not-exist".to_string()),
            }],
        };

        let result = record_snapshot(&mut conn, &malformed, None, "registrar1");
        assert!(
            result.is_err(),
            "record_snapshot itself must reject a unit whose parent_code doesn't exist"
        );

        let current = current_snapshot(&conn, "PSA PSGC").unwrap().unwrap();
        assert_eq!(
            current.authoritative_version, "2026Q1",
            "the prior valid snapshot is still current"
        );
        let total_snapshots: i64 = conn
            .query_row("SELECT COUNT(*) FROM reference_geo_snapshots", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(
            total_snapshots, 1,
            "the failed import left no partial snapshot row behind"
        );
    }

    #[test]
    fn lists_units_by_level_and_parent() {
        let mut conn = fresh_conn();
        let outcome = record(&mut conn, &snapshot("2026Q1"));
        let SnapshotImportOutcome::Imported { snapshot_id, .. } = outcome else {
            panic!("expected Imported");
        };

        let regions = list_units(&conn, &snapshot_id, Some("region"), None).unwrap();
        assert_eq!(regions.len(), 1);
        assert_eq!(regions[0].code, "01");

        let provinces_of_region =
            list_units(&conn, &snapshot_id, Some("province"), Some("01")).unwrap();
        assert_eq!(provinces_of_region.len(), 1);
        assert_eq!(provinces_of_region[0].code, "0101");
    }

    #[test]
    fn reads_never_require_network_and_survive_a_reconnect() {
        // Reference-data reads are plain local SQLite queries with no
        // network client anywhere in this module. Wave 2G independent
        // review found the original version of this test never actually
        // reconnected — it read back on the same live connection it
        // imported through. This version closes the connection entirely
        // (a real file-backed database, since `:memory:` cannot survive
        // that) and opens a brand new one before reading, so the read
        // path is proven to work with no network AND no reliance on any
        // in-process state from the import.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("psgc-reconnect-test.db");
        let key = crate::crypto::generate_key();

        {
            let mut conn = db::open(&path, &key).unwrap();
            record(&mut conn, &snapshot("2026Q1"));
        } // conn dropped here, simulating app shutdown

        let reconnected = db::open(&path, &key).unwrap();
        let current = current_snapshot(&reconnected, "PSA PSGC").unwrap();
        assert!(
            current.is_some(),
            "the imported snapshot must still be readable after a full reconnect"
        );
        assert_eq!(current.unwrap().authoritative_version, "2026Q1");
    }
}
