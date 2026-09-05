import { ValidationError } from "../domain/errors";
import type { ConflictResolutionChoice, ConflictReviewSummary } from "../domain/conflict-review";
import type { ConflictReviewRepository } from "../domain/ports/conflict-review-repository";

/** `listConflicts` takes no input to validate, matching every other
 * same-school reference-data read in this codebase (see
 * `DeviceSyncApplicationService.listDevices`). `resolveConflict`
 * validates shape only — the backend alone decides whether the caller is
 * actually allowed to resolve this particular conflict. */
export class ConflictReviewApplicationService {
  constructor(private readonly conflicts: ConflictReviewRepository) {}

  listConflicts(): Promise<ConflictReviewSummary[]> {
    return this.conflicts.listConflicts();
  }

  async resolveConflict(
    conflictId: string,
    resolution: ConflictResolutionChoice,
  ): Promise<boolean> {
    const target = conflictId.trim();
    if (target.length === 0) {
      throw new ValidationError("A conflict must be selected.");
    }
    if (resolution !== "keep_local" && resolution !== "use_incoming") {
      throw new ValidationError("A resolution choice must be either keep_local or use_incoming.");
    }
    return this.conflicts.resolveConflict(target, resolution);
  }
}
