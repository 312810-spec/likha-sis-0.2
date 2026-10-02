import type { BackupRepository } from "../domain/ports/backup-repository";
import { ValidationError } from "../domain/errors";

const FAILURE_MESSAGES: Record<string, string> = {
  unauthorized: "Only a School Head for every school on this computer can create a full backup.",
  already_initialized:
    "Recovery is available only before setup on a new installation. If recovery is already ready, close and reopen LIKHA-SIS.",
  backup_invalid:
    "The recovery password is incorrect, or the backup is damaged or unsupported. Check the password and try again.",
  backup_destination_exists: "That file already exists. Choose a new backup filename.",
  backup_too_large: "This backup exceeds the current 256 MiB database limit.",
  backup_password_invalid: "Use a recovery password of 12 to 1024 characters.",
};

export class BackupApplicationService {
  constructor(private readonly repository: BackupRepository) {}

  private validate(password: string, confirmation: string) {
    if (Array.from(password).length < 12 || Array.from(password).length > 1024) {
      throw new ValidationError("Use a recovery password of 12 to 1024 characters.");
    }
    if (password !== confirmation) throw new ValidationError("Recovery passwords do not match.");
  }

  private failure(error: unknown): never {
    throw new ValidationError(
      FAILURE_MESSAGES[String(error)] ??
        "Could not complete the backup operation. Your current records are preserved. Check available disk space and try again.",
    );
  }

  async create(password: string, confirmation: string): Promise<string | null> {
    this.validate(password, confirmation);
    try {
      return await this.repository.create(password);
    } catch (error) {
      this.failure(error);
    }
  }

  async stageRecovery(password: string, confirmation: string): Promise<boolean> {
    this.validate(password, confirmation);
    try {
      return await this.repository.stageRecovery(password);
    } catch (error) {
      this.failure(error);
    }
  }
}
