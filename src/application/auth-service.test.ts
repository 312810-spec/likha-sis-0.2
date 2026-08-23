import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { CurrentSession } from "../domain/session";
import { AuthApplicationService } from "./auth-service";

class FakeAuthRepository implements AuthRepository {
  loginCalls: Array<{ username: string; password: string; schoolId: string }> = [];
  private session: CurrentSession | null = null;

  async login(username: string, password: string, schoolId: string): Promise<CurrentSession> {
    this.loginCalls.push({ username, password, schoolId });
    this.session = {
      userId: "u1",
      username,
      displayName: "Ana Cruz",
      schoolId,
      schoolName: "Rizal Elementary",
      expiresAtUnixMs: 1_000_000,
    };
    return this.session;
  }

  async logout(): Promise<void> {
    this.session = null;
  }

  async currentSession(): Promise<CurrentSession | null> {
    return this.session;
  }
}

describe("AuthApplicationService", () => {
  it("logs in with a trimmed username", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);

    const session = await service.login("  ana.cruz  ", "hunter2", "s1");

    expect(session.username).toBe("ana.cruz");
    expect(repo.loginCalls).toEqual([
      { username: "ana.cruz", password: "hunter2", schoolId: "s1" },
    ]);
  });

  it("rejects an empty username without calling the repository", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);

    await expect(service.login("  ", "hunter2", "s1")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.loginCalls).toEqual([]);
  });

  it("rejects an empty password without calling the repository", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);

    await expect(service.login("ana.cruz", "", "s1")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.loginCalls).toEqual([]);
  });

  it("rejects a missing school id without calling the repository", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);

    await expect(service.login("ana.cruz", "hunter2", "  ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.loginCalls).toEqual([]);
  });

  it("does not trim the password", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);

    await service.login("ana.cruz", "  spaced  ", "s1");

    expect(repo.loginCalls[0]?.password).toBe("  spaced  ");
  });

  it("logout and currentSession delegate to the repository", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);
    await service.login("ana.cruz", "hunter2", "s1");

    expect(await service.currentSession()).not.toBeNull();

    await service.logout();

    expect(await service.currentSession()).toBeNull();
  });
});
