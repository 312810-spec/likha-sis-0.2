import type { TeachingAssignmentSummary } from "../subject-attendance";

/**
 * Deliberately narrow -- one read method, only what Subject Attendance's
 * assignment picker needs. The full Teaching Assignment/Class Schedule
 * UI (create/reassign/remove assignments, schedule meetings) remains
 * out of scope, carried as a separate future candidate (see Wave 2T/2U's
 * own evaluation) -- this is not that UI, only enough for a teacher to
 * pick "which of my own classes" before checking attendance.
 */
export interface TeachingAssignmentRepository {
  listMine(teacherUserId: string): Promise<TeachingAssignmentSummary[]>;
}
