use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

/// A school is the top-level data-isolation scope: every other record in
/// the working database is owned by exactly one school.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct School {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

pub fn create(conn: &Connection, name: &str) -> AppResult<School> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO schools (id, name) VALUES (?1, ?2)",
        (&id, name),
    )?;
    find_by_id(conn, &id).map(|s| s.expect("row just inserted must exist"))
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<School>> {
    conn.query_row(
        "SELECT id, name, created_at FROM schools WHERE id = ?1",
        [id],
        |row| {
            Ok(School {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<School>> {
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM schools ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(School {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// One school's in-app branding logo -- MIME type plus raw bytes. Never
/// embedded in `School` itself (which is fetched broadly, e.g.
/// `list_all`) so an ordinary school lookup never has to pull image
/// bytes along with it; fetched only by `get_logo`, the one path that
/// actually needs the image. `school_id` is caller-verified (command
/// layer derives it from the session, never a client parameter) --
/// this function itself simply scopes the `UPDATE`/`SELECT` to the id
/// given, matching every other repository function in this codebase.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SchoolLogo {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// Sets (or replaces) `school_id`'s branding logo. Size/MIME-type
/// validation happens at the command layer, matching this codebase's
/// convention that repository functions trust their caller for shape
/// but never for tenant scope. Returns `Ok(())` even if `school_id`
/// doesn't exist -- the command layer's session-derived `school_id` is
/// always real, so this mirrors `UPDATE`'s own no-op-on-no-match
/// semantics rather than adding a distinction no caller needs.
pub fn set_logo(conn: &Connection, school_id: &str, mime: &str, bytes: &[u8]) -> AppResult<()> {
    conn.execute(
        "UPDATE schools SET logo = ?1, logo_mime = ?2 WHERE id = ?3",
        (bytes, mime, school_id),
    )?;
    Ok(())
}

/// Reads back `school_id`'s branding logo, if one has been uploaded.
/// `None` covers both "school has no logo yet" and "school_id doesn't
/// exist" -- the command layer only ever calls this with a
/// session-derived, therefore-real, `school_id`.
pub fn get_logo(conn: &Connection, school_id: &str) -> AppResult<Option<SchoolLogo>> {
    conn.query_row(
        "SELECT logo, logo_mime FROM schools WHERE id = ?1 AND logo IS NOT NULL",
        [school_id],
        |row| {
            Ok(SchoolLogo {
                bytes: row.get(0)?,
                mime: row.get(1)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Removes `school_id`'s branding logo, reverting to the default
/// placeholder shown in the app shell. Idempotent -- clearing an
/// already-absent logo succeeds silently, matching `set_logo`'s
/// no-op-on-no-match semantics.
pub fn clear_logo(conn: &Connection, school_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE schools SET logo = NULL, logo_mime = NULL WHERE id = ?1",
        [school_id],
    )?;
    Ok(())
}

/// The wire/sync shape of a school's branding logo (Batch 10, ADR-0081).
/// Unlike every other synced entity, a logo has no `id` column of its
/// own -- it lives as two columns (`logo`/`logo_mime`) directly on the
/// `schools` row, one logo per school. Rather than invent a synthetic
/// row id, this entity's sync `entity_id` IS `school_id`: a school-scoped
/// singleton, the same way `SchoolCoordinates` would be if it were wired
/// to sync (it isn't, see ADR-0079). `school_id` is carried in the
/// payload itself (unlike `repository::school::SchoolLogo`, which omits
/// it since its callers already have it) so `sync_client::apply_decrypted_change`
/// can check it against the receiving device's own tenant scope, exactly
/// like every other entity kind's arm does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolLogoSyncRecord {
    pub school_id: String,
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// Sync-pull counterpart to `set_logo` -- materializes a logo this device
/// received from another device in the same school. `school_id` is
/// trusted here (the caller, `sync_client::apply_decrypted_change`,
/// already checked `record.school_id` against its own tenant scope
/// before calling this, matching every other entity's `upsert_from_sync`
/// contract). A singleton `UPDATE` rather than an `INSERT ... ON
/// CONFLICT`, matching `set_logo`'s own shape -- there is no separate
/// row to insert, only the `schools` row's two columns to overwrite.
pub fn upsert_logo_from_sync(conn: &Connection, record: &SchoolLogoSyncRecord) -> AppResult<()> {
    set_logo(conn, &record.school_id, &record.mime, &record.bytes)
}

/// Sync-conflict-preview counterpart to `get_logo` -- same signature
/// shape as every other entity's `find_by_id(conn, school_id, entity_id)`
/// so `commands::conflict_review` can call it uniformly, even though this
/// entity's `entity_id` is always identical to `school_id` (see
/// `SchoolLogoSyncRecord`'s doc comment). A mismatched pair (which should
/// never occur -- this device is the only source of `entity_id` for its
/// own logo changes) is treated as "not found" rather than trusted,
/// fail-closed like every other tenant-scoped lookup in this codebase.
pub fn find_logo_by_id(
    conn: &Connection,
    school_id: &str,
    entity_id: &str,
) -> AppResult<Option<SchoolLogoSyncRecord>> {
    if entity_id != school_id {
        return Ok(None);
    }
    Ok(get_logo(conn, school_id)?.map(|l| SchoolLogoSyncRecord {
        school_id: school_id.to_string(),
        mime: l.mime,
        bytes: l.bytes,
    }))
}

/// A school's latitude/longitude, for the Weather & Hazard Suspension
/// Alerts advisory (ADR-0079). Both fields are always present together --
/// there is no "only one set" state, matching `set_coordinates`'s
/// contract below.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolCoordinates {
    pub latitude: f64,
    pub longitude: f64,
}

/// Sets (or replaces) `school_id`'s coordinates. Range validation
/// happens at the command layer (matching `set_logo`'s split above) --
/// this function trusts its caller for shape but never for tenant scope.
pub fn set_coordinates(
    conn: &Connection,
    school_id: &str,
    latitude: f64,
    longitude: f64,
) -> AppResult<()> {
    conn.execute(
        "UPDATE schools SET latitude = ?1, longitude = ?2 WHERE id = ?3",
        (latitude, longitude, school_id),
    )?;
    Ok(())
}

/// Clears `school_id`'s coordinates, reverting to "no weather advisory
/// configured" -- idempotent, matching `clear_logo`'s no-op-on-no-match
/// semantics.
pub fn clear_coordinates(conn: &Connection, school_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE schools SET latitude = NULL, longitude = NULL WHERE id = ?1",
        [school_id],
    )?;
    Ok(())
}

/// Reads back `school_id`'s coordinates, if both are set. `None` covers
/// "never configured," "school_id doesn't exist," and the (should-never-
/// happen, but defensively handled) case of only one of the two columns
/// being non-null.
pub fn get_coordinates(conn: &Connection, school_id: &str) -> AppResult<Option<SchoolCoordinates>> {
    conn.query_row(
        "SELECT latitude, longitude FROM schools WHERE id = ?1 AND latitude IS NOT NULL AND longitude IS NOT NULL",
        [school_id],
        |row| {
            Ok(SchoolCoordinates {
                latitude: row.get(0)?,
                longitude: row.get(1)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let created = create(&conn, "Mabini Elementary").unwrap();

        let found = find_by_id(&conn, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn find_by_id_returns_none_for_unknown_id() {
        let conn = open_test_db();

        assert_eq!(find_by_id(&conn, "does-not-exist").unwrap(), None);
    }

    #[test]
    fn list_all_orders_by_name() {
        let conn = open_test_db();
        create(&conn, "Zamora High School").unwrap();
        create(&conn, "Aguinaldo Elementary").unwrap();

        let names: Vec<String> = list_all(&conn)
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();

        assert_eq!(names, vec!["Aguinaldo Elementary", "Zamora High School"]);
    }

    #[test]
    fn sql_metacharacters_in_input_are_stored_literally_not_executed() {
        let conn = open_test_db();
        let adversarial_name = "O'Brien'; DROP TABLE schools; --";

        let created = create(&conn, adversarial_name).unwrap();

        // If this were interpolated instead of bound as a parameter, the
        // DROP TABLE would have executed and this query would error out.
        let found = find_by_id(&conn, &created.id).unwrap();
        assert_eq!(found.map(|s| s.name), Some(adversarial_name.to_string()));
        assert_eq!(list_all(&conn).unwrap().len(), 1);
    }

    #[test]
    fn logo_round_trips_and_starts_absent() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();

        assert_eq!(get_logo(&conn, &school.id).unwrap(), None);

        let bytes = vec![0x89, b'P', b'N', b'G', 1, 2, 3, 4];
        set_logo(&conn, &school.id, "image/png", &bytes).unwrap();

        let logo = get_logo(&conn, &school.id).unwrap().unwrap();
        assert_eq!(logo.mime, "image/png");
        assert_eq!(logo.bytes, bytes);
    }

    #[test]
    fn set_logo_replaces_a_previous_logo() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        set_logo(&conn, &school.id, "image/png", &[1, 2, 3]).unwrap();

        set_logo(&conn, &school.id, "image/jpeg", &[4, 5, 6, 7]).unwrap();

        let logo = get_logo(&conn, &school.id).unwrap().unwrap();
        assert_eq!(logo.mime, "image/jpeg");
        assert_eq!(logo.bytes, vec![4, 5, 6, 7]);
    }

    #[test]
    fn clear_logo_removes_it() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        set_logo(&conn, &school.id, "image/png", &[1, 2, 3]).unwrap();

        clear_logo(&conn, &school.id).unwrap();

        assert_eq!(get_logo(&conn, &school.id).unwrap(), None);
    }

    #[test]
    fn logo_is_scoped_to_its_own_school() {
        let conn = open_test_db();
        let school_a = create(&conn, "School A").unwrap();
        let school_b = create(&conn, "School B").unwrap();
        set_logo(&conn, &school_a.id, "image/png", &[9, 9, 9]).unwrap();

        assert_eq!(get_logo(&conn, &school_b.id).unwrap(), None);
    }

    #[test]
    fn upsert_logo_from_sync_writes_the_singleton_row() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        let record = SchoolLogoSyncRecord {
            school_id: school.id.clone(),
            mime: "image/webp".to_string(),
            bytes: vec![1, 2, 3, 4],
        };

        upsert_logo_from_sync(&conn, &record).unwrap();

        let logo = get_logo(&conn, &school.id).unwrap().unwrap();
        assert_eq!(logo.mime, "image/webp");
        assert_eq!(logo.bytes, vec![1, 2, 3, 4]);
    }

    #[test]
    fn find_logo_by_id_returns_none_when_entity_id_does_not_match_school_id() {
        let conn = open_test_db();
        let school_a = create(&conn, "School A").unwrap();
        let school_b = create(&conn, "School B").unwrap();
        set_logo(&conn, &school_a.id, "image/png", &[1, 2, 3]).unwrap();

        // A logo's `entity_id` IS its `school_id` (see
        // `SchoolLogoSyncRecord`'s doc comment) -- a mismatched pair
        // should never legitimately occur, and must fail closed as "not
        // found" rather than trusted.
        assert_eq!(
            find_logo_by_id(&conn, &school_a.id, &school_b.id).unwrap(),
            None
        );
    }

    #[test]
    fn find_logo_by_id_round_trips_when_ids_match() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        set_logo(&conn, &school.id, "image/png", &[1, 2, 3]).unwrap();

        let found = find_logo_by_id(&conn, &school.id, &school.id)
            .unwrap()
            .unwrap();

        assert_eq!(found.school_id, school.id);
        assert_eq!(found.mime, "image/png");
        assert_eq!(found.bytes, vec![1, 2, 3]);
    }

    #[test]
    fn find_logo_by_id_returns_none_when_no_logo_is_set() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();

        assert_eq!(
            find_logo_by_id(&conn, &school.id, &school.id).unwrap(),
            None
        );
    }

    #[test]
    fn coordinates_round_trip_and_start_absent() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();

        assert_eq!(get_coordinates(&conn, &school.id).unwrap(), None);

        set_coordinates(&conn, &school.id, 14.5995, 120.9842).unwrap();

        let coords = get_coordinates(&conn, &school.id).unwrap().unwrap();
        assert_eq!(coords.latitude, 14.5995);
        assert_eq!(coords.longitude, 120.9842);
    }

    #[test]
    fn set_coordinates_replaces_previous_coordinates() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        set_coordinates(&conn, &school.id, 14.5995, 120.9842).unwrap();

        set_coordinates(&conn, &school.id, 10.3157, 123.8854).unwrap();

        let coords = get_coordinates(&conn, &school.id).unwrap().unwrap();
        assert_eq!(coords.latitude, 10.3157);
        assert_eq!(coords.longitude, 123.8854);
    }

    #[test]
    fn clear_coordinates_removes_them() {
        let conn = open_test_db();
        let school = create(&conn, "Mabini Elementary").unwrap();
        set_coordinates(&conn, &school.id, 14.5995, 120.9842).unwrap();

        clear_coordinates(&conn, &school.id).unwrap();

        assert_eq!(get_coordinates(&conn, &school.id).unwrap(), None);
    }

    #[test]
    fn coordinates_are_scoped_to_their_own_school() {
        let conn = open_test_db();
        let school_a = create(&conn, "School A").unwrap();
        let school_b = create(&conn, "School B").unwrap();
        set_coordinates(&conn, &school_a.id, 14.5995, 120.9842).unwrap();

        assert_eq!(get_coordinates(&conn, &school_b.id).unwrap(), None);
    }
}
