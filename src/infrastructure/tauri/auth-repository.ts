import { invoke } from "./invoke";
import type { AuthRepository } from "../../domain/ports/auth-repository";
import type { AuditLogEntry, CurrentSession } from "../../domain/session";

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

  extendSession(): Promise<CurrentSession> {
    return invoke<CurrentSession>("extend_session");
  }

  listAuditLog(): Promise<AuditLogEntry[]> {
    return invoke<AuditLogEntry[]>("list_audit_log");
  }
}
