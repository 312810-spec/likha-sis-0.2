import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { CurrentSession } from "../../domain/session";
import { TauriAuthRepository } from "./auth-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
};

describe("TauriAuthRepository", () => {
  it("login invokes login with username, password, schoolId", async () => {
    mockInvoke.mockResolvedValueOnce(session);

    const result = await new TauriAuthRepository().login("ana.cruz", "hunter2", "s1");

    expect(mockInvoke).toHaveBeenCalledWith("login", {
      username: "ana.cruz",
      password: "hunter2",
      schoolId: "s1",
    });
    expect(result).toEqual(session);
  });

  it("logout invokes logout with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriAuthRepository().logout();

    expect(mockInvoke).toHaveBeenCalledWith("logout");
  });

  it("currentSession invokes current_session and passes through null", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriAuthRepository().currentSession();

    expect(mockInvoke).toHaveBeenCalledWith("current_session");
    expect(result).toBeNull();
  });
});
