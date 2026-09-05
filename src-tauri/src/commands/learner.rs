use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::learner::{self, Learner};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `school_id` is deliberately NOT a parameter here — it is derived from
/// the current session, never accepted from the caller. See ADR-0004:
/// this is a strictly stronger guarantee than re-validating a
/// caller-supplied school_id, because there is no parameter to forget to
/// check on a future change.
#[tauri::command]
pub fn list_learners_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Learner>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::list_by_school(&conn, &school_id)
}

/// WAVE 1A RBAC Foundation's representative authorization proof: only a
/// session holding the Registrar or School Head role in this school may
/// enroll a learner — see `docs/adr/0036-rbac-foundation.md`. A Teacher
/// session is rejected with `Unauthorized`, the same fail-closed error
/// every other authorization denial in this codebase already returns.
///
/// ADR-0067/0069 sync wiring (first domain write): if this school has at
/// least one active device sync credential (i.e. this installation has
/// actually completed the enrollment ceremony — see
/// `device_credential::has_active_for_school`'s own doc comment for why
/// this check exists), the new learner is also encrypted and enqueued
/// into the local `sync_outbox`, atomically with the learner row itself.
/// An installation that has never enrolled a device behaves exactly as it
/// did before ADR-0067 existed — no SSPK file, no outbox row, zero new
/// side effects — the owner's explicit choice (sync stays opt-in by
/// enrollment, never forced on every installation by default).
#[tauri::command]
pub fn create_learner(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
) -> AppResult<Learner> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) =
        auth::authorize_capability_with_actor(&conn, &sessions, Capability::ManageLearners)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_learner_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- the one part of this wiring that genuinely
/// needs an `AppHandle` (filesystem access), kept as a thin, otherwise
/// untested wrapper so the substantial logic below (`create_learner_with_optional_sync`
/// / `create_learner_with_duplicate_check_and_optional_sync`) can be
/// exercised directly in this module's own tests without a real Tauri
/// runtime -- the same reason `db::open_app_db` itself has no direct
/// unit test either.
fn resolve_sspk_if_enrolled(
    app: &AppHandle,
    conn: &Connection,
    school_id: &str,
) -> AppResult<Option<[u8; PAYLOAD_KEY_LEN]>> {
    if device_credential::has_active_for_school(conn, school_id)? {
        Ok(Some(db::load_or_mint_sspk(app)?))
    } else {
        Ok(None)
    }
}

/// Shared by `create_learner` and `create_learner_with_duplicate_check`'s
/// `Created` outcome -- both commands create a learner and, on success,
/// need the identical enrollment-gated sync wiring. `sspk` is `None` when
/// this school has never enrolled a device (see
/// `resolve_sspk_if_enrolled`) -- in that case this behaves exactly as it
/// did before ADR-0067 existed, no `SAVEPOINT`, no outbox row. When
/// `Some`, the learner insert and the outbox enqueue are atomic together
/// in one `SAVEPOINT`: a syncing installation must never end up with a
/// learner row and no corresponding sync record, or vice versa.
#[allow(clippy::too_many_arguments)]
fn create_learner_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Learner> {
    let Some(sspk) = sspk else {
        return learner::create(conn, school_id, given_name, family_name, lrn, sex);
    };

    conn.execute_batch("SAVEPOINT create_learner_with_sync")?;
    let outcome = (|| -> AppResult<Learner> {
        let created = learner::create(conn, school_id, given_name, family_name, lrn, sex)?;
        enqueue_learner_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_learner_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_learner_with_sync; RELEASE create_learner_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created learner.
/// `base_version` is unconditionally `0` -- this `entity_id` has never
/// existed before this exact call, so there is nothing for it to have a
/// prior hub version against (see `sync::PendingChange`'s own base-version
/// contract). Deliberately does NOT touch `sync_version_cache` -- that
/// cache exists for a future UPDATE to read from, and is only ever
/// correctly written by a real hub acceptance or pull, neither of which
/// exists yet (no network listener). Updating it optimistically here,
/// before any round trip has actually happened, would risk the cache
/// diverging from hub truth with no future pull able to correct it (a
/// monotonic-max upsert only ever advances, never revises a wrong guess
/// downward) -- so this wiring deliberately leaves that cache alone.
fn enqueue_learner_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &Learner,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let plaintext = serde_json::to_vec(created)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::Learner,
        entity_id: parse_sync_uuid(&created.id, "learner id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Every id this app hands out is minted via `Uuid::now_v7().to_string()`
/// (see `school::create`/`user::create_user`/`learner::create` etc.), so
/// this should never actually fail in practice -- but `PendingChange`'s
/// fields are typed `Uuid`, not `String`, so the conversion still needs a
/// real fallible path rather than an `unwrap`/`expect` on data that is,
/// strictly speaking, still just a database column value.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// `learner_id` identifies WHICH learner; `school_id` (which one it must
/// belong to) still comes only from the session, never from the caller —
/// so a caller cannot read a different school's learner even by guessing
/// its id. Returns `None`, not an error, when the id doesn't resolve
/// within the caller's own school — "doesn't exist" and "exists
/// elsewhere" are indistinguishable on purpose.
#[tauri::command]
pub fn get_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<Learner>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::find_by_id_in_school(&conn, &school_id, &learner_id)
}

/// Candidate learners that might already be the same person as one
/// described by the given name/LRN, for a Registrar to compare before
/// deciding to create a new record -- never auto-merged. Same
/// `ManageLearners` gate as `create_learner`, since this exists to inform
/// that same decision. See `repository::learner::find_candidates`'s doc
/// comment for the exact matching rule.
#[tauri::command]
pub fn find_learner_candidates(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
) -> AppResult<Vec<Learner>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner::find_candidates(&conn, &school_id, &given_name, &family_name, lrn.as_deref())
}

/// Manual Create Learner's duplicate-aware entry point (Wave 2U) --
/// reuses `learner::find_candidates` (already relied on by SF1 import)
/// through `learner::create_with_duplicate_check` rather than a second
/// detection engine. `create_learner` above is left unchanged as the
/// low-level primitive SF1 import's own commit path still calls
/// directly (so SF1 bulk import is NOT covered by this command's sync
/// wiring below -- that remains a separate, not-yet-wired call site);
/// this command is the one the manual Create Learner UI calls. Same
/// `ManageLearners` gate as `create_learner`, since this performs the
/// same action with an added review step.
///
/// Same ADR-0067/0069 sync wiring as `create_learner` above, applied to
/// the `Created` outcome only -- `LrnConflict`/`DuplicateCandidates`
/// write nothing, so there is nothing to sync. The whole duplicate-check
/// decision, the learner insert, and the sync enqueue are one atomic
/// `SAVEPOINT` when sync is active.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_learner_with_duplicate_check(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
    confirmed: bool,
) -> AppResult<learner::CreateLearnerOutcome> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) =
        auth::authorize_capability_with_actor(&conn, &sessions, Capability::ManageLearners)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_learner_with_duplicate_check_and_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
        confirmed,
        sspk.as_ref(),
    )
}

#[allow(clippy::too_many_arguments)]
fn create_learner_with_duplicate_check_and_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    given_name: &str,
    family_name: &str,
    lrn: Option<&str>,
    sex: Option<&str>,
    confirmed: bool,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<learner::CreateLearnerOutcome> {
    conn.execute_batch("SAVEPOINT create_learner_duplicate_check_with_sync")?;
    let outcome = (|| -> AppResult<learner::CreateLearnerOutcome> {
        let outcome = learner::create_with_duplicate_check(
            conn,
            school_id,
            given_name,
            family_name,
            lrn,
            sex,
            confirmed,
        )?;

        if let (learner::CreateLearnerOutcome::Created { learner: created }, Some(sspk)) =
            (&outcome, sspk)
        {
            enqueue_learner_sync_change(conn, school_id, actor_user_id, created, sspk)?;
        }

        Ok(outcome)
    })();

    match outcome {
        Ok(outcome) => {
            conn.execute_batch("RELEASE create_learner_duplicate_check_with_sync")?;
            Ok(outcome)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_learner_duplicate_check_with_sync; \
                 RELEASE create_learner_duplicate_check_with_sync",
            );
            Err(error)
        }
    }
}

/// Same Registrar/School Head gate as `create_learner` — editing a
/// learner's identity/records is the same "manage learners" capability,
/// not a separate one.
#[tauri::command]
pub fn update_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
) -> AppResult<Option<Learner>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner::update(
        &conn,
        &school_id,
        &learner_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{school, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn setup() -> (Connection, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let user = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        (conn, school.id, user.id)
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    #[test]
    fn create_learner_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, actor_user_id) = setup();

        let created = create_learner_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Ana",
            "Cruz",
            None,
            None,
            None,
        )
        .unwrap();

        assert_eq!(created.given_name, "Ana");
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_learner_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        let created = create_learner_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Ana",
            "Cruz",
            None,
            None,
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::Learner);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_user_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: Learner = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_learner_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        create_learner_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Ana",
            "Cruz",
            None,
            None,
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn duplicate_check_only_enqueues_on_the_created_outcome() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        let first = create_learner_with_duplicate_check_and_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Ana",
            "Cruz",
            Some("123456789012"),
            None,
            false,
            Some(&sspk),
        )
        .unwrap();
        assert!(matches!(
            first,
            learner::CreateLearnerOutcome::Created { .. }
        ));

        // Same LRN again, unconfirmed -- this must be flagged as a
        // conflict and create/enqueue nothing.
        let second = create_learner_with_duplicate_check_and_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Bo",
            "Reyes",
            Some("123456789012"),
            None,
            false,
            Some(&sspk),
        )
        .unwrap();
        assert!(matches!(
            second,
            learner::CreateLearnerOutcome::LrnConflict { .. }
        ));

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(
            queued.len(),
            1,
            "the rejected LrnConflict attempt must not have enqueued anything"
        );
    }
}
