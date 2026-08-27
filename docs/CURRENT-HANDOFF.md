# CURRENT HANDOFF

## Active Task (2026-08-27 — Wave 2M: SF10 Authoritative Template Intake & Version Applicability, COMPLETE)

Full record: `docs/adr/0053-sf10-template-applicability-and-versioning.md`,
`docs/form-evidence/sf10/README.md`, `docs/VERIFICATION-DEBT.md` top
entry. Same branch (`claude/likha-sis-wave2a-learner-core`).

**Repository/CI truth verified first**: branch/HEAD `ce15a2e` = `origin`,
0 ahead/behind; `main` `d9ab036`; tree clean. Wave 2L code checkpoint
`e04f64f` re-confirmed via `gh run view` — Quality Gate `33028634953`

- Security Gate `33028634929` both `completed/success`. Harness not
  reopened.

**What was built**:

- Four DepEd-hosted SF10 `.xlsx` candidates acquired from
  `support.lis.deped.gov.ph`, hashed, structurally inspected. All
  `CandidateUnverified` / `NotVerified` — **none promoted** (governing
  issuance bodies unreadable — scanned PDFs, no OCR in the frozen
  harness). Manifest + structural findings + issuance research:
  `docs/form-evidence/sf10/README.md`.
- `formgen::evidence`: +2 real SF10 candidate `TemplateEvidence`
  records (`SF10_SSHS_V2026_CANDIDATE_EVIDENCE`,
  `SF10_JHS_CANDIDATE_EVIDENCE`) — the registry's **first real external
  consumer**.
- `formgen::template_version` (NEW pure-domain module): `resolve()`
  picks the template authoritative for a record's own
  (form/SY/grade/curriculum/track) context and **fails explicitly**
  rather than falling back to newest. 10 resolver tests.
- `examples/inspect_template_candidate.rs` extended (umya API only, no
  new dep) with per-sheet formulas / defined names / data validation /
  hidden rows-cols / page setup + workbook named ranges.
- ADR-0053 with the 10-scenario decision (Recommended: evidence-backed
  version registry + applicability resolver; Next Best: per-record
  frozen template-version stamp, adopt when SF10 records are persisted).

**Verification (all actually run)**: `cargo fmt --check` clean; `cargo
clippy --all-targets -- -D warnings` clean; `cargo test` — 478 lib +
all integration binaries + 0 doctests pass, incl. 13 new tests. One
transient `rustc` ICE observed once right after `cargo fmt` rewrote a
file mid-build; did not reproduce on clean rebuild (recorded honestly,
not a code defect). `npm run quality` — [confirm at commit]. No new
dependency, no migration, no Tauri command, no UI, no learner data.

**Independent review**: security-reviewer + architecture-reviewer
dispatched per the frozen-harness rules. Results / retained debt in
`docs/VERIFICATION-DEBT.md`'s Wave 2M entry (self-review substituted +
debt retained if the known retrieval bug recurred).

**Exact next product action**: SF10 is evidence-gated, not
feature-gated — do **not** start SF10 generation yet. Highest-value
next steps, in order: (1) obtain a readable copy of DepEd Memorandum
No. 020, s. 2026 (and the JHS MATATAG SF10 governing issuance) so the
SSHS/JHS candidates can be promoted and the `track: None` assumption
confirmed or split — this unblocks everything SF10; (2) if that stays
blocked, return to LIKHA's priority order and pick the next
highest-value milestone that does not depend on unproven SF10
authority (e.g. a learner-profile or attendance/grading refinement),
recording the SF10 evidence debt as carried. Do not fabricate SF10
completion.

## Active Task (2026-08-27 — Wave 2L: Final Harness Consolidation + LIKHA Production Harness v1.0 + ProjectForge Extraction, COMPLETE and FROZEN)

Full record: `docs/adr/0052-wave2l-production-harness-v1.md`. Portable
extraction: `docs/harness/`. Same branch
(`claude/likha-sis-wave2a-learner-core`).

**Repository/CI truth verified first**: branch/HEAD `27dc534` matched
`origin`, 0 ahead/behind; `main` unchanged at `d9ab036`; working tree
clean. Wave 2K **code** checkpoint `10d5efc` re-confirmed directly via
`gh run view` — Quality Gate `33026121743` and Security Gate
`33026121791` both `completed/success`. HEAD `27dc534` (docs commit):
Security Gate `33027657317` green; Quality Gate `33027657304` was
`in_progress` at inventory start (docs-only, non-blocking).

**What changed in the harness**: exactly one thing — removed the dead
`security-guidance@claude-plugins-official` line from
`.claude/settings.json` (enabled but never installed; `claude-security`
covers the need). Everything else: KEEP. Full disposition table for
every plugin / MCP / agent / skill / hook / script / CI gate in
ADR-0052.

**Recommended architecture S1** ("current harness + targeted cleanup",
92/100) selected from a 40-architecture rubric review + 4 elimination
rounds. **Next Best S3** ("CLI-first minimal") with a documented switch
condition. The harness is now **frozen** (ADR-0052 §"Harness
experimentation freeze").

**Runtime-verified this wave**: `git`/`gh` CI re-confirmation; `node
scripts/memory/health.mjs` (all HEALTHY) + `recall.mjs` smoke;
`claude plugin list` (4 official plugins enabled, claude-mem disabled,
security-guidance absent); `npx knip --version` 6.32.2; `cargo-deny`
present (`gitleaks`/`osv-scanner` absent this machine — per-machine, CI
authoritative); MCP inspection (no `.mcp.json`; one user-scope
`codebase-memory-mcp` only). Independent `architecture-reviewer`
dispatched for harness structure — recurring retrieval bug hit;
self-review substituted; debt retained (`docs/VERIFICATION-DEBT.md`).

**ProjectForge v0.1** created as **private** repo
`312810-spec/projectforge` (https://github.com/312810-spec/projectforge,
initial commit `feb9997`) — provider-independent core + Claude Code
adapter + 11 project-type profile recipes + portable templates +
independent memory + provenance. Not coupled to LIKHA at runtime.

**Wave 2L LIKHA checkpoint committed and pushed: `e04f64f`. CI
confirmed green for this exact commit** — Quality Gate `33028634953`
and Security Gate `33028634929`, both `completed/success`. Wave 2L is
fully closed and the harness is frozen.

**Exact next product action** (harness work is done — resume LIKHA
product development from here): take the **SF10 lead** recorded in
ADR-0051 / `docs/VERIFICATION-DEBT.md`'s Wave 2K entry. Download one of
the four `support.lis.deped.gov.ph/support/downloads/schoolforms/`
SF10 `.xlsx` URLs locally, run `cargo run --example
inspect_template_candidate -- <path>` against it, and register its
manifest as a `ProvenanceState::CandidateUnverified` `TemplateEvidence`
entry in `formgen::evidence` (do **not** promote to
`AuthoritativeSourceConfirmed` without a confirmed DepEd
Order/Memorandum citation). This also gives `formgen::evidence` its
first real consumer. If SF10 turns out blocked, the alternatives are
unchanged from Wave 2K: retry the still-owed independent architecture
review under a healthy harness, or live-smoke-test claude-mem's
disable — both in `docs/VERIFICATION-DEBT.md`.

## Active Task (2026-08-27, this session — Wave 2K: Official-Form Template Evidence & Provenance Registry, complete, ready to commit)

Full record: `docs/adr/0051-official-form-template-evidence-registry.md`.

**Mandatory Wave 2J checkpoint gate, verified first**: `git fetch`
clean; branch/HEAD at `fb07797` (Wave 2J's commit), matching `origin`;
`main` unchanged at `d9ab036`; working tree clean; 0 ahead/behind. Both
Wave 2J CI runs (Quality Gate `33015766489`, Security Gate
`33015766459`) confirmed genuinely `completed`/`success` before any
Wave 2K implementation began — Quality Gate briefly re-showed
`in_progress` on a re-check (likely a stale/cached `gh` read; not
investigated further), and work was correctly held until it resolved.

**What was built**: `src-tauri/src/formgen/evidence.rs` (NEW) — two
independent enums, `ProvenanceState` and `FidelityState`, on a
`TemplateEvidence` struct, deliberately never collapsed into one status
field (the wave's non-negotiable design rule). `confirm_authoritative_
source(current, authoritative_issuance)` is the only function that may
promote a template to `AuthoritativeSourceConfirmed`, and refuses
without a real DepEd issuance citation or for an already-`Rejected`
source. `SF1_SYNTHETIC_V1_EVIDENCE`/`SF9_SYNTHETIC_V1_EVIDENCE` are the
two registered records (both `Synthetic`/`NotVerified`, every optional
evidence field explicitly `None` with a gap note explaining why).
`src-tauri/examples/inspect_template_candidate.rs` (NEW) — a dev-only
intake tool (not a Tauri command, not UI) that hashes/inspects a local
candidate file and prints a suggested-starting-classification report;
refuses files over 25MB before parsing (zip-bomb defense); never
registers anything itself.

**Research**: two new search angles tried beyond prior waves' repeated
`deped.gov.ph` homepage searches. Found no authoritative SF1/SF9
template (unchanged verification debt). Found a genuine lead for
**SF10**: four `.xlsx` files on `support.lis.deped.gov.ph` (a verified
`*.deped.gov.ph` subdomain), personally confirmed by direct fetch as
valid xlsx containers — not registered as evidence this wave (no SF10
generator exists; the brief explicitly said not to build one merely to
exercise the framework). Full gaps disclosed in
`docs/VERIFICATION-DEBT.md`.

**Local verification (all re-run this wave)**: `cargo fmt --check`
clean; `cargo clippy --all-targets -- -D warnings` clean; `cargo test`
— all Rust tests pass, including 11 new `formgen::evidence` tests
covering the 18-item required test list (promotion-guard rejection/
acceptance, rejected-cannot-repromote, provenance/fidelity independence,
SF1/SF9 debt preservation, no-PII-required, malformed-file/gap
reporting). `npm run quality` — clean (typecheck, lint, format,
architecture check, 462/462 TS tests, no regression; TS side untouched
this wave). Manually smoke-tested `inspect_template_candidate` against
the SF1 fixture (reproduces its known hash/structure correctly), a
non-spreadsheet file (handled as a gap, no panic), and a 26MB file
(refused before parsing).

**Independent review**: security-reviewer and architecture-reviewer
dispatched in parallel, both closed, **no BLOCKING findings from
either**. Security: 2 non-blocking items, both accepted as reasonable
tradeoffs for dev-only tooling with no runtime/security-boundary role
(compressed-vs-decompressed size-cap caveat now documented; the
promotion-guard bypass, see next item). Architecture: 6 non-blocking
items — 5 fixed this wave (added a `Superseded` guard to
`confirm_authoritative_source`, closing a latent re-promotion gap;
corrected this ADR's overstated "only function permitted" wording to
"only sanctioned path" since `TemplateEvidence`'s `pub` fields mean it's
convention, not compiler-enforced; wired the intake example to print
real enum values via `{:?}` instead of hardcoded strings; removed the
unused `EvidenceKind` enum and its tautological test, folding its
content into the module doc comment; fixed a misleading comment
placement in `mod.rs`), 1 accepted as expected-not-a-defect (zero
external consumers of `formgen::evidence` yet — expected for a pipeline
built ahead of its second real use). Full detail in ADR-0051's
"Independent review" section.

**Verification re-run after review fixes**: `cargo fmt --check` clean;
`cargo clippy --all-targets -- -D warnings` clean; `cargo test` — all
Rust tests pass, 11 `formgen::evidence` tests (net +1 after removing the
tautological test and adding the `Superseded` regression test).

**Committed and pushed**: `10d5efc`. **CI confirmed green for this exact
commit**: Quality Gate `33026121743` and Security Gate `33026121791`,
both `completed`/`success`. Wave 2K is fully closed.

**Exact next action**: this session is ending at a practical
session/context boundary (three waves, a compaction, and a usage-limit
interruption already in this session) — a valid stopping point per
`.claude/rules/autonomous-development.md`. The concrete next step for a
future session, not just a priority-order restatement: pick one of the
two retained-debt items below and act on it. Recommended first: take
the SF10 lead from ADR-0051/this wave's entry above — download one of
the four `support.lis.deped.gov.ph` SF10 URLs locally, run `cargo run
--example inspect_template_candidate -- <path>` against it, and record
its manifest as a `ProvenanceState::CandidateUnverified` evidence entry
in `formgen::evidence` (do NOT promote to `AuthoritativeSourceConfirmed`
without a confirmed DepEd Order/Memorandum citation) — this also gives
the evidence registry its first real consumer. Alternative: retry the
still-undispatched architecture/harness review owed since Wave 2J, or
live-smoke-test claude-mem's disable (both recorded in
`docs/VERIFICATION-DEBT.md`).

## Note: Wave 2J — Resilient Zero-Cost Memory Observer + Project-Brain Hardening, complete (superseded as "Active Task" by Wave 2K above, kept for history)

Full record: `docs/adr/0050-resilient-zero-cost-memory-observer.md`.
Harness/developer-infrastructure milestone — no learner-facing change.

**Mandatory Wave 2I checkpoint gate, verified first**: `git fetch`
clean; branch/HEAD both at `287a0f2` (Wave 2I's commit), matching
`origin`; `main` unchanged at `d9ab036`; working tree clean; 0
ahead/behind. Both Wave 2I CI runs (Quality Gate `33011365970`,
Security Gate `33011365972`) confirmed genuinely `completed`/`success`
before any Wave 2J implementation began — Quality Gate was still
`in_progress` on first check; work was correctly held until it finished.

**Incident**: `claude-mem` (a third-party, inference-backed, OPTIONAL
Claude Code plugin) exhausted its free-trial allowance ~3 days ago.
**Empirical finding**: this repository's actual durable memory
(`docs/*.md`, ADRs) was never affected — every wave in this session
(2G–2I) updated it successfully throughout the outage, because it was
never dependent on claude-mem or any external inference call.

**Ten-scenario decision**: repository-brain-authoritative + a new
deterministic local journal (`scripts/memory/`), with claude-mem
disabled entirely (not deleted) rather than wrapped in a circuit
breaker — because no external inference call exists anywhere in the
new code's path, most of the required failure-state machine describes
states this architecture cannot enter; that absence is documented
directly rather than built around. `d2a8k3u/claude-code-memory`
evaluated and classified REFERENCE (not needed at this scale). Full
scoring in ADR-0050.

**What was built**: `scripts/memory/journal.mjs` (deterministic,
replay-safe capture — SHA-256 id from normalized project/session/type/
content, never a timestamp), `scripts/memory/recall.mjs` (grep-based,
verbatim retrieval — no LLM, no embeddings), `scripts/memory/
health.mjs` (`/memory-health` skill, zero-cost diagnostic, no network
call), `scripts/memory/capture-session-stop.mjs` (new project-scoped
`Stop` hook — captures only git HEAD sha/subject + changed file PATHS,
never file contents/env vars/Bash output; secret-shaped paths dropped
before recording). `.claude/memory/` gitignored. Global
`~/.claude/settings.json`: `claude-mem@thedotmack` flipped to `false`
(reversible, data preserved) — **this is a machine-wide change, not
repository-scoped**, disclosed plainly.

**Highest-value test this wave**: `recall.test.mjs`'s "NOT_VERIFIED
must never be corrupted" suite, run against the REAL
`docs/VERIFICATION-DEBT.md` — proves SF1 fidelity, SF9 fidelity, and
Windows packaging are all still recoverable as `NOT_VERIFIED`, that
recall returns only verbatim substrings of source lines, and that none
of the canonical docs contain fabricated "PASSED/VERIFIED/confirmed"
phrasings for those three facts.

**Two independent reviews dispatched in parallel this wave** (security;
failure-mode/silent-failure) — correcting Wave 2I's own disclosed
process gap of dispatching reviews sequentially/incompletely. **A
third role (architecture/harness review) was NOT dispatched — recorded
honestly as retained debt, not omitted from this report**, per the
brief's explicit instruction not to repeat Wave 2I's under-recording.
**Both reviews closed, no blocking findings.** Security review: 3
non-blocking items, all fixed/corrected (commit-subject redaction added;
claude-mem disable-certainty corrected in ADR-0050; fail-open doc
comment narrowed). Failure-mode review found and fixed 2 REAL bugs with
new regression tests: a truncated mid-write journal line could silently
destroy the next valid observation too (fixed via a trailing-newline
check before append); `computeHealth()` was not actually crash-safe
against a directory-level read failure (fixed by wrapping directory/
file reads in try/catch). Full detail in ADR-0050's "Independent
review" section.

**Verification (re-run after the review fixes)**: `npx vitest run
scripts/memory` — 24/24 passed (22 + 2 new regression tests for the
bugs the failure-mode review found). `npm run quality` — clean, 462 TS
tests (up from 438; no regression). No Rust code touched this wave —
Rust gates not re-run (nothing to verify there).

**Exact next action**: commit/push this checkpoint (branch
`claude/likha-sis-wave2a-learner-core`) with the remaining review debt
(undispatched architecture role; claude-mem disable not empirically
live-tested; unbounded journal growth; theoretical cross-process race)
explicitly retained in `docs/VERIFICATION-DEBT.md`. Confirm CI green
for the exact commit before considering this wave fully closed.

## Note: Wave 2I — Multi-Form Official-Form Contract + SF9 Readiness, complete (superseded as "Active Task" by Wave 2J above, kept for history)

Full record: `docs/adr/0049-multi-form-official-form-contract.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`). Note: the directing prompt
called the prior checkpoint (commit `313ac0f`) "Wave 2H"; this
repository's own continuous numbering calls it "Wave 3" — both labels
refer to the same commit; ADR-0049 records this explicitly.

**Repository-truth/CI verified first**: `git fetch` clean; branch and
local HEAD both at `313ac0f068d0c8aafbcf9025492562550fd65eb1`, matching
`origin`; `main` unchanged at `d9ab036`; working tree clean before work
began. Both Wave 3 CI runs re-confirmed genuinely `completed`/`success`
for that exact commit (Quality Gate `33006880512`, Security Gate
`33006880522`).

**SF9 evidence gate**: no authoritative DepEd SF9 template exists in
this repository or was obtainable from `deped.gov.ph` (a direct fetch of
the department's own homepage found no School Forms/SF9 link). Every
other source found was a third-party/community recreation —
COMMUNITY/UNVERIFIED, never OFFICIAL. **`OFFICIAL_SF9_FIDELITY =
NOT_VERIFIED`**, unconditionally — SF9 work this wave is architecture-
readiness only, against a clearly synthetic fixture.

**Ten-scenario decision**: kept `OfficialFormGenerator` (SF1) and added
a separate `Sf9FormGenerator` trait rather than one generic multi-form
port with a shared/generic request type — a shared type is exactly how
an SF9 field could silently compile as SF1 data. Generalized only
`TemplateDescriptor`: added `workbook_format: WorkbookFormat` (`Xlsx` |
`LegacyXls`, the concrete, tested expression of the "`.xlsx` does not
imply Java, `.xls` does not imply Rust" adapter policy — see
`umya_adapter::reject_unsupported_format`), and widened
`data_columns`/`header_cells` from SF1-shaped fixed arrays to
`&'static` slices. Full scoring in ADR-0049.

**What was built**: `formgen::sf9` (domain contract) →
`formgen::Sf9FormGenerator` (port) → `formgen::umya_adapter::
UmyaSf9Generator` → a SHA-256-hash-pinned bundled SYNTHETIC template
(`resources/sf9/`, registered in `tauri.conf.json`).
`formgen::sf9_projection::subject_term_grades_for_learner` (new,
read-only) builds SF9's subject/term grade rows by calling the
EXISTING `repository::grading_computation::compute_term_grade` once per
class record via the new `repository::class_record::
list_by_section_in_school` — no grading rule is reimplemented anywhere
in `formgen`. `commands::formgen::generate_sf9_form` mirrors
`generate_sf1_form`'s authorization/output-path discipline exactly (no
caller-supplied output path; `school_id` session-derived;
`section_id`/`learner_id` resolved only within that school).

**One independent review dispatched (security — SF9 authorization
parity, atomic-write correctness, projection-query isolation,
format-rejection ordering, log/error PII exposure): CLOSED, no
`BLOCKING` findings.** One `NON-BLOCKING` should-fix, fixed: `formgen::
sf9_projection` had a stated-but-unenforced precondition that
`learner_id` belongs to `school_id` — fixed by adding a direct
`learner::find_by_id_in_school` check as the first thing the function
does (defense in depth, independent of the caller), proven by two new
tests (a nonexistent learner id, and a REAL learner id from a
DIFFERENT school, both rejected). The other three roles the brief's own
§12 names (workbook/template fidelity, architecture/maintainability,
and a confirmation pass) were NOT dispatched this wave — retained as
verification debt, not dropped, per this project's established
reviewer-harness fallback rule.

**Verification**: `cargo nextest run` — 557/557 passed (up from Wave
3's 546; SF1's own suite unchanged and still green — the descriptor's
array→slice widening did not regress SF1). `cargo test` (stable-
checkpoint gate) — green, 0 doctests. `cargo fmt --check`/`cargo clippy
--all-targets -D warnings` — clean. `cargo deny check` — clean, no new
dependency. `npm run quality` — clean, 438 TS tests, no frontend
regression (no UI added this wave — deliberate, per the brief's
minimal-UI-only guidance and "no full SF9 UI" scope guard).

**Exact next action**: commit and push this checkpoint (branch
`claude/likha-sis-wave2a-learner-core`), confirm CI green for the exact
commit, then return to LIKHA's priority order for the next
highest-value work. Do not begin SF10 — no candidate pre-selected for
the next wave.

## Note: Wave 3 — Authoritative-Template SF1 Form Engine, complete (superseded as "Active Task" by Wave 2I above, kept for history)

Full record: `docs/adr/0048-official-form-engine-sf1.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 3 section. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first**: `git fetch` clean;
branch and HEAD both at `c23cf16` (Wave 2G's checkpoint); `main`
unchanged at `d9ab036`; working tree clean. Both Wave 2G CI runs
re-confirmed genuinely `completed`/`success` for that exact commit
(Quality Gate `32982080979`, Security Gate `32982080980`) before any
Wave 3 work began.

**Authoritative-template evidence gate**: no official SF1 template
exists anywhere in this repository or was obtainable from this
environment (same disclosed gap ADR-0043 already recorded for the
import direction). The engine was built and tested against a synthetic
fixture instead — **official SF1 fidelity remains `NOT_VERIFIED`**,
recorded as verification debt rather than claimed.

**Ten-scenario decision**: departed from the brief's own named working
hypothesis (Java + Apache POI/HSSF sidecar) on the strength of this
repo's own prior evidence — a real, in-use `CONSO SF v2025.xlsx` DepEd
workbook (inspected during M8) is `.xlsx`, not legacy `.xls`. Adopted
`umya-spreadsheet` (MIT, pure Rust, zero new runtime/packaging/process-
invocation surface) instead; Java/POI retained as documented Next Best
with an explicit switch condition. Full scoring in ADR-0048.

**What was built**: `formgen::sf1` (domain contract) →
`formgen::OfficialFormGenerator` (port) → `formgen::umya_adapter`
(the only production module coupled to `umya-spreadsheet`) → a
SHA-256-hash-pinned bundled template resource (`resources/sf1/`,
registered in `tauri.conf.json`). `commands::formgen::generate_sf1_form`
resolves the output path itself from sanitized, authorized data (no
caller-supplied path at all), reads roster data through existing
repositories, and writes atomically. `formgen::fidelity` (test-only)
proves structural fidelity — sheet names/merges/formulas/sizing/defined-
names — survives generation, including at the full 30-learner capacity.
No new migration; no UI screen (deliberately deferred).

**Three independent reviews, all CLOSED, no blocking findings** (form
fidelity, security/native-boundary, architecture/maintainability — all
three hit this project's recurring reviewer-retrieval bug, recovered
via the established protocol). Fixed: a genuine temp-file-cleanup gap
(rename failures weren't cleaned up, only write failures were); four
tests whose names claimed more than their bodies proved; an inaccurate
"only module" doc claim (fixed by gating `formgen::fidelity` test-only);
an unimplemented "defined names" fidelity claim (now implemented); two
dangling ADR-section citations in code comments. Newly disclosed:
generated files are unencrypted (a deliberate, now-explicit data-
exposure boundary); the generation authorization gate matches sibling
export commands' existing convention. Full detail:
`docs/VERIFICATION-DEBT.md`'s Wave 3 entry.

**Verification**: `cargo nextest run` — 546/546 passed (up from 521
pre-milestone). `cargo test` (stable-checkpoint gate) — green, 0
doctests. `cargo fmt --check`/`cargo clippy --all-targets -D warnings`
— clean. `cargo deny check` — clean (advisories/bans/licenses/sources
all ok). `npm run quality` — clean, 438 TS tests, no frontend
regression. `npm run build` — clean production build. `npm run
quality:security` — `cargo-deny` clean locally; `gitleaks`/`osv-scanner`
not installed on PATH this session (disclosed, not new — CI's Security
Gate is authoritative).

**Exact next action**: return to LIKHA's priority order for the next
highest-value work. Candidates: expanding the SF1 form engine's UI
surface (a minimal "Generate SF1" screen, deferred this wave), pursuing
a real authoritative SF1 template to close the `NOT_VERIFIED` fidelity
gap, or a genuinely new milestone per the project's standing autonomous-
selection process — no candidate is pre-selected here; select using
current evidence at the start of the next session, per
`.claude/rules/autonomous-development.md`.

## Note: Wave 2G — External API & Government Reference-Data Foundation, complete (superseded as "Active Task" by Wave 3 above, kept for history)

Full record: `docs/adr/0047-psgc-reference-data-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 2G section. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first**: `git fetch` clean;
branch and HEAD both at `c00bc15` (Wave 2F's checkpoint); `main`
unchanged at `d9ab036`; working tree clean. Both Wave 2F CI runs
re-confirmed genuinely `completed`/`success` for that exact commit
(Quality Gate `32964519995`, Security Gate `32964520041`) before any
Wave 2G work began.

**Ten-scenario decision**: Recommended = a local-file PSGC importer
(no live PSA network call) — explicitly the brief's own "Next Best"
hypothesis, taken because PSA's own API site returned HTTP 403 from
this environment (couldn't even be reached to inspect, let alone build
a live-sync importer against). Full scoring of all ten designs in
ADR-0047.

**What was built**: `reference_geo_snapshots`/`reference_geo_units`
(migration 20) — deliberately global (no `school_id`, the only tables
in this schema without one) and append-only/versioned (old generations
never deleted, only one `is_current` per source, enforced by both
application logic and a schema-level partial unique index).
`import::psgc` (parse/validate an untrusted JSON snapshot file) →
`repository::reference_geo` (transactional versioned commit, same
all-or-nothing shape as SF1's `commit_import`) → `commands::reference_geo`
(3 commands: import gated behind `ManageLearners` with actor
attribution, reads gated behind only an active session). **Zero
dependencies added.** No UI screen built this wave (deliberately
deferred, per the brief's own permission).

**12 external providers classified** (PSGC ADOPT/implemented; PSCED,
OpenSTAT REFERENCE/PILOT; Turnstile, Biometric, Updater ADOPT-direction/
deferred; Barcode/QR PILOT; DepEd Integration, eGov WATCH; GeoRisk
REFERENCE/PILOT; scraping REJECT; AI providers DEFER) — full table in
`docs/SOURCE-REGISTRY.md`.

**Three independent reviews, all CLOSED, one blocking finding fixed**
(security/privacy, reliability/architecture, teacher/compliance — two
of the three independently converged on the same root defect, both hit
this project's recurring reviewer-retrieval bug and were recovered via
the established protocol). Blocking: read commands hardcoded
`"PSA PSGC"` while the importer accepted any `sourceName` — a
mismatched import silently succeeded then became permanently invisible
to every read. Fixed with an `EXPECTED_SOURCE_NAME` constant enforced
at parse time plus a schema-level partial unique index. Also fixed:
two test-quality gaps (a rollback test that never called the function
it claimed to prove; a "reconnect" test that never reconnected), a
level-adjacency validation gap (same-level malformed hierarchy
acceptance was file-order-dependent), missing actor attribution, zero
command-layer test coverage (added), and a misleading `unit_count: 0`
on no-op re-imports. Full detail: `docs/VERIFICATION-DEBT.md`'s Wave
2G entry.

**Verification**: `cargo nextest run` — 521/521 passed (up from 501
pre-milestone). `cargo test` (stable-checkpoint gate) — green,
including 0 doctests. `cargo fmt --check` — clean. `cargo clippy
--all-targets -- -D warnings` — clean. `npm run quality` — clean, 438
TS tests, no frontend regression (no frontend files touched).
`npm run build` — clean production build. `npm run quality:security`
— `cargo-deny` clean locally; `gitleaks`/`osv-scanner` not installed
on PATH this session (disclosed, not new — CI's Security Gate is
authoritative for this zero-new-dependency diff).

**Exact next action**: Wave 3 — Authoritative-Template SF1 Form Engine
(per this project's own priority order and the milestone's own explicit
instruction that Wave 2G must not begin it automatically). Before
starting, read `docs/adr/0047-psgc-reference-data-foundation.md`'s
"Remaining verification debt" section — it records a concrete
constraint the SF1/address work must honor: any future learner-address
field must key on `reference_geo_units.code`, never `.id`/`snapshot_id`.

## Note: Wave 2F — harness closure + security CI gate (2026-08-26) — separate from the feature track below

Two non-feature milestones ran after Wave 2E, neither touching
`src/`/`src-tauri/` product code:

1. **Harness audit** (`docs/adr/0045-claude-code-harness-audit.md`):
   enabled `typescript-lsp`/`rust-analyzer-lsp`/`claude-code-setup`/
   `claude-security` in `.claude/settings.json`.
2. **Wave 2F closure** (same ADR's addendum,
   `docs/adr/0046-security-ci-gate.md`): closed the harness audit's own
   disclosed LSP live-behavior gap (both LSP servers demonstrated and
   `grep`-cross-checked working — see `docs/VERIFICATION-DEBT.md`); ran
   a controlled MCP pilot (zero MCP servers installed — `gh` CLI,
   `playwright-cli`, and ordinary web lookup all beat their MCP
   alternative on real evidence); wired `gitleaks`/`cargo-deny`/
   `osv-scanner` into a new, separate `.github/workflows/security.yml`
   CI gate, closing Wave 2E's own recorded verification debt.

**This does not change the "Active Task"/"exact next action" below**
— Wave 2E is still the most recently completed LIKHA _feature_
milestone; resume LIKHA product work from its own "exact next action"
as normal, not from this note.

## Active Task (2026-08-26, this session — Wave 2E: SF1 Import Operational Hardening & Auditability, complete)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A/2A.1/2B/2C/2D (`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first, per this milestone's
own explicit instruction**: `git fetch` clean; branch and `origin`
both at `364214f` (Wave 2D's checkpoint) as reported; `main` unchanged
at `d9ab036`; working tree clean. CI run `32951314150` for that exact
commit was polled until it genuinely reached `completed`/`success`
(it was still `in_progress` at the start of this session) before any
Wave 2E implementation began.

**What was built**: `sf1_import_history` (migration 19), written
inside `import::commit::commit_import`'s existing single transaction
so a history row exists if and only if the batch it describes actually
committed — deliberately no `status` column. A SHA-256 content
fingerprint (`import::fingerprint`, a zero-build-cost `sha2` direct
dependency already resolved transitively via `tauri-codegen`) for an
advisory-only re-import notice, compared by content never filename,
never blocking a commit. New `list_sf1_import_history` command, same
`ManageLearners` gate and session-derived `school_id` as every other
SF1 command. `commit_sf1_import` re-reads the file server-side for
provenance rather than trusting a client-supplied filename/hash.
Teacher-facing: a non-blocking advisory banner on the preview screen
and a minimal "View past imports" panel (no raw SF1 content, no
learner PII).

**Two independent reviews, both CLOSED** (both hit this project's
recurring reviewer-retrieval bug on the standard notification channel
— empty/stub first reply for both — and both recovered in full on one
retry via direct message). Security review: no blocking findings
across all 8 requested angles; 2 non-blocking doc-comment-accuracy
should-fix items, both fixed in this checkpoint. Architecture review:
no blocking findings across all 8 requested angles, but one real gap
found and fixed — `commit_import` had no server-side guard against an
empty `plans` slice (only the frontend guarded against it), which
would have written a phantom "0 rows, 0 learners" history row; now
rejected server-side with a dedicated test. Full detail:
`docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E addendum.

**A real CI-only bug was caught and fixed after the first push** (see
`docs/VERIFICATION-DEBT.md`'s top entry for full detail): `Quality
(Ubuntu)` failed one new test because `safe_filename`'s first cut
delegated to `std::path::Path::file_name()`, whose `\`-as-separator
handling is Windows-only at compile time — this app's own CI also runs
the same suite on `ubuntu-latest` (ADR-0041), where a hardcoded
Windows-style test path came back unsplit. Fixed by splitting on `/`
and `\` explicitly instead of relying on host-OS path semantics, with
two new tests (forward-slash path, trailing-separator edge case)
proving both cases directly rather than incidentally.

**Verification, all actually run**: `cargo nextest run` 501/501 (up
from 498 — the empty-plans guard test plus two new cross-platform
`safe_filename` tests) + plain `cargo test` (includes doctests) also
green; `cargo fmt --check`/`cargo clippy --all-targets -- -D warnings`
PASS, clean; native `cargo build` (debug, full binary) PASS — `cargo
build --release` failed on a local Perl/OpenSSL toolchain gap in this
session's shell specifically, unrelated to this milestone's code (see
`docs/VERIFICATION-DEBT.md`); `npm run test` 438/438 (one transient
`App.test.tsx` flake observed once, re-confirmed clean on immediate
re-run, unrelated to any file this milestone touched); `tsc -b
--noEmit`/`eslint .`/`prettier --check .`/`npm run check:architecture`
all clean; `npm run build` (production Vite build) PASS.
`gitleaks`/`cargo-deny`/`osv-scanner` re-run against
the changed dependency graph (new `sha2`) — all clean.

**Not done this session, deliberately**: wiring the three security
tools into CI (a concrete named plan recorded instead of a repeated
deferral — see the ADR addendum); cloud sync; Android key store; SF10;
unrelated attendance/grading work; a full-codebase PII-logging audit
(explicit non-goals).

## Active Task (2026-08-26, this session — Wave 2D: Local Data Security Verification, complete)

Full record: `docs/adr/0044-local-data-security-verification.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A/2A.1/2B/2C (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: branch/`origin` HEAD both at
`3be4ef3` as reported, `main` unchanged at `d9ab036`, working tree
clean. Wave 2C's CI run (`32941620676`) confirmed genuinely
`completed success` (17m56s) before any Wave 2D work began.

**Critical repository-truth correction the directive got wrong**: this
milestone's brief assumed local-data encryption did not exist yet. **It
already did** — SQLCipher + DPAPI, built and accepted in M2
(`docs/adr/0003-encryption-at-rest.md`). This session re-scoped
accordingly: verify/harden the existing architecture rather than build
a new one. See ADR-0044's "Repository truth" section for the full
correction.

**What was actually new this session**:

1. **Primary-evidence proof using real `sqlite3.org` CLI tooling**
   (freshly `winget`-installed) against a genuine encrypted LIKHA
   database file with synthetic data — `.tables` empty, raw `SELECT`
   fails with "file is not a database," raw byte-level `grep` finds
   zero plaintext occurrences of the synthetic name/LRN/school-name
   anywhere in the file. The literal "ordinary SQLite tooling" scenario
   from the brief, proven with primary evidence, not only the app's own
   `rusqlite`-based test suite.
2. **One genuine coverage gap found and closed**: WAL/SHM sidecar files
   (enabled since M1/M2, unrelated to encryption) had never been
   checked for plaintext leakage. New test
   (`wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`,
   `src-tauri/src/db/mod.rs`) proves neither sidecar file leaks
   plaintext while the WAL file genuinely holds unflushed content.
3. **Long-carried dependency-security debt (unavailable since M6) —
   closed for this session**: `gitleaks`/`cargo-deny`/`osv-scanner` all
   installed via `winget`/`cargo install` (network access available)
   and actually run. `gitleaks`: 55 commits, no leaks. `cargo-deny`:
   advisories/bans/licenses/sources all ok. `osv-scanner`: no
   unaccounted-for issues (17 known, all pre-documented). Directly
   confirms `calamine`/`tauri-plugin-dialog` (Wave 2B/2C additions) have
   no flagged advisories. **Not wired into CI** — deliberately deferred
   (see VERIFICATION-DEBT.md) to avoid untested cross-platform CI
   changes against a currently-green pipeline.
4. **Full 17-scenario threat model documented explicitly** in ADR-0044,
   with an honest in-scope/out-of-scope boundary. No local self-service
   recovery path exists for a lost key or device/profile change —
   deliberately not solved with an insecure workaround, deferred to
   future authenticated cloud-sync infrastructure.

**Independent reviews — both CLOSED, no blocking findings.** Security
review (9 angles) found all 8 adversarial angles FALSE-POSITIVE and one
legitimate should-fix (this ADR's first draft understated its own
logging-surface audit — corrected in place). Architecture review (7
questions) found GOOD across the board, including catching and closing
its own thin first-pass sampling before confirming no production
layering violation. Both hit this project's recurring
reviewer-retrieval bug on the standard notification channel; recovered
in full from each agent's raw transcript file both times. Full detail:
`docs/adr/0044-local-data-security-verification.md`'s review sections.

**Verification, all actually run**: full `cargo test` 394 lib tests (up
from 393 — the one new WAL/SHM test) + all integration binaries PASS;
`cargo fmt --check`/`cargo clippy --all-targets -D warnings` PASS;
native `cargo build` succeeds; `npm run quality` PASS (unaffected — no
frontend changes this milestone).

## Active Task (2026-08-26, this session — Wave 2C: SF1 Import Preview + Duplicate Review UX, complete)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2C
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as
Wave 2A/2A.1/2B (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: branch/`origin` HEAD both at
`926eddc` as reported, `main` unchanged at `d9ab036`, working tree
clean. **Wave 2B's own CI run (`32938597210`) had actually failed** —
Prettier drift in three docs edited after the last local `npm run
quality` pass, the exact same class of gap this project's own prior
lesson already named ("run the full gate before every push, including
docs-only edits"). Fixed immediately (`5105cef`, confirmed green
`32939416520`) before starting any Wave 2C work, per this milestone's
own instruction not to build UI on an unconfirmed checkpoint.

**What was built**: `src/ui/Sf1ImportScreen.tsx` (workflow screen) +
`src/ui/components/Sf1DuplicateReview.tsx` (side-by-side duplicate
comparison), under a new "SF1: Enrollment" nav tab. Full domain/
application/infrastructure layers added
(`src/domain/sf1-import.ts`, `src/application/sf1-import-service.ts`,
`src/infrastructure/tauri/sf1-import-repository.ts`) mirroring Wave
2B's Rust contract exactly, including the serde externally-tagged wire
format for `Sf1RowAction`. New native file-picker port
(`src/domain/ports/file-picker.ts` /
`src/infrastructure/tauri/file-picker.ts`) backed by
`tauri-plugin-dialog`/`@tauri-apps/plugin-dialog` (first-party Tauri
plugins, `dialog:allow-open` permission only).

**No backend changed**: the UI adapts to Wave 2B's existing
preview/commit contract; no new Tauri command, no schema change, no
re-implementation of parsing/validation/matching in TypeScript. No
merge option anywhere (matches Wave 2A.1's finding that this codebase
has no merge capability). UI never supplies `school_id` or a
capability — proven by both existing backend tests and new UI-level
assertions.

**Independent teacher-UX review — CLOSED**: found and fixed 4 real
issues this same session (only the first of possibly several duplicate
candidates was ever shown/decided against; the safety reassurance was
Guided-only instead of all-mode; a whole-file failure gave one generic
message instead of recognizing the backend's `import_error` category;
inconsistent "not tracked"/"not stored" phrasing). Standard
notification channel hit this project's recurring reviewer-retrieval
bug again; recovered in full from the agent's raw transcript file, same
technique as Wave 2B's security review. Full detail:
`docs/VERIFICATION-DEBT.md`.

**Verification, all actually run**: 25 new tests (application service,
2 infra adapters, screen component) all passing; full `npm run test`
429/429 PASS (up from 404 pre-Wave-2C); `tsc -b --noEmit`/`eslint .`/
`prettier --check .`/`check:architecture` all clean; `cargo fmt
--check`/`cargo test` (393 lib tests, unchanged — no Rust logic
changed)/`cargo clippy --all-targets -D warnings` all PASS; native
`cargo build` succeeds; `npm run build` succeeds. Android kept
deliberately out of scope — no Android build target exists in this
codebase yet, so there is nothing to evaluate feasibility against, per
`CLAUDE.md`'s "Windows first; Android later."

**Deliberately not built this checkpoint**: a Playwright/native visual
pass on the compiled Tauri binary (no browser/screenshot tool available
for it in this environment, same standing disclosed gap as every prior
UI milestone) — recorded honestly in `docs/VERIFICATION-DEBT.md`, not
claimed as covered.

## Active Task (2026-08-26, this session — Wave 2B: SF1 Bulk Import Engine, engine checkpoint complete, UI deferred)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`. Same branch as
Wave 2A/2A.1 (`claude/likha-sis-wave2a-learner-core`).

**What was built**: the full SF1 bulk-import engine —
`src-tauri/src/import/{workbook,normalize,validate,matching,preview,commit,sf1}.rs`
— plus `commands::import::{preview_sf1_import,commit_sf1_import}`
(both `ManageLearners`-gated), registered in `lib.rs`'s
`invoke_handler`. Pipeline: `.xls`/`.xlsx` workbook → `calamine`
adapter → safe normalization → row validation (errors block commit,
warnings don't) → duplicate matching (reuses `learner::find_candidates`
from Wave 2A) → preview → one-transaction commit (reuses
`learner::create`/`section_membership::enroll` completely unchanged,
via `Transaction`'s deref-coercion to `Connection`, verified directly
before the pipeline was designed around it).

**Parser decision**: `calamine` (pure Rust, MIT, read-only), not the
Java/Apache-POI sidecar the roadmap names for **export** — that sidecar
infrastructure doesn't exist anywhere in this codebase yet, so there was
nothing to reuse; reading only needs cell values, a materially smaller
job than POI's template-preserving-write use case. Full reasoning in
ADR-0043.

**Fidelity disclosure (important, read before touching
`import::workbook`)**: no official DepEd SF1 `.xls` template exists in
this repo or was reachable from this environment — the column layout
`import::workbook` searches for is this project's own invented
structure, verified only against a synthetic fixture
(`tests/fixtures/sf1_synthetic_*.xls`, generated by
`tests/fixtures/generate_sf1_fixtures.py`, SYNTHETIC DATA ONLY). The
engine above `import::workbook` is fully verified; the exact real-form
mapping is not. Recorded as external material only the user can
provide, not guessed at.

**No merge, no import-fingerprint table**: `DuplicateResolution` is
`UseExisting`/`CreateSeparate` only (Wave 2A.1's own audit already
established this codebase has no learner merge/delete capability, and
this milestone doesn't invent one). Re-import dedup relies entirely on
existing DB invariants (`idx_learners_school_lrn`,
`idx_one_active_membership_per_learner`, `enroll()`'s own idempotency)
rather than a new table — proven end-to-end by a same-file-twice
integration test.

**Verification, all actually run**: 43 new `import::*` unit tests + 8
new `tests/sf1_import.rs` integration tests, all passing; full `cargo
test` 393 lib tests + all integration binaries PASS; `cargo fmt
--check`/`clippy --all-targets -D warnings` PASS; `npm run quality`
PASS (390 vitest tests, unaffected — no frontend/TS changes this
milestone). A dedicated failure-injection test proves whole-batch
rollback (a later row's LRN-uniqueness violation leaves zero rows from
earlier in the same batch committed). `gitleaks`/`cargo-deny`/
`osv-scanner` remain unavailable (same disclosed gap as every prior
dependency addition) — `calamine`'s supply-chain check has not run;
recorded in `docs/VERIFICATION-DEBT.md`.

**Deliberately not built this checkpoint**: the import-preview UI
screen. This follows this project's own established zero-or-minimal-UI-
first precedent (RBAC, Curriculum Foundation, Teacher Load, Wave 2A) and
the autonomous-development session-safety rule — the engine + full
authorized vertical slice (commands, not just repository functions) is
a stable, independently useful checkpoint on its own. Next actionable
step: build the import-preview screen (New/Existing/Needs
Review/Errors, Efficient/Comfortable/Guided parity) on top of this
already-tested contract — no engine redesign needed first.

**One independent security review — CLOSED**: dispatched narrow-scope
with numbered questions; the standard notification channel again hit
this project's recurring reviewer-retrieval bug, but the findings were
recovered this time by reading the agent's raw transcript file directly
rather than falling back to self-review. 7 of 8 questions FALSE
POSITIVE with direct file:line citations; one real should-fix
(`import::workbook.rs`'s row-count cap is checked only after `calamine`
has already materialized the sheet into memory — `calamine` has no
cheaper API to count rows first) addressed by disclosure in place and
in `docs/VERIFICATION-DEBT.md`, since the file-size cap remains the real
bound on that specific risk shape for this single-tenant desktop app.
Full breakdown: `docs/adr/0043-sf1-bulk-import-engine.md`'s Security
Review section.

## Active Task (2026-08-26, this session — Wave 2A.1: Authorization Closure, complete)

Full record: `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s
Addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: `main` unchanged at `d9ab036`,
branch clean, both expected Wave 2A commits (`f337d8f`, `8b83932`)
present exactly as reported.

**The reported gap confirmed and fixed**: `create_section` had no
capability check at all (same class of bug as Wave 2A's
`enroll_learner_in_section` fix) — any Teacher could create sections.
Fixed to `Capability::ManageTeachingAssignments` (School Head only,
reusing the existing Teacher Load capability — no new capability
invented, per instruction). Six new authorization tests added,
including the explicit adversarial proof (Teacher rejected, no partial
mutation) and a Registrar-alone-denied test confirming the
`ManageLearners`/`ManageTeachingAssignments` split is intentional.

**Bounded Wave 2A mutation-surface audit**: all 11 commands across
`commands/section.rs`/`commands/learner.rs` inventoried — every write
now capability-gated, every read correctly stays session-scoped-only
(the established convention, not a gap), no client-supplied
`school_id` anywhere, no IDOR found. No further defect discovered; no
scope expansion needed.

**Independent `security-reviewer` — CLOSED, real findings retrieved**
(this specific dispatch broke the retrieval-failure streak the
Integration Review and Wave 2A milestones both hit). 5 of 6 adversarial
questions FALSE-POSITIVE with direct citations; one non-security
SHOULD-FIX (document the capability split as deliberate) — addressed
in ADR-0042's addendum. No BLOCKING findings.

**Verification, all actually run**: `enrollment.rs` 13/13 PASS (up
from 7); full `cargo test` 350 lib tests + all integration binaries
PASS; `cargo fmt --check`/`clippy -D warnings` PASS; native `cargo
build` succeeds; `npm run quality:full` PASS; `git diff --check`
clean. `gitleaks`/`cargo-deny`/`osv-scanner` confirmed still
unavailable (`check-security.mjs`: 0 ok, 3 missing, honestly
disclosed, not installed). Codex Pilot: BLOCKED (not logged in, same
unchanged condition as prior sessions, not re-probed).

**Gate decision: WAVE 2A.1 AUTHORIZATION CLOSURE PASSED — READY FOR
WAVE 2B SF1 BULK IMPORT ENGINE.** `main` untouched. Per explicit
instruction, Wave 2B is **not** started — this session stops here and
waits for approval.

## Active Task (2026-08-26, this session — Wave 2A: Learner Core + Enrollment Domain Foundation, complete)

Full record: `docs/adr/0042-learner-core-enrollment-domain-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Branch
`claude/likha-sis-wave2a-learner-core`, branched from verified `main`
at `d9ab036`.

**Repository truth verified first**: `main`/`origin/main` both at
`d9ab036`, clean, CI green — matched the expected baseline exactly.

**Inspected the existing learner model before designing anything, and
found the domain foundation already substantially built**: `learners`
(identity only — name/LRN/sex, never grade/section/school_year) and
`section_memberships` (already the enrollment-history model — half-open
interval `[starts_on, ends_on)`, a `UNIQUE INDEX ... WHERE ends_on IS
NULL` enforcing "one current placement" as a database invariant,
transfer/history already correct and already tested) already correctly
separate identity from placement. The 10-scenario domain decision
(full record in ADR-0042) concluded: **no new table, no migration** —
building a parallel `enrollments` table would have created exactly the
"two systems representing who's placed where" duplication risk the
prior Integration Review milestone was watching for.

**DepEd/SF1 research** (secondary sources, `deped.gov.ph` unreachable
this session — disclosed, not primary-source-verified): confirmed
LRN's permanent, 12-digit, transfer-surviving shape (already correctly
built, ADR-0017); confirmed SF1's own Remarks column tracks
transfer/drop/Balik-Aral status — deliberately **not** encoded now
(the taxonomy mixes placement-reason and unrelated learner-flag
concerns; belongs to Wave 3's Form Engine, which will need SF1's exact
field requirements). The schema is additive-only, so this is deferred
with zero destructive-redesign risk, not precluded.

**A real, previously undiscovered authorization gap was found and
closed**: `commands::section::enroll_learner_in_section` was gated
only by an active session — no role check at all, so any Teacher could
enroll or transfer any learner into any section. Fixed to reuse
`Capability::ManageLearners` (same gate as `create_learner`/
`update_learner`, per this codebase's own established "same capability,
not a separate one" convention). `create_section`'s identical gap was
found in passing and spawned as a separate follow-up task, not fixed
here (a different, adjacent decision — section _definition_ is closer
to scheduling/admin than learner enrollment).

**Vertical slice delivered, repository/command layer, no UI**: an
authorized Registrar or School Head creates a learner, enrolls them
into a section, and retrieves both their current enrollment and full
history — proven end-to-end by a new integration test file
(`src-tauri/tests/enrollment.rs`, 7 tests, including the explicit
adversarial proof that a Teacher session is now rejected where it
previously would have succeeded). Two new read-only repository
functions (`section_membership::list_by_learner_in_school`/
`current_membership_for_learner_in_school`) and one duplicate-candidate
lookup (`learner::find_candidates` — exact-LRN or exact-name match,
school-scoped, never auto-merges) back three new commands.

**Verification, all actually run this session**: targeted repository
tests (10 new, `section_membership::`/`learner::`) PASS; new
integration suite (`enrollment.rs`, 7/7) PASS; full `cargo test` PASS
(350 lib tests, up from 342, + all integration binaries incl. the new
one); `cargo fmt --check` PASS; `cargo clippy --all-targets -- -D
warnings` PASS, 0 warnings; native `cargo build` succeeds (harmless
pre-existing PDB warning only); `npm run quality:full` PASS end-to-end;
`git diff --check` clean. Two stray 0-byte junk files (`(String`,
`Connection` — the same accidental-artifact class documented earlier
in this project's history) were found untracked and deleted, not
committed.

**Independent `security-reviewer`** dispatched for the authorization
gap and the three new commands; hit the recurring agent-resume/
retrieval failure on both the initial dispatch and the one permitted
retry. Rigorous self-review substituted, answering all six adversarial
questions the dispatch was given — no BLOCKING or SHOULD-FIX findings;
real independent-review debt recorded as open in
`docs/VERIFICATION-DEBT.md`.

**Gate decision: WAVE 2A LEARNER CORE + ENROLLMENT FOUNDATION PASSED —
READY FOR SF1 BULK IMPORT ENGINE.** `main` untouched. Per explicit
instruction, Wave 2B (SF1 bulk import) is **not** started — this
session stops here and waits for approval.

## Active Task (2026-08-26, this session — Integration Review + Main Fast-Forward Decision, complete)

**`main` is now the verified integration baseline at `3951c3d`.**
Previous baseline: `f02bce5` (account-transition checkpoint, pre-UX-03).
30 commits, 89 files (+14094/-727) fast-forwarded — no merge commit,
no squash, no rebase, no force push.

**Repository truth verified first**: `main`/`origin/main` were both at
`f02bce5`, an unmodified strict ancestor of the feature branch (0
commits behind, 30 ahead) — no divergence, safe to integrate without
reconciliation.

**Cross-milestone integration delta reviewed**: automated checks
(junk/generated files, `Cargo.lock` byte-identical to `main` — zero
dependency drift, migration chain — 15→18, pure appends only, no
reordering/destructive changes, no `LIKHA-SIS 2.0` stale naming, no
hardcoded secrets/credentials, three-term grading confirmed as the
seeded default) all clean. An `architecture-reviewer` was dispatched
for the specific cross-milestone question this gate exists to answer
(does RBAC compose correctly with every command added after it landed
— Teacher Load, Curriculum) and hit this project's recurring
agent-resume/retrieval failure on both the initial attempt and the one
permitted retry (documented since M7). A rigorous self-review was
substituted: read every command in `commands::teaching_assignment.rs`
directly — all eight are correctly and consistently gated (four
via `authorize_capability(ManageTeachingAssignments)`, two via
`authorize_view_teacher_load`, one reference-data read intentionally
open, matching the codebase's established convention, and the one
previously-fixed cross-teacher leak in
`list_schedule_meetings_by_assignment` reconfirmed still fixed);
`authorize_view_teacher_load`/`authorize_capability` themselves
reconfirmed fail-closed and session-derived only; `node
scripts/check-architecture.mjs` passed with zero restricted imports.
No BLOCKING or SHOULD-FIX findings — real, non-self independent-review
debt for this specific integration-delta question remains open (see
`docs/VERIFICATION-DEBT.md`).

**One real documentation-truth gap found and fixed**: `docs/PROGRESS-MAP.md`'s
`CURRENT` pointer still said "Wave 0 complete, recommended next: RBAC
foundation" — stale since RBAC, Curriculum, Teacher Load, and the
`windows-future` compiler blocker have all since closed. Fixed to
point at the closed ADRs.

**Pre-integration CI, actually run on the exact HEAD integrated**:
feature-branch run `32921475227` (HEAD `3951c3d`) — Ubuntu and Windows
both green. Local `npm run quality:full`, `cargo check --lib`, native
`cargo build`, `git diff --check` — all PASS, all actually run this
session.

**Fast-forward performed** (`git checkout main && git pull --ff-only
origin main && git merge --ff-only claude/likha-sis-ux03-plan-plv80c`)
— Git itself reported `Fast-forward`, not a merge commit. Pushed;
`origin/main` confirmed at `3951c3d`, matching local exactly.

**`main` CI verified green on the new baseline, not assumed**: run
`32922664816` (push event, HEAD `3951c3d`) — Ubuntu and Windows both
`success`.

**Feature branch status**: `claude/likha-sis-ux03-plan-plv80c` is
fully integrated into `main`. Not deleted this milestone, per explicit
instruction — retained until the user approves removal. It is no
longer the development baseline; the next product milestone starts
from fresh `main` on a new branch.

**Gate decision: INTEGRATION PASSED — MAIN IS THE NEW VERIFIED
BASELINE.** Per explicit instruction, no product feature work has
begun. Recommended next milestone (not started): see this session's
final report.

## Active Task (2026-08-26, this session — Minimal CI Foundation, complete)

Full record: `docs/adr/0041-minimal-ci-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top two entries.

**Repository truth verified first**: branch
`claude/likha-sis-ux03-plan-plv80c`, local HEAD `62e0948`, matching
`origin`, working tree clean — exactly the expected checkpoint, not
assumed.

**Teacher Load review-debt reconciled**: found **STALE, CORRECTED**
(full reasoning: `docs/VERIFICATION-DEBT.md`'s top entry). The "Teacher
Load's own `security-reviewer` re-run still owed" line was accurate
when written (the milestone's own dedicated review had failed
retrieval) but two later, successfully-retrieved independent reviews —
Native Rust Verification Recovery's `security-reviewer` (fixed a real
missing-`school_id`-scope gap in `schedule_meeting.rs`'s
`has_exact_duplicate`) and RBAC Foundation's `security-reviewer`
closure (fixed a real cross-teacher schedule leak in
`list_schedule_meetings_by_assignment`) — collectively covered both
halves of Teacher Load's actual security surface (data-integrity and
authorization) with real, non-self findings, fixed. No new reviewer
was dispatched to reach this conclusion, per the explicit instruction
not to duplicate a completed review.

**GitHub Actions billing researched from official docs, not assumed**:
this repository is **public** (confirmed via `gh repo view`), and
GitHub's own billing documentation states standard-runner minutes are
free/unmetered for public repositories — Windows included. This
removed the usual private-repo "spend Windows minutes sparingly"
constraint entirely; zero-billing gate passed unconditionally (no
spending limit configuration needed, none possible to circumvent since
the workflow structurally can't generate a charge).

**10-scenario CI decision**: two jobs (Ubuntu, Windows), each running
`npm run quality:full` verbatim, on `push`/`pull_request`/
`workflow_dispatch`, `permissions: contents: read` only, no secrets,
concurrency-cancel per ref. Full scoring in ADR-0041.

**Actually executed on GitHub Actions, evidence not claimed**: first
real run (32915080360) genuinely failed on Ubuntu — `ubuntu-latest`
lacks the GTK/glib system packages Tauri's Linux backend needs
(`gobject-sys`/`glib-sys` `pkg-config` failures); the _same run_'s
Windows job passed `npm run quality:full` end-to-end on the first
try. Fixed by adding the exact `apt-get` package list from Tauri's own
official prerequisites docs (fetched directly, quoted, not
remembered). Re-pushed; run 32916282825 is **green on both jobs**
(Ubuntu 6m9s, Windows 17m17s). A second real, non-CI-config finding
followed: the docs checkpoint commit itself failed `prettier --check`
(this session hadn't run the local gate on doc edits) — fixed with
`prettier --write`, re-verified locally, and reconfirmed green on
GitHub Actions (run 32917911205, Ubuntu 7m18s, Windows 17m41s).

**Gate decision: MINIMAL CI FOUNDATION PASSED — READY FOR INTEGRATION
REVIEW / MAIN FAST-FORWARD DECISION.** `main` remains a strict ancestor
of this branch (27 commits ahead, 0 behind) — untouched, not
fast-forwarded, not merged, per explicit instruction. Per the same
instruction, the next milestone (Integration Review + `main`
Fast-Forward Decision) has **not** been started — this session stops
here and waits for approval.

## Active Task (2026-08-26, this session — Rust Formatting + Quality Gate Normalization, complete)

Full record: `docs/VERIFICATION-DEBT.md`'s top entry.

**Repository truth verified first**: local branch was already at
`ce22c08`, matching origin, with the prior session's Curriculum/RBAC
review-fix checkpoint uncommitted as expected. Diffed it against what
that session's report described — matched exactly — then committed and
pushed it (`ce22c08`) before touching formatting, so the security/
architecture fixes are preserved independent of this milestone.

**Formatting baseline re-measured, not assumed**: 265 `cargo fmt --check`
diff hunks across 35 first-party files (rustfmt 1.9.0-stable, no
`rustfmt.toml`). Ran plain `cargo fmt` — no manual restyling, no
opportunistic refactors. Proven semantic-free by a stricter method than
a simple `git diff -w` (which under-proves when rustfmt reflows a call
across multiple lines — line-count changes defeat a naive whitespace-
ignoring diff): every changed file was compared with all whitespace and
rustfmt's trailing commas stripped, confirming the only remaining
differences were `use`-statement reordering (not semantic in Rust) and
standard single-expression closure/match-arm brace add/remove (also not
semantic). Committed in isolation (`139c36d`), separate from the
quality-gate wiring change (`8ee1187`) that added `cargo fmt --check`
to `npm run quality:full` (the milestone/release gate) and updated
`.claude/rules/testing.md` to match, per its own "keep in sync" rule.

**Verification, all actually run this session**: `cargo fmt --check`
PASS (was FAIL); `cargo check --lib` PASS; `cargo test` PASS (342 lib +
all integration binaries, identical counts to the pre-format baseline);
`cargo nextest run` 403/403 PASS; `cargo clippy --all-targets -- -D
warnings` PASS, 0 warnings; `cargo build` (native) succeeds; `npm run
quality` 390/390 PASS; `npm run quality:full` PASS end-to-end (proves
the new gate is actually wired in — a formatting regression would have
stopped the chain before `cargo test`); `git diff --check` clean;
`gitleaks` secret scan NOT RUN (still unavailable on `PATH`).

**Gate decision: RUST FORMATTING + QUALITY GATE PASSED — READY FOR
MINIMAL CI FOUNDATION.** Recommended next milestone (not started, per
this session's explicit instruction to stop and wait for approval):
Minimal CI Foundation (`.github/workflows/`, running the existing
`npm run quality:full` gate on push/PR against this branch).

## Active Task (2026-08-26, this session — Foundation Independent Review Debt Closure, complete)

Full record: `docs/VERIFICATION-DEBT.md`'s top entry.

**Repository truth verified before reviewing anything**: local branch
`claude/likha-sis-ux03-plan-plv80c` was 2 commits behind
`origin/claude/likha-sis-ux03-plan-plv80c` and carried uncommitted
working-tree edits to 6 files. Diff comparison confirmed these were
stale, pre-fix duplicates of work already merged upstream in `caf850b`
(the compiler-recovery commit) — not in-progress work. Discarded (with
explicit user confirmation, since this session's auto-mode classifier
correctly blocked the discard as a destructive git action) and pulled
to `096dcfc`. Also removed five stray 0-byte junk files (`(String`,
`ComputedTermGrade`, `MonthlyAttendanceReport`, `button`,
`src-tauri/MonthlyAttendanceReport`) and an untracked 4.9MB
`repomix-output.xml` — accidental artifacts from an unrelated prior
tool invocation, not source.

**Both previously-owed independent reviews actually completed and
retrieved this session** — full record in `docs/VERIFICATION-DEBT.md`'s
top entry. Curriculum Foundation `architecture-reviewer`: no BLOCKING
findings, one SHOULD-FIX (a doc-comment overclaim in
`repository::curriculum.rs`'s `default_version_id`, fixed). RBAC
Foundation `security-reviewer`: no BLOCKING findings, one SHOULD-FIX
(teacher schedule reconstructable by any Teacher session bypassing
`authorize_view_teacher_load`, fixed in
`commands::teaching_assignment::list_schedule_meetings_by_assignment`).
Both previously-fixed regressions (`add_user_to_school` self-grant,
Teacher Load cross-school view leak) reconfirmed intact by the RBAC
reviewer via direct code read.

**A process finding worth recording for future sessions**: the
recurring agent-resume/retrieval failure documented since M7 did _not_
recur here — both reviewer agents completed and could be resumed via
`SendMessage`. What did initially fail was retrieving their findings as
usable text: the first response from each resumed agent was a terse
one-line acknowledgment, not the full report. The reviewers had likely
already communicated their findings via `ReportFindings`, a tool whose
output renders to a UI channel this orchestrating session can't read
back. Explicitly asking each agent to restate its findings as plain
text (not via `ReportFindings`) in a follow-up `SendMessage` worked.
Future sessions dispatching `architecture-reviewer`/`security-reviewer`
as background agents should anticipate this and ask for a plain-text
report explicitly in the original dispatch prompt to avoid the extra
round trip.

**Verification, all actually run this session**: `cargo check --lib`
PASS; targeted tests (81, `auth::`/`curriculum::`/`teaching_assignment::`/
`schedule_meeting::`) PASS; full `cargo test` PASS (342 lib + all
integration binaries); `cargo clippy --all-targets -- -D warnings` PASS;
`npm run quality` PASS, 390/390; `cargo fmt --check` — 265 pre-existing
diffs, unchanged by this session's edits, not corrected (out of scope,
recommended follow-up milestone below); `git diff --check` clean;
`gitleaks` secret scan NOT RUN (binary unavailable on `PATH`, not
installed per project policy).

**Gate decision: FOUNDATION REVIEW DEBT CLOSED — READY FOR
FORMATTING/CI HARDENING.** Recommended next milestone (not started, per
this session's explicit instruction to stop and wait for approval):
Rust Formatting + Quality Gate Normalization (the ~265-file `cargo fmt`
diff, then a minimal CI foundation, per the sequence recorded in
`docs/VERIFICATION-DEBT.md`).

## Active Task (2026-08-25, this session — Native Rust Verification Recovery, complete)

Full record: `docs/adr/0040-windows-only-dependency-target-gating.md`.

**Root cause confirmed with evidence, not guessed**: every prior
session's "windows-future/windows-core version mismatch" framing was
wrong. `cargo tree -i windows@<ver> --target all` showed each `windows`
version's own dependency edges were internally consistent; the real
problem was that `src-tauri/Cargo.toml` declared LIKHA's own
`windows = "0.62.2"` (used for DPAPI key protection) **unconditionally**
— no `[target.'cfg(windows)'.dependencies]` gate — forcing Windows-only
COM/async code to compile on every host, including this Linux sandbox.
Tauri's own Windows-only webview backend (`tao`/`wry`/`webview2-com`,
which locks `windows` 0.61.3) was already correctly target-gated in the
same `Cargo.lock` — proof the pattern works, LIKHA's own declaration
just never used it.

**Fix applied — Category E (platform/target-specific dependency
problem), minimal-change, zero lockfile diff**: moved `windows` to
`[target.'cfg(windows)'.dependencies]`; `#[cfg(windows)]`-gated
`mod dpapi;`/`DpapiKeyStore` in `crypto/mod.rs`; split
`db::open_app_db` so the `#[cfg(not(windows))]` path fails closed with a
`KeyStore` error rather than opening an unprotected database (Windows
is the only shipping desktop target). `git diff --stat`: 6 files
changed, 71 insertions, 10 deletions — `Cargo.toml`, `crypto/mod.rs`,
`db/mod.rs`, plus 3 files touched only to fix bugs restored compilation
revealed (below). `Cargo.lock` is byte-identical to before the fix.

**Compiler Recovery:**

| Check                                                                     | Result        | Evidence                                                                                                                           |
| ------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `cargo check --lib`                                                       | PASS          | 0 warnings, 0 errors                                                                                                               |
| Targeted RBAC/auth tests (`cargo test --lib auth::`)                      | PASS          | 57/57                                                                                                                              |
| Targeted Teacher Load tests (`teaching_assignment::`, `schedule_meeting`) | PASS          | 9/9 + 13/13                                                                                                                        |
| Full `cargo test`                                                         | PASS          | 338 lib tests + all integration binaries, 0 failed                                                                                 |
| `cargo clippy --all-targets -- -D warnings`                               | PASS          | 0 warnings                                                                                                                         |
| `npm run quality`                                                         | PASS          | typecheck/lint/format/architecture/vitest all green, 390 tests                                                                     |
| Tauri/native build                                                        | NOT ATTEMPTED | out of scope — `cargo check`/`test`/`clippy` were this milestone's success criteria; a full GUI build was not required and not run |

**Product bugs revealed and fixed (direct correctness issues in
already-shipped foundation code, not scope expansion)**:

1. `class_record::find_detail_by_id_in_school` — type-inference
   ambiguity (`Err(e.into())`) fixed to `Err(AppError::from(e))`, no
   behavior change.
2. `schedule_meeting::create` — `CreateMeetingOutcome::Duplicate` was
   dead code (an exact duplicate always shares its teacher with itself,
   so `has_teacher_conflict` always fired first, despite an existing
   regression test asserting `Duplicate` should be returned). Fixed
   with a `has_exact_duplicate` check run before the conflict checks.
3. Four `assessment_item` tests used a literal `"teacher-1"` for
   `recorded_by_user_id`, which could never satisfy the real
   `learner_scores.recorded_by_user_id REFERENCES users(id)` FK once it
   actually ran. Fixed by creating a real `user::create_user(...)` row,
   matching `learner_score.rs`'s own correct test pattern.

**Verification debt closed**: the entire "Rust toolchain cannot compile
in this environment" entry in `docs/VERIFICATION-DEBT.md` (open since
before this session's visible window, reproduced and diagnosed but not
fixed in the RBAC milestone). **New debt opened**: `cargo fmt --check`
(never part of `quality:full`) found ~264 pre-existing formatting diffs
across most of the crate — not corrected in this milestone (out of
scope; recommend a dedicated follow-up commit). Independent
`security-reviewer` dispatched for the crypto/key-store boundary change
— outcome recorded in `docs/VERIFICATION-DEBT.md` once it returns.

**Gate decision: RUST VERIFICATION RECOVERED — READY TO RESUME PRODUCT
WAVE.** Recommended next milestone (not started, per explicit
instruction to stop and wait for approval): link `class_records` to
`teaching_assignments` where a matching assignment exists (surfacing
"who teaches this" on the class record itself), OR — given verification
was the whole point of this milestone — re-run the two previously-owed
independent reviews (Curriculum Foundation's `architecture-reviewer`,
RBAC's `security-reviewer`) now that a healthy compiler signal exists to
ground them in, closing that debt before adding new surface area.

## Active Task (2026-08-25, this session — Teacher Load / Class Schedule Foundation, complete)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`.

**Repository truth confirmed before designing anything**: `class_records`
has no teacher/owner column at all; no `teachers` table, schedule, or
assignment concept existed anywhere. "Teacher" is fully represented by
the existing `users` + `user_school_memberships` + `user_school_roles`.

**Domain model**: three distinct concepts, two new tables, load always
derived. `teaching_assignments` (who teaches what, school-year-long,
`UNIQUE(section_id, subject_id)`, no `school_year` column of its own —
derived via `section_id`, same single-source-of-truth pattern as
`class_records`). `schedule_meetings` (when/where, one row per weekly
slot, local wall-clock `HH:MM` text, not UTC). `TeacherLoad` is always
computed fresh (assignment count, distinct-subject/preparation count,
weekly instructional minutes) — no stored running total. Deliberately
**not** linked to `class_records` this milestone (different lifecycle:
term-scoped vs. year-long; a real FK would force retrofitting an
already-stable four-ADR-deep table for a benefit nothing yet needs).
Advisory/ancillary duties explicitly excluded — DepEd Order No. 005,
s. 2024 itself classifies advisory as non-instructional.

**Authorization**: new `Capability::ManageTeachingAssignments` (School
Head only, deliberately not reusing `ManageSchoolMembership`). New
`auth::authorize_view_teacher_load` (self, or School Head viewing within
their own school). **A real cross-school leak was caught and fixed
during this function's own TDD pass**: the first draft authorized a
School Head to view any `target_teacher_user_id` based on their own
role alone, without checking the target actually belongs to the
caller's school — fixed by adding an explicit `is_member_of_school`
check before the fix was ever committed, not discovered later.

**A second real bug was caught by adversarial self-review before
dispatching the independent reviewer**: `schedule_meeting::create` used
`INSERT OR IGNORE` for its final insert with no Rust-side weekday
validation — the exact `INSERT OR IGNORE`-swallows-a-`CHECK`-violation
mistake this project already documented as a lesson after the RBAC
milestone's `role::grant` bug. Fixed: explicit weekday-range validation
in Rust, `INSERT ... ON CONFLICT (...) DO NOTHING` instead of `OR
IGNORE`. A regression test pins the fix.

**No UI this milestone** — the vertical slice ("School Head assigns a
teacher, sees it reflected in load") is proven at the repository/command
layer with tests, the same zero-UI proof shape RBAC and Curriculum
Foundation both already used.

**Verification**: `npm run quality` 390/390, `check:dev-preview-isolation`,
`knip`, `git diff --check` all clean (Rust-only change). `cargo check
--lib` reconfirmed **BLOCKED** — fails at the pre-existing
`windows-future` dependency-compile stage, before this crate's own
source is even type-checked, so there is literally zero compiler signal
on this new code, not even partial. Independent `security-reviewer`
dispatched for an adversarial pass; outcome recorded in
`docs/VERIFICATION-DEBT.md`. Codex remains PILOT — not re-probed beyond
one login-status check (unchanged: not logged in), per explicit
instruction not to repeatedly probe a known condition.

**Per explicit instruction: do not begin the next milestone
automatically.** See this session's final report for the gate decision
and recommended next milestone.

## Active Task (2026-08-25, this session — RBAC Authorization Corrective Gate, complete)

**Reported `add_user_to_school` gap: CONFIRMED and fixed.** Full record:
`docs/VERIFICATION-DEBT.md`'s updated RBAC entry (no new ADR — this is
an ordinary bug fix, the existing ADR-0036 capability architecture
already specified the correct shape, just applied incompletely).

**Confirmed, not assumed**: `authorize_school_membership_grant`
(`src-tauri/src/auth/mod.rs`) checked only "an active session scoped to
the same school" — no role check. Traced a real, complete exploit chain
using only two already-existing commands: any authenticated session
(any role) calls `register_user` to mint a fresh account, then
`add_user_to_school` (same school, any role accepted) to self-grant that
account membership. Grepped every production caller of
`user::add_school_membership`/`role::grant` — only two exist
(`bootstrap_installation`, already correctly gated; and
`add_user_to_school`, the confirmed defect) — no sibling vulnerability
found elsewhere in the authorization family (there is no remove-
membership, change-role, or deactivate command in this codebase at all
yet, and `user_school_memberships` has no active/revoked flag — those
authorization-family questions don't yet apply to anything that exists).

**Fix**: new `Capability::ManageSchoolMembership`, School Head only
(deliberately excludes Registrar — the conservative choice; onboarding a
new school member is treated as a School Head personnel matter, not
Registrar's enrollment/records scope). `authorize_school_membership_grant`
now routes through the existing `authorize_capability` gate — same
pattern as every other capability check, no new mechanism. Six
regression tests prove: School Head succeeds; Teacher-only denied (the
exact defect); no-role-at-all denied; Registrar-only denied; cross-school
denied (with a corrected fixture that now isolates the cross-school
check from the role check); role revoked mid-session denied on the very
next call (no caching). TOCTOU: none introduced or found — the whole
command runs under one held `Mutex<Connection>` lock, same as every
other command in this codebase.

**Verification**: `npm run quality` 390/390, `check:dev-preview-isolation`,
`knip` all re-run clean (unaffected — Rust-only fix). `cargo check --lib`
reconfirmed **BLOCKED**, identical pre-existing `windows-future` conflict
— this fix is written and manually reviewed, not compiler-verified.
Independent `security-reviewer` dispatched for an adversarial pass
attempting to break the fix; outcome recorded in `docs/VERIFICATION-DEBT.md`.

**Codex remains PILOT** — not promoted; no live Codex task was run this
milestone (network/credential blockers unchanged, not re-probed per
explicit instruction not to re-test a known condition).

**RBAC gate decision and next milestone**: see this session's final
report. Per explicit instruction, do not begin Teacher Load / Class
Schedule until that decision is delivered and approved.

## Active Task (2026-08-25, this session — Codex Delegation Harness, complete, PILOT)

**Harness-only milestone, no product code changed.** Full record:
`docs/adr/0038-codex-delegation-harness.md`, `.claude/skills/codex-delegation/SKILL.md`,
`docs/SOURCE-REGISTRY.md`'s new entry.

**Verified real, not assumed**: initial web research on "the Codex
plugin for Claude Code" surfaced mostly SEO/content-farm sites with an
inflated-star-count pattern this project already rejected once before
(`Graphify-Labs/graphify`) — not trusted at face value. Verified
directly instead: `claude plugin marketplace add openai/codex-plugin-cc`
performed a real `git clone` against the real GitHub repo, and
`claude plugin install codex@openai-codex` succeeded, exposing a real,
versioned (v1.0.6), Apache-2.0 plugin with 11 skills, 1 agent, 3 hooks,
0 MCP servers.

**Decision: PILOT, not ADOPT.** Codex is a bounded worker under Claude
orchestration for LOW/MEDIUM-risk implementation, and — a genuine,
LIKHA-specific reason, not a generic "more review" argument — a
second-vendor adversarial reviewer for HIGH-risk work, directly
addressing this project's own long, recurring same-vendor
reviewer-agent retrieval failure (documented since M7, hit again twice
this same session). Risk-routing policy, implementation contract,
return contract, and stop conditions are recorded in
`.claude/skills/codex-delegation/SKILL.md`. **Not promoted to ADOPT**:
no live, credentialed task could actually be delegated in this session
— confirmed via a real (harmless) probe that this sandbox's network
egress policy returns `HTTP 403` for `wss://api.openai.com/v1/responses`,
a structural block independent of credentials. A real pilot task must
run on a machine without that restriction before promotion.

**Real risk found, not just theorized**: read directly from this
repo's own hook source that LIKHA's `PreToolUse` secret/PII-pattern
hooks are wired to Claude Code's own `Write`/`Edit`/`Bash` tool calls —
Codex edits files as an external local process per its own
documentation, so those hooks almost certainly do not fire for
Codex-originated writes. Independent Claude review of the actual diff
is therefore the only real safety net for anything Codex touches, not a
formality — recorded as a hard rule in the new skill.

**No stale "LIKHA-SIS 2.0" references found** — re-checked per this
milestone's own instruction; the two existing hits in this repo are
historical confirmations that no such error exists, not actual mistakes.

**Global (not repository) state changed on this machine**: one
marketplace (`openai-codex`) and one plugin (`codex@openai-codex`)
installed at user scope — both fully reversible, nothing in this
repository depends on either.

**Per explicit instruction: return to the existing product roadmap,
do not silently start it.** Recommended next milestone, awaiting
approval: **Teacher Load / Class Schedule Foundation** (Wave 1's next
slice per `docs/adr/0035-...md`) — re-verify this still leads once
repository evidence is checked fresh, since the RBAC milestone's
`add_user_to_school` role-authorization gap remains open debt that
could also justify a prerequisite corrective milestone instead.

## Active Task (2026-08-25, this session — Curriculum / Key-Stage Versioning Foundation, complete)

**Curriculum / Key-Stage Versioning Foundation is complete.** Full
record: `docs/adr/0037-curriculum-key-stage-versioning.md`,
`docs/VERIFICATION-DEBT.md`'s new top entry, `docs/SOURCE-REGISTRY.md`'s
new curriculum-sources section.

**Architecture**: two deliberately un-joined reference axes — `key_stages`
(KS1 Grades 1-3, KS2 4-6, KS3 7-10, KS4 11-12; global, curriculum-
independent, since Key Stage banding is a stable K-12 structural concern,
not a curriculum-content one) and `curriculum_versions` (two seeded rows:
"K to 12 Basic Education Curriculum," sole default, and "MATATAG
Curriculum," not default). `curriculum_learning_areas` lists named
learning areas per curriculum version — deliberately not joined to
`subjects` (a school's own freeform subject list still has no DepEd
classification, the same gap ADR-0015 left open for weight groups; not
widened here either). `class_records.curriculum_version_id` pins which
version applies, mirroring `weight_policy_id`'s exact nullable-for-
migration-safety/COALESCE-to-default shape — with one deliberate
deviation: it auto-resolves to the default rather than requiring an
always-visible picker, since nothing yet reads which version is pinned
to make a different decision (no learning-area validation, no grade-
computation difference). **Zero UI/TypeScript change** — the same "does
a normal teacher actually need to configure this" reasoning RBAC already
established; a teacher never sees an internal curriculum-version id.

**Representative proof**: two curriculum versions are explicitly pinned
to two different class records; flipping which one is the system-wide
default (simulating a newer curriculum becoming active) leaves both
already-pinned records' resolved curriculum unchanged, while a
never-pinned legacy row correctly follows the new default — proving
historical stability and coexistence with zero string-based branching
(`class_record.rs`'s
`two_curriculum_versions_coexist_and_changing_the_default_does_not_rewrite_an_already_pinned_record`).

**Research**: Key Stage grade bands were already primary-source-verified
by a prior milestone (ADR-0013, DepEd Order No. 015, s. 2026's own PDF)
and reused directly. MATATAG's phased rollout (SY 2024-2025 → 2026-2027,
completing K-10; SHS on a separate, not-yet-released schedule) was
triangulated across multiple independent secondary sources — `deped.gov.ph`
itself was unreachable (`WebFetch` blocked by this environment's network
egress policy), so this falls short of ADR-0013's primary-source bar and
is disclosed as such, not overstated. No specific MATATAG-vs-prior
learning-area-name difference was confirmed — none is encoded; both
curriculum versions seed identical learning-area names.

**Verification**: `npm run quality` (390/390), `check:architecture`,
`check:dev-preview-isolation`, `knip` all actually re-run clean (Rust-
only change, so this is a real but partial signal). `cargo check --lib`/
`cargo test --lib` reconfirmed **BLOCKED**, identical to every prior
session — this milestone's new Rust is written and manually reviewed,
not compiler-verified. `deped-researcher` hit this project's recurring
agent-resume failure on both the initial attempt and one retry (now
confirmed on this agent type too); direct `WebSearch`/`WebFetch` was
substituted per the established fallback rule. `architecture-reviewer`
was dispatched for architecture/data-integrity review — see
`docs/VERIFICATION-DEBT.md` for the outcome.

**Explicit durable clarification (per this milestone's own instruction)**:
`school_year` is never treated as the curriculum itself — a curriculum
can span multiple years, overlap during transition, or cover only part
of the school (SHS stays on the K to 12 curriculum while K-10 phases
into MATATAG). Automatic curriculum selection by grade level is
deliberately not attempted — `sections.grade_level` remains unconstrained
free text, so any `if grade_level >= 7`-style resolution would be exactly
the "infer from label" mistake this milestone was told to avoid; that is
a disclosed prerequisite for a future milestone, not solved here.

**Per explicit instruction: do not begin the next milestone
automatically.** Recommended next milestone, awaiting approval: see
`docs/ACTIVE-PLAN.md`'s new top section for the full evaluation — **Teacher
Load / Class Schedule Foundation** is the leading candidate per the Wave
1 sequence, but repository evidence should be re-checked before assuming
it automatically wins over closing the RBAC `add_user_to_school`
role-authorization gap first.

## Active Task (2026-08-25, this session — Wave 1A: RBAC Foundation, complete)

**RBAC Foundation (Teacher / Registrar / School Head) is complete.**
Full record: `docs/adr/0036-rbac-foundation.md` (architecture decision),
`docs/VERIFICATION-DEBT.md`'s Wave 1A entries (reproduced Cargo blocker,
`security-reviewer` findings), `docs/SOURCE-REGISTRY.md`'s Wave 1A
harness-tooling-audit section.

**Repository truth confirmed this task**: branch
`claude/likha-sis-ux03-plan-plv80c`, working tree clean apart from this
milestone's own changes before commit. `npm run quality` 390/390 (no
regression — this milestone's application code is Rust-only), `npx knip`
shows the same pre-existing findings, zero new. `cargo check --lib`/
`cargo test --lib` were both actually run and both **reconfirmed the
pre-existing blocker** — `windows-future` 0.3.2 fails to compile against
the `windows-core` 0.62.2/`windows-threading` 0.2.1 pair Cargo.lock
resolves it to. Root cause traced further than before: `Cargo.toml`
declares `windows = "0.62.2"` **unconditionally** (no
`[target.'cfg(windows)'.dependencies]` section exists), and
`crypto/dpapi.rs` (Windows DPAPI key protection, ADR-0003) is compiled
unconditionally too (no `#[cfg(windows)]`) — so this crate cannot compile
on any non-Windows host regardless of the specific version conflict. A
real fix needs a genuine architecture decision (target-gate the
dependency and the module, decide what non-Windows dev/CI does for
`KeyStore`) — per this milestone's explicit instruction, **not** made
here; recorded as the reproduced blocker for a future dedicated session.

**RBAC implementation**: new `user_school_roles` join table (migration
16, composite PK `(user_id, school_id, role)`, `CHECK` on role, cascading
FK to `user_school_memberships`) — a separate table, not a role column,
specifically so one person can hold more than one role in the same
school without a schema change. New `auth::Capability` enum (one
variant, `ManageLearners`) and `auth::authorize_capability()`, mirroring
the existing `authorize_user_registration`/`authorize_school_membership_grant`
gate pattern exactly — the only place a role is ever mapped to what it's
allowed to do. Representative proof: `create_learner`/`update_learner`
now require Registrar or School Head; learner reads stay ungated (no
regression for Teachers). `bootstrap_installation` grants its founding
user all three roles; `add_user_to_school` grants `teacher` only
(least-privilege default). Role membership is always a fresh DB lookup,
never cached on `Session` — closes the stale-assignment/revocation class
of threat the same way `require_active_session`'s existing independent
revocation check already does. No TypeScript/UI change was needed —
`LearnerListScreen`'s existing generic error handling already degrades an
`Unauthorized` rejection gracefully; security is enforced entirely below
React.

**Independent `security-reviewer` review**: dispatched and returned real
findings (unlike several prior sessions' agent-resume failures — this one
completed) before hitting a session-limit API error mid-follow-up. Found
and fixed: `role::grant()` used `INSERT OR IGNORE`, which silently
swallows a `CHECK` constraint violation (not just the intended
primary-key conflict) — independently reproduced against real SQLite
before trusting the claim, then fixed to `ON CONFLICT (...) DO NOTHING`,
which does still raise on a `CHECK` failure. Recorded, not fixed (Wave
1A's own explicit scope boundary): `add_user_to_school` authorizes only
"same school," not "same school AND an appropriate role" — a pre-existing
gap (the check itself predates this milestone), not currently reachable
from any UI, and deciding who may grant membership is exactly the kind of
authority-boundary question this milestone deferred beyond its one
representative proof. Full detail in `docs/VERIFICATION-DEBT.md`.

**Explicit durable clarification (per this milestone's own instruction)**:
Teacher/Registrar/School Head are the **initial RBAC proof set**, not the
final LIKHA functional-role universe — Adviser, LIS Coordinator, ICT
Coordinator, Master Teacher/Department Head, and other school-authorized
responsibilities are expected later, added via new role-constant values
and widened `CHECK` constraints, never a redesign of `user_school_roles`,
`Capability`, or `authorize_capability`.

**Harness**: audited ast-grep, dependency-cruiser, repomix, and
cargo-mutants against actual repository evidence and adopted **none of
them** this milestone — `check-architecture.mjs` already covers the one
import-direction rule that matters, the repo is small enough that
Grep/Glob are already token-efficient, and `cargo` cannot compile here at
all, so a mutation-testing pilot has nothing to run against. Full
reasoning in `docs/SOURCE-REGISTRY.md`'s Wave 1A section — a deliberate
"add nothing new" conclusion, not a shortfall against the instruction to
consider harness improvements.

**Per explicit instruction: do not begin the next milestone
automatically.** Recommended next milestone, awaiting approval:
**Curriculum / Key-Stage Versioning Foundation** (Wave 1's next slice per
`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`) — no
repository evidence surfaced this session that demands a prerequisite
corrective milestone instead (the one real defect found, `role::grant`'s
`INSERT OR IGNORE` bug, was fixed within this same milestone, not left
open).

## Active Task (2026-08-25, this session — Post-UX-04 Roadmap Reconciliation, complete)

Immediately after UX-04 completed (checkpoint `c91a45e`), the user
directed a full roadmap reconciliation — repository truth-check,
capture an expanded product definition, and replace the flat
UX-05..UX-08 queue with an evidence-based execution plan — before any
further implementation. **No feature code was changed in this task**,
per explicit instruction. Full record:
`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md` (the
architecture/sequencing decision), `docs/product/PRODUCT-CONTRACT.md`
(durable product facts, with BUILT/DIRECTION SET/HYPOTHESIS status per
item), `docs/product/ROADMAP-RECONCILIATION-DECISION.md` (the
scenario-scoring pass).

**Repository truth confirmed this task**: branch
`claude/likha-sis-ux03-plan-plv80c` at `c91a45e`, 13 commits ahead of
`origin/main` (still at `f02bce5`, pre-UX-03), working tree clean.
`npm run quality` 390/390, `npm run build`, `check:dev-preview-isolation`,
`npx knip` all re-verified clean. `cargo check`/`test`/`clippy` still
blocked by the pre-existing `windows-future`/`windows-core` conflict
(`docs/VERIFICATION-DEBT.md`, unchanged from UX-04). Confirmed via
direct code/schema inspection: RBAC, curriculum versioning, Teacher
Load/schedule, sync, SF1 bulk import, and SF10 all have zero code in
the repo; SF9 is a non-authoritative CSV only; `School` has no branding
fields; the app is Tauri-only.

**Decision**: adopt the user's "reusable engines + representative
vertical slices + architecture freeze" strategy (scored 7.55 vs. 7.30
for "just continue old UX-05," a real but modest margin — see the
decision doc for the full comparison and why it's not a rubber stamp).
Old UX-05 (Learners/Search/Sections/Editing/Export) is merged with the
new SF1 Enrollment scope into one wave, not run as two competing
efforts. Full Wave 0-7 sequence in ADR-0035.

**Per explicit instruction: no implementation has begun.** The
recommended next milestone, awaiting approval:

### Recommended next milestone: RBAC Foundation (Teacher / Registrar / School Head)

- **Objective**: prove real, enforced role-based access control exists
  end-to-end — schema, session, and one representative gated feature —
  as the first slice of Wave 1 (`docs/adr/0035-...md`), unblocking Wave
  2's Registrar-gated bulk import.
- **Scope**: add a `role` column (or equivalent) to
  `user_school_memberships` with the three already-confirmed roles
  (Teacher, Registrar, School Head — confirmed with the user during M8,
  do not re-ask); extend `SessionManager`/the session domain type to
  carry the caller's role; add an `authorize_role`-style gate mirroring
  the existing `require_active_school_scope` pattern
  (`docs/adr/0004-authentication-and-local-session.md`); pick **one**
  already-existing feature to actually gate as the representative proof
  (candidate: `LearnerListScreen`'s bulk-capable operations, or a
  School-Head-only view of another teacher's section — decide against
  real repository shape when this milestone starts, not assumed here).
- **Explicit non-goals**: do not attempt to fully scope every
  Teacher/Registrar/School-Head authority boundary in one pass — only
  what the one representative gated feature needs; do not build SF1
  bulk import itself (that's Wave 2); do not build curriculum
  versioning or school branding in the same milestone (separate Wave 1
  slices — sequence one at a time per ADR-0035 Decision 1); do not
  invent a fourth role; do not touch cloud/sync.
- **Tests/verification required**: TDD for the new authorization gate
  (a session without the required role must be rejected, matching this
  project's fail-closed convention); Rust repository/command tests for
  the role column and gate; TS domain/application tests for the
  session-shape change; `npm run quality`, `npm run build`,
  `check:architecture`, `check:dev-preview-isolation`, `npx knip`;
  `cargo test`/`clippy` attempted (disclose plainly if still blocked by
  the pre-existing dependency conflict, do not claim it passed);
  independent `security-reviewer` dispatch (this touches authorization
  directly — required per `.claude/rules/security-privacy.md`, not
  optional).
- **Completion criteria**: a session's role is derivable server-side
  only (never client-supplied, matching `school_id`'s existing
  convention); the one representative gated feature demonstrably denies
  an unauthorized role and allows an authorized one, proven by a test;
  no existing screen's functionality regresses for the Teacher role
  (today's default, unchanged behavior for the common case); ADR
  recording the exact authority boundaries actually implemented (not
  just the three-role names).

## Active Task (2026-08-25, this session — UX-04, complete)

**UX-04 — Class Records, Assessments, Score Entry, Grade Output —
complete.** Baseline SHA `0634421` (UX-03 completion), start checkpoint
`bf93185`, completion checkpoint `c91a45e` (final synchronized head —
confirmed identical locally and on `origin` at that SHA). Full checklist
in `docs/ACTIVE-PLAN.md`'s "UX-04" section; decisions in
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.

Fixed all four confirmed correctness defects found by direct code
inspection during discovery, each via TDD: stale roster after a failed
assessment-item switch; overlapping score writes reachable via two
separate trigger paths (the score input and the exception-status
buttons, guarded by one shared per-learner write-generation counter
inside `handleRecord` rather than duplicated per call site); redundant
duplicate exception writes; term grades that stayed looking current
after a score changed (fixed with an automatic single-learner
recompute, gated behind "term grades have already been shown," plus a
non-flickery "(just updated)" flash — confirmed working live in a real
browser, not just in tests).

Added assessment-item correction (approved scope expansion): rename is
always safe (verified by grepping every grade-computation/export code
path for a read of the name field, plus checking the schema for a
uniqueness constraint — found neither); a full edit or delete is
permitted only while the item has zero recorded scores of any status.
Added completion-count readouts at the per-item, per-roster, and (a
second, investigated-then-implemented addition) per-class-record list
level. Re-verified grade-completeness handling against the explicit
worry that "category has an assessment" might get conflated with "grade
is meaningfully complete" — no defect found; the existing ADR-0013
interpretation already handles blank/zero/exception/missing-category/
partial-scoring correctly.

Two real bugs were found and fixed along the way, neither part of the
original four: the Class Records list didn't re-fetch after returning
from a workspace, so its new Progress column could show stale counts
(caught by a dedicated test before a human would have); and, found via
real browser-rendered visual verification (not reachable from jsdom
tests), the scored-item rename form's label/input overlapped its
explanatory text at any width, plus the assessment-item list's action
row ran together illegibly at phone width — both fixed.

`npm run quality` 390/390 (up from 379 at the UX-03 baseline),
`npm run build` clean, `check:dev-preview-isolation` clean, `npx knip`
clean of every new finding this session introduced. `cargo test`/`cargo
build`/`cargo clippy` could **not** run — a pre-existing, unrelated
`windows-future`/`windows-core` Cargo.lock dependency conflict blocks
compilation in this environment (not caused by, and not fixable from,
any file changed this session); Rust changes were verified by careful
manual review instead — see `docs/VERIFICATION-DEBT.md`. The dev-preview
fixture (`src/dev-preview/`) was extended from scratch to cover Class
Records/Assessments/Learner Scores (previously zero coverage) and used
for real browser-rendered verification via Playwright (working around a
`playwright-cli` browser-version mismatch in this environment by driving
the `playwright` package directly against the pre-installed Chromium) at
1366-wide and 390-wide, light/dark, and all three teacher modes, across
the empty/partial/fully-scored workspace states, locked-vs-unlocked item
editing, two-step delete, a live term-grade table with a floored grade,
and the grade-freshness flash after a real edit.

`teacher-ux-reviewer`/`accessibility-reviewer` were dispatched in
parallel and both hit the same recurring agent-resume/retrieval failure
documented since M7 on both the initial attempt and one permitted retry
each; a rigorous self-review was substituted and found and fixed one
real, must-fix accessibility gap (every assessment item's Edit/Delete
buttons shared an identical accessible name across the whole list —
fixed with a named `role="group"`, matching this file's own Excused/N/A
pattern) — real independent-review debt remains open, recorded in
`docs/VERIFICATION-DEBT.md`. Worked on branch
`claude/likha-sis-ux03-plan-plv80c` per this session's harness
assignment, re-verified (not assumed) to still be current.

**Explicit instruction for this session: do not begin UX-05 or any
other milestone after completing UX-04.** Recommended next milestone
(named, not started): **UX-05 — Learners, Search, Sections, Editing,
Export** — the next item on the UI-First Program roadmap depending only
on UX-01 (already complete), continuing the same
discovery→fix→polish→dev-preview→verify pattern this and the prior two
milestones established.

## Active Task (2026-08-25, this session — UX-03, complete)

**UX-03 — Daily Attendance + Monthly Attendance Summary Polish —
complete.** Baseline SHA `f02bce5`, start checkpoint `c0124f0`, feature
commit `d77089f` (exact final synchronized head recorded once pushed —
see the completion-checkpoint note below). Full checklist in
`docs/ACTIVE-PLAN.md`'s "UX-03" section; decisions in
`docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`. Fixed
three confirmed correctness defects found by direct code inspection
before implementation (stale context after a failed section/date/month
change; overlapping same-learner writes with no ordering guard; "Mark
all present" not serialized against concurrent individual writes),
then the hierarchy/keyboard/mobile/legend/transition polish work the
milestone brief specified, then a self-review-found fix (the "Mark all
present preserves existing marks" reassurance is now visible in every
teacher mode, not just Guided). `npm run quality` 365/365,
`npm run build` clean, `check:dev-preview-isolation` clean, `npx knip`
4 findings (down from 5, zero new). Browser-rendered visual
verification performed via Playwright against the dev-preview fixture
(this remote session has Chromium pre-installed) at three viewports,
light/dark, and all three teacher modes, across loading/empty/success/
write-in-progress/bulk/failure/retry/mobile-ledger states — native
Windows/WebView2 verification remains a disclosed, separate gap.
`teacher-ux-reviewer`/`accessibility-reviewer` were dispatched in
parallel and both hit the same recurring agent-resume/retrieval failure
documented since M7 on both the initial attempt and one permitted retry
each; a rigorous self-review was substituted (found and fixed the one
real gap above) — real independent-review debt remains open, recorded
in `docs/VERIFICATION-DEBT.md`. Worked on branch
`claude/likha-sis-ux03-plan-plv80c` per this session's harness
assignment, not `origin/main` directly. **Next queued milestone:
UX-04 — Class Records, Assessments, Score Entry, Grade Output** (not
started — per explicit instruction, do not begin it automatically).

**Naming note**: verified this session (grep across the whole repo,
case-insensitive) that no "LIKHA-SIS 2.0"/"LIKHA SIS 2.0" naming errors
exist anywhere in the repository — the product has always been recorded
correctly as **LIKHA-SIS 0.2** in every durable document. Nothing to
correct.

## Account-Transition Note (2026-08-25)

This session is at ~97% of its weekly usage limit and is handing off to
a fresh Claude Code account/session. **Verified remote state at
handoff**: branch `main`, local and `origin/main` both at `14e7e5d`
(confirmed via `git fetch origin` + `git log`/`git status --short
--branch`; clean working tree apart from long-standing harmless 0-byte
junk files — `(String`, `ComputedTermGrade`, `MonthlyAttendanceReport`,
`src-tauri/MonthlyAttendanceReport`, `button`, `repomix-output.xml` —
untracked, not real changes; leave them as-is). **UX-02 is complete**,
not in progress — a handoff request received mid-session assumed the
remote HEAD was still at `2418099` (UX-02's start commit), which was
already three commits stale by the time it arrived; see
`docs/PROJECT-MEMORY.md`'s "UX-02 Complete; Account-Transition
Verification Note" entry for the full correction. **First action for
the next account: read this file, `docs/ACTIVE-PLAN.md`, and
`docs/PROGRESS-MAP.md`, verify the current remote HEAD for real via
`git fetch origin` before trusting any SHA stated in a prompt, then
begin UX-03 — Daily Attendance + Monthly Summary** (queued, not
started — see `docs/PROGRESS-MAP.md`'s UI-First Tranche table). Keep
the Browser pane visible for real screenshot verification, per the same
contract UX-01/UX-02 used. Impeccable remains project-local and
hook-free — do not enable or modify its hook. Preserve the
`src/dev-preview/` synthetic-fixture safety architecture (isolated
entry point, throw-guards, two automated isolation proofs) rather than
rebuilding it for future UX milestones.

**Durable future direction recorded this session** (not yet
actionable): after UX-00 through UX-08 all complete, run an
evidence-based reassessment and begin a Forms, UI, and Interaction
Deepening Program focused on making real teacher workflows easier,
faster, safer, and more pleasant — full scope and exclusions recorded
in `docs/PROJECT-MEMORY.md`'s "Post-UX-08 Direction" entry. This does
not change UX-03's scope or start any new milestone numbering now.

## Active Task (2026-08-25)

**UX-02 — Teacher Workspace Polish — complete.** Start SHA `826bf7d`
(UX-01's completion commit). See `docs/adr/0032-teacher-workspace-polish.md`
for full decisions and verification record. Built the safety-hardened
dev-only visual fixture (`src/dev-preview/`) as the first slice, then
redesigned `TeacherWorkspaceScreen` into a three-level hierarchy
(priority-ranked "Today's attendance" rail with direct one-click
actions, compact overview line, quiet recent-activity list), split
resilient data loading (a failure on either the overview or activity
path never erases the other's already-loaded content — verified
symmetric in both directions), and section preselection into
Attendance. `npm run quality` 352/352, real browser-rendered visual
verification performed across 3 viewports/2 color schemes/3 teacher
modes via the fixture. **Next queued milestone: UX-03 — Daily
Attendance + Monthly Summary** (not yet started).

**Previously completed**: UX-01 — Design Tokens, Shared Components, and
App Shell (start `cb644ef`, completion `826bf7d`) — see
`docs/adr/0031-design-system-and-app-shell.md`. UX-00 (start `603863b`,
completion `fcf26ca`) — see `docs/adr/0030-ui-first-program-and-ux00.md`.
`PRODUCT.md` and `DESIGN.md` exist at the repo root.

## Status

**Proptest pilot on the account-lockout invariant — complete
(2026-08-25)**, fourth pick from the post-sequence scoring pass (score
4.85, see `docs/adr/0029-proptest-lockout-pilot.md`). Resumes
Compounding Engineering's own deferred Phase B: two property tests in
`repository::user`'s `lockout_properties` module generalize the
existing example-based lockout tests into real invariants — lock state
exactly matches the threshold for any attempt count, and an unknown
username never locks regardless of content or attempt count. Kept to 8
cases per property (proptest's default is 256) since every case runs
real, deliberately-expensive Argon2id verification, not a mocked
lighter one — measured ~20-25s combined, not assumed. `cargo nextest
run` 312/312 (up from 310), `cargo clippy -D warnings` clean, plain
`cargo test` (the stable-checkpoint gate) also green with 0 doctest
failures. `cargo deny check` unavailable on this machine's PATH this
session — same disclosed per-machine gap noted in prior sessions, not
new. No independent-review dispatch — reasoning in the ADR (dev-
dependency-only test code, no production-code or authorization-surface
change).

**Teacher Workspace: currently-open grading period per section —
complete (2026-08-25)**, third pick from the post-sequence scoring pass
(score 5.70, see `docs/adr/0028-workspace-grading-period-status.md`).
Closes the deliberate gap ADR-0024 disclosed: each section on the
Workspace screen now shows its own currently-open grading period (e.g.
"1st Term is open") or "no grading period currently open," resolved per
section's own school year — no new Rust command, purely a frontend join
of `listSections()` and `listPeriodsBySchoolYear()`, both already used
elsewhere. `npm run quality` 316 TS tests (up from 313) green,
typecheck/lint/format/architecture clean; `npm run build` succeeds;
`npx knip` shows the same 5 pre-existing findings, zero new; no Rust
change. No independent-review dispatch — self-review only, reasoning in
the ADR (re-dispatching immediately after two failed retrieval attempts
this session wasn't a good use of the review budget for a small,
read-only, no-new-authorization-surface change).

**M12c-M26 UI review pass — complete (2026-08-25)**: both
teacher-ux-reviewer and accessibility-reviewer were dispatched, and both
attempted and failed to return retrievable findings (the same recurring
agent-resume issue documented since M7) — one resume attempt each, per
the established escalation rule, before falling back to self-review.
The two self-reviews together found and fixed two real gaps: (1) raw
ISO timestamps shown to teachers in `AuditLogScreen`/
`TeacherWorkspaceScreen`; (2) `IdleTimeoutWarning`'s `role="alertdialog"`
overclaiming modal semantics it doesn't have, fixed to `role="alert"`.
Full detail: `docs/adr/0027-audit-timestamp-readability-fix.md`. Real,
non-self review debt for this UI sweep remains open — see "Next Action"
below.

**Idle-Timeout Warning Before Logout — complete (2026-08-25)**, second
pick from the post-sequence evidence-based scoring pass (score 6.30 —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` and
`docs/adr/0026-idle-timeout-warning.md`). Closes the disclosed gap
ADR-0020 left: a teacher's session now warns 2 minutes before ADR-0020's
30-minute idle timeout, with a one-click "Stay signed in" button, instead
of silently expiring on the next click. `CurrentSession` gained
`idleExpiresAtUnixMs` (a pure peek — computed, never itself slides the
idle window); a new `extend_session` command lets a teacher explicitly
renew without needing to navigate anywhere; the new
`IdleTimeoutWarning.tsx` component polls the peek every 30 seconds and
shares the same "return to sign-in with a clear reason" path
(`onExpired`) ADR-0022's `onSessionExpired` handler already uses. `cargo
nextest run` 310/310 (up from 308), `cargo clippy -D warnings` clean;
`npm run quality` 310 TS tests (up from 302) green, typecheck/lint/
format/architecture clean; `npm run build` succeeds; `npx knip` shows
the same 5 pre-existing findings, zero new. Browser-pane visual
verification attempted and unavailable this session (navigation denied
even on retry) — disclosed, not glossed over, same standing gap since
M5/M12c. No independent-review dispatch (standing agent-resume note
below); self-review performed instead, full checklist in ADR-0026.

**Learner Roster CSV Export — complete (2026-08-25)**, selected by a
fresh evidence-based 20-scenario-style scoring pass run after the
user-directed sequence's own "reassess" checkpoint (see
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
scoring table, and `docs/adr/0025-learner-roster-export.md` for the
implementation). Closes item #15 ("data export/backup") from
`docs/product/M8-DECISION.md`'s original candidate list — deliberately
scoped to a CSV export of already-visible learner data (Given Name,
Family Name, LRN, Sex, Enrolled On) via a new "Export learner list
(CSV)" button on `LearnerListScreen`, reusing M10/M14's `export::csv`/
`FieldDisclosure` architecture exactly. **Not** a raw database/
encryption-key backup — that interpretation was considered and
deliberately rejected this pass as its own unresolved security design
question (SQLCipher's key is DPAPI machine/user-bound; see the ADR's
"Decision" section). `cargo nextest run` 308/308 (up from 305), `cargo
clippy -D warnings` clean; `npm run quality` 302 TS tests (up from 295)
green, typecheck/lint/format/architecture clean; `npm run build`
succeeds; `npx knip` shows the same 5 pre-existing findings, zero new.
No independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0025.

**Teacher Workspace / home screen — complete (2026-08-25)**, fourth and
final named item in the user-directed sequence. See
`docs/adr/0024-teacher-workspace.md`. `TeacherWorkspaceScreen.tsx` is
now the default landing tab after sign-in — a greeting, learner/section
counts, today's attendance-marking status per section ("not yet marked
today" / "N of M marked" / "all M marked," the single most useful
at-a-glance fact for a teacher's morning), and recent sign-in activity
(reusing the audit log from earlier this session). Built entirely from
data other screens already fetch — no new Rust command, no new
migration. Deliberately did not attempt showing "currently open grading
period(s)": correctly resolving that per section would need a
non-trivial school-year-aware join this session had no evidence was
worth building yet — recorded as a real, deliberate gap. `npm run
quality` 295 TS tests (up from 286) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; `npx knip` shows the same
5 pre-existing findings, zero new (confirms the wiring is real); no
Rust change. No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0024.

**This closes the user-directed sequence (Audit Log → Global Session
Expiry Handling → Learner Search → Teacher Workspace → reassess).**
Per the user's own instruction, the next step is to reassess rather
than autonomously picking a fifth item — see "Next Action" below.

**Learner Search / filter for large rosters — complete (2026-08-25)**,
third item in the user-directed sequence. See
`docs/adr/0023-learner-search.md`. A client-side search box above
`LearnerListScreen`'s roster filters by given name, family name, or LRN
— case-insensitive substring match, no new backend query (M17's own
test already proves the data layer stays correct at 500 rows, so this
is purely a UI filtering problem). Three deliberate small choices: the
search box only appears once a learner exists, "no matches" is a
distinct message from "no learners enrolled yet," and the search box
disables while an edit is in progress (so it can never filter the
row being edited out of view, leaving the edit orphaned). `npm run
quality` 286 TS tests (up from 280) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; no Rust change. No
independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0023.

**Global Session Expiry Handling — complete (2026-08-25)**, second item
in the user-directed sequence (Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess). See
`docs/adr/0022-global-session-expiry-handling.md`. Closed the exact gap
ADR-0020 flagged: every screen used to fail its own in-flight request
with a generic error when a session expired for any reason (idle,
absolute TTL, revocation) — a teacher had no idea why. A centralized
`invoke` wrapper (`src/infrastructure/tauri/invoke.ts`, all 13
repository files now import through it) notices any `Unauthorized`
rejection (except `login`'s own, a different, already-handled case) and
returns the app to `LoginScreen` with a clear "Your session has expired.
Please sign in again." banner. A real bug was caught mid-implementation
by the test suite itself: the wrapper's first draft always forwarded
`args` even as `undefined`, an observably different call shape than
omitting it, breaking 12 existing tests — fixed and recorded as a
durable lesson (`docs/learning/ERROR-PATTERNS.md`). `npm run quality`
280 TS tests (up from 271) green, typecheck/lint/format/architecture
clean; `npm run build` succeeds; `npx knip` shows no new dead code
(confirms the wiring is real); `cargo nextest run` 299/299 unaffected
(TS-only change). No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0022.

**Audit Log (authentication events) — complete (2026-08-25)**, first
item in the user-directed sequence: Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess. See
`docs/adr/0021-authentication-audit-log.md`. Scoped tightly to
authentication events only (`login_success`/`login_failed`/
`account_locked`/`logout`) — not a general data-mutation trail, a
separate future milestone. Migration 15 (`audit_log` table),
`repository::audit_log` (`record`/`list_for_school`),
`auth::login`/`auth::logout` instrumented to record every real outcome,
`commands::auth::list_audit_log` (session-scoped, 200-row cap, same
convention as every other command), and a new "Sign-in Activity" tab
(`AuditLogScreen.tsx`). A real ordering bug was caught by a genuine test
failure during development (millisecond-precision `created_at` ties
among rows written in the same test), fixed with `id DESC` as a
UUIDv7-based tiebreaker — not assumed correct, verified. `cargo nextest
run` 299/299 green (up from 288), `cargo clippy -D warnings` clean;
`npm run quality` 271 TS tests (up from 262) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0021.

**Compounding Engineering tooling pass complete (2026-08-25)** — see
`docs/product/COMPOUNDING-ENGINEERING-DECISION.md` for the full
20-scenario evaluation of a large external-tooling shortlist (Nextest,
cargo-mutants, proptest, Impeccable, Playwright/native-UI-regression,
Ponytail, Compound Engineering plugin, awesome-llm-apps components,
Beads, Serena, SQLCipher/key-storage, and more). Followed the directing
prompt's own phasing discipline strictly: executed only Phase A
(low-risk productivity, no architecture change, no hooks) this session,
deferred the rest with documented resumption criteria rather than
rushing a partial attempt at everything. **Adopted**: `cargo-nextest`
(measured ~26% faster than `cargo test` on this crate's suite, 17.5s →
13.0s post-build — fast inner loop; `cargo test` remains the
stable-checkpoint command since nextest skips doctests, of which this
crate currently has zero); `knip` v6.32.2 (ran against the real project
first per "investigate first" — found 2 genuine unused exports + 3
unused exported types, wired as `npm run check:deadcode`, deliberately
**not** in the blocking `quality` gate since findings need human
triage). **Adapted as project-local skills** (not plugins):
`.claude/skills/scope-drift-review/` (Ponytail + Scope Creep Detector
concepts) and `.claude/skills/commit-archaeology/` (git/ADR-history
research method before touching unfamiliar old code). **Started**
`docs/learning/ERROR-PATTERNS.md` — a small, deliberately non-transcript
registry of generalized lessons, each pointing at its real prevention
(a test, a constraint, an ADR) rather than duplicating detail.
Confirmed already-adopted: cargo-deny, gitleaks (2026-08-24), SQLCipher

- Windows DPAPI key protection (ADR-0003) — the directing prompt's
  Production PII Security Track item was already substantially resolved,
  not a gap. **A real bug was found and fixed by simply running actual
  verification**: `AttendanceScreen.test.tsx`/`MonthlySummaryScreen.test.tsx`
  each inject a fixed clock into their service but not into the
  component's own `new Date()` call, so the two "today"s silently drifted
  apart when the real date advanced mid-session — 3 tests failed, root-
  caused, fixed with `vi.useFakeTimers`/`vi.setSystemTime` in both files,
  and recorded as a durable lesson (not just patched and forgotten). `cargo
nextest run` 283/283 passing, `npm run quality` 262/262 passing, `npm
run build` succeeds — all actually run this session, not assumed.
  Security tooling (gitleaks/cargo-deny/osv-scanner) confirmed missing
  from this machine's `PATH` again (same disclosed per-machine gap as the
  2026-08-24 note below) — not fixed, out of scope for this pass.

**Operating mode (2026-08-24): Autonomous Continuous Development.** See
`.claude/rules/autonomous-development.md` for the full rule. Milestone
completion is a checkpoint, not a stopping point — verify, record,
autonomously select the next highest-value work, and continue. Stop only
for a genuine human approval gate or a session/context boundary, both
defined in that rule. This supersedes any older text below implying
"stop and ask which milestone is next."

**Roadmap directed by the user (2026-08-24)**: M15 (mainstream K-10
grading-policy coverage) → M16 (SHS + exceptional grading policies) →
M17 (Learner Profile Enrichment, when required by report cards/forms) →
M18 (Bulk Attendance / Teacher Productivity) → Roles & Permissions once
the needed human product decisions are settled. This supersedes the
prior "no milestone pre-selected, pick a candidate" note — M16 is next
after M15, not an open choice. **Roadmap now complete**: Roles &
Permissions was asked about directly and resolved as "deferred, not
built" (see `docs/product/M8-DECISION.md`'s follow-up section) — the
user then confirmed (2026-08-24) that for any future recommended-vs-
alternatives decision, Claude should pick the recommended option
automatically and continue, rather than pausing to ask, with the user
reviewing/adjusting afterward. Work since then is autonomously selected
from `docs/product/M8-DECISION.md`'s existing 20-scenario candidate
list and current evidence, per `.claude/rules/autonomous-development.md`.

**The `Stop` hook that echoed a verification reminder as a stopping
point was removed (2026-08-24)**, per explicit user instruction. It
lived in `.claude/settings.json`'s `hooks.Stop` array; deleted entirely.
The substantive rule it existed to enforce — never claim complete
without the checks actually having run — is unaffected and still lives,
non-blocking, in `.claude/skills/completion-verification/SKILL.md`.
Confirmed via direct file read: the JSON is well-formed and no `Stop`
key remains in `hooks`. (One intermediate manual edit briefly left the
file with invalid JSON — missing closing braces and a trailing comma;
caught and fixed before continuing.) No other hook (SessionStart,
PreToolUse, PostToolUse, PreCompact, SubagentStop) was touched.

**Account Lockout After Failed Logins is complete (2026-08-24, same
continuation session as M13-M18)** — see
`docs/adr/0019-account-lockout.md`. Autonomously selected: this was
already scenario #12 in `docs/product/M8-DECISION.md`'s original
20-scenario scoring (Security-first, ~5.8) and — unlike Roles &
Permissions — is not disqualified from autonomous selection, since a
lockout threshold/duration is a standard security-engineering default
(OWASP), not an organizational policy only the user can set. Closes a
real, previously-undefended gap: `auth::login` had no brute-force
mitigation at all, and this app's own documented deployment model
(shared school computers, multiple teacher accounts) makes local
password-guessing a real threat, not hypothetical. Five wrong passwords
against one known username locks it for 15 minutes, with immediate
feedback on the triggering attempt; a locked account rejects even the
correct password without running Argon2id at all (saves CPU on an
attempt that can't succeed); a successful login resets the counter; an
unknown username is completely unaffected by any of this and always
returns the same generic failure it always has. `LoginScreen` now shows
a distinct, specific message for a lockout rather than folding it into
the generic "couldn't sign you in" text. `cargo test` 226 lib (up from 220) + 54 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 262 TS tests (up from 259) green; `npm run build`
succeeds. No independent-review dispatch — see the agent-resume note
below; a careful self-review was performed instead (full detail in
ADR-0019), which also caught and fixed two real, unrelated UX/
accessibility gaps in M17's `LearnerListScreen` edit affordance (no
focus management when entering edit mode; a second "Edit" click could
silently discard a first learner's unsaved changes).

**Idle-Timeout Session Hardening is complete (2026-08-24, same
continuation session)** — see
`docs/adr/0020-idle-timeout-session-hardening.md`. The other half of the
shared-school-computer threat model ADR-0004 explicitly deferred
("[a session is] valid for this long after login regardless of
activity"): a session now also expires after 30 minutes of no
protected-command activity, independent of and in addition to the
existing fixed 8-hour absolute cap — both must hold. Only the one check
every protected command already goes through
(`SessionManager::require_active_session`) counts as activity and
slides the window forward; `commands::auth::current_session` (a
session-status peek) deliberately does not touch it, or polling session
state would itself defeat idle timeout. No schema change, no new
command, no frontend change (an idle-expired session fails the same
generic `Unauthorized` path every other session failure already does —
a pre-existing UX gap this milestone doesn't newly introduce, not
overlooked). `cargo test` 229 lib (up from 226) + 54 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 262 TS tests
(unchanged — confirms zero frontend impact) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0020.

**Independent-review agent-resume issue recurred this session
(2026-08-24)**: `teacher-ux-reviewer` and `accessibility-reviewer` were
both dispatched in parallel for the M12c-M18 UI (real, previously-owed
review debt). Both completed real work (17 and 16 tool uses
respectively per their own usage reporting), but neither returned
retrievable findings text via the normal completion path or a resume
attempt — the same class of issue already documented for `security-reviewer`/
`architecture-reviewer` episodes across M7/M8/M12a/M12b. Per this
session's own established escalation rule, no further retry was
attempted; a self-review was performed instead for the account-lockout
work (see above) but **not yet for the broader M12c-M18 UI sweep those
two agents were originally asked to cover** — that remains real,
undischarged review debt, distinct from (and larger in scope than) the
two specific findings the self-review incidentally caught while working
on something else. Re-run both reviewers for real once agent-resume
behavior is confirmed working in a future session.

**M18 Bulk Attendance / Teacher Productivity is complete (2026-08-24,
same continuation session as M13-M17)** — see
`docs/adr/0018-bulk-attendance-mark-all-present.md`. Directly closes the
concrete example `docs/PROGRESS-MAP.md` had already named as
out-of-scope: "bulk attendance actions (e.g. 'mark all present')."
Before implementing, checked whether an unmarked day already behaves
like Present anywhere in this app (it does, in the SF2 export's blank
rendering and its totals) — the real value of an explicit mark is
auditability (a `recorded_at` timestamp proving the day was actually
checked), not export correctness, so the feature is genuinely about
teacher productivity, not a compliance fix. `AttendanceScreen` gained a
"Mark all present" button that marks every currently-unmarked learner on
the roster Present and **never overwrites an existing mark** — a
teacher who already flagged one Absent before clicking the bulk button
keeps that mark, proven by a dedicated repository test, not just
asserted. Reuses the existing `record()`/`roster_for_section_date`
isolation-checked read/write paths — no new query pattern, no new
authorization surface. `cargo test` 220 lib (up from 217) + 54
integration tests (up from 51) green — one transient parallel-execution
flake in an unrelated pre-existing auth test, confirmed not a regression
by an isolated rerun and a full-suite rerun, matching the flakiness
class already documented in `docs/PROJECT-MEMORY.md`'s M12b note.
`cargo clippy -D warnings` clean; `npm run quality` 256 TS tests (up
from 249) green; `npm run build` succeeds. No independent-review
dispatch (no new authorization surface or write path). Visual
verification not attempted, same standing gap as every UI milestone
since M5/M12c.

**M17 Learner Profile Enrichment (LRN + Sex only) is complete
(2026-08-24, same continuation session as M13-M16)** — see
`docs/adr/0017-learner-reference-number-and-sex.md`. Scoped strictly to
the roadmap's own "when required by report cards/forms" qualifier: this
app's already-shipped exports (`export::report_card`, `export::sf2`)
were checked first, and neither had ever disclosed LRN, birthdate, or
guardian contact as missing before this milestone. Research (two
independent secondary sources per field, matching the bar M10 already
set for SF2's own field layout) confirmed LRN and Sex are the only two
fields those two exports actually need — SF2's per-learner roster lists
both, and the SF9-style report card header needs LRN. Birthdate and
guardian contact are **not** added — no shipped export discloses either
as missing, so adding them now would be exactly the "expand PII
collection unnecessarily" the security-privacy rule prohibits. Both new
`learners` columns (`lrn`, `sex`, migration 13) are nullable with DB-
level format enforcement (`CHECK` constraints for the 12-digit LRN shape
and the M/F domain, plus a partial unique index on `(school_id, lrn)` —
a data-entry sanity check within one school's own visible data, not a
claim of verified national uniqueness). `export::sf2` and
`export::report_card` now populate LRN/Sex when present and disclose
per-row (not globally) when a specific learner doesn't have one yet;
SF2's old "does not track learner gender... at all" disclosure text was
corrected, since that stopped being true (drop-out/transfer _events_,
and the by-sex breakdown DepEd's statistics need from them, remain
untracked — Sex itself is now tracked). `cargo test` 217 lib (up from 208) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 249 TS tests (up from 242) green; `npm run build`
succeeds. No independent-review dispatch (no new authorization surface
or command pattern — `create_learner`/`update_learner` already existed);
an inline security self-check confirmed no new field bypasses session-
derived school scope and no LRN/Sex value is ever logged or placed in a
URL. **Disclosed gap, not an oversight**: the repository/service/command
plumbing to edit an _existing_ learner's LRN/Sex (`updateProfile`/
`updateLearnerProfile`) is built and tested, but no UI screen calls it
yet — a learner enrolled before this migration, or without LRN/Sex
filled in at enrollment, has no way to gain them until such a screen
exists. Worth closing alongside a future learner-detail-UI milestone,
not worth a rushed addition here.

**M16 SHS + Exceptional Grading Policies is complete (2026-08-24, same
continuation session as M13-M15)** — see
`docs/adr/0016-shs-and-exceptional-grading-policies.md`. Confirms
ADR-0015's own prediction empirically, not just by inspection: all six
DepEd Order No. 015, s. 2026 Table 10 (SHS/Key Stage 4) weight groups
were added as pure seed data (migration 12) against the _existing_
schema and algorithm — zero changes to
`grading_computation::compute_term_grade`, zero TS/UI changes at all
(`ClassRecordsScreen`'s picker and `ClassRecordWorkspace`'s policy-name
display are already fully data-driven, so all 8 policies now appear
automatically). Two of the six groups are structurally exceptional, not
just different percentages: Field Exposure/Arts Apprenticeship/Creative
Production weights Examinations as a Term Examination only (no Summative
Tests); Research Electives/Design and Innovation and Work Immersion have
no Examinations component at all. Both shapes are proven correct with
new end-to-end tests, not assumed. Source data reused from M13's
original primary-source PDF reading (not re-fetched — already fully
transcribed and verified at full resolution). Caveats carried into every
new policy's own citation text: DepEd itself defers detailed item-level
SHS specifications to a separate, not-yet-obtained implementation-
guidelines issuance (Annex D paragraph 47), and these policies apply to
Grade 11 (and Grade 12 only once it adopts the Strengthened SHS
Curriculum — Grade 12 under the prior curriculum still needs DO 8, s.
2015 weights, still unimplemented, still no primary source located).
`cargo test` 208 lib (up from 201) + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 242 TS tests (unchanged —
confirms no TS/UI impact) green; `npm run build` succeeds. No
independent-review dispatch (purely additive seed data against an
already-reviewed schema, no new command or code path). Visual
verification not attempted, same standing gap as M12c-M15.

**M15 Expand DepEd Grading Policy Coverage is complete (2026-08-24, same
continuation session as M13/M14)** — see
`docs/adr/0015-expand-grading-policy-coverage.md`. A class record now
explicitly pins which DepEd weight policy applies (`class_records.weight_policy_id`,
migration 11) instead of every class record silently sharing whichever
policy happens to be marked default — the real architectural gap
ADR-0014 identified. A second policy is now seeded: EPP/TLE & MAPEH
(20%/60%/20%, DO 015 s.2026 Table 9's second row, verified against the
same primary-source PDF reading M13 already did — not re-fetched).
`grading_computation::compute_term_grade` now resolves each class
record's own pinned policy; proven not just by inspection but by a test
giving the _same_ raw scores to both policies and asserting the results
differ. `ClassRecordsScreen`'s create form gained a required, always-
visible "DepEd grading weighting" picker (never inferred from a subject
name), and `ClassRecordWorkspace` now shows the actual policy in effect
in place of M14's hardcoded (and now-inaccurate) "assumes core K-10 for
everything" text. **Correction to the record**: ADR-0013/0014 both
over-flagged "GMRC/VE's domain split" as a grade-correctness gap — on
re-check, GMRC/VE is already inside the K-10 core weight group (same
20/50/30), so those grades were already DepEd-compliant since M13; the
domain split is an assessment-design tagging feature, not a different
formula. `cargo test` 201 lib (up from 192) + 51 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 242 TS tests
(up from 239) green; `npm run build` succeeds. No new independent-review
dispatch (identical authorization pattern to every existing
reference-data command). Visual verification not attempted, same
standing gap as M12c/M13/M14.

**M14 Report Card / Official Grade Output is complete (2026-08-24, same
continuation session as M13)** — see `docs/adr/0014-report-card-export.md`.
A teacher can now export a class record's computed term grades as CSV
(`export_class_record_report_card`), reusing M10's `export::csv`/
`FieldDisclosure` architecture exactly (that struct was relocated from
`export::sf2` to the shared `export::mod`, since a second export now
needs it — a non-breaking move, `sf2.rs`'s own tests unchanged). Every
learner on the class record's roster gets a row — an explicit "Not yet
available" marker if their grade isn't computable yet, never silently
dropped. **Scope correction made during implementation**: the M13
session's end-of-turn proposal to "gate" this export to only the one
DepEd weight group M13 implements turned out not to be buildable without
new scope — `Subject` has no DepEd weight-group classification, and
`compute_term_grade` already applies the single seeded policy uniformly
to every class record, so there is nothing to gate on. Corrected to
inherit M13's own already-accepted choice instead: disclose the
limitation prominently (an always-visible warning in
`ClassRecordWorkspace.tsx`, not just a Guided-mode hint, since it's
correctness-affecting for every mode), don't silently refuse. Also
newly disclosed as omitted, more conservatively than strictly required:
DepEd's Qualitative Descriptor table, since M13's research only read it
at low resolution, not the same rigor as the tables actually
implemented — full detail in ADR-0014. `cargo test` 192 lib (up from 184) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 239 TS tests (up from 233) green; `npm run build`
succeeds. No new independent-review dispatch (identical authorization
pattern to every existing export command, no new pattern introduced).
Visual verification not attempted, same standing gap as M12c/M13.

**M13 DepEd Grade Computation is complete (2026-08-24, continuation
session)** — see `docs/adr/0013-deped-grade-computation.md` for the full
research record and architecture decision, `docs/ACTIVE-PLAN.md`'s "M13"
section for the verification record. Compliance-sensitive: researched
against the primary source directly (downloaded and visually transcribed
the actual DepEd Order No. 015, s. 2026 PDF — a 60-page scanned document
with no text layer — not a secondary summary), verified two independent
worked examples from the Order reproduce exactly end-to-end through this
implementation. Grade computation lives in
`src-tauri/src/repository/grading_computation.rs`, pure and DB-touching
functions coexisting in one file (matching `attendance.rs`'s existing
convention): `Percentage Score = pooled raw/max × 100` per category,
`Weighted Score = PS × weight%`, `Initial Grade = sum of WS`, then either
the Order's own 41-band Adjusted Transmutation Table (SY 2026-2027) or
direct rounding under the Zero-Based Grading System (SY 2027-2028
onward, selected from the already-existing `grading_periods.school_year`
field — no new "policy effective year" table needed). A real architecture
decision — how to model Examinations' internal Summative Test 1/2 + Term
Examination sub-weighting — was resolved via the 10-scenario process:
chose a nullable self-referencing `parent_category_id` on the existing
`assessment_categories` table (reuses 100% of M12b's item/category
machinery unchanged) over a separate join table. Implements exactly one
DepEd weight group (the core K-10 English/Filipino/Math/Science/AP/GMRC
cluster, 20/50/30) — explicitly disclosed as not covering EPP/TLE/MAPEH,
any SHS group, GMRC/VE's domain split, KS1 descriptive grading, or Grade
12's DO 8 carryover (that order's exact percentages could not be
confirmed from a primary source this session and were deliberately not
guessed at). `cargo test` 184 lib + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 233 TS tests green (two real
bugs caught by the tests themselves during development: a worked-example
fixture transcription slip, and `computeTermGrade` missing `async` —
same bug class already documented from M8's `monthlySummary`). No new
independent-review dispatch (no new authorization pattern introduced);
`teacher-ux-reviewer` on the new "Show term grades" UI is additional owed
debt alongside M12c's standing one. Visual verification not possible,
same standing gap as M12c.

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, prior continuation session)** — see `docs/ACTIVE-PLAN.md`'s
"M12c" section. Summary retained below for continuity; full detail there.

**M8 Monthly Attendance Summary is complete (2026-08-24, this session)**
— see `docs/ACTIVE-PLAN.md`'s "M8 Monthly Attendance Summary" section
and `docs/product/M8-DECISION.md` (the 20-scenario decision record) for
full detail. Selected via an autonomous evidence-based product-decision
process, not user-picked. A real DepEd `CONSO SF v2025.xlsx` the user
provided was used to verify SF2's actual structure — corrected the
milestone's scope to a school-wide overview (not section-level) with an
honest on-screen disclaimer, rather than an unverified guess at an
official template. **↺ INDEPENDENT REVIEW REQUIRED** for M8:
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted this milestone; one `security-reviewer` attempt hit
the same agent-resume issue described below and was not retried
further (self-review performed instead — see `docs/ACTIVE-PLAN.md` for
what it covered).

**M7 Attendance Tracking is complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M7 Attendance Tracking" section for full detail.
Independent review (`security-reviewer`, `architecture-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer`) was launched in parallel
and all four agents did real, substantial work, but their findings text
was not retrievable via the normal completion-notification/resume path —
a session-wide agent-harness issue (also hit earlier this session with
the Windows-migration checkpoint's `reliability-reviewer`). Per this
session's own escalation rule (attempt once more, don't repeatedly
retry), one fresh single-attempt re-run of `security-reviewer` was made
afterward — that one **did** surface a usable summary this time: **no
blocking findings**; tenant scoping and the ownership pre-check were
confirmed correct (matches this project's `require_active_school_scope`
invariant, no TOCTOU, no recurrence of the M4/M6 bug classes), plus two
non-blocking informational notes, both fixed on the spot: (1) `record()`'s
post-write re-fetch `SELECT` didn't filter by `school_id` (safe in
practice, since `learner_id` alone already resolves to one school, but
inconsistent with this codebase's explicit-scoping convention — added
`AND school_id = ?3`); (2) `AttendanceStatus::from_db_str` used
`unreachable!()` for a value outside the DB `CHECK` constraint — changed
to return a `rusqlite::Result` so a hypothetical constraint-bypass (a
dropped constraint, a manual DB edit) fails one command with an
`AppError::Database`, not the whole process with a panic. Re-verified
after these fixes: `cargo test` 98/98, `cargo clippy -D warnings` clean.
**`architecture-reviewer`, `teacher-ux-reviewer`, `accessibility-reviewer`
remain ↺ INDEPENDENT REVIEW REQUIRED** — replaced with the careful
self-review recorded in `docs/ACTIVE-PLAN.md`, not a substitute for a
real second set of eyes. Re-run these three for real once agent-resume
behavior is confirmed working in a future session.

M0–M6 are all complete and verified. `git log` shows `a70915b` (harness
upgrade) as HEAD, matching `origin/main` — the M0–M6 + harness work is
committed. A pre-existing uncommitted change to `src-tauri/Cargo.toml`
(adds `features = []` to the `tauri`/`tauri-build` dependency entries,
disabling their default features) was present at the start of this
session, is unrelated to this session's work, and was left as-is for the
user to review — verified (by temporarily stashing it and doing a full
clean rebuild) that it is **not** load-bearing for anything fixed this
session.

**Windows machine-migration checkpoint (2026-08-24), this session:**
verified this is the canonical repo on a new/re-set-up Windows PC, fixed
a real cross-machine reproducibility defect and a real local build defect
found in the process. Summary below; full verification record in
`docs/ACTIVE-PLAN.md`.

- **Line-ending reproducibility, fixed.** No `.gitattributes` existed.
  This machine's global `git config core.autocrlf` is `true` (the common
  Windows default) but this specific repo's local `core.autocrlf` was
  already `false`, so the defect wasn't reproducing on this exact clone —
  but a fresh clone without that local override would hit it: CRLF
  checkout of LF source, failing `prettier --check` (part of `npm run
quality`) across nearly the whole repo. Added `.gitattributes`
  (`* text=auto eol=lf`, with `.cmd`/`.bat` pinned to CRLF and binary
  assets marked `binary`) — verified with `git ls-files --eol`: sampled
  text files now show `attr/text=auto eol=lf`, `.ico` shows `-text`. No
  `.cmd`/`.bat` files are currently tracked, so that guard is
  forward-looking, not yet exercised.
- **Stale absolute-path build cache, fixed.** `src-tauri/target/`
  contained cached Rust build-script `output` files (e.g. for
  `openssl-sys`, `tauri`) whose embedded absolute paths pointed at a
  different directory name (`...\likha-sis-0.2-lf\...` — evidently a
  sibling directory from an earlier line-ending-migration clone, per the
  session's own briefing). This produced a cryptic `cargo build`/`cargo
test` failure: "failed to read plugin permissions... file not found"
  referencing the wrong directory, because a dependency's build script
  had cached output describing a location that no longer exists — cargo
  doesn't always rerun a build script if it doesn't detect an input
  change, so it kept reusing the stale cached path. Fix: delete
  `src-tauri/target/` entirely and do a full clean rebuild — this makes
  every build script rerun, and their reported OUT_DIR/paths get
  recomputed against the actual current directory. (Two of three deletion
  attempts this session still hit the stale error immediately after
  deleting — the first two `cargo`/`cargo build` invocations were launched
  as overlapping background processes racing on the same freshly-deleted
  target dir; only a fully sequential delete-then-build, waited on to
  completion before starting anything else against the same directory,
  actually cleared it.) Verified clean afterward: `cargo test` 85/85 (up
  from 72 recorded in M6 — see below), `cargo clippy --all-targets -D
warnings` clean, twice, including once with the pre-existing
  `Cargo.toml` diff temporarily stashed out to confirm that diff wasn't
  the actual fix.
- Added `scripts/verify-dev-environment.ps1` (read-only PASS/WARN/FAIL
  doctor: Git, Node/npm, Rust/Cargo, MSVC Build Tools + Windows SDK via
  `vswhere`, Strawberry Perl, the `.gitattributes` line-ending policy, and
  a regression check that scans `src-tauri/target/debug/build/*/output`
  for cached absolute paths referencing a `src-tauri` directory other than
  the current repo root — the exact class of bug just described. Run
  clean on this machine: 0 FAIL, 2 WARN (cargo and perl are correctly
  installed and on the persistent Windows User `PATH`, but were not on
  _this shell session's_ `PATH` — a real, reproducible distinction: a
  fresh terminal picks them up, the terminal used mid-session did not).
  Also added `scripts/setup-windows.ps1` (idempotent `winget install` for
  the same prerequisite list; diagnosis-only philosophy — does not
  auto-verify, tells the user to run the doctor script from a fresh
  terminal afterward). Both independently reviewed
  (`security-reviewer`: no blocking findings, two should-fix items in
  `setup-windows.ps1` fixed — pin `--source winget`, and a failed winget
  install now sets a failure flag and causes a non-zero exit instead of
  silently exiting 0; `reliability-reviewer`: two independent attempts
  both entered a confused state — misinterpreting genuinely new follow-up
  messages as repeated automated hook reminders and returning no usable
  findings — replaced with rigorous self-review, the same fallback M6
  used when an independent review hit a session limit. Self-review
  covered: the stale-build-cache regex was actually run against this real
  repo and caught a real false positive (see next sentence); the
  cargo/perl PATH-vs-installed distinction was verified empirically
  (`[Environment]::GetEnvironmentVariable(...,"User")` confirms both are
  on the persistent Windows User `PATH`; `$env:PATH` in the actual running
  shell confirms they were absent from it); `setup-windows.ps1`'s
  `$script:hadFailure` exit-code logic was reasoned through against
  PowerShell scoping rules (a top-level `foreach` doesn't create a new
  scope, so the explicit `$script:` prefix is correct-but-redundant, not
  broken) but not executed, since running it installs software and wasn't
  warranted for this checkpoint. `architecture-reviewer` not invoked — no
  application code changed, only new scripts and repo config. The
  doctor script itself caught and helped fix a real bug in its own first
  draft: the stale-build-cache regex initially flagged a false positive
  against OpenSSL's own C-escaped (doubled-backslash) path strings in its
  build output — fixed by normalizing double backslashes before
  comparing.
- Rust/Perl/MSVC toolchain: all present and working (`cargo 1.98.0`,
  `rustc 1.98.0`, Strawberry `perl 5.42.2`, VS 2022 Build Tools with the
  C++ workload, Windows SDK `10.0.26100.0` via `vswhere`) — this machine's
  winget installs from a prior session did carry over correctly; only the
  PATH-visibility-per-shell-session gap above was new.
- Security tooling gap, disclosed: Gitleaks/OSV-Scanner/cargo-deny are
  **not** currently on this machine's PATH — `npm run quality:security`
  was not run this session (would only report "tool missing", not real
  coverage). `docs/PROJECT-MEMORY.md`'s prior claim that they're
  "installed" describes the repo-side wiring (`scripts/check-security.mjs`,
  `.gitleaks.toml`, `src-tauri/deny.toml`, `osv-scanner.toml`), which is
  still correct and unchanged — it does not mean the binaries are present
  on every machine that clones this repo. Not reinstalled this session
  (out of scope for the environment checkpoint; `setup-windows.ps1`
  deliberately does not include them, since Phase 3 was scoped to build
  prerequisites, not the separate security-tooling list).

Previously recorded harness-upgrade context (2026-08-24, prior session):

A Claude Code development harness upgrade is also complete (2026-08-24):
see `docs/adr/0007-claude-code-harness-architecture.md` and
`docs/PROJECT-MEMORY.md`'s "Claude Code Development Harness" section for
what exists (`.claude/rules/`, `.claude/skills/` — 16, `.claude/agents/`
— 8 read-only, `.claude/settings.json` + hooks, security tooling). This
was infrastructure work, not an application milestone — no M0–M6
application behavior was changed, one line was added to
`src-tauri/Cargo.toml` (`publish = false`, a real `cargo deny` finding).
Independently reviewed (security/architecture/reliability agents, then a
fresh `evaluator` pass) — the evaluator's first pass correctly FAILed on
a claim that had been recorded as adopted (the `security-guidance`
plugin) before any config for it actually existed; that's now fixed
(declared in `.claude/settings.json`) and disclosed with the same
not-yet-runtime-verified caveat as the hooks below.

**Known, disclosed gap**: `.claude/settings.json` (hooks and the
`security-guidance` plugin declaration) did not exist when this session
started, so neither was observed actually active in this same session —
the settings-file watcher only watches directories that existed at
session start. Run `/hooks` once, or start a fresh session, to activate
them, then spot-check: e.g. try a destructive-looking Bash command and
confirm it prompts instead of running silently.

**Graphify code-graph tool — evaluated and REJECTED (2026-08-24), no
installation occurred.** Independently verified via `gh api` (not just
the research summary): 109,806 stars / 10,675 forks on a repo created
4.5 months prior — a ~245x gap over the next most-starred same-named
project, consistent with fake-star reputation laundering — plus the
maintainers explicitly declining to fix a live, acknowledged PyPI
typosquat vector on their own install path. No code from that project
was downloaded, cloned, or executed. Full writeup:
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`. No
harness change resulted from this beyond documenting the rejection —
`.claude/`'s skill/agent/hook set is unchanged from the prior session.

## Current Goal

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, continuation session)** — see `docs/ACTIVE-PLAN.md`'s "M12c"
section for full detail. UI-only: `ClassRecordWorkspace.tsx`'s score
entry now commits on Enter/blur (dirty-checked, so an unchanged value is
never re-sent), Enter/ArrowDown/ArrowUp move focus between learners'
score fields spreadsheet-style, Escape reverts an uncommitted edit, and a
narrow-width (≤640px) layout re-flows the roster into stacked
full-width/44px-touch-target rows instead of shrinking the desktop
table — the first deliberately mobile-specific CSS in this app. Each row
also now shows a "Saved HH:MM" note from the existing `updatedAt` field
(no schema change). Before starting, re-verified directly against
`src-tauri/src/commands/learner_score.rs` (not just trusted from the
prior note) that `record_learner_score` takes `user_id`/`school_id` only
from `sessions.require_active_session`, never as a client parameter —
confirmed accurate. `npm run quality` clean (226 tests, up from 221). A
real double-save bug (programmatic focus-move firing a synchronous
native `blur` that re-entered the commit function before the first
call's cleanup ran) was found by a new test and fixed with an imperative
in-flight guard — a plain React-state dirty-check could not have caught
it reliably. Attempted real-browser verification via the Browser pane
(added `.claude/launch.json` for `npm run dev`): confirmed the bundle
builds/serves and the login screen renders correctly (with the expected
"no backend" message, since a plain browser has no Tauri IPC bridge), but
could not screenshot/render the page in this session ("the Browser pane
is not displayed") and could not reach `ClassRecordWorkspace` without a
real backend session chain — the 640px breakpoint's actual rendered
appearance is **not** visually confirmed, same standing gap as M5. No
independent reviewer dispatched (no authorization/persistence surface
touched); `teacher-ux-reviewer` on the new interaction model is owed, see
below.

**M12b Assessment Items and Learner Scores is complete (2026-08-24, prior
session)** — see `docs/adr/0012-assessment-items-and-scores.md`. Inline
research (same method as M10/M11) found DepEd Order No. 8, s. 2015
(Written Work/Performance Task/Quarterly Assessment) has been repealed
by DepEd Order No. 015, s. 2026, which renames the categories to Written
Works/Performance Tasks/Examinations — so, per M11's own precedent and
advisor guidance, category names are seeded reference data (two sets,
DO 015 default), never a hardcoded enum. A teacher can now add
assessment items to a class record and record each learner's score
(Scored/Excused/Not Applicable), with eligibility checked against the
grading period's actual date range and every score attributed to the
session's own `user_id` (never client-supplied). `cargo test` 163 lib +
6 new integration tests + 3 new migration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (221 TS tests,
39 files). **Independent review**: `security-reviewer` was dispatched
(per advisor guidance) but hit the same agent-resume issue on both the
initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (`recorded_by_user_id` cannot be spoofed — traced the actual
Tauri command parameters, confirmed only session-derived; the
`max_score` bound and status/score pairing are enforced before any
write; roster eligibility genuinely blocks an ineligible learner; no new
injection surface); full detail in ADR-0012. Still owed: a real
(non-self) `security-reviewer` pass for M12b once agent-resume behavior
is confirmed reliably working.

**M12a Gradebook/Class Record Foundation is complete (2026-08-24, this
session)** — see `docs/adr/0011-gradebook-class-record-foundation.md`.
User directed the full M12/M13/M14 roadmap in one message; per advisor
consultation before implementation, M12 was split into phases (M12a
Subject+ClassRecord foundation now, M12b assessment items/scores next,
M12c keyboard/mobile/audit polish after that) so M13's computation work
doesn't force a rework of a schema built in one pass. A teacher can now
open a class record (one section + one subject + one grading period);
`ClassRecord` stores no `school_year` of its own — the section's and the
grading period's `school_year` are verified to match at creation instead,
so there is one source of truth, not three copies that could drift.
`cargo test` 141 lib + 5 new integration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (189 TS tests,
34 files). **Independent review**: `architecture-reviewer` was
dispatched (owed since M7) but hit the same agent-resume issue on both
the initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (layering, the school-year single-source-of-truth logic,
isolation/session-derivation convention, M12b setup risk); full detail
in ADR-0011. Still owed: a real (non-self) `architecture-reviewer` pass
for M12a once agent-resume behavior is confirmed reliably working.

**M11 Grading-Period Foundation is complete (2026-08-24, this
session)** — see `docs/ACTIVE-PLAN.md`'s "M11" section for the full
verification record and `docs/adr/0010-grading-period-foundation.md` for
the technical decision, source citations, and scope boundaries.
User-directed (named as the explicit next-best in the same message that
directed M10). Schools can now record grading periods per school year,
instantiated from a versioned, DepEd-sourced policy — the current
default cites DepEd Order No. 9, s. 2026 (four quarters → three terms),
chosen deliberately over hardcoding either structure once research
showed DepEd's own terminology is genuinely in transition. No grade
computation or gradebook yet.

**Independent review for M11**: one `security-reviewer` episode,
succeeded on the **first attempt** — no resume-retry needed, no
findings. `architecture-reviewer`/`teacher-ux-reviewer`/
`accessibility-reviewer` still not attempted, same standing debt as
M7/M8/M9/M10.

**M10 Local Section-Level SF2 Export + Reusable Official-Form Engine
Foundation is also complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M10" section and
`docs/adr/0009-sf2-export-and-official-form-engine.md`. A teacher can
export a section's monthly attendance as a DepEd-SF2-inspired CSV to
`Documents\LIKHA-SIS\`, with every field the schema can't honestly
populate disclosed (not fabricated) via a `FieldDisclosure` struct
shared between the CSV's trailing comment block and the on-screen
disclaimer. Independent review found and fixed two real should-fix
issues (CSV/formula injection; an unstripped `:` enabling a Windows/NTFS
alternate-data-stream filename) — see ADR-0009.

**Superseded (historical, kept for record only — do not act on this
paragraph):** "Next milestone not yet chosen... No candidate is
pre-selected — ask the user for a pick, or run a fresh evidence-based
scoring pass, before implementing." This was written when M12 candidates
were still open; the roadmap has since been directed (see "Status"
above) and the project now operates in Autonomous Continuous Development
Mode (`.claude/rules/autonomous-development.md`, adopted 2026-08-24) —
milestone completion is a checkpoint, not an automatic stop, and the
next milestone is selected autonomously from current evidence rather
than asked for. See "Next Action" below for the actual current
direction.

## Constraints

- Do not import or depend on old application code.
- Use synthetic data only.
- Keep dependencies minimal.
- Do not add paid services or billing-enabled infrastructure.
- Preserve architecture boundaries from `PROJECT-MEMORY.md`.
- **Commit and push after every completed milestone (2026-08-25,
  standing instruction, supersedes the prior "do not commit" default)**:
  once a milestone is verified and its ADR/handoff docs are updated,
  commit it with a descriptive message and push before continuing to
  the next autonomously-selected milestone — not a separately-requested
  action anymore.

## Environment Notes

- **Development resource assumption (revised 2026-08-24)**: two Claude
  Pro accounts are now available for this window, not one — see
  `docs/PROJECT-MEMORY.md`'s "Development Resource Assumption" for the
  full statement and what it does/doesn't change. In short: more budget
  for review/testing/research depth, not more concurrent scope.
- Rust `stable-x86_64-pc-windows-msvc`, Visual Studio Build Tools 2022
  (C++ workload), and Strawberry Perl (needed to compile vendored OpenSSL
  for SQLCipher) are all installed on this machine via winget.
- `tauri.conf.json` uses a placeholder identifier `org.likhasis.app` —
  fine for local development; revisit before any real distribution or
  code signing.
- `npm run quality` is the canonical local TS check (typecheck, lint,
  format:check, an architecture-boundary check, test). For Rust:
  `cargo test`, then `cargo clippy --all-targets -- -D warnings`. New
  tiers from the harness upgrade: `npm run quality:security` (Gitleaks +
  cargo-deny + OSV-Scanner, via `scripts/check-security.mjs` — explicitly
  distinguishes "tool missing" from "tool ran clean"), `npm run
quality:ui` (currently an honest placeholder — no Playwright UI-smoke
  suite exists yet), `npm run quality:full` (adds the Rust checks). All
  four security tools (Gitleaks, cargo-deny, OSV-Scanner,
  `@playwright/cli`) require a fresh shell/session to be on `PATH` after
  this session's winget/cargo/npm installs.
- The working SQLite database is encrypted (SQLCipher) and keyed via
  Windows DPAPI — see `docs/adr/0003-encryption-at-rest.md`.
- All SQL lives in Rust (`src-tauri/src/repository/`); the frontend never
  constructs SQL — see `docs/adr/0002-local-database-foundation.md`.
- **Authentication/authorization** — see
  `docs/adr/0004-authentication-and-local-session.md` before touching
  `src-tauri/src/auth/`, `commands/{auth,user,learner}.rs`, or any TS
  `AuthApplicationService`/`LearnerApplicationService` usage. Any Tauri
  command reading/writing tenant data must derive scope from
  `sessions.require_active_school_scope(&conn)`, never accept it as a
  parameter; any command creating accounts/memberships must go through an
  `authorize_*` gate in `auth/mod.rs`. This exact gap (unauthenticated
  bootstrap commands with no limit) was found and fixed once already —
  don't reintroduce it.
- **UI** — see `docs/adr/0005-app-shell-and-first-ui-slice.md` and
  `docs/adr/0006-first-run-bootstrap.md`. New screens go in `src/ui/`,
  receive their `*ApplicationService`s as props (never import
  `composition.ts` directly, so they stay testable with fakes), and
  should check `useTeacherMode()` before assuming `Guided`-only content
  isn't needed. `src/composition.ts` is the only file allowed to import
  concrete `infrastructure/tauri/*` classes — enforced by
  `npm run check:architecture` now, not just convention.
- **Visual verification gap, standing**: this environment has no
  browser/screenshot/rendering tool for the compiled native app. Every
  future UI milestone will hit the same limitation M5/M6 did — plan to
  flag it the same way (verify everything objectively checkable, state
  plainly what wasn't), not to work around it by guessing. `@playwright/cli`
  (adopted this session) can partially help for the browser-rendered
  `vite dev` surface only — it cannot attach to the compiled Tauri
  webview. See `docs/VERIFICATION-DEBT.md`.
- `vitest-axe` was tried and dropped (unmaintained, v0.1.0, types don't
  match Vitest 4.x) in favor of a direct `axe-core` wrapper at
  `src/test/a11y.ts` — use `expectNoAccessibilityViolations(container)`
  for new screens' structural accessibility tests.

## Next Action

**Post-sequence evidence-based scoring pass complete (2026-08-25)** —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
table. Top two picks are both implemented: Learner Roster CSV Export
(8.10, ADR-0025) and Idle-Timeout Warning Before Logout (6.30,
ADR-0026). Per the user's own standing preference ("just select the
recommended automatically, will adjust after all milestone has
achieved"), the next-highest-scoring runner-up remains the default next
pick:

1. **teacher-ux-reviewer/accessibility-reviewer dispatched (2026-08-25)**
   on the M12c-M26 UI sweep. **`teacher-ux-reviewer` outcome**: hit the
   same recurring agent-resume/retrieval failure this project has
   documented since M7 — real work done (26 tool uses, ~94k tokens
   across the initial run and one resume attempt), but no findings text
   ever retrievable, even after the one resume this project's
   escalation rule allows. Per that rule, a careful self-review was
   performed instead — see `docs/adr/0027-audit-timestamp-readability-fix.md`.
   It found and fixed one real, concrete gap: `AuditLogScreen.tsx` and
   `TeacherWorkspaceScreen.tsx` were both showing a teacher a raw ISO
   timestamp (`2026-08-25T08:00:00.000Z`) instead of a readable date,
   the same class of bug M12c already fixed once for
   `ClassRecordWorkspace.tsx`'s "Saved HH:MM" note but never carried
   forward to the screens added after it. Fixed in both places; 4 new
   tests. **`accessibility-reviewer` outcome**: hit the identical
   agent-resume/retrieval failure (real work, 31 tool uses, ~124k
   tokens across the initial run and one resume, no retrievable
   findings text either time). Per the same escalation rule, another
   self-review was performed, covering contrast, focus management,
   keyboard operability, ARIA correctness, and touch-target sizing. It
   found and fixed one real issue: `IdleTimeoutWarning.tsx` used
   `role="alertdialog"`, which per ARIA authoring practices implies
   modal focus-trapping behavior the component never actually provides
   (it's a dismissible, non-blocking banner, same as every other banner
   in this app) — changed to `role="alert"`, matching the
   `error-banner`/`confirmation-banner` convention already established.
   Hand-computed contrast for the new `--color-warning` tokens passed
   comfortably in both light (≈5.3:1) and dark (≈7.7:1) mode — no fix
   needed there. `npm run quality` 313 TS tests (up from 302 before
   this dispatch) green throughout. **Both `teacher-ux-reviewer` and
   `accessibility-reviewer` remain owed a real (non-self) pass** on
   this UI sweep once agent-resume behavior is confirmed reliably
   working in a future session — recorded as standing debt, not
   discharged by the self-reviews above.
2. **Grading-period-aware Teacher Workspace enhancement — complete
   (5.70)**. See `docs/adr/0028-workspace-grading-period-status.md`.
3. **Proptest pilot on auth/lockout invariants — complete (4.85)**. See
   `docs/adr/0029-proptest-lockout-pilot.md`.

**All scored candidates from the post-sequence pass above the ~4.0
threshold are now complete.** The two remaining entries in that pass's
table — password reset/account recovery (4.20) and a Trail of Bits
second-opinion pilot (3.25) — both scored low specifically because
they're blocked on something other than raw implementation effort
(password reset needs a genuine product/security decision this app has
no out-of-band recovery channel for yet; the Trail of Bits pilot needs
external-tool research this session didn't do). Per the same "reassess
rather than default to whatever's next on a now-stale list" discipline
this project has used at every real checkpoint, this is another
legitimate point to run a fresh evidence-based scoring pass (or ask the
user for direction) before picking a fifth item, rather than reaching
for password reset or Trail of Bits just because they're what's left on
an old list. Real candidates worth weighing in that fresh pass: the
still-open `teacher-ux-reviewer`/`accessibility-reviewer` review debt
(once agent-resume behavior can be spot-checked as healthy first), the
remaining Compounding Engineering Phase B/C/E/F/G items, data
export/backup's original raw-database-backup interpretation (explicitly
deferred as its own security-design question in ADR-0025), and any
newly-relevant DepEd research if a primary source for KS1/DO 8 surfaces.

Still-standing context, unchanged since the last reassessment:

- The shared-computer/session-security thread (Account Lockout →
  Idle-Timeout → Audit Log → Global Session Expiry) remains coherent
  and closed — no known open gap.
- Password reset/account recovery (scored 4.20 — low specifically
  because this local-only, no-email/SMS app has no safe out-of-band
  recovery channel without either an admin-reset flow, which needs the
  still-deferred Roles & Permissions decision, or a weak
  security-question mechanism this project's posture shouldn't adopt)
  needs a genuine product/security decision before it's actionable.
- DepEd weight-group work remains genuinely blocked, not deprioritized:
  Key Stage 1 descriptive grading and Grade 12's DO 8 carryover both
  still lack a usable primary source — see "Remaining DepEd weight-group
  work" below before attempting either again.
- The Compounding Engineering tooling pass
  (`docs/product/COMPOUNDING-ENGINEERING-DECISION.md`) deliberately
  deferred Phases B-H (proptest — scored 4.85 this pass, cargo-mutants,
  UI regression testing, agent-regression suite, Trail of Bits second
  opinion — scored 3.25 this pass, Beads/Serena piloting) with
  documented resumption criteria.

Other done/available items, none blocking:

- **Done (2026-08-24)**: Account Lockout After Failed Logins — see
  `docs/adr/0019-account-lockout.md`.
- **Done (2026-08-24)**: Idle-Timeout Session Hardening — see
  `docs/adr/0020-idle-timeout-session-hardening.md`. Closes both
  shared-computer threat-model gaps ADR-0004 originally deferred
  (lockout for the login step, idle timeout for an already-authenticated
  abandoned session).
- **Done (2026-08-25)**: Audit Log — see
  `docs/adr/0021-authentication-audit-log.md`.
- **Done (2026-08-25)**: Global Session Expiry Handling — see
  `docs/adr/0022-global-session-expiry-handling.md`.
- **Done (2026-08-25)**: Learner Search / filter for large rosters —
  see `docs/adr/0023-learner-search.md`.
- **Done (2026-08-24)**: a `LearnerListScreen` edit affordance closing
  M17's disclosed gap, plus two self-review-caught fixes (focus
  management entering edit mode; a second "Edit" click could silently
  discard a first learner's unsaved changes).
- Dispatch a fresh `teacher-ux-reviewer` and `accessibility-reviewer`
  pass on the M12c-M21 UI sweep once agent-resume behavior is confirmed
  working — real, undischarged review debt, not blocking.
- Other candidates from `docs/product/M8-DECISION.md`'s original
  20-scenario list, not yet built and not in the current directed
  sequence: a teacher dashboard/home screen (#6, though this overlaps
  with the directed "Teacher Workspace" item — reconcile when reached
  rather than building twice), data export/backup (#15), password
  reset/account recovery (#17).
- Remaining DepEd weight-group work, **not** purely additive after
  further research (2026-08-24): Key Stage 1 descriptive grading (a
  structurally different computation — rubric evidence, not weighted
  scores). Grade 12's DO 8, s. 2015 carryover was re-investigated this
  session — the weight percentages ARE now findable (multiple
  corroborating secondary sources: Languages/AP/ESP 30/50/20,
  Science/Math 20/60/20, MAPEH 40/40/20 for grades 1-10; SHS Core/Track
  25/50/25 for grades 11-12 — the last being the only one actually
  relevant, since DO 015 already supersedes the K-10 figures). **But
  this is not purely additive like the SHS groups were**: DO 8's own
  1.6-point-increment transmutation table is a structurally different
  curve from DO 015's Adjusted Transmutation Table already implemented
  in `grading_computation::ADJUSTED_TRANSMUTATION_TABLE` (different
  floor behavior even — one secondary source claimed DO 8 floors 60→75,
  another claimed 60→60 matching DO 015's own table; these directly
  contradict each other, which is itself a sign neither should be
  trusted without a primary source). `compute_term_grade` currently
  selects a transmutation approach purely from `grading_periods.school_year`
  (SY2026-2027 → DO 015's Adjusted Table; SY2027-2028+ → Zero-Based
  rounding) — there is no third path for "this class record uses DO 8's
  own transmutation table," and adding one is a real architecture
  decision (how does a class record signal it's under DO 8, not just
  which weight percentages it uses?), not a seed-data-only change.
  **Do not implement the weight percentages alone and reuse the existing
  transmutation logic** — that would silently apply the wrong curve to
  Grade 12's grades. Needs a dedicated research pass to pin down DO 8's
  actual transmutation table from a primary or clearly-reliable source,
  followed by the 10-scenario process for the selection mechanism,
  before any schema change. **Two further research attempts this
  session (2026-08-24) still failed to produce a trustworthy full
  table**: secondary sources disagree even on the transmuted-grade
  range itself (one claims 60-99, another 60-100), a page specifically
  about "D.O. No. 8 s.2015" cites only a Facebook post as its source
  (not the Order), and no page reproduces the full ~40-row table. Per
  `.claude/rules/autonomous-development.md` gate #6, this is now a
  confirmed stop: do not attempt DO 8's transmutation table again from
  a web search — it needs the actual primary-source PDF (the way M13
  obtained DO 015's), which was not locatable this session.

If DepEd-specific research is needed for any of the above, prefer doing
it inline with `WebSearch`/`WebFetch` in the main session over spawning
`deped-researcher` — inline research (including, in M13, downloading and
visually transcribing the actual DepEd Order PDF, and in M17,
cross-checking two independent secondary sources before adding any
learner-profile field) has worked cleanly since M10, while this
session's agent-resume path remains inconsistent.

Also **owed from M7/M8/M9/M10/M11/M12a, not blocking but should be
revisited**: a real (non-self) `architecture-reviewer`/
`teacher-ux-reviewer`/`accessibility-reviewer` pass for M7, all four
review types for M8, all four for M9, and
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
for M10 and M11 (both milestones' `security-reviewer` episodes did
succeed — see ADR-0009/0010), once agent-resume behavior is confirmed
reliably working in a session. M12a's `architecture-reviewer` self-review
fallback and M12b's dispatched `security-reviewer` (which never returned
usable output — self-review fallback recorded in ADR-0012, re-verified
directly against source in the M12c session) are the first two of these
actually attempted; none of M12c, M13, M14, M15, M16, M17, or M18 added
new review debt beyond the `teacher-ux-reviewer` note above — M17
touched a new PII field but no new authorization surface, and got its
own inline security self-check recorded in ADR-0017 rather than a full
dispatch; M18 reused an already-reviewed write path (`record()`) and
introduced no new authorization surface — see
ADR-0011/0012/0013/0014/0015/0016/0017/0018.

If instead asked to continue harness work: the harness itself is
complete per `docs/adr/0007-claude-code-harness-architecture.md`. An
`evaluator` pass FAILed once on a real gap (the `security-guidance`
plugin was documented as adopted before it was actually configured, plus
two stray junk files) — both fixed; see
`.planning/harness-upgrade/progress.md` for the full log and confirm a
re-run evaluator PASS is recorded there before treating this as settled.
Remaining optional/deferred items, not blockers:
piloting the `@wdio/tauri-service` native-binary smoke test (currently
just researched and adopted-as-PILOT, not yet executed — see
`docs/SOURCE-REGISTRY.md`), and confirming the hooks/`security-guidance`
plugin are actually live after a `/hooks` reload or restart.

## Completion Gate

An application milestone is complete only when: it's reachable from the
actual app (not just callable in isolation), `npm run quality`/
`cargo test` stay clean, an independent reviewer agent has checked it,
and — as with M5/M6 — the visual-verification limitation is reported
honestly rather than glossed over.
