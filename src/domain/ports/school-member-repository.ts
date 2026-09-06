import type { SchoolMember } from "../school-member";

/**
 * `listMembers` is read-only reference data: every member of the
 * caller's own school. `resetPassword` (Wave 3I, ADR-0061) is this
 * port's one write: a School Head sets a new password directly for a
 * colleague in their own school. `school_id` is always session-derived
 * server-side, never a parameter here -- matching every other
 * same-school command in this codebase.
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
   * Revokes `targetUserId`'s membership (and every role they held) in
   * the caller's own school, effective immediately -- their existing
   * sessions in that school are revoked too. Returns `false` (not a
   * thrown error) when `targetUserId` doesn't exist, isn't a member of
   * the caller's school, or when removing them would leave the school
   * with zero School Heads -- the same enumeration-safety/fail-closed
   * shape `resetPassword` already uses. A thrown `Unauthorized` means
   * the caller itself lacks the `ManageSchoolMembership` capability --
   * see `auth::remove_school_member`'s doc comment.
   */
  removeMember(targetUserId: string): Promise<boolean>;
  /**
   * Grants `targetUserId` an ADDITIONAL role in the caller's own
   * school, on top of whatever they already hold -- e.g. promoting a
   * Teacher to also hold Registrar. Returns `false` (not a thrown
   * error) when `targetUserId` doesn't exist or isn't a member of the
   * caller's school, matching `removeMember`'s enumeration-safety
   * shape. A thrown `Unauthorized` means the caller itself lacks the
   * `ManageSchoolMembership` capability -- see
   * `auth::grant_school_member_role`'s doc comment.
   */
  grantRole(targetUserId: string, role: string): Promise<boolean>;
  /**
   * Revokes one role from `targetUserId` in the caller's own school,
   * leaving their membership and any other role intact. Returns
   * `false` (not a thrown error) when `targetUserId` doesn't exist,
   * isn't a member of the caller's school, never held `role` there, or
   * when revoking `school_head` would leave the school with zero
   * School Heads -- the same fail-closed shape `removeMember` already
   * uses for the analogous case. A thrown `Unauthorized` means the
   * caller itself lacks the `ManageSchoolMembership` capability -- see
   * `auth::revoke_school_member_role`'s doc comment.
   */
  revokeRole(targetUserId: string, role: string): Promise<boolean>;
}
