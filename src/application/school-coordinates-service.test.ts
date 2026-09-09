import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { SchoolCoordinatesRepository } from "../domain/ports/school-coordinates-repository";
import type { SchoolCoordinates } from "../domain/school-coordinates";
import { SchoolCoordinatesApplicationService } from "./school-coordinates-service";

class FakeSchoolCoordinatesRepository implements SchoolCoordinatesRepository {
  coordinates: SchoolCoordinates | null = null;
  setCalls: Array<{ latitude: number; longitude: number }> = [];
  clearCalls = 0;

  async get(): Promise<SchoolCoordinates | null> {
    return this.coordinates;
  }

  async set(latitude: number, longitude: number): Promise<void> {
    this.setCalls.push({ latitude, longitude });
    this.coordinates = { latitude, longitude };
  }

  async clear(): Promise<void> {
    this.clearCalls += 1;
    this.coordinates = null;
  }
}

describe("SchoolCoordinatesApplicationService", () => {
  it("getCoordinates delegates to the repository", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    repo.coordinates = { latitude: 14.5995, longitude: 120.9842 };
    const service = new SchoolCoordinatesApplicationService(repo);

    expect(await service.getCoordinates()).toEqual({ latitude: 14.5995, longitude: 120.9842 });
  });

  it("setCoordinates delegates a valid coordinate to the repository", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    const service = new SchoolCoordinatesApplicationService(repo);

    await service.setCoordinates(14.5995, 120.9842);

    expect(repo.setCalls).toEqual([{ latitude: 14.5995, longitude: 120.9842 }]);
  });

  it("rejects an out-of-range latitude before calling the repository", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    const service = new SchoolCoordinatesApplicationService(repo);

    await expect(service.setCoordinates(90.1, 0)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setCalls).toHaveLength(0);
  });

  it("rejects an out-of-range longitude before calling the repository", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    const service = new SchoolCoordinatesApplicationService(repo);

    await expect(service.setCoordinates(0, 180.1)).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setCalls).toHaveLength(0);
  });

  it("rejects a non-finite coordinate", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    const service = new SchoolCoordinatesApplicationService(repo);

    await expect(service.setCoordinates(NaN, 0)).rejects.toBeInstanceOf(ValidationError);
  });

  it("clearCoordinates delegates to the repository", async () => {
    const repo = new FakeSchoolCoordinatesRepository();
    repo.coordinates = { latitude: 14.5995, longitude: 120.9842 };
    const service = new SchoolCoordinatesApplicationService(repo);

    await service.clearCoordinates();

    expect(repo.clearCalls).toBe(1);
    expect(repo.coordinates).toBeNull();
  });
});
