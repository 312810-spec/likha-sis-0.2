import { ValidationError } from "./errors";
import type { LessonPlanFields } from "./lesson-plan";

/** External suggestions cannot supply curriculum authority or source declarations. */
export type LessonSuggestion = Pick<
  LessonPlanFields,
  | "learningObjectives"
  | "connectionToPreviousLearning"
  | "learningExperiences"
  | "assessment"
  | "waysForward"
>;

const KEYS = [
  "learningObjectives",
  "connectionToPreviousLearning",
  "learningExperiences",
  "assessment",
  "waysForward",
] as const;

/** Explicit teacher assertion at save; actor and timestamp are native-derived. */
export interface LessonDraftReviewInput {
  suggestion: LessonSuggestion;
  teacherConfirmed: boolean;
}

/** Parse only bounded plain text. Never evaluate content or accept official facts. */
export function parseLessonSuggestion(raw: string): LessonSuggestion {
  if (!raw.trim() || raw.length > 24000) {
    throw new ValidationError("Paste a draft JSON object of at most 24,000 characters.");
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new ValidationError("The draft must be valid JSON, without Markdown fences.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("The draft must be a JSON object.");
  }
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !KEYS.some((allowed) => allowed === key))) {
    throw new ValidationError(
      "Drafts may contain only the five planning fields shown. Competencies, source references, records and approvals must not be imported.",
    );
  }
  const result = {} as LessonSuggestion;
  for (const key of KEYS) {
    const field = data[key];
    if (typeof field !== "string" || field.length > 4000) {
      throw new ValidationError("All five draft fields must be text of at most 4,000 characters.");
    }
    result[key] = field.trim();
  }
  if (!result.learningObjectives || !result.learningExperiences || !result.assessment) {
    throw new ValidationError(
      "Draft objectives, learning experiences and assessment are required.",
    );
  }
  return result;
}
