//! ADR-0067 network listener: the hub's authenticated push/pull HTTP API.
//!
//! Every device identifies itself on every request via two custom
//! headers (`x-likha-credential-id`, `x-likha-device-secret`) -- never a
//! query parameter or URL segment, so a credential secret never ends up
//! in a proxy/access log line the way a query string can. Verified
//! through `repository::device_credential::verify`, the same
//! enumeration-safe, constant-time check already used everywhere else in
//! this codebase; an unknown id, a revoked credential, and a wrong
//! secret are all indistinguishable `Unauthorized` responses here too.
//!
//! `maybe_spawn_listener` wires this into real Tauri app startup and binds
//! loopback (`127.0.0.1`, always, for same-machine tools/testing) PLUS any
//! non-loopback interface address in a private range (RFC 1918, or
//! Tailscale's CGNAT range 100.64.0.0/10) -- see
//! `select_bindable_addresses` for the filtering logic and ADR-0067's
//! "network-interface binding" addendum for the full decision record.
//! Never binds `0.0.0.0` or a public address, per ADR-0067's own
//! "School-laptop operations gate": this app does not opt a school laptop
//! into direct internet exposure by default. Real LAN/Tailscale
//! reachability from another physical device still cannot be verified in
//! this sandboxed development environment -- only the selection logic and
//! the wiring are provable here.

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::sync::{Arc, Mutex, RwLock};

use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::crypto::payload_key::PAYLOAD_KEY_LEN;
use crate::error::{AppError, AppResult};
use crate::repository::{device_credential, school, sync_hub, sync_payload_key};
use crate::sync::{PendingChange, SyncCursor};

const CREDENTIAL_ID_HEADER: &str = "x-likha-credential-id";
const DEVICE_SECRET_HEADER: &str = "x-likha-device-secret";

/// Loopback is always bound, regardless of what interface enumeration
/// finds -- same-machine tools/tests must keep working even if this
/// installation somehow has no other bindable interface.
const LOOPBACK_ADDR: Ipv4Addr = Ipv4Addr::new(127, 0, 0, 1);
const HUB_PORT: u16 = 7878;

/// True for a private-use (RFC 1918) or Tailscale CGNAT (100.64.0.0/10,
/// RFC 6598) IPv4 address -- the only non-loopback ranges this app will
/// ever bind, per ADR-0067's "School-laptop operations gate": a school
/// LAN interface or a Tailscale interface, never a public address.
fn is_bindable_private_range(addr: Ipv4Addr) -> bool {
    let octets = addr.octets();
    let is_rfc1918 = addr.is_private(); // 10/8, 172.16/12, 192.168/16
    let is_cgnat = octets[0] == 100 && (64..=127).contains(&octets[1]);
    is_rfc1918 || is_cgnat
}

/// Pure filtering logic, deliberately separated from real interface
/// enumeration so it can be unit-tested with a fake/injected address list
/// (no real network access needed to prove the security-relevant
/// invariant: never selects `0.0.0.0` or a public/non-private address).
/// IPv6 is deliberately out of scope for this slice -- ADR-0067's own
/// examples (school LAN, Tailscale) are IPv4 in practice for this
/// deployment, and adding IPv6 would double the range/allowlist surface
/// to reason about for no currently-needed capability; every IPv6 input
/// is filtered out here rather than silently mis-handled.
///
/// Always includes loopback (`127.0.0.1`) first, regardless of what else
/// is found, followed by every distinct non-loopback address in `found`
/// that is a private-use or Tailscale CGNAT IPv4 address. A public
/// address, a link-local address, `0.0.0.0`, and any IPv6 address are all
/// excluded.
fn select_bindable_addresses(found: &[IpAddr]) -> Vec<Ipv4Addr> {
    let mut selected = vec![LOOPBACK_ADDR];
    for addr in found {
        if let IpAddr::V4(v4) = addr {
            if *v4 != LOOPBACK_ADDR && is_bindable_private_range(*v4) && !selected.contains(v4) {
                selected.push(*v4);
            }
        }
    }
    selected
}

/// Real interface enumeration via `if-addrs` (see `Cargo.toml`'s doc
/// comment for the crate choice). Never propagates an error up to
/// `maybe_spawn_listener`/startup -- an enumeration failure (e.g. a
/// transient OS-level permission issue) must degrade to loopback-only,
/// never crash app startup, matching this codebase's "sync must never
/// crash the app" discipline used elsewhere in this module.
fn enumerate_local_addresses() -> Vec<IpAddr> {
    match if_addrs::get_if_addrs() {
        Ok(interfaces) => interfaces.into_iter().map(|iface| iface.ip()).collect(),
        Err(error) => {
            log::warn!(
                "hub sync listener: interface enumeration failed, falling back to loopback only: {error}"
            );
            Vec::new()
        }
    }
}

/// A live, mutable handle to this installation's school sync-payload key,
/// shared between every listener task's `HubServerState` AND managed as
/// Tauri state so `commands::device_sync::revoke_device_sync_credential`
/// can push a freshly-rotated key into the ALREADY-RUNNING hub process --
/// not just the on-disk DPAPI file `db::rotate_sspk` overwrites.
///
/// **Fixes a real BLOCKING finding from this project's first genuinely
/// independent security review** (`docs/reviews/2026-09-07-sync-payload-encryption-review.md`):
/// before this type existed, `HubServerState.sspk` was a plain, immutable
/// `[u8; PAYLOAD_KEY_LEN]` resolved once at startup and never updated --
/// so a device revocation correctly rotated the DPAPI file and cleared
/// DB-side wraps, but the running process kept authenticating every
/// device (including the just-revoked one, which already had the OLD key
/// cached) against the stale in-memory key for the rest of that process's
/// lifetime, directly defeating ADR-0069's "nothing encrypted under the
/// new SSPK is ever reachable by a revoked device" guarantee.
///
/// Always managed (via `app.manage`) regardless of whether the hub
/// listener ever actually spawns -- `None` when this installation has
/// never enrolled a device for any school (`should_listen` false), `Some`
/// once `maybe_spawn_listener` resolves and spawns. A revocation command
/// on an installation whose listener never spawned this session simply
/// updates a cell nothing is currently reading from, which is harmless.
pub struct SspkCell(pub RwLock<Option<[u8; PAYLOAD_KEY_LEN]>>);

pub type SharedSspk = Arc<SspkCell>;

#[derive(Clone)]
pub struct HubServerState {
    pub db: Arc<Mutex<Connection>>,
    /// See `SspkCell`'s own doc comment for why this is a live, shared
    /// handle rather than a plain array captured once at startup.
    pub sspk: SharedSspk,
}

/// Builds the router. `state` is cloned into each request handler by
/// axum (cheap -- it's just the `Arc`), never a fresh connection per
/// request; every handler locks the same shared `Connection` exactly
/// like `commands::lock_db` already does for the Tauri IPC side.
pub fn router(state: HubServerState) -> Router {
    Router::new()
        .route("/sync/push", post(push_handler))
        .route("/sync/pull", get(pull_handler))
        .route("/sync/payload-key-wrap", get(payload_key_wrap_handler))
        .with_state(state)
}

/// True if ANY school known to this installation has at least one
/// active device sync credential -- i.e. this installation has actually
/// completed the enrollment ceremony for some school at least once
/// (ADR-0067 D4: enrollment happens on the hub). A plain, never-enrolled
/// installation stays completely unaffected: no listener starts, the
/// same "sync stays opt-in by enrollment" decision already made for the
/// client-side write path (see `commands::learner`'s own doc comment for
/// why that gate exists) applied symmetrically to the server side.
pub fn should_listen(conn: &Connection) -> AppResult<bool> {
    for known_school in school::list_all(conn)? {
        if device_credential::has_active_for_school(conn, &known_school.id)? {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Spawns one listener task bound to `bind_addr`, reusing the `tokio`
/// runtime Tauri already runs internally (`tauri::async_runtime::spawn`,
/// not a second/parallel runtime). A bind failure (e.g. the port is
/// already in use, perhaps by a second launch of this same app, or an
/// address that changed after enumeration ran) is logged, never a panic
/// -- a local-first desktop app must keep working even when sync is
/// unavailable, and a failure on one interface must never take down the
/// others (each address gets its own independent task).
pub fn spawn(db: Arc<Mutex<Connection>>, sspk: SharedSspk, bind_addr: SocketAddr) {
    let app_router = router(HubServerState { db, sspk });
    tauri::async_runtime::spawn(async move {
        match tokio::net::TcpListener::bind(bind_addr).await {
            Ok(listener) => {
                log::info!("hub sync listener bound to {bind_addr}");
                if let Err(error) = axum::serve(listener, app_router).await {
                    log::error!("hub sync listener stopped: {error}");
                }
            }
            Err(error) => {
                log::error!("hub sync listener failed to bind {bind_addr}: {error}");
            }
        }
    });
}

/// Spawns one independent listener task per address `select_bindable_addresses`
/// selected, all sharing the same underlying `db` connection (see `spawn`'s
/// own doc comment for why one connection is safe here). Each address binds
/// -- and can fail to bind -- completely independently: a taken port or a
/// changed address on one interface never prevents the others (including
/// loopback) from serving.
pub fn spawn_all(db: Arc<Mutex<Connection>>, sspk: SharedSspk, addresses: &[Ipv4Addr]) {
    for &addr in addresses {
        spawn(
            Arc::clone(&db),
            Arc::clone(&sspk),
            SocketAddr::new(IpAddr::V4(addr), HUB_PORT),
        );
    }
}

/// Starts the hub listener if (and only if) `should_listen` says this
/// installation has ever enrolled a device for some school -- otherwise
/// a no-op, so a plain non-syncing installation's startup is completely
/// unaffected. Opens a SEPARATE `Connection` to the same encrypted
/// database file specifically for the listener's own `'static`+`Clone`
/// state (axum's `State` extractor requires this; Tauri's own managed
/// `tauri::State<'_, Mutex<Connection>>` can't satisfy it, since its
/// lifetime is tied to the invoking command). Safe: `db::open` already
/// enables WAL mode specifically so multiple connections to the same
/// SQLite file coexist correctly -- this is not a new concurrency risk,
/// it is the documented reason WAL mode was already chosen.
/// `sspk_cell` is the same handle already `app.manage`d by `lib.rs`
/// before this function runs -- see `SspkCell`'s own doc comment for why
/// the listener and the revoke command must share the identical `Arc`
/// rather than each holding their own copy of the key.
pub fn maybe_spawn_listener(app: &tauri::AppHandle, sspk_cell: SharedSspk) -> AppResult<()> {
    let conn = crate::db::open_app_db(app)?;
    if !should_listen(&conn)? {
        return Ok(());
    }
    let sspk = crate::db::load_or_mint_sspk(app)?;
    *sspk_cell
        .0
        .write()
        .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(sspk);
    let found = enumerate_local_addresses();
    let addresses = select_bindable_addresses(&found);
    spawn_all(Arc::new(Mutex::new(conn)), sspk_cell, &addresses);
    Ok(())
}

/// A request-level error, deliberately NOT `AppError` itself -- an
/// internal database error string must never cross this network
/// boundary (the same discipline `AppError::Import`/`FormGeneration`
/// already apply to the Tauri IPC boundary: "the message is a fixed,
/// generic category string ... never the underlying error text").
enum ApiError {
    Unauthorized,
    BadRequest(&'static str),
    Internal,
}

impl From<AppError> for ApiError {
    fn from(error: AppError) -> Self {
        match error {
            AppError::Unauthorized => ApiError::Unauthorized,
            other => {
                log::error!("hub server request failed: {other}");
                ApiError::Internal
            }
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal error"),
        };
        (status, message).into_response()
    }
}

/// Extracts and verifies the device credential from request headers.
/// `Ok` carries the `VerifiedDevice` a handler needs to call
/// `sync_hub::push_batch`/`pull_since`; every failure path (missing
/// Snapshots the live `SharedSspk` cell into a plain byte array for one
/// request. `None` should not happen for a handler reachable at all
/// (the listener is only ever spawned once `maybe_spawn_listener` has
/// already set this cell to `Some` -- see `SspkCell`'s own doc comment),
/// so this surfaces as `Internal` rather than a bespoke error variant a
/// caller could mistake for a normal auth failure.
fn current_sspk(state: &HubServerState) -> Result<[u8; PAYLOAD_KEY_LEN], ApiError> {
    state
        .sspk
        .0
        .read()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .ok_or(ApiError::Internal)
}

/// header, unknown credential, revoked credential, wrong secret) is
/// collapsed into the same `ApiError::Unauthorized` -- a caller must
/// never be able to distinguish "no such credential" from "wrong secret"
/// from a response, the same enumeration-safety
/// `device_credential::verify` itself already guarantees one layer down.
fn authenticate(
    conn: &Connection,
    headers: &HeaderMap,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> Result<device_credential::VerifiedDevice, ApiError> {
    let credential_id = headers
        .get(CREDENTIAL_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    let secret_hex = headers
        .get(DEVICE_SECRET_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;

    let verified = device_credential::verify(conn, credential_id, secret_hex)?
        .ok_or(ApiError::Unauthorized)?;

    // ADR-0069 addendum: this is the lazy re-wrap propagation point for
    // key rotation on revocation. A device that reaches this line has
    // just proved (via `verify`, above) it holds a currently-ACTIVE
    // credential's real secret -- exactly the trust `ensure_wrapped_for_
    // credential` needs to safely (re)establish its wrap of the current
    // SSPK, whether this is its very first contact (unchanged from
    // before this addendum) or its first contact since another device in
    // the school was revoked (`rotate_for_school` already cleared its
    // stale wrap of the OLD key). A revoked device can never reach this
    // line -- `verify` already rejected it above -- so it can never
    // recover a wrap of a key minted after its own revocation. A failure
    // here is intentionally swallowed rather than surfaced as a request
    // error: it never blocks the push/pull this request actually asked
    // for, and the same lazy recovery is retried on the device's very
    // next authenticated request.
    // `secret_hex` already decoded successfully inside `verify` above (it
    // returns `None` on malformed hex, which would have already produced
    // `Unauthorized` before this line) -- re-decoding here rather than
    // threading the bytes back out of `verify` keeps that function's
    // signature unchanged, and this `Some` is therefore unreachable to be
    // `None` in practice. Still handled explicitly (never a silent
    // `unwrap_or_default()` empty-secret fallback) so a future change to
    // `verify`'s hex-validation cannot quietly turn this into a
    // wrong-key wrap attempt.
    let Some(device_secret) = device_credential::hex_decode(secret_hex) else {
        log::warn!(
            "verified credential's secret failed to re-decode as hex; skipping lazy re-wrap"
        );
        return Ok(verified);
    };
    if let Err(error) = sync_payload_key::ensure_wrapped_for_credential(
        conn,
        &verified.school_id,
        credential_id,
        &device_secret,
        sspk,
    ) {
        log::warn!("could not lazily re-wrap sync payload key for a device: {error}");
    }

    Ok(verified)
}

#[derive(Debug, Deserialize)]
struct PushRequestBody {
    changes: Vec<PendingChange>,
}

#[derive(Debug, Serialize)]
struct PushResponseBody {
    outcomes: Vec<sync_hub::PushOutcome>,
}

async fn push_handler(
    State(state): State<HubServerState>,
    headers: HeaderMap,
    Json(body): Json<PushRequestBody>,
) -> Result<Json<PushResponseBody>, ApiError> {
    let conn = state
        .db
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let sspk = current_sspk(&state)?;
    let verified = authenticate(&conn, &headers, &sspk)?;

    if body.changes.len() > sync_hub::MAX_PUSH_BATCH {
        return Err(ApiError::BadRequest("push batch too large"));
    }

    let outcomes = sync_hub::push_batch(&conn, &verified, &body.changes)?;
    Ok(Json(PushResponseBody { outcomes }))
}

#[derive(Debug, Deserialize)]
struct PullQuery {
    after: u64,
    limit: u16,
}

/// `Deserialize` is for this module's own tests (round-tripping the
/// response body); the real remote caller never constructs one.
#[derive(Debug, Serialize, Deserialize)]
struct PullResponseBody {
    changes: Vec<sync_hub::AcceptedChange>,
}

async fn pull_handler(
    State(state): State<HubServerState>,
    headers: HeaderMap,
    Query(query): Query<PullQuery>,
) -> Result<Json<PullResponseBody>, ApiError> {
    let conn = state
        .db
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let sspk = current_sspk(&state)?;
    let verified = authenticate(&conn, &headers, &sspk)?;

    let changes = sync_hub::pull_since(
        &conn,
        &verified.school_id,
        SyncCursor(query.after),
        query.limit,
    )?;
    Ok(Json(PullResponseBody { changes }))
}

/// `Deserialize` is for `sync_client`'s own decoding of this response, and
/// for this module's tests -- the real handler only ever serializes it.
#[derive(Debug, Serialize, Deserialize)]
struct PayloadKeyWrapResponseBody {
    wrapped_key: Vec<u8>,
    nonce: Vec<u8>,
}

/// ADR-0069 addendum: hands the authenticated device back its OWN wrap of
/// the school's current sync-payload key, never the plaintext key itself
/// -- see `sync_payload_key::StoredWrap`'s own doc comment for why the hub
/// can only ever serve the ciphertext form. `authenticate` above already
/// guarantees a wrap exists for any device that reaches this handler (its
/// lazy `ensure_wrapped_for_credential` call runs on every successful
/// authentication, including this one), so a missing row here would mean
/// that invariant broke, not a legitimate "not found" -- surfaced as
/// `Internal` rather than silently returning an empty/default payload a
/// caller could mistake for a real (but empty) wrap.
async fn payload_key_wrap_handler(
    State(state): State<HubServerState>,
    headers: HeaderMap,
) -> Result<Json<PayloadKeyWrapResponseBody>, ApiError> {
    let conn = state
        .db
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let sspk = current_sspk(&state)?;
    let verified = authenticate(&conn, &headers, &sspk)?;

    let wrap = sync_payload_key::get_wrap_for_credential(&conn, &verified.credential_id)?
        .ok_or(ApiError::Internal)?;
    Ok(Json(PayloadKeyWrapResponseBody {
        wrapped_key: wrap.wrapped_key,
        nonce: wrap.nonce,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{device_credential, school, user};
    use crate::sync::{ChangeOperation, EntityKind};
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;
    use uuid::Uuid;

    struct TestFixture {
        state: HubServerState,
        user_id: String,
        device_id: Uuid,
        credential: device_credential::EnrolledCredential,
    }

    /// `device_credential::enroll` accepts any opaque `device_id: &str`,
    /// but `sync::PendingChange.device_id` is typed `Uuid` (matching
    /// `repository::device_identity`'s real UUID device ids) -- so a
    /// fixture that will build `PendingChange`s must enroll with a
    /// UUID-shaped device id too, not an arbitrary label like other
    /// modules' tests use in isolation.
    /// Wraps a plain key in the same `SharedSspk` shape production code
    /// uses, for tests that only care about a fixed, never-rotated key.
    fn shared_sspk(value: [u8; PAYLOAD_KEY_LEN]) -> SharedSspk {
        Arc::new(SspkCell(RwLock::new(Some(value))))
    }

    fn test_fixture() -> TestFixture {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let user = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let device_id = Uuid::now_v7();
        let credential =
            device_credential::enroll(&conn, &school.id, &user.id, &device_id.to_string(), None)
                .unwrap();
        TestFixture {
            state: HubServerState {
                db: Arc::new(Mutex::new(conn)),
                sspk: shared_sspk(crate::crypto::payload_key::generate_payload_key()),
            },
            user_id: user.id,
            device_id,
            credential,
        }
    }

    fn push_request(credential_id: &str, secret_hex: &str, body: &str) -> Request<Body> {
        Request::builder()
            .method("POST")
            .uri("/sync/push")
            .header("content-type", "application/json")
            .header(CREDENTIAL_ID_HEADER, credential_id)
            .header(DEVICE_SECRET_HEADER, secret_hex)
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    #[test]
    fn select_bindable_addresses_always_includes_loopback_even_with_no_interfaces() {
        let selected = select_bindable_addresses(&[]);
        assert_eq!(selected, vec![LOOPBACK_ADDR]);
    }

    #[test]
    fn select_bindable_addresses_includes_rfc1918_ranges() {
        let found = [
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 5)),
            IpAddr::V4(Ipv4Addr::new(172, 16, 4, 9)),
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)),
        ];
        let selected = select_bindable_addresses(&found);
        assert!(selected.contains(&LOOPBACK_ADDR));
        assert!(selected.contains(&Ipv4Addr::new(10, 0, 0, 5)));
        assert!(selected.contains(&Ipv4Addr::new(172, 16, 4, 9)));
        assert!(selected.contains(&Ipv4Addr::new(192, 168, 1, 20)));
        assert_eq!(selected.len(), 4);
    }

    #[test]
    fn select_bindable_addresses_includes_tailscale_cgnat_range() {
        let found = [IpAddr::V4(Ipv4Addr::new(100, 90, 1, 2))];
        let selected = select_bindable_addresses(&found);
        assert!(selected.contains(&Ipv4Addr::new(100, 90, 1, 2)));
    }

    #[test]
    fn select_bindable_addresses_excludes_cgnat_lookalikes_outside_the_real_range() {
        // 100.63.x.x and 100.128.x.x are outside RFC 6598's 100.64.0.0/10.
        let found = [
            IpAddr::V4(Ipv4Addr::new(100, 63, 1, 2)),
            IpAddr::V4(Ipv4Addr::new(100, 128, 1, 2)),
        ];
        let selected = select_bindable_addresses(&found);
        assert_eq!(selected, vec![LOOPBACK_ADDR]);
    }

    #[test]
    fn select_bindable_addresses_never_selects_a_public_address() {
        let found = [IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8))];
        let selected = select_bindable_addresses(&found);
        assert_eq!(selected, vec![LOOPBACK_ADDR]);
        assert!(!selected.contains(&Ipv4Addr::new(8, 8, 8, 8)));
    }

    #[test]
    fn select_bindable_addresses_never_selects_unspecified_or_link_local() {
        let found = [
            IpAddr::V4(Ipv4Addr::new(0, 0, 0, 0)),
            IpAddr::V4(Ipv4Addr::new(169, 254, 1, 1)),
        ];
        let selected = select_bindable_addresses(&found);
        assert_eq!(selected, vec![LOOPBACK_ADDR]);
    }

    #[test]
    fn select_bindable_addresses_excludes_ipv6() {
        let found = [IpAddr::V6(std::net::Ipv6Addr::new(
            0xfd00, 0, 0, 0, 0, 0, 0, 1,
        ))];
        let selected = select_bindable_addresses(&found);
        assert_eq!(selected, vec![LOOPBACK_ADDR]);
    }

    #[test]
    fn select_bindable_addresses_deduplicates_and_never_returns_zero_addr() {
        let found = [
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)),
            IpAddr::V4(Ipv4Addr::new(192, 168, 1, 20)),
            IpAddr::V4(LOOPBACK_ADDR),
        ];
        let selected = select_bindable_addresses(&found);
        assert_eq!(
            selected,
            vec![LOOPBACK_ADDR, Ipv4Addr::new(192, 168, 1, 20)]
        );
        assert!(!selected.contains(&Ipv4Addr::new(0, 0, 0, 0)));
    }

    #[test]
    fn should_listen_is_false_for_a_fresh_never_enrolled_installation() {
        let conn = crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap();
        school::create(&conn, "Rizal Elementary").unwrap();

        assert!(!should_listen(&conn).unwrap());
    }

    #[test]
    fn should_listen_is_true_once_any_school_has_an_active_credential() {
        let fixture = test_fixture();
        let conn = fixture.state.db.lock().unwrap();

        assert!(should_listen(&conn).unwrap());
    }

    #[test]
    fn should_listen_is_false_again_once_the_only_credential_is_revoked() {
        let fixture = test_fixture();
        {
            let conn = fixture.state.db.lock().unwrap();
            let credential_school = device_credential::owner(&conn, &fixture.credential.id)
                .unwrap()
                .unwrap()
                .0;
            device_credential::revoke(&conn, &credential_school, &fixture.credential.id).unwrap();
        }

        let conn = fixture.state.db.lock().unwrap();
        assert!(!should_listen(&conn).unwrap());
    }

    #[tokio::test]
    async fn push_without_credential_headers_is_unauthorized() {
        let fixture = test_fixture();
        let app = router(fixture.state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/sync/push")
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"changes":[]}"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn pull_without_credential_headers_is_unauthorized() {
        let fixture = test_fixture();
        let app = router(fixture.state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/pull?after=0&limit=10")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn push_with_a_wrong_secret_is_unauthorized() {
        let fixture = test_fixture();
        let app = router(fixture.state);

        let response = app
            .oneshot(push_request(
                &fixture.credential.id,
                &"00".repeat(32),
                r#"{"changes":[]}"#,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn a_valid_push_is_accepted_and_the_change_is_retrievable_via_pull() {
        let fixture = test_fixture();
        let entity_id = Uuid::now_v7();
        let change = PendingChange {
            change_id: Uuid::now_v7(),
            device_id: fixture.device_id,
            actor_user_id: Uuid::parse_str(&fixture.user_id).unwrap(),
            entity_kind: EntityKind::Learner,
            entity_id,
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![9, 9, 9],
        };
        let body = serde_json::json!({ "changes": [change] }).to_string();
        let app = router(fixture.state.clone());

        let push_response = app
            .clone()
            .oneshot(push_request(
                &fixture.credential.id,
                &fixture.credential.secret_hex,
                &body,
            ))
            .await
            .unwrap();
        assert_eq!(push_response.status(), StatusCode::OK);

        let pull_response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/pull?after=0&limit=10")
                    .header(CREDENTIAL_ID_HEADER, &fixture.credential.id)
                    .header(DEVICE_SECRET_HEADER, &fixture.credential.secret_hex)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(pull_response.status(), StatusCode::OK);

        let bytes = axum::body::to_bytes(pull_response.into_body(), usize::MAX)
            .await
            .unwrap();
        let parsed: PullResponseBody = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed.changes.len(), 1);
        assert_eq!(parsed.changes[0].entity_id, entity_id);
        assert_eq!(parsed.changes[0].version, 1);
    }

    #[tokio::test]
    async fn a_push_batch_over_the_limit_is_a_bad_request() {
        let fixture = test_fixture();
        let changes: Vec<PendingChange> = (0..sync_hub::MAX_PUSH_BATCH + 1)
            .map(|_| PendingChange {
                change_id: Uuid::now_v7(),
                device_id: fixture.device_id,
                actor_user_id: Uuid::parse_str(&fixture.user_id).unwrap(),
                entity_kind: EntityKind::Learner,
                entity_id: Uuid::now_v7(),
                base_version: 0,
                operation: ChangeOperation::Upsert,
                encrypted_payload: vec![1],
            })
            .collect();
        let body = serde_json::json!({ "changes": changes }).to_string();
        let app = router(fixture.state);

        let response = app
            .oneshot(push_request(
                &fixture.credential.id,
                &fixture.credential.secret_hex,
                &body,
            ))
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    /// ADR-0069 addendum: proves the lazy re-wrap propagation actually
    /// fires over a real authenticated HTTP request, not just at the
    /// repository layer in isolation. An unrelated device's stored wrap
    /// (simulating "already active before some OTHER device got revoked
    /// and rotation cleared every wrap") is gone before the request, and
    /// present again -- of the CURRENT `state.sspk` -- immediately after
    /// one successful authenticated pull.
    #[tokio::test]
    async fn a_successful_authenticated_request_lazily_re_establishes_this_devices_wrap() {
        let fixture = test_fixture();
        let secret =
            crate::repository::device_credential::hex_decode(&fixture.credential.secret_hex)
                .unwrap();
        assert_eq!(
            sync_payload_key::unwrap_for_credential(
                &fixture.state.db.lock().unwrap(),
                &fixture.credential.id,
                &secret
            )
            .unwrap(),
            None,
            "no wrap exists yet -- test_fixture never calls the enrollment ceremony's wrap step"
        );
        let app = router(fixture.state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/pull?after=0&limit=10")
                    .header(CREDENTIAL_ID_HEADER, &fixture.credential.id)
                    .header(DEVICE_SECRET_HEADER, &fixture.credential.secret_hex)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let recovered = sync_payload_key::unwrap_for_credential(
            &fixture.state.db.lock().unwrap(),
            &fixture.credential.id,
            &secret,
        )
        .unwrap()
        .expect("a wrap must now exist, lazily re-established by the authenticated request");
        assert_eq!(recovered, fixture.state.sspk.0.read().unwrap().unwrap());
    }

    /// A revoked credential must never reach the lazy re-wrap path at all
    /// -- `authenticate` returns `Unauthorized` before `ensure_wrapped_for_
    /// credential` is even called, so a revoked device gains no wrap of
    /// the current (or any future) SSPK by attempting a request.
    #[tokio::test]
    async fn a_revoked_credential_never_gets_a_lazy_rewrap() {
        let fixture = test_fixture();
        {
            let conn = fixture.state.db.lock().unwrap();
            device_credential::revoke(
                &conn,
                &school::list_all(&conn).unwrap()[0].id,
                &fixture.credential.id,
            )
            .unwrap();
        }
        let secret =
            crate::repository::device_credential::hex_decode(&fixture.credential.secret_hex)
                .unwrap();
        let app = router(fixture.state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/pull?after=0&limit=10")
                    .header(CREDENTIAL_ID_HEADER, &fixture.credential.id)
                    .header(DEVICE_SECRET_HEADER, &fixture.credential.secret_hex)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            sync_payload_key::unwrap_for_credential(
                &fixture.state.db.lock().unwrap(),
                &fixture.credential.id,
                &secret
            )
            .unwrap(),
            None,
            "a revoked credential's failed request must never establish a wrap"
        );
    }

    /// ADR-0069 addendum: the new payload-key-wrap endpoint hands a device
    /// back exactly its own wrap of the CURRENT `state.sspk` -- proven by
    /// unwrapping the response with the device's own secret and comparing
    /// to `state.sspk` directly, never to a value the response itself
    /// asserted.
    #[tokio::test]
    async fn payload_key_wrap_returns_this_devices_own_wrap_of_the_current_sspk() {
        let fixture = test_fixture();
        let secret =
            crate::repository::device_credential::hex_decode(&fixture.credential.secret_hex)
                .unwrap();
        let app = router(fixture.state.clone());

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/payload-key-wrap")
                    .header(CREDENTIAL_ID_HEADER, &fixture.credential.id)
                    .header(DEVICE_SECRET_HEADER, &fixture.credential.secret_hex)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let parsed: PayloadKeyWrapResponseBody = serde_json::from_slice(&bytes).unwrap();

        let wrap_key = crate::crypto::payload_key::derive_wrap_key(&secret);
        let recovered = crate::crypto::payload_key::unwrap_payload_key(
            &wrap_key,
            &parsed.nonce,
            &parsed.wrapped_key,
        )
        .unwrap();
        assert_eq!(recovered, fixture.state.sspk.0.read().unwrap().unwrap());
    }

    /// The actual regression test for this project's first genuinely
    /// independent security review's BLOCKING finding
    /// (`docs/reviews/2026-09-07-sync-payload-encryption-review.md`):
    /// before `SharedSspk` existed, `HubServerState.sspk` was a plain
    /// array baked in once at startup, so nothing could ever propagate a
    /// rotated key into an already-running listener -- a revoked
    /// device's cached OLD key kept working against every future request
    /// for the rest of that process's lifetime, directly contradicting
    /// ADR-0069's "nothing encrypted under the new SSPK is ever reachable
    /// by a revoked device" guarantee. Proves the fix end to end over
    /// real HTTP: mutate the SAME shared cell the router's already-built
    /// `HubServerState` holds (exactly what
    /// `commands::device_sync::revoke_device_sync_credential`'s closure
    /// does via `db::rotate_sspk` + a cell write), WITHOUT rebuilding the
    /// router, then confirm a fresh `/sync/payload-key-wrap` request
    /// against that same running router now unwraps to the NEW key.
    #[tokio::test]
    async fn payload_key_wrap_reflects_a_key_rotated_into_the_live_shared_cell_without_restarting_the_router(
    ) {
        let fixture = test_fixture();
        let secret =
            crate::repository::device_credential::hex_decode(&fixture.credential.secret_hex)
                .unwrap();
        let app = router(fixture.state.clone());

        let new_key = crate::crypto::payload_key::generate_payload_key();
        assert_ne!(
            new_key,
            fixture.state.sspk.0.read().unwrap().unwrap(),
            "test setup must pick a genuinely different key"
        );
        *fixture.state.sspk.0.write().unwrap() = Some(new_key);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/payload-key-wrap")
                    .header(CREDENTIAL_ID_HEADER, &fixture.credential.id)
                    .header(DEVICE_SECRET_HEADER, &fixture.credential.secret_hex)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        let parsed: PayloadKeyWrapResponseBody = serde_json::from_slice(&bytes).unwrap();
        let wrap_key = crate::crypto::payload_key::derive_wrap_key(&secret);
        let recovered = crate::crypto::payload_key::unwrap_payload_key(
            &wrap_key,
            &parsed.nonce,
            &parsed.wrapped_key,
        )
        .unwrap();
        assert_eq!(
            recovered, new_key,
            "the live listener must serve the NEWLY rotated key, not the one it started with"
        );
    }

    #[tokio::test]
    async fn payload_key_wrap_without_credential_headers_is_unauthorized() {
        let fixture = test_fixture();
        let app = router(fixture.state);

        let response = app
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/sync/payload-key-wrap")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }
}
