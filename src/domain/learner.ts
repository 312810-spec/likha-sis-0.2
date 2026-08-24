export interface Learner {
  id: string;
  schoolId: string;
  givenName: string;
  familyName: string;
  /** DepEd's national Learner Reference Number, 12 digits. `null` when not
   * yet recorded for this learner — see M17 / ADR-0017: LRN and `sex` were
   * added because this app's own SF2 and report-card exports require
   * them, not speculatively. */
  lrn: string | null;
  /** DepEd's Sex field, 'M' or 'F'. `null` when not yet recorded. */
  sex: "M" | "F" | null;
  createdAt: string;
}
