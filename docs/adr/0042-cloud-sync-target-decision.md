# ADR-0042 — Cloud Sync Target Decision

Status: Accepted

## Context

No cloud/sync code exists anywhere in this repository. `SyncProvider` is
only the architecture-diagram placeholder from ADR-0001's layering
statement. A prior planning pass (ADR-0035, `docs/product/PRODUCT-CONTRACT.md`
§12, `docs/PROJECT-MEMORY.md`) recorded "Cloudflare Worker + Durable
Object (next-best: Worker + D1)" as the **current working hypothesis**
for Wave 5 sync, explicitly **not** ratified, with an explicit
instruction to run this project's own 10-scenario architecture-decision
process before treating it as decided. This ADR is that process. It is a
**decision-only milestone** — no `SyncProvider` implementation, no
Worker code, and no schema changes ship with it. Cloud sync remains
listed in `docs/ACTIVE-PLAN.md`'s "Out of Scope (current milestones)"
until a follow-up implementation milestone actually builds against the
target chosen here.

**Requirement recap**, from `CLAUDE.md`/`docs/product/PRODUCT-CONTRACT.md`:
the cloud target must sit behind the `SyncProvider` port only (UI/domain/
application code never reaches toward it directly); school-tenant
isolation must be enforced at a trusted server-side boundary, never a
client-supplied parameter or UI-only filter, matching the exact pattern
`SessionManager::require_active_school_scope` already established for
the local session boundary (ADR-0004); SQLite/SQLCipher stays the
device's primary working database — cloud is sync, not the source of
truth for a teacher's local work; zero paid infrastructure without
explicit approval (LIKHA priority order, 7th of 9); and it must
eventually also serve a future Android client, not just Windows.

**Research method, disclosed honestly.** A `dependency-researcher` agent
was dispatched to gather current (2026) facts on seven concrete
candidates. It completed real work (29 tool uses, ~80-83K tokens, across
two attempts — the initial dispatch and the one permitted retry per
`.claude/rules/autonomous-development.md`'s reviewer-failure rule) but
returned no retrievable findings text either time — the same recurring
agent-resume/retrieval failure this project has hit before (see
`docs/VERIFICATION-DEBT.md`). Per that rule, the retry was not repeated
a third time; the research was instead performed directly in this
session via `WebSearch`, cited inline below. This is recorded as
resolved-by-substitution, not silently dropped — see
`docs/VERIFICATION-DEBT.md`.

**Data-residency check (Philippines).** The Data Privacy Act of 2012
(RA 10173) and current National Privacy Commission guidance impose
**no data-localization requirement** for personal data (unlike some
neighboring jurisdictions) — cross-border transfer is permitted given a
lawful basis (typically consent) and "a comparable level of protection"
at the destination, per NPC's own cross-border-transfer advisory
material. This removes what would otherwise be a hard blocker on any
edge/global host (Cloudflare, Turso) — a global platform is legally
viable for Philippine schools' data provided the app's privacy notice
discloses it, which is a documentation/consent task for the eventual
implementation milestone, not an architecture blocker today.

### Rubric

Same weights this project has used for every prior scenario pass
(`docs/product/M8-DECISION.md`, reused as-is by ADR-0013 for its own
schema-structure decision, per `docs/PROJECT-MEMORY.md`'s "no
`SCENARIO-RUBRIC.md` file exists" note — no new rubric file was created
here either): Teacher Value 20%, DepEd Alignment 15%, Dependency
Readiness 10%, Reuse 10%, Architectural Fit 10%, Security Safety 10%,
Implementation Risk 10% (10 = low risk), Testing Confidence 5%, Future
Leverage 5%, Time-to-Value 5%.

Two criteria are reinterpreted for an infrastructure decision, the same
way ADR-0013 disclosed reinterpreting criteria for a schema decision:
**Teacher Value** here means indirect impact on the teacher's experience
of sync (reliability, no silent outage/pause, offline robustness) rather
than a directly-visible feature; **DepEd Alignment** here means
compliance/data-sovereignty alignment (residency, cross-border-transfer
safety) rather than curriculum/forms alignment, since a cloud backend
choice has no direct DepEd-policy content of its own.

### Ten scenarios considered

| #   | Scenario                                                                               | Weighted score                              |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **Cloudflare Workers + Durable Object (SQLite-backed storage), one DO per school**     | **7.95**                                    |
| 2   | Turso/libSQL, one database per school, embedded-replica client sync                    | 7.80                                        |
| 3   | Cloudflare Workers + D1, one D1 database per school                                    | 7.20                                        |
| 4   | Turso/libSQL, single shared database with a `school_id` column                         | 6.45                                        |
| 5   | Cloudflare Workers + D1, single shared database with a `school_id` column              | 6.40                                        |
| 6   | Firebase/Firestore (Spark free plan)                                                   | 6.10                                        |
| 7   | Custom: Cloudflare Worker (stateless) + R2 per-school changeset log, client-side merge | 6.00                                        |
| 8   | Litestream (SQLite → R2/B2 replication)                                                | 5.80 — **disqualified**, wrong problem      |
| 9   | PocketBase, self-hosted (Fly.io/Railway)                                               | 5.70 — **disqualified**, fails zero-billing |
| 10  | Supabase (Postgres) + Row-Level Security                                               | 5.40                                        |

Full reasoning per scenario:

**#1 — Cloudflare Durable Object, SQLite-backed, one per school (Recommended).**
Now GA with a real embedded-SQLite storage API (up to 10GB per object);
free tier ~150M rows read/month, ~3M rows written/month, 5GB storage,
and the Workers Free plan is explicitly protected from the SQLite
storage-billing change that took effect January 2026 — a genuinely
zero-billing path, not just "free until a surprise bill." Scores highest
on **Architectural Fit and Security Safety** of any candidate: a Durable
Object is a single-threaded actor with its own physically separate
storage, addressed by `idFromName(school_id)` — tenant isolation is
_structural_, not a `WHERE school_id = ?` a future query could omit.
That is the closest cloud-side mirror of this project's own hard rule
(school scope derived from a trusted boundary, never a client-supplied
or easily-forgotten filter) of any option evaluated. Cloudflare is also
the most mature, best-capitalized vendor among all real contenders,
lowering long-term platform-continuity risk. Weaker on Time-to-Value and
Testing Confidence — the SQLite-storage Durable Object API is newer than
D1, and sync/merge logic above the storage layer is still hand-built
either way.

**#2 — Turso/libSQL, one database per school, embedded replicas (Next Best).**
The single closest technical match to LIKHA's _existing_ architecture of
any candidate (Reuse scored 10/10): Turso's embedded-replica model puts
an actual local SQLite file inside the client, read with zero network
latency, writing locally and syncing to the cloud on demand — which is
almost exactly "offline writes save locally first" as a vendor-supplied
primitive rather than something LIKHA has to build from scratch. Free
tier (5GB storage, ~500 databases, 500M row reads/month) is generous.
It loses to #1 on **Dependency Readiness**: this session's research
surfaced that Turso is now steering users away from libSQL's own sync
mode toward its own proprietary "Turso Sync," a live product-direction
change during exactly the research window for this ADR — a real
signal of ecosystem churn for a smaller, less-capitalized vendor than
Cloudflare, on a decision meant to hold for years of school deployments.
Close enough (7.80 vs. 7.95) that if Cloudflare's Durable Object storage
API proves awkward during the actual implementation milestone, this is
the first fallback to re-evaluate, not scenario #3.

**#3 — Cloudflare D1, one database per school.** A more conventional
"real SQL database over HTTP" shape, which the existing Rust repository
layer would find very familiar. Loses to #1 mainly on Architectural Fit/
Security Safety: D1's 5GB storage ceiling is **account-wide**, shared
across every database in the account, not per-database — as the number
of onboarded schools grows, they compete for one shared cap in a way a
Durable Object's per-object storage does not. Still a credible fallback,
and worth knowing D1 remains available if Durable Objects' actor
programming model turns out to fit the existing Rust command/repository
style poorly in practice.

**#4/#5 — shared-database, `school_id`-column variants (Turso and D1).**
Both score meaningfully lower on **Architectural Fit (4/10) and Security
Safety (4/10)** — this is precisely the pattern ADR-0004 already
rejected for the _local_ session boundary (a client-supplied `school_id`
re-checked per-query is strictly weaker than deriving it from a trusted
boundary with no parameter to forget). Replicating that same weaker
pattern server-side would reintroduce, at cloud scale, the exact class
of bug this project's security rules exist to prevent. Rejected.

**#6 — Firebase/Firestore.** Firestore's official offline SDKs are
genuinely best-in-class, but they target JavaScript/mobile clients
directly — using them from this project's Rust/Tauri backend would mean
either driving Firestore's REST/gRPC API by hand from Rust (losing the
SDK's offline engine, the entire reason to consider it) or letting the
frontend call Firestore directly, which violates the hard rule that
UI/domain code never reaches toward a concrete infrastructure provider.
Firestore's NoSQL document model is also the largest **Reuse** mismatch
of any candidate (2/10) against 41 migrations of relational SQLite
schema. The Spark free plan additionally lost free Cloud Storage in a
2026 pricing change — a live signal that free-tier terms here are less
stable than Cloudflare's. Rejected.

**#7 — Custom Worker + R2 changeset log.** The purest interpretation of
"cloud is not repository business logic" (Architectural Fit 7/10) — a
Worker that is a dumb relay for append-only per-school changesets in R2,
all merge/conflict logic staying in LIKHA's own domain code. Rejected
primarily on **Implementation Risk (3/10)**: building a correct,
race-free, multi-writer conflict-resolution protocol entirely from
scratch is one of the harder correctness problems in distributed
systems, with a real risk of subtle data-loss bugs a managed platform's
tested primitives (D1/DO's transactional storage, Turso's replica
protocol) would already have handled. Worth remembering as a fallback
only if both Cloudflare and Turso turn out to be unworkable for a reason
not yet known.

**#8 — Litestream.** Disqualified independent of score, the same way
ADR-0013 disqualified a scenario regardless of its numeric rank:
Litestream is continuous single-writer replication for backup/disaster-
recovery, not a solution to the actual requirement (reconciling
concurrent edits from multiple teacher devices/sessions per school). It
remains a good candidate for a **future, separate** backup-strategy ADR,
not this one.

**#9 — PocketBase.** Disqualified independent of score, same mechanism:
this session's research found Railway's PocketBase hosting runs ~US$5-10/
month baseline and Fly.io no longer offers a genuinely free always-on
tier with a persistent volume — there is no route to running this that
satisfies the zero-billing gate without explicit paid-infrastructure
approval, which was not sought and is not warranted for a decision-only
milestone.

**#10 — Supabase.** Lowest-scoring live candidate. The free tier's
7-day-inactivity auto-pause (confirmed current for 2026) is a direct,
realistic teacher-facing failure mode for a school app with naturally
irregular usage — semester breaks, long weekends, a slow-adopting
school — that would surface as "sync silently stopped working" with no
in-app explanation, exactly the kind of failure this project's teacher-
usability priority exists to prevent. Postgres is also the largest
relational-but-not-SQLite mismatch (Reuse 3/10) among the SQL
candidates. Additionally, `docs/PROJECT-MEMORY.md` already records "no
Supabase migration" as a standing exclusion from an earlier planning
session — this scenario's low score is independently consistent with
that prior instruction, not overridden by it (the exclusion was recorded
for the UI/Forms Deepening Program context specifically; this scoring
pass reaches the same conclusion on its own merits for the sync-target
question).

## Decision

**Recommended: Cloudflare Workers + Durable Objects, SQLite-backed
storage, one Durable Object per school**, addressed by
`idFromName(school_id)`. **Next Best: Turso/libSQL with embedded
replicas, one database per school** — the fallback to re-evaluate first
if Durable Objects' actor model proves a poor fit during actual
implementation, given how close the two scored (7.95 vs. 7.80) and how
strongly Turso fits this project's existing SQLite-first shape.

This ADR ratifies the **target only**. It does not implement
`SyncProvider`, does not create a Worker, and does not touch the
schema. Per `docs/product/PRODUCT-CONTRACT.md` §15's own stated
definition of success ("a sync protocol proven via one real round trip,
not a full feature set") and §14's non-goal ("speculative cloud features
beyond proving the architecture"), the natural next milestone — not
started here — is a minimal proof-of-concept: one Worker, one Durable
Object, one real authenticated round trip of a single sync record for
one school, behind a first-cut `SyncProvider` port in
`src/domain/ports/`, before any general sync feature is built. That
milestone should get its own ADR addendum or follow-up ADR once the
concrete Durable Object storage-API shape is proven against this
project's actual Rust command/repository conventions, and its own
`security-reviewer` pass (mandatory per `.claude/rules/security-privacy.md`
for any milestone touching persistence or sync) before being considered
complete.

Cloud authentication/authorization for that future round trip is
explicitly **not** designed by this ADR — it needs its own decision
(e.g., a signed per-device/per-school credential issued during local
login, verified by the Worker) once real implementation begins, and must
follow the same "authorization derived from a trusted boundary, never a
client-supplied value" rule already established locally.

## Consequences

- No code changes. `docs/ACTIVE-PLAN.md`'s "Out of Scope (current
  milestones)" still correctly lists "cloud sync" — this ADR is the
  decision that unblocks a _future_ milestone, not that milestone
  itself.
- `docs/PROJECT-MEMORY.md`'s cloud-target note is updated from
  "hypothesis, not ratified" to "ratified by ADR-0042, not yet
  implemented."
- `docs/VERIFICATION-DEBT.md` gets a new entry recording the
  `dependency-researcher` retrieval failure and the direct-research
  substitution, consistent with how every prior instance of this same
  harness issue has been logged rather than silently worked around.
- Future implementation milestone must additionally decide: the exact
  sync unit (per-record change log vs. whole-table diff), conflict
  policy for concurrent edits to the same record from two devices
  (last-write-wins vs. field-level merge vs. explicit teacher
  reconciliation UI — a real product-usability question, not just a
  technical one), and the cloud-side authentication credential shape —
  none of these are decided here.
- Does not touch `src-tauri/src/db/`, `src-tauri/src/crypto/`, or
  `src-tauri/src/auth/` — the local encryption-at-rest (ADR-0003) and
  session (ADR-0004) foundations are unaffected; cloud sync remains a
  separate subsystem behind the `SyncProvider` boundary, per
  `docs/architecture/ARCHITECTURE.md`'s Sync Rule.
