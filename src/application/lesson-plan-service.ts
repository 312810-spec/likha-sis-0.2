import { ValidationError } from "../domain/errors";
import type {
  LessonPlan,
  LessonPlanFields,
  LessonSourceArtifact,
  LessonSourceAmendment,
  LessonSourceReference,
} from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";
import type { FilePicker } from "../domain/ports/file-picker";
import {
  parseLessonSuggestion,
  type LessonSuggestion,
  type LessonDraftReviewInput,
} from "../domain/lesson-suggestion";

const MAX_LONG_FIELD_LENGTH = 4000;

/**
 * Orchestrates the structured lesson-plan builder (Creation Studio
 * sub-scope 3/3, the "ILAW" format). School/authorization scope is
 * never a parameter here -- it comes from the caller's authenticated
 * session on the Rust side, matching `AssessmentApplicationService`'s
 * own convention.
 */
export class LessonPlanApplicationService {
  stagePlanningSuggestion(raw: string): LessonSuggestion {
    return parseLessonSuggestion(raw);
  }

  constructor(
    private readonly lessonPlans: LessonPlanRepository,
    private readonly filePicker?: FilePicker,
  ) {}

  async pickAndIngestSource(teachingAssignmentId: string): Promise<LessonSourceArtifact | null> {
    const trimmedAssignmentId = teachingAssignmentId.trim();
    if (!trimmedAssignmentId) throw new ValidationError("Teaching assignment is required.");
    if (!this.filePicker) throw new ValidationError("Source file picker is unavailable.");
    const filePath = await this.filePicker.pickLessonSourceFile();
    if (!filePath) return null;
    return this.lessonPlans.ingestSourceFile(trimmedAssignmentId, filePath);
  }

  getSourceArtifact(artifactId: string): Promise<LessonSourceArtifact | null> {
    const trimmedArtifactId = artifactId.trim();
    if (!trimmedArtifactId) throw new ValidationError("Source artifact is required.");
    return this.lessonPlans.getSourceArtifact(trimmedArtifactId);
  }

  listByAssignment(teachingAssignmentId: string): Promise<LessonPlan[]> {
    const trimmedAssignmentId = teachingAssignmentId.trim();
    if (trimmedAssignmentId.length === 0) {
      throw new ValidationError("Teaching assignment is required.");
    }
    return this.lessonPlans.listByAssignment(trimmedAssignmentId);
  }

  async create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
    sourceReference?: LessonSourceReference,
    reviewedDraft?: LessonDraftReviewInput,
  ): Promise<LessonPlan | null> {
    const trimmedAssignmentId = teachingAssignmentId.trim();
    const trimmedDate = planDate.trim();
    if (trimmedAssignmentId.length === 0) {
      throw new ValidationError("Teaching assignment is required.");
    }
    if (trimmedDate.length === 0) {
      throw new ValidationError("Plan date is required.");
    }
    const trimmedFields = validateAndTrimFields(fields);
    const source = sourceReference ? trimSource(sourceReference, trimmedDate) : undefined;
    if (reviewedDraft) {
      if (reviewedDraft.teacherConfirmed !== true) {
        throw new ValidationError("External draft requires teacher confirmation.");
      }
      const suggestion = parseLessonSuggestion(JSON.stringify(reviewedDraft.suggestion));
      return this.lessonPlans.create(trimmedAssignmentId, trimmedDate, trimmedFields, source, {
        suggestion,
        teacherConfirmed: true,
      });
    }
    return source
      ? this.lessonPlans.create(trimmedAssignmentId, trimmedDate, trimmedFields, source)
      : this.lessonPlans.create(trimmedAssignmentId, trimmedDate, trimmedFields);
  }

  async update(
    id: string,
    teachingAssignmentId: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    const trimmedId = id.trim();
    const trimmedAssignmentId = teachingAssignmentId.trim();
    if (trimmedId.length === 0) {
      throw new ValidationError("Lesson plan is required.");
    }
    if (trimmedAssignmentId.length === 0) {
      throw new ValidationError("Teaching assignment is required.");
    }
    const trimmedFields = validateAndTrimFields(fields);
    return this.lessonPlans.update(trimmedId, trimmedAssignmentId, trimmedFields);
  }

  async amendSource(
    lessonPlanId: string,
    teachingAssignmentId: string,
    sourceReference: LessonSourceReference,
    reason: string,
  ): Promise<LessonPlan | null> {
    const trimmedId = lessonPlanId.trim();
    const trimmedAssignmentId = teachingAssignmentId.trim();
    const trimmedReason = reason.trim();
    if (!trimmedId) throw new ValidationError("Lesson plan is required.");
    if (!trimmedAssignmentId) throw new ValidationError("Teaching assignment is required.");
    if (!trimmedReason || trimmedReason.length > 1000) {
      throw new ValidationError(
        "Source correction reason is required and limited to 1000 characters.",
      );
    }
    const source = trimSource(sourceReference);
    if (!source) throw new ValidationError("Corrected source reference is required.");
    return this.lessonPlans.amendSource(trimmedId, trimmedAssignmentId, source, trimmedReason);
  }

  listSourceAmendments(
    lessonPlanId: string,
    teachingAssignmentId: string,
  ): Promise<LessonSourceAmendment[]> {
    const trimmedId = lessonPlanId.trim();
    const trimmedAssignmentId = teachingAssignmentId.trim();
    if (!trimmedId) throw new ValidationError("Lesson plan is required.");
    if (!trimmedAssignmentId) throw new ValidationError("Teaching assignment is required.");
    return this.lessonPlans.listSourceAmendments(trimmedId, trimmedAssignmentId);
  }
}

/** Intentions' learning competency, learning objectives, Learning
 * Experiences, and Assessment are the substance of the plan and must
 * not be blank; the competency code, connection-to-previous-learning,
 * and Ways Forward are allowed to be empty (a teacher may not know the
 * code offhand, or may fill Ways Forward in only after teaching the
 * lesson). */
function validateAndTrimFields(fields: LessonPlanFields): LessonPlanFields {
  const trimmed: LessonPlanFields = {
    learningCompetency: fields.learningCompetency.trim(),
    learningCompetencyCode: fields.learningCompetencyCode.trim(),
    learningObjectives: fields.learningObjectives.trim(),
    connectionToPreviousLearning: fields.connectionToPreviousLearning.trim(),
    learningExperiences: fields.learningExperiences.trim(),
    assessment: fields.assessment.trim(),
    waysForward: fields.waysForward.trim(),
  };

  if (trimmed.learningCompetency.length === 0) {
    throw new ValidationError("Learning competency is required.");
  }
  if (trimmed.learningObjectives.length === 0) {
    throw new ValidationError("At least one learning objective is required.");
  }
  if (trimmed.learningExperiences.length === 0) {
    throw new ValidationError("Learning experiences are required.");
  }
  if (trimmed.assessment.length === 0) {
    throw new ValidationError("Assessment is required.");
  }

  for (const [label, value] of Object.entries(trimmed)) {
    if (value.length > MAX_LONG_FIELD_LENGTH) {
      throw new ValidationError(
        `${fieldLabel(label)} must be at most ${MAX_LONG_FIELD_LENGTH} characters.`,
      );
    }
  }

  return trimmed;
}

function fieldLabel(key: string): string {
  switch (key) {
    case "learningCompetency":
      return "Learning competency";
    case "learningCompetencyCode":
      return "Competency code";
    case "learningObjectives":
      return "Learning objectives";
    case "connectionToPreviousLearning":
      return "Connection to previous learning";
    case "learningExperiences":
      return "Learning experiences";
    case "assessment":
      return "Assessment";
    case "waysForward":
      return "Ways forward";
    default:
      return key;
  }
}

function trimSource(
  source: LessonSourceReference,
  planDate?: string,
): LessonSourceReference | undefined {
  const trimmed = {
    title: source.title.trim(),
    version: source.version.trim(),
    citation: source.citation.trim(),
    curriculumName: source.curriculumName.trim(),
    term: source.term.trim(),
  };
  if (
    !source.scope &&
    !source.applicableDates &&
    !source.artifactId &&
    Object.values(trimmed).every((value) => value.length === 0)
  )
    return undefined;
  for (const [label, value] of Object.entries(trimmed)) {
    if (!value || value.length > MAX_LONG_FIELD_LENGTH) {
      throw new ValidationError(
        `Source ${label} is required and must be at most ${MAX_LONG_FIELD_LENGTH} characters.`,
      );
    }
  }
  const artifactId = source.artifactId?.trim();
  if (source.artifactId !== undefined && !artifactId) {
    throw new ValidationError("Attached source artifact identifier is required.");
  }
  const applicableDates = source.applicableDates
    ? {
        startsOn: source.applicableDates.startsOn.trim(),
        endsOn: source.applicableDates.endsOn.trim(),
      }
    : undefined;
  if (applicableDates) {
    const { startsOn, endsOn } = applicableDates;
    if (!isCalendarDate(startsOn) || !isCalendarDate(endsOn) || startsOn > endsOn) {
      throw new ValidationError("Source date window requires real ordered dates.");
    }
    if (planDate && (!isCalendarDate(planDate) || planDate < startsOn || planDate > endsOn)) {
      throw new ValidationError("Lesson date is outside the declared source date window.");
    }
  }
  const extra = {
    ...(artifactId ? { artifactId } : {}),
    ...(applicableDates ? { applicableDates } : {}),
  };
  if (!source.scope) return { ...trimmed, ...extra };
  const scope = {
    schoolYear: source.scope.schoolYear.trim(),
    subjectId: source.scope.subjectId.trim(),
    ...(source.scope.gradeLevel !== undefined
      ? { gradeLevel: source.scope.gradeLevel.trim() }
      : {}),
  };
  if (Object.values(scope).some((value) => !value || value.length > MAX_LONG_FIELD_LENGTH)) {
    throw new ValidationError(
      "Declared source scope fields must be nonblank and at most 4000 characters.",
    );
  }
  return { ...trimmed, scope, ...extra };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day > 0 && day <= days[month - 1]!;
}
