use rusqlite::Connection;
use serde::Serialize;

use crate::branding::logo;
use crate::branding::theme::{self, Rgb};
use crate::error::AppResult;

/// A school's uploaded logo (returned only by `get_logo`, kept out of
/// `SchoolBranding` so an ordinary theme fetch never pulls the BLOB
/// across the Tauri IPC boundary) plus its fully-derived theme. Never
/// recomputed on read -- `set` computes it once at upload time.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchoolBranding {
    pub school_id: String,
    pub primary_color: String,
    pub primary_text_color: String,
    pub secondary_color: String,
    pub secondary_text_color: String,
    pub accent_color: String,
    pub accent_text_color: String,
    pub selected_surface_color: String,
    pub restrained_surface_color: String,
    pub updated_at: String,
}

/// Accepted logo formats -- matches `school_branding.logo_mime`'s `CHECK`
/// constraint; kept as one list so a new accepted format only ever needs
/// changing in two places, both in this module's own vicinity.
pub fn is_supported_mime(mime: &str) -> bool {
    mime == "image/png" || mime == "image/jpeg"
}

/// Decodes `logo_bytes`, derives an accessibility-safe theme from it
/// (`branding::theme::derive_theme`), and stores both -- replacing any
/// existing branding for `school_id` in one upsert (`ON CONFLICT ...
/// DO UPDATE`, not `INSERT OR REPLACE`, which would delete-then-reinsert
/// the row and is unnecessary here since there is nothing referencing
/// `school_branding` by foreign key -- see `repository::role::grant`'s
/// own doc comment for the general reason this codebase avoids `OR
/// REPLACE`/`OR IGNORE` for anything but the most trivial case).
pub fn set(
    conn: &Connection,
    school_id: &str,
    logo_bytes: &[u8],
    logo_mime: &str,
) -> AppResult<SchoolBranding> {
    if !is_supported_mime(logo_mime) {
        return Err(crate::error::AppError::InvalidImage(
            "unsupported logo format".to_string(),
        ));
    }
    let seed: Rgb = logo::extract_dominant_color(logo_bytes)?;
    let derived = theme::derive_theme(seed);

    conn.execute(
        "INSERT INTO school_branding (
            school_id, logo, logo_mime,
            primary_color, primary_text_color,
            secondary_color, secondary_text_color,
            accent_color, accent_text_color,
            selected_surface_color, restrained_surface_color,
            updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        ON CONFLICT (school_id) DO UPDATE SET
            logo = excluded.logo,
            logo_mime = excluded.logo_mime,
            primary_color = excluded.primary_color,
            primary_text_color = excluded.primary_text_color,
            secondary_color = excluded.secondary_color,
            secondary_text_color = excluded.secondary_text_color,
            accent_color = excluded.accent_color,
            accent_text_color = excluded.accent_text_color,
            selected_surface_color = excluded.selected_surface_color,
            restrained_surface_color = excluded.restrained_surface_color,
            updated_at = excluded.updated_at",
        rusqlite::params![
            school_id,
            logo_bytes,
            logo_mime,
            derived.primary,
            derived.primary_text,
            derived.secondary,
            derived.secondary_text,
            derived.accent,
            derived.accent_text,
            derived.selected_surface,
            derived.restrained_surface,
        ],
    )?;

    get(conn, school_id).map(|b| b.expect("row just upserted must exist"))
}

pub fn get(conn: &Connection, school_id: &str) -> AppResult<Option<SchoolBranding>> {
    conn.query_row(
        "SELECT school_id, primary_color, primary_text_color, secondary_color,
                secondary_text_color, accent_color, accent_text_color,
                selected_surface_color, restrained_surface_color, updated_at
         FROM school_branding WHERE school_id = ?1",
        [school_id],
        |row| {
            Ok(SchoolBranding {
                school_id: row.get(0)?,
                primary_color: row.get(1)?,
                primary_text_color: row.get(2)?,
                secondary_color: row.get(3)?,
                secondary_text_color: row.get(4)?,
                accent_color: row.get(5)?,
                accent_text_color: row.get(6)?,
                selected_surface_color: row.get(7)?,
                restrained_surface_color: row.get(8)?,
                updated_at: row.get(9)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The raw logo bytes plus their MIME type, for rendering an `<img>`
/// preview -- kept as its own query (never joined into `get`'s result)
/// so an ordinary theme fetch never pulls the BLOB across the Tauri IPC
/// boundary unless a caller actually wants to display the logo itself.
pub fn get_logo(conn: &Connection, school_id: &str) -> AppResult<Option<(Vec<u8>, String)>> {
    conn.query_row(
        "SELECT logo, logo_mime FROM school_branding WHERE school_id = ?1",
        [school_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Reverts a school to the default (unbranded) theme. A school with no
/// branding row is already indistinguishable from a cleared one -- this
/// is a plain delete, not a soft-clear flag, since nothing else in the
/// schema references `school_branding` by foreign key.
pub fn clear(conn: &Connection, school_id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM school_branding WHERE school_id = ?1",
        [school_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn seed_school(conn: &Connection) -> String {
        crate::repository::school::create(conn, "Mabini Elementary")
            .unwrap()
            .id
    }

    fn solid_png(color: [u8; 4]) -> Vec<u8> {
        let img = image::RgbaImage::from_pixel(20, 20, image::Rgba(color));
        let mut bytes = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
        bytes
    }

    #[test]
    fn setting_branding_then_getting_it_round_trips_a_derived_theme() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);
        let logo = solid_png([30, 144, 255, 255]);

        let created = set(&conn, &school_id, &logo, "image/png").unwrap();
        let fetched = get(&conn, &school_id).unwrap();

        assert_eq!(Some(created), fetched);
    }

    #[test]
    fn a_school_with_no_branding_returns_none_not_an_error() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);

        assert_eq!(get(&conn, &school_id).unwrap(), None);
    }

    #[test]
    fn setting_branding_twice_replaces_the_prior_theme_not_duplicates_it() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);
        set(
            &conn,
            &school_id,
            &solid_png([30, 144, 255, 255]),
            "image/png",
        )
        .unwrap();

        let second = set(
            &conn,
            &school_id,
            &solid_png([200, 20, 20, 255]),
            "image/png",
        )
        .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM school_branding WHERE school_id = ?1",
                [&school_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            count, 1,
            "must replace, never duplicate, the one row per school"
        );
        assert_eq!(get(&conn, &school_id).unwrap(), Some(second));
    }

    #[test]
    fn get_logo_returns_the_stored_bytes_and_mime_separately_from_the_theme() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);
        let logo_bytes = solid_png([30, 144, 255, 255]);
        set(&conn, &school_id, &logo_bytes, "image/png").unwrap();

        let (stored_bytes, stored_mime) = get_logo(&conn, &school_id).unwrap().unwrap();

        assert_eq!(stored_bytes, logo_bytes);
        assert_eq!(stored_mime, "image/png");
    }

    #[test]
    fn clearing_branding_removes_it_and_get_returns_none_again() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);
        set(
            &conn,
            &school_id,
            &solid_png([30, 144, 255, 255]),
            "image/png",
        )
        .unwrap();

        clear(&conn, &school_id).unwrap();

        assert_eq!(get(&conn, &school_id).unwrap(), None);
    }

    #[test]
    fn clearing_a_school_with_no_branding_is_a_harmless_no_op() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);

        let result = clear(&conn, &school_id);

        assert!(result.is_ok());
    }

    #[test]
    fn an_unsupported_mime_type_is_rejected() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);

        let result = set(
            &conn,
            &school_id,
            &solid_png([30, 144, 255, 255]),
            "image/gif",
        );

        assert!(matches!(
            result,
            Err(crate::error::AppError::InvalidImage(_))
        ));
    }

    #[test]
    fn an_undecodable_logo_is_rejected_and_stores_nothing() {
        let conn = open_test_db();
        let school_id = seed_school(&conn);

        let result = set(&conn, &school_id, b"not a real image", "image/png");

        assert!(result.is_err());
        assert_eq!(get(&conn, &school_id).unwrap(), None);
    }

    #[test]
    fn branding_is_removed_when_its_school_is_deleted() {
        let conn = open_test_db();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let school_id = seed_school(&conn);
        set(
            &conn,
            &school_id,
            &solid_png([30, 144, 255, 255]),
            "image/png",
        )
        .unwrap();

        conn.execute("DELETE FROM schools WHERE id = ?1", [&school_id])
            .unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM school_branding", [], |r| r.get(0))
            .unwrap();
        assert_eq!(
            count, 0,
            "ON DELETE CASCADE must remove branding with its school"
        );
    }
}
