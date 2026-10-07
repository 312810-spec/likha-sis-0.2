# Classroom Mode cases

**Created at:** M06 (2026-10-07). Written from the test names that genuinely exist
at the cited lines, not backfilled from the plan.

Every case below names a real test. `Verified` means the test exists and is wired
into the run that M06's checkpoint records.

M06's acceptance clause is the whole program in miniature: _"Planned, changed,
cancelled, and delivered occurrences remain distinguishable."_ CTOS.md §5 states the
scheduling invariant this rests on — _assignment ≠ planned meeting ≠ actual class
occurrence_ — and §6.3 names the three-way distinction Classroom Mode must keep
visible: what was scheduled, what was changed or cancelled, and what was actually
delivered. Everything in this file exists to keep those four states from collapsing
into each other after the fact.

## the four states stay distinguishable — the acceptance clause

The status is not derived at read time from whether fields are filled in. It is a
stored enum with a schema `CHECK` constraint admitting exactly the four values, set
by explicit transitions (`start`, `capture`, `finish`, `cancel`, `reopen`) and
snapshotting the plan at start time so a later schedule edit cannot rewrite what a
class was planned as.

- **the cockpit opens on the planned status when a class is started** — `Verified`.
  `src/ui/ClassroomModeScreen.test.tsx:429`. Start is idempotent per
  `(teaching_assignment_id, occurrence_date)` and seeds the learning target from the
  lesson plan when one exists for that date.
- **a slot that differs from the plan moves the class to changed, not planned** —
  `Verified`. `:442`. `deviates_from_plan` compares the actual slot against the
  snapshotted plan, so "changed" means "changed against what this class was planned
  as", not "some field is non-empty".
- **the four states read as four distinct labels side by side in history** —
  `Verified`. `:570`, the acceptance clause itself as a test: Changed, Cancelled and
  Delivered rows each render their own chip while today's occurrence is shown
  separately in the headline, newest first.
- **a blank slot is null, not an empty slot** — `Verified`. `:458`. A `type="time"`
  input cleared to `""` is sent as `null`, so clearing a mistyped slot returns the
  class to planned instead of silently recording an empty slot that "deviates". This
  was a real defect found while building the screen.

## start and finish the session

- **an unstarted class says so and offers to start it** — `Verified`. `:419`. The
  cockpit does not fabricate an occurrence to render against.
- **finish is refused until attendance is settled, and the teacher is routed there**
  — `Verified`. `:470`. `attendance_is_settled` is the gate; the refusal is a
  warning, not an error, because the missing attendance is the teacher's next action
  rather than a system failure.
- **finishing produces a summary review and locks the capture inputs** — `Verified`.
  `:492`. A delivered class is no longer editable, which is what keeps "delivered"
  from silently becoming "changed" again.
- **an explicit no-class attendance decision counts as settled** — `Verified`.
  `:632`. A class the teacher marked as not held can still be finished, so a
  cancelled-by-circumstance session does not deadlock the cockpit.

## cancellation requires a human decision

CTOS.md §5 is explicit that advisory or weather information does not automatically
cancel class — cancellation is a human decision and is recorded with a reason.

- **cancel is refused without a reason and records one when given** — `Verified`.
  `:512`. A non-empty reason is required by the repository, not by the UI alone, and
  the reason is what the history row shows.
- **a cancelled class cannot be silently overwritten by a later start** — `Verified`
  in Rust. `src-tauri/src/repository/class_occurrence.rs` — `start` returns
  `AlreadyCancelled` for a date that was already cancelled, and `cancel` writes with
  `ON CONFLICT DO UPDATE ... WHERE status <> 'delivered'`, so a delivered class
  cannot be cancelled after the fact either.

## the occurrence is reviewed and can be reopened

- **reopen bumps the revision and clears the summary** — `Verified`. `:529`. A
  reopened class is editable again and its prior summary does not stand as the
  record of the reopened session. The revision counter is what makes the reopen
  auditable rather than invisible.

## attendance inside the cockpit

- **attendance reports as not checked until a session is opened** — `Verified`.
  `:614`. The roster does not exist before an attendance session, so the follow-up
  panel has nobody to act on — the cockpit says so instead of rendering an empty
  list.
- **marked learners are counted out of the roster** — `Verified`. `:621`. "1 of 2
  marked" is derived from entry statuses, not from a separate counter.

## learner follow-up is a historical question

CTOS.md §6.4 asks _"What requires learner follow-up?"_ — a question about history, so
a marker is cleared, never deleted. A teacher who later realizes the follow-up was
handled must be able to see that it stood and when it was cleared.

- **a learner can be marked for follow-up and the marker cleared without deleting
  it** — `Verified`. `:547`. Clearing writes `cleared_at`; the marker remains in the
  table and the cleared marker is not re-shown as outstanding.
- **markers are scoped to the occurrence, and marking is gated on roster
  membership** — `Verified` in Rust. `mark_followup` refuses a membership id that is
  not on this class's roster for the session, and every command resolves `school_id`
  and `actor_user_id` from the session, never from the client. Cross-assignment and
  cross-school marker injection are both refused.

## capture fields — target, evidence, notes

- **the current learning target, quick evidence and notes are captured on the
  occurrence** — `Verified` collectively by `:442`, `:458` and `:492`, which exercise
  the full capture payload through the debounced save. The fields persist
  field-wise: a partial capture does not blank the fields it was not given, because
  `null` at the command boundary means "unchanged".

## failure and recovery states

- **a load failure shows an error with a retry rather than an empty cockpit** —
  `Verified`. `:650`. The load path is one `try/catch/finally` — a throw while
  resolving the roster or marker lists cannot escape it and leave the screen stuck
  on "Loading…". This was a real defect found while building the screen.
- **a stale request cannot write late state into a cockpit that has moved on** —
  `Verified` by the same tests, via a request-id guard on every `setState` after the
  first `await`. A teacher who starts a class, goes back and opens a different one
  does not receive the first class's occurrence into the second cockpit.

## navigation — the cockpit is reached and left cleanly

- **the cockpit is entered from the class workspace for the selected assignment** —
  `Verified`. `src/ui/ClassWorkspaceScreen.test.tsx` — the workspace's Classroom row
  calls `onStartClassroom` with the teaching assignment id and no other authority.
- **returning to the class workspace unmounts the cockpit** — `Verified`. `:642`.
  App keys the cockpit by assignment id and clears the handoff on return, so My
  Day's mount-time fetch runs fresh and a class checked off does not reappear as
  pending.

## Not claimed

- **No native Windows or Android evidence this milestone.** M06 is an
  application/UI-layer change; native claims remain where M03 left them. The
  occurrence schema is part of the encrypted device database and migration 0043 was
  exercised by the Rust suite, but the installed Windows package was not built or
  exercised here.
- **The debounce interval is not a verified performance property.** 500 ms is a
  chosen latency, not a measured one; the verified property is that a save in flight
  does not reschedule itself (`draftIsPersisted` comparing field-wise on normalized
  slot values), not that the interval is optimal.
- **Offline interruption of a capture save is not claimed as a case here.** The
  command is synchronous against the device database and the repository returns an
  outcome the screen surfaces, but a mid-sync-conflict capture interaction belongs
  to the recovery registry (`recovery-cases.md`, still `planned`).
