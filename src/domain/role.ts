/**
 * The confirmed starting role set (Roles & Permissions milestone; see
 * `docs/product/PRODUCT-CONTRACT.md`'s RBAC section and
 * `docs/product/M8-DECISION.md`'s follow-up). Mirrors
 * `repository::role::{TEACHER,REGISTRAR,SCHOOL_HEAD}` on the Rust side
 * exactly -- these string values are what `grant_school_role`/
 * `revoke_school_role` expect for `roleName`.
 *
 * Explicitly **not** the final LIKHA role universe -- a future milestone
 * expands this (Adviser, LIS Coordinator, ICT Coordinator, Master
 * Teacher/Department Head are expected). Adding a role there means
 * widening this list plus the Rust CHECK constraint, never restructuring
 * how a role is represented.
 */
export const TEACHER = "teacher";
export const REGISTRAR = "registrar";
export const SCHOOL_HEAD = "school_head";

/** Roles grantable through `grant_school_role`/`revoke_school_role` --
 * Teacher is deliberately excluded, it is the automatic default every
 * member already has from `addUserToSchool`. */
export const GRANTABLE_ROLES = [REGISTRAR, SCHOOL_HEAD] as const;

export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  [TEACHER]: "Teacher",
  [REGISTRAR]: "Registrar",
  [SCHOOL_HEAD]: "School Head",
};

/** A teacher-facing label for a role string -- falls back to the raw
 * value for a role this app doesn't recognize yet, rather than hiding
 * it (e.g. reference data seeded ahead of this list catching up). */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
