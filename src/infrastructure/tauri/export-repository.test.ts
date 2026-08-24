import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { ReportCardExportResult, Sf2ExportResult } from "../../domain/export";
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
});
