import { describe, expect, it, vi } from "vitest";
import type { SchoolDayAttendanceTotals } from "../../domain/attendance";
import { invoke } from "./invoke";
import { TauriSchoolAttendanceRepository } from "./school-attendance-repository";

vi.mock("./invoke", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchoolAttendanceRepository", () => {
  it("dayTotals invokes school_attendance_day_totals with the date and returns its result", async () => {
    const totals: SchoolDayAttendanceTotals = { present: 42, absent: 3, tardy: 1 };
    mockInvoke.mockResolvedValueOnce(totals);

    const result = await new TauriSchoolAttendanceRepository().dayTotals("2026-09-03");

    expect(mockInvoke).toHaveBeenCalledWith("school_attendance_day_totals", {
      date: "2026-09-03",
    });
    expect(result).toEqual(totals);
  });
});
