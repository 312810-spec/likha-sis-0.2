import { ValidationError } from "../domain/errors";
import { MIN_PASSWORD_LENGTH } from "../domain/password-policy";
import type { InstallationStatus, SetupRepository } from "../domain/ports/setup-repository";
import type { CurrentSession } from "../domain/session";

const MAX_NAME_LENGTH = 100;

/**
 * Orchestrates first-run setup. `confirmPassword` never leaves this
 * layer — it exists purely to catch a mistyped password before it's
 * hashed, and is not part of the repository/IPC call at all.
 */
export class SetupApplicationService {
  constructor(private readonly setup: SetupRepository) {}

  installationStatus(): Promise<InstallationStatus> {
    return this.setup.installationStatus();
  }

  async completeSetup(input: {
    schoolName: string;
    username: string;
    displayName: string;
    password: string;
    confirmPassword: string;
  }): Promise<CurrentSession> {
    const schoolName = input.schoolName.trim();
    const username = input.username.trim();
    const displayName = input.displayName.trim();

    if (schoolName.length === 0) {
      throw new ValidationError("Enter your school's name.");
    }
    if (schoolName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`School name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (displayName.length === 0) {
      throw new ValidationError("Enter your name.");
    }
    if (displayName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (username.length === 0) {
      throw new ValidationError("Choose a username.");
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (input.password !== input.confirmPassword) {
      throw new ValidationError("Passwords do not match.");
    }

    return this.setup.bootstrapInstallation(schoolName, username, input.password, displayName);
  }
}
