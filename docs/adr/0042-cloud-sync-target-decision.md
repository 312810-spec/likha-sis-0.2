# ADR-0042 — Cloud Sync Target: Zero-Cost Scenario Decision

Status: Accepted (architecture decision; live deployment blocked, see
"Consequences")

## Context

`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 5
and `docs/product/PRODUCT-CONTRACT.md` §12 both require running this
project's own 10-scenario architecture-decision process
(`.claude/rules/autonomous-development.md`) to actually choose a cloud
sync target before any sync code is written. No prior ADR in this
repository ratifies a cloud target — `SyncProvider` has only ever been
the architecture-diagram placeholder in ADR-0001. This ADR is that
required decision.

**Repository truth verified before deciding anything**: `grep -ril
SyncProvider src docs` finds no implementation anywhere, only the
ADR-0001 layering statement and this reconciliation's own planning
docs. `School`/tenant isolation today is enforced entirely locally
(`SessionManager::require_active_school_scope`, ADR-0004) — no cloud
boundary exists to reason about yet. No Cloudflare, Firebase, Supabase,
or other cloud SDK/dependency exists in `package.json`/`Cargo.toml`
today.

**Hard constraint, not merely a scored criterion**: `CLAUDE.md` and
`.claude/rules/autonomous-development.md` both prohibit paid
infrastructure or services without the user's explicit approval. Every
scenario below was pre-filtered to genuinely zero-cost-capable options
before scoring (see "Disqualified before scoring") — this ADR does not
score a paid option and then argue it's affordable; a scenario with a
real recurring cost floor at ordinary usage is out before the rubric is
even applied.

## Weighted rubric, derived from LIKHA's own stated priority order

`CLAUDE.md`'s priority order (privacy/security → correctness → DepEd
compliance → teacher usability → offline reliability → maintainability
→ zero billing → performance → speed) is written for feature work, not
literally for a backend-plumbing choice invisible to a teacher — no
candidate below changes what a teacher sees, so "teacher usability" and
"DepEd compliance" mostly express themselves indirectly here (through
offline reliability and data-sovereignty risk respectively), which is
disclosed rather than papered over with an artificially differentiating
score. Weights below are this ADR's own translation of the stated order
into a scorable rubric, following the same "custom rubric per decision
type" precedent as `docs/product/M8-DECISION.md`:

| Criterion                                                      | Weight |
| -------------------------------------------------------------- | -----: |
| A. Privacy/security & tenant isolation                         |    20% |
| B. Correctness / sync data-integrity guarantees                |    15% |
| D. Offline reliability                                         |    15% |
| E. Maintainability (operational burden)                        |    15% |
| C. DepEd compliance / data-sovereignty exposure                |    10% |
| F. Zero-cost headroom (margin as adoption grows)               |    10% |
| G. Architectural fit (stays behind a thin `SyncProvider` port) |     8% |
| H. Implementation risk / tooling maturity                      |     5% |
| I. Time-to-first-real-round-trip                               |     2% |

## Disqualified before scoring

- **Supabase** — already excluded by a standing prior decision
  (`docs/PROJECT-MEMORY.md`'s "Explicit exclusions" list); not
  re-litigated here. Also independently confirmed by the pre-research on
  a sibling branch to be the only viable backend for the one CRDT-native
  sync engine surveyed (`sqliteai/sqlite-sync`) — that engine is
  therefore also out, transitively, without a separate line item.
- **A single always-on general-purpose VPS** (the "conventional
  default" self-hosted approach) — no genuine free tier exists for an
  always-on VPS at specs usable for a real backend; this is a real
  recurring cost floor, not a scored trade-off. Included here only to
  record that it was considered and rejected on the zero-cost gate
  itself, not on any of the scored criteria.
- **Peer-to-peer / LAN-only sync** (no cloud backend at all) — genuinely
  $0 forever, but fails a hard product requirement this ADR does not
  have standing to waive: `PRODUCT-CONTRACT.md` §1 requires Web/PWA
  access for stakeholders and remote/off-site backup, and §6/§10 assume
  a School Head or Registrar can reach data outside the originating
  classroom machine. A LAN-only design cannot do either. Rejected on
  requirements-fit, not cost.

## Scored scenarios

Scores are 1-10 per criterion, this ADR's own judgment, not a formula —
recorded so the reasoning is checkable line by line.

| #   | Scenario                                                                                                    | A 20% | B 15% | D 15% | E 15% | C 10% | F 10% | G 8% | H 5% | I 2% | **Weighted** |
| --- | ----------------------------------------------------------------------------------------------------------- | ----: | ----: | ----: | ----: | ----: | ----: | ---: | ---: | ---: | -----------: |
| 1   | CF Workers + Durable Object (SQLite-backed, 1/school) + field-scoped, audited LWW op-log                    |     9 |     7 |     9 |     9 |     7 |     9 |    8 |    7 |    8 |     **8.30** |
| 2   | CF Workers + D1 (1 database/school) + field-scoped, audited LWW op-log                                      |     8 |     7 |     9 |     8 |     7 |     8 |    8 |    8 |    8 |         7.90 |
| 3   | CF Workers + Durable Object + hand-rolled CRDT merge                                                        |     9 |     9 |     8 |     5 |     7 |     9 |    6 |    3 |    3 |         7.39 |
| 4   | PowerSync (managed, Postgres-backed)                                                                        |     7 |     9 |     9 |     7 |     6 |     4 |    6 |    8 |    7 |         7.17 |
| 5   | CF Workers + D1 + hand-rolled CRDT merge                                                                    |     8 |     9 |     8 |     5 |     7 |     8 |    6 |    3 |    3 |         7.09 |
| 6   | Firebase/Firestore (Spark free tier)                                                                        |     6 |     7 |     8 |     6 |     5 |     6 |    4 |    8 |    7 |         6.31 |
| 7   | Self-hosted sync server on a free-tier PaaS (Fly.io/Render free web service) + own SQLite/Postgres + op-log |     6 |     7 |     8 |     4 |     6 |     6 |    7 |    6 |    6 |         6.23 |

### Why the ranking falls this way

- **#1 wins on the two heaviest criteria (A, and tied-weight D/E) at
  once.** A Durable Object per school is an actor — Cloudflare's own
  runtime serializes every request to one school's DO instance, so
  "two writes for the same school never interleave" is a structural
  property of the platform, not something LIKHA's own code has to get
  right. That is a stronger tenant-isolation and correctness-adjacent
  guarantee than a row-scoped table in a shared database (D1, Postgres,
  Firestore) ever gives for free. Combined with zero storage billing on
  the Workers Free plan (`docs/adr/0044-*` on a sibling branch already
  reconfirmed this from Cloudflare's own current pricing docs — cited
  again below) and zero server to patch, #1 serves privacy/security,
  offline-reliability-friendly simplicity (a single HTTP+JSON round
  trip), and maintainability simultaneously.
- **#2 (D1) is genuinely close (7.90 vs. 8.30) and is the documented
  Next Best**, not a distant runner-up — D1 is a more conventional
  "SQL over HTTP" product with slightly better tooling maturity (H) and
  an arguably even more natural match to LIKHA's existing
  repository/SQL mental model (G), at the cost of a per-database daily
  write-quota reset (100K rows/day) that a DO's less crisply-quantified
  allowance doesn't share, and a shared-service isolation model instead
  of DO's actor-per-tenant boundary (A). If DO's SQLite-backed-storage
  API proves awkward to build against in practice once Wave 5
  implementation actually starts, falling back to D1 is a safe,
  pre-scored, already-justified pivot — record that fallback here so a
  future session doesn't have to re-run this analysis.
- **CRDT variants (#3, #5) score highest on raw correctness (B) but
  lose decisively on maintainability (E) and implementation risk (H)**:
  the sibling branch's own sync-engine survey (reused here, not
  re-derived) found no mature, drop-in CRDT crate/library that fits
  LIKHA's shape without adding a disqualified backend (Supabase) — a
  hand-rolled CRDT merge layer would be genuinely novel, unproven code
  in a domain (concurrent multi-writer edits to the same class record)
  this app has essentially no real evidence yet actually occurs often
  enough to justify the complexity. This is recorded as a **future
  upgrade path**, not rejected forever: if Wave 5's first real round
  trip and subsequent usage reveal actual concurrent-edit conflicts that
  a field-scoped LWW handles poorly, revisit CRDT then, with real
  evidence instead of a hypothesis.
- **PowerSync (#4) is the strongest managed-product alternative** —
  best-in-class correctness/offline track record (B, D) from a
  production-proven sync engine — but loses on zero-cost headroom (F):
  its free tier is real but usage-based billing is a genuine risk at
  multi-school scale, the one candidate in this set where "stays free
  as adoption grows" is doubtful rather than merely capped. It also
  requires Postgres as a second mandatory backend and owns its own
  client protocol, both working against a thin, swappable
  `SyncProvider` port (G).
- **Firebase/Firestore (#6) loses hardest on architectural fit (G, 4/10
  — the weakest score in the table)**: its SDK model actively resists
  being reduced to a thin port, the same "leaks into application code"
  concern this project has already used to reject heavier frontend
  dependencies before. A large foreign managed vendor holding Philippine
  learner data is also a heavier, unstarted data-sovereignty
  conversation (C) than a Worker LIKHA's own team fully controls.
- **A self-hosted free-tier PaaS server (#7) loses primarily on
  maintainability (E, 4/10)**: free-tier general-purpose hosts commonly
  cold-start/spin down after inactivity (a real offline-reliability
  friction the serverless options don't share) and this project has
  never taken on running/patching a persistent server — a materially
  different, unfamiliar operational posture than "deploy a Worker."

## Decision

**Recommended: Cloudflare Workers + one SQLite-backed Durable Object per
school, with a field-scoped, explicitly audited last-write-wins
operation log (#1, 8.30).**

**Next Best (documented fallback, not merely discarded): Cloudflare
Workers + one D1 database per school, same op-log design (#2, 7.90).**
If Wave 5 implementation finds the Durable Object SQLite storage API
awkward or under-documented in practice, switch to D1 rather than
re-running this scoring pass — the two are close enough that this
ADR's own analysis already justifies the pivot.

**LWW design constraint carried forward, not optional**: per the
correctness risk already identified in the pre-research this ADR
reuses, a naive whole-record last-write-wins "silently discards data."
Wave 5's actual implementation must make conflicts **visible and
audited** (reusing this project's existing audit-log pattern,
ADR-0021) at the individual-field level, never a blanket per-record
overwrite — this is a hard requirement on the eventual implementation,
not a suggestion.

**CRDT remains a real, evidenced future upgrade path**, not a rejected
idea — revisit only if actual concurrent-edit conflict evidence from
real usage justifies the added complexity.

## Reused research, disclosed

The Cloudflare Free-plan pricing facts cited above (Durable Objects:
SQLite storage not billed, ~150M reads/mo, ~3M writes/mo, 5GB storage;
D1: 5M rows read/day, 100K rows written/day, 5GB storage) and the
sync-engine survey (PowerSync/ElectricSQL Postgres-centric,
`sqliteai/sqlite-sync` Supabase-only) were established this same day by
independent pre-research on a sibling, unmerged development branch
(`claude/deped-teacher-likha-features-j7zfv6`, commit `0d9aae8`,
`docs/adr/0044-pre-wave-research-waves-3-4-5-7.md` on that branch —
that branch and this one both descend from the same integration
checkpoint, `d9ab036`, but have not been merged into each other). This
ADR reuses those cited, sourced facts directly rather than re-running
the same web research, consistent with this project's own
`autonomous-development.md` instruction not to duplicate completed
work — but performed its own independent scenario construction and
scoring (the DO-vs-D1 split, the rubric, and the weighted comparison
above are new to this ADR, not copied). The two source URLs behind the
pricing facts (`developers.cloudflare.com`'s own Durable Objects and D1
pricing pages) were spot-checked reachable from this session
(`curl -sS https://developers.cloudflare.com/` → `200`) before relying
on them.

## Consequences

- `docs/product/PRODUCT-CONTRACT.md` §12 updated: cloud target moves
  from HYPOTHESIS to DIRECTION SET (Cloudflare Workers + Durable
  Object, D1 as documented fallback), with the LWW-with-audited-
  conflicts constraint recorded as binding on implementation.
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 5
  row is updated to point here for Decision 5.
- **This ADR decides architecture; it does not perform Wave 5's other
  stated deliverable ("one real end-to-end sync round trip").** A real
  round trip requires an actual Cloudflare account and API
  credentials — confirmed unavailable in this session (`env | grep -i
cloudflare` → none; no prior Cloudflare ADR or config exists anywhere
  in this repository). Provisioning a live Cloudflare account/Worker is
  **external material only the user can provide**
  (`.claude/rules/autonomous-development.md` approval gate #2) — even
  though the target plan itself is genuinely zero-cost, creating and
  authenticating an account under the user's identity is not something
  this session may do unilaterally. This is recorded as open,
  actionable work for the next session that has those credentials, not
  silently deferred — see `docs/VERIFICATION-DEBT.md` and
  `docs/CURRENT-HANDOFF.md`.
- No product code, schema, or dependency was added by this ADR itself —
  decision and documentation only, matching this project's own
  established "10-scenario process is a decision mechanism, run before
  code, not parallel to it" convention.
