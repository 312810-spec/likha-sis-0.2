import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
} from "../../domain/learner-score";
import { TauriLearnerScoreRepository } from "./learner-score-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriLearnerScoreRepository", () => {
  it("rosterForItem invokes roster_for_assessment_item with assessmentItemId", async () => {
    const roster: LearnerScoreRosterEntry[] = [
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Cruz",
        status: null,
        score: null,
        updatedAt: null,
      },
    ];
    mockInvoke.mockResolvedValueOnce(roster);

    const result = await new TauriLearnerScoreRepository().rosterForItem("ai-1");

    expect(mockInvoke).toHaveBeenCalledWith("roster_for_assessment_item", {
      assessmentItemId: "ai-1",
    });
    expect(result).toEqual(roster);
  });

  it("rosterForItem returns null when the item doesn't resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriLearnerScoreRepository().rosterForItem("ai-1");

    expect(result).toBeNull();
  });

  it("record invokes record_learner_score with assessmentItemId/learnerId/status/score", async () => {
    const score: LearnerScore = {
      id: "ls-1",
      schoolId: "s1",
      assessmentItemId: "ai-1",
      learnerId: "l1",
      status: "scored",
      score: 18,
      recordedByUserId: "u1",
      recordedAt: "now",
      updatedAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(score);

    const result = await new TauriLearnerScoreRepository().record("ai-1", "l1", "scored", 18);

    expect(mockInvoke).toHaveBeenCalledWith("record_learner_score", {
      assessmentItemId: "ai-1",
      learnerId: "l1",
      status: "scored",
      score: 18,
    });
    expect(result).toEqual(score);
  });

  it("record returns null when a referenced id doesn't resolve or the learner isn't eligible", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriLearnerScoreRepository().record("ai-1", "l1", "scored", 18);

    expect(result).toBeNull();
  });

  it("computeTermGrade invokes compute_learner_term_grade with classRecordId/learnerId", async () => {
    const grade: ComputedTermGrade = {
      initialGrade: 85.8,
      termGrade: 88,
      wasTransmuted: true,
      wasFloored: false,
    };
    mockInvoke.mockResolvedValueOnce(grade);

    const result = await new TauriLearnerScoreRepository().computeTermGrade("cr-1", "l1");

    expect(mockInvoke).toHaveBeenCalledWith("compute_learner_term_grade", {
      classRecordId: "cr-1",
      learnerId: "l1",
    });
    expect(result).toEqual(grade);
  });

  it("computeTermGrade returns null when the grade isn't computable yet", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriLearnerScoreRepository().computeTermGrade("cr-1", "l1");

    expect(result).toBeNull();
  });
});
