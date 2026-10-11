import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { LearnerSupportCase } from "../../domain/learner-support";
import { TauriLearnerSupportRepository } from "./learner-support-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const supportCase: LearnerSupportCase = {
  id: "case-1",
  schoolId: "school-1",
  classOccurrenceId: "occ-1",
  sectionMembershipId: "mem-1",
  need: "Cannot read CVC words",
  goal: "Read a short passage independently",
  intervention: "Daily 10-minute one-on-one reading",
  status: "open",
  participation: null,
  outcome: null,
  openedByUserId: "teacher-1",
  openedAt: "2026-09-09T01:00:00.000Z",
  updatedAt: "2026-09-09T01:00:00.000Z",
  resolvedAt: null,
  learnerGivenName: "Ana",
  learnerFamilyName: "Cruz",
};

describe("TauriLearnerSupportRepository", () => {
  it("openCase invokes the command with camelCase names and no school or teacher", async () => {
    mockInvoke.mockResolvedValueOnce(supportCase);

    const result = await new TauriLearnerSupportRepository().openCase(
      "occ-1",
      "mem-1",
      "Cannot read CVC words",
      "Read a short passage independently",
      "Daily 10-minute one-on-one reading",
    );

    expect(mockInvoke).toHaveBeenCalledWith("open_learner_support_case", {
      classOccurrenceId: "occ-1",
      sectionMembershipId: "mem-1",
      need: "Cannot read CVC words",
      goal: "Read a short passage independently",
      intervention: "Daily 10-minute one-on-one reading",
    });
    expect(result).toEqual(supportCase);
  });

  it("openCase carries a refused write through as null", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await expect(
      new TauriLearnerSupportRepository().openCase("occ-1", "mem-1", "n", "g", "i"),
    ).resolves.toBeNull();
  });

  it("recordParticipation sends the case and the text only", async () => {
    mockInvoke.mockResolvedValueOnce({ ...supportCase, status: "in_progress" });

    await new TauriLearnerSupportRepository().recordParticipation("case-1", "Joined the session");

    expect(mockInvoke).toHaveBeenCalledWith("record_learner_support_participation", {
      caseId: "case-1",
      participation: "Joined the session",
    });
  });

  it("resolve sends the case and the outcome only", async () => {
    mockInvoke.mockResolvedValueOnce({ ...supportCase, status: "resolved" });

    await new TauriLearnerSupportRepository().resolve("case-1", "Met the goal");

    expect(mockInvoke).toHaveBeenCalledWith("resolve_learner_support_case", {
      caseId: "case-1",
      outcome: "Met the goal",
    });
  });

  it("listForOccurrence reads the intervention history for one occurrence", async () => {
    mockInvoke.mockResolvedValueOnce([supportCase]);

    const result = await new TauriLearnerSupportRepository().listForOccurrence("occ-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_learner_support_cases", {
      classOccurrenceId: "occ-1",
    });
    expect(result).toEqual([supportCase]);
  });
});
