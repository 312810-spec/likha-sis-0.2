# ADR-0049: Multi-Form Official-Form Contract + SF9 Readiness

Status: Accepted (engineering checkpoint — see "Verification debt" below)
Date: 2026-08-27
Wave: 2I ("LIKHA-SIS 2.0 — Multi-Form Official-Form Contract + SF9
Readiness" in the directing prompt; this repository's own continuous
Wave numbering — see `docs/CURRENT-HANDOFF.md` — calls the prior
checkpoint "Wave 3." Both labels refer to the same commit
(`313ac0f068d0c8aafbcf9025492562550fd65eb1`); this ADR is the first
document to record the alternate label explicitly rather than leave it
unreconciled.)

## Context

Wave 3 (ADR-0048) shipped a single-form (`SF1`) official-form generation
engine: `commands::formgen` → `OfficialFormGenerator` port →
`formgen::umya_adapter` → a trusted, hash-pinned, bundled template. That
port had one method (`generate_sf1`) and `TemplateDescriptor` had two
fixed-size arrays (`data_columns: [u32; 4]`, `header_cells: [(u32, u32);
4]`) sized exactly to SF1's shape — Wave 3's own independent
architecture review flagged this as not reusable for a form with a
different column count.

This wave's brief asked for two things: (1) generalize the contract so
a second, differently-shaped official form can be added without
widening it into an untyped/generic payload, and (2) determine whether
SF9 (Learner's Progress Report Card) can be built against an
authoritative DepEd template.

## SF9 evidence gate

Searched this repository (`find . -iname "*sf9*"` — zero results before
this wave) and `deped.gov.ph` directly (a live fetch of the department's
own homepage during this wave — no School Forms/SF9 template link is
discoverable there). Web search surfaced only third-party/community
recreations (scribd, various DepEd-tambayan-style blogs) — classified
COMMUNITY/UNVERIFIED, never OFFICIAL, per this project's established
evidence-gate discipline (ADR-0043, ADR-0047, ADR-0048).

**No authoritative SF9 template was found or is obtainable from this
environment. `OFFICIAL_SF9_FIDELITY = NOT_VERIFIED`, unconditionally.**
Per the brief's own Option B: SF9 work in this wave is limited to
architecture readiness against a clearly synthetic fixture — never
presented as, or capable of being mistaken for, an official DepEd
document.

## Ten-scenario decision (recorded per this project's rubric — only

Recommended/Next Best kept, per the brief's own instruction not to dump
all ten)

**Recommended (implemented):** keep `OfficialFormGenerator` (SF1) as
its own trait; add a second, separate `Sf9FormGenerator` trait with its
own `generate_sf9(template_bytes, &Sf9GenerationRequest, output_path)`
method and its own typed request/result types
(`formgen::sf9::{Sf9GenerationRequest, Sf9SubjectTermGrade,
Sf9GenerationResult}`). Generalize only `TemplateDescriptor` — add
`workbook_format: WorkbookFormat` (`Xlsx` | `LegacyXls`), widen
`data_columns`/`header_cells` from fixed arrays to `&'static` slices.

**Why, over "one generic port method with a shared request type":** a
shared/generic request type (an untyped map, or a single
`FormGenerationRequest` enum/struct covering every form's fields) is
exactly the failure mode §5/§6 of the brief warn against — a
compile-time guarantee that an SF9 field can never land on an SF1 cell
is worth more than the ~40 lines of duplication between
`generate_sf1`/`generate_sf9`'s scaffolding (identity check → capacity
check → parse → structural check → write → atomic rename). Each
`generate_*` method is short enough that the duplication is legible,
not a maintenance burden.

**Next Best:** a manifest/schema-driven generator (one generic engine
reading a declarative per-form layout description). Rejected for this
wave — §6 explicitly lists "avoid... hardcoding assumptions" but also
"avoid... giant untyped hashmap payloads," and a schema-driven engine's
runtime-interpreted field mapping has the same "SF9 rule could
accidentally validate as SF1 shape" risk as an untyped payload, just
one layer removed. Revisit if a THIRD form (SF10) needs this and the
two concrete forms by then show a genuinely common declarative shape —
premature before that evidence exists.

**Switch condition:** if a third official form's layout is discovered
to be structurally identical to SF1's or SF9's (same column count,
same write pattern), consider extracting a shared `WorkbookRowWriter`
helper `umya_adapter` internally — but keep it below the port, never
surfaced as a typed-request change.

## Multi-form adapter policy (verbatim, per the brief's Section 14)

> Authoritative workbook format determines the infrastructure
> generator. `.xlsx` does not imply Java. `.xls` does not imply Rust.
> Domain/application behavior remains independent of the workbook
> engine.

This is now a checked fact, not only prose: `TemplateDescriptor.
workbook_format` declares the format a template requires;
`umya_adapter::reject_unsupported_format` is the first thing every
`generate_*` method calls, and rejects `WorkbookFormat::LegacyXls`
before any parsing is attempted (proven by
`umya_adapter::tests::rejects_a_template_declaring_legacy_xls_format`,
which constructs an SF9 descriptor with the format flipped to
`LegacyXls` and confirms generation fails closed with no output file).
No legacy-`.xls` authoritative template was encountered this wave, so
no POI/Java adapter was built — the seam exists and is tested; the
adapter behind it remains ADR-0048's recorded Next Best if one is ever
needed.

## Architecture

```text
commands::formgen::generate_sf1_form   commands::formgen::generate_sf9_form
        |                                       |
formgen::OfficialFormGenerator          formgen::Sf9FormGenerator
  (generate_sf1 — own trait)              (generate_sf9 — own trait)
        |                                       |
        +-------------------+------------------+
                             |
                  formgen::umya_adapter
              (reject_unsupported_format
               is the first call in both
               generate_* methods)
                             |
              Trusted bundled templates
        (resources/sf1/*, resources/sf9/* —
         both hash-pinned, both SYNTHETIC)
```

`formgen::sf9_projection::subject_term_grades_for_learner` sits between
`commands::formgen::generate_sf9_form` and `Sf9GenerationRequest`
construction — a read-only query over
`repository::class_record::list_by_section_in_school` (new, this wave —
a section-scoped slice of the existing `list_by_school` join, added
because SF9 needs one learner's full class-record set, which no
existing function returned) and
`repository::grading_computation::compute_term_grade` (existing,
unchanged, called once per class record). **No grading rule — weight,
rounding, transmutation, floor — is implemented in `formgen`.** A class
record with no computable grade yet produces a row with `term_grade:
None`, written as an explicit blank cell, never a placeholder.

## Data-exposure contract (reusable pattern, formalized this wave)

Every official-form generator in this codebase now shares these
properties by construction, not by convention alone:

- Output is classified as containing learner PII (SF1: names/LRN/sex;
  SF9: name/LRN/sex/grades) — documented here and in
  `docs/VERIFICATION-DEBT.md`, never silently assumed non-sensitive.
- No caller-controlled destination path — both `generate_sf1_form` and
  `generate_sf9_form` resolve the output path entirely from
  session-derived, `sanitize_filename_component`-cleaned data.
- Overwrite is explicit and deterministic (same section/learner →
  same filename → clean overwrite; proven by
  `repeated_generation_for_the_same_section_overwrites_the_same_output_file`
  for SF1; the same file-naming pattern applies to SF9).
- Every `generate_*` method's atomic-write closure cleans up its `.tmp`
  sibling on any `Err` (write or rename failure) — no failure path
  leaves a partial artifact. SF9 reuses the identical closure shape
  Wave 3's independent review already hardened for SF1.
- No PII in logs: every `log::warn!`/`AppError::FormGeneration` message
  in both adapters is a fixed, generic string — never interpolates a
  learner name, LRN, or grade value.
- Generated files stay local — nothing in `formgen` performs network
  I/O, upload, or cloud sync of any kind.
- **Not encrypted.** Per the brief's explicit instruction, this wave
  does not add password-protected/encrypted spreadsheets to "solve"
  this — that remains a disclosed, intentional gap
  (`docs/VERIFICATION-DEBT.md`), pending a real secure-export UX
  requirement.

## Tests actually run this wave

- `cargo nextest run` — 557/557 passed (up from Wave 3's 546; the SF1
  suite is unchanged and still green, confirming the descriptor's
  array→slice widening did not regress SF1 — see
  `writing_the_full_learner_capacity_leaves_the_footer_formula_untouched`
  and the rest of `umya_adapter`'s pre-existing SF1 tests, all still
  passing unmodified).
- `cargo test` (plain) — full pass, including 0 doc-tests (unchanged
  from Wave 3).
- `cargo fmt --check` — clean (after running plain `cargo fmt`, never
  hand-restyled).
- `cargo clippy --all-targets -- -D warnings` — clean.
- `cargo deny check` — advisories/bans/licenses/sources all `ok` (no
  new dependency added this wave).
- `npm run quality` — typecheck/lint/format/architecture-boundary
  check/438 frontend tests all green (no UI changes this wave — no new
  TypeScript command wrapper was added for `generate_sf9_form` either,
  matching the brief's "minimal-UI-only guidance" and "no full SF9 UI"
  scope guard).

New test coverage this wave: SF9 identity verification (including a
cross-form rejection test — the SF1 fixture's bytes fail SF9's hash
check and vice versa, proving identity is per-form, not "any
trusted-looking workbook"), the legacy-`.xls` rejection seam, SF9
capacity rejection, an end-to-end command-layer test
(`sf9_generation_reflects_the_existing_grading_computation_not_a_reimplementation`)
that creates a real class record with zero scores entered and confirms
the generated SF9 shows an explicit blank grade cell — proving
`compute_term_grade` reuse, not a hardcoded/faked value — plus
tenant-isolation and byte-identity tests mirroring SF1's existing
pattern.

## Independent review

A single security review was dispatched this wave (not all four roles
the brief's §12 names — `architecture reviewer, workbook/template
fidelity, security + native file boundary, maintainability/SF10 reuse`)
covering: SF9 authorization/tenant-isolation parity with SF1, atomic-
write correctness in the new `generate_sf9`, `sf9_projection` query
isolation, `reject_unsupported_format` call ordering, and log/error PII
exposure. **Result: no `BLOCKING` findings.** One `NON-BLOCKING`
should-fix, fixed this wave:

- **Fixed**: `formgen::sf9_projection::subject_term_grades_for_learner`
  had a stated-but-unenforced precondition that `learner_id` belongs to
  `school_id` — safety depended entirely on the caller
  (`commands::formgen::generate_sf9_form`) having already validated
  this, since `grading_computation::compute_term_grade`'s own query
  matches `learner_id` alone with no independent school-scope check.
  Fixed by adding a direct `learner::find_by_id_in_school` check as the
  first thing this function does, rejecting a learner that doesn't
  resolve within `school_id` before any grade data is read — defense in
  depth independent of the caller, not a redesign. Two new tests prove
  it: a nonexistent learner id is rejected, and a REAL learner id
  belonging to a DIFFERENT school is rejected too (not just an absent
  id — the harder case).

The other three roles this wave's brief named (workbook/template
fidelity, architecture/maintainability, and a confirmation pass) were
not dispatched this wave — retained as verification debt in
`docs/VERIFICATION-DEBT.md`, per this project's established reviewer-
harness fallback rule, not dropped.

## Windows packaging

Not re-attempted this wave — the same sandboxed environment that could
not perform this for Wave 3 has not changed. `resources/sf9/*` was
added to `tauri.conf.json`'s bundle list following the exact same
pattern as `resources/sf1/*`; whether the packaged binary resolves it
correctly via `BaseDirectory::Resource` remains `NOT_VERIFIED`, same as
SF1's own resource resolution.

## Remaining verification debt

See `docs/VERIFICATION-DEBT.md` for the full list. Summary: official
SF1 AND SF9 template fidelity both `NOT_VERIFIED` (no authoritative
template for either); Windows packaged resource resolution
`NOT_VERIFIED` for both `resources/sf1/*` and `resources/sf9/*`; three
of the four independent-review roles this wave's brief named are not
yet dispatched (security review's own findings pending); secure/
encrypted export UX not designed (deliberately out of scope, per the
brief's own instruction not to "solve" this with encryption absent
evidence it's required).

## Addendum (Wave 2T, 2026-08-28): exposing SF1/SF9 generation to teachers — no candidate was pre-selected

Wave 2T's brief named no candidate. It required inspecting the actual
product and tests to find unfinished teacher workflows, evaluating at
least six credible candidates against LIKHA's priorities, and
implementing exactly one bounded slice.

### Repository inspection (not inferred from filenames)

Every `#[tauri::command]` registered in `lib.rs`'s `invoke_handler`
(69 total) was cross-checked against every `invoke("<command>"` call
site under `src/infrastructure` (excluding tests). Sixteen commands had
zero frontend caller. Grouped by what that absence actually means:

- **`formgen::generate_sf1_form` / `generate_sf9_form`** — the
  authoritative-template SF1/SF9 workbook engine (Wave 3 / Wave 2I),
  already registered, already fully tested at the command boundary
  (10 integration tests in `tests/formgen.rs`), **completely
  unreachable from the UI**. A teacher can export SF2 (CSV) and a
  report card (CSV), but not the real `.xlsx`-shaped School Register or
  Progress Report Card this codebase already knows how to generate.
- **`teaching_assignment::*`** (7 commands: create/list/remove/replace
  assignment, create/list schedule meetings, get teacher load) — the
  entire Teacher Load / Class Schedule Foundation has no UI at all.
  Large surface (7 commands, weekday/time-range validation, a School-
  Head-only capability), and its value is more administrative
  (School Head scheduling) than a rank-and-file teacher's daily
  workflow — `PRODUCT.md`'s own stated primary user.
- **`reference_geo::*`** (PSGC import/list, Wave 2G) — explicitly
  foundation-only per that wave's own record; no shipped export or form
  in this repository currently reads address data, so building UI for
  it now would be collecting/surfacing data ahead of evidenced need —
  exactly what this project's own "explicit, not inferred" PII-
  minimization discipline (M17's LRN/Sex decision) already rejected
  once for birthdate/guardian contact.
- **`learner::find_learner_candidates`** — a real, doc-commented
  duplicate-detection safeguard ("for a Registrar to compare before
  deciding to create a new record — never auto-merged") never wired
  into the actual "create learner" flow (`LearnerListScreen` →
  `LearnerApplicationService.enrollLearner`), which today has no
  duplicate check at all. Real, but a safety net on an existing flow,
  not a new capability.
- **`learner::get_learner`** / `section::get_current_enrollment`** — no
  evidence either is needed beyond what already-used list/roster
  queries provide.

### Six-plus candidates evaluated

Scored against: privacy/isolation, offline/local-first correctness,
teacher usefulness, official-form fidelity, reliability/recovery,
maintainability, time-to-proof, zero billing/provider independence.

1. **SF1/SF9 official-form generation UI — RECOMMENDED.** Backend fully
   built and tested; UI work is a thin, low-risk TS/React layer
   mirroring the already-proven SF2/report-card export pattern exactly.
   Delivers a real, currently-missing teacher output (an actual
   DepEd-shaped workbook, not a CSV approximation). Official-form
   fidelity constraint (see below) is a disclosure obligation, not a
   blocker — this project has shipped `NOT_VERIFIED`-fidelity exports
   to teachers since M10, always with an honest on-screen disclosure,
   never a block.
2. **Duplicate-learner-candidate warning on Create Learner — NEXT BEST.**
   Real correctness value (prevents an actual class of data-integrity
   mistake), smallest and lowest-risk of all candidates, backend already
   built. Ranked second only because it is a safety net on an existing
   flow, not a new capability a teacher is currently missing entirely.
3. **Teaching Assignment / Class Schedule UI.** Real value, but by far
   the largest candidate (7 commands, new validation surface, a
   School-Head-scoped feature rather than a daily teacher workflow) —
   too large for "exactly one bounded production slice" without
   descoping it into something narrower than what the backend already
   offers; not selected this wave.
4. **PSGC/address-entry UI.** Rejected for lack of evidenced need — no
   shipped form or export in this repository reads address data; adding
   collection/UI ahead of a demonstrated consumer repeats a mistake this
   project has already explicitly declined to make once (M17).
5. **SF1 importer integrity adjustments** (carried candidate — the
   strict zero-length rule and the `l.school_id` JOIN predicate applied
   to `enroll`/`roster_for_section*`). Repository evidence does **not**
   currently justify reopening the importer: `tests/sf1_import.rs` is
   12/12 green, no new SF1-import defect was found this wave, and the
   debt's own recorded closure gate is explicitly "when the SF1 importer
   is next reworked" — not met. Correctly not selected, per the brief's
   own qualifier.
6. **Native NVDA/Narrator verification across Enroll/Transfer/End/
   Correct** (carried candidate). Genuinely infeasible in this session's
   environment — a remote Linux container with no Windows machine, no
   screen-reader software, and no physical device. Recorded honestly as
   infeasible here rather than skipped silently or faked; remains owed
   in `docs/VERIFICATION-DEBT.md`. Not "implementation-heavy" work in
   the sense this wave's brief asked for either way.
7. **`get_learner` / `get_current_enrollment` UI exposure.** No evidence
   either is needed beyond what already-shipped list/roster queries
   already provide to every consuming screen; not a real gap.

### Feasibility check on the Recommended candidate

Both SF1 and SF9's active templates are `ProvenanceState::Synthetic`,
`FidelityState::NotVerified` (`formgen::evidence`'s own registered
constants — no authoritative DepEd template has ever been obtained for
either, same disclosed gap since Wave 3/2I). This is **not** an
unresolved-policy blocker: the disclosure-not-refusal policy for
unverified official-form fidelity was already decided, independently
reviewed, and shipped repeatedly by this project (SF2's
`FieldDisclosure` since M10; the report-card export since M14; SF1/SF9
generation's own doc comments already state this exact stance). Applying
that same, already-decided policy to a new surface is not a new
human-approval-gate question — `.claude/rules/autonomous-development.md`
is explicit that an ordinary application of an established pattern is
not to be treated as a product-policy decision merely to avoid choosing.
The only obligation carried forward is to disclose the synthetic/
unverified status honestly and prominently, which this wave's UI does.

### What was built

A new `FormGenerationRepository` port (kept separate from
`SectionRepository`/`ExportRepository`, matching this codebase's
one-port-per-concern convention — e.g. `EnrollmentHistoryRepository`),
`TauriFormGenerationRepository` adapter, and
`FormGenerationApplicationService` (shape validation only — the Rust
side is authoritative). **No Rust change was needed at all** — the
commands, their authorization convention (session-only, matching every
sibling export command, a deliberate decision already recorded in
ADR-0048), and their command-boundary test coverage already existed.

`SectionRosterScreen` gains: a section-level "Generate SF1 (School
Register)" button (no confirmation panel — unlike Transfer/End/Correct,
generating a form mutates no membership state and is safely repeatable,
so it follows the plain single-click export-button pattern
`MonthlySummaryScreen`'s SF2 export already established, not the
inline-panel pattern); a per-row "Generate SF9 (Report Card)" action;
and an always-visible (all three modes, not Guided-only — a correctness
disclosure, matching `MonthlySummaryScreen`'s own precedent) synthetic-
template fidelity notice shown before either button is used. Both
actions and every existing membership action now share one
`anyActionInFlight` gate, so a teacher can never have two writes running
at once. Outcomes: a `null` result (a stale roster, a section/learner
that no longer resolves) surfaces as a plain-language recovery message;
a thrown error surfaces generically; success shows the saved file path
and a learner/subject count, reusing the exact `Alert`
success/error-role convention every other action on this screen already
uses.

### Verification (run this session)

No Rust change; `cargo test` re-run to confirm zero regression — 539 lib

- every integration binary, including `tests/formgen.rs` 10/10,
  unchanged from the Wave 2S checkpoint. `cargo fmt --check`/`cargo clippy
--all-targets -- -D warnings` clean. TypeScript: 22 new tests (4 adapter,
  8 service, ~19 UI net of one label-only assertion change — action
  visibility, generation success/error/recovery for both forms, the
  shared in-flight gate disabling every other action, three-mode parity,
  and axe coverage of the SF1 success state) — `npm run quality` green,
  **585/585 vitest** (60 files unchanged in count, tests up from 563).
  `npm run build` + `check:dev-preview-isolation` pass (this screen was
  never wired into the dev-preview/Playwright fixture by any prior wave —
  inherited, disclosed gap, not newly introduced or newly closed this
  wave). `npm run harness:verify` still exactly 100/100, unchanged.
  `npm run quality:full` green end to end. `gitleaks`/`cargo-deny`/
  `osv-scanner` (all three installed fresh in Wave 2S's own session and
  still present) ran clean — no new dependency was added.

### Retained / disclosed debt

- **Playwright/axe browser coverage does not include `SectionRosterScreen`
  at all** (pre-existing since Wave 2O; not newly caused or newly closed
  this wave) — the new SF1/SF9 actions inherit this gap along with
  every other action already on the screen. jsdom + axe coverage exists
  for the SF1 success state only, not SF9's (same `Alert` component,
  judged low marginal risk, but disclosed rather than silently assumed
  covered).
- **Official SF1/SF9 fidelity remains `NOT_VERIFIED`** — unchanged from
  Wave 3/2I; this wave changes only who can reach the generator, not its
  evidence state.
- **The duplicate-learner-candidate safeguard (Next Best) remains
  unbuilt** — recorded as the next carried candidate, not because it
  scored poorly, but because exactly one slice was in scope this wave.
- **Teaching Assignment / Class Schedule UI and PSGC/address-entry UI
  remain unbuilt**, for the reasons scored above — not silently dropped,
  evaluated and explicitly not selected.
