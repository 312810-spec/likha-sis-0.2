import { describe, expect, it } from "vitest";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
} from "../domain/attendance";
import { ValidationError } from "../domain/errors";
import type { AdviserDailyAttendanceRepository } from "../domain/ports/adviser-daily-attendance-repository";
import { AdviserDailyAttendanceApplicationService } from "./adviser-daily-attendance-service";

class FakeAdviserDailyAttendanceRepository implements AdviserDailyAttendanceRepository {
  calls: Array<readonly unknown[]> = [];

  async rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    this.calls.push(["roster", sectionId, attendanceDate]);
    return [];
  }

  async record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    this.calls.push(["record", sectionId, learnerId, attendanceDate, status]);
    return null;
  }

  async bulkMarkPresent(sectionId: string, attendanceDate: string) {
    this.calls.push(["bulk", sectionId, attendanceDate]);
    return [];
  }
}

const NOW = () => new Date(2026, 7, 29, 12);

describe("AdviserDailyAttendanceApplicationService", () => {
  it("delegates only daily adviser attendance operations with trimmed identifiers", async () => {
    const repository = new FakeAdviserDailyAttendanceRepository();
    const service = new AdviserDailyAttendanceApplicationService(repository, NOW);

    await service.rosterForDate(" sec-1 ", "2026-08-29");
    await service.recordAttendance(" sec-1 ", " learner-1 ", "2026-08-29", "absent");
    await service.bulkMarkPresent(" sec-1 ", "2026-08-29");

    expect(repository.calls).toEqual([
      ["roster", "sec-1", "2026-08-29"],
      ["record", "sec-1", "learner-1", "2026-08-29", "absent"],
      ["bulk", "sec-1", "2026-08-29"],
    ]);
  });

  it("rejects future attendance before the repository is called", async () => {
    const repository = new FakeAdviserDailyAttendanceRepository();
    const service = new AdviserDailyAttendanceApplicationService(repository, NOW);

    await expect(service.rosterForDate("sec-1", "2026-08-30")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      service.recordAttendance("sec-1", "learner-1", "2026-08-30", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(service.bulkMarkPresent("sec-1", "2026-08-30")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repository.calls).toEqual([]);
  });

  it("rejects missing section/learner identifiers and malformed dates", async () => {
    const repository = new FakeAdviserDailyAttendanceRepository();
    const service = new AdviserDailyAttendanceApplicationService(repository, NOW);

    await expect(service.rosterForDate(" ", "2026-08-29")).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.recordAttendance("sec-1", " ", "2026-08-29", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(service.bulkMarkPresent("sec-1", "08/29/2026")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repository.calls).toEqual([]);
  });
});
