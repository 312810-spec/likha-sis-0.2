# ADR-0082: Formative Assessment (ESRU) Logging — Authorization Shape, Storage, and Sync Wiring

Status: Accepted

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s Tier 3 list named Formative
Assessment (ESRU) logging: quick per-learner, per-activity logging of an
E/S/R/U rating during ordinary classroom formative assessment. The legacy
`likha-sis` codebase never built working ESRU logic — it only carried a
type shape (`student_id`, `subject_id`, `quarter`, `activity_name`,
`esru_rating: E|S|R|U`, `notes`) with no reference implementation, no
persistence, and no cited source for what the four letters actually mean.
Batch 11 ships the full vertical slice: migration, tenant-scoped
repository, narrow Tauri commands, a TS application service, a UI screen,
and sync wiring. This ADR settles three questions: what authorization
shape gates it, how the ESRU rating is stored given its meaning is
unverified, and how it is wired into sync.

## Decisions

### 1. Authorization shape: `subject_attendance::authorize_own_assignment` ("Teacher owns this assignment"), not a school-wide `Capability`

This project has two established authorization shapes for tenant-scoped
writes:

- A school-wide `Capability` (e.g. `ManageTransferRecords`,
  `ManageHealthRecords`, `ManageChildProtection`) — a fixed role set
  (Registrar/School Head, or an adviser-or-School-Head carve-out for
  `ManageChildProtection`) acts over data that is not tied to one
  teacher's own day-to-day instructional duty. `ManageChildProtection`'s
  narrower shape exists because incident/health data is materially more
  sensitive than ordinary instructional records, and because who may act
  on it (the section's own adviser, or a School Head) is a genuinely
  different question from "who teaches this subject."
- A per-assignment ownership check
  (`subject_attendance::authorize_own_assignment`,
  `assessment_item`/`class_record`'s own teacher-scoped writes) — the
  caller must be exactly the teacher on the specific
  `teaching_assignment_id` being acted on. This is how this project
  already gates ordinary formative/summative classroom record-keeping:
  attendance checks, assessment items and scores, class records.

An ESRU log is routine, per-learner, per-activity formative-assessment
note-taking by the teacher who actually teaches that subject-section —
structurally identical to a Subject Attendance mark or an assessment
score, not an incident report or a health record. There is no concrete
reason to believe an ESRU log is more sensitive than an ordinary quiz
score: it carries no health, safety, or disciplinary content, and DepEd
formative-assessment note-taking has always been the class teacher's own
routine record, not a registrar-administered document. Gating it behind
a school-wide `Capability` (even one restricted to Registrar/School
Head) would block the exact person who should be able to log it — the
assignment's own teacher — from doing so without an administrator's
involvement, for no compensating security benefit, since this data
carries none of the elevated sensitivity that justified
`ManageChildProtection`'s tighter shape.

**Decision**: `repository::formative_assessment::authorize_own_assignment`
directly re-exports `subject_attendance::authorize_own_assignment`
unchanged (not a re-derived copy) — a caller must be exactly the teacher
on `teaching_assignment_id`, matching `subject_attendance`/
`assessment_item`'s own "Teacher records for their own assigned learners/
sections" shape. No new `Capability` variant was added for this feature.

### 2. Storage: the bare literal letter only, never the gloss word

**The ESRU rubric's real meaning is unverified against any DepEd primary
source** — this is already recorded in
`docs/product/OWNER-DECISIONS-NEEDED.md` item 3 (not duplicated here).
Neither this project nor the legacy codebase it was ported from ever
cited an authoritative source for what E/S/R/U stands for; the
"Exploration / Structured practice / Reflection / Understanding" gloss
this batch ships is a plausible but unconfirmed guess.

Given that uncertainty, the schema and every persisted value store
**only the bare letter** — `esru_rating TEXT NOT NULL CHECK (esru_rating
IN ('E', 'S', 'R', 'U'))` (migration 55). The full gloss word is never
written to the database, never appears as an enum variant name in Rust,
and is represented in TypeScript purely as a UI-display label
(`src/domain/formative-assessment.ts`'s `ESRU_GLOSS` and
`formatEsruRatingLabel`), always rendered with an explicit "meaning
unverified" flag. This way, if the gloss is later confirmed wrong (or a
primary source surfaces with a different expansion), fixing it is a
one-line label-string change — no migration, no data rewrite, no
stored-value change, and no risk of silently relabeling historical data
under a guess that turns out to have been wrong.

### 3. Schema: `teaching_assignment_id` + `grading_period_id`, no natural key beyond `id`

`formative_assessment_logs` (migration 55) references `teaching_assignment_id`
(not a bare `subject_id`) as its authorization anchor, matching
`subject_attendance_sessions`' own precedent — a teaching assignment is
what actually ties a teacher to one section+subject pair, the same
identifier `authorize_own_assignment` already keys on. The legacy type
shape's bare `quarter` field is represented as `grading_period_id`
(referencing `grading_periods`), this schema's own established "quarter"
identifier — the same convention `class_records.grading_period_id`
already uses — rather than a free-text quarter string that could drift
from the school's actual grading calendar.

No natural key exists beyond `id`: a learner may legitimately accumulate
many ESRU logs across many activities in the same subject/quarter (this
is a running formative log, not a once-per-quarter score), matching the
`transfer_records` precedent (ADR-0080) rather than
`nutrition_records`' `UNIQUE (learner_id, school_year, period)`.

### 4. Sync wiring: wired now, following the Batch 6/9 pattern

An ESRU log is entered directly by a teacher during ordinary classroom
activity, exactly like a Subject Attendance mark or a nutrition
measurement — not bulk-imported — so it follows the same shape: migration
56 widens the `entity_kind` allowlist (`sync_outbox`, `sync_hub_log`,
`sync_conflict_review`, `sync_version_cache`) to add
`'formative_assessment_log'`, `EntityKind::FormativeAssessmentLog` is
added, `repository::formative_assessment::upsert_from_sync` materializes
a pulled change, `sync_client::apply_decrypted_change` gets a matching
arm (school-scope-checked, exactly like every other tenant-scoped
entity's arm), and `commands::formative_assessment::record_formative_assessment`
enqueues an outbox entry when this device has an active sync credential
(the same enrollment-gated, `SAVEPOINT`-atomic-with-the-write pattern as
`commands::transfer_record::record_transfer`).

**No dedicated natural-key-collision test**, matching `TransferRecord`'s
own precedent (ADR-0080 Decision 3) — this table has no natural-key
`UNIQUE` constraint beyond `id` (Decision 3 above), so a pulled change
can only ever collide on `id`, which `ON CONFLICT(id) DO UPDATE` always
resolves as an ordinary update. `upsert_from_sync`'s ordinary
insert/update round-trip tests cover the behavior that actually exists.

Conflict-review's typed preview
(`commands::conflict_review::ConflictEntityPreview`) is extended with a
`FormativeAssessmentLog` variant (learner id, activity name, ESRU rating,
grading period id) so a teacher resolving a conflict on this entity sees
a real field-level breakdown rather than falling through to the generic
`Unknown` fallback. The preview shows the bare letter only — same
storage discipline as Decision 2.

## Consequences

- A teacher can now log an ESRU observation for a learner in one of
  their own classes end to end: Tauri commands, a TS application
  service, and a UI screen (`FormativeAssessmentScreen`) reachable from
  the "Daily Teaching" nav group, next to Subject Attendance.
- ESRU logs participate in cross-device sync from their first shipped
  slice.
- The ESRU-meaning uncertainty is contained to a single, clearly-flagged
  UI label — no schema or stored-data risk if the gloss is later found
  to be wrong. See `docs/product/OWNER-DECISIONS-NEEDED.md` item 3.
- `docs/product/MASTER-TASK-INVENTORY.md`'s Formative Assessment (ESRU)
  item is checked off under Tier 3.

## Deferred / explicitly out of scope

- No new `SignedInTab`-level role gating in the UI shell — this project
  never hides a tab by role; the nav entry is visible to every
  signed-in user, and the real enforcement is server-side
  (`authorize_own_assignment`).
- No cross-subject "every ESRU log for a learner across all their
  subjects" command or view — only a per-assignment list is exposed
  (`list_formative_assessment_logs_for_assignment`). A cross-subject view
  would need its own authorization rule (who may see a learner's ESRU
  logs across subjects they don't teach?), a genuinely different
  question from "may this teacher log/view ESRU for their own class,"
  deliberately left for a later slice if a real need surfaces.
  `repository::formative_assessment::list_for_learner` exists and is
  tested at the repository layer for that eventual use, but has no
  command or UI wired to it yet.
- Editing or deleting an existing ESRU log — this first slice is
  create-and-list only, matching how Subject Attendance's own first
  slice shipped record-only before amend support was added.
- No configurable per-school threshold or automatic flagging on ESRU
  patterns (e.g. "flag a learner with three consecutive U ratings") —
  out of scope for this slice, matching Subject Attendance's own
  deferred-threshold precedent (`docs/product/SUBJECT-ATTENDANCE-SPEC.md`).
