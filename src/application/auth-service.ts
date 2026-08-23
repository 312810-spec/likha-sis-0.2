import { ValidationError } from "../domain/errors";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { CurrentSession } from "../domain/session";

/**
 * Orchestrates login/logout/session-lookup. This layer's checks are a
 * convenience for the UI (a fast, friendly message before ever calling
 * Rust) — the real authorization enforcement is entirely server-side; see
 * ADR-0004 and the Rust integration tests that prove rejection happens
 * even with nothing on this side checking anything.
 */
export class AuthApplicationService {
  constructor(private readonly auth: AuthRepository) {}

  async login(username: string, password: string, schoolId: string): Promise<CurrentSession> {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length === 0) {
      throw new ValidationError("Username must not be empty.");
    }
    if (password.length === 0) {
      throw new ValidationError("Password must not be empty.");
    }
    if (schoolId.trim().length === 0) {
      throw new ValidationError("A school must be selected.");
    }
    return this.auth.login(trimmedUsername, password, schoolId);
  }

  logout(): Promise<void> {
    return this.auth.logout();
  }

  currentSession(): Promise<CurrentSession | null> {
    return this.auth.currentSession();
  }
}
