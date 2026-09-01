import type { User } from "../user";

/**
 * Account/membership operations. `registerUser` is deliberately
 * unauthenticated on the Rust side (bootstrap only, see ADR-0004);
 * `addUserToSchool` and `adminResetPassword` are session-gated,
 * capability-checked writes (`ManageSchoolMembership`, School Head only)
 * — see `docs/adr/0036-rbac-foundation.md` and
 * `docs/adr/0057-admin-assisted-password-reset.md`.
 */
export interface UserRepository {
  registerUser(username: string, password: string, displayName: string): Promise<User>;
  addUserToSchool(userId: string, schoolId: string): Promise<void>;
  /** Wave 3I: a School Head sets a colleague's LIKHA login password
   * directly (no forced-change-at-next-login flag — see ADR-0057's
   * 10-scenario decision). The backend independently re-verifies the
   * caller is a School Head and that `targetUserId` belongs to their own
   * school before any write. */
  adminResetPassword(targetUserId: string, newPassword: string): Promise<void>;
}
