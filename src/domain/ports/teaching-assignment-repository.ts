import type { CreateMeetingOutcome, ScheduleMeeting } from "../schedule-meeting";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../teaching-assignment";
import type { TeachingAssignmentSummary } from "../subject-attendance";

/**
 * `listMine`/`listMeetings` are Subject Attendance's and Today's
 * Classes' own narrow reads (Waves 2W/2X). `listBySection`/`create`/
 * `remove` are Wave 2Y's Teaching Assignments management screen.
 * `createMeeting`/`removeMeeting` are Wave 2Z's Class Schedule screen
 * -- still not the full Teacher Load/Class Schedule UI (no reassign,
 * no teacher-load view), just enough for a School Head to assign a
 * teacher and schedule their weekly meetings.
 */
export interface TeachingAssignmentRepository {
  listMine(teacherUserId: string): Promise<TeachingAssignmentSummary[]>;
  listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]>;
  listBySection(sectionId: string): Promise<TeachingAssignmentDetail[]>;
  create(
    teacherUserId: string,
    sectionId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null>;
  remove(id: string): Promise<boolean>;
  createMeeting(
    teachingAssignmentId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<CreateMeetingOutcome>;
  removeMeeting(id: string): Promise<boolean>;
}
