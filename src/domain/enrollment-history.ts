/** A teacher-facing projection of one retained section placement. */
export interface EnrollmentHistoryEntry {
  membershipId: string;
  sectionName: string | null;
  gradeLevel: string | null;
  schoolYear: string | null;
  startsOn: string;
  endsOn: string | null;
}
