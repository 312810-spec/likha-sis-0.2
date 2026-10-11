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
} from "../../domain/schedule-planning";
import type { SchedulePlanningRepository } from "../../domain/ports/schedule-planning-repository";
import { invoke } from "./invoke";

/**
 * Tauri adapter for the Teacher Load Maker's commands
 * (`src-tauri/src/commands/schedule_planning.rs`). Argument names are the
 * camelCase spellings Tauri maps onto each command's snake_case
 * parameters; the school is never among them, because it is
 * session-derived server-side.
 */
export class TauriSchedulePlanningRepository implements SchedulePlanningRepository {
  getScheduleSettings(): Promise<ScheduleSettings> {
    return invoke<ScheduleSettings>("get_schedule_settings");
  }

  updateScheduleSettings(update: ScheduleSettingsUpdate): Promise<ScheduleSettings> {
    return invoke<ScheduleSettings>("update_schedule_settings", { update });
  }

  listTeacherUnavailability(): Promise<TeacherUnavailability[]> {
    return invoke<TeacherUnavailability[]>("list_teacher_unavailability");
  }

  addTeacherUnavailability(
    teacherUserId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    reason: string | null,
  ): Promise<TeacherUnavailability> {
    return invoke<TeacherUnavailability>("add_teacher_unavailability", {
      teacherUserId,
      weekday,
      startsAt,
      endsAt,
      reason,
    });
  }

  removeTeacherUnavailability(id: string): Promise<boolean> {
    return invoke<boolean>("remove_teacher_unavailability", { id });
  }

  listScheduleRooms(): Promise<ScheduleRoom[]> {
    return invoke<ScheduleRoom[]>("list_schedule_rooms");
  }

  createScheduleRoom(name: string, isLab: boolean): Promise<ScheduleRoom> {
    return invoke<ScheduleRoom>("create_schedule_room", { name, isLab });
  }

  removeScheduleRoom(id: string): Promise<boolean> {
    return invoke<boolean>("remove_schedule_room", { id });
  }

  listSubjectScheduleRequirements(): Promise<SubjectScheduleRequirement[]> {
    return invoke<SubjectScheduleRequirement[]>("list_subject_schedule_requirements");
  }

  setSubjectScheduleRequirement(
    subjectId: string,
    requiredWeeklyMinutes: number,
  ): Promise<SubjectScheduleRequirement> {
    return invoke<SubjectScheduleRequirement>("set_subject_schedule_requirement", {
      subjectId,
      requiredWeeklyMinutes,
    });
  }

  generateSchedulePlan(): Promise<GenerationResponse> {
    return invoke<GenerationResponse>("generate_schedule_plan");
  }

  listSchedulePlanPlacements(planId: string): Promise<PlanPlacement[]> {
    return invoke<PlanPlacement[]>("list_schedule_plan_placements", { planId });
  }

  moveSchedulePlanPlacement(
    planId: string,
    placementId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<boolean> {
    return invoke<boolean>("move_schedule_plan_placement", {
      planId,
      placementId,
      weekday,
      startsAt,
      endsAt,
      room,
    });
  }

  removeSchedulePlanPlacement(planId: string, placementId: string): Promise<boolean> {
    return invoke<boolean>("remove_schedule_plan_placement", { planId, placementId });
  }

  validateSchedulePlan(planId: string): Promise<Violation[]> {
    return invoke<Violation[]>("validate_schedule_plan", { planId });
  }

  publishSchedulePlan(planId: string): Promise<PublishOutcome> {
    return invoke<PublishOutcome>("publish_schedule_plan", { planId });
  }

  listPublishedScheduleViews(): Promise<PublishedViews | null> {
    return invoke<PublishedViews | null>("list_published_schedule_views");
  }

  listSchedulePlans(): Promise<SchedulePlan[]> {
    return invoke<SchedulePlan[]>("list_schedule_plans");
  }

  currentSchedulePlan(): Promise<SchedulePlan | null> {
    return invoke<SchedulePlan | null>("current_schedule_plan");
  }
}
