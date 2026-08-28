import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
  MonthlyAttendanceReport,
} from "../domain/attendance";
import type { AttendanceRepository } from "../domain/ports/attendance-repository";
import { AttendanceApplicationService } from "./attendance-service";

class FakeAttendanceRepository implements AttendanceRepository {
  records = new Map<string, AttendanceRecord>();
  recordCalls: Array<{
    sectionId: string;
    learnerId: string;
    attendanceDate: string;
    status: AttendanceStatus;
  }> = [];
  rosterForDateCalls: Array<{ sectionId: string; attendanceDate: string }> = [];
  rosterToReturn: AttendanceRosterEntry[] = [];
  bulkMarkPresentCalls: Array<{ sectionId: string; attendanceDate: string }> = [];
  bulkMarkPresentToReturn: AttendanceRosterEntry[] = [];
  monthlySummaryCalls: Array<{ sectionId: string; year: number; month: number }> = [];
  monthlySummaryToReturn: MonthlyAttendanceReport = {
    year: 2026,
    month: 8,
    schoolDays: [],
    learners: [],
  };

  async rosterForDate(sectionId: string, attendanceDate: string): Promise<AttendanceRosterEntry[]> {
    this.rosterForDateCalls.push({ sectionId, attendanceDate });
    return this.rosterToReturn;
  }

  async monthlySummary(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<MonthlyAttendanceReport> {
    this.monthlySummaryCalls.push({ sectionId, year, month });
    return this.monthlySummaryToReturn;
  }

  async record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    this.recordCalls.push({ sectionId, learnerId, attendanceDate, status });
    const record: AttendanceRecord = {
      id: `attendance-${this.records.size + 1}`,
      schoolId: "current-session-school",
      sectionId,
      learnerId,
      attendanceDate,
      status,
      recordedAt: "now",
    };
    this.records.set(`${learnerId}:${attendanceDate}`, record);
    return record;
  }

  async bulkMarkPresent(
    sectionId: string,
    attendanceDate: string,
  ): Promise<AttendanceRosterEntry[]> {
    this.bulkMarkPresentCalls.push({ sectionId, attendanceDate });
    return this.bulkMarkPresentToReturn;
  }
}

function serviceWithToday(today: string): AttendanceApplicationService {
  return new AttendanceApplicationService(
    new FakeAttendanceRepository(),
    () => new Date(`${today}T12:00:00`),
  );
}

const FIXED_NOW = () => new Date(2026, 7, 24, 12);

describe("AttendanceApplicationService", () => {
  it("records attendance for a well-formed present-or-past date", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    const record = await service.recordAttendance("sec-1", "learner-1", "2026-08-24", "present");

    expect(record).toMatchObject({ sectionId: "sec-1", learnerId: "learner-1", status: "present" });
    expect(repo.recordCalls).toEqual([
      {
        sectionId: "sec-1",
        learnerId: "learner-1",
        attendanceDate: "2026-08-24",
        status: "present",
      },
    ]);
  });

  it("rejects an empty section id without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(
      service.recordAttendance("  ", "learner-1", "2026-08-24", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects an empty learner id without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(
      service.recordAttendance("sec-1", "  ", "2026-08-24", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a malformed date without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(
      service.recordAttendance("sec-1", "learner-1", "08/24/2026", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a future date without calling the repository", async () => {
    const service = serviceWithToday("2026-08-24");

    await expect(
      service.recordAttendance("sec-1", "learner-1", "2026-08-25", "present"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an unrecognized status without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(
      service.recordAttendance(
        "sec-1",
        "learner-1",
        "2026-08-24",
        "excused" as unknown as AttendanceStatus,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.recordCalls).toEqual([]);
  });

  it("rosterForDate delegates to the repository and returns its result", async () => {
    const repo = new FakeAttendanceRepository();
    repo.rosterToReturn = [
      {
        learnerId: "learner-1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ];
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    const roster = await service.rosterForDate("sec-1", "2026-08-24");

    expect(repo.rosterForDateCalls).toEqual([{ sectionId: "sec-1", attendanceDate: "2026-08-24" }]);
    expect(roster).toBe(repo.rosterToReturn);
  });

  it("rosterForDate rejects an empty section id without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.rosterForDate(" ", "2026-08-24")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.rosterForDateCalls).toEqual([]);
  });

  it("bulkMarkPresent delegates to the repository and returns its result", async () => {
    const repo = new FakeAttendanceRepository();
    repo.bulkMarkPresentToReturn = [
      {
        learnerId: "learner-1",
        givenName: "Ana",
        familyName: "Santos",
        status: "present",
        recordedAt: "now",
      },
    ];
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    const roster = await service.bulkMarkPresent("sec-1", "2026-08-24");

    expect(repo.bulkMarkPresentCalls).toEqual([
      { sectionId: "sec-1", attendanceDate: "2026-08-24" },
    ]);
    expect(roster).toBe(repo.bulkMarkPresentToReturn);
  });

  it("bulkMarkPresent rejects an empty section id without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.bulkMarkPresent(" ", "2026-08-24")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.bulkMarkPresentCalls).toEqual([]);
  });

  it("bulkMarkPresent rejects a malformed date without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.bulkMarkPresent("sec-1", "08/24/2026")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.bulkMarkPresentCalls).toEqual([]);
  });

  it("bulkMarkPresent rejects a future date without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.bulkMarkPresent("sec-1", "2026-08-25")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.bulkMarkPresentCalls).toEqual([]);
  });

  it("monthlySummary delegates to the repository for a past-or-current month", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    const report = await service.monthlySummary("sec-1", 2026, 8);

    expect(repo.monthlySummaryCalls).toEqual([{ sectionId: "sec-1", year: 2026, month: 8 }]);
    expect(report).toBe(repo.monthlySummaryToReturn);
  });

  it("allows the current in-progress month", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, () => new Date(2026, 7, 1, 12));

    await expect(service.monthlySummary("sec-1", 2026, 8)).resolves.toBe(
      repo.monthlySummaryToReturn,
    );
  });

  it("rejects a future month without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.monthlySummary("sec-1", 2026, 9)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.monthlySummaryCalls).toEqual([]);
  });

  it("rejects a future year without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.monthlySummary("sec-1", 2027, 1)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.monthlySummaryCalls).toEqual([]);
  });

  it("rejects a month outside 1-12 without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.monthlySummary("sec-1", 2026, 13)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.monthlySummary("sec-1", 2026, 0)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.monthlySummaryCalls).toEqual([]);
  });

  it("rejects an empty section id for monthlySummary without calling the repository", async () => {
    const repo = new FakeAttendanceRepository();
    const service = new AttendanceApplicationService(repo, FIXED_NOW);

    await expect(service.monthlySummary("  ", 2026, 8)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.monthlySummaryCalls).toEqual([]);
  });
});
