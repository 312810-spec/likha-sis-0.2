# ADR-0088: Official School Repository — Microsoft 365 OAuth Architecture

Status: Accepted (architecture + core client + queue built and tested
against mocks; live activation owed pending a real Azure AD tenant)
Date: 2026-09-09

## Context

`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md` (approved 2026-08-29)
specifies a per-school Microsoft 365/SharePoint document repository
surfaced through Microsoft Graph. It was fully blocked pending an
owner-provided Azure AD tenant (`docs/product/OWNER-DECISIONS-NEEDED.md`
item 2). The owner has now approved building the real integration
architecture ahead of a live tenant — real, tested-against-mocks
engineering, not a placeholder — so the feature can be activated the
moment a real Azure AD app registration exists. No live tenant exists in
this environment; nothing in this ADR is claimed as proven by a live
OAuth round trip.

Each school registers its own Azure AD app in its own tenant. LIKHA-SIS
never runs a shared multi-tenant app and never embeds a client secret in
the shipped EXE (native/public-client apps cannot keep a secret
confidential at all, which is exactly why the flow below uses PKCE
instead of a client secret).

## Decision 1 — Where the OAuth/HTTP client lives: Rust, not TypeScript

The batch prompt asked this to match `WeatherApplicationService` +
`OpenMeteoWeatherClient`'s layering (ADR-0076/0079) "adjusted for OAuth."
Read first, as instructed:

- `WeatherClientPort` (`src/domain/ports/weather-client.ts`) is a TS
  interface; `OpenMeteoWeatherClient` (`src/infrastructure/`) is a plain
  TS `fetch()` call, wired only in `src/composition.ts`. It works because
  Open-Meteo is unauthenticated, keyless, and every failure degrades to
  `"unavailable"` — there is no secret anywhere in that path.

That precedent does **not** carry over unchanged here, because this
integration has a secret the weather client never had: an OAuth refresh
token that must survive between app launches. `.claude/rules/security-
privacy.md` requires such secrets live in the existing DPAPI-protected
pattern and **never** in SQLite — and DPAPI (`src-tauri/src/crypto/
dpapi.rs`) is Rust/Win32-only; there is no equivalent capability
reachable from the WebView/TypeScript side of this app today.

Given that hard constraint, the OAuth/token/Microsoft Graph HTTP work is
placed in Rust, under a new `src-tauri/src/infrastructure/microsoft365/`
module:

- `oauth.rs` — PKCE pair generation, authorization-URL construction,
  authorization-code token exchange, refresh-token exchange. Platform-
  independent (no `windows` crate dependency) — compiles and its tests
  run on any target, including this Linux dev sandbox.
- `token_store.rs` — DPAPI-protected refresh-token storage, gated
  `#[cfg(windows)]`/`#[cfg(not(windows))]` exactly like every existing
  `db::mod.rs` key accessor (`load_encryption_key`, `load_or_mint_sspk`):
  fails closed with a clear error on a non-Windows host rather than
  falling back to an unprotected store. Its own DPAPI round-trip tests
  therefore only compile and run on Windows, matching
  `crypto::dpapi`'s already-established pattern — **not independently
  re-verified in this Linux sandbox**, disclosed in
  `docs/VERIFICATION-DEBT.md` rather than claimed.

This means the TS side of this feature is a thin Tauri-command adapter —
`TauriDocumentRepositoryProvider` implementing
`DocumentRepositoryProviderPort` (`src/domain/ports/
document-repository-provider.ts`) by calling narrow commands, the same
shape every other authorized/tenant-scoped port in this codebase already
uses (`SchoolLogoRepository`, `ExportRepository`), not the weather
client's shape. The refresh token, and the bearer access token derived
from it, never cross the Tauri IPC boundary as a plain value the WebView
process could read out of a JS heap snapshot or a compromised renderer —
Rust holds the secret, uses it to call Graph, and returns only
already-safe results (connection status booleans, document metadata,
upload outcomes) to TypeScript.

`src/ui/**` and `src/domain/**` still never import
`src-tauri/**` or a Graph SDK directly; only `src/composition.ts` wires
the concrete `TauriDocumentRepositoryProvider`, verified by `npm run
check:architecture`.

## Decision 2 — Hand-rolled PKCE code exchange, not an MSAL crate

Researched before adding any dependency, per `docs/SOURCE-REGISTRY.md`'s
"flag explicitly" convention:

- Microsoft does **not** publish or maintain an MSAL library for Rust.
  Microsoft's own MSAL platform-support documentation
  (`learn.microsoft.com/entra/identity-platform/msal-overview`) lists
  .NET, JavaScript/Node, Python, Java, Go, iOS/macOS, and Android — Rust
  is absent.
- The community alternatives found (`msal-rs` by freedit-dev, last
  published over a year ago; the `msal` crate, whose own crates.io
  listing says it is an unmaintained stub pointing users at a different,
  unrelated library) are both too thin/stale to take a security-sensitive
  dependency on.

**Decision: hand-roll the authorization-code-with-PKCE exchange against
Microsoft's documented v2.0 endpoints**, using `reqwest` — already an
existing dependency in `src-tauri/Cargo.toml` (added for `sync_client.rs`
and `hub_server.rs`) — so this ADR adds **zero new crates**. The flow
implemented (verified via Microsoft Learn, not from training-data
recall, since this is security-sensitive):

- Authorization endpoint: `https://login.microsoftonline.com/{tenant}/
oauth2/v2.0/authorize`
- Token endpoint: `https://login.microsoftonline.com/{tenant}/
oauth2/v2.0/token`
- PKCE: a random `code_verifier` (43 chars, base64url of 32 CSPRNG bytes,
  matching RFC 7636's 43–128 char requirement), `code_challenge =
BASE64URL(SHA256(code_verifier))`, `code_challenge_method=S256`.
- Redirect URI: a loopback address (`http://127.0.0.1:<port>/callback`)
  per RFC 8252 native-app guidance, which Microsoft's redirect-URI
  matching treats as port-agnostic for loopback addresses — the actual
  local HTTP listener that receives the redirect is **not** built in this
  batch (see "Not yet built" below); `oauth.rs` only builds the
  authorization URL and performs the code/token and refresh/token HTTP
  exchanges, both independent of how the code was captured.
- `offline_access` is requested explicitly — required by the Microsoft
  identity platform to receive a refresh token at all; without it only a
  short-lived access token would come back and this feature could never
  stay connected between app launches.
- Delegated scope requested: `Sites.Selected` (least-privilege — grants
  the app zero SharePoint access by default; a tenant admin must then
  explicitly grant it to exactly the one school-owned site, matching
  the spec's least-privilege requirement) plus `openid profile
offline_access`.
- **`reqwest` TLS backend addendum**: `reqwest` was already a direct
  dependency, but only for `sync_client.rs`'s loopback-only (`127.0.0.1`)
  sync protocol, deliberately built with no TLS feature at all.
  `oauth.rs`'s calls to `https://login.microsoftonline.com` are the first
  `reqwest` use in this crate that ever leaves the loopback interface, so
  this ADR adds the `form` feature (the token endpoint requires
  `application/x-www-form-urlencoded` bodies) and a `rustls` TLS backend —
  chosen over `native-tls` specifically because this project already
  vendors OpenSSL once for SQLCipher (ADR-0003's
  `bundled-sqlcipher-vendored-openssl`); a second, independent OpenSSL
  binding for TLS would duplicate that build cost and attack surface for
  no benefit, while `rustls` is pure Rust with no second native/system TLS
  dependency. Flagged explicitly in `docs/SOURCE-REGISTRY.md` — this is a
  genuine capability expansion (this dependency can now reach the public
  internet), not a routine version bump.

**No paid tier implied**: `Sites.Selected` and `offline_access` are
ordinary Microsoft Graph/identity-platform scopes available under a
standard Microsoft 365 Business/Education/Enterprise plan a school
already has if it has SharePoint at all; nothing here requires an
additional paid add-on license. Flagged explicitly per this batch's
constraints — if a target school's specific tenant plan turns out to
restrict `Sites.Selected` (some restricted-permission Graph features
have historically required specific SKUs), that must be re-verified
against that school's actual licensing before the live pilot, not
assumed from this research alone.

**Error/retry handling implemented**: a non-2xx token-endpoint response
is parsed for the standard `error`/`error_description` OAuth fields and
surfaced as a typed `OAuthError` rather than a generic HTTP failure; a
transport-level failure (timeout, DNS, connection refused) is
distinguished from a protocol-level rejection (`invalid_grant`, etc.) so
a caller can tell "offline, retry later" apart from "the refresh token
was revoked, the user must reconnect." Proven by mocked-`HttpClient`
tests (`oauth.rs`'s own test module) — these prove request shape (form
fields, `grant_type`, scope string), the `Authorization`/content-type
headers Graph calls build from the resulting access token, and both
error classes. They do **not** prove a live token exchange against a
real Microsoft tenant — that remains genuinely unverified until a real
Azure AD app registration exists.

## Decision 3 — Token storage: DPAPI-protected file, never SQLite

`token_store.rs` protects the refresh token exactly like
`crypto::dpapi::DpapiKeyStore` protects the database encryption key —
same `CryptProtectData`/`CryptUnprotectData` primitives (current-Windows-
user scope, `CRYPTPROTECT_UI_FORBIDDEN`), same atomic-write discipline
(temp file + rename, never a half-written file on disk) — but as its own
`ms365-refresh-token.bin` file, never reusing the database key file and
never written into any SQLite table. `crypto::dpapi` gained two small
`pub(crate)` byte-oriented wrappers (`protect_bytes`/`unprotect_bytes`)
so `token_store.rs` can reuse the exact same protect/unprotect Win32
calls without duplicating them — no new cryptographic code, only a
narrower, already-audited primitive exposed one level further.

Unlike the database key (generated once, fixed forever), a refresh token
**rotates** — Microsoft may issue a new refresh token on every refresh
exchange — so `token_store.rs` supports overwrite (mirroring
`DpapiKeyStore::rotate_key`'s atomic-replace semantics), not
`load_or_create`'s "never regenerate" semantics.

## Decision 4 — Upload-scope boundary: exports only, never the live database

`UploadableArtifactKind` (`src/domain/document-repository.ts`) is a
closed TypeScript union — `"sf1-export" | "sf9-export" | "sf10-export" |
"disaster-recovery-backup"` — with no variant for "the live database" or
"an arbitrary path," so the type system alone gives a caller no way to
construct a queue entry pointing at `likha-sis.db`. The independent,
authoritative guard lives in Rust
(`repository::microsoft365_upload_queue::enqueue`): it re-derives the
expected file name for the given kind and the app data directory's own
`DB_FILE_NAME`/`KEY_FILE_NAME` constants from `db::mod.rs`, and rejects
any candidate path that resolves (after canonicalization) to either —
proven by
`enqueue_rejects_a_path_that_resolves_to_the_live_database_file` and
`enqueue_rejects_a_path_that_resolves_to_the_key_file`. This matches
`.claude/rules/architecture.md`'s "security must never rely on a client
choosing correctly" principle: the boundary is enforced at the
repository layer regardless of what any future UI ever sends.

Uploading the raw encrypted SQLite database would break this project's
own local-encryption threat model (ADR-0003) — a second, provider-held
copy of the encrypted file plus its DPAPI-wrapped key file living on two
different machines is a materially different exposure than the
single-device model ADR-0003 was designed around — so this is rejected
structurally, not left as a code-review convention.

## Not yet built (explicitly deferred, not silently dropped)

- The actual loopback HTTP listener that captures the OAuth redirect
  (`connect()`'s browser-launch + local-server half) — `oauth.rs`
  provides the URL-building and code/token exchange either side of it,
  but wiring an actual local listener plus browser launch is Settings-UI-
  adjacent work; see `docs/CURRENT-HANDOFF.md` for exactly which
  checkpoints of this batch shipped.
- A concrete Microsoft Graph `driveItem` upload call (`PUT
/sites/{id}/drives/{id}/root:/path:/content` or the resumable upload
  session variant for larger files) — the queue and its retry/backoff
  exist and are tested; the actual Graph upload request is the next
  slice once a real tenant exists to validate the site/drive resolution
  against.
- A live OAuth round trip against a real Azure AD tenant — cannot be
  performed in this environment at all; remains the activation
  prerequisite `docs/product/OWNER-DECISIONS-NEEDED.md` item 2 already
  tracks.

## Consequences

- Zero new Cargo/npm dependencies added by this batch.
- The feature is completely invisible when unconfigured — no app
  registration saved means `getConnectionStatus().configured === false`
  and nothing else in the app changes behavior, matching the Weather &
  Hazard Alerts precedent (ADR-0079).
- `docs/VERIFICATION-DEBT.md` gains an entry for the DPAPI-protected
  token store's own round-trip tests (Windows-only, uncompiled and thus
  unverified on this Linux sandbox) and for the entire live-tenant OAuth
  round trip.
