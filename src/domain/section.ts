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
  learnerId: string;
  givenName: string;
  familyName: string;
}

/** One learner's membership in one section, over one span of time. The
 * inverse of `SectionRosterMember`: that answers "who is on this
 * section's roster," this answers "where has this learner been
 * enrolled." */
export interface LearnerEnrollmentHistoryEntry {
  membershipId: string;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  gradeLevel: string;
  startsOn: string;
  endsOn: string | null;
}
