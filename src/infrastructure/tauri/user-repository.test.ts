import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { User } from "../../domain/user";
import { TauriUserRepository } from "./user-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriUserRepository", () => {
  it("registerUser invokes register_user with username, password, displayName", async () => {
    const user: User = {
      id: "u1",
      username: "ana.cruz",
      displayName: "Ana Cruz",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(user);

    const result = await new TauriUserRepository().registerUser("ana.cruz", "hunter2", "Ana Cruz");

    expect(mockInvoke).toHaveBeenCalledWith("register_user", {
      username: "ana.cruz",
      password: "hunter2",
      displayName: "Ana Cruz",
    });
    expect(result).toEqual(user);
  });

  it("addUserToSchool invokes add_user_to_school with userId, schoolId", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriUserRepository().addUserToSchool("u1", "s1");

    expect(mockInvoke).toHaveBeenCalledWith("add_user_to_school", { userId: "u1", schoolId: "s1" });
  });

  it("adminResetPassword invokes admin_reset_teacher_password with targetUserId, newPassword", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await new TauriUserRepository().adminResetPassword("u1", "a fresh strong password");

    expect(mockInvoke).toHaveBeenCalledWith("admin_reset_teacher_password", {
      targetUserId: "u1",
      newPassword: "a fresh strong password",
    });
  });
});
