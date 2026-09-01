import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { UserRepository } from "../domain/ports/user-repository";
import type { User } from "../domain/user";
import { UserApplicationService } from "./user-service";

class FakeUserRepository implements UserRepository {
  registerCalls: Array<{ username: string; password: string; displayName: string }> = [];
  membershipCalls: Array<{ userId: string; schoolId: string }> = [];
  resetCalls: Array<{ targetUserId: string; newPassword: string }> = [];

  async registerUser(username: string, password: string, displayName: string): Promise<User> {
    this.registerCalls.push({ username, password, displayName });
    return { id: "u1", username, displayName, createdAt: "now" };
  }

  async addUserToSchool(userId: string, schoolId: string): Promise<void> {
    this.membershipCalls.push({ userId, schoolId });
  }

  async adminResetPassword(targetUserId: string, newPassword: string): Promise<void> {
    this.resetCalls.push({ targetUserId, newPassword });
  }
}

describe("UserApplicationService", () => {
  it("registers a user with trimmed username/displayName", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    const user = await service.registerUser("  ana.cruz  ", "hunter2pass", "  Ana Cruz  ");

    expect(user.username).toBe("ana.cruz");
    expect(repo.registerCalls).toEqual([
      { username: "ana.cruz", password: "hunter2pass", displayName: "Ana Cruz" },
    ]);
  });

  it("rejects an empty username without calling the repository", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await expect(service.registerUser("  ", "hunter2pass", "Ana Cruz")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.registerCalls).toEqual([]);
  });

  it("rejects an empty display name without calling the repository", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await expect(service.registerUser("ana.cruz", "hunter2pass", "  ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.registerCalls).toEqual([]);
  });

  it("rejects a password shorter than the minimum length", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await expect(service.registerUser("ana.cruz", "short", "Ana Cruz")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.registerCalls).toEqual([]);
  });

  it("addUserToSchool delegates to the repository", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await service.addUserToSchool("u1", "s1");

    expect(repo.membershipCalls).toEqual([{ userId: "u1", schoolId: "s1" }]);
  });

  it("adminResetPassword delegates to the repository", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await service.adminResetPassword("u1", "a fresh strong password");

    expect(repo.resetCalls).toEqual([
      { targetUserId: "u1", newPassword: "a fresh strong password" },
    ]);
  });

  it("rejects a reset password shorter than the minimum length without calling the repository", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await expect(service.adminResetPassword("u1", "short")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.resetCalls).toEqual([]);
  });

  it("does not trim a reset password", async () => {
    const repo = new FakeUserRepository();
    const service = new UserApplicationService(repo);

    await service.adminResetPassword("u1", "  spaced out password  ");

    expect(repo.resetCalls[0]?.newPassword).toBe("  spaced out password  ");
  });
});
