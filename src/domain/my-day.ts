/**
 * The signed-in teacher's own "My Day" aggregate — today's schedule
 * occurrences plus a conservative, read-only-derived set of pending
 * tasks. Mirrors Rust's `repository::my_day::MyDaySummary` exactly. See
 * `commands::my_day::get_my_day_summary` for the read side.
 *
 * @public Consumed structurally, as `MyDaySummary.schedule`'s element
 * type -- never imported by name elsewhere. Kept exported (rather than
 * inlined) so `MyDayScreen`/its test can name it directly when building
 * fixture rows.
 */
export interface MyDayScheduleItem {
  teachingAssignmentId: string;
  subjectName: string;
  sectionName: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
}

/** A class meeting today whose attendance still needs checking — no
 * session opened yet for today, or one opened with nothing recorded.
 * Never flagged once at least one entry exists or the session was
 * explicitly marked No Class.
 *
 * @public Consumed structurally, as `MyDaySummary.pendingAttendance`'s
 * element type -- see `MyDayScheduleItem`'s identical note. */
export interface MyDayPendingAttendance {
  teachingAssignmentId: string;
  subjectName: string;
  sectionName: string;
}

/** One of this teacher's own not-yet-resolved sync conflicts.
 *
 * @public Consumed structurally, as `MyDaySummary.pendingConflicts`'s
 * element type -- see `MyDayScheduleItem`'s identical note. */
export interface MyDayPendingConflict {
  id: string;
  entityKind: string;
}

/** A teaching assignment that has no recurring slot on any weekday — the class
 * exists on this teacher's load but has never been given a schedule. It is
 * surfaced as pending because "this class needs a schedule" is a real next
 * action, and because it is the one reason a schedule can be empty other than
 * "nothing meets today".
 *
 * @public Consumed structurally, as `MyDaySummary.pendingAssignments`'s
 * element type -- see `MyDayScheduleItem`'s identical note. */
export interface MyDayPendingAssignment {
  teachingAssignmentId: string;
  subjectName: string;
  sectionName: string;
}

/** One of this teacher's class records that has assessment items set up but
 * not every eligible learner scored yet — CTOS.md §6.1's "unfinished
 * assessment work", the one item on that list this aggregate did not used to
 * surface. Derived, never stored: a class record already carries
 * `itemCount`/`recordedCount`/`totalEligible`, so this is the same completion
 * readout the class-record workspace shows, lifted to where the teacher plans
 * the day instead of only where they open the record.
 *
 * @public Consumed structurally, as `MyDaySummary.pendingScoring`'s element
 * type -- see `MyDayScheduleItem`'s identical note. */
export interface MyDayPendingScoring {
  /** The teaching assignment this class record belongs to, so the "open the
   * class record" action can reuse the same assignment-keyed handoff every
   * other pending item uses. */
  teachingAssignmentId: string;
  classRecordId: string;
  subjectName: string;
  sectionName: string;
  gradingPeriodLabel: string;
  recordedCount: number;
  /** `itemCount * totalEligible` — the maximum `recordedCount` could reach
   * once every item is fully scored, the same product `ClassRecordDetail`
   * documents. Shown alongside `recordedCount` because "3 of 12 recorded" is
   * actionable and "3 recorded" is not. */
  totalCount: number;
}

/** One still-open follow-up marker on one of this teacher's class occurrences
 * — CTOS.md §6.1's "learner follow-up due where appropriate", and CTOS M08's
 * loop staring back at the teacher: this marker is the evidence step, and the
 * support case it can become (§M08) is the rest. A marker is cleared, never
 * deleted, so this list is only ever the *standing* ones — once a teacher
 * clears a marker it stays answerable in the occurrence's own history but
 * stops demanding the day's attention.
 *
 * @public Consumed structurally, as `MyDaySummary.pendingFollowups`' element
 * type -- see `MyDayScheduleItem`'s identical note. */
export interface MyDayPendingFollowup {
  markerId: string;
  classOccurrenceId: string;
  /** The enrollment span the marker was raised on — the key the plan form
   * hands to `learnerSupportService.openCase` so the case lands on the same
   * learner this row names. */
  sectionMembershipId: string;
  occurrenceDate: string;
  subjectName: string;
  sectionName: string;
  learnerGivenName: string;
  learnerFamilyName: string;
  reason: string;
  markedAt: string;
}

export interface MyDaySummary {
  schedule: MyDayScheduleItem[];
  /** The next class still upcoming today, or `null` once every class has
   * already started. Derived in Rust, next to the sort it depends on, so the
   * UI has one authoritative answer rather than re-deriving an order only the
   * repository guarantees. */
  next: MyDayScheduleItem | null;
  pendingAttendance: MyDayPendingAttendance[];
  pendingAssignments: MyDayPendingAssignment[];
  pendingConflicts: MyDayPendingConflict[];
  /** Class records with items set up but not fully scored — CTOS.md §6.1's
   * "unfinished assessment work". */
  pendingScoring: MyDayPendingScoring[];
  /** Standing follow-up markers on this teacher's own classes — CTOS.md
   * §6.1's "learner follow-up due where appropriate". */
  pendingFollowups: MyDayPendingFollowup[];
  /** Whether this teacher has any teaching assignment at all. This is what
   * separates "no classes scheduled today" from "you are not assigned to any
   * class yet" — two situations that both leave `schedule` empty. */
  hasAnyAssignments: boolean;
}
