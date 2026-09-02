import type { SchoolMemberRepository } from "../../domain/ports/school-member-repository";
import type { SchoolMember } from "../../domain/school-member";
import { invoke } from "./invoke";

/** Tauri adapter for `list_school_members` (Wave 2Y),
 * `admin_reset_teacher_password` (Wave 3I, ADR-0061), and
 * `grant_school_role`/`revoke_school_role` (Roles & Permissions
 * milestone). */
export class TauriSchoolMemberRepository implements SchoolMemberRepository {
  listMembers(): Promise<SchoolMember[]> {
    return invoke<SchoolMember[]>("list_school_members");
  }

  resetPassword(targetUserId: string, newPassword: string): Promise<boolean> {
    return invoke<boolean>("admin_reset_teacher_password", { targetUserId, newPassword });
  }

  grantRole(targetUserId: string, roleName: string): Promise<void> {
    return invoke<void>("grant_school_role", { targetUserId, roleName });
  }

  revokeRole(targetUserId: string, roleName: string): Promise<void> {
    return invoke<void>("revoke_school_role", { targetUserId, roleName });
  }
}
