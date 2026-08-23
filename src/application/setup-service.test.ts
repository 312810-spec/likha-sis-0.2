import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { InstallationStatus, SetupRepository } from "../domain/ports/setup-repository";
import type { CurrentSession } from "../domain/session";
import { SetupApplicationService } from "./setup-service";

class FakeSetupRepository implements SetupRepository {
  bootstrapCalls: Array<{
    schoolName: string;
    username: string;
    password: string;
    displayName: string;
  }> = [];
  status: InstallationStatus = { needsSetup: true };

  async installationStatus(): Promise<InstallationStatus> {
    return this.status;
  }

  async bootstrapInstallation(
    schoolName: string,
    username: string,
    password: string,
    displayName: string,
  ): Promise<CurrentSession> {
    this.bootstrapCalls.push({ schoolName, username, password, displayName });
    return {
      userId: "u1",
      username,
      displayName,
      schoolId: "s1",
      schoolName,
      expiresAtUnixMs: 1_000_000,
    };
  }
}

const validInput = {
  schoolName: "Rizal Elementary",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  password: "correct horse battery staple",
  confirmPassword: "correct horse battery staple",
};

describe("SetupApplicationService", () => {
  it("completes setup with trimmed values", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    const session = await service.completeSetup({
      ...validInput,
      schoolName: "  Rizal Elementary  ",
      displayName: "  Ana Cruz  ",
      username: "  ana.cruz  ",
    });

    expect(session.schoolName).toBe("Rizal Elementary");
    expect(repo.bootstrapCalls).toEqual([
      {
        schoolName: "Rizal Elementary",
        username: "ana.cruz",
        password: validInput.password,
        displayName: "Ana Cruz",
      },
    ]);
  });

  it("rejects an empty school name without calling the repository", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    await expect(
      service.completeSetup({ ...validInput, schoolName: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("rejects an empty display name without calling the repository", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    await expect(
      service.completeSetup({ ...validInput, displayName: "   " }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("rejects an empty username without calling the repository", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    await expect(service.completeSetup({ ...validInput, username: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("rejects a password shorter than the minimum length", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    await expect(
      service.completeSetup({ ...validInput, password: "short", confirmPassword: "short" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("rejects mismatched password confirmation without calling the repository", async () => {
    const repo = new FakeSetupRepository();
    const service = new SetupApplicationService(repo);

    await expect(
      service.completeSetup({ ...validInput, confirmPassword: "a different password" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.bootstrapCalls).toEqual([]);
  });

  it("installationStatus delegates to the repository", async () => {
    const repo = new FakeSetupRepository();
    repo.status = { needsSetup: false };
    const service = new SetupApplicationService(repo);

    expect(await service.installationStatus()).toEqual({ needsSetup: false });
  });
});
