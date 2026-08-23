import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../domain/session";
import { TauriSetupRepository } from "./setup-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriSetupRepository", () => {
  it("installationStatus invokes installation_status with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce({ needsSetup: true });

    const result = await new TauriSetupRepository().installationStatus();

    expect(mockInvoke).toHaveBeenCalledWith("installation_status");
    expect(result).toEqual({ needsSetup: true });
  });

  it("bootstrapInstallation invokes bootstrap_installation with all fields", async () => {
    const session: CurrentSession = {
      userId: "u1",
      username: "ana.cruz",
      displayName: "Ana Cruz",
      schoolId: "s1",
      schoolName: "Rizal Elementary",
      expiresAtUnixMs: 1_000_000,
    };
    mockInvoke.mockResolvedValueOnce(session);

    const result = await new TauriSetupRepository().bootstrapInstallation(
      "Rizal Elementary",
      "ana.cruz",
      "hunter2",
      "Ana Cruz",
    );

    expect(mockInvoke).toHaveBeenCalledWith("bootstrap_installation", {
      schoolName: "Rizal Elementary",
      username: "ana.cruz",
      password: "hunter2",
      displayName: "Ana Cruz",
    });
    expect(result).toEqual(session);
  });
});
