import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { Sf1ImportPreview, Sf1ImportSummary } from "../../domain/sf1-import";
import { TauriSf1ImportRepository } from "./sf1-import-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSf1ImportRepository", () => {
  it("preview invokes preview_sf1_import with only the file path", async () => {
    const preview: Sf1ImportPreview = {
      rows: [],
      newRows: [],
      exactMatches: [],
      needsReview: [],
      errors: [],
      warnings: [],
    };
    mockInvoke.mockResolvedValueOnce(preview);

    const result = await new TauriSf1ImportRepository().preview("C:\\sf1.xls");

    expect(mockInvoke).toHaveBeenCalledWith("preview_sf1_import", { filePath: "C:\\sf1.xls" });
    expect(result).toEqual(preview);
  });

  it("commit invokes commit_sf1_import with sectionId, startsOn, and the plan array -- never a schoolId", async () => {
    const summary: Sf1ImportSummary = {
      rowsCommitted: 1,
      newLearnersCreated: 1,
      existingLearnersEnrolled: 0,
    };
    mockInvoke.mockResolvedValueOnce(summary);
    const plans = [
      {
        rowNumber: 4,
        givenName: "Ana",
        familyName: "Dela Cruz",
        lrn: null,
        sex: null,
        action: "createNewLearner" as const,
      },
    ];

    const result = await new TauriSf1ImportRepository().commit("sec-1", "2026-06-01", plans);

    expect(mockInvoke).toHaveBeenCalledWith("commit_sf1_import", {
      sectionId: "sec-1",
      startsOn: "2026-06-01",
      plans,
    });
    const [, args] = mockInvoke.mock.calls.find(([command]) => command === "commit_sf1_import")!;
    expect(args).not.toHaveProperty("schoolId");
    expect(result).toEqual(summary);
  });
});
