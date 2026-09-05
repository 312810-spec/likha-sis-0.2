import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { DeviceSyncCredential } from "../domain/device-sync-credential";
import type { DeviceSyncRepository } from "../domain/ports/device-sync-repository";
import { DeviceSyncApplicationService } from "./device-sync-service";

const DEVICES: DeviceSyncCredential[] = [
  {
    credentialId: "c-1",
    deviceLabel: "Ana's laptop",
    ownerDisplayName: "Ana Cruz",
    ownerUsername: "ana.cruz",
    createdAt: "2026-08-25T08:00:00.000Z",
    lastUsedAt: null,
  },
];

class FakeDeviceSyncRepository implements DeviceSyncRepository {
  calls = 0;
  revokeCalls: string[] = [];
  revokeResult: boolean | "reject" = true;

  async listDevices() {
    this.calls += 1;
    return DEVICES;
  }

  async revokeDevice(credentialId: string): Promise<boolean> {
    this.revokeCalls.push(credentialId);
    if (this.revokeResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.revokeResult;
  }
}

describe("DeviceSyncApplicationService", () => {
  it("lists devices enrolled for the caller's own school", async () => {
    const repo = new FakeDeviceSyncRepository();
    const service = new DeviceSyncApplicationService(repo);

    const result = await service.listDevices();

    expect(repo.calls).toBe(1);
    expect(result).toEqual(DEVICES);
  });

  it("revokes a device, trimming the credential id", async () => {
    const repo = new FakeDeviceSyncRepository();
    const service = new DeviceSyncApplicationService(repo);

    const result = await service.revokeDevice(" c-1 ");

    expect(result).toBe(true);
    expect(repo.revokeCalls).toEqual(["c-1"]);
  });

  it("propagates a false result (already revoked or in a different school) without throwing", async () => {
    const repo = new FakeDeviceSyncRepository();
    repo.revokeResult = false;
    const service = new DeviceSyncApplicationService(repo);

    const result = await service.revokeDevice("c-1");

    expect(result).toBe(false);
  });

  it("rejects an empty credential id before ever calling the repository", async () => {
    const repo = new FakeDeviceSyncRepository();
    const service = new DeviceSyncApplicationService(repo);

    await expect(service.revokeDevice("  ")).rejects.toThrow(ValidationError);
    expect(repo.revokeCalls).toHaveLength(0);
  });

  it("propagates a thrown Unauthorized rejection from the repository", async () => {
    const repo = new FakeDeviceSyncRepository();
    repo.revokeResult = "reject";
    const service = new DeviceSyncApplicationService(repo);

    await expect(service.revokeDevice("c-1")).rejects.toThrow("unauthorized");
  });
});
