import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf10ExportResult,
  Sf2ExportResult,
} from "../../domain/export";
import { TauriExportRepository } from "./export-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriExportRepository", () => {
  it("exportSectionMonthlySf2 invokes export_section_monthly_sf2 with sectionId/year/month", async () => {
    const result: Sf2ExportResult = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF2_Mabini_2026-08.csv",
      disclosure: {
        populatedFields: ["School Name"],
        omittedFields: [{ field: "School ID (EBEIS)", reason: "not tracked" }],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportSectionMonthlySf2("sec-1", 2026, 8);

    expect(mockInvoke).toHaveBeenCalledWith("export_section_monthly_sf2", {
      sectionId: "sec-1",
      year: 2026,
      month: 8,
    });
    expect(returned).toEqual(result);
  });

  it("returns null when the section could not be resolved within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportSectionMonthlySf2("unknown", 2026, 8);

    expect(result).toBeNull();
  });

  it("exportSchoolMonthlyAttendanceSf4 invokes export_school_monthly_attendance_sf4 with year/month", async () => {
    const result = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF4_Mabini_2026-09.csv",
      disclosure: {
        populatedFields: ["School Name", "Daily Average Attendance"],
        omittedFields: [],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportSchoolMonthlyAttendanceSf4(2026, 9);

    expect(mockInvoke).toHaveBeenCalledWith("export_school_monthly_attendance_sf4", {
      year: 2026,
      month: 9,
    });
    expect(returned).toEqual(result);
  });

  it("exportSchoolMonthlyAttendanceSf4 returns null when the school could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportSchoolMonthlyAttendanceSf4(2026, 9);

    expect(result).toBeNull();
  });

  it("exportSectionEosySf5 invokes export_section_eosy_sf5 with sectionId and schoolYear", async () => {
    const result = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF5_Mabini_2026-2027.csv",
      disclosure: {
        populatedFields: ["School Name", "General Average"],
        omittedFields: [],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportSectionEosySf5("sec-1", "2026-2027");

    expect(mockInvoke).toHaveBeenCalledWith("export_section_eosy_sf5", {
      sectionId: "sec-1",
      schoolYear: "2026-2027",
    });
    expect(returned).toEqual(result);
  });

  it("exportSectionEosySf5 returns null when the section could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportSectionEosySf5("unknown", "2026-2027");

    expect(result).toBeNull();
  });

  it("exportSchoolEosySf6 invokes export_school_eosy_sf6 with schoolYear", async () => {
    const result = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF6_Mabini_2026-2027.csv",
      disclosure: {
        populatedFields: ["School Name", "Promotion Status Summary"],
        omittedFields: [],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportSchoolEosySf6("2026-2027");

    expect(mockInvoke).toHaveBeenCalledWith("export_school_eosy_sf6", {
      schoolYear: "2026-2027",
    });
    expect(returned).toEqual(result);
  });

  it("exportSchoolEosySf6 returns null when the school could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportSchoolEosySf6("2026-2027");

    expect(result).toBeNull();
  });

  it("exportClassRecordReportCard invokes export_class_record_report_card with classRecordId", async () => {
    const result: ReportCardExportResult = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ReportCard_Mabini_Science_1st_Term.csv",
      disclosure: {
        populatedFields: ["School Name"],
        omittedFields: [{ field: "Qualitative Descriptor", reason: "not re-verified" }],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportClassRecordReportCard("cr-1");

    expect(mockInvoke).toHaveBeenCalledWith("export_class_record_report_card", {
      classRecordId: "cr-1",
    });
    expect(returned).toEqual(result);
  });

  it("exportClassRecordReportCard returns null when the class record could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportClassRecordReportCard("unknown");

    expect(result).toBeNull();
  });

  it("exportLearnerRoster invokes export_learner_roster with no arguments", async () => {
    const result: LearnerRosterExportResult = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\LearnerRoster_Rizal_Elementary.csv",
      disclosure: {
        populatedFields: ["Given Name"],
        omittedFields: [{ field: "Birthdate", reason: "not collected" }],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportLearnerRoster();

    expect(mockInvoke).toHaveBeenCalledWith("export_learner_roster");
    expect(returned).toEqual(result);
  });

  it("exportLearnerRoster returns null when the school could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportLearnerRoster();

    expect(result).toBeNull();
  });

  it("exportLearnerPermanentRecordSf10 invokes export_learner_permanent_record_sf10 with learnerId", async () => {
    const result: Sf10ExportResult = {
      filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF10_Dela_Cruz_Juan_123456789012.csv",
      disclosure: {
        populatedFields: ["School Name", "General Average (per year enrolled)"],
        omittedFields: [{ field: "Official DepEd SF10 template", reason: "content-only export" }],
      },
    };
    mockInvoke.mockResolvedValueOnce(result);

    const returned = await new TauriExportRepository().exportLearnerPermanentRecordSf10("l1");

    expect(mockInvoke).toHaveBeenCalledWith("export_learner_permanent_record_sf10", {
      learnerId: "l1",
    });
    expect(returned).toEqual(result);
  });

  it("exportLearnerPermanentRecordSf10 returns null when the learner could not be resolved", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriExportRepository().exportLearnerPermanentRecordSf10("unknown");

    expect(result).toBeNull();
  });
});
