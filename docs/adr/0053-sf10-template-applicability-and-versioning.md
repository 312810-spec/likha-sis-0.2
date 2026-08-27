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

**Governing issuance research (primary sources on deped.gov.ph):**
DepEd Memorandum No. 020, s. 2026 (13 Mar 2026) governs the
Strengthened SHS SF10 for SY 2025-2026 pilot implementers —
**confirmed to exist**, but its body is a scanned image PDF that could
not be read (no OCR in the frozen harness), so the exact template
prescriptions and the file↔issuance binding are unconfirmed. DepEd
Order No. 69, s. 2016 (ECR + Form 137 for SHS) and DepEd Order No. 4,
s. 2014 (modified school forms) are the prior generations. No single
governing issuance was pinned for the JHS MATATAG revision.

**Decision on promotion: none.** Every candidate stays
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
  allowed), grade levels, curriculum, optional track, `historical_only`
  flag.
- `TemplateVersion` — id + optional `&TemplateDescriptor` (SF10 has
  none yet) + `&TemplateEvidence` + `TemplateApplicability` +
  supersedes/superseded-by links.
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
  SSHS/DM-020-2026), **both `CandidateUnverified`**, applicability
  windows drawn from the research above and marked as leads.

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

**#8 — evidence-backed `TemplateVersion` registry + centralized
`TemplateApplicabilityResolver` (`formgen::template_version::resolve`)**
that keys on (form type, school-year range, grade levels, curriculum,
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

- **DM 020, s. 2026 body unread** — the SSHS applicability window
  (`track: None`, meaning "Academic and TechPro share one SF10") is a
  guess. If the memo splits the template by track, the SSHS
  `TemplateVersion` becomes two, each `track: Some(_)`. This is the
  single most likely thing to change; the model already has the field.
- **JHS governing issuance unpinned** — the JHS `TemplateVersion`'s
  window (MATATAG, Grades 7-10, from SY 2024-2025) rests on
  secondary sources only.
- **Pre-MATATAG era has no registered template** — by design, `resolve`
  returns `NoApplicableTemplate` for a K-to-12-era JHS context. That is
  correct behaviour (better an explicit gap than a wrong template), but
  it means SF10 generation for historical records is blocked until
  those era templates are acquired.

## Verification

- `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
  clean; `cargo test` — 478 lib tests + all integration binaries + 0
  doctests pass, including 13 new tests (`formgen::evidence` SF10
  candidate conservatism ×2 + promotion-guard refusal; `formgen::
template_version` resolver ×10 covering exact match, wrong grade
  band, pre-era `NoApplicableTemplate`-not-newest, `FidelityInsufficient`,
  `AmbiguousTemplates`, `ProvenanceUnusable`, registry conservatism).
- One transient `rustc` internal-compiler-error was observed once on a
  full `cargo test` run immediately after `cargo fmt` rewrote
  `template_version.rs` mid-build; it did not reproduce on a clean
  rebuild (`cargo test --lib`, `--doc`, `--tests`, and full `cargo
test` all clean afterwards). Recorded honestly as a stale-incremental
  artifact, not a code defect.
- `npm run quality` — [record at commit].
- No new dependency (`cargo deny` unaffected); no migration; no Tauri
  command; no UI; no learner data (synthetic-only discipline intact —
  the resolver takes `&'static str` context, touches no learner
  record).

## Independent review

Dispatched per the frozen-harness rules (Wave 2L / ADR-0052) —
security-reviewer and architecture-reviewer, read-only. Results /
retained debt recorded in `docs/VERIFICATION-DEBT.md`'s Wave 2M entry;
if the known reviewer-retrieval bug recurred, a rigorous self-review
was substituted and the debt retained rather than claiming a review
happened.

## Verification debt

- SF10 provenance: `CandidateUnverified` for all four (see
  `docs/form-evidence/sf10/README.md` for the six enumerated authority
  gaps). Not promotable until the governing issuances are read.
- SF10 render fidelity: `NotVerified` — no generator exists.
- Pre-MATATAG-era SF10 templates: not acquired.
- `formgen::template_version` has no persistence or command surface
  yet — it is the resolver seam only, unexercised by any real
  generation path (by design this wave).
