/**
 * The confirmed starting role set (Roles & Permissions milestone; see
 * `docs/product/PRODUCT-CONTRACT.md`'s RBAC section and
 * `docs/product/M8-DECISION.md`'s follow-up). Mirrors
 * `repository::role::{TEACHER,REGISTRAR,SCHOOL_HEAD}` on the Rust side
 * exactly -- these string values are what `grant_school_role`/
 * `revoke_school_role` expect for `roleName`. These three remain the
 * only roles with any actual authorization wiring
 * (`auth::Capability::allowed_roles` on the Rust side) -- see
 * `EXTENDED_ROLES` below for the roles migration 25 made grantable but
 * deliberately left unwired.
 */
export const TEACHER = "teacher";
export const REGISTRAR = "registrar";
export const SCHOOL_HEAD = "school_head";

/**
 * The project owner's confirmed full role taxonomy (2026-09-02),
 * widened into the Rust CHECK constraint by migration 25 -- see
 * `docs/adr/0065-eight-role-taxonomy-foundation.md`. **Foundation
 * only**: each of these is grantable through `grant_school_role`/
 * `revoke_school_role` today, but none has any `Capability` variant or
 * command gate wired to it yet -- most map to forms/tools (IPCRF,
 * Department Grade Sheets, Certificate of Observation/COT, EBEIS/LIS
 * exports, Form 48 DTR, Inventory Tagging, SF8 clinic logs) that do not
 * exist as features in this app yet.
 */
export const MASTER_TEACHER = "master_teacher";
export const CLASS_ADVISER = "class_adviser";
export const SUBJECT_TEACHER = "subject_teacher";
export const ICT_COORDINATOR = "ict_coordinator";
export const ADMIN_OFFICER = "admin_officer";
export const PROPERTY_CUSTODIAN = "property_custodian";
export const HEALTH_OFFICER = "health_officer";

/** Roles grantable through `grant_school_role`/`revoke_school_role` --
 * Teacher is deliberately excluded, it is the automatic default every
 * member already has from `addUserToSchool`. Mirrors
 * `repository::role::is_grantable` on the Rust side exactly. */
export const GRANTABLE_ROLES = [
  REGISTRAR,
  SCHOOL_HEAD,
  MASTER_TEACHER,
  CLASS_ADVISER,
  SUBJECT_TEACHER,
  ICT_COORDINATOR,
  ADMIN_OFFICER,
  PROPERTY_CUSTODIAN,
  HEALTH_OFFICER,
] as const;

export type GrantableRole = (typeof GRANTABLE_ROLES)[number];

/** The 7 roles migration 25 made grantable but that have no
 * `Capability`/command gate wired to anything yet -- see the doc
 * comment above. A UI offering these for grant must disclose that
 * granting one records the responsibility without unlocking any new
 * screen or permission today, the same way this app discloses what an
 * official-form export omits. */
const FOUNDATION_ONLY_ROLES: readonly string[] = [
  MASTER_TEACHER,
  CLASS_ADVISER,
  SUBJECT_TEACHER,
  ICT_COORDINATOR,
  ADMIN_OFFICER,
  PROPERTY_CUSTODIAN,
  HEALTH_OFFICER,
];

export function isFoundationOnlyRole(role: string): boolean {
  return FOUNDATION_ONLY_ROLES.includes(role);
}

const ROLE_LABELS: Record<string, string> = {
  [TEACHER]: "Teacher",
  [REGISTRAR]: "Registrar",
  [SCHOOL_HEAD]: "School Head",
  [MASTER_TEACHER]: "Head / Master Teacher",
  [CLASS_ADVISER]: "Class Adviser",
  [SUBJECT_TEACHER]: "Subject Teacher",
  [ICT_COORDINATOR]: "ICT Coordinator",
  [ADMIN_OFFICER]: "Admin Officer / ADAS",
  [PROPERTY_CUSTODIAN]: "Property Custodian",
  [HEALTH_OFFICER]: "Health Officer",
};

/** A teacher-facing label for a role string -- falls back to the raw
 * value for a role this app doesn't recognize yet, rather than hiding
 * it (e.g. reference data seeded ahead of this list catching up). */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
