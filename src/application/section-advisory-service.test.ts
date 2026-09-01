import { describe, expect, it, vi } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SectionAdvisoryRepository } from "../domain/ports/section-advisory-repository";
import { SectionAdvisoryApplicationService } from "./section-advisory-service";

function createMockRepository(): SectionAdvisoryRepository {
  return {
    getCurrentAdviser: vi.fn(),
    assignAdviser: vi.fn(),
    endAdviser: vi.fn(),
  };
}

describe("SectionAdvisoryApplicationService", () => {
  describe("getCurrentAdviser", () => {
    it("validates non-empty sectionId and ISO date format", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);

      await expect(service.getCurrentAdviser("", "2026-08-30")).rejects.toThrow(
        new ValidationError("Section is required."),
      );
      await expect(service.getCurrentAdviser("  ", "2026-08-30")).rejects.toThrow(
        new ValidationError("Section is required."),
      );
      await expect(service.getCurrentAdviser("sec-1", "invalid-date")).rejects.toThrow(
        new ValidationError("Date must be in YYYY-MM-DD format."),
      );
    });

    it("passes through valid inputs to repository", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);
      vi.mocked(repo.getCurrentAdviser).mockResolvedValueOnce({
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: null,
        createdAt: "now",
      });

      const result = await service.getCurrentAdviser("  sec-1  ", "2026-08-30");

      expect(repo.getCurrentAdviser).toHaveBeenCalledWith("sec-1", "2026-08-30");
      expect(result).toEqual({
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: null,
        createdAt: "now",
      });
    });
  });

  describe("assignAdviser", () => {
    it("validates non-empty sectionId, teacherUserId, and ISO start date", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);

      await expect(service.assignAdviser("", "teacher-1", "2026-06-01")).rejects.toThrow(
        new ValidationError("Section is required."),
      );
      await expect(service.assignAdviser("sec-1", " ", "2026-06-01")).rejects.toThrow(
        new ValidationError("Teacher is required."),
      );
      await expect(service.assignAdviser("sec-1", "teacher-1", "06/01/2026")).rejects.toThrow(
        new ValidationError("Start date must be in YYYY-MM-DD format."),
      );
    });

    it("delegates valid inputs to repository", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);
      vi.mocked(repo.assignAdviser).mockResolvedValueOnce({
        kind: "assigned",
        advisory: {
          id: "adv-1",
          schoolId: "school-1",
          sectionId: "sec-1",
          teacherUserId: "teacher-1",
          startsOn: "2026-06-01",
          endsOn: null,
          createdAt: "now",
        },
      });

      const outcome = await service.assignAdviser(" sec-1 ", " teacher-1 ", "2026-06-01");

      expect(repo.assignAdviser).toHaveBeenCalledWith("sec-1", "teacher-1", "2026-06-01");
      expect(outcome).toEqual({
        kind: "assigned",
        advisory: {
          id: "adv-1",
          schoolId: "school-1",
          sectionId: "sec-1",
          teacherUserId: "teacher-1",
          startsOn: "2026-06-01",
          endsOn: null,
          createdAt: "now",
        },
      });
    });
  });

  describe("endAdviser", () => {
    it("validates non-empty sectionId, advisoryId, and ISO end date", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);

      await expect(service.endAdviser("", "adv-1", "2026-08-30")).rejects.toThrow(
        new ValidationError("Section is required."),
      );
      await expect(service.endAdviser("sec-1", " ", "2026-08-30")).rejects.toThrow(
        new ValidationError("Advisory is required."),
      );
      await expect(service.endAdviser("sec-1", "adv-1", "2026/08/30")).rejects.toThrow(
        new ValidationError("End date must be in YYYY-MM-DD format."),
      );
    });

    it("delegates valid inputs to repository", async () => {
      const repo = createMockRepository();
      const service = new SectionAdvisoryApplicationService(repo);
      vi.mocked(repo.endAdviser).mockResolvedValueOnce({
        kind: "ended",
        advisory: {
          id: "adv-1",
          schoolId: "school-1",
          sectionId: "sec-1",
          teacherUserId: "teacher-1",
          startsOn: "2026-06-01",
          endsOn: "2026-08-30",
          createdAt: "now",
        },
      });

      const outcome = await service.endAdviser(" sec-1 ", " adv-1 ", "2026-08-30");

      expect(repo.endAdviser).toHaveBeenCalledWith("sec-1", "adv-1", "2026-08-30");
      expect(outcome).toEqual({
        kind: "ended",
        advisory: {
          id: "adv-1",
          schoolId: "school-1",
          sectionId: "sec-1",
          teacherUserId: "teacher-1",
          startsOn: "2026-06-01",
          endsOn: "2026-08-30",
          createdAt: "now",
        },
      });
    });
  });
});
