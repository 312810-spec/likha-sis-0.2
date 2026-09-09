import type { TeacherOversightAssignmentRepository } from "../../domain/ports/teacher-oversight-assignment-repository";
import type {
  AssignOversightOutcome,
  EndOversightOutcome,
  TeacherOversightAssignment,
} from "../../domain/teacher-oversight-assignment";
import { invoke } from "./invoke";

/** Tauri adapter for the Teacher Oversight Assignment command surface
 * (`assign_teacher_oversight`/`end_teacher_oversight`/
 * `current_teacher_overseer`/`list_teacher_oversight_assignments`),
 * ADR-0089 Batch 17 checkpoint 4. */
export class TauriTeacherOversightAssignmentRepository implements TeacherOversightAssignmentRepository {
  listForSchool(): Promise<TeacherOversightAssignment[]> {
    return invoke<TeacherOversightAssignment[]>("list_teacher_oversight_assignments");
  }

  currentOverseer(
    teacherUserId: string,
    asOfDate: string,
  ): Promise<TeacherOversightAssignment | null> {
    return invoke<TeacherOversightAssignment | null>("current_teacher_overseer", {
      teacherUserId,
      asOfDate,
    });
  }

  assign(
    masterTeacherUserId: string,
    teacherUserId: string,
    startsOn: string,
  ): Promise<AssignOversightOutcome> {
    return invoke<AssignOversightOutcome>("assign_teacher_oversight", {
      masterTeacherUserId,
      teacherUserId,
      startsOn,
    });
  }

  end(teacherUserId: string, assignmentId: string, endsOn: string): Promise<EndOversightOutcome> {
    return invoke<EndOversightOutcome>("end_teacher_oversight", {
      teacherUserId,
      assignmentId,
      endsOn,
    });
  }
}
