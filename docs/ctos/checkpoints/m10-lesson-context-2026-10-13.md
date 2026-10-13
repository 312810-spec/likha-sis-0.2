# M10 — historical lesson teaching context

Baseline: main `f0884e08a66ab8fb6529cbf52107acf23276cf6b` after PR109/110.
Branch: `ctos/m10-lesson-context-20261013`.

## Outcome and implementation

New lesson plans capture canonical school year, grade, section ID/name and subject
ID/name at creation. All three native read paths return the stored snapshot;
content edits leave it intact. The database rejects context updates. The existing
lesson list displays captured context and explicitly labels legacy context as
unavailable. Existing teacher authorization remains in force.

Migration 48 adds nullable context with no historical backfill. Count the ordered
`M::up` entries rather than nominal comments: prior actual versions are scheduling
45, classroom drafts 46, sync scope 47. Earlier handoff references to 46/47/48
were off by one. No released migration was renumbered or changed.

This captures known class context only. It does not infer curriculum, cohort,
term, BOW, competencies, official source validity or professional approval.

## Verification

- Focused frontend tests: 3 files / 26 tests PASS, including captured historical
  context and legacy unknown-context cases.
- SQLite execution of all 47 existing migration SQL blocks and new migration 48:
  PASS; legacy content preserved, context NULL, context modification rejected,
  content remains editable. This is plain SQLite evidence, not SQLCipher/native
  installed-upgrade proof.
- Native regressions added for context preservation after class/year/subject
  changes, new-plan context, content edits and direct context-update rejection.
  Native execution and Rust formatting require CI; local Rust tools unavailable.
- Browser smoke attempted; cached Chromium crashed at launch with SIGSEGV. No
  browser behavior or visual review is claimed. Applicable UI CI remains required.
- Full frontend quality PASS: types, lint, formatting, architecture, dead-code,
  four runner regressions and 149 files / 1,443 frontend tests. Production build
  PASS; existing bundle-size advisory remains.

## Assurance / continuation

Native and UI acceptance are INCONCLUSIVE until applicable CI passes. Required
installed devices and professional acceptance remain NOT RUN. No deployment.

Next M10 slice: explicit curriculum/BOW version and provenance relationships with
subject/term applicability; preserve this stored context and teacher-authored
content. Full M10, M11–M17 and batches C–G are not complete.
