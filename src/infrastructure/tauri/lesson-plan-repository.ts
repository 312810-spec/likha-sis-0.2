import type {
  LessonPlan,
  LessonPlanFields,
  LessonSourceArtifact,
  LessonSourceAmendment,
  LessonSourceReference,
} from "../../domain/lesson-plan";
import type { LessonPlanRepository } from "../../domain/ports/lesson-plan-repository";
import { invoke } from "./invoke";
import type { LessonDraftReviewInput } from "../../domain/lesson-suggestion";

/** Tauri adapter for `create_lesson_plan`/`update_lesson_plan`/
 * `list_lesson_plans_by_assignment` (`src-tauri/src/commands/lesson_plan.rs`). */
export class TauriLessonPlanRepository implements LessonPlanRepository {
  ingestSourceFile(teachingAssignmentId: string, filePath: string): Promise<LessonSourceArtifact> {
    return invoke<LessonSourceArtifact>("ingest_lesson_source_file", {
      teachingAssignmentId,
      filePath,
    });
  }

  getSourceArtifact(artifactId: string): Promise<LessonSourceArtifact | null> {
    return invoke<LessonSourceArtifact | null>("get_lesson_source_artifact", { artifactId });
  }

  create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
    sourceReference?: LessonSourceReference,
    reviewedDraft?: LessonDraftReviewInput,
  ): Promise<LessonPlan | null> {
    return invoke<LessonPlan | null>("create_lesson_plan", {
      teachingAssignmentId,
      planDate,
      ...fields,
      ...(sourceReference ? { sourceReference } : {}),
      ...(reviewedDraft ? { reviewedDraft } : {}),
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
