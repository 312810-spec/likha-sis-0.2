import type { SchoolResourcesRepository } from "../domain/ports/school-resources-repository";
import type { AttachmentInput } from "../domain/school-resources";
import { ValidationError } from "../domain/errors";
export class SchoolResourcesApplicationService {
  constructor(private readonly repository: SchoolResourcesRepository) {}
  listAttachments() {
    return this.repository.listAttachments();
  }
  saveAttachment(input: AttachmentInput) {
    if (input.bytes.length > 2 * 1024 * 1024 || !input.bytes.length)
      throw new ValidationError("Choose a file no larger than 2 MiB.");
    return this.repository.saveAttachment(input);
  }
  readAttachment(id: string) {
    return this.repository.readAttachment(id);
  }
  listIssues() {
    return this.repository.listIssues();
  }
  issue(learnerId: string, name: string, quantity: number, date: string) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000)
      throw new ValidationError("Enter a whole quantity from 1 to 1000.");
    return this.repository.issue(learnerId, name.trim(), quantity, date);
  }
  returnResource(id: string, quantity: number, reason: string, date: string) {
    if (!Number.isInteger(quantity) || quantity < 1 || !reason.trim())
      throw new ValidationError("Enter a positive whole quantity and a return note.");
    return this.repository.returnResource(id, quantity, reason.trim(), date);
  }
  listSupportPlans() {
    return this.repository.listSupportPlans();
  }
  createSupportPlan(learnerId: string, goal: string, evidence: string, date: string) {
    if (!goal.trim() || !evidence.trim())
      throw new ValidationError("Describe the learning goal and observed evidence.");
    return this.repository.createSupportPlan(learnerId, goal.trim(), evidence.trim(), date);
  }
  listSupportSessions(id: string) {
    return this.repository.listSupportSessions(id);
  }
  recordSupportSession(id: string, date: string, observation: string, nextStep: string) {
    if (!observation.trim() || !nextStep.trim())
      throw new ValidationError("Describe the session and next step.");
    return this.repository.recordSupportSession(id, date, observation.trim(), nextStep.trim());
  }
}
