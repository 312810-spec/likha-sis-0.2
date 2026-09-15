# Harness Principles — LIKHA-SIS 0.2

## Purpose

The harness exists to help LIKHA ship safer, better work with less wasted time, context, code, CI, and model spend. It is not a product of its own.

## Decision method

For major harness changes, use the same discipline as major product architecture: examine the problem from ten expert perspectives, generate twenty viable operating scenarios internally, challenge the strongest candidates, and retain only Recommended + Next Best. Do not expose the debate unless asked. The exercise must reduce uncertainty, not create ceremony.

The ten standing perspectives are: product delivery, principal engineering, security/privacy, reliability/offline, test/CI, developer experience, AI orchestration/token economics, dependency/supply chain, maintainability/simplicity, and adversarial failure review.

## Recommended philosophy: Minimum Sufficient Harness

1. **Outcome over machinery.** Add harness machinery only when it prevents a demonstrated failure, removes repeated work, or materially improves delivery.
2. **Evidence funnel.** Cheap scout → focused specialist only if needed → compact planning packet → planner only for major/high-risk ambiguity → bounded builder → independent verification proportional to risk.
3. **Progressive disclosure.** Task/diff/search first. Load the smallest useful context. Never make giant memory files or the whole repository default input.
4. **One owner per answer.** Parallel work only for genuinely independent questions. No swarms that return overlapping summaries.
5. **Model neutrality.** Route by capability tier and measured performance. Providers and model names are replaceable bindings.
6. **Prompt Master for expensive planning.** Major plans use a compact evidence packet and Prompt Master. Routine work does not pay this planning tax.
7. **Two-attempt debugging.** Two evidence-based attempts per failure mechanism, then change strategy/workaround/escalate/stop.
8. **Risk-shaped verification.** Low-risk changes get narrow checks; medium-risk changes add integration/UX checks; high-risk security, PII, sync, migration, forms, auth, isolation, or provider changes receive independent challenge plus full affected verification.
9. **Fail cheap first.** Deterministic metadata, architecture, lint/type/unit checks precede browser/native work. Independent security scanning stays fail-closed.
10. **Affected work, not habitual work.** Use changed paths/dependency relationships to avoid irrelevant checks. Full suites remain for high-risk boundaries and periodic checkpoints.
11. **Fresh when touched.** Check current stable official versions when a tool is introduced or materially revisited. Avoid repository-wide update churn.
12. **Delete overlap.** A new agent, skill, hook, plugin, MCP, script, or dependency must replace something, fill a measured gap, or prove a clear net benefit.
13. **No lock state.** The harness stays evolving. Verified checkpoints are evidence, not a freeze.
14. **No vendor-owned control plane.** Repository rules, skills, verification, and memory must remain usable without Claude, Codex, Gemini, or another single provider.
15. **Less code is a feature.** Prefer conventions, existing package scripts, GitHub Actions primitives, and small deterministic checks before adding orchestration frameworks.

## Token budget defaults

- Scout return: <=300 words.
- Specialist return: <=800 words unless evidence requires more.
- Planning packet: target <=3,000 words.
- One planning pass plus one adversarial revision by default.
- Do not send whole source files when a diff/function/range is sufficient.
- Do not ask multiple agents the same question.
- Summaries contain findings, evidence, risks, and decisions—not transcript-style reasoning.

## CI shape

Tier 0: changed-path classification and harness/architecture sanity.
Tier 1: type/lint/format/unit checks for affected code.
Tier 2: Rust/native or UI/accessibility checks only when relevant.
Tier 3: Windows build, full browser suite, destructive/recovery/security boundary tests for relevant high-risk changes and periodic checkpoints.
Security scanners remain independent and fail-closed.

GitHub-native path filters, concurrency cancellation, dependency caching, and existing package scripts are preferred before adopting another CI framework. Evaluate affected-task frameworks only when repository scale proves native routing insufficient; zero-billing and security rules still apply.

## Growth test

Before adding harness surface, answer: What recurring failure does this solve? Can an existing rule/script/check solve it? What context and maintenance does it add? Can it run locally/offline? Does it create vendor lock-in or billing? What can be removed if it is added? How will we know it worked after three real waves?

If the benefit cannot be measured, pilot it outside the critical path or reject it.

## Next Best

If the Minimum Sufficient Harness becomes too manual as LIKHA grows, evolve toward a small dependency-aware task graph for affected checks and caching. Do not adopt remote paid orchestration by default. The upgrade trigger is measured CI/rework pain, not architectural fashion.

## Success measures

The harness is improving when median feedback time falls, repeated failures fall, context loaded per task falls, expensive-model calls fall, CI duplication falls, and escaped security/correctness regressions do not rise.
