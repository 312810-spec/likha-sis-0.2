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
} from "../schedule-planning";

/**
 * The Teacher Load Maker's port — CTOS.md §M09's
 *
 * ```text
 * Prepare → Confirm → Lock → Generate → Compare → Repair → Validate → Publish
 * ```
 *
 * split into the four surfaces the workflow needs: the constraint inputs
 * (Prepare/Confirm), generation (Lock/Generate), repair and validation
 * (Compare/Repair/Validate), and publication with its three views
 * (Publish).
 *
 * `schoolId` is never a parameter — it is session-derived at the trusted
 * boundary on every call, and every id the client does send is
 * re-verified as belonging to that school server-side. The port therefore
 * carries no authority of its own: a School Head's screen and a teacher's
 * read-only view of the published plan call the same read methods and get
 * the same school's data back, because the school is not something either
 * of them gets to choose.
 *
 * Every write the planner can make is a School-Head-only capability
 * server-side — the same `ManageTeachingAssignments` capability the manual
 * teaching-assignment screens already use, because publishing a timetable
 * is the same authority class as assigning a teacher. The port does not
 * model that: refusing a write here would be UI hiding, which is not
 * authorization.
 */
export interface SchedulePlanningRepository {
  // Prepare / Confirm — the constraint inputs.

  getScheduleSettings(): Promise<ScheduleSettings>;
  updateScheduleSettings(update: ScheduleSettingsUpdate): Promise<ScheduleSettings>;
  listTeacherUnavailability(): Promise<TeacherUnavailability[]>;
  addTeacherUnavailability(
    teacherUserId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    reason: string | null,
  ): Promise<TeacherUnavailability>;
  removeTeacherUnavailability(id: string): Promise<boolean>;
  listScheduleRooms(): Promise<ScheduleRoom[]>;
  createScheduleRoom(name: string, isLab: boolean): Promise<ScheduleRoom>;
  removeScheduleRoom(id: string): Promise<boolean>;
  listSubjectScheduleRequirements(): Promise<SubjectScheduleRequirement[]>;
  setSubjectScheduleRequirement(
    subjectId: string,
    requiredWeeklyMinutes: number,
  ): Promise<SubjectScheduleRequirement>;

  // Lock / Generate.

  generateSchedulePlan(): Promise<GenerationResponse>;

  // Compare / Repair / Validate.

  listSchedulePlanPlacements(planId: string): Promise<PlanPlacement[]>;
  moveSchedulePlanPlacement(
    planId: string,
    placementId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<boolean>;
  removeSchedulePlanPlacement(planId: string, placementId: string): Promise<boolean>;
  validateSchedulePlan(planId: string): Promise<Violation[]>;

  // Publish — and the revision history it leaves behind.

  publishSchedulePlan(planId: string): Promise<PublishOutcome>;
  listPublishedScheduleViews(): Promise<PublishedViews | null>;
  listSchedulePlans(): Promise<SchedulePlan[]>;
  currentSchedulePlan(): Promise<SchedulePlan | null>;
}
