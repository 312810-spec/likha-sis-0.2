import type { CurrentSession } from "../session";

export interface LegacySetupRecoveryRepository {
  available(): Promise<boolean>;
  restore(password: string): Promise<CurrentSession>;
}
