# Portable Harness Templates

Reusable, project-agnostic templates. **No LIKHA-SIS, DepEd, learner, or
secret content.** Copy the files in `templates/` into a new project's
`docs/` (or equivalent) and fill in the bracketed placeholders.

The maintained versions live in the ProjectForge repository
(`312810-spec/projectforge`, `templates/`). This directory is the
origin copy and LIKHA's local reference.

| Template                        | Becomes                    | Purpose                                           |
| ------------------------------- | -------------------------- | ------------------------------------------------- |
| `PROJECT-MEMORY.template.md`    | `PROJECT-MEMORY.md`        | durable facts only — never a transcript           |
| `CURRENT-HANDOFF.template.md`   | `CURRENT-HANDOFF.md`       | status, current goal, exact next action           |
| `ACTIVE-PLAN.template.md`       | `ACTIVE-PLAN.md`           | per-milestone detail + verification record        |
| `SOURCE-REGISTRY.template.md`   | `SOURCE-REGISTRY.md`       | third-party sources actually adopted, tagged      |
| `DECISION-RECORD.template.md`   | `docs/decisions/NNNN-*.md` | one durable decision, with the _why_              |
| `VERIFICATION-DEBT.template.md` | `VERIFICATION-DEBT.md`     | correct-as-far-as-checked, not yet fully checked  |
| `PROJECT-AUTHORITY.template.md` | `PROJECT-AUTHORITY.md`     | which source is authoritative for each fact class |

Read order for a resuming session: `PROJECT-MEMORY` → `CURRENT-HANDOFF`
→ `ACTIVE-PLAN` → only the relevant decision record(s).
