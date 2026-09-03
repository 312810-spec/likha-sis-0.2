# ADR-0065 — Cloud Sync Target Decision (zero-card, single-database)

Status: Accepted — **decision-only** (no `SyncProvider` implementation,
no Worker, no schema change ships with this ADR)

Supersedes the unmerged draft on branch
`origin/claude/cloudflare-likha-setup-a5oq5i`
(`docs/adr/0042-cloud-sync-target-decision.md`, a 10-scenario pass that
picked "Durable Object per school"). That draft was never merged and its
ADR number collides with the merged
`0042-learner-core-enrollment-domain-foundation.md`; this ADR replaces it
with a 20-scenario pass, an explicit zero-payment-card gate, a 100-point
metric, and the narrower single-database scope the owner set on
2026-09-03.

## Context

No cloud/sync code exists anywhere in this repository. `SyncProvider` is
only the architecture-diagram placeholder from ADR-0001's layering
statement. `docs/product/PRODUCT-CONTRACT.md` §12 recorded "Cloudflare
Worker + Durable Object (next-best: Worker + D1)" as a **working
hypothesis**, explicitly not ratified, with an instruction to run this
project's own scenario-decision process before treating it as decided.
This ADR is that process.

### Scope set by the owner (2026-09-03)

> "run a 20-scenario, select the best scenario with zero-cost, no
> credit/debit card info needed. do a deep search for this and provide a
> 100-point metric that will meet our needs."

> "it's fine for now to have a single database for each school, not
> interconnected, focus only for our school"

So the target is a **single cloud database for one school**, not a
multi-tenant platform and not one-database-per-school-at-scale. Two
consequences:

- **Structural multi-tenant isolation stops being a differentiator.**
  The prior draft ranked "Durable Object per school, addressed by
  `idFromName(school_id)`" first largely because isolation was
  _structural_ rather than a `WHERE school_id = ?` filter. With one
  school and one database there is nothing to partition; isolation
  reduces to authenticating that a device belongs to this one school —
  which every candidate does the same way (a per-device credential the
  cloud endpoint verifies server-side).
- **Scale limits stop mattering.** One school's SIS data (learners,
  attendance, sections, grades) is tens of megabytes. Every free tier
  evaluated holds it with room to spare. Simplicity and time-to-value
  rise in weight instead.

### Hard requirements (unchanged, from `CLAUDE.md` / `PRODUCT-CONTRACT.md`)

- **Zero cost and no payment card at signup.** Not merely "free tier" —
  the provider must not require a credit or debit card to create the
  account or activate the free plan. A provider that demands a card
  (even for a $0 charge) is **disqualified**, independent of score.
- The cloud target sits behind the `SyncProvider` port only. UI, domain,
  and application code never reach toward it
  (`docs/architecture/ARCHITECTURE.md` Sync Rule;
  `scripts/check-architecture.mjs` enforces the import direction).
- SQLite / SQLCipher stays the device's primary working database. Cloud
  is sync, never the source of truth for a teacher's local work. Offline
  writes save locally first and never block on a network round trip.
- School/device authorization is derived from a trusted boundary, never
  a client-supplied value — the cloud mirror of
  `SessionManager::require_active_school_scope` (ADR-0004).
- Must eventually also serve a future Android client, not only Windows.

### Data residency (Philippines)

RA 10173 (Data Privacy Act) and current National Privacy Commission
guidance impose **no data-localization requirement** for personal data.
Cross-border transfer is permitted with a lawful basis, a comparable
level of protection at the destination, and disclosure in the app's
privacy notice. A global / edge host is legally viable; the privacy
notice is a documentation task for the implementation milestone, not an
architecture blocker.

### Research method (disclosed)

Current (September 2026) facts were gathered this session via `WebSearch`
/ `WebFetch` against primary sources (each provider's own pricing and
platform-pricing pages) plus corroborating community threads, cited
inline in `.planning/wave5-sync-target/findings.md`. A
`dependency-researcher` agent was **not** used this round; the
file-based independent-review workaround
(`docs/PROJECT-MEMORY.md` "File-Based Independent-Review Workaround")
remains available and was applied successfully for the P1 security
review earlier the same day, so it is the fallback if a deeper
dependency pass is wanted before implementation.

## The 100-point metric

A hard **PASS/FAIL gate** first, then 100 points across seven weighted
criteria. The weights follow LIKHA's priority order
(privacy/security → correctness → DepEd compliance → teacher usability →
offline reliability → maintainability → zero billing → performance →
speed), reinterpreted for an infrastructure choice the same way ADR-0013
reinterpreted its rubric for a schema choice.

### Gate (PASS / FAIL — a FAIL disqualifies regardless of points)

- **G1 — Zero cost:** a genuine perpetual free tier (not a time-limited
  trial) that holds one school's data and sync volume.
- **G2 — No payment card at signup:** account creation and free-plan
  activation require no credit or debit card.

### Scored criteria (100 points)

| #   | Criterion                                   | Points | What earns the points                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Security & device/school auth fit**       | 20     | Cloud endpoint authenticates "this device belongs to our school" from a server-side trusted boundary, never a client-supplied value (10). Transport encryption + a clean story for encrypting the cloud copy at rest (LIKHA controls the plaintext; the cloud sees ciphertext or at least an access-scoped store) + a credential model that fits ADR-0004's "derived from a trusted boundary" rule (10). |
| C2  | **SQLite / schema-reuse fit**               | 18     | Cloud side is SQLite or a SQLite superset, so the 41+ existing migrations and the relational shape transfer with minimal translation (12). No forced move to Postgres, a document model, or a bespoke data model (6).                                                                                                                                                                                    |
| C3  | **Rust / Tauri client fit**                 | 15     | Usable directly from the Rust core behind a `SyncProvider` port — an official Rust crate or a plain HTTP API callable with `reqwest`. **No JS-only SDK**, and nothing that forces sync into the frontend (which would violate the architecture boundary).                                                                                                                                                |
| C4  | **Offline-first / local-first fit**         | 12     | The model is "local SQLite is the source of truth, sync is explicit or background," not "the cloud is the database" (8). A usable primitive to build conflict handling on — transactional remote storage, an append-only change log, or CRDT support (4).                                                                                                                                                |
| C5  | **Vendor stability & free-tier durability** | 15     | Vendor size / capitalization, product maturity (GA, not beta), and **no in-flight pivot of the exact feature we would depend on** (9). Free tier explicitly perpetual, with **no multi-day inactivity auto-pause** that a teacher would experience as "sync silently stopped" (6).                                                                                                                       |
| C6  | **Simplicity & time-to-value**              | 12     | Single database, few moving parts, a small endpoint surface to author and secure (7). How quickly a first real authenticated round trip is reachable (5).                                                                                                                                                                                                                                                |
| C7  | **`SyncProvider` boundary cleanliness**     | 8      | The whole integration lives in `src/infrastructure/` behind the port; nothing leaks into domain / application / UI; swappable later without touching business logic.                                                                                                                                                                                                                                     |

## The 20 scenarios

Scored out of 100 against the metric above. Gate failures are marked and
their scores are advisory only (they cannot be selected).

| #   | Scenario                                                                                                  | Gate          | Score  |
| --- | --------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 2   | **Cloudflare Worker + one D1 database for the school**                                                    | PASS          | **90** |
| 1   | **Cloudflare Worker + one SQLite-backed Durable Object for the school**                                   | PASS          | **87** |
| 4   | Cloudflare Worker + one Durable Object per school (`idFromName(school_id)`)                               | PASS          | 82     |
| 3   | Cloudflare Worker (stateless) + R2 append-only encrypted changeset log, merge in LIKHA's Rust domain      | PASS          | 81     |
| 5   | Turso single database over the HTTP API (no replica)                                                      | PASS          | 81     |
| 7   | Turso "Turso Sync" (new explicit `push()` / `pull()` local-first model)                                   | PASS          | 80     |
| 6   | Turso embedded replica via legacy `libSQL sync()` (Rust `libsql` crate)                                   | PASS          | 77     |
| 20  | Private GitHub repo as an encrypted changeset store (git as transport), GitHub API + a login-issued token | PASS          | 73     |
| 17  | `sqliteai/sqlite-sync` CRDT extension + managed "SQLite Cloud" / "SQLite AI"                              | PASS          | 68     |
| 8   | Neon (serverless Postgres) + a thin custom Worker/Function sync endpoint                                  | PASS          | 55     |
| 9   | Supabase (Postgres) + Row-Level Security                                                                  | PASS          | 52     |
| 11  | PowerSync (managed) + a Postgres backend                                                                  | PASS*         | 48     |
| 18  | Firebase Firestore (Spark free plan), driven from a Rust sidecar / REST                                   | PASS          | 45     |
| 19  | MongoDB Atlas M0 + a custom sync API                                                                      | PASS          | 45     |
| 12  | ElectricSQL Cloud (managed) + Postgres                                                                    | FAIL (not GA) | 45     |
| 13  | Triplit (integrated client/server sync DB)                                                                | PASS*         | 45     |
| 10  | Neon Postgres + ElectricSQL sync (Postgres → SQLite read path)                                            | PASS          | 44     |
| 14  | InstantDB (local-first Firebase alternative)                                                              | PASS*         | 42     |
| 15  | Jazz (`jazz.tools`, local-first + Jazz Cloud)                                                             | PASS*         | 42     |
| 16  | cr-sqlite (vlcn) CRDT extension + self-hosted / community sync server                                     | **FAIL (G1)** | —      |

`PASS*` = the payment-card gate passes, but the scenario fails the
**Rust-client** requirement (C3) hard enough to be non-viable — see the
per-scenario notes.

### Per-scenario reasoning

**#2 — Cloudflare Worker + one D1 database (Recommended, 90).**
D1 _is_ SQLite (C2 17/18 — the migrations and relational shape carry
over almost unchanged; the only gap is no SQLCipher on the cloud copy,
so payloads are encrypted app-side before send). Its query API is plain
SQL over HTTPS, callable from the Rust core with `reqwest` behind the
port — no JS SDK, no frontend involvement (C3 14/15). A single Worker
with one D1 binding is the smallest possible surface to author and
secure, and the fastest path to a first authenticated round trip (C6
11/12). Cloudflare is the largest, best-capitalized vendor in the set;
D1 is GA; the free tier (5 GB, 5M row reads/day, 100k writes/day) is
explicitly perpetual with no inactivity pause, and **no card is required
to create the account** — the standard free plan is card-free (the only
card-gated Cloudflare free product is Zero Trust, which is irrelevant
here) (C5 14/15). The account-wide 5 GB storage cap that made D1 the
_next_-best in the prior draft is a non-issue at single-school scale.
Offline-first is a construction task either way — D1 is a plain remote
store and LIKHA builds the change log and merge on top — but D1's
transactional statements are a sound substrate (C4 9/12). Boundary is
clean (C7 8/8). Security/auth 17/20: the Worker verifies a
per-device/per-school credential server-side; TLS in transit;
app-encrypted payloads at rest.

**#1 — Cloudflare Worker + one SQLite Durable Object (Next Best, 87).**
Everything good about #2, plus a single-threaded actor that serialises
writes for cleaner consistency, and the structural-isolation option
already in hand if a multi-school future ever arrives (C1 18/20). It
loses to #2 on the axes the single-school scope now rewards: you author
a Durable Object class (more non-Rust surface than D1's pure SQL-over-
HTTP, C3 13/15), the DO SQLite storage API is newer and less
battle-tested than D1 (C5 13/15), and Worker + DO + lifecycle is more
moving parts than one D1 binding for a single school (C6 9/12). The
first fallback if D1's write/consistency model proves awkward during
implementation.

**#4 — Durable Object per school (82).** Identical to #1 but adds the
multi-tenant addressing and provisioning machinery the current scope
explicitly does not need — a simplicity penalty (C6 7/12) with no
compensating benefit while there is one school. Revisit only if the
scope widens back to many schools.

**#3 — Worker + R2 encrypted changeset log (81).** The purest reading of
"cloud is not business logic": the Worker is a dumb relay for
append-only encrypted changesets in R2, and all merge / conflict logic
stays in LIKHA's own audited Rust domain (C1 18/20, C7 8/8, C5 14/15).
It scores well but the score hides the risk: building a correct,
race-free, multi-writer conflict-resolution protocol from scratch is one
of the harder correctness problems in distributed systems (C6 5/12), and
a managed platform's tested transactional primitives remove most of that
risk. Keep as the fallback if both D1 and DO are somehow unworkable.

**#5 — Turso single database over HTTP (81).** libSQL is a SQLite
superset (C2 17/18) with an official Rust crate (C3 14/15), a card-free
5 GB perpetual free tier, and a dead-simple single-DB shape (C6 10/12).
It loses on **vendor stability (C5 8/15)**: during exactly this decision
window Turso is mid-pivot — publicly discontinuing edge replicas for new
users, steering everyone off `libSQL sync()` onto a newer "Turso Sync"
product, and partly superseding libSQL-the-fork with a ground-up Rust
rewrite of SQLite that is still beta. For a choice meant to hold across
years of a school deployment, that is real churn against a smaller,
less-capitalised vendor than Cloudflare. The third fallback, and the
first option to re-evaluate if LIKHA ever wants to leave Cloudflare.

**#7 — Turso Sync (80).** The new explicit `push()` / `pull()` model is
an excellent conceptual fit for "local SQLite is the source of truth"
(C4 12/12). It is the _replacement_ product mid-rollout, so it inherits
#5's vendor-direction risk in its most acute form — depending on a
feature that is simultaneously new and the thing users are being
migrated onto (C5 7/15).

**#6 — Turso embedded replica, legacy `libSQL sync()` (77).**
Best-in-class offline-first fit as a vendor primitive — an actual local
SQLite file that syncs on demand, almost exactly "offline writes save
locally first" for free (C4 12/12) — with a real Rust crate. But this is
**the exact feature Turso is discontinuing for new users** (C5 5/15).
Choosing the thing being sunset is not defensible for a multi-year
decision.

**#20 — Private GitHub repo as an encrypted changeset store (73).**
Genuinely zero-cost and card-free, uses infrastructure the project
already depends on, and git is essentially an offline changeset log (C4
10/12, C5 13/15 — GitHub/Microsoft). But there are no transactions, API
rate limits apply, concurrent-writer resolution via git refs is fiddly,
and storing application data (even encrypted) in a code repo is a
grey area against GitHub's acceptable-use terms (C6 6/12). A curiosity /
last-ditch fallback, not a sync substrate to build on.

**#17 — `sqliteai/sqlite-sync` + "SQLite Cloud" / "SQLite AI" (68).**
A 2026 CRDT offline-first SQLite sync extension with a managed backend —
strong on paper for C2/C4. It is a C loadable extension (usable from
`rusqlite`, but unproven here — C3 9/15), the free plan is small
(512 MB / 256 MB RAM / 20 connections), and it is a very young vendor
mid-rebrand (C5 5/15).

**#8 — Neon + custom Worker (55).** Neon's card-free 100-project
perpetual free tier and 5-minute (not multi-day) scale-to-zero are
good, but it is **Postgres** — a real schema-translation burden against
41 SQLite migrations (C2 4/18) — and it needs a second component (the
sync endpoint) on top.

**#9 — Supabase + RLS (52).** Postgres (C2 4/18). Row-Level Security is
the `WHERE`-style policy pattern this project rejected for the local
boundary in ADR-0004, and using the Supabase client directly from the
frontend would violate the architecture boundary (C1 12/20, C7 5/8).
The Free plan **auto-pauses a project after 7 days of inactivity** and
caps an org at 2 active projects — for a school app with naturally
irregular usage (semester breaks, long weekends) that surfaces as "sync
silently stopped working" with no in-app explanation (C4 4/12, C5 9/15).
`docs/PROJECT-MEMORY.md` also records a standing "no Supabase migration"
exclusion; this score reaches the same conclusion independently.

**#11 / #13 / #14 / #15 / #10 — JS-first local-first engines (48/45/42/
42/44).** PowerSync, Triplit, InstantDB, Jazz, and ElectricSQL are all
strong local-first sync engines, but their client SDKs are JavaScript /
TypeScript (± Dart / Swift / Kotlin). **None has a Rust client.**
LIKHA's database layer is Rust (the Tauri core); a JS-only sync SDK
either cannot be used from there or forces sync into the frontend, which
`scripts/check-architecture.mjs` exists to prevent (C3 3-5/15 — the
disqualifier). Several also imply a Postgres cloud source of truth
(C2 penalty), and PowerSync's free project deactivates after 1 week
idle. This is the same reason the prior draft rejected Firestore.

**#12 — ElectricSQL Cloud (FAIL — not GA).** Managed Electric Cloud
pricing is "coming soon" as of this research; it cannot be selected as a
ratified target. Re-evaluate if it reaches GA with a card-free tier and
a non-JS access path.

**#18 — Firestore / Spark (45).** Firestore's offline SDKs are
JavaScript / mobile-first; from Rust you would drive the REST/gRPC API
by hand and lose the offline engine that is the only reason to consider
it (C3 6/15). NoSQL document model is the largest reuse mismatch in the
set (C2 2/18). The Spark plan also lost free Cloud Storage in a 2026
pricing change (C5 penalty).

**#19 — MongoDB Atlas M0 (45).** Card-free free-forever 512 MB, and the
Rust driver is good (C3 10/15), but the document model is a reuse
mismatch (C2 2/18) and it still needs a custom sync API layer.

**#16 — cr-sqlite + self-hosted server (FAIL — G1).** The CRDT
extension itself is a strong technical fit, but there is no managed
zero-card cloud: "Sync as a service" is only a roadmap item, and the
"community server" is dev-only. Running it in production means a paid
always-on host — which fails the zero-cost gate without the explicit
paid-infrastructure approval that was not sought. Maintenance cadence
also slowed through 2024-25.

## Decision

**Recommended: Scenario #2 — a Cloudflare Worker in front of one D1
database for the school**, with a per-device/per-school credential the
Worker verifies server-side and application-layer encryption of sync
payloads so the cloud copy is not plaintext PII.

**Next Best: Scenario #1 — a Cloudflare Worker in front of one
SQLite-backed Durable Object** — the first fallback if D1's replication
or consistency model proves awkward during implementation, and the path
that already has structural per-school isolation in hand if the scope
ever widens back to multiple schools.

**Third fallback (only if leaving Cloudflare): Scenario #5 — Turso
single database over HTTP** — the best non-Cloudflare SQLite-native
option, discounted today only for vendor-direction churn, not for
technical fit.

This is a genuine change from the prior unmerged draft, which chose
"Durable Object per school." The owner's 2026-09-03 narrowing to **one
database for one school** removed the multi-tenant structural-isolation
advantage that drove that pick, and rewarded D1's simpler
SQL-over-HTTP-from-Rust integration and faster time-to-value instead.

Both recommended options are **pure Cloudflare** — one vendor, one
card-free account, SQLite on both sides, an HTTP API the Rust core can
call directly, all three services GA, and a free tier that comfortably
holds one school with no inactivity auto-pause.

## What this ADR does NOT decide

Left for the implementation milestone (which gets its own ADR and a
mandatory `security-reviewer` pass per `.claude/rules/security-privacy.md`):

- **The sync unit** — per-record change log vs. whole-table diff vs.
  a SQLite session/`sqlite3_changeset` stream.
- **Conflict policy** for the same record edited on two devices —
  last-write-wins vs. field-level merge vs. an explicit teacher
  reconciliation UI. This is a teacher-usability question, not only a
  technical one.
- **The cloud credential shape** — how a device proves it belongs to the
  school (e.g. a signed per-device token issued during local login and
  verified by the Worker), following the "authorization from a trusted
  boundary, never client-supplied" rule.
- **Encryption of the cloud copy** — whether payloads are
  application-encrypted end-to-end (Worker/D1 sees only ciphertext) or
  the cloud store is merely access-scoped. E2E is strongly preferred and
  should be the default assumption.
- **Android specifics** — the same Worker/D1 endpoint serves it, but the
  Rust sync-client packaging for Android is its own task.
- **A backup strategy** — distinct from sync (multi-writer
  reconciliation). Litestream-style continuous replication to R2/B2 for
  disaster recovery is a separate future ADR.

## Consequences

- **No code changes.** `docs/ACTIVE-PLAN.md`'s "Out of Scope (current
  milestones)" still correctly lists cloud sync — this ADR unblocks a
  _future_ milestone, it is not that milestone.
- `SyncProvider` remains an unimplemented port. Nothing in
  `src/domain/`, `src/application/`, or `src/ui/` may reference
  Cloudflare, D1, a Worker, or any concrete provider — the adapter, when
  built, lives only in `src/infrastructure/`.
- Does not touch `src-tauri/src/db/`, `src-tauri/src/crypto/`, or
  `src-tauri/src/auth/`. Local SQLCipher-at-rest (ADR-0003) and the
  in-memory session model (ADR-0004) are unaffected; cloud sync stays a
  separate subsystem behind the port.
- `docs/product/PRODUCT-CONTRACT.md` §12 moves from "hypothesis, no ADR
  yet" to "target chosen by ADR-0065 (Cloudflare Worker + single D1;
  next best single Durable Object), not yet implemented; single database
  for one school for now."
- `docs/PROJECT-MEMORY.md` records the ratified target and the
  single-database scope.
- The prior draft on `origin/claude/cloudflare-likha-setup-a5oq5i` is
  superseded and should not be merged; its ADR-0042 filename collision
  is moot.
- The zero-cost + no-card gate is now a recorded constraint on any
  future infrastructure choice in this project, not just this one.
