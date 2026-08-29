# ADR-0044 — Pre-Wave Research: Waves 3, 4, 5, 7 (ready-spec, no code changed)

Status: Accepted (research/planning only)

## Context

Per explicit user instruction, following the same "research ahead so the
builder can just fetch the output" approach already used for Wave 6
(ADR-0042/0043): research Waves 3, 4, 5, and 7 now, so that when each
wave is actually reached, implementation can start without a fresh
research pass. Wave 6 is out of scope here (already done). **No product
code, schema, or config changed.** Research method: direct `WebSearch`/
`WebFetch`, per the established fallback rule
(`.claude/rules/autonomous-development.md`) — this project's
`deped-researcher`/`dependency-researcher` subagents have a documented
recurring retrieval failure, not re-attempted here since the direct
method has worked reliably in the two immediately preceding sessions
(ADR-0042, ADR-0043).

**This is priority-ordered research depth, not implementation.** Per
`PRODUCT-CONTRACT.md` §14's own non-goal ("dozens of minor Teacher Tools
... ahead of foundational work"), producing ready specs is explicitly
not the same as building early — Waves 1-5 must still be reached in
sequence before any of this is acted on, except where a finding changes
what Wave 5 itself should research further (the cloud-target 10-scenario
decision remains Wave 5's own required work, not resolved here).

## Wave 3 — Authoritative-template Form Engine

**Objective, unchanged**: one representative authoritative-template form
(SF9 recommended, per ADR-0035), generalized enough that SF10's later
bulk import reuses Wave 2's reconciliation architecture.

### Form structure findings (secondary-sourced, not primary-verified — see gate below)

- **SF9** (Learner's Progress Report Card, formerly Form 138): confirmed
  restructured for the three-term calendar under DepEd Order No. 15,
  s.2026 — "official columns specifically for Term 1, Term 2, and Term
  3" replacing the old quarterly layout, sections for core learning
  areas, Values Education (Maka-Diyos/Makatao/Makakalikasan/Makabansa),
  and attendance (days present/absent per month). Distributed as an
  automated Excel workbook, grade-band-specific (Grades 1-3, 4-6, 7-10,
  SHS) per DM No. 576, s.2026 ("Dissemination and Use of the Editable
  School Form 9"). Sources:
  [DepEd Tambayan — SF9 templates](https://www.depedtambayanph.net/2026/08/deped-sf9-template-grades-4-12-do-15-s-2026.html),
  [DM 576 s.2026 (DepEd Caloocan mirror)](https://depedcaloocan.com/dm-no-576-s-2026-dissemination-and-use-of-the-editable-school-form-9-sf9-or-learners-progress-report-card-templates-pdf/).
- **SF10** (Permanent Academic Record, formerly Form 137): two
  categories — Learner's Personal Information and Learner's Academic
  Progress — issued per school level (SF10-ES/JHS/SHS) by the school
  head/principal, simplified to bear only the official DepEd logo/seal.
  Sources: [DepEd PH — SF10](https://depedph.com/school-form-10-sf10/).
- **SF7** (School Personnel Assignment List and Basic Profile, feeds
  Wave 4 too): three sections — (A) nationally-funded teaching
  positions, (B) nationally-funded non-teaching positions, (C) other
  funding sources — per-person fields: name, position, sex,
  qualifications, appointment, subjects taught, daily program/timetable,
  advisory/ancillary flags. Completed by the School Head at
  Beginning-of-School-Year, submitted with the GESP/GSSP. Source:
  [TeacherPH — Modified SF7](https://www.teacherph.com/download-modified-school-form-7-sf7-school-personnel-assignment-list-basic-profile/).

**Gate, not resolved here (matches the M8 precedent)**: none of the
above gives an exact, byte-level cell/row layout — only structural
description. Third-party mirror sites host actual template files, but
this project's own citation-quality bar (ADR-0013's primary-source
standard) treats a mirrored copy as unverified. **When Wave 3 begins,
obtain the current authoritative template directly** — either from the
user (who provided the real `CONSO SF v2025.xlsx` for M8, the same
pattern) or a verified `deped.gov.ph` fetch if reachable then. This is
recorded now specifically so the Wave 3 builder knows exactly what to
ask for on day one, not a mid-wave surprise.

### Architecture recommendation — revise the previously-assumed plan

`ADR-0035`/`PRODUCT-CONTRACT.md` §5 previously assumed "Tauri → scoped
sidecar → Apache POI/HSSF → authoritative `.xls` template." Research
this session found **no prior art for bundling a JVM+Apache-POI sidecar
with Tauri** (a real, unproven integration risk), and a materially
simpler, pure-Rust alternative:

- **`umya-spreadsheet`** (pure Rust, reads and writes `.xlsx`, actively
  maintained on GitHub/`MathNya`) can open an existing template file and
  write cell values back while preserving the template's formatting —
  exactly the "fill an official template" operation Wave 3 needs, with
  **no JVM/cross-language sidecar at all**. Benchmarked slower than
  `calamine`/`rust_xlsxwriter` at bulk scale (a 10.7MB/1000-row
  workbook), which is irrelevant here — a report-card export writes one
  learner's record at a time, not a bulk dataset.
- **Recommendation**: replace the sidecar plan with `umya-spreadsheet`
  when Wave 3 begins — a genuine simplification serving LIKHA's
  "maintainability" and "offline reliability" priorities (both rank
  above "zero billing" in LIKHA's own order; a JVM dependency is a real
  packaging/offline-reliability cost on Windows, a pure-Rust crate is
  not). This should still go through the established 10-scenario
  process at Wave 3's start if the decision is treated as a genuine
  architecture call — recorded here as a strong Recommended candidate,
  not a unilateral pre-decision.
- **A related simplification**: since LIKHA already computes grades in
  Rust (M13, ADR-0013), there is no need to rely on the official
  template's own Excel macros/VBA for computation — write final,
  already-computed values directly into the template's cells. This
  sidesteps the open question of whether `umya-spreadsheet` preserves
  VBA macros faithfully (not confirmed either way this session) by
  making it irrelevant to Wave 3's actual need.

## Wave 4 — Teacher Load + Class Schedule (extends the already-BUILT foundation, ADR-0039)

**Objective, unchanged**: the full chain (personnel/position/
designation, availability/constraints, schedule generator, SF7 export,
"My Day" integration) that `PRODUCT-CONTRACT.md` §6 already scoped.

### Position/designation and workload figures (for the personnel model)

- **Position ladder**, multiple sources cross-checked: Teacher I-III
  (entry, SG 11-13) expanded to Teacher I-VII, then Master Teacher I-V/
  VI (SG 18+) — "no teacher will retire as Teacher 1" is the stated
  policy intent of the expanded ladder. Sources:
  [applysmartph.com salary guide](https://applysmartph.com/teacher-salary-philippines-2026/),
  [philippinego.com salary grade guide](https://philippinego.com/12786/) —
  both secondary/aggregator sources, not a primary DepEd/DBM issuance;
  verify against the actual Career Progression issuance before
  hardcoding a salary-grade table.
- **RA 4670 (Magna Carta for Public School Teachers) — primary source
  fetched directly**: actual classroom teaching capped at **6 hours/day**;
  extension to 8 hours requires **125% pay** (base rate + 25%) for the
  excess. Source: [full text, chanrobles.com](https://chanrobles.com/Republic%20Act%20No.%204670,%20Magna%20Carta%20for%20Public%20School%20Teachers.pdf).
  This reconfirms, from the actual statute rather than a secondary
  summary, the same 6-hour figure ADR-0039 already cited via DepEd
  Order 005 s.2024.
- **Master Teacher coaching/mentoring = 1 teaching-load-hour credit** —
  a candidate conversion figure found (TeacherPH/DepEd PH secondary
  sources), **not yet primary-source-verified**. `PRODUCT-CONTRACT.md`
  §6 already explicitly warns against hardcoding numeric policy
  thresholds without an authoritative source — this figure is recorded
  as a lead to verify against DepEd Order 005 s.2024's actual text when
  Wave 4 begins, not adopted yet.

### Schedule generator — a real technical foundation identified, a toy dependency rejected

- **`school-scheduling-rs` (a GitHub repo matching this exact use case)
  — REJECT as a dependency.** Direct inspection found: license
  ambiguity (README claims MIT, repo footer shows AGPL-3.0 — a real
  conflict, and AGPL would itself be a licensing risk for a
  non-copyleft product), 0 stars, 2 commits, no evidence of any real
  deployment. Prototype-quality, not production-ready.
- **The underlying technique is sound and has a mature, adoptable
  foundation**: Integer Linear Programming via the **HiGHS solver**,
  accessed from Rust through the `highs`/`highs-sys` crates — **MIT
  licensed, ~100K downloads/month, actively maintained**
  (`rust-or/highs-sys` on GitHub), typically used via the `good_lp`
  linear-programming modeler for an ergonomic constraint-definition API.
  **Recommendation**: build LIKHA's own schedule generator on `highs`/
  `good_lp` directly when Wave 4's generator work begins, rather than
  adopting any existing school-timetabling repo — pure Rust, no
  cross-language dependency, consistent with Wave 3's same preference.
  This remains a **HYPOTHESIS** per `PRODUCT-CONTRACT.md` §6 (a full
  constraint solver is a substantial build) — this research narrows
  _how_ to build it, it does not commit to building it in full within
  Wave 4's first pass.

## Wave 5 — Sync + cloud authorization + session hardening

**Objective, unchanged**: run the actual 10-scenario cloud-target
decision (`ADR-0035` Decision 5) before writing sync code; one real
end-to-end round trip; formalize offline-session/re-authentication with
a security-reviewer pass. **This research does not resolve the
10-scenario decision** — that remains genuine Wave 5 work — it narrows
the option set with current facts so that decision starts informed.

### Cloudflare pricing reconfirmed current (the existing hypothesis remains viable at zero cost)

- **Durable Objects (SQLite-backed)**: Workers **Free** plan can create/
  access SQLite-backed Durable Objects and is **not charged for SQLite
  storage** at all; free-tier throughput ~150M rows read/mo, ~3M rows
  written/mo, 5GB storage. Storage billing for paid plans only began
  January 2026. Sources: [Cloudflare Durable Objects pricing docs](https://developers.cloudflare.com/durable-objects/platform/pricing/),
  [Cloudflare community — SQLite storage billing](https://community.cloudflare.com/t/durable-objects-workers-billing-for-sqlite-storage/867188).
- **D1**: free tier 5M rows read/day, 100K rows written/day, 5GB
  storage, resets daily; no egress/bandwidth charges. Source:
  [Cloudflare D1 pricing docs](https://developers.cloudflare.com/d1/platform/pricing/).
- Both remain genuinely zero-billing-compatible at a reasonable
  school-scale — this reconfirms, with current 2026 figures, that
  Decision 5's hypothesis is still financially viable and does not need
  to be reconsidered on cost grounds alone.

### Sync-engine survey — no drop-in fit found, confirms a bespoke protocol is genuinely needed

- **2026's dominant local-first pattern is CRDT-based**, actively
  displacing operational transformation for new work; "a new generation
  of sync engines that treat SQLite as the universal application
  database" is now a named, real category — directly relevant since
  LIKHA already uses SQLite as its local database. Source:
  [Smashing Magazine — local-first web architecture, 2026](https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/).
- **Surveyed real engines, none cleanly fits LIKHA's exact shape**:
  **PowerSync** (production-ready, Rust-based SDK internals, but
  Postgres-is-the-backend-of-record — doesn't map onto a
  Durable-Object/D1-native design without adding Postgres as a second
  cloud dependency); **ElectricSQL** (similarly Postgres-centric; one
  source titled "ElectricSQL (Legacy) vs PowerSync," suggesting a
  possible repositioning — treat with caution, not as a stable
  reference); **sqliteai/sqlite-sync** (genuinely CRDT-based, but syncs
  to "SQLite Cloud, PostgreSQL, and Supabase" — **Supabase is already
  explicitly excluded** by this project's own prior decision,
  `PROJECT-MEMORY.md`'s "Explicit exclusions" list).
- **Conclusion for Decision 5's eventual scenario set**: no existing
  sync engine is a safe drop-in given the Cloudflare-native hypothesis
  and the standing Supabase exclusion. Two genuine architectural
  approaches to present as scenarios (not decided here): **(a)** a real
  CRDT-based merge layer (stronger convergence guarantees, materially
  more implementation complexity); **(b)** an operation-log / per-field
  last-write-wins model with logical timestamps (simpler, fits LIKHA's
  currently fairly simple entity-update shape, but the CRDT research
  itself is explicit that naive LWW "silently discards data" — any LWW
  design needs deliberate field-level scoping, not a blanket
  whole-record LWW). Recording both, unscored, for Wave 5's own
  10-scenario pass to weigh for real.

### Session hardening

No new research needed — `PRODUCT-CONTRACT.md` §13 and the existing
built session-hardening ADRs (0019/0020/0022/0026) already cover this;
Wave 5's task (a real security-reviewer pass on the offline-session/
re-authentication window) is process work, not a research gap.

## Wave 7 — Cross-app finish, accessibility, performance, regression gate

**Objective, unchanged**: final hardening/handoff-readiness pass.
Accessibility and quality-gate methodology are already established in
this project (the `accessibility` skill, `npm run quality:full`) — no
new research needed there. **One genuinely new, real finding**:

### Windows code signing is a real, currently-unaddressed cost gate

- Trustworthy Windows distribution needs a **Code Signing certificate**
  from a recognized CA (Digicert, Sectigo, GoDaddy) — without one,
  Windows SmartScreen shows "Unknown Publisher" warnings, a real
  teacher-trust/adoption risk for a school-deployed app. An EV
  certificate removes more warnings but Microsoft changed SmartScreen's
  EV-specific behavior in 2024 (the exact current behavior was not
  independently re-verified this session — flag as a detail to confirm
  when Wave 7 begins, not asserted here). Source:
  [Tauri — Windows distribution docs](https://v2.tauri.app/distribute/windows-installer/).
  **This is a genuine paid-infrastructure item** — the same
  human-approval-gate class as Wave 6b's AI-funding decision
  (`.claude/rules/autonomous-development.md` gate #3).
- **A real zero-cost path exists and should be evaluated first**: the
  **SignPath Foundation** provides free code signing (EXE/MSI, HSM-held
  private key, CI-integrated) for qualifying open-source projects — a
  publicly available codebase (LIKHA-SIS already qualifies, per
  ADR-0041's confirmed-public status) **and a recognized open-source
  license**. Source: [SignPath Foundation](https://signpath.org/),
  [SignPath — OSS program](https://signpath.io/solutions/open-source-community).
  **Gap found**: this repository currently has **no `LICENSE` file** —
  confirmed by direct check (`ls` on the repo root). Adding one is
  cheap and reversible, but choosing to genuinely open-source LIKHA
  under a real OSI-approved license (vs. staying public-but-unlicensed,
  which is a different, more restrictive default than most people
  assume) is itself a product-policy choice, not something to decide
  autonomously.
- **Recommendation for Wave 7's start**: put this choice to the user
  directly — add an OSI-approved license to qualify for SignPath's free
  signing, or budget for a paid certificate. Either path is fine
  technically; which one is a decision only the user can make (matches
  approval-gate #1, irreducible product-policy choice, as much as #3).
- Mechanically, Tauri's distribution path is otherwise straightforward
  and already compatible with this project's existing CI foundation
  (ADR-0041): NSIS or WiX/MSI installer, a `publisher` field required in
  `tauri.conf.json`, and an official Tauri GitHub Action available for
  CI-automated signing once a signing method is chosen.

## Consequences

- `docs/product/PRODUCT-CONTRACT.md` §5 (School Forms), §6 (Teacher
  Load), and §12 (Cloud/sync) updated with pointers to the findings
  above; a new §17 added for the Windows code-signing gate.
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave
  3, 4, 5, and 7 rows updated to reference this ADR.
- `docs/CURRENT-HANDOFF.md` / `docs/PROJECT-MEMORY.md` updated.
- **No product code, schema, dependency, or config was added.** Every
  recommendation above (`umya-spreadsheet` over a POI sidecar, `highs`/
  `good_lp` over `school-scheduling-rs`, the SignPath-vs-paid-cert
  choice, the two sync-architecture scenarios) is a documented,
  evidenced candidate for that wave's own decision process when it
  actually begins — not a pre-made architecture commitment. Wave 5's
  10-scenario cloud-target decision in particular remains **required,
  real work at Wave 5's start**, not shortcut by this research.
- Two new open items requiring the user's decision, recorded for their
  respective waves, not now: Wave 5's cloud-target scenario choice
  (already an existing open item, now with a narrower, current-fact
  option set) and Wave 7's license-for-free-signing-vs-paid-certificate
  choice (newly identified this session).
