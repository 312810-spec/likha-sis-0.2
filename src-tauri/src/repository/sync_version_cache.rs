//! This device's local cache of "what hub version did I last see for this
//! entity" -- see migration 33's own comment. Distinct from
//! `repository::sync_hub`'s `sync_hub_log.version`, which is the HUB's
//! authoritative record of every device's accepted history; this module
//! is only ever one device's own last-known copy of a small slice of it,
//! kept so that an UPDATE (not just a first create) can compute a correct
//! `sync::PendingChange::base_version` before enqueueing into
//! `sync_outbox`. Not yet called by any domain write -- see ADR-0067's
//! own "not yet consumed" gap this closes a prerequisite for.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;
use crate::sync::EntityKind;

/// This device's last-known hub version for one entity -- `0` if never
/// recorded, matching `PendingChange::base_version`'s own convention that
/// a fresh entity's first push is based on version 0 (nothing to
/// conflict against yet, see `sync_hub::current_version`'s identical
/// "no rows yet" default).
pub fn known_version(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
) -> AppResult<u64> {
    let version: Option<i64> = conn
        .query_row(
            "SELECT known_version FROM sync_version_cache
             WHERE school_id = ?1 AND entity_kind = ?2 AND entity_id = ?3",
            (school_id, entity_kind.as_db_str(), entity_id),
            |row| row.get(0),
        )
        .optional()?;
    Ok(version.unwrap_or(0) as u64)
}

/// Records `version` as this device's newly-known hub version for an
/// entity -- called after a push this device made for that entity is
/// accepted, or after pulling an already-accepted change for it from
/// another device. Monotonic: an out-of-order call recording a version
/// LOWER than what is already stored never regresses the cached value,
/// so a stale ack or a pull arriving out of sequence can never make this
/// device forget progress it already knows about.
pub fn record_known_version(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
    version: u64,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sync_version_cache (school_id, entity_kind, entity_id, known_version)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(school_id, entity_kind, entity_id) DO UPDATE SET
             known_version = MAX(known_version, excluded.known_version),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (
            school_id,
            entity_kind.as_db_str(),
            entity_id,
            version as i64,
        ),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    #[test]
    fn known_version_defaults_to_zero_for_an_entity_never_recorded() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        assert_eq!(
            known_version(&conn, &school.id, EntityKind::Learner, "l1").unwrap(),
            0
        );
    }

    #[test]
    fn record_then_known_version_round_trips() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        record_known_version(&conn, &school.id, EntityKind::Learner, "l1", 5).unwrap();

        assert_eq!(
            known_version(&conn, &school.id, EntityKind::Learner, "l1").unwrap(),
            5
        );
    }

    #[test]
    fn recording_a_higher_version_advances_the_cache() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        record_known_version(&conn, &school.id, EntityKind::Learner, "l1", 3).unwrap();

        record_known_version(&conn, &school.id, EntityKind::Learner, "l1", 7).unwrap();

        assert_eq!(
            known_version(&conn, &school.id, EntityKind::Learner, "l1").unwrap(),
            7
        );
    }

    #[test]
    fn recording_a_lower_version_never_regresses_the_cache() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        record_known_version(&conn, &school.id, EntityKind::Learner, "l1", 7).unwrap();

        // An out-of-order pull/ack arriving with a stale, lower version
        // must not undo already-known progress.
        record_known_version(&conn, &school.id, EntityKind::Learner, "l1", 3).unwrap();

        assert_eq!(
            known_version(&conn, &school.id, EntityKind::Learner, "l1").unwrap(),
            7
        );
    }

    #[test]
    fn different_schools_track_the_same_entity_id_independently() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        record_known_version(&conn, &school_a.id, EntityKind::Learner, "l1", 9).unwrap();

        assert_eq!(
            known_version(&conn, &school_b.id, EntityKind::Learner, "l1").unwrap(),
            0,
            "a different school's identically-named entity id must not share the cache"
        );
        assert_eq!(
            known_version(&conn, &school_a.id, EntityKind::Learner, "l1").unwrap(),
            9
        );
    }

    #[test]
    fn different_entity_kinds_track_the_same_entity_id_independently() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        record_known_version(&conn, &school.id, EntityKind::Learner, "shared-id", 4).unwrap();

        assert_eq!(
            known_version(&conn, &school.id, EntityKind::Section, "shared-id").unwrap(),
            0,
            "a different entity_kind sharing the same entity_id must not share the cache"
        );
    }
}
