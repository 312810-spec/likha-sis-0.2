import type { SubjectAttendanceApplicationService } from "../../application/subject-attendance-service";
import type { TeachingAssignmentSummary } from "../../domain/subject-attendance";

/**
 * Whether the signed-in teacher has recorded subject attendance for one
 * class occurrence today. Mirrors the state
 * `docs/adr/0055-subject-attendance-foundation.md` left implicit:
 * `not_checked` (no session yet), `held` (a session exists and class
 * ran), `no_class` (explicitly marked as not meeting).
 */
export type TodaysClassStatus = "not_checked" | "held" | "no_class";

export interface TodaysClassOccurrence {
  assignment: TeachingAssignmentSummary;
  startsAt: string;
  endsAt: string;
  room: string | null;
  status: TodaysClassStatus;
}

/**
 * Every class the given teacher meets today, in start-time order, each
 * tagged with its attendance-check status. Extracted from
 * `TodaysClassesScreen` so the teacher Home (Wave D) can merge these
 * occurrences into its "what needs you today" list without duplicating
 * the three-call orchestration (assignments → per-assignment meetings +
 * sessions). Pure data assembly over the application service — no new
 * backend read, no repository port.
 *
 * `todayIso` is `YYYY-MM-DD`; `weekday` is `Date.prototype.getDay()`
 * (0 = Sunday), passed in so the caller controls "now" and the result
 * is deterministic in tests.
 */
export async function todaysClassesForTeacher(
  subjectAttendanceService: SubjectAttendanceApplicationService,
  teacherUserId: string,
  todayIso: string,
  weekday: number,
): Promise<TodaysClassOccurrence[]> {
  const assignments = await subjectAttendanceService.listMyAssignments(teacherUserId);

  const perAssignment = await Promise.all(
    assignments.map(async (assignment) => {
      const meetings = await subjectAttendanceService.listMeetings(assignment.id);
      const todaysMeetings = meetings.filter((meeting) => meeting.weekday === weekday);
      if (todaysMeetings.length === 0) return [];

      const sessions = await subjectAttendanceService.listSessions(assignment.id);
      const todaysSession = sessions.find((session) => session.sessionDate === todayIso);
      const status: TodaysClassStatus = !todaysSession
        ? "not_checked"
        : todaysSession.status === "no_class"
          ? "no_class"
          : "held";

      return todaysMeetings.map((meeting) => ({
        assignment,
        startsAt: meeting.startsAt,
        endsAt: meeting.endsAt,
        room: meeting.room,
        status,
      }));
    }),
  );

  return perAssignment.flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
