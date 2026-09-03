import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import { AuthApplicationService } from "./auth-service";

class FakeAuthRepository implements AuthRepository {
  loginCalls: Array<{ username: string; password: string; schoolId: string }> = [];
  auditLogToReturn: AuditLogEntry[] = [];
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
      idleExpiresAtUnixMs: 1_000_000,
      roles: ["teacher"],
    };
    return this.session;
  }

  async logout(): Promise<void> {
    this.session = null;
  }

  async currentSession(): Promise<CurrentSession | null> {
    return this.session;
  }

  extendSessionCalls = 0;

  async extendSession(): Promise<CurrentSession> {
    this.extendSessionCalls += 1;
    if (!this.session) throw new Error("no active session");
    return this.session;
  }

  async listAuditLog(): Promise<AuditLogEntry[]> {
    return this.auditLogToReturn;
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

  it("extendSession delegates to the repository", async () => {
    const repo = new FakeAuthRepository();
    const service = new AuthApplicationService(repo);
    await service.login("ana.cruz", "hunter2", "s1");

    const result = await service.extendSession();

    expect(result).not.toBeNull();
    expect(repo.extendSessionCalls).toBe(1);
  });

  it("listAuditLog delegates to the repository", async () => {
    const repo = new FakeAuthRepository();
    repo.auditLogToReturn = [
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "now",
      },
    ];
    const service = new AuthApplicationService(repo);

    const entries = await service.listAuditLog();

    expect(entries).toBe(repo.auditLogToReturn);
  });
});
