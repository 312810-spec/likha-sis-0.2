# ADR-0037 — Curriculum / Key-Stage Versioning Foundation

Status: Accepted

## Context

`docs/product/PRODUCT-CONTRACT.md` §4 already set the direction: no
`curriculum_version`, `key_stage`, or cohort concept exists in the
schema; `sections.grade_level` is a plain, unconstrained string. The
product requirement is that shared architecture must never hard-code
`grade == 11/12 → one SHS curriculum`, that curriculum must be modeled
as versioned (so a curriculum can span multiple school years, overlap
during a transition, or require controlled rollout), and that historical
records must remain interpretable after curriculum definitions change —
`school_year == curriculum_version` is explicitly rejected as an
architectural identity.

This directly generalizes a pattern this codebase has already proven
twice: `grading_policies`/`grading_policy_periods` (ADR-0010) and
`grading_weight_policies`/`class_records.weight_policy_id` (ADR-0013/ 0015) — small, versioned, named reference data, explicitly pinned per
operational record, resolved via a COALESCE-to-default lookup for
migration-safety `NULL`s. This milestone applies that same shape to
curriculum, rather than inventing a new pattern.

## Research

- **Key Stage grade bands (KS1-KS4)**: already primary-source-verified
  in this codebase without being modeled as data.
  `docs/adr/0013-deped-grade-computation.md` read DepEd Order No. 015,
  s. 2026's own PDF text directly: Annex D "Guidelines on Numeric
  Grading System for Key Stage 2 to 4"; Table 9 "KS2-KS3/Grades 4-10";
  "Key Stage 4 (SHS)"; "Key Stage 1's descriptive-grading conversion."
  This banding is part of the K to 12 system's grading structure, not
  something that changes between curriculum _content_ revisions — it
  does not vary by curriculum version. Kindergarten's placement relative
  to this numbering was not confirmed and is deliberately left unmapped.
- **MATATAG curriculum**: DepEd's revised K to 10 curriculum. This
  session's own research (`deped-researcher` was dispatched but hit this
  project's known, recurring agent-resume/retrieval failure on both the
  initial attempt and one permitted retry — recorded honestly below, not
  hidden; direct `WebSearch`/`WebFetch` was substituted) triangulated a
  phased rollout across matatagcurriculum.ph, teachpinas.com,
  depedlibre.com, and jandhpublications.com, consistent with DepEd's own
  `deped.gov.ph/matatagcurriculumk147/` phase-1 page (title: "Curriculum
  Phase 1 SY 2024-2025"): SY 2024-2025 (Kindergarten, Grades 1, 4, 7);
  SY 2025-2026 (Grades 2, 3, 5, 8); SY 2026-2027 (Grades 6, 9, 10),
  completing K-10. Senior High School (Grades 11-12) has a separate
  implementation schedule DepEd has not yet released — direct
  `WebFetch` of `deped.gov.ph` itself was blocked by this environment's
  network egress policy, so this is triangulated secondary-source
  evidence, not a primary-source PDF reading (unlike ADR-0013's grading
  research, which had primary-source access) — disclosed as such, not
  overstated.
- **Not confirmed**: any specific learning-area/subject-_name_ difference
  between the prior K to 12 curriculum and MATATAG. Not encoded as fact
  — see Decision below.
- **DepEd's own curriculum-version identifiers**: DepEd names curricula
  ("K to 12 Basic Education Curriculum," "MATATAG Curriculum") but does
  not appear to expose a machine-readable version identifier scheme —
  `curriculum_versions.id` (a UUID) is an internal LIKHA-SIS identifier,
  not a DepEd one, exactly as `grading_policies`/`grading_weight_policies`
  already do for their own reference rows.

## Decision

**Two independent, deliberately un-joined reference axes** (per the
product contract's explicit "school_year is not the curriculum itself"
rule):

1. **`key_stages`** — KS1 (Grades 1-3), KS2 (4-6), KS3 (7-10), KS4
   (11-12). Global, not scoped to any curriculum version, since the
   research shows this banding is a stable K-12 system structure, not a
   curriculum-content concern.
2. **`curriculum_versions`** — which named curriculum's content applies.
   Two real, named rows seeded: "K to 12 Basic Education Curriculum"
   (**sole default**) and "MATATAG Curriculum" (not default). The K to
   12 curriculum is the default specifically because Senior High School
   still needs it unconditionally (no released transition schedule) and
   this application has no grade-level normalization yet
   (`sections.grade_level` remains free text) — there is no safe way to
   auto-resolve "MATATAG for K-10, K-12 for SHS" per record today, so
   the version that already covers the whole school without guessing is
   the safer system-wide default. Mirrors `grading_weight_policies`'
   exact shape, including the "at most one default" structural guard
   (`idx_one_default_curriculum_version`).

**`curriculum_learning_areas`** — which named learning areas a
curriculum version defines. Deliberately **not** joined to `subjects` —
a school's own freeform subject list already has no DepEd classification
(the same gap ADR-0015 disclosed and left unresolved for weight groups);
forcing a new required relationship onto `subjects` now would be the
"full curriculum administration product" this milestone is explicitly
not building. Both curriculum versions are seeded with the same eight
already-verified DepEd learning-area names this codebase already cites
elsewhere (`grading_weight_policies`' own citations: English, Filipino,
Mathematics, Science, Araling Panlipunan, GMRC/Values Education, EPP/TLE,
MAPEH) — no specific MATATAG-vs-prior naming difference is encoded, since
none was confirmed. The structure supports two versions diverging later;
today's content does not yet encode a known difference, and none is
invented.

**`class_records.curriculum_version_id`** — the operational pinning
column, mirroring `weight_policy_id`'s exact shape (nullable only for
migration safety; `resolved_curriculum_version_id_in_school` is the
COALESCE-to-default lookup). **Deliberate deviation from
`weight_policy_id`'s convention**: `weight_policy_id` is always
required explicitly (a wrong pick computes a materially wrong grade, so
`ClassRecordsScreen` always shows a picker, never hidden — ADR-0015).
`curriculum_version_id` is auto-resolved to the default when not given,
and **no picker was added to the UI at all this milestone** — nothing
yet reads which curriculum version is pinned to make a different
decision (no learning-area validation, no grade-computation difference),
so forcing a teacher to choose between two internal curriculum
identifiers with no behavioral consequence would be exactly the
unnecessary configuration this project's design principle warns
against ("does a normal teacher actually need to configure this?"). The
repository layer (`class_record::create`'s `Option<&str>` parameter,
`curriculum::version_exists`) is ready for an explicit choice the moment
a real consequence exists; the command layer chooses not to expose it
yet.

## Representative proof

`class_record.rs`'s
`two_curriculum_versions_coexist_and_changing_the_default_does_not_rewrite_an_already_pinned_record`
test: two class records are explicitly pinned to different curriculum
versions (K to 12 and MATATAG); `is_default` is then flipped from one to
the other (simulating a newer curriculum version becoming active); both
records' `resolved_curriculum_version_id_in_school` results are
re-checked and found unchanged — proving an already-pinned record's
meaning survives a default change. A companion test,
`changing_the_default_curriculum_does_change_an_unpinned_legacy_records_resolution`,
proves the intentional contrast: only a never-pinned (pre-migration
`NULL`) row follows whichever curriculum is currently default — the same
distinction `weight_policy_id` already established. No code branches on
which curriculum a record is pinned to; both resolve through the same
generic COALESCE lookup.

## Consequences

- `src-tauri/src/db/migrations.rs` — new migration: `key_stages`,
  `curriculum_versions`, `curriculum_learning_areas`,
  `class_records.curriculum_version_id`, seed data, 9 migration tests.
- `src-tauri/src/repository/curriculum.rs` (new) — `CurriculumVersion`,
  `list_versions`, `default_version_id`, `version_exists`.
- `src-tauri/src/repository/class_record.rs` — `curriculum_version_id`
  field, `create()`'s new `Option<&str>` parameter,
  `resolved_curriculum_version_id_in_school`, 6 new tests including the
  coexistence proof above.
- `src-tauri/src/commands/class_record.rs` — `create_class_record`
  unchanged from the frontend's perspective (always requests the
  default); every other existing `class_record::create` call site
  (2 repository test modules, 2 integration test files) updated to pass
  `None`, preserving prior behavior exactly.
- **No TypeScript/UI change at all.** `ClassRecord`'s new field is
  serialized to the frontend but not declared in the TS domain type — an
  untyped extra JSON field, harmless, matching how RBAC also required
  zero TS changes for its representative proof.
- Not built this milestone (explicit non-goals): any curriculum
  administration UI; a `subjects`-to-`curriculum_learning_areas`
  required relationship; grade-level normalization on `sections`; any
  automatic curriculum selection by grade level (blocked on that
  normalization not existing — `sections.grade_level` is unconstrained
  free text today, so `if grade_level >= 7`-style resolution was
  deliberately not attempted); school-level curriculum
  activation/selection (no repository evidence this milestone showed it
  was required — global reference data with one default, same as
  grading policies, was sufficient for the representative proof);
  Teacher Load/Schedule, SF1, sync, or any other Wave 1+ item.
- **Independent review**: `architecture-reviewer` dispatched for
  architecture/data-integrity — see `docs/VERIFICATION-DEBT.md` for the
  outcome (recorded there rather than duplicated here, since this ADR is
  written before the review's findings are known).
- **Verification**: `npm run quality` (390/390), `check:architecture`,
  `check:dev-preview-isolation`, `knip` all re-run clean this milestone.
  `cargo check --lib`/`cargo test --lib` remain **BLOCKED** by the
  pre-existing `windows-future`/`windows-core` conflict, reconfirmed
  identical — new Rust code is written and manually reviewed, not
  compiler-verified. See `docs/VERIFICATION-DEBT.md`.

## Addendum (2026-09-06) — product-owner clarification closes 4 of the 5 original open gaps

The product owner relayed authoritative clarification this session,
cross-checked once via `WebSearch` against real DepEd sources. This
closes 4 of the 5 gaps this ADR's own Research/Decision sections left
open above; the 5th (below) is a sourcing-policy note, not a data-model
gap. Implemented additively in migration 38
(`src-tauri/src/db/migrations.rs`) — no prior migration edited, no row
deleted.

**1. SHS rollout timeline — was "not yet released," now resolved.**
DepEd Order No. 017, s. 2026 ("Strengthened Senior High School
Curriculum") is DepEd's SHS transition schedule. It applies to **Grade
11 only**, effective SY 2026-2027, and restructures Grade 11 to 5 core
subjects (down from 15) taken as full-year courses: Effective
Communication, Life Skills, General Mathematics, General Science,
Philippine History and Society. Sources this session: sunstar.com.ph,
depedsanpablo.com, tchersden.com — secondary reporting on the official
DO 017 s.2026 issuance; a direct primary-source deped.gov.ph fetch was
not attempted this session (see gap 5 below on why this is treated as
sufficient). Modeled as a new `curriculum_versions` row, "Strengthened
Senior High School Curriculum (Grade 11)" (id
`00000000-0000-7000-8000-000000005003`), seeded NOT default — for the
same reason the original Decision section gives for the existing
default (no `sections.grade_level` normalization yet, so nothing can
safely auto-resolve which curriculum applies per record) — with its 5
core subjects as `curriculum_learning_areas` rows. This fit the
existing table shape cleanly (a new curriculum version + its own
learning-area rows), so no new schema was needed and none was invented.

**2. Subject-to-curriculum-learning-area mapping — was "deliberately
un-joined, disclosed non-goal," now resolvable per grade band.** This
ADR's original non-goal (a `subjects`-to-`curriculum_learning_areas`
required relationship) is unchanged and still not built — that remains
out of scope. What's newly resolvable is which _curriculum version_
governs which grade band, per DepEd order:

- **JHS (Grades 7-10)**: DepEd Order No. 015, s. 2026 — `WebSearch`
  this session confirmed DO 015 s.2026 is DepEd's revised
  classroom-assessment/grading-system guidelines, explicitly aligned
  with "the Revised Kindergarten to Grade 10 Curriculum and the
  Strengthened Senior High School Curriculum," implementation
  beginning SY 2026-2027. This is the same DepEd Order No. 015, s. 2026
  this ADR's original Research section already cites for Key Stage
  grade-banding (Annex D) — now also confirmed as the JHS/K-10
  curriculum-alignment source, not a separate order.
- **Grade 11**: DO 017, s. 2026 (gap 1 above) — the Strengthened SHS
  Curriculum's 5 core subjects.
- **Grade 12**: unaffected. Stays on the prior/legacy SHS curriculum —
  this is **not new information**, it is exactly what ADR-0068's
  already-implemented DepEd Order No. 8, s. 2015 carryover already
  models via the "K to 12 Basic Education Curriculum" row. ADR-0068's
  implementation was not touched by this session; both ADRs now
  describe the same Grade-12 reality consistently.

**3. MATATAG-vs-prior naming — was "not confirmed, no specific
difference encoded," now superseded.** The "MATATAG Curriculum" name is
being superseded by "Enhanced K to 10 Curriculum" (also seen as
"Revised K to 10 Curriculum" in DepEd's own DO 015 s.2026 framing, per
this session's `WebSearch`). The existing "MATATAG Curriculum" row (id
`00000000-0000-7000-8000-000000005002`) is renamed **in place** —
same id, same 8 previously-seeded learning areas, only `name` and
`source_citation` change. No specific MATATAG-vs-prior _learning-area
content_ difference was confirmed this session either — that part of
the original gap remains genuinely open, and no content difference is
invented.

**4. Kindergarten Key-Stage placement — was "deliberately left
unmapped," now explicitly confirmed excluded.** Product-owner direction:
explicitly remove Kindergarten from Key-Stage scope entirely, not
attempt a K1-K4 mapping now — defer entirely to a future milestone.
Verified this is already true and required no code/data fix: `key_stages`
KS1 already starts at `min_grade_level = 1`; no row covers grade level 0
(Kindergarten), and no code path infers a Kindergarten Key Stage from
this table. A regression test,
`kindergarten_grade_level_matches_no_key_stage_band`
(`src-tauri/src/db/migrations.rs`), proves a grade-level-0 lookup
against `key_stages` returns zero rows rather than silently matching
KS1. No new Kindergarten-specific concept was built, per instruction.

**5. Sourcing-policy clarification (process note, not a data-model
gap).** The product owner directed: when a `deped-researcher` agent's
direct fetch of deped.gov.ph fails (a known, recurring issue in this
sandbox — see this ADR's own original Research section hitting exactly
this), the next attempt should try a scraping-style approach; if that
still fails, secondary sources that themselves explicitly cite/describe
an "official" DepEd issuance are to be treated as legitimate and
sufficient, not as a fallback requiring extra hedging. This governs how
gap 1's DO 017 s.2026 sourcing above is presented (secondary sources
describing the official issuance, not hedged as unverified) and should
guide future sessions researching DepEd orders in this project, so they
don't over-hedge on secondary-source confidence the way this ADR's
original research did.

**Consequences of this addendum**: `src-tauri/src/db/migrations.rs`
migration 38 (rename + new curriculum version + its 5 learning-area
rows, all additive); `src-tauri/src/repository/curriculum.rs` tests
updated for 3 seeded versions and the new names;
`src-tauri/src/db/migrations.rs`'s pre-existing migration-17 tests that
asserted exactly 2 curriculum versions / the old "MATATAG Curriculum"
name are pinned to `migrations().to_version(&mut conn, 17)` so they
keep proving migration 17's own original behavior unchanged, rather
than being deleted or silently reinterpreted. No TypeScript/UI change.
No `ADR-0068` change.

Note: this addendum was originally drafted in a worktree that had
fallen behind the shared branch and mislabeled its new migration "34"
(already taken on the real branch tip by unrelated sync/role-management
work) — renumbered to migration 38 by the orchestrating session before
merge; the content and reasoning above are otherwise unchanged from
that draft.
