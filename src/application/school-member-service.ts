import { ValidationError } from "../domain/errors";
import { MIN_PASSWORD_LENGTH } from "../domain/password-policy";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import { SCHOOL_MEMBER_ROLES, type SchoolMember } from "../domain/school-member";

function validateTargetAndRole(
  targetUserId: string,
  role: string,
): { target: string; role: string } {
  const target = targetUserId.trim();
  if (target.length === 0) {
    throw new ValidationError("A member must be selected.");
  }
  const trimmedRole = role.trim();
  if (!(SCHOOL_MEMBER_ROLES as readonly string[]).includes(trimmedRole)) {
    throw new ValidationError("Not a recognized role.");
  }
  return { target, role: trimmedRole };
}

/** `listMembers` takes no input to validate, matching every other
 * same-school reference-data read in this codebase. `resetPassword`
 * (Wave 3I, ADR-0061) validates shape/length only -- the same
 * `MIN_PASSWORD_LENGTH` floor `UserApplicationService`/
 * `SetupApplicationService` already share, a UX convenience only; the
 * backend stays authoritative on who is allowed to call this at all. */
export class SchoolMemberApplicationService {
  constructor(private readonly schoolMembers: SchoolMemberRepository) {}

  listMembers(): Promise<SchoolMember[]> {
    return this.schoolMembers.listMembers();
  }

  async resetPassword(targetUserId: string, newPassword: string): Promise<boolean> {
    const target = targetUserId.trim();
    if (target.length === 0) {
      throw new ValidationError("A teacher must be selected.");
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    return this.schoolMembers.resetPassword(target, newPassword);
  }

  async removeMember(targetUserId: string): Promise<boolean> {
    const target = targetUserId.trim();
    if (target.length === 0) {
      throw new ValidationError("A member must be selected.");
    }
    return this.schoolMembers.removeMember(target);
  }

  async grantRole(targetUserId: string, role: string): Promise<boolean> {
    const { target, role: validRole } = validateTargetAndRole(targetUserId, role);
    return this.schoolMembers.grantRole(target, validRole);
  }

  async revokeRole(targetUserId: string, role: string): Promise<boolean> {
    const { target, role: validRole } = validateTargetAndRole(targetUserId, role);
    return this.schoolMembers.revokeRole(target, validRole);
  }
}
