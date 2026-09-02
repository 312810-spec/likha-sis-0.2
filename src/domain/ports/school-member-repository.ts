import type { SchoolMember } from "../school-member";

/**
 * `listMembers` is read-only reference data: every member of the
 * caller's own school. `resetPassword` (Wave 3I, ADR-0061) is this
 * port's one write: a School Head sets a new password directly for a
 * colleague in their own school. `grantRole`/`revokeRole` (Roles &
 * Permissions milestone) are this port's other writes: a School Head
 * grants or removes the Registrar or School Head role for a colleague
 * -- `role_name` must be exactly `"registrar"` or `"school_head"`
 * (matching `repository::role::{REGISTRAR,SCHOOL_HEAD}` on the Rust
 * side; Teacher is never grantable through this port, it is the
 * automatic default `addUserToSchool` already applies). `school_id` is
 * always session-derived server-side, never a parameter here --
 * matching every other same-school command in this codebase.
 */
export interface SchoolMemberRepository {
  listMembers(): Promise<SchoolMember[]>;
  /**
   * Returns `false` (not a thrown error) when `targetUserId` doesn't
   * exist or belongs to a different school -- the backend deliberately
   * collapses both into one identical outcome so neither can be used
   * to enumerate accounts in another school. A thrown `Unauthorized`
   * means the caller itself lacks the `ManageSchoolMembership`
   * capability, a different situation the UI must not conflate with a
   * bad target -- see `auth::admin_reset_teacher_password`'s doc
   * comment.
   */
  resetPassword(targetUserId: string, newPassword: string): Promise<boolean>;
  /**
   * Throws `Unauthorized` if the caller lacks `ManageRoles`, if
   * `roleName` isn't Registrar or School Head, or if `targetUserId`
   * isn't a member of the caller's own school -- see
   * `commands::user::grant_school_role`'s doc comment.
   */
  grantRole(targetUserId: string, roleName: string): Promise<void>;
  /**
   * Throws `Unauthorized` if the caller lacks `ManageRoles` or
   * `roleName` isn't Registrar or School Head. Throws
   * `CannotRemoveLastSchoolHead` (a distinct rejection, not a generic
   * failure) if this would leave the school with zero School Heads --
   * see `repository::role::revoke`'s doc comment. A no-op, not an
   * error, if `targetUserId` didn't hold `roleName` to begin with.
   */
  revokeRole(targetUserId: string, roleName: string): Promise<void>;
}
