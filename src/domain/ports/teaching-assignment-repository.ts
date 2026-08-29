import type { ScheduleMeeting } from "../schedule-meeting";
import type { TeachingAssignmentSummary } from "../subject-attendance";

/**
 * Deliberately narrow -- two read methods, only what Subject
 * Attendance's assignment picker and Today's Classes need. The full
 * Teaching Assignment/Class Schedule UI (create/reassign/remove
 * assignments, create/edit schedule meetings) remains out of scope,
 * carried as a separate future candidate (see Wave 2T/2U's own
 * evaluation) -- this is not that UI, only enough for a teacher to see
 * "which of my own classes, and when."
 */
export interface TeachingAssignmentRepository {
  listMine(teacherUserId: string): Promise<TeachingAssignmentSummary[]>;
  listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]>;
}
