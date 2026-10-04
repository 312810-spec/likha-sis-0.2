import { invoke } from "./invoke";
import type { SchoolResourcesRepository } from "../../domain/ports/school-resources-repository";
import type {
  Attachment,
  AttachmentInput,
  ResourceIssue,
  SupportPlan,
  SupportSession,
} from "../../domain/school-resources";
export class TauriSchoolResourcesRepository implements SchoolResourcesRepository {
  listAttachments() {
    return invoke<Attachment[]>("list_attachments");
  }
  saveAttachment(input: AttachmentInput) {
    return invoke<string>("save_attachment", { input });
  }
  readAttachment(id: string) {
    return invoke<number[]>("read_attachment", { id });
  }
  listIssues() {
    return invoke<ResourceIssue[]>("list_resource_issues");
  }
  issue(learnerId: string, resourceName: string, quantity: number, issuedOn: string) {
    return invoke<string>("issue_learning_resource", {
      learnerId,
      resourceName,
      quantity,
      issuedOn,
    });
  }
  returnResource(issueId: string, quantity: number, reason: string, returnedOn: string) {
    return invoke<string>("return_learning_resource", { issueId, quantity, reason, returnedOn });
  }
  listSupportPlans() {
    return invoke<SupportPlan[]>("list_support_plans");
  }
  createSupportPlan(learnerId: string, goal: string, evidence: string, followUpOn: string) {
    return invoke<string>("create_support_plan", { learnerId, goal, evidence, followUpOn });
  }
  listSupportSessions(planId: string) {
    return invoke<SupportSession[]>("list_support_sessions", { planId });
  }
  recordSupportSession(planId: string, sessionOn: string, observation: string, nextStep: string) {
    return invoke<string>("record_support_session", { planId, sessionOn, observation, nextStep });
  }
}
