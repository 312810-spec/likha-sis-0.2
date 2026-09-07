# Independent Security Review — SectionMembership / Subject / AssessmentItem / LearnerScore Sync Wiring

Date: 2026-09-07
Reviewer: independent read-only security-review agent (fresh context, no
prior involvement in implementing this feature).
Closes review debt recorded in `docs/VERIFICATION-DEBT.md`:
- "SectionMembership sync wiring (2026-09-06)"
- "Subject sync wiring (2026-09-06)"
- "AssessmentItem sync wiring (2026-09-06)"
- "LearnerScore sync wiring (2026-09-05/06)"

Design intent read first: `docs/adr/0067-school-laptop-authoritative-sync-hub.md`,
`docs/adr/0069-sync-payload-key-ceremony.md`. Also read the sibling review
`docs/reviews/2026-09-07-sync-payload-encryption-review.md` (found a BLOCKING
stale-live-value bug in SSPK rotation this same session) specifically to
check whether the same class of bug — a live-process value never refreshed
after a DB/file-level change — recurs in this scope.

Scope reviewed (read-only, adversarial):
1. `src-tauri/src/commands/section.rs` — `enroll_learner_membership`,
   `transfer_learner_membership`, `end_learner_membership` and their
   `*_with_optional_sync` wrappers, `enqueue_section_membership_sync_change`,
   `resolve_sspk_if_enrolled`.
2. `src-tauri/src/repository/section_membership.rs` — `upsert_from_sync`.
3. `src-tauri/src/commands/subject.rs` — `create_subject_with_optional_sync`.
4. `src-tauri/src/repository/subject.rs` — `upsert_from_sync`.
5. `src-tauri/src/commands/assessment_item.rs` — `create_assessment_item_with_optional_sync`.
6. `src-tauri/src/repository/assessment_item.rs` — `upsert_from_sync`.
7. `src-tauri/src/commands/learner_score.rs` — `record_learner_score_with_optional_sync`.
8. `src-tauri/src/repository/learner_score.rs` — `record`, `upsert_from_sync`.
9. `src-tauri/src/sync_client.rs` — the `EntityKind::SectionMembership` /
   `Subject` / `AssessmentItem` / `LearnerScore` arms in
   `apply_decrypted_change`, and `pull_once`'s batch-loop behavior on error.
10. Relevant schema in `src-tauri/src/db/migrations.rs` for each entity's
    table (unique/foreign-key constraints), since the risk that mattered most
    turned out to live at the schema level, not in the Rust match arms.

---

## BLOCKING — a legitimate (non-malicious) concurrent write on two devices to
## `Subject`, `LearnerScore`, or `SectionMembership` can permanently wedge
## sync for the ENTIRE SCHOOL, not just that one entity, with no automatic
## recovery

**Files/lines:**
- `src-tauri/src/repository/subject.rs:16-23` (`create`), `:42-57`
  (`upsert_from_sync`) and `src-tauri/src/db/migrations.rs:245-251`
  (`subjects` table: `UNIQUE (school_id, name)`)
- `src-tauri/src/repository/learner_score.rs:93-163` (`record`), `:178-206`
  (`upsert_from_sync`) and `src-tauri/src/db/migrations.rs:349-363`
  (`learner_scores` table: `UNIQUE (assessment_item_id, learner_id)`)
- `src-tauri/src/repository/section_membership.rs:1175-1198`
  (`upsert_from_sync`) and `src-tauri/src/db/migrations.rs:92-111`
  (`section_memberships` table:
  `CREATE UNIQUE INDEX idx_one_active_membership_per_learner ON
  section_memberships(learner_id) WHERE ends_on IS NULL`)
- `src-tauri/src/sync_client.rs:490-514` (`pull_once`'s batch loop: `break`
  on any `Err(())`, cursor never advances past the failing change)

**Evidence:**

All three of these tables carry a genuine business-level `UNIQUE` constraint
on a column set **other than** the row's own primary-key `id`:
`subjects(school_id, name)`, `learner_scores(assessment_item_id, learner_id)`,
and `section_memberships`'s partial unique index enforcing "at most one open
membership per learner." Each entity's own local write path
(`subject::create`, `learner_score::record`, `section_membership::enroll`)
correctly conflicts on that natural key so a single device's own repeated
writes update in place rather than duplicate.

But every one of these entities' `upsert_from_sync` (the function that
materializes a *pulled* change from another device) is a plain
`INSERT ... ON CONFLICT(id) DO UPDATE` keyed **only** on the row's own
`id` — deliberately, per each function's own doc comment, so that a change
originating on another device (which necessarily has a different, freshly
minted `id` for what is semantically the same natural-key entity) round-trips
without needing a second materializer. This is fine as long as no two
devices independently create a competing row for the *same natural key*
before either device has synced. But nothing prevents that:

- **Subject**: two devices, each offline, each running `create_subject` for
  the same subject name (e.g. two teachers separately adding "MAPEH" for the
  same school before either has completed an initial sync) each get their
  own fresh `Uuid::now_v7()` id, both succeed locally (`subjects(school_id,
  name)` only conflicts against rows the *local* DB already has). Both push
  successfully to the hub (`push_change`, `sync_hub.rs:91`, only checks
  `base_version` against the hub's own per-entity-id version counter — it has
  no idea two different `entity_id`s collide on `name`, since the payload is
  end-to-end encrypted and the hub is a zero-knowledge relay, confirmed by
  reading `push_change`/`pull_since` in `repository/sync_hub.rs`). When
  device A pulls device B's `Subject` row, `upsert_from_sync` issues
  `INSERT (id=B's-id, school_id, name=...)`, which is a **brand-new** `id` as
  far as SQLite's `ON CONFLICT(id)` target is concerned, but it collides with
  device A's own existing row on the *separate* `UNIQUE (school_id, name)`
  index — a constraint an `INSERT ... ON CONFLICT(id) DO UPDATE` clause does
  **not** suppress (SQLite only resolves the conflict target actually named
  in the `ON CONFLICT` clause; any other violated unique index still raises
  a hard constraint-violation error). This is a real inaccuracy in the
  function's own doc comment, which claims "This bypasses `create`'s own
  `UNIQUE (school_id, name)` conflict path entirely" — it does not bypass
  the constraint, it still hits it; it only bypasses `create`'s *code path*.
- **LearnerScore**: identical shape. `record`'s own insert conflicts on
  `(assessment_item_id, learner_id)`, deliberately reusing the same `id`
  across repeated *local* recordings. But if two devices each record a score
  for the same learner on the same assessment item while both are offline
  (plausible: a co-teacher, a substitute, or the same teacher entering
  corrections on two devices before either has completed an initial sync),
  each device mints its own fresh `id` for what the schema treats as the
  same logical row (`UNIQUE (assessment_item_id, learner_id)`). Pulling the
  other device's version hits that unique constraint on `learner_scores` and
  fails, exactly as above.
- **SectionMembership**: same shape via
  `idx_one_active_membership_per_learner` — if two devices each enroll (or
  transfer) the same learner into an open membership before either has
  synced (each getting its own fresh membership `id`), pulling the other
  device's open-membership row collides with the local device's own
  still-open row for that learner.

**Why this is BLOCKING, not just a data-integrity nuisance:** the failure
does not stay contained to the one colliding entity. `sync_client::pull_once`
(`sync_client.rs:490-514`) treats a repository error from `upsert_from_sync`
identically to a tampered/undecryptable payload: `summary.rejected += 1;
summary.failed = true; break;` — and, critically, `sync_pull_cursor` is
**never advanced past this change** (confirmed by reading the loop: the
`advance_cursor` call only happens inside the `Ok(())` arm). Since
`pull_since` (`repository/sync_hub.rs:177-194`) always returns changes
`ORDER BY cursor` starting `after` the stored cursor, the very next pull
round fetches the **same** poisoned change **first**, hits the **same**
constraint violation, and `break`s again — forever. Because the cursor is
one linear sequence per school (not per entity kind), this doesn't just
block future `Subject`/`LearnerScore`/`SectionMembership` changes — it
silently and permanently blocks **every subsequent change of every entity
kind** pushed by any device to this school's hub from ever reaching this
device again, with no automatic recovery, until a human manually edits the
database to resolve the natural-key collision. Given ADR-0067's whole
premise is that the hub is "the authoritative consolidation" point for a
school's dataset, and the entities affected include enrollment and grading —
both squarely inside DepEd compliance data — a single ordinary instance of
two teachers creating the same subject name, or scoring the same learner,
independently before their first sync of the day can silently and
permanently stop the hub from ever consolidating that school's data further
on the affected device. Nothing in `PullRunSummary` distinguishes this
"permanently poisoned, will never succeed on retry" failure from an ordinary
transient network blip (both just set `failed = true`), so there is not even
an operator-visible signal pointing at the actual stuck entity.

**This is the same class of gap the task asked to specifically check for**
(a design that looks locally correct in every existing unit test, but was
never exercised against the one production scenario — here, "two devices
independently mint different ids for the same natural-key entity before
either syncs" — that breaks the assumption baked into the doc comments).
It is a different mechanism than the sibling review's stale-`HubServerState`
finding (this one is a schema/protocol design gap, not a cache-invalidation
bug), but it is the same category: a self-review confidently asserted
"deliberate, safe, matches an established reviewed pattern" without
constructing the one input that falsifies it.

**Not present for `AssessmentItem`**: verified `assessment_items`
(`db/migrations.rs:322-330`) has no `UNIQUE` constraint beyond its own `id`
primary key, so this specific hazard does not apply to `AssessmentItem`
(confirmed no issue on this axis for that entity).

**Suggested direction (not implemented — read-only review):** either (a)
have each `upsert_from_sync` catch the specific natural-key `UNIQUE`
constraint-violation error and route it into `sync_conflict_review` (the
existing conflict-staging table) instead of a hard `Err`, so a human resolves
it as an explicit conflict rather than the pull silently wedging forever, or
(b) skip past (rather than `break` on) a change whose failure is a
content-level constraint violation distinct from a decrypt/auth-tag/
school_id failure, while still never advancing past a genuinely
tampered/undecryptable payload. Either fix needs a new test that
constructs exactly this scenario (two independently-`Uuid::now_v7()`-minted
rows for the same natural key, pulled into a device that already has one of
them) for each of the three affected entities.

---

## SHOULD-FIX — `upsert_from_sync` for `SectionMembership`/`Subject`/
## `AssessmentItem`/`LearnerScore` never re-validates that a referenced
## foreign id (`section_id`, `learner_id`, `class_record_id`, `category_id`,
## `assessment_item_id`) actually belongs to the incoming `school_id`

**Files/lines:** all four `upsert_from_sync` functions listed above; the
FK declarations in `db/migrations.rs` (e.g. `section_memberships.section_id
REFERENCES sections(id)` — no `school_id` cross-check in the FK itself).

**Evidence:** `apply_decrypted_change` checks only that the payload's own
declared `school_id` field matches the pulling device's configured school
(defense in depth, correctly implemented, confirmed identical across all
four new arms — see "Reviewed with NO issue found" below). None of the four
`upsert_from_sync` functions independently confirm that the *other* ids
embedded in the payload (`section_id`/`learner_id` for `SectionMembership`,
`class_record_id`/`category_id` for `AssessmentItem`,
`assessment_item_id`/`learner_id` for `LearnerScore`) actually belong to
that same `school_id` — they rely entirely on the SQLite `FOREIGN KEY`
constraint merely proving the referenced row *exists somewhere*, not that it
exists *in the right school*. This is the same root cause the sibling
review's SHOULD-FIX #2 already flagged for the SSPK itself (multi-school-per-
installation is a schema-supported, code-accommodated case — see
`hub_server::should_listen` iterating "any school known to this
installation" per that review) — here it recurs one layer up, in the domain
tables. In the realistic single-school-per-hub-laptop deployment this is
inert (every id locally resolvable already belongs to the one school this
installation manages), so it is not classified BLOCKING, but it is a real
gap between the documented "school isolation enforced at a trusted
boundary" rule (`.claude/rules/architecture.md`) and what the code actually
checks, for the same multi-school-per-installation edge case the sibling
review already flagged as residual risk. Recommend tracking this as one
combined item with that sibling finding rather than fixing it four
additional times independently — same underlying fix (either forbid
multi-school installations at a lower layer, or make every `upsert_from_sync`
join-verify `school_id` on every foreign id it writes).

---

## Reviewed with NO issue found

**Every `*_with_optional_sync` wrapper enqueues only on its own success
variant.** Directly re-read (not merely trusted from the self-review's own
prose):
- `enroll_learner_membership_with_optional_sync` — enqueues only on
  `EnrollOutcome::Enrolled` (`commands/section.rs:512`).
- `transfer_learner_membership_with_optional_sync` — enqueues only inside
  the `TransferOutcome::Transferred` arm (`commands/section.rs:353`), and
  correctly enqueues **both** mutated rows (closed source, opened
  destination) as two separate `PendingChange`s.
- `end_learner_membership_with_optional_sync` — enqueues only on
  `EndMembershipOutcome::Ended` (`commands/section.rs:430`).
- `create_subject_with_optional_sync` — enqueues only after `subject::create`
  returns `Ok`, inside the same `SAVEPOINT`/`ROLLBACK TO` block, so a
  duplicate-name rejection (`subjects`' own `UNIQUE(school_id, name)`) never
  enqueues (`commands/subject.rs:98-128`, covered by
  `a_rejected_create_never_enqueues_an_outbox_row`).
- `create_assessment_item_with_optional_sync` — enqueues only inside
  `if let Some(created) = &created` (`commands/assessment_item.rs:141`).
- `record_learner_score_with_optional_sync` — enqueues only inside
  `if let Some(recorded) = &recorded` (`commands/learner_score.rs:136`).

No wrapper enqueues on a rejection/`None`/error outcome in any of the four
entities. This part of the self-review's claim checks out.

**`resolve_sspk_if_enrolled` re-reads the SSPK from disk on every command
invocation — the stale-live-value bug class from the sibling review does
NOT recur here.** Specifically checked for this because the task called it
out as a plausible recurrence. `commands::section::resolve_sspk_if_enrolled`
/ `commands::subject::resolve_sspk_if_enrolled` (and the equivalent in
`assessment_item.rs`/`learner_score.rs`, same pattern) call
`db::load_or_mint_sspk(app)` fresh on every single command call — this
function does a real filesystem read of the DPAPI key file
(`db/mod.rs:119-126`) every time, with **no** long-lived in-process cache of
the key anywhere in this scope (unlike `HubServerState.sspk`, which is
resolved once at process startup and never re-read — that is the sibling
review's bug, and it lives entirely in `hub_server.rs`, not in these command
wrappers). So a device revocation/SSPK rotation is correctly picked up by
the very next `create_subject`/`enroll_learner_membership`/etc. call on this
device, with no equivalent staleness window. No issue found.

**School-scope check in all four new `apply_decrypted_change` arms.**
Directly re-read `sync_client.rs:562-640` side by side: `SectionMembership`,
`Subject`, `AssessmentItem`, and `LearnerScore` all perform
`if incoming.school_id != school_id { return Err(()); }` before calling
their repository's `upsert_from_sync`, identically in shape and position to
`Learner`/`Attendance`/`Section`. No entity skips or weakens this check.
The `match` remains exhaustive over `EntityKind` with no wildcard arm.

**No rejection is silently treated as success.** In `pull_once`, both the
"unsynced local edit" branch (routes to `sync_conflict_review::
stage_pull_conflict`, never touches the domain table) and the
`apply_decrypted_change` failure branch (`summary.rejected += 1; summary.failed
= true; break;`) are the only two non-`Ok` outcomes, and neither one calls
`sync_version_cache::record_known_version` or `sync_pull_cursor::
advance_cursor`. Confirmed this holds for all four new entity kinds, not
just the ones with dedicated tests. (The one caveat is the BLOCKING finding
above: `failed = true` is technically correct — the change genuinely was
rejected, not treated as success — but the *permanence* and *blast radius*
of that rejection is worse than the summary communicates.)

**`SectionMembership::upsert_from_sync` never deletes a row, only updates in
place via `ends_on`.** Confirmed directly — the `ON CONFLICT(id) DO UPDATE`
touches `school_id`/`section_id`/`learner_id`/`starts_on`/`ends_on`/
`created_at` only; no `DELETE` statement exists in this function or is
reachable from it.

**`idx_one_active_membership_per_learner` (the "at most one open membership
per learner" unique partial index) does provide a real structural backstop**
against the *within-normal-ordering* version of the transfer/enroll race —
if a pulled "opened destination" change somehow arrived before its paired
"closed source" change (e.g. split across two paginated pull pages), the
`INSERT` of the still-open destination row while the source row is also
still open would correctly violate this index and get rejected rather than
silently leaving the learner in two sections at once. This is a genuine
safety net; it is also the exact mechanism that turns an ordinary,
non-malicious double-enroll race into the permanent pull-wedging BLOCKING
finding above, rather than data corruption — a real tradeoff (fail-closed vs.
fail-open), not a defect in the index itself.

**Base-version handling matches each entity's documented precedent.**
`Section`/`Subject`/`AssessmentItem` (create-only wiring) unconditionally
use `base_version: 0` — correct since only `create` is wired to the outbox
for these entities and there is no other write path that could have
advanced the hub version before this exact call. `LearnerScore`/
`SectionMembership` (re-recordable entities) read from
`sync_version_cache::known_version` instead — confirmed by direct read of
`enqueue_section_membership_sync_change` (`commands/section.rs:211-216`) and
the equivalent in `commands/learner_score.rs`.

**Enrollment-gated encrypt-on-enqueue.** All four entities' `sspk` is `None`
unless `device_credential::has_active_for_school` is true, matching the
established pattern; a never-enrolled installation never writes an outbox
row for any of these four entities (confirmed by each entity's own
`*_with_no_sspk_*`/`*_with_no_sspk_behaves_exactly_like_a_plain_*` test).

---

## Known, already-documented trade-offs re-confirmed (not new findings)

- **`SectionMembership`'s enqueue is not atomic with its domain write** (no
  outer `SAVEPOINT` spanning both, unlike `Section`/`Subject`/
  `AssessmentItem`/`LearnerScore`) — re-confirmed by reading
  `enqueue_section_membership_sync_change`'s own doc comment
  (`commands/section.rs:188-202`) against the actual call sites in
  `enroll_learner_membership_with_optional_sync`/`transfer_learner_membership_
  with_optional_sync`/`end_learner_membership_with_optional_sync`: each calls
  the domain function first (which internally commits its own
  `Connection::transaction()`), then calls the enqueue function as a
  separate, later step. A crash in that window loses a sync signal for an
  already-successful local write; it cannot invert into a false-positive
  enqueue. Already recorded in `VERIFICATION-DEBT.md`; this review found
  nothing to add to that specific analysis.
- **`section_membership::enroll` (the bulk CSV-import primitive) and
  `correct_same_day_placement` remain unwired to sync** — confirmed still
  true by grep; neither calls `enqueue_section_membership_sync_change`
  anywhere. Already recorded; no new observation.

---

## Not verified / out of scope for this pass

- Did not execute the test suite in this session (read-only review; findings
  are from static reading of the code and its existing tests' assertions,
  not from running anything). The BLOCKING finding above is a scenario no
  existing test constructs (verified by reading every `upsert_from_sync` and
  `pull_once_*` test for these four entities — none create two independent
  `id`s colliding on a secondary natural key); confirming it would require a
  new test per affected entity that (a) creates a row locally, then (b)
  calls `upsert_from_sync` with a second, differently-`id`'d row that
  collides on the entity's natural-key unique constraint, and asserts the
  resulting error, then (c) drives that same scenario through `pull_once`
  end-to-end to confirm the "stuck forever" cursor behavior.
- Did not review `commands::section::create_section`/`section::upsert_from_sync`
  (the `Section` entity itself) in this pass beyond what was needed for
  cross-reference — it was already independently reviewed in a prior
  session per `VERIFICATION-DEBT.md` and was not in this task's explicit
  scope list.
- Did not re-review `hub_server.rs`/`sync_payload_key.rs`/SSPK rotation
  itself — that is the sibling review's scope
  (`docs/reviews/2026-09-07-sync-payload-encryption-review.md`), read here
  only to check for a recurrence of its specific bug pattern in this scope
  (checked, not found — see "Reviewed with NO issue found" above).
- Did not verify Windows-specific DPAPI/native behavior (no interactive
  Windows desktop access in this session) — relied on existing module test
  coverage and code reading only, consistent with the sibling review's own
  disclosure.
- Did not exhaustively re-read every line of `section_membership.rs`
  (3474 lines, the largest file in scope) — focused on `upsert_from_sync`,
  the three `*_membership` domain functions the command wrappers call
  (`enroll_membership`/`transfer_membership`/`end_membership`), and the
  unique-index/schema interaction that produced the BLOCKING finding. Did
  not re-audit every one of that file's ~40+ existing tests individually.

---

## Summary

| # | Finding | Severity |
|---|---------|----------|
| 1 | A legitimate concurrent write on two devices to `Subject`/`LearnerScore`/`SectionMembership` (colliding on a natural-key `UNIQUE` constraint distinct from `id`) permanently wedges ALL further sync for the whole school on the receiving device, with no automatic recovery and no distinguishing operator signal | **BLOCKING** |
| 2 | `upsert_from_sync` for these four entities never re-validates that a foreign id in the payload belongs to the declared `school_id` — inert under single-school-per-installation, same root cause as the sibling review's SSPK-per-installation finding | SHOULD-FIX |
| 3 | Every `*_with_optional_sync` wrapper enqueues only on its own success variant, for all four entities | No issue found |
| 4 | `resolve_sspk_if_enrolled` re-reads the SSPK from disk per call — the sibling review's stale-live-value bug class does not recur in this scope | No issue found |
| 5 | School-scope (`incoming.school_id != school_id`) check present and correctly positioned in all four new `apply_decrypted_change` arms | No issue found |
| 6 | No rejection/conflict path is silently treated as success | No issue found (see caveat folded into finding #1) |
| 7 | `SectionMembership::upsert_from_sync` never deletes, only updates via `ends_on` | No issue found |
| 8 | Base-version handling (`0` for create-only entities, `sync_version_cache`-derived for re-recordable ones) matches documented precedent | No issue found |
| 9 | `SectionMembership`'s enqueue-not-atomic-with-domain-write and two unwired write paths | Already documented, re-confirmed, nothing new |

This closes the four independent-review debts recorded in
`docs/VERIFICATION-DEBT.md` with **one genuine BLOCKING finding** (a
protocol/schema-design gap, not present in any of the four self-reviews)
plus one SHOULD-FIX shared with the sibling review's own SHOULD-FIX.
Recommend: do not mark this milestone's independent-review debt fully
resolved until finding #1 is fixed or explicitly triaged/accepted — as
written, ordinary offline concurrent use by well-behaved teacher devices
(no attacker required) can permanently stop a school's hub from
consolidating any further data on an affected device.
