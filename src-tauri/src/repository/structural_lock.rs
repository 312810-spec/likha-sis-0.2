//! ADR-0070: storage for a school's optional secondary structural-lock
//! PIN. Only ever stores `crypto::pin_lock::PinHash`'s salted derivation
//! -- never the plaintext PIN. Tenant-scoped by `school_id`, matching
//! this codebase's convention that a repository trusts its caller for
//! shape but never for tenant scope (the command layer always derives
//! `school_id` from the session, never a client parameter).

use rusqlite::{Connection, OptionalExtension};

use crate::crypto::pin_lock::{HASH_LEN, SALT_LEN};
use crate::error::AppResult;

/// Whether `school_id` currently has a structural-lock PIN configured.
/// The frontend uses this to decide between a "Set a PIN" first-run
/// prompt and an "Enter PIN" unlock prompt -- never to decide whether to
/// enforce anything server-side (enforcement lives entirely in
/// `auth::require_structural_lock_unlocked`, not the UI).
pub fn has_pin(conn: &Connection, school_id: &str) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM structural_lock_pins WHERE school_id = ?1)",
        [school_id],
        |row| row.get::<_, bool>(0),
    )
    .map_err(Into::into)
}

/// The stored PIN hash for `school_id`, if one has been set.
pub fn find_pin(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Option<crate::crypto::pin_lock::PinHash>> {
    conn.query_row(
        "SELECT salt, hash, iterations FROM structural_lock_pins WHERE school_id = ?1",
        [school_id],
        |row| {
            let salt_vec: Vec<u8> = row.get(0)?;
            let hash_vec: Vec<u8> = row.get(1)?;
            let iterations: u32 = row.get(2)?;
            let mut salt = [0u8; SALT_LEN];
            let mut hash = [0u8; HASH_LEN];
            salt.copy_from_slice(&salt_vec);
            hash.copy_from_slice(&hash_vec);
            Ok(crate::crypto::pin_lock::PinHash {
                salt,
                hash,
                iterations,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Sets (or replaces) `school_id`'s structural-lock PIN. Idempotent
/// replace, matching `repository::school::set_logo`'s own
/// UPSERT-by-primary-key shape -- a school setting a new PIN simply
/// overwrites the previous one, there is no "PIN history."
pub fn set_pin(
    conn: &Connection,
    school_id: &str,
    pin_hash: &crate::crypto::pin_lock::PinHash,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO structural_lock_pins (school_id, salt, hash, iterations)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(school_id) DO UPDATE SET
            salt = excluded.salt,
            hash = excluded.hash,
            iterations = excluded.iterations,
            updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (
            school_id,
            pin_hash.salt.as_slice(),
            pin_hash.hash.as_slice(),
            pin_hash.iterations,
        ),
    )?;
    Ok(())
}

/// Removes `school_id`'s structural-lock PIN entirely, reverting to "no
/// lock configured" -- structural edits are no longer gated for this
/// school until a new PIN is set. Idempotent -- clearing an
/// already-absent PIN succeeds silently.
pub fn clear_pin(conn: &Connection, school_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM structural_lock_pins WHERE school_id = ?1",
        [school_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::pin_lock;
    use crate::repository::school;
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn a_new_school_has_no_pin_configured() {
        let conn = open_test_db();
        let sch = school::create(&conn, "Mabini Elementary").unwrap();

        assert!(!has_pin(&conn, &sch.id).unwrap());
        assert_eq!(find_pin(&conn, &sch.id).unwrap(), None);
    }

    #[test]
    fn set_pin_then_find_pin_round_trips() {
        let conn = open_test_db();
        let sch = school::create(&conn, "Mabini Elementary").unwrap();
        let hash = pin_lock::derive_pin_hash("246810").unwrap();

        set_pin(&conn, &sch.id, &hash).unwrap();

        assert!(has_pin(&conn, &sch.id).unwrap());
        let stored = find_pin(&conn, &sch.id).unwrap().unwrap();
        assert_eq!(stored, hash);
        assert!(pin_lock::verify_pin("246810", &stored));
    }

    #[test]
    fn set_pin_replaces_a_previous_pin_rather_than_erroring() {
        let conn = open_test_db();
        let sch = school::create(&conn, "Mabini Elementary").unwrap();
        set_pin(&conn, &sch.id, &pin_lock::derive_pin_hash("1111").unwrap()).unwrap();

        let new_hash = pin_lock::derive_pin_hash("2222").unwrap();
        set_pin(&conn, &sch.id, &new_hash).unwrap();

        let stored = find_pin(&conn, &sch.id).unwrap().unwrap();
        assert_eq!(stored, new_hash);
        assert!(pin_lock::verify_pin("2222", &stored));
        assert!(!pin_lock::verify_pin("1111", &stored));
    }

    #[test]
    fn clear_pin_removes_it() {
        let conn = open_test_db();
        let sch = school::create(&conn, "Mabini Elementary").unwrap();
        set_pin(&conn, &sch.id, &pin_lock::derive_pin_hash("1234").unwrap()).unwrap();

        clear_pin(&conn, &sch.id).unwrap();

        assert!(!has_pin(&conn, &sch.id).unwrap());
    }

    #[test]
    fn clear_pin_on_a_school_with_no_pin_is_a_harmless_no_op() {
        let conn = open_test_db();
        let sch = school::create(&conn, "Mabini Elementary").unwrap();

        clear_pin(&conn, &sch.id).unwrap();

        assert!(!has_pin(&conn, &sch.id).unwrap());
    }

    #[test]
    fn a_pin_set_for_one_school_does_not_affect_another_schools_lock_state() {
        let conn = open_test_db();
        let sch_a = school::create(&conn, "Mabini Elementary").unwrap();
        let sch_b = school::create(&conn, "Rizal High").unwrap();

        set_pin(
            &conn,
            &sch_a.id,
            &pin_lock::derive_pin_hash("1234").unwrap(),
        )
        .unwrap();

        assert!(has_pin(&conn, &sch_a.id).unwrap());
        assert!(!has_pin(&conn, &sch_b.id).unwrap());
    }
}
