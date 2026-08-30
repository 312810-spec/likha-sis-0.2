# ADR-0046 — Learner Core: Bulk Import, Photo, Enrollment History (Wave 2)

Status: Accepted

## Context

Wave 2 ("Learner Core," `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`)
targets `docs/product/PRODUCT-CONTRACT.md` §5's SF1 Enrollment row, which
lists: "Bulk import, duplicate reconciliation (conservative: never
silently merge; adviser/authorized user compares and chooses
keep-existing / use-imported / field-by-field / confirmed-different,
with provenance), learner photo, enrollment history, transfer
foundation, ID-generator data foundation." Basic learner CRUD, LRN/sex
fields, and section-membership `[starts_on, ends_on)` history already
existed (earlier milestones) — this ADR covers the three genuinely
missing pieces (bulk import, photo, enrollment history) and records two
deliberate scoping decisions for the remaining two items.

## What was built

### Bulk import with conservative, provenance-tracked reconciliation

**Parsing** (`src-tauri/src/import/csv.rs`, `import/learner.rs`): a
dependency-free RFC4180 CSV reader (quoted fields, doubled-quote
escaping, CRLF/LF, no phantom trailing row — mirrors the project's
existing dependency-free CSV _writer_ in `export/csv.rs`), plus a
learner-specific parser expecting an exact header
(`given_name,family_name,lrn,sex`, case-insensitive). A header error
fails the whole call; a per-row error (missing name, malformed LRN,
invalid sex, wrong column count) is attached to that row's own `error`
field rather than aborting the file, so one bad row never blocks the
rest.

**Duplicate detection** (`repository/learner_import.rs`,
`find_potential_duplicate`): exact LRN match first (DepEd's LRN is a
unique national identifier — a near-certain signal), falling back to an
exact case-insensitive name match only when no LRN was given or none
matched. Deliberately **no fuzzy/typo-tolerant matching** — a
conscious, conservative choice: a near-miss simply isn't flagged (one
fewer prompt, safe), never silently merged (unsafe). Always school-scoped.

**Reconciliation contract**: the product contract's four UX choices
(keep-existing / use-imported / field-by-field / confirmed-different)
collapse onto **three** backend actions — `Create`, `Update`, `Skip`
(`ImportAction`) — because the frontend always computes the row's final
field values before sending a decision; "use-imported" and
"field-by-field" both resolve to `Update` with different upstream
value-computation, and "confirmed-different" resolves to `Create` with
`existing_learner_id: null` even though a duplicate was flagged. The
backend never re-derives values from the original row — it trusts and
applies whatever `final_*` values the decision carries, keeping one
code path for both UX flows.

**Atomic commit + provenance** (`commit_batch`): one SQLite transaction
per batch — every decision applied and logged, or none are. Every row's
decision is logged to `learner_import_log` regardless of outcome
(including `Skip`, which writes zero learner rows but still records
that the row was reviewed and left alone), linked to a
`learner_import_batches` row carrying `imported_by_user_id` (session-
derived, never caller-supplied) and a timestamp. Proven, not just
asserted: a real test (`commit_batch_is_all_or_nothing_on_a_bad_update_
reference`) supplies a bad `existing_learner_id` as the second decision
in a batch and asserts the _first_ decision's otherwise-valid `Create`
was rolled back too; another (`commit_batch_never_lets_one_school_touch_
another_schools_learner`) proves an `Update` decision pointing at
another school's learner id fails via `learner::update`'s own
school-scoped `WHERE` clause, converted to `AppError::InvalidImport`
(a message-free variant — every case here is a caller/programming
error on an already-validated preview step, never a detail worth
explaining to a teacher).

**Frontend** (`LearnerImportScreen.tsx`): upload → preview table (every
row shown, including unreadable ones, which are excluded from the
commit set and require fixing the source file) → per-row reconciliation
control (only shown when a duplicate is flagged: skip / update / treat
as new) with editable final-value fields → commit → result summary with
an optional provenance-log view. Same `Capability::ManageLearners` gate
as `create_learner`/`update_learner` — bulk import is "manage many
learners at once," not a separate authority.

### Learner photo (BLOB-in-encrypted-SQLite, reusing the School Branding pattern)

`repository/learner_photo.rs` reuses the pattern ADR-0045 established
for school logos: store the photo as a BLOB inside the already-
SQLCipher-encrypted working database (ADR-0003's guarantee, free) rather
than a plaintext file needing its own encryption story. Mime whitelist
(PNG/JPEG), 2MB byte cap, and the same decompression-bomb guard
(`ImageReader::into_dimensions()` — a header-only read — checked against
a 50-megapixel cap _before_ `decode()` ever allocates a pixel buffer),
duplicated in miniature from `branding/logo.rs` rather than shared
across modules: a learner photo has no color-extraction step to justify
a shared abstraction with branding's logo module, and the guard is three
lines.

**A real serialization bug caught before shipping**: `set` was
originally typed `AppResult<Option<()>>` (`None` for "learner not found
in this school," matching `learner::update`'s convention). serde
serializes both `Some(())` and `None` as JSON `null` — the two cases
would have been byte-for-byte indistinguishable to the frontend across
the Tauri IPC boundary, silently defeating the whole point of the
`Option`. Caught during self-review before any command wiring, fixed by
changing the return type to plain `bool` (matching `clear`'s own,
already-correct convention) — `false` means not-found, `true` means
success, and both are real, distinct JSON values.

School-scoped throughout: `set` via `INSERT ... SELECT ... FROM
learners WHERE id = ? AND school_id = ?` (zero rows affected = not
found/wrong school, never a separate existence check that could drift
from the write's own scoping); `get` via a `JOIN` against `learners`;
`clear` via a `DELETE ... WHERE learner_id IN (SELECT id FROM learners
WHERE id = ? AND school_id = ?)`.

`set_learner_photo`/`clear_learner_photo` gated by
`Capability::ManageLearners` (same authority as the rest of learner
management); `get_learner_photo` session-scoped only, matching
`get_learner`.

### Enrollment history (the inverse of section roster)

`section_membership::history_for_learner`: every membership row for one
learner across every section and school year, most-recent-first.
`roster_for_section*` already answered "who is on this section's
roster;" this answers the inverse — "where has this learner been." A
new query, not new storage: `section_memberships`' existing
`[starts_on, ends_on)` half-open-interval model (built for attendance/
transfer) already carried everything needed. Returns `None` when the
learner doesn't resolve in the caller's school (matching
`learner::find_by_id_in_school`'s convention), distinguishable from
`Some(vec![])` for a real learner with no history yet. Session-scoped
only (any active session in the school), matching `section_roster`'s
own read convention — this is a read of learner-record history, not a
learner-management write.

Frontend: a toggleable per-learner panel on `LearnerListScreen.tsx`
(lazy-fetched only when opened, not preloaded for the whole roster).

## Deliberate scope decisions (not built this milestone)

**Transfer foundation — deferred to Wave 5 (Sync/Cloud).** An
inter-school transfer needs a receiving school to exist as a
addressable, verifiable entity beyond "a row in this device's local
SQLite" — that requires the not-yet-built cloud/sync layer
(`docs/adr/0035`'s Wave 5). `section_membership::enroll`'s existing
same-school transfer capability (closing an old membership, opening a
new one in a different section) already covers every _intra-school_
transfer case Wave 2 could responsibly ship; a _cross-school_ transfer
without a sync layer would either be a local-only fiction (a learner
"transferred" to a school this device has never synced with) or require
inventing a premature, likely-wrong cross-device protocol. Revisit once
Wave 5 lands.

**ID-generator data foundation — already satisfied, no new code
needed.** The product-contract line anticipates a locally-generated
identifier scheme. LIKHA's actual identifier for a learner is DepEd's
own LRN (Learner Reference Number), issued by DepEd's LIS, not
generated by this app — inventing a local ID generator would be
building a foundation for a requirement that doesn't apply here. The
existing nullable `Learner.lrn: Option<String>` field (added in an
earlier milestone specifically because SF2/report-card exports require
it) already is the "ID-generator data foundation" this line describes.

## Verification, all actually run this session (not claimed)

- `cargo test --lib` (whole crate): **415 passed, 0 failed** (48 new
  tests added across this milestone's modules, itemized below).
  - `import::csv::`: 8 tests.
  - `import::learner::`: 12 tests.
  - `repository::learner_import::`: 12 tests (duplicate detection,
    preview, commit atomicity/cross-school rejection/provenance).
  - `repository::learner_photo::`: 11 tests (round-trip, cross-school
    rejection, replace-not-duplicate, unsupported mime, undecodable
    input, decompression-bomb guard, clear + cross-school clear
    rejection, cascade-delete-with-learner).
  - `repository::section_membership::`: 5 new `history_for_learner`
    tests (none-for-wrong-school, empty-for-no-history,
    most-recent-first ordering with `starts_on`/`ends_on` correctness,
    never-crosses-learners).
- `cargo clippy --all-targets -- -D warnings`: **clean** (one real
  finding fixed during development: `assert_eq!(x.is_some(), true)`
  rewritten to `assert!(x.is_some())` per `clippy::bool_assert_
comparison`).
- `cargo fmt --check`: clean (ran plain `cargo fmt` to fix real drift
  introduced while writing new files, reformatting only).
- `npm run quality` (typecheck, lint, format:check, architecture-
  boundary check, vitest): **all clean**, **439 tests passed** — new
  files: `learner-import-service.test.ts`,
  `learner-import-repository.test.ts`, `LearnerImportScreen.test.tsx`,
  `learner-photo-service.test.ts`, `learner-photo-repository.test.ts`,
  plus new cases added to the existing `LearnerListScreen.test.tsx`
  and `section-service.test.ts`/`section-repository.test.ts`).
- `npx tsc -b --noEmit`: clean.
- `npm run build`: clean production build.
- `npm run check:dev-preview-isolation`: clean.
- `npx knip`: **zero new findings** — every new export confirmed wired
  and used; the only findings present are the same four pre-existing
  ones from before this milestone (`userService`,
  `LEARNER_SCORE_STATUSES`, `OmittedField`, `FieldDisclosure`),
  unrelated to this work.
- Independent `security-reviewer` **dispatched** for this milestone
  (touches auth/persistence per `.claude/rules/security-privacy.md`) —
  see the addendum below for its outcome, appended once the dispatch
  returns.
- **Not run**: `npm run quality:security` (gitleaks/cargo-deny/
  osv-scanner binaries not installed in this sandbox, a known
  per-machine gap, not attempted-and-hidden); real browser-rendered
  visual verification and native Windows/WebView2 verification (no
  browser/screenshot tool or Windows hardware in this session) —
  disclosed, not claimed, matching every prior UI milestone's pattern.

## Consequences

- Three new SQLite tables: `learner_import_batches`,
  `learner_import_log`, `learner_photos` (migration in
  `db/migrations.rs`, appended after `school_branding`).
- New `AppError::InvalidImport` variant (message-free, matching the
  "never leak detail across IPC" pattern already used for
  `InvalidImage`).
- New `auth::authorize_capability_with_user` (returns the acting
  session's `user_id` alongside `school_id`) alongside the existing
  `authorize_capability` — needed once for `commit_learner_import`'s
  provenance attribution; `authorize_capability` now delegates to it.
- `docs/product/PRODUCT-CONTRACT.md` §5's SF1 Enrollment row updated to
  reflect what's built vs. the two deliberately deferred items.
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 2
  row updated: **complete** (learner photo, bulk import, enrollment
  history built; transfer foundation deferred to Wave 5; ID-generator
  foundation satisfied by existing `lrn` field).
- `docs/CURRENT-HANDOFF.md`/`docs/PROJECT-MEMORY.md` updated.
- Per Autonomous Continuous Development Mode
  (`.claude/rules/autonomous-development.md`): this is a completed
  checkpoint. Per this session's explicit user instruction ("continue
  wave 2 but stop at wave 2w"), development stops here rather than
  auto-continuing into Wave 3 — the next session should pick up Wave 3
  (Form Engine), which was pre-researched ahead of time (see
  `docs/adr/0044-pre-wave-research-waves-3-4-5-7.md`).
