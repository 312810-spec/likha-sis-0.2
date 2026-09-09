import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolLogoRepository } from "../domain/ports/school-logo-repository";
import type { SchoolLogo } from "../domain/school-logo";
import { SchoolLogoApplicationService } from "./school-logo-service";

class FakeSchoolLogoRepository implements SchoolLogoRepository {
  logo: SchoolLogo | null = null;
  setCalls: Array<{ mime: string; bytes: Uint8Array }> = [];
  clearCalls = 0;

  async get(): Promise<SchoolLogo | null> {
    return this.logo;
  }

  async set(mime: string, bytes: Uint8Array): Promise<void> {
    this.setCalls.push({ mime, bytes });
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
  }
}

describe("SchoolLogoApplicationService", () => {
  it("getLogo delegates to the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    repo.logo = { mime: "image/png", bytes: new Uint8Array([1, 2, 3]) };
    const service = new SchoolLogoApplicationService(repo);

    await expect(service.getLogo()).resolves.toEqual(repo.logo);
  });

  it("setLogo forwards a valid PNG upload to the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    const service = new SchoolLogoApplicationService(repo);
    const bytes = new Uint8Array([1, 2, 3]);

    await service.setLogo("image/png", bytes);

    expect(repo.setCalls).toEqual([{ mime: "image/png", bytes }]);
  });

  it("setLogo rejects an unsupported MIME type before calling the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    const service = new SchoolLogoApplicationService(repo);

    await expect(service.setLogo("image/svg+xml", new Uint8Array([1]))).rejects.toThrow(
      ValidationError,
    );
    expect(repo.setCalls).toHaveLength(0);
  });

  it("setLogo rejects an empty upload before calling the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    const service = new SchoolLogoApplicationService(repo);

    await expect(service.setLogo("image/png", new Uint8Array([]))).rejects.toThrow(ValidationError);
    expect(repo.setCalls).toHaveLength(0);
  });

  it("setLogo rejects an oversized upload before calling the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    const service = new SchoolLogoApplicationService(repo);
    const tooBig = new Uint8Array(48 * 1024 + 1);

    await expect(service.setLogo("image/png", tooBig)).rejects.toThrow(ValidationError);
    expect(repo.setCalls).toHaveLength(0);
  });

  it("clearLogo delegates to the repository", async () => {
    const repo = new FakeSchoolLogoRepository();
    const service = new SchoolLogoApplicationService(repo);

    await service.clearLogo();

    expect(repo.clearCalls).toBe(1);
  });
});
