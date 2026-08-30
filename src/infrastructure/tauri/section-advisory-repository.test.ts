import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSectionAdvisoryRepository } from "./section-advisory-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("TauriSectionAdvisoryRepository", () => {
  it("reads the current adviser via current_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      id: "adv-1",
      schoolId: "school-1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-08-01",
      endsOn: null,
      createdAt: "now",
    });

    const result = await new TauriSectionAdvisoryRepository().currentAdviser("sec-1", "2026-08-30");

    expect(mockInvoke).toHaveBeenCalledWith("current_section_adviser", {
      sectionId: "sec-1",
      asOfDate: "2026-08-30",
    });
    expect(result).toEqual({
      id: "adv-1",
      schoolId: "school-1",
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-08-01",
      endsOn: null,
      createdAt: "now",
    });
  });

  it("returns null when no adviser is currently active", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriSectionAdvisoryRepository().currentAdviser("sec-1", "2026-08-30");

    expect(result).toBeNull();
  });

  it("assigns an adviser via assign_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: "assigned",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-08-01",
        endsOn: null,
        createdAt: "now",
      },
    });

    const result = await new TauriSectionAdvisoryRepository().assign(
      "sec-1",
      "teacher-1",
      "2026-08-01",
    );

    expect(mockInvoke).toHaveBeenCalledWith("assign_section_adviser", {
      sectionId: "sec-1",
      teacherUserId: "teacher-1",
      startsOn: "2026-08-01",
    });
    expect(result.kind).toBe("assigned");
  });

  it("passes through a declined assign_section_adviser outcome unchanged", async () => {
    mockInvoke.mockResolvedValueOnce({ kind: "alreadyHasAnActiveAdviser" });

    const result = await new TauriSectionAdvisoryRepository().assign(
      "sec-1",
      "teacher-1",
      "2026-08-01",
    );

    expect(result).toEqual({ kind: "alreadyHasAnActiveAdviser" });
  });

  it("ends an advisory via end_section_adviser", async () => {
    mockInvoke.mockResolvedValueOnce({
      kind: "ended",
      advisory: {
        id: "adv-1",
        schoolId: "school-1",
        sectionId: "sec-1",
        teacherUserId: "teacher-1",
        startsOn: "2026-08-01",
        endsOn: "2026-08-30",
        createdAt: "now",
      },
    });

    const result = await new TauriSectionAdvisoryRepository().end("sec-1", "adv-1", "2026-08-30");

    expect(mockInvoke).toHaveBeenCalledWith("end_section_adviser", {
      sectionId: "sec-1",
      advisoryId: "adv-1",
      endsOn: "2026-08-30",
    });
    expect(result.kind).toBe("ended");
  });

  it("passes through a declined end_section_adviser outcome unchanged", async () => {
    mockInvoke.mockResolvedValueOnce({ kind: "notFound" });

    const result = await new TauriSectionAdvisoryRepository().end("sec-1", "adv-1", "2026-08-30");

    expect(result).toEqual({ kind: "notFound" });
  });
});
