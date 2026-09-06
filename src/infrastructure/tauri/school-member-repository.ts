import type { SchoolMemberRepository } from "../../domain/ports/school-member-repository";
import type { SchoolMember } from "../../domain/school-member";
import { invoke } from "./invoke";

/** Tauri adapter for `list_school_members` (Wave 2Y),
 * `admin_reset_teacher_password` (Wave 3I, ADR-0061), and
 * `remove_school_member` (School Membership Removal). */
export class TauriSchoolMemberRepository implements SchoolMemberRepository {
  listMembers(): Promise<SchoolMember[]> {
    return invoke<SchoolMember[]>("list_school_members");
  }

  resetPassword(targetUserId: string, newPassword: string): Promise<boolean> {
    return invoke<boolean>("admin_reset_teacher_password", { targetUserId, newPassword });
  }

  removeMember(targetUserId: string): Promise<boolean> {
    return invoke<boolean>("remove_school_member", { targetUserId });
  }

  grantRole(targetUserId: string, role: string): Promise<boolean> {
    return invoke<boolean>("grant_school_member_role", { targetUserId, role });
  }

  revokeRole(targetUserId: string, role: string): Promise<boolean> {
    return invoke<boolean>("revoke_school_member_role", { targetUserId, role });
  }
}
