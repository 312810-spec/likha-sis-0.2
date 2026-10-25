import { invoke } from "@tauri-apps/api/core";
import { beforeEach, expect, it, vi } from "vitest";
import { TauriLegacySetupRecoveryRepository } from "./legacy-setup-recovery-repository";
import { LegacySetupRecoveryApplicationService } from "../../application/legacy-setup-recovery-service";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());
it("availability has no caller-controlled identity or school", async () => {
  vi.mocked(invoke).mockResolvedValue(true);
  expect(await new TauriLegacySetupRecoveryRepository().available()).toBe(true);
  expect(invoke).toHaveBeenCalledExactlyOnceWith("legacy_setup_recovery_available");
});
it("restore passes only the exact password, without trimming or supplied roles", async () => {
  vi.mocked(invoke).mockResolvedValue({ roles: ["school_head"] });
  await new TauriLegacySetupRecoveryRepository().restore(" synthetic secret ");
  expect(invoke).toHaveBeenCalledExactlyOnceWith("restore_legacy_setup_access", {
    password: " synthetic secret ",
  });
});
it("blank password cannot invoke restoration", () => {
  const repository = { available: vi.fn(), restore: vi.fn() };
  expect(() => new LegacySetupRecoveryApplicationService(repository).restore("")).toThrow(
    "Enter your current password",
  );
  expect(repository.restore).not.toHaveBeenCalled();
});
