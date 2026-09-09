import { describe, expect, it } from "vitest";
import {
  ESRU_GLOSS,
  ESRU_RATINGS,
  formatEsruRatingLabel,
  FormativeAssessmentValidationError,
  validateFormativeAssessmentLog,
  type FormativeAssessmentLogInput,
} from "./formative-assessment";

const VALID_INPUT: FormativeAssessmentLogInput = {
  teachingAssignmentId: "ta1",
  learnerId: "l1",
  gradingPeriodId: "gp1",
  activityName: "Quiz 1",
  esruRating: "E",
  notes: "Great participation",
};

describe("validateFormativeAssessmentLog", () => {
  it("trims and forwards a valid input", () => {
    const result = validateFormativeAssessmentLog({
      ...VALID_INPUT,
      activityName: "  Quiz 1  ",
      notes: "  Great participation  ",
    });

    expect(result.activityName).toBe("Quiz 1");
    expect(result.notes).toBe("Great participation");
    expect(result.esruRating).toBe("E");
  });

  it("rejects a blank teaching assignment id", () => {
    expect(() =>
      validateFormativeAssessmentLog({ ...VALID_INPUT, teachingAssignmentId: "  " }),
    ).toThrow(FormativeAssessmentValidationError);
  });

  it("rejects a blank learner id", () => {
    expect(() => validateFormativeAssessmentLog({ ...VALID_INPUT, learnerId: "  " })).toThrow(
      FormativeAssessmentValidationError,
    );
  });

  it("rejects a blank grading period id", () => {
    expect(() => validateFormativeAssessmentLog({ ...VALID_INPUT, gradingPeriodId: "  " })).toThrow(
      FormativeAssessmentValidationError,
    );
  });

  it("rejects a blank activity name", () => {
    expect(() => validateFormativeAssessmentLog({ ...VALID_INPUT, activityName: "   " })).toThrow(
      FormativeAssessmentValidationError,
    );
  });

  it("rejects an activity name over 200 characters", () => {
    expect(() =>
      validateFormativeAssessmentLog({ ...VALID_INPUT, activityName: "x".repeat(201) }),
    ).toThrow(FormativeAssessmentValidationError);
  });

  it("rejects notes over 1000 characters", () => {
    expect(() =>
      validateFormativeAssessmentLog({ ...VALID_INPUT, notes: "x".repeat(1001) }),
    ).toThrow(FormativeAssessmentValidationError);
  });

  it("accepts each of the four bare letters", () => {
    for (const rating of ESRU_RATINGS) {
      expect(() =>
        validateFormativeAssessmentLog({ ...VALID_INPUT, esruRating: rating }),
      ).not.toThrow();
    }
  });

  it("normalizes empty-after-trim notes to undefined", () => {
    const result = validateFormativeAssessmentLog({ ...VALID_INPUT, notes: "   " });
    expect(result.notes).toBeUndefined();
  });
});

describe("formatEsruRatingLabel", () => {
  it("always includes the bare letter, the gloss, and an unverified flag", () => {
    for (const rating of ESRU_RATINGS) {
      const label = formatEsruRatingLabel(rating);
      expect(label).toContain(rating);
      expect(label).toContain(ESRU_GLOSS[rating]);
      expect(label.toLowerCase()).toContain("unverified");
    }
  });
});
