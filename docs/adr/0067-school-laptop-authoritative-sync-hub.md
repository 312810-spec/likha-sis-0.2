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

The first code slice introduces only provider-neutral types, limits, the
`SyncProvider` port, and conflict classification. It deliberately does not
pretend that a production network server, key ceremony, or persistent outbox
exists yet.

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
