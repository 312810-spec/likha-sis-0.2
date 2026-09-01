import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSectionAdvisoryRepository } from "./section-advisory-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("TauriSectionAdvisoryRepository", () => {
  it("fetches the current section adviser via current_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      id: "adv-1",
      schoolId: "school-1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "2026-06-01T00:00:00Z",
    });

    const result = await new TauriSectionAdvisoryRepository().getCurrentAdviser(
      "sec-1",
      "2026-08-30",
    );

    expect(mockInvoke).toHaveBeenCalledWith("current_section_adviser", {
      sectionId: "sec-1",
      asOfDate: "2026-08-30",
    });
    expect(result).toEqual({
      id: "adv-1",
      schoolId: "school-1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
      endsOn: null,
      createdAt: "2026-06-01T00:00:00Z",
    });
  });

  it("assigns a section adviser via assign_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: "assigned",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: null,
        createdAt: "2026-06-01T00:00:00Z",
      },
    });

    const result = await new TauriSectionAdvisoryRepository().assignAdviser(
      "sec-1",
      "teacher-1",
      "2026-06-01",
    );

    expect(mockInvoke).toHaveBeenCalledWith("assign_section_adviser", {
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-06-01",
    });
    expect(result).toEqual({
      kind: "assigned",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: null,
        createdAt: "2026-06-01T00:00:00Z",
      },
    });
  });

  it("ends a section adviser assignment via end_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: "ended",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: "2026-08-30",
        createdAt: "2026-06-01T00:00:00Z",
      },
    });

    const result = await new TauriSectionAdvisoryRepository().endAdviser(
      "sec-1",
      "adv-1",
      "2026-08-30",
    );

    expect(mockInvoke).toHaveBeenCalledWith("end_section_adviser", {
      sectionId: "sec-1",
      advisoryId: "adv-1",
      endsOn: "2026-08-30",
    });
    expect(result).toEqual({
      kind: "ended",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-06-01",
        endsOn: "2026-08-30",
        createdAt: "2026-06-01T00:00:00Z",
      },
    });
  });
});
