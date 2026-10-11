import type {
  ClassOccurrence,
  LearnerFollowupMarker,
  OccurrenceOutcome,
} from "../domain/class-occurrence";
import type {
  ClassOccurrenceRepository,
  OccurrenceCaptureFields,
} from "../domain/ports/class-occurrence-repository";

/**
 * The classroom session application service. Every method takes only the
 * caller's own calendar date plus the class and fields it acts on — no
 * school or teacher identifiers, which are session-derived server-side
 * (see `MyDayApplicationService`'s identical reasoning).
 *
 * This layer's job is to stay thin and keep the flow's invariants legible:
 * the distinction between "started", "already open" and "already delivered"
 * is decided in Rust, and the screen decides what to do with it.
 */
export class ClassOccurrenceApplicationService {
  constructor(private readonly repository: ClassOccurrenceRepository) {}

  start(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome> {
    return this.repository.start(teachingAssignmentId, occurrenceDate);
  }

  capture(
    teachingAssignmentId: string,
    occurrenceDate: string,
    fields: OccurrenceCaptureFields,
  ): Promise<ClassOccurrence | null> {
    return this.repository.capture(teachingAssignmentId, occurrenceDate, fields);
  }

  finish(
    teachingAssignmentId: string,
    occurrenceDate: string,
    summary: string,
  ): Promise<OccurrenceOutcome> {
    return this.repository.finish(teachingAssignmentId, occurrenceDate, summary);
  }

  cancel(
    teachingAssignmentId: string,
    occurrenceDate: string,
    reason: string,
  ): Promise<OccurrenceOutcome> {
    return this.repository.cancel(teachingAssignmentId, occurrenceDate, reason);
  }

  reopen(teachingAssignmentId: string, occurrenceDate: string): Promise<OccurrenceOutcome> {
    return this.repository.reopen(teachingAssignmentId, occurrenceDate);
  }

  getForDate(
    teachingAssignmentId: string,
    occurrenceDate: string,
  ): Promise<ClassOccurrence | null> {
    return this.repository.getForDate(teachingAssignmentId, occurrenceDate);
  }

  listForAssignment(teachingAssignmentId: string): Promise<ClassOccurrence[]> {
    return this.repository.listForAssignment(teachingAssignmentId);
  }

  markFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
    reason: string,
  ): Promise<LearnerFollowupMarker | null> {
    return this.repository.markFollowup(classOccurrenceId, sectionMembershipId, reason);
  }

  clearFollowup(
    classOccurrenceId: string,
    sectionMembershipId: string,
  ): Promise<LearnerFollowupMarker | null> {
    return this.repository.clearFollowup(classOccurrenceId, sectionMembershipId);
  }

  listFollowupMarkers(classOccurrenceId: string): Promise<LearnerFollowupMarker[]> {
    return this.repository.listFollowupMarkers(classOccurrenceId);
  }
}
