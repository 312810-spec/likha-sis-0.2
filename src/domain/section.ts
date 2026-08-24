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
