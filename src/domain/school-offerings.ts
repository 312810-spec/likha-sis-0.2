export interface OfferingInput {
  previousId: string | null;
  schoolYear: string;
  gradeLevel: string;
  subjectId: string;
  cohort: string;
  termLabel: string;
  effectiveFrom: string;
  effectiveUntil: string;
  weeklyMinutes: number;
  sourceTitle: string;
  sourceReference: string;
  verificationState: "draft" | "school_confirmed";
  profileManifestJson: string;
}
export interface SchoolOffering {
  id: string;
  input: OfferingInput;
  snapshotHash: string;
  createdAt: string;
}
