import type { LearnerSupportCase } from "../../domain/learner-support";
import type { LearnerSupportRepository } from "../../domain/ports/learner-support-repository";
import { invoke } from "./invoke";

/**
 * Tauri adapter for the learning-support commands
 * (`src-tauri/src/commands/learner_support.rs`). Argument names are the
 * camelCase spellings Tauri maps onto each command's snake_case parameters,
 * and every command takes only the occurrence, the enrollment, and the
 * piece of the plan being acted on — the school and the acting teacher are
 * session-derived server-side, so nothing here can carry them.
 */
export class TauriLearnerSupportRepository implements LearnerSupportRepository {
  openCase(
    classOccurrenceId: string,
    sectionMembershipId: string,
    need: string,
    goal: string,
    intervention: string,
  ): Promise<LearnerSupportCase | null> {
    return invoke<LearnerSupportCase | null>("open_learner_support_case", {
      classOccurrenceId,
      sectionMembershipId,
      need,
      goal,
      intervention,
    });
  }

  recordParticipation(caseId: string, participation: string): Promise<LearnerSupportCase | null> {
    return invoke<LearnerSupportCase | null>("record_learner_support_participation", {
      caseId,
      participation,
    });
  }

  resolve(caseId: string, outcome: string): Promise<LearnerSupportCase | null> {
    return invoke<LearnerSupportCase | null>("resolve_learner_support_case", {
      caseId,
      outcome,
    });
  }

  listForOccurrence(classOccurrenceId: string): Promise<LearnerSupportCase[]> {
    return invoke<LearnerSupportCase[]>("list_learner_support_cases", {
      classOccurrenceId,
    });
  }
}
