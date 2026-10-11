import type { MyDaySummary } from "../my-day";

/**
 * "My Day" screen's port — reads the signed-in teacher's own combined
 * schedule-plus-pending-tasks view for one calendar day. Deliberately
 * read-only and single-method, matching `SyncStatusRepository`'s own
 * shape. `teacherUserId`/`schoolId` are never parameters — both are
 * session-derived server-side. `todayWeekday`/`todayDate`/`nowTime` ARE
 * caller-supplied (the local wall-clock date/weekday/time), matching this
 * codebase's own established convention for "what day is it" (e.g.
 * `TeachingAssignmentRepository.createMeeting`'s `weekday`,
 * `SubjectAttendanceRepository`'s `sessionDate`) rather than pulling in a
 * server-side clock for this one read. `nowTime` only selects which of
 * today's classes counts as next, so a wrong value cannot reach another
 * teacher's data — only misorder this teacher's own day.
 */
export interface MyDayRepository {
  getSummary(todayWeekday: number, todayDate: string, nowTime: string): Promise<MyDaySummary>;
}
