import type { SchedulePlanningRepository } from "../domain/ports/schedule-planning-repository";
import type {
  GenerationResponse,
  PlanPlacement,
  PublishOutcome,
  PublishedViews,
  SchedulePlan,
  ScheduleRoom,
  ScheduleSettings,
  ScheduleSettingsUpdate,
  SubjectScheduleRequirement,
  TeacherUnavailability,
  Violation,
} from "../domain/schedule-planning";

/**
 * The Teacher Load Maker's application service — CTOS.md §M09. The layer
 * stays deliberately thin: the workflow's semantics live in Rust and in the
 * schema, and this service exists so the screen depends on a domain
 * boundary instead of a Tauri channel, the same shape every other service
 * in this directory follows.
 *
 * No school identifier is ever a parameter — it is session-derived at the
 * trusted boundary, and the trusted boundary re-derives it on every call
 * rather than trusting a value a screen once knew. The one piece of
 * sequencing this layer does own is the shape of a Generate round: a
 * generation returns the plan it staged *and* which of the three required
 * states it landed in, so a caller cannot ask for the placements without
 * also learning whether they are a complete timetable, a proven
 * impossibility, or a search that stopped early.
 */
export class SchedulePlanningApplicationService {
  constructor(private readonly repository: SchedulePlanningRepository) {}

  // Prepare / Confirm.

  getScheduleSettings(): Promise<ScheduleSettings> {
    return this.repository.getScheduleSettings();
  }

  updateScheduleSettings(update: ScheduleSettingsUpdate): Promise<ScheduleSettings> {
    return this.repository.updateScheduleSettings(update);
  }

  listTeacherUnavailability(): Promise<TeacherUnavailability[]> {
    return this.repository.listTeacherUnavailability();
  }

  addTeacherUnavailability(
    teacherUserId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    reason: string | null,
  ): Promise<TeacherUnavailability> {
    return this.repository.addTeacherUnavailability(
      teacherUserId,
      weekday,
      startsAt,
      endsAt,
      reason,
    );
  }

  removeTeacherUnavailability(id: string): Promise<boolean> {
    return this.repository.removeTeacherUnavailability(id);
  }

  listScheduleRooms(): Promise<ScheduleRoom[]> {
    return this.repository.listScheduleRooms();
  }

  createScheduleRoom(name: string, isLab: boolean): Promise<ScheduleRoom> {
    return this.repository.createScheduleRoom(name, isLab);
  }

  removeScheduleRoom(id: string): Promise<boolean> {
    return this.repository.removeScheduleRoom(id);
  }

  listSubjectScheduleRequirements(): Promise<SubjectScheduleRequirement[]> {
    return this.repository.listSubjectScheduleRequirements();
  }

  setSubjectScheduleRequirement(
    subjectId: string,
    requiredWeeklyMinutes: number,
  ): Promise<SubjectScheduleRequirement> {
    return this.repository.setSubjectScheduleRequirement(subjectId, requiredWeeklyMinutes);
  }

  // Lock / Generate.

  generateSchedulePlan(): Promise<GenerationResponse> {
    return this.repository.generateSchedulePlan();
  }

  // Compare / Repair / Validate.

  listSchedulePlanPlacements(planId: string): Promise<PlanPlacement[]> {
    return this.repository.listSchedulePlanPlacements(planId);
  }

  moveSchedulePlanPlacement(
    planId: string,
    placementId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<boolean> {
    return this.repository.moveSchedulePlanPlacement(
      planId,
      placementId,
      weekday,
      startsAt,
      endsAt,
      room,
    );
  }

  removeSchedulePlanPlacement(planId: string, placementId: string): Promise<boolean> {
    return this.repository.removeSchedulePlanPlacement(planId, placementId);
  }

  validateSchedulePlan(planId: string): Promise<Violation[]> {
    return this.repository.validateSchedulePlan(planId);
  }

  // Publish.

  publishSchedulePlan(planId: string): Promise<PublishOutcome> {
    return this.repository.publishSchedulePlan(planId);
  }

  listPublishedScheduleViews(): Promise<PublishedViews | null> {
    return this.repository.listPublishedScheduleViews();
  }

  listSchedulePlans(): Promise<SchedulePlan[]> {
    return this.repository.listSchedulePlans();
  }

  currentSchedulePlan(): Promise<SchedulePlan | null> {
    return this.repository.currentSchedulePlan();
  }
}
