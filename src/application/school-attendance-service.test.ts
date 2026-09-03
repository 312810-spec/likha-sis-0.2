import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolDayAttendanceTotals } from "../domain/attendance";
import type { SchoolAttendanceRepository } from "../domain/ports/school-attendance-repository";
import { SchoolAttendanceApplicationService } from "./school-attendance-service";

function fakeRepo() {
  return {
    dayTotals: vi.fn<SchoolAttendanceRepository["dayTotals"]>(),
  };
}

describe("SchoolAttendanceApplicationService", () => {
  it("passes a valid date through to the repository and returns its value", async () => {
    const repo = fakeRepo();
    const totals: SchoolDayAttendanceTotals = { present: 100, absent: 5, tardy: 2 };
    repo.dayTotals.mockResolvedValueOnce(totals);

    const service = new SchoolAttendanceApplicationService(repo);
    const result = await service.dayTotals("2026-09-03");

    expect(repo.dayTotals).toHaveBeenCalledWith("2026-09-03");
    expect(result).toEqual(totals);
  });

  it("trims surrounding whitespace before calling the repository", async () => {
    const repo = fakeRepo();
    repo.dayTotals.mockResolvedValueOnce({ present: 0, absent: 0, tardy: 0 });

    await new SchoolAttendanceApplicationService(repo).dayTotals("  2026-09-03  ");

    expect(repo.dayTotals).toHaveBeenCalledWith("2026-09-03");
  });

  it.each(["", "nope", "2026-9-3"])(
    "rejects the malformed date %j without calling the repository",
    async (bad) => {
      const repo = fakeRepo();
      const service = new SchoolAttendanceApplicationService(repo);

      await expect(service.dayTotals(bad)).rejects.toBeInstanceOf(ValidationError);
      expect(repo.dayTotals).not.toHaveBeenCalled();
    },
  );
});
