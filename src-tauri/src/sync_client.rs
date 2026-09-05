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
//! **Deliberately NOT done in this slice** (see ADR-0067's "payload key
//! ceremony" gap, `crypto::payload_key`'s own doc comment, and this
//! slice's task description): decrypting `encrypted_payload` and
//! materializing it into a domain table (`learners`, `sections`, ...).
//! No Tauri command or persisted state yet gives a device the SSPK
//! needed to do that safely, and building that ceremony is explicitly a
//! separate increment. What this module *can* do without it -- and does
//! -- is track *that* a change happened for an entity (its version) and
//! detect when this device must not blindly trust that version because
//! it has its own unsynced local edit to the same entity, staging that
//! case into the same conflict-review queue the push side already uses,
//! never a silent last-write-wins.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::repository::{
    device_sync_client_credential, sync_conflict_review, sync_hub, sync_outbox, sync_pull_cursor,
    sync_version_cache,
};
use crate::sync::PendingChange;

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
    pub failed: bool,
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
        } else {
            sync_version_cache::record_known_version(
                conn,
                &config.school_id,
                change.entity_kind,
                &entity_id,
                change.version,
            )?;
            summary.applied += 1;
        }
        sync_pull_cursor::advance_cursor(conn, &config.school_id, change.cursor)?;
    }
    Ok(summary)
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
    fn spawn_test_hub(conn: Connection) -> SocketAddr {
        let std_listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        std_listener.set_nonblocking(true).unwrap();
        let addr = std_listener.local_addr().unwrap();
        let router = crate::hub_server::router(crate::hub_server::HubServerState {
            db: Arc::new(Mutex::new(conn)),
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
        let addr = spawn_test_hub(hub_conn);

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
                &make_change(&fixture, entity_id, 0),
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
        {
            let conn = &fixture.conn;
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
