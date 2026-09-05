//! ADR-0067 network listener: the hub's authenticated push/pull HTTP API.
//!
//! This module builds and tests an `axum::Router`; it deliberately does
//! NOT bind a real TCP socket or decide which interface to listen on --
//! that is a separate, Tauri-startup-level concern (resolving the LAN/
//! Tailscale interface address, never `0.0.0.0`, per ADR-0067's own
//! "School-laptop operations gate": "the host listener binds to the
//! Tailscale / LAN interface only, never `0.0.0.0`"). Building the
//! tested router first, wiring it to actual app startup as a later
//! increment, matches this codebase's established zero-UI-first
//! precedent (RBAC, Curriculum, `sync_hub`, `sync_payload_key` all
//! shipped their first increment with full test coverage and no live
//! caller).
//!
//! Every device identifies itself on every request via two custom
//! headers (`x-likha-credential-id`, `x-likha-device-secret`) -- never a
//! query parameter or URL segment, so a credential secret never ends up
//! in a proxy/access log line the way a query string can. Verified
//! through `repository::device_credential::verify`, the same
//! enumeration-safe, constant-time check already used everywhere else in
//! this codebase; an unknown id, a revoked credential, and a wrong
//! secret are all indistinguishable `Unauthorized` responses here too.

use std::sync::{Arc, Mutex};

use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Json, Response};
use axum::routing::{get, post};
use axum::Router;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::repository::{device_credential, sync_hub};
use crate::sync::{PendingChange, SyncCursor};

const CREDENTIAL_ID_HEADER: &str = "x-likha-credential-id";
const DEVICE_SECRET_HEADER: &str = "x-likha-device-secret";

#[derive(Clone)]
pub struct HubServerState {
    pub db: Arc<Mutex<Connection>>,
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
) -> Result<device_credential::VerifiedDevice, ApiError> {
    let credential_id = headers
        .get(CREDENTIAL_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;
    let secret_hex = headers
        .get(DEVICE_SECRET_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ApiError::Unauthorized)?;

    device_credential::verify(conn, credential_id, secret_hex)?.ok_or(ApiError::Unauthorized)
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
    let verified = authenticate(&conn, &headers)?;

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
    let verified = authenticate(&conn, &headers)?;

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
}
