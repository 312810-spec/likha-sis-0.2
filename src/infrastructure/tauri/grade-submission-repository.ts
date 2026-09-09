import type { GradeSubmissionRepository } from "../../domain/ports/grade-submission-repository";
import type { GradeSubmission, SubmissionNote } from "../../domain/grade-submission";
import { invoke } from "./invoke";

/** Tauri adapter for the two-tier grade-review command surface
 * (`decide_grade_submission_master_teacher`/`decide_grade_submission`/
 * `list_grade_submissions_for_school`/`list_grade_submissions_for_master_teacher`/
 * `list_grade_submission_notes`), ADR-0089 Batch 17 checkpoint 4. */
export class TauriGradeSubmissionRepository implements GradeSubmissionRepository {
  listForSchool(): Promise<GradeSubmission[]> {
    return invoke<GradeSubmission[]>("list_grade_submissions_for_school");
  }

  listForMasterTeacher(asOfDate: string): Promise<GradeSubmission[]> {
    return invoke<GradeSubmission[]>("list_grade_submissions_for_master_teacher", { asOfDate });
  }

  listNotes(submissionId: string): Promise<SubmissionNote[]> {
    return invoke<SubmissionNote[]>("list_grade_submission_notes", { submissionId });
  }

  decideMasterTeacher(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ): Promise<GradeSubmission> {
    return invoke<GradeSubmission>("decide_grade_submission_master_teacher", {
      submissionId,
      approve,
      feedbackNote,
      asOfDate,
    });
  }

  decideSchoolHead(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ): Promise<GradeSubmission> {
    return invoke<GradeSubmission>("decide_grade_submission", {
      submissionId,
      approve,
      feedbackNote,
      asOfDate,
    });
  }
}
