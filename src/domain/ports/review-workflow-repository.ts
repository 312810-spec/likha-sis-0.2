import type { ReviewHistory, ReviewPacket, ReviewRequest } from "../review-workflow";
export interface ReviewWorkflowRepository {
  list(): Promise<ReviewPacket[]>;
  act(request: ReviewRequest): Promise<ReviewPacket>;
  history(packetId: string): Promise<ReviewHistory[]>;
  exportSample(packetId: string): Promise<string>;
  importSample(sampleJson: string): Promise<ReviewPacket>;
}
