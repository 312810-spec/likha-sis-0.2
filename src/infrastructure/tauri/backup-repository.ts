import { open, save } from "@tauri-apps/plugin-dialog";
import type { BackupRepository } from "../../domain/ports/backup-repository";
import { invoke } from "./invoke";

export class TauriBackupRepository implements BackupRepository {
  async create(password: string): Promise<string | null> {
    const filePath = await save({
      title: "Save a full LIKHA-SIS backup",
      defaultPath: `LIKHA-SIS-${new Date().toISOString().slice(0, 10)}.likhabak`,
      filters: [{ name: "Encrypted LIKHA-SIS backup", extensions: ["likhabak"] }],
    });
    if (!filePath) return null;
    await invoke<void>("create_portable_backup", { filePath, password });
    return filePath;
  }

  async stageRecovery(password: string): Promise<boolean> {
    const filePath = await open({
      title: "Choose your LIKHA-SIS backup",
      multiple: false,
      directory: false,
      filters: [{ name: "Encrypted LIKHA-SIS backup", extensions: ["likhabak"] }],
    });
    if (typeof filePath !== "string") return false;
    await invoke<void>("stage_portable_recovery", { filePath, password });
    return true;
  }
}
