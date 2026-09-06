import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriSchoolLogoRepository } from "./school-logo-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSchoolLogoRepository", () => {
  it("get invokes get_school_logo and rebuilds a Uint8Array from the returned bytes", async () => {
    mockInvoke.mockResolvedValueOnce({ mime: "image/png", bytes: [1, 2, 3] });

    const logo = await new TauriSchoolLogoRepository().get();

    expect(mockInvoke).toHaveBeenCalledWith("get_school_logo");
    expect(logo).toEqual({ mime: "image/png", bytes: Uint8Array.from([1, 2, 3]) });
  });

  it("get returns null when the school has no logo", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const logo = await new TauriSchoolLogoRepository().get();

    expect(logo).toBeNull();
  });

  it("set invokes set_school_logo with mime and bytes as a plain number array", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolLogoRepository().set("image/png", Uint8Array.from([4, 5, 6]));

    expect(mockInvoke).toHaveBeenCalledWith("set_school_logo", {
      mime: "image/png",
      bytes: [4, 5, 6],
    });
  });

  it("clear invokes clear_school_logo with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriSchoolLogoRepository().clear();

    expect(mockInvoke).toHaveBeenCalledWith("clear_school_logo");
  });
});
