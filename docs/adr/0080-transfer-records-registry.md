# ADR-0080: Transfers In/Out Documentation Registry — Capability, Schema, and Sync Wiring

Status: Accepted

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §3.4 named the Transfers In/Out
Documentation Registry: a formal ledger tracking a learner's transfer
date, direction (in/out), the receiving/originating school's name, and a
document-completion status. Batch 5 built and tested only the pure
validation rules (`src/domain/transfer-record.ts`,
`validateTransferRecord`), deliberately deferring the persisted
tenant-scoped entity — migration, repository, Tauri commands, TS
application service, UI screen, and sync wiring — as a full vertical
slice of its own. Batch 9 ships that deferred slice. This ADR settles
three composition-layer questions: what capability gates it, whether it
gets its own capability at all, and whether it is wired into sync now or
deferred.

## Decisions

### 1. A new `Capability::ManageTransferRecords`, not reusing `ManageLearners`

This project has a repeated, explicit precedent of giving a new
administrative action its own `Capability` variant even when it
resolves to the exact same role set as an existing one —
`ManageTeachingAssignments`/`ManageSectionAdvisories` (both explicitly
reasoned as distinct from `ManageSchoolMembership`),
`ManageSchoolBranding`, and `ManageSchoolCoordinates` (ADR-0079) are all
their own variant for this reason. Recording a transfer is conceptually
distinct from creating/editing a learner's core enrollment record, even
though today both are recorded by the same two roles. Reusing
`ManageLearners` would have been simpler short-term but would tie two
conceptually different administrative acts to the same authorization
variant, against this codebase's own stated reasoning for every prior
split.

**Roles**: Registrar and School Head — the same two roles as
`ManageLearners` and `ManageHealthRecords`. This project's closest
analogous precedent is `ManageHealthRecords` (ADR-0071): a school-wide,
registrar-facing administrative action over real learner PII, with no
per-section "class adviser acts on their own section" carve-out in this
project's role model (unlike `ManageChildProtection`/
`authorize_child_protection_access_for_section`, which _does_ have one).
A transfer is a school-wide registrar act, not a per-section teaching
duty — a class adviser has no independent standing to record a transfer
for a learner outside their own section's day-to-day instruction — so
the `ManageHealthRecords` shape (no Teacher carve-out) was followed
over the `ManageChildProtection` shape (per-section Teacher carve-out).

### 2. Schema: one new table, no natural key beyond `id`

Migration 52 adds `transfer_records` (school-scoped, `learner_id`
references `learners`, `direction`/`status` are `CHECK`-constrained,
`other_school_name`/`remarks` carry the same length `CHECK`s as
`src/domain/transfer-record.ts`'s trim/max-length validation so a
forged/raw IPC call cannot persist what the TS validation would have
rejected). Unlike `nutrition_records`' `UNIQUE (learner_id, school_year,
period)`, this table has **no natural-key uniqueness constraint beyond
`id`** — a learner may legitimately accumulate multiple transfer rows
over time (out, then years later in again, or a cancelled attempt
followed by a real one), and there is no real-world uniqueness rule to
enforce. This directly shapes the sync design below.

`other_school_name` is free text, matching
`scholastic_history_records.source_school_name`'s established precedent
for "a school outside this app's own tenant" — this app has no
directory of external schools to resolve against.

### 3. Sync-wired now, following the Batch 6 pattern — not deferred like `scholastic_history_records`

Two precedents pull in opposite directions:

- ADR-0074's `scholastic_history_records` shipped **unsynced**,
  explicitly deferring sync wiring, because it is a _bulk-imported,
  write-once, read-many_ historical record with no realistic
  multi-device concurrent-write scenario in its first slice.
- Batch 6 wired `LessonPlan`/`NutritionRecord`/`BehavioralIncident`/
  `GradeSubmission` into sync as part of their own first slice, because
  each is an ordinary teacher/registrar-entered record a school-laptop
  hub genuinely needs to reconcile across devices.

A transfer record is entered directly by a Registrar/School Head at the
point of a real transfer event, exactly like a nutrition measurement or
a behavioral incident — not bulk-imported — so it follows the Batch 6
shape: migration 53 widens the `entity_kind` allowlist (`sync_outbox`,
`sync_hub_log`, `sync_conflict_review`, `sync_version_cache`) to add
`'transfer_record'`, `EntityKind::TransferRecord` is added,
`repository::transfer_record::upsert_from_sync` materializes a pulled
change, `sync_client::apply_decrypted_change` gets a matching arm
(school-scope-checked, exactly like every other tenant-scoped entity's
arm), and `commands::transfer_record::record_transfer`/
`update_transfer_status` enqueue an outbox entry when this device has an
active sync credential (the same enrollment-gated,
`SAVEPOINT`-atomic-with-the-write pattern as
`commands::nutrition::record_nutrition_measurement`).

**No dedicated natural-key-collision test**, unlike
`nutrition::upsert_from_sync_returns_an_error_on_a_natural_key_collision_distinct_from_id`
— that test exists specifically because `nutrition_records` has a real
`UNIQUE (learner_id, school_year, period)` constraint a sync pull can
trip. `transfer_records` has no such constraint (Decision 2), so a
pulled change can only ever collide on `id` itself, which `ON
CONFLICT(id) DO UPDATE` always resolves as an ordinary update — there is
no distinct failure mode to prove. `upsert_from_sync`'s ordinary
insert/update round-trip tests cover the behavior that actually exists.

Conflict-review's typed preview (Batch 8's pattern,
`commands::conflict_review::ConflictEntityPreview`) is extended in the
same commit with a `TransferRecord` variant (learner id, direction,
transfer date, other school name, status) so a teacher resolving a
conflict on this entity sees a real field-level breakdown rather than
falling through to the generic `Unknown` fallback.

## Consequences

- A Registrar/School Head can now record and track a learner's
  inter-school transfer end to end: Tauri commands, a TS application
  service reusing Batch 5's validation unchanged, and a UI screen
  (`TransfersScreen`) reachable from the "Learner Records" nav group.
- Transfer records participate in cross-device sync from their first
  shipped slice, unlike `scholastic_history_records` — the more
  consequential (real learner PII, actively entered by staff at the
  point of a transfer, not a bulk historical import) of the two closest
  precedents was judged the better fit.
- `docs/product/MASTER-TASK-INVENTORY.md` §3.4's Transfers item is
  checked off.

## Deferred / explicitly out of scope

- No new `SignedInTab`-level role gating in the UI shell — this project
  never hides a tab by role (`.claude/rules/security-privacy.md`: "must
  never rely on UI hiding"); the `TransfersScreen` nav entry is visible
  to every signed-in user exactly like every other capability-gated
  screen, and the real enforcement is server-side
  (`Capability::ManageTransferRecords`).
- Editing a transfer record's date/direction/school name after creation
  — only its `status` is ever updated (`update_transfer_status`); the
  factual record of what was submitted is otherwise immutable, matching
  `behavioral_incidents`' own "content set once, status transitions
  separately" convention.
- Resolving `other_school_name` against a directory of external schools
  — no such directory exists in this app (Decision 2).
