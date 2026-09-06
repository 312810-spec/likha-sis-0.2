//! This device's own "last hub cursor I have fully processed" watermark
//! for one school -- the pull-side counterpart to
//! `repository::sync_version_cache`, which tracks per-entity state (see
//! migration 34's own doc comment).

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;
use crate::sync::SyncCursor;

/// `SyncCursor(0)` if this device has never pulled for `school_id` --
/// matches `sync_hub::pull_since`'s own "after `SyncCursor(0)`" first-pull
/// convention.
pub fn get_cursor(conn: &Connection, school_id: &str) -> AppResult<SyncCursor> {
    let cursor: Option<i64> = conn
        .query_row(
            "SELECT cursor FROM sync_pull_cursor WHERE school_id = ?1",
            [school_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(SyncCursor(cursor.unwrap_or(0) as u64))
}

/// This device's own best-available "last time a pull actually made
/// progress for this school" signal, for the sync-status screen --
/// `None` if this device has never pulled a change for `school_id` (no
/// row exists yet). Note this is NOT the same as "last time this device
/// successfully contacted the hub": `advance_cursor` is only called when
/// a pulled change is applied or staged as a conflict (see
/// `sync_client::pull_once`), so an all-quiet successful poll with
/// nothing new to pull does not update it. The sync-status screen must
/// present this honestly (e.g. "last change received") rather than as a
/// general connectivity health check.
pub fn last_pull_at(conn: &Connection, school_id: &str) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT updated_at FROM sync_pull_cursor WHERE school_id = ?1",
        [school_id],
        |row| row.get(0),
    )
    .optional()
    .map_err(Into::into)
}

/// Advances this device's watermark to `cursor`. Monotonic, like
/// `sync_version_cache::record_known_version`: a call with a LOWER
/// cursor than what is already stored never regresses it, so an
/// out-of-order or retried pull response can never make this device
/// forget progress it has already made.
pub fn advance_cursor(conn: &Connection, school_id: &str, cursor: SyncCursor) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sync_pull_cursor (school_id, cursor) VALUES (?1, ?2)
         ON CONFLICT(school_id) DO UPDATE SET
             cursor = MAX(cursor, excluded.cursor),
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (school_id, cursor.0 as i64),
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
    fn cursor_defaults_to_zero_for_a_school_never_pulled() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        assert_eq!(get_cursor(&conn, &school.id).unwrap(), SyncCursor(0));
    }

    #[test]
    fn advance_then_get_round_trips() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        advance_cursor(&conn, &school.id, SyncCursor(5)).unwrap();

        assert_eq!(get_cursor(&conn, &school.id).unwrap(), SyncCursor(5));
    }

    #[test]
    fn advancing_to_a_lower_cursor_never_regresses_the_watermark() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        advance_cursor(&conn, &school.id, SyncCursor(9)).unwrap();

        advance_cursor(&conn, &school.id, SyncCursor(3)).unwrap();

        assert_eq!(get_cursor(&conn, &school.id).unwrap(), SyncCursor(9));
    }

    #[test]
    fn last_pull_at_is_none_before_any_pull() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        assert_eq!(last_pull_at(&conn, &school.id).unwrap(), None);
    }

    #[test]
    fn last_pull_at_is_set_after_a_pull_advances_the_cursor() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        advance_cursor(&conn, &school.id, SyncCursor(4)).unwrap();

        let last_pull_at = last_pull_at(&conn, &school.id).unwrap();
        assert!(last_pull_at.is_some());
    }

    #[test]
    fn different_schools_track_cursors_independently() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        advance_cursor(&conn, &school_a.id, SyncCursor(7)).unwrap();

        assert_eq!(get_cursor(&conn, &school_b.id).unwrap(), SyncCursor(0));
        assert_eq!(get_cursor(&conn, &school_a.id).unwrap(), SyncCursor(7));
    }
}
