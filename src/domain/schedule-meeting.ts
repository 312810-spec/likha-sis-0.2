/**
 * Wave 2X: the first place in this codebase that gives
 * `schedule_meetings.weekday` a real calendar meaning. The column has
 * existed since Teacher Load/Class Schedule Foundation
 * (`docs/adr/0039-teacher-load-class-schedule-foundation.md`) as an
 * opaque `CHECK (weekday BETWEEN 0 AND 6)` integer -- no Rust code, no
 * test, and no ADR ever assigned it a specific day; nothing before this
 * wave ever read it outside its own table. Established here, not
 * assumed: **0 = Sunday … 6 = Saturday**, matching JavaScript's
 * `Date.prototype.getDay()` exactly, so `TodaysClassesScreen` needs no
 * conversion table. Wave 2Z's `ScheduleMeetingsScreen` is the first
 * screen to *write* a `weekday` value (via `WEEKDAY_LABELS` below),
 * completing the round trip this convention always needed to be
 * verified against.
 */
export interface ScheduleMeeting {
  id: string;
  teachingAssignmentId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}

/** Index-aligned with the `weekday` convention above -- `WEEKDAY_LABELS[0]`
 * is Sunday. The single place any weekday picker in this codebase
 * should read its options from, so the convention is never
 * hand-duplicated at a second call site. */
export const WEEKDAY_LABELS: readonly string[] = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Mirrors Rust's `CreateMeetingOutcome`
 * (`#[serde(tag = "outcome", content = "meeting", rename_all = "camelCase")]`)
 * exactly -- distinct enough that `ScheduleMeetingsScreen` can show a
 * specific message per conflict type, not a generic failure. */
export type CreateMeetingOutcome =
  | { outcome: "created"; meeting: ScheduleMeeting }
  | { outcome: "unknownAssignment" }
  | { outcome: "invalidWeekday" }
  | { outcome: "invalidTime" }
  | { outcome: "teacherConflict" }
  | { outcome: "sectionConflict" }
  | { outcome: "roomConflict" }
  | { outcome: "duplicate" };
