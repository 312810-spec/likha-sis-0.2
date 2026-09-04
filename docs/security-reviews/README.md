# Security review outputs

Durable copies of the independent `security-reviewer` findings that back
security-touching milestones (per `.claude/rules/security-privacy.md`).

The reviewer usually runs via the file-based workaround
(`docs/PROJECT-MEMORY.md` "File-Based Independent-Review Workaround"),
which writes to the session scratchpad — that is disposable. The ADR /
`docs/VERIFICATION-DEBT.md` entry for each milestone carries the verdict
and the acted-on findings; the full report is copied here so the
reasoning survives the session.

One file per review, named `<date>-<subject>.md`.

| File                                                 | Milestone                                                                 | Verdict                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------ |
| `2026-09-03-section-membership-l-school-id.md`       | PR #34 — `l.school_id` on the `learners`-JOIN readers (ADR-0042 addendum) | PASS-WITH-MINORS (folded in)               |
| `2026-09-03-adr-0065-cloud-sync-target.md`           | PR #36 — ADR-0065 cloud sync target decision                              | CHANGES-REQUIRED, non-blocking (folded in) |
| `2026-09-04-adr-0066-tenant-isolation-join-audit.md` | PR #37 — ADR-0066 repo-wide tenant-isolation JOIN audit                   | PASS (2 Minor parity fixes folded in)      |
