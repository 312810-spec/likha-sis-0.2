import type { MyDaySummary } from "../my-day";

/**
 * "My Day" screen's port — reads the signed-in teacher's own combined
 * schedule-plus-pending-tasks view for one calendar day. Deliberately
 * read-only and single-method, matching `SyncStatusRepository`'s own
 * shape. `teacherUserId`/`schoolId` are never parameters — both are
 * session-derived server-side. `todayWeekday`/`todayDate` ARE
 * caller-supplied (the local wall-clock date/weekday), matching this
 * codebase's own established convention for "what day is it" (e.g.
 * `TeachingAssignmentRepository.createMeeting`'s `weekday`,
 * `SubjectAttendanceRepository`'s `sessionDate`) rather than pulling in
 * a server-side clock for this one read.
 */
export interface MyDayRepository {
  getSummary(todayWeekday: number, todayDate: string): Promise<MyDaySummary>;
}
