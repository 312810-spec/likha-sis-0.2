/** A teaching assignment as written -- no joined names. Returned by
 * `create` (Wave 2Y), which a caller already knows the section/subject/
 * teacher for; a listing screen wants `TeachingAssignmentDetail` below
 * instead. */
export interface TeachingAssignment {
  id: string;
  teacherUserId: string;
  sectionId: string;
  subjectId: string;
}

/** A teaching assignment joined with the names a management screen
 * needs, without a separate round trip per row -- mirrors the Rust
 * `TeachingAssignmentDetail` shape exactly. */
export interface TeachingAssignmentDetail {
  id: string;
  teacherUserId: string;
  sectionId: string;
  sectionName: string;
  schoolYear: string;
  subjectId: string;
  subjectName: string;
}
