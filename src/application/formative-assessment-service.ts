import { ValidationError } from "../domain/errors";
import type {
  FormativeAssessmentLog,
  FormativeAssessmentLogInput,
} from "../domain/formative-assessment";
import { validateFormativeAssessmentLog } from "../domain/formative-assessment";
import type { FormativeAssessmentRepository } from "../domain/ports/formative-assessment-repository";

/**
 * Orchestrates Formative Assessment (ESRU) logging (Batch 11, ADR-0082).
 * Per `.claude/rules/architecture.md`'s `*-service.ts` convention, this
 * is where input is validated before ever reaching a repository port.
 * School/authorization scope is never a parameter here -- it comes from
 * the caller's authenticated session on the Rust side, matching
 * `TransferRecordApplicationService`'s own convention.
 */
export class FormativeAssessmentApplicationService {
  constructor(private readonly formativeAssessmentLogs: FormativeAssessmentRepository) {}

  async record(input: FormativeAssessmentLogInput): Promise<FormativeAssessmentLog> {
    const validated = validateFormativeAssessmentLog(input);
    return this.formativeAssessmentLogs.record(validated);
  }

  async listForAssignment(teachingAssignmentId: string): Promise<FormativeAssessmentLog[]> {
    const trimmedId = teachingAssignmentId.trim();
    if (trimmedId.length === 0) {
      throw new ValidationError("A teaching assignment is required.");
    }
    return this.formativeAssessmentLogs.listForAssignment(trimmedId);
  }
}
