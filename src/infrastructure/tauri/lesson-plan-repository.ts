import type {
  LessonPlan,
  LessonPlanFields,
  LessonSourceAmendment,
  LessonSourceReference,
} from "../../domain/lesson-plan";
import type { LessonPlanRepository } from "../../domain/ports/lesson-plan-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `create_lesson_plan`/`update_lesson_plan`/
 * `list_lesson_plans_by_assignment` (`src-tauri/src/commands/lesson_plan.rs`). */
export class TauriLessonPlanRepository implements LessonPlanRepository {
  create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
    sourceReference?: LessonSourceReference,
  ): Promise<LessonPlan | null> {
    return invoke<LessonPlan | null>("create_lesson_plan", {
      teachingAssignmentId,
      planDate,
      ...fields,
      ...(sourceReference ? { sourceReference } : {}),
    });
  }

  update(
    id: string,
    teachingAssignmentId: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    return invoke<LessonPlan | null>("update_lesson_plan", {
      id,
      teachingAssignmentId,
      ...fields,
    });
  }

  listByAssignment(teachingAssignmentId: string): Promise<LessonPlan[]> {
    return invoke<LessonPlan[]>("list_lesson_plans_by_assignment", { teachingAssignmentId });
  }

  amendSource(
    lessonPlanId: string,
    teachingAssignmentId: string,
    sourceReference: LessonSourceReference,
    reason: string,
  ): Promise<LessonPlan | null> {
    return invoke<LessonPlan | null>("amend_lesson_source", {
      lessonPlanId,
      teachingAssignmentId,
      sourceReference,
      reason,
    });
  }

  listSourceAmendments(
    lessonPlanId: string,
    teachingAssignmentId: string,
  ): Promise<LessonSourceAmendment[]> {
    return invoke<LessonSourceAmendment[]>("list_lesson_source_amendments", {
      lessonPlanId,
      teachingAssignmentId,
    });
  }
}
