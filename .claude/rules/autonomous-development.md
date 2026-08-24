# Autonomous Continuous Development Mode

This is LIKHA's default operating mode (adopted 2026-08-24, directed by
the user). It supersedes any older instruction, ADR note, or handoff
text implying "finish a milestone → stop → ask the user what's next."
Where such text still exists in `docs/`, treat it as historical record,
not current instruction — mark it superseded in place rather than
deleting it (see `docs/CURRENT-HANDOFF.md`'s "Current Goal" section for
an example of a marked-superseded block).

## The loop

Understand → Research → Specify → Plan → Implement → Test → Review →
Update Memory → Stable Checkpoint → Select Next Highest-Value Work →
Continue.

**A Stable Checkpoint does not mean stop.** At each milestone boundary:

1. Run the required verification.
2. Record the real results (never claim a check passed unless it
   actually ran).
3. Update ADRs, memory, handoff, source registry, and roadmap as
   appropriate.
4. Evaluate the next work using current evidence and LIKHA's priorities.
5. Use the 10-scenario decision process where a genuine architecture
   decision is required (see below — it is not an approval request).
6. Select the next milestone autonomously.
7. Continue implementation.

Do not wait for the user merely because an M-number has completed.

## Autonomous milestone selection

When several next tasks are viable, select using LIKHA's established
priority order (from `CLAUDE.md`):

privacy/security → correctness → DepEd compliance → teacher usability →
offline reliability → maintainability → zero billing → performance →
implementation speed

Also weigh: dependency order, newly discovered evidence, architectural
leverage, reusable foundations, teacher workflow value, reduction of
known correctness/security debt, whether later work is blocked by the
candidate, and current authoritative DepEd requirements.

For major architecture/database/sync/auth/security/framework/repository/
dependency choices, keep using the 10-scenario process already
established in this project (see `docs/adr/0008-*`, `0013-*` for
examples of it in use). **The 10-scenario process is a decision
mechanism, not an approval request** — choose Recommended + Next Best,
document the decision (an ADR for durable architecture calls), and
proceed with Recommended unless a genuine human approval gate (below)
applies. Do not run it when an existing ADR's pattern already settles
the question — extending an established pattern (e.g. seeding another
versioned reference-data row) is not a new architecture decision.

## Do NOT stop for these

Do not stop merely because: a milestone completed; tests passed; an ADR
was written; a stable checkpoint was reached; the roadmap lists a "next
candidate"; several technical candidates exist; the next milestone needs
research; a new architecture decision requires the scenario process;
independent review has debt; a reviewer harness fails under the
established retry rule (below); documentation says "pick M_/M_/etc.";
or an earlier handoff says "no candidate pre-selected." Where the
documentation itself says one of these things, that documentation
statement is superseded by this rule, not still-current guidance.

## Genuine human approval gates

Stop and ask the user only when continuing requires something that
cannot responsibly be decided from project evidence and established
rules:

1. **Irreducible product-policy choice** — a consequential product
   decision has multiple defensible options and the correct choice
   depends on owner preference, not evidence (e.g. what authority
   principals vs. registrars vs. advisers should have, where the project
   has no accepted policy). Do not classify an ordinary architecture
   decision as a human-product decision merely to avoid choosing.
2. **External material only the user can provide** — an authoritative
   official form/template unavailable from existing sources, a signing
   certificate, a production credential, a school-specific policy
   document, or a required sample workbook that cannot legally/safely be
   sourced otherwise. Research first before assuming the user must
   provide it.
3. **Paid infrastructure or financial commitment** — do not enable paid
   cloud plans, billing, paid APIs, or services requiring financial
   commitment without explicit approval. Zero-billing experiments may
   continue autonomously.
4. **Production PII/security gate** — stop before introducing real
   learner PII when required security protections have not been proven.
   Synthetic-data work may continue.
5. **Destructive or materially risky operation** — stop before a
   destructive production migration, irreversible data deletion,
   secret/key rotation affecting real environments, destructive
   repository-history manipulation, or a similarly consequential
   irreversible action. Ordinary tested local schema migrations against
   synthetic development data do not automatically require approval.
6. **Missing legal/compliance evidence where guessing would be unsafe**
   — if an authoritative DepEd rule is necessary and cannot be verified,
   do not guess; research further; implement unaffected foundation work
   if possible; stop only if the missing rule actually blocks safe
   progress.
7. **Explicit user instruction** — if the user says to stop, wait,
   review, or not proceed beyond a point, obey it.

## Reviewer harness failures are not automatic stops

Follow the project's established agent/reviewer failure rule. If an
independent reviewer performs work but findings can't be retrieved, hits
the known resume/retrieval problem, or fails after the permitted retry:

1. Record the failed review attempt honestly.
2. Perform a rigorous self-review.
3. Retain independent-review debt (record it in the handoff, don't drop
   it).
4. Continue development unless the self-review finds a blocking issue.

Do not repeatedly spend large amounts of context trying to recover a
known-broken reviewer result. Periodically retry the owed independent
reviews in later sessions when the harness appears healthy.

## Verification still matters

Continuous development does not mean skipping checkpoints. Before
considering a milestone complete: run the relevant test suites; run
lint/clippy/typecheck/build/architecture checks; verify migrations;
verify authorization/isolation; run relevant native smoke checks when
available; disclose unavailable verification rather than claiming
success. If verification fails: diagnose, fix, rerun — do not continue
building later milestones on a known-broken checkpoint unless the
failure is proven unrelated and explicitly documented.

## Scope discipline still applies

Autonomous continuation does not mean implementing everything. At every
milestone: keep scope tight; prefer one excellent reusable pattern;
avoid unrelated refactors; do not invent missing DepEd rules; do not
expand PII collection unnecessarily; do not broaden a milestone merely
because capacity is available. Extra development capacity (see
`docs/PROJECT-MEMORY.md`'s "Development Resource Assumption") is for
deeper research, stronger tests, review, and durable foundations — not
uncontrolled feature expansion.

## Roadmap behavior

Treat the roadmap (`docs/CURRENT-HANDOFF.md`, `docs/PROGRESS-MAP.md`) as
a living priority map, not a sequence of mandatory approval gates. After
every milestone: if new evidence changes the best sequence, update the
roadmap and proceed with the better sequence; if an old candidate
becomes obsolete, record why it was superseded; if a newly discovered
foundational defect exists, prefer repairing the foundation before
adding dependent features; if no new evidence changes the roadmap,
continue directly to the next planned milestone. Do not ask the user to
"pick the next milestone" unless the choice genuinely meets one of the
approval gates above.

## Session/context safety

Autonomous continuation applies within practical session limits. Before
context becomes unsafe or the session clearly approaches resource
exhaustion: finish the smallest safe unit of work; run relevant
verification; update `CURRENT-HANDOFF.md` and `ACTIVE-PLAN.md`; record
unresolved issues; leave an exact resumable next action. A
session-resource boundary is a valid stopping point. Do not begin a
large risky migration or architectural rewrite when there is obviously
insufficient context/time left to complete and verify it safely.

## Final rule

Checkpoint ≠ Stop. Milestone completion ≠ Ask permission. Research or
decision work ≠ Human approval gate. Default behavior: verify → document
→ decide → continue. Stop only for a real approval gate, a blocking
safety/correctness issue, an explicit user instruction, or a practical
session/resource boundary.
