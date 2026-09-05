//! ADR-0067 client-side sync loop: the device-side counterpart to
//! `hub_server`. Drains `sync_outbox` in bounded batches to `POST
//! /sync/push`, and periodically `GET /sync/pull`s changes accepted from
//! other devices, applying them into this device's own local tracking
//! state via the existing repository ports.
//!
//! Uses a plain blocking `reqwest::blocking::Client` on its own
//! background OS thread -- deliberately not async/tokio-runtime code:
//! this loop is a simple "wake up, do one push+pull round, sleep"
//! worker, and a blocking client keeps that logic straightforward to
//! read and to unit-test (see this module's own tests, which drive a
//! real `hub_server::router` bound to an ephemeral loopback port).
//!
//! ADR-0069 addendum (payload encrypt/decrypt round trip): a
//! non-conflicting pulled change is now actually decrypted (via
//! `resolve_sspk`'s `/sync/payload-key-wrap` round trip and
//! `crypto::payload_key::decrypt_payload`) and materialized into its
//! domain table through the existing repository write path -- see
//! `apply_decrypted_change`. Scoped to the entity kinds actually wired
//! end to end on the push side: `EntityKind::Learner` (see
//! `commands::learner`'s own doc comment) and, added in a later
//! addendum, `EntityKind::Attendance` (see `commands::attendance`'s own
//! doc comment); every other `EntityKind` variant has no producing write
//! path yet, so decrypting one here is unreachable in practice and is
//! treated as a rejection rather than a silent no-op success. A change
//! this device has its own unsynced local
//! edit for is still never decrypted-and-applied -- it is staged into the
//! same conflict-review queue the push side already uses, exactly as
//! before this addendum, never a silent last-write-wins.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::error::AppResult;
use crate::repository::{
    attendance, device_credential, device_sync_client_credential, learner, sync_conflict_review,
    sync_hub, sync_outbox, sync_pull_cursor, sync_version_cache,
};
use crate::sync::{EntityKind, PendingChange};

const CREDENTIAL_ID_HEADER: &str = "x-likha-credential-id";
const DEVICE_SECRET_HEADER: &str = "x-likha-device-secret";

/// Same loopback address `hub_server` binds -- this device talks to its
/// own school's hub laptop over the LAN/Tailscale transport in a real
/// deployment, but during local development and in this crate's own
/// tests the "hub" this loop reaches is deliberately just
/// `hub_server`'s own listener.
pub const DEFAULT_HUB_BASE_URL: &str = "http://127.0.0.1:7878";

/// Matches `sync_outbox::pending_for_school`'s own 100-item clamp and
/// `sync_hub::MAX_PUSH_BATCH` -- a push batch this loop sends is never
/// larger than what the hub will accept in one call.
const PUSH_BATCH_LIMIT: u16 = 50;
const PULL_BATCH_LIMIT: u16 = 50;

/// How long the background loop sleeps between rounds once started. Not
/// itself exercised by a unit test (a real sleep loop is not something a
/// fast test suite should wait on) -- `run_once` below is the tested
/// unit; this constant only governs `spawn_loop`'s real background
/// cadence.
const POLL_INTERVAL: Duration = Duration::from_secs(30);

#[derive(Clone, Debug)]
pub struct SyncClientConfig {
    pub base_url: String,
    pub school_id: String,
    pub credential_id: String,
    pub device_secret_hex: String,
}

impl SyncClientConfig {
    /// Builds a config for whichever school/credential this installation
    /// currently has stored (see
    /// `repository::device_sync_client_credential::get_any`), talking to
    /// the default loopback hub address. Returns `None` for a
    /// never-enrolled installation -- the same "nothing to do" case
    /// `should_run` checks before this loop is even started.
    pub fn discover(conn: &Connection) -> AppResult<Option<SyncClientConfig>> {
        Ok(
            device_sync_client_credential::get_any(conn)?.map(|stored| SyncClientConfig {
                base_url: DEFAULT_HUB_BASE_URL.to_string(),
                school_id: stored.school_id,
                credential_id: stored.credential_id,
                device_secret_hex: stored.device_secret_hex,
            }),
        )
    }
}

/// True if this device has a locally stored sync credential for any
/// school -- i.e. it has completed enrollment (as a sync *client*; see
/// `hub_server::should_listen` for the symmetric hub-*server* gate). A
/// never-enrolled, plain installation has no such row, so this is
/// `false` and `maybe_spawn_loop` never starts a thread, never opens a
/// socket, and never touches the network -- no new behavior for an
/// installation that has not opted into sync.
pub fn should_run(conn: &Connection) -> AppResult<bool> {
    Ok(device_sync_client_credential::get_any(conn)?.is_some())
}

#[derive(Debug, Serialize)]
struct PushRequestBody<'a> {
    changes: &'a [PendingChange],
}

#[derive(Debug, Deserialize)]
struct PushResponseBody {
    outcomes: Vec<sync_hub::PushOutcome>,
}

#[derive(Debug, Deserialize)]
struct PullResponseBody {
    changes: Vec<sync_hub::AcceptedChange>,
}

/// Mirrors `hub_server`'s own (private) `PayloadKeyWrapResponseBody` --
/// two independent types rather than a shared one, matching every other
/// wire struct in this pair of modules (`PushRequestBody`/`PullQuery`
/// etc. are likewise duplicated rather than imported, since `hub_server`'s
/// are deliberately private to that module).
#[derive(Debug, Deserialize)]
struct PayloadKeyWrapResponseBody {
    wrapped_key: Vec<u8>,
    nonce: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PushRunSummary {
    /// How many outbox rows were included in this round's batch (0 if
    /// there was nothing pending -- no request is sent in that case).
    pub sent: usize,
    pub acknowledged: usize,
    pub conflicted: usize,
    /// The batch could not be delivered or was rejected wholesale
    /// (network error, non-2xx status, malformed/mismatched response
    /// body) -- every included row was left exactly as it was, plus one
    /// recorded retry attempt, never partially/incorrectly acknowledged.
    pub failed: bool,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct PullRunSummary {
    pub received: usize,
    pub applied: usize,
    pub conflicted: usize,
    /// A non-conflicting change whose `encrypted_payload` failed to
    /// decrypt (wrong/rotated key, corrupted ciphertext, tampered
    /// auth tag) -- rejected, never partially applied. See `pull_once`'s
    /// own doc comment for why this halts the rest of the batch rather
    /// than skipping past it.
    pub rejected: usize,
    pub failed: bool,
}

/// Fetches this device's own wrap of the school's current sync-payload key
/// (ADR-0069 addendum: `/sync/payload-key-wrap`) and unwraps it locally
/// with the device secret this device already holds -- the plaintext SSPK
/// itself never crosses the network a second time, only its per-device
/// wrapped form does (see `sync_payload_key::StoredWrap`'s own doc
/// comment). Returns `Ok(None)` for any failure along the way (network
/// error, non-2xx, malformed body, or a wrap that fails to decrypt) --
/// deliberately not distinguished from each other here, since every case
/// means the same thing to `pull_once`: this round cannot safely decrypt
/// anything, so no non-conflicting change should be applied. Resolved
/// fresh on every pull round rather than cached across rounds -- this is
/// the same "no new persisted key material" scope boundary
/// `crypto::payload_key`'s own doc comment already draws around this
/// slice (DPAPI-backed local caching is explicitly deferred, see this
/// module's task-level doc comment).
fn resolve_sspk(
    client: &reqwest::blocking::Client,
    config: &SyncClientConfig,
) -> Option<[u8; PAYLOAD_KEY_LEN]> {
    let response = client
        .get(format!("{}/sync/payload-key-wrap", config.base_url))
        .header(CREDENTIAL_ID_HEADER, &config.credential_id)
        .header(DEVICE_SECRET_HEADER, &config.device_secret_hex)
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let body: PayloadKeyWrapResponseBody = response.json().ok()?;
    let device_secret = device_credential::hex_decode(&config.device_secret_hex)?;
    let wrap_key = payload_key::derive_wrap_key(&device_secret);
    payload_key::unwrap_payload_key(&wrap_key, &body.nonce, &body.wrapped_key).ok()
}

/// Drains up to `PUSH_BATCH_LIMIT` pending `sync_outbox` rows for
/// `config.school_id` and POSTs them to `/sync/push`. Reuses
/// `sync_outbox`'s own existing state machine
/// (`acknowledge`/`record_attempt` with its fixed `AttemptErrorCode`s) --
/// this function does not invent new retry semantics, it only decides
/// which of those calls a given HTTP outcome maps to.
pub fn push_once(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    config: &SyncClientConfig,
) -> AppResult<PushRunSummary> {
    let entries = sync_outbox::pending_for_school(conn, &config.school_id, PUSH_BATCH_LIMIT)?;
    if entries.is_empty() {
        return Ok(PushRunSummary::default());
    }
    let changes: Vec<PendingChange> = entries.iter().map(|entry| entry.change.clone()).collect();

    let sent = entries.len();
    let response = client
        .post(format!("{}/sync/push", config.base_url))
        .header(CREDENTIAL_ID_HEADER, &config.credential_id)
        .header(DEVICE_SECRET_HEADER, &config.device_secret_hex)
        .json(&PushRequestBody { changes: &changes })
        .send();

    let response = match response {
        Ok(response) => response,
        Err(error) => {
            let code = if error.is_timeout() {
                sync_outbox::AttemptErrorCode::Timeout
            } else {
                sync_outbox::AttemptErrorCode::Offline
            };
            record_attempts(conn, &config.school_id, &entries, code)?;
            return Ok(PushRunSummary {
                sent,
                failed: true,
                ..Default::default()
            });
        }
    };

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        record_attempts(
            conn,
            &config.school_id,
            &entries,
            sync_outbox::AttemptErrorCode::Unauthorized,
        )?;
        return Ok(PushRunSummary {
            sent,
            failed: true,
            ..Default::default()
        });
    }
    if !response.status().is_success() {
        record_attempts(
            conn,
            &config.school_id,
            &entries,
            sync_outbox::AttemptErrorCode::HubUnavailable,
        )?;
        return Ok(PushRunSummary {
            sent,
            failed: true,
            ..Default::default()
        });
    }

    let body: PushResponseBody = match response.json() {
        Ok(body) => body,
        Err(_) => {
            record_attempts(
                conn,
                &config.school_id,
                &entries,
                sync_outbox::AttemptErrorCode::ProtocolRejected,
            )?;
            return Ok(PushRunSummary {
                sent,
                failed: true,
                ..Default::default()
            });
        }
    };

    if body.outcomes.len() != entries.len() {
        record_attempts(
            conn,
            &config.school_id,
            &entries,
            sync_outbox::AttemptErrorCode::ProtocolRejected,
        )?;
        return Ok(PushRunSummary {
            sent,
            failed: true,
            ..Default::default()
        });
    }

    let mut summary = PushRunSummary {
        sent,
        ..Default::default()
    };
    for (entry, outcome) in entries.iter().zip(body.outcomes.iter()) {
        let change_id = entry.change.change_id.to_string();
        match outcome {
            sync_hub::PushOutcome::Accepted(_) | sync_hub::PushOutcome::AlreadyApplied(_) => {
                // A matching base_version was accepted (or this exact
                // change_id had already been accepted before, the replay
                // case) -- either way this entity's new hub version is
                // exactly base_version + 1, the same arithmetic
                // `sync_hub::push_change` itself applies server-side.
                sync_version_cache::record_known_version(
                    conn,
                    &config.school_id,
                    entry.change.entity_kind,
                    &entry.change.entity_id.to_string(),
                    entry.change.base_version + 1,
                )?;
                sync_outbox::acknowledge(conn, &config.school_id, &change_id)?;
                summary.acknowledged += 1;
            }
            sync_hub::PushOutcome::ConflictStaged => {
                // The hub has already durably recorded this in its own
                // review queue (ADR-0067 point 6) -- retrying only ever
                // replays the same ConflictStaged outcome, never makes
                // progress, so this row is dequeued from the outbox
                // rather than retried forever. The version cache is
                // deliberately left untouched: this device's local edit
                // was NOT accepted, so it must not be treated as synced.
                sync_outbox::acknowledge(conn, &config.school_id, &change_id)?;
                summary.conflicted += 1;
            }
        }
    }
    Ok(summary)
}

fn record_attempts(
    conn: &Connection,
    school_id: &str,
    entries: &[sync_outbox::OutboxEntry],
    code: sync_outbox::AttemptErrorCode,
) -> AppResult<()> {
    for entry in entries {
        sync_outbox::record_attempt(
            conn,
            school_id,
            &entry.change.change_id.to_string(),
            Some(code),
        )?;
    }
    Ok(())
}

/// GETs changes accepted after this device's own last-processed cursor
/// (`repository::sync_pull_cursor`) and applies each one. An entity this
/// device has no unsynced local edit for advances
/// `sync_version_cache`'s known-version watermark (see this module's own
/// doc comment for why that -- not a domain-table write -- is the extent
/// of "applying" implemented so far). An entity this device DOES have a
/// pending local edit for is routed into
/// `repository::sync_conflict_review` instead, never silently overwritten
/// -- ADR-0067's own "never last-write-wins" rule applied on the pull
/// side.
pub fn pull_once(
    conn: &Connection,
    client: &reqwest::blocking::Client,
    config: &SyncClientConfig,
) -> AppResult<PullRunSummary> {
    let after = sync_pull_cursor::get_cursor(conn, &config.school_id)?;
    let response = client
        .get(format!("{}/sync/pull", config.base_url))
        .header(CREDENTIAL_ID_HEADER, &config.credential_id)
        .header(DEVICE_SECRET_HEADER, &config.device_secret_hex)
        .query(&[
            ("after", after.0.to_string()),
            ("limit", PULL_BATCH_LIMIT.to_string()),
        ])
        .send();

    let response = match response {
        Ok(response) => response,
        Err(_) => {
            return Ok(PullRunSummary {
                failed: true,
                ..Default::default()
            })
        }
    };
    if !response.status().is_success() {
        return Ok(PullRunSummary {
            failed: true,
            ..Default::default()
        });
    }
    let body: PullResponseBody = match response.json() {
        Ok(body) => body,
        Err(_) => {
            return Ok(PullRunSummary {
                failed: true,
                ..Default::default()
            })
        }
    };

    let mut summary = PullRunSummary {
        received: body.changes.len(),
        ..Default::default()
    };
    // Resolved lazily -- only fetched (one extra HTTP round trip) if this
    // batch actually contains a non-conflicting change that needs
    // decrypting; a pull that turns out to be all-conflicts, or empty,
    // never touches the payload-key-wrap endpoint at all.
    let mut sspk: Option<Option<[u8; PAYLOAD_KEY_LEN]>> = None;

    for change in &body.changes {
        let entity_id = change.entity_id.to_string();
        let locally_known = sync_version_cache::known_version(
            conn,
            &config.school_id,
            change.entity_kind,
            &entity_id,
        )?;
        let has_unsynced_local_edit =
            sync_outbox::pending_for_school(conn, &config.school_id, 100)?
                .iter()
                .any(|entry| {
                    entry.change.entity_kind == change.entity_kind
                        && entry.change.entity_id == change.entity_id
                });

        if has_unsynced_local_edit {
            sync_conflict_review::stage_pull_conflict(
                conn,
                &config.school_id,
                locally_known,
                change,
            )?;
            summary.conflicted += 1;
            sync_pull_cursor::advance_cursor(conn, &config.school_id, change.cursor)?;
            continue;
        }

        // Non-conflicting: this device must actually decrypt and
        // materialize the change before trusting it -- never a bare
        // version-cache bump. A tampered or undecryptable payload is
        // rejected outright: neither the domain table nor the version
        // cache nor the cursor advances past it, so this exact change is
        // retried (and re-flagged) on every future pull round rather than
        // silently skipped or partially applied.
        let key = *sspk.get_or_insert_with(|| resolve_sspk(client, config));
        let Some(key) = key else {
            summary.rejected += 1;
            summary.failed = true;
            break;
        };

        match apply_decrypted_change(conn, &config.school_id, change, &key) {
            Ok(()) => {
                sync_version_cache::record_known_version(
                    conn,
                    &config.school_id,
                    change.entity_kind,
                    &entity_id,
                    change.version,
                )?;
                summary.applied += 1;
                sync_pull_cursor::advance_cursor(conn, &config.school_id, change.cursor)?;
            }
            Err(()) => {
                summary.rejected += 1;
                summary.failed = true;
                break;
            }
        }
    }
    Ok(summary)
}

/// Decrypts `change.encrypted_payload` under `sspk` and, for the one
/// entity kind this slice wires end to end (`EntityKind::Learner`),
/// applies it via the existing `repository::learner` write path -- never
/// raw SQL here (`.claude/rules/architecture.md`: "All SQL lives in
/// Rust ... repository"). `Err(())` on ANY failure (decrypt/auth-tag
/// failure, malformed JSON, or a decrypted payload whose own `school_id`
/// does not match this pull's school) -- deliberately a unit error, not
/// `AppResult`, so `pull_once` cannot accidentally propagate a
/// decrypt failure as a hard `?`-short-circuit that would abort the whole
/// batch loop before recording `summary.rejected`/`failed` for the caller.
/// A payload whose declared `school_id` mismatches `school_id` is treated
/// exactly like a tampered payload -- decrypting successfully under this
/// school's SSPK already strongly implies it, but this is defense in
/// depth, not proof, so it is still checked explicitly rather than trusted
/// silently (`.claude/rules/security-privacy.md`: enforce at the
/// repository boundary, not by omission).
///
/// Entity kinds other than `Learner`/`Attendance` are deliberately left
/// unhandled here -- no domain write path for them is enqueued anywhere
/// yet (see `commands::learner`'s and `commands::attendance`'s own doc
/// comments: these are the only two entities wired to `sync_outbox` so
/// far), so decrypting one is unreachable in practice. Rather than
/// silently accepting an unknown kind as a no-op success (which would
/// look identical to "applied" to a future caller), it is treated the
/// same as any other rejection -- fail closed on anything this slice does
/// not yet know how to materialize, rather than pretend success.
fn apply_decrypted_change(
    conn: &Connection,
    school_id: &str,
    change: &sync_hub::AcceptedChange,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> Result<(), ()> {
    let plaintext =
        payload_key::decrypt_payload(sspk, &change.encrypted_payload).map_err(|_| ())?;

    match change.entity_kind {
        EntityKind::Learner => {
            let incoming: learner::Learner = serde_json::from_slice(&plaintext).map_err(|_| ())?;
            if incoming.school_id != school_id {
                return Err(());
            }
            learner::upsert_from_sync(conn, &incoming).map_err(|_| ())
        }
        EntityKind::Attendance => {
            let incoming: attendance::AttendanceRecord =
                serde_json::from_slice(&plaintext).map_err(|_| ())?;
            if incoming.school_id != school_id {
                return Err(());
            }
            attendance::upsert_from_sync(conn, &incoming).map_err(|_| ())
        }
        _ => Err(()),
    }
}

/// One push round followed by one pull round, for whichever
/// school/credential this installation currently has stored. A no-op
/// (`Ok(None)`) for a never-enrolled installation.
pub fn run_once(
    conn: &Connection,
    client: &reqwest::blocking::Client,
) -> AppResult<Option<(PushRunSummary, PullRunSummary)>> {
    let Some(config) = SyncClientConfig::discover(conn)? else {
        return Ok(None);
    };
    let push_summary = push_once(conn, client, &config)?;
    let pull_summary = pull_once(conn, client, &config)?;
    Ok(Some((push_summary, pull_summary)))
}

/// Starts the background sync loop if (and only if) `should_run` says
/// this installation has a stored client credential -- otherwise a
/// no-op, mirroring `hub_server::maybe_spawn_listener`'s own gating so a
/// never-enrolled installation's startup is completely unaffected.
/// Opens its own separate `Connection` to the same encrypted database
/// file, for the same reason `hub_server` does (see its own doc
/// comment): WAL mode already makes multiple connections to one SQLite
/// file safe, and this loop's own connection must outlive any single
/// Tauri command invocation.
pub fn maybe_spawn_loop(app: &tauri::AppHandle) -> AppResult<()> {
    let conn = crate::db::open_app_db(app)?;
    if !should_run(&conn)? {
        return Ok(());
    }
    spawn_loop(Arc::new(Mutex::new(conn)));
    Ok(())
}

fn spawn_loop(db: Arc<Mutex<Connection>>) {
    std::thread::spawn(move || {
        let client = match reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
        {
            Ok(client) => client,
            Err(error) => {
                log::error!("sync client loop failed to build an HTTP client: {error}");
                return;
            }
        };
        loop {
            let round_result = {
                let conn = db.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                run_once(&conn, &client)
            };
            match round_result {
                Ok(Some((push, pull))) => {
                    log::info!(
                        "sync round: pushed {} (ack {}, conflict {}, failed {}), pulled {} (applied {}, conflict {}, failed {})",
                        push.sent, push.acknowledged, push.conflicted, push.failed,
                        pull.received, pull.applied, pull.conflicted, pull.failed,
                    );
                }
                Ok(None) => {
                    // No stored credential (e.g. revoked and cleared) --
                    // stop this loop rather than spinning forever with
                    // nothing to do. A future re-enrollment restarts it
                    // via `maybe_spawn_loop` on the next app launch.
                    log::info!("sync client loop stopping: no stored credential");
                    return;
                }
                Err(error) => {
                    log::error!("sync client loop round failed: {error}");
                }
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{device_credential, school, sync_outbox, user};
    use crate::sync::{ChangeOperation, EntityKind, PendingChange};
    use std::net::SocketAddr;
    use std::path::Path;
    use uuid::Uuid;

    /// Binds a real `hub_server::router` to an ephemeral loopback port on
    /// its own background thread, so this module's tests can drive it
    /// with an actual `reqwest::blocking::Client` -- exercising the real
    /// HTTP boundary this client module talks over, not just the router
    /// as a `tower::Service` the way `hub_server`'s own tests do.
    fn spawn_test_hub(conn: Connection, sspk: [u8; PAYLOAD_KEY_LEN]) -> SocketAddr {
        let std_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        std_listener.set_nonblocking(true).unwrap();
        let addr = std_listener.local_addr().unwrap();
        let router = crate::hub_server::router(crate::hub_server::HubServerState {
            db: Arc::new(Mutex::new(conn)),
            sspk,
        });
        std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_io()
                .build()
                .unwrap();
            runtime.block_on(async move {
                let listener = tokio::net::TcpListener::from_std(std_listener).unwrap();
                axum::serve(listener, router).await.unwrap();
            });
        });
        addr
    }

    /// A test "client device": its own separate in-memory database (the
    /// stand-in for its own SQLCipher file), connected to a `hub_server`
    /// bound to an ephemeral loopback port that itself owns a SEPARATE
    /// database -- exactly like a real teacher device and the school
    /// laptop hub are two different machines with two different files.
    struct TestFixture {
        conn: Connection,
        base_url: String,
        school_id: String,
        device_id: Uuid,
        user_id: String,
        /// The SAME key `spawn_test_hub`'s `HubServerState` was given --
        /// exposed so tests can directly encrypt a realistic payload the
        /// way `commands::learner::enqueue_learner_sync_change` does, and
        /// so a "tampered ciphertext" test can start from a genuinely
        /// valid encryption rather than arbitrary bytes. Never itself sent
        /// over the wire; `pull_once` under test always recovers its own
        /// copy via the real `/sync/payload-key-wrap` HTTP round trip.
        sspk: [u8; PAYLOAD_KEY_LEN],
    }

    fn setup() -> TestFixture {
        let hub_conn =
            crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        let school = school::create(&hub_conn, "Rizal Elementary").unwrap();
        let user = user::create_user(&hub_conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let device_id = Uuid::now_v7();
        let credential = device_credential::enroll(
            &hub_conn,
            &school.id,
            &user.id,
            &device_id.to_string(),
            None,
        )
        .unwrap();

        let school_id = school.id.clone();
        let user_id = user.id.clone();
        let sspk = crate::crypto::payload_key::generate_payload_key();
        let addr = spawn_test_hub(hub_conn, sspk);

        // The client under test has its OWN separate local database --
        // it needs its own copy of the school row (an FK target for
        // sync_outbox), its own stored credential, and its own outbox.
        let client_conn =
            crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        client_conn
            .execute(
                "INSERT INTO schools (id, name) VALUES (?1, ?2)",
                (&school_id, "Rizal Elementary"),
            )
            .unwrap();
        device_sync_client_credential::store(
            &client_conn,
            &school_id,
            &credential.id,
            &credential.secret_hex,
        )
        .unwrap();

        TestFixture {
            conn: client_conn,
            base_url: format!("http://{addr}"),
            school_id,
            device_id,
            user_id,
            sspk,
        }
    }

    fn config_for(fixture: &TestFixture) -> SyncClientConfig {
        let mut config = SyncClientConfig::discover(&fixture.conn).unwrap().unwrap();
        config.base_url = fixture.base_url.clone();
        config
    }

    fn http_client() -> reqwest::blocking::Client {
        reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap()
    }

    fn make_change(fixture: &TestFixture, entity_id: Uuid, base_version: u64) -> PendingChange {
        PendingChange {
            change_id: Uuid::now_v7(),
            device_id: fixture.device_id,
            actor_user_id: Uuid::parse_str(&fixture.user_id).unwrap(),
            entity_kind: EntityKind::Learner,
            entity_id,
            base_version,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![9, 9, 9],
        }
    }

    fn synthetic_learner(fixture: &TestFixture, entity_id: Uuid) -> learner::Learner {
        learner::Learner {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            given_name: "Ana".to_string(),
            family_name: "Cruz".to_string(),
            lrn: Some("123456789012".to_string()),
            sex: Some("F".to_string()),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_change`, but with a REAL encrypted-under-`fixture.sspk`
    /// learner payload -- what `pull_once` under test must actually
    /// decrypt and materialize, not a placeholder. Mirrors exactly what
    /// `commands::learner::enqueue_learner_sync_change` produces in
    /// production: `serde_json::to_vec` then `payload_key::encrypt_payload`.
    fn make_learner_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        let plaintext = serde_json::to_vec(&synthetic_learner(fixture, entity_id)).unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// Like `synthetic_learner`, but an `AttendanceRecord` -- the second
    /// entity kind wired end to end (see `commands::attendance`'s own doc
    /// comment for why attendance was chosen next). `attendance_records`
    /// has real FK columns to `sections`/`learners`
    /// (`db::migrations`), so this creates a real section and learner in
    /// the CLIENT's own local db first -- the same "this device's local
    /// copy of shared reference rows" pattern `setup()` already uses for
    /// the `schools` row.
    fn synthetic_attendance_record(
        fixture: &TestFixture,
        entity_id: Uuid,
    ) -> attendance::AttendanceRecord {
        let section = crate::repository::section::create(
            &fixture.conn,
            &fixture.school_id,
            "2025-2026",
            "7",
            &format!("Section-{entity_id}"),
        )
        .unwrap();
        let learner =
            learner::create(&fixture.conn, &fixture.school_id, "Ana", "Cruz", None, None).unwrap();
        attendance::AttendanceRecord {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            section_id: section.id,
            learner_id: learner.id,
            attendance_date: "2026-08-24".to_string(),
            status: attendance::AttendanceStatus::Present,
            recorded_at: "2026-08-24T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_learner_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` attendance payload.
    fn make_attendance_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::Attendance;
        let plaintext =
            serde_json::to_vec(&synthetic_attendance_record(fixture, entity_id)).unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    #[test]
    fn should_run_is_false_until_a_credential_is_stored() {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        assert!(!should_run(&conn).unwrap());

        let school = school::create(&conn, "Rizal Elementary").unwrap();
        device_sync_client_credential::store(&conn, &school.id, "cred-1", "aabbcc").unwrap();

        assert!(should_run(&conn).unwrap());
    }

    #[test]
    fn push_once_sends_pending_outbox_rows_and_acknowledges_accepted_ones() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
        };
        let config = config_for(&fixture);
        let client = http_client();

        let summary = {
            let conn = &fixture.conn;
            push_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.sent, 1);
        assert_eq!(summary.acknowledged, 1);
        assert!(!summary.failed);
        {
            let conn = &fixture.conn;
            assert!(
                sync_outbox::pending_for_school(conn, &fixture.school_id, 10)
                    .unwrap()
                    .is_empty()
            );
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Learner,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn push_once_is_a_no_op_when_the_outbox_is_empty() {
        let fixture = setup();
        let config = config_for(&fixture);
        let client = http_client();

        let summary = {
            let conn = &fixture.conn;
            push_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary, PushRunSummary::default());
    }

    #[test]
    fn push_once_stages_a_stale_base_version_as_conflict_and_dequeues_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // First device (simulated directly against the hub) already
        // advanced this entity to version 1.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
        };
        {
            let conn = &fixture.conn;
            push_once(conn, &client, &config).unwrap();
        };

        // This device's own edit, still based on the now-stale version 0.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            push_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.sent, 1);
        assert_eq!(summary.conflicted, 1);
        assert_eq!(summary.acknowledged, 0);
        {
            let conn = &fixture.conn;
            assert!(
                sync_outbox::pending_for_school(conn, &fixture.school_id, 10)
                    .unwrap()
                    .is_empty()
            );
        };
    }

    #[test]
    fn push_once_records_unauthorized_without_acknowledging_on_a_bad_credential() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
        };
        let mut config = config_for(&fixture);
        config.device_secret_hex = "00".repeat(32);
        let client = http_client();

        let summary = {
            let conn = &fixture.conn;
            push_once(conn, &client, &config).unwrap()
        };

        assert!(summary.failed);
        assert_eq!(summary.acknowledged, 0);
        {
            let conn = &fixture.conn;
            let pending = sync_outbox::pending_for_school(conn, &fixture.school_id, 10).unwrap();
            assert_eq!(
                pending.len(),
                1,
                "the outbox row must remain pending, not corrupted or lost"
            );
            assert_eq!(pending[0].attempt_count, 1);
            assert_eq!(pending[0].last_error_code.as_deref(), Some("unauthorized"));
        };
    }

    #[test]
    fn pull_once_applies_a_non_conflicting_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // A "different device" pushes directly, so this fixture's client
        // has something new to pull.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_learner_change(&fixture, entity_id, 0),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
            // Simulate this having come from ANOTHER device: clear this
            // device's own outbox/version-cache knowledge of it first is
            // unnecessary since push_once already advanced the cache --
            // reset it to prove pull_once is what applies the change.
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 1);
        assert_eq!(summary.conflicted, 0);
        assert_eq!(summary.rejected, 0);
        assert!(!summary.failed);
        {
            let conn = &fixture.conn;
            // The real point of this slice: an actual row now exists in
            // the domain table, not just an advanced version watermark.
            let materialized =
                learner::find_by_id_in_school(conn, &fixture.school_id, &entity_id.to_string())
                    .unwrap()
                    .expect("pull_once must have materialized the learner row");
            assert_eq!(materialized, synthetic_learner(&fixture, entity_id));
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Learner,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
            assert_eq!(
                sync_pull_cursor::get_cursor(conn, &fixture.school_id)
                    .unwrap()
                    .0,
                1
            );
        };
    }

    #[test]
    fn pull_once_stages_a_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's change lands at the hub.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        // This device independently edited the SAME entity and has not
        // pushed it yet.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_change(&fixture, entity_id, 0),
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 0);
        assert_eq!(summary.conflicted, 1);
        {
            let conn = &fixture.conn;
            assert_eq!(
                sync_conflict_review::count_open_for_school(conn, &fixture.school_id).unwrap(),
                1
            );
            // The live version cache row must NOT have been overwritten
            // by the pulled change -- never last-write-wins.
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Learner,
                    &entity_id.to_string()
                )
                .unwrap(),
                0
            );
            // Forward progress on the cursor still happens -- this
            // device HAS processed the change (by staging it), just not
            // applied it live.
            assert_eq!(
                sync_pull_cursor::get_cursor(conn, &fixture.school_id)
                    .unwrap()
                    .0,
                1
            );
            // A staged conflict must never touch the domain table -- no
            // blind decrypt-and-overwrite.
            assert!(learner::find_by_id_in_school(
                conn,
                &fixture.school_id,
                &entity_id.to_string()
            )
            .unwrap()
            .is_none());
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_learner_change(&fixture, entity_id, 0);
            let last = change.encrypted_payload.len() - 1;
            change.encrypted_payload[last] ^= 0xFF;
            sync_outbox::enqueue(conn, &fixture.school_id, &change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 0);
        assert_eq!(summary.conflicted, 0);
        assert_eq!(summary.rejected, 1);
        assert!(summary.failed);
        {
            let conn = &fixture.conn;
            assert!(learner::find_by_id_in_school(
                conn,
                &fixture.school_id,
                &entity_id.to_string()
            )
            .unwrap()
            .is_none());
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Learner,
                    &entity_id.to_string()
                )
                .unwrap(),
                0,
                "a rejected change must never advance the version cache"
            );
            assert_eq!(
                sync_pull_cursor::get_cursor(conn, &fixture.school_id)
                    .unwrap()
                    .0,
                0,
                "a rejected change must never advance the cursor past it"
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_payload_encrypted_under_the_wrong_key() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_learner_change(&fixture, entity_id, 0);
            let plaintext = serde_json::to_vec(&synthetic_learner(&fixture, entity_id)).unwrap();
            let wrong_key = crate::crypto::payload_key::generate_payload_key();
            change.encrypted_payload =
                payload_key::encrypt_payload(&wrong_key, &plaintext).unwrap();
            sync_outbox::enqueue(conn, &fixture.school_id, &change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.applied, 0);
        assert_eq!(summary.rejected, 1);
        assert!(summary.failed);
        {
            let conn = &fixture.conn;
            assert!(learner::find_by_id_in_school(
                conn,
                &fixture.school_id,
                &entity_id.to_string()
            )
            .unwrap()
            .is_none());
        };
    }

    #[test]
    fn pull_once_applies_a_non_conflicting_attendance_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_attendance_change(&fixture, entity_id, 0),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 1);
        assert_eq!(summary.conflicted, 0);
        assert_eq!(summary.rejected, 0);
        assert!(!summary.failed);
        {
            let conn = &fixture.conn;
            let stored: String = conn
                .query_row(
                    "SELECT status FROM attendance_records WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, "present");
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Attendance,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_attendance_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_attendance_change(&fixture, entity_id, 0);
            let last = change.encrypted_payload.len() - 1;
            change.encrypted_payload[last] ^= 0xFF;
            sync_outbox::enqueue(conn, &fixture.school_id, &change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.applied, 0);
        assert_eq!(summary.rejected, 1);
        assert!(summary.failed);
        {
            let conn = &fixture.conn;
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM attendance_records WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 0, "a tampered payload must never be materialized");
            assert_eq!(
                sync_pull_cursor::get_cursor(conn, &fixture.school_id)
                    .unwrap()
                    .0,
                0,
                "a rejected change must never advance the cursor past it"
            );
        };
    }

    #[test]
    fn pull_once_stages_an_attendance_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's attendance change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::Attendance;
            sync_outbox::enqueue(conn, &fixture.school_id, &other_device_change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        // This device independently edited the SAME entity and has not
        // pushed it yet.
        {
            let conn = &fixture.conn;
            let mut local_change = make_change(&fixture, entity_id, 0);
            local_change.entity_kind = EntityKind::Attendance;
            sync_outbox::enqueue(conn, &fixture.school_id, &local_change).unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 0);
        assert_eq!(summary.conflicted, 1);
        {
            let conn = &fixture.conn;
            assert_eq!(
                sync_conflict_review::count_open_for_school(conn, &fixture.school_id).unwrap(),
                1
            );
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM attendance_records WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                count, 0,
                "a staged conflict must never touch the domain table"
            );
        };
    }

    #[test]
    fn run_once_is_none_for_a_never_enrolled_installation() {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        let client = http_client();

        assert_eq!(run_once(&conn, &client).unwrap(), None);
    }
}
