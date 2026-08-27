# ADR-0051: Official-Form Template Evidence & Provenance Registry

Status: Accepted (engineering checkpoint — see "Verification debt" below)
Date: 2026-08-27
Wave: 2K ("LIKHA-SIS 0.2 — Wave 2K: Authoritative Official-Form Evidence
& Template Verification Pipeline" in the directing prompt)

## Context

Wave 3 (ADR-0048) and Wave 2I (ADR-0049) each recorded, in prose only,
that this project's SF1 and SF9 templates are project-authored synthetic
fixtures — `OFFICIAL_SF1_FIDELITY = NOT_VERIFIED` and
`OFFICIAL_SF9_FIDELITY = NOT_VERIFIED`. Nothing in the codebase modeled
that fact as typed, testable state; it lived only in doc comments and
`docs/VERIFICATION-DEBT.md`. This wave's brief asked for a reusable,
auditable evidence/provenance pipeline for official DepEd form
templates — explicitly not another form generator.

## Research: current authoritative-source search

Two new angles were tried beyond the repeated `deped.gov.ph` homepage
searches of prior waves:

1. **Issuance-attached templates.** `deped.gov.ph/wp-content/uploads/
2018/09/School-forms-matrix.docx` is a genuine DepEd-hosted `.docx`
   (confirmed as a valid Office XML file, not a 404/placeholder), but
   which specific DepEd Order/Memorandum it is an annex to could not be
   confirmed — no text-extraction tool was available in this session to
   read its content, so its governing issuance remains unresolved.
2. **Official subdomain mirror.** `support.lis.deped.gov.ph` (DepEd's
   Learner Information System support portal — a verified
   `*.deped.gov.ph` subdomain) hosts `/support/downloads/schoolforms/`,
   which serves several **SF10** (Learner's Permanent Academic Record)
   `.xlsx` files, personally re-fetched and confirmed (HTTP 200, valid
   OOXML/ZIP container structure) rather than taken only on the
   subagent's word:
   - `SSHS%20SF%2010%20v2026.xlsx`
   - `School-Form-10-JHS-Learners-Academic%20Permanent-Record_26March2025.xlsx`
   - `School%20Form%2010%20SF10%20Learner's%20Permanent%20Academic%20Record%20for%20Junior%20High%20School_3.xlsx`
   - `School-Form-10-SF10-Learners-Permanent-Academic-Record-for-Junior-High-School.xlsx`

   Classification: **OFFICIAL by domain** (a `*.deped.gov.ph` subdomain,
   files fetch as genuine `.xlsx` containers, not third-party mirrors).
   Two gaps remain, disclosed rather than glossed over: (a) internal cell
   content/title text was never read — no unzip/xlsx-content tool was
   available in this session, so only container-level authenticity is
   confirmed, not field layout; (b) the file inventory claim ("only SF5,
   SF8, SF10, and SHS forms are indexed there, no SF1/SF9") rests on a
   search-engine snippet, not a directly fetched directory listing — a
   direct listing fetch returned HTTP 403 both times it was tried.

**No SF1 or SF9 file was found on this portal or anywhere else searched.**
Every SF1/SF9 hit remains third-party (Scribd, teacher blogs) — COMMUNITY
per this project's evidence-gate discipline, never OFFICIAL, and never
usable to promote provenance regardless of how correct it looks.

**Decision on SF10:** the discovered URLs are recorded here and in
`docs/VERIFICATION-DEBT.md` as a documented lead for future work, not
registered as a `TemplateEvidence`/`TemplateDescriptor` in this wave — no
SF10 form generator exists, and the brief explicitly asked not to build
one merely to exercise the framework. Registering evidence for a template
this project doesn't yet generate against would be premature structure,
not a completed evidence record.

`OFFICIAL_SF1_FIDELITY` and `OFFICIAL_SF9_FIDELITY` remain
**NOT_VERIFIED**, unconditionally, unchanged by this wave — this is an
acceptable outcome per the brief's own text: _"If no new authoritative
template is found, that is an acceptable result. The reusable evidence
pipeline is the deliverable."_

## Decision: two independent verification axes, never one field

The central design rule, non-negotiable per the brief: **provenance
verification and renderer fidelity are never collapsed into one status
field.** A template can be an authoritative DepEd document while this
project's generated output remains completely unverified against it —
and the reverse must also stay independently expressible.

`src-tauri/src/formgen/evidence.rs` implements this as two enums:

- `ProvenanceState`: `Synthetic` | `CandidateUnverified` |
  `AuthoritativeSourceConfirmed` | `Superseded` | `Rejected`. `Synthetic`
  is a distinct variant from `CandidateUnverified` — a project-authored
  fixture is not a weak candidate for the real form awaiting more
  review, it is not a candidate at all, and no amount of further review
  turns it into one.
- `FidelityState`: `NotVerified` | `StructureVerified` |
  `FidelityVerified`.

`TemplateEvidence` carries both states plus the evidence fields the
brief specified (source organization, URL, retrieval date, original
filename — never an absolute machine-specific path, per its own doc
comment — the governing DepEd issuance, applicability notes,
supersedes/superseded-by, and a free-text evidence-gap note).
`is_fully_verified()` is the only place both fields are read together;
every other function in the module keeps them independent.

`SF1_SYNTHETIC_V1_EVIDENCE` and `SF9_SYNTHETIC_V1_EVIDENCE` are the two
registered records today — both `(Synthetic, NotVerified)`, with every
optional field `None` and an explicit `evidence_gap_note` explaining why,
so `format_evidence_report` prints the gaps honestly instead of a bare
"not verified."

## Decision: promotion requires a human-supplied citation

`confirm_authoritative_source(current, authoritative_issuance)` is the
**only sanctioned path** in this codebase for moving a template into
`ProvenanceState::AuthoritativeSourceConfirmed` — a convention enforced
by callers, not by the type system (see "Independent review" below for
why an earlier draft of this ADR overstated this as a hard guarantee).
It refuses unless given a non-empty DepEd issuance citation (an
Order/Memorandum), and it refuses outright for a `Rejected` OR
`Superseded` source regardless of citation (the `Superseded` guard was
added after independent review found the gap — see below). This is the
concrete, tested expression of the brief's "a community/secondary source
must never self-promote to authoritative" rule — the pipeline gathers
evidence, a human decides. Nothing in this module calls this function
automatically; it exists to be called from a future intake-review step a
person performs, not from a background process.

## Decision: structural recognition vs. render fidelity stay split

`formgen::template::TemplateDescriptor` (Wave 3/2I) already models
"structure required to recognize the correct template" — sheet names,
header/data cell coordinates, row capacity, content hash — and
`formgen::fidelity::SheetFidelitySnapshot` (Wave 3) already models
render-fidelity comparison (merges, formulas, print areas, row/column
sizing). This wave does not introduce a third layer; `evidence::
EvidenceKind` (`StructuralIdentity` | `RenderFidelity`) names the
existing split explicitly rather than reinventing it, per the brief's
own instruction not to assume every style attribute belongs in the
primary recognition fingerprint.

## Decision: intake is a dev-only evidence tool, not a Tauri command

`src-tauri/examples/inspect_template_candidate.rs` follows the existing
`examples/gen_sf9_fixture.rs` precedent: a local, dev-only binary, not a
UI, not a Tauri command, not wired into the shipped application. Given a
local file path (it never fetches a URL itself), it:

1. Refuses to parse anything over 25 MB before touching the bytes
   (zip-bomb / oversized-file defense-in-depth — real DepEd School Forms
   have no legitimate reason to approach this size).
2. Computes SHA-256 and size.
3. Attempts to parse the workbook and, on success, lists sheet names and
   merged-cell-range counts per sheet; on failure, prints the parse
   error as an explicit evidence gap rather than panicking or guessing a
   format.
4. Prints a **suggested** starting classification
   (`CandidateUnverified` / `NotVerified`) and points at
   `confirm_authoritative_source` as the next step — it never writes a
   `TemplateDescriptor`/`TemplateEvidence` to the source tree itself. No
   arbitrary downloaded spreadsheet becomes a production template merely
   by being placed in a folder and run through this tool.

Verified manually this wave: correctly reproduces SF1's known hash and
structure against the existing fixture; handles a non-spreadsheet file
without panicking; refuses a 26 MB file before parsing it.

## Decision: what belongs in Git

Synthetic fixtures (`tests/fixtures/sf1_template_synthetic.xlsx`,
`sf9_template_synthetic.xlsx`, and the matching `resources/` copies)
stay committed, clearly labeled as synthetic in both filename and every
doc comment that references them — unchanged from Wave 3/2I. A future
real authoritative template's own bytes are a separate redistribution
judgment (not made in this wave, since none was found); at minimum its
hash, provenance record, and structural evidence belong in Git even if
the source file itself does not. No template-intake directory was
created in this wave — there is nothing to put in it yet, and an empty
scaffold would be structure without content.

## Independent review

Two independent reviews dispatched in parallel: security-reviewer and
architecture-reviewer. **Both closed, no BLOCKING findings.**

**Security review**: no blocking findings. Two non-blocking items, both
assessed as acceptable tradeoffs for dev-only tooling with no runtime/
security-boundary role (no Tauri command, no DB, no UI reads any of
this): (1) the 25MB pre-parse size cap in
`inspect_template_candidate.rs` bounds compressed file size, not
decompressed in-memory size — a crafted file could still cause memory
inflation, but the realistic blast radius is a developer's own machine,
not a production/multi-tenant exposure; doc comment now notes this
explicitly. (2) `confirm_authoritative_source`'s promotion guard is
bypassable via direct `TemplateEvidence` struct construction (see next
finding — same root cause, reported by both reviews independently).
Everything else checked (unsafe parsing beyond the cap, path
traversal/filename leakage, network fetching, PII-in-evidence, secret/
credential handling) — false positive, no issue found.

**Architecture review**: no blocking findings. Two of six non-blocking
findings were fixed this wave (the fix-worthy ones); the rest were
recorded as accepted tradeoffs or documentation clarifications:

- **Fixed**: `confirm_authoritative_source` guarded `Rejected` but not
  `Superseded` — a stale superseded record (whose `superseded_by` field
  still points at a newer version) could have been silently re-promoted
  to authoritative. Added the same guard for `Superseded`, plus a
  regression test.
- **Fixed**: this ADR's original wording ("the **only** function...
  permitted") overstated a type-system guarantee that doesn't exist —
  `TemplateEvidence`'s fields are all `pub`, so the guard is convention,
  not compiler-enforced (the module's own independence tests already
  exercise this directly, deliberately, to prove the two axes stay
  independently settable). Wording corrected above to "only sanctioned
  path"; the module doc comment now states this tradeoff explicitly
  rather than implying an enforced guarantee. Judged acceptable to leave
  as convention (not worth a private-field/builder rewrite) given this
  module has no runtime/security-boundary role today — revisit if this
  module is ever wired into anything less supervised than a human-run
  intake review.
- **Fixed**: `examples/inspect_template_candidate.rs` referenced
  `formgen::evidence` only in doc comments, never actually calling it —
  its suggested-classification output now prints the real
  `ProvenanceState`/`FidelityState` enum values via `{:?}` instead of
  hardcoded string literals, so a renamed/removed variant fails to
  compile here instead of silently drifting.
- **Fixed**: `EvidenceKind` was unused structure with a tautological
  test (`assert_ne!` between two variants of any two-variant enum proves
  nothing) — removed; its explanatory content (structural-identity vs.
  render-fidelity evidence) folded into the module doc comment instead.
- **Fixed**: `pub mod evidence;` in `mod.rs` sat directly beneath a
  comment block that was actually about `fidelity`'s `#[cfg(test)]`
  gating, making it misleadingly read as if describing `evidence` —
  reordered with its own short comment.
- **Accepted, not fixed**: zero external consumers of `formgen::evidence`
  outside its own tests exist yet — expected for a reusable pipeline
  built ahead of its second real use (this wave's own explicit framing,
  not scope creep); will resolve naturally once a real candidate is ever
  registered.

Both reviews independently confirmed no architecture-layering violation
(`npm run check:architecture` passed; this module deliberately has no
UI/DB/Tauri-command surface, correctly, since it is dev-only tooling
matching the existing `examples/gen_sf9_fixture.rs` precedent) and no
PII/network/path-traversal issue.

Verification re-run after these fixes: `cargo fmt --check` clean;
`cargo clippy --all-targets -- -D warnings` clean; `cargo test` — all
Rust tests pass, including 11 `formgen::evidence` tests (10 original +
1 new `Superseded`-guard regression test − 1 removed `EvidenceKind`
tautology test).

## Ten-scenario decision (Recommended / Next Best only, per the brief)

**Recommended (implemented):** two independent enums
(`ProvenanceState`/`FidelityState`) on a `TemplateEvidence` struct
alongside the existing `TemplateDescriptor`, a citation-gated promotion
function, and a dev-only intake tool that gathers evidence without
registering it.

**Next Best (not implemented):** a single `VerificationStatus` enum
combining both axes (e.g. `Unverified` / `StructureOnly` /
`FullyVerified`) would have been simpler to read at a glance, but was
rejected because it cannot express "authoritative source, unverified
renderer output" — exactly the state this project is actually in for
SF1/SF9 once a real template is eventually found — without an awkward
extra variant per combination. The two-axis model scales to that
combination for free.

## Verification debt

- `OFFICIAL_SF1_FIDELITY = NOT_VERIFIED` (unchanged).
- `OFFICIAL_SF9_FIDELITY = NOT_VERIFIED` (unchanged).
- SF10 candidate template URLs discovered on an official
  `*.deped.gov.ph` subdomain, but NOT registered as a
  `TemplateEvidence`/`TemplateDescriptor` — no SF10 generator exists.
  Internal field content of these files was never read (no
  unzip/xlsx-content tool available this session); the "no SF1/SF9 on
  this portal" negative claim rests on a search snippet, not a directly
  fetched directory listing (403 on direct attempts). The governing
  DepEd Order/Memorandum for the SF10 files, and for
  `School-forms-matrix.docx`, remains unresolved.
- Windows native packaging fidelity remains NOT_VERIFIED (pre-existing,
  unrelated to this wave).

## Consequences

- Verification debt is now partly typed and testable
  (`formgen::evidence`'s test suite specifically asserts SF1/SF9 stay
  `NotVerified` by default), not only prose in `VERIFICATION-DEBT.md`.
- A future SF10 (or any other form) generator's evidence work has a
  concrete leads list (the four `support.lis.deped.gov.ph` URLs) to
  start from instead of a blank search.
- The promotion guard (`confirm_authoritative_source`) is the one place
  this project would need to revisit if it ever wants a _reviewed_
  automatic promotion path — deliberately not built in this wave, since
  the brief requires a human decision here.
