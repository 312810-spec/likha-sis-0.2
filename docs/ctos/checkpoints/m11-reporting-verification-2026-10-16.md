# M11 reporting verification — 2026-10-16

## Source and merge receipts

PR140 head `db7f992995549e9e8ebf5bf07613412a65c48572` passed Ubuntu and Windows
Quality run 38842928675 and Security runs 38842924492 / 38842928751.
Merged as `9444d9b427a41f1b501c1802c83fdd73a928a99f` after all gates were rechecked.
This preserves curriculum source context in v2 draft fingerprints without rewriting
retained v1 evidence. No deployment.

PR141 head `62e9e45dbdc4e111e09311931d098cdca353891b` passed Ubuntu/Windows
Quality run 38844011698 and Security runs 38844008463 / 38844011658.
It was retargeted to main after PR140 merged and merged as
`e5703aa5a03024eaa26e8870b26e1aab83e2142f` after the exact head and all green
checks were reverified. Windows test-installer artifact: 12023132448.
The guard leaves ambiguous annual policy context pending; it does not certify
official applicability, policy immutability or equivalence.

## Executed local evidence on PR141 head

- Five focused annual-policy regressions passed.
- Full native suite: 1,518 passed across 23 suites; rustfmt and Clippy passed.
- Browser smoke passed: class context, score entry, Forms/Calendar/Account/More,
  light/dark, densities, responsive widths, keyboard saving, zero automated
  WCAG A/AA findings in tested states.
- Browser recovery: 50 checks passed, including draft retention, focus,
  200% text and touch.

Browser checks use synthetic preview fixtures. They do not establish native
authorization, actual export file writes, installed-device, printer, two-device,
manual accessibility or official-form acceptance.

Independent read-only review found no blocking regression in the bounded annual
guard/export diff. It confirmed raw school-scoped pins, all three call sites and
read-only behavior. Existing grading errors may abort before the pending guard;
source-wiring checks do not replace installed end-to-end export validation.

## Next applicability slice

Current `subject_schedule_requirements` stores mutable school-wide weekly minutes;
it must not become official required-subject applicability by inference.
PR103's `school_offerings.rs` / `0050_school_offerings.sql` are salvage references,
not ready-to-adopt code. A separate read-only review found non-atomic predecessor
checks, possible duplicate roots/forked successors, free-text cohort/term scope,
overbroad teacher reads, no authoritative confirmed-head selection, and no pinned
historical consumption. A nonempty citation and hash are not source certification.

Design/test a narrow canonical applicability repository first: exact school/year/
grade/cohort/period context; immutable versions with atomic append and explicit
draft/confirmation/withdrawal selection; trusted read/write scope; structured
evidence and actor/time; ambiguity remains pending; historical consumers pin the
selected version. Preserve canonical subject IDs and keep weekly minutes separate.
Synthetic tests must cover concurrent successors, duplicate roots, foreign scope,
overlaps, newer drafts, withdrawals and unchanged historical pins.
Do not mass-merge PR103 or invent official offerings/equivalence rules.

M10/M11 remain partial. Issuance/amendments, cross-form reconciliation and the
external/device acceptance described in CTOS remain open.

## Acceptance and continuation

The two integrated guards passed their scoped automated and independent checks.
The documentation branch contains only CTOS-STATE, TASK and this checkpoint
relative to merged main; it does not change the verified app source.
Next: narrow applicability repository design and synthetic conflict/authorization
tests, using the salvage constraints above. No production release or deployment.
