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
//! `commands::learner`'s own doc comment), `EntityKind::Attendance` (see
//! `commands::attendance`'s own doc comment), `EntityKind::Section` (see
//! `commands::section`'s own doc comment -- chosen specifically because
//! `attendance_records.section_id` is the real FK that an unwired
//! `Section` left unresolvable on pull), and, added in a later addendum,
//! `EntityKind::LearnerScore` (see `commands::learner_score`'s own doc
//! comment -- a teacher's own gradebook data, re-recordable exactly like
//! `Attendance`), and, added in a later addendum, `EntityKind::AssessmentItem`
//! (see `commands::assessment_item`'s own doc comment -- create-only,
//! matching `Section`), and, added in a later addendum,
//! `EntityKind::Subject` (see `commands::subject`'s own doc comment --
//! create-only, matching `Section`/`AssessmentItem`), and, added in a
//! later addendum, `EntityKind::TeachingAssignment` (see
//! `commands::teaching_assignment`'s own doc comment -- also create-only,
//! matching `Section`/`AssessmentItem`/`Subject`), and, added in a later
//! addendum, `EntityKind::GradingPeriod` (see `commands::grading`'s own
//! doc comment -- also create-only, matching
//! `Section`/`AssessmentItem`/`Subject`/`TeachingAssignment`), and, added
//! in a later addendum, `EntityKind::SubjectAttendance` (see
//! `commands::subject_attendance`'s own doc comment -- also create-only,
//! matching `Section`/`AssessmentItem`/`Subject`/`TeachingAssignment`/
//! `GradingPeriod`; carries only the subject-attendance SESSION, not its
//! per-learner entries -- see that same doc comment for why), and, added
//! in a later addendum, `EntityKind::SectionMembership` (see
//! `commands::section`'s own doc comment on
//! `enqueue_section_membership_sync_change` -- re-recordable, matching
//! `Attendance`/`LearnerScore`; unlike those two single-row entities, this
//! is the first entity whose lifecycle verbs (enroll/transfer/end) can
//! mutate MORE than one row per user action -- a transfer closes one row
//! and opens another, each synced independently as its own
//! `SectionMembership` id, never a combined "event" record. Wired only at
//! the typed, roster-driven verbs (`enroll_membership`/
//! `transfer_membership`/`end_membership`) the Section Roster screen
//! actually drives, not the bulk create-and-place primitive `enroll` used
//! by CSV import, matching this codebase's existing precedent of leaving
//! bulk/import write paths unwired to sync); every other
//! `EntityKind` variant has no producing write path yet, so
//! decrypting one here is unreachable in practice and is
//! treated as a rejection rather than a silent no-op success. A change
//! this device has its own unsynced local
//! edit for is still never decrypted-and-applied -- it is staged into the
//! same conflict-review queue the push side already uses, exactly as
//! before this addendum, never a silent last-write-wins. This is
//! `SectionMembership`'s own concrete instance of that rule: enrollment
//! data never uses silent last-write-wins
//! (`.claude/rules/architecture.md`), so a `base_version` mismatch on a
//! pending local enroll/transfer/end always routes to
//! `sync_conflict_review`, exactly like every other entity here --
//! nothing new was added to `pull_once`'s conflict check itself, since it
//! already dispatches on `entity_kind`/`entity_id` generically before this
//! match is ever reached.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::error::AppResult;
use crate::repository::{
    assessment_item, attendance, device_credential, device_sync_client_credential, grading,
    learner, learner_score, section, section_membership, subject, subject_attendance,
    sync_conflict_review, sync_hub, sync_outbox, sync_pull_cursor, sync_version_cache,
    teaching_assignment,
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
pub(crate) fn resolve_sspk(
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
            Err(ApplyRejection::Untrusted) => {
                summary.rejected += 1;
                summary.failed = true;
                break;
            }
            Err(ApplyRejection::RepositoryRejected) => {
                // See `ApplyRejection`'s own doc comment: this is a real,
                // non-malicious data collision (e.g. two devices
                // independently creating a same-named Subject offline),
                // not a tampered/undecryptable payload -- advance PAST it
                // so it cannot wedge every other device's every other
                // change behind it forever. This one change is not
                // retried automatically; a human resolves the underlying
                // collision if it needs fixing.
                log::warn!(
                    "sync pull: repository rejected {:?} {} for school {} (likely a legitimate natural-key collision between two devices, e.g. a duplicate Subject name or LearnerScore/SectionMembership natural key) -- skipping without retry, resolve manually if needed",
                    change.entity_kind,
                    entity_id,
                    config.school_id
                );
                summary.rejected += 1;
                sync_pull_cursor::advance_cursor(conn, &config.school_id, change.cursor)?;
            }
        }
    }
    Ok(summary)
}

/// Distinguishes why `apply_decrypted_change` failed, so `pull_once` can
/// react differently -- see this project's first genuinely independent
/// security review of this file's sibling entities
/// (`docs/reviews/2026-09-07-sync-entity-wiring-review.md`), which found
/// that treating every failure identically let one ordinary,
/// non-malicious natural-key collision between two devices (e.g. both
/// independently creating a `Subject` named "MAPEH" while offline, before
/// either had synced) permanently wedge sync for the WHOLE SCHOOL, not
/// just the one colliding entity, because `pull_once` never advanced the
/// cursor past it and re-fetched the exact same poisoned change first on
/// every future round, forever.
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ApplyRejection {
    /// A decrypt/auth-tag failure, malformed payload, or a declared
    /// `school_id` mismatch -- possibly malicious or corrupted, not
    /// merely a legitimate data collision. `pull_once` must never
    /// advance past this: it is retried (and re-flagged) on every
    /// future pull round, exactly as before this fix.
    Untrusted,
    /// The payload decrypted and validated successfully -- this is
    /// definitely a genuine change from a trusted device -- but the
    /// repository's own write failed for a legitimate, content-level
    /// reason (e.g. a `UNIQUE` constraint on a natural key distinct
    /// from the row's own `id`, which `ON CONFLICT(id) DO UPDATE` does
    /// not suppress). Not evidence of tampering or a wrong key, so
    /// `pull_once` advances PAST this one change (never retried
    /// automatically -- a human must resolve the underlying collision)
    /// instead of blocking every other device's every other change
    /// behind it indefinitely.
    RepositoryRejected,
}

/// Decrypts `change.encrypted_payload` under `sspk` and, for the one
/// entity kind this slice wires end to end (`EntityKind::Learner`),
/// applies it via the existing `repository::learner` write path -- never
/// raw SQL here (`.claude/rules/architecture.md`: "All SQL lives in
/// Rust ... repository"). See `ApplyRejection`'s own doc comment for why
/// this returns a two-variant error rather than a bare unit error --
/// deliberately still not `AppResult`, so `pull_once` cannot accidentally
/// propagate a decrypt failure as a hard `?`-short-circuit that would
/// abort the whole batch loop before recording `summary.rejected`/`failed`
/// for the caller. A payload whose declared `school_id` mismatches
/// `school_id` is treated exactly like a tampered payload -- decrypting
/// successfully under this school's SSPK already strongly implies it, but
/// this is defense in depth, not proof, so it is still checked explicitly
/// rather than trusted silently (`.claude/rules/security-privacy.md`:
/// enforce at the repository boundary, not by omission).
///
/// Every `EntityKind` variant now has an arm here (`Learner`/`Attendance`/
/// `Section`/`LearnerScore`/`AssessmentItem`/`Subject`/
/// `TeachingAssignment`/`GradingPeriod`/`SubjectAttendance`/
/// `SectionMembership`), so the `match` below is exhaustive with no
/// wildcard fallback -- see `commands::learner`'s, `commands::attendance`'s,
/// `commands::section`'s (both for `Section` and for `SectionMembership`),
/// `commands::learner_score`'s, `commands::assessment_item`'s,
/// `commands::subject`'s, `commands::teaching_assignment`'s,
/// `commands::grading`'s, and `commands::subject_attendance`'s own doc
/// comments for what each entity's write-path coverage actually is (some,
/// like `TeachingAssignment`'s `create` verb or `SubjectAttendance`'s
/// session-only scope, are narrower than "every write to this table
/// syncs" -- the entity KIND is fully handled here even where only some
/// of its VERBS enqueue a change). Adding an eleventh `EntityKind` variant
/// in the future will make this `match` non-exhaustive again, which the
/// compiler enforces -- there is no silent-no-op-success path to
/// accidentally fall into.
pub(crate) fn apply_decrypted_change(
    conn: &Connection,
    school_id: &str,
    change: &sync_hub::AcceptedChange,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> Result<(), ApplyRejection> {
    let plaintext = payload_key::decrypt_payload(sspk, &change.encrypted_payload)
        .map_err(|_| ApplyRejection::Untrusted)?;

    match change.entity_kind {
        EntityKind::Learner => {
            let incoming: learner::Learner =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            learner::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::Attendance => {
            let incoming: attendance::AttendanceRecord =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            attendance::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::Section => {
            let incoming: section::Section =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            section::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::LearnerScore => {
            let incoming: learner_score::LearnerScore =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            learner_score::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::AssessmentItem => {
            let incoming: assessment_item::AssessmentItem =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            assessment_item::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::Subject => {
            let incoming: subject::Subject =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            subject::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::TeachingAssignment => {
            let incoming: teaching_assignment::TeachingAssignment =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            teaching_assignment::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::GradingPeriod => {
            let incoming: grading::GradingPeriod =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            grading::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::SubjectAttendance => {
            let incoming: subject_attendance::SubjectAttendanceSession =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            subject_attendance::upsert_session_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
        EntityKind::SectionMembership => {
            let incoming: section_membership::SectionMembership =
                serde_json::from_slice(&plaintext).map_err(|_| ApplyRejection::Untrusted)?;
            if incoming.school_id != school_id {
                return Err(ApplyRejection::Untrusted);
            }
            section_membership::upsert_from_sync(conn, &incoming)
                .map_err(|_| ApplyRejection::RepositoryRejected)
        }
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
            sspk: Arc::new(crate::hub_server::SspkCell(std::sync::RwLock::new(Some(
                sspk,
            )))),
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

    /// Like `synthetic_learner`, but a `Section` -- the third entity kind
    /// wired end to end (see `commands::section`'s own doc comment for
    /// why it was chosen: it is the real FK `attendance_records.section_id`
    /// points at). Deliberately does NOT insert a row into the fixture's
    /// own local `sections` table the way `synthetic_attendance_record`
    /// does for its own FK targets -- proving that the section itself
    /// arrives and is materialized purely through this same sync pull path
    /// is the point of these tests.
    fn synthetic_section(fixture: &TestFixture, entity_id: Uuid) -> section::Section {
        section::Section {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            school_year: "2025-2026".to_string(),
            grade_level: "7".to_string(),
            name: format!("Section-{entity_id}"),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_learner_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` section payload.
    fn make_section_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::Section;
        let plaintext = serde_json::to_vec(&synthetic_section(fixture, entity_id)).unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    fn synthetic_subject(fixture: &TestFixture, entity_id: Uuid) -> subject::Subject {
        subject::Subject {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            name: format!("Subject-{entity_id}"),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_section_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` subject payload.
    fn make_subject_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::Subject;
        let plaintext = serde_json::to_vec(&synthetic_subject(fixture, entity_id)).unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// Builds a section + subject + teacher user (no teaching assignment)
    /// in the CLIENT's own local db -- the minimum fixture
    /// `synthetic_teaching_assignment`'s three FKs (`section_id`,
    /// `subject_id`, `teacher_user_id`) need. `teaching_assignments.
    /// teacher_user_id` is `REFERENCES users(id)`, so `fixture.user_id`
    /// (which only exists on the HUB's own separate database, per
    /// `setup`'s own doc comment) cannot be reused here -- a genuinely
    /// separate user row is created directly on the client conn.
    /// Mirrors `setup_class_record`'s shape one step earlier, since a
    /// teaching assignment has no grading-period FK.
    fn setup_section_subject_and_teacher(fixture: &TestFixture) -> (String, String, String) {
        let conn = &fixture.conn;
        let sec = crate::repository::section::create(
            conn,
            &fixture.school_id,
            "2026-2027",
            "7",
            "Mabini",
        )
        .unwrap();
        let sub =
            crate::repository::subject::create(conn, &fixture.school_id, "Mathematics").unwrap();
        let teacher =
            crate::repository::user::create_user(conn, "teacher.a", "password", "Teacher A")
                .unwrap();
        (sec.id, sub.id, teacher.id)
    }

    fn synthetic_teaching_assignment(
        fixture: &TestFixture,
        entity_id: Uuid,
        teacher_user_id: &str,
        section_id: &str,
        subject_id: &str,
    ) -> teaching_assignment::TeachingAssignment {
        teaching_assignment::TeachingAssignment {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            teacher_user_id: teacher_user_id.to_string(),
            section_id: section_id.to_string(),
            subject_id: subject_id.to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_subject_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` teaching-assignment payload.
    fn make_teaching_assignment_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        teacher_user_id: &str,
        section_id: &str,
        subject_id: &str,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::TeachingAssignment;
        let plaintext = serde_json::to_vec(&synthetic_teaching_assignment(
            fixture,
            entity_id,
            teacher_user_id,
            section_id,
            subject_id,
        ))
        .unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// The three-term policy's first period id, seeded by migration 6 in
    /// every fresh database -- the same reference-data id
    /// `repository::grading::tests` uses as `TERM_1`. Fixed, not derived
    /// from a lookup, since it is seed data rather than school-scoped.
    const GRADING_TERM_1: &str = "00000000-0000-7000-8000-000000000011";

    fn synthetic_grading_period(fixture: &TestFixture, entity_id: Uuid) -> grading::GradingPeriod {
        grading::GradingPeriod {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            school_year: "2026-2027".to_string(),
            policy_period_id: GRADING_TERM_1.to_string(),
            label: "1st Term".to_string(),
            starts_on: "2026-06-08".to_string(),
            ends_on: "2026-09-15".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_teaching_assignment_change`, but with a REAL
    /// encrypted-under-`fixture.sspk` grading-period payload.
    fn make_grading_period_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::GradingPeriod;
        let plaintext = serde_json::to_vec(&synthetic_grading_period(fixture, entity_id)).unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// Builds a teaching assignment on the CLIENT's own local db -- the
    /// FK target `synthetic_subject_attendance_session` needs. Mirrors
    /// `setup_section_subject_and_teacher` + a real
    /// `teaching_assignment::create` call, since a subject-attendance
    /// session's own FKs (`section_id`/`subject_id`) must resolve to real
    /// local rows for `upsert_session_from_sync`'s `INSERT` to succeed
    /// under `foreign_keys = ON`.
    fn setup_teaching_assignment(fixture: &TestFixture) -> teaching_assignment::TeachingAssignment {
        let (section_id, subject_id, teacher_id) = setup_section_subject_and_teacher(fixture);
        crate::repository::user::add_school_membership(
            &fixture.conn,
            &teacher_id,
            &fixture.school_id,
        )
        .unwrap();
        teaching_assignment::create(
            &fixture.conn,
            &fixture.school_id,
            &teacher_id,
            &section_id,
            &subject_id,
        )
        .unwrap()
        .unwrap()
    }

    fn synthetic_subject_attendance_session(
        fixture: &TestFixture,
        entity_id: Uuid,
        assignment: &teaching_assignment::TeachingAssignment,
    ) -> subject_attendance::SubjectAttendanceSession {
        subject_attendance::SubjectAttendanceSession {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            teaching_assignment_id: assignment.id.clone(),
            section_id: assignment.section_id.clone(),
            subject_id: assignment.subject_id.clone(),
            session_date: "2026-08-29".to_string(),
            status: subject_attendance::SessionStatus::Held,
            created_by_user_id: assignment.teacher_user_id.clone(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Builds a section + learner on the CLIENT's own local db -- the two
    /// FK targets `synthetic_section_membership` needs
    /// (`section_id`/`learner_id`), mirroring `synthetic_attendance_record`'s
    /// own local-fixture pattern.
    fn setup_section_and_learner(fixture: &TestFixture) -> (String, String) {
        let sec = crate::repository::section::create(
            &fixture.conn,
            &fixture.school_id,
            "2026-2027",
            "7",
            "Mabini",
        )
        .unwrap();
        let learner =
            learner::create(&fixture.conn, &fixture.school_id, "Ana", "Cruz", None, None).unwrap();
        (sec.id, learner.id)
    }

    fn synthetic_section_membership(
        fixture: &TestFixture,
        entity_id: Uuid,
        section_id: &str,
        learner_id: &str,
        ends_on: Option<&str>,
    ) -> section_membership::SectionMembership {
        section_membership::SectionMembership {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            section_id: section_id.to_string(),
            learner_id: learner_id.to_string(),
            starts_on: "2026-06-08".to_string(),
            ends_on: ends_on.map(str::to_string),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_grading_period_change`, but with a REAL
    /// encrypted-under-`fixture.sspk` subject-attendance-session payload.
    fn make_subject_attendance_session_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        assignment: &teaching_assignment::TeachingAssignment,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::SubjectAttendance;
        let plaintext = serde_json::to_vec(&synthetic_subject_attendance_session(
            fixture, entity_id, assignment,
        ))
        .unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// Like `make_grading_period_change`, but with a REAL
    /// encrypted-under-`fixture.sspk` section-membership payload.
    fn make_section_membership_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        section_id: &str,
        learner_id: &str,
        ends_on: Option<&str>,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::SectionMembership;
        let plaintext = serde_json::to_vec(&synthetic_section_membership(
            fixture, entity_id, section_id, learner_id, ends_on,
        ))
        .unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    /// Like `synthetic_attendance_record`, but referencing an existing
    /// `Section` id instead of creating a new one locally -- lets
    /// `attendance_change_resolves_against_a_previously_pulled_section`
    /// build an `AttendanceRecord` whose FK target was never independently
    /// created on this device, only pulled.
    fn synthetic_attendance_record_for_section(
        fixture: &TestFixture,
        entity_id: Uuid,
        section_id: &str,
    ) -> attendance::AttendanceRecord {
        let learner =
            learner::create(&fixture.conn, &fixture.school_id, "Ana", "Cruz", None, None).unwrap();
        attendance::AttendanceRecord {
            id: entity_id.to_string(),
            school_id: fixture.school_id.clone(),
            section_id: section_id.to_string(),
            learner_id: learner.id,
            attendance_date: "2026-08-24".to_string(),
            status: attendance::AttendanceStatus::Present,
            recorded_at: "2026-08-24T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_attendance_change`, but builds its payload from
    /// `synthetic_attendance_record_for_section` instead of
    /// `synthetic_attendance_record`.
    fn make_attendance_change_for_section(
        fixture: &TestFixture,
        entity_id: Uuid,
        section_id: &str,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::Attendance;
        let plaintext = serde_json::to_vec(&synthetic_attendance_record_for_section(
            fixture, entity_id, section_id,
        ))
        .unwrap();
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
    fn pull_once_converges_across_multiple_rounds_when_pending_changes_exceed_one_batch() {
        // The "weeks-offline catch-up" scenario (docs/VERIFICATION-DEBT.md's
        // ADR-0067 entry): a device with more pending changes than one
        // `PULL_BATCH_LIMIT` batch must fully catch up over several
        // consecutive `pull_once` calls, applying every change exactly
        // once and advancing the cursor correctly across the batch
        // boundary -- never losing, duplicating, or getting stuck on a
        // change on either side of that boundary.
        let fixture = setup();
        let client = http_client();
        let config = config_for(&fixture);
        let total = PULL_BATCH_LIMIT as usize + 5;
        let entity_ids: Vec<Uuid> = (0..total).map(|_| Uuid::now_v7()).collect();

        {
            let conn = &fixture.conn;
            for (i, entity_id) in entity_ids.iter().enumerate() {
                // Each learner needs its own unique LRN -- reusing
                // `synthetic_learner`'s fixed LRN across many rows would
                // trip the real `idx_learners_school_lrn` UNIQUE index on
                // materialization, which `pull_once` treats identically to
                // a tampered payload (halts the rest of the batch). That is
                // a real, separate, intentional design property (see
                // `pull_once`'s own doc comment) -- not what this test is
                // checking, so it must be avoided here, not exercised.
                let learner = learner::Learner {
                    id: entity_id.to_string(),
                    school_id: fixture.school_id.clone(),
                    given_name: "Ana".to_string(),
                    family_name: "Cruz".to_string(),
                    lrn: Some(format!("{:012}", 100_000_000_000_u64 + i as u64)),
                    sex: Some("F".to_string()),
                    created_at: "2026-01-01T00:00:00.000Z".to_string(),
                };
                let plaintext = serde_json::to_vec(&learner).unwrap();
                let mut change = make_change(&fixture, *entity_id, 0);
                change.encrypted_payload =
                    payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
                sync_outbox::enqueue(conn, &fixture.school_id, &change).unwrap();
            }
            // Drain the outbox to the hub across as many push rounds as
            // needed (PUSH_BATCH_LIMIT matches PULL_BATCH_LIMIT, so two
            // rounds for `total` changes).
            loop {
                let summary = push_once(conn, &client, &config).unwrap();
                if summary.sent == 0 {
                    break;
                }
            }
            // Simulate every one of these having come from ANOTHER device,
            // exactly like the single-change tests above do.
            conn.execute_batch("DELETE FROM sync_version_cache")
                .unwrap();
        }

        let first = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };
        assert_eq!(first.received, PULL_BATCH_LIMIT as usize);
        assert_eq!(first.applied, PULL_BATCH_LIMIT as usize);
        assert_eq!(first.rejected, 0);
        assert!(!first.failed);
        assert_eq!(
            sync_pull_cursor::get_cursor(&fixture.conn, &fixture.school_id)
                .unwrap()
                .0,
            PULL_BATCH_LIMIT as u64
        );

        let remaining = total - PULL_BATCH_LIMIT as usize;
        let second = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };
        assert_eq!(second.received, remaining);
        assert_eq!(second.applied, remaining);
        assert_eq!(second.rejected, 0);
        assert!(!second.failed);
        assert_eq!(
            sync_pull_cursor::get_cursor(&fixture.conn, &fixture.school_id)
                .unwrap()
                .0,
            total as u64
        );

        // A third round has nothing left to catch up on -- convergence,
        // not an endless retry of already-applied changes.
        let third = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };
        assert_eq!(third.received, 0);
        assert_eq!(third.applied, 0);

        // Every entity across both rounds materialized exactly once --
        // nothing lost or duplicated at the batch boundary.
        let conn = &fixture.conn;
        for entity_id in &entity_ids {
            let materialized =
                learner::find_by_id_in_school(conn, &fixture.school_id, &entity_id.to_string())
                    .unwrap()
                    .unwrap_or_else(|| {
                        panic!("entity {entity_id} must be materialized after both pull rounds")
                    });
            assert_eq!(materialized.id, entity_id.to_string());
        }
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
    fn pull_once_applies_a_non_conflicting_section_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_section_change(&fixture, entity_id, 0),
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
                    "SELECT name FROM sections WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, format!("Section-{entity_id}"));
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Section,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_section_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_section_change(&fixture, entity_id, 0);
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
                    "SELECT COUNT(*) FROM sections WHERE id = ?1",
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
    fn pull_once_stages_a_section_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's section change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::Section;
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
            local_change.entity_kind = EntityKind::Section;
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
                    "SELECT COUNT(*) FROM sections WHERE id = ?1",
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
    fn pull_once_applies_a_non_conflicting_subject_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_subject_change(&fixture, entity_id, 0),
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
                    "SELECT name FROM subjects WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, format!("Subject-{entity_id}"));
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::Subject,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_skips_past_a_natural_key_collision_instead_of_wedging_every_later_change() {
        // The regression test for the BLOCKING finding in
        // docs/reviews/2026-09-07-sync-entity-wiring-review.md: two
        // devices independently create a `Subject` named "Mathematics"
        // while both offline, each minting its own `id`. When this
        // device pulls the OTHER device's row, it collides with its own
        // existing "Mathematics" row on `UNIQUE (school_id, name)` --
        // a real, non-malicious, content-level rejection, not a
        // tampered payload. Before this fix, `pull_once` treated that
        // identically to a tampered payload and `break`, permanently
        // stuck re-fetching the same poisoned change forever, which
        // silently blocked every OTHER entity's every other change
        // behind it too. This proves: the colliding change is skipped
        // (not applied, not retried), but a later, non-colliding change
        // in the SAME pull round still applies normally.
        let fixture = setup();
        let config = config_for(&fixture);
        let client = http_client();

        subject::create(&fixture.conn, &fixture.school_id, "Mathematics").unwrap();

        let colliding_entity_id = Uuid::now_v7();
        let good_entity_id = Uuid::now_v7();
        {
            let conn = &fixture.conn;
            let colliding_subject = subject::Subject {
                id: colliding_entity_id.to_string(),
                school_id: fixture.school_id.clone(),
                name: "Mathematics".to_string(),
                created_at: "2026-01-01T00:00:00.000Z".to_string(),
            };
            let mut colliding_change = make_change(&fixture, colliding_entity_id, 0);
            colliding_change.entity_kind = EntityKind::Subject;
            colliding_change.encrypted_payload = payload_key::encrypt_payload(
                &fixture.sspk,
                &serde_json::to_vec(&colliding_subject).unwrap(),
            )
            .unwrap();
            sync_outbox::enqueue(conn, &fixture.school_id, &colliding_change).unwrap();
            push_once(conn, &client, &config).unwrap();

            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_subject_change(&fixture, good_entity_id, 0),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();

            conn.execute_batch("DELETE FROM sync_version_cache")
                .unwrap();
        }

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 2);
        assert_eq!(
            summary.applied, 1,
            "only the non-colliding change should apply"
        );
        assert_eq!(
            summary.rejected, 1,
            "the colliding change is rejected, not silently dropped"
        );
        assert_eq!(summary.conflicted, 0);
        assert!(
            !summary.failed,
            "a legitimate data collision must not be reported as a request failure"
        );

        let conn = &fixture.conn;
        assert_eq!(
            sync_pull_cursor::get_cursor(conn, &fixture.school_id)
                .unwrap()
                .0,
            2,
            "the cursor must advance past BOTH changes, not get stuck on the colliding one"
        );
        let colliding_row_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM subjects WHERE id = ?1)",
                [colliding_entity_id.to_string()],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            !colliding_row_exists,
            "the colliding change must never be materialized"
        );
        let good_materialized =
            subject::find_by_id_in_school(conn, &fixture.school_id, &good_entity_id.to_string())
                .unwrap();
        assert!(
            good_materialized.is_some(),
            "the later, non-colliding change must still apply despite the earlier rejection"
        );
    }

    #[test]
    fn pull_once_rejects_a_tampered_subject_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_subject_change(&fixture, entity_id, 0);
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
                    "SELECT COUNT(*) FROM subjects WHERE id = ?1",
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
    fn pull_once_stages_a_subject_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's subject change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::Subject;
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
            local_change.entity_kind = EntityKind::Subject;
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
                    "SELECT COUNT(*) FROM subjects WHERE id = ?1",
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
    fn pull_once_applies_a_non_conflicting_teaching_assignment_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let (section_id, subject_id, teacher_user_id) = setup_section_subject_and_teacher(&fixture);

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_teaching_assignment_change(
                    &fixture,
                    entity_id,
                    &teacher_user_id,
                    &section_id,
                    &subject_id,
                    0,
                ),
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
                    "SELECT teacher_user_id FROM teaching_assignments WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, teacher_user_id);
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::TeachingAssignment,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_teaching_assignment_payload_without_applying_or_advancing_past_it(
    ) {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let (section_id, subject_id, teacher_user_id) = setup_section_subject_and_teacher(&fixture);

        {
            let conn = &fixture.conn;
            let mut change = make_teaching_assignment_change(
                &fixture,
                entity_id,
                &teacher_user_id,
                &section_id,
                &subject_id,
                0,
            );
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
                    "SELECT COUNT(*) FROM teaching_assignments WHERE id = ?1",
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
    fn pull_once_stages_a_teaching_assignment_conflict_when_this_device_has_an_unsynced_local_edit()
    {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's teaching-assignment change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::TeachingAssignment;
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
            local_change.entity_kind = EntityKind::TeachingAssignment;
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
                    "SELECT COUNT(*) FROM teaching_assignments WHERE id = ?1",
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
    fn pull_once_applies_a_non_conflicting_grading_period_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_grading_period_change(&fixture, entity_id, 0),
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
                    "SELECT school_year FROM grading_periods WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, "2026-2027");
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::GradingPeriod,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_grading_period_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_grading_period_change(&fixture, entity_id, 0);
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
                    "SELECT COUNT(*) FROM grading_periods WHERE id = ?1",
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
    fn pull_once_stages_a_grading_period_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's grading-period change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::GradingPeriod;
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
            local_change.entity_kind = EntityKind::GradingPeriod;
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
                    "SELECT COUNT(*) FROM grading_periods WHERE id = ?1",
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
    fn pull_once_applies_a_non_conflicting_subject_attendance_session_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let assignment = setup_teaching_assignment(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_subject_attendance_session_change(&fixture, entity_id, &assignment, 0),
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
                    "SELECT status FROM subject_attendance_sessions WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored, "held");
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::SubjectAttendance,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_subject_attendance_session_payload_without_applying_or_advancing_past_it(
    ) {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let assignment = setup_teaching_assignment(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change =
                make_subject_attendance_session_change(&fixture, entity_id, &assignment, 0);
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
                    "SELECT COUNT(*) FROM subject_attendance_sessions WHERE id = ?1",
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
    fn pull_once_stages_a_subject_attendance_session_conflict_when_this_device_has_an_unsynced_local_edit(
    ) {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let _assignment = setup_teaching_assignment(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's session change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::SubjectAttendance;
            sync_outbox::enqueue(conn, &fixture.school_id, &other_device_change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        // This device independently has its own unsynced change for the
        // SAME entity id.
        {
            let conn = &fixture.conn;
            let mut local_change = make_change(&fixture, entity_id, 0);
            local_change.entity_kind = EntityKind::SubjectAttendance;
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
                    "SELECT COUNT(*) FROM subject_attendance_sessions WHERE id = ?1",
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

    /// Proves this slice actually closes the FK gap `docs/CURRENT-HANDOFF.md`
    /// recorded when `Attendance` was wired: a device that pulls a
    /// `Section` first, then pulls an `Attendance` change referencing that
    /// same section id -- a section this device never independently
    /// created locally, only received via sync -- must resolve cleanly
    /// (FK satisfied, applied, not rejected) instead of hitting the FK
    /// violation this codebase's own `ACTIVE-PLAN.md` "retained debt"
    /// entry described.
    #[test]
    fn attendance_change_resolves_against_a_previously_pulled_section() {
        let fixture = setup();
        let section_entity_id = Uuid::now_v7();
        let attendance_entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Push and pull the Section first, from a batch of its own --
        // this device now has a local `sections` row it never created
        // through `section::create` itself, only materialized via
        // `section::upsert_from_sync`.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_section_change(&fixture, section_entity_id, 0),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [section_entity_id.to_string()],
            )
            .unwrap();
            pull_once(conn, &client, &config).unwrap();
        };

        // Now push and pull an Attendance change referencing that exact
        // section id -- built via `synthetic_attendance_record_for_section`,
        // which deliberately does NOT create the section locally itself.
        let summary = {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_attendance_change_for_section(
                    &fixture,
                    attendance_entity_id,
                    &section_entity_id.to_string(),
                    0,
                ),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [attendance_entity_id.to_string()],
            )
            .unwrap();
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.applied, 1);
        assert_eq!(summary.rejected, 0);
        assert!(!summary.failed, "the section FK must now resolve cleanly");
        {
            let conn = &fixture.conn;
            let stored_section_id: String = conn
                .query_row(
                    "SELECT section_id FROM attendance_records WHERE id = ?1",
                    [attendance_entity_id.to_string()],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(stored_section_id, section_entity_id.to_string());
        };
    }

    const SYNC_TEST_TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const SYNC_TEST_WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const SYNC_TEST_K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    /// Builds a full class-record chain (section + subject + grading
    /// period + class record + assessment item) plus an enrolled learner
    /// AND a local teacher user, all in the CLIENT's own local db, and
    /// returns (assessment_item_id, learner_id, teacher_user_id) -- the FK
    /// targets `learner_scores` requires (including
    /// `recorded_by_user_id`, a real FK to `users(id)` -- `fixture.user_id`
    /// is NOT usable here, since that row exists only in the separate HUB
    /// database `spawn_test_hub` set up, not this client's own db), mirroring
    /// `repository::learner_score::tests::setup`'s own fixture shape.
    fn setup_assessment_item_and_learner(fixture: &TestFixture) -> (String, String, String) {
        let conn = &fixture.conn;
        let sec = crate::repository::section::create(
            conn,
            &fixture.school_id,
            "2026-2027",
            "7",
            "Mabini",
        )
        .unwrap();
        let sub =
            crate::repository::subject::create(conn, &fixture.school_id, "Mathematics").unwrap();
        let period = crate::repository::grading::create(
            conn,
            &fixture.school_id,
            "2026-2027",
            SYNC_TEST_TERM_1,
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let cr = crate::repository::class_record::create(
            conn,
            &fixture.school_id,
            &sec.id,
            &sub.id,
            &period.id,
            SYNC_TEST_K10_POLICY,
            None,
        )
        .unwrap()
        .unwrap();
        let item = crate::repository::assessment_item::create(
            conn,
            &fixture.school_id,
            &cr.id,
            SYNC_TEST_WRITTEN_WORKS,
            "Quiz 1",
            20.0,
        )
        .unwrap()
        .unwrap();
        let l = learner::create(conn, &fixture.school_id, "Ana", "Cruz", None, None).unwrap();
        crate::repository::section_membership::enroll(
            conn,
            &fixture.school_id,
            &sec.id,
            &l.id,
            "2026-06-08",
        )
        .unwrap();
        let teacher =
            crate::repository::user::create_user(conn, "teacher.a", "password", "A Teacher")
                .unwrap();
        (item.id, l.id, teacher.id)
    }

    /// Like `synthetic_learner`, but a `LearnerScore` -- the fourth entity
    /// kind wired end to end (see `commands::learner_score`'s own doc
    /// comment for why it was chosen: a teacher's own gradebook data). The
    /// referenced `assessment_item_id`/`learner_id` are real local rows
    /// (`learner_scores` has FK columns to both), created via
    /// `setup_assessment_item_and_learner`.
    fn synthetic_learner_score(
        entity_id: Uuid,
        school_id: &str,
        assessment_item_id: &str,
        learner_id: &str,
        teacher_id: &str,
    ) -> learner_score::LearnerScore {
        learner_score::LearnerScore {
            id: entity_id.to_string(),
            school_id: school_id.to_string(),
            assessment_item_id: assessment_item_id.to_string(),
            learner_id: learner_id.to_string(),
            status: learner_score::LearnerScoreStatus::Scored,
            score: Some(18.0),
            recorded_by_user_id: teacher_id.to_string(),
            recorded_at: "2026-08-24T00:00:00.000Z".to_string(),
            updated_at: "2026-08-24T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_learner_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` learner-score payload.
    fn make_learner_score_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        assessment_item_id: &str,
        learner_id: &str,
        teacher_id: &str,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::LearnerScore;
        let plaintext = serde_json::to_vec(&synthetic_learner_score(
            entity_id,
            &fixture.school_id,
            assessment_item_id,
            learner_id,
            teacher_id,
        ))
        .unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    #[test]
    fn pull_once_applies_a_non_conflicting_learner_score_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let (item_id, learner_id, teacher_id) = setup_assessment_item_and_learner(&fixture);

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_learner_score_change(
                    &fixture,
                    entity_id,
                    &item_id,
                    &learner_id,
                    &teacher_id,
                    0,
                ),
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
            let stored: (String, Option<f64>) = conn
                .query_row(
                    "SELECT status, score FROM learner_scores WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(stored, ("scored".to_string(), Some(18.0)));
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::LearnerScore,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_learner_score_payload_without_applying_or_advancing_past_it() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let (item_id, learner_id, teacher_id) = setup_assessment_item_and_learner(&fixture);

        {
            let conn = &fixture.conn;
            let mut change = make_learner_score_change(
                &fixture,
                entity_id,
                &item_id,
                &learner_id,
                &teacher_id,
                0,
            );
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
                    "SELECT COUNT(*) FROM learner_scores WHERE id = ?1",
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
    fn pull_once_stages_a_learner_score_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's learner-score change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::LearnerScore;
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
            local_change.entity_kind = EntityKind::LearnerScore;
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
                    "SELECT COUNT(*) FROM learner_scores WHERE id = ?1",
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

    /// Builds a class record (section + subject + grading period +
    /// class record, no assessment item) in the CLIENT's own local db --
    /// the minimum fixture `synthetic_assessment_item`'s FK
    /// (`class_record_id`) needs. Mirrors
    /// `setup_assessment_item_and_learner`'s chain but stops one step
    /// earlier since the item itself is the entity under test here, not
    /// a dependency of it.
    fn setup_class_record(fixture: &TestFixture) -> String {
        let conn = &fixture.conn;
        let sec = crate::repository::section::create(
            conn,
            &fixture.school_id,
            "2026-2027",
            "7",
            "Mabini",
        )
        .unwrap();
        let sub =
            crate::repository::subject::create(conn, &fixture.school_id, "Mathematics").unwrap();
        let period = crate::repository::grading::create(
            conn,
            &fixture.school_id,
            "2026-2027",
            SYNC_TEST_TERM_1,
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let cr = crate::repository::class_record::create(
            conn,
            &fixture.school_id,
            &sec.id,
            &sub.id,
            &period.id,
            SYNC_TEST_K10_POLICY,
            None,
        )
        .unwrap()
        .unwrap();
        cr.id
    }

    /// Like `synthetic_learner`, but an `AssessmentItem` -- the fifth
    /// entity kind wired end to end (see `commands::assessment_item`'s
    /// own doc comment for why it was chosen: a teacher's own
    /// class-record setup data, created routinely through a grading
    /// period). The referenced `class_record_id` is a real local row
    /// (`assessment_items` has an FK to it), created via
    /// `setup_class_record`.
    fn synthetic_assessment_item(
        entity_id: Uuid,
        school_id: &str,
        class_record_id: &str,
    ) -> assessment_item::AssessmentItem {
        assessment_item::AssessmentItem {
            id: entity_id.to_string(),
            school_id: school_id.to_string(),
            class_record_id: class_record_id.to_string(),
            category_id: SYNC_TEST_WRITTEN_WORKS.to_string(),
            name: "Quiz 1".to_string(),
            max_score: 20.0,
            created_at: "2026-08-24T00:00:00.000Z".to_string(),
        }
    }

    /// Like `make_learner_score_change`, but with a REAL encrypted-under-
    /// `fixture.sspk` assessment-item payload.
    fn make_assessment_item_change(
        fixture: &TestFixture,
        entity_id: Uuid,
        class_record_id: &str,
        base_version: u64,
    ) -> PendingChange {
        let mut change = make_change(fixture, entity_id, base_version);
        change.entity_kind = EntityKind::AssessmentItem;
        let plaintext = serde_json::to_vec(&synthetic_assessment_item(
            entity_id,
            &fixture.school_id,
            class_record_id,
        ))
        .unwrap();
        change.encrypted_payload = payload_key::encrypt_payload(&fixture.sspk, &plaintext).unwrap();
        change
    }

    #[test]
    fn pull_once_applies_a_non_conflicting_assessment_item_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let class_record_id = setup_class_record(&fixture);

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_assessment_item_change(&fixture, entity_id, &class_record_id, 0),
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
            let stored: (String, f64) = conn
                .query_row(
                    "SELECT name, max_score FROM assessment_items WHERE id = ?1",
                    [entity_id.to_string()],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(stored, ("Quiz 1".to_string(), 20.0));
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::AssessmentItem,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    #[test]
    fn pull_once_rejects_a_tampered_assessment_item_payload_without_applying_or_advancing_past_it()
    {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();
        let class_record_id = setup_class_record(&fixture);

        {
            let conn = &fixture.conn;
            let mut change = make_assessment_item_change(&fixture, entity_id, &class_record_id, 0);
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
                    "SELECT COUNT(*) FROM assessment_items WHERE id = ?1",
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
    fn pull_once_stages_an_assessment_item_conflict_when_this_device_has_an_unsynced_local_edit() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's assessment-item change lands at the hub.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::AssessmentItem;
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
            local_change.entity_kind = EntityKind::AssessmentItem;
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
                    "SELECT COUNT(*) FROM assessment_items WHERE id = ?1",
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
    fn pull_once_applies_a_non_conflicting_section_membership_change() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let (section_id, learner_id) = setup_section_and_learner(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_section_membership_change(
                    &fixture,
                    entity_id,
                    &section_id,
                    &learner_id,
                    None,
                    0,
                ),
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
            let history = crate::repository::section_membership::list_by_learner_in_school(
                conn,
                &fixture.school_id,
                &learner_id,
            )
            .unwrap();
            assert_eq!(history.len(), 1, "pull_once must have materialized the row");
            assert_eq!(history[0].id, entity_id.to_string());
            assert_eq!(history[0].ends_on, None, "still open");
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::SectionMembership,
                    &entity_id.to_string()
                )
                .unwrap(),
                1
            );
        };
    }

    /// Materializes an "end" pull for a membership id this device already
    /// has an open local copy of -- `upsert_from_sync` must update the row
    /// in place (never insert a duplicate), the way `end_membership` itself
    /// updates in place on the originating device.
    #[test]
    fn pull_once_applies_an_end_pull_by_updating_the_existing_row_in_place() {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let (section_id, learner_id) = setup_section_and_learner(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        // This device already has the OPEN membership materialized locally.
        crate::repository::section_membership::upsert_from_sync(
            &fixture.conn,
            &synthetic_section_membership(&fixture, entity_id, &section_id, &learner_id, None),
        )
        .unwrap();

        // Bring the HUB itself to version 1 for this entity first -- the
        // hub has no history for this id yet, so its own first accepted
        // change for it must be base_version 0, exactly like every other
        // brand-new entity in this module's tests.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_section_membership_change(
                    &fixture,
                    entity_id,
                    &section_id,
                    &learner_id,
                    None,
                    0,
                ),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
        };

        // Another device ends it (same id, ends_on now set), pushed to the hub.
        {
            let conn = &fixture.conn;
            sync_outbox::enqueue(
                conn,
                &fixture.school_id,
                &make_section_membership_change(
                    &fixture,
                    entity_id,
                    &section_id,
                    &learner_id,
                    Some("2026-09-15"),
                    1,
                ),
            )
            .unwrap();
            push_once(conn, &client, &config).unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        // Both this device's own two pushes (the open, then the end) come
        // back on pull -- pushing does not itself advance the pull cursor.
        // Both apply cleanly since this device has no unsynced local edit
        // for either (both were already pushed/acknowledged above).
        assert_eq!(summary.received, 2);
        assert_eq!(summary.applied, 2);
        assert_eq!(summary.conflicted, 0);
        {
            let conn = &fixture.conn;
            let history = crate::repository::section_membership::list_by_learner_in_school(
                conn,
                &fixture.school_id,
                &learner_id,
            )
            .unwrap();
            assert_eq!(history.len(), 1, "must update in place, never duplicate");
            assert_eq!(history[0].ends_on.as_deref(), Some("2026-09-15"));
        };
    }

    /// The entity-specific case this slice's task description calls out:
    /// a `base_version` mismatch on a pending local enroll/transfer/end
    /// must route to `sync_conflict_review`, never silently overwrite the
    /// membership -- section membership IS enrollment data, so ADR-0067's
    /// "never last-write-wins" rule applies exactly as it does for
    /// `Learner`/`Attendance`/`AssessmentItem` above.
    #[test]
    fn pull_once_stages_a_section_membership_conflict_when_this_device_has_an_unsynced_local_edit()
    {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let (section_id, learner_id) = setup_section_and_learner(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        // Another device's change (e.g. an "end") lands at the hub first.
        {
            let conn = &fixture.conn;
            let mut other_device_change = make_change(&fixture, entity_id, 0);
            other_device_change.entity_kind = EntityKind::SectionMembership;
            sync_outbox::enqueue(conn, &fixture.school_id, &other_device_change).unwrap();
            push_once(conn, &client, &config).unwrap();
            conn.execute(
                "DELETE FROM sync_version_cache WHERE entity_id = ?1",
                [entity_id.to_string()],
            )
            .unwrap();
        };

        // This device independently has its own unsynced edit for the SAME
        // membership id, still based on the now-stale version 0.
        {
            let conn = &fixture.conn;
            let mut local_change = make_change(&fixture, entity_id, 0);
            local_change.entity_kind = EntityKind::SectionMembership;
            sync_outbox::enqueue(conn, &fixture.school_id, &local_change).unwrap();
        };

        let summary = {
            let conn = &fixture.conn;
            pull_once(conn, &client, &config).unwrap()
        };

        assert_eq!(summary.received, 1);
        assert_eq!(summary.applied, 0);
        assert_eq!(
            summary.conflicted, 1,
            "a base_version mismatch on a pending local edit must never be silently applied"
        );
        {
            let conn = &fixture.conn;
            assert_eq!(
                sync_conflict_review::count_open_for_school(conn, &fixture.school_id).unwrap(),
                1
            );
            let history = crate::repository::section_membership::list_by_learner_in_school(
                conn,
                &fixture.school_id,
                &learner_id,
            )
            .unwrap();
            assert!(
                history.is_empty(),
                "a staged conflict must never touch the domain table"
            );
            // The live version cache row must NOT have been overwritten --
            // never last-write-wins.
            assert_eq!(
                sync_version_cache::known_version(
                    conn,
                    &fixture.school_id,
                    EntityKind::SectionMembership,
                    &entity_id.to_string()
                )
                .unwrap(),
                0
            );
        };
        let _ = section_id;
    }

    #[test]
    fn pull_once_rejects_a_tampered_section_membership_payload_without_applying_or_advancing_past_it(
    ) {
        let fixture = setup();
        let entity_id = Uuid::now_v7();
        let (section_id, learner_id) = setup_section_and_learner(&fixture);
        let config = config_for(&fixture);
        let client = http_client();

        {
            let conn = &fixture.conn;
            let mut change = make_section_membership_change(
                &fixture,
                entity_id,
                &section_id,
                &learner_id,
                None,
                0,
            );
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
            let history = crate::repository::section_membership::list_by_learner_in_school(
                conn,
                &fixture.school_id,
                &learner_id,
            )
            .unwrap();
            assert!(
                history.is_empty(),
                "a tampered payload must never be materialized"
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
