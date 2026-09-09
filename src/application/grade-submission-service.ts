import { ValidationError } from "../domain/errors";
import type { GradeSubmission, SubmissionNote } from "../domain/grade-submission";
import type { GradeSubmissionRepository } from "../domain/ports/grade-submission-repository";

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return trimmed;
}

/** Validates shape/non-empty input only, matching every other
 * `*ApplicationService`'s convention -- the backend stays authoritative
 * on authorization: only the submitter's currently-assigned Master
 * Teacher overseer may call `decideMasterTeacher`, only a School Head
 * may call `decideSchoolHead`, and School Head is structurally refused
 * a final lock while a Master Teacher decision is still pending. This
 * screen never decides for itself which action a submission is
 * "supposed to" take next -- it only avoids rendering an action the
 * signed-in user's own role plainly cannot hold, per
 * `docs/adr/0089-master-teacher-rbac-and-two-tier-grade-review.md`. */
export class GradeSubmissionApplicationService {
  constructor(private readonly submissions: GradeSubmissionRepository) {}

  listForSchool(): Promise<GradeSubmission[]> {
    return this.submissions.listForSchool();
  }

  async listForMasterTeacher(asOfDate: string): Promise<GradeSubmission[]> {
    const date = requireNonEmpty(asOfDate, "Date");
    return this.submissions.listForMasterTeacher(date);
  }

  async listNotes(submissionId: string): Promise<SubmissionNote[]> {
    const id = requireNonEmpty(submissionId, "Submission");
    return this.submissions.listNotes(id);
  }

  async decideMasterTeacher(
    submissionId: string,
    approve: boolean,
    feedbackNote: string,
    asOfDate: string,
  ): Promise<GradeSubmission> {
    const id = requireNonEmpty(submissionId, "Submission");
    const date = requireNonEmpty(asOfDate, "Date");
    const trimmedNote = feedbackNote.trim();
    return this.submissions.decideMasterTeacher(
      id,
      approve,
      trimmedNote.length > 0 ? trimmedNote : null,
      date,
    );
  }

  async decideSchoolHead(
    submissionId: string,
    approve: boolean,
    feedbackNote: string,
    asOfDate: string,
  ): Promise<GradeSubmission> {
    const id = requireNonEmpty(submissionId, "Submission");
    const date = requireNonEmpty(asOfDate, "Date");
    const trimmedNote = feedbackNote.trim();
    return this.submissions.decideSchoolHead(
      id,
      approve,
      trimmedNote.length > 0 ? trimmedNote : null,
      date,
    );
  }
}
