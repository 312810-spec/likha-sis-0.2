---
name: scope-drift-review
description: Use after implementing a change and before calling it done — compares the actual diff against the intended task to catch unrelated files, dependencies, config changes, or architecture-boundary drift before it ships.
---

# Scope Drift Review

Adapted from the concept in `DietrichGebert/ponytail` (REFERENCE only —
not installed; this is a small project-local skill, not a plugin). Read
only, non-blocking, no Stop hook. Run it yourself; it does not run
automatically.

## When to use

After implementing a change, before the completion report — a natural
companion to `completion-verification`, not a replacement for it. Most
valuable on anything touching more than one or two files, or anything
that took several iterations to get working.

## What to check

Compare the diff (`git status`, `git diff --stat`) against what the task
actually asked for:

1. **Unrelated files** — does every changed file trace back to the task?
   A fix to `AttendanceScreen.tsx` that also touched
   `LearnerListScreen.tsx` needs a reason stated, not just a fact noted.
2. **Unexpected dependencies** — did a new package get added that
   wasn't necessary for this specific task? Check `package.json`/
   `Cargo.toml` diffs specifically.
3. **Configuration changes** — did `.Codex/settings.json`,
   `tsconfig.json`, `vite.config.ts`, or a CI/build file change without
   the task calling for it?
4. **Public API / interface changes** — did a repository port, domain
   type, or Tauri command signature change in a way broader than the
   task needed?
5. **Excessive diff spread** — is the diff much larger than the stated
   task would predict? A one-line bug fix producing a 300-line diff is
   worth a second look, not an automatic problem.
6. **Formatting-only churn** — did a formatter/linter touch files
   unrelated to the actual change? (Usually harmless, but confirm it's
   really formatting-only, not a hidden logic change riding along.)
7. **Unrelated subsystem modifications** — does the diff touch a
   different application layer or domain area than the task named?

## What to do with a finding

`implement → test → scope-creep review → revert/split/justify drift → continue`

1. If a touched file has no good reason: revert just that file, or split
   it into a separate change with its own justification.
2. If the reason is good (e.g. a shared type had to change to support
   the fix): say so explicitly in the completion report, don't leave it
   silent.
3. If the same _kind_ of drift keeps recurring across sessions: that's
   a signal to strengthen a rule/boundary/lint check
   (`.Codex/rules/architecture.md`, `scripts/check-architecture.mjs`),
   not to add another prose reminder — see `docs/learning/ERROR-PATTERNS.md`.

## What this is not

Not a license to relitigate the project's actual architecture. Never
use this to justify simplifying away a security boundary, an
authorization check, the UI → Application Services → Domain →
Repository layering, an intentional provider interface, offline/
recovery logic, migration safety, or accessibility — see
`.Codex/rules/architecture.md` and `.Codex/rules/security-privacy.md`.
Generic "this could be simpler" does not override intentional
architecture recorded in an ADR.
