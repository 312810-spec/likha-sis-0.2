import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AttendanceRecord, AttendanceRosterEntry } from "../../domain/attendance";
import { TauriAdviserDailyAttendanceRepository } from "./adviser-daily-attendance-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("TauriAdviserDailyAttendanceRepository", () => {
  it("uses the adviser-authorized roster command", async () => {
    const roster: AttendanceRosterEntry[] = [
      {
        learnerId: "learner-1",
        givenName: "Ana",
        familyName: "Cruz",
        status: null,
        recordedAt: null,
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    await expect(
      new TauriAdviserDailyAttendanceRepository().rosterForDate("sec-1", "2026-08-29"),
    ).resolves.toEqual(roster);

    expect(mockInvoke).toHaveBeenCalledWith("adviser_attendance_roster_for_date", {
      sectionId: "sec-1",
      attendanceDate: "2026-08-29",
    });
  });

  it("uses the adviser-authorized record command", async () => {
    const record: AttendanceRecord = {
      id: "attendance-1",
      schoolId: "school-1",
      sectionId: "sec-1",
      learnerId: "learner-1",
      attendanceDate: "2026-08-29",
      status: "absent",
      recordedAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(record);

    await expect(
      new TauriAdviserDailyAttendanceRepository().record(
        "sec-1",
        "learner-1",
        "2026-08-29",
        "absent",
      ),
    ).resolves.toEqual(record);

    expect(mockInvoke).toHaveBeenCalledWith("adviser_record_attendance", {
      sectionId: "sec-1",
      learnerId: "learner-1",
      attendanceDate: "2026-08-29",
      status: "absent",
    });
  });

  it("uses the adviser-authorized non-overwriting bulk command", async () => {
    mockInvoke.mockResolvedValueOnce([]);

    await new TauriAdviserDailyAttendanceRepository().bulkMarkPresent("sec-1", "2026-08-29");

    expect(mockInvoke).toHaveBeenCalledWith("adviser_bulk_mark_attendance_present", {
      sectionId: "sec-1",
      attendanceDate: "2026-08-29",
    });
  });
});
