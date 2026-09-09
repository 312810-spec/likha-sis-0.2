/**
 * The permanent Master Teacher review hierarchy (ADR-0089, Batch 17).
 * Mirrors `repository::teacher_oversight_assignment::TeacherOversightAssignment`
 * exactly -- a half-open-interval, school-scoped span of "this Master
 * Teacher oversees this teacher." `endsOn: null` means still active, the
 * same shape `SectionAdvisory` already established.
 */
export interface TeacherOversightAssignment {
  id: string;
  schoolId: string;
  masterTeacherUserId: string;
  teacherUserId: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
}

/** Mirrors Rust's `AssignOversightOutcome`
 * (`#[serde(tag = "kind", rename_all = "camelCase")]`) exactly. A
 * non-`assigned` variant means nothing was written -- the caller maps
 * each to a distinct message, never exposing SQL or ids. */
export type AssignOversightOutcome =
  | { kind: "assigned"; assignment: TeacherOversightAssignment }
  | { kind: "unknownMasterTeacher" }
  | { kind: "unknownTeacher" }
  | { kind: "notAMasterTeacher" }
  | { kind: "cannotOverseeSelf" }
  | { kind: "alreadyHasAnActiveOverseer" };

/** Mirrors Rust's `EndOversightOutcome`
 * (`#[serde(tag = "kind", rename_all = "camelCase")]`) exactly. */
export type EndOversightOutcome =
  { kind: "ended"; assignment: TeacherOversightAssignment } | { kind: "notFound" };
