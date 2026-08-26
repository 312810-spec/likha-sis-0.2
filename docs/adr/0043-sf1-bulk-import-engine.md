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
