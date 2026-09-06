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

export interface MyDaySummary {
  schedule: MyDayScheduleItem[];
  pendingAttendance: MyDayPendingAttendance[];
  pendingConflicts: MyDayPendingConflict[];
}
