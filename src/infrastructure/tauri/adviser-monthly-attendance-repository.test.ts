import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "./invoke";
import { TauriAdviserMonthlyAttendanceRepository } from "./adviser-monthly-attendance-repository";

vi.mock("./invoke", () => ({ invoke: vi.fn() }));

const mockedInvoke = vi.mocked(invoke);

describe("TauriAdviserMonthlyAttendanceRepository", () => {
  beforeEach(() => mockedInvoke.mockReset());

  it("invokes the trusted monthly preview command", async () => {
    mockedInvoke.mockResolvedValue({ year: 2026, month: 9, schoolDays: [], learners: [] });
    const repo = new TauriAdviserMonthlyAttendanceRepository();
    await repo.summary("section-1", 2026, 9);
    expect(mockedInvoke).toHaveBeenCalledWith("adviser_monthly_attendance_summary", {
      sectionId: "section-1",
      year: 2026,
      month: 9,
    });
  });

  it("invokes the trusted SF2-inspired export command", async () => {
    mockedInvoke.mockResolvedValue({
      filePath: "synthetic.csv",
      disclosure: { populatedFields: [], omittedFields: [] },
    });
    const repo = new TauriAdviserMonthlyAttendanceRepository();
    await repo.exportSf2("section-1", 2026, 9);
    expect(mockedInvoke).toHaveBeenCalledWith("adviser_export_section_monthly_sf2", {
      sectionId: "section-1",
      year: 2026,
      month: 9,
    });
  });
});
