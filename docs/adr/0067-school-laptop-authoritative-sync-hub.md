# ADR-0067 — School-laptop authoritative sync hub

Status: **Accepted for architecture and protocol foundation. Production
learner data remains blocked until the school head/DepEd DPO approves the
documented arrangement and native security, backup, and restore checks pass.**

Supersedes ADR-0065's offshore Cloudflare recommendation. ADR-0065 remains the
historical cloud-candidate record; its implementation prohibition remains
correct for that design.

## Decision

LIKHA will use one supervised, always-on laptop in the school's computer lab
as the authoritative consolidation and sync hub for one school's dataset. The
ICT coordinator is the named custodian. Teacher devices retain encrypted,
scope-limited SQLite replicas and remain fully usable offline.

"Authoritative" means the hub validates, orders, and retains the consolidated
accepted history. It does **not** mean teacher screens query a live remote
database, nor that the hub silently wins a conflict. Encrypted, tested backups
are the disaster-recovery authority if the laptop fails.

### Recommended

Use direct school-LAN connectivity when on campus and Tailscale as the optional
remote reachability layer for home synchronization. Assume CGNAT unless the
ISP proves a stable public IP. Tailscale is transport only; LIKHA still performs
device authentication, authorization, payload encryption, validation, replay
protection, and conflict handling.

### Next best

Use school-LAN-only synchronization. Teachers keep working offline at home and
push/pull when they return to campus. This avoids an external relay/control
plane but delays consolidation.

Direct internet port-forwarding is not approved by default. It requires a
separate threat model, managed TLS lifecycle, firewall review, monitoring, and
a confirmed non-CGNAT connection.

## Data and privacy boundary

- Plaintext learner data at rest stays on school-controlled devices in the
  Philippines. Each device uses its existing SQLCipher key protected by the
  operating-system keystore.
- A remote tunnel may route encrypted traffic and connection metadata through
  infrastructure outside the Philippines. Therefore the project must not claim
  "100% of learner data remains in the Philippines" for remote sync. The DPO
  and school head must approve this documented path before real learner use.
- Teacher replicas contain only records authorized for that teacher. The hub
  contains the complete school dataset. Auth/session tables, password hashes,
  local audit material, and device/private keys are never replicated as domain
  data.
- Remote access to government sensitive personal information must be covered
  by written policy, accountable access, strong encryption, and applicable
  record-volume limits under the Data Privacy Act IRR.

## Protocol contract

1. A local transaction updates SQLite and appends an encrypted, idempotent
   outbox change. Local success never waits for the network.
2. Each change has a UUIDv7 change ID, enrolled device ID, authenticated actor,
   allowlisted entity kind, entity ID, base version, operation, and encrypted
   authenticated payload. The client does not submit a trusted `school_id`.
3. The hub derives school, actor, role, and permitted record scope from a
   separately enrolled and revocable device credential. Network membership is
   not application authorization.
4. Pushes are bounded batches. The hub rejects duplicates idempotently,
   validates capability and scope, applies accepted changes transactionally,
   and assigns a monotonically increasing hub cursor.
5. Pulls request changes after a cursor and are filtered to the authenticated
   device's authorized scope. Paging supports devices offline for weeks.
6. A matching base version is accepted. Divergent versions enter an explicit
   review queue. Learner identity, enrollment, attendance, and grading records
   never use silent last-write-wins.
7. Deletions are tombstones until every enrolled device has advanced beyond
   the retention checkpoint; physical deletion is a later controlled process.

The first code slice introduced provider-neutral types, limits, the
`SyncProvider` port, and conflict classification. The next slice added an
encrypted local outbox with idempotent enqueue, bounded school-scoped batches,
fixed retry codes, acknowledgement, and transaction-rollback coverage. No
domain write emits changes yet, and no production network server, key ceremony,
hub log, or device enrollment exists.

## Authentication and keys

- Offline application login continues against the device's local user store.
  Loss of internet or hub availability must not block normal local work.
- Sync uses a distinct per-device credential issued and revocable by the hub.
  A stolen device can be denied future sync without changing every teacher's
  password.
- SQLCipher database keys are device-local. A separate school sync-payload key
  is wrapped for each enrolled device; the two key types are never reused.
- Enrollment, recovery escrow, rotation, revocation, and loss of the final key
  holder require a documented custodian procedure. LIKHA must never silently
  mint a replacement key that makes old data unreadable.

## School-laptop operations gate

Before real learners are entered, record and demonstrate:

- asset tag, supervised lab location, named ICT custodian, alternate custodian,
  and authorized-user list;
- full-disk encryption, patched supported OS, non-admin service account,
  automatic screen lock, endpoint protection, host firewall, and disabled
  unnecessary services;
- startup-after-reboot behavior, battery/UPS expectations, health indication,
  disk-capacity alerting, and planned maintenance windows;
- two rotating encrypted backups with one physically separate school-controlled
  copy, retention rules, and a witnessed restore drill;
- device enrollment/revocation log, failed-sync/security log, conflict-review
  ownership, incident response, and data-subject request procedure;
- DPO/school-head sign-off for data flow, remote-access policy, transport
  metadata, access roles, backups, and retention.

"Always on" improves availability but is not a backup or a security control.

## Consequences

The school avoids an offshore hosted learner database and can operate through
internet outages. It accepts responsibility for physical security, patching,
power, monitoring, backups, key custody, and recovery. Home edits may remain
queued until the laptop becomes reachable; users must see last-successful-sync,
pending-change count, and actionable errors rather than a false "synced" state.

## Addendum (2026-09-05) — network listener library decision

This ADR's "What this ADR does NOT decide" left the exact wire protocol open.
The actual surface needed turned out to be small: two authenticated JSON
operations (push a batch of already-encrypted changes; pull changes after a
cursor), both already fully implemented and tested as plain functions
(`repository::device_credential::verify`, `repository::sync_hub::push_batch`/
`pull_since`) — the listener's only job is to authenticate a request and
shuttle bytes to/from them.

**Decision: `axum`** (tokio-rs org). Evaluated against `warp`, `actix-web`,
`tiny_http`, and a hand-rolled raw-TCP framing:

- `axum` 0.8.9, MIT, actively maintained (last published 2026-04, verified
  via the crates.io API). Plain extractor/handler functions, no macro DSL —
  the most ergonomic fit for this team. `default-features = false` with only
  `json`, `http1`, `tokio` — no HTTP/2, no multipart/websocket surface this
  API doesn't use.
- `warp` 0.4.3, MIT, also actively maintained (last published 2026-05) — a
  legitimate Next Best, but its `Filter` combinator API is less ergonomic for
  this team than axum's plain functions (a documented tradeoff independent
  developers report when porting between the two).
- `tiny_http` 0.12.0 — last published 2022-10, effectively dormant. Would
  also mean hand-rolling JSON body handling, routing, and typed extraction
  axum/warp already provide. Rejected on maintenance grounds alone.
- `actix-web` — a heavier, actor-model framework with much more surface
  (middleware stacks, its own runtime abstractions) than two JSON endpoints
  need. Not evaluated further given axum already fits cleanly.
- Hand-rolled raw TCP + custom framing — rejected: reinvents HTTP parsing,
  JSON extraction, and routing that already-audited libraries provide for
  free, for a correctness-first project, with no compensating benefit over
  axum for this small a surface.

**Tauri integration**: reuses the `tokio` runtime Tauri already runs
internally — `tauri::async_runtime::spawn` is the documented pattern for
running an axum server inside a Tauri app (no second/parallel runtime, no
`#[tokio::main]`).

**What shipped this slice**: `hub_server` module — an `axum::Router` exposing
`POST /sync/push` and `GET /sync/pull`, both requiring `x-likha-credential-id`
/`x-likha-device-secret` headers (never a query parameter, so a secret never
ends up in a proxy/access-log line), verified via `device_credential::verify`
with the same enumeration-safe collapse (unknown id / revoked / wrong secret
all return the same generic `401`). Errors crossing this boundary are mapped
to a small closed set (`401`/`400`/`500` with fixed, generic messages) —
never an internal database error string, the same "never leak the underlying
error text" discipline `AppError::Import`/`FormGeneration` already apply at
the Tauri IPC boundary. Tested via `axum`+`tower`'s router-as-a-`Service`
pattern (no real TCP socket bound) including a full authenticated push→pull
round trip. New dev-dependencies: `tower` (`util` feature, router testing
only) and `tokio` (`macros`+`rt-multi-thread`, for `#[tokio::test]`).

**Deliberately NOT done in this slice** (a separate, later increment): binding
the router to an actual TCP listener and deciding which interface address to
bind (LAN and/or Tailscale — **never `0.0.0.0`**, per this ADR's own
School-laptop operations gate); wiring it into Tauri app startup; TLS (or a
documented decision that the LAN/Tailscale transport itself is the trust
boundary and plaintext HTTP inside it is acceptable, matching ADR-0069's
reasoning for payload transport); per-device rate limiting; request body size
limits beyond the existing `MAX_PUSH_BATCH`/`sync::validate_change` payload
cap; and the client side of this protocol (a device's own HTTP client calling
these two endpoints) — nothing yet drains `sync_outbox` over the network.

## Addendum (2026-09-05) — startup wiring, loopback only

Wired `hub_server::router` into real Tauri app startup
(`hub_server::maybe_spawn_listener`, called from `lib.rs`'s `setup` hook).
Gated the same way the client-side write path already is
(`commands::learner`'s enrollment gate): `hub_server::should_listen` starts
the listener only if this installation has ever enrolled a device for some
school. A never-enrolled, plain installation's startup is completely
unaffected — no new socket, no new attack surface. A bind failure is logged,
never fatal, matching this codebase's "sync must never crash the app"
discipline.

**Deliberately scoped down rather than half-verified**: binds **loopback
only** (`127.0.0.1:7878`), not a real LAN or Tailscale interface. Resolving
the actual bind interface (never `0.0.0.0`) needs either a new
interface-enumeration crate (unresearched so far) or a documented
manual-configuration decision, plus native Windows network verification —
this sandboxed development environment can prove the wiring compiles and the
gate logic is correct, but cannot prove real LAN reachability. Recorded
honestly as the boundary of this slice, per this project's "never claim a
check passed unless it actually ran" rule, rather than guessing at an
interface-selection heuristic that could not be verified here.

The listener's own state opens a SEPARATE `Connection` to the same encrypted
database file (axum's `State` extractor needs `'static` + `Clone`, which
Tauri's own managed `State<'_, Mutex<Connection>>` cannot satisfy, since its
lifetime is tied to the invoking command) — safe under this app's existing
WAL mode, which was already enabled specifically so multiple connections to
the same SQLite file coexist correctly; not a new concurrency risk.

`tokio` promoted from a dev-only to a direct runtime dependency (`net`+`rt`
features) — `hub_server`'s production code now calls
`tokio::net::TcpListener` directly, which needs a direct `Cargo.toml` edge,
not just the transitive one Tauri/axum already provided.

## Addendum (2026-09-05) — client-side sync loop (push/pull over loopback HTTP)

Added the device-side counterpart to `hub_server`: a new `sync_client` module
that drains `sync_outbox` in bounded batches to `POST /sync/push` and
periodically `GET /sync/pull`s changes accepted from other devices, wired
into real Tauri startup the same way (`sync_client::maybe_spawn_loop`, gated
by `sync_client::should_run`) so a never-enrolled installation stays
completely unaffected.

**HTTP client decision: `reqwest` (blocking).** `cargo tree -i reqwest`
showed it was already resolvable in this workspace's lockfile, but only as
an optional dependency of a `tauri` feature reachable for the `wasm32`
target — not actually part of the dependency graph for this app's real
native target, so it needed a real, direct addition rather than "just use
what's already there." Evaluated against building on `hyper`/`tower`
directly (axum's own stack, already a dependency): rejected as needless
hand-rolled HTTP-client plumbing (connection handling, redirects, body
buffering) for a two-endpoint client a mature library already does
correctly. Chose `reqwest::blocking` (not the async client) because this
loop is a plain "wake up, push, pull, sleep" worker on its own background
`std::thread`, not code that needs to share Tauri's tokio runtime — a
blocking client keeps it simple to read and, importantly, simple to test
without `#[tokio::test]` plumbing of its own. `default-features = false`
with only `blocking`, `json`, and `query` (typed query-string building for
`GET /sync/pull?after=&limit=`, matching axum's own `Query` extractor) —
deliberately **no TLS feature**: every request targets `127.0.0.1` in plain
HTTP, matching `hub_server`'s own loopback-only, plaintext-inside-the-trust-
boundary decision; a TLS backend would be dead dependency weight for a URL
that can never be `https://`.

**New local state, added because the client side genuinely had nothing to
authenticate or resume with yet:**

- `device_sync_client_credential` (migration 34): this device's own retained
  copy of the credential it needs to present on every push/pull request
  (`x-likha-credential-id`/`x-likha-device-secret`) — distinct from
  `device_sync_credentials` (migration 26), which is the HUB's
  verification-side table and stores only a `secret_hash`, never a usable
  secret. Until this slice, `device_credential::enroll`'s returned secret was
  used once and then discarded by every caller (its own doc comment says so
  verbatim) — meaning no device could actually have authenticated a second
  request even if a client existed. This is NOT the ADR-0069 payload-key
  ceremony (that remains out of scope for this slice, see below); it is
  strictly the bearer secret for the sync HTTP protocol itself.
- `sync_pull_cursor` (migration 34): this device's own "last hub cursor I
  have fully processed" watermark per school — the pull-side counterpart to
  `sync_version_cache`'s per-entity watermark.
- `repository::sync_conflict_review::stage_pull_conflict`: reuses the
  existing `sync_conflict_review` table (migration 29) for a NEW case —
  pull-side conflicts — rather than a second table. A pull-side conflict is
  defined here as "this device already has an unsynced local edit
  (`sync_outbox` row) for the same entity the pulled change targets"; that
  case is staged for review, the version cache is left untouched, and the
  pull cursor still advances (this device _has_ processed the change, by
  staging it, just not applied it live) — never silent last-write-wins on
  the pull side, matching the push side's existing rule.

**What "applying a pull-side change" means in this slice, and what it
deliberately does NOT mean:** for a non-conflicting `AcceptedChange`, the
only action taken is advancing `sync_version_cache`'s known-version
watermark for that entity. It does **not** decrypt `encrypted_payload` and
write a `learners`/`sections`/... domain row. That decryption needs the
school's sync-payload key (SSPK), and per this slice's task description and
this ADR's own already-recorded gap, the payload-key ceremony (wiring
`crypto::payload_key`'s existing primitives and the migration-32
`sync_payload_key_wraps` table into an actual per-device unwrap at
enrollment/use time) is explicitly a separate, later increment — no Tauri
command exposes any of it yet, so no device could safely decrypt a payload
even if this slice tried to. Advancing the version watermark without the
domain write is still meaningful and safe on its own: it is exactly the
state `sync_version_cache` needs so this device's _own_ next edit to that
entity computes a correct (non-stale) `base_version`, and it never
constructs or displays plaintext data this device hasn't decrypted.
Materializing pulled changes into domain tables remains this feature's next
real gap, tracked as this slice's own follow-on (see
`docs/CURRENT-HANDOFF.md`).

**Push-side outcome handling reuses `sync_outbox`'s existing state machine
verbatim** (`acknowledge`/`record_attempt` with its fixed
`AttemptErrorCode`s) — `sync_client::push_once` only decides which existing
call an HTTP outcome maps to: `Accepted`/`AlreadyApplied` → advance
`sync_version_cache` to `base_version + 1` (the same arithmetic
`sync_hub::push_change` applies server-side) and acknowledge;
`ConflictStaged` → acknowledge without touching the version cache (the hub
already durably recorded the conflict in its own review queue; retrying
only ever replays the same outcome, so the row is dequeued rather than
retried forever); a transport error, a non-2xx status, or a malformed/
mismatched response body → `record_attempt` with `Offline`/`Timeout`/
`Unauthorized`/`HubUnavailable`/`ProtocolRejected` as appropriate, and the
outbox row is left completely untouched otherwise (no partial
acknowledgement, no corruption) so the next round retries it.

**Tested via a real HTTP round trip**, not just `tower::Service` calls like
`hub_server`'s own tests: each test binds a real `hub_server::router` to an
ephemeral loopback TCP port (`127.0.0.1:0`) on a background thread running
its own minimal single-threaded tokio runtime, and drives it with an actual
`reqwest::blocking::Client` from a second, independent in-memory database
standing in for a second physical device — proving the wire format, header
names, and status-code handling actually work over a socket, not only that
the Rust types line up. 8 new tests: outbox draining + acknowledgement,
no-op on an empty outbox, push-side conflict staging + dequeue, unauthorized-
credential handling leaves the outbox row untouched, pull applying a
non-conflicting change, pull staging a conflict without touching the live
version cache, and the never-enrolled-installation no-op gate.

**Deliberately NOT done in this slice** (separate, later increments): the
payload-key ceremony and any actual domain-table materialization of pulled
changes (discussed above); wiring `auth::enroll_device_sync_credential`'s
real enrollment flow to call
`device_sync_client_credential::store` automatically (today nothing
populates that table except this module's own tests and a future Tauri
command neither of which exists yet — there is still no enrollment command
surfaced at all); a sync-status UI; per-device rate limiting on the hub
side; TLS; and resolving the LAN/Tailscale bind interface (`hub_server`'s
own already-recorded gap, unchanged by this slice).
