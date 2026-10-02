/** Installation-wide backup and first-run recovery. Native authorization is required. */
export interface BackupRepository {
  create(password: string): Promise<string | null>;
  stageRecovery(password: string): Promise<boolean>;
}
