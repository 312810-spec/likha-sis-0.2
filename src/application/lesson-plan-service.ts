import { ValidationError } from "../domain/errors";
import type { LessonPlan, LessonPlanFields } from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";

const MAX_LONG_FIELD_LENGTH = 4000;

/**
 * Orchestrates the structured lesson-plan builder (Creation Studio
 * sub-scope 3/3, the "ILAW" format). School/authorization scope is
 * never a parameter here -- it comes from the caller's authenticated
 * session on the Rust side, matching `AssessmentApplicationService`'s
 * own convention.
 */
export class LessonPlanApplicationService {
  constructor(private readonly lessonPlans: LessonPlanRepository) {}

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
    return this.lessonPlans.create(trimmedAssignmentId, trimmedDate, trimmedFields);
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
