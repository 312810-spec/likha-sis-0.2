export interface Section {
  id: string;
  schoolId: string;
  schoolYear: string;
  gradeLevel: string;
  name: string;
  createdAt: string;
}

export interface SectionMembership {
  id: string;
  schoolId: string;
  sectionId: string;
  learnerId: string;
  startsOn: string;
  endsOn: string | null;
  createdAt: string;
}

export interface SectionRosterMember {
  /** `section_memberships.id` of this learner's current open membership.
   * The row a transfer or end-enrollment acts on — passed back to the Rust
   * command so it can target this exact membership and refuse (rather than
   * silently act on a different one) if the roster tab is stale. */
  membershipId: string;
  learnerId: string;
  givenName: string;
  familyName: string;
  /** LRN is optional on a learner record; `null` when not yet recorded.
   * Shown on the roster so a teacher can confirm identity and see what is
   * still missing for SF1/SF2. */
  lrn: string | null;
  /** The day this learner's current placement in the section began
   * (`YYYY-MM-DD`) — the start of the half-open membership interval. */
  startsOn: string;
}

/**
 * Result of a transfer attempt — the TS mirror of the Rust
 * `section_membership::TransferOutcome` (serde internally tagged on
 * `kind`). Every non-`transferred` case means nothing was written; the
 * Section Roster screen maps each to its own teacher-facing message and
 * recovery. None carries SQL, ids beyond the new membership, or any
 * other school's data.
 */
export type TransferResult =
  | { kind: "transferred"; membership: SectionMembership }
  /** The membership id is unknown, belongs to another school, or does not
   * match the learner — deliberately indistinguishable. */
  | { kind: "membershipNotFound" }
  /** The membership exists but is already closed: the roster tab is stale. */
  | { kind: "notCurrent" }
  /** The destination section is unknown or belongs to another school. */
  | { kind: "destinationNotFound" }
  /** The destination is the section the learner is already in. */
  | { kind: "sameSection" }
  /** The effective date precedes the day the placement began. */
  | { kind: "invalidEffectiveDate" };

/**
 * Result of an end-enrollment attempt — the TS mirror of the Rust
 * `section_membership::EndMembershipOutcome`. As with {@link TransferResult},
 * a non-`ended` case means nothing was written.
 */
export type EndEnrollmentResult =
  | { kind: "ended"; membership: SectionMembership }
  | { kind: "notFound" }
  | { kind: "notCurrent" }
  | { kind: "invalidEffectiveDate" };
