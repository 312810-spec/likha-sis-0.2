import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { TauriLearnerPhotoRepository } from "./learner-photo-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriLearnerPhotoRepository", () => {
  it("get invokes get_learner_photo and wraps the tuple result", async () => {
    mockInvoke.mockResolvedValueOnce([[1, 2, 3], "image/png"]);

    const result = await new TauriLearnerPhotoRepository().get("learner-1");

    expect(mockInvoke).toHaveBeenCalledWith("get_learner_photo", { learnerId: "learner-1" });
    expect(result).toEqual({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png" });
  });

  it("get returns null when there is no photo", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriLearnerPhotoRepository().get("learner-1");

    expect(result).toBeNull();
  });

  it("set invokes set_learner_photo with the bytes as a plain array", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await new TauriLearnerPhotoRepository().set(
      "learner-1",
      new Uint8Array([1, 2, 3]),
      "image/png",
    );

    expect(mockInvoke).toHaveBeenCalledWith("set_learner_photo", {
      learnerId: "learner-1",
      photoBytes: [1, 2, 3],
      photoMime: "image/png",
    });
    expect(result).toBe(true);
  });

  it("clear invokes clear_learner_photo", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await new TauriLearnerPhotoRepository().clear("learner-1");

    expect(mockInvoke).toHaveBeenCalledWith("clear_learner_photo", { learnerId: "learner-1" });
    expect(result).toBe(true);
  });
});
