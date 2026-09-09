import { ValidationError } from "../domain/errors";
import type { TeacherOversightAssignmentRepository } from "../domain/ports/teacher-oversight-assignment-repository";
import type {
  AssignOversightOutcome,
  EndOversightOutcome,
  TeacherOversightAssignment,
} from "../domain/teacher-oversight-assignment";

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

/** School-Head-only Teacher Oversight Assignment management (ADR-0089,
 * Batch 17 checkpoint 4). Validates shape/non-empty input only -- the
 * backend stays authoritative on authorization (`ManageTeacherOversightAssignments`,
 * School-Head-only writes) and every domain rule ("at most one active
 * overseer per teacher," the proposed Master Teacher must actually hold
 * the role, a teacher cannot oversee themselves). Reassignment is
 * deliberately explicit end-then-assign, the same convention
 * `SectionAdvisoryApplicationService` already established. */
export class TeacherOversightAssignmentApplicationService {
  constructor(private readonly assignments: TeacherOversightAssignmentRepository) {}

  listForSchool(): Promise<TeacherOversightAssignment[]> {
    return this.assignments.listForSchool();
  }

  async currentOverseer(
    teacherUserId: string,
    asOfDate: string,
  ): Promise<TeacherOversightAssignment | null> {
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const date = requireNonEmpty(asOfDate, "Date");
    return this.assignments.currentOverseer(teacher, date);
  }

  async assign(
    masterTeacherUserId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignOversightOutcome> {
    const masterTeacher = requireNonEmpty(masterTeacherUserId, "Master Teacher");
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const starts = requireNonEmpty(startsOn, "Start date");
    return this.assignments.assign(masterTeacher, teacher, starts);
  }

  async end(
    teacherUserId: string,
    assignmentId: string,
    endsOn: string,
  ): Promise<EndOversightOutcome> {
    const teacher = requireNonEmpty(teacherUserId, "Teacher");
    const assignment = requireNonEmpty(assignmentId, "Assignment");
    const ends = requireNonEmpty(endsOn, "End date");
    return this.assignments.end(teacher, assignment, ends);
  }
}
