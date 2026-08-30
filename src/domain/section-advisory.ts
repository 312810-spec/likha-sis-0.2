/** Mirrors Rust's `section_advisory::SectionAdvisory` exactly -- one
 * span of "this teacher advised this section." `endsOn: null` means
 * still active, the same half-open-interval shape
 * `section_membership::SectionMembership` already established. */
export interface SectionAdvisory {
  id: string;
  schoolId: string;
  sectionId: string;
  teacherUserId: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
}

/** Mirrors Rust's `AssignAdviserOutcome`
 * (`#[serde(tag = "kind", rename_all = "camelCase")]`) exactly. A
 * non-`assigned` variant means nothing was written -- the caller maps
 * each to a distinct message, never exposing SQL or ids. */
export type AssignAdviserOutcome =
  | { kind: "assigned"; advisory: SectionAdvisory }
  | { kind: "unknownSection" }
  | { kind: "unknownTeacher" }
  | { kind: "alreadyHasAnActiveAdviser" };

/** Mirrors Rust's `EndAdvisoryOutcome`
 * (`#[serde(tag = "kind", rename_all = "camelCase")]`) exactly. */
export type EndAdvisoryOutcome =
  { kind: "ended"; advisory: SectionAdvisory } | { kind: "notFound" };
