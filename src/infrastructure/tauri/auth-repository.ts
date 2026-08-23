import { invoke } from "@tauri-apps/api/core";
import type { AuthRepository } from "../../domain/ports/auth-repository";
import type { CurrentSession } from "../../domain/session";

/** Tauri implementation of {@link AuthRepository}. */
export class TauriAuthRepository implements AuthRepository {
  login(username: string, password: string, schoolId: string): Promise<CurrentSession> {
    return invoke<CurrentSession>("login", { username, password, schoolId });
  }

  logout(): Promise<void> {
    return invoke<void>("logout");
  }

  currentSession(): Promise<CurrentSession | null> {
    return invoke<CurrentSession | null>("current_session");
  }
}
