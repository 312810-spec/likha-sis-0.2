import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
} from "../domain/export";
import type { ExportRepository } from "../domain/ports/export-repository";
import { ExportApplicationService } from "./export-service";

class FakeExportRepository implements ExportRepository {
  calls: Array<{ sectionId: string; year: number; month: number }> = [];
  resultToReturn: Sf2ExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF2_Mabini_2026-08.csv",
    disclosure: { populatedFields: [], omittedFields: [] },
  };

  async exportSectionMonthlySf2(
    sectionId: string,
    year: number,
    month: number,
  ): Promise<Sf2ExportResult | null> {
    this.calls.push({ sectionId, year, month });
    return this.resultToReturn;
  }

  sf5Calls: Array<{ sectionId: string; schoolYear: string }> = [];
  sf5ResultToReturn: Sf5ExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF5_Mabini_2026-2027.csv",
    disclosure: { populatedFields: [], omittedFields: [] },
  };

  async exportSectionEosySf5(
    sectionId: string,
    schoolYear: string,
  ): Promise<Sf5ExportResult | null> {
    this.sf5Calls.push({ sectionId, schoolYear });
    return this.sf5ResultToReturn;
  }

  reportCardCalls: Array<{ classRecordId: string }> = [];
  reportCardResultToReturn: ReportCardExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ReportCard_Mabini_Science_1st_Term.csv",
    disclosure: { populatedFields: [], omittedFields: [] },
  };

  async exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    this.reportCardCalls.push({ classRecordId });
    return this.reportCardResultToReturn;
  }

  learnerRosterCalls = 0;
  learnerRosterResultToReturn: LearnerRosterExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\LearnerRoster_Rizal_Elementary.csv",
    disclosure: { populatedFields: [], omittedFields: [] },
  };

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    this.learnerRosterCalls += 1;
    return this.learnerRosterResultToReturn;
  }
}

describe("ExportApplicationService", () => {
  it("exports with a trimmed section id", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    const result = await service.exportSectionMonthlySf2(" sec-1 ", 2026, 8);

    expect(result).toBe(repo.resultToReturn);
    expect(repo.calls).toEqual([{ sectionId: "sec-1", year: 2026, month: 8 }]);
  });

  it("rejects an empty section id without calling the repository", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    await expect(service.exportSectionMonthlySf2("  ", 2026, 8)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("rejects a month outside 1-12 without calling the repository", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    await expect(service.exportSectionMonthlySf2("sec-1", 2026, 13)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.exportSectionMonthlySf2("sec-1", 2026, 0)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("rejects a year out of range without calling the repository", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    await expect(service.exportSectionMonthlySf2("sec-1", 1999, 8)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.calls).toEqual([]);
  });

  it("returns null when the section could not be resolved", async () => {
    const repo = new FakeExportRepository();
    repo.resultToReturn = null;
    const service = new ExportApplicationService(repo);

    const result = await service.exportSectionMonthlySf2("sec-1", 2026, 8);

    expect(result).toBeNull();
  });

  it("exportSectionEosySf5 delegates to the repository with trimmed arguments", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    const result = await service.exportSectionEosySf5(" sec-1 ", " 2026-2027 ");

    expect(result).toEqual(repo.sf5ResultToReturn);
    expect(repo.sf5Calls).toEqual([{ sectionId: "sec-1", schoolYear: "2026-2027" }]);
  });

  it("exportSectionEosySf5 rejects an empty section id or school year", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    await expect(service.exportSectionEosySf5("  ", "2026-2027")).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.exportSectionEosySf5("sec-1", "  ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.sf5Calls).toEqual([]);
  });

  it("exportSectionEosySf5 returns null when the section could not be resolved", async () => {
    const repo = new FakeExportRepository();
    repo.sf5ResultToReturn = null;
    const service = new ExportApplicationService(repo);

    const result = await service.exportSectionEosySf5("sec-1", "2026-2027");

    expect(result).toBeNull();
  });

  it("exportClassRecordReportCard delegates to the repository with a trimmed id", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    const result = await service.exportClassRecordReportCard(" cr-1 ");

    expect(result).toEqual(repo.reportCardResultToReturn);
    expect(repo.reportCardCalls).toEqual([{ classRecordId: "cr-1" }]);
  });

  it("exportClassRecordReportCard rejects an empty class record id", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    await expect(service.exportClassRecordReportCard("  ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.reportCardCalls).toEqual([]);
  });

  it("exportClassRecordReportCard returns null when the class record could not be resolved", async () => {
    const repo = new FakeExportRepository();
    repo.reportCardResultToReturn = null;
    const service = new ExportApplicationService(repo);

    const result = await service.exportClassRecordReportCard("cr-1");

    expect(result).toBeNull();
  });

  it("exportLearnerRoster delegates to the repository", async () => {
    const repo = new FakeExportRepository();
    const service = new ExportApplicationService(repo);

    const result = await service.exportLearnerRoster();

    expect(result).toEqual(repo.learnerRosterResultToReturn);
    expect(repo.learnerRosterCalls).toBe(1);
  });

  it("exportLearnerRoster returns null when the school could not be resolved", async () => {
    const repo = new FakeExportRepository();
    repo.learnerRosterResultToReturn = null;
    const service = new ExportApplicationService(repo);

    const result = await service.exportLearnerRoster();

    expect(result).toBeNull();
  });
});
