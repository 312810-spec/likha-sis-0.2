# Adoption Guide

How to stand up this harness for a **new project that is not
LIKHA-SIS** — and not necessarily software. Read `HARNESS-IDEOLOGY.md`
first for the principles; this document is the procedure.

The canonical, maintained version of this guide lives in the
ProjectForge repository (`312810-spec/projectforge`,
`docs/ADOPTION-GUIDE.md` and `core/`). This copy is LIKHA's local
reference and the origin record.

## The ten steps

### 1. Classify the project

Pick the closest project type (these are ProjectForge _profiles_):
general, software, web, native/mobile, research, business/product idea,
data/analytics, automation/integration, education, writing/document,
design/creative. A project can start as `general` and specialise later.
The classification selects which capability recipe you start from — it
is not a rigid label.

### 2. Identify risks

Write down, in one paragraph each: what must not go wrong (safety,
privacy, money, reputation, irreversibility); what external authority's
rules the work must satisfy; what is hard to undo. Risk level drives how
much of the harness you turn on.

### 3. Choose profiles

Turn on the one primary profile from step 1. Add a secondary profile
only if the work genuinely spans two classes (e.g. a research project
that ships a web dashboard). Resist turning on more — unused profile
guidance is context cost with no benefit.

### 4. Select the provider adapter

Choose the AI environment adapter (Claude Code is the first proven
one). The adapter supplies environment-specific mechanisms — hooks,
agent definitions, skill format. The core method does not change with
the adapter.

### 5. Establish durable memory

Create, from the templates in `portable/templates/`:
`PROJECT-MEMORY.md`, `CURRENT-HANDOFF.md`, `ACTIVE-PLAN.md`,
`SOURCE-REGISTRY.md`, `VERIFICATION-DEBT.md`, a decision-record folder,
and `PROJECT-AUTHORITY.md` (who/what is the authoritative source for
each kind of project fact). Fill in the product/goal section of
`PROJECT-MEMORY.md` and the current goal + exact next action in
`CURRENT-HANDOFF.md`. These files are the project brain from now on.

### 6. Choose tools

For each capability the project needs, walk the ladder and stop at the
first rung that is sufficient:

```
current capability  →  local/deterministic tool  →  CLI + a narrow skill
   →  plugin  →  persistent integration/MCP  →  external service
```

Record every adopted tool in `SOURCE-REGISTRY.md` with a tag and a
switch condition. Do not adopt a tool you cannot name a switch
condition for.

### 7. Verify integrations

Actually run each retained tool once. A tool appearing in configuration
is not evidence it works. Anything you cannot execute in this
environment becomes a `VERIFICATION-DEBT.md` entry, not a silent
assumption.

### 8. Source review

Before trusting any third-party component: check its provenance
(official docs → official repo → release/security info → mature OSS →
secondary sources → marketplaces are discovery only), its maintenance
status, its licence, its network/telemetry behaviour, and its
permission surface. Reject on anomalous supply-chain signals before any
of its code runs.

### 9. Initial scenario review

For the project's foundational decisions (architecture, data model,
security model, primary external dependency), run a structured
multi-scenario comparison, challenge the top option adversarially, and
write a decision record. Reversible config choices do not need this.

### 10. Freeze the baseline and start executing

Declare the harness baseline. From here, the default action is the
work, not more tooling. Change the harness only for a blocker, a real
defect, a genuinely missing capability, an obsolete component, or
benchmarked evidence of substantial improvement.

## Non-software examples (sanity check the guide against these)

- **A generic marketing website.** Profile: `web`. Risk: brand/reputation,
  accessibility, no PII. Memory: goal + page inventory in
  `PROJECT-MEMORY.md`; per-page work in `ACTIVE-PLAN.md`. Tools: a
  static-site CLI, a link checker, an accessibility CLI — no MCP.
  Specialists: an accessibility reviewer, a copy/UX reviewer.
  Verification: build + link check + a11y check; a human visual pass
  recorded as debt if no screenshot tool.
- **A native desktop app.** Profile: `native`. Risk: irreversible file
  operations, packaging/signing, offline reliability. Memory as
  software. Tools: language server(s), the platform's build CLI.
  Verification: unit + integration + a real packaged-binary smoke test;
  if the last cannot run here, it is verification debt, never "passed".
- **A research project.** Profile: `research`. Risk: citation integrity,
  reproducibility, not overclaiming. Memory: research question +
  established findings in `PROJECT-MEMORY.md`; `SOURCE-REGISTRY.md`
  becomes the citation ledger; `VERIFICATION-DEBT.md` tracks claims not
  yet independently checked. Tools: a reference manager CLI, a
  data/notebook runner. Specialists: a methodology reviewer, a
  source-integrity researcher. Verification: re-run the analysis end to
  end; reproduce at least one result exactly.
- **A business/product idea (pre-project).** Profile: `business`. Risk:
  committing resources on an untested assumption. Memory: the idea,
  the assumptions, and which assumptions are tested vs. not.
  `VERIFICATION-DEBT.md` holds the untested assumptions explicitly.
  Tools: minimal — a spreadsheet, a survey export. The harness's job
  here is to stop an assumption from silently becoming a "fact".
- **An education task (course/curriculum).** Profile: `education`. Risk:
  matching an official standard, accessibility of materials. Memory:
  learning objectives + standard being matched. Specialist: a
  standards-compliance researcher. Verification: every objective maps
  to an assessment; a review pass against the standard.
- **A long writing/document project.** Profile: `writing`. Risk:
  consistency, factual accuracy, structure drift over many sessions.
  Memory: outline + decisions about scope/voice in `PROJECT-MEMORY.md`;
  per-chapter status in `ACTIVE-PLAN.md`. Verification: a structural
  read-through and a fact-check pass, each recorded.
- **A data-analysis task.** Profile: `data`. Risk: silent data-quality
  errors, non-reproducible results. Memory: dataset provenance +
  cleaning decisions. Verification: schema/row-count assertions,
  re-run from raw input, one result reproduced by hand.

In every case the guide should be able to answer: how to classify it,
what memory it needs, what research it needs, what tools fit, what
specialists help, and how completion is verified — **without assuming
software, a particular language, or a particular domain.**
