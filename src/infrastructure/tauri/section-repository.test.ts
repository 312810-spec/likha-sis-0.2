import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { Section, SectionMembership, SectionRosterMember } from "../../domain/section";
import { TauriSectionRepository } from "./section-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSectionRepository", () => {
  it("list invokes list_sections_by_school with no arguments (scope comes from the session)", async () => {
    const sections: Section[] = [
      {
        id: "sec-1",
        schoolId: "s1",
        schoolYear: "2025-2026",
        gradeLevel: "7",
        name: "Mabini",
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(sections);

    const result = await new TauriSectionRepository().list();

    expect(mockInvoke).toHaveBeenCalledWith("list_sections_by_school");
    expect(result).toEqual(sections);
  });

  it("create invokes create_section with schoolYear/gradeLevel/name", async () => {
    const section: Section = {
      id: "sec-1",
      schoolId: "s1",
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(section);

    const result = await new TauriSectionRepository().create("2025-2026", "7", "Mabini");

    expect(mockInvoke).toHaveBeenCalledWith("create_section", {
      schoolYear: "2025-2026",
      gradeLevel: "7",
      name: "Mabini",
    });
    expect(result).toEqual(section);
  });

  it("enroll invokes enroll_learner_in_section with sectionId/learnerId/startsOn", async () => {
    const membership: SectionMembership = {
      id: "mem-1",
      schoolId: "s1",
      sectionId: "sec-1",
      learnerId: "l1",
      startsOn: "2026-08-01",
      endsOn: null,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(membership);

    const result = await new TauriSectionRepository().enroll("sec-1", "l1", "2026-08-01");

    expect(mockInvoke).toHaveBeenCalledWith("enroll_learner_in_section", {
      sectionId: "sec-1",
      learnerId: "l1",
      startsOn: "2026-08-01",
    });
    expect(result).toEqual(membership);
  });

  it("enroll returns null when the section or learner does not resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriSectionRepository().enroll("sec-1", "unknown", "2026-08-01");

    expect(result).toBeNull();
  });

  it("roster invokes section_roster with sectionId/asOfDate", async () => {
    const roster: SectionRosterMember[] = [
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: "123456789012",
        startsOn: "2026-08-01",
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    const result = await new TauriSectionRepository().roster("sec-1", "2026-08-24");

    expect(mockInvoke).toHaveBeenCalledWith("section_roster", {
      sectionId: "sec-1",
      asOfDate: "2026-08-24",
    });
    expect(result).toEqual(roster);
  });
});
