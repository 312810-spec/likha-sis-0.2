import type { LearnerSupportCase } from "../domain/learner-support";
import type { LearnerSupportRepository } from "../domain/ports/learner-support-repository";

/**
 * The learning-support application service — CTOS.md §M08. Every method
 * takes only the occurrence, the enrollment, and the piece of the plan it
 * acts on: no school or teacher identifiers, which are session-derived
 * server-side (see `ClassOccurrenceApplicationService`'s identical
 * reasoning), and no status parameter — the transition is implied by which
 * method the teacher called, which is what makes the one-order rule a
 * property of the loop rather than something each caller has to remember.
 *
 * The layer stays deliberately thin. The loop's semantics live in Rust and
 * in the schema; this service exists so the screen depends on a domain
 * boundary instead of a Tauri channel, the same shape every other service
 * in this directory follows.
 */
export class LearnerSupportApplicationService {
  constructor(private readonly repository: LearnerSupportRepository) {}

  openCase(
    classOccurrenceId: string,
    sectionMembershipId: string,
    need: string,
    goal: string,
    intervention: string,
  ): Promise<LearnerSupportCase | null> {
    return this.repository.openCase(
      classOccurrenceId,
      sectionMembershipId,
      need,
      goal,
      intervention,
    );
  }

  recordParticipation(caseId: string, participation: string): Promise<LearnerSupportCase | null> {
    return this.repository.recordParticipation(caseId, participation);
  }

  resolve(caseId: string, outcome: string): Promise<LearnerSupportCase | null> {
    return this.repository.resolve(caseId, outcome);
  }

  listForOccurrence(classOccurrenceId: string): Promise<LearnerSupportCase[]> {
    return this.repository.listForOccurrence(classOccurrenceId);
  }
}
