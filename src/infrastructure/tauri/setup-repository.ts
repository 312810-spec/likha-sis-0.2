import { invoke } from "./invoke";
import type { InstallationStatus, SetupRepository } from "../../domain/ports/setup-repository";
import type { CurrentSession } from "../../domain/session";

/** Tauri implementation of {@link SetupRepository}. */
export class TauriSetupRepository implements SetupRepository {
  installationStatus(): Promise<InstallationStatus> {
    return invoke<InstallationStatus>("installation_status");
  }

  bootstrapInstallation(
    schoolName: string,
    username: string,
    password: string,
    displayName: string,
  ): Promise<CurrentSession> {
    return invoke<CurrentSession>("bootstrap_installation", {
      schoolName,
      username,
      password,
      displayName,
    });
  }
}
