import { describe, expect, it } from "vitest";
import { parseLessonSuggestion } from "./lesson-suggestion";

const DRAFT = {
  learningObjectives: " Synthetic objective ",
  connectionToPreviousLearning: "",
  learningExperiences: "Synthetic activity",
  assessment: "Synthetic assessment",
  waysForward: "",
};

describe("parseLessonSuggestion", () => {
  it("accepts and trims only bounded planning text", () => {
    expect(parseLessonSuggestion(JSON.stringify(DRAFT))).toEqual({
      ...DRAFT,
      learningObjectives: "Synthetic objective",
    });
  });

  it.each(["", "not JSON", "[]", "null", "1", '"text"'])("rejects invalid object input %s", (raw) =>
    expect(() => parseLessonSuggestion(raw)).toThrow(),
  );

  it.each(["learningCompetency", "sourceReference", "learners", "approved", "__proto__"])(
    "rejects imported authority or unknown property %s",
    (key) => {
      expect(() =>
        parseLessonSuggestion(JSON.stringify({ ...DRAFT, [key]: "not allowed" })),
      ).toThrow(/only the five planning fields/);
    },
  );

  it("rejects oversized, missing, non-text and blank required fields", () => {
    expect(() => parseLessonSuggestion(" ".repeat(24001))).toThrow();
    for (const field of [undefined, 42, {}, "", "x".repeat(4001)]) {
      expect(() =>
        parseLessonSuggestion(JSON.stringify({ ...DRAFT, assessment: field })),
      ).toThrow();
    }
  });

  it("keeps HTML-like text as text without evaluating it", () => {
    expect(
      parseLessonSuggestion(JSON.stringify({ ...DRAFT, assessment: "<script>not code</script>" }))
        .assessment,
    ).toBe("<script>not code</script>");
  });
});
