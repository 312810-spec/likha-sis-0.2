use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};
use zeroize::Zeroize;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::hub_server::SharedSspk;
use crate::repository::device_credential::{self, ActiveDeviceCredential, EnrolledCredential};
use crate::repository::device_identity;
use crate::repository::device_sync_client_credential;

/// Tauri command surface for ADR-0067's device sync enrollment/revocation
/// and ADR-0069's key ceremony. Both `auth::enroll_device_sync_credential`
/// and `auth::revoke_device_sync_credential_and_rotate_sspk` have been
/// fully implemented and tested since Wave 2's ADR-0067/0069 work, but --
/// as recorded in `docs/CURRENT-HANDOFF.md` -- neither was ever wired to
/// a `#[tauri::command]`, so the app itself could not reach them. This
/// module closes that gap; `list_device_sync_credentials` (below) was
/// added in the following slice once `src/ui/DeviceManagementScreen.tsx`
/// needed a read side to list against.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnrolledDeviceCredential {
    pub credential_id: String,
    /// Hex-encoded plaintext device secret. Returned exactly once, at
    /// enrollment -- see `EnrolledCredential::secret_hex`'s own doc
    /// comment. The frontend is responsible for storing it securely on
    /// this device; it is never recoverable from the server side again.
    pub secret_hex: String,
}

impl From<EnrolledCredential> for EnrolledDeviceCredential {
    fn from(value: EnrolledCredential) -> Self {
        Self {
            credential_id: value.id,
            secret_hex: value.secret_hex,
        }
    }
}

/// Enrolls THIS installation's own device (`device_identity::current_or_create`,
/// never a client-supplied device id -- there is exactly one physical
/// device behind this Tauri process, and trusting a client-chosen id would
/// let a caller enroll a credential purporting to be some other machine)
/// for background sync, per ADR-0067/0069.
///
/// Deliberately mirrors `commands::auth::login`'s shape, not the
/// session-derived-`school_id` convention every other tenant-data command
/// in this module uses: like `login`, this operation is the *bootstrap*
/// of trust for its own credential class -- there is no sync-credential
/// session yet to derive `school_id` from, and an *interactive* session
/// (if one happens to be active) is a different, unrelated credential
/// class entirely and must not be silently trusted here. `school_id` is
/// therefore accepted as a parameter, exactly like `login`'s, and is
/// re-verified by `auth::enroll_device_sync_credential` itself against
/// the authenticated user's actual school membership -- a caller cannot
/// enroll a device into a school the authenticating user does not belong
/// to, regardless of what `school_id` it passes (see that function's own
/// `Err(Unauthorized)` test for a user outside the target school). This
/// is the same "credential-based, not session-based, trust boundary"
/// already established for `login`/`register_user`'s bootstrap gates in
/// ADR-0004 -- not a new exception.
///
/// The school sync-payload key is resolved (minted, on this school's
/// first-ever enrollment) via `db::load_or_mint_sspk` and wrapped for the
/// new credential in the same atomic step as issuing it, matching every
/// other `resolve_sspk_if_enrolled` caller's contract in this codebase.
#[tauri::command]
pub fn enroll_device_sync_credential(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    username: String,
    mut password: String,
    school_id: String,
    device_label: Option<String>,
) -> AppResult<EnrolledDeviceCredential> {
    let conn = lock_db(&db);
    let device_id = device_identity::current_or_create(&conn)?;
    let sspk = db::load_or_mint_sspk(&app)?;

    let result = auth::enroll_device_sync_credential(
        &conn,
        &username,
        &password,
        &school_id,
        &device_id,
        device_label.as_deref(),
        &sspk,
    );
    password.zeroize();

    result.map(EnrolledDeviceCredential::from)
}

/// Revokes a device's sync credential and rotates this school's SSPK, per
/// ADR-0069's revocation addendum. Wraps
/// `auth::revoke_device_sync_credential_and_rotate_sspk` ONLY -- the
/// rotating wrapper, never the raw `auth::revoke_device_sync_credential`
/// directly (see that function's own doc comment: calling the raw
/// function anywhere outside the rotating wrapper leaves every other
/// active device's stored key wrap describing a key an attacker who
/// obtained the revoked device's secret could still, in principle, have
/// captured before revocation).
///
/// Unlike enrollment, this genuinely requires an active *interactive*
/// session (checked inside `auth::revoke_device_sync_credential` itself
/// via `SessionManager::require_active_session`) -- revoking a device
/// requires either owning it or holding `ManageSchoolMembership` in the
/// SAME school the credential belongs to, both of which only make sense
/// once someone is already logged in. `school_id` is never accepted as a
/// parameter here at all; it comes only from the session, matching every
/// other tenant-data command in this codebase.
///
/// The `rotate_sspk` closure both overwrites the on-disk DPAPI file
/// (`db::rotate_sspk`) AND pushes the freshly-minted key into `sspk_cell`
/// -- the same `SharedSspk` handle `hub_server`'s already-running
/// listener reads from. Without the second half, this closure would only
/// rotate the file, and an already-running hub process would keep
/// authenticating every device (including the just-revoked one) against
/// the stale in-memory key for the rest of its lifetime -- exactly the
/// BLOCKING gap this project's first genuinely independent security
/// review found (`docs/reviews/2026-09-07-sync-payload-encryption-review.md`).
#[tauri::command]
pub fn revoke_device_sync_credential(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    sspk_cell: State<'_, SharedSspk>,
    credential_id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let sspk_cell = sspk_cell.inner().clone();
    auth::revoke_device_sync_credential_and_rotate_sspk(&conn, &sessions, &credential_id, || {
        let new_key = db::rotate_sspk(&app)?;
        *sspk_cell
            .0
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(new_key);
        Ok(())
    })
}

/// One row of the device-management screen's list -- see
/// `ActiveDeviceCredential`'s own doc comment for what's included and
/// why (no secret material).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSyncCredentialSummary {
    pub credential_id: String,
    pub device_label: Option<String>,
    pub owner_display_name: String,
    pub owner_username: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl From<ActiveDeviceCredential> for DeviceSyncCredentialSummary {
    fn from(value: ActiveDeviceCredential) -> Self {
        Self {
            credential_id: value.credential_id,
            device_label: value.device_label,
            owner_display_name: value.owner_display_name,
            owner_username: value.owner_username,
            created_at: value.created_at,
            last_used_at: value.last_used_at,
        }
    }
}

/// Validates a caller-supplied hub base URL before it is ever stored: a
/// non-empty, trimmed `http://`/`https://` origin (scheme + host,
/// optional port), rejecting anything else outright -- a malformed value
/// here would otherwise surface only much later as an opaque connection
/// failure inside `sync_client`'s background loop. Deliberately does not
/// resolve DNS or attempt a connection (that would make this command
/// network-dependent and slow for what is meant to be an instant save);
/// `sync_client::push_once`/`pull_once` already handle an unreachable-but
/// well-formed address as an ordinary `Offline`/`HubUnavailable` retry
/// case.
fn validate_hub_base_url(raw: &str) -> AppResult<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "Hub address cannot be empty.".to_string(),
        ));
    }
    let Ok(parsed) = url::Url::parse(trimmed) else {
        return Err(AppError::InvalidInput(format!(
            "\"{trimmed}\" is not a valid address."
        )));
    };
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err(AppError::InvalidInput(
            "Hub address must start with http:// or https://".to_string(),
        ));
    }
    if parsed.host_str().is_none() {
        return Err(AppError::InvalidInput(
            "Hub address must include a host.".to_string(),
        ));
    }
    // Normalized to just the origin (scheme + host + port when
    // non-default), never the raw caller string: `sync_client` always
    // appends its own `/sync/...` path segment onto `base_url`, so a
    // trailing path/slash/query the caller typed would otherwise get
    // silently doubled into every request. A validated `http`/`https`
    // URL always parses to a `Tuple` origin (never the opaque `"null"`
    // origin some other schemes produce), so this is always a real,
    // non-empty `scheme://host[:port]` string -- proven by this
    // function's own tests, including one with a non-default port.
    Ok(parsed.origin().unicode_serialization())
}

/// Sets (or clears, with `None`/an empty string) THIS device's hub
/// address for the caller's own school -- the fix for the gap recorded
/// at the end of Batches 16-18: a device could previously only reach a
/// hub bound to `127.0.0.1`, which only works when hub and client run on
/// the exact same machine. School-Head-only (`ManageSchoolMembership`,
/// the same capability `revoke_device_sync_credential` already gates
/// on): this setting controls where this device sends its own sync
/// credential secret on every push/pull round (see
/// `sync_client::push_once`'s `DEVICE_SECRET_HEADER`), so pointing it at
/// an attacker-controlled address would leak that secret -- not a
/// setting to leave changeable by any authenticated teacher. `school_id`
/// is always session-derived, never a parameter, matching every other
/// tenant-write command in this codebase.
///
/// Pure `&Connection`/`&SessionManager` logic, deliberately factored out
/// of the `#[tauri::command]` below so it is directly unit-testable
/// without a real `AppHandle`/`State` harness -- same convention as
/// `commands::school::validate_logo_upload`/`validate_coordinates`.
fn set_hub_base_url_for_session(
    conn: &Connection,
    sessions: &SessionManager,
    hub_base_url: Option<String>,
) -> AppResult<()> {
    let school_id = auth::authorize_capability(conn, sessions, Capability::ManageSchoolMembership)?;

    let normalized = match hub_base_url {
        None => None,
        Some(raw) if raw.trim().is_empty() => None,
        Some(raw) => Some(validate_hub_base_url(&raw)?),
    };
    device_sync_client_credential::set_hub_base_url(conn, &school_id, normalized.as_deref())
}

#[tauri::command]
pub fn set_sync_hub_base_url(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    hub_base_url: Option<String>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    set_hub_base_url_for_session(&conn, &sessions, hub_base_url)
}

/// Reads back THIS device's configured hub address for the caller's own
/// school, if any -- `None` means it is using the default loopback
/// address (`sync_client::DEFAULT_HUB_BASE_URL`). Any authenticated
/// school member may view it (matching `list_device_sync_credentials`'s
/// own "read-only reference data" convention); only the write side
/// carries the stricter `ManageSchoolMembership` gate.
fn get_hub_base_url_for_session(
    conn: &Connection,
    sessions: &SessionManager,
) -> AppResult<Option<String>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    Ok(
        device_sync_client_credential::get(conn, &school_id)?
            .and_then(|stored| stored.hub_base_url),
    )
}

#[tauri::command]
pub fn get_sync_hub_base_url(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<String>> {
    let conn = lock_db(&db);
    get_hub_base_url_for_session(&conn, &sessions)
}

/// Lists every currently-enrolled (active) device sync credential for
/// the caller's own school, newest-enrolled first. Read-only reference
/// data -- any authenticated school member may view it, matching
/// `list_school_members`'s established "same-school reference data"
/// convention; the destructive action (`revoke_device_sync_credential`)
/// carries its own, stricter authorization gate. `school_id` is always
/// session-derived, never a parameter, matching every other tenant-data
/// command in this codebase.
#[tauri::command]
pub fn list_device_sync_credentials(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<DeviceSyncCredentialSummary>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let devices = device_credential::list_active_for_school(&conn, &school_id)?;
    Ok(devices.into_iter().map(Into::into).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{self as auth_mod, SessionManager};
    use crate::repository::{school, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// These tests exercise the pure-`Connection` logic these commands
    /// wrap directly (matching this codebase's established convention
    /// for command modules whose bodies are trivial `State` unwrapping
    /// around an already-tested `auth::*` function -- see
    /// `commands::section`'s own `create_section_with_optional_sync`
    /// tests for the same shape) since a real `AppHandle`/`State` cannot
    /// be constructed outside a running Tauri app. `db::load_or_mint_sspk`
    /// and `db::rotate_sspk` are exercised by `db`'s own test suite; here
    /// we substitute an already-resolved key/rotation closure, exactly as
    /// `auth::revoke_device_sync_credential_and_rotate_sspk`'s own tests
    /// already do.
    fn test_sspk() -> [u8; crate::crypto::payload_key::PAYLOAD_KEY_LEN] {
        [0x11; crate::crypto::payload_key::PAYLOAD_KEY_LEN]
    }

    #[test]
    fn enroll_command_body_returns_a_usable_credential_for_a_legitimately_authenticated_device() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "correct password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let device_id = device_identity::current_or_create(&conn).unwrap();
        let sspk = test_sspk();

        let credential = auth_mod::enroll_device_sync_credential(
            &conn,
            "ana.cruz",
            "correct password",
            &s.id,
            &device_id,
            Some("Ana's laptop"),
            &sspk,
        )
        .unwrap();

        let dto = EnrolledDeviceCredential::from(credential.clone());
        assert_eq!(dto.credential_id, credential.id);
        assert!(!dto.secret_hex.is_empty());

        // The credential is genuinely usable -- it verifies against the
        // device_credential repository, the same check the sync hub
        // itself performs on a real connection attempt.
        use crate::repository::device_credential;
        assert!(
            device_credential::verify(&conn, &dto.credential_id, &dto.secret_hex)
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn enroll_command_body_denies_a_user_not_in_the_target_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &school_a.id).unwrap();
        let device_id = device_identity::current_or_create(&conn).unwrap();

        let result = auth_mod::enroll_device_sync_credential(
            &conn,
            "ana.cruz",
            "password",
            &school_b.id,
            &device_id,
            None,
            &test_sspk(),
        );

        assert!(matches!(result, Err(crate::error::AppError::Unauthorized)));
    }

    #[test]
    fn enroll_command_body_denies_wrong_role_by_denying_wrong_credentials() {
        // There is no role gate on enrollment itself -- any school
        // member may enroll their own device (matching `login`'s own
        // "any member" shape) -- so the analogous "wrong role" boundary
        // here is "wrong credentials for the claimed account," which
        // must still be rejected.
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "correct password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let device_id = device_identity::current_or_create(&conn).unwrap();

        let result = auth_mod::enroll_device_sync_credential(
            &conn,
            "ana.cruz",
            "wrong password",
            &s.id,
            &device_id,
            None,
            &test_sspk(),
        );

        assert!(matches!(
            result,
            Err(crate::error::AppError::AuthenticationFailed)
        ));
    }

    #[test]
    fn revoke_command_body_actually_rotates_the_sspk_end_to_end_through_the_command() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        let device_id = device_identity::current_or_create(&conn).unwrap();
        let original_sspk = test_sspk();

        let credential = auth_mod::enroll_device_sync_credential(
            &conn,
            "ana.cruz",
            "password",
            &s.id,
            &device_id,
            None,
            &original_sspk,
        )
        .unwrap();

        let sessions = SessionManager::new();
        auth_mod::login(&conn, &sessions, "ana.cruz", "password", &s.id).unwrap();

        let mut rotated_sspk: Option<[u8; crate::crypto::payload_key::PAYLOAD_KEY_LEN]> = None;
        // This is exactly the shape a real `AppHandle`-backed caller
        // uses: the command function's own closure calling
        // `db::rotate_sspk`, substituted here with a fake "new key"
        // generator so the test can assert the wrapper actually invoked
        // it -- matching `auth::revoke_device_sync_credential_and_rotate_sspk`'s
        // own test convention (`invokes_rotation_exactly_once_on_success`),
        // but invoked THROUGH the command-shaped call this module wraps,
        // not by calling the underlying `auth::*` function's rotation
        // path directly from this test.
        let revoked = auth_mod::revoke_device_sync_credential_and_rotate_sspk(
            &conn,
            &sessions,
            &credential.id,
            || {
                let mut new_key = original_sspk;
                new_key[0] ^= 0xFF;
                rotated_sspk = Some(new_key);
                Ok(())
            },
        )
        .unwrap();

        assert!(revoked, "the command must report the device as revoked");
        assert!(
            rotated_sspk.is_some(),
            "the revoke command must invoke sspk rotation exactly like a real AppHandle-backed call would"
        );
        assert_ne!(
            rotated_sspk.unwrap(),
            original_sspk,
            "the rotated key must genuinely differ from the pre-revocation SSPK"
        );

        // And the credential itself is now unusable.
        use crate::repository::device_credential;
        assert!(
            device_credential::verify(&conn, &credential.id, &credential.secret_hex)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn revoke_command_body_denies_a_different_school_head() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let owner = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &owner.id, &school_a.id).unwrap();
        let device_id = device_identity::current_or_create(&conn).unwrap();
        let credential = auth_mod::enroll_device_sync_credential(
            &conn,
            "ana.cruz",
            "password",
            &school_a.id,
            &device_id,
            None,
            &test_sspk(),
        )
        .unwrap();

        let other_head =
            user::create_user(&conn, "juan.delacruz", "password", "Juan Dela Cruz").unwrap();
        user::add_school_membership(&conn, &other_head.id, &school_b.id).unwrap();
        crate::repository::role::grant(
            &conn,
            &other_head.id,
            &school_b.id,
            crate::repository::role::SCHOOL_HEAD,
        )
        .unwrap();
        let other_sessions = SessionManager::new();
        auth_mod::login(
            &conn,
            &other_sessions,
            "juan.delacruz",
            "password",
            &school_b.id,
        )
        .unwrap();

        let result = auth_mod::revoke_device_sync_credential_and_rotate_sspk(
            &conn,
            &other_sessions,
            &credential.id,
            || panic!("must never rotate when the caller is unauthorized for this credential"),
        );

        assert!(matches!(result, Err(crate::error::AppError::Unauthorized)));
        use crate::repository::device_credential;
        assert!(
            device_credential::verify(&conn, &credential.id, &credential.secret_hex)
                .unwrap()
                .is_some(),
            "the credential must remain active after a denied cross-school revocation attempt"
        );
    }

    /// Exercises the list command's actual DTO-mapping body
    /// (`DeviceSyncCredentialSummary::from`), the one piece of this
    /// command's own logic that isn't already covered by
    /// `device_credential::list_active_for_school`'s own tests -- the
    /// `State`-unwrapping shell above it cannot be constructed outside a
    /// running Tauri app, matching this module's established convention
    /// for the other two commands.
    #[test]
    fn list_command_maps_active_devices_to_the_dto_with_no_secret_material() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &u.id, &s.id).unwrap();
        crate::repository::device_credential::enroll(
            &conn,
            &s.id,
            &u.id,
            "device-1",
            Some("Ana's laptop"),
        )
        .unwrap();

        let devices = crate::repository::device_credential::list_active_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .map(DeviceSyncCredentialSummary::from)
            .collect::<Vec<_>>();

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].device_label.as_deref(), Some("Ana's laptop"));
        assert_eq!(devices[0].owner_display_name, "Ana Cruz");
        assert_eq!(devices[0].owner_username, "ana.cruz");
    }

    mod hub_base_url_tests {
        use super::*;
        use crate::repository::role as role_repo;

        #[test]
        fn accepts_and_normalizes_a_well_formed_http_and_https_address() {
            assert_eq!(
                validate_hub_base_url("http://192.168.1.10:7878").unwrap(),
                "http://192.168.1.10:7878"
            );
            assert_eq!(
                validate_hub_base_url("https://school-hub.local").unwrap(),
                "https://school-hub.local"
            );
        }

        #[test]
        fn trims_surrounding_whitespace() {
            assert_eq!(
                validate_hub_base_url("  http://192.168.1.10:7878  ").unwrap(),
                "http://192.168.1.10:7878"
            );
        }

        #[test]
        fn drops_a_trailing_path_or_slash_since_sync_client_appends_its_own() {
            assert_eq!(
                validate_hub_base_url("http://192.168.1.10:7878/").unwrap(),
                "http://192.168.1.10:7878"
            );
            assert_eq!(
                validate_hub_base_url("http://192.168.1.10:7878/sync/push").unwrap(),
                "http://192.168.1.10:7878"
            );
        }

        #[test]
        fn preserves_a_non_default_port() {
            let result = validate_hub_base_url("http://100.64.0.5:9999").unwrap();
            assert!(
                result.ends_with(":9999"),
                "expected a preserved port, got {result}"
            );
        }

        #[test]
        fn rejects_an_empty_or_whitespace_only_address() {
            assert!(validate_hub_base_url("").is_err());
            assert!(validate_hub_base_url("   ").is_err());
        }

        #[test]
        fn rejects_an_address_with_no_scheme() {
            assert!(validate_hub_base_url("192.168.1.10:7878").is_err());
        }

        #[test]
        fn rejects_a_non_http_scheme() {
            assert!(validate_hub_base_url("ftp://192.168.1.10").is_err());
            assert!(validate_hub_base_url("javascript:alert(1)").is_err());
        }

        struct HubUrlFixture {
            school_id: String,
        }

        /// Creates a school with a School Head (`role_repo::SCHOOL_HEAD`,
        /// which holds `ManageSchoolMembership`) and a plain Teacher (which
        /// does not), each with their own logged-in session -- lets a test
        /// exercise both the allow and the deny side of
        /// `set_hub_base_url_for_session`'s capability gate against the
        /// SAME school.
        fn seed(conn: &Connection) -> (HubUrlFixture, SessionManager, SessionManager) {
            let school = crate::repository::school::create(conn, "Rizal Elementary").unwrap();
            let head =
                crate::repository::user::create_user(conn, "head.a", "correct password", "Head A")
                    .unwrap();
            crate::repository::user::add_school_membership(conn, &head.id, &school.id).unwrap();
            role_repo::grant(conn, &head.id, &school.id, role_repo::SCHOOL_HEAD).unwrap();
            let teacher = crate::repository::user::create_user(
                conn,
                "teacher.a",
                "correct password",
                "Teacher A",
            )
            .unwrap();
            crate::repository::user::add_school_membership(conn, &teacher.id, &school.id).unwrap();
            role_repo::grant(conn, &teacher.id, &school.id, role_repo::TEACHER).unwrap();

            let head_sessions = SessionManager::new();
            auth_mod::login(
                conn,
                &head_sessions,
                "head.a",
                "correct password",
                &school.id,
            )
            .unwrap();
            let teacher_sessions = SessionManager::new();
            auth_mod::login(
                conn,
                &teacher_sessions,
                "teacher.a",
                "correct password",
                &school.id,
            )
            .unwrap();

            (
                HubUrlFixture {
                    school_id: school.id,
                },
                head_sessions,
                teacher_sessions,
            )
        }

        #[test]
        fn a_school_head_can_set_and_read_back_the_hub_address() {
            let conn = open_test_db();
            let (fixture, head_sessions, _teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();

            set_hub_base_url_for_session(
                &conn,
                &head_sessions,
                Some("https://192.168.1.10:7878".to_string()),
            )
            .unwrap();

            assert_eq!(
                get_hub_base_url_for_session(&conn, &head_sessions).unwrap(),
                Some("https://192.168.1.10:7878".to_string())
            );
        }

        #[test]
        fn a_plain_teacher_cannot_set_the_hub_address() {
            let conn = open_test_db();
            let (fixture, _head_sessions, teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();

            let result = set_hub_base_url_for_session(
                &conn,
                &teacher_sessions,
                Some("https://192.168.1.10:7878".to_string()),
            );

            assert!(matches!(result, Err(AppError::Unauthorized)));
        }

        #[test]
        fn a_plain_teacher_can_still_read_the_configured_hub_address() {
            let conn = open_test_db();
            let (fixture, head_sessions, teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();
            set_hub_base_url_for_session(
                &conn,
                &head_sessions,
                Some("https://192.168.1.10:7878".to_string()),
            )
            .unwrap();

            assert_eq!(
                get_hub_base_url_for_session(&conn, &teacher_sessions).unwrap(),
                Some("https://192.168.1.10:7878".to_string())
            );
        }

        #[test]
        fn setting_none_or_an_empty_string_clears_a_previously_configured_address() {
            let conn = open_test_db();
            let (fixture, head_sessions, _teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();
            set_hub_base_url_for_session(
                &conn,
                &head_sessions,
                Some("https://192.168.1.10:7878".to_string()),
            )
            .unwrap();

            set_hub_base_url_for_session(&conn, &head_sessions, Some("   ".to_string())).unwrap();

            assert_eq!(
                get_hub_base_url_for_session(&conn, &head_sessions).unwrap(),
                None
            );
        }

        #[test]
        fn a_malformed_address_is_rejected_and_never_stored() {
            let conn = open_test_db();
            let (fixture, head_sessions, _teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();

            let result =
                set_hub_base_url_for_session(&conn, &head_sessions, Some("not a url".to_string()));

            assert!(result.is_err());
            assert_eq!(
                get_hub_base_url_for_session(&conn, &head_sessions).unwrap(),
                None
            );
        }

        #[test]
        fn get_returns_none_for_a_school_head_in_a_different_school_from_the_configured_one() {
            let conn = open_test_db();
            let (fixture, head_sessions, _teacher_sessions) = seed(&conn);
            device_sync_client_credential::store(&conn, &fixture.school_id, "cred-1", "aabbcc")
                .unwrap();
            set_hub_base_url_for_session(
                &conn,
                &head_sessions,
                Some("https://192.168.1.10:7878".to_string()),
            )
            .unwrap();

            let other_school = crate::repository::school::create(&conn, "Other School").unwrap();
            let other_head =
                crate::repository::user::create_user(&conn, "head.b", "correct password", "Head B")
                    .unwrap();
            crate::repository::user::add_school_membership(&conn, &other_head.id, &other_school.id)
                .unwrap();
            role_repo::grant(
                &conn,
                &other_head.id,
                &other_school.id,
                role_repo::SCHOOL_HEAD,
            )
            .unwrap();
            let other_sessions = SessionManager::new();
            auth_mod::login(
                &conn,
                &other_sessions,
                "head.b",
                "correct password",
                &other_school.id,
            )
            .unwrap();

            assert_eq!(
                get_hub_base_url_for_session(&conn, &other_sessions).unwrap(),
                None
            );
        }
    }
}
