import { invoke } from "@tauri-apps/api/core";
import type { ConflictResolutionChoice, ConflictReviewSummary } from "../../domain/conflict-review";
import type { ConflictReviewRepository } from "../../domain/ports/conflict-review-repository";

export class TauriConflictReviewRepository implements ConflictReviewRepository {
  listConflicts(): Promise<ConflictReviewSummary[]> {
    return invoke<ConflictReviewSummary[]>("list_conflict_reviews");
  }

  resolveConflict(conflictId: string, resolution: ConflictResolutionChoice): Promise<boolean> {
    return invoke<boolean>("resolve_conflict_review", { conflictId, resolution });
  }
}
