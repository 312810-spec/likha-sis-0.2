import type {
  AssignOversightOutcome,
  EndOversightOutcome,
  TeacherOversightAssignment,
} from "../teacher-oversight-assignment";

/**
 * School-Head-only Teacher Oversight Assignment management (ADR-0089,
 * Batch 17 checkpoint 4). `assign`/`end`/`listForSchool` are gated on
 * `ManageTeacherOversightAssignments`; `currentOverseer` is
 * reference-data any authenticated school member may read, matching
 * `SectionAdvisoryRepository.currentAdviser`'s established convention.
 */
export interface TeacherOversightAssignmentRepository {
  listForSchool(): Promise<TeacherOversightAssignment[]>;
  currentOverseer(
    teacherUserId: string,
    asOfDate: string,
  ): Promise<TeacherOversightAssignment | null>;
  assign(
    masterTeacherUserId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignOversightOutcome>;
  end(teacherUserId: string, assignmentId: string, endsOn: string): Promise<EndOversightOutcome>;
}
