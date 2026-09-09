# ADR-0074: DepEd `.xlsx` Multi-Year Scholastic Importer

Status: Accepted
Date: 2026-09-08

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §2.4 calls for ingesting an
official DepEd `.xlsx` workbook of a learner's prior-years' grades
directly into learner profiles / SF10 scholastic history, instead of
manual re-entry — most relevant to a transferee whose grade history was
earned at a different school/system, outside this app's own
`class_records`/`learner_scores`.

## Dependency decision: reuse `calamine`, already adopted — no new crate

The task instruction called out `.xlsx`-reading as needing a Rust crate
(suggesting `calamine`) and required flagging any new non-trivial
dependency. **No new dependency was added.** `calamine` 0.36.1 is
already a direct dependency of this crate (`src-tauri/Cargo.toml`),
adopted for the SF1 bulk import engine (`docs/adr/0043-sf1-bulk-import-engine.md`)
and already proven in production code (`import::workbook`). This
importer's own raw-reading module, `import::scholastic_workbook`, is a
second, independent user of the same already-vetted crate — same
MIT-licensed, actively-maintained dependency, zero new supply-chain
surface. `umya-spreadsheet` (also already a direct dependency, for SF1
official-form generation) is reused for this module's own test-fixture
generation, so no second Excel-writing crate was added for tests either.

## Decision

### Not a new learner-creation path

Unlike SF1 (which enrolls **new** learners), this importer only ever
attaches history to an **existing** learner, matched by LRN. A row with
no LRN, or an LRN that matches no learner in this school, is surfaced
for human review (`RowOutcome::NoMatchingLearner`) and is never silently
turned into a new enrollment — importing a transferee's prior grades is
not itself evidence they should be enrolled; enrollment stays SF1's own
job.

### Reused UX shape, not SF1's exact module split

Follows the SF1 bulk-import pipeline's established **shape** — preview
→ duplicate-review → commit
(`docs/adr/0043-sf1-bulk-import-engine.md`) — per the task's explicit
instruction to reuse that shape rather than invent a new import UX:

1. `preview_scholastic_import` (Tauri command, read-only): parses the
   workbook and classifies every row against the school's existing
   learners, without writing anything.
2. The frontend (deferred — see below) is expected to render the
   preview, let a reviewer decide what to do with each
   `NoMatchingLearner`/`AlreadyImported`/`Invalid` row, and build a list
   of only the rows to actually commit.
3. `commit_scholastic_import` (Tauri command): writes an
   already-reviewed batch as one atomic transaction.

This importer is deliberately **not** split into SF1's exact five
modules (`normalize`/`validate`/`matching`/`preview`/`commit` as
separate files) — it is a single-purpose, much smaller pipeline (one
row shape, one match key, no section-enrollment side effect), so its
normalize/validate/match/preview/commit logic lives together in one
file, `import::scholastic`. The **shape** (preview-then-commit,
duplicate awareness, atomic transactional write) is reused; the
**module topology** is proportionate to the feature's actual size, not
copied wholesale.

### Fidelity disclosure

Same disclosed gap as SF1's own `import::workbook` module: **no
official DepEd multi-year scholastic-history `.xlsx` template was
available to verify column layout against** in this session. The
column order this module searches for (LRN, School Year, Grade Level,
Subject, Final Grade, Remarks, Source School) is this project's own
invented structure, found via a case-insensitive header-row search
(not a fixed row index) — the same disclosed hedge `import::workbook`
uses for exactly the same reason.

### Validation

- Final grade must parse as an integer in `60..=100` — DepEd's passing
  scale (the same floor `docs/adr/0013-deped-grade-computation.md`'s
  Annex D transmutation table itself enforces as a minimum reported
  grade). Anything else is `RowOutcome::Invalid`.
- Subject name and school year must be non-blank.
- `scholastic_history_records`'s own `UNIQUE (learner_id, school_year,
subject_name)` constraint is the authoritative duplicate guard;
  `RowOutcome::AlreadyImported` is a friendlier preview-time signal
  ahead of that, not a substitute for it — `commit_scholastic_import`
  still runs inside one transaction, so a forged/stale plan that would
  violate the constraint fails the whole batch rather than partially
  writing.

### Not sync-wired yet

`scholastic_history_records` is not yet wired into `sync_outbox` —
matching this codebase's own established precedent that a brand-new
entity (e.g. ADR-0071's `nutrition_records`) ships its foundation
unsynced first, with sync wiring as an explicitly disclosed follow-up
once the Wave 5 sync-target gate (ADR-0065, currently blocked on EO 119
classification guidance) resolves.

## Consequences

- A school can bulk-ingest a transferee's grade history from a
  spreadsheet instead of re-typing every subject/year by hand, feeding
  SF10's prior-years section (`repository::scholastic_history::list_for_learner`).
- Frontend UI (a preview/review screen mirroring the existing SF1
  import screen) is explicitly deferred — this milestone ships the
  fully-tested Rust command surface only, matching this project's
  established zero-UI-first precedent for a new domain (RBAC,
  Curriculum, Teacher Load, SF8 Health & Nutrition Engine all shipped
  their first increment with full test coverage and no caller).
- Column-layout fidelity is unverified against a real DepEd template —
  recorded in `docs/VERIFICATION-DEBT.md`.

## Verification

- `cargo test` (whole crate): new tests in `import::scholastic_workbook`
  (3), `import::scholastic` (6), `db::migrations` (migration 46, 2
  tests), `repository::scholastic_history` (3).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean.
