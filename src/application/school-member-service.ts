import { ValidationError } from "../domain/errors";
import { MIN_PASSWORD_LENGTH } from "../domain/password-policy";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import type { SchoolMember } from "../domain/school-member";

/** `listMembers` takes no input to validate, matching every other
 * same-school reference-data read in this codebase. `resetPassword`
 * (Wave 3N, ADR-0060) validates shape/length only -- the same
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
}
