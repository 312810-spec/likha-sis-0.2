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
guidance impose **no general data-localization requirement** for personal
data. Cross-border transfer is permitted with a lawful basis, a
comparable level of protection at the destination, and disclosure in the
app's privacy notice. A global / edge host is therefore not blocked by
the DPA itself.

This is necessary but **not sufficient**, and the gaps are load-bearing:
(1) DepEd's own data-governance issuances may impose stricter
learner-data rules or prohibit offshore processing outright — treated
here as a **decision-invalidating dependency** (see "Requirements this
ADR pins now"); (2) learner data is the personal data of minors
(heightened sensitivity, parental-consent and NPC-advisory overlay);
(3) transfer to the US has no adequacy finding, so "comparable level of
protection" is normally met by executing the provider's Data Processing
Addendum / standard contractual clauses — a contract task, not a
privacy-notice paragraph. All three are implementation-gating.

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
  activation require no credit or debit card. This is a **gate** claim,
  not a footnote — if a Recommended provider later adds a card
  requirement, that is a gate _failure_ and forces a re-selection, not a
  minor amendment. Re-verify at the start of the implementation
  milestone.
- **G3 — Provider terms permit storing application data:** the provider's
  acceptable-use / terms-of-service must allow using it as an
  application datastore. A platform whose ToS prohibits the use itself
  fails the gate no matter how capable it is — vendor size does not
  protect against a ToS action against the use.

### Scored criteria (100 points)

| #   | Criterion                                   | Points | What earns the points                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Security & device/school auth fit**       | 20     | Cloud endpoint authenticates "this device belongs to our school" from a server-side trusted boundary, never a client-supplied value (10). Transport encryption + the cloud copy holds **no plaintext learner PII** + a credential model that satisfies the minimum bar (10). Both are pinned in "Requirements this ADR pins now".                                                                                                                                                                                                       |
| C2  | **Domain-schema-reuse fit**                 | 18     | Cloud side is SQLite or a SQLite superset, so the shape of the **synced domain tables** (learners, sections, section membership, attendance, assessment items/scores, grading-period and curriculum reference data) transfers with minimal translation (12). No forced move to Postgres, a document model, or a bespoke data model (6). The synced set is an explicit allowlist (see "Requirements this ADR pins now"); auth/session/credential/local-audit tables are **not** in it.                                                   |
| C3  | **Rust / Tauri client fit**                 | 15     | Usable directly from the Rust core behind a `SyncProvider` port — an official Rust crate or a plain HTTP API callable with `reqwest`. A **JS-only SDK** forfeits most of these points: it means a second-language sidecar runtime (extra packaging, extra attack surface, weaker Android story, and a second local store competing with the mandated SQLCipher SQLite), and most such engines also imply a Postgres source of truth. Driving sync from the React renderer instead would trip `scripts/check-architecture.mjs` outright. |
| C4  | **Offline-first / local-first fit**         | 12     | The model is "local SQLite is the source of truth, sync is explicit or background," not "the cloud is the database" (8). A usable primitive to build conflict handling on — transactional remote storage, an append-only change log, or CRDT support (4).                                                                                                                                                                                                                                                                               |
| C5  | **Vendor stability & free-tier durability** | 15     | Vendor size / capitalization, product maturity (GA, not beta), and **no in-flight pivot of the exact feature we would depend on** (9). Free tier explicitly perpetual, with **no multi-day inactivity auto-pause** that a teacher would experience as "sync silently stopped" (6).                                                                                                                                                                                                                                                      |
| C6  | **Simplicity & time-to-value**              | 12     | Single database, few moving parts, a small endpoint surface to author and secure (7). How quickly a first real authenticated round trip is reachable (5).                                                                                                                                                                                                                                                                                                                                                                               |
| C7  | **`SyncProvider` boundary cleanliness**     | 8      | The whole integration lives in `src/infrastructure/` behind the port; nothing leaks into domain / application / UI; swappable later without touching business logic.                                                                                                                                                                                                                                                                                                                                                                    |

## The 20 scenarios

Scored out of 100 against the metric above. Gate failures are marked and
their scores are advisory only (they cannot be selected).

| #   | Scenario                                                                                                  | Gate          | Score         |
| --- | --------------------------------------------------------------------------------------------------------- | ------------- | ------------- |
| 2   | **Cloudflare Worker + one D1 database for the school**                                                    | PASS          | **90**        |
| 1   | **Cloudflare Worker + one SQLite-backed Durable Object for the school**                                   | PASS          | **87**        |
| 4   | Cloudflare Worker + one Durable Object per school (`idFromName(school_id)`)                               | PASS          | 82            |
| 3   | Cloudflare Worker (stateless) + R2 append-only encrypted changeset log, merge in LIKHA's Rust domain      | PASS          | 81            |
| 5   | Turso single database over the HTTP API (no replica)                                                      | PASS          | 81            |
| 7   | Turso "Turso Sync" (new explicit `push()` / `pull()` local-first model)                                   | PASS          | 80            |
| 6   | Turso embedded replica via legacy `libSQL sync()` (Rust `libsql` crate)                                   | PASS          | 77            |
| 20  | Private GitHub repo as an encrypted changeset store (git as transport), GitHub API + a login-issued token | **FAIL (G3)** | 73 (advisory) |
| 17  | `sqliteai/sqlite-sync` CRDT extension + managed "SQLite Cloud" / "SQLite AI"                              | PASS          | 68            |
| 8   | Neon (serverless Postgres) + a thin custom Worker/Function sync endpoint                                  | PASS          | 55            |
| 9   | Supabase (Postgres) + Row-Level Security                                                                  | PASS          | 52            |
| 11  | PowerSync (managed) + a Postgres backend                                                                  | PASS*         | 48            |
| 18  | Firebase Firestore (Spark free plan), driven from a Rust sidecar / REST                                   | PASS          | 45            |
| 19  | MongoDB Atlas M0 + a custom sync API                                                                      | PASS          | 45            |
| 12  | ElectricSQL Cloud (managed) + Postgres                                                                    | FAIL (not GA) | 45            |
| 13  | Triplit (integrated client/server sync DB)                                                                | PASS*         | 45            |
| 10  | Neon Postgres + ElectricSQL sync (Postgres → SQLite read path)                                            | PASS          | 44            |
| 14  | InstantDB (local-first Firebase alternative)                                                              | PASS*         | 42            |
| 15  | Jazz (`jazz.tools`, local-first + Jazz Cloud)                                                             | PASS*         | 42            |
| 16  | cr-sqlite (vlcn) CRDT extension + self-hosted / community sync server                                     | **FAIL (G1)** | —             |

`PASS*` = the cost and card gates pass, but the scenario has **no Rust
client** (C3), so it would require a second-language sidecar runtime —
non-viable for this Rust/Tauri codebase. See the per-scenario notes.
`FAIL (G3)` on #20 = using a source-code host as an application datastore
is against GitHub's acceptable-use terms; a ToS action would be a total
sync outage. Its 73 is advisory only.

### Per-scenario reasoning

**#2 — Cloudflare Worker + one D1 database (Recommended, 90).**
D1 _is_ SQLite (C2 17/18 — the synced domain tables' relational shape
carries over almost unchanged). Its query API is plain SQL over HTTPS,
callable from the Rust core with `reqwest` behind the port — no JS SDK,
no sidecar (C3 14/15). A single Worker with one D1 binding is the
smallest possible surface to author and secure, and the fastest path to
a first authenticated round trip (C6 11/12). Cloudflare is the largest,
best-capitalized vendor in the set; D1 is GA (since 2024); the free tier
(5 GB, 5M row reads/day, 100k rows written/day) is explicitly perpetual
with no inactivity pause, and **no card is required to create the
account** — the standard free plan is card-free (the only card-gated
Cloudflare free product is Zero Trust, irrelevant here) (C5 14/15). The
account-wide 5 GB storage cap that made D1 the _next_-best in the prior
draft is a non-issue at single-school scale.

Two caveats that do not change the pick but the implementation milestone
must handle: (1) with the mandatory application-side encryption of
PII-bearing payloads (see below), D1 is **not** a queryable relational
mirror — it is an opaque encrypted changeset store, so row-level merge
happens in LIKHA's Rust domain, not in a SQL query on the Worker. That
is what the Sync Rule wants anyway, but it means D1's C2/C4 edge over
the R2 changeset log (#3) is **narrower than the raw 90-vs-81 gap
suggests**. (2) The 100k-rows-written/day and 5M-rows-read/day free caps
are untested against a realistic first-run backfill (the whole school's
learners + historical attendance + grades) and an end-of-quarter
grade-sync spike, or a weeks-offline catch-up — the implementation must
model peak-day volume and batch/coalesce changesets. Offline-first is a
construction task either way (C4 9/12); boundary is clean (C7 8/8);
security/auth 17/20 assumes the credential minimum bar below is met.

**#1 — Cloudflare Worker + one SQLite Durable Object (Next Best, 87).**
Everything good about #2, plus a single-threaded actor that serialises
writes for cleaner consistency (C1 18/20). It loses to #2 on the axes
the single-school scope now rewards: you author a Durable Object class
(more non-Rust surface than D1's pure SQL-over-HTTP, C3 13/15), the DO
SQLite storage API is newer and less battle-tested than D1 (C5 13/15),
and Worker + DO + lifecycle is more moving parts than one D1 binding for
a single school (C6 9/12). The first fallback if D1's write/consistency
model proves awkward during implementation.

Note this is **one Durable Object for one school** — it is _not_
multi-tenant structural isolation (that is #4, DO-per-school). Its only
isolation advantage over #2 is a shorter migration path to #4 if the
scope ever re-widens to multiple schools. Re-widening is itself a new
ADR plus a security review, and at that point a shared D1 with only
`WHERE school_id = ?` as the tenant boundary is **not acceptable** — it
is exactly the client-supplied-scope pattern ADR-0004 rejected locally,
the same class as the bootstrap self-grant bug this project caught once.

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
risk. Keep as the fallback if both D1 and DO are somehow unworkable —
but note that once #2's mandatory payload encryption turns D1 into an
opaque changeset store too, the real distance between #2 and #3 is
mostly #3's from-scratch merge-protocol risk, not a data-model gap.

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

**#20 — Private GitHub repo as an encrypted changeset store
(FAIL G3; 73 advisory).** Genuinely zero-cost and card-free, uses
infrastructure the project already depends on, and git is essentially an
offline changeset log. **Disqualified on G3**: using a source-code host
as an application datastore is against GitHub's acceptable-use terms, so
GitHub/Microsoft's size (which the advisory score credited) is no
protection — a ToS action against the use is a total sync outage.
Independently also weak: no transactions, API rate limits, and
concurrent-writer resolution via git refs is fiddly. Not a sync
substrate to build on.

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
TypeScript (± Dart / Swift / Kotlin). **None has a Rust client**
(accurate as of early 2026). LIKHA's database layer is Rust (the Tauri
core), so adopting one means either driving sync from the React
renderer — which `scripts/check-architecture.mjs` blocks outright — or
running a Node/JS **sidecar**. A sidecar is technically "infrastructure"
and would not trip the boundary check, but it brings a whole
second-language runtime to package and secure, a worse Android story,
and a second local store competing with the mandated SQLCipher SQLite.
Most also imply a Postgres cloud source of truth (C2 penalty), and
PowerSync's free project deactivates after 1 week idle. Net: do not pick
any of these — the same conclusion the prior draft reached for
Firestore, for the sharper reason that there is no Rust path at all.

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
database for the school**, subject to the requirements pinned in the
next section (per-device revocable credential verified server-side;
no plaintext learner PII in the cloud copy; a trusted-boundary device
enrollment ceremony).

**Next Best: Scenario #1 — a Cloudflare Worker in front of one
SQLite-backed Durable Object** — the first fallback if D1's replication
or consistency model proves awkward during implementation. It is a
shorter migration path to a per-school Durable Object (#4) _if_ the
scope ever re-widens to multiple schools; it is not itself multi-tenant
isolation.

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

## Requirements this ADR pins now (not deferred)

These are settled here because a bad default on any of them would be a
security or privacy regression the implementation milestone should not
have to argue against from scratch:

- **Data minimisation — an explicit sync allowlist.** Only domain
  tables sync: learners, sections, section memberships, attendance,
  assessment items and scores, enrolment, and grading-period /
  curriculum reference data. **Authentication, session, credential
  (`users.password_hash`), and local-only audit tables
  (`audit_log`, ADR-0021) never leave the device.** Argon2id hashes and
  session rows are not eligible for sync under any conflict/merge design.
- **No plaintext learner PII in the cloud copy.** Learner data is the
  personal data of minors; the local DB is SQLCipher-encrypted and fails
  closed (ADR-0003); privacy/security is this project's first priority.
  PII-bearing payloads are therefore **encrypted application-side before
  they are sent**; only non-PII sync metadata (record ids, tombstones,
  version vectors, timestamps) may be cleartext. "Merely access-scoped,
  protected by a bearer credential" is **off the table**. The encryption
  scheme and key management are deferred; the requirement is not.
- **Device enrollment is a trusted-boundary ceremony.** How a brand-new
  device obtains its _first_ cloud credential is the direct analogue of
  the ADR-0004 first-membership bootstrap — where this project twice
  shipped a hole (an unauthenticated self-grant path, and a
  SELECT-then-act singleton race). Enrollment **must** be gated by a
  trusted boundary: an authenticated local session plus a school-scoped
  enrolment secret held only by a legitimately provisioned school actor.
  It **must not** be an endpoint any device can call to register itself,
  and its guard must not be a check-then-act race.
- **Credential minimum bar.** The deferred credential must be
  (a) **per-device**, never one shared secret baked into the app binary;
  (b) issued server-side off an authenticated local login or the
  enrolment ceremony above; (c) **individually revocable**, with an
  independent Worker-side revocation check on every request — the cloud
  mirror of ADR-0004's independent DB `revoked_at` lookup;
  (d) not derivable from the shipped binary. It is deliberately a **new,
  longer-lived credential class** (a background sync after a process
  restart cannot prompt for a password), a conscious divergence from
  ADR-0004's in-memory non-resumable session — not a "mirror" of it, and
  not licence for `remember-me` semantics on the local login.
- **DepEd data-governance is a decision-invalidating dependency.** The
  RA 10173 / NPC position (no data-localisation mandate; cross-border
  transfer permitted with a lawful basis, comparable protection, and
  disclosure) is necessary but not sufficient. Before implementation,
  confirm DepEd's own data-governance issuances (e.g. DepEd Order
  No. 58, s. 2017 and successors) do not impose stricter learner-data
  handling / data-sharing-agreement / consent rules or prohibit
  offshore processing outright. **If they prohibit it, the Cloudflare
  pick is void** and this ADR must be re-run against
  Philippines-hostable options.

## What this ADR does NOT decide

Left for the implementation milestone (its own ADR + a mandatory
`security-reviewer` pass per `.claude/rules/security-privacy.md`):

- **The sync unit** — per-record change log vs. whole-table diff vs.
  a SQLite session / `sqlite3_changeset` stream.
- **Conflict policy** for the same record edited on two devices —
  last-write-wins vs. field-level merge vs. an explicit teacher
  reconciliation UI. A teacher-usability question, not only a technical
  one.
- **The encryption mechanism and key management** — the scheme itself,
  where the sync key lives, how it is shared across a school's devices so
  device B can decrypt device A's writes, its relationship to the
  DPAPI-protected SQLCipher key (ADR-0003: never silently mint a
  replacement), and what key loss means for the cloud copy.
- **The exact credential format and its rotation cadence** (the minimum
  bar above constrains it; the format does not).
- **Device de-provisioning** when a teacher leaves or a membership is
  revoked (ADR-0057 handles the local side): revoking the matching cloud
  credentials, and whether that device's local copy is then rendered
  stale.
- **Sync-event auditing** — extending the ADR-0021 audit log to record
  push/pull, auth failures, credential rejections, and anomalous volume.
- **Replay protection / write idempotency** — a bearer credential is
  replayable; changeset writes need idempotency keys or nonces so a
  replayed changeset cannot double-apply or resurrect a tombstoned row.
- **Per-device rate limiting and anomaly thresholds at the Worker** — a
  stolen credential with no rate limit is unbounded PII exfiltration
  within the free-tier read allowance, and a deliberate quota burn is a
  free-tier-specific denial of service for the whole school.
- **Cloud-copy lifecycle on erasure** — RA 10173 right to erasure,
  learner transfer-out, and account deletion all need a targeted delete
  from the cloud copy (and Cloudflare's backups); a purely append-only
  changeset log that never forgets is in tension with this.
- **Sync-health visibility** — surfacing "last successful sync" in-app so
  a silent stop (provider issue, revoked credential, network) is visible
  to a teacher rather than failing quietly.
- **Peak-volume modelling** — the free-tier 100k-rows-written/day and
  5M-rows-read/day caps must be checked against a realistic first-run
  backfill, an end-of-quarter grade-sync spike, and a weeks-offline
  catch-up, with changeset batching/coalescing designed accordingly.
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
- The zero-cost + no-card + ToS-permits-app-data gate (G1/G2/G3) is now
  a recorded constraint on any future infrastructure choice in this
  project, not just this one.
- **Independent review:** a `security-reviewer` pass on this ADR
  returned **CHANGES-REQUIRED (non-blocking)** — no blocking findings for
  a decision-only ADR, three must-fix doc edits (data-minimisation
  allowlist; cloud-copy PII encryption as a requirement; device-
  enrollment trusted-boundary callout) plus should-fix items, all
  folded into this version. Full findings:
  `.planning/wave5-sync-target/` / session scratchpad
  `security-review-adr-0065.md`.
