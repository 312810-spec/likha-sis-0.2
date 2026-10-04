import type { ReviewWorkflowRepository } from "../../domain/ports/review-workflow-repository";
import type { ReviewHistory, ReviewPacket, ReviewRequest } from "../../domain/review-workflow";
import { invoke } from "./invoke";
export class TauriReviewWorkflowRepository implements ReviewWorkflowRepository {
  list(): Promise<ReviewPacket[]> { return invoke("list_review_packets"); }
  act(request: ReviewRequest): Promise<ReviewPacket> { return invoke("act_review_packet", { request }); }
  history(packetId: string): Promise<ReviewHistory[]> { return invoke("review_packet_history", { packetId }); }
}
