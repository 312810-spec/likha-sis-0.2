import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { SectionMembership } from "../../domain/section";
import { TauriEnrollmentHistoryRepository } from "./enrollment-history-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

const mockInvoke = vi.mocked(invoke);

describe("TauriEnrollmentHistoryRepository", () => {
  it("invokes the school-scoped history command with only the learner id", async () => {
    const rows: SectionMembership[] = [
      {
        id: "mem-1",
        schoolId: "school-1",
        sectionId: "section-1",
        learnerId: "learner-1",
        startsOn: "2025-06-02",
        endsOn: null,
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(rows);

    const result = await new TauriEnrollmentHistoryRepository().listByLearner("learner-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_learner_enrollment_history", {
      learnerId: "learner-1",
    });
    expect(result).toEqual(rows);
  });
});
