import { describe, expect, it, vi } from "vitest";
import { AdviserMonthlyAttendanceApplicationService } from "./adviser-monthly-attendance-service";
import type { AdviserMonthlyAttendanceRepository } from "../domain/ports/adviser-monthly-attendance-repository";

function repository(): AdviserMonthlyAttendanceRepository {
  return {
    summary: vi.fn().mockResolvedValue({ year: 2026, month: 9, schoolDays: [], learners: [] }),
    exportSf2: vi.fn().mockResolvedValue({
      filePath: "synthetic.csv",
      disclosure: { populatedFields: [], omittedFields: [] },
    }),
  };
}

describe("AdviserMonthlyAttendanceApplicationService", () => {
  it("normalizes section id and delegates a valid monthly preview", async () => {
    const repo = repository();
    const service = new AdviserMonthlyAttendanceApplicationService(repo);
    await service.summary(" section-1 ", 2026, 9);
    expect(repo.summary).toHaveBeenCalledWith("section-1", 2026, 9);
  });

  it("rejects an invalid month before native invocation", async () => {
    const repo = repository();
    const service = new AdviserMonthlyAttendanceApplicationService(repo);
    await expect(service.summary("section-1", 2026, 13)).rejects.toThrow(
      "Month must be from 1 to 12.",
    );
    expect(repo.summary).not.toHaveBeenCalled();
  });

  it("delegates SF2-inspired export without changing its disclosure", async () => {
    const repo = repository();
    const service = new AdviserMonthlyAttendanceApplicationService(repo);
    const result = await service.exportSf2("section-1", 2026, 9);
    expect(repo.exportSf2).toHaveBeenCalledWith("section-1", 2026, 9);
    expect(result.disclosure).toEqual({ populatedFields: [], omittedFields: [] });
  });
});
