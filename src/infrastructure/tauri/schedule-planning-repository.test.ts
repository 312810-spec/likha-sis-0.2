import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSchedulePlanningRepository } from "./schedule-planning-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchedulePlanningRepository", () => {
  it("reads the settings without a school argument", async () => {
    mockInvoke.mockResolvedValueOnce({
      schoolId: "school-1",
      dayStartsAt: "07:30",
      dayEndsAt: "17:00",
      schoolDays: 5,
      periodMinutes: 50,
      passingMinutes: 10,
      maxDailyTeachingMinutes: 360,
      maxWeeklyTeachingMinutes: 1800,
      updatedAt: "2026-10-08T01:00:00.000Z",
    });

    await new TauriSchedulePlanningRepository().getScheduleSettings();

    expect(mockInvoke).toHaveBeenCalledWith("get_schedule_settings");
  });

  it("sends the settings update as one struct, never as eight arguments", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await new TauriSchedulePlanningRepository().updateScheduleSettings({
      dayStartsAt: "07:30",
      dayEndsAt: "17:00",
      schoolDays: 5,
      periodMinutes: 50,
      passingMinutes: 10,
      maxDailyTeachingMinutes: 360,
      maxWeeklyTeachingMinutes: 1800,
    });

    expect(mockInvoke).toHaveBeenCalledWith("update_schedule_settings", {
      update: {
        dayStartsAt: "07:30",
        dayEndsAt: "17:00",
        schoolDays: 5,
        periodMinutes: 50,
        passingMinutes: 10,
        maxDailyTeachingMinutes: 360,
        maxWeeklyTeachingMinutes: 1800,
      },
    });
  });

  it("removes an unavailability window by id", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await new TauriSchedulePlanningRepository().removeTeacherUnavailability("unavail-1");

    expect(mockInvoke).toHaveBeenCalledWith("remove_teacher_unavailability", {
      id: "unavail-1",
    });
  });

  it("creates a room with its lab flag", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await new TauriSchedulePlanningRepository().createScheduleRoom("Science Laboratory", true);

    expect(mockInvoke).toHaveBeenCalledWith("create_schedule_room", {
      name: "Science Laboratory",
      isLab: true,
    });
  });

  it("generates a plan with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce({
      planId: "plan-1",
      revision: 1,
      outcome: { outcome: "valid" },
    });

    await new TauriSchedulePlanningRepository().generateSchedulePlan();

    expect(mockInvoke).toHaveBeenCalledWith("generate_schedule_plan");
  });

  it("repairs a placement with the plan, the placement and the chosen slot", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    await new TauriSchedulePlanningRepository().moveSchedulePlanPlacement(
      "plan-1",
      "placement-1",
      2,
      "08:20",
      "09:10",
      "Science Laboratory",
    );

    expect(mockInvoke).toHaveBeenCalledWith("move_schedule_plan_placement", {
      planId: "plan-1",
      placementId: "placement-1",
      weekday: 2,
      startsAt: "08:20",
      endsAt: "09:10",
      room: "Science Laboratory",
    });
  });

  it("validates a plan independently of publishing it", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await new TauriSchedulePlanningRepository().validateSchedulePlan("plan-1");

    expect(mockInvoke).toHaveBeenCalledWith("validate_schedule_plan", { planId: "plan-1" });
  });

  it("publishes a plan by id alone", async () => {
    mockInvoke.mockResolvedValueOnce({ outcome: "published", revision: 1, meetingCount: 4 });

    await new TauriSchedulePlanningRepository().publishSchedulePlan("plan-1");

    expect(mockInvoke).toHaveBeenCalledWith("publish_schedule_plan", { planId: "plan-1" });
  });

  it("reads the three published views in one call", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await new TauriSchedulePlanningRepository().listPublishedScheduleViews();

    expect(mockInvoke).toHaveBeenCalledWith("list_published_schedule_views");
  });

  it("never sends a school id on any call", async () => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue([]);

    const repository = new TauriSchedulePlanningRepository();
    await repository.listSchedulePlans();
    await repository.currentSchedulePlan();
    await repository.listPublishedScheduleViews();

    for (const call of mockInvoke.mock.calls) {
      const args = call[1];
      // A school-scoped command would have to name the school; none of
      // these does, because it is session-derived server-side.
      expect(args).toBeUndefined();
    }
  });
});
