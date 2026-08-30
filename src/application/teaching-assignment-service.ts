import { ValidationError } from "../domain/errors";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type { TeacherLoad } from "../domain/teacher-load";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../domain/teaching-assignment";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

function requireWeekday(weekday: number): number {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new ValidationError("Weekday must be between Sunday (0) and Saturday (6).");
  }
  return weekday;
}

function requireTime(value: string, label: string): string {
  if (!TIME_PATTERN.test(value)) {
    throw new ValidationError(`${label} must be in HH:MM format.`);
  }
  return value;
}

/** Wave 2Y: assign/unassign which teacher teaches a section+subject.
 * Wave 2Z: schedule/unschedule that assignment's weekly meetings.
 * Wave 3A: read a teacher's derived load. Validates shape/non-empty
 * input only, matching every other `*ApplicationService`'s convention
 * -- the backend stays authoritative on authorization (School-Head-only
 * `ManageTeachingAssignments` for writes; self-or-School-Head for
 * `getLoad`, via `auth::authorize_view_teacher_load`) and every domain
 * rule (one teacher per section+subject, a teacher must be a member of
 * the school, teacher/section/room conflict detection). Deliberately
 * not the full Teacher Load/Class Schedule UI -- no
 * reassign-in-one-step; see `docs/adr/0039-*` Wave 2Y/2Z/3A addenda. */
export class TeachingAssignmentApplicationService {
  constructor(private readonly teachingAssignments: TeachingAssignmentRepository) {}

  async listBySection(sectionId: string): Promise<TeachingAssignmentDetail[]> {
    const section = requireNonEmpty(sectionId, "Section");
    return this.teachingAssignments.listBySection(section);
  }

  async create(
    teacherUserId: string,
    sectionId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null> {
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const section = requireNonEmpty(sectionId, "Section");
    const subject = requireNonEmpty(subjectId, "Subject");
    return this.teachingAssignments.create(teacher, section, subject);
  }

  async remove(id: string): Promise<boolean> {
    const assignmentId = requireNonEmpty(id, "Assignment");
    return this.teachingAssignments.remove(assignmentId);
  }

  async listMeetings(teachingAssignmentId: string) {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    return this.teachingAssignments.listMeetings(assignment);
  }

  async createMeeting(
    teachingAssignmentId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<CreateMeetingOutcome> {
    const assignment = requireNonEmpty(teachingAssignmentId, "Class");
    const day = requireWeekday(weekday);
    const starts = requireTime(startsAt, "Start time");
    const ends = requireTime(endsAt, "End time");
    const trimmedRoom = room?.trim();
    return this.teachingAssignments.createMeeting(
      assignment,
      day,
      starts,
      ends,
      trimmedRoom ? trimmedRoom : null,
    );
  }

  async removeMeeting(id: string): Promise<boolean> {
    const meetingId = requireNonEmpty(id, "Meeting");
    return this.teachingAssignments.removeMeeting(meetingId);
  }

  async getLoad(teacherUserId: string): Promise<TeacherLoad> {
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    return this.teachingAssignments.getLoad(teacher);
  }
}
