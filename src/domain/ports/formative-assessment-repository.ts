import type { FormativeAssessmentLog, FormativeAssessmentLogInput } from "../formative-assessment";

/**
 * Port for Formative Assessment (ESRU) logging (Batch 11, ADR-0082).
 * `schoolId`/the acting user are never client-trusted for authorization
 * -- the Rust command layer derives the session and checks
 * `formative_assessment::authorize_own_assignment` server-side; this
 * port only carries the ids/fields needed to route the call.
 */
export interface FormativeAssessmentRepository {
  record(input: FormativeAssessmentLogInput): Promise<FormativeAssessmentLog>;
  listForAssignment(teachingAssignmentId: string): Promise<FormativeAssessmentLog[]>;
}
