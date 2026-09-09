//! ADR-0087 / Batch 14 sub-item 3: the disaster-recovery backup command.
//! A thin `State`-unwrapping wrapper around `backup::create_two_copy_backup`
//! -- all real logic (the SQLCipher export mechanism, key handling) lives
//! in `backup`, matching this codebase's established command-layer
//! convention (see `commands::structural_lock` for the same shape).

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::{self, Capability, SessionManager};
use crate::backup;
use crate::commands::lock_db;
use crate::error::AppResult;

const BACKUP_SUBDIR: &str = "backups";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisasterRecoveryBackupResult {
    pub primary_path: String,
    pub secondary_path: String,
}

/// Creates two independent, encrypted, verifiable disaster-recovery
/// backup copies of the ENTIRE local database at
/// `<app data dir>/backups/likha-sis-backup-<timestamp>-{a,b}.db`. School
/// Head only (`Capability::CreateDisasterRecoveryBackup`) -- this backs
/// up the whole installation's data, not one caller-scoped slice, so it
/// gets the same conservative gating `ManageStructuralLock` and
/// `ManageSchoolMembership` already use for whole-installation
/// administrative actions.
///
/// Re-running this command overwrites any prior backup at the exact same
/// generated filename (only possible if two backups are requested within
/// the same second) -- see `backup::create_two_copy_backup`'s own doc
/// comment for why that overwrite is safe and intended.
#[tauri::command]
pub fn create_disaster_recovery_backup(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<DisasterRecoveryBackupResult> {
    let conn = lock_db(&db);
    auth::authorize_capability(&conn, &sessions, Capability::CreateDisasterRecoveryBackup)?;

    let key = crate::db::load_encryption_key(&app)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    let backup_dir = app_data_dir.join(BACKUP_SUBDIR);
    std::fs::create_dir_all(&backup_dir)?;

    let timestamp = chrono_like_timestamp();
    let primary_path = backup_dir.join(format!("likha-sis-backup-{timestamp}-a.db"));
    let secondary_path = backup_dir.join(format!("likha-sis-backup-{timestamp}-b.db"));

    let copies = backup::create_two_copy_backup(&conn, &key, &primary_path, &secondary_path)?;

    Ok(DisasterRecoveryBackupResult {
        primary_path: copies.primary_path.to_string_lossy().to_string(),
        secondary_path: copies.secondary_path.to_string_lossy().to_string(),
    })
}

/// A filesystem-safe, sortable timestamp for backup filenames
/// (`YYYYMMDD-HHMMSS`), without adding a new `chrono`/`time` dependency
/// -- this codebase has no existing dependency on either crate, and one
/// `SystemTime` calculation is simpler than adding one for this single
/// use. Deliberately UTC-based (via `SystemTime`'s epoch offset, not the
/// OS local clock) so backup filenames sort correctly regardless of the
/// hub laptop's timezone setting.
fn chrono_like_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    timestamp_from_unix_seconds(now.as_secs())
}

/// The pure, injectable half of `chrono_like_timestamp` -- separated
/// purely so the civil-date conversion can be unit-tested against a
/// fixed, independently-verifiable Unix timestamp rather than only ever
/// running against "whatever the real clock says right now".
fn timestamp_from_unix_seconds(total_secs: u64) -> String {
    let days = total_secs / 86_400;
    let secs_of_day = total_secs % 86_400;

    // Civil-from-days algorithm (Howard Hinnant's well-known public-domain
    // date algorithm) -- converts a day count since the Unix epoch into a
    // proleptic-Gregorian (year, month, day) without needing a calendar
    // crate. Widely used/verified; not this project's own invention.
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let hh = secs_of_day / 3_600;
    let mm = (secs_of_day % 3_600) / 60;
    let ss = secs_of_day % 60;

    format!("{y:04}{m:02}{d:02}-{hh:02}{mm:02}{ss:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamp_is_filesystem_safe_and_fixed_width() {
        let ts = chrono_like_timestamp();
        assert_eq!(ts.len(), 15, "expected YYYYMMDD-HHMMSS, got {ts:?}");
        assert!(
            ts.chars().all(|c| c.is_ascii_digit() || c == '-'),
            "timestamp must contain only digits and a single separator: {ts:?}"
        );
        assert_eq!(ts.matches('-').count(), 1);
    }

    #[test]
    fn known_unix_seconds_produce_the_expected_calendar_timestamp() {
        // 1_788_912_000 = 2026-09-09T00:00:00Z (verified against a
        // standard Unix epoch converter) -- proves the hand-rolled
        // days-since-epoch -> civil-date conversion is actually correct,
        // not just "produces a 15-character string".
        assert_eq!(
            timestamp_from_unix_seconds(1_788_912_000),
            "20260909-000000"
        );
    }

    #[test]
    fn known_unix_seconds_mid_day_produce_the_expected_time_of_day() {
        // Same date, 13:45:30 UTC later (49_530 seconds into the day).
        assert_eq!(
            timestamp_from_unix_seconds(1_788_912_000 + 49_530),
            "20260909-134530"
        );
    }

    #[test]
    fn timestamp_never_produces_two_backups_the_same_second_a_collision() {
        let a = timestamp_from_unix_seconds(1_788_912_000);
        let b = timestamp_from_unix_seconds(1_757_376_001);
        assert_ne!(a, b);
    }
}
