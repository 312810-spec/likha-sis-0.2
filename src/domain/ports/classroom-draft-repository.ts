/** Device-local teacher drafts, never official records or synchronized approvals. */
export interface ClassroomDraftScope {
  teachingAssignmentId: string;
  occurrenceDate: string;
  expectedRevision: number;
}
export interface ClassroomDraftFields {
  actualStartsAt: string;
  actualEndsAt: string;
  actualRoom: string;
  learningTarget: string;
  quickEvidence: string;
  notes: string;
  finishSummary: string;
  cancelReason: string;
  pendingReason: string;
  markingMembershipId: string | null;
}
export interface ClassroomDraft {
  fields: ClassroomDraftFields;
  savedAt: string;
}
export interface ClassroomDraftRepository {
  load(scope: ClassroomDraftScope): Promise<ClassroomDraft | null>;
  save(scope: ClassroomDraftScope, fields: ClassroomDraftFields): Promise<ClassroomDraft>;
  remove(scope: ClassroomDraftScope): Promise<void>;
}
