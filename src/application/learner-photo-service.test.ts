import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { LearnerPhoto } from "../domain/learner-photo";
import type { LearnerPhotoRepository } from "../domain/ports/learner-photo-repository";
import { LearnerPhotoApplicationService } from "./learner-photo-service";

class FakeLearnerPhotoRepository implements LearnerPhotoRepository {
  photo: LearnerPhoto | null = null;
  setCalls: Array<{ learnerId: string; bytes: Uint8Array; mimeType: string }> = [];
  clearCalls: string[] = [];
  setResult = true;
  clearResult = true;

  async get(): Promise<LearnerPhoto | null> {
    return this.photo;
  }

  async set(learnerId: string, photoBytes: Uint8Array, mimeType: string): Promise<boolean> {
    this.setCalls.push({ learnerId, bytes: photoBytes, mimeType });
    return this.setResult;
  }

  async clear(learnerId: string): Promise<boolean> {
    this.clearCalls.push(learnerId);
    return this.clearResult;
  }
}

describe("LearnerPhotoApplicationService", () => {
  it("sets a valid PNG photo", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);
    const bytes = new Uint8Array([1, 2, 3]);

    const result = await service.setPhoto("learner-1", bytes, "image/png");

    expect(result).toBe(true);
    expect(repo.setCalls).toEqual([{ learnerId: "learner-1", bytes, mimeType: "image/png" }]);
  });

  it("rejects an empty file without calling the repository", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);

    await expect(
      service.setPhoto("learner-1", new Uint8Array([]), "image/png"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setCalls).toEqual([]);
  });

  it("rejects a file over 2MB without calling the repository", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);
    const tooLarge = new Uint8Array(2 * 1024 * 1024 + 1);

    await expect(service.setPhoto("learner-1", tooLarge, "image/png")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.setCalls).toEqual([]);
  });

  it("rejects an unsupported mime type without calling the repository", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);

    await expect(
      service.setPhoto("learner-1", new Uint8Array([1]), "image/gif"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setCalls).toEqual([]);
  });

  it("accepts a JPEG at exactly the 2MB limit", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);
    const atLimit = new Uint8Array(2 * 1024 * 1024);

    await expect(service.setPhoto("learner-1", atLimit, "image/jpeg")).resolves.toBe(true);
  });

  it("getPhoto delegates to the repository", async () => {
    const repo = new FakeLearnerPhotoRepository();
    repo.photo = { bytes: new Uint8Array([1]), mimeType: "image/png" };
    const service = new LearnerPhotoApplicationService(repo);

    await expect(service.getPhoto("learner-1")).resolves.toEqual(repo.photo);
  });

  it("clearPhoto delegates to the repository", async () => {
    const repo = new FakeLearnerPhotoRepository();
    const service = new LearnerPhotoApplicationService(repo);

    await expect(service.clearPhoto("learner-1")).resolves.toBe(true);
    expect(repo.clearCalls).toEqual(["learner-1"]);
  });
});
