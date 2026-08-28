import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { Sf1GenerationResult, Sf9GenerationResult } from "../../domain/form-generation";
import { TauriFormGenerationRepository } from "./form-generation-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriFormGenerationRepository", () => {
  it("generateSf1 invokes generate_sf1_form with sectionId/asOfDate", async () => {
    const result: Sf1GenerationResult = {
      outputPath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF1_2026-2027_7_Mabini.xlsx",
      learnerCount: 30,
      templateFormType: "SF1",
      templateVersion: "synthetic-v1",
    };
    mockInvoke.mockResolvedValueOnce(result);

    const got = await new TauriFormGenerationRepository().generateSf1("sec-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("generate_sf1_form", {
      sectionId: "sec-1",
      asOfDate: "2026-08-24",
    });
    expect(got).toEqual(result);
  });

  it("generateSf1 resolves null when the section does not resolve in the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const got = await new TauriFormGenerationRepository().generateSf1("sec-gone", "2026-08-24");

    expect(got).toBeNull();
  });

  it("generateSf9 invokes generate_sf9_form with sectionId/learnerId/asOfDate", async () => {
    const result: Sf9GenerationResult = {
      outputPath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\SF9_2026-2027_Mabini_Cruz_Ana.xlsx",
      subjectCount: 6,
      templateFormType: "SF9",
      templateVersion: "synthetic-v1",
    };
    mockInvoke.mockResolvedValueOnce(result);

    const got = await new TauriFormGenerationRepository().generateSf9("sec-1", "l-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("generate_sf9_form", {
      sectionId: "sec-1",
      learnerId: "l-1",
      asOfDate: "2026-08-24",
    });
    expect(got).toEqual(result);
  });

  it("generateSf9 resolves null when the learner is not an active member", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const got = await new TauriFormGenerationRepository().generateSf9(
      "sec-1",
      "l-not-here",
      "2026-08-24",
    );

    expect(got).toBeNull();
  });
});
