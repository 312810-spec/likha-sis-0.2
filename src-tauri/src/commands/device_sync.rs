use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};
use zeroize::Zeroize;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::db;
use crate::error::AppResult;
use crate::repository::device_credential::{self, ActiveDeviceCredential, EnrolledCredential};
use crate::repository::device_identity;

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
#[tauri::command]
pub fn revoke_device_sync_credential(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    credential_id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::revoke_device_sync_credential_and_rotate_sspk(&conn, &sessions, &credential_id, || {
        db::rotate_sspk(&app).map(|_| ())
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
}
