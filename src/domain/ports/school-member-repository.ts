import type { SchoolMember } from "../school-member";

/**
 * `listMembers` is read-only reference data: every member of the
 * caller's own school. `resetPassword` (Wave 3I, ADR-0057) is this
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
}
