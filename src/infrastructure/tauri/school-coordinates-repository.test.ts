import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSchoolCoordinatesRepository } from "./school-coordinates-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchoolCoordinatesRepository", () => {
  it("get invokes get_school_coordinates and returns the result as-is", async () => {
    mockInvoke.mockResolvedValueOnce({ latitude: 14.5995, longitude: 120.9842 });

    const coordinates = await new TauriSchoolCoordinatesRepository().get();

    expect(mockInvoke).toHaveBeenCalledWith("get_school_coordinates");
    expect(coordinates).toEqual({ latitude: 14.5995, longitude: 120.9842 });
  });

  it("get returns null when the school has no coordinates configured", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const coordinates = await new TauriSchoolCoordinatesRepository().get();

    expect(coordinates).toBeNull();
  });

  it("set invokes set_school_coordinates with latitude and longitude", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolCoordinatesRepository().set(14.5995, 120.9842);

    expect(mockInvoke).toHaveBeenCalledWith("set_school_coordinates", {
      latitude: 14.5995,
      longitude: 120.9842,
    });
  });

  it("clear invokes clear_school_coordinates with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolCoordinatesRepository().clear();

    expect(mockInvoke).toHaveBeenCalledWith("clear_school_coordinates");
  });
});
