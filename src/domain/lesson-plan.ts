/** Teacher-provided source metadata; not a claim of official verification. */
export interface LessonSourceReference {
  title: string;
  version: string;
  citation: string;
  curriculumName: string;
  term: string;
  /** Explicit teacher declaration; absent means subject/year applicability is unknown. */
  scope?: { schoolYear: string; subjectId: string };
  /** Exact local source-file identity; never an official-approval assertion. */
  artifactId?: string;
  /** Teacher-declared inclusive window; not a verified official term calendar. */
  applicableDates?: { startsOn: string; endsOn: string };
}

/** Exact locally stored source bytes and their integrity fingerprint. */
export interface LessonSourceArtifact {
  id: string;
  fileName: string;
  mediaType: string;
  byteLength: number;
  sha256: string;
  ingestedByUserId: string;
  ingestedByName?: string | null;
  createdAt: string;
  alreadyImported: boolean;
}

/** Append-only lineage for a teacher-authored source correction. */
export interface LessonSourceAmendment {
  id: string;
  lessonPlanId: string;
  previousSourceReference?: LessonSourceReference | null;
  newSourceReference: LessonSourceReference;
  reason: string;
  amendedByUserId: string;
  amendedByName?: string | null;
  createdAt: string;
}

/** Class context captured at creation; absent for plans saved before context capture. */
interface LessonTeachingContext {
  schoolYear: string;
  gradeLevel: string;
  sectionId: string;
  sectionName: string;
  subjectId: string;
  subjectName: string;
}

/**
 * A structured lesson plan authored under the "ILAW" format --
 * Intentions, Learning Experiences, Assessment, Ways Forward -- per
 * DepEd Order No. 16, s. 2026 (researched via WebSearch this session,
 * medium-high confidence: multiple consistent secondary sources
 * describing an official DepEd issuance, no primary deped.gov.ph fetch
 * attempted; see `docs/CURRENT-HANDOFF.md` for the full research
 * record). Mirrors Rust's `repository::lesson_plan::LessonPlan` exactly.
 * This is the teacher's own planning tool, not an official DepEd form
 * output -- no PDF export in this slice.
 */
export interface LessonPlan {
  id: string;
  schoolId: string;
  teachingAssignmentId: string;
  planDate: string;
  teachingContext?: LessonTeachingContext | null;
  sourceReference?: LessonSourceReference | null;
  /** Intentions: the DepEd learning competency text (from the MATATAG
   * Curriculum Guide). */
  learningCompetency: string;
  /** Intentions: the competency code, entered by the teacher as free
   * text -- deliberately not resolved against `curriculum_learning_areas`
   * (see the migration's own doc comment for why). */
  learningCompetencyCode: string;
  /** Intentions: 2-3 specific measurable learning objectives, one per
   * line. */
  learningObjectives: string;
  /** Intentions: how this lesson connects to previous learning. */
  connectionToPreviousLearning: string;
  /** Learning Experiences: the planned classroom activities/tasks. */
  learningExperiences: string;
  /** Assessment: how evidence of learning is collected and checked. */
  assessment: string;
  /** Ways Forward: reflection/next-steps -- this section's exact
   * DepEd sub-structure was not confirmed this session; treated
   * conservatively as free text. */
  waysForward: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** The ILAW fields a teacher supplies from the authoring screen, shared
 * by `create` and `update` -- mirrors Rust's `LessonPlanFields`. */
export interface LessonPlanFields {
  learningCompetency: string;
  learningCompetencyCode: string;
  learningObjectives: string;
  connectionToPreviousLearning: string;
  learningExperiences: string;
  assessment: string;
  waysForward: string;
}
