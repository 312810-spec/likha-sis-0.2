//! A learner's photo, stored as a BLOB inside the already-SQLCipher-
//! encrypted working database — the same pattern `school_branding`
//! established for logos (see `docs/adr/0045-school-branding.md`), reused
//! here rather than a plaintext file on disk, for encryption-at-rest with
//! no extra code (ADR-0003).

use image::ImageReader;
use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Same generous cap as `branding::logo::MAX_LOGO_BYTES` — plenty for any
/// real photo, small enough to never be a concern as a SQLite BLOB.
pub const MAX_PHOTO_BYTES: usize = 2 * 1024 * 1024;

/// Decompression-bomb guard, same reasoning as
/// `branding::logo::MAX_LOGO_PIXELS`: a small compressed file can still
/// claim an enormous pixel grid. Duplicated here in miniature rather than
/// shared with `branding::logo` — a learner photo has no color-extraction
/// step to share that module with, and this check is three lines.
const MAX_PHOTO_PIXELS: u64 = 50_000_000;

/// Matches the `learner_photos.photo_mime` `CHECK` constraint.
pub fn is_supported_mime(mime: &str) -> bool {
    mime == "image/png" || mime == "image/jpeg"
}

fn validate_image(bytes: &[u8]) -> AppResult<()> {
    if bytes.is_empty() {
        return Err(AppError::InvalidImage("empty file".to_string()));
    }
    if bytes.len() > MAX_PHOTO_BYTES {
        return Err(AppError::InvalidImage("file too large".to_string()));
    }
    let (width, height) = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?
        .into_dimensions()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?;
    if (width as u64) * (height as u64) > MAX_PHOTO_PIXELS {
        return Err(AppError::InvalidImage(
            "image dimensions too large".to_string(),
        ));
    }
    Ok(())
}

/// Sets (or replaces) `learner_id`'s photo, scoped to `school_id` via an
/// `INSERT ... SELECT ... WHERE` against `learners` rather than a
/// separate existence check — `learner_id` belonging to a different
/// school (or not existing at all) inserts zero rows, returned as
/// `Ok(false)`. Returns `bool`, not `Option<()>`: serde serializes both
/// `Some(())` and `None` as JSON `null`, which would make success and
/// not-found indistinguishable to the frontend.
pub fn set(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    photo: &[u8],
    photo_mime: &str,
) -> AppResult<bool> {
    if !is_supported_mime(photo_mime) {
        return Err(AppError::InvalidImage(
            "unsupported photo format".to_string(),
        ));
    }
    validate_image(photo)?;

    let rows_affected = conn.execute(
        "INSERT INTO learner_photos (learner_id, photo, photo_mime, updated_at) \
         SELECT id, ?1, ?2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         FROM learners WHERE id = ?3 AND school_id = ?4 \
         ON CONFLICT (learner_id) DO UPDATE SET \
             photo = excluded.photo, photo_mime = excluded.photo_mime, \
             updated_at = excluded.updated_at",
        (photo, photo_mime, learner_id, school_id),
    )?;
    Ok(rows_affected > 0)
}

/// The raw photo bytes plus MIME type, school-scoped via a join against
/// `learners` (never trusting `learner_id` alone).
pub fn get(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Option<(Vec<u8>, String)>> {
    conn.query_row(
        "SELECT learner_photos.photo, learner_photos.photo_mime \
         FROM learner_photos \
         JOIN learners ON learners.id = learner_photos.learner_id \
         WHERE learner_photos.learner_id = ?1 AND learners.school_id = ?2",
        (learner_id, school_id),
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Removes `learner_id`'s photo, school-scoped. Returns whether a row was
/// actually removed (a plain delete, not a soft-clear flag — clearing an
/// already-photo-less learner is a harmless no-op, matching
/// `school_branding::clear`'s sibling convention for its own `()` return,
/// except this also tells the caller whether there was anything to clear).
pub fn clear(conn: &Connection, school_id: &str, learner_id: &str) -> AppResult<bool> {
    let rows_affected = conn.execute(
        "DELETE FROM learner_photos WHERE learner_id IN ( \
            SELECT id FROM learners WHERE id = ?1 AND school_id = ?2 \
         )",
        (learner_id, school_id),
    )?;
    Ok(rows_affected > 0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{learner, school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn seed_school_and_learner(conn: &Connection) -> (String, String) {
        let s = school::create(conn, "Mabini Elementary").unwrap();
        let l = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        (s.id, l.id)
    }

    fn solid_png(width: u32, height: u32) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(width, height, image::Rgba([10, 20, 30, 255]));
        let mut bytes = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
        bytes
    }

    #[test]
    fn setting_then_getting_a_photo_round_trips_the_bytes_and_mime() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        let photo = solid_png(10, 10);

        let result = set(&conn, &school_id, &learner_id, &photo, "image/png").unwrap();
        assert!(result);

        let (stored_bytes, stored_mime) = get(&conn, &school_id, &learner_id).unwrap().unwrap();
        assert_eq!(stored_bytes, photo);
        assert_eq!(stored_mime, "image/png");
    }

    #[test]
    fn a_learner_with_no_photo_returns_none_not_an_error() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);

        let result = get(&conn, &school_id, &learner_id).unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn setting_a_photo_for_a_learner_in_a_different_school_is_rejected() {
        let conn = open_test_db();
        let (_school_id, learner_id) = seed_school_and_learner(&conn);
        let other_school = school::create(&conn, "Rizal High").unwrap();
        let photo = solid_png(10, 10);

        let result = set(&conn, &other_school.id, &learner_id, &photo, "image/png").unwrap();

        assert!(!result);
        assert!(get(&conn, &other_school.id, &learner_id).unwrap().is_none());
    }

    #[test]
    fn setting_a_photo_twice_replaces_it_not_duplicates_it() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        set(
            &conn,
            &school_id,
            &learner_id,
            &solid_png(10, 10),
            "image/png",
        )
        .unwrap();

        let second = solid_png(20, 20);
        set(&conn, &school_id, &learner_id, &second, "image/png").unwrap();

        let (stored_bytes, _) = get(&conn, &school_id, &learner_id).unwrap().unwrap();
        assert_eq!(stored_bytes, second);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM learner_photos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn an_unsupported_mime_type_is_rejected() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);

        let result = set(
            &conn,
            &school_id,
            &learner_id,
            &solid_png(5, 5),
            "image/gif",
        );

        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn an_undecodable_photo_is_rejected_and_stores_nothing() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);

        let result = set(&conn, &school_id, &learner_id, b"not an image", "image/png");

        assert!(matches!(result, Err(AppError::InvalidImage(_))));
        assert!(get(&conn, &school_id, &learner_id).unwrap().is_none());
    }

    #[test]
    fn a_small_file_claiming_an_enormous_pixel_grid_is_rejected_before_decoding() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        let huge = solid_png(9000, 9000);
        assert!(huge.len() < MAX_PHOTO_BYTES);

        let result = set(&conn, &school_id, &learner_id, &huge, "image/png");

        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn clearing_removes_the_photo_and_get_returns_none_again() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        set(
            &conn,
            &school_id,
            &learner_id,
            &solid_png(10, 10),
            "image/png",
        )
        .unwrap();

        let cleared = clear(&conn, &school_id, &learner_id).unwrap();

        assert!(cleared);
        assert!(get(&conn, &school_id, &learner_id).unwrap().is_none());
    }

    #[test]
    fn clearing_a_learner_with_no_photo_is_a_harmless_no_op() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);

        let cleared = clear(&conn, &school_id, &learner_id).unwrap();

        assert!(!cleared);
    }

    #[test]
    fn clearing_never_crosses_schools() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        set(
            &conn,
            &school_id,
            &learner_id,
            &solid_png(10, 10),
            "image/png",
        )
        .unwrap();
        let other_school = school::create(&conn, "Rizal High").unwrap();

        let cleared = clear(&conn, &other_school.id, &learner_id).unwrap();

        assert!(!cleared);
        assert!(get(&conn, &school_id, &learner_id).unwrap().is_some());
    }

    #[test]
    fn photo_is_removed_when_its_learner_is_deleted() {
        let conn = open_test_db();
        let (school_id, learner_id) = seed_school_and_learner(&conn);
        set(
            &conn,
            &school_id,
            &learner_id,
            &solid_png(10, 10),
            "image/png",
        )
        .unwrap();

        conn.execute("DELETE FROM learners WHERE id = ?1", [&learner_id])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM learner_photos", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }
}
