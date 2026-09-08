# ADR-0083: Anecdotal / Guidance Records

Status: Accepted
Date: 2026-09-08

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s award-eligibility work
(`src/domain/award-eligibility.ts`) carries a currently-hardcoded-false
"no disciplinary anecdotes" check -- there is no entity yet to answer it
truthfully. Separately, teachers/advisers need an ordinary, everyday
guidance-records tool: a per-learner narrative log (positive
commendations, routine observations, concerns) with a follow-up trail,
independent of and broader than the honors-eligibility use case.

This data is a real per-learner narrative record. Structurally and
sensitivity-wise it is almost identical to DO 006 Child Protection's
`behavioral_incidents`/`incident_interventions` (migration 44,
**ADR-0072**): one narrative row per learner, scoped to the section it
was recorded in, plus an append-only follow-up/resolution log. This
batch (Batch 12) deliberately reuses that exact structural and
authorization template rather than designing a new one.

## Decision

### Data model (migrations 57-58)

- `anecdotal_records`: one row per guidance entry -- `category`
  (`positive`/`negative`/`neutral`), `entry_date`, `narrative`,
  `authored_by_user_id`, scoped by `school_id`/`section_id`/`learner_id`.
  No status-transition columns (no `resolved_at` analogue) -- unlike a
  behavioral incident, a guidance record has no "closed" state to
  transition into; it is a running narrative history.
- `anecdotal_record_followups`: **append-only**, exactly mirroring
  `incident_interventions`'s discipline. No repository function in
  `repository::anecdotal_record` issues an `UPDATE` or `DELETE` against
  this table -- a correction or follow-up is always a new row
  referencing the same anecdotal record, proven by
  `add_followup_appends_without_touching_earlier_entries`.
- Migration 58 widens the `entity_kind` allowlist (`sync_outbox`,
  `sync_hub_log`, `sync_conflict_review`, `sync_version_cache`) to add
  `anecdotal_record`/`anecdotal_record_followup`, the same 12-step
  CHECK-widening rebuild as every prior entity kind addition (migrations
  24, 26, 36, 41, 47, 48, 53, 54, 56).

  **Sequencing note**: unlike some earlier batches, this batch's
  Checkpoint 1 commit includes both migration 57 (the new tables) and
  migration 58 (the `entity_kind` widening) together, rather than
  deferring 58 to Checkpoint 4. This is a scheduling choice, not an
  architecture change -- widening a `CHECK` allowlist is inert until an
  `EntityKind` variant and a command path actually reference the new
  string, so shipping it early carries no risk, and it avoided a second
  12-step rebuild edit to the same four tables later in the batch.
  Checkpoint 4 still does all the _code-side_ sync wiring (the Rust
  `EntityKind` variants, `upsert_from_sync`, the sync-aware command
  wrapper, `apply_decrypted_change` arms, `ConflictEntityPreview` typed
  variants) exactly as scoped.

### Category is deliberately generic, not disciplinary-only

The task that motivates this entity (a future `award-eligibility.ts`
wiring) only needs a disciplinary signal, but guidance records serve
much broader purposes than honors eligibility -- commendations, routine
observations, and concerns that are not disciplinary at all. Overfitting
`category` to `disciplinary`/`non-disciplinary` would misrepresent most
of what an adviser actually records here and would need a breaking
schema change the first time a school wanted to log a commendation. This
batch uses a generic `positive`/`negative`/`neutral` classification
instead -- honest about the record's real purpose, and still sufficient
for a future eligibility check to treat `negative` entries as the
disciplinary-adjacent signal it needs.

**This batch does NOT wire `anecdotal_records` into
`award-eligibility.ts`'s hardcoded-false anecdotes check.** That wiring
is explicitly a future batch's job (see the task that scoped this
batch) -- this batch only builds the entity so it is ready.

### Authorization: reuses `authorize_child_protection_access_for_section` directly, not a sibling

ADR-0072 established `auth::authorize_child_protection_access_for_section`
for exactly this shape of problem: a section's current adviser, or a
School Head, may read/write a per-learner narrative record scoped to
that section; a bare Teacher with no adviser relationship to the section
is denied. This batch's authorization need is **genuinely identical**,
not merely similar:

- Same actors (section adviser, or School Head, in their own school).
- Same shape of tenant-scoping bug class to guard against (a forged
  `section_id` from a different school).
- Same sensitivity class (a real per-learner narrative, not routine
  reference data).
- No divergent requirement anywhere in this batch's scope that would
  need a different rule (e.g. no "Guidance Counselor" role exists in
  this codebase yet -- ADR-0072 already names that as the natural future
  extension point if one is ever added).

Given that, this module reuses `authorize_child_protection_access_for_section`
**directly** -- every `commands::anecdotal_record` command calls it
unchanged, with no new authorization function, no new `Capability`
variant, and no fork of its logic. Writing a near-identical sibling
function here would have duplicated ADR-0072's exact reasoning and its
exact test coverage (adviser allowed, non-adviser Teacher denied, School
Head allowed, cross-school forged-section denied, no-session fails
closed) for no behavioral difference -- a real maintenance liability
(two functions that must be kept in lockstep forever) with no
compensating benefit. If a future batch discovers a genuine divergence
(e.g. a Guidance Counselor role that should see anecdotal records but
not behavioral incidents, or vice versa), that is the point to fork,
not before.

**Command-level defense in depth**: `add_anecdotal_record_followup` and
`list_anecdotal_record_followups` additionally verify the target
`anecdotal_record_id` actually belongs to the authorized `section_id`,
matching `commands::child_protection::add_incident_intervention`'s own
guard against a forged parent-record reference from a different
section.

## Consequences

- No new `Capability` variant, no new authorization test suite --
  ADR-0072's existing test suite in `auth::mod`'s test module already
  proves the gate's correctness exhaustively; this batch's own tests
  (`commands::anecdotal_record::tests`) prove the command layer calls
  that gate correctly and that its result composes with this entity's
  own repository functions, without re-deriving the gate's own
  correctness.
- If DO 006 Child Protection's authorization rule is ever changed (e.g.
  narrowed, or a distinct Guidance Counselor carve-out is added), this
  module's access rule changes with it automatically, for better or
  worse -- an explicit, accepted coupling, not an oversight. A future
  session changing `authorize_child_protection_access_for_section` must
  re-check this module's own behavior too.
- Same append-only guarantee, same tenant-isolation guarantee, and the
  same "no natural key besides `id`" shape as `behavioral_incidents`/
  `incident_interventions` -- confirmed by
  `anecdotal_records_has_no_unique_constraint_besides_id_so_no_collision_scenario_exists`.

## Verification

- Checkpoint 1: `cargo test --lib anecdotal_record` (9 repository tests:
  CRUD round trip, section/learner scoping, append-only follow-up,
  no-unique-constraint collision-scenario disclosure, sync upsert
  insert/update/idempotency). `cargo clippy --all-targets -- -D
warnings`: clean. `cargo fmt --check`: clean.
- Checkpoint 2: `cargo test --lib anecdotal_record` (15 tests total,
  6 new command-layer tests: category parsing incl. rejecting a
  disciplinary-only value, authorized-adviser create+list+followup round
  trip, Teacher-denied, School-Head-allowed, tenant isolation). `cargo
clippy --all-targets -- -D warnings`: clean. `cargo fmt --check`:
  clean.
- See `docs/CURRENT-HANDOFF.md`'s Batch 12 entry for the full checkpoint
  ledger and whichever checkpoints landed in this session.
