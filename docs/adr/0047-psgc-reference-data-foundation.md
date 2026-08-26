# ADR-0047: External API & Government Reference-Data Foundation (PSGC)

Status: Accepted
Date: 2026-08-26

## Context

Wave 2G's brief asked for a production-quality pattern for
external/public reference-data providers, without making LIKHA
dependent on Internet availability — first concrete target: PSA's
Philippine Standard Geographic Code (PSGC), because learner addresses
and future SF1 workflows need authoritative Philippine geographic
identifiers. The brief also required classifying eleven other external
providers (PSCED, OpenSTAT, Cloudflare Turnstile, Tauri Biometric,
Tauri Barcode/QR, Tauri Updater, DepEd integration, GeoRisk/PHIVOLCS/
PAGASA, Philippine eGov interoperability, scraping services, AI
providers) and implementing only the one reusable vertical slice PSGC
represents.

## Fidelity disclosure (read this first)

**PSA's own PSGC API site (`psa.gov.ph/classifications-api/psgc`)
returned HTTP 403 Forbidden when fetched from this development
environment** — the same disclosed network-egress gap to Philippine
government sites already recorded for `deped.gov.ph`/`lis.deped.gov.ph`
in ADR-0042 and ADR-0043's own Fidelity Disclosure sections. This means
PSA's real, current field-level schema, exact code-length convention,
and update-distribution mechanism could not be independently verified
here. Two community (non-PSA) sources were reachable and gave partial,
mutually-inconsistent detail: `psgc.cloud` (a community-run JSON mirror
that explicitly disclaims official status and recommends independent
verification) confirmed a 4-level administrative hierarchy (Region →
Province → City/Municipality → Barangay) and zero-auth JSON access;
separate web search results described the PSGC code format as
`RRPPMMBBB` (a 9-digit code: 2-digit region, 2-digit province, 2-digit
city/municipality, 3-digit barangay) in most sources, but at least one
source described a barangay's own self-contained code as 10 digits —
this discrepancy was not resolved and is not needed to be, per the
design decision below.

**Consequence for this design**: every PSGC code is stored and treated
as an **opaque authoritative string** — this module never slices,
parses, or derives hierarchy from a code's digit positions. `level` and
`parent_code` are their own explicit columns, taken directly from
whatever source data is imported, never derived from the code's shape.
This is the same "isolate the unverifiable assumption behind one
narrow, retargetable module" strategy ADR-0043 already used for SF1's
column layout.

## Ten-scenario decision

Ten viable designs were evaluated against LIKHA's priorities (privacy/
security, offline correctness, zero billing, reliability/recovery,
maintainability, school isolation/scale, implementation complexity,
provider independence):

1. **Direct runtime API calls to PSA on every address lookup** — rejected: makes ordinary teacher workflows depend on Internet + a third-party government service being up; violates "offline reliability" outright; PSA's API was not even reachable from this environment to build/test against.
2. **Locally cached remote data, refreshed transparently in the background** — rejected: same reachability problem, plus a background sync process is exactly the kind of "silent network dependency" the brief explicitly warned against; no HTTP client exists in this project's dependency tree today (a real, non-trivial addition to justify).
3. **Server-proxied government API (LIKHA's own backend relays PSA)** — rejected: LIKHA has no backend/cloud service today; building one only for this would be a large, out-of-scope infrastructure addition and a new paid-hosting question.
4. **Worker-managed reference-data distribution (e.g. a Cloudflare Worker mirroring PSA)** — rejected: introduces a new paid/managed dependency and an operational surface (who refreshes it, who pays for it) with no current owner; explicitly against "no paid infrastructure without approval."
5. **Application-release-bundled snapshot (data ships with each LIKHA release)** — a real contender; provenance is fixed and reviewable in git, but ties every PSGC refresh to a full app release even though PSA publishes quarterly, and risks this project bundling geographic data it could not itself verify as accurate under LIKHA's own name.
6. **Provider-neutral reference-data adapter behind a local-file importer, with NO direct app-to-PSA network call** (file-picker import, mirroring SF1's `dialog:allow-open` pattern) — **Recommended**, see below.
7. **Maximum-control self-hosted PSA mirror/database** — rejected as far beyond this milestone's narrow scope; a full infrastructure project, not a reference-data foundation.
8. **Minimal/conservative no-API path (hardcode a short fixed list of regions only)** — rejected: too limited to be useful for real address entry, and "hardcoded in Rust source" is worse for future updates than a versioned, re-importable snapshot table.
9. **Community-mirror live API integration (call `psgc.cloud` directly at runtime)** — rejected: `psgc.cloud` explicitly disclaims official/authoritative status; building a compliance-relevant SIS feature against an unverified community mirror as a live runtime dependency is not defensible, and it still creates an online dependency for a workflow that must work offline.
10. **Unconventional: treat PSGC as ordinary imported reference data using the exact same transactional-commit shape already proven for SF1 import** (`import::commit`'s all-or-nothing transaction pattern, reused rather than reinvented) — this is effectively how option 6 is implemented; folded into the recommendation below rather than kept separate.

**Recommended and implemented: option 6** — a local-file importer
(admin/registrar picks a PSGC snapshot file via the same `dialog:
allow-open` capability SF1 import already uses; no new Tauri capability
was needed), which parses and validates the file, then commits it as a
new versioned generation of rows in local SQLite behind a
provider-independent repository port. **No HTTP client dependency was
added anywhere in this milestone** (`src-tauri/Cargo.toml` is
unchanged) — the brief's own "Recommended" hypothesis (live PSA sync)
is explicitly what this ADR does **not** implement, per the brief's own
switch condition: _"Switch to the runner-up if direct PSA
synchronization proves unstable, poorly versioned, operationally
brittle, or unnecessarily complex."_ The evidence for switching is
concrete, not speculative: PSA's own API could not even be reached to
inspect from this environment, which is a stronger disqualifier than
"brittle" or "complex."

**Next best**: option 5 (release-bundled snapshot) — revisit if a
future concrete requirement needs PSGC data present out-of-the-box on
first install with no admin action required, and only once a genuinely
verified PSA source (or an authorized data-sharing arrangement) exists
to bundle from. **Snapshot provenance is not left ambiguous either
way**: `authoritative_version`/`authoritative_published_at` are read
only from the imported file's own declared content (see below), never
operator-typed and never inferred from the local import timestamp — so
switching to option 5 later only changes how the file arrives at the
importer, not the importer's contract.

## Architecture implemented

```
Teacher/Registrar UI (not built this wave; see "UI scope" below)
        |
Application Service layer (not built this wave)
        |
commands::reference_geo   (Tauri commands — the only network-agnostic boundary)
        |
import::psgc               (parse + validate an untrusted snapshot file)
        |
repository::reference_geo  (transactional, versioned commit + read)
        |
SQLite (reference_geo_snapshots, reference_geo_units — migration 20)
```

- **`import::psgc`** (`src-tauri/src/import/psgc.rs`): parses a JSON
  snapshot file (this project's own invented format — see Fidelity
  Disclosure), validates it as a whole (non-empty source name and
  version, non-empty unit list, a hard `MAX_UNITS = 100_000` ceiling,
  every unit has a non-blank code/name and a recognized `level`, no
  duplicate codes, no `parent_code` dangling to a nonexistent code
  within the same file), and returns units sorted by level
  (region → province → city_municipality → barangay). PSGC is a strict
  4-level tree, so a level-only sort is sufficient to guarantee every
  unit's parent is inserted before it — no full topological sort
  needed.
- **`repository::reference_geo`** (`src-tauri/src/repository/
reference_geo.rs`): `record_snapshot` runs the entire import —
  snapshot-row insert, every unit-row insert, and flipping which
  snapshot `is_current` — inside one `rusqlite::Transaction`, the same
  all-or-nothing shape `import::commit::commit_import` already proved
  for SF1. `current_snapshot`/`list_units` are plain read queries, no
  network client anywhere in this module.
- **`commands::reference_geo`** (`src-tauri/src/commands/
reference_geo.rs`): `import_psgc_snapshot` (write, gated behind
  `Capability::ManageLearners` — see "Authorization" below),
  `get_current_psgc_snapshot`/`list_psgc_units` (read, gated behind only
  `require_active_school_scope`, i.e. any authenticated session, no
  specific capability — matching how routine address lookups will
  actually be used).

The UI/domain layers never import PSA-specific networking libraries,
because there is no PSA-specific networking library in this codebase at
all — the only I/O `import::psgc`/`commands::reference_geo` perform is
reading a local file the caller already picked.

## Schema and versioning design (migration 20)

`reference_geo_snapshots` / `reference_geo_units` (see migration 20's
own comment in `db::migrations` for the full DDL) are deliberately:

- **Global, not school-scoped.** Every other table in this schema
  carries `school_id`; PSGC data is public national reference data, not
  school-owned data, so it has no `school_id` column at all. This is a
  disclosed exception, not an oversight.
- **Append-only / versioned, never updated in place.** Each import
  creates a new `reference_geo_snapshots` row (immutable generation)
  plus its own full set of `reference_geo_units` rows. Nothing is ever
  deleted or renamed. Only one snapshot per `source_name` is ever
  `is_current = 1`; that flag flips atomically in the same transaction
  that finishes writing the new snapshot's units. This is what lets a
  historical geographic reference stay valid forever even after a
  future PSA release renames or restructures a unit — the old code and
  name simply remain in the table under their original snapshot,
  immutable — **without this project inventing a rename/supersession
  mapping PSA's own public data did not clearly expose to us from this
  environment** (the brief's own instruction: "if historical/
  supersession semantics are not adequately exposed by PSA, explicitly
  document the limitation instead of inventing a mapping").
- **`authoritative_version`/`authoritative_published_at` are distinct
  from `imported_at`.** The former two come only from the snapshot
  file's own declared `version`/`publishedAt` fields (rejected outright
  if `version` is blank); `imported_at` is a separate
  `DEFAULT (strftime(...))` local timestamp of when this installation
  ran the import. Nothing conflates "when we downloaded this" with
  "what PSA says this data's authoritative version is."
- **Duplicate-version re-import is a recognized no-op, not silently
  re-duplicated or hard-rejected.** `record_snapshot` checks
  `(source_name, authoritative_version)` before writing anything; a
  repeat import of the same version returns
  `SnapshotImportOutcome::AlreadyImported` without touching
  `is_current`, matching this project's established
  re-import-is-recognized convention already used by
  `section_membership::enroll`.
- **Self-referencing foreign key**, `(snapshot_id, parent_code) ->
(snapshot_id, code)`, backed by the `UNIQUE (snapshot_id, code)`
  index migration 20 also creates. A `parent_code` of `NULL` (a
  region's top-of-hierarchy case) trivially satisfies a `NULL` foreign
  key per SQLite's own semantics. This catches a dangling parent (one
  that doesn't exist anywhere in the snapshot) at the database layer,
  in addition to `import::psgc`'s own earlier, more legible rejection
  of the same case within the file. **It is not sufficient on its own**
  for a same-level parent/child pair, though — independent review found
  the FK only checks that _some_ row with that code exists, not that
  it's exactly one level up, so whether a same-level malformed pair was
  caught depended on incidental file row order. `import::psgc` now also
  checks level-adjacency explicitly (every parent must be exactly one
  `level_rank` below its child) before the data ever reaches this
  layer, closing that gap deterministically — see "Independent review
  findings and fixes" below.

## Offline / failure / recovery behavior

- **Normal reads never touch the network.** `get_current_psgc_snapshot`/
  `list_psgc_units` are plain local SQLite queries — proven directly by
  `reference_geo::tests::reads_never_require_network_and_survive_a_reconnect`,
  which closes the connection entirely and opens a brand new one against
  a real file-backed database before reading (an earlier version of this
  test read on the same live connection it imported through and did not
  actually reconnect — fixed after independent review; see below).
  Internet loss has zero effect on already-imported PSGC data, exactly
  as the brief required: a teacher can open/edit an authorized learner
  (and, in future work, look up an address) whether or not any
  government API is reachable.
- **A failed/interrupted import leaves the previous valid snapshot
  untouched and still current.** Proven directly by
  `reference_geo::tests::a_failure_inside_record_snapshot_itself_preserves_the_previous_current_snapshot`,
  which constructs a malformed `PsgcSnapshot` directly and calls
  `record_snapshot` itself, so the self-referencing foreign key fires
  from inside the function under test and the transaction rolls back
  entirely (no partial snapshot row survives, and the prior snapshot's
  `authoritative_version` is still what `current_snapshot` returns). An
  earlier version of this test hand-rolled its own separate transaction
  and never called `record_snapshot` at all — fixed after independent
  review; see "Independent review findings and fixes" below.
- **A malformed/hostile file is rejected before any database write is
  attempted** — `import::psgc::parse_and_validate` runs entirely before
  `repository::reference_geo::record_snapshot` is ever called, and
  `commands::reference_geo::import_psgc_snapshot` bounds the file read
  itself (`MAX_SNAPSHOT_FILE_BYTES = 64 MiB`) before parsing begins.
- **No installation is ever left with zero usable PSGC data as a side
  effect of an import attempt** — the "no snapshot has ever been
  imported yet" state (a fresh installation before its first import)
  is treated as a normal, expected condition by both read commands
  (`get_current_psgc_snapshot` returns `None`, `list_psgc_units` returns
  an empty `Vec`), never an error.

## Security and privacy

- **No learner PII is ever part of a PSGC request.** There is no
  request at all in this implementation — the only I/O is reading a
  local file the caller already selected via a file dialog. This
  trivially satisfies the brief's "PSGC/reference-data requests must
  contain no learner PII" requirement, since no network request exists.
- **External content is treated as untrusted input** even though it
  claims to represent authoritative government data: bounded file size,
  bounded unit count (`MAX_UNITS`), explicit schema validation via
  `serde`'s `Deserialize`, explicit business-rule validation (duplicate
  codes, dangling parents, blank fields) before any row reaches SQLite,
  and the database's own foreign key as a second, independent layer of
  the same guarantee.
- **Write authorization**: `import_psgc_snapshot` requires
  `Capability::ManageLearners` (Registrar or School Head), the same gate
  `create_learner`/`preview_sf1_import` already use — deliberately
  reused rather than inventing a new capability variant for a single
  action, per the brief's own anti-premature-abstraction instruction.
  This is a disclosed exception to this project's usual
  "capability-implies-school-scoped-effect" pattern: the write's effect
  (a new current snapshot) is visible to every school on the
  installation, not just the caller's own, but the check itself still
  meaningfully restricts _who_ may trigger it. Every import is
  attributed to the acting user (`imported_by_user_id`/
  `imported_by_username` on `reference_geo_snapshots`, via
  `authorize_capability_with_actor`, same pattern as
  `sf1_import_history`) — added after independent review noted this
  table otherwise had no actor provenance at all.
- **Read authorization**: only `require_active_school_scope` (any live,
  non-revoked session) — no specific capability — matching how PSGC data
  will actually be consumed (address entry is expected to be a routine
  part of many workflows, not an admin-only action).
- **No secrets were added.** The chosen design needs none — there is no
  API key, token, or credential anywhere in this milestone's code.

## Provider classifications (all 12, per the brief's target

classifications, evidence-based)

| #   | Provider                                 | Target                                                                              | Evidence / notes                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | PSA PSGC                                 | **ADOPT** (implemented, local-import architecture — see above)                      | PSA's own API unreachable (403) from this environment; community mirror `psgc.cloud` confirmed the 4-level hierarchy but is explicitly non-authoritative.                                                                                                                                                                                                                                                                                                                  |
| B   | PSA PSCED                                | REFERENCE (PILOT only if a concrete reporting/interoperability requirement emerges) | National statistical curriculum classification; must never replace LIKHA's own DepEd curriculum/key-stage domain model (existing ADR-0037). No research spike performed this wave — no current caller exists.                                                                                                                                                                                                                                                              |
| C   | PSA OpenSTAT                             | REFERENCE/PILOT                                                                     | Potential future use: SMEA/school-planning analytics. No production runtime dependency introduced this wave.                                                                                                                                                                                                                                                                                                                                                               |
| D   | Cloudflare Turnstile                     | ADOPT selectively / **deferred**                                                    | Permitted future use only on internet-facing endpoints (account recovery, abuse-sensitive public/admin endpoints) — LIKHA has none today. Forbidden for any offline-required workflow (sign-in, attendance, grades, learner editing, SF forms). Not integrated this wave — no existing online endpoint needs it.                                                                                                                                                           |
| E   | Tauri Biometric                          | ADOPT direction (Android) / **deferred**                                            | Local re-authentication/unlock only, never a cloud identity/authorization mechanism, never a weakening of the existing session model. Exact Android support/secure-storage interaction not yet verified — deferred to when Android work actually begins.                                                                                                                                                                                                                   |
| F   | Tauri Barcode/QR                         | **PILOT**                                                                           | Potential future uses: learner ID, device provisioning, SF3/book monitoring. No speculative UI built this wave, per the brief's explicit instruction.                                                                                                                                                                                                                                                                                                                      |
| G   | Tauri Updater                            | ADOPT direction / **deferred**                                                      | Future requirement: signed releases, update failure must never brick or block ordinary offline work. No release service built this wave.                                                                                                                                                                                                                                                                                                                                   |
| H   | DepEd Integration                        | **WATCH** / strategic provider boundary, no code                                    | No official DepEd interoperability API exists to integrate against; LIS was already confirmed unreachable in ADR-0042/0043. No scraping, no invented API. This ADR itself is the "architectural decision/strategic seam" the brief asked for — a future real integration, if one is ever officially authorized, would sit behind a provider boundary shaped like `repository::reference_geo`'s own adapter/repository split, not a fresh design.                           |
| I   | GeoRisk/PHIVOLCS/PAGASA                  | REFERENCE/PILOT                                                                     | Potential future DRRM/safety context use. Guardrail: LIKHA must never present itself as a forecasting authority or infer class suspension from hazard data — that stays an LGU/DepEd decision. No production implementation this wave.                                                                                                                                                                                                                                     |
| J   | Philippine eGov interoperability         | **WATCH**                                                                           | No official use case, authorization path, or stable API contract exists yet to design against.                                                                                                                                                                                                                                                                                                                                                                             |
| K   | Scraping services (Firecrawl/Apify/etc.) | **REJECT** as a production SIS dependency                                           | Possible narrow future use only for isolated public-source compliance monitoring/research — never for authenticated LIS, never for learner PII, never storing portal credentials in a third-party scraping provider.                                                                                                                                                                                                                                                       |
| L   | AI providers                             | **DEFER**                                                                           | Future architecture should use a provider port (e.g. a `TeacherToolsAIProvider`), not direct UI-to-vendor calls — same shape this ADR used for PSGC (`import::psgc` / `repository::reference_geo` as the provider-independent seam). Hard guardrail for whenever this is built: real learner PII must never automatically enter an external AI request. Zero-additional-MCP-servers remains this project's standing decision (Wave 2F) and is unaffected by this research. |

Full detail for each row now also lives in `docs/SOURCE-REGISTRY.md`.

## UI scope

No UI screen was built this wave, by deliberate choice — the brief
explicitly permitted this ("prefer domain/repository/application-level
tests over premature UI"). SF1 was not redesigned or touched. The
minimal reusable pattern (import → validate → versioned commit → read)
is fully exercised by the test suite below; a future Wave 3+ screen can
call `commands::reference_geo`'s three commands directly without this
ADR's schema or repository contract needing to change.

## Independent review findings and fixes

Three independent reviews were dispatched (security/privacy,
reliability/architecture, teacher/compliance). All three converged
independently on the same root defect, which is the strongest signal in
this milestone's evidence: the read commands
(`get_current_psgc_snapshot`/`list_psgc_units`) hardcoded the literal
`"PSA PSGC"` as the source name to look up, while `import::psgc::parse_and_validate`
accepted **any** non-blank `sourceName` string from the imported file
with no allow-list. A file whose `sourceName` was anything other than
that exact string imported successfully (real rows written, a genuine
`snapshot_id`/`unit_count`) but became **permanently invisible** to
every read — indistinguishable from "nothing has ever been imported,"
with no schema-level backstop (`is_current` had only a plain index, not
a partial unique one) and no in-app remedy under this design's
deliberately append-only, no-delete schema. **Fixed**: `import::psgc`
now exposes `pub const EXPECTED_SOURCE_NAME: &str = "PSA PSGC"` and
rejects any import whose `sourceName` doesn't match it exactly, before
anything reaches the repository layer; the read commands now reference
this same constant instead of a second hardcoded literal, so there is
exactly one place this string is spelled. Migration 20 also gained a
schema-level backstop: `CREATE UNIQUE INDEX ... ON
reference_geo_snapshots(source_name) WHERE is_current = 1`, so this
class of bug is now impossible at the database level too, not merely
avoided by today's application code.

The reliability review additionally found the original
`a_failure_partway_through_an_import_preserves_the_previous_current_snapshot`
test never actually called `record_snapshot` — it hand-rolled its own
separate transaction and only proved that `rusqlite::Transaction` rolls
back on `Drop`, a general library property unrelated to this function's
own logic (this ADR's earlier "Proven directly by" claim for that
scenario was therefore inaccurate). **Fixed**: replaced with
`a_failure_inside_record_snapshot_itself_preserves_the_previous_current_snapshot`,
which constructs a malformed `PsgcSnapshot` directly (bypassing
`parse_and_validate`) and calls `record_snapshot` itself, so the
database's self-referencing foreign key fires from inside the function
under test. The same review found `reads_never_require_network_and_survive_a_reconnect`
never actually reconnected (it read on the same live connection it
imported through) — **fixed** by closing the connection entirely and
opening a fresh one against a real file-backed database before reading.

The reliability review also found the level-sort-before-insert strategy
accepted a malformed same-level parent/child pair whenever the "child"
happened to appear after its "parent" in the source file (the
self-referencing foreign key only checks that _some_ row with that code
exists, not that it's exactly one level up) — rejection was file-order-
dependent, not validity-dependent. **Fixed**: `parse_and_validate` now
checks that every unit's parent is exactly one level above it,
rejecting deterministically regardless of file order.

Both the security and reliability reviews independently flagged the
same two smaller gaps, both fixed: (1) `reference_geo_snapshots` had no
actor-attribution column, unlike `sf1_import_history` — added
`imported_by_user_id`/`imported_by_username`, populated via the same
`authorize_capability_with_actor` + `user::find_by_id` pattern
`commit_sf1_import` already uses; (2) the command layer had zero test
coverage at all, which is precisely what let the blocking finding above
go unnoticed — added `tests/reference_geo.rs`, an integration suite in
this project's established "standing in for the command" style (see
`tests/sf1_import.rs`), covering the import→read round trip, the
unexpected-source-name rejection, no-session rejection, and a teacher
(no `ManageLearners`) being blocked from importing but still able to
read.

Two further non-blocking findings recorded as accepted, not fixed this
wave: `list_units` had no index covering `(snapshot_id, level)` — added
`idx_reference_geo_units_snapshot_level` to migration 20 as a cheap
preemptive fix, since the migration hadn't shipped anywhere yet.
`SnapshotImportOutcome::AlreadyImported` previously returned `unit_count:
0`, which a future confirmation UI could misread as a failed/empty
import for a benign no-op — fixed by having it carry the existing
snapshot's real unit count instead.

The teacher/compliance review's remaining findings were judged non-
blocking documentation gaps rather than code defects, and are recorded
in "Remaining verification debt" below rather than acted on with new
code this wave, per the milestone's own scope-discipline instruction
not to expand beyond what a finding actually requires.

## Tests actually run

`cargo nextest run` (whole crate, **521 tests, 0 failures** — up from
515 after the review-driven additions/replacements above; includes 20
PSGC-specific tests plus all pre-existing suites, proving no
regression). `cargo test` (the stable-checkpoint gate) also run
directly: green, including doctests (0 exist). `cargo fmt --check`:
clean after `cargo fmt` was run following each edit round (never
hand-restyled). `cargo clippy --all-targets -- -D warnings`: clean, 0
warnings. `npm run quality` (typecheck, lint, `prettier --check`,
`check-architecture.mjs`, `vitest run`): clean, 438 TS tests passed, no
frontend files were touched this wave so this is a regression check,
not new coverage. `npm run build`: clean production build. `npm run
quality:security`: `cargo-deny` ran clean (advisories/bans/licenses/
sources all ok); `gitleaks`/`osv-scanner` were not installed on PATH in
this session (a disclosed local-tool-availability gap, not a new one —
see `docs/VERIFICATION-DEBT.md`) — CI's `.github/workflows/security.yml`
(Wave 2F) runs both regardless of local availability and is the
authoritative check for this milestone's dependency-free diff.

- `import::psgc::tests` (10 tests): parses a minimal valid snapshot;
  sorts units by level regardless of input order; rejects malformed
  JSON; rejects a missing version; rejects an empty unit list; rejects
  a duplicate code; rejects a dangling parent code; rejects a unit with
  a blank code or name; rejects an unrecognized source name; rejects a
  parent that is not exactly one level above its child.
- `repository::reference_geo::tests` (6 tests): imports a first
  snapshot and makes it current (and carries actor provenance); a
  repeat import of the same version is a recognized no-op reporting the
  real existing unit count (no duplicate snapshot row); a newer-version
  import becomes current while the older generation is preserved, not
  deleted; a failure genuinely inside `record_snapshot` preserves the
  previous current snapshot and leaves no partial row behind; lists
  units filtered by level and parent; reads survive a full connection
  close/reopen with no network access.
- `tests/reference_geo.rs` (4 integration tests, command-layer
  round trip): importing then reading back through the full
  authorize→parse→commit→read path; an unexpected source name is
  rejected at import time, not silently orphaned; no session can
  neither import nor read; a teacher without `ManageLearners` cannot
  import but can still read.

Migration idempotency for migration 20 specifically is covered the same
way this project already covers it for every other migration —
`db::tests::persists_across_reopen_of_the_same_file` reopens the same
database file twice, running `migrations().to_latest()` against an
already-migrated schema each time — rather than a new bespoke
per-migration idempotency test, matching the existing convention
(migrations 1–19 have no such individual test either).

## Dependencies added / rejected

**None added.** `src-tauri/Cargo.toml` is unchanged by this milestone.
The chosen architecture (local-file import, no live HTTP fetch) needed
no new HTTP client crate — the one dependency a live-PSA-sync design
would have required, and the one this ADR's ten-scenario decision
explicitly avoided committing to.

## Remaining verification debt

- PSA's authoritative field-level schema and exact code-length
  convention remain unverified from this environment (see Fidelity
  Disclosure). `import::psgc`'s snapshot file format is this project's
  own invented structure, isolated to one module, exactly as
  ADR-0043 already disclosed for SF1's workbook layout. The teacher/
  compliance review additionally noted that `GeoLevel`'s closed
  4-variant enum (region/province/city_municipality/barangay) would
  reject an entire real PSA-derived file outright if it ever contained
  a level this enum doesn't cover (e.g. Metro Manila districts,
  sub-municipalities) — not widened this wave, since no verified real
  PSA level taxonomy exists to widen it against; recorded here rather
  than guessed at.
- No production PSGC data has been imported or bundled anywhere in this
  repository — every test uses a small synthetic fixture (2–4 units),
  never real government data. A real, verified PSGC dataset must be
  sourced and imported by an admin before this feature has any teacher-
  visible effect; this is a deliberate, disclosed limitation, not an
  oversight. The teacher/compliance review further noted that producing
  such a file from PSA's real spreadsheet/PDF publications into this
  project's invented JSON shape is realistically a developer/technical
  task, not something a public-school registrar could self-serve —
  worth stating explicitly to whoever scopes a future distribution
  mechanism (this ADR's "Next best" option), rather than assuming the
  file-picker step is the hard part.
- No UI screen exists yet to drive `import_psgc_snapshot` — an admin
  today could only call it via a raw Tauri command invocation, not
  through any built screen. Deferred per this wave's own scope
  decision; a future milestone can add a minimal screen without needing
  this ADR's contract to change.
- **For whoever builds the future learner-address field**: key it on
  `reference_geo_units.code` (the opaque authoritative PSGC string),
  never on `reference_geo_units.id` or `snapshot_id` — `id` is a fresh
  UUID generated on every import, not stable across re-imports, so an
  FK to it would break every learner's address the next time an admin
  imports an updated PSGC snapshot. This was flagged by the teacher/
  compliance review as a real structural trap absent from this ADR's
  original text; recorded here explicitly so it isn't rediscovered
  under time pressure during SF1/address work.
- `gitleaks`/`osv-scanner` were not available on PATH in this session
  to run locally (see "Tests actually run" above) — not a new gap,
  consistent with this project's prior disclosed tool-availability
  debt; CI runs both regardless via `.github/workflows/security.yml`.
