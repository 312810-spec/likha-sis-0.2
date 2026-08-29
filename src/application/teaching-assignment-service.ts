import { ValidationError } from "../domain/errors";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { TeachingAssignment, TeachingAssignmentDetail } from "../domain/teaching-assignment";

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

/** Wave 2Y: assign/unassign which teacher teaches a section+subject.
 * Validates shape/non-empty input only, matching every other
 * `*ApplicationService`'s convention -- the backend stays authoritative
 * on authorization (School-Head-only `ManageTeachingAssignments`) and
 * every domain rule (one teacher per section+subject, a teacher must be
 * a member of the school). Deliberately not the full Teacher Load/Class
 * Schedule UI -- no reassign-in-one-step, no schedule-meeting create/
 * edit, no load view; see `docs/adr/0055-*` Wave 2Y addendum. */
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
}
