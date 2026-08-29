# ADR-0043 — Teacher Tools Catalog and Integration Architecture (Wave 6 ready-spec)

Status: Accepted (planning/research only — no product code changed)

## Context

The user directed this session to research as comprehensive a Teacher
Tools/Studio catalog as can be tightly evidenced, design exactly how
each tool integrates into LIKHA's existing layered architecture, and
produce this ahead of time so that **Wave 6 can begin implementation
immediately once Wave 5 completes, with no further research needed**.
This ADR is that ready-spec. It extends, and does not re-litigate,
ADR-0042's ilawcraft classification (PILOT) and Wave 6a/6b split — this
document fills 6a/6b in with a full, prioritized tool catalog and the
concrete architecture each tool needs.

**No product code changed.** Per `.claude/rules/autonomous-development.md`,
research/planning work does not require a human-approval gate by
itself; the one genuine gate already identified (BYOK vs. LIKHA-funded
AI cost, ADR-0042) still stands and is not resolved here.

## Research method

Direct `WebSearch` (the established fallback in this project for
DepEd-specific research, per ADR-0042 — the `deped-researcher` subagent's
recurring retrieval failure is documented and not re-attempted every
session per the harness-failure rule). Every candidate below is tagged
with its evidence strength; nothing is invented from assumption.

## The full catalog, tightly sourced, tiered by evidence strength and architecture cost

### Tier A — Strong DepEd-specific evidence, reuses existing LIKHA data, cheapest to build

**A1. Item Analysis** (already identified in ADR-0042). Per-item
difficulty/discrimination/distractor statistics computed from scores
already in `learner_scores` (M12b/ADR-0012) — zero new PII, no paid
API, no new architecture pattern (pure computation over existing data).
Directly tied to DepEd's live ARAL remediation program (DepEd Order 18,
s.2025). A real Filipino-teacher-built precedent exists
(`deped.me/tools/item-analysis`).

**A2. Phil-IRI reading-level digitization.** The Philippine Informal
Reading Inventory is a **national, DepEd-mandated** reading assessment
(oral/silent reading + listening comprehension → independent/
instructional/frustration reading-level classification per learner),
administered at least at the beginning and end of school year.
Currently supported only by Excel-based encoding/summary tools bundled
in the official Phil-IRI materials — no dedicated modern tool exists.
Sources: [Phil-IRI Manual 2018](https://www.teacherph.com/phil-iri-manual-2018/),
[DepEd Click — Phil-IRI complete materials](https://www.deped-click.com/2025/06/philippine-informal-reading-inventory.html).
**Architecture**: one new small table (reading-level result per
learner per administration period — same PII class as `learner_scores`,
nothing new), tied to the existing `learners`/`sections` FKs. No paid
API. This is the strongest new candidate after item analysis: real,
recurring, DepEd-mandated, currently the most manual of all the
assessment-adjacent burdens researched.

### Tier B — Real DepEd-specific paperwork burden, moderate new data modeling

**B1. LAC (Learning Action Cell) session minutes/attendance.**
DepEd Order No. 35, s.2016 mandates regular LAC sessions with a rotating
"Documenter" role recording attendance, discussion topics, evidence of
implementation, and next actions — tied to CPD units for PRC license
renewal. Sources: [DepEd Order 35 s.2016 (primary)](https://www.deped.gov.ph/wp-content/uploads/2016/06/DO_s2016_035.pdf),
[TeacherPH — LAC overview](https://www.teacherph.com/deped-learning-action-cell/).
**Architecture**: new `lac_sessions` + `lac_attendance` tables,
school-scoped, reusing existing `users` for attendee/documenter
identity — no new PII category.

**B2. RPMS/IPCRF evidence tracker — explicitly NOT a replacement for
the official tool.** DepEd's own **e-IPCRF** (Excel-macro-based,
6 PPST domains/14 objectives, submitted centrally at
`eipcrf.deped.gov.ph`) is the actual, official, required submission
path — "no physical portfolio submission is required." Sources:
[Teachers Click — e-IPCRF SY 2025-2026](https://www.teachersclick.com/2026/03/the-e-ipcrf-tool-for-sy-20252026-is-now.html),
[DepEd Tambayan — e-IPCRF accomplishment](https://www.depedtambayanph.net/2026/05/accomplishment-of-excel-based.html).
**What LIKHA can legitimately add**: a running log of accomplishments/
evidence tagged to PPST/COT indicator codes across the year, so a
teacher isn't reconstructing a year of evidence from memory when the
official e-IPCRF window opens — an input aid, never a competing
submission system. **Directly synergistic with ADR-0042's already-
adopted COT rubric** (`COT_FULL_RUBRIC`, 21 indicators) — this reuses
that same seeded reference data, no separate research needed.
**Architecture**: new `portfolio_evidence` table (teacher-scoped,
indicator-code-tagged, freeform note + optional linked record e.g. a
class record or LAC session), school-scoped like everything else.

**B3. Learner Support / Intervention Tracker** (merges the previously-
separate "intervention tracker" and general research fallback list into
one coherent feature). Reuses existing `attendance_records` +
`learner_scores` to surface at-risk indicators (the "ABC" pattern —
Attendance/Behavior/Class-performance — is a generic, not
Philippine-specific, framework; flagged as weaker evidence for the
_flagging logic_ itself, though the underlying data need is real). Logs
actions taken (a new `intervention_log` table) so follow-through is
visible, not just the flag. **Architecture**: mostly read-only
computation over existing data, plus one new small log table.

### Tier C — Low-risk classroom utilities, cheapest architecture, weaker PH-specific evidence

Already named as candidates in `PRODUCT-CONTRACT.md` §11 before this
research pass; validated as a known-useful pattern by generic/
international edtech (Kuraplan, seatingchartmaker.app, MagicSchool-style
tools), not by Filipino-teacher-specific demand data the way Tier A/B
are. Reasonable to build cheaply, not to over-invest in:

- **Seating chart generator/randomizer** — pure client-side, reads
  already-fetched section roster, optional persistence of one saved
  layout per section.
- **Random group maker / name picker** — pure client-side, zero
  persistence.
- **Classroom timer** — pure client-side utility, zero data, arguably
  doesn't even need a backend call.
- **Certificate/award generator** — reads learner names from the
  existing roster; needs a print/export path (reuse the existing
  disclosed-export discipline conceptually, though this is not an
  official DepEd form so no `FieldDisclosure` obligation applies).
- **Quick formative check / exit ticket** — legitimate universal
  pedagogical pattern, weak DepEd-specific mandate evidence. Worth
  noting a real synergy: results could feed the same per-item scoring
  pipeline Item Analysis (A1) already reads, rather than being a
  parallel dataset — build only if/when it can plug into that pipeline,
  not as a standalone silo.

### Tier D — AI-generation studio (Wave 6b, gated on the BYOK-vs-LIKHA-funded decision, ADR-0042)

Built on ilawcraft's validated approach (REFERENCE classification,
ADR-0042) and the already-ADOPTED COT rubric dataset:

- **D1. Lesson plan generator** (ILAW-format, COT-aligned) — the
  representative adapter Wave 6b was always scoped to build first.
- **D2. Slide deck / PPT generator** — separate screen, consumes the
  stored lesson-plan record (per the user's own original integration
  request), not regenerated independently.
- **D3. Worksheet generator** — natural pipeline extension once D1's
  generation infrastructure exists; bundled by every competitor
  researched (ilawlessonplan.com, ClassCrafter, LessonPlan PH).
- **D4. Test/quiz generator with Table of Specifications (TOS) + answer
  key** — TOS is a standard DepEd classroom-assessment construction
  requirement (DepEd Order No. 8, s.2015 policy on classroom
  assessment), not a generic feature; bundled by the same competitors.
- **D5. Rubric generator** — could be template-based (reusing the COT
  rubric's own data shape as a pattern) rather than requiring the paid
  AI path at all — worth scoping as non-AI when Wave 6b design begins,
  since a rubric is more structurally regular than freeform lesson
  content.

All of D1-D4 share one generation pipeline/provider port; D5 may not
need it at all.

### Tier E — Explicitly blocked or deprioritized, not silently dropped

- **SPED/IEP tool — BLOCKED, do not build.** Republic Act No. 11650
  (Inclusive Education Act) requires an Individualized Education Plan
  per learner with a disability, but **the detailed IEP framework
  remains pending** (confirmed via multiple sources, most recently
  December 2024 status) — no authoritative template/format exists yet
  to build against. This is the same class of gap as KS1 descriptive
  grading and the Grade 12 DO 8 s.2015 carryover (`PRODUCT-CONTRACT.md`
  §4) — do not guess a format from a web search; wait for an
  authoritative DepEd issuance. Source:
  [RSIS International — IEP awareness study](https://rsisinternational.org/journals/ijriss/view/awareness-and-preparedness-of-teachers-on-the-individualized-education-plans-ieps-for-special-education-learners-within-inclusive-settings).
- **GAD Plan/Budget generator, DRRM situation reports — deprioritized,
  not rejected.** Both already have official DepEd-provided tooling
  (a PCW-approved template for GAD per DepEd Order No. 63, s.2012; a
  DRRMS Sitrep Generator for DRRM). Role-specific (GAD Focal Person,
  DRRM Coordinator), not a universal-teacher need — lower value than
  Tier A-C for the same build cost. Revisit only if a specific school
  role in LIKHA's RBAC model (Wave 1) is later scoped to need it.
- **Sub/relief-teacher plan generator — dropped from the catalog.** No
  evidence of real demand or an existing tool was found; not fabricated
  as a candidate.

## Integration architecture — how each tier maps into LIKHA's layers

A new **"Teacher Tools" navigation group** (a fifth group alongside
UX-01's existing Daily Teaching / Learner Records / Grading / Security),
each tool its own screen under a new `src/ui/teacher-tools/` directory,
backed by its own `*ApplicationService` — the same one-service-per-screen
convention every existing LIKHA screen already follows. No tool creates
a parallel dataset; every tool either reads existing repository ports
or extends them with new, narrowly-scoped ones.

**Architecture-impact tiers** (distinct from the evidence tiers above —
a tool's evidence strength and its build cost are independent axes):

- **Impact Tier 1 — pure computation/ephemeral, no new Rust code, no
  migration.** Seating chart, group maker, timer, item analysis
  (computed fresh from existing `learner_scores` each time, matching
  this codebase's established "derive, don't store" convention already
  used for `TeacherLoad`, ADR-0039). Cheapest possible: a new
  `*ApplicationService` and screen calling only existing repository
  ports.
- **Impact Tier 2 — new reference/log data over existing entities.**
  Phil-IRI results, LAC sessions, portfolio evidence, intervention log,
  certificate generator's saved templates, seating chart's saved
  layout. Each needs: one new migration, a new `src-tauri/src/repository/*.rs`
  module following the exact established pattern (all SQL in Rust,
  `school_id` always session-derived via
  `SessionManager::require_active_school_scope`, never client-supplied),
  a narrow `src-tauri/src/commands/*.rs` surface, and — where the data is
  role-sensitive (e.g., LAC documenter role, School-Head-level portfolio
  review) — a new `Capability` variant through the existing
  `authorize_capability` gate (ADR-0036's RBAC pattern), not a new
  authorization mechanism.
- **Impact Tier 3 — external paid AI dependency (D1-D4).** Needs a new
  provider port in `src/domain/ports/` (matching `SyncProvider`'s
  existing architectural placeholder shape, ADR-0001) — e.g. a
  `LessonGenerationProvider` interface — implemented by a Tauri-side
  adapter. **One deliberate improvement over ilawcraft's own model**:
  ilawcraft's BYOK key travels over HTTP from client to its own remote
  Next.js server on every request; LIKHA has no remote server in this
  path at all — the Rust backend calls Gemini directly from the local
  process, so the teacher's API key should be stored locally,
  DPAPI-protected using the **same trusted key-store mechanism already
  built for the SQLCipher database key** (ADR-0003), and never
  transmitted anywhere except directly to Google's API. This is a
  genuine security improvement on the reference implementation, not
  just a language-migration exercise. The GCash payment/token layer
  (ADR-0042, REJECT) has no equivalent anywhere in this design — BYOK
  removes the need for LIKHA to monetize the AI calls at all.

## Recommended build order (the "ready for Wave 6" sequence)

Ordered by evidence strength, architecture cost, and LIKHA's own
priority order (privacy/security → correctness → DepEd compliance →
teacher usability → offline reliability → maintainability → zero billing
→ performance → speed) — no wave reordering relative to ADR-0042, this
only fills in Wave 6's internal sequence:

1. **6a-i**: Item Analysis (A1) — strongest evidence, zero new
   architecture, ties to live ARAL policy.
2. **6a-ii**: Phil-IRI digitization (A2) — strong evidence, one small
   new table, no paid API.
3. **6a-iii**: Low-risk classroom utilities batch (Tier C) — cheapest
   possible (mostly Impact Tier 1), ships fast once 6a-i/ii prove the
   Teacher Tools navigation/screen pattern.
4. **6a-iv**: LAC sessions + Portfolio/Evidence tracker (B1, B2) —
   moderate new-table work; B2 directly reuses the already-adopted COT
   rubric data, so it's cheaper here than it would be standalone.
5. **6a-v**: Learner Support/Intervention Tracker (B3) — reuses A1's
   and existing attendance data; natural to build once both exist.
6. **6b**: Teacher Creation Studio (D1-D5) — gated on the human
   BYOK-vs-LIKHA-funded decision from ADR-0042; D1 (lesson plan) and D2
   (slide deck, as its own screen consuming D1's stored output, per the
   user's original integration request) first, D3/D4 as pipeline
   extensions, D5 evaluated for a non-AI template approach before
   defaulting to the AI path.

**Not scheduled**: Tier E items (SPED/IEP blocked on missing DepEd
framework; GAD/DRRM deprioritized, already served by existing official
tools; sub-plan generator dropped, no evidence).

## Consequences

- `docs/product/PRODUCT-CONTRACT.md` §11 updated to point here as the
  detailed catalog/architecture record, with the build order summarized.
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 6
  row updated to reference this ADR's full internal sequence.
- `docs/CURRENT-HANDOFF.md` / `docs/PROJECT-MEMORY.md` updated.
- **No product code, schema, or migration was written.** This is a
  ready-to-execute spec, not an implementation — per LIKHA's own scope
  discipline (`PRODUCT-CONTRACT.md` §14: "dozens of minor Teacher Tools"
  ahead of foundational work remains an explicit non-goal for the
  _current_ capability window; this spec exists so that work can start
  immediately and correctly once Wave 6 is actually reached, not so it
  starts now).
- The one open human-approval gate (BYOK vs. LIKHA-funded AI cost,
  ADR-0042) is unchanged by this document — 6a is fully unblocked and
  ready; 6b still needs that decision before its own adapter code
  begins.
