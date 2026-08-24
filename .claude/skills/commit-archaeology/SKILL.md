---
name: commit-archaeology
description: Use before changing old or unfamiliar-looking code whose intent isn't obvious from reading it alone — especially in migrations, auth, security, section membership, grading, exports, sync, encryption, or provider boundaries — to find out why it exists before "simplifying" it away.
---

# Commit Archaeology

Concept borrowed from the "commit archaeologist" idea referenced by
`Shubhamsaboo/awesome-llm-apps` (REFERENCE only — not installed, no
external model infrastructure pulled in). This is a manual research
method using `git log`/`git blame`/ADRs already in this repo, not a new
tool. Do not run this for every trivial edit — reserve it for code that
looks like it could be simplified but that instinct feels risky to act
on immediately.

## When to use

Before changing code where:

- the reasoning isn't obvious from reading the code and its comments
  alone;
- it touches migrations, `auth/`, `crypto/`, `session`, section
  membership, grading computation, exports, or anything a future
  `SyncProvider` will touch;
- a first instinct is "this looks over-engineered, I could simplify
  this" — that instinct is exactly the trigger to check first, not
  proceed on.

## Method

1. **Check the ADRs first.** `docs/adr/*.md` records durable
   architecture decisions with their reasoning — this project's own
   canonical source of "why," not git history. Read the relevant one
   before touching anything in a layer an ADR already covers.
2. **`git log --follow -p -- <file>`** (or `git log -L
<start>,<end>:<file>` for one function) to see how the code arrived
   at its current shape — not just the latest commit, the sequence.
3. **`git blame <file>`** to find which commit introduced a specific
   line, then read that commit's message and diff in full context
   (`git show <sha>`), not just the one line.
4. **Cross-reference with `docs/PROJECT-MEMORY.md`** — durable facts are
   recorded there per milestone; a construct that looks redundant may be
   guarding against a bug class already fixed once (this project has
   done this more than once — e.g. the M4 unauthenticated-bootstrap
   fix, the check-then-act membership race fixed via a real unique
   partial index).

## What to do with what you find

- If the history/ADR explains the construct and the reasoning still
  holds: leave it, and consider adding a short comment citing the ADR
  if none exists yet, so the next session doesn't have to re-run this
  same archaeology.
- If the reasoning genuinely no longer applies (e.g. a workaround for a
  dependency bug that's since been fixed upstream): that's a legitimate
  case for simplification — but say so explicitly, citing what changed,
  not just "this looked unnecessary."
- If you can't find a clear reason after checking both ADRs and git
  history: treat that as a real gap, not permission to guess. Ask, or
  leave the code as-is and flag the missing documentation rather than
  changing behavior you don't understand.

## What this is not

Not a requirement to research history before every change — most edits
(a new screen, a new field, an additive migration) need none of this.
It exists specifically to stop a plausible-looking "simplification"
from silently reintroducing a bug class this project already paid to
fix once.
