import type { AuditLogEntry, CurrentSession } from "../session";

/**
 * Repository port for authentication. The real enforcement of "is this
 * login allowed" happens server-side (Rust) — this interface only
 * describes the shape UI/application code depends on.
 */
export interface AuthRepository {
  login(username: string, password: string, schoolId: string): Promise<CurrentSession>;
  logout(): Promise<void>;
  currentSession(): Promise<CurrentSession | null>;
  /** Slides the idle-timeout window forward, the same way any other
   * protected command does, with no other side effect — for a teacher
   * dismissing the "session expiring soon" warning. Returns the
   * refreshed session (a new `idleExpiresAtUnixMs`). See ADR-0026. */
  extendSession(): Promise<CurrentSession>;
  /** Recent authentication events for the caller's own school — school
   * scope is always session-derived, never a parameter, same convention
   * as every other repository port. */
  listAuditLog(): Promise<AuditLogEntry[]>;
}
