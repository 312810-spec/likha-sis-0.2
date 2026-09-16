export interface TeacherClassWorkContext {
  /** Canonical identifier used by trusted application/repository commands. */
  teachingAssignmentId: string;

  /**
   * Friendly labels copied from the already-authorized read model that opened
   * the workspace. They are presentation hints only; they never replace
   * trusted assignment/section/subject validation below the UI.
   */
  subjectName: string;
  sectionName: string;

  /** Optional schedule occurrence that led the teacher into the workspace. */
  startsAt?: string;
  endsAt?: string;
  room?: string | null;
}

export interface AdvisoryWorkContext {
  /**
   * Navigation pointer only. Every use must first be revalidated through the
   * adviser-authorized section list; it never grants access by itself.
   */
  sectionId: string;
}
