# PR #55 Recovery Policy

PR #55 recovery is governed by four rules:

1. **Current main wins.** Archived code never overrides newer architecture, tests, ADRs, harness, or product decisions by default.
2. **Need before code.** A slice is recovered because a current verified need exists, not because implementation already exists.
3. **Small and reversible.** Each accepted subsystem returns through its own bounded PR with relevant tests and review.
4. **Golden Journey remains the spine.** Salvage interrupts product progression only for security, correctness, data-loss, compliance-critical, or direct dependency reasons.
