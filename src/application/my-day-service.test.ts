import { describe, expect, it } from "vitest";
import type { MyDaySummary } from "../domain/my-day";
import type { MyDayRepository } from "../domain/ports/my-day-repository";
import { MyDayApplicationService } from "./my-day-service";

const SUMMARY: MyDaySummary = {
  schedule: [
    {
      teachingAssignmentId: "ta-1",
      subjectName: "Mathematics",
      sectionName: "Mabini",
      startsAt: "08:00",
      endsAt: "08:50",
      room: "Room 101",
    },
  ],
  pendingAttendance: [
    { teachingAssignmentId: "ta-1", subjectName: "Mathematics", sectionName: "Mabini" },
  ],
  pendingConflicts: [{ id: "c-1", entityKind: "learner" }],
};

class FakeMyDayRepository implements MyDayRepository {
  calls: Array<[number, string]> = [];
  result: MyDaySummary | "reject" = SUMMARY;

  async getSummary(todayWeekday: number, todayDate: string): Promise<MyDaySummary> {
    this.calls.push([todayWeekday, todayDate]);
    if (this.result === "reject") {
      throw new Error("could not load My Day");
    }
    return this.result;
  }
}

describe("MyDayApplicationService", () => {
  it("reads the signed-in teacher's own My Day summary for the given day", async () => {
    const repo = new FakeMyDayRepository();
    const service = new MyDayApplicationService(repo);

    const result = await service.getSummary(3, "2026-09-09");

    expect(repo.calls).toEqual([[3, "2026-09-09"]]);
    expect(result).toEqual(SUMMARY);
  });

  it("propagates a thrown rejection from the repository", async () => {
    const repo = new FakeMyDayRepository();
    repo.result = "reject";
    const service = new MyDayApplicationService(repo);

    await expect(service.getSummary(3, "2026-09-09")).rejects.toThrow("could not load My Day");
  });
});
