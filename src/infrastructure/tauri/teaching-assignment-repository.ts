import type { TeachingAssignmentSummary } from "../../domain/subject-attendance";
import type { TeachingAssignmentRepository } from "../../domain/ports/teaching-assignment-repository";
import { invoke } from "./invoke";

interface TeachingAssignmentDetail {
  id: string;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  subjectId: string;
  subjectName: string;
}

/** Tauri adapter for the existing, already-tested `list_teacher_assignments`
 * command (Wave 1's Teacher Load/Class Schedule Foundation) -- reused
 * unchanged, projected down to the narrow shape Subject Attendance's
 * picker needs. */
export class TauriTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine(teacherUserId: string): Promise<TeachingAssignmentSummary[]> {
    const details = await invoke<TeachingAssignmentDetail[]>("list_teacher_assignments", {
      teacherUserId,
    });
    return details.map((detail) => ({
      id: detail.id,
      sectionId: detail.sectionId,
      sectionName: detail.sectionName,
      schoolYear: detail.schoolYear,
      subjectId: detail.subjectId,
      subjectName: detail.subjectName,
    }));
  }
}
