import { ValidationError } from "../domain/errors";
import { MIN_PASSWORD_LENGTH } from "../domain/password-policy";
import type { SchoolMemberRepository } from "../domain/ports/school-member-repository";
import { GRANTABLE_ROLES } from "../domain/role";
import type { SchoolMember } from "../domain/school-member";

/** `listMembers` takes no input to validate, matching every other
 * same-school reference-data read in this codebase. `resetPassword`
 * (Wave 3I, ADR-0061) validates shape/length only -- the same
 * `MIN_PASSWORD_LENGTH` floor `UserApplicationService`/
 * `SetupApplicationService` already share, a UX convenience only; the
 * backend stays authoritative on who is allowed to call this at all.
 * `grantRole`/`revokeRole` (Roles & Permissions milestone) validate only
 * that `roleName` is one of `GRANTABLE_ROLES` -- a UX convenience so an
 * obviously-wrong call fails locally with a clear message instead of a
 * round trip; the backend independently re-validates and stays
 * authoritative on who is allowed to call this at all. */
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

  /** `async`, not a plain `Promise`-returning method, so that
   * `validatedTarget`/`validatedRole` throwing surfaces as a rejected
   * promise rather than a synchronous throw -- the exact bug class M13
   * caught in `computeTermGrade` (see that milestone's own consequences
   * note): a caller doing `service.grantRole(...).catch(...)` must never
   * need a surrounding `try` as well. */
  async grantRole(targetUserId: string, roleName: string): Promise<void> {
    return this.schoolMembers.grantRole(
      this.validatedTarget(targetUserId),
      this.validatedRole(roleName),
    );
  }

  async revokeRole(targetUserId: string, roleName: string): Promise<void> {
    return this.schoolMembers.revokeRole(
      this.validatedTarget(targetUserId),
      this.validatedRole(roleName),
    );
  }

  private validatedTarget(targetUserId: string): string {
    const target = targetUserId.trim();
    if (target.length === 0) {
      throw new ValidationError("A member must be selected.");
    }
    return target;
  }

  private validatedRole(roleName: string): string {
    if (!GRANTABLE_ROLES.includes(roleName as (typeof GRANTABLE_ROLES)[number])) {
      throw new ValidationError("Not a role that can be granted or revoked here.");
    }
    return roleName;
  }
}
