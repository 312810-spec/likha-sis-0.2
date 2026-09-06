/**
 * A colleague within the caller's own school -- just enough for a
 * School Head to pick a teacher when creating a Teaching Assignment
 * (Wave 2Y). `roles` may be empty (a member with no role grant yet).
 */
export interface SchoolMember {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
}

/** The three recognized role strings a School Head may grant or revoke
 * via `SchoolMemberApplicationService.grantRole`/`revokeRole` -- mirrors
 * `role::{TEACHER, REGISTRAR, SCHOOL_HEAD}` in the Rust repository
 * layer exactly (see that module's own doc comment for why this three-
 * role set is deliberately not the final LIKHA role universe). Kept as
 * a plain string union, not an enum, matching how `SchoolMember.roles`
 * itself is already typed as `string[]`. */
export const SCHOOL_MEMBER_ROLES = ["teacher", "registrar", "school_head"] as const;
