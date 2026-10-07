export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sha256: string;
  previousId: string | null;
  linkKind: string;
  linkId: string | null;
  createdAt: string;
}
export interface AttachmentInput {
  filename: string;
  mimeType: string;
  bytes: number[];
  linkKind: "standalone" | "learner" | "class_record" | "form_draft";
  linkId: string | null;
  previousId: string | null;
  reviewerUserId: string | null;
}
export interface ResourceIssue {
  id: string;
  learnerId: string;
  resourceName: string;
  issuedQuantity: number;
  returnedQuantity: number;
  issuedOn: string;
}
export interface SupportPlan {
  id: string;
  learnerId: string;
  goal: string;
  evidence: string;
  followUpOn: string;
}
export interface SupportSession {
  id: string;
  sessionOn: string;
  observation: string;
  nextStep: string;
}
