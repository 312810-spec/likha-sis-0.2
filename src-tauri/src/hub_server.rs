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
//! `maybe_spawn_listener` wires this into real Tauri app startup, but
//! **deliberately binds loopback only** (`127.0.0.1`), not a real LAN or
//! Tailscale interface -- resolving the actual bind interface (never
//! `0.0.0.0`, per ADR-0067's own "School-laptop operations gate") needs
//! either a new interface-enumeration dependency or a documented manual-
//! configuration decision, plus native Windows network verification this
//! sandboxed development environment cannot perform. Not reachable from
//! another device yet; see ADR-0067's network-listener addendum.

use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

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

/// Loopback-only until LAN/Tailscale interface resolution is implemented
/// and verified on real hardware -- see this module's own doc comment.
const LOOPBACK_BIND_ADDR: &str = "127.0.0.1:7878";

#[derive(Clone)]
pub struct HubServerState {
    pub db: Arc<Mutex<Connection>>,
    /// This installation's school sync-payload key (ADR-0069), resolved
    /// once at listener startup via `db::load_or_mint_sspk` -- never
    /// re-resolved per request. Used only to lazily re-establish a
    /// device's wrap (`ensure_wrapped_for_credential`) on every
    /// successfully authenticated request, which is what actually
    /// propagates a post-revocation rotation (`sync_payload_key::
    /// rotate_for_school`) to each still-active device without a new
    /// enrollment ceremony.
    pub sspk: [u8; PAYLOAD_KEY_LEN],
}

/// Builds the router. `state` is cloned into each request handler by
/// axum (cheap -- it's just the `Arc`), never a fresh connection per
/// request; every handler locks the same shared `Connection` exactly
/// like `commands::lock_db` already does for the Tauri IPC side.
pub fn router(state: HubServerState) -> Router {
    Router::new()
        .route("/sync/push", post(push_handler))
        .route("/sync/pull", get(pull_handler))
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

/// Spawns the listener bound to `bind_addr`, reusing the `tokio` runtime
/// Tauri already runs internally (`tauri::async_runtime::spawn`, not a
/// second/parallel runtime). A bind failure (e.g. the port is already in
/// use, perhaps by a second launch of this same app) is logged, never a
/// panic -- a local-first desktop app must keep working even when sync
/// is unavailable.
pub fn spawn(db: Arc<Mutex<Connection>>, sspk: [u8; PAYLOAD_KEY_LEN], bind_addr: SocketAddr) {
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
pub fn maybe_spawn_listener(app: &tauri::AppHandle) -> AppResult<()> {
    let conn = crate::db::open_app_db(app)?;
    if !should_listen(&conn)? {
        return Ok(());
    }
    let sspk = crate::db::load_or_mint_sspk(app)?;
    let bind_addr: SocketAddr = LOOPBACK_BIND_ADDR
        .parse()
        .expect("LOOPBACK_BIND_ADDR is a hardcoded valid address");
    spawn(Arc::new(Mutex::new(conn)), sspk, bind_addr);
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
    let verified = authenticate(&conn, &headers, &state.sspk)?;

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
    let verified = authenticate(&conn, &headers, &state.sspk)?;

    let changes = sync_hub::pull_since(
        &conn,
        &verified.school_id,
        SyncCursor(query.after),
        query.limit,
    )?;
    Ok(Json(PullResponseBody { changes }))
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
                sspk: crate::crypto::payload_key::generate_payload_key(),
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
        assert_eq!(recovered, fixture.state.sspk);
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
}
