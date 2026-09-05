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
