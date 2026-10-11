# Fast evidence capture and review cases

**Created at:** M07 (2026-10-07). Written from the test names that genuinely exist
at the cited lines, not backfilled from the plan.

Every case below names a real test. `Verified` means the test exists and is wired
into the run that M07's checkpoint records.

M07's outcome clause is _"Attendance and scoring are fast enough for real daily use
without sacrificing academic meaning."_ The two halves are separately load-bearing:
speed is an interaction property (one keystroke per learner, no round trip per row,
no modal between the teacher and the next entry), and academic meaning is a data
property (blank is not zero, an out-of-range score is refused, a correction never
erases what it replaced). A milestone that delivered only the speed would be a
milestone that made it easier to record the wrong thing faster.

## keyboard attendance

A roster is one keystroke per learner. The letter marks the row and focus advances,
so a teacher working down a seating chart never leaves the home row.

- **a learner is marked by pressing P while focus is on their status button** —
  `Verified`. `src/ui/AttendanceScreen.test.tsx`, "marks a learner present by
  pressing P while focus is on their status button". P/A/T are the shortcut letters.
- **P/A/L/E work in the subject roster too** — `Verified`.
  `src/ui/SubjectAttendanceScreen.test.tsx`, "marks a learner from the keyboard with
  P/A/L/E".
- **focus moves to the next learner after a keyboard mark** — `Verified`. Both
  screens: "moves focus to the next learner after a keyboard mark, so a full roster
  is one keystroke per learner". The advance is driven by the repository's success
  signal, not by the keystroke.
- **a letter typed with a modifier held is not intercepted** — `Verified`.
  `src/ui/SubjectAttendanceScreen.test.tsx`, "does not intercept a letter typed with
  a modifier held". Cmd/Ctrl/Alt bypass the shortcut so browser and OS shortcuts
  still work while focus is in the grid.

## touch attendance

- **a tap on a status marks the learner and the change is reflected immediately** —
  `Verified`. `src/ui/AttendanceScreen.test.tsx`, "marks a learner present and
  reflects the change immediately", and `src/ui/SubjectAttendanceScreen.test.tsx`,
  "marks a learner's status and reflects the change immediately". Optimistic local
  state is what makes the tap feel instant; the persisted outcome is what eventually
  confirms or corrects it.

## mark-all + exception

The bulk action exists because the common case is "everyone was here"; the
preservation rule exists because the exception is the only row the teacher actually
needed to think about.

- **mark-all-present fills only the unmarked learners** — `Verified` in TS and Rust.
  Both screens, "marks all unmarked learners present without touching an existing
  mark"; the Rust side is `bulk_mark_present_does_not_overwrite_an_already_marked_learner`
  in `src-tauri/src/repository/attendance.rs` and `mark_all_present_never_overwrites_an_existing_mark`
  in `src-tauri/src/repository/subject_attendance.rs`. The exception is the point of
  the operation.
- **a second mark-all while the first is still in flight does not double-fire** —
  `Verified`. `src/ui/SubjectAttendanceScreen.test.tsx`, "does not mark all present
  twice while the first request is still in flight", and
  `src/ui/AttendanceScreen.test.tsx`, "does not call bulkMarkPresent while it is
  aria-disabled". The button is disabled, and the handler is guarded.
- **a learner outside the caller's school is never bulk-marked** — `Verified` in
  Rust. `bulk_mark_present_does_not_mark_a_learner_outside_the_callers_school`.
  School authority is re-derived at the trusted boundary, never read from the client.
- **the preservation rule is communicated, not just enforced** — `Verified`.
  `src/ui/AttendanceScreen.test.tsx`, "communicates that Mark all present preserves
  existing marks in every teacher mode".

## assessment creation

- **an item is added and the form stays open with only the name cleared** —
  `Verified`. `src/ui/AssessmentAuthoringScreen.test.tsx`, "adds an item and keeps
  the form open with only the name cleared". The teacher entering five quiz items
  does not reopen the form five times; weight and max score survive because they are
  the same for the whole quiz.
- **Enter in the name field submits the item** — `Verified`. `:177`.

## keyboard score entry

- **Enter saves and moves focus to the next learner's score field** — `Verified`.
  `src/ui/ClassRecordWorkspace.test.tsx`, "saves on Enter and moves focus to the
  next learner's score field".
- **ArrowDown and ArrowUp save and move focus down and up** — `Verified`. "ArrowDown
  saves and moves focus down; ArrowUp saves and moves focus up".
- **Tab also saves and moves to the next learner** — `Verified`. "Tab saves and
  moves focus to the next learner's score field, and Shift+Tab moves back up". This
  was added in M07: native Tab would leave the grid for the row's Excused/N/A
  buttons, breaking the one-keystroke-per-learner rhythm for the most common commit
  gesture in the grid.
- **a rejected save does not move focus away from the entry that needs the teacher**
  — `Verified`. "Tab does not move focus away when the save is rejected, so the
  entry is not silently dropped". The advance is conditional on success, so a failed
  save cannot become a silently-absent score one row down.
- **leaving the field also commits the draft** — `Verified`. "saves a score when the
  field loses focus (blur-commit)".

## spreadsheet import staging

The import is staged, not applied: preview first, decide per row, then commit — and
the commit reports only what the backend actually did.

- **a .xlsx workbook is read end-to-end to a preview** — `Verified`.
  `src/ui/Sf1ImportScreen.test.tsx`, "supports a .xlsx workbook path end-to-end to
  preview"; the legacy `.xls` path has its own test at `:168`.
- **the preview reports new / existing / needs-review / error counts** — `Verified`.
  `:193`. A row that needs a human decision is counted separately from a row that is
  ready, so the teacher knows before committing how many decisions are left.
- **the commit is idempotent under a double trigger** — `Verified`. "only calls
  commit once even if the import action is triggered twice quickly".
- **a failed commit reports no partial import and keeps every decision** —
  `Verified`. "a failed commit shows a no-partial-import message and allows retry
  without losing decisions". The decisions survive because they are not cleared on
  failure.
- **an authorization failure shows a safe generic message, never raw error text** —
  `Verified`. `:509`.

## duplicate identity

A spreadsheet row that looks like an existing learner is a _suspected_ duplicate,
never an auto-resolved one. The teacher decides; the system never merges.

- **an exact LRN match is an exact match** — `Verified` in Rust.
  `src-tauri/src/import/matching.rs`,
  `a_row_whose_lrn_exactly_matches_an_existing_learner_is_exact_lrn`.
- **a name match with a differing LRN is suspected, not resolved** — `Verified` in
  Rust. `a_name_match_with_a_differing_lrn_is_a_suspected_duplicate_not_auto_resolved`.
  Names collide; LRNs do not, so a name agreement alone is not identity.
- **a suspected duplicate is never silently promoted to an exact match** —
  `Verified` in Rust.
  `never_auto_resolves_a_suspected_duplicate_into_exact_lrn_even_with_multiple_candidates`.
- **the screen shows a side-by-side comparison so the decision is informed** —
  `Verified`. `src/ui/Sf1ImportScreen.test.tsx`, "renders a side-by-side comparison
  for a suspected duplicate".
- **recording a decision resolves the row and permits the import** — `Verified`.
  "recording a useExisting decision removes the row from unresolved and permits
  import", and "recording a createSeparate decision resolves the row without using
  the existing learner" at `:316`. Both decisions are legitimate outcomes.
- **merge is never offered** — `Verified`. "never offers a merge action anywhere in
  the workflow". There is no merge affordance to accidentally choose.

## sorted rows

- **the roster is ordered by family then given name, at the repository** —
  `Verified` in Rust. `src-tauri/src/repository/section_membership.rs`,
  `current_roster_is_ordered_by_family_then_given_name`. Both attendance rosters and
  the score roster inherit the same ordering, so the screen the teacher reads down
  is in the same order as the seating chart they are working from.

## wrong maximum

- **an out-of-range score is refused inline and focus stays in the field** —
  `Verified`. `src/ui/ClassRecordWorkspace.test.tsx`, "shows an inline error and
  keeps focus in the field when the score is out of range". The teacher is not
  navigated away from a field whose value still needs fixing.
- **the application service rejects above-max and negative scores before the
  repository is called** — `Verified`. `src/application/learner-score-service.test.ts`,
  "rejects a score above the max score" (which asserts the message names the
  instrument's actual range, `/between 0 and 20/`) and "rejects a negative score".
  Both assert the repository was never reached.

## blank vs zero

This is the academic-meaning half of the milestone. A score that was never entered
and a score of zero are different facts, and the grade computation must not average
them together.

- **a recorded zero scores zero; an unrecorded item scores nothing** — `Verified` in
  Rust. `src-tauri/src/repository/grading_computation.rs`,
  `a_recorded_zero_scores_zero_but_an_unrecorded_item_scores_nothing`.
- **zero and max both compute** — `Verified` in Rust.
  `a_score_of_exactly_zero_and_exactly_max_score_both_compute`.
- **an unrecorded score is visibly not-recorded, not a zero rendered as a blank** —
  `Verified`. `src/ui/ClassRecordWorkspace.test.tsx` renders a not-recorded affordance
  for an entry with no status, and "offers no history affordance on a score that has
  never been recorded" asserts both the absence and that no history fetch was made.

## correction history

A correction is an append-only lineage. The prior value, its author, the reason and
the timestamp all survive the correction, so a grade can always be re-derived and a
parent question can always be answered.

- **a correction preserves the previous value, author, time and reason** — `Verified`
  in Rust. `src-tauri/src/repository/learner_score.rs`,
  `a_correction_preserves_the_previous_value_author_time_and_reason`.
- **both authors are named, resolved at the repository** — `Verified` in Rust.
  `correction_history_names_both_authors`. Names come from a `LEFT JOIN` to `users`,
  following the `audit_log.actor_username` precedent, so the display name is never
  client-supplied. The fields are `Option<String>` for parity with that precedent,
  though the schema's non-cascading `REFERENCES users(id)` means `None` is not a
  state this database can actually reach.
- **the schema itself forbids deleting an author of a correction** — `Verified` in
  Rust. `the_schema_forbids_deleting_an_author_of_a_correction`. With
  `foreign_keys = ON` and no `ON DELETE CASCADE`, deleting a user who authored a
  correction is rejected, so the lineage cannot be orphaned by a user-management
  operation. This was designed as a schema guarantee rather than an application
  guard.
- **the history is fetched when the teacher opens it, not for every rendered row** —
  `Verified`. `src/ui/components/ScoreCorrectionHistory.test.tsx`, "does not fetch
  the lineage until the teacher opens it". A roster of 40 learners with hidden
  history panels fetches zero correction queries until one is expanded.
- **the lineage shows both authors, the reason, and the superseded and new values** —
  `Verified`. `:90`, "renders the lineage with both authors, the reason, and the
  superseded and new values". The original recorder is shown separately because they
  can differ from the corrector.
- **same-author corrections omit the redundant clause** — `Verified`. `:109`, "names
  the author even when the previous recorder and the corrector are the same person".
  When both authors are one person, "was recorded by" would repeat the same name, so
  it is omitted rather than shown twice.
- **an Excused or N/A change is rendered in words, not as a bare number** —
  `Verified`. `:126`, "renders an Excused or N/A change in words rather than a bare
  number". A lineage line reading "15 → Excused" is meaningful; "15 → null" is not.
- **a load failure is explained, not silently omitted** — `Verified`. `:148`,
  "explains a failed load instead of silently omitting the history".
- **the panel is reachable from the class record workspace** — `Verified`.
  `src/ui/ClassRecordWorkspace.test.tsx`, "shows a recorded score's correction history
  when the teacher opens it", which asserts the fetch happened (one call), the reason
  is shown, and the correcting teacher is named.

## local save vs transfer

The teacher's evidence is saved locally before it is synchronized, and the screen
says only what is proven.

- **only the proven local-save state is ever shown** — `Verified`.
  `src/ui/components/ClassRecordLocalSaveStatus.test.tsx`, "shows only the proven
  local-save state" and "does not claim a save while saving, after an error, or
  without persistence evidence".
- **a late response cannot write into a row that has moved on** — `Verified`.
  `src/ui/components/ScoreSyncEvidence.test.tsx`, "discards a late response after the
  saved-row instance is replaced" and "hides the old snapshot immediately when its
  service is replaced". The write-generation guard is what keeps a slow save from
  landing on the wrong learner's row.
- **a pending change is not turned into sync evidence by a failed push** —
  `Verified` in Rust. `src-tauri/src/repository/entity_sync_status.rs`,
  `failed_push_attempts_never_turn_pending_changes_into_synced_evidence` and
  `pending_change_overrides_an_older_known_hub_version`. A retry failure cannot
  promote a change to Synced, and a locally newer edit wins over a stale hub version.
- **an entity never seen by the hub is not-yet-synced, not waiting** — `Verified` in
  Rust. `never_seen_entity_is_not_yet_synced`.

## review readiness

- **a grade is marked provisional when scores are still missing** — `Verified`.
  `src/ui/ClassRecordWorkspace.test.tsx`, "marks a computable grade provisional when
  not every score is recorded yet". The provisional marker is what tells a teacher
  the number on screen is not yet the number they would report.
- **a complete grade carries no provisional marker** — `Verified`. "shows a complete
  grade with no provisional marker".
- **a per-item completion readout appears once the item has eligible learners** —
  `Verified`. "shows a per-item completion readout once the item has eligible
  learners".

## What is deliberately not claimed

- **No native Windows or Android evidence this milestone.** M07 is an
  application/UI-layer change; native claims remain where M03 left them. The
  correction-history `LEFT JOIN` and its schema guard are exercised by the Rust
  suite, but the installed Windows package was not built or exercised here.
- **"Fast" is not a measured latency claim.** The verified property is interaction
  shape — one keystroke per learner, no per-row fetch, no modal between entries —
  not a milliseconds figure. No performance benchmark was run, and none is claimed.
- **The class record's `markFinal` state machine is out of scope.** The issued-snapshot
  lifecycle (Working → Draft → Review → Issued → Amendment) belongs to M11 per
  `grading-cases.md`; review readiness here means _computable and honestly labelled_,
  not _issued_.
- **`golden-path.md` is still listed as `partial` in the registry and was not
  promoted this milestone.** The registry row predates the file; resolving the
  mismatch is a registry task, not an M07 acceptance item.
