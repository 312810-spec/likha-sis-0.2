import { invoke } from "./invoke";
import type { CurrentSession } from "../../domain/session";
import type { LegacySetupRecoveryRepository } from "../../domain/ports/legacy-setup-recovery-repository";

export class TauriLegacySetupRecoveryRepository implements LegacySetupRecoveryRepository {
  available(): Promise<boolean> {
    return invoke<boolean>("legacy_setup_recovery_available");
  }

  restore(password: string): Promise<CurrentSession> {
    return invoke<CurrentSession>("restore_legacy_setup_access", { password });
  }
}
