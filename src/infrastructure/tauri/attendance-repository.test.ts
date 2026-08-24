import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  MonthlyAttendanceReport,
} from "../../domain/attendance";
import { TauriAttendanceRepository } from "./attendance-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriAttendanceRepository", () => {
  it("rosterForDate invokes attendance_roster_for_date with sectionId/date (school scope comes from the session)", async () => {
    const roster: AttendanceRosterEntry[] = [
      {
        learnerId: "1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    const result = await new TauriAttendanceRepository().rosterForDate("sec-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("attendance_roster_for_date", {
      sectionId: "sec-1",
      attendanceDate: "2026-08-24",
    });
    expect(result).toEqual(roster);
  });

  it("record invokes record_attendance with sectionId/learnerId/attendanceDate/status", async () => {
    const record: AttendanceRecord = {
      id: "1",
      schoolId: "s1",
      sectionId: "sec-1",
      learnerId: "l1",
      attendanceDate: "2026-08-24",
      status: "present",
      recordedAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(record);

    const result = await new TauriAttendanceRepository().record(
      "sec-1",
      "l1",
      "2026-08-24",
      "present",
    );

    expect(mockInvoke).toHaveBeenCalledWith("record_attendance", {
      sectionId: "sec-1",
      learnerId: "l1",
      attendanceDate: "2026-08-24",
      status: "present",
    });
    expect(result).toEqual(record);
  });

  it("record returns null when the learner or section does not resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriAttendanceRepository().record(
      "sec-1",
      "unknown",
      "2026-08-24",
      "present",
    );

    expect(result).toBeNull();
  });

  it("bulkMarkPresent invokes bulk_mark_attendance_present with sectionId/attendanceDate", async () => {
    const roster: AttendanceRosterEntry[] = [
      {
        learnerId: "1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    const result = await new TauriAttendanceRepository().bulkMarkPresent("sec-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("bulk_mark_attendance_present", {
      sectionId: "sec-1",
      attendanceDate: "2026-08-24",
    });
    expect(result).toEqual(roster);
  });

  it("monthlySummary invokes monthly_attendance_summary with sectionId/year/month (school scope comes from the session)", async () => {
    const report: MonthlyAttendanceReport = {
      year: 2026,
      month: 8,
      schoolDays: [3, 4, 5],
      learners: [],
    };
    mockInvoke.mockResolvedValueOnce(report);

    const result = await new TauriAttendanceRepository().monthlySummary("sec-1", 2026, 8);

    expect(mockInvoke).toHaveBeenCalledWith("monthly_attendance_summary", {
      sectionId: "sec-1",
      year: 2026,
      month: 8,
    });
    expect(result).toEqual(report);
  });
});
