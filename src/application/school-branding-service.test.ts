import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolBrandingRepository } from "../domain/ports/school-branding-repository";
import type { SchoolBranding, SchoolLogo } from "../domain/school-branding";
import { SchoolBrandingApplicationService } from "./school-branding-service";

const SAMPLE_BRANDING: SchoolBranding = {
  schoolId: "school-1",
  primaryColor: "#1e3a5f",
  primaryTextColor: "#ffffff",
  secondaryColor: "#5f3a1e",
  secondaryTextColor: "#ffffff",
  accentColor: "#3a5f1e",
  accentTextColor: "#ffffff",
  selectedSurfaceColor: "#eef2fb",
  restrainedSurfaceColor: "#f6f8fc",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

class FakeSchoolBrandingRepository implements SchoolBrandingRepository {
  current: SchoolBranding | null = null;
  logo: SchoolLogo | null = null;
  setCalls: Array<{ bytes: Uint8Array; mimeType: string }> = [];
  clearCalls = 0;

  async get(): Promise<SchoolBranding | null> {
    return this.current;
  }

  async getLogo(): Promise<SchoolLogo | null> {
    return this.logo;
  }

  async set(logoBytes: Uint8Array, mimeType: string): Promise<SchoolBranding> {
    this.setCalls.push({ bytes: logoBytes, mimeType });
    this.current = SAMPLE_BRANDING;
    return SAMPLE_BRANDING;
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
    this.current = null;
  }
}

describe("SchoolBrandingApplicationService", () => {
  it("uploads a valid PNG logo", async () => {
    const repo = new FakeSchoolBrandingRepository();
    const service = new SchoolBrandingApplicationService(repo);
    const bytes = new Uint8Array([1, 2, 3]);

    const branding = await service.uploadLogo(bytes, "image/png");

    expect(branding).toEqual(SAMPLE_BRANDING);
    expect(repo.setCalls).toEqual([{ bytes, mimeType: "image/png" }]);
  });

  it("rejects an empty file without calling the repository", async () => {
    const repo = new FakeSchoolBrandingRepository();
    const service = new SchoolBrandingApplicationService(repo);

    await expect(service.uploadLogo(new Uint8Array([]), "image/png")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.setCalls).toEqual([]);
  });

  it("rejects a file over 2MB without calling the repository", async () => {
    const repo = new FakeSchoolBrandingRepository();
    const service = new SchoolBrandingApplicationService(repo);
    const tooLarge = new Uint8Array(2 * 1024 * 1024 + 1);

    await expect(service.uploadLogo(tooLarge, "image/png")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setCalls).toEqual([]);
  });

  it("rejects an unsupported mime type without calling the repository", async () => {
    const repo = new FakeSchoolBrandingRepository();
    const service = new SchoolBrandingApplicationService(repo);

    await expect(service.uploadLogo(new Uint8Array([1]), "image/gif")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.setCalls).toEqual([]);
  });

  it("accepts a JPEG at exactly the 2MB limit", async () => {
    const repo = new FakeSchoolBrandingRepository();
    const service = new SchoolBrandingApplicationService(repo);
    const atLimit = new Uint8Array(2 * 1024 * 1024);

    await expect(service.uploadLogo(atLimit, "image/jpeg")).resolves.toEqual(SAMPLE_BRANDING);
  });

  it("getCurrent delegates to the repository", async () => {
    const repo = new FakeSchoolBrandingRepository();
    repo.current = SAMPLE_BRANDING;
    const service = new SchoolBrandingApplicationService(repo);

    await expect(service.getCurrent()).resolves.toEqual(SAMPLE_BRANDING);
  });

  it("resetToDefault delegates to the repository's clear", async () => {
    const repo = new FakeSchoolBrandingRepository();
    repo.current = SAMPLE_BRANDING;
    const service = new SchoolBrandingApplicationService(repo);

    await service.resetToDefault();

    expect(repo.clearCalls).toBe(1);
    expect(repo.current).toBeNull();
  });
});
