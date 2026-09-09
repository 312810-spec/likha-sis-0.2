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

/** The recognized role strings a School Head may grant or revoke via
 * `SchoolMemberApplicationService.grantRole`/`revokeRole` -- mirrors
 * `role::{TEACHER, REGISTRAR, SCHOOL_HEAD, MASTER_TEACHER}` in the Rust
 * repository layer exactly (see that module's own doc comment for why
 * this role set is deliberately not the final LIKHA role universe).
 * `master_teacher` was added in Batch 17 (ADR-0089) -- a School Head
 * must be able to grant it here before assigning someone as a teacher's
 * oversight overseer (`OversightAssignmentScreen`), since
 * `teacher_oversight_assignment::assign` structurally rejects a proposed
 * overseer who does not already hold this role. Kept as a plain string
 * union, not an enum, matching how `SchoolMember.roles` itself is
 * already typed as `string[]`. */
export const SCHOOL_MEMBER_ROLES = [
  "teacher",
  "registrar",
  "school_head",
  "master_teacher",
] as const;
