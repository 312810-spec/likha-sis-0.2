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
  | { kind: "invalidEffectiveDate" }
  /** The effective date equals the source membership's start day — a
   * zero-length interval, rejected under the Wave 2Q policy. Nothing was
   * written; no history row was deleted. */
  | { kind: "zeroLengthInterval" }
  /** A backdated effective date would strand dependent records in the
   * source section outside the resulting interval. */
  | { kind: "dependentRecordConflict"; record: DependentRecordKind };

/**
 * Result of an end-enrollment attempt — the TS mirror of the Rust
 * `section_membership::EndMembershipOutcome`. As with {@link TransferResult},
 * a non-`ended` case means nothing was written.
 */
export type EndEnrollmentResult =
  | { kind: "ended"; membership: SectionMembership }
  | { kind: "notFound" }
  | { kind: "notCurrent" }
  | { kind: "invalidEffectiveDate" }
  /** `effectiveOn` equals the membership's start day — a zero-length
   * interval, rejected under the Wave 2Q policy (starts strictly before
   * ends). No history row is deleted. */
  | { kind: "zeroLengthInterval" }
  /** A backdated `effectiveOn` would strand dependent records outside the
   * resulting interval. */
  | { kind: "dependentRecordConflict"; record: DependentRecordKind };

/**
 * Which category of membership-scoped record blocks a backdated change —
 * the TS mirror of the Rust `section_membership::DependentRecordKind`. The
 * UI names the category to the teacher; it never shows the records
 * themselves.
 */
export type DependentRecordKind = "attendance" | "grades";

/**
 * Result of an enroll attempt for an existing learner — the TS mirror of
 * the Rust `section_membership::EnrollOutcome` (serde internally tagged on
 * `kind`). Every non-`enrolled` case means the transaction wrote nothing;
 * the Section Roster screen maps each to its own teacher-facing message
 * and recovery. None carries SQL, ids beyond the caller's own school, or
 * any other school's data.
 */
export type EnrollMembershipResult =
  | { kind: "enrolled"; membership: SectionMembership }
  /** The learner id is unknown or belongs to another school. */
  | { kind: "learnerNotFound" }
  /** The section id is unknown or belongs to another school. */
  | { kind: "sectionNotFound" }
  /** The learner already holds an open membership. `currentSectionId`
   * equal to the target means "already placed here"; a different section
   * means a transfer is required — this screen routes the teacher there,
   * it never moves the learner implicitly. */
  | {
      kind: "alreadyEnrolled";
      currentMembershipId: string;
      currentSectionId: string;
    }
  /** A retained (closed or future) membership overlaps the proposed open
   * interval. */
  | { kind: "overlappingMembership" }
  /** `startsOn` is not a `YYYY-MM-DD` date. */
  | { kind: "invalidStartDate" }
  /** A backdated `startsOn` would strand dependent records in the section
   * before the new interval. */
  | { kind: "dependentRecordConflict"; record: DependentRecordKind };

/**
 * Result of a same-day placement correction — the TS mirror of the Rust
 * `section_membership::CorrectPlacementOutcome`. Fixes a placement entered
 * *today* into the wrong section: the strict half-open interval policy
 * refuses the obvious fix (a same-day transfer, which would leave a
 * zero-length interval), so this updates the same membership row's section
 * in place instead — no new membership is created, and `startsOn`/`endsOn`
 * never change. A non-`corrected` case means nothing was written.
 */
export type CorrectPlacementResult =
  | { kind: "corrected"; membership: SectionMembership }
  /** The membership id is unknown, belongs to another school, or does not
   * match the learner — deliberately indistinguishable. */
  | { kind: "notFound" }
  /** The membership exists but is no longer the open one — already ended
   * or transferred, or another correction committed first. */
  | { kind: "notCurrent" }
  /** The placement's start date is not today — this correction path only
   * ever applies to a placement entered today. */
  | { kind: "notEnteredToday" }
  /** This membership was already corrected once; a correction is a
   * one-time fix, not a repeatable edit. */
  | { kind: "alreadyCorrected" }
  /** The destination section is unknown or belongs to another school. */
  | { kind: "destinationNotFound" }
  /** The destination is the section the row is already in — nothing to
   * correct. */
  | { kind: "sameSection" }
  /** An attendance or grade record already exists for this learner in the
   * current section, so moving it now would strand that record. */
  | { kind: "dependentRecordConflict"; record: DependentRecordKind };

/**
 * A learner the current user could place into a section, plus their
 * current open membership state — the TS mirror of the Rust
 * `section_membership::EnrollmentCandidate`. `current*` fields are all
 * `null` together (eligible to place directly) or all set together
 * (enrolled somewhere).
 */
export interface EnrollmentCandidate {
  learnerId: string;
  givenName: string;
  familyName: string;
  lrn: string | null;
  currentMembershipId: string | null;
  currentSectionId: string | null;
  currentSectionName: string | null;
  currentStartsOn: string | null;
}
