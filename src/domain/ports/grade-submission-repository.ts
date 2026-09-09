import type { GradeSubmission, SubmissionNote } from "../grade-submission";

/**
 * The two-tier grade-review command surface (ADR-0089, Batch 17
 * checkpoint 4). `school_id` is always session-derived server-side,
 * never a parameter here -- matching every other same-school command in
 * this codebase.
 */
export interface GradeSubmissionRepository {
  /** School Head's full submission-status matrix, gated on
   * `ManageGradeSubmissionReview`. */
  listForSchool(): Promise<GradeSubmission[]>;
  /** A Master Teacher's own review queue: every submission from a
   * teacher they currently oversee, self-scoped -- an empty list for
   * someone overseeing nobody right now, never an error. */
  listForMasterTeacher(asOfDate: string): Promise<GradeSubmission[]>;
  listNotes(submissionId: string): Promise<SubmissionNote[]>;
  /** ADR-0089 tier 1: only the submitter's currently-assigned Master
   * Teacher overseer may call this -- the backend structurally blocks
   * self-approval and any caller who isn't the current overseer. */
  decideMasterTeacher(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ): Promise<GradeSubmission>;
  /** ADR-0089 tier 2 / the no-MT-assigned fallback: School Head's
   * distinct final lock. The backend itself refuses this when a Master
   * Teacher tier is pending -- never left to the UI to hide a button. */
  decideSchoolHead(
    submissionId: string,
    approve: boolean,
    feedbackNote: string | null,
    asOfDate: string,
  ): Promise<GradeSubmission>;
}
