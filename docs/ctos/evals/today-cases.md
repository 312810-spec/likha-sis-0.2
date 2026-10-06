# Schedule / Today cases

**Created at:** M04 (2026-10-06). The M00 registry row for this file pre-dated it —
the file did not exist when the row was written, so this is written from the test
names that genuinely exist at the cited lines, not backfilled from the plan.

Every case below names a real test. `Verified` means the test exists and is wired
into the run that M04's checkpoint records.

## one-action next-class entry

The "next" class is derived in Rust, next to the sort it depends on, rather than
re-derived in the UI from an order only the repository guarantees. A "Next up"
marker then sits on the schedule entry itself, so the teacher opens it in one
action rather than scanning a sorted list.

- **next class is the first meeting at or after the current time** — `Verified`.
  `src-tauri/src/repository/my_day.rs:507`. Also covers the boundary where a class
  starts exactly now: it is still next, not already past.
- **next class skips a meeting that has already started** — `Verified`.
  `my_day.rs:538`. With meetings at 07:00 and 08:00 and the time 07:30, the first
  row is 07:00 but the *next* is 08:00 — the two are deliberately not the same.
- **no class is next once every class today has started** — `Verified`.
  `my_day.rs:581`. The day is still listed; it just has nothing upcoming.
- **the marked class opens in one action** — `Verified`.
  `src/ui/MyDayScreen.test.tsx:136`. Clicking the "Next up" entry opens the class
  workspace without a second selection.
- **no marker when the day has started** — `Verified`. `MyDayScreen.test.tsx:145`.

## no schedule

Two empty days are not the same thing, and the summary now carries the field that
separates them.

- **not assigned to any class is distinct from a free day** — `Verified`.
  `my_day.rs:662` (`has_any_assignments`). A teacher with no assignments is a
  different situation from a teacher whose classes simply do not meet today; both
  leave `schedule` empty.
- **free-day copy when classes exist but none meet today** — `Verified`.
  `MyDayScreen.test.tsx:119`.
- **the not-assigned state says so plainly** — `Verified`.
  `MyDayScreen.test.tsx:125`.

## pending assignment

An assignment with no `schedule_meetings` on any weekday is surfaced as pending.
This deliberately adds no new table or status column — the my-day read model's own
docstring commits it to computing every field from data that already exists, and
an unscheduled assignment is already distinguishable from a scheduled one by the
absence of meeting rows.

- **an assignment with no meetings is pending and does not count as today** —
  `Verified`. `my_day.rs:598`. It appears in `pending_assignments`, not in
  `schedule`, and `has_any_assignments` stays true.
- **a scheduled class is not pending, and an unscheduled one does not leak into
  today** — `Verified`. `my_day.rs:630`.
- **the unscheduled class is surfaced with a reason** — `Verified`.
  `MyDayScreen.test.tsx:130`. It renders in the attention rail with "no schedule
  given to this class yet" and no action button — there is no scheduling screen to
  send the teacher to, so none is offered. Scheduling is M09's scope.

## changed schedule

Schedule meetings are local to the device (they are absent from the sync
allowlist at `src-tauri/src/sync/mod.rs`), so a *meeting-level* change cannot
arrive from elsewhere today; that transport is M13's scope. The one channel that
does exist is a `teaching_assignments` delete, which cascades.

- **an assignment delete removes its meetings** — `Verified`.
  `src-tauri/src/repository/teaching_assignment.rs:515`
  (`ON DELETE CASCADE`, applied by `delete_from_sync`).
- **the summary is recomputed on every call, and returning from a class workspace
  re-fetches it** — `Verified`. `MyDayScreen.test.tsx:187`. Before M04 the class
  workspace rendered inside My Day without a tab change, so nothing unmounted and
  the mount-time fetch stayed stale — a teacher who recorded attendance and went
  back saw the pending item they had just cleared. This mirrors
  `ClassRecordsScreen.handleBackToList`'s existing reasoning.

Not claimed: a meeting-time change arriving from another device. Requires the
schedule sync that M13 owns; M04 records the gap rather than asserting a
freshness property it cannot demonstrate.

## stale offline schedule

Same root cause: with meetings local-only, "stale" has no transport to arrive
through. What M04 does guarantee is that the view never *claims* to be current
when it is not — the summary is computed fresh on every call, and the screen
reloads on every tab return because tabs are conditionally rendered and therefore
unmount. No freshness timestamp is shown, because none exists to show honestly;
`SyncStatus.lastPullAt` is device-wide and belongs to M13.

**Label: `Unknown`, not `Verified`.** Recorded as out of M04's reach by design
rather than left as an apparent gap.

## no classes today

- **today's meeting is included, another weekday is not** — `Verified`.
  `my_day.rs:249`.
- **meetings the same day are sorted by start time** — `Verified`.
  `my_day.rs:472`.

## unfinished attendance

Pending when no session has been opened, or a session with zero entries; cleared
by one entry or an explicit `NoClass`.

- `Verified`. `my_day.rs:269`, `my_day.rs:285`, `my_day.rs:309`, `my_day.rs:359`.

## returned review

Read as the sync-conflict review queue: a hub-rejected edit returned to the
teacher who made it. Narrowed to the teacher's own conflicts only.

- **only this teacher's own open conflicts appear** — `Verified`. `my_day.rs:425`.

Note on scope: `MyDayPendingConflict` carries `id` and `entityKind` only — no
disposition or "returned" reason. The review screen itself supplies the detail;
the Today view only counts and links.

## Tenant boundaries (held by the same tests)

- **another teacher's schedule is invisible** — `Verified`. `my_day.rs:382`.
- **a forged school id yields nothing** — `Verified`. `my_day.rs:403`.
