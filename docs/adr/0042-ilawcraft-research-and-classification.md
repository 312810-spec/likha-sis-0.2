# ADR-0042 — ILAWCraft Research and Classification (PILOT, bounded)

Status: Accepted (PILOT — one representative generator adapter, not the
full studio; payment layer REJECTED; COT rubric dataset ADOPTED as seed
data)

## Context

`docs/product/PRODUCT-CONTRACT.md` §11 and `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s
Wave 6 both named the same explicit prerequisite: "Research and classify
ILAWCraft (ADOPT/PILOT/REFERENCE/REJECT) before any adapter code." The
user asked for this research directly, then pointed this session at
their actual repository (`alotski15-png/ilaw-app-2`, nicknamed
"ilawcraft," made public mid-session for inspection) and asked for the
Teacher Tools segment to be researched alongside it. This ADR is that
classification, plus the durable DepEd-teacher-tooling research that
informs the broader Wave 6 "Teacher Tools" scope. **No product code
changed** — this is research and planning only, matching the same
no-code-yet shape as ADR-0038 (Codex Delegation Harness).

## Research method and a real harness failure encountered

The dispatched `deped-researcher` subagent hit this project's
long-documented agent-resume/retrieval failure (see `docs/PROJECT-MEMORY.md`,
recurring since M7) on both its initial run and one permitted retry —
real work was done but no retrievable findings text came back. Per the
established fallback rule (`.claude/rules/autonomous-development.md`,
"Reviewer harness failures are not automatic stops"), direct
`WebSearch`/`WebFetch` was substituted for the DepEd-teacher-tooling
research below.

Repository access to `ilaw-app-2` went through the same friction as
usual for a cross-owner repo: `add_repo` failed (`cross-tier adds are
not supported in v1` — this session's repos are pinned to one GitHub
owner tier) and an unauthenticated fetch returned 404 while the repo was
still private. Once the user made it public, a dedicated
`create_session` (Claude Code Remote, cloud) was spun up to inspect it,
but its full report also proved unretrievable from the orchestrating
session — cross-session messaging to a cloud session is one-directional
(a message can be sent to it, but it cannot message back;
`ListAgents`/`SendMessage` do not surface it as an addressable peer, and
no session-transcript-read tool is exposed to the parent session). This
is recorded as a **new, distinct harness limitation** from the
already-known same-vendor-subagent-resume failure — worth remembering
for any future cross-session delegation, not just noted once and
forgotten: **once a GitHub repo is public, direct `WebFetch` against
`raw.githubusercontent.com` and the `api.github.com` tree endpoint is
the reliable inspection path in this environment, not a spawned CCR
session**, which was substituted successfully here after the retrieval
dead-end.

## What ilaw-app-2 actually is

A working, deployed (`ilawcraft.vercel.app`) Next.js 16 / React 19 web
app, **not** a Tauri/desktop app and **not** directly portable code —
different language/runtime stack entirely (JS/Next.js API routes vs.
LIKHA's Rust/Tauri commands). Verified directly by reading the real
files (not summarized secondhand):

- **Lesson-plan generation** (`app/api/generate/route.js`): a genuine
  AI-generated (Google Gemini, BYOK — the teacher's own API key, sent
  per-request via header/body, never stored server-side) plan, not a
  template fill-in. The system prompt contains the literal instruction
  `"ILAW TEMPLATE STRUCTURE (MANDATORY)"` — confirmed built against
  DepEd's **current** ILAW format (DepEd Order No. 16, s.2026:
  Intentions / Learning Experience / Assessing Learning / Ways Forward,
  mandatory from Term 2 of SY 2026-2027), not the superseded DLL/DLP
  format. Output is validated against a Zod schema before being
  returned; nothing is persisted server-side (stateless request/
  response).
- **Slide generation is already cleanly separated**, matching exactly
  what the user asked for: `app/api/generate-slides/route.js` refuses
  to run without a prior lesson plan and only returns slide-deck JSON;
  the actual PPTX file is built client-side in `lib/pptx-generator.js`
  via `pptxgenjs` (9 slide layouts, theme colors, speaker notes),
  reading purely from the slide-deck object's shape with no hidden
  coupling to how that data was produced. This means the PPT-generator-
  as-a-separate-screen goal is architecturally already proven upstream,
  not something LIKHA has to invent.
- **A genuine DepEd-specific differentiator not found in any competitor
  product researched this session** (AnongKlase, Ecrah, DCOFF 2.0, the
  free ilawlessonplan.com/.net generators): `lib/cot-rubric.js` encodes
  the **real, full 21-indicator DepEd Annex E-1 Classroom Observation
  Tool (COT) rubric** (RPMS/PPST), with 9 prioritized for lesson-plan
  mode, and `public/` ships the actual official Annex E-2 COT rating
  sheets (Beginning/Proficient/Highly Proficient/Distinguished variants)
  as reference `.docx` files. Each generated lesson-plan section is
  aligned to specific COT indicators with target ratings — tying lesson
  planning to teacher performance-appraisal indicators, which nothing
  else surveyed does.
- **Real test coverage exists**: 6 Vitest files (`ai-providers`,
  `bow-metadata`, `cot-rubric`, `docx-helpers`, `pptx-generator`,
  `slide-deck`) plus fixtures — meaningfully more mature than prototype
  quality.
- **No hardcoded secrets, no real PII** in any file read. The `.docx`
  files committed to `public/` are official blank DepEd reference
  templates (COT rating sheets, the ILAW lesson-plan guide), not
  populated with real names.
- **A real paid/monetization layer exists and must not be carried into
  LIKHA**: `app/api/verify-receipt/route.js` verifies GCash payment
  receipts (₱199) via Gemini's vision model (tamper detection) and
  grants "10 tokens" on success — ilawcraft's own commercial gate,
  including committed GCash QR-code images in `public/`. This directly
  conflicts with `CLAUDE.md`'s zero-billing-by-default rule and the
  synthetic-data/no-real-personal-payment-info discipline; **excluded
  entirely**, not partially ported.
- `AGENTS.md` in the repo instructs any AI coding agent to read
  `node_modules/next/dist/docs/` before writing code, citing breaking
  changes in "this version" of Next.js — plausibly legitimate given
  `package.json` really does show Next.js 16, but flagged here as worth
  a second look before any future session writes code in that repo,
  since the instruction pattern (steer an AI agent to read arbitrary
  bundled files before acting) is also the shape a prompt injection
  could take. Not acted on this session — no code was written there.

## Classification: PILOT (bounded), not ADOPT, not REJECT, not pure REFERENCE

None of the four labels fits cleanly alone, so the classification is
split by asset, matching how this project already treats multi-part
third-party evaluations (`docs/SOURCE-REGISTRY.md`):

- **COT rubric dataset (`lib/cot-rubric.js`'s 21-indicator Annex E-1
  mapping): ADOPT as seeded reference data.** This is the single most
  reusable asset in the repository — pure DepEd reference data,
  independent of ilawcraft's own code, and a genuine differentiator
  worth building LIKHA's own Teacher Creation Studio around. Seed it the
  same way `grading_weight_policies`/`curriculum_versions` are already
  seeded (versioned reference data, no new architecture pattern needed).
- **Generation architecture (AI-prompt structure, Zod-equivalent
  validation, PPTX-as-separate-step): REFERENCE.** The approach is
  sound and worth reusing as a design blueprint — no JS code is directly
  portable into a Rust/Tauri command, so this informs design, it is not
  copied.
- **Payment/monetization layer (GCash receipt verification, token
  gating): REJECT.** Excluded entirely — no partial port.
- **Overall program (one representative Lesson Plan → Slide Deck
  generator adapter): PILOT**, bounded exactly as Wave 6 already
  specified ("Build one representative generator adapter, not the full
  studio") — build LIKHA-native, using ilawcraft's validated approach
  and the adopted COT dataset as the blueprint, not by embedding or
  reusing ilawcraft's own running app. (An iframe/webview embed of the
  live Vercel deployment was considered and rejected: it would require
  LIKHA to depend on an external live service and a paid AI API outside
  its own authorization/architecture boundary, breaking the offline-
  first and "security must not rely on UI hiding" principles for no
  real benefit over a native rewrite.)

## A genuine human-approval gate, not an autonomous decision

Whether the AI-generation calls are funded BYOK (teacher supplies their
own Gemini key, as ilawcraft already does — compatible with LIKHA's
zero-billing default since LIKHA itself pays nothing) or LIKHA-hosted
(LIKHA pays for API access, a real financial commitment) is an
**irreducible product-policy choice** under
`.claude/rules/autonomous-development.md`'s approval-gate list (gate #3,
paid infrastructure) — not something this or any future autonomous
session should decide alone. BYOK is the lower-risk default to propose
when Wave 6 actually begins, since it requires no LIKHA billing
decision, but the choice itself still needs the user's explicit sign-off
before adapter code is written.

## Teacher Tools segment — supplementary DepEd research (durable facts)

Requested alongside the ilawcraft classification, direct `WebSearch`
research (see method note above) confirms real, well-evidenced Filipino
teacher administrative burden and surfaces a broader Teacher Tools
candidate set beyond ilawcraft:

- **Systemic administrative burden is real and officially documented**,
  not anecdotal: IDinsight + EDCOM2 (2,000+ schools, 15,000+ teachers)
  found teachers average 52 hrs/week (mandated: 40), 1 in 4 exceed 60
  hrs/week, ~18 hrs/week on ancillary duties (lesson planning, grading,
  forms) — nearly double DepEd's own 10-hour allowance. DepEd's own
  response: a 57% paperwork cut (from 174 forms) and DepEd Order No.
  006, s.2025 mandating a data-management framework against duplicate
  encoding. This is direct validation of LIKHA's core thesis, not a new
  feature by itself.
- **Item analysis / diagnostic assessment tied to DepEd's ARAL
  (Academic Recovery and Accessible Learning) program**: DepEd Order 18,
  s.2025 made ARAL a scaled, formal remediation mechanism (~2.7M
  learners, Grades 2-11), requiring teachers to identify struggling
  learners from item-level test data. A real Filipino-teacher-built tool
  (`deped.me/tools/item-analysis`) already does per-item difficulty/
  discrimination/distractor analysis for exactly this purpose. **This is
  the strongest new candidate surfaced this session that isn't
  ilawcraft**: LIKHA already stores per-item scores
  (`learner_scores`, M12b/ADR-0012), so item-level difficulty/
  discrimination analysis is an extension of existing data — zero new
  PII, no paid API, no architecture rewrite, and directly tied to a
  currently-live DepEd policy mandate.
- **Low-risk, self-contained classroom utilities** (already named as
  candidates in `PRODUCT-CONTRACT.md` §11: seating plan, random picker,
  group generator, quick class list, advisory checklist, parent contact
  log, intervention tracker, certificate generator) are validated as a
  known-useful pattern by generic/international edtech products
  (Kuraplan, MagicSchool-style rubric/worksheet generators, seating
  chart tools) — real and useful, but **not** confirmed by
  Filipino-teacher-specific demand evidence the way item analysis and
  the paperwork-burden findings are. Flagged as weaker-evidence,
  reasonable-to-build-anyway utilities, not equal-strength claims.
- **SF9/SF10 remain manually prepared today** (quarterly/EOSY, by the
  class adviser) per multiple independent form-reference sources —
  reinforces, does not newly justify, Wave 3's existing Form Engine
  priority; no roadmap change from this finding alone.

## Decision: where this lands in the waves

**No wave reordering.** Wave 6 ("Teacher Creation Studio integration +
Android critical workflows") already correctly anticipated exactly this
research as its own prerequisite, and LIKHA's own priority order
(privacy/security → correctness → DepEd compliance → teacher usability →
offline reliability → maintainability → zero billing → performance →
speed) still puts Waves 1-5's foundational work (RBAC, curriculum,
Learner Core, Form Engine, Teacher Load, sync) ahead of usability
tooling — this research confirms that sequencing rather than
overriding it. Nothing found this session blocks or is blocked by an
earlier wave; Teacher Creation Studio requires no learner PII and no
RBAC/curriculum/Teacher-Load dependency to function at a basic level
(grade/subject/competency can be entered manually, same as ilawcraft
does today, with auto-fill from `teaching_assignments` — Wave 4 — as a
later enhancement, not a prerequisite).

**One refinement recorded for when Wave 6 begins**: split Wave 6's
"Teacher Tools" scope into two internally-ordered slices rather than
one undifferentiated bucket, since they now have visibly different risk
profiles:

1. **6a — Item analysis + low-risk classroom utilities.** No paid API,
   no new architecture, reuses existing data
   (`learner_scores`/sections/learners). Item analysis first (strongest
   evidence, ties to live DepEd ARAL policy); the seating-plan/random-
   picker/certificate-generator style utilities after, as capacity
   allows.
2. **6b — Teacher Creation Studio (lesson plan + slide deck).** Gated
   on the human paid-infrastructure approval decision above before any
   adapter code. Build the one representative generator adapter
   (lesson plan → COT-aligned ILAW output → separate slide-deck screen
   consuming the stored plan), seeding the adopted COT rubric as
   reference data first since it has no such gate.

This ordering is itself consistent with, not a departure from, LIKHA's
established priority order: 6a carries zero paid-infrastructure risk and
ships value immediately; 6b is gated behind the one real product-policy
question this research surfaced.

## Consequences

- `docs/product/PRODUCT-CONTRACT.md` §11 updated with the classification
  and findings above (this ADR is the detailed record; §11 stays the
  concise durable-facts summary, per that file's own stated purpose).
- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s Wave 6
  row updated to reference this ADR and the 6a/6b split, not
  re-litigated otherwise.
- `docs/CURRENT-HANDOFF.md` and `docs/PROJECT-MEMORY.md` updated to
  record this research milestone and its exact next action.
- **No product code, schema, or existing verification/architecture
  script was touched.** No adapter code was written; the payment-layer
  exclusion and BYOK-vs-LIKHA-funded question remain open until the
  user decides, per the approval-gate rule.
- New harness lesson recorded above (cross-session CCR messaging is
  one-directional to cloud sessions; prefer direct `WebFetch` against a
  now-public repo over spawning a CCR inspection session) — worth
  reusing the next time a cross-owner repo needs inspection.
