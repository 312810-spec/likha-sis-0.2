/**
 * Multi-Tier Review & Audit Pipeline (ADR-0073), permanent two-tier
 * design (ADR-0089, Batch 17). Mirrors
 * `repository::grade_submission::{GradeSubmission, SubmissionStatus,
 * MasterTeacherDecision, SubmissionNote, SubmissionNoteType}` exactly.
 *
 * `status` is deliberately left unwidened (`submitted` | `approved` |
 * `rejected`) -- the two sub-states a widened enum would have encoded
 * are read off `status === "submitted"` combined with
 * `masterTeacherDecision`: `null` means still awaiting a decision at
 * whichever tier applies; `"approved"` means the Master Teacher tier
 * approved and School Head's final lock is pending.
 */
/** @public -- consumed structurally as `GradeSubmission.status`'s field
 * type, never imported by name elsewhere. */
export type SubmissionStatus = "submitted" | "approved" | "rejected";

/** @public -- consumed structurally as `GradeSubmission.masterTeacherDecision`'s
 * field type, never imported by name elsewhere. */
export type MasterTeacherDecision = "approved" | "rejected";

export interface GradeSubmission {
  id: string;
  schoolId: string;
  classRecordId: string;
  submittedByUserId: string | null;
  status: SubmissionStatus;
  submittedAt: string;
  decidedByUserId: string | null;
  decidedAt: string | null;
  /** The Master Teacher tier's own decision -- `null` when no Master
   * Teacher has decided yet, whether because none is assigned (the
   * no-MT-assigned fallback) or because one is assigned but hasn't
   * acted. */
  masterTeacherDecision: MasterTeacherDecision | null;
  masterTeacherDecidedByUserId: string | null;
  masterTeacherDecidedAt: string | null;
}

/** @public -- consumed structurally as `SubmissionNote.noteType`'s field
 * type, never imported by name elsewhere. */
export type SubmissionNoteType = "automated_check" | "feedback";

export interface SubmissionNote {
  id: string;
  submissionId: string;
  authorUserId: string | null;
  noteType: SubmissionNoteType;
  note: string;
  createdAt: string;
}

/**
 * Which tier a submission is currently waiting on, or its resolved
 * outcome -- computed client-side purely for display (`reviewStage`)
 * from `GradeSubmission`'s own fields; never sent to or trusted from the
 * backend as an authorization signal. `hasMasterTeacherTier` distinguishes
 * "awaiting Master Teacher" from "no Master Teacher assigned, awaiting
 * School Head directly" (the intentional fallback, not a bug) --
 * resolved by the caller from `teacher_oversight_assignment::current_overseer_for_teacher`,
 * since a `GradeSubmission` alone cannot tell the two apart when
 * `masterTeacherDecision` is still `null`.
 */
export type ReviewStage =
  | "awaiting_master_teacher"
  | "awaiting_school_head"
  | "approved"
  | "rejected_by_master_teacher"
  | "rejected_by_school_head";

/**
 * Resolves the two-tier display stage for one submission.
 * `hasAssignedMasterTeacher` must reflect whether the submitter
 * currently has an assigned Master Teacher overseer (as of the same
 * date the caller is displaying against) -- `false` triggers the
 * documented no-MT-assigned fallback stage, matching
 * `commands::grade_submission::require_no_pending_master_teacher_decision`'s
 * own server-side logic exactly, so the UI's status label never
 * disagrees with what the backend will actually allow.
 */
export function reviewStageFor(
  submission: GradeSubmission,
  hasAssignedMasterTeacher: boolean,
): ReviewStage {
  if (submission.status === "rejected") {
    return submission.masterTeacherDecision === "rejected"
      ? "rejected_by_master_teacher"
      : "rejected_by_school_head";
  }
  if (submission.status === "approved") {
    return "approved";
  }
  // status === "submitted"
  if (submission.masterTeacherDecision === "approved") {
    return "awaiting_school_head";
  }
  return hasAssignedMasterTeacher ? "awaiting_master_teacher" : "awaiting_school_head";
}
