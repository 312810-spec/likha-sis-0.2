# ADR-0053: SF10 Template Applicability & Version Resolution

Status: Accepted (engineering checkpoint — see "Verification debt")
Date: 2026-08-27
Wave: 2M ("SF10 Authoritative Template Intake & Version Applicability")
Related: ADR-0051 (evidence/provenance registry), ADR-0048/0049
(form-generation architecture), ADR-0037 (curriculum/key-stage
versioning), `docs/form-evidence/sf10/README.md`

## Context

Wave 2K surfaced four DepEd-hosted SF10 `.xlsx` candidates on
`support.lis.deped.gov.ph` but registered none — no SF10 generator
exists and the brief forbade building one to exercise the framework.
`formgen::evidence` (Wave 2K) therefore had **no real external
consumer**. Wave 2M's job: acquire the candidates safely, fingerprint
and inspect them, record provenance, research the governing issuance,
determine temporal/grade-level applicability, and define a safe
version-selection policy for historical vs current SF10 records — **not**
to implement SF10 generation, import, or UI.

Working hypothesis to test (not assume): the new SF10 format applies
from the current curriculum period forward, while older historical
Grade 8-10 records may need to preserve older SF10 formats. SF10 is a
permanent legal record that follows a learner across schools for all of
basic education; rewriting past segments onto whatever template is
newest would be a compliance defect.

## What was acquired and inspected

All four candidates downloaded (HTTP 200, valid OOXML), hashed,
structurally inspected via the existing
`examples/inspect_template_candidate` intake tool (extended this wave —
see below). Full manifest, hashes, structural findings, and issuance
research in `docs/form-evidence/sf10/README.md`. Key facts:

- `SSHS SF 10 v2026.xlsx` (227 KB, Last-Modified 2026-03-17): sheets
  FRONT/BACK/ANNEX/HELPER_SUBJECTS, contains formulas and data
  validation, print areas defined, no community-annotation sheet.
- The three JHS candidates all carry a non-DepEd `SirWedz Guides`
  worksheet — official portal, but community-annotated copies, not
  confirmed pristine DepEd masters. Zero formulas.

> **[Superseded in part — see the Wave 2N addendum below.]** In Wave 2M
> DM 020's body could not be read and no candidate was promoted. Wave
> 2N read DM 020 page 2 verbatim (`pdftotext`) and promoted the SSHS
> record to `AuthoritativeSourceConfirmed`. The two paragraphs that
> follow are the Wave 2M position, kept for history.

**Governing issuance research (primary sources on deped.gov.ph):**
DepEd Memorandum No. 020, s. 2026 (13 Mar 2026) governs the
Strengthened SHS SF10 for SY 2025-2026 pilot implementers —
**confirmed to exist**, but its body is a scanned image PDF that could
not be read (no OCR in the frozen harness), so the exact template
prescriptions and the file↔issuance binding are unconfirmed. DepEd
Order No. 69, s. 2016 (ECR + Form 137 for SHS) and DepEd Order No. 4,
s. 2014 (modified school forms) are the prior generations. No single
governing issuance was pinned for the JHS MATATAG revision.

**Decision on promotion: none** _(Wave 2M — superseded by Wave 2N for
the SSHS record)_. Every candidate stays
`ProvenanceState::CandidateUnverified` / `FidelityState::NotVerified`.
`confirm_authoritative_source` is not called for any of them —
`authoritative_issuance` is deliberately left `None` even for the SSHS
candidate, because a citation whose text was never read does not
genuinely satisfy the promotion guard's intent (a human reviewing real
evidence). Hosting + a confirmed-to-exist memo is a strong lead, not a
promotion basis.

## Intake tool: smallest reusable improvement

`examples/inspect_template_candidate.rs` (Wave 2K) reported only
filename/size/SHA-256/sheet-names/merge-counts — insufficient for the
render-fidelity evidence ADR-0051 named. Extended this wave, **using
only `umya-spreadsheet`'s existing public API (zero new dependency)**,
to also report per sheet: sheet state, used dimension, formula count,
sheet-level defined names (print areas), data-validation count, hidden
row/column counts, page orientation/scale/fit-to; and per workbook:
macro-project status (by extension) and workbook-level named ranges.
Regression-checked: still reproduces the SF1 synthetic fixture's known
hash and structure. It remains a dev-only evidence-gathering tool — no
Tauri command, no UI, never writes to the source tree, never registers
anything.

## Decision: applicability resolution as a centralized domain module

`formgen::template_version` (new, pure domain — no DB, no migration, no
command, no UI):

- `FormContext` — the record's own applicable context: form type,
  school year (`"YYYY-YYYY"`), grade level, curriculum label, optional
  track.
- `TemplateApplicability` — the scope one version was authoritative
  for: form type, effective school-year range (inclusive, open-ended
  allowed), grade levels, curriculum, optional track. _(An initial
  `historical_only` flag was removed in the Wave 2M review fixes as
  redundant with the effective-range check.)_
- `TemplateVersion` — id + optional `&TemplateDescriptor` (SF10 has
  none yet) + `&TemplateEvidence` + `TemplateApplicability`.
  _(Supersession is carried on `TemplateEvidence`, not duplicated
  here — the initial `supersedes`/`superseded_by` fields on
  `TemplateVersion` were removed in the Wave 2M review fixes.)_
- `resolve(registry, ctx, require_verified_fidelity) -> Result<&TemplateVersion, ResolveError>`
  — filters the registry by `covers(ctx)`, then:
  - `[]` → `ResolveError::NoApplicableTemplate` (never a
    "closest"/"newest" fallback);
  - `[one]` → returns it, unless its provenance is `Rejected`/
    `Superseded` (`ProvenanceUnusable`) or the caller required verified
    fidelity and the evidence is `NotVerified` (`FidelityInsufficient`);
  - `[many]` → `ResolveError::AmbiguousTemplates(ids)` (a registry
    authoring bug, surfaced, never silently resolved).
- `SF10_TEMPLATE_VERSIONS` — two modeled versions (JHS/MATATAG,
  SSHS). _(Wave 2M shipped both as `CandidateUnverified`; Wave 2N
  promoted the SSHS one to `AuthoritativeSourceConfirmed` — see the
  addendum. The JHS one and its applicability window remain leads.)_

This is the seam later SF10 generation plugs into. `school_year <
"2025"`-style date checks never get scattered through form-generation
code; they live in `covers()` and the registry data.

**Real consumer of `formgen::evidence`:** every `TemplateVersion` holds
a `&'static TemplateEvidence`; `resolve` reads `provenance` and
`fidelity` as independent axes (a match can fail on fidelity while
provenance is fine, and vice versa), exercising exactly the two-axis
design Wave 2K built ahead of use. The axes are not collapsed.

## Ten-scenario decision

Historical template-selection is a material compliance decision, so the
standard 10-scenario rule applies. Scored against LIKHA priorities
(privacy/security → correctness → DepEd compliance → teacher usability
→ offline reliability → maintainability → zero billing → performance →
speed).

| #   | Design                                                                                                                                                                      | Verdict                                                                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Latest-template-only** (always use newest installed)                                                                                                                      | **Rejected** — directly violates historical fidelity; a permanent legal record would be silently rewritten. Fails the top compliance priority.                                |
| 2   | **School-year-keyed only**                                                                                                                                                  | Insufficient alone — SF10 spans a learner's whole basic-education history; one record has many school years. Keying needs grade + curriculum too.                             |
| 3   | **Effective-date-keyed only**                                                                                                                                               | Good backbone but under-specified — two issuances can be effective in the same year for different grade bands/curricula.                                                      |
| 4   | **Grade/curriculum-keyed only**                                                                                                                                             | Closest to how DepEd scopes issuances, but needs the school-year range to disambiguate a mid-curriculum revision.                                                             |
| 5   | **Explicit template-version registry** (data, not code)                                                                                                                     | Necessary as the backing store for any of the above; not a selection policy by itself.                                                                                        |
| 6   | **Evidence-driven applicability** (resolver reads each evidence record's applicability window)                                                                              | Strong — ties selection to the same provenance record that gates promotion; single source of truth.                                                                           |
| 7   | **Historical snapshot bundles** (freeze a full template set per era)                                                                                                        | Heavy; premature with zero SF10 records persisted and one real candidate. Defer.                                                                                              |
| 8   | **Registry + applicability resolver keyed on (form, SY range, grade band, curriculum, track), explicit failure on none/ambiguous**                                          | **Recommended** — combines 4+5+6; mirrors DepEd issuance scoping; never guesses.                                                                                              |
| 9   | **Per-record frozen template-version stamp** (store the resolved version id on each generated SF10 record; historical records immutable regardless of later registry edits) | **Next Best / complement** — the durable guarantee once SF10 records are persisted; nothing to stamp this wave.                                                               |
| 10  | **Resolver + manual per-record override**                                                                                                                                   | Recommended's resolver plus an explicit escape hatch for edge cases (a re-issued correction, a division-specific variant). Adopt the override only when a real case needs it. |

### Recommended

**#8 — evidence-backed `TemplateVersion` registry + a centralized
applicability resolver (`formgen::template_version::resolve`)** that
keys on (form type, school-year range, grade levels, curriculum,
optional track) and **fails explicitly** (`NoApplicableTemplate` /
`AmbiguousTemplates` / `FidelityInsufficient` / `ProvenanceUnusable`)
rather than ever returning a "closest" or "newest" template. Chosen
because it: puts DepEd compliance first (historical fidelity is
structural, not a runtime `if`); keeps the applicability rule in one
place behind the form-generation domain boundary; reuses the Wave 2K
evidence record as the single source of provenance/fidelity truth; adds
no dependency, no DB, no migration.

### Next Best

**#9 — per-record frozen template-version stamp.** When SF10 records
are eventually persisted, store the resolved `TemplateVersion.id` on
each record so a historical record is reproducible byte-for-byte even
if the registry is later corrected or extended. **Switch/adopt
condition:** adopt as a _complement_ to Recommended (not a
replacement) the first time an SF10 record is written to the database.
Until then there is nothing to stamp.

### Switch condition for Recommended itself

Revisit the resolver's shape if DepEd issues an SF10 revision scoped by
something the current keys cannot express (e.g. region-specific, or
learner-enrollment-date rather than school-year). Add the key to
`TemplateApplicability` and `covers()`; do not add a parallel
resolution path.

### Risks / spikes

> **[Partly resolved in the Wave 2N addendum.]** DM 020 page 2 was
> read; `track: None` for SSHS is now evidence-backed and the JHS band
> was narrowed to Grade 7. Original Wave 2M risks kept for history:

- **DM 020, s. 2026 body unread** — the SSHS applicability window
  (`track: None`, meaning "Academic and TechPro share one SF10") is a
  guess. If the memo splits the template by track, the SSHS
  `TemplateVersion` becomes two, each `track: Some(_)`. This is the
  single most likely thing to change; the model already has the field.
  _(Wave 2N: DM 020's readable page describes one SSHS SF10 / one
  filename — `track: None` is now evidence-backed, not a guess. The
  split-later mechanism above still holds if the unread pages ever
  contradict it.)_
- **JHS governing issuance unpinned** — the JHS `TemplateVersion`'s
  window (MATATAG, Grades 7-10, from SY 2024-2025) rests on
  secondary sources only. _(Wave 2N: still unpinned — national Joint
  Memorandum PDF not obtained; the band was corrected to Grade 7 only,
  fail-closed for 8-10.)_
- **Pre-MATATAG era has no registered template** — by design, `resolve`
  returns `NoApplicableTemplate` for a K-to-12-era JHS context. That is
  correct behaviour (better an explicit gap than a wrong template), but
  it means SF10 generation for historical records is blocked until
  those era templates are acquired. _(Unchanged after Wave 2N.)_

## Verification

- `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
  clean; `cargo test` — 479 lib tests + all integration binaries + 0
  doctests pass, including **11 new tests**: `formgen::evidence` (SF10
  candidate conservatism ×1 covering both records, promotion-guard
  refusal ×1) and `formgen::template_version` (×9: SSHS match, JHS
  match, pre-era → `NoApplicableTemplate` not newest, wrong grade band,
  `FidelityInsufficient`, `AmbiguousTemplates`, `Superseded`
  refused-in-window, `Synthetic` refused-in-window, registry
  conservatism).
- One transient `rustc` internal-compiler-error was observed once on a
  full `cargo test` run immediately after `cargo fmt` rewrote
  `template_version.rs` mid-build; it did not reproduce on a clean
  rebuild (`cargo test --lib`, `--doc`, `--tests`, and full `cargo
test` all clean afterwards). Recorded honestly as a stale-incremental
  artifact, not a code defect.
- `npm run quality` — clean (typecheck, lint, format:check,
  architecture check, 462/462 TS tests; no frontend files touched).
- No new dependency (`cargo deny` unaffected); no migration; no Tauri
  command; no UI; no learner data (synthetic-only discipline intact —
  the resolver takes `&'static str` context, touches no learner
  record).

## Independent review

Dispatched per the frozen-harness rules (Wave 2L / ADR-0052) —
`security-reviewer` and `architecture-reviewer`, read-only.

**Architecture review** returned findings in full: **no BLOCKING**
findings (the three it initially flagged BLOCKING were an inaccurate
test count and an unfilled `npm run quality` placeholder in an earlier
draft of this ADR — both corrected above; a pre-written "Independent
review" paragraph — rewritten to this; and a stray 0-byte
`src-tauri/String` junk file — never committed, removed before the
Wave 2M commit). Non-blocking items acted on this checkpoint: removed
the dead `historical_only` field from `TemplateApplicability` and the
unused `supersedes`/`superseded_by` from `TemplateVersion` (evidence
already carries supersession); `resolve` now also refuses a
`Synthetic` provenance as `ProvenanceUnusable`; added a doc note that
`TemplateApplicability.curriculum` is a plain label, deliberately not a
foreign key to the seeded `curriculum_versions`, with the mapping seam
named; updated `formgen/mod.rs`'s layering doc comment to mention
`evidence` and `template_version`; corrected this ADR's reference to
name `formgen::template_version::resolve` rather than a nonexistent
`TemplateApplicabilityResolver` type. Non-blocking items accepted as
recorded tradeoffs: `FormContext`'s `&'static str` typing (test-shaped,
fine for the seam), provenance checked after the ambiguity branch (an
overlapping-window registry is a bug regardless), `bool` fidelity gate
(one call site), registry ids becoming durable identifiers at first
stamp (Next Best's concern, tracked).

**Security review** returned a headline — **no BLOCKING findings**;
seven non-blocking items (NB-1..NB-7); the five review questions
answered; and an explicit statement that neither of this project's two
historical failure classes (PII leakage into commits/logs; promotion-
guard bypass) recurred. The itemized NB-1..NB-7 text hit this
project's documented reviewer-retrieval bug and could not be retrieved
after one resume attempt. Per the established fallback: the failed
retrieval is recorded, a rigorous self-review was substituted (the
diff commits no workbook bytes or real data — verified; the intake
tool stays dev-only and read-only; `resolve` cannot return an
unauthoritative template — proven by construction and tests; the new
SF10 records set no `authoritative_issuance` and cannot be promoted),
and the security-review-specifics debt is retained in
`docs/VERIFICATION-DEBT.md` for a later re-run under a healthy harness.

## Verification debt

- SF10 provenance: `CandidateUnverified` for all four (see
  `docs/form-evidence/sf10/README.md` for the six enumerated authority
  gaps). Not promotable until the governing issuances are read.
  **[Wave 2N: partly closed — SSHS promoted; see addendum.]**
- SF10 render fidelity: `NotVerified` — no generator exists.
  **[Unchanged after Wave 2N.]**
- Pre-MATATAG-era SF10 templates: not acquired. **[Unchanged.]**
- `formgen::template_version` has no persistence or command surface
  yet — it is the resolver seam only, unexercised by any real
  generation path (by design this wave). **[Unchanged after Wave 2N.]**

---

## Wave 2N addendum — DM 020 read, SSHS provenance promoted (2026-08-27)

Full evidence detail: `docs/form-evidence/sf10/README.md` (Wave 2N
sections). Repository truth verified first: HEAD `0c6aaf8` = origin;
Wave 2M CI (`33031801131`/`33031801110`) re-confirmed `completed/success`.
Frozen harness not reopened.

### DM 020, s. 2026 — primary-source text obtained

The official PDF (`deped.gov.ph/wp-content/uploads/DM_s2026_020r-1.pdf`)
turned out to be **partly text-extractable**: page 2 was transcribed
verbatim with `pdftotext -layout` (bundled with Git for Windows — an
existing tool, not new harness tooling). Pages 1/3/4 remain scanned
images with no text layer.

Verbatim para 4: the modified SF10 "shall be used **exclusively, until
further notice, by Strengthened SHS teachers in SSHS Pilot Schools**";
non-Strengthened-SHS SHS teachers "**shall continue using the existing
ECR and SF 10 (formerly Form 137)**". Verbatim para 5(b): "the official
filenames of the modified templates are as follows: ... **SSHS SF 10
v2026.xlsx** for the Modified SF 10 for SSHS", downloadable from
`support.lis.deped.gov.ph/support`.

### SSHS workbook-to-issuance binding: CONFIRMED

DM 020 para 5(b) **names the exact filename** Wave 2M downloaded from
the exact portal it names — an explicit issuance→file binding, not
temporal proximity.

### Part B — provenance promoted

`SF10_SSHS_V2026_CANDIDATE_EVIDENCE.provenance` →
`AuthoritativeSourceConfirmed`, `authoritative_issuance` set to the DM
020 para 5(b) citation. **The promotion is guard-satisfying, not
guard-bypassing:** a new test asserts
`confirm_authoritative_source(CandidateUnverified, <that citation>)`
itself returns `AuthoritativeSourceConfirmed`. **Fidelity stays
`NotVerified`** — a dedicated test asserts the promotion did not touch
the fidelity axis. `Provenance != Fidelity` preserved as a hard
invariant, now also enforced inside `resolve` (a fidelity-gated caller
still gets `FidelityInsufficient` for the confirmed-provenance SSHS
version).

### Part C — track determination

DM 020's readable page describes **one** "School Form 10 for
Strengthened Senior High School" and lists **one** SF10 filename. **No
evidence of a template-level Academic/TechPro split.** `track: None` on
`sf10-sshs-v2026` is now evidence-backed, not a placeholder. No track
split introduced. No conditional logic added to any caller.

### Part D — MATATAG historical transition

Modeled from converging evidence (DepEd Order No. 010, s. 2024 —
primary-source page confirmed; Joint Memorandum ref.
STR-250331-0910-PS, 28 Mar 2025 — secondary/division sources only,
national PDF not obtained; Quezon Division DM 306, s. 2025): a
previously-completed old SF10 is **preserved and attached**, not
rewritten; the revised SF10 applies **per grade** as MATATAG phases in
(Grade 7 from SY 2024-2025). The Wave 2M JHS applicability entry
(`grade_levels: ["7","8","9","10"]`) was **corrected to `["7"]`** —
an under-claim fails closed safely; an over-claim would let `resolve`
vouch for grades whose template this project cannot yet identify. The
"Grade 8-10" framing from user recollection is explicitly **not**
encoded.

### Part E — JHS candidates stay conservative

LIS directory listing returns HTTP 403 — no clean master could be
enumerated or checksum-matched. The `SirWedz Guides` community
worksheet is not removed and the files are not promoted. JHS SF10 =
**EVIDENCE BLOCKED**; debt retained.

### Part F — readiness: PARTIALLY READY

- SSHS SF10: provenance confirmed, applicability centrally modeled;
  fidelity still `NotVerified`.
- JHS MATATAG SF10: EVIDENCE BLOCKED.
- Pre-MATATAG SF10: templates not acquired; `resolve` returns
  `NoApplicableTemplate` (correct).

### Part G / H — no generator; next slice is teacher-facing

Per Part G the smallest SF10 step this wave was exactly the evidence
closure + applicability-model integration above — **no generator, no
persistence, no export, no UI**. Per Part H, SF10 research stops here
and the next slice is an unrelated teacher-facing production vertical
(recorded in `docs/CURRENT-HANDOFF.md`).

### Verification (Wave 2N)

`cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
clean; `cargo test` — **484 lib tests** + all integration binaries + 0
doctests pass. The `formgen::evidence` and `formgen::template_version`
test suites were reworked around the promotion; ~18 tests touch SF10,
including: `wave2n_sshs_promotion_is_guard_satisfying_not_guard_bypassing`,
`wave2n_sshs_provenance_promotion_did_not_touch_fidelity`,
`the_jhs_sf10_candidate_stays_unpromoted_and_unpromotable`,
`every_confirmed_registry_entry_would_pass_the_promotion_guard`
(registry-wide invariant), `a_matatag_grade_9_context_does_not_yet_resolve_only_grade_7_is_modeled`,
and `resolves_the_confirmed_sshs_v2026_for_a_strengthened_shs_grade_11_context`.
`npm run quality` — clean (typecheck, lint, format:check, architecture
check, 462/462 TS tests; no frontend files touched). No new dependency,
no migration, no Tauri command, no UI, no learner data.

### Independent review (Wave 2N)

`architecture-reviewer` returned findings in full: **no BLOCKING**. Two
BLOCKING items it raised were ADR doc-integrity issues in an earlier
draft of this addendum (an unfilled `npm run quality` placeholder; a
pre-written independent-review paragraph) — both fixed above/here. Its
non-blocking items were acted on this checkpoint: renamed the const
`SF10_SSHS_V2026_CANDIDATE_EVIDENCE` → `SF10_SSHS_V2026_EVIDENCE`
(finishing the `-candidate` drop); softened the unverified "traced by
DM 020 to DepEd Memorandum No. 48, s. 2025" wording in
`applicability_notes` to name it as an unverified third-party lead;
added the registry-wide promotion-guard invariant test; reconciled the
test count; marked the superseded Wave 2M body regions in place (below)
and removed this ADR's stale descriptions of the `historical_only` /
`supersedes` / `superseded_by` fields (removed in the Wave 2M review
fixes).

`security-reviewer` returned findings in full: **no BLOCKING findings.**
Two non-blocking should-fix items — (NB-1) the same registry-wide
invariant test the architecture review asked for, now added; (NB-2) the
"Effectivity:" wording, softened to "Effectivity LEAD:" since DM 020's
effectivity clause is on an unread page. Its answers confirmed: the
promotion is guard-satisfying not guard-bypassing; `Provenance !=
Fidelity` is preserved (SSHS `fidelity` stays `NotVerified`; a
fidelity-gated `resolve` still returns `FidelityInsufficient`); DM 020
para 5(b)'s verbatim filename+portal is an explicit issuance→file
binding, sufficient for `AuthoritativeSourceConfirmed` and not an
over-promotion; the JHS record stays unpromotable and the `["7"]`
narrowing is genuine fail-closed behaviour; no PII/secret/architecture-
boundary issue; neither of this project's recurring failure classes
applies. No independent-review debt carried from Wave 2N.
