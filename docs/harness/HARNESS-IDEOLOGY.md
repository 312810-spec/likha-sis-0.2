# Harness Ideology

Timeless, mostly tool-independent principles for running an AI-assisted
project. Extracted from the LIKHA-SIS harness (see ADR-0007, 0045,
0046, 0050, 0052) but written to apply to any project — software or not.
This file deliberately contains **no tool names or version numbers**;
those live in `HARNESS-MEMORY.md`.

## Foundational principles

1. **Durable project truth.** The authoritative record of what the
   project is, where it stands, and what happens next lives in
   plain-text files in the repository — not in a model's context
   window, not in an external service, not in chat history. It must
   survive a new session, a new machine, and a change of AI provider.

2. **Progressive disclosure.** The always-loaded instruction set stays
   small. Detailed procedures load only when the task matches them.
   Volume of guidance is not the same as quality of guidance.

3. **Deterministic enforcement before agentic reminders.** If a rule
   can be checked by a script or a hook, check it that way. A reminder
   that depends on the model choosing to comply is the weakest control;
   use it only where determinism is genuinely impossible.

4. **Tools must earn their existence.** Every component — plugin, agent,
   skill, hook, integration, external service — must justify its unique
   capability against its cost in context, tokens, credentials,
   permissions, network dependence, supply-chain surface, and
   maintenance. Installation is not permanent membership.

5. **CLI before persistent integration when equivalent.** A
   command-line tool invoked on demand is preferable to an
   always-connected server when they provide the same capability. The
   server adds a schema cost on every turn, a network dependency, and
   often a credential.

6. **Narrow specialists over broad swarms.** A few review/research
   roles with sharp, non-overlapping mandates beat a large roster of
   near-duplicates. Each specialist should map to a real risk class the
   project has committed to caring about.

7. **Current evidence over historical recommendation.** What an earlier
   session, document, or advisor proposed is input, not authority.
   Re-verify against the repository and the world as they are now.

8. **Benchmark over popularity.** Adopt a tool because it measurably
   helps on representative tasks from _this_ project, not because it is
   trending.

9. **Least privilege.** Prefer read-only and debugging capability.
   Never hold standing power to mutate production, move money, or
   change security settings just because an integration makes it
   convenient.

10. **Local and provider-independent operation where practical.** The
    project should remain understandable and buildable offline, and the
    core method should not be welded to one AI vendor's mechanisms.

11. **Verification is part of implementation.** A change is not done
    until the relevant tests, type/lint/build checks, and
    edge/error-state inspection have actually run. "It should work" is
    not a result.

12. **Context is an engineering resource.** Tokens and context window
    are budgeted like memory or latency. Reading exhaustively when a
    targeted read would do is a cost, not thoroughness.

13. **Memory must survive the model.** No external AI-memory platform
    may become the sole authority for critical project knowledge. If
    such a tool is used at all, it is an accelerator over a
    plain-text source of truth, never a replacement for it.

14. **Scenario exploration proportional to decision consequence.** A
    reversible config choice needs a sentence. A durable
    architecture/database/security decision needs a structured
    multi-scenario comparison and a written record.

15. **Adversarially challenge winners.** Before committing to the
    highest-scoring option, attack it from the perspectives of
    security, architecture, maintainability, efficiency, and delivery
    speed. A number is not a decision.

16. **Prefer reversible decisions.** Make the smallest change that
    achieves the goal, in a form that can be backed out cleanly.

17. **Remove experiments after learning from them.** A pilot that was
    run and evaluated should be dispositioned — kept, replaced, or
    removed with its dead configuration, scripts, and dependencies
    cleaned up. Do not leave half-adopted tooling in place.

18. **Freeze the harness once it is sufficiently capable.** Past a
    point, further tooling optimisation has negative expected value:
    the disruption exceeds the gain. Declare a baseline, freeze it, and
    change it only for a blocker, a real defect, a genuinely missing
    capability, an obsolete component, or benchmarked evidence of
    substantial improvement.

19. **The harness adapts to the project.** Classify the project, assess
    its risk and complexity, and assemble only the memory, rules,
    skills, specialists, tools, and verification that objective
    actually needs. The project does not reshape itself to fit a
    fixed tool stack.

20. **The harness gets out of the way once execution begins.** Setup is
    a means. When the work is understood and the baseline is frozen,
    the default action is to do the work.

## How these are meant to be used

- When adding anything to the harness, check it against principles 4,
  5, 6, 9, 13.
- When a session is tempted to re-open tooling, check principles 7, 8, 18.
- When deciding how much process a decision needs, check principle 14.
- When a milestone is "almost done", check principles 11 and 17.
