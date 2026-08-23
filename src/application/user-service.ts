import { ValidationError } from "../domain/errors";
import type { UserRepository } from "../domain/ports/user-repository";
import type { User } from "../domain/user";
import { MIN_PASSWORD_LENGTH } from "../domain/password-policy";

const MAX_NAME_LENGTH = 100;

/**
 * Bootstrap use cases only (account/membership creation) — see
 * `UserRepository` and ADR-0004 for why these are unauthenticated on the
 * Rust side.
 */
export class UserApplicationService {
  constructor(private readonly users: UserRepository) {}

  async registerUser(username: string, password: string, displayName: string): Promise<User> {
    const trimmedUsername = username.trim();
    const trimmedDisplayName = displayName.trim();
    if (trimmedUsername.length === 0) {
      throw new ValidationError("Username must not be empty.");
    }
    if (trimmedDisplayName.length === 0) {
      throw new ValidationError("Display name must not be empty.");
    }
    if (trimmedDisplayName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Display name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    return this.users.registerUser(trimmedUsername, password, trimmedDisplayName);
  }

  addUserToSchool(userId: string, schoolId: string): Promise<void> {
    return this.users.addUserToSchool(userId, schoolId);
  }
}
