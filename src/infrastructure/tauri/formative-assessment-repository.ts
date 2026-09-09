import type {
  FormativeAssessmentLog,
  FormativeAssessmentLogInput,
} from "../../domain/formative-assessment";
import type { FormativeAssessmentRepository } from "../../domain/ports/formative-assessment-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `record_formative_assessment`/
 * `list_formative_assessment_logs_for_assignment`
 * (`src-tauri/src/commands/formative_assessment.rs`). */
export class TauriFormativeAssessmentRepository implements FormativeAssessmentRepository {
  record(input: FormativeAssessmentLogInput): Promise<FormativeAssessmentLog> {
    return invoke<FormativeAssessmentLog>("record_formative_assessment", {
      teachingAssignmentId: input.teachingAssignmentId,
      learnerId: input.learnerId,
      gradingPeriodId: input.gradingPeriodId,
      activityName: input.activityName,
      esruRating: input.esruRating,
      notes: input.notes ?? null,
    });
  }

  listForAssignment(teachingAssignmentId: string): Promise<FormativeAssessmentLog[]> {
    return invoke<FormativeAssessmentLog[]>("list_formative_assessment_logs_for_assignment", {
      teachingAssignmentId,
    });
  }
}
