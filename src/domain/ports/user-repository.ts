import type { User } from "../user";

/**
 * Bootstrap operations only (account/membership creation) — deliberately
 * unauthenticated on the Rust side, see ADR-0004. Every operation that
 * touches existing tenant data lives behind a different, session-gated
 * repository instead.
 */
export interface UserRepository {
  registerUser(username: string, password: string, displayName: string): Promise<User>;
  addUserToSchool(userId: string, schoolId: string): Promise<void>;
}
