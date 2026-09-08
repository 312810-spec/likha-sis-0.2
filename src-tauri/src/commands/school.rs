use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::school::{self, School, SchoolCoordinates};

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

/// Logos are a small identity icon, not a document store. Sized so that a
/// max-size logo's encrypted sync payload (Batch 10,
/// `docs/adr/0081-school-logo-sync-byte-budget.md`) stays comfortably
/// under `sync::MAX_ENCRYPTED_CHANGE_BYTES` (256 KiB) -- see that ADR for
/// the full byte-budget math (worst-case JSON-array encoding of the raw
/// bytes, since this crate deliberately does not add a `base64` direct
/// dependency just for this, plus AES-256-GCM's 28 bytes of nonce+tag
/// overhead, plus a small JSON field wrapper). This was previously
/// 512 KiB (command-layer cap only, with no sync path); shrinking it --
/// rather than building a new binary-safe sync payload path -- was a
/// judgment call made in the project owner's absence, see that ADR's
/// "Decision" section. The actual sync wiring for this entity lands in
/// a follow-up checkpoint of the same batch; this checkpoint only
/// shrinks the number and proves the fit.
const MAX_LOGO_BYTES: usize = 48 * 1024;

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

/// Pure validation extracted from `set_school_coordinates` so it is
/// directly unit-testable without a `State`-carrying command harness --
/// same convention as `validate_logo_upload` above. Mirrors
/// `WeatherApplicationService.getSuspensionAdvisory`'s TS-side range
/// check exactly (-90..=90 / -180..=180) so an invalid value is rejected
/// at whichever layer sees it first, never silently clamped or stored.
fn validate_coordinates(latitude: f64, longitude: f64) -> AppResult<()> {
    if !latitude.is_finite() || !(-90.0..=90.0).contains(&latitude) {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("latitude {latitude} is out of range (-90..=90)"),
        )));
    }
    if !longitude.is_finite() || !(-180.0..=180.0).contains(&longitude) {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("longitude {longitude} is out of range (-180..=180)"),
        )));
    }
    Ok(())
}

/// Sets (or replaces) the caller's own school's coordinates, for the
/// Weather & Hazard Suspension Alerts advisory (ADR-0079). School Head
/// only (`ManageSchoolCoordinates`) -- `school_id` is always
/// session-derived, never a parameter, matching every other tenant-write
/// command in this codebase.
#[tauri::command]
pub fn set_school_coordinates(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    latitude: f64,
    longitude: f64,
) -> AppResult<()> {
    validate_coordinates(latitude, longitude)?;

    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolCoordinates)?;
    school::set_coordinates(&conn, &school_id, latitude, longitude)
}

/// Reads back the caller's own school's coordinates, if configured. Any
/// authenticated member of the school may view it -- same
/// no-dedicated-capability convention as `get_school_logo` (this is
/// read-only reference data for an advisory shown to any teacher, not an
/// administrative action).
#[tauri::command]
pub fn get_school_coordinates(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<SchoolCoordinates>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    school::get_coordinates(&conn, &school_id)
}

/// Clears the caller's own school's coordinates. School Head only, same
/// `ManageSchoolCoordinates` gate as `set_school_coordinates`.
#[tauri::command]
pub fn clear_school_coordinates(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolCoordinates)?;
    school::clear_coordinates(&conn, &school_id)
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

    #[test]
    fn accepts_a_valid_coordinate() {
        // Manila, roughly.
        assert!(validate_coordinates(14.5995, 120.9842).is_ok());
    }

    #[test]
    fn accepts_boundary_coordinates() {
        assert!(validate_coordinates(90.0, 180.0).is_ok());
        assert!(validate_coordinates(-90.0, -180.0).is_ok());
    }

    #[test]
    fn rejects_a_latitude_outside_the_valid_range() {
        assert!(validate_coordinates(90.1, 0.0).is_err());
        assert!(validate_coordinates(-90.1, 0.0).is_err());
    }

    #[test]
    fn rejects_a_longitude_outside_the_valid_range() {
        assert!(validate_coordinates(0.0, 180.1).is_err());
        assert!(validate_coordinates(0.0, -180.1).is_err());
    }

    #[test]
    fn rejects_non_finite_coordinates() {
        assert!(validate_coordinates(f64::NAN, 0.0).is_err());
        assert!(validate_coordinates(0.0, f64::INFINITY).is_err());
    }

    /// Ties `MAX_LOGO_BYTES` directly to `sync::MAX_ENCRYPTED_CHANGE_BYTES`
    /// so the two constants can never silently drift apart again (this is
    /// exactly the gap that let the old 512 KiB figure sit unnoticed past
    /// the 256 KiB sync cap until Batch 10 -- see
    /// `docs/adr/0081-school-logo-sync-byte-budget.md` for the full math).
    /// Deliberately worst-cases the plaintext encoding: `serde_json`'s
    /// default `Vec<u8>` serialization is a JSON array of decimal numbers
    /// (no `base64` -- adding that crate as a direct dependency just for
    /// this was rejected, see the ADR), so every byte can cost up to 4
    /// characters (`"255,"`).
    #[test]
    fn max_logo_bytes_leaves_headroom_under_the_sync_encrypted_change_cap() {
        const WORST_CASE_CHARS_PER_BYTE: usize = 4; // "255," (3 digits + comma)
        const JSON_WRAPPER_OVERHEAD: usize = 256; // schoolId/mime/brackets/keys, generous bound
        const AES_GCM_OVERHEAD: usize = 12 + 16; // nonce + auth tag, see crypto::payload_key

        let worst_case_encrypted =
            (MAX_LOGO_BYTES * WORST_CASE_CHARS_PER_BYTE) + JSON_WRAPPER_OVERHEAD + AES_GCM_OVERHEAD;

        assert!(
            worst_case_encrypted < crate::sync::MAX_ENCRYPTED_CHANGE_BYTES,
            "a max-size logo's worst-case encrypted sync payload ({worst_case_encrypted} bytes) \
             must stay under the sync cap ({} bytes)",
            crate::sync::MAX_ENCRYPTED_CHANGE_BYTES
        );
    }
}
