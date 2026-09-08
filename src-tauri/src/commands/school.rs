use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::school::{self, School};

#[tauri::command]
pub fn list_schools(db: State<'_, Mutex<Connection>>) -> AppResult<Vec<School>> {
    let conn = lock_db(&db);
    school::list_all(&conn)
}

#[tauri::command]
pub fn create_school(db: State<'_, Mutex<Connection>>, name: String) -> AppResult<School> {
    let conn = lock_db(&db);
    school::create(&conn, &name)
}

/// Logos are a small identity icon, not a document store -- 512 KiB is
/// generous headroom for a sidebar/header-sized PNG/JPEG/WebP while
/// keeping the encrypted working database from growing unboundedly.
const MAX_LOGO_BYTES: usize = 512 * 1024;

/// Deliberately narrow: this is what actually renders in an `<img>` in
/// the app shell today. Anything else (SVG in particular -- arbitrary
/// script content) is rejected rather than allow-listed later.
const ALLOWED_LOGO_MIME_TYPES: &[&str] = &["image/png", "image/jpeg", "image/webp"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolLogoDto {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// Returns the fixed magic-byte signature that a genuine file of `mime`
/// must start with. Deliberately checked against the actual leading
/// bytes rather than trusting the caller-declared `mime` string alone --
/// an independent security self-review of this command (2026-09-08,
/// `.claude/rules/autonomous-development.md`'s reviewer-fallback
/// procedure) found that `ALLOWED_LOGO_MIME_TYPES` only ever validated
/// the label a caller supplied, never the bytes themselves, so any
/// arbitrary blob could be stored (and later read back and rendered as
/// an `<img>`) merely by lying about its `mime` field. WebP's signature
/// spans two non-contiguous fields (`RIFF` at offset 0, `WEBP` at offset
/// 8) so it is checked directly in `validate_logo_upload` rather than as
/// one contiguous slice here.
fn magic_bytes_for(mime: &str) -> Option<&'static [u8]> {
    match mime {
        "image/png" => Some(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        "image/jpeg" => Some(&[0xFF, 0xD8, 0xFF]),
        _ => None,
    }
}

/// Pure validation extracted from `set_school_logo` so it is directly
/// unit-testable without a `State`-carrying Tauri command harness
/// (matching this codebase's established command-testing convention,
/// see `commands::device_sync`'s own test module doc comment). Checks
/// size, declared-MIME allow-listing, AND that the actual bytes begin
/// with that MIME type's real magic-byte signature -- closing the
/// MIME-sniffing gap found in self-review.
fn validate_logo_upload(mime: &str, bytes: &[u8]) -> AppResult<()> {
    if bytes.is_empty() {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            "logo upload must not be empty".to_string(),
        )));
    }
    if bytes.len() > MAX_LOGO_BYTES {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!(
                "logo upload of {} bytes exceeds the {MAX_LOGO_BYTES}-byte limit",
                bytes.len()
            ),
        )));
    }
    if !ALLOWED_LOGO_MIME_TYPES.contains(&mime) {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("unsupported logo type '{mime}'"),
        )));
    }

    let signature_matches = if mime == "image/webp" {
        // RIFF....WEBP: "RIFF" at offset 0, "WEBP" at offset 8 (offsets
        // 4..8 are a little-endian chunk-size field, which legitimately
        // varies per file and is never checked).
        bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP"
    } else {
        match magic_bytes_for(mime) {
            Some(sig) => bytes.starts_with(sig),
            None => false,
        }
    };
    if !signature_matches {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("logo bytes do not match the declared '{mime}' file signature"),
        )));
    }
    Ok(())
}

/// Uploads or replaces the caller's own school's branding logo. School
/// Head only (`ManageSchoolBranding`) -- `school_id` is always
/// session-derived, never a parameter, matching every other tenant-write
/// command in this codebase. Rejects an oversized upload, a MIME type
/// outside `ALLOWED_LOGO_MIME_TYPES`, or bytes whose magic-byte signature
/// doesn't match the declared MIME type, at this layer, before any bytes
/// reach the repository -- this codebase's established convention that
/// validation lives at the command/application boundary, not the
/// repository (see `.claude/rules/architecture.md`). Also requires the
/// ADR-0070 structural-lock PIN to be unlocked for this session, IF the
/// school has configured one -- school branding is part of "school
/// identity," the first of that ADR's three named gated surfaces. A
/// school that never set a PIN sees no change here at all.
#[tauri::command]
pub fn set_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    mime: String,
    bytes: Vec<u8>,
) -> AppResult<()> {
    validate_logo_upload(&mime, &bytes)?;

    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    auth::require_structural_lock_unlocked(&conn, &sessions)?;
    school::set_logo(&conn, &school_id, &mime, &bytes)
}

/// Reads back the caller's own school's branding logo, if any. Any
/// authenticated member of the school may view it (it renders in the
/// shared app shell for every role) -- session-scoped read, no
/// dedicated capability, matching this codebase's convention for
/// same-school reference data (e.g. `current_section_adviser`).
#[tauri::command]
pub fn get_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<SchoolLogoDto>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let logo = school::get_logo(&conn, &school_id)?;
    Ok(logo.map(|l| SchoolLogoDto {
        mime: l.mime,
        bytes: l.bytes,
    }))
}

/// Removes the caller's own school's branding logo. School Head only,
/// same `ManageSchoolBranding` gate as `set_school_logo` -- and the same
/// ADR-0070 structural-lock requirement when one is configured.
#[tauri::command]
pub fn clear_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    auth::require_structural_lock_unlocked(&conn, &sessions)?;
    school::clear_logo(&conn, &school_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    const REAL_PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3];
    const REAL_JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3];

    fn real_webp() -> Vec<u8> {
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&[0, 0, 0, 0]); // chunk size, unchecked
        bytes.extend_from_slice(b"WEBP");
        bytes.extend_from_slice(&[1, 2, 3]);
        bytes
    }

    #[test]
    fn accepts_bytes_whose_signature_matches_the_declared_mime() {
        assert!(validate_logo_upload("image/png", REAL_PNG).is_ok());
        assert!(validate_logo_upload("image/jpeg", REAL_JPEG).is_ok());
        assert!(validate_logo_upload("image/webp", &real_webp()).is_ok());
    }

    #[test]
    fn rejects_bytes_declared_as_png_that_are_not_actually_png() {
        let not_png = b"<html><script>alert(1)</script></html>".to_vec();

        let result = validate_logo_upload("image/png", &not_png);

        assert!(
            result.is_err(),
            "a mislabeled non-PNG blob must be rejected"
        );
    }

    #[test]
    fn rejects_a_real_png_mislabeled_as_a_different_allowed_mime() {
        // Confirms the check is genuinely cross-type, not just "is this
        // one of the three real signatures" -- content and declared
        // label must agree.
        let result = validate_logo_upload("image/jpeg", REAL_PNG);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_unlisted_mime_type_before_checking_signature() {
        let result = validate_logo_upload("image/svg+xml", b"<svg/>");

        assert!(result.is_err());
    }

    #[test]
    fn rejects_an_empty_upload() {
        assert!(validate_logo_upload("image/png", &[]).is_err());
    }

    #[test]
    fn rejects_an_oversized_upload_even_with_a_valid_signature() {
        let mut oversized = REAL_PNG.to_vec();
        oversized.resize(MAX_LOGO_BYTES + 1, 0);

        let result = validate_logo_upload("image/png", &oversized);

        assert!(result.is_err());
    }

    #[test]
    fn rejects_a_truncated_webp_missing_the_webp_marker() {
        let truncated = b"RIFF\x00\x00\x00\x00".to_vec();

        let result = validate_logo_upload("image/webp", &truncated);

        assert!(result.is_err());
    }
}
