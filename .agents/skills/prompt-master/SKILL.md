---
name: prompt-master
version: likha-wrapper-1
description: Turn rough instructions into bounded, production-ready prompts for AI tools. Use when the user explicitly asks for a prompt or when LIKHA's major/high-risk planning workflow explicitly calls for Prompt Master.
---

# LIKHA Prompt Master

Purpose: produce a concise, paste-ready prompt that preserves LIKHA constraints while remaining portable across providers and agent runtimes.

## Hard rules

- Confirm the target tool only when it materially changes the prompt and is not already known.
- Never request hidden chain-of-thought, private reasoning, or verbatim internal reasoning. Ask for conclusions, assumptions, evidence, concise rationale, and verification results.
- Do not invent model names, model slugs, context limits, tool capabilities, or API parameters. If model-specific behavior matters, verify current official documentation first.
- Keep provider/model choices as runtime bindings. Repository architecture and acceptance criteria stay provider-neutral.
- Prefer explicit outcome, scope, constraints, approval boundaries, verification, and stop conditions over elaborate meta-prompt frameworks.
- No real learner PII in prompts, examples, fixtures, screenshots, or generated test data.
- Never authorize paid infrastructure, destructive operations, production deployment, or security-boundary changes unless the user explicitly approved them.

## For LIKHA implementation prompts

Include these sections when applicable:

- GOAL / OUTCOME
- REPOSITORY TRUTH / EVIDENCE
- AUTHORIZED FILES OR AREAS
- ARCHITECTURE INVARIANTS
- SECURITY / PRIVACY INVARIANTS
- PRODUCT / TEACHER EXPERIENCE CONSTRAINTS
- OUT OF SCOPE
- TESTS REQUIRED
- VERIFICATION COMMANDS
- APPROVAL BOUNDARIES
- STOP CONDITIONS
- DONE WHEN
- RETURN EVIDENCE

For major architecture/security/database/sync/auth/hosting/framework/dependency decisions, require the LIKHA scenario method: research current authoritative sources and strong OSS, generate the required scenarios internally, challenge the strongest candidates, and return only Recommended + Next Best unless more options are requested.

For Golden Journey/UI work, require Efficient / Comfortable / Guided parity, Windows desktop-productivity behavior, intentional Android behavior, accessibility, loading/empty/error/offline/recovery states, synthetic data, and independent premium-design/teacher-comfort review when significant.

## Context discipline

Prompt Master compresses rather than inflates. Start from the current task/diff and targeted repository evidence. Do not paste whole project-memory files or the whole repository when a bounded evidence packet is sufficient.

For major/high-risk work, use `docs/harness/PLANNING-PACKET-TEMPLATE.md` and `.agents/skills/model-routing/SKILL.md`.

## Target-tool adaptation

Adapt syntax and tool instructions to the selected AI surface only after verifying material current capabilities when needed. Stable prompting guidance should outlive any model picker. If current provider documentation cannot be checked, avoid brittle model-specific claims and state the uncertainty in setup notes rather than guessing.

The retained upstream provenance and generic pattern/template references live beside this skill. They are references, not authority over LIKHA's security, architecture, privacy, or approval rules.
