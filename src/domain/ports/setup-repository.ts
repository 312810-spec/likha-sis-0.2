import type { CurrentSession } from "../session";

export interface InstallationStatus {
  needsSetup: boolean;
}

/**
 * Repository port for first-run bootstrap. `bootstrapInstallation` is a
 * single atomic operation on the Rust side (school + first user +
 * membership + session, all-or-nothing) — this interface deliberately
 * does not expose separate create-school/create-user/add-membership
 * steps, so UI code cannot accidentally call them out of order or leave
 * a half-configured installation. See ADR-0004 and ADR-0006.
 */
export interface SetupRepository {
  installationStatus(): Promise<InstallationStatus>;
  bootstrapInstallation(
    schoolName: string,
    username: string,
    password: string,
    displayName: string,
  ): Promise<CurrentSession>;
}
