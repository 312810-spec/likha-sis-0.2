import type { ScheduleMeeting } from "../../domain/schedule-meeting";
import type { TeachingAssignmentSummary } from "../../domain/subject-attendance";
import type {
  TeachingAssignment,
  TeachingAssignmentDetail,
} from "../../domain/teaching-assignment";
import type { TeachingAssignmentRepository } from "../../domain/ports/teaching-assignment-repository";
import { invoke } from "./invoke";

/** The raw `list_teacher_assignments` wire shape -- narrower than the
 * domain `TeachingAssignmentDetail` (no `teacherUserId`), since
 * `listMine` only ever projects it down to `TeachingAssignmentSummary`
 * below and never needs the teacher id (the caller already knows it,
 * it's their own). */
interface TeacherAssignmentsWireDetail {
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
    const details = await invoke<TeacherAssignmentsWireDetail[]>("list_teacher_assignments", {
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

  listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]> {
    return invoke<ScheduleMeeting[]>("list_schedule_meetings_by_assignment", {
      teachingAssignmentId,
    });
  }

  listBySection(sectionId: string): Promise<TeachingAssignmentDetail[]> {
    return invoke<TeachingAssignmentDetail[]>("list_teaching_assignments_by_section", {
      sectionId,
    });
  }

  create(
    teacherUserId: string,
    sectionId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null> {
    return invoke<TeachingAssignment | null>("create_teaching_assignment", {
      teacherUserId,
      sectionId,
      subjectId,
    });
  }

  remove(id: string): Promise<boolean> {
    return invoke<boolean>("remove_teaching_assignment", { id });
  }
}
