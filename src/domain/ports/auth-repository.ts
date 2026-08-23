import type { CurrentSession } from "../session";

/**
 * Repository port for authentication. The real enforcement of "is this
 * login allowed" happens server-side (Rust) — this interface only
 * describes the shape UI/application code depends on.
 */
export interface AuthRepository {
  login(username: string, password: string, schoolId: string): Promise<CurrentSession>;
  logout(): Promise<void>;
  currentSession(): Promise<CurrentSession | null>;
}
