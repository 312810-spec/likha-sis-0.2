# ADR-0043: SF1 Bulk Import Engine

Status: Accepted (engine + tests checkpoint; UI deferred — see "Scope of
this checkpoint" below)
Date: 2026-08-26

## Context

Wave 2A/2A.1 established the Learner Core + Enrollment domain
(`learners` identity table, `section_memberships` as the Enrollment
concept, `ManageLearners`/`ManageTeachingAssignments` capabilities). This
milestone (Wave 2B) builds the first bulk data-entry path into that
domain: importing a school's SF1 (School Register) workbook instead of
registrars typing every learner in one at a time.

The directing brief's own framing: "Import is not 'upload and hope.'
Import is parse → validate → review → explicitly resolve → commit."
Every decision below serves that principle.

## Fidelity disclosure (read this first)

**No official DepEd SF1 `.xls` template exists anywhere in this
repository**, and `deped.gov.ph`/`lis.deped.gov.ph` were not reachable
from this environment (same disclosed network-egress gap recorded
repeatedly in `docs/VERIFICATION-DEBT.md` and prior ADRs). The column
layout `import::workbook` searches for — LRN, Family Name, Given Name,
Sex, Birthdate, Remarks, located by a case-insensitive header-row search
rather than a hardcoded row index — is **this project's own invented
structure**, not verified against the real form.

This is a deliberate, disclosed scope decision, not an oversight: the
engine (normalization, validation, duplicate matching, transactional
commit, idempotency, authorization) is fully buildable and verifiable
today against a synthetic fixture; only the exact cell-coordinate/header
mapping to a genuine DepEd SF1 workbook cannot be. The header-row-search
strategy is a hedge against that uncertainty — a real template's header
row landing on a different row number still works — but it is not a
fidelity claim. **`import::workbook` is the only module in this
codebase that knows the layout**; retargeting it to a real template
later is a mapping change inside one file, not a rewrite of the engine
above it. A real official SF1 `.xls` template is recorded as external
material only the user can provide (see
`.claude/rules/autonomous-development.md`'s gate #2) — this milestone
does not stop for it, because a synthetic fixture is explicitly
authorized, but the gap is not silently closed either.

## Decision 1: Parsing runtime — `calamine`, not a Java/POI sidecar

The brief suggested treating reuse of "the established Apache
POI/HSSF path" as a serious candidate. Investigation found that path
(`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`,
`docs/product/PRODUCT-CONTRACT.md`) is explicitly marked **"DIRECTION
SET, not built"** — no Java sidecar infrastructure exists anywhere in
this codebase. Reusing it would mean building brand-new JVM-bundling,
Tauri-sidecar-lifecycle, and Java-toolchain-in-CI infrastructure from
scratch, not reusing anything.

The decisive distinction: that direction's actual value is
**template-preserving writes** — filling a real DepEd `.xls` while
keeping its formatting/formulas/structure intact, for the SF2/report-card
**export** side (Wave 3, not yet built). SF1 **import** only needs
cell-value **reading**. Those are different jobs; "one runtime, not
competing stacks" doesn't apply when there is nothing built yet to be
consistent with.

| Option                                                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`calamine` (Recommended)**                                            | Pure Rust, MIT, read-only, no C bindings, no network I/O in the crate. `cargo add calamine --features dates` resolved to a real, current v0.36.1 (confirmed via `cargo add --dry-run`, since crates.io's API refused this session's direct query — same recurring gap noted in prior ADRs). `.xls`/BIFF support is not feature-gated (confirmed against a real `.xls` fixture). One in-process dependency, zero new toolchain, zero CI changes, and a materially better Android story than bundling a JRE.                                        |
| **Next Best: stand up a Tauri-sidecar + Apache POI/HSSF reader (Java)** | Would give the exact library the export direction already names, and stronger legacy-BIFF-edge-case coverage from a decades-mature library. Rejected for now: real cost (JVM/JRE bundling, sidecar process lifecycle, a Java toolchain added to both CI jobs, a worse Android story) for a benefit (template-preserving writes) that import doesn't need. Revisit if Wave 3's export work stands up this sidecar anyway — reading could then reasonably move onto the same runtime for genuine consistency, not merely because the option exists. |
| JS/TS spreadsheet parser (e.g. `xlsx`/SheetJS) called from the frontend | Rejected outright: architecture rule requires all file parsing behind a Rust/Tauri command, never in UI/domain code (`.claude/rules/architecture.md`).                                                                                                                                                                                                                                                                                                                                                                                            |
| Hand-rolled minimal BIFF/OOXML reader                                   | Rejected: reinventing a mature, audited parser for a security-relevant untrusted-input path is exactly the kind of premature abstraction/avoidable risk this project's engineering rules warn against.                                                                                                                                                                                                                                                                                                                                            |

Verified directly rather than assumed, per this project's TDD discipline
(`src/import/workbook.rs`'s tests):

- `.xls` reads correctly with no format-specific feature flag.
- A formula cell never leaks its formula source and is never evaluated
  by this crate — `calamine` only ever returns whatever cached value the
  workbook file itself stored. (The synthetic fixture generator,
  `xlwt`, doesn't compute a cached formula result the way real Excel
  does, so a _non-blank_ cached-value round-trip could not be verified
  in this environment — recorded as verification debt below, not
  claimed as covered.)
- The crate has no macro-execution or external-link-following capability
  at all — there is nothing in its API surface that could do either.

**Dependency governance**: `cargo-deny`/OSV-Scanner remain unavailable
in this environment (same disclosed gap as every prior dependency
addition). The supply-chain/CVE check for `calamine` and its transitive
tree has not actually run — recorded honestly in
`docs/VERIFICATION-DEBT.md`, not silently skipped. See
`docs/SOURCE-REGISTRY.md` for the full ADOPT entry.

## Decision 2: Architecture layering

```
SF1 .xls file
  → import::workbook       (calamine adapter — RawSf1Row, cell values only)
  → import::normalize      (safe normalization only — RawSf1Row → Sf1ImportRow)
  → import::validate       (row-level errors/warnings — Sf1ValidationIssue)
  → import::matching       (reuses learner::find_candidates — LearnerMatchResult)
  → import::preview        (orchestrates the above — Sf1ImportPreview)
  → [human review / DuplicateResolution — not yet a UI this checkpoint]
  → import::commit         (one transaction — reuses learner::create /
                             section_membership::enroll unchanged)
  → commands::import       (Tauri commands — ManageLearners-gated)
```

`import::workbook` is the only module that imports `calamine` or knows
it exists. Everything above it works against `RawSf1Row`/`Sf1ImportRow`
only — never a spreadsheet cell, never a persistence entity directly.
`import::sf1` holds the shared contract types
(`Sf1ImportRow`, `Sf1ValidationIssue`, `LearnerMatchResult`,
`DuplicateResolution`, `Sf1RowCommitPlan`, `Sf1ImportSummary`) —
deliberately distinct from `repository::learner::Learner`, per the
brief's explicit requirement that parser output must not be persistence
entities directly.

## Decision 3: Normalization and validation rules

Only SAFE normalization is applied (`import::normalize`): trim
whitespace, treat a blank cell as absent, canonicalize only unambiguous
sex encodings (`M`/`MALE` → `M`, `F`/`FEMALE` → `F` — anything else is
left unrecognized, never guessed), and confirm an LRN's 12-digit format
(the same rule the `learners` table's own CHECK constraint already
enforces) without ever inventing or correcting one. Birthdate is parsed
into ISO-8601 when the source cell was a real Excel date, but is
**never persisted** — `learner::Learner` deliberately has no birthdate
column (ADR-0017's original scope decision, left standing here); it
exists only as an extra duplicate-matching signal and a
validation/warning surface, not a stored field. SF1's Remarks column
(transfer/dropout/Balik-Aral/CCT/exceptionality codes) is carried
through as an opaque string and not interpreted — encoding that
taxonomy into learner/enrollment status is explicitly deferred (see
"Deferred" below), matching `docs/adr/0042-...`'s own prior deferral of
the same taxonomy.

Validation (`import::validate`) separates hard errors — missing given
name, missing family name, an LRN present but not 12 digits — from
warnings that never block commit: no LRN given, an unrecognized sex
value, an unparseable birthdate. Every message is a fixed, generic
string; **never the offending cell's actual text**, per the no-PII-in-
diagnostics rule below.

## Decision 4: Duplicate matching — deterministic, human-resolved, no merge

`import::matching::classify_row` reuses `learner::find_candidates`
(built in Wave 2A) rather than a second matching query. Classification
is a strict hierarchy: an exact LRN match against an existing learner in
the same school is `ExactLrn` (automated — LRN equality is DepEd's own
stable identifier, never ambiguous); any other name/LRN overlap is
`SuspectedDuplicate` (always surfaced for human review, never
auto-resolved, even with a single unambiguous-looking candidate); no
overlap at all is `New`. Every classification is school-scoped by
`find_candidates`'s own `WHERE school_id = ?1` — a shared name or LRN in
a _different_ school is never treated as a duplicate.

There is no merge option. Wave 2A.1's own authorization audit already
established this codebase has no learner delete/merge capability at
all; the brief explicitly says not to invent one "merely because the UI
needs a button." `DuplicateResolution` is `UseExisting { learner_id }`
or `CreateSeparate` only. A `SuspectedDuplicate` row with no resolution
is simply excluded from the commit batch — never silently merged, never
silently created as a duplicate.

## Decision 5: No import-fingerprint/session table

The brief allows an import-session record "only if it provides real
value." It doesn't, for deduplication: `idx_learners_school_lrn`
(UNIQUE on `(school_id, lrn)`) already makes a repeated LRN a
_recognized existing learner_ via `find_candidates`, not a duplicate;
`idx_one_active_membership_per_learner` (UNIQUE WHERE `ends_on IS
NULL`) already prevents a duplicate active enrollment structurally; and
`section_membership::enroll` is already idempotent for re-enrolling into
the same section (proven by an existing test from Wave 2A, and reused
directly by `import::commit`). Adding a parallel dedup mechanism on top
of invariants the schema already enforces would be exactly the kind of
unrelated, unjustified abstraction the engineering rules warn against.
No import-batch table was added this milestone.

## Decision 6: Transaction model

`import::commit::commit_import` opens exactly one `rusqlite::Transaction`
for the whole approved batch and reuses `repository::learner::create`
and `repository::section_membership::enroll` **completely unchanged** —
verified directly before any pipeline code was written (not assumed):
`Transaction` deref-coerces into every existing `&Connection`-taking
repository function, and a `Transaction` dropped without `commit()`
rolls back automatically. A dedicated failure-injection test
(`import::commit::tests::a_failure_partway_through_the_batch_rolls_back_the_entire_batch`)
constructs a batch where an early row would individually succeed but a
later row hits the same LRN-uniqueness constraint a legitimate
double-import would — and proves zero rows and zero enrollments persist
afterward, not just the failing row.

## Decision 7: Re-import / idempotency behavior

Re-importing the same workbook is proven end-to-end
(`import::preview::tests::re_importing_the_identical_file_...` and the
integration-level
`tests::re_importing_the_same_file_and_resolving_matches_as_use_existing_...`):
every row committed the first time reclassifies as `ExactLrn` (if it had
an LRN) or `SuspectedDuplicate` (if not) on the second pass — never
`New` again. Resolving those as `UseExisting` a second time enrolls
without creating a second learner record or a second active membership,
because `section_membership::enroll` already treats re-enrolling into
the same section as a no-op returning the existing row. File-hash-based
dedup was deliberately not used — record-level domain uniqueness (the
DB's own constraints) is the authoritative guard, exactly as the brief
requires.

## Decision 8: Authorization

`preview_sf1_import` and `commit_sf1_import` (`commands::import`) both
gate on `Capability::ManageLearners` (Registrar/School Head) — the same
capability `create_learner`/`find_learner_candidates` already use,
since previewing/committing an import is the same "manage learner
records" capability, not a new one. `school_id` is derived from the
session via `authorize_capability` in every case, never accepted as a
caller parameter and never read from the workbook's own metadata cells.
Proven directly: a session scoped to School A committing a plan whose
row data includes no school reference at all still only ever writes
into School A (`tests::committing_an_import_always_writes_into_the_sessions_own_school_never_a_different_one`);
committing into a section belonging to a different school fails and
rolls back with nothing written
(`tests::a_registrar_cannot_commit_into_a_section_belonging_to_a_different_school`);
a Teacher-only session and a no-session caller are both denied for both
commands, with zero learners created in the denied case.

## Security review

- **Untrusted file handling**: `import::workbook::read_sf1_rows` checks
  file size (25 MB cap) before opening, caps data rows read (3000) after
  locating the header, and only ever calls `calamine`'s pure in-memory
  cell-value reader — nothing in the parse path executes macros, follows
  external references, or writes anywhere.
- **No PII in diagnostics**: every `Sf1ValidationIssue` message is a
  fixed, generic string (proved directly by
  `validate::tests::validation_messages_never_contain_the_actual_name_values`);
  `AppError::Import`'s message is likewise always a fixed category
  string, never the underlying `calamine` error text (which can
  otherwise leak internal file-format detail) and never cell content.
  Nothing in the import path calls `log::*` with row data.
- **Formula/macro safety**: `calamine` has no formula-evaluation or
  macro-execution capability in its API surface at all — confirmed by
  inspection, not merely assumed, and reinforced by the formula-cell
  test above.
- **Path handling**: `preview_sf1_import` takes a caller-supplied path
  string, consistent with this app's existing trust model (the frontend
  is this app's own webview, not attacker-controlled content — the same
  trust level every other Tauri command already operates at). No file
  dialog/picker was built this checkpoint — deferred to the UI phase.

**Independent `security-reviewer` — retrieved this time via the raw
transcript file** (the standard notification channel again hit this
project's recurring reviewer-retrieval bug — the agent kept insisting
its findings were "already delivered" on every follow-up ping; reading
`tasks/<agent-id>.output` directly recovered the real, complete report
this time rather than falling back to self-review). Full review scope:
untrusted-workbook-input handling, authorization ordering, school-scope
derivation, PII-in-diagnostics, transactional atomicity, cross-school
enrollment rejection. Result: **7 of 8 questions FALSE POSITIVE** with
direct file:line citations (no path-traversal risk given this app's
trust model; `school_id` always session-derived, never client- or
workbook-supplied; no cell content can redirect a write's school/section
scope; no PII in any error message or log call, proven by an existing
test; commit is genuinely atomic, proven by the failure-injection test;
authorization runs before any file read or DB write in both commands;
cross-school enrollment is independently rejected one layer down by
`section_membership::enroll`'s own pre-write check). **One real
should-fix**: `MAX_DATA_ROWS` (`import::workbook.rs`) is checked only
after `calamine::worksheet_range` has already fully materialized the
sheet into memory — `calamine`'s public API has no lower-level way to
count rows first. `MAX_FILE_BYTES` (checked first, before any parsing)
remains the real bound against a zip-bomb-style crafted `.xlsx`; the row
cap only bounds what's accepted as a valid import, not peak parse
memory for one call. Documented in place
(`import::workbook.rs`'s `MAX_DATA_ROWS` doc comment) and in
`docs/VERIFICATION-DEBT.md` as an accepted, disclosed risk for a
single-tenant, non-internet-facing desktop app — not silently left
unaddressed.

## Domain review

Reuses three existing domain invariants (`idx_learners_school_lrn`,
`idx_one_active_membership_per_learner`, `section_membership::enroll`'s
idempotency) rather than duplicating them; adds no new persisted field
and no new table. The one new `AppError` variant
(`Import(String)`) follows this file's existing category-only
serialization convention exactly.

## Scope of this checkpoint

Built and verified this milestone: the full engine (workbook adapter,
normalization, validation, matching, preview orchestration,
transactional commit), the `commands::import` Tauri command layer with
authorization wired through, and the integration test suite proving the
authorization/school-scope/transaction/re-import contracts above — 43
unit tests plus 8 integration tests, all passing, alongside the full
existing 393-test suite.

**Not built this checkpoint, deliberately**: the import-preview UI
screen (New/Existing/Needs Review/Errors, mode-parity across
Efficient/Comfortable/Guided, "why was this flagged" guidance). This
follows this project's own established precedent (RBAC, Curriculum
Foundation, Teacher Load, and Wave 2A itself all shipped as a verified
zero-or-minimal-UI vertical slice first) and this milestone's own
session-safety rule: a self-contained, fully-tested engine is a stable,
committable checkpoint on its own. The command layer already proves the
full authorized vertical slice end-to-end without a screen. UI is the
natural next increment on top of this contract, not a redesign of it.

## Deferred (not this milestone, not guessed at)

- SF1 Remarks-column semantics (Transferred In/Out, Dropped Out,
  Balik-Aral, CCT/4Ps, Learner with Exceptionality) — carried through as
  an opaque string only; encoding it requires a learner/enrollment
  status model that doesn't exist yet (same deferral ADR-0042 already
  recorded).
- Real DepEd SF1 template verification — see "Fidelity disclosure"
  above; recorded as external material only the user can provide.
- Import-preview UI — see "Scope of this checkpoint" above.
- A non-blank cached-formula-value read proof — no tool available in
  this environment can author an `.xls` with a genuine Excel-computed
  cached formula result; recorded in `docs/VERIFICATION-DEBT.md`.
- `cargo-deny`/OSV-Scanner supply-chain check for `calamine` — recorded
  in `docs/VERIFICATION-DEBT.md`, same disclosed gap as every prior
  dependency addition.

## Addendum (Wave 2C): Import Preview + Duplicate Review UX

Connects the engine above to a teacher-facing screen
(`src/ui/Sf1ImportScreen.tsx` + `src/ui/components/Sf1DuplicateReview.tsx`).
No backend contract changed — the UI adapts to the existing
`Sf1ImportPreview`/`Sf1RowCommitPlan`/`MatchKind`/`IssueSeverity` shapes
verbatim (mirrored in `src/domain/sf1-import.ts`, including the exact
serde externally-tagged wire format for `Sf1RowAction`).

**Native file picker**: added `tauri-plugin-dialog` /
`@tauri-apps/plugin-dialog` (official first-party Tauri plugins, both
v2.7.2 — see `docs/SOURCE-REGISTRY.md`) behind a new `FilePicker` port
(`src/domain/ports/file-picker.ts`), implemented only in
`src/infrastructure/tauri/file-picker.ts`. `capabilities/default.json`
grants only `dialog:allow-open`, not the plugin's broader default
permission set. The frontend never receives or constructs a filesystem
path from anywhere except this dialog.

**No new backend authority**: the UI never supplies `school_id` or a
capability — both Tauri commands still derive scope from the session,
proven directly by existing Wave 2B tests
(`commit_sf1_import`/`preview_sf1_import`'s own `authorize_capability`
gate) plus new UI-level tests confirming no `schoolId` field is ever
sent. The screen also never converts a `SuspectedDuplicate` into an
`ExactLrn` match or offers a merge action — `DuplicateDecision` is
`useExisting`/`createSeparate` only, matching Decision 4 above exactly.

**Target section is a UI-level addition, not a hidden backend
requirement**: `commit_sf1_import` already required `section_id`/
`starts_on` (Wave 2B), so the screen's "Which section is this SF1 for?"
step is adapting to that existing contract, not inventing new backend
scope.

**Android decision**: kept Windows-only, deliberately (Option C from
the brief), not attempted as a shrunken desktop UI. This codebase has
no Android build target scaffolded at all yet (`src-tauri/gen/android`
does not exist) — there is no runtime to evaluate feasibility against,
so claiming any Android behavior here would be unverifiable. Revisit
once an Android target actually exists, per `CLAUDE.md`'s own
"Windows first; Android later."

**Verification debt carried forward unchanged** by this addendum (UI
work doesn't close any of it): real SF1 template fidelity, the
non-blank cached-formula-value proof, `cargo-deny`/OSV-Scanner for
`calamine`, and now also for `tauri-plugin-dialog`, and
`MAX_DATA_ROWS`'s post-materialization ordering. See
`docs/VERIFICATION-DEBT.md`.

**Independent teacher-UX review (premium-design + teacher-comfort) —
CLOSED**, 4 NEEDS-FIX findings, all fixed in this same checkpoint: only
the first duplicate candidate was ever shown/decided against despite
the backend query legitimately being able to return more than one
(fixed with a candidate selector); the "nothing is saved until you
decide" safety reassurance was Guided-only instead of shown in every
mode (fixed); a whole-file failure collapsed every cause into one
generic message instead of recognizing the backend's `import_error`
category (fixed); the birthdate row used two different phrasings for
the same fact (fixed, reconciled to one). Full detail in
`docs/VERIFICATION-DEBT.md`.

## Addendum (Wave 2E): SF1 Import Operational Hardening & Auditability

Adds the operational layer this milestone's own directing brief asked
for — "what was imported, by whom, when, from which file" — without
touching the existing preview/commit contract, duplicate-resolution
semantics (`useExisting`/`createSeparate` only, still no merge), or
Wave 2D's encryption architecture. No repository-truth surprises: the
existing engine and UI were exactly as documented above.

**Import history model — a new table, not an audit_log extension.**
`repository::audit_log` was inspected first, per this milestone's own
instruction to prefer reuse. Its own doc comment (migration 15) scopes
it deliberately to authentication events only, and its row shape
(`event_type` enum, no counts, no filename/fingerprint) doesn't fit an
import result. Rather than widen `audit_log`'s scope — which the
project has already decided against once — a new `sf1_import_history`
table (migration 19) mirrors its _pattern_ instead: school-scoped
`record`/`list_for_school`, a UUIDv7 `id` breaking same-millisecond
ties in `ORDER BY created_at DESC, id DESC`, `user_id` nullable with
`ON DELETE SET NULL` plus a denormalized `username` snapshot — all
copied conventions, not new decisions.

**No `status` column — a deliberate omission, not an oversight.** The
one new history-writing call, `sf1_import_history::record`, is invoked
from inside `import::commit::commit_import`'s existing single
`rusqlite::Transaction`, immediately before `tx.commit()`. Because
`commit_import` was already proven fully atomic in Wave 2B
(`a_failure_partway_through_the_batch_rolls_back_the_entire_batch`),
a history row can only ever exist for a batch that actually committed
— there is no reachable "partially failed" or "previewed" state for it
to represent, so adding a status column would be lifecycle complexity
with no real requirement behind it (explicitly against this project's
own autonomous-development scope-discipline rule). A new adversarial
test, `a_failed_commit_leaves_no_history_row_behind`, proves the
history insert rolls back with everything else, not just the learner
rows.

**Re-import detection is a SHA-256 content fingerprint, advisory
only.** `import::fingerprint::compute` hashes the picked file's raw
bytes (reusing `workbook::MAX_FILE_BYTES` as the same size guard the
parser itself applies) and is looked up against
`sf1_import_history.source_fingerprint` — by content, never by
filename, in either direction (proven by
`a_previous_import_recorded_under_a_different_filename_still_matches_by_content`
in `import::preview`'s test module). `std`'s `DefaultHasher` was
considered and rejected: its own documentation disclaims algorithm
stability across Rust releases, which would silently stop matching a
fingerprint already persisted in SQLite after a toolchain upgrade —
fatal for a value meant to be compared against history written months
earlier. `sha2` was added as a direct dependency instead of writing a
hand-rolled hash, but at effectively zero build cost: it was already
resolved in this workspace's Cargo.lock as a transitive dependency of
`tauri-codegen` (a build-time proc-macro crate), so promoting it to a
runtime dependency links the same already-compiled version into the
app binary rather than adding a new one to the dependency graph. A
lookup failure (e.g. a moved/deleted file between preview and commit)
never fails the preview or the commit — it just means no advisory
notice is shown, or the history row's filename/fingerprint fall back to
fixed placeholders (never a raw error, never blocking).

**The fingerprint is not a security or authorization control**, and
nothing in this milestone treats it as one — it never gates whether a
commit is allowed, and the client never supplies it: `commit_sf1_import`
re-reads the same `file_path` the caller already previewed and computes
the filename/fingerprint itself, exactly like `school_id` is never
accepted from a caller.

**Teacher-facing surface**: the preview screen shows a non-blocking
advisory banner when this exact file's content matches a prior
`sf1_import_history` row ("You appear to have imported this exact file
before…") — informational only, every row still goes through the same
review as always. A minimal "View past imports" panel on the setup
screen lists `sf1_import_history` rows (filename, actor, timestamp,
counts) — no raw SF1 content, no learner names/LRNs, matching this
milestone's explicit "no analytics dashboard" scope limit.

**Authorization**: `list_sf1_import_history` uses the same
`Capability::ManageLearners` gate and session-derived `school_id` as
every other SF1 import command — there is no school-id parameter for a
caller to supply at all. A new `auth::authorize_capability_with_actor`
sits alongside the existing `authorize_capability` (identical gate
logic, additionally returning `user_id`) rather than changing that
function's signature for every existing caller. New negative-
authorization tests
(`a_teacher_cannot_list_sf1_import_history`,
`a_registrar_never_sees_another_schools_import_history`) cover both the
capability gate and school isolation specifically for history.

**Security tooling in CI (Section 14) — deferred again, with a
concrete plan this time.** `gitleaks`, `cargo-deny`, and `osv-scanner`
were re-run locally against this milestone's changes (the new `sha2`
dependency included) and are clean — see
`docs/VERIFICATION-DEBT.md`. They remain unwired in CI: this session
could not dry-run a new GitHub Actions job before pushing, and an
untested scanner step risks exactly the failure mode this milestone's
own brief warns against ("a secure scanner configuration that randomly
breaks the project's primary CI is also not acceptable"). The concrete
next-session plan: add a **separate** `security-scan` job (not inside
`quality-ubuntu`/`quality-windows`, so a scanner outage or false
positive can never redden the primary gate) on `ubuntu-latest`, using
`gitleaks/gitleaks-action` and `EmbarkStudios/cargo-deny-action` (both
official, both to be pinned by commit SHA, not a floating tag) with
`cargo-deny-action`'s `manifest-path: src-tauri/Cargo.toml`.
`osv-scanner` is left out of that first pass — this session's own CLI
invocation needed a specific `--config=... -r .` form to apply
`osv-scanner.toml`'s ignore list correctly (a plain `--lockfile` form
silently ignored it in Wave 2D), and that same fragility should be
proven safe against `google/osv-scanner-action` specifically before
trusting it in CI, not assumed to carry over.

**Verification debt closed by this addendum**: dependency-security
debt is re-confirmed (not newly closed) against the changed
dependency graph. **Verification debt still carried forward
unchanged**: everything listed at the end of the Wave 2C addendum
above, plus CI wiring for the three security tools (now with the
concrete plan above instead of a repeated deferral).

**Independent security review — CLOSED, no blocking findings.**
Checked all 8 requested angles (cross-school leakage, authorization
bypass, PII/logging, transaction atomicity, fingerprint's
advisory-only status, SQLCipher/DPAPI regression, oversized-file
handling, the new `sha2` dependency) against direct file evidence and
existing tests; found nothing exploitable in any of them. Two
non-blocking should-fix items, both doc-comment accuracy, not code
defects: `commit_sf1_import`'s doc comment overstated that the
computed fingerprint is bound to the actually-committed `plans` (it
isn't — the value itself just isn't client-supplied); migration 19's
comment claimed "no learner PII" too absolutely, since
`source_filename` is teacher-supplied free text that could
incidentally contain a name. **Both fixed in this same checkpoint** —
see the softened comments in `commands/import.rs` and
`db/migrations.rs`. This session's standard reviewer-notification
channel initially returned only a stall message for this agent
(this project's known recurring reviewer-retrieval bug); one retry via
direct message recovered the full report.

**Independent architecture review — CLOSED, one real (non-blocking)
finding fixed.** Checked all 8 requested angles (layering, reuse vs.
reinvention, transaction-boundary correctness, schema proportionality,
`sha2` justification — independently re-verified via `cargo tree -i
sha2 -e normal`/`-e build`, not just trusted from the Cargo.toml
comment — frontend-state-as-source-of-truth risk, the command-layer
trust boundary, general code health). Found `commit_import` had no
server-side guard against an empty `plans` slice: the only guard was
client-side (`Sf1ImportApplicationService.commitImport`'s
`ValidationError`), so a caller that reached `commit_sf1_import`
directly with `plans: []` would have written a phantom "0 rows, 0
learners" `sf1_import_history` row — a real, if low-severity, gap in
migration 19's own "existence implies a real import" invariant. **Fixed
in this same checkpoint**: `commit_import` now rejects an empty
`plans` before opening a transaction at all, proven by a new test
(`an_empty_plan_is_rejected_server_side_and_writes_no_phantom_history_row`).
Two further optional, non-blocking suggestions (a small
`ImportProvenance` struct to remove the `clippy::too_many_arguments`
allow and an adjacent-same-type-argument transposition hazard; using
plain SQL literals instead of a `format!`-composed constant in
`sf1_import_history.rs` for pattern consistency with `audit_log.rs`)
were deliberately not implemented — genuine code-health nits with no
correctness impact, not worth the churn against this milestone's scope
discipline. This session's standard reviewer-notification channel
initially returned a stall message for this agent too; one retry via
direct message recovered the full report.
