import type { LessonPlan, LessonPlanFields } from "../lesson-plan";

/**
 * Port for the structured lesson-plan builder (Creation Studio sub-scope
 * 3/3). `teachingAssignmentId`/`schoolId`/the acting user are never
 * client-trusted for authorization -- the Rust command layer derives the
 * session and checks ownership (or, for reads, School Head status)
 * server-side; this port only carries the ids needed to route the call.
 */
export interface LessonPlanRepository {
  create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null>;
  update(
    id: string,
    teachingAssignmentId: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null>;
  listByAssignment(teachingAssignmentId: string): Promise<LessonPlan[]>;
}
