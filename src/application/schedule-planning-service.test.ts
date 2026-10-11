import { describe, expect, it } from "vitest";
import type { GenerationResponse, PlanPlacement, Violation } from "../domain/schedule-planning";
import type { SchedulePlanningRepository } from "../domain/ports/schedule-planning-repository";
import { SchedulePlanningApplicationService } from "./schedule-planning-service";

const settings = {
  schoolId: "school-1",
  dayStartsAt: "07:30",
  dayEndsAt: "17:00",
  schoolDays: 5,
  periodMinutes: 50,
  passingMinutes: 10,
  maxDailyTeachingMinutes: 360,
  maxWeeklyTeachingMinutes: 1800,
  updatedAt: "2026-10-08T01:00:00.000Z",
};

const planPlacement: PlanPlacement = {
  id: "placement-1",
  planId: "plan-1",
  teachingAssignmentId: "assignment-1",
  teacherName: "Teacher A",
  sectionId: "section-1",
  sectionName: "Mabini",
  subjectName: "Mathematics",
  weekday: 1,
  startsAt: "07:30",
  endsAt: "08:20",
  room: null,
};

class FakeRepository implements SchedulePlanningRepository {
  generateCalls = 0;
  publishCalls: string[] = [];
  validateCalls: string[] = [];
  placementsCalls: string[] = [];
  removePlacementCalls: [string, string][] = [];
  nextGeneration: GenerationResponse = {
    planId: "plan-1",
    revision: 1,
    outcome: { outcome: "valid", placements: [], notes: [] },
  };
  nextViolations: Violation[] = [];
  placements: PlanPlacement[] = [planPlacement];

  async getScheduleSettings() {
    return settings;
  }
  async updateScheduleSettings() {
    return settings;
  }
  async listTeacherUnavailability() {
    return [];
  }
  async addTeacherUnavailability() {
    return {
      id: "unavail-1",
      schoolId: "school-1",
      teacherUserId: "teacher-1",
      weekday: 5,
      startsAt: "12:00",
      endsAt: "13:00",
      reason: null,
      createdAt: "2026-10-08T01:00:00.000Z",
    };
  }
  async removeTeacherUnavailability() {
    return true;
  }
  async listScheduleRooms() {
    return [];
  }
  async createScheduleRoom() {
    return {
      id: "room-1",
      schoolId: "school-1",
      name: "Science Laboratory",
      isLab: true,
      createdAt: "2026-10-08T01:00:00.000Z",
    };
  }
  async removeScheduleRoom() {
    return true;
  }
  async listSubjectScheduleRequirements() {
    return [];
  }
  async setSubjectScheduleRequirement() {
    return {
      subjectId: "subject-1",
      schoolId: "school-1",
      requiredWeeklyMinutes: 300,
      updatedAt: "2026-10-08T01:00:00.000Z",
    };
  }
  async generateSchedulePlan() {
    this.generateCalls += 1;
    return this.nextGeneration;
  }
  async listSchedulePlanPlacements(planId: string) {
    this.placementsCalls.push(planId);
    return this.placements;
  }
  async moveSchedulePlanPlacement() {
    return true;
  }
  async removeSchedulePlanPlacement(planId: string, placementId: string) {
    this.removePlacementCalls.push([planId, placementId]);
    return true;
  }
  async validateSchedulePlan(planId: string) {
    this.validateCalls.push(planId);
    return this.nextViolations;
  }
  async publishSchedulePlan(planId: string) {
    this.publishCalls.push(planId);
    return { outcome: "published" as const, revision: 1, meetingCount: 1 };
  }
  async listPublishedScheduleViews() {
    return null;
  }
  async listSchedulePlans() {
    return [];
  }
  async currentSchedulePlan() {
    return null;
  }
}

describe("SchedulePlanningApplicationService", () => {
  it("generates and returns the plan id alongside its outcome", async () => {
    const repository = new FakeRepository();
    const service = new SchedulePlanningApplicationService(repository);

    const response = await service.generateSchedulePlan();

    expect(repository.generateCalls).toBe(1);
    expect(response.planId).toBe("plan-1");
    expect(response.outcome.outcome).toBe("valid");
  });

  it("reads a plan's placements by its id alone", async () => {
    const repository = new FakeRepository();
    const service = new SchedulePlanningApplicationService(repository);

    await service.listSchedulePlanPlacements("plan-1");

    expect(repository.placementsCalls).toEqual(["plan-1"]);
  });

  it("repairs a placement by plan and placement id", async () => {
    const repository = new FakeRepository();
    const service = new SchedulePlanningApplicationService(repository);

    await service.removeSchedulePlanPlacement("plan-1", "placement-1");

    expect(repository.removePlacementCalls).toEqual([["plan-1", "placement-1"]]);
  });

  it("runs the independent checker on the plan id", async () => {
    const repository = new FakeRepository();
    repository.nextViolations = [
      {
        kind: "teacherConflict",
        teacherName: "Teacher A",
        weekday: 1,
        startsAt: "07:30",
        endsAt: "08:20",
        conflictingStartsAt: "08:00",
        conflictingEndsAt: "08:50",
      },
    ];
    const service = new SchedulePlanningApplicationService(repository);

    const violations = await service.validateSchedulePlan("plan-1");

    expect(repository.validateCalls).toEqual(["plan-1"]);
    expect(violations).toHaveLength(1);
    const [first] = violations;
    if (!first || first.kind !== "teacherConflict") {
      throw new Error("expected a teacherConflict");
    }
    expect(first.teacherName).toBe("Teacher A");
  });

  it("publishes by plan id and reports the outcome as a value", async () => {
    const repository = new FakeRepository();
    const service = new SchedulePlanningApplicationService(repository);

    const outcome = await service.publishSchedulePlan("plan-1");

    expect(repository.publishCalls).toEqual(["plan-1"]);
    expect(outcome).toEqual({ outcome: "published", revision: 1, meetingCount: 1 });
  });
});
