import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
} from "../../domain/class-occurrence";
import type {
  ClassOccurrenceRepository,
  OccurrenceCaptureFields,
} from "../../domain/ports/class-occurrence-repository";
import { invoke } from "./invoke";

/**
 * Tauri adapter for the classroom-occurrence commands
 * (`src-tauri/src/commands/class_occurrence.rs`). Argument names are the
 * camelCase spellings Tauri maps onto each command's snake_case parameters,
 * and every command takes only the class, the calendar date, and the fields
 * being acted on — the school and the acting teacher are session-derived
 * server-side, so nothing here can carry them.
 */
export class TauriClassOccurrenceRepository implements ClassOccurrenceRepository {
  start(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome> {
    return invoke<OccurrenceOutcome>("start_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
    });
  }

  capture(
    teachingAssignmentId: string,
    occurrenceDate: string,
    fields: OccurrenceCaptureFields,
  ): Promise<ClassOccurrence | null> {
    return invoke<ClassOccurrence | null>("capture_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
      // Sent explicitly, including the `undefined` cases, so the Rust side's
      // `Option<&str>` receives a null for every omitted field and a string
      // for every one supplied.
      actualStartsAt: fields.actualStartsAt ?? null,
      actualEndsAt: fields.actualEndsAt ?? null,
      actualRoom: fields.actualRoom ?? null,
      learningTarget: fields.learningTarget ?? null,
      quickEvidence: fields.quickEvidence ?? null,
      notes: fields.notes ?? null,
    });
  }

  finish(
    teachingAssignmentId: string,
    occurrenceDate: string,
    summary: string,
  ): Promise<OccurrenceOutcome> {
    return invoke<OccurrenceOutcome>("finish_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
      summary,
    });
  }

  cancel(
    teachingAssignmentId: string,
    occurrenceDate: string,
    reason: string,
  ): Promise<OccurrenceOutcome> {
    return invoke<OccurrenceOutcome>("cancel_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
      reason,
    });
  }

  reopen(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome> {
    return invoke<OccurrenceOutcome>("reopen_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
    });
  }

  getForDate(
    teachingAssignmentId: string,
    occurrenceDate: string,
  ): Promise<ClassOccurrence | null> {
    return invoke<ClassOccurrence | null>("get_class_occurrence", {
      teachingAssignmentId,
      occurrenceDate,
    });
  }

  listForAssignment(teachingAssignmentId: string): Promise<ClassOccurrence[]> {
    return invoke<ClassOccurrence[]>("list_class_occurrences", { teachingAssignmentId });
  }

  markFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
    reason: string,
  ): Promise<LearnerFollowupMarker | null> {
    return invoke<LearnerFollowupMarker | null>("mark_learner_followup", {
      classOccurrenceId,
      sectionMembershipId,
      reason,
    });
  }

  clearFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
  ): Promise<LearnerFollowupMarker | null> {
    return invoke<LearnerFollowupMarker | null>("clear_learner_followup", {
      classOccurrenceId,
      sectionMembershipId,
    });
  }

  listFollowupMarkers(classOccurrenceId: string): Promise<LearnerFollowupMarker[]> {
    return invoke<LearnerFollowupMarker[]>("list_learner_followup_markers", {
      classOccurrenceId,
    });
  }
}
