import type {
  Attachment,
  AttachmentInput,
  ResourceIssue,
  SupportPlan,
  SupportSession,
} from "../school-resources";
export interface SchoolResourcesRepository {
  listAttachments(): Promise<Attachment[]>;
  saveAttachment(input: AttachmentInput): Promise<string>;
  readAttachment(id: string): Promise<number[]>;
  listIssues(): Promise<ResourceIssue[]>;
  issue(
    learnerId: string,
    resourceName: string,
    quantity: number,
    issuedOn: string,
  ): Promise<string>;
  returnResource(
    issueId: string,
    quantity: number,
    reason: string,
    returnedOn: string,
  ): Promise<string>;
  listSupportPlans(): Promise<SupportPlan[]>;
  createSupportPlan(
    learnerId: string,
    goal: string,
    evidence: string,
    followUpOn: string,
  ): Promise<string>;
  listSupportSessions(planId: string): Promise<SupportSession[]>;
  recordSupportSession(
    planId: string,
    sessionOn: string,
    observation: string,
    nextStep: string,
  ): Promise<string>;
}
