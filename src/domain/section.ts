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
  /** LRN is optional on a learner record; `null` when not yet recorded.
   * Shown on the roster so a teacher can confirm identity and see what is
   * still missing for SF1/SF2. */
  lrn: string | null;
  /** The day this learner's current placement in the section began
   * (`YYYY-MM-DD`) — the start of the half-open membership interval. */
  startsOn: string;
}
