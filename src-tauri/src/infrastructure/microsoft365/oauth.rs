//! ADR-0088: Microsoft identity platform OAuth 2.0 authorization-code
//! flow with PKCE, for the Official School Repository integration.
//!
//! Endpoints and flow details below were verified via Microsoft Learn
//! immediately before writing this module (`learn.microsoft.com/entra/
//! identity-platform/v2-oauth2-auth-code-flow`, `.../reply-url`) rather
//! than recalled from training data, because this is security-sensitive:
//!
//! - Authorization endpoint: `https://login.microsoftonline.com/{tenant}/
//!   oauth2/v2.0/authorize`
//! - Token endpoint: `https://login.microsoftonline.com/{tenant}/
//!   oauth2/v2.0/token`
//! - PKCE: `code_challenge = BASE64URL(SHA256(code_verifier))`,
//!   `code_challenge_method=S256` (mandatory where possible).
//! - `offline_access` must be requested explicitly to receive a refresh
//!   token at all -- without it, only a short-lived access token comes
//!   back and this integration could never stay connected between app
//!   launches.
//! - Native/desktop apps use a loopback redirect URI
//!   (`http://127.0.0.1:<port>/...`); Microsoft's redirect-URI matching
//!   treats the port as insignificant for loopback addresses (RFC 8252).
//!   Only the authorization-URL/token-exchange halves live here -- the
//!   actual local HTTP listener that captures the redirect is
//!   deliberately NOT built in this batch (see ADR-0088's "Not yet
//!   built").
//!
//! No MSAL crate: Microsoft publishes no Rust MSAL (absent from its own
//! `msal-overview` platform-support list), and the community
//! alternatives found (`msal-rs`, `msal`) are unmaintained/stale -- see
//! ADR-0088. This hand-rolls the exchange against `reqwest`, already an
//! existing dependency (`sync_client.rs`, `hub_server.rs`); zero new
//! crates added.
//!
//! Every HTTP call here goes through the `TokenHttpClient` trait so
//! these tests can prove request shape and error handling with a fake --
//! they prove this client's OWN logic, never a live round trip against a
//! real Microsoft tenant, which remains genuinely unverified until a
//! real Azure AD app registration exists (see ADR-0088).

use std::time::Duration;

use serde::Deserialize;
use sha2::{Digest, Sha256};

const IDENTITY_PLATFORM_BASE: &str = "https://login.microsoftonline.com";
const AUTHORIZE_PATH: &str = "oauth2/v2.0/authorize";
const TOKEN_PATH: &str = "oauth2/v2.0/token";

/// Delegated scopes requested for this integration. `Sites.Selected` is
/// the least-privilege Graph permission for SharePoint access: it grants
/// this app ZERO sites by default, and a tenant admin must separately,
/// explicitly grant it access to exactly the one school-owned site (see
/// `docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`'s least-privilege
/// requirement and ADR-0088's research). `offline_access` is required to
/// receive a refresh token. Neither scope implies or requires a paid
/// Microsoft 365 add-on tier beyond whatever plan already includes
/// SharePoint -- flagged explicitly per this batch's constraints.
pub const SCOPES: &str = "offline_access openid profile Sites.Selected";

/// A PKCE verifier/challenge pair (RFC 7636). `verifier` must be kept
/// only in memory for the lifetime of one connect attempt and sent to
/// the token endpoint at code-exchange time; `challenge` is sent to the
/// authorization endpoint up front.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

/// Generates a fresh PKCE pair: a 32-byte CSPRNG verifier (encoded as
/// unpadded base64url -- 43 characters, within RFC 7636's 43-128 char
/// requirement) and its S256 challenge.
pub fn generate_pkce_pair() -> PkcePair {
    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes);
    let verifier = base64url_encode(&bytes);
    let challenge = base64url_encode(&Sha256::digest(verifier.as_bytes()));
    PkcePair {
        verifier,
        challenge,
    }
}

/// Generates a fresh random `state` value (CSRF protection for the
/// authorization redirect) -- same shape as a PKCE verifier, but a
/// logically distinct value never reused as one.
pub fn generate_state() -> String {
    let mut bytes = [0u8; 16];
    rand::fill(&mut bytes);
    base64url_encode(&bytes)
}

/// Builds the full authorization-endpoint URL a browser should be
/// launched to. `redirect_uri` is expected to be a loopback URI this
/// caller's own local listener is bound to (not built in this batch --
/// see this module's own doc comment).
pub fn build_authorization_url(
    tenant_id: &str,
    client_id: &str,
    redirect_uri: &str,
    pkce: &PkcePair,
    state: &str,
) -> String {
    format!(
        "{base}/{tenant}/{path}?client_id={client_id}&response_type=code&redirect_uri={redirect}&response_mode=query&scope={scope}&code_challenge={challenge}&code_challenge_method=S256&state={state}",
        base = IDENTITY_PLATFORM_BASE,
        tenant = percent_encode(tenant_id),
        path = AUTHORIZE_PATH,
        client_id = percent_encode(client_id),
        redirect = percent_encode(redirect_uri),
        scope = percent_encode(SCOPES),
        challenge = percent_encode(&pkce.challenge),
        state = percent_encode(state),
    )
}

fn token_endpoint(tenant_id: &str) -> String {
    format!("{IDENTITY_PLATFORM_BASE}/{tenant_id}/{TOKEN_PATH}")
}

/// A successful token-endpoint response. `refresh_token` is `Some` as
/// long as `offline_access` was granted (the normal case for this
/// integration) -- callers should treat a `None` here as a configuration
/// problem worth surfacing, not silently proceed as if reconnection will
/// never be needed.
#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: u64,
    #[serde(default)]
    pub scope: Option<String>,
}

/// The Microsoft identity platform's own error-response shape
/// (`{"error": "...", "error_description": "..."}`) on a non-2xx token
/// response.
#[derive(Clone, Debug, Deserialize)]
struct OAuthErrorBody {
    error: String,
}

/// Every failure mode this module distinguishes. Deliberately local to
/// this module rather than folded into the crate-wide `AppError` --
/// mapping into a Tauri-command-facing error is command-layer work for a
/// later slice (see ADR-0088's "Not yet built").
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OAuthError {
    /// The HTTP request itself never got a response: offline, DNS
    /// failure, timeout, connection refused. A caller should treat this
    /// as "retry later," never as "the user must reconnect."
    Network(String),
    /// The token endpoint responded with a non-2xx status and a
    /// recognizable OAuth error code (e.g. `invalid_grant`, meaning the
    /// refresh token was revoked or expired -- the user must reconnect).
    Protocol { code: String },
    /// The response could not be parsed as either a valid token response
    /// or a valid OAuth error body -- an unexpected shape from the
    /// provider, not a network or protocol-level failure this module
    /// otherwise understands.
    UnexpectedResponse(String),
}

impl std::fmt::Display for OAuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            OAuthError::Network(msg) => write!(f, "network error contacting Microsoft: {msg}"),
            OAuthError::Protocol { code } => write!(f, "Microsoft rejected the request: {code}"),
            OAuthError::UnexpectedResponse(msg) => {
                write!(f, "unexpected response from Microsoft: {msg}")
            }
        }
    }
}

impl std::error::Error for OAuthError {}

/// A minimal HTTP response shape, deliberately not `reqwest`-specific,
/// so a test fake can produce one without a network stack.
#[derive(Clone, Debug)]
pub struct HttpFormResponse {
    pub status: u16,
    pub body: String,
}

/// Narrow seam over "POST a form and get a status+body back" -- the ONLY
/// thing this module needs from an HTTP client, and the seam every test
/// below mocks. `form` preserves insertion order so a test can assert on
/// exact request shape.
pub trait TokenHttpClient {
    fn post_form(&self, url: &str, form: &[(&str, String)]) -> Result<HttpFormResponse, String>;
}

/// Production implementation, backed by a plain blocking `reqwest`
/// client -- same "blocking client on its own thread" choice
/// `sync_client.rs` already made for this codebase's other outbound HTTP
/// loop, for the same reason: this is a simple call-and-wait exchange,
/// not code that benefits from an async runtime.
pub struct ReqwestTokenHttpClient {
    client: reqwest::blocking::Client,
}

impl Default for ReqwestTokenHttpClient {
    fn default() -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .expect("reqwest client with a fixed timeout must always build");
        Self { client }
    }
}

impl TokenHttpClient for ReqwestTokenHttpClient {
    fn post_form(&self, url: &str, form: &[(&str, String)]) -> Result<HttpFormResponse, String> {
        let response = self
            .client
            .post(url)
            .form(form)
            .send()
            .map_err(|e| e.to_string())?;
        let status = response.status().as_u16();
        let body = response.text().map_err(|e| e.to_string())?;
        Ok(HttpFormResponse { status, body })
    }
}

fn parse_token_response(
    response: Result<HttpFormResponse, String>,
) -> Result<TokenResponse, OAuthError> {
    let response = response.map_err(OAuthError::Network)?;
    if (200..300).contains(&response.status) {
        serde_json::from_str::<TokenResponse>(&response.body)
            .map_err(|e| OAuthError::UnexpectedResponse(e.to_string()))
    } else if let Ok(err_body) = serde_json::from_str::<OAuthErrorBody>(&response.body) {
        Err(OAuthError::Protocol {
            code: err_body.error,
        })
    } else {
        Err(OAuthError::UnexpectedResponse(format!(
            "status {} with unrecognized body",
            response.status
        )))
    }
}

/// Redeems an authorization code for tokens (`grant_type=authorization_code`).
/// `code_verifier` must be the SAME verifier whose challenge was sent to
/// the authorization endpoint that produced `code`.
pub fn exchange_code_for_tokens(
    http: &dyn TokenHttpClient,
    tenant_id: &str,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    code_verifier: &str,
) -> Result<TokenResponse, OAuthError> {
    let form: Vec<(&str, String)> = vec![
        ("client_id", client_id.to_string()),
        ("grant_type", "authorization_code".to_string()),
        ("code", code.to_string()),
        ("redirect_uri", redirect_uri.to_string()),
        ("code_verifier", code_verifier.to_string()),
        ("scope", SCOPES.to_string()),
    ];
    parse_token_response(http.post_form(&token_endpoint(tenant_id), &form))
}

/// Redeems a refresh token for a fresh access token
/// (`grant_type=refresh_token`). Microsoft may return a NEW refresh
/// token in the response (`refresh_token` rotation) -- callers MUST
/// persist `TokenResponse::refresh_token` when present rather than
/// assuming the old one still works, matching `token_store`'s
/// overwrite-on-rotate semantics.
pub fn refresh_access_token(
    http: &dyn TokenHttpClient,
    tenant_id: &str,
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenResponse, OAuthError> {
    let form: Vec<(&str, String)> = vec![
        ("client_id", client_id.to_string()),
        ("grant_type", "refresh_token".to_string()),
        ("refresh_token", refresh_token.to_string()),
        ("scope", SCOPES.to_string()),
    ];
    parse_token_response(http.post_form(&token_endpoint(tenant_id), &form))
}

/// Builds the exact `Authorization: Bearer <token>` header value a
/// Microsoft Graph call must send. Its own tiny function so a future
/// Graph-client module never hand-formats this string a second, possibly
/// inconsistent way.
pub fn bearer_header_value(access_token: &str) -> String {
    format!("Bearer {access_token}")
}

const BASE64URL_ALPHABET: &[u8; 64] =
    b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Unpadded base64url (RFC 4648 §5) -- hand-rolled rather than adding a
/// `base64` crate dependency for what is a handful of lines with no
/// cryptographic content of its own (the security-relevant part is the
/// SHA-256 digest already computed by the already-adopted `sha2` crate).
fn base64url_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = *chunk.get(1).unwrap_or(&0) as u32;
        let b2 = *chunk.get(2).unwrap_or(&0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(BASE64URL_ALPHABET[((n >> 18) & 0x3F) as usize] as char);
        out.push(BASE64URL_ALPHABET[((n >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            out.push(BASE64URL_ALPHABET[((n >> 6) & 0x3F) as usize] as char);
        }
        if chunk.len() > 2 {
            out.push(BASE64URL_ALPHABET[(n & 0x3F) as usize] as char);
        }
    }
    out
}

/// A minimal percent-encoder for URL query-parameter values -- covers
/// the characters that actually appear in this module's own inputs
/// (loopback redirect URIs, base64url tokens/state, GUID-shaped tenant
/// and client IDs) rather than pulling in a full `url`/`percent-encoding`
/// crate for a handful of query values this module fully controls the
/// shape of.
fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    type RecordedCall = (String, Vec<(String, String)>);

    /// Records every call it receives so a test can assert on exact
    /// request shape, and returns whatever canned response was queued.
    /// This is what "mock the HTTP client" means throughout this
    /// module's tests -- it proves THIS CLIENT's request-building and
    /// response-parsing logic, never a live Microsoft round trip.
    struct FakeHttpClient {
        responses: RefCell<Vec<Result<HttpFormResponse, String>>>,
        calls: RefCell<Vec<RecordedCall>>,
    }

    impl FakeHttpClient {
        fn queue(response: Result<HttpFormResponse, String>) -> Self {
            Self {
                responses: RefCell::new(vec![response]),
                calls: RefCell::new(Vec::new()),
            }
        }
    }

    impl TokenHttpClient for FakeHttpClient {
        fn post_form(
            &self,
            url: &str,
            form: &[(&str, String)],
        ) -> Result<HttpFormResponse, String> {
            self.calls.borrow_mut().push((
                url.to_string(),
                form.iter()
                    .map(|(k, v)| (k.to_string(), v.clone()))
                    .collect(),
            ));
            self.responses.borrow_mut().remove(0)
        }
    }

    fn ok_response(body: &str) -> Result<HttpFormResponse, String> {
        Ok(HttpFormResponse {
            status: 200,
            body: body.to_string(),
        })
    }

    // ---- PKCE ----

    #[test]
    fn generate_pkce_pair_produces_a_43_character_verifier() {
        let pair = generate_pkce_pair();
        assert_eq!(
            pair.verifier.len(),
            43,
            "32 bytes of base64url must be 43 chars, unpadded"
        );
    }

    #[test]
    fn generate_pkce_pair_challenge_is_the_sha256_of_the_verifier() {
        let pair = generate_pkce_pair();
        let expected = base64url_encode(&Sha256::digest(pair.verifier.as_bytes()));
        assert_eq!(pair.challenge, expected);
    }

    #[test]
    fn generate_pkce_pair_never_repeats_across_calls() {
        let a = generate_pkce_pair();
        let b = generate_pkce_pair();
        assert_ne!(a.verifier, b.verifier);
        assert_ne!(a.challenge, b.challenge);
    }

    #[test]
    fn base64url_encoding_matches_known_vectors() {
        assert_eq!(base64url_encode(b"f"), "Zg");
        assert_eq!(base64url_encode(b"fo"), "Zm8");
        assert_eq!(base64url_encode(b"foo"), "Zm9v");
        assert_eq!(base64url_encode(b"foob"), "Zm9vYg");
        assert_eq!(base64url_encode(b"fooba"), "Zm9vYmE");
        assert_eq!(base64url_encode(b"foobar"), "Zm9vYmFy");
    }

    // ---- Authorization URL ----

    #[test]
    fn build_authorization_url_targets_the_correct_tenant_and_endpoint() {
        let pkce = generate_pkce_pair();
        let url = build_authorization_url(
            "11111111-1111-1111-1111-111111111111",
            "client-abc",
            "http://127.0.0.1:51820/callback",
            &pkce,
            "state-xyz",
        );

        assert!(url.starts_with(
            "https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/oauth2/v2.0/authorize?"
        ));
    }

    #[test]
    fn build_authorization_url_requests_pkce_s256_and_offline_access() {
        let pkce = generate_pkce_pair();
        let url = build_authorization_url(
            "tenant",
            "client",
            "http://127.0.0.1:1/callback",
            &pkce,
            "state",
        );

        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains(&format!("code_challenge={}", pkce.challenge)));
        assert!(url.contains("scope=offline_access"));
        assert!(url.contains("Sites.Selected"));
        assert!(url.contains("response_type=code"));
    }

    #[test]
    fn build_authorization_url_percent_encodes_the_redirect_uri_and_state() {
        let pkce = generate_pkce_pair();
        let url = build_authorization_url(
            "tenant",
            "client",
            "http://127.0.0.1:51820/callback",
            &pkce,
            "state with space",
        );

        assert!(!url.contains("http://127.0.0.1:51820/callback"));
        assert!(url.contains("redirect_uri=http%3A%2F%2F127.0.0.1%3A51820%2Fcallback"));
        assert!(url.contains("state=state%20with%20space"));
    }

    // ---- Code exchange: request shape ----

    #[test]
    fn exchange_code_for_tokens_posts_the_expected_form_fields() {
        let http = FakeHttpClient::queue(ok_response(
            r#"{"access_token":"AT","refresh_token":"RT","expires_in":3600}"#,
        ));

        let result = exchange_code_for_tokens(
            &http,
            "tenant-id",
            "client-id",
            "http://127.0.0.1:1/callback",
            "auth-code",
            "verifier-value",
        );

        assert!(result.is_ok());
        let calls = http.calls.borrow();
        assert_eq!(calls.len(), 1);
        let (url, form) = &calls[0];
        assert_eq!(
            url,
            "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token"
        );
        assert!(form.contains(&("grant_type".to_string(), "authorization_code".to_string())));
        assert!(form.contains(&("code".to_string(), "auth-code".to_string())));
        assert!(form.contains(&("code_verifier".to_string(), "verifier-value".to_string())));
        assert!(form.contains(&("client_id".to_string(), "client-id".to_string())));
        assert!(form
            .iter()
            .any(|(k, v)| k == "scope" && v.contains("offline_access")));
    }

    #[test]
    fn exchange_code_for_tokens_returns_the_parsed_access_and_refresh_tokens() {
        let http = FakeHttpClient::queue(ok_response(
            r#"{"access_token":"AT123","refresh_token":"RT456","expires_in":3599}"#,
        ));

        let token =
            exchange_code_for_tokens(&http, "t", "c", "http://127.0.0.1:1/cb", "code", "verifier")
                .unwrap();

        assert_eq!(token.access_token, "AT123");
        assert_eq!(token.refresh_token.as_deref(), Some("RT456"));
        assert_eq!(token.expires_in, 3599);
    }

    #[test]
    fn exchange_code_for_tokens_tolerates_a_missing_refresh_token_field() {
        // Should never happen once offline_access is granted, but the
        // parser must not panic/hard-fail if Microsoft ever omits it.
        let http = FakeHttpClient::queue(ok_response(r#"{"access_token":"AT","expires_in":3600}"#));

        let token = exchange_code_for_tokens(&http, "t", "c", "http://127.0.0.1:1/cb", "code", "v")
            .unwrap();

        assert_eq!(token.refresh_token, None);
    }

    // ---- Refresh: request shape ----

    #[test]
    fn refresh_access_token_posts_grant_type_refresh_token_with_the_stored_token() {
        let http = FakeHttpClient::queue(ok_response(
            r#"{"access_token":"AT2","refresh_token":"RT2","expires_in":3600}"#,
        ));

        let result = refresh_access_token(&http, "tenant-id", "client-id", "old-refresh-token");

        assert!(result.is_ok());
        let calls = http.calls.borrow();
        let (url, form) = &calls[0];
        assert_eq!(
            url,
            "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token"
        );
        assert!(form.contains(&("grant_type".to_string(), "refresh_token".to_string())));
        assert!(form.contains(&("refresh_token".to_string(), "old-refresh-token".to_string())));
    }

    #[test]
    fn refresh_access_token_surfaces_a_rotated_refresh_token_for_the_caller_to_persist() {
        let http = FakeHttpClient::queue(ok_response(
            r#"{"access_token":"AT2","refresh_token":"BRAND-NEW-RT","expires_in":3600}"#,
        ));

        let token = refresh_access_token(&http, "t", "c", "old-rt").unwrap();

        assert_eq!(token.refresh_token.as_deref(), Some("BRAND-NEW-RT"));
    }

    // ---- Error handling ----

    #[test]
    fn a_network_failure_never_the_transport_layer_is_reported_as_network_not_protocol() {
        let http = FakeHttpClient::queue(Err("connection refused".to_string()));

        let result = refresh_access_token(&http, "t", "c", "rt");

        assert_eq!(
            result,
            Err(OAuthError::Network("connection refused".to_string()))
        );
    }

    #[test]
    fn invalid_grant_is_reported_as_a_protocol_error_not_a_network_error() {
        let http = FakeHttpClient::queue(Ok(HttpFormResponse {
            status: 400,
            body:
                r#"{"error":"invalid_grant","error_description":"The refresh token has expired."}"#
                    .to_string(),
        }));

        let result = refresh_access_token(&http, "t", "c", "expired-rt");

        assert_eq!(
            result,
            Err(OAuthError::Protocol {
                code: "invalid_grant".to_string()
            })
        );
    }

    #[test]
    fn an_unrecognized_error_body_is_reported_as_unexpected_response_not_swallowed() {
        let http = FakeHttpClient::queue(Ok(HttpFormResponse {
            status: 500,
            body: "<html>internal server error</html>".to_string(),
        }));

        let result = refresh_access_token(&http, "t", "c", "rt");

        assert!(matches!(result, Err(OAuthError::UnexpectedResponse(_))));
    }

    #[test]
    fn a_malformed_success_body_is_reported_as_unexpected_response() {
        let http = FakeHttpClient::queue(Ok(HttpFormResponse {
            status: 200,
            body: "not json at all".to_string(),
        }));

        let result = refresh_access_token(&http, "t", "c", "rt");

        assert!(matches!(result, Err(OAuthError::UnexpectedResponse(_))));
    }

    // ---- Bearer header ----

    #[test]
    fn bearer_header_value_has_the_exact_expected_shape() {
        assert_eq!(bearer_header_value("abc.def.ghi"), "Bearer abc.def.ghi");
    }

    // ---- percent_encode ----

    #[test]
    fn percent_encode_leaves_unreserved_characters_untouched() {
        assert_eq!(percent_encode("abcXYZ019-_.~"), "abcXYZ019-_.~");
    }

    #[test]
    fn percent_encode_escapes_reserved_and_space_characters() {
        assert_eq!(percent_encode("a b"), "a%20b");
        assert_eq!(percent_encode("a/b"), "a%2Fb");
        assert_eq!(percent_encode("a:b"), "a%3Ab");
    }
}
