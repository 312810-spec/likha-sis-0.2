# Class Folio cases

**Created at:** M05 (2026-10-06). The registry had no row for this file, so it is
written from the test names that genuinely exist at the cited lines, not backfilled
from the plan.

Every case below names a real test. `Verified` means the test exists and is wired
into the run that M05's checkpoint records.

M05's acceptance clause is narrow and worth stating because it governed what was
built: _"The teacher should not repeatedly reselect grade/section/subject/term when
the active class already determines them."_ Grade, section and subject were already
determined by the teaching assignment and revalidated on every use; **term was not**.
So five of the six required properties are verification items and one — internal
state retention — needed real implementation.

## internal state retention — the one property that needed building

`ClassRecordJourneyScreen.resolve()` blanked the grading period and weighting on
every mount, and the Class Folio remounts whenever the teacher moves between
Dashboard, My Classes and Class Record (`App.tsx` keys the folio by the active
destination so the worksheet tab can take effect). Choosing a term, opening a
record, looking at another destination and coming back re-asked the same two
questions.

The pair is now held in App session state keyed by the assignment, recalled on the
next visit, and cleared with the session rather than with the class context — going
back to Today and reopening the same class should not re-ask an answered question.

- **the term and weighting chosen for a class are recalled instead of re-asked** —
  `Verified`. `src/ui/ClassRecordJourneyScreen.test.tsx:208`. The record is openable
  in one action with both selects already at the recalled values.
- **recalled across destinations, surviving the folio remount** — `Verified`.
  `src/App.test.tsx:202`. Choose the term on Dashboard, leave for another
  destination, return to Class Record: the grading period and weighting are still
  selected and "Open class record" is enabled.
- **the chosen pair is reported back so the app can recall it** — `Verified`.
  `ClassRecordJourneyScreen.test.tsx:238`, and only after both ids were validated
  against the lists the school publishes.
- **an explicit choice is still required when nothing has been chosen** —
  `Verified`. `ClassRecordJourneyScreen.test.tsx:190`. Unchanged from before M05.

## the recall is revalidated, never guessed

The journey's docstring already committed LIKHA to never guessing either academic
choice from array order, a default flag, or a subject name. Recalling a choice is
not guessing it, but the distinction only holds if the recalled ids are checked
against current authority and dropped when they no longer match.

- **a grading period the school no longer publishes is not recalled** — `Verified`.
  `ClassRecordJourneyScreen.test.tsx:228`. A retired period falls back to an
  explicit choice rather than being clamped onto whichever period happens to be
  first. This is the property that keeps the recall from being a silent default.
- **a stale or unauthorized assignment is refused** — `Verified`.
  `ClassRecordJourneyScreen.test.tsx:267`. The teaching assignment is revalidated
  before its section and subject identifiers are used.
- **the class context is validated against current authorized assignments** —
  `Verified`. `src/ui/AssignedClassFolio.test.tsx:149`. A context whose assignment
  is gone cannot retain an actionable class sheet.
- **a record from another assignment or weighting is not reopened** — `Verified`.
  `ClassRecordJourneyScreen.test.tsx:172`. The match is on section, subject,
  period, weighting _and_ school year.

Not claimed: recalling a _class record id_. The record is re-derived from the
validated period + weighting pair on every visit, so a deleted record is never
silently restored. That is why "Open class record" is still one click after a
remount rather than zero.

## unmistakable identity

- **the selected class names itself and carries into attendance** — `Verified`.
  `src/ui/AssignedClassFolio.test.tsx:56`. The heading names the section, the
  sheet shows subject and school year, and an `aria-live` region announces the
  selection.
- **the class and its schedule stay visible inside the workspace** — `Verified`.
  `src/ui/ClassWorkspaceScreen.test.tsx`, "keeps the selected class and schedule
  visible".
- **accessible class selection, tabs, and connected actions** — `Verified`.
  `AssignedClassFolio.test.tsx:191`.

## authorized command and search routing

- **attendance opens for the selected teaching assignment** — `Verified`.
  `src/ui/ClassWorkspaceScreen.test.tsx`, "opens subject attendance for the
  selected teaching assignment".
- **the class record opens for the selected teaching assignment** — `Verified`.
  Same file, "opens the class record for the selected teaching assignment".
- **return is offered only when the preserved context actually matches** —
  `Verified`. `src/ui/SubjectAttendanceJourneyScreen.test.tsx`. A context that
  differs grants neither the class return nor assignment-scoped learner access.

## keyboard-first desktop flow

- **worksheet tabs are keyboard-operable** — `Verified`.
  `AssignedClassFolio.test.tsx:77`. Arrow, Home and End keys move a roving
  `tabIndex` across the tablist.
- **a score draft survives worksheet tab switches** — `Verified`.
  `AssignedClassFolio.test.tsx:198`. The Scores pane stays mounted and hidden
  rather than unmounting, which is what makes tab switching lossless.

## touch-safe narrow flow

- **no horizontal overflow at any width** — `Verified` by the M05 browser smoke
  (`npm run quality:ui`), which asserts overflow at 1440, 1024, 390 and 320 px in
  both appearances and all three densities. Phone navigation is Today, Classes,
  Forms and Account, and the class index is a list rather than a dropdown.
  Labelling: `High confidence` for the overflow assertion, which is what the
  smoke actually measures; the smoke does not exercise thumb-reach heuristics, so
  "touch-safe" is claimed only as "no narrower-than-target layout", not as a
  measured ergonomic property.

## progressive disclosure

- **the worksheet reveals Scores and Forms only from Overview** — `Verified` by the
  folio tests above collectively: the Overview pane is the default, the two other
  tabs are reached from it, and the Scores pane's expensive mount happens on first
  visit only. No single test is named "progressive disclosure"; the property is
  held by the tab and `scoresVisited` behaviour that
  `AssignedClassFolio.test.tsx:77` and `:198` exercise.

## Failure and recovery states (held by the same tests)

- **unavailable assignment loading produces no fake content** — `Verified`.
  `AssignedClassFolio.test.tsx:96`.
- **a prior user's assignments are hidden and late responses ignored** —
  `Verified`. `AssignedClassFolio.test.tsx:106`.
- **a previous class's late roster is ignored after switching** — `Verified`.
  `AssignedClassFolio.test.tsx:127`.
- **missing grading periods and missing weightings produce visible errors** —
  `Verified`. `ClassRecordJourneyScreen.test.tsx:272` and `:281`.
