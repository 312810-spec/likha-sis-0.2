# Verification Debt

## Wave 2N — SF10 Evidence Closure (2026-08-27)

Full record: `docs/adr/0053-*` Wave 2N addendum, `docs/form-evidence/sf10/README.md`.

**Closed this wave:**

- **SSHS SF10 provenance** — `SF10_SSHS_V2026_CANDIDATE_EVIDENCE` promoted
  from `CandidateUnverified` to `AuthoritativeSourceConfirmed`. Binding
  evidence: DepEd Memorandum No. 020, s. 2026 para 5(b) (verbatim via
  `pdftotext` from the official deped.gov.ph PDF) names the exact
  filename `SSHS SF 10 v2026.xlsx` and the LIS portal Wave 2M
  downloaded it from. Promotion validated against
  `confirm_authoritative_source` (test), not bypassed.
- **Academic vs TechPro template split** — resolved as **no split** on
  current evidence (DM 020's readable page describes one SSHS SF10, one
  filename). `sf10-sshs-v2026` keeps `track: None`, now evidence-backed.
- **JHS SF10 applicability over-claim** — Wave 2M's `["7","8","9","10"]`
  band corrected to `["7"]` (MATATAG phases in per grade; DO 010
  s. 2024). Resolver now fails closed for JHS Grades 8-10.

**Still open (SF10 = PARTIALLY READY):**

1. **DM 020 pages 1, 3, 4 unread** — scanned images, no text layer, no
   OCR in the frozen harness. The full legal-scope paragraph and the
   effectivity clause were not read directly; the scope facts come from
   the readable page 2 + the deped.gov.ph announcement page. Promotion
   was made on the explicit page-2 filename binding; revisit if the
   unread pages ever become available.
2. **SSHS SF10 render fidelity: `NotVerified`** — no SF10 generator
   exists; no generated output has been compared to the real form.
   Provenance promotion did not and must not change this.
3. **JHS MATATAG SF10: EVIDENCE BLOCKED** — the national Joint
   Memorandum (ref. STR-250331-0910-PS, 28 Mar 2025) PDF was not
   obtained (only secondary republications + a division memo). The JHS
   candidate files carry a non-DepEd `SirWedz Guides` worksheet; the
   LIS directory listing returns HTTP 403 so a clean master could not
   be enumerated/checksum-matched. Not confirmed to be Annex I/II/III.
   Stays `CandidateUnverified`.
4. **Pre-MATATAG SF10 templates** (DO 69 s. 2016, DO 4 s. 2014): not
   acquired. `resolve` returns `NoApplicableTemplate` for those eras
   (correct behaviour, but blocks historical-record SF10 generation).
5. **Internal cell/title text** of every SF10 candidate: still not
   transcribed (structural inspection only).
6. **`formgen::template_version`** still has no persistence or command
   surface — resolver seam only (by design; Part G forbids more).

**Independent review**: security-reviewer + architecture-reviewer both
returned findings in full. **No BLOCKING findings from either.**
Architecture: two initially-BLOCKING items were ADR doc-integrity
issues in an earlier draft (unfilled `npm run quality` placeholder,
pre-written review paragraph) — both fixed; non-blocking items acted
on (const renamed `..._CANDIDATE_EVIDENCE` → `..._EVIDENCE`; unverified
DM-48/DO-03 s.2025 wording softened to a third-party lead; registry-wide
promotion-guard invariant test added; test count reconciled; superseded
Wave 2M ADR regions marked in place). Security: no blocking; two
non-blocking should-fix — the same registry invariant test (added) and
an "Effectivity:" → "Effectivity LEAD:" wording softening (done);
confirmed the promotion is guard-satisfying not bypassing,
`Provenance != Fidelity` preserved, DM 020 para 5(b) is a sufficient
issuance→file binding, JHS stays unpromotable/fail-closed, no
PII/secret/architecture issue. **No Wave 2N independent-review debt.**

**All prior verification debt (Wave 2M and earlier) remains intact.**

## Wave 2M — SF10 Authoritative Template Intake & Version Applicability (2026-08-27)

Full record: `docs/adr/0053-sf10-template-applicability-and-versioning.md`,
`docs/form-evidence/sf10/README.md`.

**SF10 template provenance is `CandidateUnverified` for all four
acquired candidates — none was promoted.** Six enumerated authority
gaps (see `docs/form-evidence/sf10/README.md`):

1. **DepEd Memorandum No. 020, s. 2026 body was never read.** Confirmed
   to EXIST on deped.gov.ph (official page + PDF `DM_s2026_020r-1.pdf`)
   and its high-level scope (Strengthened SHS, SY 2025-2026 pilot
   implementers) is confirmed from the page — but the PDF is a scanned
   image with no text layer and the frozen harness (ADR-0052) has no
   OCR. So the file↔issuance binding (are the bytes of
   `SSHS SF 10 v2026.xlsx` the "corrected copy" the memo distributes?),
   the exact field prescriptions, and whether Academic and TechPro
   share one SF10 or split are all **unconfirmed**. The
   `formgen::template_version` SSHS entry models `track: None`
   (shared) — this is the single most likely thing to change once the
   memo is read.
2. **No governing DepEd Order/Memorandum was pinned for the JHS MATATAG
   SF10 revision.** Its applicability window (MATATAG, Grades 7-10,
   from SY 2024-2025) rests on secondary sources only.
3. **The JHS candidates are community-annotated.** Three of four
   carried a non-DepEd `SirWedz Guides` worksheet. Official portal, but
   not confirmed pristine DepEd masters. A clean DepEd JHS SF10 master
   was not located.
4. **Pre-MATATAG-era SF10 templates (DO 69 s. 2016, DO 4 s. 2014) were
   not acquired** — only their issuance citations. `resolve()` returns
   `NoApplicableTemplate` (by design, not a bug) for a K-to-12-era JHS
   context, which blocks historical-record SF10 generation until those
   templates are obtained.
5. **Internal cell/title text of every candidate was not transcribed.**
   Wave 2M did structural inspection only (sheet names, merges,
   formulas, defined names, data validation, page setup, hidden
   rows/cols) — no field-level mapping.
6. **SF10 render fidelity is `NotVerified`** — no SF10 generator exists
   and none was built (Wave 2M scope guard).

**`formgen::template_version` has no persistence or command surface.**
It is the resolver seam only; no real SF10 generation path exercises
it yet (by design this wave).

**One transient `rustc` internal-compiler-error** was observed once on
a full `cargo test` immediately after `cargo fmt` rewrote
`template_version.rs` mid-build. It did NOT reproduce: `cargo test
--lib` (478 pass), `--doc` (0), `--tests`, and a full `cargo test`
rerun were all clean afterwards. Recorded as a stale-incremental
artifact, not a code defect — but noted here so a future session that
hits it knows it was seen and cleared once.

**Independent review**: security-reviewer + architecture-reviewer
dispatched per ADR-0052's frozen-harness rules.

- **Architecture review** — findings retrieved in full. No BLOCKING
  (the three it initially tagged BLOCKING were ADR-draft accuracy
  issues + a stray uncommitted junk file, all corrected/removed before
  the commit). Non-blocking items acted on: removed dead
  `historical_only` and unused `supersedes`/`superseded_by` fields;
  `resolve` now refuses `Synthetic` provenance too; curriculum-label
  seam documented; `formgen/mod.rs` doc comment updated; ADR wording
  corrected. See ADR-0053 "Independent review".
- **Security review** — headline retrieved: **no BLOCKING findings**;
  seven non-blocking items (NB-1..NB-7); all five review questions
  answered; explicit confirmation that neither historical failure
  class (PII-into-commits/logs; promotion-guard bypass) recurred. **The
  itemized NB-1..NB-7 text hit this project's documented
  reviewer-retrieval bug and was NOT recoverable** after two resume
  attempts (agent replied "Review complete. Nothing further."). Per the
  established fallback: failed retrieval recorded, rigorous self-review
  substituted (no workbook bytes / real data in the diff; intake tool
  stays dev-only read-only; `resolve` cannot return an unauthoritative
  template — proven by construction + tests; new SF10 records
  unpromotable). **The security-review-specifics debt (the content of
  NB-1..NB-7) is retained** — re-run `security-reviewer` on this
  checkpoint under a healthy harness in a future session.

**All prior verification debt (Wave 2L and earlier) remains intact.**

## Wave 2L — Final Harness Consolidation + Production Harness v1.0 (2026-08-27)

Full record: `docs/adr/0052-wave2l-production-harness-v1.md`.

**Independent architecture/harness review NOT retrieved.** An
`architecture-reviewer` agent was dispatched read-only for the Wave 2L
harness structure question (rules / agents / skills / hooks /
always-loaded context / `scripts/`), which also carried the owed Wave
2J architecture/harness review. It ran (~87.5K tokens, 40 tool uses,
~322s) and reported completion but returned **no retrievable findings
text** — the same recurring reviewer-retrieval failure documented
throughout this project since M7. One `SendMessage` retry requesting
the full text inline was attempted. Per the established
reviewer-harness fallback rule: the failed attempt is recorded here, a
rigorous self-review was substituted (see ADR-0052 §"Independent
review"), and the **independent-review debt is retained** — retry under
a healthy harness in a future session. Self-review found no blocking
issue; the wave changed one dead config line and added documentation.

**Native Tauri smoke verification — still owed, unchanged by this
wave.** Reconciled explicitly this wave: **no wave has ever produced a
packaged Windows installer or driven the compiled Tauri binary** with
WebdriverIO / `@wdio/tauri-service` or any native driver. `cargo build`
(debug, full binary) succeeding is the entire extent of native proof.
The `KeyStore`/resource-resolution/installer paths remain
`NOT_VERIFIED` against a real packaged build. This is a milestone of
its own, deferred, not a harness component.

**`gitleaks` and `osv-scanner` not installed on this machine.**
`where.exe` finds neither; `cargo-deny` is present. Repo-side wiring is
durable and machine-independent (CI `.github/workflows/security.yml`
runs all three regardless), so this is a per-machine local-tooling gap,
not a repo defect — but `npm run quality:security` cannot fully run
locally on this machine until they are installed.

**LSP live behaviour not re-demonstrated this wave.** The KEEP
disposition for `typescript-lsp` / `rust-analyzer-lsp` relies on
ADR-0045's Wave 2F grep-cross-checked demonstration as the most recent
primary evidence; it was not independently re-run in Wave 2L.

**`impeccable` vendored tree (~130 files) — maintenance-cost flag, not
a defect.** Kept because only `SKILL.md` loads and only on an explicit
design-work trigger (≈0 context cost when idle). Flagged for a prune
review if it goes unused for a full production phase.

**ProjectForge profiles are initial designs, not proven.** Only the
`software` profile is backed by real use (LIKHA itself). The other ten
profiles (general/web/native/research/business/data/automation/
education/writing/design) are reusable scaffolding validated
conceptually against non-LIKHA examples in `ADOPTION-GUIDE.md`, not
matured through actual projects. Recorded in the ProjectForge repo's
own provenance.

**All prior verification debt (Wave 2K and earlier) remains fully
intact and unweakened by this wave** — this wave touched no product
code, no tests, no migrations, no dependencies.

## Wave 2K — Official-Form Template Evidence & Provenance Registry (2026-08-27)

Full record: `docs/adr/0051-official-form-template-evidence-registry.md`.

**`OFFICIAL_SF1_FIDELITY = NOT_VERIFIED` and `OFFICIAL_SF9_FIDELITY =
NOT_VERIFIED` remain unchanged** — no authoritative source found for
either this wave; this is now also asserted by
`formgen::evidence`'s test suite (`sf1_evidence_reports_unverified_
provenance_and_fidelity_by_default`,
`sf9_evidence_reports_unverified_provenance_and_fidelity_by_default`),
not only recorded in prose.

**New lead, not yet acted on: SF10 candidate templates on an official
DepEd subdomain.** `support.lis.deped.gov.ph/support/downloads/
schoolforms/` (a verified `*.deped.gov.ph` subdomain) serves four
`.xlsx` files whose existence and container format were personally
confirmed by direct fetch (HTTP 200, valid OOXML/ZIP structure) —
`SSHS SF 10 v2026.xlsx` and three sibling SF10 files (exact URLs in
ADR-0051). **Not registered as a `TemplateEvidence` this wave** — no
SF10 generator exists, and none was built merely to exercise this
wave's framework, per the brief's own instruction. Two gaps disclosed
rather than assumed away: internal cell content/field layout was never
read (no unzip/xlsx-content-reading tool available in this session —
only container-level authenticity is confirmed); and the governing
DepEd Order/Memorandum for these files is unresolved (a linked PDF and
a separate `School-forms-matrix.docx`, both confirmed genuine DepEd-
hosted files, could not be text-extracted with tools available here).

**SF1/SF9 absence-on-this-portal is a weaker negative than it looks** —
the claim that only SF5/SF8/SF10/SHS forms are indexed there rests on a
search-engine snippet, not a directly fetched directory listing (a
direct listing fetch returned HTTP 403 on every attempt this wave).
Retry with a different fetch approach in a future session before
treating SF1/SF9's absence from this specific portal as confirmed.

**No template-intake directory was created** — nothing to put in it yet
(deliberate scope discipline, not an oversight; see ADR-0051's "What
belongs in Git").

**`confirm_authoritative_source`'s guard blocks the state TRANSITION,
not the contradictory RECORD** — `TemplateEvidence`'s fields are all
`pub`, and the guard function only sees `current: ProvenanceState`, not
`superseded_by`, so a record with `provenance:
AuthoritativeSourceConfirmed` and a populated `superseded_by` field can
still be constructed directly, bypassing the guard entirely (accepted
as a reasonable tradeoff by both Wave 2K reviews, since this module has
no runtime/security-boundary role today — see ADR-0051's "Independent
review"). If `formgen::evidence` is ever wired into an unsupervised
intake path (rather than a human-run review step), this gap must be
closed first — e.g. private fields behind a checked constructor.

**All prior verification debt (Wave 2J and earlier) remains fully
intact and unweakened by this wave.**

## Wave 2J — Resilient Zero-Cost Memory Observer + Project-Brain Hardening (2026-08-27)

Full record: `docs/adr/0050-resilient-zero-cost-memory-observer.md`.
Harness/developer-infrastructure milestone.

**Two independent reviews closed, no blocking findings; two real bugs
found and fixed.** Security review: 3 non-blocking items, all fixed/
corrected (commit-subject line now redacted like paths; claude-mem
disable-certainty corrected in the ADR; fail-open doc comment
narrowed). Failure-mode review: 2 real gaps found and fixed with new
regression tests — a truncated mid-write journal line could silently
destroy the NEXT valid observation too (fixed: trailing-newline check
before append); `computeHealth()` was not actually crash-safe against
a directory-level read failure (fixed: directory/file reads now
wrapped in try/catch, matching the write path's existing discipline).
See ADR-0050's "Independent review" section for full evidence.
Remaining, not fixed this wave: claude-mem's disable is
configuration-only, not empirically live-tested (do a live smoke test
in a future session); unbounded journal-file re-scan (design debt, not
currently a problem); a theoretical, unconfirmed cross-process
double-invocation race in the Stop hook's dedup.

**Independent review debt (one of three roles not dispatched this
wave)**: security review and failure-mode/silent-failure review were
dispatched in parallel this wave. **Architecture/harness review was
NOT dispatched** — recorded here honestly rather than omitted, per this
wave's own explicit instruction not to repeat Wave 2I's under-recording
of undispatched review roles. Periodically retry in a later session.

**No SessionStart-specific health probe was added** — `/memory-health`
provides on-demand checking; ADR-0050 records the reasoning for why a
separate SessionStart probe was judged unnecessary (Layer 2's failure
modes are already fail-open by construction, so there is no "external
observer down, fall back" transition for a probe to preemptively
perform). Revisit if evidence shows this judgment wrong.

**Memory promotion pipeline (observation → candidate → curator → durable
doc) was not built** — a deliberate scope cut per the brief's own
elimination-first instruction (§6), not an oversight. Layer 1 updates
remain manual/Claude-driven, unchanged from every prior wave's own
practice.

**Local embeddings remain deliberately `DISABLED`** — no evidence
reviewed this wave justified adding one for this project's current
scale. Revisit only with concrete evidence that grep-based recall
(`scripts/memory/recall.mjs`) is insufficient.

**The global `~/.claude/settings.json` change (disabling claude-mem) is
machine-wide, not repository-scoped** — it affects every project on
this machine that had claude-mem enabled, not only LIKHA-SIS. Fully
reversible (flip the same key back to `true`), but the user should be
aware of the blast radius; this is not something a future session
should assume was scoped to this repository alone.

**All prior verification debt (Wave 2I and earlier) remains fully
intact and unweakened by this wave** — confirmed both by direct human
re-read of this file before writing this entry, and by
`scripts/memory/recall.test.mjs`'s own automated tests, which run
against this file's REAL live content (not a fixture) and assert SF1
fidelity, SF9 fidelity, and Windows packaging are all still recoverable
as `NOT_VERIFIED`, with none of the corrupted "PASSED/VERIFIED"
phrasings present anywhere in the canonical docs. See the untouched
entries below.

## Wave 2I — Multi-Form Official-Form Contract + SF9 Readiness (2026-08-27)

Full record: `docs/adr/0049-multi-form-official-form-contract.md`.

**Official SF9 fidelity against a real authoritative DepEd template is
`NOT_VERIFIED`** — no such template exists anywhere in this repository
or was obtainable from `deped.gov.ph` directly (confirmed by a live
fetch of the department's own homepage this wave). Built and tested
against an explicitly synthetic fixture
(`src-tauri/tests/fixtures/sf9_template_synthetic.xlsx`, mirrored at
`src-tauri/resources/sf9/sf9_template_synthetic.xlsx`) instead — same
disclosed gap as SF1's own `NOT_VERIFIED` fidelity (still open, see
below). The exact missing artifact for SF9 is the same kind as SF1's: a
real, authoritative DepEd SF9 workbook or official field-layout
documentation.

**Windows packaged-installer resource resolution for `resources/sf9/*`
is `NOT_VERIFIED`** — same disclosed gap as SF1's, not re-attempted this
wave since the sandboxed environment has not changed. `tauri.conf.json`
was widened to include `resources/sf9/*` following the exact pattern
already used for `resources/sf1/*`, and a byte-identity test confirms
the bundled resource matches the fixture, but no `tauri build` installer
was produced this wave either.

**Independent review debt (three of four §12 roles not dispatched this
wave)**: only a security review (SF9 authorization parity, atomic-write
correctness, `sf9_projection` query isolation, `reject_unsupported_
format` call ordering, log/error PII exposure) was dispatched this
wave — it closed with no `BLOCKING` findings and one `NON-BLOCKING`
should-fix, fixed (`sf9_projection` now independently verifies
`learner_id` belongs to `school_id`, rather than relying solely on the
caller having already checked). Workbook/template-fidelity review,
architecture/maintainability review, and a second security pass
specifically re-checking the fix above are retained as owed
independent-review debt — periodically retry in a later session per the
established reviewer-harness fallback rule, not silently dropped.

**Secure/encrypted export UX is not designed** — deliberately out of
scope this wave per the brief's own instruction not to add
password-protected spreadsheets merely to "solve" the disclosed
unencrypted-file data-exposure boundary absent evidence it's actually
required/interoperable with official DepEd workflows. A future secure-
export UX requirement (if evidence ever supports one) should be
designed as its own milestone, reusing the now-formalized data-exposure
contract in ADR-0049 rather than bolting encryption onto a single
adapter.

## Wave 3 — Authoritative-Template SF1 Form Engine (2026-08-26)

Full record: `docs/adr/0048-official-form-engine-sf1.md`.

**Official SF1 fidelity against a real authoritative DepEd template
remains `NOT_VERIFIED`** — no such template exists anywhere in this
repository or was obtainable from this development environment. The
form engine is built and empirically tested against an explicitly
synthetic fixture (`src-tauri/tests/fixtures/sf1_template_synthetic.xlsx`,
mirrored as the bundled resource at
`src-tauri/resources/sf1/sf1_template_synthetic.xlsx`) instead. This is
the single most important open item from this wave — the exact missing
artifact is a real, authoritative DepEd SF1 workbook (or official field-
layout documentation) to inspect and design a real `TemplateDescriptor`
against.

**Windows packaged-installer resource resolution is `NOT_VERIFIED`** —
`tauri.conf.json`'s `bundle.resources` config and
`commands::formgen.rs`'s `BaseDirectory::Resource` resolution call are
structurally correct per Tauri 2's documented convention (confirmed by
independent architecture review), and a test proves the bundled
resource file is byte-identical to what the engine expects, but no
`tauri build` installer was actually produced or run in this sandboxed
environment this wave — the real installed-resource-resolution path
(as opposed to the dev-mode/source-tree path) is unproven.

**Three independent reviews (form fidelity, security/native-boundary,
architecture/maintainability), all CLOSED, no blocking findings.** All
three hit this project's recurring reviewer-retrieval bug on the
standard notification channel and were recovered via the established
raw-transcript-then-retry protocol. Findings and fixes:

- **Fixed, real bug**: `formgen::umya_adapter`'s atomic-write logic
  cleaned up its sibling `.tmp` file on a write failure but NOT on a
  rename failure (the rename call sat outside the cleanup closure).
  Fixed by moving the rename inside the same closure. Caught by a new
  test (`a_rename_failure_after_a_successful_write_still_cleans_up_the_temp_file`)
  that forces a rename failure by pointing the output path at an
  existing directory.
- **Fixed, test-name-vs-behavior mismatches** (found by the form-
  fidelity reviewer, an adversarial check of every test's name against
  its actual body): `rejects_a_structurally_wrong_workbook_even_if_it_were_hash_matched`
  was, per its own inline comment, actually caught by the hash check,
  never the structural check it claimed to prove — the structural check
  (`verify_structure`, extracted into its own testable function) had
  zero test coverage. `empty_optional_fields_are_written_as_blank_not_a_placeholder_string`
  claimed to distinguish a genuinely blank cell from a placeholder empty
  string, but `umya-spreadsheet`'s own source confirms `set_value_string("")`
  always writes an explicit empty-string value — the test could not
  prove what its name claimed. `a_failed_generation_never_leaves_a_temp_file_behind`
  only exercised the pre-temp-file-creation rejection path, never the
  cleanup-on-error branch inside the write/rename closure (this is what
  led to discovering the rename-cleanup bug above).
  `a_section_with_no_enrolled_learners_generates_a_form_with_zero_rows`
  only checked a return-value struct field, never opened the generated
  workbook to confirm the row was actually empty. All four renamed/
  rewritten to prove only what they actually exercise, plus new direct
  tests for `verify_structure` and a full-30-learner-capacity test
  confirming the footer formula survives at the boundary.
- **Fixed, doc-accuracy**: `formgen::umya_adapter`'s and
  `formgen::mod`'s doc comments claimed `umya_adapter` was "the only
  module that imports `umya_spreadsheet`," while `formgen::fidelity`
  (an unconditional `pub mod`) also imported it directly — false as
  written. Fixed by gating `fidelity` to `#[cfg(test)]` (matching its
  only actual caller), making the claim true again for the production
  binary. `formgen::fidelity`'s own doc comment claimed to check
  "defined names (where a print area lives)" before that field/check
  actually existed in the struct — fixed, `defined_names` is now a real,
  compared field. Two source comments cited "ADR-0048 §8" and "ADR-0048's
  disclosed packaging-spike limitation" — sections/content that did not
  exist in the ADR at the time (found independently by both the
  architecture and form-fidelity reviewers). Fixed: citations corrected
  to real section names, and the "Security and privacy"/"Windows
  packaging spike" content those comments pointed at was written into
  the ADR rather than left dangling.
- **Newly disclosed, not fixed (deliberate, documented limitations)**:
  generated `.xlsx` files are unencrypted, unlike the SQLCipher-
  encrypted working database — a deliberate data-exposure boundary, now
  explicit in ADR-0048 (previously undisclosed in both this ADR and the
  precedent ADR-0009). `generate_sf1_form`'s authorization gate
  (session-only, no `Capability` check) matches every sibling export
  command's existing convention, but the asymmetry against the stricter-
  gated SF1 _import preview_ path was previously unexamined — recorded
  as a deliberate decision to keep convention consistent this wave,
  revisit uniformly across the whole export family if DepEd compliance
  requirements are found to demand it. `formgen::fidelity`'s sheet-
  protection comparison checks presence only, not content (a password
  could be dropped silently). Its `excluded_write_region` supports only
  one rectangle and, against this wave's own fixture, is slightly wider
  than the true write surface. A genuine panic mid-write (not a
  returned `Err`) can still leave a `.tmp` file behind — accepted rather
  than wrapped in `catch_unwind`, per the security reviewer's own
  offered resolution.
- **Recorded, not implemented this wave**: genuine SF9/SF10 reuse would
  need new domain-contract/port-method code, not just a new
  `TemplateDescriptor` constant — `formgen::sf1`'s types and
  `OfficialFormGenerator::generate_sf1`'s signature are SF1-specific.
  `formgen::fidelity` is typed directly against
  `umya_spreadsheet::Worksheet`; a future switch to the Java/POI Next
  Best would need to rewrite it (re-parsing output bytes independently),
  not reuse it as-is.

`gitleaks`/`osv-scanner` were not installed on PATH in this session
(same disclosed local-tool-availability pattern as prior waves);
`cargo-deny` ran clean locally (`advisories ok, bans ok, licenses ok,
sources ok`). CI's `.github/workflows/security.yml` runs all three
regardless of local availability.

## Wave 2G — External API & Government Reference-Data Foundation (PSGC) (2026-08-26)

Full record: `docs/adr/0047-psgc-reference-data-foundation.md`.

**Three independent reviews dispatched (security/privacy, reliability/
architecture, teacher/compliance) — all CLOSED, one genuinely blocking
finding fixed, converged on independently by two of the three
reviewers.** Both the security and reliability reviewers hit this
project's recurring reviewer-retrieval bug on the standard notification
channel (a stub confirmation instead of the actual findings text) and
were recovered via the established two-step protocol — raw-transcript
JSONL parsing first (recovered the reliability review's full text this
way), then a `SendMessage` retry explicitly demanding the full text be
pasted (recovered both the security and teacher/compliance reviews this
way). **Blocking finding, fixed**: read commands
(`get_current_psgc_snapshot`/`list_psgc_units`) hardcoded the literal
`"PSA PSGC"` as the source name to look up, while the importer accepted
any non-blank `sourceName` string with no allow-list — a file with any
other spelling imported "successfully" but became permanently invisible
to every read, with no schema-level backstop and no in-app remedy under
the append-only design. Fixed with an `EXPECTED_SOURCE_NAME` constant
enforced at parse time, plus a schema-level partial unique index
(`idx_reference_geo_snapshots_one_current_per_source`) so the class of
bug is now impossible at the database layer too. Two test-quality
findings, also fixed: the original "failure partway through" rollback
test never actually called `record_snapshot` (it only proved
`rusqlite::Transaction`'s own `Drop`-rollback behavior); the original
"survives a reconnect" test never actually reconnected. Both replaced
with genuine versions. One data-integrity gap, fixed: level-sort-before-
insert accepted a same-level malformed parent/child pair whenever file
row order happened to place the child after its "parent" — now an
explicit level-adjacency check rejects this deterministically regardless
of order. Two smaller gaps, fixed: no actor-attribution column on
`reference_geo_snapshots` (added, matching `sf1_import_history`'s
pattern); zero command-layer test coverage (added
`tests/reference_geo.rs`, 4 integration tests). One cosmetic gap, fixed:
a repeat-import no-op previously reported `unit_count: 0`, which a
future UI could misread as a failed import — now reports the existing
snapshot's real count.

**New debt recorded** (documentation gaps, not code defects — see
ADR-0047's own "Remaining verification debt" section for the full
text): `GeoLevel`'s closed 4-variant enum would reject an entire real
PSA-derived file if it ever contained a level outside those four values
(not widened this wave — no verified real PSA level taxonomy exists to
widen it against, so a guess was deliberately not made); a future
learner-address field must key on `reference_geo_units.code`, never
`.id`/`snapshot_id` (fresh UUIDs per import, unstable across
re-imports) — flagged by the teacher/compliance reviewer as absent from
the ADR's original text, now recorded there explicitly; producing a
real PSGC snapshot file from PSA's actual publications is realistically
a developer/technical task, not a registrar self-service one — the
ADR's phrasing previously read as though picking a file were the hard
part, now corrected.

`gitleaks`/`osv-scanner` were not installed on PATH in this session, so
`npm run quality:security` only ran `cargo-deny` locally (clean:
advisories/bans/licenses/sources all ok) — not a new gap, the same
disclosed local-tool-availability pattern already recorded for prior
waves. CI's `.github/workflows/security.yml` (Wave 2F) runs all three
regardless of local availability and is the authoritative check for
this milestone's zero-new-dependency diff.

## Wave 2F — security tool CI gate (2026-08-26)

Full record: `docs/adr/0046-security-ci-gate.md`. Closes Wave 2E's own
recorded debt (`gitleaks`/`cargo-deny`/`osv-scanner` proven locally,
never wired into CI) via a new `.github/workflows/security.yml`.

**Independent security review + independent architecture/reliability
review — both CLOSED, findings fixed.** Security review: no blocking
issues across all 8 requested angles (permissions, trigger safety,
SHA pinning, download/verify/execute sequencing, failure-masking,
secret handling, third-party data exposure, command injection) — all
independently re-verified by the reviewer against live evidence
(`git ls-remote`, the pinned `gitleaks-action` commit's actual bundled
source, `gh api`), not accepted on trust. Three should-fix findings,
all doc-accuracy issues in `docs/adr/0046-security-ci-gate.md` (a cache
claim, a checksum-verification-uniformity claim, and an undisclosed
"advisory, not enforced" gate status) — all corrected in that ADR.
Architecture/reliability review: **one BLOCKING finding**, fixed —
`gitleaks-action`'s automatic scan path only covers each push/PR's own
new commits (verified by reading the pinned action's actual source),
not full history, and the workflow's original
`concurrency: cancel-in-progress: true` could let a superseded push's
own commits (and any secret in them) go permanently unscanned by any
completed job — realistic specifically because this project's own
operating mode pushes rapidly and sequentially. Fixed by removing
`cancel-in-progress` from `security.yml` entirely. Three further
non-blocking findings, all fixed: an ADR citation to a
`docs/VERIFICATION-DEBT.md` entry that didn't yet exist (this entry is
that fix), an ADR overclaim that the CI `osv-scanner` invocation was
"already proven locally" when it actually differs from
`scripts/check-security.mjs`'s `--offline` form (corrected in the
ADR), and a stale `src-tauri/osv-scanner.toml` path reference in this
file's own Wave 2E entry (corrected above). One minor nit fixed:
`curl -fsSL` (was `-sL`) on the `osv-scanner` binary download, so a
404/yanked-release download fails with a clear message rather than a
confusing downstream checksum mismatch.

**New debt recorded**: `actionlint` was not available in this
environment and was not installed for a one-time workflow-syntax
check. YAML validity was instead confirmed via Python's
`yaml.safe_load`, and every pinned action SHA was cross-checked
directly against `gh api` (not merely asserted) — but no dedicated
GitHub-Actions-specific linter ran. `.github/workflows/security.yml`'s
actual behavior is confirmed by its own real CI run instead (see the
final report for the exact run/commit). Revisit if `actionlint`
becomes available in a future session's environment, or if this
workflow grows complex enough that a manual read is no longer
sufficient.

## Claude Code harness audit — LSP live-behavior gap — CLOSED (2026-08-26, Wave 2F)

Full record: `docs/adr/0045-claude-code-harness-audit.md`'s Wave 2F
addendum. The gap recorded when the plugins were first enabled (below,
struck through) is now closed with genuine, cross-checked evidence
from a fresh session:

**Real root cause found and fixed first**: enabling a plugin in
`.claude/settings.json`'s `enabledPlugins` map is **not sufficient** on
its own — a headless verification run showed `Plugin not available for
MCP: typescript-lsp@claude-plugins-official - error type:
plugin-cache-miss` and `Total LSP servers loaded: 0` for all four
newly-enabled plugins. `claude plugin details` (used in the original
audit) reports on a plugin's _manifest_, not whether its content is
actually cached locally — a materially different check than this
milestone assumed. Fixed by running `claude plugin install
<name>@claude-plugins-official` for all four (user scope); confirmed
via `claude plugin list` afterward that all four now show `Status: ✔
enabled` with real version numbers resolved.

**Rust LSP (rust-analyzer) — genuinely demonstrated, cross-checked
against `grep`**:

- `workspace/symbol` for `authorize_capability_with_actor` →
  `src-tauri/src/auth/mod.rs:481` — matches
  `grep -n "pub fn authorize_capability_with_actor"` exactly.
- `findReferences` for `commit_import` → 7 references across 4 files
  (`commit.rs:135,333,404`, `tests/sf1_import.rs:55`,
  `commands/import.rs:80`, `import/preview.rs:176`) — every
  cross-file location matches `grep -n "commit_import"` exactly.
- `hover` for `commit_import` → returned the exact 9-parameter
  signature and doc comment as written in `commit.rs`.
- **Real operational finding**: rust-analyzer needs roughly 60 seconds
  to finish indexing this Tauri-scale workspace before
  `workspace/symbol`/`findReferences` return results — a query fired
  immediately after the server starts returns "No symbols found... the
  LSP server has not finished indexing," not an error. Retrying after
  the wait succeeds. Not a defect, just a real cold-start cost to know
  about.
- **Cosmetic-only defect observed, not blocking**: the LSP client logs
  an `ERROR` on server shutdown (`Failed to deserialize shutdown:
invalid type: map, expected unit; {}`) — a protocol-shape mismatch
  between this rust-analyzer version's shutdown response and Claude
  Code's LSP client, occurring only during teardown, after all real
  queries had already succeeded. Does not affect navigation during a
  session.

**TypeScript LSP (typescript-language-server) — genuinely demonstrated,
cross-checked against `grep`**:

- `workspaceSymbol` for `Sf1ImportApplicationService` →
  `src/application/sf1-import-service.ts:23` — matches.
- `documentSymbol` located `commitImport` at line 103 — matches.
- `findReferences` → 4 references across 3 files
  (`sf1-import-service.ts:103` declaration,
  `Sf1ImportScreen.tsx:191`, `sf1-import-service.test.ts:306,326`) —
  every location matches `grep -n "commitImport"` exactly (correctly
  excluding the unrelated `describe("commitImport", ...)` line).
- `hover` → returned the exact current method signature
  (`(sectionId, startsOn, plans, filePath) => Promise<Sf1ImportSummary>`).
- No indexing-delay issue observed (TypeScript indexed fast enough that
  the first query already worked in this test).

**Operational note for future sessions**: the plugin cache populated by
`claude plugin install` is **user-scoped** (`Scope: user` per `claude
plugin list`), not part of this repository. A fresh Claude Code
installation on a different machine would need to run `claude plugin
install <name>@claude-plugins-official` for each of these four plugins
once before their capabilities work, even with `.claude/settings.json`
correctly enabling them — the settings file alone is necessary but not
sufficient.

<details>
<summary>Original gap record (closed above, kept for history)</summary>

~~Newly enabled `.claude/settings.json` plugins (`typescript-lsp`,
`rust-analyzer-lsp`, `claude-code-setup`, `claude-security`) were
verified as correctly registered via `claude plugin details` (exact
component inventories and token costs matched direct file inspection),
and both LSP servers' underlying binaries were confirmed present and
runnable. Not verified: live behavior inside a running Claude Code
session.~~

</details>

## Wave 2E SF1 Import Operational Hardening & Auditability (2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E
addendum. Adds `sf1_import_history` (migration 19) and re-import
fingerprinting on top of the unchanged Wave 2B/2C engine + UI and
unchanged Wave 2D encryption architecture.

**A real, non-transient CI failure was caught and fixed after the
first push, per this milestone's own CI-verification rule**: the
`Quality (Ubuntu)` job failed a genuinely new test,
`import::fingerprint::tests::safe_filename_returns_only_the_final_path_component`,
which asserted on a hardcoded `C:\Users\...\sf1_grade1.xlsx` literal.
Root cause: `safe_filename`'s first implementation delegated to
`std::path::Path::file_name()`, whose separator handling is
platform-dependent — it only treats `\` as a path separator when
_compiled_ for Windows. This app is Windows-only, but its own CI
(ADR-0041) also runs the identical test suite on an `ubuntu-latest`
runner for toolchain-portability verification, where `Path` uses Unix
semantics and a backslash is just a literal character — so the whole
hardcoded string came back as one "filename." Not a flake, not
infrastructure, not a formatting drift — a genuine platform-dependent
logic bug in new code, caught exactly the way this milestone's Section
1 hard gate exists to catch it. **Fixed**: `safe_filename` no longer
delegates to `Path::file_name()` at all — it now splits on `/` and `\`
explicitly and manually, making its behavior identical regardless of
the host OS running the test. Two new tests added
(`..._for_a_forward_slash_path`, `..._falls_back_to_a_placeholder_for_a_trailing_separator`)
alongside the renamed original
(`..._for_a_windows_style_path`) to prove both separator styles and
the edge case explicitly, rather than relying on incidental platform
behavior again.

**Re-confirmed this session (not newly closed — same debt, re-run
against a changed dependency graph):** `gitleaks`/`cargo-deny`/
`osv-scanner` all re-run against this milestone's changes (new `sha2`
direct dependency included in the scan). `gitleaks`: no leaks.
`cargo-deny`: advisories/bans/licenses/sources all ok. `osv-scanner`:
no unaccounted-for issues (18 known, pre-documented/accepted advisories
filtered per `osv-scanner.toml` — this file lives at the repository
root, not `src-tauri/`; corrected here after Wave 2F's independent
review found this entry's original path reference was stale).
Installed binaries from
Wave 2D persisted on disk but were **not on this session's fresh shell
`PATH`** — re-invoked via full path
(`...\WinGet\Links\{gitleaks,osv-scanner}.exe`), confirming the earlier
install is durable but this environment's PATH is not guaranteed
stable across sessions; worth a one-line note if a future session hits
"command not found" for a tool this project's docs say is installed.

**New debt recorded this session:**

1. Security tooling in CI — still not wired in, still deliberately
   deferred, but with a concrete, named plan this time instead of a
   repeated "deferred" note: a separate `security-scan` job (never
   inside `quality-ubuntu`/`quality-windows`) on `ubuntu-latest` using
   `gitleaks/gitleaks-action` and `EmbarkStudios/cargo-deny-action`
   (both official, pinned by commit SHA), with `osv-scanner` held back
   for a follow-up session specifically because this session's own CLI
   needed a non-default `--config=... -r .` invocation to apply
   `osv-scanner.toml`'s ignore list correctly — that same fragility
   needs to be proven safe against `google/osv-scanner-action`
   specifically before trusting it unattended in CI. See ADR-0043's
   Wave 2E addendum for the full reasoning.
2. `cargo build --release` failed in this session's Bash-tool shell
   with a Perl/OpenSSL `Configure` error (`Locale::Maketext::Simple`
   module missing) — this is a local environment gap in that specific
   shell's Perl toolchain for a release-profile vendored-OpenSSL
   rebuild, not a code regression: plain `cargo build` (debug, full
   binary, not just `--lib`) succeeded cleanly, as did `cargo test` and
   `cargo clippy --all-targets -D warnings`. Not investigated further
   this session since CI's own Windows runner (not this local shell) is
   the authoritative build-verification environment and was not
   affected. Worth investigating if a native release build is ever
   needed directly from this local environment.
3. No dedicated "process closes mid-transaction" test was written for
   `commit_sf1_import`'s history-write path — this is SQLite/WAL's own
   documented guarantee (an uncommitted transaction is discarded on the
   next open), not independently reproduced by actually killing the
   process mid-write in this session. The existing
   `a_failure_partway_through_the_batch_rolls_back_the_entire_batch`
   and new `a_failed_commit_leaves_no_history_row_behind` tests cover
   the reachable in-process failure mode (a constraint violation) but
   not a hard process kill.

**Transient frontend test flake observed and re-verified, not a
regression**: one `npm run quality` pass showed `App.test.tsx`'s
`document.title` assertion fail once; re-running that file alone and
re-running the full suite both immediately after showed 438/438
passing cleanly. Not investigated further — this file was untouched by
Wave 2E and the failure did not reproduce, consistent with a
parallel-test-run `document.title` ordering flake, the same class of
transient issue Wave 2D already documented for a different test file.

**Independent reviews — both CLOSED.** Security review: no blocking
findings across all 8 requested angles; 2 non-blocking doc-comment
accuracy items, both fixed in this checkpoint. Architecture review: no
blocking findings across all 8 requested angles, but one real gap
found and fixed — `commit_import` had no server-side guard against an
empty `plans` slice, which would have written a phantom "0 rows, 0
learners" history row (only the frontend guarded against this before).
Now rejected server-side with a dedicated test. Two further optional
code-health suggestions (a provenance struct, SQL-literal style
consistency) were deliberately left unimplemented as non-blocking
nits. Both reviewer dispatches hit this project's recurring
reviewer-retrieval bug on the standard notification channel (empty/
stub first reply); both recovered in full on one retry via direct
message. Full detail: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave
2E addendum.

## Wave 2D Local Data Security Verification (2026-08-26)

Full record: `docs/adr/0044-local-data-security-verification.md`. This
milestone verified/hardened the EXISTING M2 encryption-at-rest
architecture (SQLCipher + DPAPI, ADR-0003) — it did not build new
encryption. Debt closed and newly recorded:

**Closed this session:**

- WAL/SHM sidecar-file plaintext exposure was entirely unverified
  before this session — now covered by a new test
  (`wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`,
  `src-tauri/src/db/mod.rs`) proving no plaintext learner data in
  either sidecar file while the WAL file genuinely holds unflushed
  content.
- `gitleaks`/`cargo-deny`/`osv-scanner` — the long-carried "unavailable
  in this environment" debt (since M6) is **closed for this session**:
  all three were installed via `winget`/`cargo install` and actually
  run against this repository. `gitleaks`: 55 commits, no leaks.
  `cargo-deny`: advisories/bans/licenses/sources all ok. `osv-scanner`:
  no unaccounted-for issues (17 known, all pre-documented/accepted).
  This specifically confirms `calamine` and `tauri-plugin-dialog`
  (Wave 2B/2C's dependency additions) have no flagged advisories.

**New debt recorded this session (see ADR-0044 for full detail):**

1. The three security tools above are proven runnable in an
   environment with `winget`/network access, but are **not yet wired
   into CI** (`.github/workflows/quality.yml` still only runs `npm run
quality:full`). Deliberately not added this session — cross-platform
   (Ubuntu has no `winget`) CI wiring is real, untested surface area
   that risks destabilizing a currently-green pipeline; recorded as a
   recommended follow-up, not attempted.
2. Malicious code already running as the same logged-in Windows user
   can still call `CryptUnprotectData` itself — a known, disclosed DPAPI
   limitation (unchanged from ADR-0003), explicitly out of this
   milestone's scope.
3. No full-codebase audit for accidental PII-in-logs beyond the
   `crypto`/`db` modules specifically — only those two modules were
   directly audited this session (confirmed: exactly one `log::` call
   in either, and it's a fixed generic string with no key material).
4. Windows-account-password-change behavior against DPAPI was reasoned
   about from documented semantics, not reproduced by an actual
   password reset in this environment.
5. No safe cross-device/cross-profile key recovery exists — a lost key
   or a device/profile change has no local recovery path today. This is
   a deliberate, disclosed design tradeoff (stated in both ADR-0003 and
   ADR-0044), deferred to future authenticated cloud-sync
   infrastructure, not solved with an insecure workaround.
6. Android key-store implementation remains unimplemented — no Android
   build target exists in this repository yet (same standing gap Wave
   2C already documented). The `KeyStore` trait is architecturally
   ready for it, but that readiness is itself unverified against a real
   Android target.

**Independent security review + architecture review — both CLOSED, no
blocking findings.** Standard notification channel hit this project's
recurring reviewer-retrieval bug on both dispatches; recovered in full
from each agent's raw transcript. Security review (9 angles: stolen
device, copied backup, compromised local files/other Windows account,
key extraction/zeroize placement, logs, tenant conflation, session/key
lifecycle, `DpapiKeyStore`'s `AlreadyExists` race) found all 8
adversarial angles FALSE-POSITIVE and one legitimate should-fix — this
ADR's first draft understated its own logging-surface audit (claimed
one `log::` call in `crypto`/`db`; `error.rs` actually has four more
that fire on the same error paths, logging full error detail by design
for operators, confirmed never including key bytes) — corrected in
place in ADR-0044, not left standing. Architecture review (7 questions)
found GOOD across all of them, including catching and closing its own
thin first-pass evidence (verified all ~24 `crate::crypto` references
outside `crypto`/`db` individually, not just one sampled file, before
confirming none are production layering violations). Full detail:
ADR-0044's "Independent security review"/"Independent architecture
review" sections.

## Wave 2C SF1 Import Preview + Duplicate Review UX (2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2C
addendum. Carries forward all four Wave 2B items below unchanged (UI
work doesn't close backend-only debt), plus two new items scoped to
this milestone:

1. **`cargo-deny`/OSV-Scanner did not run against `tauri-plugin-dialog`**
   either — same disclosed unavailable-tooling gap as `calamine` below.
2. **No native visual/screen-reader pass on the actual Tauri desktop
   binary.** `npm run quality:ui` (Playwright) and this session's own
   axe-core checks (`expectNoAccessibilityViolations`) cover structural
   accessibility in jsdom, and the native binary was confirmed to build
   and run (`cargo build`), but this environment has no browser/
   screenshot tool for the native window itself — a human visual pass
   (200% text reflow at real DPI, actual keyboard-only completion of the
   full workflow in the compiled app, screen-reader announcement
   behavior) has not happened. Same disclosed limitation
   `.claude/rules/testing.md` already documents as a standing gap for
   every UI milestone, not new to this one.

**Independent teacher-UX review (premium-design + teacher-comfort
combined) — CLOSED.** The standard notification channel again hit this
project's recurring reviewer-retrieval bug (the agent kept insisting
its report was "already delivered" on every automated follow-up ping);
recovered in full by reading the agent's raw transcript file directly,
same recovery technique as Wave 2B's security review. 7 of 11 questions
GOOD, 2 CONCERN (plain visual density/hierarchy, both explicitly
characterized as consistent with this app's existing CRUD-plain
baseline — not a regression, noted for a future density pass once
imports scale past a handful of duplicate rows), **4 NEEDS-FIX, all
fixed in this same checkpoint**:

1. `Sf1DuplicateReview.tsx` only ever showed/decided against
   `match.candidates[0]`, though `learner::find_candidates` has no
   `LIMIT 1` and can legitimately return more than one plausible match
   (verified directly against the Rust query, not theoretical). Fixed:
   the component now shows a candidate count and a selector when more
   than one exists, and the decision always targets whichever candidate
   the teacher has selected.
2. The "nothing is saved until you decide / no auto-merge" safety
   reassurance was Guided-mode-only, missing from Comfortable (the app
   default) and Efficient. Fixed: the core reassurance sentence is now
   shown in all three modes; Guided still layers on extra explanation.
3. A whole-file parse/commit failure collapsed every cause into one
   generic "Something went wrong" message, unlike the specific
   row-level error copy elsewhere on the same screen. Fixed:
   `describeError` now recognizes the backend's `import_error` category
   specifically and gives SF1-workbook-specific guidance for it,
   distinct from the true-unknown-failure fallback.
4. The birthdate row used two different phrasings for the same fact
   ("Not tracked" vs. "Not stored in LIKHA"). Fixed: reconciled to one
   phrase used in both the value cell and the comparison chip.

No further UX debt remains open from this review.

## Wave 2B SF1 Bulk Import Engine (2026-08-26)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`. Three genuine,
disclosed gaps carried forward (all in areas the engine itself does not
depend on for correctness — see the ADR for why none of them block this
checkpoint):

1. **Real SF1 template fidelity unverified.** `import::workbook`'s
   header/column layout is this project's own invented structure,
   verified only against a synthetic fixture
   (`tests/fixtures/sf1_synthetic_*.xls`) — no official DepEd `.xls`
   template was available in this repo or reachable from this
   environment (`deped.gov.ph` unreachable, same disclosed gap as every
   prior session). The adapter boundary is deliberately narrow
   (`import::workbook` is the only module aware of the layout) so
   retargeting it later is a mapping change, not a rewrite. Recorded as
   external material only the user can provide.
2. **Non-blank cached-formula-value read not provable in this
   environment.** `calamine` never evaluates a formula — it only
   returns whatever cached result value a workbook file itself stored —
   confirmed directly, but the only tool available to author a
   synthetic `.xls` fixture (`xlwt`) doesn't compute a cached formula
   result the way real Excel does, so only the _blank-cached-value_ case
   could be proven, not a genuine non-blank round-trip. A real DepEd
   workbook opened and saved by actual Excel would carry real cached
   values; this gap only affects the synthetic-fixture proof, not the
   underlying `calamine` behavior itself.
3. **`cargo-deny`/OSV-Scanner did not run against `calamine`.** Same
   disclosed unavailable-tooling gap as every prior dependency addition
   in this project (`gitleaks`/`cargo-deny`/`osv-scanner` all remain
   uninstalled in this environment, per `check-security.mjs`). The
   supply-chain/CVE check for `calamine` and its transitive tree
   (`chrono`, `zip`, `encoding_rs`, `codepage`, and others) has not
   actually executed.

**Independent `security-reviewer` — CLOSED**, findings retrieved by
reading the agent's raw transcript file directly after the standard
notification channel hit this project's recurring reviewer-retrieval
bug again (the agent's own replies insisted its findings were "already
delivered" on every automated follow-up ping, but nothing reached this
session through the normal path — recovered from
`tasks/<agent-id>.output` instead of falling back to self-review this
time). 7 of 8 questions FALSE POSITIVE with direct file:line citations
— see ADR-0043's Security Review section for the full breakdown. **One
real should-fix, addressed by disclosure, not by a code change**:
`import::workbook.rs`'s `MAX_DATA_ROWS` check runs only after
`calamine::worksheet_range` has already fully materialized the sheet
into memory — the crate's public API has no cheaper way to count rows
first, so a crafted `.xlsx` with a small on-disk size but a very dense
in-memory cell grid would be fully parsed before the row cap could
reject it. `MAX_FILE_BYTES` (checked first, before any parsing) is the
real bound against that specific zip-bomb-style shape; the row cap only
bounds what's accepted as a valid import. Documented in place in
`import::workbook.rs`'s doc comment and here as an accepted,
disclosed risk for a single-tenant, non-internet-facing desktop app —
revisit if this engine is ever exposed to a less-trusted caller than
this app's own webview.

## Wave 2A.1 Authorization Closure: `create_section` fixed, independent `security-reviewer` CLOSED (2026-08-26)

`create_section` (`src-tauri/src/commands/section.rs`) had the same
class of gap Wave 2A found in `enroll_learner_in_section`: gated only
by `sessions.require_active_school_scope`, no capability check at all
— any authenticated Teacher session could create sections. Fixed to
`auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)`
(School Head only, reusing the existing capability that already gates
Teacher Load's teaching-assignment commands — no new capability
invented). Six new integration tests in `src-tauri/tests/enrollment.rs`
prove: School Head succeeds; Teacher denied with no partial mutation;
Registrar-alone denied (confirming `ManageTeachingAssignments` is
intentionally distinct from `ManageLearners`); no-session denied; a
School Head at School A cannot create a section under School B; the
legitimate workflow still works end-to-end.

**Independent `security-reviewer` — CLOSED, real findings retrieved
this time** (breaking this session's own earlier retrieval-failure
streak on the same milestone family). 5 of 6 adversarial questions
ruled FALSE-POSITIVE with direct file:line citations (no
client-influenceable `school_id`; no alternate unguarded write path to
`sections`, confirmed by a repo-wide grep; `authorize_capability`
derives `school_id` from the trusted session only; mutation strictly
follows a successful `?`-propagated authorization check; no fail-open
default anywhere in `authorize_capability`). One non-security
SHOULD-FIX: document that the `ManageLearners`/`ManageTeachingAssignments`
split (Registrar can enroll, but only School Head can create sections)
is deliberate policy, not an oversight — addressed by ADR-0042's new
"Addendum (Wave 2A.1)" section. **No BLOCKING findings.**

**Bounded Wave 2A mutation-surface audit** (11 commands across
`commands/section.rs`/`commands/learner.rs`): every write command now
has a capability gate; every read command is session-scoped only,
matching the established "reads stay open" convention; no command
anywhere accepts a client-supplied `school_id`; no update/delete path
weaker than its create path (no delete exists for either entity); no
IDOR found. No further authorization defect discovered in this
bounded surface.

**Verification, all actually run this session**: targeted
`enrollment.rs` integration tests PASS, 13/13 (up from 7); full `cargo
test` PASS, 350 lib tests (unchanged — the fix was a pure gate change,
no new lib-level logic) + all integration binaries; `cargo fmt --check`
PASS; `cargo clippy --all-targets -- -D warnings` PASS, 0 warnings;
native `cargo build` succeeds; `npm run quality:full` PASS end-to-end;
`git diff --check` clean; `gitleaks`/`cargo-deny`/`osv-scanner`
**still unavailable** (`node scripts/check-security.mjs`: 0 ok, 0
failed, 3 missing — same disclosed, unchanged environment gap, not a
new debt); manual secret grep of the diff found nothing. Codex Pilot:
**BLOCKED** — `codex login status` reports "Not logged in," the same
unchanged condition confirmed in a prior session (including a network-egress
probe that found `wss://api.openai.com` returns HTTP 403 in this
environment); not re-probed further this session per the established
"don't repeatedly chase a known condition" rule.

**Debt closed**: `create_section`'s missing capability gate; the Wave
2A `security-reviewer` debt this specific follow-up scope covered
(the milestone's own boundary was `create_section` plus a bounded
mutation-surface audit — both are now independently reviewed with real
findings, not self-review). **Debt still open, unrelated to this
milestone**: `gitleaks`/`cargo-deny`/`osv-scanner` remain unavailable
in this environment.

## Wave 2A Learner Core + Enrollment: `security-reviewer` retrieval failure, self-review substituted (2026-08-26)

`security-reviewer` was dispatched for a narrow adversarial pass on the
real authorization gap this milestone closed
(`commands::section::enroll_learner_in_section`, previously gated only
by an active session with no role check at all) plus the three new
read-only commands/repository functions it added. It completed real
work (9 tool uses, ~49-56K tokens across two attempts) but returned no
retrievable findings text on the initial dispatch or the one permitted
retry — the same recurring agent-resume/retrieval failure documented
throughout this project since M7. A rigorous self-review was
substituted, answering the exact six adversarial questions the
dispatch was given:

1. **Every touched/new command derives `school_id` from the session
   only.** Confirmed by direct grep across
   `commands/section.rs`/`commands/learner.rs`: every handler calls
   either `sessions.require_active_school_scope(&conn)` or
   `auth::authorize_capability(&conn, &sessions, ...)` — no command
   accepts `school_id` as a parameter anywhere in this diff.
2. **No remaining path to enroll/transfer without `ManageLearners`.**
   Grepped every call site of `section_membership::enroll` in the
   crate: the only production (non-`#[cfg(test)]`) caller is
   `commands::section::enroll_learner_in_section`, now fixed. Every
   other call site is inside a `#[cfg(test)]` module or an integration
   test file, calling the repository function directly — expected and
   correct, since those tests deliberately bypass the command/auth
   layer to test the repository in isolation, the same pattern every
   other repository test in this codebase already uses.
3. **No cross-school leak in the three new read paths.** Re-read each
   query directly: `learner::find_candidates`
   (`WHERE school_id = ?1 AND (...)`),
   `section_membership::list_by_learner_in_school`
   (`WHERE school_id = ?1 AND learner_id = ?2`), and
   `current_membership_for_learner_in_school`
   (adds `AND ends_on IS NULL` to the same two-condition scope) all
   filter by `school_id` directly in the query, matching every other
   school-scoped query in this codebase — not merely implied by the
   caller already being "in" that school.
4. **No SQL injection risk.** `find_candidates`' `trim()`/`COLLATE
NOCASE` are query-template SQL syntax, not string-interpolated
   values; all four parameters (`school_id`, `lrn`, trimmed given/family
   name) are passed through `rusqlite`'s positional parameter binding
   (`stmt.query_map((school_id, lrn, trimmed_given, trimmed_family),
...)`), never concatenated into the SQL text.
5. **`create_section`'s identical missing-capability-gate issue is
   unchanged by this diff** (confirmed via `git diff main` — the
   function body is untouched) — a deliberate, disclosed decision
   recorded in `docs/adr/0042`, tracked as a separate spawned follow-up
   task rather than silently left unaddressed.
6. **No new TOCTOU risk.** Every touched/new command acquires
   `lock_db(&db)` once at the top and holds it for the command's full
   duration, the same `Mutex<Connection>` guarantee every other command
   in this codebase already relies on — confirmed by reading each
   command body directly, not assumed.

**No BLOCKING or SHOULD-FIX findings.** Real, non-self independent-review
debt for this specific change remains open — re-run `security-reviewer`
once agent-resume behavior is confirmed reliably working in a future
session.

## Integration Review + Main Fast-Forward: cross-milestone `architecture-reviewer` retrieval failure, self-review substituted (2026-08-26)

`architecture-reviewer` was dispatched for a narrow cross-milestone
question (does every command RBAC should gate, added after RBAC
landed — specifically Teacher Load's `commands::teaching_assignment.rs`
— actually route through it consistently; any accidental
curriculum/class-record/teacher-load concept duplication; migration
chain safety; leftover debug artifacts). It completed real work (30
tool uses, ~84-89K tokens across two attempts) but returned no
retrievable findings text on the initial dispatch or the one permitted
retry — the same recurring agent-resume/retrieval failure documented
since M7. A rigorous self-review was substituted:

- Read `src-tauri/src/commands/teaching_assignment.rs` directly, all 8
  commands: `create_teaching_assignment`/`replace_teacher_assignment`/
  `remove_teaching_assignment`/`create_schedule_meeting` gated via
  `auth::authorize_capability(Capability::ManageTeachingAssignments)`;
  `list_teacher_assignments`/`get_teacher_load`/
  `list_schedule_meetings_by_assignment` gated via
  `auth::authorize_view_teacher_load`; `list_teaching_assignments_by_section`
  intentionally open (reference data, matching `list_learners_by_school`'s
  established convention, documented inline). The previously-fixed
  cross-teacher schedule leak in `list_schedule_meetings_by_assignment`
  (closed by the RBAC Foundation `security-reviewer` review, see below)
  reconfirmed still present and correct — no regression.
- Read `authorize_view_teacher_load`/`authorize_capability` themselves
  (`src-tauri/src/auth/mod.rs:430-473`): both session-derived only, both
  do a fresh (non-cached) role lookup on every call, both fail closed.
- `node scripts/check-architecture.mjs` — PASS, zero restricted
  imports, across the whole delta.
- Migration chain (`src-tauri/src/db/migrations.rs`): `main` had 15
  `M::up(...)` entries, this branch has 18 — diffed and confirmed the
  3 new ones (16 RBAC, 17 Curriculum, 18 Teacher Load) are pure
  appends, no existing migration reordered or altered.
- `git diff main...HEAD -- src-tauri/Cargo.lock` — empty; zero
  dependency drift across all 30 commits.
- Curriculum/class-record/teacher-load conceptual model: `teaching_assignments`
  (who teaches what, year-long), `class_records` (term-scoped grading,
  carries `curriculum_version_id`), `curriculum_versions` (which
  curriculum content applies) — three genuinely separate concepts per
  ADR-0037/ADR-0039's own explicit "deliberately not linked" reasoning,
  re-confirmed by direct schema read, not just cited.

**No BLOCKING or SHOULD-FIX findings.** Real, non-self independent-review
debt for this specific cross-milestone integration-delta question
remains open — re-run `architecture-reviewer` once agent-resume
behavior is confirmed reliably working in a future session.

## Minimal CI Foundation: no CI configuration debt closed (2026-08-26)

The "no CI configuration exists yet" line carried in the entry below
this one (and in the Rust Formatting entry) is now **closed**. Full
decision record: `docs/adr/0041-minimal-ci-foundation.md`.
`.github/workflows/quality.yml` runs `npm run quality:full` verbatim
(the same canonical command a developer runs locally) on
`ubuntu-latest` and `windows-latest`, on `push`/`pull_request`/
`workflow_dispatch`, with `permissions: contents: read` only and no
secrets.

**Actually executed on GitHub Actions, not just written**: first real
run (32915080360) genuinely failed on the Ubuntu job — a real,
diagnosed environment gap, not a product defect: `ubuntu-latest`
doesn't ship the GTK/glib system libraries (`libwebkit2gtk-4.1-dev`
and friends) Tauri's Linux webview backend needs at compile time, so
`gobject-sys`/`glib-sys` failed their `pkg-config` build scripts. The
_same run_'s Windows job **passed** `npm run quality:full` end-to-end
on the first attempt, proving the workflow design itself was sound —
only the Ubuntu job's system-dependency list was incomplete. Fixed by
adding the exact `apt-get install` package list from Tauri's own
official prerequisites page (`v2.tauri.app/start/prerequisites/`,
fetched and quoted directly, not from memory or a blog). Re-pushed;
run 32916282825 is **green on both jobs** — Ubuntu `success` in
6m9s, Windows `success` in 17m17s, both real, both actually run, not
claimed.

**A second, genuine gate finding, caught by the same CI, not by
CI misconfiguration**: the docs-only commit recording this milestone's
own checkpoint (`ca4d40a`) itself failed `npm run quality:full` on
_both_ jobs — `prettier --check .` (part of `npm run quality`, which
`quality:full` runs first) flagged the newly-written/edited Markdown
files (this ADR, `CURRENT-HANDOFF.md`, `SOURCE-REGISTRY.md`,
`VERIFICATION-DEBT.md`) as not Prettier-formatted. This was a real gap
in this session's own process (docs edits were not run through the
local quality gate before pushing, unlike the code changes earlier in
this milestone) — not a CI configuration defect, and not weakened or
skipped: fixed with `npx prettier --write` on the four files, `npm run
quality:full` re-run clean locally before re-pushing, then reconfirmed
green on GitHub Actions (run recorded below).

Final confirmation run (32917911205, after the formatting fix) is also
**green on both jobs** — Ubuntu `success` in 7m18s, Windows `success`
in 17m41s.

**Debt closed**: no CI configuration existed → now exists and is
proven green on both target platforms with real evidence, including
two genuine findings caught and fixed by the CI itself (the Ubuntu
system-dependency gap, and this session's own docs-formatting gap) —
exactly the kind of finding a verification foundation exists to
surface, not something to be embarrassed by. **New, disclosed
limitations, not blocking this milestone's completion**: no caching
configured yet (deliberately deferred — first workflow kept simple per
this milestone's own scope discipline; revisit if runtime grows);
Android CI remains out of scope (a future extension, not a gap at this
milestone); a full `tauri build` installer/bundle step was evaluated
and deferred to a future release-workflow milestone, not this
verification-foundation one.

## Teacher Load `security-reviewer` re-run record: STALE, CORRECTED (2026-08-26)

The "Teacher Load's own `security-reviewer` re-run" line carried at the
bottom of the entry immediately below this one (and repeated in the
"Native Rust Verification Recovery" entry further down) is **stale
documentation, not genuine open debt**. Reconciled by inspecting Git
history and the current code, not re-dispatching a reviewer:

The line originally meant "the dedicated adversarial `security-reviewer`
pass scoped to the Teacher Load / Class Schedule Foundation milestone
itself failed to return retrievable findings (self-review substituted),
and no non-self review of that exact scope has re-run since." That was
accurate on 2026-08-25. It stopped being accurate once two later,
**successfully retrieved** independent reviews each touched and fixed
real issues in Teacher Load's actual security-sensitive surface:

1. **Native Rust Verification Recovery's `security-reviewer`**
   (2026-08-25, later the same day) — adversarial pass covering, among
   other things, `schedule_meeting.rs`'s `has_exact_duplicate` helper
   (introduced by this same recovery to fix the dead-code
   `CreateMeetingOutcome::Duplicate` bug). Found and the session fixed a
   real should-fix: the helper queried without a `school_id` predicate.
   Re-verified with `cargo test --lib schedule_meeting` (13/13) and
   `cargo clippy --all-targets -- -D warnings`. This is genuinely
   Teacher Load code (the conflict/duplicate-detection data-integrity
   half of the milestone), independently reviewed and fixed.
2. **RBAC Foundation `security-reviewer` closure review** (2026-08-26)
   — found and fixed a real cross-teacher schedule leak directly in
   `commands::teaching_assignment::list_schedule_meetings_by_assignment`:
   any Teacher-only session could reconstruct a colleague's full weekly
   schedule without ever passing `auth::authorize_view_teacher_load`,
   contradicting ADR-0039's own stated rule. This is the authorization
   half of Teacher Load, independently reviewed and fixed.

Between these two, both halves of Teacher Load's actual risk surface —
the authorization gate (`authorize_view_teacher_load` and every command
that must route through it) and the data-integrity/conflict-detection
SQL (`has_exact_duplicate` and its siblings) — have each been covered
by a real, non-self, successfully-retrieved independent review that
found and fixed a genuine issue. No single dispatch re-ran the
_original_ milestone's full adversarial checklist end-to-end in one
pass, so this is not "identical to redispatching the original review"
— but the practical exposure the debt entry existed to track is closed,
not merely time-passed-without-incident. **Per the CI milestone's own
instruction not to duplicate a completed review**: no new
`security-reviewer` dispatch was performed to produce this
reconciliation.

**Correction applied**: the stale "Teacher Load's own `security-reviewer`
re-run" line in the entry immediately below is struck through and
replaced with a pointer to this entry, rather than left to keep
resurfacing as apparently-open debt in future sessions.

## Rust Formatting + Quality Gate Normalization: `cargo fmt` debt closed, gate added (2026-08-26)

The ~265-diff pre-existing `cargo fmt` debt (recorded throughout this
file, e.g. the "Native Rust Verification Recovery" entry below) is
**closed**. Baseline re-measured, not assumed: `cargo fmt --check`
(rustfmt 1.9.0-stable, no `rustfmt.toml` — default config) showed 265
diff hunks across 35 first-party files (`src-tauri/src/**`,
`src-tauri/tests/**`; zero vendor/generated/`Cargo.lock` files
involved). Ran plain `cargo fmt` (mechanical, no manual edits) —
committed in isolation as `139c36d` (`style(rust): normalize rustfmt
formatting`), separate from the quality-gate wiring change (`8ee1187`,
`chore(quality): enforce rustfmt check`, which added `cargo fmt --check`
as the first Rust step in `npm run quality:full` and updated
`.claude/rules/testing.md`'s command reference to match).

**Semantic-free, rigorously proven, not merely asserted**: beyond
identical `cargo test`/`nextest`/`clippy`/`npm run quality` results
(below), every one of the 35 changed files was diffed with all
whitespace and rustfmt-inserted trailing commas stripped — 31 files
were then byte-for-byte identical; the remaining 4
(`db/migrations.rs`, `db/mod.rs`, `repository/mod.rs`,
`repository/assessment_item.rs`) were confirmed to differ only by
either a character-multiset-preserving `use` statement reordering
(import order is not semantic in Rust) or rustfmt's standard
brace-add/-remove around a single-expression closure/match arm body
(e.g. `\|r\| r.get(0)` vs `\|r\| { r.get(0) }` — a block containing one
expression is semantically identical to that expression alone). No
identifier, operator, string literal, or SQL text changed anywhere.
The security-sensitive `#[cfg(windows)]` DPAPI import gating in
`db/mod.rs` was spot-checked directly — the attribute stayed attached
to the correct `use` statement, only import order changed.

**Verification, all actually run this session** (identical results to
the pre-format baseline): `cargo fmt --check` PASS (was FAIL); `cargo
check --lib` PASS; `cargo test` PASS (342 lib tests + all integration
binaries, same counts as baseline); `cargo nextest run` PASS, 403/403;
`cargo clippy --all-targets -- -D warnings` PASS, 0 warnings; `cargo
build` (native) succeeds, only the pre-existing harmless OpenSSL
`LNK4099` PDB linker warnings; `npm run quality` PASS, 390/390; `npm run
quality:full` PASS end-to-end (confirms the new gate wiring — a
formatting failure would have stopped the chain before `cargo test`);
`git diff --check` clean; secret scan (`gitleaks`) **NOT RUN** — binary
still unavailable on `PATH`, not installed per project policy (same
limitation recorded throughout this file).

**Debt closed**: `cargo fmt` normalization (~265 diffs, all prior
entries below referencing this as open are now stale — see each
milestone's own record for what it covered); `cargo fmt --check` is now
part of `npm run quality:full`, closing the gap that let the debt
accumulate silently in the first place. **Debt still open, unrelated to
this milestone**: no CI configuration exists yet (the next recommended
milestone); `gitleaks` secret scan remains unavailable in this
environment; Teacher Load's own `security-reviewer` re-run (its code
has not changed since its self-review).

## Curriculum Foundation `architecture-reviewer` + RBAC Foundation `security-reviewer`: independent reviews actually completed and retrieved (2026-08-26)

Both previously-owed independent reviews (see the two "retrieval
failure, self-review substituted" entries below, 2026-08-25) were
re-dispatched against current code at HEAD `096dcfc` on branch
`claude/likha-sis-ux03-plan-plv80c`. Both completed and, this time,
their findings were successfully retrieved in full (the recurring
agent-resume/retrieval failure documented since M7 did not recur) by
resuming each agent via `SendMessage` and asking it to restate its
report as plain text rather than through `ReportFindings` (which
renders to a UI channel the orchestrating session can't read back).

**Curriculum Foundation `architecture-reviewer` — CLOSED.** No BLOCKING
findings. One SHOULD-FIX: `repository::curriculum.rs`'s
`default_version_id` doc comment overclaimed a guarantee
(`idx_one_default_curriculum_version` enforces _at most one_ default
row, not _at least one_ — a zero-default state is schema-reachable,
just not reached by any current production code path). Fixed by
correcting the doc comment to state the actual guarantee and the
`QueryReturnedNoRows` failure mode. Two items independently checked and
ruled FALSE-POSITIVE (subject identity via display string; a suspected
column-position drift in `row_to_class_record` after the new column was
added — indices re-verified correct by direct read). Four
NON-BLOCKING-FUTURE observations recorded for later milestones (no
`effective_from`/`effective_to` period columns yet; `key_stages`'
integer grade levels vs. `sections.grade_level`'s free-text type; the
same zero-default latent shape already exists for the pre-existing
`weight_policy_id` pattern this milestone mirrors). The reviewer also
flagged that `docs/VERIFICATION-DEBT.md`'s two prior "Rust unverified by
compiler" entries for this milestone (below) are now stale — `cargo
check --lib`/`cargo test` were confirmed clean and re-run live during
this review, not merely cited from the `caf850b` fix that resolved them.

**RBAC Foundation `security-reviewer` — CLOSED, one SHOULD-FIX applied.**
No BLOCKING findings. Both previously-fixed regressions were confirmed
still intact by direct code read: `add_user_to_school`'s self-grant gap
(`authorize_school_membership_grant`, `auth/mod.rs:351-361`) and the
Teacher Load cross-school view leak (`authorize_view_teacher_load`,
`auth/mod.rs:423-442`), each with its regression test still present.
One SHOULD-FIX, confirmed exploitable via exposed Tauri commands
bypassing the UI entirely: `commands::teaching_assignment::list_teaching_assignments_by_section`
(intentionally open, school-scoped reference data — unchanged) combined
with `list_schedule_meetings_by_assignment` (previously gated only by
`require_active_school_scope`, no teacher-identity check) let any
Teacher-only session reconstruct any colleague's full weekly schedule
(weekday/time/room) without ever passing `auth::authorize_view_teacher_load`,
contradicting the rule `docs/adr/0039-teacher-load-class-schedule-foundation.md:120-124`
states. Fixed by resolving the assignment's `teacher_user_id` via
`teaching_assignment::find_by_id_in_school` and gating on
`authorize_view_teacher_load` before returning meetings — the same
pattern the sibling commands `list_teacher_assignments`/`get_teacher_load`
already used (`src-tauri/src/commands/teaching_assignment.rs`). No new
command-layer regression test was added — this codebase has no
command-layer test infrastructure at all (confirmed: zero `#[test]`
functions exist under `src-tauri/src/commands/`); all authorization
logic in this codebase is tested at the `auth::mod`/repository layer,
where `authorize_view_teacher_load`'s existing tests (including the
cross-school-denial case) already cover the gate this fix now wires in.
Two NON-BLOCKING-FUTURE observations recorded (SELECT-then-act schedule
overlap checks have no backing DB constraint, theoretically racy only
across two separate OS processes writing the same SQLite file
concurrently — the single in-process `Mutex<Connection>` already
prevents in-process interleaving; `register_user` remains callable by
any authenticated session regardless of role, the surviving harmless
half of the historical two-command self-grant chain now that
`add_user_to_school` is closed). One FALSE-POSITIVE ruled out
(`create_school`/`list_schools` being unauthenticated — confirmed
structurally unreachable for privilege escalation, per
`docs/adr/0004-authentication-and-local-session.md:89-99`).

**Verification after both fixes** (all actually run this session):
`cargo check --lib` PASS; targeted tests (`auth::`, `curriculum::`,
`teaching_assignment::`, `schedule_meeting::`, 81 tests) PASS; full
`cargo test` PASS (342 lib tests + all integration binaries, 0 failed);
`cargo clippy --all-targets -- -D warnings` PASS, 0 warnings; `npm run
quality` PASS, 390/390; `cargo fmt --check` — 265 pre-existing diffs
across the crate (consistent with the ~264 baseline already recorded
below; neither touched file's newly-added lines are among the diffs —
confirmed by cross-referencing line numbers), not corrected in this
milestone per explicit instruction to leave formatting cleanup for its
own follow-up milestone; `git diff --check` clean; secret scan (`gitleaks`)
**NOT RUN** — binary unavailable on `PATH` in this environment, per
project policy not installed solely to complete this review milestone
(same limitation previously recorded for `quality:security`).

**Debt closed**: Curriculum Foundation `architecture-reviewer` review,
RBAC Foundation `security-reviewer` review (both entries below remain as
historical record of the earlier retrieval-failure attempts, marked
superseded rather than deleted). **Debt still open, unrelated to this
milestone**: Teacher Load's own `security-reviewer` re-run (see the
entry immediately below — that milestone's code did not change since
its self-review, so re-running it was correctly out of this milestone's
scope per the directing instruction); `cargo fmt` normalization (~265
diffs); no CI configuration exists yet; `gitleaks` secret scan remains
unavailable in this environment.

## Teacher Load / Class Schedule Foundation: Rust unverified by compiler, `security-reviewer` retrieval failure, two self-caught bugs (2026-08-25)

`cargo check --lib` was attempted once against this milestone's new
code (migration 18, `repository::teaching_assignment`,
`repository::schedule_meeting`, `auth::Capability::ManageTeachingAssignments`/
`authorize_view_teacher_load`, `commands::teaching_assignment`) and
failed identically to every prior reproduction — `windows-future`
0.3.2 vs. `windows-core` 0.62.2, unchanged root cause. Per this
milestone's own instruction, not retried further. Notably, this failure
occurs while compiling a transitive dependency, **before this crate's
own source is type-checked at all** — meaning there is zero compiler
signal on this milestone's new Rust, not even partial. All of it is
written and manually reviewed, not compiler-verified.

`security-reviewer` was dispatched for an adversarial pass on the new
authorization (`authorize_view_teacher_load`) and data-integrity logic
(conflict detection, `INSERT OR IGNORE` review). It completed real work
(19 tool uses, ~80K tokens across two attempts) but returned no
retrievable findings text on the initial attempt or one retry — the
same recurring agent-resume/retrieval failure documented since M7, now
hit for the fourth time this session alone (Curriculum Foundation's
`architecture-reviewer`, RBAC's and this milestone's `security-reviewer`).
Per the established protocol, a rigorous self-review was substituted.

**Two real, non-theoretical bugs were caught and fixed during this
milestone's own TDD/self-review, before the (failed) independent review
was even dispatched**:

1. `authorize_view_teacher_load`'s first draft authorized a School Head
   to view any `target_teacher_user_id` based solely on holding the
   `ManageTeachingAssignments` role in their own school — never checking
   that the _target_ teacher actually belongs to that school. Caught by
   the test `authorize_view_teacher_load_denies_a_school_head_from_a_different_school`
   before it was ever committed. Fixed by adding
   `user_repo::is_member_of_school(conn, target_teacher_user_id, &school_id)?`
   to the check.
2. `schedule_meeting::create`'s first draft used `INSERT OR IGNORE` for
   its final insert with no Rust-side `weekday` range validation — the
   same class of bug as the RBAC milestone's `role::grant()` mistake,
   which this project's own `local-database` skill already documented
   as a lesson. An out-of-range `weekday` would have silently reported
   `CreateMeetingOutcome::Duplicate` instead of the real error, since
   `OR IGNORE` swallows any constraint violation on the statement, not
   just the intended `UNIQUE` conflict. Fixed: explicit `(0..=6)` range
   check in Rust, `INSERT ... ON CONFLICT (...) DO NOTHING` instead of
   `OR IGNORE`. A third, related gap found in the same self-review pass
   (a time missing its leading zero, e.g. "8:00", would pass numeric
   parsing but fail the schema's `GLOB` shape check, surfacing as a raw
   database error instead of a clean `InvalidTime` outcome) was also
   fixed, with a regression test for each.

Self-review beyond the two fixes above also traced: tenant isolation
(`school_id` is session-derived only throughout; `section_id`/
`subject_id`/`teacher_user_id` are validated against it before any
write); conflict-detection SQL correctness (the half-open-interval
overlap condition and lexicographic "HH:MM" string comparison were
verified correct by hand, including the adjacent-non-overlapping edge
case); absence of a TOCTOU window (every command holds one
`Mutex<Connection>` guard for its full duration, serializing all
DB-touching commands globally, the same guarantee every other command
in this codebase already relies on); derived-load correctness (no
stored total exists anywhere in the schema); and command-layer
architecture (every `commands::teaching_assignment` handler is a thin
lock+authorize+single-repository-call wrapper, no business logic in the
Tauri layer).

**No further blocking findings.** Real, non-self independent-review
debt remains open for this milestone — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future
session.

## RBAC Authorization Corrective Gate: `security-reviewer` retrieval failure, self-review substituted (2026-08-25)

`security-reviewer` was dispatched for an adversarial pass on the
`add_user_to_school` fix (see the entry below). It completed real work
(7 tool uses, ~61K tokens) but returned no retrievable findings text —
the same recurring agent-resume/retrieval failure documented since M7,
hit twice already this session (Curriculum Foundation's
`architecture-reviewer`, Codex-plugin-cc research's `deped-researcher`).
One retry via `SendMessage` was sent per this project's established
protocol; per the same protocol, a rigorous self-review was performed
rather than waiting further.

Self-review traced exactly the 10 adversarial questions the dispatched
review was asked: (1) `add_user_to_school` never reads or writes the
caller's own roles, only the target `user_id`'s — no self-escalation
path. (2) `role::grant(&conn, &user_id, &school_id, role::TEACHER)`
passes the literal `TEACHER` constant, not a parameter — no path to
grant a different role via this command. (3) The cross-school
`current_school != school_id` check is unchanged, downstream of the new
capability check. (4) The whole command holds one `Mutex<Connection>`
guard for its full duration (`lock_db(&db)` at the top, held to the end
of the function) — no TOCTOU window, consistent with every other command
in this codebase. (5) `school_id` is checked against the trusted
session, never blindly accepted; `user_id`'s lack of restriction is
unchanged, pre-existing, intentional design (an FK-enforced existence
check only), not part of this defect. (6) Grepped every production
caller of `user::add_school_membership`/`role::grant` in
`src-tauri/src` — only `bootstrap_installation` (already correct) and
`add_user_to_school` (the fixed defect) — no bypass path exists
elsewhere. (7) The `Capability::ManageLearners` match arm is untouched;
only a new arm was added. (8) Re-read the new/updated test bodies:
`..._blocks_a_session_scoped_to_a_different_school` now grants the
caller School Head in their own school before attempting the
cross-school call, correctly isolating that check from the role check;
`..._denies_a_registrar_only_session` correctly isolates the role check
alone. (9) No other membership/role-mutating command exists in this
codebase at all (confirmed via a full grep of `src-tauri/src/commands/`).
(10) The legitimate School Head case is explicitly tested and asserted
`.is_ok()`.

**No blocking findings.** Real, non-self independent-review debt for
this specific fix remains open — re-run `security-reviewer` once
agent-resume behavior is confirmed reliably working in a future session.

**SUPERSEDED (2026-08-26)** — see this file's top entry: an independent
`security-reviewer` review was successfully dispatched and retrieved
against current code, covering this fix among others. Debt closed.

## Curriculum / Key-Stage Versioning Foundation: `architecture-reviewer` retrieval failure, self-review substituted (2026-08-25)

`architecture-reviewer` was dispatched to review the new curriculum
schema/repository code for architecture leakage and data-integrity
correctness. It completed real work (33 tool uses, ~67K tokens) but
returned no retrievable findings text — the same recurring agent-resume/
retrieval failure documented since M7 (also hit this session by
`deped-researcher`, see below). One retry via `SendMessage` was sent per
this project's established protocol; per the same protocol, a rigorous
self-review was performed rather than waiting further or retrying again.

Self-review covered exactly what the dispatched review was asked to
check: (1) confirmed via `git diff --stat` that zero files under `src/`
(TS/UI) were touched this milestone — no curriculum/key-stage hardcoding
is possible in the frontend because there is no frontend code touching
this concept at all yet. (2) Re-read `resolved_curriculum_version_id_in_school`
directly: a single generic `COALESCE(cr.curriculum_version_id, dcv.id)`
lookup with no branching on curriculum name/id anywhere — the same shape
`resolved_weight_policy_id_in_school` already uses. (3) Confirmed
`key_stages` has no foreign key to `curriculum_versions` at all (deliberate,
per the ADR's reasoning that Key Stage banding is curriculum-independent).
(4) Re-read the migration SQL literally: `CHECK (min_grade_level <=
max_grade_level)` on `key_stages`, `curriculum_learning_areas.curriculum_version_id`
is `NOT NULL REFERENCES curriculum_versions(id)`, `idx_one_default_curriculum_version`
is a `UNIQUE INDEX ... WHERE is_default = 1` (the same structural pattern
already proven for `grading_policies`/`grading_weight_policies`, not a
new mechanism). (5) Traced historical-stability directly: `create()`
always resolves `curriculum_version_id` to a concrete, non-null value
before insert (explicit-and-validated, or auto-resolved-then-stored) —
so `COALESCE` never falls through to `dcv.id` (today's default) for any
row created via `create()`, only for a genuinely pre-existing/legacy row
with a literal `NULL` column value; confirmed no code path can rewrite an
already-stored `curriculum_version_id` after creation. (6) Grepped for
`OR IGNORE` in the new migration/repository code — zero occurrences (the
RBAC-milestone lesson was not repeated). (7) Confirmed `curriculum_versions`/
`key_stages`/`curriculum_learning_areas` carry no `school_id` column at
all (global reference data, matching `grading_weight_policies`), and that
`class_record::create`'s new parameter follows the exact same "not
tenant data, existence-check only" pattern already established for
`weight_policy_id` — no cross-school leak path exists.

**No blocking findings.** Real, non-self independent-review debt for this
milestone remains open — re-run `architecture-reviewer` once agent-resume
behavior is confirmed reliably working in a future session.

**SUPERSEDED (2026-08-26)** — see this file's top entry: an independent
`architecture-reviewer` review was successfully dispatched and retrieved
against current code. Debt closed.

## Curriculum / Key-Stage Versioning Foundation: Rust unverified by compiler, `deped-researcher` failure (2026-08-25)

`cargo check --lib` was re-run against this milestone's new migration/
repository code and failed identically to every prior session's
reproduction (`windows-future` 0.3.2 vs. `windows-core` 0.62.2 — see the
entry below, unchanged root cause). This milestone's new Rust
(`key_stages`/`curriculum_versions`/`curriculum_learning_areas` migration
and tests, `repository/curriculum.rs`, `class_record.rs`'s
`curriculum_version_id` plumbing) is therefore **written and manually
reviewed, not compiler-verified or test-run**. `npm run quality`
(390/390), `check:architecture`, `check:dev-preview-isolation`, and
`knip` were all actually re-run and are clean — this milestone's changes
are Rust-only, so TS-side verification is a real, if partial, signal.

`deped-researcher` was dispatched to verify MATATAG curriculum
rollout/Key-Stage facts and returned no retrievable findings on the
initial attempt; one retry via `SendMessage` (this project's established
protocol) also returned "No new content" — the same recurring
agent-resume/retrieval failure documented since M7, now confirmed on
this agent type too. Direct `WebSearch`/`WebFetch` was substituted
instead of a third attempt, and produced usable, triangulated (though not
fully primary-source-verified — `deped.gov.ph` itself is blocked by this
environment's network egress policy) findings — see
`docs/SOURCE-REGISTRY.md`'s new entry for exactly what was and wasn't
confirmed. Periodically retry `deped-researcher` in a future session once
the harness appears healthy, per the project's standing reviewer-failure
rule.

**STALE (2026-08-26)** — the "Rust unverified by compiler" half of this
entry no longer reflects repository state: `caf850b` (2026-08-25, later
the same day) fixed the `windows`-crate target-gating root cause. `cargo
check --lib`/`cargo test` were confirmed clean and re-run live during
this session's `architecture-reviewer` closure review (see this file's
top entry). The `deped-researcher` retrieval-failure record above stays
accurate and open.

## Wave 1A RBAC Foundation: `security-reviewer` findings — one fixed, one pre-existing gap recorded (2026-08-25)

Independent `security-reviewer` review of the new RBAC gate was dispatched
and returned real, substantive findings before hitting a session-limit API
error partway through a follow-up exchange (not the usual agent-resume
retrieval failure documented elsewhere in this file — the review itself
completed and reported). Two findings:

1. **Fixed.** `repository::role::grant()` used `INSERT OR IGNORE`, which
   silently swallows a `CHECK` constraint violation (not just the intended
   primary-key conflict) — an unrecognized role would have been a silent
   no-op instead of the error the function's own doc comment and the
   `grant_rejects_an_unrecognized_role` test require. Independently
   reproduced against real SQLite before trusting the reviewer's claim
   (`INSERT OR IGNORE` on a `CHECK`-violating row: 0 rows affected, no
   exception; `INSERT ... ON CONFLICT(...) DO NOTHING` on the same row:
   raises `CHECK constraint failed` as expected — conflict resolution only
   suppresses the named conflict target, not an unrelated `CHECK` failure).
   Fixed by switching to `ON CONFLICT (user_id, school_id, role) DO
NOTHING`. Not yet re-verified by an actual `cargo test` run — `cargo`
   still cannot compile in this environment (see the `windows-future`
   entry below) — verified instead by reproducing the exact SQLite
   semantics in isolation, and the fix is a one-line, easily-inspectable
   change.
2. **Fixed (2026-08-25, RBAC authorization corrective gate)** —
   originally: `commands::user::add_user_to_school`
   only checked that the caller has an active session scoped to the same
   `school_id` being granted into (`auth::authorize_school_membership_grant`)
   — it did not check the caller's _role_ at all, so any
   authenticated member of a school (Teacher included) could add a new
   colleague. **Confirmed exploitable end-to-end**, not merely
   theoretical: any authenticated session could call `register_user`
   (itself only requires an active session, any role — returns the new
   account's `user_id`) then `add_user_to_school` (same school, any
   role) to self-grant that fresh account membership. Grepped every
   production caller of `user::add_school_membership`/`role::grant`
   (`src-tauri/src/auth/mod.rs`'s `bootstrap_installation` and
   `src-tauri/src/commands/user.rs`'s `add_user_to_school` — the only
   two; `bootstrap_installation` was already correctly gated, reviewed
   under ADR-0036) — no other vulnerable path existed. Fixed by adding
   `Capability::ManageSchoolMembership` (School Head only, deliberately
   excluding Registrar as the conservative choice — onboarding a new
   school member is treated as a School Head personnel responsibility,
   not bundled into Registrar's enrollment/records scope) and routing
   `authorize_school_membership_grant` through the existing
   `authorize_capability` gate, the same pattern every other
   capability-checked command already uses. Six regression tests added/
   updated in `src-tauri/src/auth/mod.rs` proving: School Head succeeds;
   Teacher-only denied (the exact defect); no-role-at-all denied;
   Registrar-only denied; cross-school denied (fixture corrected to
   grant the caller School Head first, isolating the cross-school check
   from the role check); role revoked mid-session denied on the very
   next call. Not yet re-verified by `cargo test` — blocked by the
   unrelated pre-existing `windows-future` conflict below; independent
   `security-reviewer` dispatched for an adversarial pass. Still not
   reachable from any UI (unchanged).

## UX-04 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-04's `ClassRecordWorkspace.tsx`/`ClassRecordsScreen.tsx`
changes (2026-08-25) and hit the same recurring agent-resume/retrieval
failure documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
and the identical UX-02/UX-03 entries below): each did real work
(teacher-ux: 31 tool calls across two attempts; accessibility: 31 tool
calls across two attempts) but returned no retrievable findings text,
on both the initial dispatch and one permitted retry. A rigorous
self-review was substituted and found and fixed one real, must-fix
accessibility gap: every assessment item's "Edit"/"Delete" buttons
shared the same accessible name across the whole list, with nothing
distinguishing which item a given pair belonged to for a screen-reader
user (fixed with a named `role="group"`, matching the pattern this
file's own Excused/N/A buttons already used correctly) — recorded in
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.
This did not block completing UX-04, but the owed independent reviews
themselves are still open debt. Retry both in a future session once
there's reason to believe the agent-resume harness issue is fixed;
remove this entry once real (non-self) reviews actually complete and
their findings are recorded.

## Rust toolchain cannot compile in this environment: `windows-future`/`windows-core` version conflict (RESOLVED 2026-08-25 — Native Rust Verification Recovery)

**Closed.** Root cause was not a lockfile/version-mismatch (the two
`windows` package instances in `Cargo.lock` were each internally
self-consistent, per `cargo tree` reverse-dependency evidence gathered
this session) — it was that LIKHA's own `src-tauri/Cargo.toml` declared
`windows = { version = "0.62.2", ... }` **unconditionally**, forcing
`windows-future`'s Windows-only COM/async code to compile on every host
including this Linux dev container, exactly as the "deeper structural
cause" paragraph below had already predicted. Fixed by moving `windows`
to `[target.'cfg(windows)'.dependencies]` and `#[cfg(windows)]`-gating
`mod dpapi;`/`DpapiKeyStore` in `crypto/mod.rs`, with `db::open_app_db`
split so the `#[cfg(not(windows))]` path fails closed rather than
opening an unprotected database. Zero `Cargo.lock` changes were needed.
See `docs/adr/0040-windows-only-dependency-target-gating.md` for full
detail, evidence, and the 10-scenario decision record.

**Verified this session, actually run (not claimed):** `cargo check
--lib` (clean, 0 warnings/errors), `cargo test` (338 lib tests + all
integration test binaries, 0 failures), `cargo clippy --all-targets --
-D warnings` (0 warnings), `npm run quality` (typecheck/lint/format/
architecture/vitest all green, 390 TS tests). Restoring real compiler
signal exposed and fixed three genuine pre-existing bugs, none of which
had ever been caught because no Rust compile/test had ever actually
succeeded on this branch:

1. A type-inference ambiguity in
   `class_record::find_detail_by_id_in_school` (`Err(e.into())` — three
   competing `From<rusqlite::Error>` impls in scope made `?`'s target
   type unresolvable). Fixed: `Err(AppError::from(e))`. No behavior
   change.
2. `schedule_meeting::create`'s `CreateMeetingOutcome::Duplicate` was
   dead code — an exact-duplicate meeting submission always shares its
   teacher with itself, so `has_teacher_conflict` always fired first
   and `Duplicate` could never actually be returned, despite a
   dedicated regression test (`create_rejects_an_exact_duplicate_meeting`)
   asserting it should. Fixed by adding a `has_exact_duplicate` check
   that runs before the conflict checks.
3. Four `assessment_item` tests (`delete_refuses_an_item_that_already_
has_a_recorded_score`, `list_by_class_record_reports_recorded_and_
total_eligible_counts`, `rename_changes_the_name_even_when_the_item_
already_has_a_recorded_score`, `update_rejects_a_category_or_max_
score_change_once_the_item_has_a_recorded_score`) called
   `learner_score::record(..., "teacher-1")` with a literal string that
   was never a real row — always violating `learner_scores.recorded_by_
user_id REFERENCES users(id)` once FK enforcement actually ran.
   These four tests had never passed under real execution. Fixed by
   creating a real `user::create_user(...)` row first, matching the
   pattern `learner_score.rs`'s own tests already use correctly.

**New debt discovered by this recovery, not yet closed:** `cargo fmt
--check` was run for the first time this session (it was never wired
into `npm run quality:full`, only `cargo test` + `cargo clippy` are) and
found ~264 pre-existing formatting diff hunks across most of the crate,
entirely unrelated to this fix. Not corrected here — a whole-crate
reformat is out of this recovery milestone's scope (risk of unrelated
diff noise across every Rust file). Recommend a dedicated, low-risk
follow-up: run `cargo fmt` once crate-wide in its own commit, then add
`cargo fmt --check` to `quality:full` so it can't silently drift again.

**Independent review: COMPLETE, no recurring retrieval failure this
time.** `security-reviewer` was dispatched for an adversarial pass on
the crypto/key-store boundary change (`Cargo.toml` target-gating,
`crypto/mod.rs`, `db/mod.rs`'s fail-closed non-Windows path) plus the
three bug fixes above, and returned real, retrievable findings on the
first attempt (16 tool uses, ~63K tokens) — breaking this session's
recurring agent-resume/retrieval-failure streak (hit 4 times previously:
Curriculum Foundation's `architecture-reviewer`, RBAC's and Teacher
Load's `security-reviewer`).

**Verdict: no blocking issues.** Confirmed independently (not merely
re-asserted from this session's own claims): `dpapi.rs` has zero diff
lines and the Windows `open_app_db` body is byte-identical to before —
purely a compilation-gating change, no Windows-path behavior change;
the sole production call site of `open_app_db` is `src-tauri/src/lib.rs`'s
`setup()`, called with `?` so startup aborts on `Err` — no path lets a
non-Windows host run commands against an unprotected key store;
`AppError::key_store(...)` serializes only to the generic
`"key_store_error"` string, no detail leak across IPC; `windows::` usage
is confined to `dpapi.rs`; the unrelated bug fixes
(`class_record.rs`/`schedule_meeting.rs`/`assessment_item.rs`) were
independently checked and confirmed correct; neither of this project's
two previously-shipped failure classes (unauthenticated bootstrap self-
grant; check-then-act singleton race) recurs, since `auth::
bootstrap_installation` is untouched by this diff.

**One should-fix (non-blocking), applied same session**: the new
`has_exact_duplicate` helper in `schedule_meeting.rs` queried without a
`school_id` predicate — not exploitable given `create()` already
resolves `teaching_assignment_id` through a school-scoped lookup first
and assignment ids are UUIDv7 (not cross-tenant guessable), but
recommended as defense-in-depth. Fixed immediately: `school_id` is now
threaded through `has_exact_duplicate`'s query, matching every other
conflict-check helper in this file. Re-verified after the fix:
`cargo test --lib schedule_meeting` (13/13 pass) and
`cargo clippy --all-targets -- -D warnings` (0 warnings).

**Closed.** No independent-review debt remains from this milestone.

No repository history below this point is deleted — kept for the full
diagnostic trail that led to the correct root cause:

### Original open-debt record (pre-resolution, kept for trail)

`cargo check --lib` (and therefore `cargo test`/`cargo build`/`cargo
clippy`) fails in this session's Linux dev environment on a pre-existing,
unrelated dependency conflict: `Cargo.lock` locks both `windows-core`
0.61.2 and 0.62.2, and both `windows-future` 0.2.1 and 0.3.2,
simultaneously. Building `windows-future` 0.3.2 then fails with several
`cannot find function/type ... in module windows_core::imp` errors (a
transitive Windows-target crate expecting symbols only the other locked
version provides). Confirmed via `cargo update -p windows-future`, which
refuses ("specification is ambiguous") without a version qualifier this
session deliberately did not supply, since forcing a Cargo.lock/Cargo.toml
change is outside any single UI milestone's scope and risks
side effects on an unrelated dependency tree. Not caused by, and not
fixable from, any `.rs` source file changed in UX-04 (only source files
were touched, never the manifest/lockfile). All UX-04 Rust changes
(`assessment_item.rs`'s `rename`/`update`/`delete`, `class_record.rs`'s
`item_count`/`recorded_count`/`total_eligible`) were verified instead by
careful manual review — signatures, SQL correctness, fail-closed-on-
`None` conventions, and the logic of each new test — not by an actual
compile/test run. Resolve by pinning a single consistent
`windows-future`/`windows-core` pair (a deliberate dependency decision,
not a drive-by fix) in a session where that's the explicit task, then
re-run `cargo test`/`cargo clippy --all-targets -- -D warnings` for every
milestone whose Rust changes accumulated while this was broken.

**Root cause actually reproduced and diagnosed, Wave 1A RBAC Foundation
(2026-08-25)** — this milestone's own task explicitly required reproducing
this blocker rather than continuing to cite it secondhand. `cargo check
--lib` and `cargo test --lib` were both actually run and both fail at the
identical point: `windows-future` 0.3.2 cannot compile — it references
`windows_core::imp::IMarshal`, `windows_core::imp::marshaler`, and
`windows_threading::submit`, none of which exist in the `windows-core`
0.62.2 / `windows-threading` 0.2.1 versions the lockfile actually pairs it
with. `git log -p -- Cargo.lock` confirms this dual-version lock existed
since the very first Cargo.lock commit (`e237e00`, M0) — nothing this
project has done introduced it. The deeper structural cause: `Cargo.toml`
declares `windows = { version = "0.62.2", ... }` **unconditionally** (no
`[target.'cfg(windows)'.dependencies]` section exists in this manifest at
all), and `src-tauri/src/crypto/dpapi.rs` (`mod dpapi;` in `crypto/mod.rs`,
used unconditionally by `db::mod.rs`'s `DpapiKeyStore`) is not gated behind
`#[cfg(windows)]` either — so this crate is structured to require a
functioning Windows API binding on every platform it's built on, including
this Linux dev container, regardless of whether the specific
windows-future/windows-core version pair matches. Even a corrected,
mutually-compatible `windows`/`windows-future`/`windows-core` version set
would still only fix the _compile_ error — DPAPI's actual Win32 calls
(`CryptProtectData`/`CryptUnprotectData`) have no Linux implementation to
link against, so a real fix likely also needs `#[cfg(windows)]` gating on
`dpapi.rs` and a target-specific `windows` dependency, which is a genuine
architecture change (how the crate is structured per-platform, and what a
non-Windows dev/CI build does for `KeyStore` — a stub, a different
`KeyStore` impl, or simply "this crate cannot build outside Windows,
accept that and provision only Windows CI/dev machines"). Per this
milestone's explicit instruction, this is **not** decided or implemented
here — recorded as the reproduced blocker, its exact chain, and evidence;
the corrective action (a real architecture decision, not a drive-by fix)
is deferred to a session where that's the explicit task.

## `playwright-cli` browser mismatch in this environment — workaround exists (open, session-specific)

`playwright-cli open` (any browser argument) failed in this session with
either "Chromium distribution 'chrome' is not found" or "Browser
'chrome-for-testing' is not installed... expected executable at
/opt/pw-browsers/chromium-1237/..." — the pinned `@playwright/cli`
version's expected browser build does not match what's actually
pre-installed at `/opt/pw-browsers` (chromium-1194) in this environment.
Workaround used successfully this session: bypass `playwright-cli`
entirely and drive the `playwright` npm package directly from a small
script, launching with `chromium.launch({ executablePath:
"/opt/pw-browsers/chromium" })` — this produced real, correct browser
screenshots (see `docs/adr/0034-class-records-assessments-score-entry-grade-output.md`'s
Verification section) and caught two genuine layout bugs jsdom-based
tests could not. Future sessions hitting the same `playwright-cli`
failure should use this workaround rather than concluding no
browser-rendered verification is possible.

## UX-03 teacher-ux-reviewer / accessibility-reviewer independent review not retrievable (open)

Both `teacher-ux-reviewer` and `accessibility-reviewer` were dispatched
against UX-03's `AttendanceScreen`/`MonthlySummaryScreen` changes
(2026-08-25) and hit the same recurring agent-resume/retrieval failure
documented since M7 (see `docs/adr/0027-audit-timestamp-readability-fix.md`,
UX-02's identical entry below): each did real work (teacher-ux: 31 tool
calls across two attempts; accessibility: 21 tool calls across two
attempts) but returned no retrievable findings text, on both the
initial dispatch and one permitted retry. A rigorous self-review was
substituted (recorded in `docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`'s
"Independent review" section) and found and fixed one real teacher-UX
gap (the "Mark all present preserves existing marks" reassurance was
Guided-mode-only; now shown in every mode) — so this did not block
completing UX-03, but the owed independent reviews themselves are still
open debt. Retry both in a future session once there's reason to
believe the agent-resume harness issue is fixed; remove this entry once
real (non-self) reviews actually complete and their findings are
recorded.

Things that are believed correct but not yet verified by the specific
means listed — because this environment/session lacked the tool, device,
or hardware. This is **not** a bug backlog; move an item here only when
the underlying work is otherwise done and reviewed, and remove it once
the missing verification actually happens (record what ran and when).

## UX-02 accessibility-reviewer independent review not retrievable (open)

`accessibility-reviewer` was dispatched against UX-02's rewritten
`TeacherWorkspaceScreen.tsx` (2026-08-25) and hit the same recurring
agent-resume/retrieval failure first documented in
`docs/adr/0027-audit-timestamp-readability-fix.md`: both the initial
dispatch and one permitted retry (asking it directly to resend its
findings) returned only an empty completion notice, never any actual
findings content. A rigorous self-review was substituted (recorded in
`docs/adr/0032-teacher-workspace-polish.md`'s "Independent review"
section) and found no blocking issue, so this did not block completing
UX-02, but the owed independent accessibility review itself is still
open debt. Retry in a future session once there's reason to believe the
harness issue is fixed; remove this entry once a real review actually
completes and its findings are recorded.

## Native visual / screen-reader inspection (open)

No browser/screenshot/rendering tool was available in the sessions that
built M0–M6. Structural/accessibility correctness was verified via React
Testing Library + `axe-core` (see `src/test/a11y.ts`) and computed WCAG
contrast ratios from actual hex values — not by looking at the rendered
UI. A human visual pass (does it look premium/comfortable, not just
structurally valid?) and a real screen-reader pass (NVDA/Narrator) on the
compiled app are still owed for every screen shipped so far
(`LoginScreen`, `LearnerListScreen`, `FirstRunSetupScreen`, `AppShell`).

## Browser-pane dev-server port was misconfigured — fixed 2026-08-25 (closed)

`.claude/launch.json` declared the dev server's port as `5173`, but
Vite/Tauri's actual `devUrl` is `1420`. This silently broke every
Browser-pane `navigate` attempt against the running dev server across
at least two sessions (the "navigation ... was denied or failed" note
recorded in earlier handoffs was this misconfigured port, not a tool
limitation). Fixed in `docs/adr/0030-ui-first-program-and-ux00.md`.
With the fix, Browser-pane DOM/text/console verification against
`vite dev` genuinely works, and — once the user displays the Browser
pane panel client-side — pixel-level screenshot capture works too
(confirmed in `docs/adr/0031-design-system-and-app-shell.md`: `LoginScreen`
screenshotted at three viewports, two color schemes, three teacher
modes).

## Authenticated (post-login) screens are pixel-verified via a dev-only fixture — closed 2026-08-25 (closed)

The browser-only `vite dev` server has no live Tauri IPC bridge, so
nothing past `LoginScreen` could be reached through a real login. UX-01
(`docs/adr/0031-design-system-and-app-shell.md`) ran a 10-scenario
decision on how to close this and selected a dev-only synthetic
fixture, deferring its construction to whichever milestone first
genuinely needed it. UX-02
(`docs/adr/0032-teacher-workspace-polish.md`) built it as its first
implementation slice: `src/dev-preview/` — a fully separate Vite entry
never registered in the production build input, a production
throw-guard in its `main.tsx`, and fixture repositories whose
auth-related methods throw unconditionally, with two independent
automated isolation proofs (a fast source-text test plus a built-`dist`
scan). `TeacherWorkspaceScreen` and `AttendanceScreen` were genuinely
screenshotted and interacted with through it at three viewports, two
color schemes, and all three teacher modes this session — the first
real pixel evidence of an authenticated LIKHA-SIS screen in this
program. This closes the gap for the screens the fixture wires
(Workspace, Attendance, Sign-in Activity); each remaining UX milestone
(UX-03 through UX-06) should extend the same fixture to wire its own
screens rather than rebuilding the safety architecture, and should
still consider the native `@wdio/tauri-service` pilot below for the
Tauri-IPC-specific behavior no browser-only fixture can prove.

## Playwright CLI coverage is browser-only, not native-binary (open)

`@playwright/cli` (adopted per `docs/SOURCE-REGISTRY.md`) can only drive
`vite dev`/browser-rendered UI. It cannot attach to the compiled Tauri
webview, so it never exercises the actual native binary, the Tauri IPC
bridge, or Windows-specific WebView2 behavior. Do not treat a green
Playwright run as native-binary verification.

## Native Tauri WebDriver E2E (planned, not yet built out)

`@wdio/tauri-service` was identified as the current official path for
real native-binary E2E on Windows (embedded WebView2 provider, no paid
CrabNebula dependency required on Windows). Only a single pilot smoke
test (launch app → confirm bootstrap/login screen renders → close
cleanly) was scoped for the harness upgrade, not a full E2E suite. Expand
coverage only as UI stabilizes — building it out while screens are still
moving quickly would create ongoing maintenance drag disproportionate to
the milestone stage.

## Android verification (deferred, out of current scope)

LIKHA-SIS targets Windows first, Android later. Nothing Android-specific
has been built or verified. This is expected at the current milestone,
not a gap to close yet — revisit when Android work actually starts.

## Recovery scenarios needing real hardware (open)

The DPAPI-protected key store (`docs/adr/0003-encryption-at-rest.md`) has
unit-test coverage for wrong-key/no-key rejection, but recovery behavior
across a real Windows user-profile change, a different physical machine,
or DPAPI key rotation has not been exercised on real hardware/accounts —
only within a single test process on one machine.
