# Harness Memory

The runtime-proven, reusable harness architecture extracted from
LIKHA-SIS as of **LIKHA Production Harness v1.0** (2026-08-27, ADR-0052,
originating commit around `27dc534`). Only evidence-backed components
are recorded here. Each is tagged with a reuse classification:

- **UNIVERSAL** — applies to most projects.
- **PROFILE:<type>** — applies to a class of projects.
- **ADAPTER:<env>** — specific to one AI environment/provider.
- **LIKHA-SPECIFIC** — stays in LIKHA only; listed here only so a
  future extractor knows _not_ to carry it.

## Provenance

| Field                                            | Value                                                                                                                                                                                                 |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Originating harness version                      | LIKHA Production Harness v1.0                                                                                                                                                                         |
| Originating repo / commit                        | `312810-spec/likha-sis-0.2` @ ~`27dc534` (Wave 2L)                                                                                                                                                    |
| Extraction date                                  | 2026-08-27                                                                                                                                                                                            |
| AI environment proven                            | Claude Code (Sonnet-class), Windows 11                                                                                                                                                                |
| Languages proven                                 | Rust (Tauri 2 backend), TypeScript/React (frontend), Node.js (tooling)                                                                                                                                |
| Runtime-verified this extraction                 | repo-authoritative memory docs; deterministic hooks; local memory journal scripts; CI quality + security workflows; architecture-boundary script; LSP navigation (per prior wave, grep-cross-checked) |
| Still conceptual / unproven for non-software use | all PROFILE recipes except `software`; native-app smoke verification; every non-Claude-Code adapter                                                                                                   |

## Component register

### Durable memory — UNIVERSAL

| Component                                                                                   | Purpose                                                                        | Why it survived                                                                                 | Permissions | Network | Context cost               | Replacement / switch condition |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------- | ------- | -------------------------- | ------------------------------ |
| `PROJECT-MEMORY.md`                                                                         | durable facts only, not a transcript                                           | single source of truth that outlived a 3-day outage of an external memory tool with zero impact | plain file  | none    | selective read             | none — permanent               |
| `CURRENT-HANDOFF.md`                                                                        | status + current goal + exact next action                                      | lets any session resume without the prior session's context                                     | plain file  | none    | top section only           | none                           |
| `ACTIVE-PLAN.md`                                                                            | per-milestone detail + verification record                                     | keeps verification evidence attached to the work                                                | plain file  | none    | on demand                  | none                           |
| Decision records (ADR-style)                                                                | one durable architecture/decision per file, with the _why_                     | prevents re-litigation and silent drift                                                         | plain files | none    | only the relevant one      | none                           |
| `SOURCE-REGISTRY.md`                                                                        | every third-party source actually adopted, tagged ADOPT/PILOT/REFERENCE/REJECT | separates "we decided this" from browsing history                                               | plain file  | none    | on demand                  | none                           |
| `VERIFICATION-DEBT.md`                                                                      | correct-as-far-as-checked but not yet checked by the missing means             | stops "unavailable" from being silently reported as "passed"                                    | plain file  | none    | on demand                  | none                           |
| Disposable working memory (`.planning/<task>/{task_plan,findings,progress}.md`, gitignored) | scratch space for a multi-phase task at risk of context compaction             | canonical truth stays in the durable docs; this is recoverable and throwaway                    | plain files | none    | only when a task is active | none                           |

### Deterministic local memory journal — UNIVERSAL (implementation is ADAPTER)

| Component                                 | Purpose                                                                                                            | Why it survived                                                                     | Notes                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| local journal capture (session-stop hook) | records git HEAD sha/subject + changed file _paths_ only, id derived from content hash not timestamp (replay-safe) | zero-cost, zero-network, zero-inference; secret-shaped paths dropped before writing | never records file contents, env vars, or command output        |
| grep-based recall                         | verbatim substring retrieval from the durable docs — no LLM, no embeddings                                         | proven sufficient at this project's scale; deterministic and auditable              | revisit only with concrete evidence grep recall is insufficient |
| health check                              | zero-cost diagnostic, no network call                                                                              | surfaces "external observer down" without a probe that itself can fail              | on-demand, not on every session start                           |

### Deterministic enforcement (hooks) — UNIVERSAL intent, ADAPTER:claude-code implementation

| Component                                                          | Purpose                                                                                                       | Why it survived                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| destructive-command guard (pre-exec)                               | asks before push / hard reset / force / recursive delete / publish / release build                            | deterministic, low false-positive, fast                                                   |
| secret + sensitive-ID guard (pre-write)                            | denies credential-shaped strings; asks on government-ID shapes                                                | defense-in-depth over (not instead of) encrypted storage + a real secret scanner + review |
| targeted auto-format (post-write)                                  | formats only the changed file, fails open                                                                     | cheap; keeps diffs clean without running the full gate                                    |
| continuity reminders (session start / pre-compact / subagent stop) | echo-only strings: read the handoff; persist state before compaction; keep relayed findings in evidence shape | zero cost; measurably reduce lost-context and over-trusted-summary failures               |

### Verification gates — UNIVERSAL intent, PROFILE:software implementation

| Component                                                                          | Purpose                                           | Why it survived                                                                                                  |
| ---------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| fast local gate (`typecheck + lint + format + architecture-boundary + unit tests`) | run for every non-trivial change                  | one command, matches CI, catches the common regressions                                                          |
| security gate (secret scan + dependency/license/advisory audit + vuln scan)        | run before any milestone touching deps or secrets | three-state reporting ("missing" ≠ "clean")                                                                      |
| milestone gate (fast gate + native format/test/lint at `-D warnings`)              | run at a stable checkpoint                        | the one command guaranteed to cover everything incl. doctests                                                    |
| cross-platform CI (two OSes) + separate security CI workflow                       | machine-independent proof                         | free/unmetered on a public repo; security workflow has no `cancel-in-progress` so no push's commits go unscanned |
| deterministic architecture-boundary script                                         | enforces import-direction layering                | catches what code review misses; has its own test                                                                |

### Specialist review/research roles — UNIVERSAL intent, PROFILE-shaped roster

Read-only. Dispatched per milestone class, never to implement fixes.
The LIKHA roster (adapt the set to the project's real risk classes):

| Role                                 | Trigger class                                             | Reducible to a script?                                |
| ------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------- |
| completion evaluator                 | a milestone claims done                                   | no — judges against a contract                        |
| security reviewer                    | auth / persistence / sync / secrets / harness self-review | no — adversarial                                      |
| architecture reviewer                | layer-crossing change, or harness structure               | partly (the boundary script) — judgement for the rest |
| reliability reviewer                 | offline / failure / concurrency / platform robustness     | no                                                    |
| domain-compliance researcher         | feature must match an external authority's rules          | no — needs current primary sources                    |
| dependency researcher                | before adopting any non-trivial dependency                | no                                                    |
| product/UX + accessibility reviewers | user-facing screen changes                                | no                                                    |

Known failure mode: review-agent findings can fail to return. Fallback:
record the failed attempt, do a rigorous self-review, **retain the
independent-review debt** rather than dropping it, retry later.

### Semantic navigation — PROFILE:software, ADAPTER:claude-code

| Component                                  | Purpose                                    | Why it survived                                                                                      | Switch condition                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| language-server plugins (one per language) | real symbol / reference / hover navigation | grep-cross-checked accurate; the only thing that gives true "find all callers" over a large codebase | drop for a CLI-only stack if the plugin develops a supply-chain/telemetry concern, cold-start cost stops being worth it, or per-machine install repeatedly fails onboarding |

### On-demand skills — ADAPTER:claude-code, content is PROFILE/LIKHA-mixed

Progressive-disclosure procedures that load only on a matching task:
project-memory workflow, completion verification, planning-with-files,
architecture boundaries, and domain-specific procedures. A vendored
design-critique "lens" is kept because it is opt-in and costs nothing
when idle — but flagged for removal if it goes unused for a full
production phase.

## What was evaluated and rejected / deferred

| Candidate                                                                                                  | Classification           | Reason                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| External inference-backed memory observer                                                                  | PILOT → DISABLED         | exhausted a free tier and stopped; the plain-text brain never depended on it                                            |
| Other external AI-memory platforms (graph/embedding based)                                                 | REJECT as sole authority | principle 13 — may accelerate, may never own critical knowledge                                                         |
| Documentation-retrieval MCP, structural-search MCP, security-scan MCP, design-tool MCP, cloud-provider MCP | REJECT / DEFER           | CLI + a narrow skill provides the same capability without a per-turn schema cost, a network dependency, or a credential |
| Repository-map / context-router build step                                                                 | REJECT                   | dominated: more tokens and a build step for less than a language server already gives                                   |
| Full-suite mutation testing                                                                                | DEFER                    | disproportionately expensive; only ever as a targeted, module-scoped run                                                |
| Native GUI smoke-test service as the harness spine                                                         | DEFER                    | valuable but a milestone of its own; kept as explicit verification debt, not claimed as done                            |
| Generic filesystem / git / database MCP bundles                                                            | REJECT                   | existing tools already cover this                                                                                       |

## LIKHA-SPECIFIC (do NOT carry into a generic harness)

DepEd policy/terminology rules; official school-form (SF1–SF10)
fidelity procedures; teacher-comfort mode parity
(Efficient/Comfortable/Guided); learner-PII specifics; the SQLCipher +
DPAPI key-store design; the Tauri/Windows packaging procedures; the
SIS-domain review agents' domain knowledge. These are correct for
LIKHA and meaningless elsewhere.
