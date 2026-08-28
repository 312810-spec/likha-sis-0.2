import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../domain/form-generation";
import type { FormGenerationRepository } from "../domain/ports/form-generation-repository";
import { FormGenerationApplicationService } from "./form-generation-service";

class FakeFormGenerationRepository implements FormGenerationRepository {
  sf1Calls: Array<{ sectionId: string; asOfDate: string }> = [];
  sf9Calls: Array<{ sectionId: string; learnerId: string; asOfDate: string }> = [];
  sf1ToReturn: Sf1GenerationResult | null = null;
  sf9ToReturn: Sf9GenerationResult | null = null;

  async generateSf1(sectionId: string, asOfDate: string): Promise<Sf1GenerationResult | null> {
    this.sf1Calls.push({ sectionId, asOfDate });
    return this.sf1ToReturn;
  }

  async generateSf9(
    sectionId: string,
    learnerId: string,
    asOfDate: string,
  ): Promise<Sf9GenerationResult | null> {
    this.sf9Calls.push({ sectionId, learnerId, asOfDate });
    return this.sf9ToReturn;
  }
}

describe("FormGenerationApplicationService", () => {
  describe("generateSf1", () => {
    it("generates with a trimmed section id and a well-formed date", async () => {
      const repo = new FakeFormGenerationRepository();
      repo.sf1ToReturn = {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF1.xlsx",
        learnerCount: 12,
        templateFormType: "SF1",
        templateVersion: "synthetic-v1",
      };
      const service = new FormGenerationApplicationService(repo);

      const result = await service.generateSf1(" sec-1 ", "2026-08-24");

      expect(result).toEqual(repo.sf1ToReturn);
      expect(repo.sf1Calls).toEqual([{ sectionId: "sec-1", asOfDate: "2026-08-24" }]);
    });

    it("passes a null result through unchanged (a stale or foreign section)", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      const result = await service.generateSf1("sec-1", "2026-08-24");

      expect(result).toBeNull();
    });

    it("rejects an empty section id without calling the repository", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      await expect(service.generateSf1("  ", "2026-08-24")).rejects.toBeInstanceOf(ValidationError);
      expect(repo.sf1Calls).toEqual([]);
    });

    it("rejects a malformed date without calling the repository", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      await expect(service.generateSf1("sec-1", "08/24/2026")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(repo.sf1Calls).toEqual([]);
    });
  });

  describe("generateSf9", () => {
    it("generates with trimmed ids and a well-formed date", async () => {
      const repo = new FakeFormGenerationRepository();
      repo.sf9ToReturn = {
        outputPath: "C:\\Documents\\LIKHA-SIS\\SF9.xlsx",
        subjectCount: 6,
        templateFormType: "SF9",
        templateVersion: "synthetic-v1",
      };
      const service = new FormGenerationApplicationService(repo);

      const result = await service.generateSf9(" sec-1 ", " l-1 ", "2026-08-24");

      expect(result).toEqual(repo.sf9ToReturn);
      expect(repo.sf9Calls).toEqual([
        { sectionId: "sec-1", learnerId: "l-1", asOfDate: "2026-08-24" },
      ]);
    });

    it("passes a null result through unchanged (foreign ids or an inactive membership)", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      const result = await service.generateSf9("sec-1", "l-1", "2026-08-24");

      expect(result).toBeNull();
    });

    it("rejects an empty learner id without calling the repository", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      await expect(service.generateSf9("sec-1", "  ", "2026-08-24")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(repo.sf9Calls).toEqual([]);
    });

    it("rejects a malformed date without calling the repository", async () => {
      const repo = new FakeFormGenerationRepository();
      const service = new FormGenerationApplicationService(repo);

      await expect(service.generateSf9("sec-1", "l-1", "24-08-2026")).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(repo.sf9Calls).toEqual([]);
    });
  });
});
