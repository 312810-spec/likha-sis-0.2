import type { ReviewWorkflowRepository } from "../domain/ports/review-workflow-repository";
import type { ReviewHistory, ReviewPacket, ReviewRequest } from "../domain/review-workflow";
export class ReviewWorkflowApplicationService {
  constructor(private readonly repository: ReviewWorkflowRepository) {}
  list(): Promise<ReviewPacket[]> { return this.repository.list(); }
  act(request: ReviewRequest): Promise<ReviewPacket> { return this.repository.act(request); }
  history(packetId: string): Promise<ReviewHistory[]> { return this.repository.history(packetId); }
}
