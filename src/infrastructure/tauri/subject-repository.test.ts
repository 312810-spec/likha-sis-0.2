import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { Subject } from "../../domain/subject";
import { TauriSubjectRepository } from "./subject-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSubjectRepository", () => {
  it("list invokes list_subjects_by_school with no arguments (scope comes from the session)", async () => {
    const subjects: Subject[] = [
      { id: "sub-1", schoolId: "s1", name: "Mathematics", createdAt: "now" },
    ];
    mockInvoke.mockResolvedValueOnce(subjects);

    const result = await new TauriSubjectRepository().list();

    expect(mockInvoke).toHaveBeenCalledWith("list_subjects_by_school");
    expect(result).toEqual(subjects);
  });

  it("create invokes create_subject with name", async () => {
    const subject: Subject = { id: "sub-1", schoolId: "s1", name: "Mathematics", createdAt: "now" };
    mockInvoke.mockResolvedValueOnce(subject);

    const result = await new TauriSubjectRepository().create("Mathematics");

    expect(mockInvoke).toHaveBeenCalledWith("create_subject", { name: "Mathematics" });
    expect(result).toEqual(subject);
  });
});
