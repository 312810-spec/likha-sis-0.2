/**
 * A section advisory span representing a teacher assigned as the class
 * adviser for a section -- see `docs/adr/0056-section-advisory-foundation.md`.
 * Half-open interval: `endsOn: null` means currently active.
 */
export interface SectionAdvisory {
  id: string;
  schoolId: string;
  sectionId: string;
  teacherUserId: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
}

/**
 * Outcome of assigning a section adviser.
 * Mirrors Rust's `AssignAdviserOutcome` (`#[serde(tag = "kind", rename_all = "camelCase")]`).
 */
export type AssignAdviserOutcome =
  | { kind: "assigned"; advisory: SectionAdvisory }
  | { kind: "unknownSection" }
  | { kind: "unknownTeacher" }
  | { kind: "alreadyHasAnActiveAdviser" };

/**
 * Outcome of ending a section adviser assignment.
 * Mirrors Rust's `EndAdvisoryOutcome` (`#[serde(tag = "kind", rename_all = "camelCase")]`).
 */
export type EndAdvisoryOutcome =
  { kind: "ended"; advisory: SectionAdvisory } | { kind: "notFound" };
