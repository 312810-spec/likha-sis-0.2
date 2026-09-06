import type { LessonPlan, LessonPlanFields } from "../../domain/lesson-plan";
import type { LessonPlanRepository } from "../../domain/ports/lesson-plan-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `create_lesson_plan`/`update_lesson_plan`/
 * `list_lesson_plans_by_assignment` (`src-tauri/src/commands/lesson_plan.rs`). */
export class TauriLessonPlanRepository implements LessonPlanRepository {
  create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    return invoke<LessonPlan | null>("create_lesson_plan", {
      teachingAssignmentId,
      planDate,
      ...fields,
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
}
