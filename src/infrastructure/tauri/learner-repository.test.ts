import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { Learner } from "../../domain/learner";
import { TauriLearnerRepository } from "./learner-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriLearnerRepository", () => {
  it("list invokes list_learners_by_school with no arguments (scope comes from the session)", async () => {
    const learners: Learner[] = [
      {
        id: "1",
        schoolId: "s1",
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(learners);

    const result = await new TauriLearnerRepository().list();

    expect(mockInvoke).toHaveBeenCalledWith("list_learners_by_school");
    expect(result).toEqual(learners);
  });

  it("create invokes create_learner with givenName/familyName and null lrn/sex when omitted", async () => {
    const learner: Learner = {
      id: "1",
      schoolId: "s1",
      givenName: "Ana",
      familyName: "Santos",
      lrn: null,
      sex: null,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(learner);

    const result = await new TauriLearnerRepository().create("Ana", "Santos");

    expect(mockInvoke).toHaveBeenCalledWith("create_learner", {
      givenName: "Ana",
      familyName: "Santos",
      lrn: null,
      sex: null,
    });
    expect(result).toEqual(learner);
  });

  it("create passes lrn/sex through when provided", async () => {
    const learner: Learner = {
      id: "1",
      schoolId: "s1",
      givenName: "Ana",
      familyName: "Santos",
      lrn: "123456789012",
      sex: "F",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(learner);

    await new TauriLearnerRepository().create("Ana", "Santos", "123456789012", "F");

    expect(mockInvoke).toHaveBeenCalledWith("create_learner", {
      givenName: "Ana",
      familyName: "Santos",
      lrn: "123456789012",
      sex: "F",
    });
  });

  it("updateProfile invokes update_learner with all fields", async () => {
    const learner: Learner = {
      id: "1",
      schoolId: "s1",
      givenName: "Ana",
      familyName: "Santos",
      lrn: "123456789012",
      sex: "F",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(learner);

    const result = await new TauriLearnerRepository().updateProfile(
      "1",
      "Ana",
      "Santos",
      "123456789012",
      "F",
    );

    expect(mockInvoke).toHaveBeenCalledWith("update_learner", {
      learnerId: "1",
      givenName: "Ana",
      familyName: "Santos",
      lrn: "123456789012",
      sex: "F",
    });
    expect(result).toEqual(learner);
  });
});
