import type { LegacySetupRecoveryRepository } from "../domain/ports/legacy-setup-recovery-repository";
import { ValidationError } from "../domain/errors";

export class LegacySetupRecoveryApplicationService {
  constructor(private readonly repository: LegacySetupRecoveryRepository) {}

  available() {
    return this.repository.available();
  }

  restore(password: string) {
    if (!password.length) throw new ValidationError("Enter your current password.");
    return this.repository.restore(password);
  }
}
