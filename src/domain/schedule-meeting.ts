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
 * conversion table. Any future schedule-creation UI must follow this
 * same convention.
 */
export interface ScheduleMeeting {
  id: string;
  teachingAssignmentId: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
}
